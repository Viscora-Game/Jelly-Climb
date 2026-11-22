(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});

  const ABILITIES = Object.freeze([
    {
      id: 'shield',
      kind: 'active',
      trigger: 'anytime',
      maxLevel: 10,
      primaryColor: '#36f5b0',
      accentColor: '#74f2ff',
      unlockCost: 80,
      upgradeCosts: Object.freeze([45, 65, 90, 120, 160, 210, 270, 340, 420]),
      cooldowns: Object.freeze([60, 55, 50, 45, 40, 36, 32, 28, 24, 20])
    },
    {
      id: 'airDash',
      kind: 'active',
      trigger: 'airborne',
      maxLevel: 10,
      primaryColor: '#48dbfb',
      accentColor: '#ffeaa7',
      unlockCost: 110,
      upgradeCosts: Object.freeze([55, 80, 110, 145, 190, 245, 310, 385, 470]),
      cooldowns: Object.freeze([60, 55, 50, 45, 40, 36, 32, 28, 24, 20])
    },
    {
      id: 'chrono',
      kind: 'active_or_fatal',
      trigger: 'anytime',
      maxLevel: 10,
      primaryColor: '#74f2ff',
      accentColor: '#a78bfa',
      unlockCost: 160,
      upgradeCosts: Object.freeze([75, 110, 150, 200, 260, 330, 410, 500, 620]),
      cooldowns: Object.freeze([90, 82, 74, 67, 60, 53, 47, 41, 35, 30])
    },
    {
      id: 'angel',
      kind: 'passive',
      trigger: 'fatal',
      maxLevel: 10,
      primaryColor: '#ffd166',
      accentColor: '#fff3b0',
      unlockCost: 300,
      upgradeCosts: Object.freeze([140, 195, 260, 340, 440, 560, 700, 880, 1100]),
      chargesByLevel: Object.freeze([1, 1, 1, 1, 2, 2, 2, 2, 2, 3]),
      // Meaningful per-level progression: Lv 2+ grants 1-hit Post-Revive Shield,
      // higher rescue ascent, longer grace invulnerability, and Lv 7+ Divine Shockwave!
      shieldOnReviveByLevel: Object.freeze([false, true, true, true, true, true, true, true, true, true]),
      rescueLiftByLevel: Object.freeze([36, 52, 92, 128, 140, 178, 192, 224, 258, 296]),
      invulnSecByLevel: Object.freeze([1.4, 1.6, 1.9, 2.3, 2.5, 2.8, 3.1, 3.4, 3.7, 4.2]),
      shockwaveByLevel: Object.freeze([false, false, false, false, false, false, true, true, true, true])
    }
  ]);

  const BY_ID = Object.create(null);
  for (let i = 0; i < ABILITIES.length; i++) {
    BY_ID[ABILITIES[i].id] = ABILITIES[i];
  }

  function getById(id) {
    return BY_ID[id] || null;
  }

  function clampLevel(lvl) {
    const n = Math.floor(Number(lvl) || 0);
    return n < 0 ? 0 : n > 10 ? 10 : n;
  }

  function getCooldown(id, level) {
    const def = getById(id);
    if (!def || !def.cooldowns) return 0;
    const idx = Math.max(0, Math.min(def.cooldowns.length - 1, clampLevel(level) - 1));
    return def.cooldowns[idx];
  }

  function getCharges(id, level) {
    const def = getById(id);
    if (!def || !def.chargesByLevel) return 0;
    const lvl = clampLevel(level);
    if (lvl <= 0) return 0;
    const idx = Math.max(0, Math.min(def.chargesByLevel.length - 1, lvl - 1));
    return def.chargesByLevel[idx];
  }

  function getAngelSpec(level) {
    const def = getById('angel');
    const lvl = clampLevel(level);
    if (!def || lvl <= 0) {
      return { charges: 0, grantShield: false, rescueLift: 36, invulnSec: 1.4, shockwave: false };
    }
    const idx = Math.max(0, Math.min(9, lvl - 1));
    return {
      charges: def.chargesByLevel ? def.chargesByLevel[idx] : 1,
      grantShield: Boolean(def.shieldOnReviveByLevel && def.shieldOnReviveByLevel[idx]),
      rescueLift: def.rescueLiftByLevel ? def.rescueLiftByLevel[idx] : 36,
      invulnSec: def.invulnSecByLevel ? def.invulnSecByLevel[idx] : 1.5,
      shockwave: Boolean(def.shockwaveByLevel && def.shockwaveByLevel[idx])
    };
  }

  function getNextUpgradeCost(id, currentLevel) {
    const def = getById(id);
    if (!def) return null;
    const lvl = clampLevel(currentLevel);
    if (lvl === 0) return def.unlockCost;
    if (lvl >= def.maxLevel) return null;
    return def.upgradeCosts[lvl - 1];
  }

  /**
   * Hand-inked cel-shaded cartoon artwork for each Jelly Power emblem.
   */
  function drawIcon(ctx, id, cx, cy, size, time = 0) {
    const def = getById(id);
    if (!def) return;

    const ink = '#1b1136';
    ctx.save();
    ctx.translate(cx, cy);
    const pulse = 1 + Math.sin(time * 3.4) * 0.04;
    ctx.scale(pulse, pulse);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (id === 'shield') {
      // Chunky inked cartoon crystal shield with bright top facet
      const r = size * 0.92;
      const traceShield = () => {
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.88, -r * 0.44);
        ctx.lineTo(r * 0.74, r * 0.42);
        ctx.lineTo(0, r * 0.98);
        ctx.lineTo(-r * 0.74, r * 0.42);
        ctx.lineTo(-r * 0.88, -r * 0.44);
        ctx.closePath();
      };

      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, '#a6ffe2');
      g.addColorStop(0.55, '#2ae8a4');
      g.addColorStop(1, '#099672');
      ctx.fillStyle = g;
      traceShield();
      ctx.fill();

      // Right-half cel shade
      ctx.fillStyle = 'rgba(13, 82, 68, 0.28)';
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.94);
      ctx.lineTo(r * 0.84, -r * 0.42);
      ctx.lineTo(r * 0.7, r * 0.4);
      ctx.lineTo(0, r * 0.92);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(2, size * 0.17);
      traceShield();
      ctx.stroke();

      // Specular gleam
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.3, -r * 0.28, r * 0.18, r * 0.34, -0.35, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === 'airDash') {
      // Bold cartoon twin rocket chevrons with thick ink outlines
      const s = size * 0.86;
      for (let i = 0; i < 2; i++) {
        const yOff = i === 0 ? -s * 0.24 : s * 0.36;
        const traceChev = () => {
          ctx.beginPath();
          ctx.moveTo(-s * 0.8, yOff + s * 0.44);
          ctx.lineTo(0, yOff - s * 0.32);
          ctx.lineTo(s * 0.8, yOff + s * 0.44);
        };
        ctx.strokeStyle = ink;
        ctx.lineWidth = i === 0 ? 7.2 : 6.2;
        traceChev();
        ctx.stroke();

        ctx.strokeStyle = i === 0 ? '#ffe875' : '#48dbfb';
        ctx.lineWidth = i === 0 ? 3.8 : 3.1;
        traceChev();
        ctx.stroke();
      }

      // Comic speed puff dots
      for (const sx of [-s * 0.56, s * 0.56]) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(sx, s * 0.76, 2.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (id === 'chrono') {
      // Inked cartoon rewind clock badge + hourglass
      const r = size * 0.88;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 5.4;
      ctx.beginPath();
      ctx.arc(0, 0, r, -Math.PI * 0.85, Math.PI * 0.65);
      ctx.stroke();

      ctx.strokeStyle = '#6ceeff';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(0, 0, r, -Math.PI * 0.85, Math.PI * 0.65);
      ctx.stroke();

      const ax = Math.cos(-Math.PI * 0.85) * r;
      const ay = Math.sin(-Math.PI * 0.85) * r;
      ctx.fillStyle = '#c49eff';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(ax - 4.2, ay + 4.8);
      ctx.lineTo(ax - 2.6, ay - 4.2);
      ctx.lineTo(ax + 5.2, ay + 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Chunky golden hourglass inside
      const hg = r * 0.48;
      ctx.fillStyle = '#ffe875';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-hg, -hg);
      ctx.lineTo(hg, -hg);
      ctx.lineTo(0, 0);
      ctx.lineTo(hg, hg);
      ctx.lineTo(-hg, hg);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (id === 'angel') {
      // Bold cartoon angel wings + golden halo
      const s = size * 0.9;
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#fff9df';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(side * s * 0.14, s * 0.12);
        ctx.quadraticCurveTo(side * s * 0.98, -s * 0.58, side * s * 1.06, -s * 0.08);
        ctx.quadraticCurveTo(side * s * 0.88, s * 0.26, side * s * 0.66, s * 0.36);
        ctx.quadraticCurveTo(side * s * 0.72, s * 0.56, side * s * 0.38, s * 0.58);
        ctx.quadraticCurveTo(side * s * 0.22, s * 0.42, side * s * 0.14, s * 0.12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Chunky inked golden halo above wings
      ctx.strokeStyle = ink;
      ctx.lineWidth = 5.4;
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.52, s * 0.46, s * 0.18, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#ffd147';
      ctx.lineWidth = 2.8;
      ctx.stroke();
    }

    ctx.restore();
  }

  JellyGame.Abilities = Object.freeze({
    LIST: ABILITIES,
    BY_ID,
    getById,
    clampLevel,
    getCooldown,
    getCharges,
    getAngelSpec,
    getNextUpgradeCost,
    drawIcon
  });
})(window);
