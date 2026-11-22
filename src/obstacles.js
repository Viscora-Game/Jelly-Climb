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
    const rad = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, rad);
    } else {
      ctx.moveTo(x + rad, y);
      ctx.lineTo(x + w - rad, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
      ctx.lineTo(x + w, y + h - rad);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
      ctx.lineTo(x + rad, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
      ctx.lineTo(x, y + rad);
      ctx.quadraticCurveTo(x, y, x + rad, y);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
  }

  // Biome-harmonized material & hazard accent palettes preserving instant danger readability
  const BIOME_OBS_PALETTES = Object.freeze({
    cavern: {
      mount: '#4d3a6b',
      mountHi: '#745a9e',
      rivet: '#ffd166',
      bladeHi: '#f8f2e8',
      bladeLo: '#bfb2d1',
      dangerTip: '#ff4d6d',
      flameOut: '#ff4d3d',
      flameMid: '#ff9b26',
      flameCore: '#fff6a8',
      flameGlow: 'rgba(255, 110, 48, 0.28)',
      stoneTop: '#a67c52',
      stoneBot: '#6e4c32',
      beamMain: '#ff477e',
      beamGlow: 'rgba(255, 71, 126, 0.34)',
      orbBody: '#4d3a6b',
      orbEye: '#ff5268',
      crusherTop: '#7a5d9e',
      crusherBot: '#463166',
      crusherGem: '#ff5e78'
    },
    valley: {
      mount: '#4a3273',
      mountHi: '#7855b0',
      rivet: '#ffd166',
      bladeHi: '#f7f0ff',
      bladeLo: '#bba6de',
      dangerTip: '#ff4d6d',
      flameOut: '#ff4d3d',
      flameMid: '#ff9b26',
      flameCore: '#fff6a8',
      flameGlow: 'rgba(255, 110, 48, 0.28)',
      stoneTop: '#8e68b3',
      stoneBot: '#533873',
      beamMain: '#ff477e',
      beamGlow: 'rgba(255, 71, 126, 0.34)',
      orbBody: '#4d3478',
      orbEye: '#ff5268',
      crusherTop: '#7e59b5',
      crusherBot: '#462d6e',
      crusherGem: '#ff5e78'
    },
    slime: {
      mount: '#1b5949',
      mountHi: '#349478',
      rivet: '#9eff63',
      bladeHi: '#e8fff0',
      bladeLo: '#8ed6b3',
      dangerTip: '#ff4f79',
      flameOut: '#16c978',
      flameMid: '#7dff6b',
      flameCore: '#efffc2',
      flameGlow: 'rgba(86, 255, 154, 0.28)',
      stoneTop: '#2e8767',
      stoneBot: '#184d3d',
      beamMain: '#42ff8d',
      beamGlow: 'rgba(66, 255, 141, 0.32)',
      orbBody: '#1e6350',
      orbEye: '#ff5274',
      crusherTop: '#2d8267',
      crusherBot: '#14473a',
      crusherGem: '#9eff63'
    },
    desert: {
      mount: '#8a4622',
      mountHi: '#cf7c3a',
      rivet: '#ffe68c',
      bladeHi: '#fff5db',
      bladeLo: '#d9b57e',
      dangerTip: '#e63946',
      flameOut: '#ff4526',
      flameMid: '#ffa226',
      flameCore: '#fff7bd',
      flameGlow: 'rgba(255, 130, 45, 0.3)',
      stoneTop: '#d48b48',
      stoneBot: '#8c4e24',
      beamMain: '#ff6b2b',
      beamGlow: 'rgba(255, 107, 43, 0.35)',
      orbBody: '#964e24',
      orbEye: '#52ff9b',
      crusherTop: '#de9545',
      crusherBot: '#8f4c1e',
      crusherGem: '#52ff9b'
    },
    foundry: {
      mount: '#451d26',
      mountHi: '#7d3439',
      rivet: '#ffb84d',
      bladeHi: '#ffeae0',
      bladeLo: '#bd8a8a',
      dangerTip: '#ff3b30',
      flameOut: '#ff3b30',
      flameMid: '#ff9526',
      flameCore: '#fff7ad',
      flameGlow: 'rgba(255, 96, 36, 0.34)',
      stoneTop: '#6b2e33',
      stoneBot: '#38151d',
      beamMain: '#ff4d2e',
      beamGlow: 'rgba(255, 77, 46, 0.36)',
      orbBody: '#4a1d26',
      orbEye: '#ffd147',
      crusherTop: '#783238',
      crusherBot: '#3d161e',
      crusherGem: '#ff9f43'
    },
    frost: {
      mount: '#23587a',
      mountHi: '#53a5cc',
      rivet: '#d4fbff',
      bladeHi: '#f0fdff',
      bladeLo: '#8fd2eb',
      dangerTip: '#ff4d7e',
      flameOut: '#ff5277',
      flameMid: '#ff9eb5',
      flameCore: '#fff5f8',
      flameGlow: 'rgba(255, 90, 140, 0.28)',
      stoneTop: '#4c9cc2',
      stoneBot: '#245878',
      beamMain: '#ff5c93',
      beamGlow: 'rgba(255, 92, 147, 0.34)',
      orbBody: '#27658a',
      orbEye: '#ff5280',
      crusherTop: '#5cb4db',
      crusherBot: '#225475',
      crusherGem: '#ff5e8c'
    },
    storm: {
      mount: '#283f6b',
      mountHi: '#4f76b3',
      rivet: '#ffe875',
      bladeHi: '#ecf8ff',
      bladeLo: '#99b8db',
      dangerTip: '#ff4d6d',
      flameOut: '#2b95ff',
      flameMid: '#74f2ff',
      flameCore: '#ffffff',
      flameGlow: 'rgba(72, 219, 251, 0.34)',
      stoneTop: '#496da3',
      stoneBot: '#253961',
      beamMain: '#48dbfb',
      beamGlow: 'rgba(72, 219, 251, 0.36)',
      orbBody: '#2b4778',
      orbEye: '#ffe875',
      crusherTop: '#4d73b0',
      crusherBot: '#223863',
      crusherGem: '#ffe875'
    },
    cosmos: {
      mount: '#36216e',
      mountHi: '#6b47ba',
      rivet: '#ffd147',
      bladeHi: '#f8ebff',
      bladeLo: '#ba99e3',
      dangerTip: '#ff477e',
      flameOut: '#c54bff',
      flameMid: '#ff70c8',
      flameCore: '#fff5ff',
      flameGlow: 'rgba(214, 102, 255, 0.34)',
      stoneTop: '#6444ad',
      stoneBot: '#321e63',
      beamMain: '#e056fd',
      beamGlow: 'rgba(224, 86, 253, 0.36)',
      orbBody: '#3b2478',
      orbEye: '#ffd147',
      crusherTop: '#6c49ba',
      crusherBot: '#301d63',
      crusherGem: '#ffd147'
    },
    heaven: {
      mount: '#c7a46b',
      mountHi: '#fff5d6',
      rivet: '#ffd147',
      bladeHi: '#ffffff',
      bladeLo: '#e3d5ba',
      dangerTip: '#ff5263',
      flameOut: '#ff7b36',
      flameMid: '#ffd147',
      flameCore: '#ffffff',
      flameGlow: 'rgba(255, 212, 92, 0.38)',
      stoneTop: '#f5ebd6',
      stoneBot: '#bfa67a',
      beamMain: '#ff9f43',
      beamGlow: 'rgba(255, 196, 72, 0.42)',
      orbBody: '#e8d7b7',
      orbEye: '#ff5263',
      crusherTop: '#fff5dc',
      crusherBot: '#bfa26d',
      crusherGem: '#ff5e6c'
    }
  });

  function getObsPal(theme) {
    const k = typeof theme === 'string' ? theme : theme && theme.key ? theme.key : 'cavern';
    return BIOME_OBS_PALETTES[k] || BIOME_OBS_PALETTES.cavern;
  }

  /**
   * 1. Fixed wall spikes with exact per-tooth triangle hitboxes & biome-crafted fangs.
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

    draw(ctx, cameraY, theme) {
      const sy = this.y - cameraY;
      if (!JellyGame.isScreenYVisible(sy, 40 + this.height)) return;

      const pal = getObsPal(theme);
      const wallEdgeX = this.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const dir = this.side < 0 ? 1 : -1;
      const top = sy - this.height * 0.5;
      const ink = C.COLORS.ink || '#1b1136';

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Sculpted biome-colored riveted iron mounting bracket
      const mountW = 10;
      const mx = this.side < 0 ? wallEdgeX - 4 : wallEdgeX - mountW + 4;
      const mGrad = ctx.createLinearGradient(mx, top, mx + mountW, top);
      mGrad.addColorStop(0, this.side < 0 ? pal.mount : pal.mountHi);
      mGrad.addColorStop(1, this.side < 0 ? pal.mountHi : pal.mount);
      ctx.fillStyle = mGrad;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.3;
      fillStrokeRoundRect(ctx, mx, top - 3, mountW, this.height + 6, 4);

      // End-cap brass/gold rivets on mounting plate
      for (const ry of [top + 4, top + this.height - 4]) {
        ctx.fillStyle = pal.rivet;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(mx + mountW * 0.5, ry, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Individual cel-shaded curved cartoon blades with glossy ridge & vivid danger tip
      const segH = this.height / this.spikeCount;
      for (let i = 0; i < this.spikeCount; i++) {
        const y0 = top + i * segH + 1.5;
        const y1 = top + (i + 1) * segH - 1.5;
        const ym = (y0 + y1) * 0.5;
        const baseX = wallEdgeX + dir * 3.5;
        const tipX = wallEdgeX + dir * this.protrusion;
        const midX = (baseX + tipX) * 0.5;

        const traceBlade = () => {
          ctx.beginPath();
          ctx.moveTo(baseX, y0);
          ctx.quadraticCurveTo(midX, y0 + (ym - y0) * 0.35, tipX, ym);
          ctx.quadraticCurveTo(midX, y1 - (y1 - ym) * 0.35, baseX, y1);
          ctx.closePath();
        };

        // Shaded base fill
        ctx.fillStyle = pal.bladeLo;
        traceBlade();
        ctx.fill();

        // Bright upper facet & vivid crimson danger tip clipped cleanly inside blade
        ctx.save();
        traceBlade();
        if (typeof ctx.clip === 'function') ctx.clip();
        ctx.fillStyle = pal.bladeHi;
        ctx.beginPath();
        ctx.moveTo(baseX - dir * 2, y0 - 2);
        ctx.lineTo(tipX + dir * 2, ym);
        ctx.lineTo(baseX - dir * 2, ym + 0.5);
        ctx.closePath();
        ctx.fill();

        // Crisp danger tip glaze
        ctx.fillStyle = pal.dangerTip;
        ctx.beginPath();
        ctx.moveTo(tipX - dir * 8.5, y0);
        ctx.lineTo(tipX + dir * 2, ym);
        ctx.lineTo(tipX - dir * 8.5, y1);
        ctx.quadraticCurveTo(tipX - dir * 6, ym, tipX - dir * 8.5, y0);
        ctx.closePath();
        ctx.fill();

        // Tiny specular glint streak along upper blade bevel
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(baseX + dir * 2.5, y0 + 4.2);
        ctx.lineTo(tipX - dir * 7.5, ym - 1.8);
        ctx.stroke();
        ctx.restore();

        // Bold cartoon ink contour
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.3;
        traceBlade();
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  /**
   * 2. Active biome-tinted flame / acid / solar jet along a wall furnace vent.
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

    draw(ctx, cameraY, theme) {
      const sy = this.y - cameraY;
      if (!JellyGame.isScreenYVisible(sy, 40 + this.height)) return;

      const pal = getObsPal(theme);
      const wallEdgeX = this.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const dir = this.side < 0 ? 1 : -1;
      const top = sy - this.height * 0.5;
      const t = this.animTime;
      const ink = C.COLORS.ink || '#1b1136';

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Atmospheric biome glow cast onto nearby shaft air
      const glowGrad = ctx.createLinearGradient(
        wallEdgeX,
        sy,
        wallEdgeX + dir * (this.reach + 18),
        sy
      );
      glowGrad.addColorStop(0, pal.flameGlow);
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(
        this.side < 0 ? wallEdgeX : wallEdgeX - (this.reach + 18),
        top - 8,
        this.reach + 18,
        this.height + 16
      );

      // Sculpted riveted cartoon furnace-grate burner housing
      const mx = this.side < 0 ? wallEdgeX - 6 : wallEdgeX - 5;
      const mGrad = ctx.createLinearGradient(mx, top, mx + 11, top);
      mGrad.addColorStop(0, pal.mount);
      mGrad.addColorStop(0.6, pal.mountHi);
      mGrad.addColorStop(1, pal.mount);
      ctx.fillStyle = mGrad;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.3;
      fillStrokeRoundRect(ctx, mx, top - 3, 11, this.height + 6, 4);

      // Top & bottom bolted furnace caps
      for (const capY of [top - 4, top + this.height - 4]) {
        ctx.fillStyle = pal.rivet;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.8;
        fillStrokeRoundRect(ctx, mx - 1.5, capY, 14, 8, 3);
      }

      // Draw 4 overlapping comic-inked cartoon flame tongues
      const tongues = 4;
      const segH = this.height / tongues;
      for (let i = 0; i < tongues; i++) {
        const cy = top + (i + 0.5) * segH;
        const wave = Math.sin(t * 11 + i * 1.9);
        const wave2 = Math.cos(t * 15 + i * 2.7);
        const len = this.reach * (0.86 + wave * 0.16);
        const halfBase = segH * 0.62;
        const tipShiftY = wave2 * 3.5 - 2.2;

        // Glowing nozzle slit on grate
        ctx.fillStyle = pal.flameCore;
        ctx.fillRect(wallEdgeX + (this.side < 0 ? -1 : -3), cy - 4, 4, 8);

        // Outer inked flame body
        ctx.fillStyle = pal.flameOut;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(wallEdgeX + dir * 2, cy - halfBase);
        ctx.quadraticCurveTo(
          wallEdgeX + dir * len * 0.58,
          cy - halfBase * 0.68 + tipShiftY * 0.5,
          wallEdgeX + dir * len,
          cy + tipShiftY
        );
        ctx.quadraticCurveTo(
          wallEdgeX + dir * len * 0.58,
          cy + halfBase * 0.68 + tipShiftY * 0.5,
          wallEdgeX + dir * 2,
          cy + halfBase
        );
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Mid vivid flame tongue
        ctx.fillStyle = pal.flameMid;
        ctx.beginPath();
        ctx.moveTo(wallEdgeX + dir * 2, cy - halfBase * 0.64);
        ctx.quadraticCurveTo(
          wallEdgeX + dir * len * 0.44,
          cy - halfBase * 0.36 + tipShiftY * 0.3,
          wallEdgeX + dir * len * 0.74,
          cy + tipShiftY * 0.7
        );
        ctx.quadraticCurveTo(
          wallEdgeX + dir * len * 0.44,
          cy + halfBase * 0.36 + tipShiftY * 0.3,
          wallEdgeX + dir * 2,
          cy + halfBase * 0.64
        );
        ctx.closePath();
        ctx.fill();

        // Bright hot inner core
        ctx.fillStyle = pal.flameCore;
        ctx.beginPath();
        ctx.moveTo(wallEdgeX + dir * 2, cy - halfBase * 0.34);
        ctx.lineTo(wallEdgeX + dir * len * 0.44, cy + tipShiftY * 0.35);
        ctx.lineTo(wallEdgeX + dir * 2, cy + halfBase * 0.34);
        ctx.closePath();
        ctx.fill();
      }

      // Inked cartoon ember puffs drifting off jet
      for (let i = 0; i < 3; i++) {
        const phase = (t * 1.4 + i * 0.37) % 1;
        const ex = wallEdgeX + dir * (10 + phase * (this.reach + 6));
        const ey = sy + (i - 1) * 18 - phase * 14 + Math.sin(t * 8 + i) * 3;
        ctx.globalAlpha = 1 - phase;
        ctx.fillStyle = pal.flameCore;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(ex, ey, 2.4 * (1 - phase * 0.4), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
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

    draw(ctx, cameraY, theme) {
      if (!this.alive) return;
      const sy = this.y - cameraY;
      if (!JellyGame.isScreenYVisible(sy, 40)) return;

      const pal = getObsPal(theme);
      const tailX = this.x - this.dir * this.length;
      const headX = this.x;
      const ink = C.COLORS.ink || '#1b1136';

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Crisp comic motion trail
      const streakGrad = ctx.createLinearGradient(tailX - this.dir * 26, sy, headX, sy);
      streakGrad.addColorStop(0, 'rgba(255, 220, 120, 0)');
      streakGrad.addColorStop(1, 'rgba(255, 240, 170, 0.72)');
      ctx.strokeStyle = streakGrad;
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(tailX - this.dir * 26, sy);
      ctx.lineTo(tailX, sy);
      ctx.stroke();

      // Thick-inked wooden/gilded arrow shaft
      ctx.strokeStyle = ink;
      ctx.lineWidth = 5.8;
      ctx.beginPath();
      ctx.moveTo(tailX, sy);
      ctx.lineTo(headX - this.dir * 6, sy);
      ctx.stroke();

      ctx.strokeStyle = '#ffebb8';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Double cartoon fletching feathers
      ctx.fillStyle = pal.dangerTip;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.8;
      for (const fy of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(tailX + this.dir * 6, sy + fy * 1.2);
        ctx.lineTo(tailX - this.dir * 4, sy + fy * 6.2);
        ctx.lineTo(tailX - this.dir * 1, sy + fy * 1.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Bold cel-shaded crimson barbed arrowhead
      ctx.fillStyle = pal.dangerTip;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(headX + this.dir * 4, sy);
      ctx.lineTo(headX - this.dir * 9, sy - 6.4);
      ctx.lineTo(headX - this.dir * 6, sy);
      ctx.lineTo(headX - this.dir * 9, sy + 6.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.moveTo(headX + this.dir * 2, sy);
      ctx.lineTo(headX - this.dir * 6, sy - 3.6);
      ctx.lineTo(headX - this.dir * 4.5, sy);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  /**
   * 3. Handcrafted Cartoon Wall-Mounted Crossbow Turret with animated bowstring pull & crystal core.
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
      return JellyGame.isScreenYVisible(sy, 45);
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

    draw(ctx, cameraY, theme) {
      const sy = this.y - cameraY;
      if (!JellyGame.isScreenYVisible(sy, 50)) return;

      const pal = getObsPal(theme);
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
      const ink = C.COLORS.ink || '#1b1136';

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Telegraph laser sight + target ring when about to fire
      if (isWarning) {
        const oppX = this.side < 0 ? C.WIDTH - C.WALL_WIDTH : C.WALL_WIDTH;
        const pulse = 0.45 + 0.55 * Math.abs(Math.sin(warnProgress * Math.PI * 5));
        const urgent = warnProgress > 0.68;

        ctx.save();
        ctx.strokeStyle = urgent
          ? `rgba(255, 85, 95, ${0.48 + 0.4 * pulse})`
          : `rgba(255, 175, 64, ${0.28 + 0.35 * pulse})`;
        ctx.lineWidth = urgent ? 2.4 : 1.7;
        ctx.setLineDash(urgent ? [10, 6] : [6, 8]);
        ctx.beginPath();
        ctx.moveTo(wallEdgeX + dir * 14, sy);
        ctx.lineTo(oppX, sy);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.strokeStyle = urgent ? '#ff4757' : '#ffa502';
        ctx.lineWidth = 2.2;
        ctx.globalAlpha = 0.6 + 0.4 * pulse;
        ctx.beginPath();
        ctx.arc(wallEdgeX + dir * 18, sy, 6 + (1 - warnProgress) * 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 1. Curved armored crossbow limbs extending top & bottom + taut animated bowstring
      const pull = isWarning ? 6 + Math.sin(warnProgress * Math.PI * 0.5) * 4 : chargeRatio * 5;
      const limbTipX = wallEdgeX + dir * 12;
      const stringX = wallEdgeX + dir * (10 - pull);

      ctx.strokeStyle = '#fff3cf';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(limbTipX, sy - 17);
      ctx.lineTo(stringX, sy);
      ctx.lineTo(limbTipX, sy + 17);
      ctx.stroke();

      for (const limbDir of [-1, 1]) {
        ctx.fillStyle = pal.rivet;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(wallEdgeX - dir * 2, sy + limbDir * 8);
        ctx.quadraticCurveTo(wallEdgeX + dir * 10, sy + limbDir * 12, limbTipX, sy + limbDir * 18);
        ctx.quadraticCurveTo(wallEdgeX + dir * 14, sy + limbDir * 11, wallEdgeX + dir * 4, sy + limbDir * 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // 2. Sculpted beveled turret chassis (biome-matched stone/metal body)
      const boxW = 20;
      const boxH = 28;
      const boxX = this.side < 0 ? wallEdgeX - 11 : wallEdgeX - 9;
      const boxY = sy - boxH * 0.5;
      const tGrad = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH);
      tGrad.addColorStop(0, pal.mountHi);
      tGrad.addColorStop(1, pal.mount);
      ctx.fillStyle = tGrad;
      ctx.strokeStyle = isWarning ? '#ff5e57' : ink;
      ctx.lineWidth = 2.5;
      fillStrokeRoundRect(ctx, boxX, boxY, boxW, boxH, 7);

      // Barrel muzzle rim
      ctx.fillStyle = pal.mount;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      const muzzX = this.side < 0 ? wallEdgeX + 6 : wallEdgeX - 12;
      fillStrokeRoundRect(ctx, muzzX, sy - 6.5, 6, 13, 2.5);

      // 3. Glowing charge crystal gem core on turret face
      const gemX = this.side < 0 ? wallEdgeX - 2 : wallEdgeX + 2;
      ctx.fillStyle = '#140c29';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(gemX, sy, 6.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const gemCol = isWarning ? '#ff4757' : chargeRatio > 0.7 ? '#ffd147' : '#36f5b0';
      ctx.fillStyle = gemCol;
      ctx.beginPath();
      ctx.arc(gemX, sy, 2.4 + (isWarning ? 2.6 : chargeRatio * 2.2), 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(gemX - 1.5, sy - 1.5, 1.3, 0, Math.PI * 2);
      ctx.fill();

      // 4. Cocked crimson arrowhead peeking from crossbow muzzle during warning
      if (isWarning) {
        const tipX = wallEdgeX + dir * (16 - Math.sin(warnProgress * Math.PI * 0.5) * 4);
        ctx.fillStyle = pal.dangerTip;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(tipX + dir * 6, sy);
        ctx.lineTo(tipX - dir * 5, sy - 5);
        ctx.lineTo(tipX - dir * 3, sy);
        ctx.lineTo(tipX - dir * 5, sy + 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  /**
   * 4. Faceted Crystalline Ice Wall Surface: Player sticks but slides smoothly downward.
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
      if (!JellyGame.isScreenYVisible(sy, 40 + this.height)) return;

      const wallEdgeX = this.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const dir = this.side < 0 ? 1 : -1;
      const top = sy - this.height * 0.5;
      const bot = sy + this.height * 0.5;
      const ink = C.COLORS.ink || '#1b1136';

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Sculpted faceted glacier slab protruding slightly from the wall with angular crystal edges
      const traceIce = () => {
        ctx.beginPath();
        ctx.moveTo(wallEdgeX - dir * 6, top);
        ctx.lineTo(wallEdgeX + dir * 6, top + 7);
        ctx.lineTo(wallEdgeX + dir * 9.5, top + this.height * 0.28);
        ctx.lineTo(wallEdgeX + dir * 6.5, top + this.height * 0.52);
        ctx.lineTo(wallEdgeX + dir * 9, top + this.height * 0.78);
        ctx.lineTo(wallEdgeX + dir * 5.5, bot - 6);
        ctx.lineTo(wallEdgeX - dir * 6, bot);
        ctx.closePath();
      };

      const grad = ctx.createLinearGradient(wallEdgeX - dir * 6, top, wallEdgeX + dir * 9, bot);
      grad.addColorStop(0, '#e8feff');
      grad.addColorStop(0.45, '#5ce6ff');
      grad.addColorStop(1, '#1089b8');
      ctx.fillStyle = grad;
      traceIce();
      ctx.fill();

      // Clipped crisp bright crystal facets & diagonal ice gleams
      ctx.save();
      traceIce();
      if (typeof ctx.clip === 'function') ctx.clip();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.52)';
      ctx.beginPath();
      ctx.moveTo(wallEdgeX - dir * 6, top);
      ctx.lineTo(wallEdgeX + dir * 10, top + 12);
      ctx.lineTo(wallEdgeX - dir * 1, top + this.height * 0.45);
      ctx.lineTo(wallEdgeX - dir * 6, top + this.height * 0.45);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1.8;
      for (let i = 16; i < this.height - 12; i += 24) {
        ctx.beginPath();
        ctx.moveTo(wallEdgeX - dir * 2, top + i);
        ctx.lineTo(wallEdgeX + dir * 6.5, top + i - 8);
        ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.4;
      traceIce();
      ctx.stroke();

      // Cute hanging icicle droplet at lower end of slab
      ctx.fillStyle = '#9ef4ff';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.moveTo(wallEdgeX + dir * 1, bot - 2);
      ctx.lineTo(wallEdgeX + dir * 6.5, bot - 3);
      ctx.lineTo(wallEdgeX + dir * 3.5, bot + 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
  }

  /**
   * 5. Elastic Cartoon Spring-Bumper Bounce Pad: Ricochets player across and upward!
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

    draw(ctx, cameraY, theme) {
      const sy = this.y - cameraY;
      if (!JellyGame.isScreenYVisible(sy, 40 + this.height)) return;

      const pal = getObsPal(theme);
      const wallEdgeX = this.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const dir = this.side < 0 ? 1 : -1;
      const top = sy - this.height * 0.5;
      const bot = sy + this.height * 0.5;

      const wave = -Math.sin(this.bounceAnim * Math.PI * 2.5) * 9 * this.bounceAnim;
      const padThick = 12 + wave * 0.45;
      const flexX = wallEdgeX + dir * Math.max(6, 13 + wave * 1.1);
      const hitY = sy + this.hitRelY * 0.7;
      const ink = C.COLORS.ink || '#1b1136';

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Biome-matched riveted steel wall mount
      ctx.fillStyle = pal.mount;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.2;
      fillStrokeRoundRect(ctx, wallEdgeX - 5, top - 1, 10, this.height + 2, 3.5);

      // Visible golden cartoon bumper coils behind the pink cushion
      ctx.strokeStyle = ink;
      ctx.lineWidth = 4.4;
      for (const cy of [top + 16, bot - 16]) {
        ctx.beginPath();
        ctx.moveTo(wallEdgeX, cy - 3);
        ctx.lineTo(wallEdgeX + dir * 6, cy + 3);
        ctx.stroke();
      }
      ctx.strokeStyle = '#ffd147';
      ctx.lineWidth = 2.0;
      for (const cy of [top + 16, bot - 16]) {
        ctx.beginPath();
        ctx.moveTo(wallEdgeX, cy - 3);
        ctx.lineTo(wallEdgeX + dir * 6, cy + 3);
        ctx.stroke();
      }

      // Plump flexed bubble-pink cartoon trampoline cushion
      const xBase = wallEdgeX + dir * 2.5;
      const xFace = wallEdgeX + dir * Math.max(8, padThick + 1.5);
      const grad = ctx.createLinearGradient(xBase, top, xFace, top);
      grad.addColorStop(0, '#a823cf');
      grad.addColorStop(0.55, '#f042b8');
      grad.addColorStop(1, '#ff9ee0');
      ctx.fillStyle = grad;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(xBase, top + 2);
      ctx.quadraticCurveTo(xFace + dir * 2, top + 4, xFace, top + 10);
      ctx.quadraticCurveTo(flexX + dir * 2, hitY, xFace, bot - 10);
      ctx.quadraticCurveTo(xFace + dir * 2, bot - 4, xBase, bot - 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Glossy pillowy highlight strip
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(xFace - dir * 3.2, top + 13);
      ctx.quadraticCurveTo(flexX - dir * 2.5, hitY, xFace - dir * 3.2, bot - 13);
      ctx.stroke();

      // Thick-inked outward double chevron arrow
      const chevX = wallEdgeX + dir * (padThick + 9);
      const drawChev = (ox) => {
        ctx.beginPath();
        ctx.moveTo(ox - dir * 4.5, sy - 6.5);
        ctx.lineTo(ox, sy);
        ctx.lineTo(ox - dir * 4.5, sy + 6.5);
      };
      ctx.strokeStyle = ink;
      ctx.lineWidth = 4.6;
      drawChev(chevX);
      ctx.stroke();
      ctx.strokeStyle = '#fff5d6';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.restore();
    }
  }

  /**
   * 6. Fractured Multi-Stone Cracked Wall Surface: Interlocking biome-tinted chunks crumble in 1.25s!
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

    draw(ctx, cameraY, theme) {
      const sy = this.y - cameraY;
      if (!JellyGame.isScreenYVisible(sy, 40 + this.height)) return;

      const pal = getObsPal(theme);
      const wallEdgeX = this.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const dir = this.side < 0 ? 1 : -1;
      const top = sy - this.height * 0.5;
      const duration = (C.SURFACES && C.SURFACES.CRACK_DURATION) || 1.25;
      const ratio = Math.min(1, this.crackTimer / duration);
      const ink = C.COLORS.ink || '#1b1136';

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (this.broken) {
        ctx.globalAlpha = 0.22;
      }

      // Three chunky interlocking jagged stone blocks that separate & shake as crack builds
      const segs = 3;
      const segH = this.height / segs;
      for (let i = 0; i < segs; i++) {
        const y0 = top + i * segH + 1.5;
        const h = segH - 3;
        const spread = ratio * 3.5 * (i - 1);
        const jitterX = ratio > 0.15 ? Math.sin(this.crackTimer * 48 + i * 2.1) * 2.2 * ratio : 0;
        const bx = (this.side < 0 ? wallEdgeX - 8 : wallEdgeX - 3) + jitterX;
        const by = y0 + spread;

        const sg = ctx.createLinearGradient(bx, by, bx + 11, by + h);
        sg.addColorStop(0, pal.stoneTop);
        sg.addColorStop(1, pal.stoneBot);
        ctx.fillStyle = sg;
        ctx.strokeStyle = ratio > 0.2 ? '#ffd147' : ink;
        ctx.lineWidth = 2.3;
        fillStrokeRoundRect(ctx, bx, by, 12, h, 4);

        // Chiseled upper bevel glint
        ctx.fillStyle = 'rgba(255, 250, 230, 0.34)';
        ctx.fillRect(bx + 2, by + 2.5, 8, 2.5);

        // Glowing jagged fault crack across each stone chunk
        ctx.strokeStyle = ratio > 0.2 ? '#fff08a' : ink;
        ctx.lineWidth = 1.7 + ratio * 1.4;
        ctx.beginPath();
        ctx.moveTo(bx + (i % 2 === 0 ? 2 : 9), by + 4);
        ctx.lineTo(bx + 6, by + h * 0.5);
        ctx.lineTo(bx + (i % 2 === 0 ? 9.5 : 2.5), by + h - 4);
        ctx.stroke();
      }

      // Falling dust pebbles when shaking near breaking point
      if (ratio > 0.3 && !this.broken) {
        ctx.fillStyle = pal.stoneTop;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.2;
        for (let p = 0; p < 2; p++) {
          const px = wallEdgeX + dir * (10 + p * 5);
          const py = sy + (p === 0 ? -12 : 16) + ((this.crackTimer * 45 + p * 12) % 24);
          ctx.beginPath();
          ctx.arc(px, py, 2.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      ctx.restore();
    }
  }

  /**
   * 7. Mid-Shaft Mechanical Buzzsaw Pendulum (unlocks ~250m+): curved hooked teeth & geared pulley rail.
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
      this.spin += dt * 4.8;
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

    draw(ctx, cameraY, theme) {
      const sy = this.y - cameraY;
      if (!JellyGame.isScreenYVisible(sy, 60)) return;

      const pal = getObsPal(theme);
      const minRailX = C.WIDTH * 0.5 - this.amplitude;
      const maxRailX = C.WIDTH * 0.5 + this.amplitude;
      const ink = C.COLORS.ink || '#1b1136';

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Heavy inked cartoon chain-track guide rail
      ctx.strokeStyle = 'rgba(27, 17, 54, 0.52)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(minRailX, sy);
      ctx.lineTo(maxRailX, sy);
      ctx.stroke();

      ctx.strokeStyle = pal.rivet;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(minRailX, sy);
      ctx.lineTo(maxRailX, sy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Bolted end-pulley gear caps
      for (const endX of [minRailX, maxRailX]) {
        ctx.fillStyle = pal.mountHi;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(endX, sy, 6.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = pal.rivet;
        ctx.beginPath();
        ctx.arc(endX, sy, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Rotating curved-tooth cartoon circular buzzsaw
      ctx.translate(this.x, sy);
      ctx.rotate(this.spin);

      const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, this.radius + 11);
      glow.addColorStop(0, pal.beamGlow);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 11, 0, Math.PI * 2);
      ctx.fill();

      // Asymmetric hooked buzzsaw teeth (authentic circular saw profile!)
      const teeth = 8;
      const rOut = this.radius + 3.8;
      const rIn = this.radius - 3.6;
      const bGrad = ctx.createRadialGradient(-4, -4, 3, 0, 0, rOut);
      bGrad.addColorStop(0, pal.bladeHi);
      bGrad.addColorStop(1, pal.bladeLo);
      ctx.fillStyle = bGrad;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < teeth; i++) {
        const a0 = (i / teeth) * Math.PI * 2;
        const aTip = a0 + (Math.PI * 2) / (teeth * 2.1);
        const aBack = a0 + (Math.PI * 2) / (teeth * 1.15);
        const x0 = Math.cos(a0) * rIn;
        const y0 = Math.sin(a0) * rIn;
        const xt = Math.cos(aTip) * rOut;
        const yt = Math.sin(aTip) * rOut;
        const xb = Math.cos(aBack) * (rIn + 1.5);
        const yb = Math.sin(aBack) * (rIn + 1.5);
        if (i === 0) ctx.moveTo(x0, y0);
        else ctx.lineTo(x0, y0);
        ctx.lineTo(xt, yt);
        ctx.quadraticCurveTo(xb, yb, Math.cos(((i + 1) / teeth) * Math.PI * 2) * rIn, Math.sin(((i + 1) / teeth) * Math.PI * 2) * rIn);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Recessed dark steel inner hub collar + 4 rivets
      ctx.fillStyle = pal.mount;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.arc(0, 0, 9.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Glowing danger jewel core
      ctx.fillStyle = pal.dangerTip;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, 5.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fff9d6';
      ctx.beginPath();
      ctx.arc(-1.8, -1.8, 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  /**
   * 8. Rhythmic Wall-to-Wall Plasma Laser Gate (unlocks ~500m+): twin pronged Tesla coils & inked energy arc.
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
      return JellyGame.isScreenYVisible(sy, 45);
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

    draw(ctx, cameraY, theme) {
      const sy = this.y - cameraY;
      if (!JellyGame.isScreenYVisible(sy, 50)) return;

      const pal = getObsPal(theme);
      const st = this._getPhaseState();
      const leftX = C.WALL_WIDTH;
      const rightX = C.WIDTH - C.WALL_WIDTH;
      const ink = C.COLORS.ink || '#1b1136';

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (st === 'warning') {
        const prog = (this.timer - this.warningStart) / (this.activeStart - this.warningStart);
        const pulse = 0.45 + 0.55 * Math.abs(Math.sin(prog * Math.PI * 6));
        ctx.strokeStyle = `rgba(255, 195, 50, ${0.42 + 0.52 * pulse})`;
        ctx.lineWidth = 2.4;
        ctx.setLineDash([9, 6]);
        ctx.beginPath();
        ctx.moveTo(leftX + 12, sy);
        ctx.lineTo(rightX - 12, sy);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (st === 'active') {
        const beamH = this.beamHalfH * 2 + Math.sin(this.timer * 38) * 1.8;
        // Soft wide glow envelope
        ctx.fillStyle = pal.beamGlow;
        ctx.fillRect(leftX + 6, sy - beamH * 0.95, rightX - leftX - 12, beamH * 1.9);

        // Inked plasma beam body
        ctx.fillStyle = ink;
        ctx.fillRect(leftX + 8, sy - beamH * 0.55 - 2, rightX - leftX - 16, beamH * 1.1 + 4);

        ctx.fillStyle = pal.beamMain;
        ctx.fillRect(leftX + 8, sy - beamH * 0.46, rightX - leftX - 16, beamH * 0.92);

        // White-hot center core + crackling cartoon energy sine arc
        ctx.fillStyle = '#fff9fc';
        ctx.fillRect(leftX + 8, sy - 2.2, rightX - leftX - 16, 4.4);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        const segs = 14;
        for (let i = 0; i <= segs; i++) {
          const px = leftX + 12 + (i / segs) * (rightX - leftX - 24);
          const py = sy + Math.sin(this.timer * 30 + i * 2.1) * 4.8;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Twin sculpted pronged plasma coil emitters on left & right walls
      for (const side of [-1, 1]) {
        const wallX = side < 0 ? leftX : rightX;
        const dir = side < 0 ? 1 : -1;

        // Upper & lower curved brass emitter pincer prongs
        ctx.fillStyle = pal.rivet;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2;
        for (const py of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(wallX + dir * 2, sy + py * 7);
          ctx.lineTo(wallX + dir * 13, sy + py * 9.5);
          ctx.lineTo(wallX + dir * 11, sy + py * 4.5);
          ctx.lineTo(wallX + dir * 2, sy + py * 3.5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        // Armored base cap
        const mx = side < 0 ? wallX - 8 : wallX - 5;
        ctx.fillStyle = pal.mountHi;
        ctx.strokeStyle = st === 'active' ? pal.beamMain : st === 'warning' ? '#ffd147' : ink;
        ctx.lineWidth = 2.4;
        fillStrokeRoundRect(ctx, mx, sy - 13, 13, 26, 5);

        // Glowing focus crystal orb cradled between prongs
        const cx = wallX + dir * 6.5;
        ctx.fillStyle = st === 'active' ? pal.beamMain : st === 'warning' ? '#ffd147' : '#74f2ff';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(cx, sy, st === 'active' ? 5.2 : 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - 1.3, sy - 1.3, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /**
   * 9. Beneficial Mid-Shaft Updraft Wind Vortex (unlocks ~500m+): swirling layered cyclone ring!
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
      this.spin += dt * 4.4;
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

    draw(ctx, cameraY, theme) {
      const sy = this.y - cameraY;
      if (!JellyGame.isScreenYVisible(sy, 60)) return;

      const isHeaven = theme && theme.key === 'heaven';
      const ink = C.COLORS.ink || '#1b1136';

      ctx.save();
      ctx.translate(this.x, sy);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Soft airy updraft halo
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, this.radius + 9);
      g.addColorStop(0, isHeaven ? 'rgba(255, 245, 185, 0.44)' : 'rgba(126, 248, 255, 0.4)');
      g.addColorStop(0.65, isHeaven ? 'rgba(255, 214, 102, 0.16)' : 'rgba(54, 245, 176, 0.16)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 9, 0, Math.PI * 2);
      ctx.fill();

      // Three staggered cartoon wind swirl ribbons
      for (let i = 0; i < 3; i++) {
        const ang = this.spin + (i * Math.PI * 2) / 3;
        const rr = i === 0 ? this.radius * 0.82 : this.radius * 0.66;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, rr, ang, ang + Math.PI * 0.56);
        ctx.stroke();

        ctx.strokeStyle = isHeaven ? '#fff2a6' : i % 2 === 0 ? '#74f2ff' : '#63ffbe';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Orbiting tiny bright breeze wisps
      for (let i = 0; i < 2; i++) {
        const wa = -this.spin * 1.2 + i * Math.PI;
        const wx = Math.cos(wa) * (this.radius * 0.94);
        const wy = Math.sin(wa) * (this.radius * 0.94);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(wx, wy, 3.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Crisp bouncy upward double wind chevrons
      const bob = Math.sin(this.spin * 1.5) * 3.2;
      const drawChevs = () => {
        ctx.beginPath();
        ctx.moveTo(-9, 3 + bob);
        ctx.lineTo(0, -6.5 + bob);
        ctx.lineTo(9, 3 + bob);
        ctx.moveTo(-6.5, 10.5 + bob);
        ctx.lineTo(0, 3 + bob);
        ctx.lineTo(6.5, 10.5 + bob);
      };
      ctx.strokeStyle = ink;
      ctx.lineWidth = 5.4;
      drawChevs();
      ctx.stroke();
      ctx.strokeStyle = '#fffdf5';
      ctx.lineWidth = 2.6;
      drawChevs();
      ctx.stroke();

      ctx.restore();
    }
  }

  /**
   * 10. NEW HIGH-ALTITUDE OBSTACLE (unlocks ~350m+): Floating Orbital Spiked Mine.
   * Orbits cleanly around a visible center anchor ring in the air shaft, creating fun arc-over/under slingshots!
   */
  class OrbitalMineObstacle {
    constructor(y, orbitRadius = 38, speed = 1.65, phase = 0) {
      this.type = 'orbitalMine';
      this.side = 0;
      this.centerX = C.WIDTH * 0.5;
      this.centerY = y;
      this.orbitRadius = orbitRadius;
      this.speed = speed;
      this.phase = phase;
      this.time = 0;
      this.radius = 16;
      this.hurtRadius = 14;
      this.x = this.centerX + Math.cos(phase) * orbitRadius;
      this.y = y;
      this.mineY = this.centerY + Math.sin(phase) * orbitRadius;
      this.height = (orbitRadius + 20) * 2;
      this.topY = y - orbitRadius - 20;
      this.bottomY = y + orbitRadius + 20;
      this._wasInHalo = false;
      this._nearMissDone = false;
    }

    update(dt) {
      this.time += dt;
      const a = this.time * this.speed + this.phase;
      this.x = this.centerX + Math.cos(a) * this.orbitRadius;
      this.mineY = this.centerY + Math.sin(a) * this.orbitRadius;
    }

    getHitboxes() {
      return [{ type: 'circle', x: this.x, y: this.mineY, r: this.hurtRadius }];
    }

    checkPointCollision(px, py, r) {
      const dx = px - this.x;
      const dy = py - this.mineY;
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

    draw(ctx, cameraY, theme) {
      const cy = this.centerY - cameraY;
      if (!JellyGame.isScreenYVisible(cy, this.orbitRadius + 50)) return;

      const pal = getObsPal(theme);
      const mx = this.x;
      const my = this.mineY - cameraY;
      const ink = C.COLORS.ink || '#1b1136';

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Subtle dotted orbit track + center anchor ring so player reads the exact path immediately
      ctx.strokeStyle = 'rgba(255, 240, 200, 0.24)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.arc(this.centerX, cy, this.orbitRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tiny inked center pivot anchor + tether chain line
      ctx.strokeStyle = 'rgba(27, 17, 54, 0.45)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(this.centerX, cy);
      ctx.lineTo(mx, my);
      ctx.stroke();

      ctx.fillStyle = pal.mountHi;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.centerX, cy, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Chunky cel-shaded floating cartoon spiked mine
      ctx.translate(mx, my);

      // 6 tapered conical danger spikes around perimeter
      const spikes = 6;
      const r = this.radius;
      const rot = this.time * 1.1;
      for (let i = 0; i < spikes; i++) {
        const a = rot + (i / spikes) * Math.PI * 2;
        ctx.save();
        ctx.rotate(a);
        ctx.fillStyle = pal.rivet;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(r - 3, -4.5);
        ctx.lineTo(r + 7.5, 0);
        ctx.lineTo(r - 3, 4.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Concave cel-shaded heavy mine sphere
      ctx.fillStyle = pal.mount;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      if (typeof ctx.clip === 'function') ctx.clip();
      ctx.fillStyle = pal.mountHi;
      ctx.beginPath();
      ctx.arc(-r * 0.2, -r * 0.22, r * 0.96, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.36)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.36, -r * 0.42, 5.5, 2.8, -0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

      // Expressive blinking cartoon cyclops danger eye core
      const pulse = 0.85 + 0.15 * Math.sin(this.time * 7);
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(0, 0, 7.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = pal.orbEye;
      ctx.beginPath();
      ctx.arc(0, 0, 5.4 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.ellipse(0, 0, 1.8, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-2.1, -2.1, 1.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  /**
   * 11. NEW HIGH-ALTITUDE OBSTACLE (unlocks ~750m+): Rhythmic Wall Crusher Piston.
   * Telegraphs cleanly with a dashed reach box, punches outward on a striped piston rod, holds, and retracts!
   */
  class CrusherPistonObstacle {
    constructor(side, y, cycleDuration = 3.5, phaseOffset = 0) {
      this.type = 'crusherPiston';
      this.side = side; // -1 left wall, 1 right wall
      this.y = y;
      this.headW = 36;
      this.headH = 44;
      this.height = 48;
      this.topY = y - 24;
      this.bottomY = y + 24;
      this.maxReach = 104;
      this.cycleDuration = cycleDuration;
      this.warnStart = 1.25;
      this.slamStart = 2.1;
      this.holdEnd = 2.8;
      this.timer = phaseOffset % cycleDuration;
      this._wasInHalo = false;
      this._nearMissDone = false;
    }

    _getExtensionRatio() {
      const t = this.timer;
      if (t < this.slamStart) return 0;
      if (t < this.slamStart + 0.16) {
        // Fast punchy slam out!
        const p = (t - this.slamStart) / 0.16;
        return 1 - Math.pow(1 - p, 3);
      }
      if (t < this.holdEnd) return 1;
      // Smooth hydraulic retraction back into wall
      const retDur = Math.max(0.25, this.cycleDuration - this.holdEnd);
      const rp = Math.min(1, (t - this.holdEnd) / retDur);
      return 1 - rp * rp;
    }

    _isWarning() {
      return this.timer >= this.warnStart && this.timer < this.slamStart;
    }

    _isInActiveView(cameraY) {
      const sy = this.y - cameraY;
      return JellyGame.isScreenYVisible(sy, 55);
    }

    update(dt, context) {
      if (context && !this._isInActiveView(context.cameraY)) {
        if (this.timer > this.warnStart - 0.2) this.timer = 0.4;
        return;
      }
      const prev = this.timer;
      this.timer += dt;
      if (this.timer >= this.cycleDuration) {
        this.timer -= this.cycleDuration;
        this._nearMissDone = false;
      }
      // Subtle impact audio cue right when piston slams outward
      if (prev < this.slamStart && this.timer >= this.slamStart && context && context.audio && context.audio.playCrack) {
        context.audio.playCrack();
      }
    }

    _getHeadRect(extOverride) {
      const ext = typeof extOverride === 'number' ? extOverride : this._getExtensionRatio();
      const wallEdgeX = this.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const dist = ext * this.maxReach;
      const hx =
        this.side < 0
          ? wallEdgeX + dist - 16
          : wallEdgeX - dist - this.headW + 16;
      return {
        x: hx,
        y: this.y - this.headH * 0.5,
        w: this.headW,
        h: this.headH
      };
    }

    getHitboxes() {
      const ext = this._getExtensionRatio();
      if (ext < 0.08) return [];
      const r = this._getHeadRect(ext);
      return [{ type: 'rect', x: r.x + 2, y: r.y + 3, w: r.w - 4, h: r.h - 6 }];
    }

    checkPointCollision(px, py, r) {
      const ext = this._getExtensionRatio();
      const urgentWarn = this._isWarning() && this.timer >= this.slamStart - 0.45;
      if (ext < 0.08 && !urgentWarn) return false;
      const rect = this._getHeadRect(urgentWarn ? 1 : ext);
      return circleRectOverlap(px, py, r, rect.x + 2, rect.y + 3, rect.w - 4, rect.h - 6);
    }

    checkPlayerCollision(player) {
      const ext = this._getExtensionRatio();
      if (ext < 0.08) return false;
      const rect = this._getHeadRect(ext);
      // Include extended piston shaft & crusher head cleanly
      const wallEdgeX = this.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const minX = this.side < 0 ? wallEdgeX : rect.x + 2;
      const maxX = this.side < 0 ? rect.x + rect.w - 2 : wallEdgeX;
      return circleRectOverlap(
        player.positionX,
        player.positionY,
        C.HITBOX.PLAYER_HURT_RADIUS,
        minX,
        rect.y + 3,
        Math.max(4, maxX - minX),
        rect.h - 6
      );
    }

    checkNearMiss(player) {
      const ext = this._getExtensionRatio();
      if (this._nearMissDone || ext < 0.25 || !player.alive) return false;
      const rect = this._getHeadRect(ext);
      const haloR = C.HITBOX.PLAYER_HURT_RADIUS + (C.HITBOX.CLOSE_CALL_MARGIN_PX || 11);
      const inHalo =
        !player.isAttached() &&
        circleRectOverlap(player.positionX, player.positionY, haloR, rect.x, rect.y, rect.w, rect.h);
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

    draw(ctx, cameraY, theme) {
      const sy = this.y - cameraY;
      if (!JellyGame.isScreenYVisible(sy, 65)) return;

      const pal = getObsPal(theme);
      const wallEdgeX = this.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const dir = this.side < 0 ? 1 : -1;
      const ink = C.COLORS.ink || '#1b1136';
      const ext = this._getExtensionRatio();
      const warn = this._isWarning();

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // 1. Dashed warning slam zone outline before punching out
      if (warn) {
        const prog = (this.timer - this.warnStart) / (this.slamStart - this.warnStart);
        const pulse = 0.45 + 0.55 * Math.abs(Math.sin(prog * Math.PI * 6));
        const fullRect = this._getHeadRect(1);
        const fy = fullRect.y - cameraY;
        const zoneX = this.side < 0 ? wallEdgeX + 4 : fullRect.x;
        const zoneW = this.side < 0 ? fullRect.x + fullRect.w - (wallEdgeX + 4) : wallEdgeX - 4 - fullRect.x;
        ctx.fillStyle = `rgba(255, 165, 2, ${0.12 + 0.14 * pulse})`;
        ctx.strokeStyle = `rgba(255, 110, 60, ${0.45 + 0.45 * pulse})`;
        ctx.lineWidth = 2.2;
        ctx.setLineDash([7, 5]);
        fillStrokeRoundRect(ctx, zoneX, fy + 2, zoneW, fullRect.h - 4, 7);
        ctx.setLineDash([]);
      }

      const rect = this._getHeadRect(ext);
      const jitter = warn ? Math.sin(this.timer * 52) * 2.2 : 0;
      const hx = rect.x + jitter;
      const hy = rect.y - cameraY;

      // 2. Telescoping hazard-striped hydraulic piston rod
      if (ext > 0.04) {
        const rodH = 16;
        const rodY = sy - rodH * 0.5;
        const rodX = this.side < 0 ? wallEdgeX - 2 : hx + rect.w - 4;
        const rodW = this.side < 0 ? hx - wallEdgeX + 6 : wallEdgeX - (hx + rect.w - 4) + 2;
        if (rodW > 2) {
          ctx.fillStyle = pal.mount;
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.4;
          fillStrokeRoundRect(ctx, rodX, rodY, rodW, rodH, 3);

          // Diagonal brass/gold piston warning stripes
          ctx.save();
          ctx.beginPath();
          ctx.rect(rodX + 2, rodY + 2, rodW - 4, rodH - 4);
          if (typeof ctx.clip === 'function') ctx.clip();
          ctx.fillStyle = pal.rivet;
          for (let sx = rodX - 16; sx < rodX + rodW + 16; sx += 16) {
            ctx.beginPath();
            ctx.moveTo(sx, rodY + rodH);
            ctx.lineTo(sx + 7, rodY);
            ctx.lineTo(sx + 13, rodY);
            ctx.lineTo(sx + 6, rodY + rodH);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
      }

      // 3. Wall socket housing collar
      const sockX = this.side < 0 ? wallEdgeX - 8 : wallEdgeX - 4;
      ctx.fillStyle = pal.mount;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.3;
      fillStrokeRoundRect(ctx, sockX, sy - 25, 12, 50, 4);

      // 4. Chunky sculpted biome-themed cartoon Crusher Ram Head (carved tiki/golem block!)
      const hGrad = ctx.createLinearGradient(hx, hy, hx, hy + rect.h);
      hGrad.addColorStop(0, pal.crusherTop);
      hGrad.addColorStop(1, pal.crusherBot);
      ctx.fillStyle = hGrad;
      ctx.strokeStyle = warn ? '#ffd147' : ink;
      ctx.lineWidth = 2.8;
      fillStrokeRoundRect(ctx, hx, hy, rect.w, rect.h, 8);

      // Upper sunlit bevel strip
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.fillRect(hx + 5, hy + 4, rect.w - 10, 4);

      // Front impact bumper studs facing into the air shaft
      const faceX = this.side < 0 ? hx + rect.w - 1 : hx + 1;
      ctx.fillStyle = pal.bladeHi;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      for (const ty of [-11, 0, 11]) {
        ctx.beginPath();
        ctx.moveTo(faceX, sy + ty - 4.5);
        ctx.lineTo(faceX + dir * 6.5, sy + ty);
        ctx.lineTo(faceX, sy + ty + 4.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Angry glowing cartoon rune-eyes carved on the crusher face
      const cx = hx + rect.w * 0.5 - dir * 2;
      ctx.fillStyle = warn || ext > 0.2 ? '#ff4757' : pal.crusherGem;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.6;
      for (const ey of [-7, 7]) {
        ctx.beginPath();
        ctx.moveTo(cx - dir * 5, sy + ey - 3.5);
        ctx.lineTo(cx + dir * 5, sy + ey);
        ctx.lineTo(cx - dir * 5, sy + ey + 3.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

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
    WindVortexSurface,
    OrbitalMineObstacle,
    CrusherPistonObstacle,
    BIOME_OBS_PALETTES,
    getObsPal
  };
})(window);
