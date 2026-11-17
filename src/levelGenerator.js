(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});
  const C = JellyGame.CONSTANTS;
  const {
    SpikeObstacle,
    FlameObstacle,
    ArrowShooter,
    IceWallSurface,
    BouncePadSurface,
    CrackedWallSurface
  } = JellyGame.Obstacles;
  const Collectible = JellyGame.Collectible;
  const ShieldCollectible = JellyGame.ShieldCollectible;

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  /**
   * Procedural chunk-based obstacle, surface & collectible generator enforcing guaranteed safe routes.
   */
  class LevelGenerator {
    constructor() {
      this.reset();
    }

    reset() {
      this.obstacles = [];
      this.surfaces = [];
      this.collectibles = [];
      this.nextChunkBottomY = -580; // Safe 0..580px starting climb zone
      this.lastWallHazardSide = Math.random() < 0.5 ? -1 : 1;
      this.lastArrowY = 999999; // Far below start
      this.highestObstacleTopY = -440; // Ensures first obstacle starts well above opening zone
      this.lastObstacleWasArrow = false;
      this.chunkCount = 0;

      // Place 2 welcoming starter drops along the initial safe climbing path
      if (Collectible) {
        this.collectibles.push(new Collectible(C.WIDTH * 0.5, -260));
        this.collectibles.push(new Collectible(C.WIDTH * 0.5, -430));
      }
    }

    /**
     * Handcrafted 5-stage interactive Tutorial course from 0m to 50m (y = -135 to -2235),
     * teaching slingshot aim, wall-to-wall tempo, spikes/flames, arrow traps, shield, and special surfaces.
     */
    setupTutorialCourse() {
      this.obstacles = [];
      this.surfaces = [];
      this.collectibles = [];
      this.chunkCount = 0;

      // Stage 1 (0m - 8m): Slingshot Basics — Drops guiding to Right Wall Target Zone (y = -320)
      if (Collectible) {
        this.collectibles.push(new Collectible(255, -220));
        this.collectibles.push(new Collectible(325, -275));

        // Stage 2 (8m - 18m): Wall-to-Wall & Tempo — Diagonal drop arcs
        this.collectibles.push(new Collectible(295, -455));
        this.collectibles.push(new Collectible(225, -515));
        this.collectibles.push(new Collectible(155, -575));

        this.collectibles.push(new Collectible(155, -675));
        this.collectibles.push(new Collectible(225, -735));
        this.collectibles.push(new Collectible(295, -795));
      }

      // Stage 3 (18m - 29m): Spikes, Flames & Aim Ring
      this.obstacles.push(new SpikeObstacle(-1, -1015, 68));
      if (Collectible) {
        this.collectibles.push(new Collectible(315, -1015));
      }
      this.obstacles.push(new FlameObstacle(1, -1225, 78));
      if (Collectible) {
        this.collectibles.push(new Collectible(135, -1225));
      }

      // Stage 4 (29m - 40m): Bubble Shield, Arrow Trap & Cracked Stone
      if (ShieldCollectible) {
        this.collectibles.push(new ShieldCollectible(C.WIDTH * 0.5, -1425));
      }
      this.obstacles.push(new ArrowShooter(-1, -1585, 2.65, 0.35));
      if (Collectible) {
        this.collectibles.push(new Collectible(310, -1505));
      }
      if (CrackedWallSurface) {
        this.surfaces.push(new CrackedWallSurface(1, -1735, 88));
      }

      // Stage 5 (40m - 50m): Ice Wall & Bounce Pad launching through the Finish Gate (-2235)
      if (IceWallSurface) {
        this.surfaces.push(new IceWallSurface(-1, -1910, 108));
      }
      if (BouncePadSurface) {
        this.surfaces.push(new BouncePadSurface(1, -2065, 80));
      }
      if (Collectible) {
        this.collectibles.push(new Collectible(295, -2140));
        this.collectibles.push(new Collectible(225, -2210));
        this.collectibles.push(new Collectible(155, -2265));
      }

      // Seamless continuation into endless procedural climb above the 50m Tutorial Finish Gate
      this.nextChunkBottomY = -2480;
      this.highestObstacleTopY = -2360;
      this.lastWallHazardSide = 1;
      this.lastArrowY = -1585;
      this.lastObstacleWasArrow = false;
    }

    /**
     * Generates chunks ahead of the camera so obstacles never pop in abruptly.
     */
    generateUpTo(targetTopY) {
      while (this.nextChunkBottomY > targetTopY) {
        this._generateNextChunk();
      }
    }

    cullFarBelow(floorLimitY) {
      // Keep obstacles well below the screen intact in case the player drops down safely
      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        if (this.obstacles[i].topY > floorLimitY) {
          this.obstacles.splice(i, 1);
        }
      }
      for (let i = this.surfaces.length - 1; i >= 0; i--) {
        if (this.surfaces[i].topY > floorLimitY) {
          this.surfaces.splice(i, 1);
        }
      }
      for (let i = this.collectibles.length - 1; i >= 0; i--) {
        const c = this.collectibles[i];
        if (c.collected || c.y > floorLimitY) {
          this.collectibles.splice(i, 1);
        }
      }
    }

    _pickSide(avoidSide) {
      if (Math.random() < 0.72) {
        return -avoidSide;
      }
      return avoidSide;
    }

    _placeSafeObstacle(obs) {
      const isArrow = obs.type === 'arrowShooter';
      const sameSide = obs.side === this.lastWallHazardSide;
      let minClearance = sameSide ? 145 : 125;
      if (isArrow || this.lastObstacleWasArrow) {
        minClearance = 165;
      }

      const maxAllowedBottom = this.highestObstacleTopY - minClearance;
      if (obs.bottomY > maxAllowedBottom) {
        const shiftUp = obs.bottomY - maxAllowedBottom;
        obs.y -= shiftUp;
        obs.topY -= shiftUp;
        obs.bottomY -= shiftUp;
      }

      this.obstacles.push(obs);
      this.highestObstacleTopY = obs.topY;
      this.lastWallHazardSide = obs.side;
      this.lastObstacleWasArrow = isArrow;
      if (isArrow) {
        this.lastArrowY = obs.y;
      }
      return obs;
    }

    _generateNextChunk() {
      const altitudePx = Math.max(0, -this.nextChunkBottomY);
      const difficulty = Math.min(1, altitudePx / 5200);

      // Smoothly tighten chunk spacing with altitude while preserving generous safe ledges
      const chunkHeight = randRange(300 - difficulty * 65, 345 - difficulty * 65);
      const chunkBottom = this.nextChunkBottomY;
      let chunkTop = chunkBottom - chunkHeight;

      const canFlame = altitudePx >= 1450; // ~34m
      const canArrow = altitudePx >= 2600; // ~62m
      const canStaggerPair = altitudePx >= 4300; // ~102m

      const allowArrowHere =
        canArrow && Math.abs(this.lastArrowY - (chunkBottom - chunkHeight * 0.5)) >= 340;

      const roll = Math.random();

      if (allowArrowHere && roll < 0.28 + difficulty * 0.08) {
        // Dedicated Arrow Shooter chunk: clean open perches above/below & on opposite wall
        const shooterY = chunkBottom - chunkHeight * randRange(0.42, 0.58);
        const side = this._pickSide(this.lastWallHazardSide);
        const cycle = randRange(2.45, 2.85);
        const phase = randRange(0, cycle * 0.65);

        const shooter = this._placeSafeObstacle(new ArrowShooter(side, shooterY, cycle, phase));
        chunkTop = Math.min(chunkTop, shooter.topY - 75);

        // Place safe collectible offset well away from the arrow firing lane
        if (Collectible && Math.random() < 0.72) {
          const offsetY = Math.random() < 0.5 ? -72 : 72;
          this.collectibles.push(
            new Collectible(randRange(C.WALL_WIDTH + 90, C.WIDTH - C.WALL_WIDTH - 90), shooter.y + offsetY)
          );
        }
      } else if (canStaggerPair && roll > 0.72) {
        // Staggered dual-wall chunk: guaranteed safe diagonal perches on both sides
        const pairHeight = Math.max(chunkHeight, 340);
        chunkTop = chunkBottom - pairHeight;
        const firstSide = this._pickSide(this.lastWallHazardSide);
        const secondSide = -firstSide;

        const y1 = chunkBottom - randRange(75, 95);
        const obs1 = this._placeSafeObstacle(this._createWallHazard(firstSide, y1, canFlame));

        const y2 = Math.min(chunkTop + randRange(75, 95), obs1.topY - 170);
        const obs2 = this._placeSafeObstacle(this._createWallHazard(secondSide, y2, canFlame));

        chunkTop = Math.min(chunkTop, obs2.topY - 75);
        this._spawnMidAirCollectibles((obs1.y + obs2.y) * 0.5, obs1.side, false);
      } else {
        // Standard single-wall hazard chunk: entire opposite wall across this band is safe
        const side = this._pickSide(this.lastWallHazardSide);
        const margin = 68;
        const hazardY = randRange(chunkTop + margin, chunkBottom - margin);

        const obs = this._placeSafeObstacle(this._createWallHazard(side, hazardY, canFlame));
        chunkTop = Math.min(chunkTop, obs.topY - 70);
        this._spawnMidAirCollectibles(obs.y, obs.side, true);
        this._maybeSpawnSafeWallSurface(obs.y, -obs.side, altitudePx);
      }

      this.chunkCount++;
      this.nextChunkBottomY = chunkTop;
    }

    _maybeSpawnSafeWallSurface(centerY, safeSide, altitudePx) {
      if (altitudePx < 750 || Math.random() > 0.36) return;

      // Ensure surface doesn't overlap any existing surface or hazard on safeSide
      for (let i = 0; i < this.obstacles.length; i++) {
        const o = this.obstacles[i];
        if (Math.abs(o.y - centerY) < 135 && (o.side === safeSide || o.type === 'arrowShooter')) {
          return;
        }
      }
      for (let i = 0; i < this.surfaces.length; i++) {
        if (Math.abs(this.surfaces[i].y - centerY) < 150) return;
      }

      const roll = Math.random();
      if (altitudePx >= 3400 && roll < 0.38 && IceWallSurface) {
        this.surfaces.push(new IceWallSurface(safeSide, centerY, 106));
      } else if (altitudePx >= 1700 && roll < 0.68 && CrackedWallSurface) {
        this.surfaces.push(new CrackedWallSurface(safeSide, centerY, 86));
      } else if (BouncePadSurface) {
        // Only place BouncePad if the opposite upper landing zone [centerY - 250, centerY - 60] is clear
        const targetSide = -safeSide;
        for (let i = 0; i < this.obstacles.length; i++) {
          const o = this.obstacles[i];
          if (o.side === targetSide && o.bottomY >= centerY - 260 && o.topY <= centerY - 40) {
            return;
          }
        }
        this.surfaces.push(new BouncePadSurface(safeSide, centerY, 74));
      }
    }

    _spawnMidAirCollectibles(centerY, hazardSide, allowArc) {
      if (!Collectible) return;
      const minX = C.WALL_WIDTH + 85;
      const maxX = C.WIDTH - C.WALL_WIDTH - 85;
      const roll = Math.random();

      if (
        ShieldCollectible &&
        this.chunkCount > 3 &&
        this.chunkCount % 7 === 0 &&
        roll < 0.65
      ) {
        const sx =
          hazardSide < 0 ? randRange(C.WIDTH * 0.48, maxX) : randRange(minX, C.WIDTH * 0.52);
        this.collectibles.push(new ShieldCollectible(sx, centerY));
        return;
      }

      if (allowArc && roll < 0.22) {
        // Graceful 2-3 drop diagonal arc guiding wall-to-wall flight
        const dir = hazardSide < 0 ? 1 : -1;
        const startX = C.WIDTH * 0.5 - dir * 70;
        for (let i = 0; i < 3; i++) {
          const t = i / 2;
          const x = startX + dir * t * 140;
          const y = centerY + 34 - i * 36;
          this.collectibles.push(new Collectible(x, y));
        }
      } else if (roll < 0.75) {
        // Single drop positioned safely in the open channel, biased gently toward safe wall side
        const safeCenter =
          hazardSide < 0 ? randRange(C.WIDTH * 0.45, maxX) : randRange(minX, C.WIDTH * 0.55);
        this.collectibles.push(new Collectible(safeCenter, centerY + randRange(-25, 25)));
      }
    }

    _createWallHazard(side, y, canFlame) {
      if (canFlame && Math.random() < 0.46) {
        return new FlameObstacle(side, y, randRange(74, 88));
      }
      return new SpikeObstacle(side, y, randRange(62, 74));
    }
  }

  JellyGame.LevelGenerator = LevelGenerator;
})(window);
