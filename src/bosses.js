(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});
  const C = JellyGame.CONSTANTS;

  const BOSS_ARCHETYPES = Object.freeze([
    {
      id: 'craggo',
      nameKey: 'bossCraggo',
      defaultName: 'CRAGGO THE GOLEM',
      baseHp: 4,
      maxPhases: 1,
      hitRadius: 34,
      rewardGems: 35,
      boltType: 'rock',
      primaryColor: '#36f5b0',
      secondaryColor: '#1e2b42',
      enrageColor: '#ff9f43'
    },
    {
      id: 'gooz',
      nameKey: 'bossGooz',
      defaultName: 'KING GOOZ',
      baseHp: 5,
      maxPhases: 2,
      hitRadius: 35,
      rewardGems: 50,
      boltType: 'slimeBlob',
      primaryColor: '#56ff9a',
      secondaryColor: '#0e4a38',
      enrageColor: '#ffd147'
    },
    {
      id: 'scorpius',
      nameKey: 'bossScorpius',
      defaultName: 'SCORPIUS DUNE KING',
      baseHp: 6,
      maxPhases: 2,
      hitRadius: 35,
      rewardGems: 65,
      boltType: 'venomDart',
      primaryColor: '#ffd166',
      secondaryColor: '#5e2314',
      enrageColor: '#52ff9b'
    },
    {
      id: 'ignis',
      nameKey: 'bossIgnis',
      defaultName: 'IGNIS THE WYRM',
      baseHp: 7,
      maxPhases: 2,
      hitRadius: 35,
      rewardGems: 80,
      boltType: 'fireball',
      primaryColor: '#ff793f',
      secondaryColor: '#4b161b',
      enrageColor: '#ffd32a'
    },
    {
      id: 'glacius',
      nameKey: 'bossGlacius',
      defaultName: 'GLACIUS EMPRESS',
      baseHp: 8,
      maxPhases: 3,
      hitRadius: 35,
      rewardGems: 100,
      boltType: 'iceSpear',
      primaryColor: '#74f2ff',
      secondaryColor: '#103b4a',
      enrageColor: '#f472b6'
    },
    {
      id: 'aether',
      nameKey: 'bossAether',
      defaultName: 'AETHER THE STORM',
      baseHp: 9,
      maxPhases: 3,
      hitRadius: 33,
      rewardGems: 120,
      boltType: 'volt',
      primaryColor: '#48dbfb',
      secondaryColor: '#1c284d',
      enrageColor: '#ffeaa7'
    },
    {
      id: 'voidon',
      nameKey: 'bossVoidon',
      defaultName: 'VOIDON EMPEROR',
      baseHp: 11,
      maxPhases: 4,
      hitRadius: 37,
      rewardGems: 150,
      boltType: 'voidComet',
      primaryColor: '#c56cf0',
      secondaryColor: '#170f2e',
      enrageColor: '#ff4757'
    },
    {
      id: 'seraphos',
      nameKey: 'bossSeraphos',
      defaultName: 'SERAPHOS THE ARCHON',
      baseHp: 12,
      maxPhases: 4,
      hitRadius: 36,
      rewardGems: 200,
      boltType: 'sunLance',
      primaryColor: '#ffe478',
      secondaryColor: '#403478',
      enrageColor: '#ff9f43'
    }
  ]);

  // 8 biome guardian milestones -> Ascended (Deified) cycle starts at 3500m every +500m
  const BOSS_MILESTONES = Object.freeze([250, 500, 800, 1150, 1550, 2000, 2500, 3000]);

  function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val;
  }

  function getMilestoneMeters(bossIndex) {
    const idx = Math.max(0, Math.floor(bossIndex));
    if (idx < BOSS_MILESTONES.length) return BOSS_MILESTONES[idx];
    return 3000 + (idx - (BOSS_MILESTONES.length - 1)) * 500;
  }

  function getBossDefForIndex(bossIndex) {
    const idx = Math.max(0, Math.floor(bossIndex));
    const arch = BOSS_ARCHETYPES[idx % BOSS_ARCHETYPES.length];
    const cycle = Math.floor(idx / BOSS_ARCHETYPES.length) + 1;
    const isAscended = cycle >= 2;
    const extraHp = (cycle - 1) * 4;
    return {
      index: idx,
      cycle,
      isAscended,
      archetype: arch,
      maxHp: arch.baseHp + extraHp,
      maxPhases: Math.min(4, arch.maxPhases + (cycle - 1)),
      hitRadius: arch.hitRadius,
      rewardGems: arch.rewardGems + (cycle - 1) * 85,
      milestoneMeters: getMilestoneMeters(idx)
    };
  }

  /**
   * Themed Boss projectile compatible with the main game projectile & near-miss systems.
   */
  class BossBoltProjectile {
    constructor(x, y, vx, vy, boltType = 'rock', radius = 9, arenaBounds = null, ascended = false) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.boltType = boltType;
      this.radius = radius;
      this.arenaBounds = arenaBounds;
      this.ascended = !!ascended;
      this.bouncesLeft = boltType === 'slimeBlob' ? 1 : 0;
      this.alive = true;
      this.spin = Math.random() * Math.PI * 2;
      this.age = 0;
      this._wasInHalo = false;
      this._nearMissDone = false;
    }

    update(dt, context) {
      if (!this.alive) return;
      this.age += dt;
      this.spin += dt * 7;

      // Subtle gravity on rock & bouncing slime arcs; straight vector on energy/venom/sun bolts
      if (this.boltType === 'rock') {
        this.vy += 210 * dt;
      } else if (this.boltType === 'slimeBlob') {
        this.vy += 170 * dt;
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;

      if (this.x <= C.WALL_WIDTH + 2 || this.x >= C.WIDTH - C.WALL_WIDTH - 2) {
        const hitLeft = this.x <= C.WALL_WIDTH + 2;
        const impactX = hitLeft ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
        if (this.bouncesLeft > 0) {
          this.bouncesLeft -= 1;
          this.x = hitLeft ? C.WALL_WIDTH + 4 : C.WIDTH - C.WALL_WIDTH - 4;
          this.vx = -this.vx * 0.92;
          if (context && context.particles) {
            context.particles.spawnSparkBurst(impactX, this.y, hitLeft ? 1 : -1, '#56ff9a', 6);
          }
          return;
        }
        this.alive = false;
        if (context && context.particles) {
          context.particles.spawnSparkBurst(
            impactX,
            this.y,
            this.vx > 0 ? -1 : 1,
            this._getSparkColor(),
            5
          );
        }
        return;
      }

      const topLim = (this.arenaBounds ? this.arenaBounds.topY : context.cameraY) - 180;
      const botLim = (this.arenaBounds ? this.arenaBounds.floorY : context.cameraY + C.HEIGHT) + 180;
      if (this.y < topLim || this.y > botLim || this.age > 6.5) {
        this.alive = false;
      }
    }

    _getSparkColor() {
      if (this.ascended) return '#ffe675';
      if (this.boltType === 'slimeBlob') return '#56ff9a';
      if (this.boltType === 'venomDart') return '#52ff9b';
      if (this.boltType === 'fireball') return '#ff9b26';
      if (this.boltType === 'volt') return '#74f2ff';
      if (this.boltType === 'iceSpear') return '#b8f2ff';
      if (this.boltType === 'voidComet') return '#e08aff';
      if (this.boltType === 'sunLance') return '#ffe875';
      return '#36f5b0';
    }

    checkPointCollision(px, py, r) {
      if (!this.alive) return false;
      const dx = px - this.x;
      const dy = py - this.y;
      const hitR = r + this.radius * 0.85;
      return dx * dx + dy * dy <= hitR * hitR;
    }

    checkPlayerCollision(player) {
      return this.checkPointCollision(
        player.positionX,
        player.positionY,
        C.HITBOX.PLAYER_HURT_RADIUS
      );
    }

    checkNearMiss(player) {
      if (this._nearMissDone || !this.alive || !player.alive) return false;
      const haloR = C.HITBOX.PLAYER_HURT_RADIUS + (C.HITBOX.CLOSE_CALL_MARGIN_PX || 11);
      const inHalo = !player.isAttached() && this.checkPointCollision(player.positionX, player.positionY, haloR);
      if (inHalo) {
        this._wasInHalo = true;
        return false;
      }
      if (this._wasInHalo && player.alive) {
        this._nearMissDone = true;
        this._wasInHalo = false;
        return true;
      }
      return false;
    }

    draw(ctx, cameraY) {
      if (!this.alive) return;
      const sx = this.x;
      const sy = this.y - cameraY;
      if (!JellyGame.isScreenYVisible(sy, 40)) return;

      const ink = C.COLORS.ink || '#1b1136';
      ctx.save();
      ctx.translate(sx, sy);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Ascended (Deified) boss projectiles radiate a sacred golden halo ring
      if (this.ascended) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 230, 117, 0.85)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.48, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (this.boltType === 'slimeBlob') {
        ctx.rotate(Math.atan2(this.vy, this.vx));
        // Thick-inked bouncy neon cartoon goo teardrop
        const sg = ctx.createLinearGradient(-this.radius * 1.3, 0, this.radius, 0);
        sg.addColorStop(0, '#0eb574');
        sg.addColorStop(0.55, '#56ff9a');
        sg.addColorStop(1, '#c8ffd8');
        ctx.fillStyle = sg;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(this.radius * 1.12, 0);
        ctx.quadraticCurveTo(this.radius * 0.95, -this.radius * 0.96, -this.radius * 0.25, -this.radius * 0.78);
        ctx.quadraticCurveTo(-this.radius * 1.35, -this.radius * 0.25, -this.radius * 1.45, 0);
        ctx.quadraticCurveTo(-this.radius * 1.35, this.radius * 0.25, -this.radius * 0.25, this.radius * 0.78);
        ctx.quadraticCurveTo(this.radius * 0.95, this.radius * 0.96, this.radius * 1.12, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(this.radius * 0.25, -this.radius * 0.34, this.radius * 0.32, this.radius * 0.16, -0.35, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.boltType === 'venomDart') {
        ctx.rotate(Math.atan2(this.vy, this.vx));
        // Thick-inked barbed golden scorpion venom stinger dart
        ctx.fillStyle = '#ffd166';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.3;
        ctx.beginPath();
        ctx.moveTo(this.radius * 1.55, 0);
        ctx.lineTo(this.radius * 0.1, -this.radius * 0.65);
        ctx.lineTo(-this.radius * 0.3, -this.radius * 0.22);
        ctx.lineTo(-this.radius * 1.35, -this.radius * 0.45);
        ctx.lineTo(-this.radius * 0.95, 0);
        ctx.lineTo(-this.radius * 1.35, this.radius * 0.45);
        ctx.lineTo(-this.radius * 0.3, this.radius * 0.22);
        ctx.lineTo(this.radius * 0.1, this.radius * 0.65);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Glowing toxic emerald tip
        ctx.fillStyle = '#52ff9b';
        ctx.beginPath();
        ctx.moveTo(this.radius * 1.46, 0);
        ctx.lineTo(this.radius * 0.45, -this.radius * 0.38);
        ctx.lineTo(this.radius * 0.62, 0);
        ctx.lineTo(this.radius * 0.45, this.radius * 0.38);
        ctx.closePath();
        ctx.fill();
      } else if (this.boltType === 'sunLance') {
        ctx.rotate(Math.atan2(this.vy, this.vx));
        // Thick-inked celestial golden winged sun spear
        const lg = ctx.createLinearGradient(-this.radius * 1.4, 0, this.radius * 1.6, 0);
        lg.addColorStop(0, '#ffae3b');
        lg.addColorStop(0.55, '#ffe875');
        lg.addColorStop(1, '#ffffff');
        ctx.fillStyle = lg;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.3;
        ctx.beginPath();
        ctx.moveTo(this.radius * 1.7, 0);
        ctx.lineTo(this.radius * 0.1, -this.radius * 0.48);
        ctx.lineTo(-this.radius * 0.35, -this.radius * 0.95);
        ctx.lineTo(-this.radius * 0.72, -this.radius * 0.26);
        ctx.lineTo(-this.radius * 1.42, 0);
        ctx.lineTo(-this.radius * 0.72, this.radius * 0.26);
        ctx.lineTo(-this.radius * 0.35, this.radius * 0.95);
        ctx.lineTo(this.radius * 0.1, this.radius * 0.48);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(this.radius * 0.45, 0, this.radius * 0.48, this.radius * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.boltType === 'fireball') {
        ctx.rotate(Math.atan2(this.vy, this.vx));
        // Thick-inked cartoon blazing comet fireball
        const fg = ctx.createLinearGradient(-this.radius * 1.6, 0, this.radius, 0);
        fg.addColorStop(0, '#ff3b30');
        fg.addColorStop(0.55, '#ff8c2b');
        fg.addColorStop(1, '#fff28a');
        ctx.fillStyle = fg;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(this.radius * 1.15, 0);
        ctx.quadraticCurveTo(this.radius * 0.7, -this.radius * 0.95, -this.radius * 0.35, -this.radius * 0.85);
        ctx.lineTo(-this.radius * 1.65, -this.radius * 0.32);
        ctx.lineTo(-this.radius * 1.15, 0);
        ctx.lineTo(-this.radius * 1.55, this.radius * 0.38);
        ctx.lineTo(-this.radius * 0.35, this.radius * 0.85);
        ctx.quadraticCurveTo(this.radius * 0.7, this.radius * 0.95, this.radius * 1.15, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fff9cc';
        ctx.beginPath();
        ctx.arc(this.radius * 0.2, 0, this.radius * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.boltType === 'volt') {
        ctx.rotate(Math.atan2(this.vy, this.vx));
        // Thick-inked jagged cartoon storm bolt
        const vg = ctx.createLinearGradient(-this.radius * 1.3, 0, this.radius * 1.4, 0);
        vg.addColorStop(0, '#48dbfb');
        vg.addColorStop(0.55, '#c8f8ff');
        vg.addColorStop(1, '#fff38a');
        ctx.fillStyle = vg;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.3;
        ctx.beginPath();
        ctx.moveTo(this.radius * 1.45, 0);
        ctx.lineTo(0, -this.radius * 0.75);
        ctx.lineTo(this.radius * 0.15, -this.radius * 0.22);
        ctx.lineTo(-this.radius * 1.35, -this.radius * 0.52);
        ctx.lineTo(-this.radius * 0.65, 0);
        ctx.lineTo(-this.radius * 1.25, this.radius * 0.56);
        ctx.lineTo(this.radius * 0.12, this.radius * 0.24);
        ctx.lineTo(0, this.radius * 0.75);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (this.boltType === 'iceSpear') {
        ctx.rotate(Math.atan2(this.vy, this.vx));
        // Thick-inked faceted frost lance
        ctx.fillStyle = '#6feaff';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.3;
        ctx.beginPath();
        ctx.moveTo(this.radius * 1.6, 0);
        ctx.lineTo(-this.radius * 0.45, -this.radius * 0.72);
        ctx.lineTo(-this.radius * 1.25, 0);
        ctx.lineTo(-this.radius * 0.45, this.radius * 0.72);
        ctx.closePath();
        ctx.fill();

        // Crisp upper facet shine
        ctx.fillStyle = '#e8feff';
        ctx.beginPath();
        ctx.moveTo(this.radius * 1.5, 0);
        ctx.lineTo(-this.radius * 0.45, -this.radius * 0.64);
        ctx.lineTo(-this.radius * 1.12, 0);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(this.radius * 1.6, 0);
        ctx.lineTo(-this.radius * 0.45, -this.radius * 0.72);
        ctx.lineTo(-this.radius * 1.25, 0);
        ctx.lineTo(-this.radius * 0.45, this.radius * 0.72);
        ctx.closePath();
        ctx.stroke();
      } else if (this.boltType === 'voidComet') {
        ctx.rotate(this.spin);
        // Thick-inked cosmic singularity orb with golden star halo
        ctx.fillStyle = '#d88cff';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const rr = i % 2 === 0 ? this.radius * 1.28 : this.radius * 0.78;
          const px = Math.cos(a) * rr;
          const py = Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#25104d';
        ctx.strokeStyle = '#ffd147';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.54, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fff5bd';
        ctx.beginPath();
        ctx.arc(-2, -2, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Chunky cartoon mossy boulder shard with cel-shaded facet
        ctx.rotate(this.spin);
        const traceShard = () => {
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const rr = i % 2 === 0 ? this.radius * 1.08 : this.radius * 0.76;
            const px = Math.cos(a) * rr;
            const py = Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        };
        ctx.fillStyle = '#534173';
        traceShard();
        ctx.fill();

        ctx.fillStyle = '#36f5b0';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.48, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.4;
        traceShard();
        ctx.stroke();

        ctx.fillStyle = '#fff8eb';
        ctx.beginPath();
        ctx.arc(-2.2, -2.2, 2.1, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /**
   * Multi-phase Boss entity framed inside a vertical slingshot arena chamber.
   */
  class BossEntity {
    constructor(def, anchorBottomY) {
      this.def = def;
      this.index = def.index;
      this.cycle = def.cycle;
      this.isAscended = !!def.isAscended || def.cycle >= 2;
      this.archetype = def.archetype;
      this.id = def.archetype.id;
      this.maxHp = def.maxHp;
      this.hp = def.maxHp;
      this.maxPhases = def.maxPhases;
      this.phase = 1;
      this.hitRadius = def.hitRadius;
      this.rewardGems = def.rewardGems;
      this.milestoneMeters = def.milestoneMeters;

      this.arenaBottomY = anchorBottomY;
      this.arenaTopY = anchorBottomY - 490;
      this.arenaFloorY = anchorBottomY + 60;
      this.cameraTargetY = this.arenaTopY - 70;

      this.homeX = C.WIDTH * 0.5;
      this.homeY = this.arenaTopY + 210;
      this.x = this.homeX;
      this.y = this.arenaTopY - 60;

      this.time = 0;
      this.introTimer = 1.35;
      this.hurtFlashTimer = 0;
      this.playerBounceCooldown = 0;
      this.attackTimer = 1.6;
      this.telegraphTimer = 0;
      this.pendingAttack = null;

      // Teleport anchor state (used by Aether)
      this.anchorIdx = 1;
      this.anchors = [
        { x: C.WIDTH * 0.34, y: this.homeY - 12 },
        { x: C.WIDTH * 0.5, y: this.homeY + 12 },
        { x: C.WIDTH * 0.66, y: this.homeY - 12 }
      ];

      // Rotating shield / flame / void orbs (non-lethal, bounce player cleanly to test aim timing!)
      this.orbitAngle = 0;
      this.orbitOrbs = [];

      // Telegraphed wall zap strip (Aether/Glacius Phase 2+)
      this.wallZap = {
        side: -1,
        centerY: this.homeY + 55,
        halfH: 64,
        warningTimer: 0,
        activeTimer: 0,
        cooldown: 3.6
      };

      this.phaseBannerTimer = 0;
      this.defeated = false;
      this._refreshOrbitOrbs();
    }

    _refreshOrbitOrbs() {
      this.orbitOrbs = [];
      const orbCol = (base) => (this.isAscended ? '#ffe478' : base);
      if (this.id === 'gooz' && this.phase >= 2) {
        this.orbitOrbs = [
          { angleOffset: 0, dist: 60, r: 9.5, color: orbCol('#56ff9a') },
          { angleOffset: Math.PI, dist: 60, r: 9.5, color: orbCol('#56ff9a') }
        ];
      } else if (this.id === 'scorpius' && this.phase >= 2) {
        this.orbitOrbs = [
          { angleOffset: 0, dist: 62, r: 9.5, color: orbCol('#ffd166') },
          { angleOffset: Math.PI, dist: 62, r: 9.5, color: orbCol('#ffd166') }
        ];
      } else if (this.id === 'ignis' && this.phase >= 2) {
        this.orbitOrbs = [
          { angleOffset: 0, dist: 60, r: 10, color: orbCol('#ff9f43') },
          { angleOffset: Math.PI, dist: 60, r: 10, color: orbCol('#ff9f43') }
        ];
      } else if (this.id === 'glacius') {
        const count = this.phase === 1 ? 2 : 3;
        for (let i = 0; i < count; i++) {
          this.orbitOrbs.push({
            angleOffset: (i * Math.PI * 2) / count,
            dist: 62,
            r: 10.5,
            color: orbCol('#74f2ff')
          });
        }
      } else if (this.id === 'voidon' && this.phase >= 2) {
        const count = this.phase === 3 ? 4 : 3;
        for (let i = 0; i < count; i++) {
          this.orbitOrbs.push({
            angleOffset: (i * Math.PI * 2) / count,
            dist: 65,
            r: 10,
            color: orbCol('#c56cf0')
          });
        }
      } else if (this.id === 'seraphos') {
        const count = this.phase >= 3 ? 4 : 3;
        for (let i = 0; i < count; i++) {
          this.orbitOrbs.push({
            angleOffset: (i * Math.PI * 2) / count,
            dist: 65,
            r: 10,
            color: '#ffe875'
          });
        }
      } else if (this.isAscended && this.phase >= 2) {
        // Ascended Craggo / Aether gain twin radiant golden guardian orbs in Phase 2+
        this.orbitOrbs = [
          { angleOffset: 0, dist: 60, r: 9.5, color: '#ffe478' },
          { angleOffset: Math.PI, dist: 60, r: 9.5, color: '#ffe478' }
        ];
      }
    }

    _getOrbitOrbPosition(orb) {
      const a = this.orbitAngle + orb.angleOffset;
      return {
        x: this.x + Math.cos(a) * orb.dist,
        y: this.y + Math.sin(a) * orb.dist
      };
    }

    _computeExpectedPhase() {
      if (this.maxPhases <= 1) return 1;
      const lostFraction = 1 - this.hp / this.maxHp;
      const computed = Math.min(this.maxPhases, Math.floor(lostFraction * this.maxPhases) + 1);
      return Math.max(this.phase, computed);
    }

    update(dt, context) {
      if (this.defeated) return;
      this.time += dt;

      if (this.hurtFlashTimer > 0) this.hurtFlashTimer = Math.max(0, this.hurtFlashTimer - dt);
      if (this.playerBounceCooldown > 0) {
        this.playerBounceCooldown = Math.max(0, this.playerBounceCooldown - dt);
      }
      if (this.phaseBannerTimer > 0) {
        this.phaseBannerTimer = Math.max(0, this.phaseBannerTimer - dt);
      }

      if (this.introTimer > 0) {
        this.introTimer = Math.max(0, this.introTimer - dt);
        const progress = 1 - this.introTimer / 1.35;
        const ease = 1 - Math.pow(1 - progress, 3);
        this.x = this.homeX;
        this.y = this.arenaTopY - 60 + (this.homeY - (this.arenaTopY - 60)) * ease;
        return;
      }

      // Spin orbit shields faster on higher phases & prestige cycles
      const spinSpeed = (1.55 + (this.phase - 1) * 0.65) * (1 + (this.cycle - 1) * 0.15);
      this.orbitAngle += dt * spinSpeed;

      // Archetype movement pattern
      const spdMult = 1 + (this.phase - 1) * 0.28 + (this.cycle - 1) * 0.14;
      if (this.id === 'aether') {
        const target = this.anchors[this.anchorIdx];
        this.x += (target.x - this.x) * Math.min(1, dt * 5.2);
        this.y += (target.y + Math.sin(this.time * 3.5) * 14 - this.y) * Math.min(1, dt * 5.2);
      } else if (this.id === 'craggo') {
        this.x = this.homeX + Math.sin(this.time * 1.15 * spdMult) * 78;
        this.y = this.homeY + Math.cos(this.time * 2.1 * spdMult) * 24;
      } else if (this.id === 'gooz') {
        // Playful bouncy slime arc drift
        this.x = this.homeX + Math.sin(this.time * 1.35 * spdMult) * 84;
        this.y = this.homeY - Math.abs(Math.sin(this.time * 2.8 * spdMult)) * 34 + 14;
      } else if (this.id === 'scorpius') {
        // Predatory dune-stalker wide sweep with sharp lunges
        this.x = this.homeX + Math.sin(this.time * 1.65 * spdMult) * 94;
        this.y = this.homeY + Math.cos(this.time * 3.1 * spdMult) * 26;
      } else if (this.id === 'ignis') {
        this.x = this.homeX + Math.sin(this.time * 1.55 * spdMult) * 92;
        this.y = this.homeY + Math.sin(this.time * 2.9 * spdMult) * 34;
      } else if (this.id === 'glacius') {
        this.x = this.homeX + Math.sin(this.time * 1.3 * spdMult) * 86;
        this.y = this.homeY + Math.cos(this.time * 1.9 * spdMult) * 30;
      } else if (this.id === 'seraphos') {
        // Regal serene celestial figure-8 sweep
        this.x = this.homeX + Math.sin(this.time * 1.35 * spdMult) * 92;
        this.y = this.homeY + Math.sin(this.time * 2.7 * spdMult) * 32;
      } else {
        // Voidon figure-8 infinity drift
        this.x = this.homeX + Math.sin(this.time * 1.45 * spdMult) * 90;
        this.y = this.homeY + Math.sin(this.time * 2.9 * spdMult) * 34;
      }

      // Telegraphed wall zap logic on Aether, Glacius, Seraphos (or Ascended bosses) Phase 2+
      if (
        (this.id === 'aether' || this.id === 'glacius' || this.id === 'seraphos' || this.isAscended) &&
        this.phase >= 2
      ) {
        const z = this.wallZap;
        if (z.warningTimer > 0) {
          z.warningTimer = Math.max(0, z.warningTimer - dt);
          if (z.warningTimer === 0) {
            z.activeTimer = 1.45;
            if (context.audio) context.audio.playArrowFire();
          }
        } else if (z.activeTimer > 0) {
          z.activeTimer = Math.max(0, z.activeTimer - dt);
          if (z.activeTimer === 0) {
            z.cooldown = this.phase === 3 ? 2.4 : 3.2;
          }
        } else {
          z.cooldown -= dt;
          if (z.cooldown <= 0) {
            z.side = context.player && context.player.wallAttached !== 0
              ? context.player.wallAttached
              : -z.side;
            z.centerY = clamp(
              (context.player ? context.player.positionY : this.homeY + 60),
              this.arenaTopY + 95,
              this.arenaFloorY - 95
            );
            z.warningTimer = 1.15;
          }
        }
      }

      // Attack cycle with clear readable windup flash (telegraphTimer)
      if (this.telegraphTimer > 0) {
        this.telegraphTimer -= dt;
        if (this.telegraphTimer <= 0) {
          this._executeAttack(context);
          const baseCadence = Math.max(1.45, 2.75 - this.index * 0.12 - (this.phase - 1) * 0.24);
          this.attackTimer = baseCadence / (1 + (this.cycle - 1) * 0.12);
        }
      } else {
        this.attackTimer -= dt;
        if (this.attackTimer <= 0) {
          this.telegraphTimer = 0.65;
        }
      }
    }

    _spawnAimedBolt(context, speed, angleOffset = 0, radius = 9) {
      const targetX = context.player ? context.player.positionX : C.WIDTH * 0.5;
      const targetY = context.player ? context.player.positionY : this.homeY + 120;
      const baseAngle = Math.atan2(targetY - this.y, targetX - this.x) + angleOffset;
      const bounds = { topY: this.arenaTopY, floorY: this.arenaFloorY };
      context.projectiles.push(
        new BossBoltProjectile(
          this.x + Math.cos(baseAngle) * (this.hitRadius * 0.7),
          this.y + Math.sin(baseAngle) * (this.hitRadius * 0.7),
          Math.cos(baseAngle) * speed,
          Math.sin(baseAngle) * speed,
          this.archetype.boltType,
          radius,
          bounds,
          this.isAscended
        )
      );
    }

    _executeAttack(context) {
      if (!context || !context.projectiles) return;
      if (context.audio) context.audio.playArrowFire();

      const speedBoost = 1 + (this.phase - 1) * 0.16 + (this.cycle - 1) * 0.12;

      if (this.id === 'craggo') {
        if (this.phase === 1) {
          this._spawnAimedBolt(context, 255 * speedBoost, 0, 10);
        } else {
          this._spawnAimedBolt(context, 275 * speedBoost, -0.22, 9.5);
          this._spawnAimedBolt(context, 275 * speedBoost, 0.22, 9.5);
        }
      } else if (this.id === 'gooz') {
        // Bouncy slime globs (wall-bouncing!)
        if (this.phase === 1) {
          this._spawnAimedBolt(context, 255 * speedBoost, -0.18, 9.5);
          this._spawnAimedBolt(context, 255 * speedBoost, 0.18, 9.5);
        } else {
          for (const a of [-0.34, 0, 0.34]) {
            this._spawnAimedBolt(context, 270 * speedBoost, a, 9.5);
          }
        }
      } else if (this.id === 'scorpius') {
        // Fast twin pincer venom darts -> triple stinger fan in Phase 2
        const spread = this.phase === 1 ? [-0.22, 0.22] : [-0.34, 0, 0.34];
        for (const a of spread) {
          this._spawnAimedBolt(context, 295 * speedBoost, a, 9);
        }
      } else if (this.id === 'ignis') {
        const spread = this.phase === 1 ? [-0.26, 0, 0.26] : [-0.38, -0.13, 0.13, 0.38];
        for (const a of spread) {
          this._spawnAimedBolt(context, 265 * speedBoost, a, 9);
        }
      } else if (this.id === 'aether') {
        this.anchorIdx = (this.anchorIdx + 1) % this.anchors.length;
        const count = this.phase === 1 ? 1 : this.phase === 2 ? 2 : 3;
        const step = 0.28;
        const start = -((count - 1) * step) * 0.5;
        for (let i = 0; i < count; i++) {
          this._spawnAimedBolt(context, 310 * speedBoost, start + i * step, 8.5);
        }
      } else if (this.id === 'glacius') {
        const count = this.phase >= 2 ? 3 : 2;
        const step = 0.3;
        const start = -((count - 1) * step) * 0.5;
        for (let i = 0; i < count; i++) {
          this._spawnAimedBolt(context, 295 * speedBoost, start + i * step, 9);
        }
      } else if (this.id === 'seraphos') {
        // Seraphos Archon: radiant sun-lance fan in Phase 1-2, sacred solar halo burst in Phase 3-4
        if (this.phase <= 2) {
          const spread = this.phase === 1 ? [-0.28, 0, 0.28] : [-0.4, -0.14, 0.14, 0.4];
          for (const a of spread) {
            this._spawnAimedBolt(context, 300 * speedBoost, a, 9.5);
          }
        } else {
          const ringCount = this.phase >= 4 ? 8 : 6;
          const rot = this.time * 1.1;
          const bounds = { topY: this.arenaTopY, floorY: this.arenaFloorY };
          for (let i = 0; i < ringCount; i++) {
            const ang = rot + (i / ringCount) * Math.PI * 2;
            const sp = (this.phase >= 4 ? 275 : 255) * speedBoost;
            context.projectiles.push(
              new BossBoltProjectile(
                this.x,
                this.y,
                Math.cos(ang) * sp,
                Math.sin(ang) * sp,
                'sunLance',
                9.5,
                bounds,
                this.isAscended
              )
            );
          }
        }
      } else {
        // Voidon Emperor: spiral burst or aimed twin comets
        if (this.phase === 1) {
          for (let i = -1; i <= 1; i++) {
            this._spawnAimedBolt(context, 285 * speedBoost, i * 0.32, 9.5);
          }
        } else {
          const ringCount = this.phase >= 4 ? 7 : this.phase === 3 ? 6 : 4;
          const rot = this.time * 1.3;
          const bounds = { topY: this.arenaTopY, floorY: this.arenaFloorY };
          for (let i = 0; i < ringCount; i++) {
            const ang = rot + (i / ringCount) * Math.PI * 2;
            const sp = (this.phase >= 4 ? 270 : this.phase === 3 ? 255 : 230) * speedBoost;
            context.projectiles.push(
              new BossBoltProjectile(
                this.x,
                this.y,
                Math.cos(ang) * sp,
                Math.sin(ang) * sp,
                'voidComet',
                9,
                bounds,
                this.isAscended
              )
            );
          }
        }
      }
    }

    /**
     * Checks if an airborne Jelly slams into an orbiting shield or the Boss's core.
     */
    checkPlayerSlam(player, tempoTier, particles, audio) {
      if (this.defeated || this.introTimer > 0.25 || player.isAttached() || !player.alive) {
        return null;
      }
      if (this.playerBounceCooldown > 0) return null;

      // 1. Orbiting Shield Orbs deflect player cleanly without taking HP or hurting player
      for (let i = 0; i < this.orbitOrbs.length; i++) {
        const orb = this.orbitOrbs[i];
        const pos = this._getOrbitOrbPosition(orb);
        const dx = player.positionX - pos.x;
        const dy = player.positionY - pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= orb.r + player.radius * 0.85) {
          this.playerBounceCooldown = 0.22;
          const nx = dist > 0.1 ? dx / dist : (player.positionX < this.x ? -1 : 1);
          const ny = dist > 0.1 ? dy / dist : 0.4;
          player.velocityX = nx * 360;
          player.velocityY = Math.min(-180, ny * 320);
          player.invulnTimer = Math.max(player.invulnTimer, 0.3);
          if (audio) audio.playCrack();
          if (particles) {
            particles.spawnSparkBurst(pos.x, pos.y, nx, orb.color, 8);
          }
          return { event: 'clang' };
        }
      }

      // 2. Direct Slingshot Core Hit!
      const dx = player.positionX - this.x;
      const dy = player.positionY - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > this.hitRadius + player.radius * 0.92) {
        return null;
      }

      const isCrit = tempoTier >= 4;
      const dmg = isCrit ? 2 : 1;
      this.hp = Math.max(0, this.hp - dmg);
      this.hurtFlashTimer = 0.24;
      this.playerBounceCooldown = 0.26;

      // Rebound player cleanly outward toward opposite wall to keep combat flowing
      const nx = dist > 1 ? dx / dist : (player.velocityX >= 0 ? -1 : 1);
      const outDir = Math.abs(nx) < 0.35 ? (player.positionX < C.WIDTH * 0.5 ? -1 : 1) : Math.sign(nx);
      player.velocityX = outDir * 350;
      player.velocityY = dy > 0 ? 180 : -320;
      player.stretchAmount = 0.35;
      player.invulnTimer = Math.max(player.invulnTimer, 0.55);

      if (particles) {
        particles.spawnSparkBurst(this.x, this.y, outDir, isCrit ? '#ffd166' : this.archetype.primaryColor, isCrit ? 16 : 11);
      }

      if (this.hp <= 0) {
        this.defeated = true;
        this.wallZap.activeTimer = 0;
        this.wallZap.warningTimer = 0;
        if (audio) audio.playBossDefeat();
        if (particles) {
          particles.spawnCollectBurst(this.x, this.y, 4);
        }
        return {
          event: 'defeat',
          dmg,
          isCrit,
          rewardGems: this.rewardGems
        };
      }

      const nextPhase = this._computeExpectedPhase();
      if (nextPhase > this.phase) {
        this.phase = nextPhase;
        this.phaseBannerTimer = 2.0;
        this._refreshOrbitOrbs();
        if (audio) audio.playBossPhaseShift();
        return {
          event: 'phase',
          dmg,
          isCrit,
          newPhase: this.phase
        };
      }

      if (audio) audio.playBossHit(isCrit);
      return {
        event: 'hit',
        dmg,
        isCrit
      };
    }

    checkWallZapHazard(player) {
      if (this.defeated || this.wallZap.activeTimer <= 0 || !player.alive) return false;
      const z = this.wallZap;
      const wallEdgeX = z.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const px = player.positionX;
      const py = player.positionY;
      const r = C.HITBOX.PLAYER_HURT_RADIUS;
      const reach = 20;
      const minX = z.side < 0 ? wallEdgeX - 2 : wallEdgeX - reach;
      const maxX = z.side < 0 ? wallEdgeX + reach : wallEdgeX + 2;
      return px + r >= minX && px - r <= maxX && py + r >= z.centerY - z.halfH && py - r <= z.centerY + z.halfH;
    }

    checkTrajectoryHitsBoss(simX, simY) {
      if (this.defeated || this.introTimer > 0.25) return false;
      const dx = simX - this.x;
      const dy = simY - this.y;
      return dx * dx + dy * dy <= (this.hitRadius + C.PLAYER_RADIUS * 0.85) ** 2;
    }

    draw(ctx, cameraY) {
      if (this.defeated) return;
      const sy = this.y - cameraY;
      const sx = this.x;
      const r = this.hitRadius;
      const t = this.time;
      const enraged = this.phase >= 2;
      const ascended = !!this.isAscended;
      const accent = ascended
        ? enraged
          ? '#fff3a1'
          : '#ffe478'
        : enraged
          ? this.archetype.enrageColor
          : this.archetype.primaryColor;

      ctx.save();

      // 1. Arena Energy Ceiling & Floor Seals framing the duel
      this._drawArenaSeals(ctx, cameraY, accent, t);

      // 2. Telegraphed Wall Zap Hazard (Aether, Glacius, Seraphos & Ascended Phase 2+)
      if (this.wallZap.warningTimer > 0 || this.wallZap.activeTimer > 0) {
        this._drawWallZap(ctx, cameraY, accent, t);
      }

      // 3. Boss Main Character Artwork
      ctx.save();
      ctx.translate(sx, sy);

      // Telegraph windup ring just before firing projectiles
      if (this.telegraphTimer > 0) {
        const pulse = 1 - this.telegraphTimer / 0.65;
        ctx.strokeStyle = ascended ? '#ffe478' : '#ff5e57';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(0, 0, r + 6 + pulse * 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Soft outer aura (radiant divine gold for Ascended / Seraphos)
      const auraR = ascended ? r * 2.15 : r * 1.85;
      const aura = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, auraR);
      if (ascended || this.id === 'seraphos') {
        aura.addColorStop(0, enraged ? 'rgba(255, 224, 102, 0.56)' : 'rgba(255, 240, 165, 0.44)');
        aura.addColorStop(0.55, 'rgba(255, 209, 71, 0.18)');
        aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        aura.addColorStop(0, enraged ? 'rgba(255, 110, 80, 0.4)' : 'rgba(54, 245, 176, 0.28)');
        aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, auraR, 0, Math.PI * 2);
      ctx.fill();

      // Ascended (Deified) Celestial Sunburst & Feathered Seraph Wings behind any returning boss
      if (ascended) {
        this._drawAscendedBackLayer(ctx, r, t, enraged);
      }

      this._drawArchetypeBody(ctx, r, accent, enraged, t);

      // Ascended (Deified) Radiant Golden Halo floating above the boss's crown
      if (ascended) {
        this._drawAscendedHalo(ctx, r, t, enraged);
      }

      // Hit white flash overlay
      if (this.hurtFlashTimer > 0) {
        ctx.globalAlpha = (this.hurtFlashTimer / 0.24) * 0.65;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 4. Cartoon Inked Orbiting Shield Orbs / Crystal Petals / Solar Orbs
      const inkCol = C.COLORS.ink || '#1b1136';
      for (let i = 0; i < this.orbitOrbs.length; i++) {
        const orb = this.orbitOrbs[i];
        const pos = this._getOrbitOrbPosition(orb);
        const oy = pos.y - cameraY;
        ctx.save();
        ctx.translate(pos.x, oy);
        if (ascended || this.id === 'seraphos') {
          ctx.strokeStyle = 'rgba(255, 232, 117, 0.78)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, orb.r + 3.2, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = orb.color;
        ctx.strokeStyle = inkCol;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        if (this.id === 'glacius') {
          ctx.rotate(this.orbitAngle + orb.angleOffset);
          ctx.moveTo(0, -orb.r - 2.5);
          ctx.lineTo(orb.r + 0.5, 0);
          ctx.lineTo(0, orb.r + 2.5);
          ctx.lineTo(-orb.r - 0.5, 0);
          ctx.closePath();
        } else if (this.id === 'seraphos') {
          ctx.rotate(this.orbitAngle * 1.5 + orb.angleOffset);
          for (let k = 0; k < 8; k++) {
            const sa = (k / 8) * Math.PI * 2;
            const sr = k % 2 === 0 ? orb.r + 2 : orb.r * 0.58;
            const px = Math.cos(sa) * sr;
            const py = Math.sin(sa) * sr;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        } else {
          ctx.arc(0, 0, orb.r, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
        ctx.beginPath();
        ctx.arc(-2.5, -2.5, 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();
    }

    _drawAscendedBackLayer(ctx, r, t, enraged) {
      const ink = C.COLORS.ink || '#1b1136';
      const flap = Math.sin(t * 4.2) * 0.16;

      // Rotating sacred sunburst rays behind body
      ctx.save();
      ctx.rotate(t * 0.45);
      ctx.fillStyle = enraged ? 'rgba(255, 214, 71, 0.24)' : 'rgba(255, 245, 180, 0.22)';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a - 0.11) * (r * 2.05), Math.sin(a - 0.11) * (r * 2.05));
        ctx.lineTo(Math.cos(a + 0.11) * (r * 2.05), Math.sin(a + 0.11) * (r * 2.05));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Radiant pearl-white & solar-gold feathered celestial wings unfurling behind any Ascended boss
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * (r * 0.72), -4);
        ctx.scale(side, 1);
        ctx.rotate(-0.14 + flap);

        const wg = ctx.createLinearGradient(0, -24, 42, 16);
        wg.addColorStop(0, '#ffffff');
        wg.addColorStop(0.58, '#fff2bd');
        wg.addColorStop(1, '#ffb82e');
        ctx.fillStyle = wg;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.6;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.quadraticCurveTo(14, -34, 42, -24);
        ctx.quadraticCurveTo(32, -12, 37, -6);
        ctx.quadraticCurveTo(25, -2, 30, 8);
        ctx.quadraticCurveTo(18, 7, 20, 17);
        ctx.quadraticCurveTo(7, 13, -4, 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Crisp golden wing feather accent lines
        ctx.strokeStyle = '#f2a51a';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(4, -3);
        ctx.quadraticCurveTo(18, -16, 33, -18);
        ctx.moveTo(4, 3);
        ctx.quadraticCurveTo(15, -2, 26, -3);
        ctx.stroke();
        ctx.restore();
      }
    }

    _drawAscendedHalo(ctx, r, t, enraged) {
      const ink = C.COLORS.ink || '#1b1136';
      const bob = Math.sin(t * 3.6) * 2.2;
      const haloY =
        this.id === 'craggo'
          ? -r * 1.38
          : this.id === 'scorpius'
            ? -r * 1.92
            : this.id === 'seraphos'
              ? -r * 1.52
              : -r * 1.66;
      const haloRx = this.id === 'seraphos' ? 25 : 22;

      ctx.save();
      ctx.translate(0, haloY + bob);
      ctx.rotate(Math.sin(t * 2.2) * 0.06);

      ctx.strokeStyle = ink;
      ctx.lineWidth = 6.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, haloRx, 6.4, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = enraged ? '#fff9c4' : '#ffd147';
      ctx.lineWidth = 3.2;
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, -0.6, haloRx - 2, 4.8, 0, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();

      // Twinkling 4-point divine star on halo rim
      const sx = haloRx - 3;
      const sy = -2;
      const sc = 4.2 + Math.sin(t * 7) * 1.1;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(sx, sy - sc);
      ctx.lineTo(sx + sc * 0.34, sy - sc * 0.34);
      ctx.lineTo(sx + sc, sy);
      ctx.lineTo(sx + sc * 0.34, sy + sc * 0.34);
      ctx.lineTo(sx, sy + sc);
      ctx.lineTo(sx - sc * 0.34, sy + sc * 0.34);
      ctx.lineTo(sx - sc, sy);
      ctx.lineTo(sx - sc * 0.34, sy - sc * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    _drawArenaSeals(ctx, cameraY, accent, t) {
      const topSy = this.arenaTopY - cameraY;
      const floorSy = this.arenaFloorY - cameraY;
      const pulse = 0.45 + 0.3 * Math.sin(t * 5);

      ctx.save();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 8]);
      ctx.lineDashOffset = -t * 28;
      ctx.globalAlpha = pulse;

      if (JellyGame.isScreenYVisible(topSy, 20)) {
        ctx.beginPath();
        ctx.moveTo(C.WALL_WIDTH, topSy);
        ctx.lineTo(C.WIDTH - C.WALL_WIDTH, topSy);
        ctx.stroke();
      }
      if (JellyGame.isScreenYVisible(floorSy, 20)) {
        ctx.beginPath();
        ctx.moveTo(C.WALL_WIDTH, floorSy);
        ctx.lineTo(C.WIDTH - C.WALL_WIDTH, floorSy);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawWallZap(ctx, cameraY, accent, t) {
      const z = this.wallZap;
      const wallEdgeX = z.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const dir = z.side < 0 ? 1 : -1;
      const sy = z.centerY - cameraY;
      const top = sy - z.halfH;

      ctx.save();
      if (z.warningTimer > 0) {
        ctx.globalAlpha = 0.45 + 0.45 * Math.sin(t * 20);
        ctx.fillStyle = '#ff5e57';
        ctx.fillRect(z.side < 0 ? wallEdgeX : wallEdgeX - 8, top, 8, z.halfH * 2);
      } else if (z.activeTimer > 0) {
        ctx.fillStyle =
          this.id === 'seraphos' || this.isAscended
            ? 'rgba(255, 228, 120, 0.84)'
            : this.id === 'glacius'
              ? 'rgba(116, 242, 255, 0.72)'
              : 'rgba(255, 94, 87, 0.85)';
        ctx.fillRect(z.side < 0 ? wallEdgeX : wallEdgeX - 18, top, 18, z.halfH * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
          const py = top + (i / 6) * (z.halfH * 2);
          const px = wallEdgeX + dir * (6 + Math.sin(t * 28 + i * 2) * 8);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawArchetypeBody(ctx, r, accent, enraged, t) {
      const ink = C.COLORS.ink || '#1b1136';
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (this.id === 'craggo') {
        // Hovering mossy cartoon stone shoulder pauldrons flanking the golem
        const hover = Math.sin(t * 2.6) * 2.6;
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(side * (r + 8), -2 + hover * side);
          ctx.rotate(side * 0.16);

          ctx.fillStyle = '#5e4c82';
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(0, -11.5);
          ctx.lineTo(8, -4.5);
          ctx.lineTo(6, 10);
          ctx.lineTo(-6, 10);
          ctx.lineTo(-8, -4.5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Moss cap on top of left pauldron for organic asymmetry
          if (side < 0) {
            ctx.fillStyle = '#8ce827';
            ctx.beginPath();
            ctx.arc(-1, -7.5, 4.5, Math.PI, 0);
            ctx.fill();
            ctx.stroke();
          }

          ctx.fillStyle = accent;
          ctx.strokeStyle = ink;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(0, 0, 2.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }

        // Chunky cartoon stone boulder body (slightly organic notched silhouette)
        const traceRock = () => {
          ctx.beginPath();
          ctx.moveTo(-r * 0.55, -r * 0.92);
          ctx.lineTo(0, -r * 1.04);
          ctx.lineTo(r * 0.62, -r * 0.88);
          ctx.lineTo(r * 1.02, -r * 0.2);
          ctx.lineTo(r * 0.9, r * 0.68);
          ctx.lineTo(r * 0.25, r * 1.02);
          ctx.lineTo(-r * 0.42, r * 0.96);
          ctx.lineTo(-r * 0.98, r * 0.48);
          ctx.lineTo(-r * 1.02, -r * 0.28);
          ctx.closePath();
        };

        ctx.fillStyle = '#534173';
        traceRock();
        ctx.fill();

        // Cel-shaded lower-right stone shadow + upper-left highlight
        ctx.save();
        traceRock();
        if (typeof ctx.clip === 'function') ctx.clip();
        ctx.fillStyle = '#362752';
        ctx.beginPath();
        ctx.arc(r * 0.35, r * 0.42, r * 1.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#735c9c';
        ctx.beginPath();
        ctx.ellipse(-r * 0.35, -r * 0.45, r * 0.55, r * 0.35, -0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = ink;
        ctx.lineWidth = 3.2;
        traceRock();
        ctx.stroke();

        // Mossy tuft crowning Craggo's head
        ctx.fillStyle = '#8ce827';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-14, -r * 0.82);
        ctx.quadraticCurveTo(-8, -r * 1.18, 2, -r * 0.98);
        ctx.quadraticCurveTo(10, -r * 1.15, 16, -r * 0.8);
        ctx.quadraticCurveTo(4, -r * 0.65, -14, -r * 0.82);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Glowing comic energy fissure (asymmetric)
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-r + 8, -11);
        ctx.lineTo(-10, -4);
        ctx.lineTo(-8, 6);
        ctx.moveTo(r - 9, -7);
        ctx.lineTo(12, -1);
        ctx.stroke();

        // Heavy cartoon furrowed brow + big expressive glowing eyes
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.moveTo(-18, -9);
        ctx.lineTo(0, -2.5);
        ctx.lineTo(18, -9);
        ctx.lineTo(15, -14);
        ctx.lineTo(-15, -14);
        ctx.closePath();
        ctx.fill();

        for (const side of [-1, 1]) {
          ctx.fillStyle = enraged ? '#ff5e57' : '#fff5a8';
          ctx.strokeStyle = ink;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(side * 4, -1);
          ctx.lineTo(side * 15, -6);
          ctx.lineTo(side * 13, 4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        // Grumpy jagged mouth + chest crystal gem
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-9, 8);
        ctx.lineTo(-3, 5.5);
        ctx.lineTo(3, 8);
        ctx.lineTo(9, 5.5);
        ctx.stroke();

        ctx.fillStyle = accent;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.lineTo(7.5, 17);
        ctx.lineTo(0, 24);
        ctx.lineTo(-7.5, 17);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(-2, 15, 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.id === 'gooz') {
        // ==================== KING GOOZ (Handcrafted Cartoon Slime Sovereign) ====================
        const squish = Math.sin(t * 4.4) * 0.06;
        const dripBob = Math.sin(t * 3.6);

        // 1. Flanking bouncing satellite slime droplets
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(side * (r + 10), 2 + Math.sin(t * 4.2 + side) * 4);
          ctx.fillStyle = '#56ff9a';
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(-2.2, -2.4, 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        ctx.save();
        ctx.scale(1 + squish, 1 - squish * 0.85);

        // 2. Plump jiggly cartoon jelly body with scalloped dripping goo base
        const traceGooz = () => {
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.9);
          ctx.quadraticCurveTo(r * 0.86, -r * 0.88, r * 1.04, -r * 0.04);
          ctx.quadraticCurveTo(r * 1.08, r * 0.68, r * 0.74, r * 0.92);
          ctx.quadraticCurveTo(r * 0.56, r * 1.12 + dripBob * 1.5, r * 0.34, r * 0.92);
          ctx.quadraticCurveTo(0, r * 1.16 - dripBob * 1.8, -r * 0.34, r * 0.92);
          ctx.quadraticCurveTo(-r * 0.56, r * 1.12 + dripBob * 1.5, -r * 0.74, r * 0.92);
          ctx.quadraticCurveTo(-r * 1.08, r * 0.68, -r * 1.04, -r * 0.04);
          ctx.quadraticCurveTo(-r * 0.86, -r * 0.88, 0, -r * 0.9);
          ctx.closePath();
        };

        // Concave emerald cel-shadow base -> bright translucent neon-mint dome
        ctx.fillStyle = '#077a52';
        traceGooz();
        ctx.fill();

        const gGrad = ctx.createLinearGradient(-r * 0.3, -r, r * 0.3, r);
        gGrad.addColorStop(0, '#b8ffd2');
        gGrad.addColorStop(0.45, '#3ef295');
        gGrad.addColorStop(1, '#0db874');

        ctx.save();
        traceGooz();
        if (typeof ctx.clip === 'function') ctx.clip();
        ctx.fillStyle = gGrad;
        ctx.beginPath();
        ctx.arc(-r * 0.14, -r * 0.16, r * 1.02, 0, Math.PI * 2);
        ctx.fill();

        // Suspended inner jelly bubbles + floating tiny captured gold gem inside belly
        ctx.fillStyle = 'rgba(230, 255, 240, 0.48)';
        for (const [bx, by, br] of [
          [-19, 10, 4.6],
          [20, 6, 3.8],
          [14, 21, 5.0],
          [-12, 23, 3.0]
        ]) {
          ctx.beginPath();
          ctx.arc(bx, by + Math.sin(t * 2.4 + bx) * 1.8, br, 0, Math.PI * 2);
          ctx.fill();
        }

        // Big glossy white cartoon jelly specular highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.42, -r * 0.44, r * 0.36, r * 0.16, -0.52, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-r * 0.64, -r * 0.18, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = ink;
        ctx.lineWidth = 3.2;
        traceGooz();
        ctx.stroke();

        // 3. Jaunty tilted Golden Slime King Crown with ruby gem
        ctx.save();
        ctx.translate(2, -r * 0.86);
        ctx.rotate(-0.12 + Math.sin(t * 3.8) * 0.05);
        const cg = ctx.createLinearGradient(0, -22, 0, 4);
        cg.addColorStop(0, '#fff49e');
        cg.addColorStop(0.55, '#ffc433');
        cg.addColorStop(1, '#cf7608');
        ctx.fillStyle = cg;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(-17, 2);
        ctx.lineTo(-20, -14);
        ctx.lineTo(-8, -6);
        ctx.lineTo(0, -21);
        ctx.lineTo(8, -6);
        ctx.lineTo(20, -14);
        ctx.lineTo(17, 2);
        ctx.quadraticCurveTo(0, 7, -17, 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Royal crown center jewel
        ctx.fillStyle = enraged ? '#ff4757' : '#ff5e8c';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, -4, 4.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // 4. Big mischievous cartoon eyes + angled scowling brows + drooling slimy grin
        for (const side of [-1, 1]) {
          ctx.fillStyle = enraged ? '#fff39e' : '#ffffff';
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.ellipse(side * 12.5, -3.5, 6.8, 7.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = enraged ? '#d91636' : ink;
          ctx.beginPath();
          ctx.arc(side * 11.4, -2.5, 3.6, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(side * 10.1, -4.4, 1.5, 0, Math.PI * 2);
          ctx.fill();

          // Thick cheeky angry cartoon eyebrow
          ctx.strokeStyle = ink;
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.moveTo(side * 4.5, -10.5);
          ctx.lineTo(side * 20, -14.8);
          ctx.stroke();
        }

        // Wide goofy-menacing mouth + neon goo drool tongue
        ctx.fillStyle = '#12382b';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-14, 9);
        ctx.quadraticCurveTo(0, 13.5, 14, 9);
        ctx.quadraticCurveTo(12, 21.5, 0, 21.5);
        ctx.quadraticCurveTo(-12, 21.5, -14, 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Dripping lime goo tongue at right corner
        ctx.fillStyle = '#9eff63';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(3, 18);
        ctx.quadraticCurveTo(8, 28 + dripBob * 1.8, 12, 24 + dripBob * 1.4);
        ctx.quadraticCurveTo(13, 17, 9, 14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else if (this.id === 'scorpius') {
        // ==================== SCORPIUS DUNE KING (Cartoon Armored Desert Scorpion) ====================
        const snap = Math.sin(t * 4.5) * 0.16;
        const tailSway = Math.sin(t * 3.1) * 3.2;

        // 1. Segmented golden scorpion stinger tail arching menacingly overhead
        const tailSegs = [
          [tailSway * 0.25, -r * 0.94, 9.5],
          [tailSway * 0.55, -r * 1.24, 8.2],
          [tailSway * 0.85, -r * 1.48, 7.0]
        ];
        for (const [tx, ty, tr] of tailSegs) {
          ctx.fillStyle = '#e88b25';
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(tx, ty, tr, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#ffe68c';
          ctx.beginPath();
          ctx.arc(tx - tr * 0.28, ty - tr * 0.28, tr * 0.32, 0, Math.PI * 2);
          ctx.fill();
        }
        // Glowing emerald-venom curved stinger barb poised right above crown
        ctx.save();
        ctx.translate(tailSway, -r * 1.56);
        ctx.fillStyle = enraged ? '#ff5e57' : '#52ff9b';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-7.5, 4);
        ctx.quadraticCurveTo(-8, -11, 4, -14);
        ctx.quadraticCurveTo(16, -12, 17, 2);
        ctx.quadraticCurveTo(11, -3, 7, 4);
        ctx.quadraticCurveTo(0, 7, -7.5, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#e8fff2';
        ctx.beginPath();
        ctx.arc(1, -6.5, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 2. Flanking animated sharp crescent scorpion pincer claws
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(side * (r + 12), 4 + Math.sin(t * 3.4 + side) * 2.5);
          ctx.scale(side, 1);
          ctx.rotate(-0.1 + snap);

          const pGrad = ctx.createLinearGradient(-4, -20, 18, 14);
          pGrad.addColorStop(0, '#ffe88c');
          pGrad.addColorStop(0.55, '#eb8020');
          pGrad.addColorStop(1, '#993712');
          ctx.fillStyle = pGrad;
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          // Rounded heavy scorpion claw base -> sharp curved twin pincer tips pointing upward
          ctx.moveTo(-4, 12);
          ctx.quadraticCurveTo(-10, 0, -4, -12);
          ctx.quadraticCurveTo(-1, -21, 5, -22);
          ctx.quadraticCurveTo(2, -13, 6, -7);
          ctx.quadraticCurveTo(10, -13, 12, -20);
          ctx.quadraticCurveTo(21, -13, 17, 2);
          ctx.quadraticCurveTo(13, 14, -4, 12);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = 'rgba(255, 250, 210, 0.58)';
          ctx.beginPath();
          ctx.ellipse(3, 3, 4.4, 2.5, -0.35, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // 3. Faceted desert-gold armored carapace head with concave cel-shading
        const traceCarapace = () => {
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.94);
          ctx.lineTo(r * 0.84, -r * 0.54);
          ctx.lineTo(r * 1.0, r * 0.18);
          ctx.lineTo(r * 0.64, r * 0.86);
          ctx.lineTo(0, r * 1.02);
          ctx.lineTo(-r * 0.64, r * 0.86);
          ctx.lineTo(-r * 1.0, r * 0.18);
          ctx.lineTo(-r * 0.84, -r * 0.54);
          ctx.closePath();
        };

        const scGrad = ctx.createLinearGradient(0, -r, 0, r);
        scGrad.addColorStop(0, '#ffe885');
        scGrad.addColorStop(0.48, '#f08c2b');
        scGrad.addColorStop(1, '#ba4418');

        ctx.fillStyle = '#732312';
        traceCarapace();
        ctx.fill();

        ctx.save();
        traceCarapace();
        if (typeof ctx.clip === 'function') ctx.clip();
        ctx.fillStyle = scGrad;
        ctx.beginPath();
        ctx.arc(-r * 0.16, -r * 0.18, r * 0.96, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 250, 200, 0.45)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.34, -r * 0.46, r * 0.44, r * 0.2, -0.35, 0, Math.PI * 2);
        ctx.fill();

        // Carved desert chitin plate bands on forehead
        ctx.strokeStyle = 'rgba(115, 35, 18, 0.55)';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(-22, -19);
        ctx.lineTo(0, -13);
        ctx.lineTo(22, -19);
        ctx.stroke();
        ctx.restore();

        ctx.strokeStyle = ink;
        ctx.lineWidth = 3.2;
        traceCarapace();
        ctx.stroke();

        // 4. Pharaoh-gold brow crest + fierce glowing emerald/ruby scorpion eyes + curved mandibles
        ctx.fillStyle = '#5c1d14';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.3;
        ctx.beginPath();
        ctx.moveTo(-22, -10);
        ctx.lineTo(0, -2);
        ctx.lineTo(22, -10);
        ctx.lineTo(19, -16);
        ctx.lineTo(0, -9);
        ctx.lineTo(-19, -16);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        for (const side of [-1, 1]) {
          ctx.fillStyle = enraged ? '#ff4757' : '#52ff9b';
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(side * 4.5, -1);
          ctx.lineTo(side * 18.5, -7.5);
          ctx.lineTo(side * 16, 4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = ink;
          ctx.beginPath();
          ctx.ellipse(side * 12, -1.2, 1.9, 3.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(side * 10.8, -3.2, 1.3, 0, Math.PI * 2);
          ctx.fill();
        }

        // Armored mandibles snapping at jaw
        for (const side of [-1, 1]) {
          ctx.fillStyle = '#fff5d6';
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(side * 13, 11);
          ctx.quadraticCurveTo(side * 15, 22, side * 4.5, 23);
          ctx.quadraticCurveTo(side * 7.5, 16, side * 6.5, 11);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      } else if (this.id === 'ignis') {
        // ==================== IGNIS THE WYRM (Handcrafted Cartoon Magma Dragon) ====================
        const flap = Math.sin(t * 5.2) * 0.22;
        const flameFlick = Math.sin(t * 8.5);

        // 1. Flanking animated dragon winglets with glowing magma tips
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(side * (r * 0.84), -2);
          ctx.scale(side, 1);
          ctx.rotate(-0.14 + flap);

          const wGrad = ctx.createLinearGradient(0, -14, 24, 12);
          wGrad.addColorStop(0, '#5c182c');
          wGrad.addColorStop(0.6, '#b82933');
          wGrad.addColorStop(1, '#ff9f43');
          ctx.fillStyle = wGrad;
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(-2, -3);
          ctx.quadraticCurveTo(10, -21, 24, -15);
          ctx.quadraticCurveTo(19, -4, 21, 3);
          ctx.quadraticCurveTo(12, 1, 13, 10);
          ctx.quadraticCurveTo(5, 7, -2, 8);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Wing bone rib accent
          ctx.strokeStyle = '#ffbe47';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(1, -2);
          ctx.quadraticCurveTo(10, -10, 19, -12);
          ctx.stroke();
          ctx.restore();
        }

        // 2. Dancing fiery mane crest behind horns
        ctx.fillStyle = enraged ? '#ffe875' : '#ff6b2b';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-16, -r * 0.72);
        ctx.quadraticCurveTo(-15, -r * 1.32 - flameFlick * 2.5, -5, -r * 1.12);
        ctx.quadraticCurveTo(0, -r * 1.52 + flameFlick * 3, 6, -r * 1.1);
        ctx.quadraticCurveTo(15, -r * 1.3 - flameFlick * 2, 16, -r * 0.72);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fff5a8';
        ctx.beginPath();
        ctx.moveTo(-7, -r * 0.8);
        ctx.quadraticCurveTo(0, -r * 1.28 + flameFlick * 2, 7, -r * 0.8);
        ctx.closePath();
        ctx.fill();

        // 3. Sweeping ridged ivory-obsidian dragon horns (high-contrast against dark volcano skies)
        for (const side of [-1, 1]) {
          const hGrad = ctx.createLinearGradient(side * 12, -r * 0.4, side * 38, -r * 1.44);
          hGrad.addColorStop(0, '#4a1929');
          hGrad.addColorStop(0.45, '#c76840');
          hGrad.addColorStop(1, '#fff3cc');
          ctx.fillStyle = hGrad;
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.moveTo(side * 10, -r * 0.66);
          ctx.quadraticCurveTo(side * 24, -r * 1.24, side * 37, -r * 1.4);
          ctx.quadraticCurveTo(side * 34, -r * 0.78, side * 22, -r * 0.34);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Horn ridge bands
          ctx.strokeStyle = 'rgba(27, 17, 54, 0.45)';
          ctx.lineWidth = 1.7;
          ctx.beginPath();
          ctx.moveTo(side * 17, -r * 0.76);
          ctx.lineTo(side * 24, -r * 0.64);
          ctx.moveTo(side * 23, -r * 0.98);
          ctx.lineTo(side * 29, -r * 0.88);
          ctx.stroke();
        }

        // 4. Sculpted angular dragon head silhouette with cel-shading & molten belly scales
        const traceWyrm = () => {
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.96);
          ctx.quadraticCurveTo(r * 0.82, -r * 0.92, r * 0.98, -r * 0.14);
          ctx.quadraticCurveTo(r * 1.04, r * 0.46, r * 0.58, r * 0.86);
          ctx.quadraticCurveTo(0, r * 1.08, -r * 0.58, r * 0.86);
          ctx.quadraticCurveTo(-r * 1.04, r * 0.46, -r * 0.98, -r * 0.14);
          ctx.quadraticCurveTo(-r * 0.82, -r * 0.92, 0, -r * 0.96);
          ctx.closePath();
        };

        const bodyG = ctx.createLinearGradient(0, -r, 0, r);
        bodyG.addColorStop(0, '#ffba42');
        bodyG.addColorStop(0.52, '#f24b29');
        bodyG.addColorStop(1, '#c42130');

        // Base deep-crimson shadow tone -> clipped upper-left lit dome creates true concave cel-shadow
        ctx.fillStyle = '#731229';
        traceWyrm();
        ctx.fill();

        ctx.save();
        traceWyrm();
        if (typeof ctx.clip === 'function') ctx.clip();
        ctx.fillStyle = bodyG;
        ctx.beginPath();
        ctx.arc(-r * 0.16, -r * 0.18, r * 0.98, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 240, 155, 0.42)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.34, -r * 0.46, r * 0.48, r * 0.24, -0.35, 0, Math.PI * 2);
        ctx.fill();

        // Warm golden armored dragon chin belly plates with scale ribs
        ctx.fillStyle = '#ffd15c';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(0, r * 0.94, r * 0.56, r * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = '#c97b1e';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-12, r * 0.84);
        ctx.quadraticCurveTo(0, r * 0.9, 12, r * 0.84);
        ctx.moveTo(-9, r * 0.97);
        ctx.quadraticCurveTo(0, r * 1.02, 9, r * 0.97);
        ctx.stroke();

        // Asymmetric glowing magma fissure on left cheek
        ctx.strokeStyle = enraged ? '#fff5a8' : '#ffd147';
        ctx.lineWidth = 2.1;
        ctx.beginPath();
        ctx.moveTo(-r + 4, 3);
        ctx.lineTo(-17, 7);
        ctx.lineTo(-14, 15);
        ctx.stroke();
        ctx.restore();

        ctx.strokeStyle = ink;
        ctx.lineWidth = 3.2;
        traceWyrm();
        ctx.stroke();

        // 5. Heavy armored dragon brow ridge + blazing slit-pupil eyes
        ctx.fillStyle = '#331126';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-22, -13);
        ctx.lineTo(0, -4);
        ctx.lineTo(22, -13);
        ctx.lineTo(19, -19);
        ctx.lineTo(0, -12);
        ctx.lineTo(-19, -19);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        for (const side of [-1, 1]) {
          const traceEye = () => {
            ctx.beginPath();
            ctx.moveTo(side * 4.5, -2.5);
            ctx.lineTo(side * 18.5, -9.5);
            ctx.lineTo(side * 16.2, 3);
            ctx.quadraticCurveTo(side * 9, 5, side * 4.5, -2.5);
            ctx.closePath();
          };
          ctx.fillStyle = enraged ? '#fff38a' : '#fff9d6';
          traceEye();
          ctx.fill();

          ctx.save();
          traceEye();
          if (typeof ctx.clip === 'function') ctx.clip();
          // Sharp fiery dragon slit pupil + catchlight glint
          ctx.fillStyle = enraged ? '#d91636' : ink;
          ctx.beginPath();
          ctx.ellipse(side * 11.2, -2.6, 2.2, 4.6, -side * 0.12, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(side * 9.8, -4.6, 1.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.0;
          traceEye();
          ctx.stroke();
        }

        // Tiny snout nostrils + fierce toothy fang grin
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.ellipse(-3.5, 4.2, 1.8, 1.2, 0.3, 0, Math.PI * 2);
        ctx.ellipse(3.5, 4.2, 1.8, 1.2, -0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#260a1c';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-14, 10);
        ctx.quadraticCurveTo(0, 8.5, 14, 10);
        ctx.quadraticCurveTo(11, 22, 0, 22);
        ctx.quadraticCurveTo(-11, 22, -14, 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Crisp ivory dragon fangs (2 big upper + 1 cheeky lower fang)
        ctx.fillStyle = '#fff9eb';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.5;
        for (const fx of [-8.5, 8.5]) {
          ctx.beginPath();
          ctx.moveTo(fx - 3.2, 10);
          ctx.lineTo(fx, 17);
          ctx.lineTo(fx + 3.2, 10);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(-2.5, 20.5);
        ctx.lineTo(0.5, 15.5);
        ctx.lineTo(3.5, 20.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (this.id === 'aether') {
        // ==================== AETHER THE STORM (Cartoon Thunder Sentinel) ====================
        const hover = Math.sin(t * 3.4) * 2.5;
        const zapPulse = Math.sin(t * 11) > 0 ? 1 : -1;

        // 1. Rear half of rotating electric halo ring (behind body)
        ctx.save();
        ctx.rotate(0.28 + Math.sin(t * 2.1) * 0.12);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 5.4;
        ctx.beginPath();
        ctx.ellipse(0, 0, r + 11, r * 0.44, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2.6;
        ctx.stroke();
        ctx.restore();

        // 2. Flanking floating thunder-rod pylons crackling with storm energy
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(side * (r + 9), -3 + hover * side);
          ctx.rotate(side * 0.14);

          ctx.fillStyle = '#3b6ad6';
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(0, -13);
          ctx.lineTo(7, -4);
          ctx.lineTo(5, 11);
          ctx.lineTo(-5, 11);
          ctx.lineTo(-7, -4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Glowing coil core & crackling spark tip
          ctx.fillStyle = enraged ? '#ffe875' : '#74f2ff';
          ctx.strokeStyle = ink;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(0, 1, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.strokeStyle = '#ffe875';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -13);
          ctx.lineTo(side * 2.5 * zapPulse, -18);
          ctx.lineTo(-side * 1.5 * zapPulse, -23);
          ctx.stroke();
          ctx.restore();
        }

        // 3. Sculpted Storm Sentinel armored helm chassis (faceted cel-shaded!)
        const traceHelm = () => {
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.95);
          ctx.lineTo(r * 0.76, -r * 0.66);
          ctx.lineTo(r * 0.94, 0);
          ctx.lineTo(r * 0.7, r * 0.72);
          ctx.lineTo(0, r * 0.92);
          ctx.lineTo(-r * 0.7, r * 0.72);
          ctx.lineTo(-r * 0.94, 0);
          ctx.lineTo(-r * 0.76, -r * 0.66);
          ctx.closePath();
        };

        const aGrad = ctx.createLinearGradient(0, -r, 0, r);
        aGrad.addColorStop(0, '#b5f7ff');
        aGrad.addColorStop(0.55, '#3b9eff');
        aGrad.addColorStop(1, '#2653b8');

        // Deep cobalt cel-shadow base -> clipped upper-left lit dome
        ctx.fillStyle = '#1b2c6b';
        traceHelm();
        ctx.fill();

        ctx.save();
        traceHelm();
        if (typeof ctx.clip === 'function') ctx.clip();
        ctx.fillStyle = aGrad;
        ctx.beginPath();
        ctx.arc(-r * 0.16, -r * 0.18, r * 0.94, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.44)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.34, -r * 0.44, r * 0.46, r * 0.2, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = ink;
        ctx.lineWidth = 3.2;
        traceHelm();
        ctx.stroke();

        // 4. Golden Lightning Bolt Crest mounted cleanly on top of helm brow
        ctx.fillStyle = '#ffe875';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(4, -r * 1.52);
        ctx.lineTo(-10, -r * 0.96);
        ctx.lineTo(-1.5, -r * 0.96);
        ctx.lineTo(-6, -r * 0.56);
        ctx.lineTo(11, -r * 1.12);
        ctx.lineTo(2.5, -r * 1.12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 5. Expressive angled armored visor plate (outer ink + bright ice-steel bezel) + scanning storm iris
        const traceVisor = () => {
          ctx.beginPath();
          ctx.moveTo(-20, -9.5);
          ctx.lineTo(0, -3.5);
          ctx.lineTo(20, -9.5);
          ctx.lineTo(17, 6.5);
          ctx.quadraticCurveTo(0, 10.5, -17, 6.5);
          ctx.closePath();
        };
        ctx.strokeStyle = ink;
        ctx.lineWidth = 5.4;
        traceVisor();
        ctx.stroke();

        ctx.fillStyle = '#140c30';
        ctx.strokeStyle = '#baf6ff';
        ctx.lineWidth = 2.0;
        traceVisor();
        ctx.fill();
        ctx.stroke();

        // Glowing scanning storm eye inside visor
        const scanX = Math.sin(t * 3.8) * 6.5;
        ctx.fillStyle = enraged ? '#ff5e57' : '#6effc9';
        ctx.beginPath();
        ctx.ellipse(scanX, 1.5, enraged ? 6.4 : 5.4, enraged ? 4.2 : 5.0, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(scanX - 1.6, -0.8, 1.8, 0, Math.PI * 2);
        ctx.fill();

        // 6. Billowing cartoon storm-cloud collar cradling Aether's base + mini belly zap
        const cloudY = r * 0.72 + Math.sin(t * 4) * 1.4;
        const traceCloudCollar = () => {
          ctx.beginPath();
          ctx.arc(-20, cloudY, 10.5, 0, Math.PI * 2);
          ctx.arc(-7, cloudY + 4, 12.5, 0, Math.PI * 2);
          ctx.arc(8, cloudY + 3.5, 12, 0, Math.PI * 2);
          ctx.arc(21, cloudY - 0.5, 10, 0, Math.PI * 2);
        };
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc(-20, cloudY, 12.8, 0, Math.PI * 2);
        ctx.arc(-7, cloudY + 4, 14.8, 0, Math.PI * 2);
        ctx.arc(8, cloudY + 3.5, 14.3, 0, Math.PI * 2);
        ctx.arc(21, cloudY - 0.5, 12.3, 0, Math.PI * 2);
        ctx.fill();

        const clG = ctx.createLinearGradient(0, cloudY - 12, 0, cloudY + 16);
        clG.addColorStop(0, '#d9f0ff');
        clG.addColorStop(0.55, '#688ad1');
        clG.addColorStop(1, '#2d417d');
        ctx.fillStyle = clG;
        traceCloudCollar();
        ctx.fill();

        // Soft bright cartoon highlight crescents hugging top edge of cloud puffs
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(-20, cloudY, 7.2, Math.PI * 1.15, Math.PI * 1.72);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-7, cloudY + 4, 8.8, Math.PI * 1.18, Math.PI * 1.78);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(8, cloudY + 3.5, 8.4, Math.PI * 1.2, Math.PI * 1.78);
        ctx.stroke();

        // Tiny golden spark peeking beneath storm cloud
        ctx.fillStyle = '#ffe875';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(1, cloudY + 10);
        ctx.lineTo(-4, cloudY + 17);
        ctx.lineTo(0.5, cloudY + 17);
        ctx.lineTo(-1.5, cloudY + 23);
        ctx.lineTo(5.5, cloudY + 15);
        ctx.lineTo(1.5, cloudY + 15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Front half of electric ring crossing cleanly in front of the storm collar
        ctx.save();
        ctx.rotate(0.28 + Math.sin(t * 2.1) * 0.12);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 5.4;
        ctx.beginPath();
        ctx.ellipse(0, 0, r + 11, r * 0.44, 0, 0, Math.PI);
        ctx.stroke();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2.6;
        ctx.stroke();
        ctx.restore();
      } else if (this.id === 'glacius') {
        // ==================== GLACIUS EMPRESS (Regal Cartoon Ice Queen) ====================
        const floatY = Math.sin(t * 2.6) * 2.2;

        // 1. Floating crystalline shoulder wings (layered twin crystal feathers)
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(side * (r * 0.92), 1 + floatY * side);
          ctx.scale(side, 1);
          ctx.rotate(0.16);

          // Secondary lower crystal feather
          ctx.fillStyle = '#53d2f2';
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(-2, 4);
          ctx.lineTo(13, 10);
          ctx.lineTo(6, 20);
          ctx.lineTo(-4, 13);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Primary upper crystal wing
          ctx.fillStyle = '#8ef4ff';
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(0, -15);
          ctx.lineTo(16, -5);
          ctx.lineTo(9, 12);
          ctx.lineTo(-2, 6);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#e8ffff';
          ctx.beginPath();
          ctx.moveTo(0, -14);
          ctx.lineTo(15, -5);
          ctx.lineTo(2, 0);
          ctx.closePath();
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(0, -15);
          ctx.lineTo(16, -5);
          ctx.lineTo(9, 12);
          ctx.lineTo(-2, 6);
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
        }

        // 2. Crisp icicle pendants with sunlit left highlights draping below her crystal base
        for (const [ix, len] of [
          [-13, 15],
          [0, 21],
          [13, 15]
        ]) {
          ctx.fillStyle = '#6feaff';
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(ix - 4.8, r * 0.72);
          ctx.lineTo(ix, r * 0.72 + len);
          ctx.lineTo(ix + 4.8, r * 0.72);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#e8ffff';
          ctx.beginPath();
          ctx.moveTo(ix - 3.6, r * 0.74);
          ctx.lineTo(ix, r * 0.72 + len - 2);
          ctx.lineTo(ix, r * 0.74);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(ix - 4.8, r * 0.72);
          ctx.lineTo(ix, r * 0.72 + len);
          ctx.lineTo(ix + 4.8, r * 0.72);
          ctx.closePath();
          ctx.stroke();
        }

        // 3. Faceted diamond-cut Ice Empress body
        const traceCrystal = () => {
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.96);
          ctx.lineTo(r * 0.82, -r * 0.44);
          ctx.lineTo(r * 0.92, r * 0.24);
          ctx.lineTo(r * 0.48, r * 0.86);
          ctx.lineTo(0, r * 1.02);
          ctx.lineTo(-r * 0.48, r * 0.86);
          ctx.lineTo(-r * 0.92, r * 0.24);
          ctx.lineTo(-r * 0.82, -r * 0.44);
          ctx.closePath();
        };

        const cGrad = ctx.createLinearGradient(-r, -r, r, r);
        cGrad.addColorStop(0, '#f2ffff');
        cGrad.addColorStop(0.45, '#6ce6ff');
        cGrad.addColorStop(1, '#1d6b8f');
        ctx.fillStyle = cGrad;
        traceCrystal();
        ctx.fill();

        // Crisp internal faceted crystal planes inside clip
        ctx.save();
        traceCrystal();
        if (typeof ctx.clip === 'function') ctx.clip();

        // Bright sunlit left crystal plane
        ctx.fillStyle = 'rgba(255, 255, 255, 0.48)';
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(-r, -r * 0.4);
        ctx.lineTo(-r * 0.45, r * 0.9);
        ctx.lineTo(-r * 0.08, 0);
        ctx.closePath();
        ctx.fill();

        // Deep shaded royal-teal right facet
        ctx.fillStyle = 'rgba(18, 66, 102, 0.38)';
        ctx.beginPath();
        ctx.moveTo(r * 0.14, -r * 0.2);
        ctx.lineTo(r, -r * 0.45);
        ctx.lineTo(r, r);
        ctx.lineTo(0, r * 1.1);
        ctx.closePath();
        ctx.fill();

        // Subtle crisp facet reflection lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.94);
        ctx.lineTo(-r * 0.16, r * 0.94);
        ctx.moveTo(-r * 0.8, -r * 0.42);
        ctx.lineTo(-r * 0.12, -r * 0.14);
        ctx.stroke();
        ctx.restore();

        ctx.strokeStyle = ink;
        ctx.lineWidth = 3.2;
        traceCrystal();
        ctx.stroke();

        // 4. Regal 3-spire Ice Queen Tiara + center frost ruby/sapphire jewel
        const tiaraG = ctx.createLinearGradient(0, -r * 1.56, 0, -r * 0.72);
        tiaraG.addColorStop(0, '#ffffff');
        tiaraG.addColorStop(0.55, '#9bf4ff');
        tiaraG.addColorStop(1, '#31a8d6');
        ctx.fillStyle = tiaraG;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(-21, -r * 0.68);
        ctx.lineTo(-24, -r * 1.24);
        ctx.lineTo(-10, -r * 0.92);
        ctx.lineTo(0, -r * 1.54);
        ctx.lineTo(10, -r * 0.92);
        ctx.lineTo(24, -r * 1.24);
        ctx.lineTo(21, -r * 0.68);
        ctx.quadraticCurveTo(0, -r * 0.52, -21, -r * 0.68);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = enraged ? '#ff5e8c' : '#ffe875';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.12);
        ctx.lineTo(5, -r * 0.88);
        ctx.lineTo(0, -r * 0.66);
        ctx.lineTo(-5, -r * 0.88);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 5. Haughty regal cartoon eyes with clipped royal iris, winged eyelashes & cool smirk
        for (const side of [-1, 1]) {
          // Arched icy brow
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(side * 5, -10.5);
          ctx.quadraticCurveTo(side * 12.5, -16, side * 19.5, -11);
          ctx.stroke();

          // Expressive almond eye path
          const traceEmpressEye = () => {
            ctx.beginPath();
            ctx.moveTo(side * 4.8, -1);
            ctx.quadraticCurveTo(side * 12.2, -9.2, side * 19.2, -2.4);
            ctx.quadraticCurveTo(side * 12.5, 5.8, side * 4.8, -1);
            ctx.closePath();
          };

          ctx.fillStyle = '#ffffff';
          traceEmpressEye();
          ctx.fill();

          // Clipped deep royal / enraged ruby iris + double white catchlights
          ctx.save();
          traceEmpressEye();
          if (typeof ctx.clip === 'function') ctx.clip();
          ctx.fillStyle = enraged ? '#ff3d7f' : '#1d3282';
          ctx.beginPath();
          ctx.arc(side * 11.8, -1.6, 4.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#0e163b';
          ctx.beginPath();
          ctx.arc(side * 11.8, -1.6, 1.9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(side * 10.4, -3.1, 1.5, 0, Math.PI * 2);
          ctx.arc(side * 13.1, -0.3, 0.85, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.1;
          traceEmpressEye();
          ctx.stroke();

          // Winged outer eyelash flick
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(side * 17, -3.6);
          ctx.lineTo(side * 22.8, -6.8);
          ctx.stroke();

          // Soft icy cheek blush dot
          ctx.fillStyle = enraged ? 'rgba(255, 94, 140, 0.35)' : 'rgba(130, 232, 255, 0.45)';
          ctx.beginPath();
          ctx.ellipse(side * 15, 6.2, 4, 2.2, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // Cool imperious empress smirk (asymmetric confident tilt)
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-5.5, 10.5);
        ctx.quadraticCurveTo(2, 11.2, 8.5, 7);
        ctx.stroke();
      } else if (this.id === 'voidon') {
        // ==================== VOIDON EMPEROR (Grand Cosmic Sovereign Boss) ====================
        // 1. Undulating starry nebula cloak tendrils flowing beneath Voidon
        for (let i = 0; i < 4; i++) {
          const offset = (i - 1.5) * 15;
          const wave = Math.sin(t * 3.2 + i * 1.3) * 5;
          const len = i === 1 || i === 2 ? 26 : 19;
          const tGrad = ctx.createLinearGradient(0, r * 0.4, 0, r + len);
          tGrad.addColorStop(0, '#36166e');
          tGrad.addColorStop(1, enraged ? '#ff4757' : '#e072ff');
          ctx.fillStyle = tGrad;
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(offset - 6, r * 0.55);
          ctx.quadraticCurveTo(offset + wave, r + len * 0.55, offset + wave * 0.8, r + len);
          ctx.quadraticCurveTo(offset + 6 + wave * 0.5, r + len * 0.45, offset + 7, r * 0.55);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        // 2. Rotating golden imperial runic ring behind sphere
        ctx.save();
        ctx.rotate(-t * 1.5);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 5.8;
        ctx.setLineDash([9, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, r + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = enraged ? '#ff6b81' : '#ffd147';
        ctx.lineWidth = 2.8;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // 3. Sweeping luminous amethyst-gold cosmic horns flanking the imperial crown
        for (const side of [-1, 1]) {
          const vhGrad = ctx.createLinearGradient(side * 18, -r * 0.5, side * 36, -r * 1.5);
          vhGrad.addColorStop(0, '#36146b');
          vhGrad.addColorStop(0.55, '#9d4edd');
          vhGrad.addColorStop(1, '#f4d4ff');
          ctx.fillStyle = vhGrad;
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.moveTo(side * 16, -r * 0.6);
          ctx.quadraticCurveTo(side * 42, -r * 1.08, side * 35, -r * 1.52);
          ctx.quadraticCurveTo(side * 24, -r * 1.06, side * 27, -r * 0.46);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Ornate golden horn cuff ring
          ctx.strokeStyle = '#ffd147';
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.moveTo(side * 21, -r * 0.72);
          ctx.lineTo(side * 30, -r * 0.64);
          ctx.stroke();
        }

        // 4. Cosmic Emperor sphere with true concave cel-shadow & inner twinkling starfield
        const vGrad = ctx.createLinearGradient(-r * 0.4, -r, r * 0.4, r);
        vGrad.addColorStop(0, '#f5c2ff');
        vGrad.addColorStop(0.5, accent);
        vGrad.addColorStop(1, '#4c1b94');

        ctx.fillStyle = '#1f0b4d';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        if (typeof ctx.clip === 'function') ctx.clip();

        ctx.fillStyle = vGrad;
        ctx.beginPath();
        ctx.arc(-r * 0.16, -r * 0.18, r * 0.96, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 228, 255, 0.38)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.34, -r * 0.46, r * 0.48, r * 0.24, -0.35, 0, Math.PI * 2);
        ctx.fill();

        // Inner cosmic star specks
        ctx.fillStyle = '#fff5bd';
        for (const [sx, sy, sr] of [
          [-18, -14, 1.8],
          [19, -11, 1.5],
          [-15, 16, 1.4],
          [16, 15, 2.0],
          [0, 21, 1.5]
        ]) {
          ctx.beginPath();
          ctx.arc(sx, sy, sr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        ctx.strokeStyle = ink;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();

        // 4b. Royal gold-trimmed Imperial Mantle Collar draping across Voidon's lower rim
        ctx.fillStyle = '#2d135c';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(-r * 0.78, r * 0.56);
        ctx.quadraticCurveTo(0, r * 0.88, r * 0.78, r * 0.56);
        ctx.quadraticCurveTo(r * 0.62, r * 1.08, 0, r * 1.12);
        ctx.quadraticCurveTo(-r * 0.62, r * 1.08, -r * 0.78, r * 0.56);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = '#ffd147';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-r * 0.68, r * 0.68);
        ctx.quadraticCurveTo(0, r * 0.98, r * 0.68, r * 0.68);
        ctx.stroke();

        // Gold mantle clasp gem
        ctx.fillStyle = enraged ? '#ff4757' : '#ffd147';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, r * 0.9, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 5. Ornate golden Emperor Crown perched atop Voidon
        const crGrad = ctx.createLinearGradient(0, -r * 1.42, 0, -r * 0.72);
        crGrad.addColorStop(0, '#fff49e');
        crGrad.addColorStop(0.55, '#ffb82e');
        crGrad.addColorStop(1, '#c96f08');
        ctx.fillStyle = crGrad;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(-19, -r * 0.74);
        ctx.lineTo(-22, -r * 1.18);
        ctx.lineTo(-9, -r * 0.94);
        ctx.lineTo(0, -r * 1.44);
        ctx.lineTo(9, -r * 0.94);
        ctx.lineTo(22, -r * 1.18);
        ctx.lineTo(19, -r * 0.74);
        ctx.quadraticCurveTo(0, -r * 0.58, -19, -r * 0.74);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = enraged ? '#ff4757' : '#e08aff';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, -r * 0.96, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 6. Hypnotic Golden-Trimmed Sovereign Eye with wide fierce glare & angled imperial brow
        ctx.fillStyle = '#ffd147';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-22, 1);
        ctx.quadraticCurveTo(0, -18, 22, 1);
        ctx.quadraticCurveTo(0, 18, -22, 1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        const traceVoidEye = () => {
          ctx.beginPath();
          ctx.moveTo(-18, 1);
          ctx.quadraticCurveTo(0, -13.5, 18, 1);
          ctx.quadraticCurveTo(0, 14, -18, 1);
          ctx.closePath();
        };
        ctx.fillStyle = ink;
        traceVoidEye();
        ctx.fill();

        const eyeDrift = Math.sin(t * 2.5) * 2.8;
        ctx.save();
        traceVoidEye();
        if (typeof ctx.clip === 'function') ctx.clip();
        ctx.fillStyle = enraged ? '#ff4757' : '#ffd147';
        ctx.beginPath();
        ctx.ellipse(eyeDrift, 1, 8.8, 9.2, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.ellipse(eyeDrift, 1, 3.0, 8.0, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(eyeDrift - 3.3, -2.5, 2.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Sharp royal V-scowl brow ridge above the wide blazing sovereign eye
        ctx.fillStyle = '#2d135c';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.3;
        ctx.beginPath();
        ctx.moveTo(-23, -10.5);
        ctx.quadraticCurveTo(0, -18.5, 23, -10.5);
        ctx.lineTo(20, -6.5);
        ctx.lineTo(0, -4.5);
        ctx.lineTo(-20, -6.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // ==================== SERAPHOS THE ARCHON (Celestial Heaven Guardian Boss) ====================
        const wingFlap = Math.sin(t * 3.8) * 0.16;
        const sashWave = Math.sin(t * 2.8) * 4;

        // 1. Rotating sacred golden astrolabe sun-ring behind Seraphos
        ctx.save();
        ctx.rotate(t * 0.75);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 4.6;
        ctx.beginPath();
        ctx.arc(0, 0, r + 13, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#ffd147';
        ctx.lineWidth = 2.2;
        ctx.stroke();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.fillStyle = '#fff5bd';
          ctx.strokeStyle = ink;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * (r + 13), Math.sin(a) * (r + 13), 2.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();

        // 2. Four majestic cartoon pearl-white & gold Seraph wings (upper + lower pairs)
        for (const side of [-1, 1]) {
          // Lower wing pair
          ctx.save();
          ctx.translate(side * (r * 0.62), 10);
          ctx.scale(side, 1);
          ctx.rotate(0.32 - wingFlap * 0.8);
          ctx.fillStyle = '#ffe99e';
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(-2, -2);
          ctx.quadraticCurveTo(16, -6, 30, 8);
          ctx.quadraticCurveTo(20, 12, 22, 20);
          ctx.quadraticCurveTo(10, 15, -2, 10);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();

          // Upper sweeping seraph wing pair
          ctx.save();
          ctx.translate(side * (r * 0.72), -4);
          ctx.scale(side, 1);
          ctx.rotate(-0.18 + wingFlap);
          const swGrad = ctx.createLinearGradient(0, -24, 38, 12);
          swGrad.addColorStop(0, '#ffffff');
          swGrad.addColorStop(0.62, '#fff4cc');
          swGrad.addColorStop(1, '#ffd147');
          ctx.fillStyle = swGrad;
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(-4, 0);
          ctx.quadraticCurveTo(14, -34, 40, -22);
          ctx.quadraticCurveTo(30, -10, 35, -3);
          ctx.quadraticCurveTo(23, 0, 27, 10);
          ctx.quadraticCurveTo(12, 9, -4, 10);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.strokeStyle = '#e8a825';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(4, -3);
          ctx.quadraticCurveTo(18, -16, 31, -16);
          ctx.stroke();
          ctx.restore();
        }

        // 3. Twin flowing ivory-gold celestial ribbon stoles hanging below
        for (const side of [-1, 1]) {
          ctx.fillStyle = '#fff5d1';
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(side * 12, r * 0.7);
          ctx.quadraticCurveTo(side * 16 + sashWave, r + 12, side * 12 + sashWave * 0.7, r + 24);
          ctx.lineTo(side * 4 + sashWave * 0.6, r + 18);
          ctx.quadraticCurveTo(side * 7 + sashWave * 0.4, r + 10, side * 4, r * 0.72);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        // 4. Sculpted Pearl-Ivory & Gold Archon Armor Core (concave cel-shading)
        const traceArchon = () => {
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.98);
          ctx.lineTo(r * 0.76, -r * 0.62);
          ctx.lineTo(r * 0.9, r * 0.06);
          ctx.lineTo(r * 0.56, r * 0.78);
          ctx.lineTo(0, r * 1.02);
          ctx.lineTo(-r * 0.56, r * 0.78);
          ctx.lineTo(-r * 0.9, r * 0.06);
          ctx.lineTo(-r * 0.76, -r * 0.62);
          ctx.closePath();
        };

        const arGrad = ctx.createLinearGradient(0, -r, 0, r);
        arGrad.addColorStop(0, '#ffffff');
        arGrad.addColorStop(0.55, '#fff6d9');
        arGrad.addColorStop(1, '#ffe08a');

        ctx.fillStyle = '#c49d68';
        traceArchon();
        ctx.fill();

        ctx.save();
        traceArchon();
        if (typeof ctx.clip === 'function') ctx.clip();
        ctx.fillStyle = arGrad;
        ctx.beginPath();
        ctx.arc(-r * 0.16, -r * 0.18, r * 0.95, 0, Math.PI * 2);
        ctx.fill();

        // Ornate vertical golden crest line & solar chest chevron
        ctx.fillStyle = '#ffd147';
        ctx.fillRect(-3.5, -r, 7, r * 0.48);
        ctx.strokeStyle = '#e09614';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(-16, 15);
        ctx.lineTo(0, 24);
        ctx.lineTo(16, 15);
        ctx.stroke();
        ctx.restore();

        ctx.strokeStyle = ink;
        ctx.lineWidth = 3.2;
        traceArchon();
        ctx.stroke();

        // Chest solar jewel diamond
        ctx.fillStyle = enraged ? '#ff6b4a' : '#74f2ff';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.9;
        ctx.beginPath();
        ctx.moveTo(0, 11);
        ctx.lineTo(6.5, 18);
        ctx.lineTo(0, 25);
        ctx.lineTo(-6.5, 18);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 5. Royal Sapphire-Violet Celestial Visor framed in gleaming gold + glowing diamond eyes
        const traceSeraphVisor = () => {
          ctx.beginPath();
          ctx.moveTo(-21, -7.5);
          ctx.lineTo(0, -13);
          ctx.lineTo(21, -7.5);
          ctx.lineTo(18, 5.5);
          ctx.quadraticCurveTo(0, 9.5, -18, 5.5);
          ctx.closePath();
        };
        ctx.strokeStyle = ink;
        ctx.lineWidth = 5.2;
        traceSeraphVisor();
        ctx.stroke();

        ctx.fillStyle = '#1b134a';
        ctx.strokeStyle = '#ffd147';
        ctx.lineWidth = 2.2;
        traceSeraphVisor();
        ctx.fill();
        ctx.stroke();

        for (const side of [-1, 1]) {
          ctx.fillStyle = enraged ? '#ffcf5c' : '#fffdf0';
          ctx.beginPath();
          ctx.moveTo(side * 4.5, -1.5);
          ctx.lineTo(side * 11, -5.8);
          ctx.lineTo(side * 16.5, -1.5);
          ctx.lineTo(side * 11, 2.8);
          ctx.closePath();
          ctx.fill();
        }

        // 6. Floating Radiant Golden Archangel Halo above helm
        ctx.save();
        ctx.translate(0, -r * 1.28 + Math.sin(t * 3.2) * 1.8);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 5.6;
        ctx.beginPath();
        ctx.ellipse(0, 0, 19, 5.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = enraged ? '#fff6a6' : '#ffd147';
        ctx.lineWidth = 2.8;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  JellyGame.Bosses = {
    ARCHETYPES: BOSS_ARCHETYPES,
    BossEntity,
    BossBoltProjectile,
    getMilestoneMeters,
    getBossDefForIndex
  };
})(window);
