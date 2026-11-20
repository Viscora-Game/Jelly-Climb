(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});

  const PALETTE = Object.freeze({
    INK: '#1b1136',
    INK_SOFT: '#352561',
    INK_MUTED: '#5a4a82',

    PANEL_TOP: '#372a6b',
    PANEL_BOT: '#221848',
    PANEL_LIP: '#140c30',
    PANEL_RIM: '#6c56b8',

    WELL_BG: '#191138',
    WELL_RIM: '#493787',

    CARD_CREAM: '#fff7e5',
    CARD_CREAM_BOT: '#f5e4c3',
    CARD_CREAM_LIP: '#d3b888',

    CARD_MINT: '#dcfff0',
    CARD_MINT_BOT: '#bdf7de',
    CARD_MINT_BORDER: '#0f9e6e',
    CARD_MINT_LIP: '#0b7853',

    CARD_GOLD: '#fff2c2',
    CARD_GOLD_BOT: '#ffe08a',
    CARD_GOLD_BORDER: '#d97706',
    CARD_GOLD_LIP: '#b45309',

    BTN_GREEN_TOP: '#76e088',
    BTN_GREEN_BOT: '#2cb360',
    BTN_GREEN_LIP: '#166e3a',

    BTN_ORANGE_TOP: '#ffb85c',
    BTN_ORANGE_BOT: '#e86825',
    BTN_ORANGE_LIP: '#9c340b',

    BTN_GOLD_TOP: '#ffe478',
    BTN_GOLD_BOT: '#e89920',
    BTN_GOLD_LIP: '#9c5808',

    BTN_SLATE_TOP: '#53438f',
    BTN_SLATE_BOT: '#362966',
    BTN_SLATE_LIP: '#1d1440',

    BTN_ROSE_TOP: '#f27c78',
    BTN_ROSE_BOT: '#cc414a',
    BTN_ROSE_LIP: '#7a1c26'
  });

  let _grainPattern = null;

  function roundRectPath(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, rad);
    } else {
      ctx.moveTo(x + rad, y);
      ctx.lineTo(x + w - rad, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
      ctx.lineTo(x + w, y + h - rad);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
      ctx.lineTo(x + rad, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
      ctx.lineTo(x, y + rad);
      ctx.quadraticCurveTo(x, y, x + rad, y);
      ctx.closePath();
    }
  }

  /**
   * Builds and caches a lightweight 144x144 painterly paper-grain pattern so
   * gradients and flat cel fills gain subtle tactile texture without per-frame cost.
   */
  function getGrainPattern(ctx) {
    if (_grainPattern) return _grainPattern;
    if (typeof document === 'undefined') return null;
    try {
      const tile = document.createElement('canvas');
      tile.width = 144;
      tile.height = 144;
      const tctx = tile.getContext('2d');
      if (!tctx) return null;

      let seed = 42197;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      for (let i = 0; i < 680; i++) {
        const gx = rand() * 144;
        const gy = rand() * 144;
        const r = 0.6 + rand() * 1.4;
        const warm = rand() > 0.45;
        tctx.fillStyle = warm ? 'rgba(255, 244, 214, 0.24)' : 'rgba(22, 10, 48, 0.22)';
        tctx.beginPath();
        tctx.arc(gx, gy, r, 0, Math.PI * 2);
        tctx.fill();
      }
      _grainPattern = ctx.createPattern(tile, 'repeat');
    } catch (_) {
      _grainPattern = null;
    }
    return _grainPattern;
  }

  function overlayGrain(ctx, x, y, w, h, alpha = 0.045) {
    const pat = getGrainPattern(ctx);
    if (!pat) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pat;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  /**
   * Draws chunky comic-outlined display text with extruded 3D cartoon drop lip.
   */
  function drawCartoonText(ctx, text, x, y, font, fillTop, fillBot, lipColor, outlineWidth = 5) {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const lipOffset = Math.max(2.5, outlineWidth * 0.62);
    ctx.lineWidth = outlineWidth + 1.5;
    ctx.strokeStyle = PALETTE.INK;
    ctx.fillStyle = lipColor || PALETTE.INK;
    ctx.strokeText(text, x, y + lipOffset);
    ctx.fillText(text, x, y + lipOffset);

    ctx.lineWidth = outlineWidth;
    ctx.strokeStyle = PALETTE.INK;
    ctx.strokeText(text, x, y);

    if (fillBot && fillBot !== fillTop) {
      const m = ctx.measureText(text);
      const halfH = ((m.actualBoundingBoxAscent || 18) + (m.actualBoundingBoxDescent || 6)) * 0.5;
      const g = ctx.createLinearGradient(0, y - halfH, 0, y + halfH);
      g.addColorStop(0, fillTop);
      g.addColorStop(1, fillBot);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = fillTop;
    }
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /**
   * Draws a storybook cartoon modal frame with thick plum ink outline, 3D base lip,
   * lavender rim highlight, corner rivets, and subtle grain texture.
   */
  function drawCartoonPanel(ctx, x, y, w, h, radius = 26) {
    ctx.save();

    // Soft drop shadow beneath frame
    ctx.fillStyle = 'rgba(14, 7, 30, 0.48)';
    roundRectPath(ctx, x + 2, y + 11, w, h, radius);
    ctx.fill();

    // Thick 3D base lip
    ctx.fillStyle = PALETTE.PANEL_LIP;
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 3.2;
    roundRectPath(ctx, x, y + 7, w, h, radius);
    ctx.fill();
    ctx.stroke();

    // Rich plum-indigo storybook frame body
    const bodyGrad = ctx.createLinearGradient(x, y, x, y + h);
    bodyGrad.addColorStop(0, PALETTE.PANEL_TOP);
    bodyGrad.addColorStop(1, PALETTE.PANEL_BOT);
    ctx.fillStyle = bodyGrad;
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.fill();

    ctx.save();
    roundRectPath(ctx, x, y, w, h, radius);
    if (typeof ctx.clip === 'function') ctx.clip();
    overlayGrain(ctx, x, y, w, h, 0.04);

    // Inner bright upper rim
    ctx.strokeStyle = 'rgba(218, 205, 255, 0.28)';
    ctx.lineWidth = 3;
    roundRectPath(ctx, x + 2.5, y + 2.5, w - 5, h - 5, radius - 2);
    ctx.stroke();

    // Comic glossy highlight capsule along top edge
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    roundRectPath(ctx, x + 24, y + 6, w - 48, 7, 3.5);
    ctx.fill();
    ctx.restore();

    // Crisp comic ink outline
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 3.2;
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.stroke();

    // Tiny corner brass rivets
    for (const [rx, ry] of [
      [x + 14, y + 14],
      [x + w - 14, y + 14],
      [x + 14, y + h - 14],
      [x + w - 14, y + h - 14]
    ]) {
      ctx.fillStyle = '#5c4b9c';
      ctx.strokeStyle = PALETTE.INK;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(rx, ry, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Draws a warm cream/mint/gold cartoon card inside modals with crisp ink border and 3D lip.
   */
  function drawCartoonCard(ctx, x, y, w, h, variant = 'cream', radius = 16) {
    const styles = {
      cream: {
        top: PALETTE.CARD_CREAM,
        bot: PALETTE.CARD_CREAM_BOT,
        lip: PALETTE.CARD_CREAM_LIP,
        border: PALETTE.INK,
        shine: 'rgba(255, 255, 255, 0.72)'
      },
      mint: {
        top: PALETTE.CARD_MINT,
        bot: PALETTE.CARD_MINT_BOT,
        lip: PALETTE.CARD_MINT_LIP,
        border: PALETTE.CARD_MINT_BORDER,
        shine: 'rgba(255, 255, 255, 0.78)'
      },
      gold: {
        top: PALETTE.CARD_GOLD,
        bot: PALETTE.CARD_GOLD_BOT,
        lip: PALETTE.CARD_GOLD_LIP,
        border: PALETTE.CARD_GOLD_BORDER,
        shine: 'rgba(255, 255, 255, 0.75)'
      },
      plum: {
        top: '#322563',
        bot: '#23194a',
        lip: '#140c30',
        border: PALETTE.INK,
        shine: 'rgba(255, 255, 255, 0.14)'
      }
    };
    const st = styles[variant] || styles.cream;

    ctx.save();
    // 3D base lip
    ctx.fillStyle = st.lip;
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 2.2;
    roundRectPath(ctx, x, y + 3.5, w, h, radius);
    ctx.fill();
    ctx.stroke();

    // Main card face
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, st.top);
    g.addColorStop(1, st.bot);
    ctx.fillStyle = g;
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.fill();

    // Top cartoon gloss stripe
    ctx.fillStyle = st.shine;
    roundRectPath(ctx, x + 10, y + 3, w - 20, 5, 2.5);
    ctx.fill();

    ctx.strokeStyle = st.border;
    ctx.lineWidth = variant === 'cream' || variant === 'plum' ? 2.2 : 2.5;
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draws a glossy, thick-inked cartoon push button with 3D base lip and comic highlight pill.
   */
  function drawCartoonButton(ctx, x, y, w, h, scheme = 'green', radius = null, pressed = false) {
    const r = radius == null ? Math.min(h * 0.5, 24) : radius;
    const schemes = {
      green: { top: PALETTE.BTN_GREEN_TOP, bot: PALETTE.BTN_GREEN_BOT, lip: PALETTE.BTN_GREEN_LIP },
      orange: { top: PALETTE.BTN_ORANGE_TOP, bot: PALETTE.BTN_ORANGE_BOT, lip: PALETTE.BTN_ORANGE_LIP },
      gold: { top: PALETTE.BTN_GOLD_TOP, bot: PALETTE.BTN_GOLD_BOT, lip: PALETTE.BTN_GOLD_LIP },
      slate: { top: PALETTE.BTN_SLATE_TOP, bot: PALETTE.BTN_SLATE_BOT, lip: PALETTE.BTN_SLATE_LIP },
      rose: { top: PALETTE.BTN_ROSE_TOP, bot: PALETTE.BTN_ROSE_BOT, lip: PALETTE.BTN_ROSE_LIP },
      disabled: { top: '#cfc4b0', bot: '#b5a892', lip: '#8a7d68' }
    };
    const sc = schemes[scheme] || schemes.green;
    const lipH = pressed ? 1.5 : 4;
    const dy = pressed ? 2.5 : 0;

    ctx.save();
    // Base 3D extrusion
    ctx.fillStyle = sc.lip;
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 2.4;
    roundRectPath(ctx, x, y + lipH + dy, w, h, r);
    ctx.fill();
    ctx.stroke();

    // Top face
    const g = ctx.createLinearGradient(x, y + dy, x, y + h + dy);
    g.addColorStop(0, sc.top);
    g.addColorStop(1, sc.bot);
    ctx.fillStyle = g;
    roundRectPath(ctx, x, y + dy, w, h, r);
    ctx.fill();
    ctx.stroke();

    // Soft painted cartoon top highlight pill + tiny comic glint dot
    ctx.fillStyle = 'rgba(255, 252, 236, 0.28)';
    const glossW = Math.max(10, w - Math.min(36, r * 1.45));
    const glossX = x + (w - glossW) * 0.5;
    const glossH = Math.max(3.5, Math.min(6.5, h * 0.16));
    roundRectPath(ctx, glossX, y + dy + 3.5, glossW, glossH, glossH * 0.5);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.4;
    roundRectPath(ctx, x + 2, y + dy + 2, w - 4, h - 4, Math.max(2, r - 2));
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draws a thick-inked comic close button (crimson-berry disc with ivory X).
   */
  function drawCloseMedallion(ctx, x, y, size) {
    const r = size * 0.5;
    const cx = x + r;
    const cy = y + r;
    ctx.save();

    ctx.fillStyle = PALETTE.BTN_ROSE_LIP;
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(cx, cy + 2.5, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    g.addColorStop(0, PALETTE.BTN_ROSE_TOP);
    g.addColorStop(1, PALETTE.BTN_ROSE_BOT);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.18, cy - r * 0.48, r * 0.36, r * 0.16, -0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#fff9f0';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const d = r * 0.34;
    ctx.beginPath();
    ctx.moveTo(cx - d, cy - d);
    ctx.lineTo(cx + d, cy + d);
    ctx.moveTo(cx + d, cy - d);
    ctx.lineTo(cx - d, cy + d);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draws a plump cel-shaded cartoon cloud at (cx, cy).
   */
  function drawCartoonCloud(ctx, cx, cy, scale = 1, alpha = 0.95) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;

    const traceCloud = () => {
      ctx.beginPath();
      ctx.moveTo(-42, 14);
      ctx.arc(-28, 2, 16, Math.PI * 0.72, Math.PI * 1.9);
      ctx.arc(-4, -8, 22, Math.PI * 1.08, Math.PI * 1.94);
      ctx.arc(24, 0, 17, Math.PI * 1.25, Math.PI * 0.25);
      ctx.quadraticCurveTo(42, 16, 26, 16);
      ctx.lineTo(-32, 16);
      ctx.quadraticCurveTo(-46, 16, -42, 14);
      ctx.closePath();
    };

    // Soft blue lower underbelly tint
    ctx.fillStyle = '#c8e6ff';
    traceCloud();
    ctx.fill();

    ctx.save();
    traceCloud();
    if (typeof ctx.clip === 'function') ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-2, -6, 46, 19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(42, 74, 145, 0.35)';
    ctx.lineWidth = 2;
    traceCloud();
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draws a cartoon floating mossy cliff platform echoing the store feature graphic.
   */
  function drawCartoonMossIsland(ctx, cx, cy, w, h, seed = 1) {
    ctx.save();
    ctx.translate(cx, cy);
    const hw = w * 0.5;
    const s = seed >= 0 ? 1 : -1;

    // Tapered purple-brown stone underside with angular rock profile
    const rockPath = () => {
      ctx.beginPath();
      ctx.moveTo(-hw + 5, 2);
      ctx.lineTo(hw - 5, 2);
      ctx.lineTo(hw - 10, h * 0.48);
      ctx.lineTo(hw * 0.54, h * 0.84);
      ctx.lineTo(hw * 0.14 * s, h);
      ctx.lineTo(-hw * 0.38, h * 0.88);
      ctx.lineTo(-hw + 12, h * 0.52);
      ctx.closePath();
    };

    const rockGrad = ctx.createLinearGradient(0, 0, 0, h);
    rockGrad.addColorStop(0, '#8a5d80');
    rockGrad.addColorStop(0.55, '#644061');
    rockGrad.addColorStop(1, '#3e2443');
    ctx.fillStyle = rockGrad;
    rockPath();
    ctx.fill();

    // Multi-plane cel-shaded rock facets inside clipped underside
    ctx.save();
    rockPath();
    if (typeof ctx.clip === 'function') ctx.clip();

    // Sunlit left stone facet
    ctx.fillStyle = 'rgba(255, 224, 244, 0.12)';
    ctx.beginPath();
    ctx.moveTo(-hw, 0);
    ctx.lineTo(-hw * 0.15, 0);
    ctx.lineTo(-hw * 0.28, h * 0.65);
    ctx.lineTo(-hw * 0.68, h * 0.52);
    ctx.closePath();
    ctx.fill();

    // Shaded right stone facet
    ctx.fillStyle = 'rgba(27, 17, 54, 0.28)';
    ctx.beginPath();
    ctx.moveTo(s > 0 ? 4 : -6, 0);
    ctx.lineTo(hw, 0);
    ctx.lineTo(hw, h + 6);
    ctx.lineTo(s > 0 ? -10 : -20, h + 6);
    ctx.closePath();
    ctx.fill();

    // Deep lower-right core facet + overhang shadow under turf lip
    ctx.fillStyle = 'rgba(20, 10, 42, 0.3)';
    ctx.fillRect(-hw, 0, w, 12);
    ctx.beginPath();
    ctx.moveTo(hw * 0.26, h * 0.42);
    ctx.lineTo(hw, h * 0.24);
    ctx.lineTo(hw, h + 6);
    ctx.lineTo(0, h + 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    rockPath();
    ctx.stroke();

    // Subtle cartoon chisel crack lines on rock face
    ctx.strokeStyle = 'rgba(27, 17, 54, 0.55)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-hw * 0.24, h * 0.26);
    ctx.lineTo(-hw * 0.12, h * 0.56);
    ctx.lineTo(-hw * 0.2, h * 0.72);
    ctx.moveTo(hw * 0.34, h * 0.34);
    ctx.lineTo(hw * 0.22, h * 0.6);
    ctx.stroke();

    // Lush lime-green cartoon moss turf overhanging the cliff rim
    const mossPath = () => {
      ctx.beginPath();
      ctx.moveTo(-hw - 3, 2);
      ctx.quadraticCurveTo(-hw - 3, -11, -hw + 14, -11);
      ctx.lineTo(hw - 14, -11);
      ctx.quadraticCurveTo(hw + 3, -11, hw + 3, 2);
      ctx.quadraticCurveTo(hw + 1, 11, hw - 11, 7.5);
      ctx.quadraticCurveTo(hw * 0.52, 15, hw * 0.25, 6.5);
      ctx.quadraticCurveTo(0, 14, -hw * 0.26, 6.5);
      ctx.quadraticCurveTo(-hw * 0.55, 14.5, -hw + 11, 7.5);
      ctx.quadraticCurveTo(-hw - 2, 10, -hw - 3, 2);
      ctx.closePath();
    };

    const mossGrad = ctx.createLinearGradient(0, -11, 0, 13);
    mossGrad.addColorStop(0, '#b5ff47');
    mossGrad.addColorStop(0.55, '#7de01d');
    mossGrad.addColorStop(1, '#3a9b10');
    ctx.fillStyle = mossGrad;
    mossPath();
    ctx.fill();

    // Deep emerald lower scalloped shadow band on turf
    ctx.save();
    mossPath();
    if (typeof ctx.clip === 'function') ctx.clip();
    ctx.fillStyle = 'rgba(20, 86, 12, 0.32)';
    ctx.fillRect(-hw - 4, 3.5, w + 8, 13);
    ctx.restore();

    // Top turf highlight streak
    ctx.fillStyle = 'rgba(255, 255, 220, 0.5)';
    roundRectPath(ctx, -hw + 12, -8.5, w - 24, 4, 2);
    ctx.fill();

    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 2.8;
    ctx.lineJoin = 'round';
    mossPath();
    ctx.stroke();

    // Cute cartoon grass sprouts from rim
    ctx.fillStyle = '#9df52c';
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 2;
    for (const bx of [-hw * 0.46, hw * 0.44]) {
      ctx.beginPath();
      ctx.moveTo(bx - 5, -10);
      ctx.quadraticCurveTo(bx - 3, -19, bx + 1.5, -17.5);
      ctx.quadraticCurveTo(bx + 1.5, -13, bx + 4.5, -10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Draws a thick-inked cartoon "JELLY CLIMB" wordmark inspired by the store icon:
   * cream bouncy "JELLY" over juicy mango-amber "CLIMB" with an upward-arrow "I".
   */
  function drawCartoonLogo(ctx, cx, cy, scale = 1, time = 0) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    const bob1 = Math.sin(time * 2.4) * 2.5;
    const bob2 = Math.sin(time * 2.4 - 0.8) * 2.5;
    const displayFont = '"Fredoka", "Arial Rounded MT Bold", sans-serif';

    // Floating golden gem crown badge above JELLY
    drawGemEmblem(ctx, 0, -68 + bob1 * 0.7, 11.5);

    // Top row: J E L L Y (tilted playfully, warm cream with thick plum-ink 3D extrusion)
    ctx.save();
    ctx.translate(0, -25 + bob1);
    ctx.rotate(-0.045);

    const jellyLetters = [
      { ch: 'J', x: -78, y: 2, rot: -0.08 },
      { ch: 'E', x: -40, y: -1, rot: -0.03 },
      { ch: 'L', x: -3, y: -2, rot: 0.01 },
      { ch: 'L', x: 34, y: -1, rot: 0.04 },
      { ch: 'Y', x: 75, y: 2, rot: 0.08 }
    ];
    ctx.font = `700 54px ${displayFont}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Back 3D extruded comic shadow
    for (const lt of jellyLetters) {
      ctx.save();
      ctx.translate(lt.x, lt.y + 5.5);
      ctx.rotate(lt.rot);
      ctx.lineWidth = 11;
      ctx.strokeStyle = PALETTE.INK;
      ctx.fillStyle = PALETTE.INK;
      ctx.strokeText(lt.ch, 0, 0);
      ctx.fillText(lt.ch, 0, 0);
      ctx.restore();
    }

    // Main cream-ivory letter faces
    const creamGrad = ctx.createLinearGradient(0, -26, 0, 26);
    creamGrad.addColorStop(0, '#fffdf5');
    creamGrad.addColorStop(0.65, '#fff0d1');
    creamGrad.addColorStop(1, '#e6cc9e');

    for (const lt of jellyLetters) {
      ctx.save();
      ctx.translate(lt.x, lt.y);
      ctx.rotate(lt.rot);
      ctx.lineWidth = 9.5;
      ctx.strokeStyle = PALETTE.INK;
      ctx.strokeText(lt.ch, 0, 0);
      ctx.fillStyle = creamGrad;
      ctx.fillText(lt.ch, 0, 0);

      // Subtle top gloss highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.beginPath();
      ctx.ellipse(-2, -13, 6.5, 2.6, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // Bottom row: C L [UP-ARROW I] M B (juicy mango-orange gradient)
    ctx.save();
    ctx.translate(0, 29 + bob2);
    ctx.rotate(-0.025);

    const climbGrad = ctx.createLinearGradient(0, -26, 0, 26);
    climbGrad.addColorStop(0, '#ffef6b');
    climbGrad.addColorStop(0.45, '#ffaa1d');
    climbGrad.addColorStop(1, '#ee5a0e');

    const climbParts = [
      { ch: 'C', x: -86, y: 2, rot: -0.07 },
      { ch: 'L', x: -45, y: 0, rot: -0.03 },
      { arrow: true, x: -11, y: -2, rot: 0 },
      { ch: 'M', x: 31, y: 0, rot: 0.03 },
      { ch: 'B', x: 82, y: 2, rot: 0.07 }
    ];

    const traceUpArrowI = () => {
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(14.5, -5);
      ctx.lineTo(6.5, -5);
      ctx.lineTo(6.5, 19);
      ctx.quadraticCurveTo(6.5, 22, 3, 22);
      ctx.lineTo(-3, 22);
      ctx.quadraticCurveTo(-6.5, 22, -6.5, 19);
      ctx.lineTo(-6.5, -5);
      ctx.lineTo(-14.5, -5);
      ctx.closePath();
    };

    ctx.font = `700 54px ${displayFont}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Back 3D extruded shadow
    for (const part of climbParts) {
      ctx.save();
      ctx.translate(part.x, part.y + 6);
      ctx.rotate(part.rot);
      ctx.lineWidth = 11.5;
      ctx.strokeStyle = PALETTE.INK;
      ctx.fillStyle = PALETTE.INK;
      if (part.arrow) {
        traceUpArrowI();
        ctx.stroke();
        ctx.fill();
      } else {
        ctx.strokeText(part.ch, 0, 0);
        ctx.fillText(part.ch, 0, 0);
      }
      ctx.restore();
    }

    // Foreground mango-orange glyphs
    for (const part of climbParts) {
      ctx.save();
      ctx.translate(part.x, part.y);
      ctx.rotate(part.rot);
      ctx.lineWidth = 9.5;
      ctx.strokeStyle = PALETTE.INK;
      ctx.fillStyle = climbGrad;
      if (part.arrow) {
        traceUpArrowI();
        ctx.stroke();
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 230, 0.65)';
        ctx.beginPath();
        ctx.ellipse(-3, -10, 3.5, 2, -0.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeText(part.ch, 0, 0);
        ctx.fillText(part.ch, 0, 0);
      }
      ctx.restore();
    }
    ctx.restore();

    ctx.restore();
  }

  /**
   * Draws an ink-outlined cel-shaded cartoon bush cluster.
   */
  function drawCartoonBush(ctx, cx, cy, scale = 1, flip = 1) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale * flip, scale);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const drawLeaf = (ox, oy, ang, len, wid, colTop, colBot) => {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(ang);
      const lg = ctx.createLinearGradient(0, 0, len, 0);
      lg.addColorStop(0, colBot);
      lg.addColorStop(1, colTop);
      ctx.fillStyle = lg;
      ctx.strokeStyle = PALETTE.INK;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.48, -wid, len, 0);
      ctx.quadraticCurveTo(len * 0.48, wid, 0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(20, 88, 18, 0.45)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.quadraticCurveTo(len * 0.45, -wid * 0.12, len * 0.78, 0);
      ctx.stroke();
      ctx.restore();
    };

    // Outer pointed accent leaves behind mound
    drawLeaf(-14, -4, -2.55, 24, 9, '#a9fa3c', '#3ea612');
    drawLeaf(12, -6, -0.58, 22, 8.5, '#96f02e', '#2f8a12');

    // Rounded bushy clover mound
    const traceMound = () => {
      ctx.beginPath();
      ctx.moveTo(-24, 2);
      ctx.quadraticCurveTo(-28, -12, -14, -15);
      ctx.quadraticCurveTo(-8, -27, 4, -22);
      ctx.quadraticCurveTo(18, -24, 20, -10);
      ctx.quadraticCurveTo(28, -6, 24, 2);
      ctx.closePath();
    };

    const bushGrad = ctx.createLinearGradient(0, -24, 0, 4);
    bushGrad.addColorStop(0, '#9cf52c');
    bushGrad.addColorStop(0.55, '#4fc418');
    bushGrad.addColorStop(1, '#237814');
    ctx.fillStyle = bushGrad;
    traceMound();
    ctx.fill();

    // Inner scalloped cel shadow along bottom
    ctx.save();
    traceMound();
    if (typeof ctx.clip === 'function') ctx.clip();
    ctx.fillStyle = 'rgba(17, 64, 16, 0.34)';
    ctx.beginPath();
    ctx.ellipse(2, 4, 28, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(244, 255, 190, 0.45)';
    ctx.beginPath();
    ctx.ellipse(-7, -14, 7, 3.2, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 2.6;
    traceMound();
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draws a modest overhanging corner leaf cluster for natural menu framing.
   */
  function drawCornerFoliage(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const leaves = [
      { ang: 0.16, len: 52, wid: 14, c1: '#86e622', c2: '#2d8a14' },
      { ang: 0.62, len: 46, wid: 13, c1: '#a7fa3c', c2: '#3aa315' },
      { ang: 1.12, len: 40, wid: 12, c1: '#69cc1a', c2: '#226e12' }
    ];
    for (const lf of leaves) {
      ctx.save();
      ctx.rotate(lf.ang);
      const lg = ctx.createLinearGradient(0, 0, lf.len, 0);
      lg.addColorStop(0, lf.c2);
      lg.addColorStop(1, lf.c1);
      ctx.fillStyle = lg;
      ctx.strokeStyle = PALETTE.INK;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-4, -2);
      ctx.quadraticCurveTo(lf.len * 0.45, -lf.wid, lf.len, 2);
      ctx.quadraticCurveTo(lf.len * 0.45, lf.wid, -4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(20, 82, 16, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(2, 1);
      ctx.quadraticCurveTo(lf.len * 0.45, -2, lf.len * 0.8, 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  /**
   * Draws an illustrated layered mountain range with sunlit/shaded slopes and valley mist.
   */
  function drawCartoonMountains(ctx, width, height, vx, vw, vy, vh) {
    // Back distant soft mountain silhouettes
    const backPeaks = [
      [vx - 10, height * 0.72],
      [width * 0.14, height * 0.56],
      [width * 0.28, height * 0.63],
      [width * 0.46, height * 0.5],
      [width * 0.66, height * 0.61],
      [width * 0.84, height * 0.52],
      [vx + vw + 10, height * 0.65]
    ];
    ctx.fillStyle = '#294ca8';
    ctx.beginPath();
    ctx.moveTo(backPeaks[0][0], backPeaks[0][1]);
    for (let i = 1; i < backPeaks.length; i++) {
      ctx.lineTo(backPeaks[i][0], backPeaks[i][1]);
    }
    ctx.lineTo(vx + vw + 10, vy + vh);
    ctx.lineTo(vx - 10, vy + vh);
    ctx.closePath();
    ctx.fill();

    // Sunlit left ridges on back mountain crests
    ctx.fillStyle = '#3a65d1';
    for (let i = 1; i < backPeaks.length - 1; i += 2) {
      const [px, py] = backPeaks[i];
      const [lx, ly] = backPeaks[i - 1];
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(px, py);
      ctx.lineTo(px + 10, height * 0.78);
      ctx.lineTo(lx, height * 0.78);
      ctx.closePath();
      ctx.fill();
    }

    // Midground faceted cobalt peaks (distinct left-lit / right-shaded planes)
    const ridges = [
      { lx: vx - 12, ly: height * 0.78, px: width * 0.18, py: height * 0.58, rx: width * 0.46, ry: height * 0.74 },
      { lx: width * 0.54, ly: height * 0.76, px: width * 0.82, py: height * 0.56, rx: vx + vw + 14, ry: height * 0.72 }
    ];
    for (const m of ridges) {
      const midSpineX = m.px + 6;
      const baseY = vy + vh;

      // Left sunlit face
      const litGrad = ctx.createLinearGradient(m.lx, m.py, m.px, height * 0.85);
      litGrad.addColorStop(0, '#4e80e6');
      litGrad.addColorStop(1, '#3662c9');
      ctx.fillStyle = litGrad;
      ctx.beginPath();
      ctx.moveTo(m.lx, m.ly);
      ctx.lineTo(m.px, m.py);
      ctx.quadraticCurveTo(m.px - 8, (m.py + height * 0.84) * 0.5, midSpineX, baseY);
      ctx.lineTo(m.lx, baseY);
      ctx.closePath();
      ctx.fill();

      // Right cool shaded face
      const shdGrad = ctx.createLinearGradient(m.px, m.py, m.rx, height * 0.85);
      shdGrad.addColorStop(0, '#27489e');
      shdGrad.addColorStop(1, '#1f3b85');
      ctx.fillStyle = shdGrad;
      ctx.beginPath();
      ctx.moveTo(m.px, m.py);
      ctx.lineTo(m.rx, m.ry);
      ctx.lineTo(m.rx, baseY);
      ctx.lineTo(midSpineX, baseY);
      ctx.quadraticCurveTo(m.px - 8, (m.py + height * 0.84) * 0.5, m.px, m.py);
      ctx.closePath();
      ctx.fill();

      // Subtle ridge crest outline highlight
      ctx.strokeStyle = 'rgba(130, 186, 255, 0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.lx, m.ly);
      ctx.lineTo(m.px, m.py);
      ctx.stroke();
    }

    // Gentle valley mist gradient softening mountain bases
    const mist = ctx.createLinearGradient(0, height * 0.66, 0, height * 0.88);
    mist.addColorStop(0, 'rgba(116, 178, 255, 0)');
    mist.addColorStop(0.55, 'rgba(108, 168, 250, 0.28)');
    mist.addColorStop(1, 'rgba(67, 114, 212, 0.42)');
    ctx.fillStyle = mist;
    ctx.fillRect(vx, height * 0.66, vw, height * 0.24);

    // Rolling foothill swell just above foreground ground
    ctx.fillStyle = '#3f6fd1';
    ctx.beginPath();
    ctx.moveTo(vx, height * 0.82);
    ctx.quadraticCurveTo(width * 0.25, height * 0.74, width * 0.52, height * 0.81);
    ctx.quadraticCurveTo(width * 0.78, height * 0.75, vx + vw, height * 0.8);
    ctx.lineTo(vx + vw, vy + vh);
    ctx.lineTo(vx, vy + vh);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Draws an illustrated ground cliff & mossy turf edge + framing corner foliage.
   */
  function drawMenuGround(ctx, width, height, vx, vw, vy, vh) {
    const topY = height - 34;
    const baseBottom = vy + vh + 4;

    // Faceted twilight-plum cliff stone wall below the turf
    const cliffGrad = ctx.createLinearGradient(0, topY, 0, baseBottom);
    cliffGrad.addColorStop(0, '#784e73');
    cliffGrad.addColorStop(0.55, '#553456');
    cliffGrad.addColorStop(1, '#391f3e');
    ctx.fillStyle = cliffGrad;
    ctx.fillRect(vx, topY + 2, vw, baseBottom - topY);

    // Faceted rock blocks across the lower cliff band
    ctx.fillStyle = 'rgba(255, 220, 245, 0.09)';
    for (let x = 22; x < width - 20; x += 86) {
      ctx.beginPath();
      ctx.moveTo(x, topY + 8);
      ctx.lineTo(x + 36, topY + 8);
      ctx.lineTo(x + 24, topY + 32);
      ctx.lineTo(x - 6, topY + 28);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(22, 10, 40, 0.28)';
    for (let x = 58; x < width; x += 86) {
      ctx.beginPath();
      ctx.moveTo(x, topY + 10);
      ctx.lineTo(x + 42, topY + 10);
      ctx.lineTo(x + 48, baseBottom);
      ctx.lineTo(x - 8, baseBottom);
      ctx.closePath();
      ctx.fill();
    }
    // Deep lip shadow beneath mossy overhang
    ctx.fillStyle = 'rgba(22, 10, 40, 0.34)';
    ctx.fillRect(vx, topY + 2, vw, 11);

    // Scalloped mossy grass turf spanning bottom viewport
    const waveCount = 12;
    const step = vw / waveCount;
    const traceTurf = () => {
      ctx.beginPath();
      ctx.moveTo(vx, topY - 4);
      ctx.lineTo(vx + vw, topY - 4);
      ctx.lineTo(vx + vw, topY + 8);
      for (let i = waveCount; i >= 1; i--) {
        const x1 = vx + i * step;
        const x0 = vx + (i - 1) * step;
        const midX = (x0 + x1) * 0.5;
        const dip = i % 2 === 0 ? 15 : 12;
        ctx.quadraticCurveTo(midX, topY + dip, x0, topY + 7);
      }
      ctx.closePath();
    };

    const turfGrad = ctx.createLinearGradient(0, topY - 6, 0, topY + 15);
    turfGrad.addColorStop(0, '#b5ff47');
    turfGrad.addColorStop(0.55, '#7de01d');
    turfGrad.addColorStop(1, '#3a9b10');
    ctx.fillStyle = turfGrad;
    traceTurf();
    ctx.fill();

    // Top chartreuse highlight ribbon
    ctx.fillStyle = 'rgba(255, 255, 224, 0.48)';
    ctx.fillRect(vx + 6, topY - 2, vw - 12, 3.5);

    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 2.8;
    ctx.lineJoin = 'round';
    traceTurf();
    ctx.stroke();

    // Cute mini grass sprouts along the ground edge
    ctx.fillStyle = '#9df52c';
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 2;
    for (const [gx, scale] of [
      [width * 0.31, 1],
      [width * 0.48, 0.85],
      [width * 0.67, 1.05]
    ]) {
      ctx.save();
      ctx.translate(gx, topY - 4);
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.quadraticCurveTo(-5, -10, -1, -8);
      ctx.quadraticCurveTo(2, -13, 5, -7);
      ctx.quadraticCurveTo(7, -3, 6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Foreground miniature framing corner bushes ("minik çalılar") below button zone
    drawCartoonBush(ctx, 26, topY - 1, 1.02, 1);
    drawCartoonBush(ctx, width - 26, topY - 1, 1.0, -1);
    drawCartoonBush(ctx, width * 0.37, topY + 1, 0.56, 1);
  }

  /**
   * Draws a full-screen vibrant cartoon backdrop vista for the Main Menu.
   */
  function drawMenuVista(ctx, width, height, padLeft, padTop, padRight, padBottom, time) {
    const vx = -padLeft - 4;
    const vy = -padTop - 4;
    const vw = width + padLeft + padRight + 8;
    const vh = height + padTop + padBottom + 8;

    ctx.save();
    // Rich vibrant cobalt-to-azure cartoon sky
    const sky = ctx.createLinearGradient(0, vy, 0, vy + vh);
    sky.addColorStop(0, '#1c3e96');
    sky.addColorStop(0.36, '#2d6fe0');
    sky.addColorStop(0.72, '#5cb8ff');
    sky.addColorStop(1, '#a3e4ff');
    ctx.fillStyle = sky;
    ctx.fillRect(vx, vy, vw, vh);

    // Warm diagonal sunlit rays fanning from top right
    ctx.save();
    ctx.fillStyle = '#fff5cc';
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.08 + 0.03 * Math.sin(time * 0.9 + i * 1.7);
      const rx = 120 + i * 115;
      ctx.beginPath();
      ctx.moveTo(rx, vy);
      ctx.lineTo(rx + 68, vy);
      ctx.lineTo(rx - 140, vy + vh);
      ctx.lineTo(rx - 220, vy + vh);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Layered illustrated mountains & misty foothills
    drawCartoonMountains(ctx, width, height, vx, vw, vy, vh);

    // Drifting plump cartoon clouds tucked cleanly in open sky pockets
    const drift1 = ((time * 9) % (width + 180)) - 90;
    const drift2 = ((time * 6 + 410) % (width + 200)) - 100;
    drawCartoonCloud(ctx, drift1, 112, 0.9, 0.92);
    drawCartoonCloud(ctx, width - drift2 * 0.85, 224, 0.66, 0.78);
    drawCartoonCloud(ctx, (drift1 + 230) % (width + 160) - 80, 672, 0.58, 0.44);

    // Subtle painterly paper grain across sky
    overlayGrain(ctx, vx, vy, vw, vh, 0.032);

    // Foreground flanking mossy stone cliff ledges framing the portrait viewport
    drawCartoonMossIsland(ctx, 24, height * 0.52, 92, 48, 1);
    drawCartoonMossIsland(ctx, width - 18, height * 0.34, 86, 46, -1);

    // Bottom lush grassy cliff & corner mini-bushes + top-left corner leaf framing
    drawMenuGround(ctx, width, height, vx, vw, vy, vh);
    drawCornerFoliage(ctx, -2, -2, 0.95);

    ctx.restore();
  }

  /**
   * Draws a thick-inked cartoon Jel Özü golden gem emblem.
   */
  function drawGemEmblem(ctx, x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';

    const traceGem = () => {
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.18);
      ctx.lineTo(r * 0.92, 0);
      ctx.lineTo(0, r * 1.18);
      ctx.lineTo(-r * 0.92, 0);
      ctx.closePath();
    };

    const grad = ctx.createLinearGradient(0, -r, 0, r);
    grad.addColorStop(0, '#fff9bd');
    grad.addColorStop(0.5, '#ffd147');
    grad.addColorStop(1, '#f08c00');
    ctx.fillStyle = grad;
    traceGem();
    ctx.fill();

    // Right facet cel shadow
    ctx.fillStyle = 'rgba(214, 90, 0, 0.35)';
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.12);
    ctx.lineTo(r * 0.88, 0);
    ctx.lineTo(0, r * 1.12);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = Math.max(1.5, r * 0.25);
    traceGem();
    ctx.stroke();

    // Specular gleam pill
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.24, -r * 0.28, r * 0.2, r * 0.32, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draws a cartoon golden trophy icon with thick ink outline and specular shine.
   */
  function drawTrophyIcon(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Handles
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.arc(-8.5, -4, 4.5, Math.PI * 0.45, Math.PI * 1.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(8.5, -4, 4.5, -Math.PI * 0.55, Math.PI * 0.55);
    ctx.stroke();

    ctx.strokeStyle = '#ffd147';
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.arc(-8.5, -4, 4.5, Math.PI * 0.45, Math.PI * 1.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(8.5, -4, 4.5, -Math.PI * 0.55, Math.PI * 0.55);
    ctx.stroke();

    const tGrad = ctx.createLinearGradient(0, -12, 0, 12);
    tGrad.addColorStop(0, '#fff7bd');
    tGrad.addColorStop(0.55, '#ffd147');
    tGrad.addColorStop(1, '#e67e00');
    ctx.fillStyle = tGrad;
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 2.2;

    ctx.beginPath();
    ctx.moveTo(-8.5, -10.5);
    ctx.lineTo(8.5, -10.5);
    ctx.lineTo(6.8, -1);
    ctx.quadraticCurveTo(5.2, 4.2, 2.2, 4.8);
    ctx.lineTo(2.2, 8);
    ctx.lineTo(6.8, 10.8);
    ctx.lineTo(-6.8, 10.8);
    ctx.lineTo(-2.2, 8);
    ctx.lineTo(-2.2, 4.8);
    ctx.quadraticCurveTo(-5.2, 4.2, -6.8, -1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.beginPath();
    ctx.ellipse(-3.5, -5.5, 1.7, 3.2, -0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Draws a chunky inked cartoon gear icon (replacing flat sharp-toothed gears).
   */
  function drawGearIcon(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const gGrad = ctx.createLinearGradient(0, -13, 0, 13);
    gGrad.addColorStop(0, '#ffffff');
    gGrad.addColorStop(0.6, '#d9e7ff');
    gGrad.addColorStop(1, '#9ab2de');
    ctx.fillStyle = gGrad;
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';

    const teeth = 8;
    const outerR = 13;
    const innerR = 9.2;
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * Math.PI * 2;
      const a1 = a0 + 0.19;
      const a2 = a0 + 0.42;
      const a3 = a0 + 0.61;
      const pts = [
        [Math.cos(a0) * innerR, Math.sin(a0) * innerR],
        [Math.cos(a1) * outerR, Math.sin(a1) * outerR],
        [Math.cos(a2) * outerR, Math.sin(a2) * outerR],
        [Math.cos(a3) * innerR, Math.sin(a3) * innerR]
      ];
      for (let j = 0; j < pts.length; j++) {
        if (i === 0 && j === 0) ctx.moveTo(pts[j][0], pts[j][1]);
        else ctx.lineTo(pts[j][0], pts[j][1]);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#382a6b';
    ctx.beginPath();
    ctx.arc(0, 0, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draws a thick-inked cartoon speaker icon for Settings.
   */
  function drawSpeakerIcon(ctx, x, y, isOn) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const fillGrad = ctx.createLinearGradient(0, -9, 0, 9);
    if (isOn) {
      fillGrad.addColorStop(0, '#72ffcb');
      fillGrad.addColorStop(1, '#12b880');
    } else {
      fillGrad.addColorStop(0, '#c8d2e6');
      fillGrad.addColorStop(1, '#8a99b8');
    }

    ctx.fillStyle = fillGrad;
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(-9, -4.5);
    ctx.lineTo(-3.5, -4.5);
    ctx.lineTo(2.5, -9.5);
    ctx.lineTo(2.5, 9.5);
    ctx.lineTo(-3.5, 4.5);
    ctx.lineTo(-9, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (isOn) {
      ctx.strokeStyle = '#12b880';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(3.5, 0, 5, -0.7, 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(3.5, 0, 8.8, -0.75, 0.75);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#ff4d6d';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(5.5, -4.2);
      ctx.lineTo(11.5, 4.2);
      ctx.moveTo(11.5, -4.2);
      ctx.lineTo(5.5, 4.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Draws a thick-inked cartoon beamed music note icon for Settings.
   */
  function drawMusicIcon(ctx, x, y, isOn) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const noteCol = isOn ? '#ffaa1d' : '#9aa8c7';

    // Thick ink backing for stems & beam
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-2, 4.5);
    ctx.lineTo(-2, -7.2);
    ctx.lineTo(7.5, -9);
    ctx.lineTo(7.5, 3);
    ctx.stroke();

    ctx.strokeStyle = noteCol;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    for (const [nx, ny] of [
      [-4.8, 4.8],
      [4.7, 3.2]
    ]) {
      ctx.fillStyle = noteCol;
      ctx.strokeStyle = PALETTE.INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(nx, ny, 3.8, 3.1, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    if (!isOn) {
      ctx.strokeStyle = '#ff4d6d';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(-8, -7);
      ctx.lineTo(9, 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Draws a filled cel-shaded cartoon globe icon for Settings language row.
   */
  function drawGlobeIcon(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    const gGrad = ctx.createLinearGradient(-8, -8, 8, 8);
    gGrad.addColorStop(0, '#72d8ff');
    gGrad.addColorStop(1, '#2d7ff9');
    ctx.fillStyle = gGrad;
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Playful green continent patches
    ctx.fillStyle = '#6fe845';
    ctx.beginPath();
    ctx.ellipse(-3, -2.5, 3.4, 2.4, 0.3, 0, Math.PI * 2);
    ctx.ellipse(3.5, 2.5, 2.8, 3.1, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Subtle meridian & equator lines
    ctx.strokeStyle = 'rgba(27, 17, 54, 0.42)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.4, 9.2, 0, 0, Math.PI * 2);
    ctx.moveTo(-9, 0);
    ctx.lineTo(9, 0);
    ctx.stroke();

    // Top-left gloss
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.beginPath();
    ctx.arc(-3.5, -4.2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draws a thick-inked cartoon heart icon with specular dot.
   */
  function drawHeartIcon(ctx, cx, cy, size, filled) {
    ctx.save();
    ctx.translate(cx, cy);
    const s = size;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.45);
    ctx.bezierCurveTo(-s * 0.98, -s * 0.25, -s * 0.68, -s * 1.02, 0, -s * 0.36);
    ctx.bezierCurveTo(s * 0.68, -s * 1.02, s * 0.98, -s * 0.25, 0, s * 0.45);
    ctx.closePath();

    if (filled) {
      const g = ctx.createLinearGradient(0, -s * 0.85, 0, s * 0.45);
      g.addColorStop(0, '#ff8aa1');
      g.addColorStop(1, '#e62e53');
      ctx.fillStyle = g;
      ctx.strokeStyle = PALETTE.INK;
      ctx.lineWidth = 1.8;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.beginPath();
      ctx.arc(-s * 0.32, -s * 0.32, s * 0.14, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(27, 17, 54, 0.32)';
      ctx.strokeStyle = 'rgba(255, 130, 155, 0.52)';
      ctx.lineWidth = 1.4;
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  JellyGame.Art = Object.freeze({
    PALETTE,
    roundRectPath,
    getGrainPattern,
    overlayGrain,
    drawCartoonText,
    drawCartoonPanel,
    drawCartoonCard,
    drawCartoonButton,
    drawCloseMedallion,
    drawCartoonCloud,
    drawCartoonMossIsland,
    drawCartoonLogo,
    drawMenuVista,
    drawGemEmblem,
    drawTrophyIcon,
    drawGearIcon,
    drawSpeakerIcon,
    drawMusicIcon,
    drawGlobeIcon,
    drawHeartIcon
  });
})(window);
