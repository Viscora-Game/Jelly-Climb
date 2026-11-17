(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});

  const ACCESSORIES = Object.freeze([
    { id: 'none', name: 'Sade Jel', unlockType: 'free', cost: 0 },
    { id: 'leaf', name: 'Minik Filiz', unlockType: 'drops', cost: 12 },
    { id: 'glasses', name: 'Havalı Gözlük', unlockType: 'drops', cost: 25 },
    { id: 'headband', name: 'Ninja Bandı', unlockType: 'drops', cost: 45 },
    { id: 'beanie', name: 'Pervane Şapka', unlockType: 'drops', cost: 70 },
    { id: 'crown', name: 'Altın Taç', unlockType: 'drops', cost: 100 },
    {
      id: 'halo',
      name: 'Yıldız Halesi',
      unlockType: 'milestone',
      cost: 0,
      milestone: Object.freeze({ stat: 'bestClassic', target: 50, bonusDrops: 10 })
    },
    {
      id: 'visor',
      name: 'Siber Vizör',
      unlockType: 'milestone',
      cost: 0,
      milestone: Object.freeze({ stat: 'bestTempo', target: 5, bonusDrops: 12 })
    },
    {
      id: 'horns',
      name: 'Lav Boynuzu',
      unlockType: 'milestone',
      cost: 0,
      milestone: Object.freeze({ stat: 'bestRising', target: 60, bonusDrops: 15 })
    },
    {
      id: 'wings',
      name: 'Kozmik Kanatlar',
      unlockType: 'milestone',
      cost: 0,
      milestone: Object.freeze({ stat: 'bestClassic', target: 120, bonusDrops: 25 })
    }
  ]);

  const SHOP_ACCESSORIES = Object.freeze(
    ACCESSORIES.filter((a) => a.unlockType !== 'milestone')
  );
  const MILESTONE_ACCESSORIES = Object.freeze(
    ACCESSORIES.filter((a) => a.unlockType === 'milestone')
  );

  function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val;
  }

  function getMilestoneCurrent(acc, stats = {}) {
    if (!acc || !acc.milestone) return 0;
    const key = acc.milestone.stat;
    if (key === 'bestClassic') return Math.max(0, stats.bestMeters || 0);
    if (key === 'bestRising') return Math.max(0, stats.bestRisingMeters || 0);
    if (key === 'bestTempo') return Math.max(1, stats.bestTempo || 1);
    return 0;
  }

  function getMilestoneProgress(acc, stats = {}) {
    if (!acc || !acc.milestone) {
      return { current: 1, target: 1, ratio: 1, met: true };
    }
    const target = acc.milestone.target;
    const current = getMilestoneCurrent(acc, stats);
    const ratio = clamp(current / target, 0, 1);
    return {
      current,
      target,
      ratio,
      met: current >= target
    };
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

      ctx.fillStyle = '#55efc4';
      ctx.strokeStyle = '#187a48';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(5, -10, 6.2, 3.3, -0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#00b894';
      ctx.beginPath();
      ctx.ellipse(-4, -8.5, 4.4, 2.5, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (id === 'glasses') {
      ctx.translate(eyeOffsetX, eyeOffsetY - 0.5);

      ctx.fillStyle = '#141923';
      ctx.strokeStyle = '#2d3748';
      ctx.lineWidth = 1.4;

      roundRectPath(ctx, -11.5, -3.8, 9.5, 7, 2.2);
      ctx.fill();
      ctx.stroke();

      roundRectPath(ctx, 2, -3.8, 9.5, 7, 2.2);
      ctx.fill();
      ctx.stroke();

      ctx.fillRect(-2.5, -2.5, 5, 2.2);

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
      ctx.fillStyle = '#ff4757';
      ctx.strokeStyle = '#b32432';
      ctx.lineWidth = 1.4;

      roundRectPath(ctx, -r * 0.94, -r * 0.46, r * 1.88, 5.8, 2.8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#dfe6e9';
      roundRectPath(ctx, eyeOffsetX - 4.2, -r * 0.46 + 0.8, 8.4, 4.2, 1.5);
      ctx.fill();

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
      ctx.translate(eyeOffsetX * 0.25, -r + 3);

      ctx.fillStyle = '#48dbfb';
      ctx.strokeStyle = '#1e272e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 10.5, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ff9f43';
      ctx.beginPath();
      ctx.moveTo(-3.5, 0);
      ctx.quadraticCurveTo(0, -13.5, 3.5, 0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ff6b6b';
      roundRectPath(ctx, -11.5, -2.5, 23, 3.5, 1.8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#feca57';
      ctx.fillRect(-1.3, -14.5, 2.6, 5);
      const bladeWidth = 10 * Math.cos(time * (6 + speedRatio * 18));
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.ellipse(bladeWidth * 0.5, -14.5, Math.abs(bladeWidth * 0.5) + 1.5, 2.1, 0, 0, Math.PI * 2);
      ctx.ellipse(-bladeWidth * 0.5, -14.5, Math.abs(bladeWidth * 0.5) + 1.5, 2.1, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === 'crown') {
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

      ctx.fillStyle = '#ff4757';
      ctx.beginPath();
      ctx.arc(0, -3.8, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === 'halo') {
      // Levitating golden-star halo gently bobbing above head
      const bob = Math.sin(time * 3.8) * 1.6;
      ctx.translate(eyeOffsetX * 0.2, -r - 7.5 + bob);

      // Soft warm outer glow
      ctx.strokeStyle = 'rgba(255, 219, 102, 0.35)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(0, 0, 11.5, 3.6, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Luminous gold halo ring
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.ellipse(0, 0, 11.5, 3.6, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#fff9d6';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(0, -0.4, 9.5, 2.5, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();

      // Orbiting 4-point star sparkle
      const starAng = time * 2.6;
      const sx = Math.cos(starAng) * 11.5;
      const sy = Math.sin(starAng) * 3.6;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(sx, sy - 3.6);
      ctx.lineTo(sx + 1.2, sy - 1.2);
      ctx.lineTo(sx + 3.6, sy);
      ctx.lineTo(sx + 1.2, sy + 1.2);
      ctx.lineTo(sx, sy + 3.6);
      ctx.lineTo(sx - 1.2, sy + 1.2);
      ctx.lineTo(sx - 3.6, sy);
      ctx.lineTo(sx - 1.2, sy - 1.2);
      ctx.closePath();
      ctx.fill();
    } else if (id === 'visor') {
      // Sleek holographic wrap-around neon cyber visor
      ctx.translate(eyeOffsetX, eyeOffsetY - 0.8);

      const vGrad = ctx.createLinearGradient(-13, -4, 13, 4);
      vGrad.addColorStop(0, '#09223a');
      vGrad.addColorStop(0.5, '#12466e');
      vGrad.addColorStop(1, '#1a1a46');

      ctx.fillStyle = vGrad;
      ctx.strokeStyle = '#48dbfb';
      ctx.lineWidth = 1.7;

      ctx.beginPath();
      ctx.moveTo(-13.2, -3.6);
      ctx.lineTo(13.2, -3.6);
      ctx.lineTo(11.6, 3.2);
      ctx.lineTo(3.2, 3.2);
      ctx.lineTo(0, 1.4);
      ctx.lineTo(-3.2, 3.2);
      ctx.lineTo(-11.6, 3.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Animated neon scan gleam across visor lens
      const sweep = ((time * 1.4) % 2) - 1; // -1..1
      const gx = sweep * 8.5;
      ctx.strokeStyle = 'rgba(130, 255, 232, 0.82)';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(gx - 2.2, -2.2);
      ctx.lineTo(gx + 1.5, 1.8);
      ctx.stroke();

      // Side temple LED accents
      ctx.fillStyle = '#ff6b9d';
      ctx.fillRect(-13.8, -1.6, 2, 3.2);
      ctx.fillRect(11.8, -1.6, 2, 3.2);
    } else if (id === 'horns') {
      // Fiery curved magma horns emerging cleanly from upper temples
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * (r * 0.62) + eyeOffsetX * 0.25, -r * 0.7);
        ctx.scale(side, 1);

        const hGrad = ctx.createLinearGradient(0, 2, 8, -14);
        hGrad.addColorStop(0, '#2a1219');
        hGrad.addColorStop(0.55, '#ff5e36');
        hGrad.addColorStop(1, '#ffd32a');

        ctx.fillStyle = hGrad;
        ctx.strokeStyle = '#180910';
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-3.5, 2.5);
        ctx.quadraticCurveTo(1, -7.5, 8.5, -13.5);
        ctx.quadraticCurveTo(6.5, -5.5, 3.8, 2.8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Subtle molten tip sheen
        ctx.fillStyle = 'rgba(255, 245, 190, 0.68)';
        ctx.beginPath();
        ctx.arc(6.6, -10.5, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (id === 'wings') {
      // Luminous cosmic crystal wings that flutter faster with speed!
      const flap =
        Math.sin(time * (4.2 + speedRatio * 14)) * (0.12 + speedRatio * 0.34);

      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * (r * 0.88), -2);
        ctx.scale(side, 1);
        ctx.rotate(-0.2 + flap);

        const wGrad = ctx.createLinearGradient(0, 0, 15, -10);
        wGrad.addColorStop(0, '#74f2ff');
        wGrad.addColorStop(0.55, '#a985ff');
        wGrad.addColorStop(1, '#f4a2ff');

        ctx.fillStyle = wGrad;
        ctx.strokeStyle = '#241b4e';
        ctx.lineWidth = 1.4;
        ctx.lineJoin = 'round';

        // Upper primary pinion
        ctx.beginPath();
        ctx.moveTo(-1, -1);
        ctx.quadraticCurveTo(9, -12, 16, -10);
        ctx.quadraticCurveTo(14, -2, 8, 2);
        ctx.quadraticCurveTo(11, 5, 5, 7);
        ctx.quadraticCurveTo(2, 6, -1, 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Inner crystal shimmer vein
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(2, -1);
        ctx.quadraticCurveTo(8, -6, 12.5, -7);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();
  }

  JellyGame.Accessories = {
    LIST: ACCESSORIES,
    SHOP_LIST: SHOP_ACCESSORIES,
    MILESTONE_LIST: MILESTONE_ACCESSORIES,
    drawAccessory,
    getMilestoneProgress,
    getById(id) {
      return ACCESSORIES.find((a) => a.id === id) || ACCESSORIES[0];
    }
  };
})(window);
