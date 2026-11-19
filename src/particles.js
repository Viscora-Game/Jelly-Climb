(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});
  const { COLORS, FONTS } = JellyGame.CONSTANTS;

  const MAX_PARTICLES = 160;
  const MAX_RINGS = 16;
  const MAX_LABELS = 14;
  const MAX_SPLATS = 36;
  const MAX_DEBRIS = 36;

  /**
   * Lightweight particle, dripping wall splat, tumbling debris & floating label system optimized for 60fps mobile Canvas.
   */
  class ParticleSystem {
    constructor() {
      this.particles = [];
      this.rings = [];
      this.labels = [];
      this.wallSplats = [];
      this.debris = [];
    }

    clear() {
      this.particles.length = 0;
      this.rings.length = 0;
      this.labels.length = 0;
      this.wallSplats.length = 0;
      this.debris.length = 0;
    }

    _pushParticle(p) {
      if (this.particles.length >= MAX_PARTICLES) {
        this.particles.shift();
      }
      this.particles.push(p);
    }

    _pushRing(r) {
      if (this.rings.length >= MAX_RINGS) {
        this.rings.shift();
      }
      this.rings.push(r);
    }

    spawnFloatingLabel(x, y, text, color = '#ffd166', size = 14) {
      if (this.labels.length >= MAX_LABELS) {
        this.labels.shift();
      }
      this.labels.push({
        x,
        y,
        vy: -52,
        text,
        color,
        size,
        life: 0,
        maxLife: 0.72
      });
    }

    spawnCollectBurst(x, y, amount = 1) {
      const count = amount > 1 ? 12 : 8;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
        const speed = 75 + Math.random() * 140;
        this._pushParticle({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 30,
          radius: 2.2 + Math.random() * 2.5,
          life: 0,
          maxLife: 0.32 + Math.random() * 0.16,
          gravity: 280,
          color: i % 2 === 0 ? COLORS.collectCore : COLORS.collectOuter
        });
      }

      this._pushRing({
        x,
        y,
        radius: 6,
        maxRadius: 32,
        life: 0,
        maxLife: 0.24,
        color: COLORS.collectOuter
      });

      this.spawnFloatingLabel(
        x,
        y - 12,
        `+${amount}`,
        amount > 1 ? '#ffeaa7' : COLORS.collectOuter,
        amount > 1 ? 16 : 14
      );
    }

    spawnWallSplat(x, y, side, color = COLORS.jellyPrimary, intensity = 0.7) {
      if (this.wallSplats.length >= MAX_SPLATS) {
        this.wallSplats.shift();
      }
      const wallEdgeX = side < 0 ? 18 : 450 - 18;
      const isSlide = intensity <= 0.32;
      const spanUp = isSlide ? 6 : 10 + intensity * 12;
      const spanDown = isSlide ? 12 : 12 + intensity * 14;
      const maxReach = isSlide ? 4.5 : 8 + intensity * 11;

      // Pre-bake jagged splatter spikes & satellite impact drops so it looks smashed rather than oval
      const lobes = isSlide
        ? [
            { dy: -spanUp * 0.4, reach: maxReach * 0.9 },
            { dy: 0, reach: maxReach * 0.65 },
            { dy: spanDown * 0.5, reach: maxReach * 0.85 }
          ]
        : [
            { dy: -spanUp * 0.55, reach: maxReach * (0.72 + Math.random() * 0.4) },
            { dy: -spanUp * 0.12, reach: maxReach * 0.38 },
            { dy: spanDown * 0.08, reach: maxReach * (0.88 + Math.random() * 0.35) },
            { dy: spanDown * 0.36, reach: maxReach * 0.35 },
            { dy: spanDown * 0.62, reach: maxReach * (0.62 + Math.random() * 0.35) }
          ];

      const dots = [];
      const dotCount = isSlide ? 1 : 4 + Math.floor(intensity * 3);
      for (let i = 0; i < dotCount; i++) {
        const angleSpread = (Math.random() - 0.5) * Math.PI * 0.9;
        const dist = 5 + Math.random() * (maxReach + 9);
        dots.push({
          dx: Math.cos(angleSpread) * dist,
          dy: Math.sin(angleSpread) * (dist * 1.35) + (Math.random() - 0.5) * 10,
          r: 1.1 + Math.random() * (1.8 + intensity * 0.9)
        });
      }

      this.wallSplats.push({
        x: x != null ? x : wallEdgeX,
        y,
        side,
        color,
        spanUp,
        spanDown,
        height: spanUp + spanDown,
        lobes,
        dots,
        dripLen: isSlide ? 6 : 3,
        dripSpeed: isSlide ? 2 : 7 + intensity * 16,
        life: 0,
        maxLife: isSlide ? 1.15 : 2.3 + intensity * 0.9
      });
    }

    spawnDebris(x, y, outDir = 1, color = '#9c6b3b', count = 8) {
      for (let i = 0; i < count; i++) {
        if (this.debris.length >= MAX_DEBRIS) {
          this.debris.shift();
        }
        this.debris.push({
          x: x + (Math.random() - 0.5) * 8,
          y: y + (Math.random() - 0.5) * 28,
          vx: outDir * (45 + Math.random() * 145) + (Math.random() - 0.5) * 50,
          vy: -110 + Math.random() * 160,
          size: 3.2 + Math.random() * 4.2,
          rot: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 14,
          color: i % 3 === 0 ? '#ffd166' : i % 2 === 0 ? color : '#5c4028',
          life: 0,
          maxLife: 0.75 + Math.random() * 0.45
        });
      }
    }

    spawnStickBurst(x, y, normalX, impactSpeed, color = COLORS.jellyPrimary) {
      const count = impactSpeed > 750 ? 10 : 6;
      const spreadAngle = normalX > 0 ? 0 : Math.PI;

      for (let i = 0; i < count; i++) {
        const angle = spreadAngle + (Math.random() - 0.5) * 2.1;
        const speed = 70 + Math.random() * 170;
        const isJellyDrop = i % 2 === 0;
        this._pushParticle({
          x: x - normalX * 10,
          y: y + (Math.random() - 0.5) * 12,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 35,
          radius: isJellyDrop ? 2.5 + Math.random() * 3.2 : 2 + Math.random() * 2,
          life: 0,
          maxLife: 0.28 + Math.random() * 0.22,
          gravity: isJellyDrop ? 520 : 120,
          color: isJellyDrop ? color : 'rgba(200, 225, 255, 0.75)'
        });
      }

      this._pushRing({
        x: x - normalX * 14,
        y,
        radius: 6,
        maxRadius: 34,
        life: 0,
        maxLife: 0.26,
        color
      });
    }

    spawnLaunchBurst(x, y, dirX, dirY, strength, tempo = 1, colorPrimary = COLORS.jellyPrimary) {
      const count = 6 + Math.floor(strength * 5) + (tempo >= 3 ? 3 : 0);
      const backAngle = Math.atan2(-dirY, -dirX);

      for (let i = 0; i < count; i++) {
        const angle = backAngle + (Math.random() - 0.5) * 1.1;
        const speed = 60 + Math.random() * 150 * (0.5 + strength);
        const color =
          tempo >= 4 && i % 2 === 0
            ? COLORS.tempoGold
            : i % 3 === 0
            ? '#ffffff'
            : colorPrimary;
        this._pushParticle({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 2.2 + Math.random() * 3,
          life: 0,
          maxLife: 0.25 + Math.random() * 0.2,
          gravity: 340,
          color
        });
      }

      // Snap-back suction tear droplets clinging near wall detachment point
      for (let d = 0; d < 2; d++) {
        this._pushParticle({
          x: x - dirX * 8,
          y: y - dirY * 8 + (d === 0 ? -4 : 4),
          vx: -dirX * (25 + Math.random() * 35),
          vy: -dirY * 15 + 15,
          radius: 2.8 + strength * 1.4,
          life: 0,
          maxLife: 0.34,
          gravity: 560,
          color: colorPrimary
        });
      }

      this._pushRing({
        x,
        y,
        radius: 10,
        maxRadius: 30 + strength * 18 + (tempo >= 3 ? 8 : 0),
        life: 0,
        maxLife: 0.22,
        color: tempo >= 3 ? COLORS.tempoGold : colorPrimary
      });
    }

    spawnSparkBurst(x, y, normalX, color = '#ffb142', count = 6) {
      const baseAngle = normalX > 0 ? 0 : Math.PI;
      for (let i = 0; i < count; i++) {
        const angle = baseAngle + (Math.random() - 0.5) * 1.8;
        const speed = 60 + Math.random() * 130;
        this._pushParticle({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 20,
          radius: 1.8 + Math.random() * 2,
          life: 0,
          maxLife: 0.2 + Math.random() * 0.16,
          gravity: 380,
          color
        });
      }
    }

    spawnPopBurst(x, y) {
      const count = 24;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.25;
        const speed = 90 + Math.random() * 260;
        this._pushParticle({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 60,
          radius: 3 + Math.random() * 4.5,
          life: 0,
          maxLife: 0.45 + Math.random() * 0.3,
          gravity: 650,
          color: i % 4 === 0 ? '#ffffff' : i % 2 === 0 ? COLORS.jellyPrimary : COLORS.jellySecondary
        });
      }

      this._pushRing({
        x,
        y,
        radius: 10,
        maxRadius: 68,
        life: 0,
        maxLife: 0.34,
        color: COLORS.jellyPrimary
      });
    }

    update(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          this.particles.splice(i, 1);
          continue;
        }
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.life += dt;
        if (r.life >= r.maxLife) {
          this.rings.splice(i, 1);
        }
      }

      for (let i = this.labels.length - 1; i >= 0; i--) {
        const l = this.labels[i];
        l.life += dt;
        if (l.life >= l.maxLife) {
          this.labels.splice(i, 1);
          continue;
        }
        l.y += l.vy * dt;
        l.vy *= Math.exp(-3 * dt);
      }

      for (let i = this.wallSplats.length - 1; i >= 0; i--) {
        const s = this.wallSplats[i];
        s.life += dt;
        if (s.life >= s.maxLife) {
          this.wallSplats.splice(i, 1);
          continue;
        }
        const dripDecel = Math.exp(-1.1 * s.life);
        s.dripLen += s.dripSpeed * dripDecel * dt;
      }

      for (let i = this.debris.length - 1; i >= 0; i--) {
        const d = this.debris[i];
        d.life += dt;
        if (d.life >= d.maxLife) {
          this.debris.splice(i, 1);
          continue;
        }
        d.vy += 740 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.rot += d.rotSpeed * dt;
        if (d.x <= 22 && d.vx < 0) {
          d.x = 22;
          d.vx = Math.abs(d.vx) * 0.55;
        } else if (d.x >= 428 && d.vx > 0) {
          d.x = 428;
          d.vx = -Math.abs(d.vx) * 0.55;
        }
      }
    }

    draw(ctx, cameraY) {
      // Jagged impact slime splatters painted flush to the wall edge + scattered splash droplets
      for (let i = 0; i < this.wallSplats.length; i++) {
        const s = this.wallSplats[i];
        const sy = s.y - cameraY;
        if (sy + s.spanDown + s.dripLen < -25 || sy - s.spanUp > 765) continue;
        const alpha = (1 - Math.pow(s.life / s.maxLife, 1.8)) * 0.68;
        const dir = s.side < 0 ? 1 : -1;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = s.color;

        // Flat wall-flush anchor spine expanding outward into irregular splashed impact fingers
        ctx.beginPath();
        ctx.moveTo(s.x - dir * 1.5, sy - s.spanUp);
        let prevX = s.x + dir * 1.5;
        let prevY = sy - s.spanUp * 0.75;
        for (let k = 0; k < s.lobes.length; k++) {
          const lb = s.lobes[k];
          const lx = s.x + dir * lb.reach;
          const ly = sy + lb.dy;
          ctx.quadraticCurveTo((prevX + lx) * 0.5 - dir * 1.5, (prevY + ly) * 0.5, lx, ly);
          prevX = lx;
          prevY = ly;
        }
        ctx.quadraticCurveTo(prevX * 0.5 + (s.x + dir * 2) * 0.5, sy + s.spanDown * 0.85, s.x - dir * 1.5, sy + s.spanDown);
        ctx.closePath();
        ctx.fill();

        // Thin vertical gravity drip oozing straight down along the wall seam
        const dripEndY = sy + s.spanDown + s.dripLen;
        ctx.beginPath();
        ctx.moveTo(s.x - dir * 0.5, sy + s.spanDown - 2);
        ctx.lineTo(s.x + dir * 2.1, sy + s.spanDown);
        ctx.lineTo(s.x + dir * 1.2, dripEndY);
        ctx.arc(s.x + dir * 0.8, dripEndY, 1.55, 0, Math.PI * 2);
        ctx.fill();

        // Scattered micro splash droplets broken off from impact
        for (let d = 0; d < s.dots.length; d++) {
          const dtPt = s.dots[d];
          ctx.beginPath();
          ctx.arc(s.x + dir * dtPt.dx, sy + dtPt.dy, dtPt.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Tumbling rock debris shards
      for (let i = 0; i < this.debris.length; i++) {
        const d = this.debris[i];
        const sy = d.y - cameraY;
        if (sy < -30 || sy > 760) continue;
        const alpha = 1 - Math.pow(d.life / d.maxLife, 2);
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(d.x, sy);
        ctx.rotate(d.rot);
        ctx.fillStyle = d.color;
        ctx.strokeStyle = '#18100a';
        ctx.lineWidth = 1;
        const hs = d.size * 0.5;
        ctx.beginPath();
        ctx.moveTo(-hs, -hs * 0.7);
        ctx.lineTo(hs * 0.9, -hs * 0.9);
        ctx.lineTo(hs, hs * 0.8);
        ctx.lineTo(-hs * 0.8, hs * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      for (let i = 0; i < this.rings.length; i++) {
        const r = this.rings[i];
        const t = r.life / r.maxLife;
        const radius = r.radius + (r.maxRadius - r.radius) * (1 - (1 - t) * (1 - t));
        const alpha = 1 - t;
        ctx.save();
        ctx.globalAlpha = alpha * 0.65;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = Math.max(1, 3.2 * (1 - t));
        ctx.beginPath();
        ctx.arc(r.x, r.y - cameraY, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const t = p.life / p.maxLife;
        const alpha = 1 - t * t;
        const radius = Math.max(0.5, p.radius * (1 - t * 0.55));
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y - cameraY, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (let i = 0; i < this.labels.length; i++) {
        const l = this.labels[i];
        const t = l.life / l.maxLife;
        const alpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
        const popScale = t < 0.22 ? 0.7 + (t / 0.22) * 0.42 : 1.12 - (t - 0.22) * 0.15;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(l.x, l.y - cameraY);
        ctx.scale(popScale, popScale);
        ctx.font = `700 ${l.size}px ${FONTS ? FONTS.DISPLAY : 'sans-serif'}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(8, 14, 26, 0.75)';
        ctx.strokeText(l.text, 0, 0);
        ctx.fillStyle = l.color;
        ctx.fillText(l.text, 0, 0);
        ctx.restore();
      }
    }
  }

  JellyGame.ParticleSystem = ParticleSystem;
})(window);
