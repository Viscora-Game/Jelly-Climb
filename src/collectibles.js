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

    update(dt, player, magnetActive = false) {
      if (this.collected) return;
      this.phase += dt * 3.8;

      // Snappy magnetic curve pull (expanded dramatically while Super Magnet power-up is active!)
      if (player && player.alive && (magnetActive || !player.isAttached())) {
        const dx = player.positionX - this.x;
        const dy = player.positionY - this.y;
        const dist = Math.hypot(dx, dy);
        const magR = magnetActive ? 310 : (C.HITBOX.PLAYER_MAGNET_RADIUS || 70) * 1.18;
        if (dist > 1 && dist < magR) {
          const proximity = 1 - dist / magR;
          const pull = magnetActive
            ? (360 + proximity * proximity * 780) * dt
            : (160 + proximity * proximity * 640) * dt;
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

  /**
   * Rare Super Magnet pickup — grants 7 seconds of full-screen Jel Özü attraction!
   */
  class MagnetCollectible {
    constructor(x, y) {
      this.itemType = 'magnet';
      this.x = x;
      this.baseY = y;
      this.y = y;
      this.radius = C.HITBOX.SHIELD_RADIUS || 15;
      this.collected = false;
      this.phase = Math.random() * Math.PI * 2;
    }

    getHitbox() {
      return { type: 'circle', x: this.x, y: this.y, r: this.radius };
    }

    update(dt, player) {
      if (this.collected) return;
      this.phase += dt * 3.5;

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

      const pulse = 1 + Math.sin(this.phase * 2.0) * 0.08;
      const r = 13.8 * pulse;
      const ink = C.COLORS.ink || '#1b1136';

      ctx.save();
      ctx.translate(this.x, sy);

      // Electric magenta-gold outer aura halo
      const halo = ctx.createRadialGradient(0, 0, 3, 0, 0, r * 1.9);
      halo.addColorStop(0, 'rgba(255, 224, 102, 0.45)');
      halo.addColorStop(0.55, 'rgba(255, 92, 138, 0.22)');
      halo.addColorStop(1, 'rgba(255, 92, 138, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.9, 0, Math.PI * 2);
      ctx.fill();

      // Chunky inked orb shell
      ctx.fillStyle = 'rgba(255, 232, 138, 0.26)';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Handcrafted cel-shaded cartoon horseshoe U-magnet
      ctx.rotate(Math.sin(this.phase * 0.9) * 0.16);
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'round';
      // Ink outer outline
      ctx.strokeStyle = ink;
      ctx.lineWidth = 7.6;
      ctx.beginPath();
      ctx.arc(0, -1, 6.2, 0, Math.PI, false);
      ctx.moveTo(-6.2, -1);
      ctx.lineTo(-6.2, -5.8);
      ctx.moveTo(6.2, -1);
      ctx.lineTo(6.2, -5.8);
      ctx.stroke();

      // Crimson red U-body
      ctx.strokeStyle = '#ff4757';
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.arc(0, -1, 6.2, 0, Math.PI, false);
      ctx.moveTo(-6.2, -1);
      ctx.lineTo(-6.2, -3.2);
      ctx.moveTo(6.2, -1);
      ctx.lineTo(6.2, -3.2);
      ctx.stroke();

      // Silver-white magnetic tips
      ctx.fillStyle = '#edf6ff';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.4;
      ctx.fillRect(-8.3, -6.8, 4.2, 3.8);
      ctx.strokeRect(-8.3, -6.8, 4.2, 3.8);
      ctx.fillRect(4.1, -6.8, 4.2, 3.8);
      ctx.strokeRect(4.1, -6.8, 4.2, 3.8);

      // Tiny electric spark arcs leaping between tips
      ctx.strokeStyle = '#fff5b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-3.2, -7.8);
      ctx.quadraticCurveTo(0, -10.8 + Math.sin(this.phase * 4) * 1.4, 3.2, -7.8);
      ctx.stroke();

      ctx.restore();
    }
  }

  JellyGame.Collectible = Collectible;
  JellyGame.ShieldCollectible = ShieldCollectible;
  JellyGame.MagnetCollectible = MagnetCollectible;
})(window);
