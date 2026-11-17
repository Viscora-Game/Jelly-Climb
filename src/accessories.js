(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});

  const ACCESSORIES = Object.freeze([
    { id: 'none', name: 'Sade Jel', cost: 0 },
    { id: 'leaf', name: 'Minik Filiz', cost: 12 },
    { id: 'glasses', name: 'Havalı Gözlük', cost: 25 },
    { id: 'headband', name: 'Ninja Bandı', cost: 45 },
    { id: 'beanie', name: 'Pervane Şapka', cost: 70 },
    { id: 'crown', name: 'Altın Taç', cost: 100 }
  ]);

  function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
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
  }

  /**
   * Draws an accessory in local upright jelly coordinates (around radius r).
   */
  function drawAccessory(ctx, id, r, lookX = 0, lookY = 0, time = 0, speedRatio = 0) {
    if (!id || id === 'none') return;

    const eyeOffsetX = clamp(lookX * 3.8, -4.5, 4.5);
    const eyeOffsetY = clamp(lookY * 3.4, -4.0, 4.0);

    ctx.save();

    if (id === 'leaf') {
      // Cute green sprout growing cleanly from the top of the jelly head
      const sway = Math.sin(time * 4.5) * 0.12 - clamp(lookX * 0.25, -0.35, 0.35);
      ctx.translate(eyeOffsetX * 0.35, -r + 1);
      ctx.rotate(sway);

      ctx.strokeStyle = '#187a48';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.quadraticCurveTo(1, -5, 0, -9);
      ctx.stroke();

      // Right leaf
      ctx.fillStyle = '#55efc4';
      ctx.strokeStyle = '#187a48';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(5, -10, 6.2, 3.3, -0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Smaller left bud leaf
      ctx.fillStyle = '#00b894';
      ctx.beginPath();
      ctx.ellipse(-4, -8.5, 4.4, 2.5, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (id === 'glasses') {
      // Sleek dark arcade sunglasses resting cleanly over the eyes
      ctx.translate(eyeOffsetX, eyeOffsetY - 0.5);

      // Bridge & rims
      ctx.fillStyle = '#141923';
      ctx.strokeStyle = '#2d3748';
      ctx.lineWidth = 1.4;

      // Left lens
      roundRectPath(ctx, -11.5, -3.8, 9.5, 7, 2.2);
      ctx.fill();
      ctx.stroke();

      // Right lens
      roundRectPath(ctx, 2, -3.8, 9.5, 7, 2.2);
      ctx.fill();
      ctx.stroke();

      // Nose bridge
      ctx.fillRect(-2.5, -2.5, 5, 2.2);

      // Crisp diagonal reflection shine
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-9.5, -1.8);
      ctx.lineTo(-6.5, 1.4);
      ctx.moveTo(4, -1.8);
      ctx.lineTo(7, 1.4);
      ctx.stroke();
    } else if (id === 'headband') {
      // Coral-crimson headband wrapped neatly across the forehead with fluttering ribbon tails
      ctx.fillStyle = '#ff4757';
      ctx.strokeStyle = '#b32432';
      ctx.lineWidth = 1.4;

      roundRectPath(ctx, -r * 0.94, -r * 0.46, r * 1.88, 5.8, 2.8);
      ctx.fill();
      ctx.stroke();

      // Center metal badge
      ctx.fillStyle = '#dfe6e9';
      roundRectPath(ctx, eyeOffsetX - 4.2, -r * 0.46 + 0.8, 8.4, 4.2, 1.5);
      ctx.fill();

      // Trailing ribbon tails on the side opposite facing direction
      const tailSide = lookX >= 0 ? -1 : 1;
      const flutter = Math.sin(time * (8 + speedRatio * 10)) * (2.5 + speedRatio * 3.5);
      ctx.strokeStyle = '#ff4757';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailSide * (r * 0.85), -r * 0.34);
      ctx.quadraticCurveTo(
        tailSide * (r + 6),
        -r * 0.34 + flutter * 0.5,
        tailSide * (r + 12),
        -r * 0.22 + flutter
      );
      ctx.moveTo(tailSide * (r * 0.85), -r * 0.24);
      ctx.quadraticCurveTo(
        tailSide * (r + 5),
        -r * 0.14 - flutter * 0.3,
        tailSide * (r + 10),
        -r * 0.04 - flutter * 0.8
      );
      ctx.stroke();
    } else if (id === 'beanie') {
      // Playful striped propeller cap on top of head
      ctx.translate(eyeOffsetX * 0.25, -r + 3);

      // Dome cap
      ctx.fillStyle = '#48dbfb';
      ctx.strokeStyle = '#1e272e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 10.5, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Center bright stripe
      ctx.fillStyle = '#ff9f43';
      ctx.beginPath();
      ctx.moveTo(-3.5, 0);
      ctx.quadraticCurveTo(0, -13.5, 3.5, 0);
      ctx.closePath();
      ctx.fill();

      // Rim band
      ctx.fillStyle = '#ff6b6b';
      roundRectPath(ctx, -11.5, -2.5, 23, 3.5, 1.8);
      ctx.fill();
      ctx.stroke();

      // Propeller mast & spinning blades (spins faster while flying!)
      ctx.fillStyle = '#feca57';
      ctx.fillRect(-1.3, -14.5, 2.6, 5);
      const bladeWidth = 10 * Math.cos(time * (6 + speedRatio * 18));
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.ellipse(bladeWidth * 0.5, -14.5, Math.abs(bladeWidth * 0.5) + 1.5, 2.1, 0, 0, Math.PI * 2);
      ctx.ellipse(-bladeWidth * 0.5, -14.5, Math.abs(bladeWidth * 0.5) + 1.5, 2.1, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === 'crown') {
      // Shiny golden crown with ruby centerpiece
      ctx.translate(eyeOffsetX * 0.25, -r + 2);

      const grad = ctx.createLinearGradient(-10, -13, 10, 0);
      grad.addColorStop(0, '#ffeaa7');
      grad.addColorStop(0.5, '#ffd166');
      grad.addColorStop(1, '#f39c12');

      ctx.fillStyle = grad;
      ctx.strokeStyle = '#a86407';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-10.5, 0);
      ctx.lineTo(-12, -10.5);
      ctx.lineTo(-5, -5.5);
      ctx.lineTo(0, -13.5);
      ctx.lineTo(5, -5.5);
      ctx.lineTo(12, -10.5);
      ctx.lineTo(10.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Ruby center gem
      ctx.fillStyle = '#ff4757';
      ctx.beginPath();
      ctx.arc(0, -3.8, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  JellyGame.Accessories = {
    LIST: ACCESSORIES,
    drawAccessory,
    getById(id) {
      return ACCESSORIES.find((a) => a.id === id) || ACCESSORIES[0];
    }
  };
})(window);
