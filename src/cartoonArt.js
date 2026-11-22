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

  let _giantTreeCanvas = null;

  function _getGiantTreeSprite() {
    if (_giantTreeCanvas) return _giantTreeCanvas;
    if (typeof document === 'undefined') return null;

    const w = 440;
    const h = 760;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const tctx = off.getContext('2d');
    if (!tctx) return null;

    const baseX = w * 0.5;
    const baseY = h - 22;
    tctx.lineJoin = 'round';
    tctx.lineCap = 'round';

    const barkInk = 'rgba(27, 17, 54, 0.48)';
    const leafInk = 'rgba(20, 22, 58, 0.42)';

    // Helper: paints a scalloped multi-puff organic foliage cloud (never a plain oval!)
    const paintFoliageBunch = (cx, cy, puffs, paletteMode = 'mid') => {
      const palettes = {
        deep: { c0: '#358062', c1: '#235952', c2: '#183f45', hi: 'rgba(138, 224, 130, 0.16)' },
        mid: { c0: '#6ed453', c1: '#3a9c59', c2: '#236353', hi: 'rgba(218, 255, 135, 0.34)' },
        sun: { c0: '#9ef252', c1: '#56ba4e', c2: '#2e7d53', hi: 'rgba(242, 255, 175, 0.46)' }
      };
      const pal = palettes[paletteMode] || palettes.mid;

      // Compute bounding box for natural vertical gradient
      let minY = Infinity;
      let maxY = -Infinity;
      for (const [px, py, pr] of puffs) {
        if (py - pr < minY) minY = py - pr;
        if (py + pr > maxY) maxY = py + pr;
      }

      const traceUnionFill = () => {
        tctx.beginPath();
        for (const [px, py, pr] of puffs) {
          tctx.moveTo(cx + px + pr, cy + py);
          tctx.arc(cx + px, cy + py, pr, 0, Math.PI * 2);
        }
      };

      // Subtle outer shadow contour around entire scalloped cluster silhouette
      tctx.fillStyle = leafInk;
      tctx.beginPath();
      for (const [px, py, pr] of puffs) {
        tctx.moveTo(cx + px + pr + 2.4, cy + py);
        tctx.arc(cx + px, cy + py, pr + 2.4, 0, Math.PI * 2);
      }
      tctx.fill();

      // Main leafy gradient body across scalloped lobes
      const grad = tctx.createLinearGradient(0, cy + minY, 0, cy + maxY);
      grad.addColorStop(0, pal.c0);
      grad.addColorStop(0.55, pal.c1);
      grad.addColorStop(1, pal.c2);
      tctx.fillStyle = grad;
      traceUnionFill();
      tctx.fill();

      // Merged sunlit upper foliage highlight pass (single path so alpha never stacks in circles)
      tctx.fillStyle = pal.hi;
      tctx.beginPath();
      for (const [px, py, pr] of puffs) {
        if (py < 4) {
          const hx = cx + px - pr * 0.14;
          const hy = cy + py - pr * 0.22;
          const hr = pr * 0.72;
          tctx.moveTo(hx + hr, hy);
          tctx.arc(hx, hy, hr, 0, Math.PI * 2);
        }
      }
      tctx.fill();

      // Subtle scalloped inner shadow arcs suggesting layered leaf depth
      tctx.strokeStyle = 'rgba(20, 48, 52, 0.16)';
      tctx.lineWidth = 2.0;
      for (const [px, py, pr] of puffs) {
        if (py >= -6) {
          tctx.beginPath();
          tctx.arc(cx + px, cy + py, pr * 0.72, 0.35, Math.PI - 0.35);
          tctx.stroke();
        }
      }
    };

    // Helper: hanging storybook moss vine with pairs of tiny teardrop leaves
    const paintHangingVine = (vx, vy, len, curveX) => {
      tctx.save();
      tctx.strokeStyle = '#2d7a51';
      tctx.lineWidth = 2.2;
      tctx.beginPath();
      tctx.moveTo(vx, vy);
      tctx.quadraticCurveTo(vx + curveX, vy + len * 0.55, vx + curveX * 0.6, vy + len);
      tctx.stroke();

      const steps = Math.max(2, Math.floor(len / 22));
      for (let i = 1; i <= steps; i++) {
        const u = i / (steps + 0.4);
        const lx = (1 - u) * (1 - u) * vx + 2 * (1 - u) * u * (vx + curveX) + u * u * (vx + curveX * 0.6);
        const ly = (1 - u) * (1 - u) * vy + 2 * (1 - u) * u * (vy + len * 0.55) + u * u * (vy + len);
        const side = i % 2 === 0 ? 1 : -1;
        tctx.fillStyle = i % 2 === 0 ? '#7ae053' : '#4ab558';
        tctx.strokeStyle = leafInk;
        tctx.lineWidth = 1.4;
        tctx.beginPath();
        tctx.ellipse(lx + side * 4.5, ly + 2, 4.6, 2.3, side * 0.55, 0, Math.PI * 2);
        tctx.fill();
        tctx.stroke();
      }
      tctx.restore();
    };

    // Helper: delicate pointed accent leaf cluster tucked along edges
    const paintEdgeLeaves = (lx, ly, ang, sc = 1) => {
      tctx.save();
      tctx.translate(lx, ly);
      tctx.rotate(ang);
      tctx.scale(sc, sc);
      tctx.fillStyle = '#8ae655';
      tctx.strokeStyle = leafInk;
      tctx.lineWidth = 1.8;
      tctx.beginPath();
      tctx.moveTo(0, 0);
      tctx.quadraticCurveTo(8, -6, 17, 0);
      tctx.quadraticCurveTo(8, 6, 0, 0);
      tctx.closePath();
      tctx.fill();
      tctx.stroke();
      tctx.restore();
    };

    // 1. Deep shadowy back foliage layer giving depth behind trunk & main boughs
    paintFoliageBunch(
      baseX - 8,
      baseY - 548,
      [
        [-115, 22, 46],
        [-58, -16, 56],
        [10, -34, 62],
        [76, -12, 54],
        [124, 24, 42],
        [0, 32, 68]
      ],
      'deep'
    );
    paintFoliageBunch(
      baseX - 110,
      baseY - 266,
      [
        [-42, 16, 30],
        [0, 12, 34],
        [44, 18, 28]
      ],
      'deep'
    );
    paintFoliageBunch(
      baseX + 108,
      baseY - 376,
      [
        [-38, 16, 28],
        [6, 12, 34],
        [44, 16, 28]
      ],
      'deep'
    );

    // 2. Hanging moss vines draping naturally below limbs before front canopy edges overlap roots
    paintHangingVine(baseX - 146, baseY - 248, 66, -6);
    paintHangingVine(baseX - 78, baseY - 242, 52, 5);
    paintHangingVine(baseX + 94, baseY - 352, 68, -5);
    paintHangingVine(baseX + 142, baseY - 360, 48, 7);
    paintHangingVine(baseX - 95, baseY - 486, 58, -4);
    paintHangingVine(baseX + 86, baseY - 490, 62, 6);

    // 3. Gnarled twisting World Tree trunk, spreading roots & upper canopy skeleton branches
    const trunkGrad = tctx.createLinearGradient(baseX - 72, baseY, baseX + 68, baseY - 520);
    trunkGrad.addColorStop(0, '#875c65');
    trunkGrad.addColorStop(0.5, '#614052');
    trunkGrad.addColorStop(1, '#3d253c');
    tctx.fillStyle = trunkGrad;
    tctx.strokeStyle = barkInk;
    tctx.lineWidth = 2.8;

    tctx.beginPath();
    // Wide flared asymmetrical left root curling into ground meadow
    tctx.moveTo(baseX - 118, baseY + 18);
    tctx.quadraticCurveTo(baseX - 72, baseY - 14, baseX - 54, baseY - 92);
    tctx.quadraticCurveTo(baseX - 42, baseY - 165, baseX - 50, baseY - 216);
    // Gnarled lower-left sweeping bough splitting into two sub-forks
    tctx.quadraticCurveTo(baseX - 78, baseY - 252, baseX - 152, baseY - 278);
    tctx.lineTo(baseX - 140, baseY - 296);
    tctx.quadraticCurveTo(baseX - 96, baseY - 280, baseX - 74, baseY - 288);
    tctx.lineTo(baseX - 104, baseY - 332);
    tctx.lineTo(baseX - 82, baseY - 338);
    tctx.quadraticCurveTo(baseX - 50, baseY - 304, baseX - 38, baseY - 338);
    // Upper trunk rising into crooked crown forks
    tctx.quadraticCurveTo(baseX - 24, baseY - 442, baseX - 42, baseY - 538);
    tctx.lineTo(baseX - 16, baseY - 552);
    tctx.lineTo(baseX - 8, baseY - 516);
    tctx.quadraticCurveTo(baseX + 4, baseY - 558, baseX + 24, baseY - 556);
    tctx.lineTo(baseX + 34, baseY - 512);
    // Gnarled mid-right sweeping bough with upward twig
    tctx.quadraticCurveTo(baseX + 36, baseY - 444, baseX + 144, baseY - 398);
    tctx.lineTo(baseX + 130, baseY - 372);
    tctx.quadraticCurveTo(baseX + 62, baseY - 394, baseX + 36, baseY - 334);
    tctx.quadraticCurveTo(baseX + 32, baseY - 210, baseX + 54, baseY - 96);
    // Right flared root buttress
    tctx.quadraticCurveTo(baseX + 68, baseY - 22, baseX + 114, baseY + 18);
    tctx.closePath();
    tctx.fill();
    tctx.stroke();

    // Rich cel-shaded shaded right side along trunk curves
    tctx.fillStyle = 'rgba(26, 14, 42, 0.28)';
    tctx.beginPath();
    tctx.moveTo(baseX + 6, baseY + 18);
    tctx.quadraticCurveTo(baseX + 12, baseY - 120, baseX + 2, baseY - 330);
    tctx.quadraticCurveTo(baseX + 18, baseY - 430, baseX + 20, baseY - 520);
    tctx.lineTo(baseX + 34, baseY - 512);
    tctx.quadraticCurveTo(baseX + 36, baseY - 330, baseX + 54, baseY - 96);
    tctx.quadraticCurveTo(baseX + 68, baseY - 22, baseX + 114, baseY + 18);
    tctx.closePath();
    tctx.fill();

    // Sculpted bark fissure ridges + central flared root ridge + cozy mossy hollow
    tctx.strokeStyle = 'rgba(27, 17, 54, 0.32)';
    tctx.lineWidth = 2.4;
    tctx.beginPath();
    tctx.moveTo(baseX - 38, baseY + 12);
    tctx.quadraticCurveTo(baseX - 20, baseY - 72, baseX - 26, baseY - 178);
    tctx.moveTo(baseX + 28, baseY + 8);
    tctx.quadraticCurveTo(baseX + 20, baseY - 62, baseX + 18, baseY - 126);
    tctx.moveTo(baseX - 10, baseY - 252);
    tctx.quadraticCurveTo(baseX + 4, baseY - 344, baseX - 6, baseY - 442);
    tctx.stroke();

    tctx.strokeStyle = 'rgba(255, 224, 200, 0.24)';
    tctx.lineWidth = 2.4;
    tctx.beginPath();
    tctx.moveTo(baseX - 42, baseY - 110);
    tctx.quadraticCurveTo(baseX - 38, baseY - 180, baseX - 42, baseY - 235);
    tctx.moveTo(baseX - 24, baseY - 348);
    tctx.quadraticCurveTo(baseX - 18, baseY - 420, baseX - 24, baseY - 485);
    tctx.stroke();

    // Storybook tree hollow with dark rim & soft moss pad at root base
    tctx.fillStyle = '#2b1933';
    tctx.strokeStyle = barkInk;
    tctx.lineWidth = 2.2;
    tctx.beginPath();
    tctx.ellipse(baseX + 4, baseY - 156, 11, 18, 0.08, 0, Math.PI * 2);
    tctx.fill();
    tctx.stroke();

    paintFoliageBunch(
      baseX - 66,
      baseY - 10,
      [
        [-22, 6, 14],
        [0, 0, 16],
        [20, 8, 12]
      ],
      'mid'
    );
    paintFoliageBunch(
      baseX + 64,
      baseY - 6,
      [
        [-16, 8, 12],
        [4, 2, 15],
        [22, 8, 11]
      ],
      'mid'
    );

    // 4. Layered foreground lush storybook canopy clusters hiding branch tips naturally
    paintFoliageBunch(
      baseX - 118,
      baseY - 294,
      [
        [-48, 12, 26],
        [-22, -10, 32],
        [14, -14, 34],
        [44, 4, 28],
        [18, 20, 26],
        [-20, 18, 28]
      ],
      'sun'
    );
    paintFoliageBunch(
      baseX + 114,
      baseY - 406,
      [
        [-42, 8, 26],
        [-14, -12, 32],
        [22, -10, 32],
        [46, 10, 25],
        [14, 20, 26],
        [-20, 18, 24]
      ],
      'sun'
    );

    // Upper grand multi-tiered sunlit canopy crown
    paintFoliageBunch(
      baseX - 84,
      baseY - 524,
      [
        [-54, 14, 30],
        [-26, -12, 38],
        [18, -18, 42],
        [48, 6, 34],
        [10, 24, 34],
        [-30, 22, 32]
      ],
      'mid'
    );
    paintFoliageBunch(
      baseX + 86,
      baseY - 532,
      [
        [-46, 10, 32],
        [-14, -16, 40],
        [28, -12, 36],
        [52, 12, 28],
        [18, 24, 32],
        [-20, 22, 30]
      ],
      'mid'
    );
    paintFoliageBunch(
      baseX,
      baseY - 602,
      [
        [-72, 16, 34],
        [-40, -14, 42],
        [2, -28, 48],
        [46, -12, 42],
        [74, 16, 32],
        [36, 32, 38],
        [-10, 36, 42],
        [-48, 28, 36]
      ],
      'sun'
    );

    // 5. Crisp stray leaves peeking organically along the outer crown & boughs
    paintEdgeLeaves(baseX - 166, baseY - 294, -2.85, 0.9);
    paintEdgeLeaves(baseX + 162, baseY - 404, -0.35, 0.9);
    paintEdgeLeaves(baseX - 96, baseY - 612, -2.4, 0.95);
    paintEdgeLeaves(baseX + 94, baseY - 622, -0.7, 0.95);
    paintEdgeLeaves(baseX + 4, baseY - 678, -1.52, 1.05);

    _giantTreeCanvas = off;
    return _giantTreeCanvas;
  }

  /**
   * Draws a towering atmospheric storybook World Tree in the background shaft so
   * players feel themselves climbing past roots, boughs, and out above the treetop canopy.
   */
  function drawGiantWorldTree(ctx, baseX, baseY, time = 0) {
    const sprite = _getGiantTreeSprite();
    const sway = Math.sin(time * 1.1) * 2.2;
    if (sprite) {
      ctx.save();
      ctx.globalAlpha = 0.78;
      ctx.drawImage(sprite, baseX - sprite.width * 0.5 + sway * 0.4, baseY - (sprite.height - 24));
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = '#49ad5b';
    ctx.beginPath();
    ctx.arc(baseX, baseY - 560, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Renders altitude-anchored morning meadow hills, the Giant World Tree, and tiered
   * non-looping sky clouds across 0m -> ~115m so ascending feels grounded and vertical.
   */
  function drawAscentVistaBackdrop(ctx, width, height, padLeft, padBottom, floorY, climbPx, camMeters, time) {
    if (climbPx > 5600) return;

    const fadeHigh = camMeters > 92 ? Math.max(0, 1 - (camMeters - 92) / 26) : 1;
    if (fadeHigh <= 0.01) return;

    ctx.save();
    ctx.globalAlpha = fadeHigh;

    const leftX = -padLeft - 8;
    const spanW = width + padLeft * 2 + 16;

    // 1. Distant rolling horizon hills sinking smoothly below as you climb (0.20x parallax)
    const hillBaseY = floorY + 12 - climbPx * 0.8;
    if (hillBaseY - 260 < height + padBottom) {
      ctx.save();
      ctx.globalAlpha = fadeHigh * 0.62;
      ctx.fillStyle = '#3368c9';
      ctx.beginPath();
      ctx.moveTo(leftX, hillBaseY + 120);
      ctx.lineTo(leftX, hillBaseY - 128);
      ctx.quadraticCurveTo(width * 0.22, hillBaseY - 210, width * 0.48, hillBaseY - 140);
      ctx.quadraticCurveTo(width * 0.78, hillBaseY - 220, leftX + spanW, hillBaseY - 132);
      ctx.lineTo(leftX + spanW, hillBaseY + 120);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#48a374';
      ctx.beginPath();
      ctx.moveTo(leftX, hillBaseY + 120);
      ctx.lineTo(leftX, hillBaseY - 64);
      ctx.quadraticCurveTo(width * 0.3, hillBaseY - 118, width * 0.58, hillBaseY - 72);
      ctx.quadraticCurveTo(width * 0.82, hillBaseY - 108, leftX + spanW, hillBaseY - 62);
      ctx.lineTo(leftX + spanW, hillBaseY + 120);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 2. Non-repeating tiered cartoon clouds floating at staggered climbing altitudes
    const cloudDefs = [
      { x: 108, above: 455, p: 0.28, sc: 0.72, a: 0.62, spd: 5 },
      { x: 332, above: 615, p: 0.25, sc: 0.68, a: 0.58, spd: -4 },
      { x: 226, above: 760, p: 0.3, sc: 0.76, a: 0.56, spd: 4.5 },
      { x: 132, above: 925, p: 0.31, sc: 0.82, a: 0.64, spd: 6 },
      { x: 318, above: 1105, p: 0.29, sc: 0.76, a: 0.6, spd: -5 },
      { x: 195, above: 1300, p: 0.32, sc: 0.88, a: 0.62, spd: 4.5 },
      { x: 96, above: 1500, p: 0.29, sc: 0.72, a: 0.52, spd: -3.5 },
      { x: 325, above: 1690, p: 0.3, sc: 0.84, a: 0.54, spd: 5 },
      { x: 215, above: 1920, p: 0.27, sc: 0.76, a: 0.46, spd: -4 },
      { x: 118, above: 2180, p: 0.25, sc: 0.68, a: 0.38, spd: 4 },
      { x: 315, above: 2450, p: 0.24, sc: 0.72, a: 0.32, spd: -3.5 },
      { x: 208, above: 2740, p: 0.23, sc: 0.65, a: 0.26, spd: 3 }
    ];
    for (let i = 0; i < cloudDefs.length; i++) {
      const c = cloudDefs[i];
      const cy = 736 - c.above + climbPx * c.p;
      if (cy < -90 || cy > height + padBottom + 90) continue;
      const cx = c.x + Math.sin(time * 0.24 + i * 1.4) * (c.spd * 2.2);
      drawCartoonCloud(ctx, cx, cy, c.sc, c.a * fadeHigh);
    }

    // 3. Towering World Tree anchored to ground floor (climbed past across 0m -> ~40m at 0.42x parallax)
    const treeBaseY = floorY + 8 - climbPx * 0.58;
    if (treeBaseY - 720 < height + padBottom && treeBaseY + 60 > -320) {
      drawGiantWorldTree(ctx, width * 0.54, treeBaseY, time);
    }

    ctx.restore();
  }

  // ============================================================================
  // HANDCRAFTED PAINTERLY 3-LAYER BIOME BACKDROPS (Zero Floating Objects!)
  //   Layer 1: Sky-fixed celestial bodies & atmosphere (never repeats vertically)
  //   Layer 2: Non-repeating biome-entry horizon vistas (scroll out cleanly as you climb)
  //   Layer 3: Seamless 450x720 offscreen tile — strictly wall-rooted or 0..720 continuous
  // ============================================================================
  const BIOME_TILE_W = 450;
  const BIOME_TILE_H = 720;
  const _biomeTileCache = Object.create(null);
  let _cosmosPlanetCache = null;
  let _cosmosMoonCache = null;

  const BIOME_BASE_METERS = Object.freeze({
    monolith: 115,
    slime: 250,
    desert: 500,
    foundry: 800,
    frost: 1150,
    storm: 1550,
    cosmos: 2000,
    heaven: 2500
  });

  /**
   * Draws a soft organic multi-puff cartoon cloud silhouette with directional shading
   * (no bare primitive circles — sculpted flat-bottomed sunlit cumulus bank).
   */
  function paintPainterlyCloudBank(ctx, cx, cy, scale, topCol, midCol, shadowCol, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    const traceCloud = () => {
      ctx.beginPath();
      ctx.moveTo(-88, 18);
      ctx.bezierCurveTo(-104, 16, -106, -12, -80, -16);
      ctx.bezierCurveTo(-76, -42, -40, -52, -20, -34);
      ctx.bezierCurveTo(-6, -64, 42, -62, 50, -28);
      ctx.bezierCurveTo(78, -32, 98, -10, 92, 12);
      ctx.bezierCurveTo(88, 22, 72, 24, 52, 22);
      ctx.bezierCurveTo(18, 26, -32, 26, -88, 18);
      ctx.closePath();
    };

    const g = ctx.createLinearGradient(0, -58, 0, 26);
    g.addColorStop(0, topCol);
    g.addColorStop(0.58, midCol);
    g.addColorStop(1, shadowCol);
    ctx.fillStyle = g;
    traceCloud();
    ctx.fill();

    ctx.save();
    traceCloud();
    if (typeof ctx.clip === 'function') ctx.clip();
    // Soft underside atmospheric shadow band
    ctx.fillStyle = shadowCol;
    ctx.globalAlpha = alpha * 0.55;
    ctx.beginPath();
    ctx.ellipse(6, 22, 96, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    // Sunlit upper puff rim highlights
    ctx.fillStyle = topCol;
    ctx.globalAlpha = alpha * 0.75;
    ctx.beginPath();
    ctx.ellipse(-36, -30, 22, 9, -0.22, 0, Math.PI * 2);
    ctx.ellipse(16, -42, 26, 10, 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  /**
   * Draws a continuous, mathematically seamless left + right sculpted canyon edge silhouette
   * along [0..BIOME_TILE_H] using periodic harmonics so top (0) and bottom (720) join invisibly.
   */
  function paintSeamlessCanyonEdges(ctx, wallW, depthScale, leftColor, rightColor, rimColor, seedPhase) {
    const H = BIOME_TILE_H;
    const steps = 48;

    const sampleLeft = (t) => {
      const a = t * Math.PI * 2;
      return (
        wallW +
        (26 +
          Math.sin(a + seedPhase) * 16 +
          Math.sin(a * 2 + seedPhase * 1.7) * 10 +
          Math.cos(a * 3 - seedPhase) * 5) *
          depthScale
      );
    };
    const sampleRight = (t) => {
      const a = t * Math.PI * 2;
      return (
        BIOME_TILE_W -
        wallW -
        (26 +
          Math.cos(a + seedPhase * 1.3) * 16 +
          Math.sin(a * 2 - seedPhase * 0.9) * 11 +
          Math.sin(a * 3 + seedPhase) * 5) *
          depthScale
      );
    };

    // Left organic cliff silhouette
    ctx.fillStyle = leftColor;
    ctx.beginPath();
    ctx.moveTo(wallW - 2, -4);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      ctx.lineTo(sampleLeft(t), t * H);
    }
    ctx.lineTo(wallW - 2, H + 4);
    ctx.closePath();
    ctx.fill();

    // Right organic cliff silhouette
    ctx.fillStyle = rightColor;
    ctx.beginPath();
    ctx.moveTo(BIOME_TILE_W - wallW + 2, -4);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      ctx.lineTo(sampleRight(t), t * H);
    }
    ctx.lineTo(BIOME_TILE_W - wallW + 2, H + 4);
    ctx.closePath();
    ctx.fill();

    // Soft directional rim highlight along cliff edges
    if (rimColor) {
      ctx.strokeStyle = rimColor;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = sampleLeft(t) - 1;
        const y = t * H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = sampleRight(t) + 1;
        const y = t * H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  /**
   * Paints a handcrafted organic fantasy mushroom cluster (curved stem, gills, spotted bell cap, soft glow).
   */
  function paintBiolumMushroom(ctx, x, y, sc, tilt, capCol, glowCol) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    ctx.rotate(tilt);

    // Soft bioluminescent ambient glow behind cap
    const halo = ctx.createRadialGradient(0, -34, 4, 0, -34, 62);
    halo.addColorStop(0, glowCol);
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, -34, 62, 0, Math.PI * 2);
    ctx.fill();

    // Curved tapering organic stem
    const sg = ctx.createLinearGradient(-10, -28, 12, 36);
    sg.addColorStop(0, '#5be0a8');
    sg.addColorStop(0.5, '#1d6e5c');
    sg.addColorStop(1, '#0e3c36');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(-7, -26);
    ctx.quadraticCurveTo(-13, 8, -16, 36);
    ctx.quadraticCurveTo(0, 42, 16, 36);
    ctx.quadraticCurveTo(10, 6, 8, -26);
    ctx.closePath();
    ctx.fill();

    // Glowing ribbed underside gills
    ctx.fillStyle = '#99ffd2';
    ctx.beginPath();
    ctx.ellipse(0, -24, 34, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 76, 62, 0.45)';
    ctx.lineWidth = 1.4;
    for (let g = -24; g <= 24; g += 8) {
      ctx.beginPath();
      ctx.moveTo(g * 0.25, -24);
      ctx.lineTo(g, -20);
      ctx.stroke();
    }

    // Lush curved organic mushroom cap dome
    const cg = ctx.createLinearGradient(-28, -58, 28, -18);
    cg.addColorStop(0, '#7effb8');
    cg.addColorStop(0.45, capCol);
    cg.addColorStop(1, '#0c4f44');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(-38, -24);
    ctx.bezierCurveTo(-40, -54, -14, -64, 0, -64);
    ctx.bezierCurveTo(18, -64, 42, -52, 38, -24);
    ctx.quadraticCurveTo(0, -31, -38, -24);
    ctx.closePath();
    ctx.fill();

    // Soft glowing bioluminescent spots + rim sheen
    ctx.fillStyle = 'rgba(218, 255, 232, 0.72)';
    for (const [sx, sy, rx, ry, rot] of [
      [-16, -44, 7, 4.5, -0.35],
      [6, -50, 8.5, 5, 0.15],
      [22, -37, 5.5, 3.8, 0.42],
      [-26, -33, 4.2, 3, -0.45]
    ]) {
      ctx.beginPath();
      ctx.ellipse(sx, sy, rx, ry, rot, 0, Math.PI * 2);
      ctx.fill();
    }

    // Translucent hanging goo droplet clinging to cap edge
    ctx.fillStyle = 'rgba(126, 255, 178, 0.65)';
    ctx.beginPath();
    ctx.moveTo(-26, -24);
    ctx.quadraticCurveTo(-24, -12, -26, -8);
    ctx.arc(-26, -8, 2.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Paints a solid, sculpted rocky cave shelf jutting out from either the left (side = -1)
   * or right (side = 1) canyon wall so mushrooms, runes, or hanging flora visibly grow ON stone.
   */
  function paintCavernRockShelf(ctx, wallW, side, shelfY, reachW, thickness, topCol, bodyCol, rimCol, deepCol = 'rgba(6, 28, 26, 0.92)') {
    const W = BIOME_TILE_W;
    ctx.save();
    if (side < 0) {
      const x0 = wallW - 4;
      const tipX = wallW + reachW;
      const g = ctx.createLinearGradient(x0, shelfY, x0, shelfY + thickness);
      g.addColorStop(0, topCol);
      g.addColorStop(0.35, bodyCol);
      g.addColorStop(1, deepCol);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0, shelfY - 6);
      ctx.quadraticCurveTo(x0 + reachW * 0.55, shelfY - 3, tipX, shelfY + 5);
      ctx.quadraticCurveTo(tipX + 4, shelfY + 15, tipX - 10, shelfY + 22);
      ctx.quadraticCurveTo(x0 + reachW * 0.52, shelfY + thickness * 0.62, x0 + reachW * 0.22, shelfY + thickness);
      ctx.lineTo(x0, shelfY + thickness + 10);
      ctx.closePath();
      ctx.fill();

      // Sunlit / mossy upper crust rim
      ctx.strokeStyle = rimCol;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0 + 4, shelfY - 4);
      ctx.quadraticCurveTo(x0 + reachW * 0.55, shelfY - 1, tipX - 2, shelfY + 6);
      ctx.stroke();
    } else {
      const x0 = W - wallW + 4;
      const tipX = W - wallW - reachW;
      const g = ctx.createLinearGradient(x0, shelfY, x0, shelfY + thickness);
      g.addColorStop(0, topCol);
      g.addColorStop(0.35, bodyCol);
      g.addColorStop(1, deepCol);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0, shelfY - 6);
      ctx.quadraticCurveTo(x0 - reachW * 0.55, shelfY - 3, tipX, shelfY + 5);
      ctx.quadraticCurveTo(tipX - 4, shelfY + 15, tipX + 10, shelfY + 22);
      ctx.quadraticCurveTo(x0 - reachW * 0.52, shelfY + thickness * 0.62, x0 - reachW * 0.22, shelfY + thickness);
      ctx.lineTo(x0, shelfY + thickness + 10);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = rimCol;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0 - 4, shelfY - 4);
      ctx.quadraticCurveTo(x0 - reachW * 0.55, shelfY - 1, tipX + 2, shelfY + 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Isolated offscreen sprite for the Cosmos Ringed Nebula Planet (sky-fixed Layer 1).
   */
  function getCosmosPlanetSprite() {
    if (_cosmosPlanetCache) return _cosmosPlanetCache;
    if (typeof document === 'undefined') return null;
    try {
      const cvs = document.createElement('canvas');
      cvs.width = 168;
      cvs.height = 108;
      const ctx = cvs.getContext('2d');
      if (!ctx) return null;

      ctx.save();
      ctx.translate(84, 54);

      // Soft astral aura behind planet
      const aura = ctx.createRadialGradient(0, 0, 18, 0, 0, 52);
      aura.addColorStop(0, 'rgba(218, 128, 255, 0.26)');
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, 52, 0, Math.PI * 2);
      ctx.fill();

      // Back half of golden ring
      ctx.save();
      ctx.rotate(-0.32);
      ctx.strokeStyle = 'rgba(255, 224, 130, 0.5)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.ellipse(0, 0, 68, 17, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Cel-shaded planet globe
      const pg = ctx.createLinearGradient(-32, -32, 32, 32);
      pg.addColorStop(0, '#f5c2ff');
      pg.addColorStop(0.55, '#8642cc');
      pg.addColorStop(1, '#2a115c');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      if (typeof ctx.clip === 'function') ctx.clip();
      ctx.fillStyle = 'rgba(255, 224, 255, 0.26)';
      ctx.fillRect(-36, -15, 72, 7.5);
      ctx.fillRect(-36, 4, 72, 5.5);
      ctx.fillStyle = 'rgba(20, 6, 52, 0.46)';
      ctx.beginPath();
      ctx.arc(15, 15, 36, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Front half of golden ring
      ctx.save();
      ctx.rotate(-0.32);
      ctx.strokeStyle = 'rgba(255, 234, 152, 0.78)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.ellipse(0, 0, 68, 17, 0, 0, Math.PI);
      ctx.stroke();
      ctx.restore();

      ctx.restore();
      _cosmosPlanetCache = cvs;
      return cvs;
    } catch (_) {
      return null;
    }
  }

  /**
   * Isolated offscreen sprite for the Cosmos Crescent Moon (uses destination-out ONLY inside
   * its own blank transparent canvas so it never punches through the main sky canvas).
   */
  function getCosmosMoonSprite() {
    if (_cosmosMoonCache) return _cosmosMoonCache;
    if (typeof document === 'undefined') return null;
    try {
      const cvs = document.createElement('canvas');
      cvs.width = 128;
      cvs.height = 128;
      const ctx = cvs.getContext('2d');
      if (!ctx) return null;

      ctx.save();
      ctx.translate(64, 64);

      // Cut crescent cleanly on an isolated sub-layer first, then layer soft lunar glow behind
      const disc = document.createElement('canvas');
      disc.width = 64;
      disc.height = 64;
      const dctx = disc.getContext('2d');
      if (dctx) {
        dctx.translate(32, 32);
        dctx.fillStyle = 'rgba(255, 244, 198, 0.76)';
        dctx.beginPath();
        dctx.arc(0, 0, 24, 0, Math.PI * 2);
        dctx.fill();
        dctx.globalCompositeOperation = 'destination-out';
        dctx.beginPath();
        dctx.arc(11, -7, 21, 0, Math.PI * 2);
        dctx.fill();
      }

      const mg = ctx.createRadialGradient(0, 0, 8, 0, 0, 58);
      mg.addColorStop(0, 'rgba(255, 240, 185, 0.28)');
      mg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(0, 0, 58, 0, Math.PI * 2);
      ctx.fill();

      ctx.drawImage(disc, -32, -32);
      ctx.restore();
      _cosmosMoonCache = cvs;
      return cvs;
    } catch (_) {
      return null;
    }
  }

  /**
   * LAYER 1 — Sky-Fixed Celestial Backdrop.
   * Sun, Aurora Borealis, Cosmos Nebula/Planet/Moon, Heaven Sun-Gate Halo stay serenely
   * poised in the deep sky and NEVER repeat vertically like wallpaper.
   */
  function drawBiomeSkyAnchors(ctx, bgStyle, width, height, padTop, padBottom, time, fadeAlpha) {
    ctx.save();
    ctx.globalAlpha = fadeAlpha;

    if (bgStyle === 'monolith') {
      // Soft twilight dusk orb high in the violet sky grounding sunset cliff rims
      const mx = width * 0.52;
      const my = height * 0.22;
      const halo = ctx.createRadialGradient(mx, my, 10, mx, my, 130);
      halo.addColorStop(0, 'rgba(255, 216, 168, 0.28)');
      halo.addColorStop(0.45, 'rgba(198, 140, 255, 0.14)');
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(mx, my, 130, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 232, 200, 0.22)';
      ctx.beginPath();
      ctx.arc(mx, my, 24, 0, Math.PI * 2);
      ctx.fill();
    } else if (bgStyle === 'slime') {
      // Cavernous emerald-mint bioluminescent skylight filtering gently from high above
      const sg = ctx.createRadialGradient(width * 0.5, height * 0.18, 12, width * 0.5, height * 0.22, 185);
      sg.addColorStop(0, 'rgba(92, 255, 178, 0.18)');
      sg.addColorStop(0.55, 'rgba(32, 165, 124, 0.08)');
      sg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.2, 185, 0, Math.PI * 2);
      ctx.fill();
    } else if (bgStyle === 'desert') {
      // Radiant Desert Sun poised serenely in the golden sky (never repeats!)
      const sx = width * 0.62;
      const sy = height * 0.22;
      const pulse = 1 + Math.sin(time * 0.9) * 0.03;
      const sunG = ctx.createRadialGradient(sx, sy, 12, sx, sy, 132 * pulse);
      sunG.addColorStop(0, 'rgba(255, 248, 202, 0.62)');
      sunG.addColorStop(0.32, 'rgba(255, 214, 118, 0.28)');
      sunG.addColorStop(0.7, 'rgba(255, 168, 86, 0.08)');
      sunG.addColorStop(1, 'rgba(255, 160, 80, 0)');
      ctx.fillStyle = sunG;
      ctx.beginPath();
      ctx.arc(sx, sy, 132 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 248, 210, 0.48)';
      ctx.beginPath();
      ctx.arc(sx, sy, 29, 0, Math.PI * 2);
      ctx.fill();
    } else if (bgStyle === 'foundry') {
      // Deep rising lava-sea ember underglow radiating up from the abyss below
      const pulse = 0.22 + 0.05 * Math.sin(time * 1.6);
      const fg = ctx.createRadialGradient(width * 0.5, height + padBottom + 20, 20, width * 0.5, height * 0.92, 260);
      fg.addColorStop(0, `rgba(255, 132, 46, ${pulse})`);
      fg.addColorStop(0.55, 'rgba(218, 56, 36, 0.11)');
      fg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.92, 260, 0, Math.PI * 2);
      ctx.fill();
    } else if (bgStyle === 'frost') {
      // Undulating Northern Aurora Borealis curtains shimmering in the high arctic sky
      const wave1 = Math.sin(time * 0.55) * 18;
      const wave2 = Math.cos(time * 0.42) * 16;
      for (const [ay, wv, cTop, cMid] of [
        [height * 0.22, wave1, 'rgba(96, 198, 255, 0.04)', 'rgba(92, 255, 214, 0.26)'],
        [height * 0.34, wave2, 'rgba(176, 148, 255, 0.04)', 'rgba(130, 232, 255, 0.22)']
      ]) {
        const ag = ctx.createLinearGradient(0, ay - 75, 0, ay + 75);
        ag.addColorStop(0, cTop);
        ag.addColorStop(0.48, cMid);
        ag.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = ag;
        ctx.beginPath();
        ctx.moveTo(0, ay - 20 + wv * 0.4);
        ctx.bezierCurveTo(width * 0.3, ay - 82 - wv, width * 0.68, ay + 34 + wv, width, ay - 32 - wv * 0.4);
        ctx.lineTo(width, ay + 74 - wv * 0.3);
        ctx.bezierCurveTo(width * 0.65, ay + 112 + wv, width * 0.32, ay + 10 - wv, 0, ay + 72 + wv * 0.3);
        ctx.closePath();
        ctx.fill();
      }
    } else if (bgStyle === 'storm') {
      // Distant high-altitude storm illumination pulsing subtly behind the citadel
      const flash = Math.pow(Math.max(0, Math.sin(time * 1.15) * Math.sin(time * 3.7)), 12);
      const sg = ctx.createRadialGradient(width * 0.5, height * 0.26, 10, width * 0.5, height * 0.26, 180);
      sg.addColorStop(0, `rgba(128, 242, 255, ${0.18 + flash * 0.28})`);
      sg.addColorStop(0.6, 'rgba(54, 118, 214, 0.07)');
      sg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.26, 180, 0, Math.PI * 2);
      ctx.fill();
    } else if (bgStyle === 'cosmos') {
      // Sweeping sky-fixed painterly nebula clouds
      for (const [nx, ny, rx, ry, rot, c1] of [
        [width * 0.44, height * 0.26, 175, 74, -0.35, 'rgba(197, 108, 240, 0.22)'],
        [width * 0.60, height * 0.32, 145, 58, -0.24, 'rgba(84, 214, 255, 0.14)'],
        [width * 0.56, height * 0.66, 185, 76, 0.3, 'rgba(218, 112, 255, 0.18)'],
        [width * 0.34, height * 0.72, 130, 54, 0.2, 'rgba(255, 198, 112, 0.12)']
      ]) {
        ctx.save();
        ctx.translate(nx, ny);
        ctx.rotate(rot);
        const ng = ctx.createRadialGradient(0, 0, 8, 0, 0, rx);
        ng.addColorStop(0, c1);
        ng.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = ng;
        ctx.scale(1, ry / rx);
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Sky-fixed hand-shaded Ringed Nebula Planet + Crescent Moon (zero vertical repetition!)
      const planet = getCosmosPlanetSprite();
      if (planet) {
        const py = height * 0.24 + Math.sin(time * 0.5) * 2.5;
        ctx.drawImage(planet, width * 0.66 - planet.width * 0.5, py - planet.height * 0.5);
      }
      const moon = getCosmosMoonSprite();
      if (moon) {
        const my = height * 0.61 + Math.cos(time * 0.45) * 2;
        ctx.drawImage(moon, width * 0.30 - moon.width * 0.5, my - moon.height * 0.5);
      }
    } else if (bgStyle === 'heaven') {
      // Radiant Golden Celestial Sun-Gate Halo glowing serenely in the high sky
      const hx = width * 0.5;
      const hy = height * 0.23;
      const pulse = 1 + Math.sin(time * 1.1) * 0.03;

      const hg = ctx.createRadialGradient(hx, hy, 12, hx, hy, 170 * pulse);
      hg.addColorStop(0, 'rgba(255, 253, 232, 0.64)');
      hg.addColorStop(0.38, 'rgba(255, 230, 142, 0.28)');
      hg.addColorStop(0.75, 'rgba(255, 214, 110, 0.08)');
      hg.addColorStop(1, 'rgba(255, 214, 110, 0)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(hx, hy, 170 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Gentle rotating golden sunburst beams
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(time * 0.06);
      ctx.fillStyle = 'rgba(255, 248, 198, 0.14)';
      for (let i = 0; i < 8; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-10, -150);
        ctx.lineTo(10, -150);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Delicate twin golden concentric halo rings
      ctx.strokeStyle = 'rgba(255, 236, 152, 0.48)';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(hx, hy, 74, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 252, 224, 0.34)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(hx, hy, 92, 0, Math.PI * 2);
      ctx.stroke();

      // Radiant 4-point celestial star emblem at halo center
      ctx.fillStyle = 'rgba(255, 252, 220, 0.85)';
      ctx.beginPath();
      ctx.moveTo(hx, hy - 22);
      ctx.lineTo(hx + 6, hy - 6);
      ctx.lineTo(hx + 22, hy);
      ctx.lineTo(hx + 6, hy + 6);
      ctx.lineTo(hx, hy + 22);
      ctx.lineTo(hx - 6, hy + 6);
      ctx.lineTo(hx - 22, hy);
      ctx.lineTo(hx - 6, hy - 6);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * LAYER 2 — Non-Repeating Biome-Entry Horizon Vistas.
   * Grounded landmarks (Desert Pyramids & Dunes, Heaven Golden Cloud Sea, Valley Monolith Ridge,
   * Foundry Caldera Rim, Frost Alpine Peaks, Storm Thunderhead Deck) anchor solidly to the bottom
   * at biome entry and scroll smoothly down out of view as the player ascends — NEVER repeating!
   */
  function drawBiomeHorizonVista(ctx, bgStyle, width, height, padBottom, wallWidth, camMeters, time, fadeAlpha) {
    if (camMeters === null || camMeters === undefined) return;
    const baseM = BIOME_BASE_METERS[bgStyle];
    if (baseM === undefined) return;

    const deltaM = Math.max(-10, camMeters - baseM);
    const horizonY = height * 0.74 + deltaM * 7.2;
    const cullLimit = height + padBottom + 230;
    if (horizonY > cullLimit) return;

    const bottomFillY = Math.max(height + padBottom + 140, horizonY + 360);
    const W = width;

    ctx.save();
    ctx.globalAlpha = fadeAlpha;

    if (bgStyle === 'monolith') {
      // Distant twilight mountain ridge + standing ancient monolith silhouettes rooted on ground
      ctx.fillStyle = 'rgba(42, 22, 86, 0.62)';
      ctx.beginPath();
      ctx.moveTo(0, bottomFillY);
      ctx.lineTo(0, horizonY - 26);
      ctx.quadraticCurveTo(W * 0.28, horizonY - 82, W * 0.52, horizonY - 38);
      ctx.quadraticCurveTo(W * 0.78, horizonY - 94, W, horizonY - 24);
      ctx.lineTo(W, bottomFillY);
      ctx.closePath();
      ctx.fill();

      // Iconic ancient standing monoliths firmly planted into the mountain ridge
      ctx.fillStyle = 'rgba(36, 18, 76, 0.74)';
      for (const [mx, mh, mw] of [
        [W * 0.34, 128, 34],
        [W * 0.64, 152, 42]
      ]) {
        const baseY = horizonY - 12;
        ctx.beginPath();
        ctx.moveTo(mx - mw * 0.58, baseY + 30);
        ctx.lineTo(mx - mw * 0.42, baseY - mh * 0.92);
        ctx.lineTo(mx + mw * 0.1, baseY - mh);
        ctx.lineTo(mx + mw * 0.44, baseY - mh * 0.88);
        ctx.lineTo(mx + mw * 0.6, baseY + 30);
        ctx.closePath();
        ctx.fill();
      }

      // Nearer misty violet ridge crest covering the monolith roots cleanly
      const rg = ctx.createLinearGradient(0, horizonY - 18, 0, bottomFillY);
      rg.addColorStop(0, 'rgba(56, 31, 108, 0.84)');
      rg.addColorStop(1, 'rgba(34, 17, 68, 0.94)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(0, bottomFillY);
      ctx.lineTo(0, horizonY + 8);
      ctx.quadraticCurveTo(W * 0.36, horizonY - 32, W * 0.66, horizonY + 10);
      ctx.quadraticCurveTo(W * 0.86, horizonY - 18, W, horizonY + 12);
      ctx.lineTo(W, bottomFillY);
      ctx.closePath();
      ctx.fill();
    } else if (bgStyle === 'desert') {
      // Grand 2-tone stone-coursed Sandstone Pyramids resting solidly on wall-to-wall Golden Dunes
      const drawSandPyramid = (px, baseY, halfW, pyrH) => {
        const peakX = px;
        const peakY = baseY - pyrH;
        const ridgeX = px + halfW * 0.14;

        // Sunlit golden-ochre left face
        const lg = ctx.createLinearGradient(px - halfW, baseY, peakX, peakY);
        lg.addColorStop(0, 'rgba(244, 166, 84, 0.78)');
        lg.addColorStop(1, 'rgba(255, 228, 152, 0.88)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(px - halfW, baseY + 40);
        ctx.lineTo(peakX, peakY);
        ctx.lineTo(ridgeX, baseY + 40);
        ctx.closePath();
        ctx.fill();

        // Deep warm terracotta shadow right face
        const rg = ctx.createLinearGradient(peakX, peakY, px + halfW, baseY);
        rg.addColorStop(0, 'rgba(156, 62, 36, 0.84)');
        rg.addColorStop(1, 'rgba(116, 42, 26, 0.76)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.moveTo(peakX, peakY);
        ctx.lineTo(px + halfW, baseY + 40);
        ctx.lineTo(ridgeX, baseY + 40);
        ctx.closePath();
        ctx.fill();

        // Subtle carved sandstone stone courses
        ctx.strokeStyle = 'rgba(110, 42, 24, 0.24)';
        ctx.lineWidth = 1.2;
        for (let row = 1; row <= 5; row++) {
          const f = row / 6;
          const ry = peakY + pyrH * f;
          ctx.beginPath();
          ctx.moveTo(peakX - halfW * f, ry);
          ctx.lineTo(peakX + halfW * f, ry);
          ctx.stroke();
        }
      };

      drawSandPyramid(W * 0.37, horizonY + 8, 108, 142);
      drawSandPyramid(W * 0.69, horizonY + 20, 82, 104);

      // Far rolling dune ridge wrapping cleanly behind foreground dunes
      ctx.fillStyle = 'rgba(208, 114, 54, 0.66)';
      ctx.beginPath();
      ctx.moveTo(0, bottomFillY);
      ctx.lineTo(0, horizonY - 12);
      ctx.bezierCurveTo(W * 0.28, horizonY - 40, W * 0.64, horizonY + 12, W, horizonY - 18);
      ctx.lineTo(W, bottomFillY);
      ctx.closePath();
      ctx.fill();

      // Sweeping foreground wind-sculpted golden sand dune filling solidly down past viewport bottom
      const duneGrad = ctx.createLinearGradient(0, horizonY - 12, 0, bottomFillY);
      duneGrad.addColorStop(0, 'rgba(242, 152, 74, 0.86)');
      duneGrad.addColorStop(0.32, 'rgba(196, 94, 46, 0.92)');
      duneGrad.addColorStop(1, 'rgba(132, 48, 28, 0.96)');
      ctx.fillStyle = duneGrad;
      ctx.beginPath();
      ctx.moveTo(0, bottomFillY);
      ctx.lineTo(0, horizonY + 6);
      ctx.bezierCurveTo(W * 0.34, horizonY - 26, W * 0.58, horizonY + 34, W, horizonY - 2);
      ctx.lineTo(W, bottomFillY);
      ctx.closePath();
      ctx.fill();

      // Crisp sunlit golden dune crest rim
      ctx.strokeStyle = 'rgba(255, 236, 174, 0.56)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(0, horizonY + 6);
      ctx.bezierCurveTo(W * 0.34, horizonY - 26, W * 0.58, horizonY + 34, W, horizonY - 2);
      ctx.stroke();
    } else if (bgStyle === 'foundry') {
      // Glowing molten caldera lake spanning organically wall-to-wall, framed by jagged volcanic ridges
      const mg = ctx.createLinearGradient(0, horizonY - 18, 0, bottomFillY);
      mg.addColorStop(0, 'rgba(255, 168, 68, 0.62)');
      mg.addColorStop(0.18, 'rgba(235, 76, 36, 0.84)');
      mg.addColorStop(0.5, 'rgba(136, 26, 32, 0.94)');
      mg.addColorStop(1, 'rgba(52, 12, 22, 0.98)');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.moveTo(0, bottomFillY);
      ctx.lineTo(0, horizonY + 8);
      ctx.bezierCurveTo(W * 0.28, horizonY - 10, W * 0.68, horizonY + 18, W, horizonY + 4);
      ctx.lineTo(W, bottomFillY);
      ctx.closePath();
      ctx.fill();

      // Bright incandescent magma crest rim
      ctx.strokeStyle = 'rgba(255, 224, 120, 0.55)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, horizonY + 8);
      ctx.bezierCurveTo(W * 0.28, horizonY - 10, W * 0.68, horizonY + 18, W, horizonY + 4);
      ctx.stroke();

      // Jagged volcanic basalt caldera shoulders hugging left & right edges smoothly into the magma lake
      ctx.fillStyle = 'rgba(42, 13, 22, 0.86)';
      ctx.beginPath();
      ctx.moveTo(0, bottomFillY);
      ctx.lineTo(0, horizonY - 62);
      ctx.lineTo(W * 0.17, horizonY - 26);
      ctx.lineTo(W * 0.30, horizonY + 14);
      ctx.quadraticCurveTo(W * 0.16, horizonY + 34, 0, horizonY + 46);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(W, bottomFillY);
      ctx.lineTo(W, horizonY - 66);
      ctx.lineTo(W * 0.82, horizonY - 24);
      ctx.lineTo(W * 0.69, horizonY + 16);
      ctx.quadraticCurveTo(W * 0.84, horizonY + 36, W, horizonY + 48);
      ctx.closePath();
      ctx.fill();
    } else if (bgStyle === 'frost') {
      // Sunlit snow-capped alpine glacier mountain range spanning wall-to-wall
      const peaks = [
        [W * 0.24, horizonY + 18, 128, 126],
        [W * 0.54, horizonY + 24, 146, 148],
        [W * 0.82, horizonY + 16, 122, 118]
      ];
      for (const [px, by, hw, ph] of peaks) {
        // Moonlit icy-white left slope
        ctx.fillStyle = 'rgba(184, 244, 255, 0.44)';
        ctx.beginPath();
        ctx.moveTo(px - hw, by + 60);
        ctx.lineTo(px, by - ph);
        ctx.lineTo(px + hw * 0.12, by + 60);
        ctx.closePath();
        ctx.fill();
        // Deep glacier-teal right slope
        ctx.fillStyle = 'rgba(18, 74, 112, 0.72)';
        ctx.beginPath();
        ctx.moveTo(px, by - ph);
        ctx.lineTo(px + hw, by + 60);
        ctx.lineTo(px + hw * 0.12, by + 60);
        ctx.closePath();
        ctx.fill();
      }
      // Solid snowy glacier valley floor filling cleanly down past viewport bottom
      const fg = ctx.createLinearGradient(0, horizonY, 0, bottomFillY);
      fg.addColorStop(0, 'rgba(32, 108, 146, 0.84)');
      fg.addColorStop(1, 'rgba(14, 56, 88, 0.96)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(0, bottomFillY);
      ctx.lineTo(0, horizonY + 14);
      ctx.quadraticCurveTo(W * 0.35, horizonY - 12, W * 0.68, horizonY + 18);
      ctx.quadraticCurveTo(W * 0.86, horizonY + 2, W, horizonY + 16);
      ctx.lineTo(W, bottomFillY);
      ctx.closePath();
      ctx.fill();
    } else if (bgStyle === 'storm') {
      // Rolling wall-to-wall thunderhead cumulus cloud deck with silver-cyan linings
      const drift = Math.sin(time * 0.35) * 6;
      paintPainterlyCloudBank(ctx, W * 0.2 + drift, horizonY - 4, 1.38, '#88d8ff', '#2d5292', '#14254c', 0.78);
      paintPainterlyCloudBank(ctx, W * 0.8 - drift, horizonY + 2, 1.42, '#88d8ff', '#2b4d88', '#14254c', 0.78);
      paintPainterlyCloudBank(ctx, W * 0.5 + drift * 0.5, horizonY + 12, 1.56, '#a4e4ff', '#315896', '#162954', 0.88);

      const sg = ctx.createLinearGradient(0, horizonY + 10, 0, bottomFillY);
      sg.addColorStop(0, 'rgba(22, 41, 84, 0.88)');
      sg.addColorStop(1, 'rgba(12, 24, 54, 0.98)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, horizonY + 18, W, bottomFillY - horizonY);
    } else if (bgStyle === 'heaven') {
      // Breathtaking sunlit Golden Cumulus Cloud Sea pierced upon entering Heaven (2500m)
      const drift = Math.sin(time * 0.4) * 5;

      // Far sunlit golden-ivory horizon cloud banks
      paintPainterlyCloudBank(ctx, W * 0.16 + drift, horizonY - 14, 1.35, '#fffdf5', '#f7edd9', '#bcc9eb', 0.82);
      paintPainterlyCloudBank(ctx, W * 0.84 - drift, horizonY - 10, 1.38, '#fffdf5', '#f7edd9', '#bcc9eb', 0.82);
      paintPainterlyCloudBank(ctx, W * 0.5 + drift * 0.6, horizonY - 2, 1.58, '#ffffff', '#fff7e6', '#c9d4f2', 0.92);

      // Foreground bright billowing cloud crest spanning wall-to-wall
      paintPainterlyCloudBank(ctx, W * 0.28 - drift * 0.5, horizonY + 26, 1.32, '#ffffff', '#fff8e8', '#ced8f4', 0.94);
      paintPainterlyCloudBank(ctx, W * 0.72 + drift * 0.5, horizonY + 28, 1.34, '#ffffff', '#fff8e8', '#ced8f4', 0.94);

      // Solid luminous pearlescent cloud sea filling cleanly down past viewport bottom
      const cg = ctx.createLinearGradient(0, horizonY + 24, 0, bottomFillY);
      cg.addColorStop(0, 'rgba(248, 242, 232, 0.92)');
      cg.addColorStop(0.35, 'rgba(214, 218, 242, 0.94)');
      cg.addColorStop(1, 'rgba(176, 188, 228, 0.96)');
      ctx.fillStyle = cg;
      ctx.fillRect(0, horizonY + 34, W, bottomFillY - horizonY);
    }

    ctx.restore();
  }

  /**
   * LAYER 3 — Seamless 450x720 Offscreen Tile (Strictly Wall-Rooted OR Continuous 0..720).
   * Zero floating mid-air objects: every structural element connects continuously top-to-bottom
   * or anchors physically into the left/right canyon walls.
   */
  function getBiomeBackdropTile(bgStyle) {
    if (_biomeTileCache[bgStyle]) return _biomeTileCache[bgStyle];
    if (typeof document === 'undefined') return null;
    try {
      const cvs = document.createElement('canvas');
      cvs.width = BIOME_TILE_W;
      cvs.height = BIOME_TILE_H;
      const ctx = cvs.getContext('2d');
      if (!ctx) return null;

      const W = BIOME_TILE_W;
      const H = BIOME_TILE_H;
      const WALL = 36;

      if (bgStyle === 'monolith') {
        // ==================== ANCIENT CRAGS (TWILIGHT RUIN CANYON) ====================
        // 1. Wall-to-wall weathered stone arch bridge spanning the twilight chasm
        ctx.fillStyle = 'rgba(42, 23, 89, 0.62)';
        ctx.beginPath();
        ctx.moveTo(WALL, 222);
        ctx.quadraticCurveTo(W * 0.5, 174, W - WALL, 222);
        ctx.lineTo(W - WALL, 266);
        ctx.quadraticCurveTo(W * 0.5, 226, WALL, 266);
        ctx.closePath();
        ctx.fill();
        // Warm sunset rim along arch crest
        ctx.strokeStyle = 'rgba(255, 210, 140, 0.28)';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(WALL, 222);
        ctx.quadraticCurveTo(W * 0.5, 174, W - WALL, 222);
        ctx.stroke();

        // Hanging organic canyon vines anchored directly to the underside of the stone bridge
        ctx.strokeStyle = 'rgba(116, 214, 96, 0.38)';
        ctx.lineWidth = 2.2;
        for (const [vx, vy, len] of [
          [W * 0.34, 240, 62],
          [W * 0.48, 229, 44],
          [W * 0.64, 238, 56]
        ]) {
          ctx.beginPath();
          ctx.moveTo(vx, vy);
          ctx.quadraticCurveTo(vx + 6, vy + len * 0.5, vx - 3, vy + len);
          ctx.stroke();
        }

        // 2. Seamless layered twilight cliff walls
        paintSeamlessCanyonEdges(ctx, WALL, 1.4, 'rgba(53, 30, 107, 0.66)', 'rgba(46, 25, 96, 0.68)', 'rgba(196, 158, 255, 0.18)', 0.6);
        paintSeamlessCanyonEdges(ctx, WALL, 0.8, 'rgba(66, 38, 122, 0.88)', 'rgba(58, 33, 110, 0.88)', 'rgba(255, 214, 148, 0.24)', 2.1);

        // 3. Solid protruding stone buttress ledges rooted directly into side cliffs
        paintCavernRockShelf(ctx, WALL, -1, 488, 66, 44, '#5e3898', '#3c216e', 'rgba(255, 216, 152, 0.3)', 'rgba(24, 10, 52, 0.92)');
        paintCavernRockShelf(ctx, WALL, 1, 136, 62, 42, '#583390', '#381e66', 'rgba(255, 216, 152, 0.28)', 'rgba(24, 10, 52, 0.92)');

        // Hanging vines from underside of the rock buttress ledges
        ctx.strokeStyle = 'rgba(116, 214, 96, 0.34)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(WALL + 44, 510);
        ctx.quadraticCurveTo(WALL + 50, 540, WALL + 41, 566);
        ctx.moveTo(W - WALL - 42, 156);
        ctx.quadraticCurveTo(W - WALL - 48, 182, W - WALL - 40, 204);
        ctx.stroke();

        // Carved glowing ruin sigils etched directly ON the rock buttress faces
        ctx.strokeStyle = 'rgba(222, 188, 255, 0.42)';
        ctx.lineWidth = 2;
        for (const [rx, ry] of [
          [WALL + 20, 146],
          [W - WALL - 22, 392],
          [WALL + 20, 562]
        ]) {
          ctx.beginPath();
          ctx.moveTo(rx, ry - 11);
          ctx.lineTo(rx + 7.5, ry);
          ctx.lineTo(rx, ry + 11);
          ctx.lineTo(rx - 7.5, ry);
          ctx.closePath();
          ctx.stroke();
        }
      } else if (bgStyle === 'slime') {
        // ==================== SLIME MIRE (BIOLUMINESCENT GOO CAVERN) ====================
        // 1. Soft glowing emerald-teal bioluminescent mist pockets
        for (const [gx, gy, gr] of [
          [W * 0.34, 190, 125],
          [W * 0.68, 490, 140]
        ]) {
          const mist = ctx.createRadialGradient(gx, gy, 10, gx, gy, gr);
          mist.addColorStop(0, 'rgba(92, 255, 175, 0.2)');
          mist.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = mist;
          ctx.beginPath();
          ctx.arc(gx, gy, gr, 0, Math.PI * 2);
          ctx.fill();
        }

        // 2. Two continuous top-to-bottom (0..720 periodic) gnarled giant cavern root columns
        const paintContinuousRoot = (baseX, widthPx, phase, amp, colDark, colRim) => {
          const steps = 40;
          const xAt = (t) => baseX + Math.sin(t * Math.PI * 2 + phase) * amp + Math.cos(t * Math.PI * 4 - phase) * (amp * 0.25);
          ctx.fillStyle = colDark;
          ctx.beginPath();
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = xAt(t) - widthPx * 0.5;
            if (i === 0) ctx.moveTo(x, t * H);
            else ctx.lineTo(x, t * H);
          }
          for (let i = steps; i >= 0; i--) {
            const t = i / steps;
            ctx.lineTo(xAt(t) + widthPx * 0.5, t * H);
          }
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = colRim;
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = xAt(t) - widthPx * 0.42;
            if (i === 0) ctx.moveTo(x, t * H);
            else ctx.lineTo(x, t * H);
          }
          ctx.stroke();
        };

        paintContinuousRoot(116, 22, 0.4, 13, 'rgba(10, 54, 46, 0.62)', 'rgba(94, 245, 170, 0.2)');
        paintContinuousRoot(W - 112, 24, 2.5, 14, 'rgba(9, 48, 42, 0.62)', 'rgba(94, 245, 170, 0.18)');

        // 3. Wall-to-wall curved organic limestone-goo cavern bridge
        ctx.fillStyle = 'rgba(13, 66, 56, 0.64)';
        ctx.beginPath();
        ctx.moveTo(WALL, 314);
        ctx.bezierCurveTo(W * 0.35, 278, W * 0.65, 298, W - WALL, 348);
        ctx.lineTo(W - WALL, 396);
        ctx.bezierCurveTo(W * 0.64, 348, W * 0.34, 334, WALL, 364);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(126, 255, 184, 0.24)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(WALL, 314);
        ctx.bezierCurveTo(W * 0.35, 278, W * 0.65, 298, W - WALL, 348);
        ctx.stroke();

        // Translucent goo stalactites dripping directly from the bridge underside
        ctx.fillStyle = 'rgba(86, 255, 154, 0.36)';
        for (const [dx, dy, dl] of [
          [135, 348, 36],
          [185, 340, 52],
          [270, 349, 42],
          [325, 366, 28]
        ]) {
          ctx.beginPath();
          ctx.moveTo(dx - 5, dy);
          ctx.quadraticCurveTo(dx - 2, dy + dl * 0.7, dx, dy + dl);
          ctx.quadraticCurveTo(dx + 2, dy + dl * 0.7, dx + 5, dy);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.arc(dx, dy + dl + 8, 2.8, 0, Math.PI * 2);
          ctx.fill();
        }

        // 4. Seamless organic mossy-goo canyon walls
        paintSeamlessCanyonEdges(ctx, WALL, 1.35, 'rgba(14, 72, 60, 0.72)', 'rgba(12, 64, 54, 0.72)', 'rgba(110, 255, 175, 0.2)', 1.2);
        paintSeamlessCanyonEdges(ctx, WALL, 0.75, 'rgba(20, 88, 69, 0.9)', 'rgba(17, 79, 62, 0.9)', 'rgba(148, 255, 196, 0.28)', 3.0);

        // 5. Solid sculpted mossy rock cave shelves jutting from walls + mushrooms rooted firmly ON them!
        // Left upper shelf (y = 224) supporting two glowing mushrooms
        paintCavernRockShelf(ctx, WALL, -1, 224, 88, 48, '#289e73', '#125446', 'rgba(144, 255, 196, 0.45)');
        paintBiolumMushroom(ctx, WALL + 54, 195, 0.96, 0.11, '#24c485', 'rgba(92, 255, 175, 0.24)');
        paintBiolumMushroom(ctx, WALL + 24, 207, 0.54, 0.25, '#4be89e', 'rgba(92, 255, 175, 0.16)');
        // Subtle front moss collar tucking mushroom stems cleanly into the stone shelf
        ctx.fillStyle = '#248f6a';
        ctx.beginPath();
        ctx.ellipse(WALL + 44, 226, 36, 7, 0.05, 0, Math.PI * 2);
        ctx.fill();

        // Right mid-lower shelf (y = 540) supporting a lush mushroom pair
        paintCavernRockShelf(ctx, WALL, 1, 540, 92, 50, '#26946c', '#104e42', 'rgba(144, 255, 196, 0.44)');
        paintBiolumMushroom(ctx, W - WALL - 56, 510, 1.0, -0.12, '#1fb87e', 'rgba(92, 255, 175, 0.24)');
        paintBiolumMushroom(ctx, W - WALL - 24, 523, 0.56, -0.24, '#52f2a6', 'rgba(92, 255, 175, 0.18)');
        ctx.fillStyle = '#1f8462';
        ctx.beginPath();
        ctx.ellipse(W - WALL - 44, 542, 38, 7.5, -0.05, 0, Math.PI * 2);
        ctx.fill();

        // Left lower shelf (y = 636) supporting a medium mushroom
        paintCavernRockShelf(ctx, WALL, -1, 636, 72, 40, '#26946c', '#104e42', 'rgba(144, 255, 196, 0.4)');
        paintBiolumMushroom(ctx, WALL + 42, 613, 0.68, 0.16, '#2bd48f', 'rgba(92, 255, 175, 0.18)');
        ctx.fillStyle = '#218663';
        ctx.beginPath();
        ctx.ellipse(WALL + 36, 638, 28, 6, 0.04, 0, Math.PI * 2);
        ctx.fill();
      } else if (bgStyle === 'desert') {
        // ==================== GOLDEN DUNES — CARVED PETRA SANDSTONE GORGE ====================
        // (Desert Sun is sky-fixed in Layer 1; Pyramids & Dunes rest on the 500m horizon in Layer 2!)
        // 1. Wall-to-wall carved sandstone aqueduct arch bridge spanning the gorge
        ctx.fillStyle = 'rgba(138, 56, 32, 0.62)';
        ctx.beginPath();
        ctx.moveTo(WALL, 354);
        ctx.quadraticCurveTo(W * 0.5, 314, W - WALL, 354);
        ctx.lineTo(W - WALL, 396);
        ctx.quadraticCurveTo(W * 0.5, 358, WALL, 396);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 224, 146, 0.34)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(WALL, 354);
        ctx.quadraticCurveTo(W * 0.5, 314, W - WALL, 354);
        ctx.stroke();

        // Subtle stone keystone joints along the sandstone arch
        ctx.strokeStyle = 'rgba(92, 32, 18, 0.28)';
        ctx.lineWidth = 1.4;
        for (let i = 1; i <= 5; i++) {
          const kx = WALL + ((W - WALL * 2) * i) / 6;
          const archRise = Math.sin((i / 6) * Math.PI) * 20;
          ctx.beginPath();
          ctx.moveTo(kx, 354 - archRise);
          ctx.lineTo(kx, 394 - archRise);
          ctx.stroke();
        }

        // 2. Seamless wind-carved Petra red-rock canyon cliffs
        paintSeamlessCanyonEdges(ctx, WALL, 1.35, 'rgba(163, 71, 39, 0.66)', 'rgba(143, 58, 33, 0.7)', 'rgba(255, 224, 148, 0.26)', 0.4);
        paintSeamlessCanyonEdges(ctx, WALL, 0.78, 'rgba(186, 88, 44, 0.86)', 'rgba(162, 72, 36, 0.88)', 'rgba(255, 234, 168, 0.34)', 2.5);

        // 3. Petra-style carved sandstone pilasters & recessed arched niches built INTO side cliffs
        for (const [side, ny] of [
          [-1, 145],
          [1, 520]
        ]) {
          const nx = side < 0 ? WALL + 6 : W - WALL - 26;
          // Recessed shadowed temple niche carved directly into cliff face
          ctx.fillStyle = 'rgba(98, 34, 22, 0.38)';
          roundRectPath(ctx, nx, ny - 34, 20, 68, 8);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 224, 148, 0.28)';
          ctx.lineWidth = 1.6;
          roundRectPath(ctx, nx, ny - 34, 20, 68, 8);
          ctx.stroke();
          // Carved triangular sandstone pediment cap
          ctx.fillStyle = 'rgba(224, 132, 62, 0.48)';
          ctx.beginPath();
          ctx.moveTo(nx - 3, ny - 34);
          ctx.lineTo(nx + 10, ny - 48);
          ctx.lineTo(nx + 23, ny - 34);
          ctx.closePath();
          ctx.fill();
        }

        // 4. Horizontal wind-carved sedimentary rock strata bands strictly inside cliff zone
        ctx.strokeStyle = 'rgba(255, 218, 142, 0.22)';
        ctx.lineWidth = 2;
        for (let sy = 36; sy < H; sy += 72) {
          ctx.beginPath();
          ctx.moveTo(WALL, sy);
          ctx.lineTo(WALL + 22, sy + 2);
          ctx.moveTo(W - WALL - 22, sy + 36);
          ctx.lineTo(W - WALL, sy + 34);
          ctx.stroke();
        }
      } else if (bgStyle === 'foundry') {
        // ==================== MOLTEN FOUNDRY (CONTINUOUS BASALT & LAVA FALLS) ====================
        // 1. Warm rising magma haze pools
        for (const [gx, gy, gr] of [
          [W * 0.34, 240, 125],
          [W * 0.66, 560, 135]
        ]) {
          const lg = ctx.createRadialGradient(gx, gy, 8, gx, gy, gr);
          lg.addColorStop(0, 'rgba(255, 136, 48, 0.2)');
          lg.addColorStop(0.55, 'rgba(214, 52, 36, 0.08)');
          lg.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = lg;
          ctx.beginPath();
          ctx.arc(gx, gy, gr, 0, Math.PI * 2);
          ctx.fill();
        }

        // 2. Continuous top-to-bottom (0..720) faceted hexagonal basalt columns flanking the caldera
        for (const [bx, bw, rimDir] of [
          [92, 24, 1],
          [122, 18, 1],
          [W - 122, 18, -1],
          [W - 92, 24, -1]
        ]) {
          const bg = ctx.createLinearGradient(bx - bw * 0.5, 0, bx + bw * 0.5, 0);
          if (rimDir > 0) {
            bg.addColorStop(0, 'rgba(38, 12, 22, 0.72)');
            bg.addColorStop(0.75, 'rgba(54, 18, 28, 0.66)');
            bg.addColorStop(1, 'rgba(255, 138, 52, 0.28)');
          } else {
            bg.addColorStop(0, 'rgba(255, 138, 52, 0.28)');
            bg.addColorStop(0.25, 'rgba(54, 18, 28, 0.66)');
            bg.addColorStop(1, 'rgba(38, 12, 22, 0.72)');
          }
          ctx.fillStyle = bg;
          ctx.fillRect(bx - bw * 0.5, 0, bw, H);

          // Periodic stepped horizontal basalt fracture joints (every 120px divides 720 evenly!)
          ctx.strokeStyle = 'rgba(22, 6, 14, 0.45)';
          ctx.lineWidth = 1.6;
          for (let jy = 0; jy < H; jy += 120) {
            const oy = jy + (bx % 30);
            ctx.beginPath();
            ctx.moveTo(bx - bw * 0.5, oy);
            ctx.lineTo(bx + bw * 0.5, oy + 5);
            ctx.stroke();
          }
        }

        // 3. Two continuous UNINTERRUPTED top-to-bottom (0..720) glowing molten lava falls!
        const paintContinuousLavaFall = (lx, lw, phase) => {
          const steps = 36;
          const xAt = (t) => lx + Math.sin(t * Math.PI * 2 + phase) * 3.5;
          const wAt = (t) => lw * (0.88 + 0.16 * Math.cos(t * Math.PI * 4 + phase));

          // Soft outer molten glow ribbon
          ctx.fillStyle = 'rgba(255, 102, 38, 0.18)';
          ctx.beginPath();
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = xAt(t) - wAt(t) * 1.35;
            if (i === 0) ctx.moveTo(x, t * H);
            else ctx.lineTo(x, t * H);
          }
          for (let i = steps; i >= 0; i--) {
            const t = i / steps;
            ctx.lineTo(xAt(t) + wAt(t) * 1.35, t * H);
          }
          ctx.closePath();
          ctx.fill();

          // Bright incandescent lava stream core
          const lg = ctx.createLinearGradient(lx - lw, 0, lx + lw, 0);
          lg.addColorStop(0, 'rgba(255, 96, 36, 0.55)');
          lg.addColorStop(0.5, 'rgba(255, 224, 114, 0.78)');
          lg.addColorStop(1, 'rgba(255, 96, 36, 0.55)');
          ctx.fillStyle = lg;
          ctx.beginPath();
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = xAt(t) - wAt(t) * 0.5;
            if (i === 0) ctx.moveTo(x, t * H);
            else ctx.lineTo(x, t * H);
          }
          for (let i = steps; i >= 0; i--) {
            const t = i / steps;
            ctx.lineTo(xAt(t) + wAt(t) * 0.5, t * H);
          }
          ctx.closePath();
          ctx.fill();
        };

        paintContinuousLavaFall(134, 9.5, 0.5);
        paintContinuousLavaFall(W - 134, 10.5, 2.4);

        // 4. Wall-to-wall heavy forged iron chains anchored solidly into both cliffs
        ctx.strokeStyle = 'rgba(28, 10, 18, 0.65)';
        ctx.lineWidth = 3.6;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(WALL, 185);
        ctx.quadraticCurveTo(W * 0.5, 254, W - WALL, 170);
        ctx.moveTo(WALL, 540);
        ctx.quadraticCurveTo(W * 0.5, 606, W - WALL, 526);
        ctx.stroke();
        ctx.setLineDash([]);

        // 5. Seamless volcanic obsidian cliff walls with warm magma rim-light
        paintSeamlessCanyonEdges(ctx, WALL, 1.4, 'rgba(56, 18, 28, 0.74)', 'rgba(48, 15, 24, 0.76)', 'rgba(255, 152, 66, 0.28)', 1.5);
        paintSeamlessCanyonEdges(ctx, WALL, 0.78, 'rgba(72, 24, 32, 0.92)', 'rgba(64, 21, 29, 0.92)', 'rgba(255, 182, 84, 0.38)', 3.6);
      } else if (bgStyle === 'frost') {
        // ==================== FROST PEAKS (GLACIAL CRYSTAL CANYON) ====================
        // (Northern Aurora Borealis is sky-fixed in Layer 1; Alpine Peaks rest on 1150m horizon in Layer 2!)
        // 1. Wall-to-wall natural sculpted glacial ice arch bridge with hanging icicles
        const iceArchGrad = ctx.createLinearGradient(0, 296, 0, 384);
        iceArchGrad.addColorStop(0, 'rgba(202, 248, 255, 0.56)');
        iceArchGrad.addColorStop(0.55, 'rgba(52, 146, 184, 0.62)');
        iceArchGrad.addColorStop(1, 'rgba(20, 78, 116, 0.7)');
        ctx.fillStyle = iceArchGrad;
        ctx.beginPath();
        ctx.moveTo(WALL, 338);
        ctx.quadraticCurveTo(W * 0.5, 292, W - WALL, 338);
        ctx.lineTo(W - WALL, 382);
        ctx.quadraticCurveTo(W * 0.5, 342, WALL, 382);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(232, 254, 255, 0.55)';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(WALL, 338);
        ctx.quadraticCurveTo(W * 0.5, 292, W - WALL, 338);
        ctx.stroke();

        // Sharp translucent icicles hanging straight from the underside of the ice bridge
        ctx.fillStyle = 'rgba(186, 246, 255, 0.52)';
        for (const [ix, iy, il] of [
          [128, 366, 36],
          [184, 355, 48],
          [242, 353, 30],
          [308, 362, 42]
        ]) {
          ctx.beginPath();
          ctx.moveTo(ix - 5, iy);
          ctx.lineTo(ix, iy + il);
          ctx.lineTo(ix + 5, iy);
          ctx.closePath();
          ctx.fill();
        }

        // 2. Faceted sunlit glacial crystal spires rooted DEEP inside canyon rock walls
        const drawIceCrystalCluster = (cx, cy, dir, sc) => {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.scale(dir * sc, sc);
          for (const [ang, len, wid] of [
            [-0.45, 76, 19],
            [-0.12, 96, 23],
            [0.24, 62, 16]
          ]) {
            ctx.save();
            ctx.rotate(ang);
            ctx.fillStyle = 'rgba(34, 118, 156, 0.62)';
            ctx.beginPath();
            ctx.moveTo(-18, -wid * 0.55);
            ctx.lineTo(len, 0);
            ctx.lineTo(-18, wid * 0.55);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(205, 250, 255, 0.38)';
            ctx.beginPath();
            ctx.moveTo(-18, -wid * 0.55);
            ctx.lineTo(len, 0);
            ctx.lineTo(-18, 0);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
          ctx.restore();
        };

        drawIceCrystalCluster(WALL + 4, 210, 1, 1.0);
        drawIceCrystalCluster(W - WALL - 4, 480, -1, 1.06);
        drawIceCrystalCluster(WALL + 4, 625, 1, 0.82);

        // 3. Seamless sculpted snow-and-glacier canyon ridges overlapping crystal bases cleanly
        paintSeamlessCanyonEdges(ctx, WALL, 1.32, 'rgba(20, 78, 116, 0.66)', 'rgba(18, 70, 106, 0.68)', 'rgba(196, 248, 255, 0.3)', 0.9);
        paintSeamlessCanyonEdges(ctx, WALL, 0.74, 'rgba(29, 98, 138, 0.86)', 'rgba(25, 88, 126, 0.88)', 'rgba(232, 254, 255, 0.44)', 2.9);
      } else if (bgStyle === 'storm') {
        // ==================== STORM SPIRE (ENDLESS GOTHIC CITADEL TOWERS) ====================
        // (Rolling Thunderhead Cloud Deck is grounded on 1550m horizon in Layer 2!)
        // 1. Two continuous top-to-bottom (0..720) Gothic Storm-Citadel Lattice Towers
        const paintStormTower = (tx, tw) => {
          // Dark iron-slate vertical structural rails
          ctx.fillStyle = 'rgba(18, 36, 78, 0.74)';
          ctx.fillRect(tx - tw * 0.5, 0, 5.5, H);
          ctx.fillRect(tx + tw * 0.5 - 5.5, 0, 5.5, H);
          // Translucent tower core interior
          ctx.fillStyle = 'rgba(22, 44, 92, 0.42)';
          ctx.fillRect(tx - tw * 0.5 + 5, 0, tw - 10, H);

          // Central vertical copper lightning conduit
          ctx.strokeStyle = 'rgba(128, 242, 255, 0.36)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(tx, 0);
          ctx.lineTo(tx, H);
          ctx.stroke();

          // Periodic diagonal Gothic X-bracing & glowing Tesla insulator rings (step 90px divides 720!)
          ctx.strokeStyle = 'rgba(20, 42, 86, 0.78)';
          ctx.lineWidth = 2.4;
          for (let y = 0; y < H; y += 90) {
            ctx.beginPath();
            ctx.moveTo(tx - tw * 0.5 + 4, y);
            ctx.lineTo(tx + tw * 0.5 - 4, y + 90);
            ctx.moveTo(tx + tw * 0.5 - 4, y);
            ctx.lineTo(tx - tw * 0.5 + 4, y + 90);
            ctx.moveTo(tx - tw * 0.5, y);
            ctx.lineTo(tx + tw * 0.5, y);
            ctx.stroke();

            // Glowing cyan Tesla coil ring every 180px
            if (y % 180 === 0) {
              ctx.fillStyle = 'rgba(130, 244, 255, 0.52)';
              roundRectPath(ctx, tx - tw * 0.58, y + 38, tw * 1.16, 6, 3);
              ctx.fill();
            }
          }
        };

        paintStormTower(106, 28);
        paintStormTower(W - 106, 28);

        // 2. Wall-to-wall riveted iron sky-bridges & glowing cyan power cables anchored into walls
        for (const [by, sag] of [
          [210, 28],
          [570, 26]
        ]) {
          // Catenary electric conduit cable sagging gently below the sky-bridge
          ctx.strokeStyle = 'rgba(122, 240, 255, 0.38)';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(WALL, by + 10);
          ctx.quadraticCurveTo(W * 0.5, by + 16 + sag, W - WALL, by + 10);
          ctx.stroke();

          // Solid riveted iron girder sky-bridge spanning wall-to-wall
          ctx.fillStyle = 'rgba(18, 38, 82, 0.72)';
          ctx.fillRect(WALL, by - 7, W - WALL * 2, 13);
          ctx.strokeStyle = 'rgba(154, 238, 255, 0.3)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(WALL, by - 7);
          ctx.lineTo(W - WALL, by - 7);
          ctx.stroke();
        }

        // 3. Seamless storm-citadel canyon cliffs
        paintSeamlessCanyonEdges(ctx, WALL, 1.25, 'rgba(24, 48, 96, 0.72)', 'rgba(20, 42, 86, 0.74)', 'rgba(138, 233, 255, 0.26)', 1.7);
        paintSeamlessCanyonEdges(ctx, WALL, 0.68, 'rgba(32, 62, 114, 0.88)', 'rgba(28, 54, 102, 0.9)', 'rgba(176, 244, 255, 0.34)', 4.0);
      } else if (bgStyle === 'cosmos') {
        // ==================== ASTRAL COSMOS (DEEP 3D PARALLAX STARFIELD) ====================
        // (Nebula, Ringed Planet, and Crescent Moon stay majestically fixed in Layer 1 sky!)
        // Soft distant stardust speckles & delicate constellation threads scrolling seamlessly
        const stars = [
          [112, 92, 5.2],
          [168, 152, 3.6],
          [134, 232, 4.6],
          [328, 148, 4.8],
          [282, 214, 3.4],
          [224, 326, 4.8],
          [326, 420, 5.6],
          [268, 474, 3.8],
          [344, 542, 4.4],
          [124, 488, 4.5],
          [188, 636, 5.2],
          [294, 668, 3.8]
        ];

        ctx.strokeStyle = 'rgba(232, 190, 255, 0.2)';
        ctx.lineWidth = 1.3;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(112, 92);
        ctx.lineTo(168, 152);
        ctx.lineTo(134, 232);
        ctx.moveTo(326, 420);
        ctx.lineTo(268, 474);
        ctx.lineTo(344, 542);
        ctx.moveTo(124, 488);
        ctx.lineTo(188, 636);
        ctx.stroke();
        ctx.setLineDash([]);

        // Soft distant faint background nebula stardust dots
        for (let i = 0; i < 34; i++) {
          const sx = 54 + ((i * 79 + 29) % (W - 108));
          const sy = (i * 113 + 37) % H;
          const sr = 1 + (i % 3) * 0.65;
          ctx.fillStyle = i % 3 === 0 ? 'rgba(238, 192, 255, 0.42)' : 'rgba(255, 248, 224, 0.48)';
          ctx.beginPath();
          ctx.arc(sx, sy, sr, 0, Math.PI * 2);
          ctx.fill();
        }

        // Storybook 4-point diamond stars
        ctx.fillStyle = 'rgba(255, 248, 216, 0.76)';
        for (const [sx, sy, sr] of stars) {
          ctx.beginPath();
          ctx.moveTo(sx, sy - sr);
          ctx.lineTo(sx + sr * 0.28, sy - sr * 0.28);
          ctx.lineTo(sx + sr, sy);
          ctx.lineTo(sx + sr * 0.28, sy + sr * 0.28);
          ctx.lineTo(sx, sy + sr);
          ctx.lineTo(sx - sr * 0.28, sy + sr * 0.28);
          ctx.lineTo(sx - sr, sy);
          ctx.lineTo(sx - sr * 0.28, sy - sr * 0.28);
          ctx.closePath();
          ctx.fill();
        }
      } else if (bgStyle === 'heaven') {
        // ==================== CELESTIAL HEAVEN (ENDLESS MARBLE CATHEDRAL COLONNADE) ====================
        // (Golden Sun-Gate Halo is sky-fixed in Layer 1; Golden Cumulus Cloud Sea rests on 2500m horizon in Layer 2!)
        // 1. Soaring golden-trimmed celestial cathedral arches bridging between the continuous columns
        for (const archY of [180, 540]) {
          // Graceful pearlescent stone vault soffit springing cleanly from the inner colonnade
          ctx.strokeStyle = 'rgba(255, 250, 236, 0.36)';
          ctx.lineWidth = 10;
          ctx.beginPath();
          ctx.moveTo(126, archY);
          ctx.quadraticCurveTo(W * 0.5, archY - 96, W - 126, archY);
          ctx.stroke();

          // Ornate double golden arch moldings
          ctx.strokeStyle = 'rgba(255, 222, 112, 0.66)';
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.moveTo(126, archY - 4);
          ctx.quadraticCurveTo(W * 0.5, archY - 102, W - 126, archY - 4);
          ctx.stroke();

          ctx.strokeStyle = 'rgba(255, 252, 224, 0.48)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(126, archY + 5);
          ctx.quadraticCurveTo(W * 0.5, archY - 88, W - 126, archY + 5);
          ctx.stroke();

          // Radiant 4-point golden celestial keystone at arch apex
          const ky = archY - 52;
          ctx.fillStyle = 'rgba(255, 240, 152, 0.82)';
          ctx.beginPath();
          ctx.moveTo(W * 0.5, ky - 11);
          ctx.lineTo(W * 0.5 + 3.5, ky - 3.5);
          ctx.lineTo(W * 0.5 + 11, ky);
          ctx.lineTo(W * 0.5 + 3.5, ky + 3.5);
          ctx.lineTo(W * 0.5, ky + 11);
          ctx.lineTo(W * 0.5 - 3.5, ky + 3.5);
          ctx.lineTo(W * 0.5 - 11, ky);
          ctx.lineTo(W * 0.5 - 3.5, ky - 3.5);
          ctx.closePath();
          ctx.fill();
        }

        // 2. Four continuous top-to-bottom (0..720) fluted pearl-white marble cathedral columns
        const paintContinuousMarbleColumn = (cx, colW, alpha) => {
          ctx.save();
          ctx.globalAlpha = alpha;
          const colGrad = ctx.createLinearGradient(cx - colW * 0.5, 0, cx + colW * 0.5, 0);
          colGrad.addColorStop(0, 'rgba(255, 254, 248, 0.9)');
          colGrad.addColorStop(0.55, 'rgba(242, 234, 218, 0.82)');
          colGrad.addColorStop(1, 'rgba(182, 176, 210, 0.72)');
          ctx.fillStyle = colGrad;
          ctx.fillRect(cx - colW * 0.5, 0, colW, H);

          // Continuous classical vertical fluting grooves (0..720 seamlessly)
          ctx.strokeStyle = 'rgba(148, 142, 182, 0.34)';
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.moveTo(cx - colW * 0.22, 0);
          ctx.lineTo(cx - colW * 0.22, H);
          ctx.moveTo(cx + colW * 0.22, 0);
          ctx.lineTo(cx + colW * 0.22, H);
          ctx.stroke();

          // Sunlit ivory edge highlight
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.58)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(cx - colW * 0.44, 0);
          ctx.lineTo(cx - colW * 0.44, H);
          ctx.stroke();

          // Periodic sculpted golden Ionic cornice bands (at y = 180 and y = 540 — aligns with arches!)
          for (const cy of [180, 540]) {
            ctx.fillStyle = 'rgba(255, 216, 92, 0.88)';
            roundRectPath(ctx, cx - colW * 0.7, cy - 5, colW * 1.4, 10, 3);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 252, 224, 0.72)';
            roundRectPath(ctx, cx - colW * 0.62, cy - 10, colW * 1.24, 4.5, 2);
            ctx.fill();
            roundRectPath(ctx, cx - colW * 0.62, cy + 5.5, colW * 1.24, 4.5, 2);
            ctx.fill();
          }
          ctx.restore();
        };

        // Recessed inner colonnade (softer atmospheric depth) + prominent outer marble colonnade
        paintContinuousMarbleColumn(126, 18, 0.62);
        paintContinuousMarbleColumn(W - 126, 18, 0.62);
        paintContinuousMarbleColumn(74, 28, 0.86);
        paintContinuousMarbleColumn(W - 74, 28, 0.86);

        // 3. Soft wispy translucent atmospheric mist ribbons drifting gently across outer columns
        for (const [wy, wrx, wry] of [
          [96, 155, 16],
          [442, 168, 18]
        ]) {
          const wg = ctx.createRadialGradient(W * 0.5, wy, 10, W * 0.5, wy, wrx);
          wg.addColorStop(0, 'rgba(255, 252, 240, 0.22)');
          wg.addColorStop(0.6, 'rgba(255, 246, 222, 0.08)');
          wg.addColorStop(1, 'rgba(255, 246, 222, 0)');
          ctx.fillStyle = wg;
          ctx.save();
          ctx.translate(W * 0.5, wy);
          ctx.scale(1, wry / wrx);
          ctx.beginPath();
          ctx.arc(0, 0, wrx, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // Subtle painterly grain unified over every biome tile so it blends seamlessly with the cartoon art style
      overlayGrain(ctx, 0, 0, W, H, 0.04);
      _biomeTileCache[bgStyle] = cvs;
      return cvs;
    } catch (_) {
      return null;
    }
  }

  /**
   * Renders the full 3-Layer Vertical World Biome Backdrop in strict atmospheric depth order:
   *   1) Sky-Fixed Celestial Backdrop (Sun, Aurora, Planet/Moon, Sun-Gate — never repeats)
   *   2) Non-Repeating Biome-Entry Horizon Vista (Pyramids & Dunes, Cloud Sea, Peaks — grounded)
   *   3) Cached Seamless 720px Vertical Architecture Tile (strictly wall-rooted or 0..720 continuous)
   */
  function drawBiomeBackdrop(
    ctx,
    bgStyle,
    width,
    height,
    padTop,
    padBottom,
    wallWidth,
    cameraY,
    time,
    fadeAlpha = 1,
    camMeters = null
  ) {
    if (!bgStyle || bgStyle === 'canopy' || fadeAlpha <= 0.01) return;

    // Layer 1: Sky-fixed celestial bodies & atmosphere
    drawBiomeSkyAnchors(ctx, bgStyle, width, height, padTop, padBottom, time, fadeAlpha);

    // Layer 2: Non-repeating biome-entry horizon landmarks (behind nearer canyon/cathedral walls)
    drawBiomeHorizonVista(ctx, bgStyle, width, height, padBottom, wallWidth, camMeters, time, fadeAlpha);

    // Layer 3: Continuous top-to-bottom or wall-rooted architecture tile at 0.14x parallax
    const tile = getBiomeBackdropTile(bgStyle);
    if (!tile) return;

    const span = BIOME_TILE_H;
    const offset = ((-cameraY * 0.14) % span + span) % span;
    const startY = offset - span * Math.ceil((padTop + span) / span);
    const endY = height + padBottom + span;

    ctx.save();
    ctx.globalAlpha = fadeAlpha;
    for (let y = startY; y < endY; y += span) {
      ctx.drawImage(tile, 0, y, width, span);
    }

    // Subtle soft-feathered radial ambient shimmer pulse over magical biomes (zero hard circle edge)
    if (bgStyle === 'heaven' || bgStyle === 'cosmos') {
      const shimmer = 0.06 + 0.04 * Math.sin(time * 1.8);
      const cx = width * 0.5;
      const cy = height * 0.24;
      const sg = ctx.createRadialGradient(cx, cy, 12, cx, cy, 185);
      sg.addColorStop(
        0,
        bgStyle === 'heaven' ? `rgba(255, 248, 204, ${shimmer})` : `rgba(230, 184, 255, ${shimmer})`
      );
      sg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.globalAlpha = fadeAlpha;
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(cx, cy, 185, 0, Math.PI * 2);
      ctx.fill();
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
    drawGiantWorldTree,
    drawAscentVistaBackdrop,
    drawBiomeSkyAnchors,
    drawBiomeHorizonVista,
    drawBiomeBackdrop,
    drawGemEmblem,
    drawTrophyIcon,
    drawGearIcon,
    drawSpeakerIcon,
    drawMusicIcon,
    drawGlobeIcon,
    drawHeartIcon
  });
})(window);
