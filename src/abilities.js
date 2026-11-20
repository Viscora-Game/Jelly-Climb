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
      unlockCost: 350,
      upgradeCosts: Object.freeze([220, 300, 400, 550, 650, 700, 900, 1150, 1600]),
      chargesByLevel: Object.freeze([1, 1, 1, 1, 2, 2, 2, 2, 2, 3])
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

  function getNextUpgradeCost(id, currentLevel) {
    const def = getById(id);
    if (!def) return null;
    const lvl = clampLevel(currentLevel);
    if (lvl === 0) return def.unlockCost;
    if (lvl >= def.maxLevel) return null;
    return def.upgradeCosts[lvl - 1];
  }

  /**
   * Handcrafted geometric vector artwork for each Jelly Power emblem.
   */
  function drawIcon(ctx, id, cx, cy, size, time = 0) {
    const def = getById(id);
    if (!def) return;

    ctx.save();
    ctx.translate(cx, cy);
    const pulse = 1 + Math.sin(time * 3.4) * 0.04;
    ctx.scale(pulse, pulse);

    if (id === 'shield') {
      // Faceted Cryo-Crystal Hexagon Shield
      const r = size * 0.88;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.86, -r * 0.42);
      ctx.lineTo(r * 0.72, r * 0.42);
      ctx.lineTo(0, r * 0.96);
      ctx.lineTo(-r * 0.72, r * 0.42);
      ctx.lineTo(-r * 0.86, -r * 0.42);
      ctx.closePath();

      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, '#9bffdb');
      g.addColorStop(0.55, '#36f5b0');
      g.addColorStop(1, '#0abde3');
      ctx.fillStyle = g;
      ctx.strokeStyle = '#e6fffb';
      ctx.lineWidth = 1.7;
      ctx.fill();
      ctx.stroke();

      // Inner crystal facet reflection
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-r * 0.38, -r * 0.34);
      ctx.lineTo(0, -r * 0.56);
      ctx.lineTo(r * 0.38, -r * 0.34);
      ctx.moveTo(0, -r * 0.56);
      ctx.lineTo(0, r * 0.52);
      ctx.stroke();
    } else if (id === 'airDash') {
      // Twin Hydro-Jet Boost Chevrons + Droplet Pearls
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const s = size * 0.82;

      for (let i = 0; i < 2; i++) {
        const yOff = i === 0 ? -s * 0.28 : s * 0.34;
        ctx.strokeStyle = i === 0 ? '#ffeaa7' : '#48dbfb';
        ctx.lineWidth = i === 0 ? 3.2 : 2.6;
        ctx.beginPath();
        ctx.moveTo(-s * 0.78, yOff + s * 0.44);
        ctx.lineTo(0, yOff - s * 0.28);
        ctx.lineTo(s * 0.78, yOff + s * 0.44);
        ctx.stroke();
      }

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-s * 0.55, s * 0.74, 1.8, 0, Math.PI * 2);
      ctx.arc(s * 0.55, s * 0.74, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === 'chrono') {
      // Chronos Rewind Arc Ring + Inner Hourglass
      const r = size * 0.86;
      ctx.strokeStyle = '#74f2ff';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, r, -Math.PI * 0.85, Math.PI * 0.65);
      ctx.stroke();

      // Reverse counter-clockwise arrowhead at top-left
      const ax = Math.cos(-Math.PI * 0.85) * r;
      const ay = Math.sin(-Math.PI * 0.85) * r;
      ctx.fillStyle = '#a78bfa';
      ctx.beginPath();
      ctx.moveTo(ax - 3.5, ay + 4.5);
      ctx.lineTo(ax - 2.5, ay - 3.5);
      ctx.lineTo(ax + 4.5, ay + 0.5);
      ctx.closePath();
      ctx.fill();

      // Stylized crystal hourglass core
      const hg = r * 0.48;
      ctx.fillStyle = 'rgba(167, 139, 250, 0.35)';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
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
      // Symmetrical Bioluminescent Seraph Wings + Floating Halo
      const s = size * 0.88;
      ctx.fillStyle = '#fff5bd';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.4;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * s * 0.14, s * 0.1);
        ctx.quadraticCurveTo(side * s * 0.96, -s * 0.56, side * s * 1.06, -s * 0.08);
        ctx.quadraticCurveTo(side * s * 0.88, s * 0.25, side * s * 0.66, s * 0.34);
        ctx.quadraticCurveTo(side * s * 0.72, s * 0.54, side * s * 0.38, s * 0.56);
        ctx.quadraticCurveTo(side * s * 0.22, s * 0.42, side * s * 0.14, s * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Halo ellipse above wings
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.52, s * 0.44, s * 0.16, 0, 0, Math.PI * 2);
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
    getNextUpgradeCost,
    drawIcon
  });
})(window);
