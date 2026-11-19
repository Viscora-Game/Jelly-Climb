(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});
  const C = JellyGame.CONSTANTS;

  function circleRectOverlap(cx, cy, r, rx, ry, rw, rh) {
    const closestX = cx < rx ? rx : cx > rx + rw ? rx + rw : cx;
    const closestY = cy < ry ? ry : cy > ry + rh ? ry + rh : cy;
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy < r * r;
  }

  function distToSegmentSq(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const lenSq = abx * abx + aby * aby;
    if (lenSq <= 1e-6) {
      const dx = px - ax;
      const dy = py - ay;
      return dx * dx + dy * dy;
    }
    let t = ((px - ax) * abx + (py - ay) * aby) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = ax + t * abx;
    const cy = ay + t * aby;
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy;
  }

  function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
    const s1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    const s2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    const s3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
    const hasNeg = s1 < 0 || s2 < 0 || s3 < 0;
    const hasPos = s1 > 0 || s2 > 0 || s3 > 0;
    return !(hasNeg && hasPos);
  }

  function circleTriangleOverlap(cx, cy, r, ax, ay, bx, by, tx, ty) {
    if (pointInTriangle(cx, cy, ax, ay, bx, by, tx, ty)) return true;
    const rSq = r * r;
    if (distToSegmentSq(cx, cy, ax, ay, bx, by) < rSq) return true;
    if (distToSegmentSq(cx, cy, bx, by, tx, ty) < rSq) return true;
    if (distToSegmentSq(cx, cy, tx, ty, ax, ay) < rSq) return true;
    return false;
  }

  function fillStrokeRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
  }

  /**
   * 1. Fixed wall spikes with exact per-tooth triangle hitboxes.
   */
  class SpikeObstacle {
    constructor(side, y, height = 68) {
      this.type = 'spike';
      this.side = side; // -1 left wall, 1 right wall
      this.y = y;
      this.height = height;
      this.protrusion = 22;
      this.topY = y - height * 0.5;
      this.bottomY = y + height * 0.5;
      this.spikeCount = 3;
    }

    update() {}

    getHitboxes() {
      const wallEdgeX = this.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const dir = this.side < 0 ? 1 : -1;
      const top = this.y - this.height * 0.5;
      const segH = this.height / this.spikeCount;
      const insetY = C.HITBOX.SPIKE_BASE_INSET_Y;
      const tipReach = this.protrusion - C.HITBOX.SPIKE_TIP_INSET_X;
      const triangles = [];

      for (let i = 0; i < this.spikeCount; i++) {
        const y0 = top + i * segH + insetY;
        const y1 = top + (i + 1) * segH - insetY;
        const ym = (y0 + y1) * 0.5;
        triangles.push({
          type: 'triangle',
          ax: wallEdgeX + dir * 2,
          ay: y0,
          bx: wallEdgeX + dir * 2,
          by: y1,
          tx: wallEdgeX + dir * tipReach,
          ty: ym
        });
      }
      return triangles;
    }

    checkPointCollision(px, py, r) {
      if (py + r < this.topY || py - r > this.bottomY) {
        return false;
      }
      const triangles = this.getHitboxes();
      for (let i = 0; i < triangles.length; i++) {
        const t = triangles[i];
        if (circleTriangleOverlap(px, py, r, t.ax, t.ay, t.bx, t.by, t.tx, t.ty)) {
          return true;
        }
      }
      return false;
    }

    checkPlayerCollision(player) {
      return this.checkPointCollision(
        player.positionX,
        player.positionY,
        C.HITBOX.PLAYER_HURT_RADIUS
      );
    }

    checkNearMiss(player) {
      if (this._nearMissDone || !player.alive) return false;
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
      const sy = this.y - cameraY;
      if (sy + this.height < -40 || sy - this.height > C.HEIGHT + 40) return;

      const wallEdgeX = this.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const dir = this.side < 0 ? 1 : -1;
      const top = sy - this.height * 0.5;

      ctx.save();

      // Metal mounting strip along the wall edge
      ctx.fillStyle = C.COLORS.spikeBase;
      const mountW = 7;
      ctx.fillRect(
        this.side < 0 ? wallEdgeX - 2 : wallEdgeX - mountW + 2,
        top - 2,
        mountW,
        this.height + 4
      );

      // Individual sharp spikes
      const segH = this.height / this.spikeCount;
      for (let i = 0; i < this.spikeCount; i++) {
        const y0 = top + i * segH + 2;
        const y1 = top + (i + 1) * segH - 2;
        const ym = (y0 + y1) * 0.5;
        const baseX = wallEdgeX + dir * 3;
        const tipX = wallEdgeX + dir * this.protrusion;

        // Upper bright facet
        ctx.fillStyle = C.COLORS.spikeFill;
        ctx.beginPath();
        ctx.moveTo(baseX, y0);
        ctx.lineTo(tipX, ym);
        ctx.lineTo(baseX, ym);
        ctx.closePath();
        ctx.fill();

        // Lower shaded facet
        ctx.fillStyle = C.COLORS.spikeShade;
        ctx.beginPath();
        ctx.moveTo(baseX, ym);
        ctx.lineTo(tipX, ym);
        ctx.lineTo(baseX, y1);
        ctx.closePath();
        ctx.fill();

        // Crisp danger tip highlight
        ctx.fillStyle = C.COLORS.spikeTip;
        ctx.beginPath();
        ctx.moveTo(tipX - dir * 7, ym - 3.5);
        ctx.lineTo(tipX, ym);
        ctx.lineTo(tipX - dir * 7, ym + 3.5);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /**
   * 2. Active flame jet along a small section of a wall.
   */
  class FlameObstacle {
    constructor(side, y, height = 82) {
      this.type = 'flame';
      this.side = side;
      this.y = y;
      this.height = height;
      this.reach = 28;
      this.topY = y - height * 0.5;
      this.bottomY = y + height * 0.5;
      this.animTime = Math.random() * 10;
    }

    update(dt) {
      this.animTime += dt;
    }

    getHitboxes() {
      const hitDepth = this.reach - C.HITBOX.FLAME_INSET_X;
      const padY = C.HITBOX.FLAME_INSET_Y;
      const rx =
        this.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH - hitDepth;
      return [
        {
          type: 'rect',
          x: rx,
          y: this.y - this.height * 0.5 + padY,
          w: hitDepth,
          h: this.height - padY * 2
        }
      ];
    }

    checkPointCollision(px, py, r) {
      const box = this.getHitboxes()[0];
      return circleRectOverlap(px, py, r, box.x, box.y, box.w, box.h);
    }

    checkPlayerCollision(player) {
      return this.checkPointCollision(
        player.positionX,
        player.positionY,
        C.HITBOX.PLAYER_HURT_RADIUS
      );
    }

    checkNearMiss(player) {
      if (this._nearMissDone || !player.alive) return false;
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
      const sy = this.y - cameraY;
      if (sy + this.height < -40 || sy - this.height > C.HEIGHT + 40) return;

      const wallEdgeX = this.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const dir = this.side < 0 ? 1 : -1;
      const top = sy - this.height * 0.5;
      const t = this.animTime;

      ctx.save();

      // Warm glow cast onto nearby air
      const glowGrad = ctx.createLinearGradient(
        wallEdgeX,
        sy,
        wallEdgeX + dir * (this.reach + 16),
        sy
      );
      glowGrad.addColorStop(0, 'rgba(255, 90, 40, 0.35)');
      glowGrad.addColorStop(1, 'rgba(255, 90, 40, 0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(
        this.side < 0 ? wallEdgeX : wallEdgeX - (this.reach + 16),
        top - 8,
        this.reach + 16,
        this.height + 16
      );

      // Wall burner nozzle plate
      ctx.fillStyle = C.COLORS.flameMount;
      ctx.fillRect(wallEdgeX - 4, top - 2, 8, this.height + 4);

      // Draw 4 overlapping animated flame tongues
      const tongues = 4;
      const segH = this.height / tongues;
      for (let i = 0; i < tongues; i++) {
        const cy = top + (i + 0.5) * segH;
        const wave = Math.sin(t * 11 + i * 1.9);
        const wave2 = Math.cos(t * 15 + i * 2.7);
        const len = this.reach * (0.86 + wave * 0.16);
        const halfBase = segH * 0.62;
        const tipShiftY = wave2 * 3.5 - 2.5;

        // Outer red-orange tongue
        ctx.fillStyle = C.COLORS.flameOuter;
        ctx.beginPath();
        ctx.moveTo(wallEdgeX, cy - halfBase);
        ctx.quadraticCurveTo(
          wallEdgeX + dir * len * 0.55,
          cy - halfBase * 0.6 + tipShiftY * 0.5,
          wallEdgeX + dir * len,
          cy + tipShiftY
        );
        ctx.quadraticCurveTo(
          wallEdgeX + dir * len * 0.55,
          cy + halfBase * 0.6 + tipShiftY * 0.5,
          wallEdgeX,
          cy + halfBase
        );
        ctx.closePath();
        ctx.fill();

        // Mid vivid amber tongue
        ctx.fillStyle = C.COLORS.flameMid;
        ctx.beginPath();
        ctx.moveTo(wallEdgeX, cy - halfBase * 0.65);
        ctx.quadraticCurveTo(
          wallEdgeX + dir * len * 0.42,
          cy - halfBase * 0.35 + tipShiftY * 0.3,
          wallEdgeX + dir * len * 0.72,
          cy + tipShiftY * 0.7
        );
        ctx.quadraticCurveTo(
          wallEdgeX + dir * len * 0.42,
          cy + halfBase * 0.35 + tipShiftY * 0.3,
          wallEdgeX,
          cy + halfBase * 0.65
        );
        ctx.closePath();
        ctx.fill();

        // Bright white-gold core
        ctx.fillStyle = C.COLORS.flameCore;
        ctx.beginPath();
        ctx.moveTo(wallEdgeX, cy - halfBase * 0.34);
        ctx.lineTo(wallEdgeX + dir * len * 0.4, cy + tipShiftY * 0.35);
        ctx.lineTo(wallEdgeX, cy + halfBase * 0.34);
        ctx.closePath();
        ctx.fill();
      }

      // Floating tiny embers
      for (let i = 0; i < 3; i++) {
        const phase = (t * 1.4 + i * 0.37) % 1;
        const ex = wallEdgeX + dir * (8 + phase * (this.reach + 6));
        const ey = sy + (i - 1) * 18 - phase * 14 + Math.sin(t * 8 + i) * 3;
        ctx.globalAlpha = 1 - phase;
        ctx.fillStyle = C.COLORS.flameCore;
        ctx.beginPath();
        ctx.arc(ex, ey, 1.8 * (1 - phase * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /**
   * Arrow projectile fired horizontally across the arena.
   */
  class ArrowProjectile {
    constructor(x, y, dir, speed = 500) {
      this.x = x;
      this.y = y;
      this.dir = dir;
      this.speed = speed;
      this.length = 28;
      this.alive = true;
    }

    update(dt, context) {
      if (!this.alive) return;
      this.x += this.dir * this.speed * dt;

      const hitRight = this.dir > 0 && this.x >= C.WIDTH - C.WALL_WIDTH;
      const hitLeft = this.dir < 0 && this.x <= C.WALL_WIDTH;

      if (hitRight || hitLeft) {
        this.alive = false;
        const impactX = hitRight ? C.WIDTH - C.WALL_WIDTH : C.WALL_WIDTH;
        context.particles.spawnSparkBurst(impactX, this.y, -this.dir, '#ffd166', 6);
      }
    }

    getHitbox() {
      const inset = C.HITBOX.ARROW_LENGTH_INSET;
      const hh = C.HITBOX.ARROW_HALF_HEIGHT;
      const effectiveLen = Math.max(8, this.length - inset * 2);
      const rx = this.dir > 0 ? this.x - this.length + inset : this.x + inset;
      return {
        type: 'rect',
        x: rx,
        y: this.y - hh,
        w: effectiveLen,
        h: hh * 2
      };
    }

    checkPlayerCollision(player) {
      if (!this.alive) return false;
      const box = this.getHitbox();
      return circleRectOverlap(
        player.positionX,
        player.positionY,
        C.HITBOX.PLAYER_HURT_RADIUS,
        box.x,
        box.y,
        box.w,
        box.h
      );
    }

    checkNearMiss(player) {
      if (!this.alive || this._nearMissDone || !player.alive) return false;
      const box = this.getHitbox();
      const haloR = C.HITBOX.PLAYER_HURT_RADIUS + (C.HITBOX.CLOSE_CALL_MARGIN_PX || 11);
      const inHalo = circleRectOverlap(
        player.positionX,
        player.positionY,
        haloR,
        box.x,
        box.y,
        box.w,
        box.h
      );
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
      const sy = this.y - cameraY;
      if (sy < -40 || sy > C.HEIGHT + 40) return;

      const tailX = this.x - this.dir * this.length;
      const headX = this.x;

      ctx.save();

      // Faint speed streak
      const streakGrad = ctx.createLinearGradient(tailX - this.dir * 26, sy, headX, sy);
      streakGrad.addColorStop(0, 'rgba(255, 94, 87, 0)');
      streakGrad.addColorStop(1, 'rgba(255, 220, 140, 0.5)');
      ctx.strokeStyle = streakGrad;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(tailX - this.dir * 26, sy);
      ctx.lineTo(tailX, sy);
      ctx.stroke();

      // Arrow shaft
      ctx.strokeStyle = C.COLORS.arrowShaft;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailX, sy);
      ctx.lineTo(headX - this.dir * 6, sy);
      ctx.stroke();

      // Fletching feathers
      ctx.strokeStyle = C.COLORS.arrowTip;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tailX + this.dir * 4, sy);
      ctx.lineTo(tailX - this.dir * 3, sy - 4.5);
      ctx.moveTo(tailX + this.dir * 4, sy);
      ctx.lineTo(tailX - this.dir * 3, sy + 4.5);
      ctx.stroke();

      // Sharp crimson tip
      ctx.fillStyle = C.COLORS.arrowTip;
      ctx.beginPath();
      ctx.moveTo(headX + this.dir * 3, sy);
      ctx.lineTo(headX - this.dir * 8, sy - 5.5);
      ctx.lineTo(headX - this.dir * 6, sy);
      ctx.lineTo(headX - this.dir * 8, sy + 5.5);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  /**
   * 3. Wall-mounted mechanism firing timed arrows with a clear telegraph warning.
   */
  class ArrowShooter {
    constructor(side, y, cycleDuration = 2.65, phaseOffset = 0) {
      this.type = 'arrowShooter';
      this.side = side;
      this.y = y;
      this.height = 36;
      this.topY = y - 18;
      this.bottomY = y + 18;

      this.cycleDuration = cycleDuration;
      this.warningDuration = 0.85;
      this.timer = phaseOffset % cycleDuration;
      this.arrowSpeed = 500;
    }

    _isInActiveView(cameraY) {
      const sy = this.y - cameraY;
      return sy >= -45 && sy <= C.HEIGHT + 45;
    }

    getHitboxes() {
      return [];
    }

    update(dt, context) {
      if (!this._isInActiveView(context.cameraY)) {
        const holdPoint = Math.max(0, this.cycleDuration - this.warningDuration - 0.35);
        if (this.timer > holdPoint) {
          this.timer = holdPoint * 0.65;
        }
        return;
      }

      this.timer += dt;
      if (this.timer >= this.cycleDuration) {
        this.timer -= this.cycleDuration;
        const dir = this.side < 0 ? 1 : -1;
        const spawnX =
          this.side < 0 ? C.WALL_WIDTH + 6 : C.WIDTH - C.WALL_WIDTH - 6;
        context.projectiles.push(
          new ArrowProjectile(spawnX, this.y, dir, this.arrowSpeed)
        );
        context.particles.spawnSparkBurst(spawnX, this.y, dir, '#ff9f43', 4);
        context.audio.playArrowFire();
      }
    }

    checkPlayerCollision() {
      return false;
    }

    draw(ctx, cameraY) {
      const sy = this.y - cameraY;
      if (sy < -50 || sy > C.HEIGHT + 50) return;

      const wallEdgeX = this.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const dir = this.side < 0 ? 1 : -1;
      const timeLeft = this.cycleDuration - this.timer;
      const isWarning = timeLeft <= this.warningDuration;
      const warnProgress = isWarning
        ? 1 - timeLeft / this.warningDuration
        : 0;
      const chargeRatio = Math.min(
        1,
        this.timer / (this.cycleDuration - this.warningDuration)
      );

      ctx.save();

      if (isWarning) {
        const oppX = this.side < 0 ? C.WIDTH - C.WALL_WIDTH : C.WALL_WIDTH;
        const pulse = 0.45 + 0.55 * Math.abs(Math.sin(warnProgress * Math.PI * 5));
        const urgent = warnProgress > 0.68;

        ctx.save();
        ctx.strokeStyle = urgent
          ? `rgba(255, 85, 95, ${0.45 + 0.4 * pulse})`
          : `rgba(255, 175, 64, ${0.24 + 0.35 * pulse})`;
        ctx.lineWidth = urgent ? 2.4 : 1.6;
        ctx.setLineDash(urgent ? [10, 6] : [6, 8]);
        ctx.beginPath();
        ctx.moveTo(wallEdgeX + dir * 10, sy);
        ctx.lineTo(oppX, sy);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.strokeStyle = urgent ? '#ff4757' : '#ffa502';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6 + 0.4 * pulse;
        ctx.beginPath();
        ctx.arc(wallEdgeX + dir * 16, sy, 6 + (1 - warnProgress) * 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      const boxW = 18;
      const boxH = 30;
      const boxX = this.side < 0 ? wallEdgeX - 10 : wallEdgeX - 8;
      const boxY = sy - boxH * 0.5;

      ctx.fillStyle = C.COLORS.turretBody;
      ctx.strokeStyle = isWarning ? C.COLORS.turretWarning : C.COLORS.turretBorder;
      ctx.lineWidth = 2;
      fillStrokeRoundRect(ctx, boxX, boxY, boxW, boxH, 5);

      const ledColor = isWarning ? '#ff4757' : '#4ecdc4';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(
        this.side < 0 ? wallEdgeX - 6 : wallEdgeX + 2,
        sy - 9,
        4,
        18
      );
      ctx.fillStyle = ledColor;
      const fillH = isWarning ? 18 : 18 * chargeRatio;
      ctx.fillRect(
        this.side < 0 ? wallEdgeX - 6 : wallEdgeX + 2,
        sy + 9 - fillH,
        4,
        fillH
      );

      if (isWarning) {
        const pullBack = Math.sin(warnProgress * Math.PI * 0.5) * 4;
        const tipX = wallEdgeX + dir * (11 - pullBack);
        ctx.fillStyle = C.COLORS.arrowTip;
        ctx.beginPath();
        ctx.moveTo(tipX + dir * 5, sy);
        ctx.lineTo(tipX - dir * 4, sy - 4);
        ctx.lineTo(tipX - dir * 4, sy + 4);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /**
   * 4. Ice Wall Surface: Player sticks but slides downward along the frosted crystal slab.
   */
  class IceWallSurface {
    constructor(side, y, height = 108) {
      this.type = 'iceWall';
      this.isSurface = true;
      this.side = side;
      this.y = y;
      this.height = height;
      this.topY = y - height * 0.5;
      this.bottomY = y + height * 0.5;
    }

    update() {}
    getHitboxes() { return []; }
    checkPlayerCollision() { return false; }
    checkNearMiss() { return false; }

    containsWallPoint(side, py) {
      return this.side === side && py >= this.topY && py <= this.bottomY;
    }

    draw(ctx, cameraY) {
      const sy = this.y - cameraY;
      if (sy + this.height < -40 || sy - this.height > C.HEIGHT + 40) return;

      const wallEdgeX = this.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const top = sy - this.height * 0.5;
      const x = this.side < 0 ? wallEdgeX - 8 : wallEdgeX - 2;

      ctx.save();
      const grad = ctx.createLinearGradient(x, top, x + 10, top + this.height);
      grad.addColorStop(0, '#b8f2ff');
      grad.addColorStop(0.5, '#48dbfb');
      grad.addColorStop(1, '#0abde3');
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      fillStrokeRoundRect(ctx, x, top, 10, this.height, 4);

      // Diagonal frost sheen lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 14; i < this.height - 10; i += 22) {
        ctx.moveTo(x + 2, top + i);
        ctx.lineTo(x + 8, top + i - 7);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * 5. Elastic Bounce Pad Surface: Ricochets the player immediately across and upward!
   */
  class BouncePadSurface {
    constructor(side, y, height = 76) {
      this.type = 'bouncePad';
      this.isSurface = true;
      this.side = side;
      this.y = y;
      this.height = height;
      this.topY = y - height * 0.5;
      this.bottomY = y + height * 0.5;
      this.bounceAnim = 0;
      this.hitRelY = 0;
    }

    update(dt) {
      if (this.bounceAnim > 0) {
        this.bounceAnim = Math.max(0, this.bounceAnim - dt * 4.5);
      }
    }

    getHitboxes() { return []; }
    checkPlayerCollision() { return false; }
    checkNearMiss() { return false; }

    containsWallPoint(side, py) {
      return this.side === side && py >= this.topY - 8 && py <= this.bottomY + 8;
    }

    triggerBounce(hitWorldY) {
      this.bounceAnim = 1;
      this.hitRelY =
        typeof hitWorldY === 'number'
          ? Math.max(-this.height * 0.34, Math.min(this.height * 0.34, hitWorldY - this.y))
          : 0;
    }

    draw(ctx, cameraY) {
      const sy = this.y - cameraY;
      if (sy + this.height < -40 || sy - this.height > C.HEIGHT + 40) return;

      const wallEdgeX = this.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const dir = this.side < 0 ? 1 : -1;
      const top = sy - this.height * 0.5;
      const bot = sy + this.height * 0.5;
      // Elastic concave-then-rebound displacement centered on actual impact Y
      const wave = -Math.sin(this.bounceAnim * Math.PI * 2.5) * 9 * this.bounceAnim;
      const padThick = 11 + wave * 0.45;
      const flexX = wallEdgeX + dir * Math.max(5, 11 + wave * 1.1);
      const hitY = sy + this.hitRelY * 0.7;

      ctx.save();
      // Base mount
      ctx.fillStyle = '#2d1b4e';
      ctx.fillRect(wallEdgeX - 4, top, 8, this.height);

      // Dynamic curved trampoline membrane flexing cleanly at hit point
      const xBase = wallEdgeX;
      const xFace = wallEdgeX + dir * Math.max(6, padThick);
      const grad = ctx.createLinearGradient(xBase, top, xFace, top);
      grad.addColorStop(0, '#be2edd');
      grad.addColorStop(1, '#ff79c6');
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#ffd6ff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(xBase, top + 3);
      ctx.lineTo(xFace, top + 6);
      ctx.quadraticCurveTo(flexX, hitY, xFace, bot - 6);
      ctx.lineTo(xBase, bot - 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Outward chevron arrows
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const chevX = wallEdgeX + dir * (padThick + 7);
      ctx.beginPath();
      ctx.moveTo(chevX - dir * 4, sy - 6);
      ctx.lineTo(chevX, sy);
      ctx.lineTo(chevX - dir * 4, sy + 6);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * 6. Cracked Stone Wall Surface: Crumbles 1.25s after player attaches, forcing quick tempo!
   */
  class CrackedWallSurface {
    constructor(side, y, height = 88) {
      this.type = 'crackedWall';
      this.isSurface = true;
      this.side = side;
      this.y = y;
      this.height = height;
      this.topY = y - height * 0.5;
      this.bottomY = y + height * 0.5;
      this.crackTimer = 0;
      this.broken = false;
      this.regenTimer = 0;
    }

    update(dt) {
      if (this.broken) {
        this.regenTimer += dt;
        if (this.regenTimer >= 3.0) {
          this.broken = false;
          this.crackTimer = 0;
          this.regenTimer = 0;
        }
      } else if (this.crackTimer > 0) {
        this.crackTimer = Math.max(0, this.crackTimer - dt * 0.35);
      }
    }

    getHitboxes() { return []; }
    checkPlayerCollision() { return false; }
    checkNearMiss() { return false; }

    containsWallPoint(side, py) {
      return !this.broken && this.side === side && py >= this.topY && py <= this.bottomY;
    }

    draw(ctx, cameraY) {
      const sy = this.y - cameraY;
      if (sy + this.height < -40 || sy - this.height > C.HEIGHT + 40) return;

      const wallEdgeX = this.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const top = sy - this.height * 0.5;
      const duration = (C.SURFACES && C.SURFACES.CRACK_DURATION) || 1.25;
      const ratio = Math.min(1, this.crackTimer / duration);

      ctx.save();
      if (this.broken) {
        ctx.globalAlpha = 0.25;
      }

      const shake = ratio > 0.15 ? (Math.random() - 0.5) * 3 * ratio : 0;
      const x = (this.side < 0 ? wallEdgeX - 8 : wallEdgeX - 2) + shake;

      ctx.fillStyle = '#5c4028';
      ctx.strokeStyle = ratio > 0.2 ? '#ffb703' : '#8c6239';
      ctx.lineWidth = 1.5;
      fillStrokeRoundRect(ctx, x, top, 10, this.height, 3);

      // Jagged crack lines
      ctx.strokeStyle = ratio > 0.2 ? '#ffd166' : '#26170c';
      ctx.lineWidth = 1.5 + ratio * 1.2;
      ctx.beginPath();
      ctx.moveTo(x + 2, top + 16);
      ctx.lineTo(x + 7, top + 28);
      ctx.lineTo(x + 3, top + 42);
      ctx.moveTo(x + 8, top + 54);
      ctx.lineTo(x + 2, top + 68);
      ctx.stroke();

      ctx.restore();
    }
  }

  /**
   * 7. Mid-Shaft Swinging Spiked Saw Pendulum (unlocks ~250m+): crosses center air channel on visible rail.
   */
  class PendulumSawObstacle {
    constructor(y, amplitude = 98, speed = 1.85, phase = 0) {
      this.type = 'pendulumSaw';
      this.side = 0;
      this.y = y;
      this.height = 46;
      this.topY = y - 23;
      this.bottomY = y + 23;
      this.amplitude = amplitude;
      this.speed = speed;
      this.phase = phase;
      this.time = 0;
      this.spin = 0;
      this.radius = 17;
      this.hurtRadius = 13.5;
      this.x = C.WIDTH * 0.5 + Math.sin(phase) * amplitude;
      this._wasInHalo = false;
      this._nearMissDone = false;
    }

    update(dt) {
      this.time += dt;
      this.spin += dt * 4.6;
      this.x = C.WIDTH * 0.5 + Math.sin(this.time * this.speed + this.phase) * this.amplitude;
    }

    getHitboxes() {
      return [{ type: 'circle', x: this.x, y: this.y, r: this.hurtRadius }];
    }

    checkPointCollision(px, py, r) {
      const dx = px - this.x;
      const dy = py - this.y;
      const sum = this.hurtRadius + r;
      return dx * dx + dy * dy <= sum * sum;
    }

    checkPlayerCollision(player) {
      return this.checkPointCollision(player.positionX, player.positionY, C.HITBOX.PLAYER_HURT_RADIUS);
    }

    checkNearMiss(player) {
      if (this._nearMissDone || !player.alive) return false;
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
      const sy = this.y - cameraY;
      if (sy < -60 || sy > C.HEIGHT + 60) return;

      const minRailX = C.WIDTH * 0.5 - this.amplitude;
      const maxRailX = C.WIDTH * 0.5 + this.amplitude;

      ctx.save();
      // Dotted guide rail showing exact horizontal swing path
      ctx.strokeStyle = 'rgba(255, 130, 90, 0.22)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.moveTo(minRailX, sy);
      ctx.lineTo(maxRailX, sy);
      ctx.stroke();
      ctx.setLineDash([]);

      for (const endX of [minRailX, maxRailX]) {
        ctx.fillStyle = '#3d2838';
        ctx.beginPath();
        ctx.arc(endX, sy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Rotating spiked ember core
      ctx.translate(this.x, sy);
      ctx.rotate(this.spin);

      const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, this.radius + 10);
      glow.addColorStop(0, 'rgba(255, 94, 54, 0.45)');
      glow.addColorStop(1, 'rgba(255, 94, 54, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 10, 0, Math.PI * 2);
      ctx.fill();

      const teeth = 8;
      ctx.fillStyle = '#e8eef7';
      ctx.strokeStyle = '#18101c';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i / (teeth * 2)) * Math.PI * 2;
        const rad = i % 2 === 0 ? this.radius + 3 : this.radius - 3.5;
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ff4757';
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
  }

  /**
   * 8. Rhythmic Wall-to-Wall Plasma Laser Gate (unlocks ~500m+): clear warning pulse before firing.
   */
  class LaserGateObstacle {
    constructor(y, cycleDuration = 3.5, phaseOffset = 0) {
      this.type = 'laserGate';
      this.side = 0;
      this.y = y;
      this.height = 30;
      this.topY = y - 15;
      this.bottomY = y + 15;
      this.cycleDuration = cycleDuration;
      this.warningStart = 1.25;
      this.activeStart = 2.4;
      this.timer = phaseOffset % cycleDuration;
      this.beamHalfH = 6.5;
      this._wasActive = false;
      this._wasInHalo = false;
      this._nearMissDone = false;
    }

    _getPhaseState() {
      if (this.timer >= this.activeStart) return 'active';
      if (this.timer >= this.warningStart) return 'warning';
      return 'dormant';
    }

    _isInActiveView(cameraY) {
      const sy = this.y - cameraY;
      return sy >= -45 && sy <= C.HEIGHT + 45;
    }

    update(dt, context) {
      if (!this._isInActiveView(context.cameraY)) {
        if (this.timer > this.warningStart - 0.25) {
          this.timer = 0.5;
        }
        this._wasActive = false;
        return;
      }

      this.timer += dt;
      if (this.timer >= this.cycleDuration) {
        this.timer -= this.cycleDuration;
        this._nearMissDone = false;
      }

      const nowActive = this._getPhaseState() === 'active';
      if (nowActive && !this._wasActive) {
        if (context && context.audio && context.audio.playLaserBeam) {
          context.audio.playLaserBeam();
        }
      }
      this._wasActive = nowActive;
    }

    getHitboxes() {
      if (this._getPhaseState() !== 'active') return [];
      return [
        {
          type: 'rect',
          x: C.WALL_WIDTH,
          y: this.y - this.beamHalfH,
          w: C.WIDTH - C.WALL_WIDTH * 2,
          h: this.beamHalfH * 2
        }
      ];
    }

    checkPointCollision(px, py, r) {
      const st = this._getPhaseState();
      const urgentWarn = st === 'warning' && this.timer >= this.activeStart - 0.45;
      if (st !== 'active' && !urgentWarn) return false;
      return circleRectOverlap(
        px,
        py,
        r,
        C.WALL_WIDTH,
        this.y - this.beamHalfH,
        C.WIDTH - C.WALL_WIDTH * 2,
        this.beamHalfH * 2
      );
    }

    checkPlayerCollision(player) {
      if (this._getPhaseState() !== 'active') return false;
      return circleRectOverlap(
        player.positionX,
        player.positionY,
        C.HITBOX.PLAYER_HURT_RADIUS,
        C.WALL_WIDTH,
        this.y - this.beamHalfH,
        C.WIDTH - C.WALL_WIDTH * 2,
        this.beamHalfH * 2
      );
    }

    checkNearMiss(player) {
      if (this._nearMissDone || this._getPhaseState() !== 'active' || !player.alive) return false;
      const haloR = C.HITBOX.PLAYER_HURT_RADIUS + (C.HITBOX.CLOSE_CALL_MARGIN_PX || 11);
      const inHalo =
        !player.isAttached() &&
        circleRectOverlap(
          player.positionX,
          player.positionY,
          haloR,
          C.WALL_WIDTH,
          this.y - this.beamHalfH,
          C.WIDTH - C.WALL_WIDTH * 2,
          this.beamHalfH * 2
        );
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
      const sy = this.y - cameraY;
      if (sy < -50 || sy > C.HEIGHT + 50) return;

      const st = this._getPhaseState();
      const leftX = C.WALL_WIDTH;
      const rightX = C.WIDTH - C.WALL_WIDTH;

      ctx.save();
      if (st === 'warning') {
        const prog = (this.timer - this.warningStart) / (this.activeStart - this.warningStart);
        const pulse = 0.45 + 0.55 * Math.abs(Math.sin(prog * Math.PI * 6));
        ctx.strokeStyle = `rgba(255, 165, 2, ${0.35 + 0.55 * pulse})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(leftX, sy);
        ctx.lineTo(rightX, sy);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (st === 'active') {
        const beamH = this.beamHalfH * 2 + Math.sin(this.timer * 38) * 1.8;
        ctx.fillStyle = 'rgba(255, 71, 126, 0.32)';
        ctx.fillRect(leftX, sy - beamH * 0.9, rightX - leftX, beamH * 1.8);

        ctx.fillStyle = '#ff477e';
        ctx.fillRect(leftX, sy - beamH * 0.45, rightX - leftX, beamH * 0.9);

        ctx.fillStyle = '#fff5f8';
        ctx.fillRect(leftX, sy - 2, rightX - leftX, 4);
      }

      // Left & right emitter caps
      for (const side of [-1, 1]) {
        const mx = side < 0 ? leftX - 6 : rightX - 4;
        ctx.fillStyle = '#25324c';
        ctx.strokeStyle = st === 'active' ? '#ff477e' : st === 'warning' ? '#ffa502' : '#4c6288';
        ctx.lineWidth = 1.8;
        fillStrokeRoundRect(ctx, mx, sy - 11, 10, 22, 4);

        ctx.fillStyle = st === 'active' ? '#ff477e' : st === 'warning' ? '#ffd166' : '#48dbfb';
        ctx.beginPath();
        ctx.arc(side < 0 ? leftX + 2 : rightX - 2, sy, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /**
   * 9. Beneficial Mid-Shaft Updraft Wind Vortex (unlocks ~500m+): launches airborne Jelly smoothly upward!
   */
  class WindVortexSurface {
    constructor(x, y, radius = 29) {
      this.type = 'windVortex';
      this.isSurface = true;
      this.side = 0;
      this.x = x;
      this.y = y;
      this.radius = radius;
      this.height = radius * 2;
      this.topY = y - radius;
      this.bottomY = y + radius;
      this.spin = Math.random() * Math.PI * 2;
      this.cooldown = 0;
    }

    update(dt) {
      this.spin += dt * 4.2;
      if (this.cooldown > 0) {
        this.cooldown = Math.max(0, this.cooldown - dt);
      }
    }

    getHitboxes() { return []; }
    checkPlayerCollision() { return false; }
    checkNearMiss() { return false; }
    containsWallPoint() { return false; }

    checkPlayerTrigger(player) {
      if (this.cooldown > 0 || player.isAttached() || !player.alive) return false;
      const dx = player.positionX - this.x;
      const dy = player.positionY - this.y;
      const reach = this.radius + player.radius * 0.75;
      if (dx * dx + dy * dy <= reach * reach) {
        this.cooldown = 0.55;
        return true;
      }
      return false;
    }

    draw(ctx, cameraY) {
      const sy = this.y - cameraY;
      if (sy < -60 || sy > C.HEIGHT + 60) return;

      ctx.save();
      ctx.translate(this.x, sy);

      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, this.radius + 6);
      g.addColorStop(0, 'rgba(116, 242, 255, 0.34)');
      g.addColorStop(0.65, 'rgba(54, 245, 176, 0.16)');
      g.addColorStop(1, 'rgba(54, 245, 176, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#74f2ff';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const ang = this.spin + i * Math.PI;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.76, ang, ang + Math.PI * 0.68);
        ctx.stroke();
      }

      // Upward wind chevron inside ring
      const bob = Math.sin(this.spin * 1.5) * 3;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-8, 4 + bob);
      ctx.lineTo(0, -5 + bob);
      ctx.lineTo(8, 4 + bob);
      ctx.moveTo(-6, 10 + bob);
      ctx.lineTo(0, 3 + bob);
      ctx.lineTo(6, 10 + bob);
      ctx.stroke();

      ctx.restore();
    }
  }

  JellyGame.Obstacles = {
    SpikeObstacle,
    FlameObstacle,
    ArrowShooter,
    ArrowProjectile,
    IceWallSurface,
    BouncePadSurface,
    CrackedWallSurface,
    PendulumSawObstacle,
    LaserGateObstacle,
    WindVortexSurface
  };
})(window);
