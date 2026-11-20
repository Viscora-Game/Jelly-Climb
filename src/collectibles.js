(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});
  const C = JellyGame.CONSTANTS;

  /**
   * Collectible "Jel Özü" floating along safe climbing arcs.
   */
  class Collectible {
    constructor(x, y) {
      this.itemType = 'drop';
      this.x = x;
      this.baseY = y;
      this.y = y;
      this.radius = C.HITBOX.COLLECTIBLE_RADIUS;
      this.collected = false;
      this.phase = Math.random() * Math.PI * 2;
    }

    getHitbox() {
      return {
        type: 'circle',
        x: this.x,
        y: this.y,
        r: this.radius
      };
    }

    update(dt, player) {
      if (this.collected) return;
      this.phase += dt * 3.8;

      // Snappy magnetic curve pull when flying jelly sweeps close
      if (player && player.alive && !player.isAttached()) {
        const dx = player.positionX - this.x;
        const dy = player.positionY - this.y;
        const dist = Math.hypot(dx, dy);
        const magR = (C.HITBOX.PLAYER_MAGNET_RADIUS || 70) * 1.18;
        if (dist > 1 && dist < magR) {
          const proximity = 1 - dist / magR;
          const pull = (160 + proximity * proximity * 640) * dt;
          const step = Math.min(dist, pull);
          this.x += (dx / dist) * step;
          this.baseY += (dy / dist) * step;
        }
      }

      this.y = this.baseY + Math.sin(this.phase) * 4.5;
    }

    checkPickup(player) {
      if (this.collected || !player.alive) return false;
      const dx = player.positionX - this.x;
      const dy = player.positionY - this.y;
      const hitDist = C.HITBOX.PLAYER_PICKUP_RADIUS + this.radius;
      return dx * dx + dy * dy <= hitDist * hitDist;
    }

    draw(ctx, cameraY) {
      if (this.collected) return;
      const sy = this.y - cameraY;
      if (!JellyGame.isScreenYVisible(sy, 40)) return;

      const pulse = 1 + Math.sin(this.phase * 1.6) * 0.08;
      const r = 11 * pulse;
      const ink = C.COLORS.ink || '#1b1136';

      ctx.save();
      ctx.translate(this.x, sy);

      // Subtle warm golden comic sparkle ring
      const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 1.7);
      halo.addColorStop(0, 'rgba(255, 224, 96, 0.35)');
      halo.addColorStop(1, 'rgba(255, 183, 3, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2);
      ctx.fill();

      // Faceted cartoon star-drop crystal with cel-shaded split & thick comic ink outline
      ctx.rotate(Math.sin(this.phase * 0.7) * 0.14);
      const traceGem = () => {
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.18);
        ctx.lineTo(r * 0.92, 0);
        ctx.lineTo(0, r * 1.18);
        ctx.lineTo(-r * 0.92, 0);
        ctx.closePath();
      };

      const bodyGrad = ctx.createLinearGradient(0, -r, 0, r);
      bodyGrad.addColorStop(0, '#fff9bd');
      bodyGrad.addColorStop(0.5, '#ffd147');
      bodyGrad.addColorStop(1, '#f08c00');

      ctx.fillStyle = bodyGrad;
      traceGem();
      ctx.fill();

      // Right-half amber cel-shade
      ctx.fillStyle = 'rgba(214, 90, 0, 0.34)';
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.14);
      ctx.lineTo(r * 0.88, 0);
      ctx.lineTo(0, r * 1.14);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      traceGem();
      ctx.stroke();

      // Crisp specular comic gleam
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.25, -r * 0.3, r * 0.2, r * 0.34, 0.32, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  /**
   * Protective Bubble Shield pickup floating in the climbing shaft.
   */
  class ShieldCollectible {
    constructor(x, y) {
      this.itemType = 'shield';
      this.x = x;
      this.baseY = y;
      this.y = y;
      this.radius = C.HITBOX.SHIELD_RADIUS || 15;
      this.collected = false;
      this.phase = Math.random() * Math.PI * 2;
    }

    getHitbox() {
      return {
        type: 'circle',
        x: this.x,
        y: this.y,
        r: this.radius
      };
    }

    update(dt, player) {
      if (this.collected) return;
      this.phase += dt * 3.2;

      if (player && player.alive && !player.isAttached()) {
        const dx = player.positionX - this.x;
        const dy = player.positionY - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1 && dist < C.HITBOX.PLAYER_MAGNET_RADIUS) {
          const pull = (1 - dist / C.HITBOX.PLAYER_MAGNET_RADIUS) * 280 * dt;
          this.x += (dx / dist) * pull;
          this.baseY += (dy / dist) * pull;
        }
      }

      this.y = this.baseY + Math.sin(this.phase) * 5;
    }

    checkPickup(player) {
      if (this.collected || !player.alive) return false;
      const dx = player.positionX - this.x;
      const dy = player.positionY - this.y;
      const hitDist = C.HITBOX.PLAYER_PICKUP_RADIUS + this.radius;
      return dx * dx + dy * dy <= hitDist * hitDist;
    }

    draw(ctx, cameraY) {
      if (this.collected) return;
      const sy = this.y - cameraY;
      if (!JellyGame.isScreenYVisible(sy, 40)) return;

      const pulse = 1 + Math.sin(this.phase * 1.8) * 0.07;
      const r = 13.5 * pulse;
      const ink = C.COLORS.ink || '#1b1136';

      ctx.save();
      ctx.translate(this.x, sy);

      // Cartoon soap-bubble sphere with crisp ink rim & bright crescent shine
      ctx.fillStyle = 'rgba(116, 242, 255, 0.28)';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#8ef5ff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, r - 2.2, 0, Math.PI * 2);
      ctx.stroke();

      // Bold comic shield crest inside bubble
      ctx.fillStyle = '#6affc9';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -6.5);
      ctx.lineTo(6, -3.5);
      ctx.lineTo(5, 3);
      ctx.lineTo(0, 7);
      ctx.lineTo(-5, 3);
      ctx.lineTo(-6, -3.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.24, r * 0.12, -0.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  JellyGame.Collectible = Collectible;
  JellyGame.ShieldCollectible = ShieldCollectible;
})(window);
