(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});
  const { COLORS, FONTS } = JellyGame.CONSTANTS;

  const MAX_PARTICLES = 160;
  const MAX_RINGS = 16;
  const MAX_LABELS = 14;

  /**
   * Lightweight particle, shockwave ring & floating label system optimized for 60fps mobile Canvas.
   */
  class ParticleSystem {
    constructor() {
      this.particles = [];
      this.rings = [];
      this.labels = [];
    }

    clear() {
      this.particles.length = 0;
      this.rings.length = 0;
      this.labels.length = 0;
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

    spawnStickBurst(x, y, normalX, impactSpeed) {
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
          color: isJellyDrop ? COLORS.jellyPrimary : 'rgba(200, 225, 255, 0.75)'
        });
      }

      this._pushRing({
        x: x - normalX * 14,
        y,
        radius: 6,
        maxRadius: 34,
        life: 0,
        maxLife: 0.26,
        color: COLORS.jellyPrimary
      });
    }

    spawnLaunchBurst(x, y, dirX, dirY, strength, tempo = 1) {
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
            : COLORS.jellyPrimary;
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

      this._pushRing({
        x,
        y,
        radius: 10,
        maxRadius: 30 + strength * 18 + (tempo >= 3 ? 8 : 0),
        life: 0,
        maxLife: 0.22,
        color: tempo >= 3 ? COLORS.tempoGold : 'rgba(255, 255, 255, 0.8)'
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
    }

    draw(ctx, cameraY) {
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
