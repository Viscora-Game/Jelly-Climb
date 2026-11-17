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

      // Gentle magnetic pull when flying jelly comes close
      if (player && player.alive && !player.isAttached()) {
        const dx = player.positionX - this.x;
        const dy = player.positionY - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1 && dist < C.HITBOX.PLAYER_MAGNET_RADIUS) {
          const pull = (1 - dist / C.HITBOX.PLAYER_MAGNET_RADIUS) * 320 * dt;
          this.x += (dx / dist) * pull;
          this.baseY += (dy / dist) * pull;
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
      if (sy < -40 || sy > C.HEIGHT + 40) return;

      const pulse = 1 + Math.sin(this.phase * 1.6) * 0.08;
      const r = 10.5 * pulse;

      ctx.save();
      ctx.translate(this.x, sy);

      // Soft golden halo
      const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 1.9);
      halo.addColorStop(0, 'rgba(255, 210, 80, 0.42)');
      halo.addColorStop(1, 'rgba(255, 183, 3, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.9, 0, Math.PI * 2);
      ctx.fill();

      // Faceted star-drop diamond shape
      ctx.rotate(Math.sin(this.phase * 0.7) * 0.14);
      const bodyGrad = ctx.createLinearGradient(0, -r, 0, r);
      bodyGrad.addColorStop(0, C.COLORS.collectCore);
      bodyGrad.addColorStop(0.55, '#ffd166');
      bodyGrad.addColorStop(1, C.COLORS.collectOuter);

      ctx.fillStyle = bodyGrad;
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.15);
      ctx.quadraticCurveTo(r * 0.95, -r * 0.15, r * 0.8, r * 0.32);
      ctx.quadraticCurveTo(0, r * 1.12, 0, r * 1.05);
      ctx.quadraticCurveTo(0, r * 1.12, -r * 0.8, r * 0.32);
      ctx.quadraticCurveTo(-r * 0.95, -r * 0.15, 0, -r * 1.15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Crisp specular facet
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.25, -r * 0.28, r * 0.22, r * 0.36, -0.35, 0, Math.PI * 2);
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
      if (sy < -40 || sy > C.HEIGHT + 40) return;

      const pulse = 1 + Math.sin(this.phase * 1.8) * 0.07;
      const r = 13.5 * pulse;

      ctx.save();
      ctx.translate(this.x, sy);

      // Iridescent aqua halo
      const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 1.9);
      halo.addColorStop(0, 'rgba(72, 219, 251, 0.38)');
      halo.addColorStop(1, 'rgba(72, 219, 251, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.9, 0, Math.PI * 2);
      ctx.fill();

      // Soap-bubble sphere
      const bubGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
      bubGrad.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
      bubGrad.addColorStop(0.55, 'rgba(72, 219, 251, 0.35)');
      bubGrad.addColorStop(1, 'rgba(162, 155, 254, 0.65)');
      ctx.fillStyle = bubGrad;
      ctx.strokeStyle = '#74f2ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Mini shield crest inside bubble
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.moveTo(0, -5.5);
      ctx.lineTo(5, -3);
      ctx.lineTo(4, 2.5);
      ctx.lineTo(0, 6);
      ctx.lineTo(-4, 2.5);
      ctx.lineTo(-5, -3);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  JellyGame.Collectible = Collectible;
  JellyGame.ShieldCollectible = ShieldCollectible;
})(window);
