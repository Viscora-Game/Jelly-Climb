(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});

  const NONE_ACCESSORY = Object.freeze({
    id: 'none',
    name: 'Sade Jel',
    slot: 'none',
    unlockType: 'free',
    cost: 0
  });

  // Balanced arcade progression across Head (8), Face/Eyewear (7), and Back/Aura (3)
  const ACCESSORIES = Object.freeze([
    // --- HEAD / HATS (6 Drop Shop + 2 Skill Milestones) ---
    { id: 'leaf', name: 'Minik Filiz', slot: 'head', unlockType: 'drops', cost: 15 },
    { id: 'headband', name: 'Ninja Bandı', slot: 'head', unlockType: 'drops', cost: 35 },
    { id: 'cap', name: 'Sokak Şapkası', slot: 'head', unlockType: 'drops', cost: 60 },
    { id: 'beanie', name: 'Pervane Şapka', slot: 'head', unlockType: 'drops', cost: 95 },
    { id: 'wizard', name: 'Büyücü Şapkası', slot: 'head', unlockType: 'drops', cost: 140 },
    { id: 'crown', name: 'Altın Taç', slot: 'head', unlockType: 'drops', cost: 220 },
    {
      id: 'halo',
      name: 'Yıldız Halesi',
      slot: 'head',
      unlockType: 'milestone',
      cost: 0,
      milestone: Object.freeze({ stat: 'bestClassic', target: 50, bonusDrops: 15 })
    },
    {
      id: 'horns',
      name: 'Cehennem Boynuzu',
      slot: 'head',
      unlockType: 'milestone',
      cost: 0,
      milestone: Object.freeze({ stat: 'bestRising', target: 60, bonusDrops: 20 })
    },

    // --- FACE / EYEWEAR (6 Drop Shop + 1 Skill Milestone) ---
    { id: 'glasses', name: 'Havalı Gözlük', slot: 'face', unlockType: 'drops', cost: 20 },
    { id: 'roundglasses', name: 'Bilgin Gözlüğü', slot: 'face', unlockType: 'drops', cost: 45 },
    { id: 'heartglasses', name: 'Kalp Gözlük', slot: 'face', unlockType: 'drops', cost: 75 },
    { id: 'shades', name: 'Üçgen Gözlük', slot: 'face', unlockType: 'drops', cost: 115 },
    { id: 'goggles', name: 'Kaşif Gözlüğü', slot: 'face', unlockType: 'drops', cost: 165 },
    { id: 'monocle', name: 'Altın Monokl', slot: 'face', unlockType: 'drops', cost: 210 },
    {
      id: 'visor',
      name: 'Siber Vizör',
      slot: 'face',
      unlockType: 'milestone',
      cost: 0,
      milestone: Object.freeze({ stat: 'bestTempo', target: 5, bonusDrops: 18 })
    },

    // --- BACK / WINGS (1 Drop Shop + 2 Skill Milestones) ---
    { id: 'cape', name: 'Kahraman Pelerini', slot: 'back', unlockType: 'drops', cost: 180 },
    {
      id: 'jetpack',
      name: 'Sırt Roketi',
      slot: 'back',
      unlockType: 'milestone',
      cost: 0,
      milestone: Object.freeze({ stat: 'totalCloseCalls', target: 8, bonusDrops: 25 })
    },
    {
      id: 'wings',
      name: 'Kozmik Kanatlar',
      slot: 'back',
      unlockType: 'milestone',
      cost: 0,
      milestone: Object.freeze({ stat: 'bestClassic', target: 120, bonusDrops: 30 })
    }
  ]);

  const BY_ID = Object.create(null);
  for (let i = 0; i < ACCESSORIES.length; i++) {
    BY_ID[ACCESSORIES[i].id] = ACCESSORIES[i];
  }

  const BY_SLOT = Object.freeze({
    head: Object.freeze(ACCESSORIES.filter((a) => a.slot === 'head')),
    face: Object.freeze(ACCESSORIES.filter((a) => a.slot === 'face')),
    back: Object.freeze(ACCESSORIES.filter((a) => a.slot === 'back'))
  });

  const SHOP_ACCESSORIES = Object.freeze(
    ACCESSORIES.filter((a) => a.unlockType === 'drops')
  );
  const MILESTONE_ACCESSORIES = Object.freeze(
    ACCESSORIES.filter((a) => a.unlockType === 'milestone')
  );

  function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val;
  }

  function getById(id) {
    return BY_ID[id] || NONE_ACCESSORY;
  }

  /**
   * Parses string ("crown+glasses+wings", "crown") or object into clean { head, face, back } slots.
   */
  function normalizeSlots(raw) {
    const slots = { head: 'none', face: 'none', back: 'none' };
    if (!raw || raw === 'none') return slots;

    if (typeof raw === 'object' && !Array.isArray(raw)) {
      for (const slotName of ['head', 'face', 'back']) {
        const item = getById(raw[slotName]);
        if (item.id !== 'none' && item.slot === slotName) {
          slots[slotName] = item.id;
        }
      }
      return slots;
    }

    if (typeof raw === 'string') {
      const parts = raw.split('+');
      for (let i = 0; i < parts.length; i++) {
        const item = getById(parts[i].trim());
        if (item.id !== 'none' && (item.slot === 'head' || item.slot === 'face' || item.slot === 'back')) {
          slots[item.slot] = item.id;
        }
      }
    }
    return slots;
  }

  /**
   * Serializes { head, face, back } into canonical string (<= 29 chars, compatible with leaderboard DB).
   */
  function serializeSlots(slotsInput) {
    const slots = normalizeSlots(slotsInput);
    const active = [];
    if (slots.head !== 'none') active.push(slots.head);
    if (slots.face !== 'none') active.push(slots.face);
    if (slots.back !== 'none') active.push(slots.back);
    return active.length > 0 ? active.join('+') : 'none';
  }

  function getMilestoneCurrent(acc, stats = {}) {
    if (!acc || !acc.milestone) return 0;
    const key = acc.milestone.stat;
    if (key === 'bestClassic') return Math.max(0, stats.bestMeters || 0);
    if (key === 'bestRising') return Math.max(0, stats.bestRisingMeters || 0);
    if (key === 'bestTempo') return Math.max(1, stats.bestTempo || 1);
    if (key === 'totalCloseCalls') return Math.max(0, stats.totalCloseCalls || 0);
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

  function drawStar(ctx, cx, cy, outerR, innerR) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4 - Math.PI / 2;
      const rad = i % 2 === 0 ? outerR : innerR;
      const px = cx + Math.cos(ang) * rad;
      const py = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawSingleAccessory(ctx, id, r, lookX, lookY, time, speedRatio) {
    if (!id || id === 'none') return;

    const eyeOffsetX = clamp(lookX * 3.8, -4.5, 4.5);
    const eyeOffsetY = clamp(lookY * 3.4, -4.0, 4.0);

    ctx.save();

    // ==================== BACK SLOT ====================
    if (id === 'cape') {
      const sway = Math.sin(time * (4.2 + speedRatio * 9)) * (2.2 + speedRatio * 4.2);
      const trailX = clamp(-lookX * 5, -5, 5);
      const cGrad = ctx.createLinearGradient(0, -4, 0, r + 14);
      cGrad.addColorStop(0, '#ff4757');
      cGrad.addColorStop(1, '#9b1126');

      ctx.fillStyle = cGrad;
      ctx.strokeStyle = '#4f0815';
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.72, -3);
      ctx.quadraticCurveTo(-r * 1.18 + sway * 0.5, r * 0.65, -r * 1.05 + trailX + sway, r + 11);
      ctx.quadraticCurveTo(trailX, r + 15, r * 1.05 + trailX - sway * 0.6, r + 11);
      ctx.quadraticCurveTo(r * 1.18 - sway * 0.5, r * 0.65, r * 0.72, -3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Golden shoulder clasps
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(-r * 0.7, -2.5, 2.4, 0, Math.PI * 2);
      ctx.arc(r * 0.7, -2.5, 2.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === 'jetpack') {
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * (r * 0.94), 1);

        // Twin metallic thruster pods
        const pGrad = ctx.createLinearGradient(-3, -9, 4, 8);
        pGrad.addColorStop(0, '#dbeafe');
        pGrad.addColorStop(0.5, '#64748b');
        pGrad.addColorStop(1, '#334155');
        ctx.fillStyle = pGrad;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.4;
        roundRectPath(ctx, -3.5, -8, 7, 15, 3);
        ctx.fill();
        ctx.stroke();

        // Racing crimson stripe
        ctx.fillStyle = '#ff4757';
        ctx.fillRect(-2.5, -3, 5, 3);

        // Pulsing thruster flame below nozzle
        const flameLen = 6 + speedRatio * 7 + Math.sin(time * 24 + side) * 2.2;
        ctx.fillStyle = '#ff9f43';
        ctx.beginPath();
        ctx.moveTo(-2.6, 7);
        ctx.lineTo(0, 7 + flameLen);
        ctx.lineTo(2.6, 7);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#74f2ff';
        ctx.beginPath();
        ctx.moveTo(-1.3, 7);
        ctx.lineTo(0, 7 + flameLen * 0.55);
        ctx.lineTo(1.3, 7);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }
    } else if (id === 'wings') {
      const flap = Math.sin(time * (4.2 + speedRatio * 14)) * (0.12 + speedRatio * 0.34);

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

        ctx.beginPath();
        ctx.moveTo(-1, -1);
        ctx.quadraticCurveTo(9, -12, 16, -10);
        ctx.quadraticCurveTo(14, -2, 8, 2);
        ctx.quadraticCurveTo(11, 5, 5, 7);
        ctx.quadraticCurveTo(2, 6, -1, 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(2, -1);
        ctx.quadraticCurveTo(8, -6, 12.5, -7);
        ctx.stroke();
        ctx.restore();
      }

    // ==================== FACE / EYEWEAR SLOT ====================
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
    } else if (id === 'roundglasses') {
      ctx.translate(eyeOffsetX, eyeOffsetY - 0.2);

      for (const side of [-1, 1]) {
        ctx.fillStyle = 'rgba(116, 242, 255, 0.28)';
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(side * 5.6, 0.4, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.beginPath();
        ctx.arc(side * 5.6 - 1.5, -1.1, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }

      // Thin arched bridge
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0.4, 1.4, Math.PI, 0);
      ctx.stroke();
    } else if (id === 'heartglasses') {
      ctx.translate(eyeOffsetX, eyeOffsetY - 0.3);

      // Gold bridge
      ctx.strokeStyle = '#ffeaa7';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-2, -1);
      ctx.lineTo(2, -1);
      ctx.stroke();

      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * 5.8, 0.3);
        ctx.fillStyle = '#ff6b9d';
        ctx.strokeStyle = '#9e1946';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(0, 4.3);
        ctx.bezierCurveTo(-5.5, 1, -5.5, -4, -2.4, -4);
        ctx.bezierCurveTo(-0.8, -4, 0, -2.5, 0, -1.8);
        ctx.bezierCurveTo(0, -2.5, 0.8, -4, 2.4, -4);
        ctx.bezierCurveTo(5.5, -4, 5.5, 1, 0, 4.3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.beginPath();
        ctx.arc(-2.1, -1.8, 1.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (id === 'shades') {
      // Bold swept angular triangle arcade shades
      ctx.translate(eyeOffsetX, eyeOffsetY - 0.8);

      const sGrad = ctx.createLinearGradient(-13, -5, 13, 4);
      sGrad.addColorStop(0, '#ff4757');
      sGrad.addColorStop(0.5, '#ff9f43');
      sGrad.addColorStop(1, '#ffd32a');
      ctx.fillStyle = sGrad;
      ctx.strokeStyle = '#240b03';
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(-14.2, -5.2);
      ctx.lineTo(-1.2, -1.5);
      ctx.lineTo(0, -3.2);
      ctx.lineTo(1.2, -1.5);
      ctx.lineTo(14.2, -5.2);
      ctx.lineTo(9.5, 3.6);
      ctx.lineTo(1.8, 2.2);
      ctx.lineTo(0, 0.6);
      ctx.lineTo(-1.8, 2.2);
      ctx.lineTo(-9.5, 3.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-9.5, -2.8);
      ctx.lineTo(-5.8, 0.8);
      ctx.moveTo(4.2, -1.8);
      ctx.lineTo(7.4, 1.2);
      ctx.stroke();
    } else if (id === 'goggles') {
      // Explorer brass goggles with strap + glowing emerald glass lenses
      ctx.translate(eyeOffsetX, eyeOffsetY - 0.5);

      ctx.strokeStyle = '#3d2817';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.92, -0.5);
      ctx.lineTo(r * 0.92, -0.5);
      ctx.stroke();

      for (const side of [-1, 1]) {
        ctx.fillStyle = '#09343a';
        ctx.strokeStyle = '#d49a3a';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(side * 5.7, 0.2, 4.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#48dbfb';
        ctx.beginPath();
        ctx.arc(side * 5.7, 0.2, 3.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(side * 5.7 - 1.2, -1.1, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (id === 'monocle') {
      // Polished golden monocle over right eye with dangling chain
      ctx.translate(eyeOffsetX, eyeOffsetY);

      const mx = 5.4;
      const my = 0.2;
      ctx.fillStyle = 'rgba(130, 240, 255, 0.28)';
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(mx, my, 4.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.beginPath();
      ctx.arc(mx - 1.5, my - 1.4, 1.1, 0, Math.PI * 2);
      ctx.fill();

      // Fine curved gold chain draping toward cheek
      const chainSway = Math.sin(time * 3.5) * 1.1;
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([1.6, 1.6]);
      ctx.beginPath();
      ctx.moveTo(mx + 4.4, my + 1.5);
      ctx.quadraticCurveTo(mx + 6.5 + chainSway, my + 7.5, mx + 3.2 + chainSway, my + 12.5);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (id === 'visor') {
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

      const sweep = ((time * 1.4) % 2) - 1;
      const gx = sweep * 8.5;
      ctx.strokeStyle = 'rgba(130, 255, 232, 0.82)';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(gx - 2.2, -2.2);
      ctx.lineTo(gx + 1.5, 1.8);
      ctx.stroke();

      ctx.fillStyle = '#ff6b9d';
      ctx.fillRect(-13.8, -1.6, 2, 3.2);
      ctx.fillRect(11.8, -1.6, 2, 3.2);

    // ==================== HEAD / HATS SLOT ====================
    } else if (id === 'leaf') {
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
    } else if (id === 'headband') {
      // Positioned cleanly along upper brow (-r * 0.56) so eyewear sits underneath cleanly
      ctx.fillStyle = '#ff4757';
      ctx.strokeStyle = '#b32432';
      ctx.lineWidth = 1.4;

      roundRectPath(ctx, -r * 0.88, -r * 0.58, r * 1.76, 5.2, 2.6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#dfe6e9';
      roundRectPath(ctx, eyeOffsetX - 4.0, -r * 0.58 + 0.7, 8.0, 3.8, 1.4);
      ctx.fill();

      const tailSide = lookX >= 0 ? -1 : 1;
      const flutter = Math.sin(time * (8 + speedRatio * 10)) * (2.5 + speedRatio * 3.5);
      ctx.strokeStyle = '#ff4757';
      ctx.lineWidth = 3.0;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailSide * (r * 0.8), -r * 0.45);
      ctx.quadraticCurveTo(
        tailSide * (r + 5),
        -r * 0.45 + flutter * 0.5,
        tailSide * (r + 11),
        -r * 0.33 + flutter
      );
      ctx.moveTo(tailSide * (r * 0.8), -r * 0.36);
      ctx.quadraticCurveTo(
        tailSide * (r + 4),
        -r * 0.25 - flutter * 0.3,
        tailSide * (r + 9),
        -r * 0.16 - flutter * 0.8
      );
      ctx.stroke();
    } else if (id === 'cap') {
      // Cool arcade street cap with angled brim
      ctx.translate(eyeOffsetX * 0.25, -r + 3.5);
      const faceDir = lookX < -0.15 ? -1 : 1;

      // Cap crown dome
      const capGrad = ctx.createLinearGradient(0, -11, 0, 1);
      capGrad.addColorStop(0, '#48dbfb');
      capGrad.addColorStop(1, '#0984e3');
      ctx.fillStyle = capGrad;
      ctx.strokeStyle = '#0c1d3d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 11.2, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Top button + bright emblem dot
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(0, -11.5, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(faceDir * 3.5, -5.2, 2.3, 0, Math.PI * 2);
      ctx.fill();

      // Front visor brim
      ctx.fillStyle = '#ff6b6b';
      ctx.strokeStyle = '#0c1d3d';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-11.2, 0);
      ctx.lineTo(11.2 + faceDir * 6.5, 0.5);
      ctx.quadraticCurveTo(faceDir * 10, 3.2, -11.2, 1.5);
      ctx.closePath();
      ctx.fill();
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
    } else if (id === 'wizard') {
      // Enchanted indigo pointed wizard hat with golden brim & star
      ctx.translate(eyeOffsetX * 0.2, -r + 3);

      const wGrad = ctx.createLinearGradient(-8, -18, 8, 1);
      wGrad.addColorStop(0, '#9b6bff');
      wGrad.addColorStop(0.55, '#5f3dc4');
      wGrad.addColorStop(1, '#2d1b69');

      // Pointed arching cone
      ctx.fillStyle = wGrad;
      ctx.strokeStyle = '#150d38';
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-9.5, 0);
      ctx.quadraticCurveTo(-5, -11, 5.5, -17.5);
      ctx.quadraticCurveTo(3.5, -9, 9.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Golden ribbon band
      ctx.fillStyle = '#ffd166';
      roundRectPath(ctx, -9.2, -3.2, 18.4, 2.8, 1.4);
      ctx.fill();

      // Wide curved magic brim
      ctx.fillStyle = '#4c2d9e';
      ctx.strokeStyle = '#150d38';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0.5, 14.5, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Golden front star badge
      ctx.fillStyle = '#fff5bd';
      drawStar(ctx, 0, -7.5, 3.2, 1.3);
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
      const bob = Math.sin(time * 3.8) * 1.6;
      ctx.translate(eyeOffsetX * 0.2, -r - 7.5 + bob);

      ctx.strokeStyle = 'rgba(255, 219, 102, 0.35)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(0, 0, 11.5, 3.6, 0, 0, Math.PI * 2);
      ctx.stroke();

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

      const starAng = time * 2.6;
      const sx = Math.cos(starAng) * 11.5;
      const sy = Math.sin(starAng) * 3.6;
      ctx.fillStyle = '#ffffff';
      drawStar(ctx, sx, sy, 3.6, 1.2);
      ctx.fill();
    } else if (id === 'horns') {
      // Cute sculpted chibi Inferno Horns with molten gold cuffs, horn ridges & dancing ember flamelet
      const centerX = eyeOffsetX * 0.25;
      const topY = -r + 1;

      // Soft warm infernal ambient glow behind the crown area
      ctx.save();
      const emberAura = ctx.createRadialGradient(centerX, topY - 6, 2, centerX, topY - 6, 22);
      emberAura.addColorStop(0, 'rgba(255, 110, 54, 0.34)');
      emberAura.addColorStop(1, 'rgba(255, 60, 20, 0)');
      ctx.fillStyle = emberAura;
      ctx.beginPath();
      ctx.arc(centerX, topY - 6, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * (r * 0.56) + centerX, -r * 0.72);
        ctx.scale(side, 1);

        // Chubby S-curved imp horn arching outward then hooking inward upward
        const hGrad = ctx.createLinearGradient(-2, 4, 8, -16);
        hGrad.addColorStop(0, '#4a0c17');
        hGrad.addColorStop(0.45, '#e63946');
        hGrad.addColorStop(0.78, '#ff7b29');
        hGrad.addColorStop(1, '#ffe066');

        ctx.fillStyle = hGrad;
        ctx.strokeStyle = '#1d050c';
        ctx.lineWidth = 1.6;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(-4.2, 2.2);
        ctx.bezierCurveTo(-5.5, -5.0, 2.5, -9.5, 4.8, -14.8);
        ctx.quadraticCurveTo(8.2, -11.5, 7.6, -5.2);
        ctx.bezierCurveTo(7.2, -0.8, 5.2, 1.8, 3.6, 3.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Carved crescent ridge grooves across middle of horn for sculpted depth
        ctx.strokeStyle = 'rgba(42, 6, 14, 0.55)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(1.2, -2.5, 4.2, -0.5, 0.85);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(2.6, -6.4, 3.4, -0.4, 0.9);
        ctx.stroke();

        // Molten gold horn base cuff ring
        ctx.fillStyle = '#ffd166';
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 1.1;
        roundRectPath(ctx, -4.6, 0.5, 8.8, 3.2, 1.6);
        ctx.fill();
        ctx.stroke();

        // Specular glossy gleam near glowing ember tip
        ctx.strokeStyle = 'rgba(255, 250, 210, 0.82)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(4.0, -12.6);
        ctx.quadraticCurveTo(5.8, -9.0, 5.2, -4.5);
        ctx.stroke();

        ctx.restore();
      }

      // Cute tiny dancing Hellfire Ember Flame hovering playfully between the horns
      const fBob = Math.sin(time * 7.5) * 1.1;
      const fSway = Math.cos(time * 6.2) * 0.9;
      ctx.save();
      ctx.translate(centerX + fSway * 0.4, topY - 4.5 + fBob);

      const fGrad = ctx.createLinearGradient(0, -8, 0, 3);
      fGrad.addColorStop(0, '#fff3b0');
      fGrad.addColorStop(0.5, '#ff9f43');
      fGrad.addColorStop(1, '#ff4757');

      ctx.fillStyle = fGrad;
      ctx.strokeStyle = '#4a0c17';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -7.8);
      ctx.bezierCurveTo(4.2, -3.5, 4.4, 1.5, 0, 2.8);
      ctx.bezierCurveTo(-4.4, 1.5, -4.2, -3.5, 0, -7.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Tiny bright cream inner core teardrop
      ctx.fillStyle = '#fff9d6';
      ctx.beginPath();
      ctx.arc(0, -0.8, 1.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * Renders single or multi-slot accessories ("crown+glasses+wings" or slot object).
   * Supports layer='back' | 'front' | 'all' for clean anatomy layering.
   */
  function drawAccessory(ctx, spec, r, lookX = 0, lookY = 0, time = 0, speedRatio = 0, layer = 'all') {
    const slots = normalizeSlots(spec);
    if (layer === 'back' || layer === 'all') {
      if (slots.back !== 'none') {
        drawSingleAccessory(ctx, slots.back, r, lookX, lookY, time, speedRatio);
      }
    }
    if (layer === 'front' || layer === 'all') {
      if (slots.face !== 'none') {
        drawSingleAccessory(ctx, slots.face, r, lookX, lookY, time, speedRatio);
      }
      if (slots.head !== 'none') {
        drawSingleAccessory(ctx, slots.head, r, lookX, lookY, time, speedRatio);
      }
    }
  }

  JellyGame.Accessories = {
    LIST: ACCESSORIES,
    BY_SLOT,
    SHOP_LIST: SHOP_ACCESSORIES,
    MILESTONE_LIST: MILESTONE_ACCESSORIES,
    normalizeSlots,
    serializeSlots,
    drawAccessory,
    getMilestoneProgress,
    getById
  };
})(window);
