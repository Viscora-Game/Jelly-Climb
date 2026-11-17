(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});
  const C = JellyGame.CONSTANTS;

  const STORAGE_KEYS = Object.freeze({
    BEST: 'jelly_climb_best_meters',
    BEST_RISING: 'jelly_climb_best_rising_meters',
    GEMS: 'jelly_climb_gems',
    UNLOCKED: 'jelly_climb_unlocked_acc',
    EQUIPPED: 'jelly_climb_equipped_acc',
    EQUIPPED_SLOTS: 'jelly_climb_equipped_slots',
    UNLOCKED_COLORS: 'jelly_climb_unlocked_colors',
    EQUIPPED_COLOR: 'jelly_climb_equipped_color',
    LANG: 'jelly_climb_lang',
    SOUND: 'jelly_climb_sound',
    MUSIC: 'jelly_climb_music',
    TUTORIAL_DONE: 'jelly_climb_onboarding_v2_done',
    GAME_MODE: 'jelly_climb_mode',
    BEST_TEMPO: 'jelly_climb_best_tempo',
    TOTAL_CLOSE_CALLS: 'jelly_climb_close_calls',
    REWARDS_CLAIMED: 'jelly_climb_rewards_claimed',
    BOSSES_DEFEATED: 'jelly_climb_bosses_defeated'
  });

  function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val;
  }

  function lerpColor(a, b, t) {
    const ar = (a >> 16) & 255;
    const ag = (a >> 8) & 255;
    const ab = a & 255;
    const br = (b >> 16) & 255;
    const bg = (b >> 8) & 255;
    const bb = b & 255;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return `rgb(${r}, ${g}, ${bl})`;
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

  function pointInRect(px, py, rect) {
    return (
      rect &&
      px >= rect.x &&
      px <= rect.x + rect.w &&
      py >= rect.y &&
      py <= rect.y + rect.h
    );
  }

  /**
   * Core game loop, camera controller, tempo flow, themes, accessories & renderer.
   */
  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.dpr = 1;

      this.audio = new JellyGame.SoundFX();
      this.particles = new JellyGame.ParticleSystem();
      this.player = new JellyGame.Player();
      this.generator = new JellyGame.LevelGenerator();
      this.leaderboard = JellyGame.LeaderboardClient ? new JellyGame.LeaderboardClient() : null;
      this.lbTab = 'classic'; // 'classic' | 'rising'
      this.lbScrollY = 0;
      this.lbDragging = false;
      this.lbLastDragY = 0;
      this.lbDragMoved = false;

      this.projectiles = [];
      this.cameraY = C.START_CAMERA_Y;
      this.highestY = C.START_PLAYER_Y;
      this.currentMeters = 0;
      this.bestMeters = this._loadInt(STORAGE_KEYS.BEST, 0);
      this.bestRisingMeters = this._loadInt(STORAGE_KEYS.BEST_RISING, 0);
      this.isNewRecord = false;

      // Tutorial & Mode state ('tutorial' | 'classic' | 'rising')
      this.tutorialDone = this._loadBool(STORAGE_KEYS.TUTORIAL_DONE, false);
      this.gameMode = this._loadInitialMode();
      this.tutorialStepIdx = 0;
      this.tutorialCompletedThisRun = false;
      this.risingFloorY = C.FLOOR_Y + (C.RISING_FLOOR ? C.RISING_FLOOR.START_OFFSET_Y : 95);

      // Persistent collectibles, multi-slot accessories & bioluminescent jelly colors
      this.gems = this._loadInt(STORAGE_KEYS.GEMS, 0);
      this.unlockedAccessories = this._loadUnlocked();
      this.equippedSlots = this._loadEquippedSlots();
      this.equippedAccessory = JellyGame.Accessories
        ? JellyGame.Accessories.serializeSlots(this.equippedSlots)
        : 'none';
      this.unlockedColors = this._loadUnlockedColors();
      this.equippedColor = this._loadEquippedColor();
      this.player.equippedAccessory = this.equippedAccessory;
      this.player.equippedColor = this.equippedColor;
      this.runGemsEarned = 0;

      // World best record ribbon tracking
      this.runStartBestMeters = this.getActiveBestMeters();
      this.bestBannerBroken = false;

      // Tempo / rhythm & close-call state
      this.tempoTier = 1;
      this.tempoTimer = 0;
      this.runMaxTempo = 1;
      this.bestTempo = this._loadInt(STORAGE_KEYS.BEST_TEMPO, 1);
      this.totalCloseCalls = this._loadInt(STORAGE_KEYS.TOTAL_CLOSE_CALLS, 0);
      this.slowMoTimer = 0;

      // Progression milestone rewards & celebratory toast
      this.claimedRewards = this._loadStringSet(STORAGE_KEYS.REWARDS_CLAIMED, []);
      this.unseenRewards = new Set();
      this.wardrobeTab = 'head'; // 'head' | 'face' | 'back' | 'rewards'
      this.wardrobeScrollY = 0;
      this.wardrobeDragging = false;
      this.wardrobeLastDragY = 0;
      this.wardrobeDragMoved = false;
      this.rewardToast = null;
      this.runUnlockedGear = [];

      // Boss encounter progression (250m -> 500m -> 1000m -> 2000m -> 4000m -> 8000m...)
      this.bossesDefeated = this._loadInt(STORAGE_KEYS.BOSSES_DEFEATED, 0);
      this.activeBoss = null;
      this.nextBossIndex = 0;
      this.runBossesDefeated = 0;
      this.bossWarnedIndex = -1;
      this.bossWarningTimer = 0;

      // Altitude theme banner state
      this.announcedThemeIdx = 0;
      this.themeBannerText = '';
      this.themeBannerTimer = 0;

      // Language, sound FX & royalty-free music settings (primary English, secondary Turkish)
      this.lang = this._loadLang();
      this.soundEnabled = this._loadBool(STORAGE_KEYS.SOUND, true);
      this.musicEnabled = this._loadBool(STORAGE_KEYS.MUSIC, true);
      this.audio.setEnabled(this.soundEnabled);
      this.audio.setMusicEnabled(this.musicEnabled);

      // UI & state flags
      this.state = 'menu'; // 'menu' | 'playing' | 'dead'
      this.activeModal = null; // null | 'modes' | 'leaderboard' | 'accessories' | 'settings' | 'privacy'
      this.confirmResetPending = false;
      this.resetStatusMsg = '';
      this.showHitboxes = false;
      this.deathTimer = 0;
      this.hitStopTimer = 0;
      this.shakeMag = 0;
      this.hasLaunchedOnce = false;
      this.hintTime = 0;
      this.pressedBtn = null;

      // Tactile UI spring & micro-animation states
      this.modalAnim = 0;
      this.hudGemPulse = 0;
      this.meterMilestonePulse = 0;
      this.wardrobePreviewBounce = 0;

      // Interactive UI hit rects (in logical 450x800 coordinates)
      this.uiRects = {
        topMenuBtn: { x: 14, y: 16, w: 40, h: 40 },
        topShopBtn: { x: C.WIDTH - 116, y: 16, w: 102, h: 40 },
        tutSkipBtn: null,
        modeTutorialBtn: null,
        modeClassicBtn: null,
        modeRisingBtn: null,
        menuPlayBtn: null,
        menuAccBtn: null,
        menuLbBtn: null,
        menuSetBtn: null,
        retryBtn: null,
        deathShopBtn: null,
        deathLbBtn: null,
        deathMenuBtn: null,
        modalPanel: null,
        modalCloseBtn: null,
        lbTabClassicBtn: null,
        lbTabRisingBtn: null,
        lbEditNickBtn: null,
        lbRefreshBtn: null,
        lbListWell: null,
        lbPromoBtn: null,
        wardrobeTabHeadBtn: null,
        wardrobeTabFaceBtn: null,
        wardrobeTabBackBtn: null,
        wardrobeTabRewardsBtn: null,
        wardrobeWell: null,
        shopCards: [],
        colorSwatches: [],
        soundOnBtn: null,
        soundOffBtn: null,
        musicOnBtn: null,
        musicOffBtn: null,
        langEnBtn: null,
        langTrBtn: null,
        settingsPrivacyBtn: null,
        settingsResetBtn: null,
        privacyOpenPageBtn: null,
        privacyBackBtn: null
      };

      this._boundCheckLanding = this._checkLandingState.bind(this);

      this.ambientMotes = this._createAmbientMotes(28);

      this.activePointerId = null;
      this.pointer = {
        isDown: false,
        startX: 0,
        startY: 0,
        currX: 0,
        currY: 0
      };

      this._lastTime = 0;
      this._rafId = 0;
      this._boundLoop = this._loop.bind(this);

      this._setupResize();
      this._setupInput();
      this._setupNicknameDomOverlay();
      this._syncMilestoneUnlocks({ silent: true });
      if (!this.tutorialDone) {
        this.gameMode = 'tutorial';
        this.resetRun();
      } else {
        this.openMenu();
      }
    }

    t() {
      return JellyGame.I18N ? JellyGame.I18N.get(this.lang) : {};
    }

    getActiveBestMeters() {
      return this.gameMode === 'rising' ? this.bestRisingMeters : this.bestMeters;
    }

    _loadInitialMode() {
      try {
        const raw = global.localStorage.getItem(STORAGE_KEYS.GAME_MODE);
        if (raw === 'classic' || raw === 'rising') {
          return raw;
        }
      } catch (_) {}
      return 'classic';
    }

    _saveMode(mode) {
      try {
        global.localStorage.setItem(STORAGE_KEYS.GAME_MODE, mode);
      } catch (_) {}
    }

    _loadLang() {
      try {
        const raw = global.localStorage.getItem(STORAGE_KEYS.LANG);
        if (raw === 'en' || raw === 'tr') return raw;
      } catch (_) {}
      return 'en';
    }

    _saveLang(lang) {
      try {
        global.localStorage.setItem(STORAGE_KEYS.LANG, lang);
      } catch (_) {}
    }

    _loadBool(key, fallback) {
      try {
        const raw = global.localStorage.getItem(key);
        if (raw === '1' || raw === 'true') return true;
        if (raw === '0' || raw === 'false') return false;
      } catch (_) {}
      return fallback;
    }

    _saveBool(key, val) {
      try {
        global.localStorage.setItem(key, val ? '1' : '0');
      } catch (_) {}
    }

    _loadInt(key, fallback) {
      try {
        const raw = global.localStorage.getItem(key);
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
      } catch (_) {
        return fallback;
      }
    }

    _saveInt(key, value) {
      try {
        global.localStorage.setItem(key, String(Math.floor(value)));
      } catch (_) {}
    }

    _loadStringSet(key, defaults = []) {
      try {
        const raw = global.localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed)) {
          return new Set([...defaults, ...parsed]);
        }
      } catch (_) {}
      return new Set(defaults);
    }

    _saveStringSet(key, set) {
      try {
        global.localStorage.setItem(key, JSON.stringify([...set]));
      } catch (_) {}
    }

    _loadUnlocked() {
      return this._loadStringSet(STORAGE_KEYS.UNLOCKED, ['none']);
    }

    _saveUnlocked() {
      this._saveStringSet(STORAGE_KEYS.UNLOCKED, this.unlockedAccessories);
    }

    _loadEquippedSlots() {
      const accMod = JellyGame.Accessories;
      const base = { head: 'none', face: 'none', back: 'none' };
      try {
        const rawSlots = global.localStorage.getItem(STORAGE_KEYS.EQUIPPED_SLOTS);
        if (rawSlots && accMod) {
          const normalized = accMod.normalizeSlots(JSON.parse(rawSlots));
          for (const slot of ['head', 'face', 'back']) {
            if (normalized[slot] !== 'none' && this.unlockedAccessories.has(normalized[slot])) {
              base[slot] = normalized[slot];
            }
          }
          return base;
        }
        const legacy = global.localStorage.getItem(STORAGE_KEYS.EQUIPPED);
        if (legacy && accMod) {
          const normalized = accMod.normalizeSlots(legacy);
          for (const slot of ['head', 'face', 'back']) {
            if (normalized[slot] !== 'none' && this.unlockedAccessories.has(normalized[slot])) {
              base[slot] = normalized[slot];
            }
          }
          return base;
        }
      } catch (_) {}
      return base;
    }

    _saveEquippedSlots() {
      const accMod = JellyGame.Accessories;
      this.equippedAccessory = accMod ? accMod.serializeSlots(this.equippedSlots) : 'none';
      this.player.equippedAccessory = this.equippedAccessory;
      try {
        global.localStorage.setItem(
          STORAGE_KEYS.EQUIPPED_SLOTS,
          JSON.stringify(this.equippedSlots)
        );
        global.localStorage.setItem(STORAGE_KEYS.EQUIPPED, this.equippedAccessory);
      } catch (_) {}
    }

    _getOwnedGearCount() {
      if (!JellyGame.Accessories || !JellyGame.Accessories.LIST) return 0;
      let count = 0;
      const list = JellyGame.Accessories.LIST;
      for (let i = 0; i < list.length; i++) {
        if (this.unlockedAccessories.has(list[i].id)) count++;
      }
      return count;
    }

    _loadUnlockedColors() {
      return this._loadStringSet(STORAGE_KEYS.UNLOCKED_COLORS, ['mint']);
    }

    _saveUnlockedColors() {
      this._saveStringSet(STORAGE_KEYS.UNLOCKED_COLORS, this.unlockedColors);
    }

    _loadEquippedColor() {
      try {
        const id = global.localStorage.getItem(STORAGE_KEYS.EQUIPPED_COLOR);
        if (id && this.unlockedColors.has(id)) return id;
      } catch (_) {}
      return 'mint';
    }

    _saveEquippedColor(id) {
      try {
        global.localStorage.setItem(STORAGE_KEYS.EQUIPPED_COLOR, id);
      } catch (_) {}
    }

    resetAllUserData() {
      try {
        global.localStorage.removeItem(STORAGE_KEYS.BEST);
        global.localStorage.removeItem(STORAGE_KEYS.BEST_RISING);
        global.localStorage.removeItem(STORAGE_KEYS.BEST_TEMPO);
        global.localStorage.removeItem(STORAGE_KEYS.TOTAL_CLOSE_CALLS);
        global.localStorage.removeItem(STORAGE_KEYS.GEMS);
        global.localStorage.removeItem(STORAGE_KEYS.UNLOCKED);
        global.localStorage.removeItem(STORAGE_KEYS.EQUIPPED);
        global.localStorage.removeItem(STORAGE_KEYS.EQUIPPED_SLOTS);
        global.localStorage.removeItem(STORAGE_KEYS.UNLOCKED_COLORS);
        global.localStorage.removeItem(STORAGE_KEYS.EQUIPPED_COLOR);
        global.localStorage.removeItem(STORAGE_KEYS.REWARDS_CLAIMED);
        global.localStorage.removeItem(STORAGE_KEYS.BOSSES_DEFEATED);
        global.localStorage.removeItem(STORAGE_KEYS.TUTORIAL_DONE);
        global.localStorage.removeItem(STORAGE_KEYS.GAME_MODE);
      } catch (_) {}

      this.bestMeters = 0;
      this.bestRisingMeters = 0;
      this.bestTempo = 1;
      this.totalCloseCalls = 0;
      this.bossesDefeated = 0;
      this.activeBoss = null;
      this.nextBossIndex = 0;
      this.runBossesDefeated = 0;
      this.bossWarnedIndex = -1;
      this.bossWarningTimer = 0;
      this.runStartBestMeters = 0;
      this.tutorialDone = false;
      this.gameMode = 'tutorial';
      this.gems = 0;
      this.unlockedAccessories = new Set(['none']);
      this.equippedSlots = { head: 'none', face: 'none', back: 'none' };
      this.equippedAccessory = 'none';
      this.unlockedColors = new Set(['mint']);
      this.equippedColor = 'mint';
      this.claimedRewards = new Set();
      this.unseenRewards = new Set();
      this.runUnlockedGear = [];
      this.player.equippedAccessory = 'none';
      this.player.equippedColor = 'mint';
      this.confirmResetPending = false;
      this.resetStatusMsg = this.t().dataResetDone || 'Data Reset!';
      if (this.leaderboard) {
        this.leaderboard.resetAllData();
      }
      this.audio.playUnlock();
    }

    _getProgressionStats() {
      return {
        bestMeters: this.bestMeters,
        bestRisingMeters: this.bestRisingMeters,
        bestTempo: this.bestTempo,
        totalCloseCalls: this.totalCloseCalls
      };
    }

    /**
     * Checks all milestone accessories against player stats and grants gear + bonus Drops.
     */
    _syncMilestoneUnlocks({ silent = false } = {}) {
      if (!JellyGame.Accessories || !JellyGame.Accessories.MILESTONE_LIST) return;
      const list = JellyGame.Accessories.MILESTONE_LIST;
      const stats = this._getProgressionStats();

      for (let i = 0; i < list.length; i++) {
        const acc = list[i];
        const prog = JellyGame.Accessories.getMilestoneProgress(acc, stats);
        if (!prog.met || this.unlockedAccessories.has(acc.id)) continue;

        this.unlockedAccessories.add(acc.id);
        this._saveUnlocked();

        const bonusDrops = (acc.milestone && acc.milestone.bonusDrops) || 0;
        if (bonusDrops > 0 && !this.claimedRewards.has(acc.id)) {
          this.claimedRewards.add(acc.id);
          this._saveStringSet(STORAGE_KEYS.REWARDS_CLAIMED, this.claimedRewards);
          this.gems += bonusDrops;
          this._saveInt(STORAGE_KEYS.GEMS, this.gems);
          if (!silent) {
            this.runGemsEarned += bonusDrops;
            this.hudGemPulse = 1;
          }
        }

        this.unseenRewards.add(acc.id);

        if (!silent) {
          this.runUnlockedGear.push(acc);
          this.rewardToast = {
            accessory: acc,
            bonusDrops,
            timer: 3.1,
            maxTimer: 3.1
          };
          this.audio.playUnlock();
          this.particles.spawnCollectBurst(
            this.player.positionX,
            this.player.positionY - 12,
            3
          );
        }
      }
    }

    _hasWardrobeBadge() {
      return this.unseenRewards.size > 0 || this._hasAffordableUnlock();
    }

    _hasAffordableUnlock() {
      if (JellyGame.Accessories) {
        const list = JellyGame.Accessories.SHOP_LIST || JellyGame.Accessories.LIST;
        for (let i = 0; i < list.length; i++) {
          const acc = list[i];
          if (!this.unlockedAccessories.has(acc.id) && this.gems >= acc.cost) {
            return true;
          }
        }
      }
      if (C.JELLY_COLORS) {
        for (let i = 0; i < C.JELLY_COLORS.length; i++) {
          const col = C.JELLY_COLORS[i];
          if (!this.unlockedColors.has(col.id) && this.gems >= col.cost) {
            return true;
          }
        }
      }
      return false;
    }

    _createAmbientMotes(count) {
      const motes = [];
      for (let i = 0; i < count; i++) {
        motes.push({
          x: C.WALL_WIDTH + 12 + Math.random() * (C.WIDTH - C.WALL_WIDTH * 2 - 24),
          y: Math.random() * C.HEIGHT,
          radius: 1 + Math.random() * 1.8,
          alpha: 0.14 + Math.random() * 0.28,
          speedY: 8 + Math.random() * 14,
          driftPhase: Math.random() * Math.PI * 2
        });
      }
      return motes;
    }

    _setupResize() {
      const updateSize = () => {
        this.dpr = Math.min(global.devicePixelRatio || 1, 2);
        this.canvas.width = C.WIDTH * this.dpr;
        this.canvas.height = C.HEIGHT * this.dpr;
      };
      updateSize();
      global.addEventListener('resize', updateSize);
    }

    _toLogicalPoint(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * C.WIDTH,
        y: ((clientY - rect.top) / rect.height) * C.HEIGHT
      };
    }

    _setupNicknameDomOverlay() {
      const overlay =
        global.document && global.document.getElementById
          ? global.document.getElementById('nick-overlay')
          : null;
      const form =
        global.document && global.document.getElementById
          ? global.document.getElementById('nick-form')
          : null;
      const input =
        global.document && global.document.getElementById
          ? global.document.getElementById('nick-input')
          : null;
      const cancelBtn =
        global.document && global.document.getElementById
          ? global.document.getElementById('nick-cancel-btn')
          : null;

      if (!overlay || !form || !input) return;

      const closeOverlay = () => {
        overlay.classList.remove('open');
      };

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (this.leaderboard) {
          this.leaderboard
            .setNickname(input.value, {
              color: this.equippedColor,
              accessory: this.equippedAccessory
            })
            .then(() => {
              if (this.activeModal === 'leaderboard') {
                this.leaderboard.fetchLeaderboard(this.lbTab);
              }
            });
        }
        this.audio.playUnlock();
        closeOverlay();
      });

      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          this.audio.playUiTap();
          closeOverlay();
        });
      }

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeOverlay();
      });

      this._nickDom = { overlay, input };
    }

    _openNicknameEditor() {
      if (!this.leaderboard) return;
      const tr = this.t();
      if (this._nickDom && this._nickDom.overlay && this._nickDom.input) {
        const titleEl = global.document.getElementById('nick-modal-title');
        const cancelEl = global.document.getElementById('nick-cancel-btn');
        const saveEl = global.document.getElementById('nick-save-btn');
        if (titleEl) titleEl.textContent = tr.nickPrompt || 'Choose Nickname';
        if (cancelEl) cancelEl.textContent = tr.cancel || 'CANCEL';
        if (saveEl) saveEl.textContent = tr.save || 'SAVE';
        this._nickDom.input.value = this.leaderboard.nickname;
        this._nickDom.overlay.classList.add('open');
        global.setTimeout(() => {
          try {
            this._nickDom.input.focus();
            this._nickDom.input.select();
          } catch (_) {}
        }, 40);
      }
    }

    openLeaderboard(initialTab) {
      this.lbTab = initialTab === 'rising' ? 'rising' : 'classic';
      this.lbScrollY = 0;
      this.lbDragging = false;
      this.lbDragMoved = false;
      this.modalAnim = 0;
      this.activeModal = 'leaderboard';
      this._syncAndFetchLeaderboardTab(this.lbTab);
    }

    _syncAndFetchLeaderboardTab(tab) {
      if (!this.leaderboard) return;
      const mode = tab === 'rising' ? 'rising' : 'classic';
      const localBest = mode === 'rising' ? this.bestRisingMeters : this.bestMeters;
      const existing =
        this.leaderboard.data &&
        this.leaderboard.data[mode] &&
        this.leaderboard.data[mode].playerEntry;
      if (localBest > 0 && (!existing || existing.meters < localBest)) {
        this.leaderboard
          .submitScore({
            mode,
            meters: localBest,
            maxTempo: this.runMaxTempo || 1,
            color: this.equippedColor,
            accessory: this.equippedAccessory
          })
          .then(() => this.leaderboard.fetchLeaderboard(mode));
      } else {
        this.leaderboard.fetchLeaderboard(mode);
      }
    }

    _setupInput() {
      const onPointerDown = (e) => {
        if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') {
          return;
        }
        e.preventDefault();
        this.audio.unlock();

        const pt = this._toLogicalPoint(e.clientX, e.clientY);

        if (this.activeModal === 'modes') {
          this._handleModesTap(pt.x, pt.y);
          return;
        }
        if (this.activeModal === 'leaderboard') {
          if (pointInRect(pt.x, pt.y, this.uiRects.lbListWell)) {
            this.lbDragging = true;
            this.lbDragMoved = false;
            this.lbLastDragY = pt.y;
            this.activePointerId = e.pointerId;
            try {
              this.canvas.setPointerCapture(e.pointerId);
            } catch (_) {}
            return;
          }
          this._handleLeaderboardTap(pt.x, pt.y);
          return;
        }
        if (this.activeModal === 'accessories') {
          if (pointInRect(pt.x, pt.y, this.uiRects.wardrobeWell)) {
            this.wardrobeDragging = true;
            this.wardrobeDragMoved = false;
            this.wardrobeLastDragY = pt.y;
            this.activePointerId = e.pointerId;
            try {
              this.canvas.setPointerCapture(e.pointerId);
            } catch (_) {}
            return;
          }
          this._handleAccessoriesTap(pt.x, pt.y);
          return;
        }
        if (this.activeModal === 'settings') {
          this._handleSettingsTap(pt.x, pt.y);
          return;
        }
        if (this.activeModal === 'privacy') {
          this._handlePrivacyTap(pt.x, pt.y);
          return;
        }

        if (this.state === 'menu') {
          this._handleMenuPointerDown(pt.x, pt.y, e.pointerId);
          return;
        }

        // Top-left menu button during active play
        if (pointInRect(pt.x, pt.y, this.uiRects.topMenuBtn)) {
          this.audio.playUiTap();
          this.openMenu();
          return;
        }

        // Top-right accessory pill tap (do not fire slingshot accidentally)
        if (pointInRect(pt.x, pt.y, this.uiRects.topShopBtn)) {
          this.audio.playUiTap();
          this.player.cancelAim();
          this._openAccessoriesDrawer();
          return;
        }

        // Tutorial Skip button tap during Opening Tutorial
        if (
          this.state === 'playing' &&
          this.gameMode === 'tutorial' &&
          !this.tutorialCompletedThisRun &&
          pointInRect(pt.x, pt.y, this.uiRects.tutSkipBtn)
        ) {
          this.audio.playUiTap();
          this.tutorialDone = true;
          this._saveBool(STORAGE_KEYS.TUTORIAL_DONE, true);
          this.gameMode = 'classic';
          this._saveMode('classic');
          this.openMenu();
          return;
        }

        if (this.state === 'dead') {
          if (this.deathTimer >= 0.38) {
            if (pointInRect(pt.x, pt.y, this.uiRects.deathShopBtn)) {
              this.audio.playUiTap();
              this._openAccessoriesDrawer();
            } else if (pointInRect(pt.x, pt.y, this.uiRects.deathLbBtn)) {
              this.audio.playUiTap();
              this.openLeaderboard(this.gameMode === 'rising' ? 'rising' : 'classic');
            } else if (pointInRect(pt.x, pt.y, this.uiRects.deathMenuBtn)) {
              this.audio.playUiTap();
              this.openMenu();
            } else {
              this.audio.playUiTap();
              this.resetRun();
            }
          }
          return;
        }

        if (this.activePointerId !== null) return;

        this.activePointerId = e.pointerId;
        this.pointer.isDown = true;
        this.pointer.startX = pt.x;
        this.pointer.startY = pt.y;
        this.pointer.currX = pt.x;
        this.pointer.currY = pt.y;

        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch (_) {}

        if (this.player.isAttached()) {
          this.player.beginAim();
        }
      };

      const onPointerMove = (e) => {
        if (this.activeModal === 'leaderboard' && this.lbDragging && e.pointerId === this.activePointerId) {
          e.preventDefault();
          const pt = this._toLogicalPoint(e.clientX, e.clientY);
          const dy = pt.y - this.lbLastDragY;
          if (Math.abs(dy) > 2) this.lbDragMoved = true;
          this.lbLastDragY = pt.y;
          this.lbScrollY = Math.max(0, this.lbScrollY - dy);
          return;
        }
        if (this.activeModal === 'accessories' && this.wardrobeDragging && e.pointerId === this.activePointerId) {
          e.preventDefault();
          const pt = this._toLogicalPoint(e.clientX, e.clientY);
          const dy = pt.y - this.wardrobeLastDragY;
          if (Math.abs(dy) > 3) this.wardrobeDragMoved = true;
          this.wardrobeLastDragY = pt.y;
          this.wardrobeScrollY = Math.max(0, this.wardrobeScrollY - dy);
          return;
        }
        if (this.activeModal || this.state === 'menu') return;
        if (e.pointerId !== this.activePointerId || !this.pointer.isDown) return;
        e.preventDefault();

        const pt = this._toLogicalPoint(e.clientX, e.clientY);
        this.pointer.currX = pt.x;
        this.pointer.currY = pt.y;

        if (this.state === 'playing' && this.player.isAttached()) {
          if (!this.player.isAiming) {
            this.player.beginAim();
          }
          const dx = this.pointer.currX - this.pointer.startX;
          const dy = this.pointer.currY - this.pointer.startY;
          this.player.updateAim(dx, dy, this.tempoTier);

          if (this.player.aimValid) {
            this.audio.playStretchTick(this.player.dragStrength);
          }
        }
      };

      const finishPointer = (e, canceled) => {
        if (this.activeModal === 'leaderboard' && this.lbDragging && e.pointerId === this.activePointerId) {
          this.lbDragging = false;
          this.activePointerId = null;
          if (!canceled && !this.lbDragMoved) {
            const pt = this._toLogicalPoint(e.clientX, e.clientY);
            this._handleLeaderboardTap(pt.x, pt.y);
          }
          return;
        }

        if (this.activeModal === 'accessories' && this.wardrobeDragging && e.pointerId === this.activePointerId) {
          this.wardrobeDragging = false;
          this.activePointerId = null;
          if (!canceled && !this.wardrobeDragMoved) {
            const pt = this._toLogicalPoint(e.clientX, e.clientY);
            this._handleAccessoriesTap(pt.x, pt.y);
          }
          return;
        }

        if (this.state === 'menu' && this.pressedBtn && e.pointerId === this.activePointerId) {
          e.preventDefault();
          const pt = this._toLogicalPoint(e.clientX, e.clientY);
          const btnId = this.pressedBtn;
          this.pressedBtn = null;
          this.activePointerId = null;
          if (!canceled) {
            this._activateMenuButton(btnId, pt.x, pt.y);
          }
          return;
        }

        if (e.pointerId !== this.activePointerId) return;
        e.preventDefault();

        if (!canceled && !this.activeModal && this.state === 'playing' && this.player.isAttached()) {
          const dx = this.pointer.currX - this.pointer.startX;
          const dy = this.pointer.currY - this.pointer.startY;
          this.player.updateAim(dx, dy, this.tempoTier);

          const shot = this.player.releaseLaunch();
          if (shot) {
            this._onPlayerLaunch(shot);
          }
        } else {
          this.player.cancelAim();
        }

        this.audio.resetStretchTick();
        this.pointer.isDown = false;
        this.activePointerId = null;
      };

      this.canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
      this.canvas.addEventListener('pointermove', onPointerMove, { passive: false });
      this.canvas.addEventListener('pointerup', (e) => finishPointer(e, false), {
        passive: false
      });
      this.canvas.addEventListener('pointercancel', (e) => finishPointer(e, true), {
        passive: false
      });
      this.canvas.addEventListener(
        'wheel',
        (e) => {
          if (this.activeModal === 'leaderboard') {
            e.preventDefault();
            this.lbScrollY = Math.max(0, this.lbScrollY + e.deltaY * 0.5);
          } else if (this.activeModal === 'accessories') {
            e.preventDefault();
            this.wardrobeScrollY = Math.max(0, this.wardrobeScrollY + e.deltaY * 0.5);
          }
        },
        { passive: false }
      );

      global.addEventListener('blur', () => {
        this.player.cancelAim();
        this.audio.resetStretchTick();
        this.pointer.isDown = false;
        this.activePointerId = null;
        this.pressedBtn = null;
      });

      global.addEventListener('keydown', (e) => {
        if (e.code === 'KeyH') {
          this.showHitboxes = !this.showHitboxes;
          return;
        }
        const isLocalQa =
          global.location &&
          (global.location.hostname === '127.0.0.1' || global.location.hostname === 'localhost');
        if (isLocalQa && (e.code === 'KeyB' || e.code === 'KeyV')) {
          e.preventDefault();
          if (this.state !== 'playing') {
            this.gameMode = 'classic';
            this.resetRun();
          }
          const bossIdx = e.code === 'KeyV' ? 4 : 0;
          const targetM = JellyGame.Bosses ? JellyGame.Bosses.getMilestoneMeters(bossIdx) : 250;
          this.isQaWarpRun = true;
          this.hasLaunchedOnce = true;
          this.highestY = C.START_PLAYER_Y - targetM * C.PIXELS_PER_METER;
          this.currentMeters = targetM;
          const boss = this._spawnBossForIndex(bossIdx);
          if (boss) {
            boss.introTimer = 0;
            if (e.code === 'KeyV') {
              boss.hp = Math.min(8, boss.maxHp);
              boss.phase = 2;
              boss._refreshOrbitOrbs();
            }
            this.cameraY = boss.cameraTargetY;
            this.player.wallAttached = -1;
            this.player.floorAttached = false;
            this.player.cancelAim();
            this.player.velocityX = 0;
            this.player.velocityY = 0;
            this.player.positionX = C.WALL_WIDTH + this.player.radius;
            this.player.positionY = boss.homeY + 110;
          }
          return;
        }
        if (e.code === 'Escape' && this.activeModal) {
          this.activeModal = null;
          return;
        }
        if (this.activeModal) return;

        if (this.state === 'menu') {
          if (e.code === 'Space' || e.code === 'Enter') {
            e.preventDefault();
            this.resetRun();
          }
          return;
        }

        if (this.state === 'dead' && this.deathTimer >= 0.38) {
          if (e.code === 'Space' || e.code === 'KeyR' || e.code === 'Enter') {
            e.preventDefault();
            this.resetRun();
          }
        } else if (e.code === 'KeyR' && this.state === 'playing') {
          this.resetRun();
        }
      });
    }

    _handleMenuPointerDown(px, py, pointerId) {
      if (pointInRect(px, py, this.uiRects.menuPlayBtn)) {
        this.pressedBtn = 'play';
      } else if (pointInRect(px, py, this.uiRects.menuAccBtn)) {
        this.pressedBtn = 'accessories';
      } else if (pointInRect(px, py, this.uiRects.menuLbBtn)) {
        this.pressedBtn = 'leaderboard';
      } else if (pointInRect(px, py, this.uiRects.menuSetBtn)) {
        this.pressedBtn = 'settings';
      } else {
        this.pressedBtn = null;
        return;
      }

      this.activePointerId = pointerId;
      try {
        this.canvas.setPointerCapture(pointerId);
      } catch (_) {}
    }

    _activateMenuButton(btnId, px, py) {
      if (btnId === 'play' && pointInRect(px, py, this.uiRects.menuPlayBtn)) {
        this.audio.playUiTap();
        this.modalAnim = 0;
        this.activeModal = 'modes';
      } else if (btnId === 'accessories' && pointInRect(px, py, this.uiRects.menuAccBtn)) {
        this.audio.playUiTap();
        this._openAccessoriesDrawer();
      } else if (btnId === 'leaderboard' && pointInRect(px, py, this.uiRects.menuLbBtn)) {
        this.audio.playUiTap();
        this.openLeaderboard(this.gameMode === 'rising' ? 'rising' : 'classic');
      } else if (btnId === 'settings' && pointInRect(px, py, this.uiRects.menuSetBtn)) {
        this.audio.playUiTap();
        this.modalAnim = 0;
        this.activeModal = 'settings';
      }
    }

    _handleLeaderboardTap(px, py) {
      if (pointInRect(px, py, this.uiRects.modalCloseBtn)) {
        this.audio.playUiTap();
        this.activeModal = null;
        return;
      }

      if (this.uiRects.modalPanel && !pointInRect(px, py, this.uiRects.modalPanel)) {
        this.activeModal = null;
        return;
      }

      if (pointInRect(px, py, this.uiRects.lbTabClassicBtn)) {
        if (this.lbTab !== 'classic') {
          this.lbTab = 'classic';
          this.lbScrollY = 0;
          this.audio.playUiTap();
          this._syncAndFetchLeaderboardTab('classic');
        }
        return;
      }

      if (pointInRect(px, py, this.uiRects.lbTabRisingBtn)) {
        if (this.lbTab !== 'rising') {
          this.lbTab = 'rising';
          this.lbScrollY = 0;
          this.audio.playUiTap();
          this._syncAndFetchLeaderboardTab('rising');
        }
        return;
      }

      if (pointInRect(px, py, this.uiRects.lbEditNickBtn)) {
        this.audio.playUiTap();
        this._openNicknameEditor();
        return;
      }

      if (pointInRect(px, py, this.uiRects.lbRefreshBtn)) {
        this.audio.playUiTap();
        if (this.leaderboard) this.leaderboard.fetchLeaderboard(this.lbTab);
        return;
      }

      if (pointInRect(px, py, this.uiRects.lbPromoBtn)) {
        this.audio.playUiTap();
        this._openAccessoriesDrawer('rewards');
      }
    }

    _handleModesTap(px, py) {
      if (pointInRect(px, py, this.uiRects.modalCloseBtn)) {
        this.audio.playUiTap();
        this.activeModal = null;
        return;
      }

      if (this.uiRects.modalPanel && !pointInRect(px, py, this.uiRects.modalPanel)) {
        this.activeModal = null;
        return;
      }

      if (pointInRect(px, py, this.uiRects.modeClassicBtn)) {
        this.audio.playUiTap();
        this.gameMode = 'classic';
        this._saveMode('classic');
        this.activeModal = null;
        this.resetRun();
      } else if (pointInRect(px, py, this.uiRects.modeRisingBtn)) {
        this.audio.playUiTap();
        this.gameMode = 'rising';
        this._saveMode('rising');
        this.activeModal = null;
        this.resetRun();
      }
    }

    _handleSettingsTap(px, py) {
      if (pointInRect(px, py, this.uiRects.modalCloseBtn)) {
        this.audio.playUiTap();
        this.confirmResetPending = false;
        this.resetStatusMsg = '';
        this.activeModal = null;
        return;
      }

      if (this.uiRects.modalPanel && !pointInRect(px, py, this.uiRects.modalPanel)) {
        this.confirmResetPending = false;
        this.resetStatusMsg = '';
        this.activeModal = null;
        return;
      }

      if (pointInRect(px, py, this.uiRects.soundOnBtn)) {
        this.soundEnabled = true;
        this.audio.setEnabled(true);
        this.audio.unlock();
        this._saveBool(STORAGE_KEYS.SOUND, true);
        this.audio.playUiTap();
      } else if (pointInRect(px, py, this.uiRects.soundOffBtn)) {
        this.soundEnabled = false;
        this.audio.setEnabled(false);
        this._saveBool(STORAGE_KEYS.SOUND, false);
      } else if (pointInRect(px, py, this.uiRects.musicOnBtn)) {
        this.musicEnabled = true;
        this.audio.setMusicEnabled(true);
        this.audio.unlock();
        this._saveBool(STORAGE_KEYS.MUSIC, true);
        this.audio.playUiTap();
      } else if (pointInRect(px, py, this.uiRects.musicOffBtn)) {
        this.musicEnabled = false;
        this.audio.setMusicEnabled(false);
        this._saveBool(STORAGE_KEYS.MUSIC, false);
        this.audio.playUiTap();
      } else if (pointInRect(px, py, this.uiRects.langEnBtn)) {
        this.lang = 'en';
        this._saveLang('en');
        this.confirmResetPending = false;
        this.resetStatusMsg = '';
        this.audio.playUiTap();
      } else if (pointInRect(px, py, this.uiRects.langTrBtn)) {
        this.lang = 'tr';
        this._saveLang('tr');
        this.confirmResetPending = false;
        this.resetStatusMsg = '';
        this.audio.playUiTap();
      } else if (pointInRect(px, py, this.uiRects.settingsPrivacyBtn)) {
        this.audio.playUiTap();
        this.confirmResetPending = false;
        this.resetStatusMsg = '';
        this.modalAnim = 0;
        this.activeModal = 'privacy';
      } else if (pointInRect(px, py, this.uiRects.settingsResetBtn)) {
        if (!this.confirmResetPending) {
          this.confirmResetPending = true;
          this.audio.playUiTap();
        } else {
          this.resetAllUserData();
        }
      }
    }

    _handlePrivacyTap(px, py) {
      if (pointInRect(px, py, this.uiRects.modalCloseBtn)) {
        this.audio.playUiTap();
        this.activeModal = null;
        return;
      }
      if (pointInRect(px, py, this.uiRects.privacyBackBtn)) {
        this.audio.playUiTap();
        this.modalAnim = 0;
        this.activeModal = 'settings';
        return;
      }
      if (pointInRect(px, py, this.uiRects.privacyOpenPageBtn)) {
        this.audio.playUiTap();
        try {
          global.open('privacy-policy.html', '_blank', 'noopener');
        } catch (_) {}
        return;
      }
      if (this.uiRects.modalPanel && !pointInRect(px, py, this.uiRects.modalPanel)) {
        this.activeModal = null;
      }
    }

    _openAccessoriesDrawer(preferredTab = null) {
      if (
        preferredTab === 'head' ||
        preferredTab === 'face' ||
        preferredTab === 'back' ||
        preferredTab === 'rewards'
      ) {
        this.wardrobeTab = preferredTab;
      } else if (this.unseenRewards.size > 0 || this.runUnlockedGear.length > 0) {
        this.wardrobeTab = 'rewards';
      } else if (
        this.wardrobeTab !== 'head' &&
        this.wardrobeTab !== 'face' &&
        this.wardrobeTab !== 'back' &&
        this.wardrobeTab !== 'rewards'
      ) {
        this.wardrobeTab = 'head';
      }
      if (this.wardrobeTab === 'rewards') {
        this.unseenRewards.clear();
      }
      this.wardrobeScrollY = 0;
      this.modalAnim = 0;
      this.wardrobePreviewBounce = 0.7;
      this.activeModal = 'accessories';
    }

    _syncEquippedToLeaderboard() {
      if (this.leaderboard) {
        this.leaderboard.syncProfile({
          color: this.equippedColor,
          accessory: this.equippedAccessory
        });
      }
    }

    _toggleEquipGearItem(acc) {
      const slot = acc.slot;
      if (slot !== 'head' && slot !== 'face' && slot !== 'back') return;
      if (this.equippedSlots[slot] === acc.id) {
        this.equippedSlots[slot] = 'none';
      } else {
        this.equippedSlots[slot] = acc.id;
      }
      this._saveEquippedSlots();
      this._syncEquippedToLeaderboard();
      this.wardrobePreviewBounce = 1;
    }

    _handleAccessoriesTap(px, py) {
      if (pointInRect(px, py, this.uiRects.modalCloseBtn)) {
        this.audio.playUiTap();
        this.activeModal = null;
        return;
      }

      if (this.uiRects.modalPanel && !pointInRect(px, py, this.uiRects.modalPanel)) {
        this.activeModal = null;
        return;
      }

      const tabMap = [
        ['wardrobeTabHeadBtn', 'head'],
        ['wardrobeTabFaceBtn', 'face'],
        ['wardrobeTabBackBtn', 'back'],
        ['wardrobeTabRewardsBtn', 'rewards']
      ];
      for (let i = 0; i < tabMap.length; i++) {
        const [rectKey, tabKey] = tabMap[i];
        if (pointInRect(px, py, this.uiRects[rectKey])) {
          if (tabKey === 'rewards') this.unseenRewards.clear();
          if (this.wardrobeTab !== tabKey) {
            this.wardrobeTab = tabKey;
            this.wardrobeScrollY = 0;
            this.audio.playUiTap();
          }
          return;
        }
      }

      // Check Bioluminescent Jelly Color Swatch taps
      if (this.uiRects.colorSwatches) {
        for (let i = 0; i < this.uiRects.colorSwatches.length; i++) {
          const sw = this.uiRects.colorSwatches[i];
          if (!pointInRect(px, py, sw.rect)) continue;
          const col = sw.color;
          if (this.unlockedColors.has(col.id)) {
            this.equippedColor = col.id;
            this.player.equippedColor = col.id;
            this._saveEquippedColor(col.id);
            this._syncEquippedToLeaderboard();
            this.wardrobePreviewBounce = 1;
            this.audio.playCollect(false);
          } else if (this.gems >= col.cost) {
            this.gems -= col.cost;
            this._saveInt(STORAGE_KEYS.GEMS, this.gems);
            this.unlockedColors.add(col.id);
            this._saveUnlockedColors();
            this.equippedColor = col.id;
            this.player.equippedColor = col.id;
            this._saveEquippedColor(col.id);
            this._syncEquippedToLeaderboard();
            this.wardrobePreviewBounce = 1;
            this.audio.playUnlock();
          } else {
            this.audio.playStick(300);
          }
          return;
        }
      }

      if (this.uiRects.wardrobeWell && !pointInRect(px, py, this.uiRects.wardrobeWell)) {
        return;
      }

      for (let i = 0; i < this.uiRects.shopCards.length; i++) {
        const card = this.uiRects.shopCards[i];
        if (!pointInRect(px, py, card.rect)) continue;

        const acc = card.accessory;
        if (this.unlockedAccessories.has(acc.id)) {
          this._toggleEquipGearItem(acc);
          this.audio.playCollect(false);
        } else if (acc.unlockType !== 'milestone' && this.gems >= acc.cost) {
          this.gems -= acc.cost;
          this._saveInt(STORAGE_KEYS.GEMS, this.gems);
          this.unlockedAccessories.add(acc.id);
          this._saveUnlocked();
          this.equippedSlots[acc.slot] = acc.id;
          this._saveEquippedSlots();
          this._syncEquippedToLeaderboard();
          this.wardrobePreviewBounce = 1;
          this.audio.playUnlock();
        } else {
          this.audio.playStick(300);
        }
        return;
      }
    }

    _submitCurrentRunScore() {
      if (
        !this.isQaWarpRun &&
        this.leaderboard &&
        (this.gameMode === 'classic' || this.gameMode === 'rising') &&
        this.currentMeters > 0
      ) {
        this.leaderboard.submitScore({
          mode: this.gameMode,
          meters: this.currentMeters,
          maxTempo: this.runMaxTempo,
          color: this.equippedColor,
          accessory: this.equippedAccessory
        });
      }
    }

    openMenu() {
      if (this.state === 'playing') {
        this._submitCurrentRunScore();
      }
      this.player.reset();
      this.player.positionY = -312;
      this.player.equippedAccessory = this.equippedAccessory;
      this.player.equippedColor = this.equippedColor;
      this.player.tempoTier = 1;
      this.particles.clear();
      this.generator.reset();
      this.projectiles.length = 0;
      this.activeBoss = null;
      this.nextBossIndex = 0;
      this.runBossesDefeated = 0;
      this.bossWarnedIndex = -1;
      this.bossWarningTimer = 0;
      this.isQaWarpRun = false;

      this.cameraY = C.START_CAMERA_Y;
      this.highestY = C.START_PLAYER_Y;
      this.currentMeters = 0;
      this.tempoTier = 1;
      this.tempoTimer = 0;
      this.slowMoTimer = 0;
      this.themeBannerTimer = 0;
      this.state = 'menu';
      this.activeModal = null;
      this.confirmResetPending = false;
      this.resetStatusMsg = '';
      this.pressedBtn = null;
      this.pointer.isDown = false;
      this.activePointerId = null;
      this.audio.setMusicContext('menu', this.gameMode, 1);
    }

    resetRun() {
      this.player.reset();
      this.player.equippedAccessory = this.equippedAccessory;
      this.player.equippedColor = this.equippedColor;
      this.player.tempoTier = 1;

      this.particles.clear();
      this.projectiles.length = 0;
      this.activeBoss = null;
      this.nextBossIndex = 0;
      this.runBossesDefeated = 0;
      this.bossWarnedIndex = -1;
      this.bossWarningTimer = 0;
      this.isQaWarpRun = false;

      this.cameraY = C.START_CAMERA_Y;
      this.highestY = C.START_PLAYER_Y;
      this.currentMeters = 0;
      this.isNewRecord = false;
      this.runGemsEarned = 0;
      this.runUnlockedGear = [];
      this.rewardToast = null;
      this.runStartBestMeters = this.getActiveBestMeters();
      this.bestBannerBroken = false;

      this.tempoTier = 1;
      this.tempoTimer = 0;
      this.runMaxTempo = 1;
      this.slowMoTimer = 0;

      this.announcedThemeIdx = 0;
      this.themeBannerText = '';
      this.themeBannerTimer = 0;

      this.tutorialStepIdx = 0;
      this.tutorialCompletedThisRun = false;
      this.risingFloorY = C.FLOOR_Y + (C.RISING_FLOOR ? C.RISING_FLOOR.START_OFFSET_Y : 95);

      this.state = 'playing';
      this.activeModal = null;
      this.confirmResetPending = false;
      this.resetStatusMsg = '';
      this.pressedBtn = null;
      this.deathTimer = 0;
      this.hitStopTimer = 0;
      this.shakeMag = 0;
      this.hasLaunchedOnce = false;
      this.pointer.isDown = false;
      this.activePointerId = null;

      if (this.gameMode === 'tutorial') {
        this.generator.setupTutorialCourse();
      } else {
        this.generator.reset();
        this.generator.generateUpTo(this.cameraY - C.GEN_LOOKAHEAD_PX);
      }

      this.audio.setMusicContext('playing', this.gameMode, 1);
    }

    start() {
      this._lastTime = performance.now();
      this._rafId = global.requestAnimationFrame(this._boundLoop);
    }

    _loop(now) {
      const rawDt = (now - this._lastTime) / 1000;
      this._lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0), C.MAX_FRAME_DT);

      this.update(dt);
      this.render();

      this._rafId = global.requestAnimationFrame(this._boundLoop);
    }

    update(dt) {
      this.hintTime += dt;

      if (this.hudGemPulse > 0) {
        this.hudGemPulse = Math.max(0, this.hudGemPulse - dt * 4.2);
      }
      if (this.meterMilestonePulse > 0) {
        this.meterMilestonePulse = Math.max(0, this.meterMilestonePulse - dt * 3.5);
      }
      if (this.wardrobePreviewBounce > 0) {
        this.wardrobePreviewBounce = Math.max(0, this.wardrobePreviewBounce - dt * 3.2);
      }

      if (this.themeBannerTimer > 0) {
        this.themeBannerTimer = Math.max(0, this.themeBannerTimer - dt);
      }
      if (this.bossWarningTimer > 0) {
        this.bossWarningTimer = Math.max(0, this.bossWarningTimer - dt);
      }

      if (this.rewardToast) {
        this.rewardToast.timer = Math.max(0, this.rewardToast.timer - dt);
        if (this.rewardToast.timer <= 0) {
          this.rewardToast = null;
        }
      }

      // Advance modal spring-open animation and pause world action while modal is open
      if (this.activeModal) {
        this.modalAnim = Math.min(1, this.modalAnim + dt * 5.2);
        return;
      }

      if (this.state === 'menu') {
        this.player.updateVisuals(dt);
        return;
      }

      if (this.shakeMag > 0) {
        this.shakeMag = Math.max(0, this.shakeMag - dt * 28);
      }

      if (this.hitStopTimer > 0) {
        this.hitStopTimer -= dt;
        this.particles.update(dt * 0.25);
        return;
      }

      if (this.state === 'dead') {
        this.deathTimer += dt;
        this.particles.update(dt);
        this._updateObstaclesAndProjectiles(dt);
        return;
      }

      // Micro slow-mo dilation during Close Call moments
      let simDt = dt;
      if (this.slowMoTimer > 0) {
        this.slowMoTimer = Math.max(0, this.slowMoTimer - dt);
        simDt = dt * 0.44;
      }

      // Tempo countdown while attached to a wall (pauses fairly while airborne)
      if (this.hasLaunchedOnce && this.player.isAttached()) {
        if (this.tempoTimer > 0) {
          this.tempoTimer = Math.max(0, this.tempoTimer - dt);
          if (this.tempoTimer === 0 && this.tempoTier > 1) {
            this.tempoTier = 1;
            this.player.tempoTier = 1;
            this.audio.setMusicContext(this.state, this.gameMode, 1);
          }
        }
      }

      // Update special wall surfaces & attached surface physics (Ice slide / Cracked stone)
      this._updateWallSurfaces(simDt);

      // Sub-stepped physics & pickups
      let remaining = simDt;
      while (remaining > 0 && this.state === 'playing') {
        const step = Math.min(remaining, C.MAX_SUBSTEP_DT);
        remaining -= step;

        const attachEvt = this.player.stepPhysics(step);
        if (attachEvt) {
          this._onPlayerAttach(attachEvt);
        }

        this._updateAndCheckCollectibles(step);

        if (this.activeBoss && !this.activeBoss.defeated) {
          this._handleBossCombatStep();
        }

        if (this._checkHazards()) {
          if (!this._handlePlayerHazardHit()) {
            this._triggerDeath();
            break;
          }
        } else {
          this._checkNearMisses();
        }
      }

      if (this.state === 'playing') {
        this.player.updateVisuals(simDt);

        if (this.player.positionY < this.highestY) {
          const prevDecade = Math.floor(this.currentMeters / 10);
          this.highestY = this.player.positionY;
          this.currentMeters = Math.max(
            0,
            Math.floor((C.START_PLAYER_Y - this.highestY) / C.PIXELS_PER_METER)
          );
          if (Math.floor(this.currentMeters / 10) > prevDecade) {
            this.meterMilestonePulse = 1;
          }

          if (!this.isQaWarpRun && this.gameMode === 'rising') {
            if (this.currentMeters > this.bestRisingMeters) {
              this.bestRisingMeters = this.currentMeters;
              this.isNewRecord = true;
              this._saveInt(STORAGE_KEYS.BEST_RISING, this.bestRisingMeters);
              this._syncMilestoneUnlocks();
            }
          } else if (!this.isQaWarpRun && this.gameMode === 'classic' && this.currentMeters > this.bestMeters) {
            this.bestMeters = this.currentMeters;
            this.isNewRecord = true;
            this._saveInt(STORAGE_KEYS.BEST, this.bestMeters);
            this._syncMilestoneUnlocks();
          }

          // Break the physical World Best Banner with golden confetti!
          if (
            this.runStartBestMeters > 0 &&
            !this.bestBannerBroken &&
            this.currentMeters > this.runStartBestMeters
          ) {
            this.bestBannerBroken = true;
            const wy = C.START_PLAYER_Y - this.runStartBestMeters * C.PIXELS_PER_METER;
            this.audio.playRecordBreak();
            this.particles.spawnCollectBurst(C.WIDTH * 0.5, wy, 3);
            this.particles.spawnFloatingLabel(
              C.WIDTH * 0.5,
              wy - 18,
              `★ ${this.t().newBest || 'NEW BEST!'}`,
              '#ffd166',
              16
            );
          }

          this._checkThemeMilestone();
          this._checkBossMilestoneSpawn();
        }

        if (this.gameMode === 'tutorial') {
          this._updateTutorialProgress();
        } else if (this.gameMode === 'rising') {
          this._updateRisingFloor(simDt);
        }

        if (this.state === 'playing') {
          this._updateCamera(dt);
          if (!this.activeBoss) {
            this.generator.generateUpTo(this.cameraY - C.GEN_LOOKAHEAD_PX);
          }
          const cullBase = Math.max(this.player.positionY, this.cameraY + C.HEIGHT);
          const safeCullY =
            this.activeBoss && !this.activeBoss.defeated
              ? Math.max(cullBase, this.activeBoss.arenaFloorY + 120)
              : cullBase;
          this.generator.cullFarBelow(safeCullY + C.CULL_BEHIND_PX * 2.5);
        }
      }

      if (this.state === 'playing' && this.activeBoss && !this.activeBoss.defeated) {
        this.activeBoss.update(simDt, {
          player: this.player,
          projectiles: this.projectiles,
          particles: this.particles,
          audio: this.audio
        });
      }

      this._updateObstaclesAndProjectiles(simDt);

      if (this.state === 'playing' && this._checkProjectileHits()) {
        if (!this._handlePlayerHazardHit()) {
          this._triggerDeath();
        }
      }

      this.particles.update(simDt);
    }

    _updateTutorialProgress() {
      if (this.tutorialCompletedThisRun) return;
      const py = this.player.positionY;

      let nextStep = 0;
      if (py <= -1800) {
        nextStep = 4;
      } else if (py <= -1330) {
        nextStep = 3;
      } else if (py <= -860) {
        nextStep = 2;
      } else if (py <= -410 || (this.hasLaunchedOnce && this.player.wallAttached !== 0 && py <= -240)) {
        nextStep = 1;
      }

      if (nextStep > this.tutorialStepIdx) {
        this.tutorialStepIdx = nextStep;
        this.audio.playTutorialStep();
      }

      const finishY = (C.TUTORIAL && C.TUTORIAL.FINISH_Y) || -2235;
      if (py <= finishY) {
        this.tutorialCompletedThisRun = true;
        const tr = this.t();
        const firstTime = !this.tutorialDone;
        const reward = (C.TUTORIAL && C.TUTORIAL.REWARD_GEMS) || 15;

        if (firstTime) {
          this.tutorialDone = true;
          this._saveBool(STORAGE_KEYS.TUTORIAL_DONE, true);
          this.gems += reward;
          this.runGemsEarned += reward;
          this.hudGemPulse = 1;
          this._saveInt(STORAGE_KEYS.GEMS, this.gems);
        }

        // Transition seamlessly into Classic mode once the Opening Tutorial is completed
        this.gameMode = 'classic';
        this._saveMode('classic');

        this.audio.playTutorialComplete();
        this.particles.spawnCollectBurst(C.WIDTH * 0.3, finishY, 3);
        this.particles.spawnCollectBurst(C.WIDTH * 0.7, finishY, 3);
        this.particles.spawnFloatingLabel(
          C.WIDTH * 0.5,
          finishY - 24,
          firstTime
            ? tr.tutComplete || '★ TUTORIAL COMPLETE! +15✦ ★'
            : tr.tutCompleteDone || '★ TUTORIAL COMPLETE! ★',
          '#36f5b0',
          15
        );
      }
    }

    _updateRisingFloor(dt) {
      if (!this.hasLaunchedOnce || !this.player.alive) return;

      if (this.activeBoss && !this.activeBoss.defeated) {
        const safeFloorLimit = this.activeBoss.arenaFloorY + 38;
        if (this.risingFloorY < safeFloorLimit) {
          this.risingFloorY = safeFloorLimit;
        }
        return;
      }

      const rf = C.RISING_FLOOR || {
        BASE_SPEED: 68,
        MAX_SPEED: 136,
        SPEED_PER_METER: 0.48,
        MAX_LAG_DISTANCE: 540
      };

      const speed = Math.min(rf.MAX_SPEED, rf.BASE_SPEED + this.currentMeters * rf.SPEED_PER_METER);
      this.risingFloorY -= speed * dt;

      // Rubber-band gently so the magma never falls too far behind a fast climber
      const maxLagY = this.player.positionY + rf.MAX_LAG_DISTANCE;
      if (this.risingFloorY > maxLagY) {
        this.risingFloorY += (maxLagY - this.risingFloorY) * Math.min(1, dt * 3.5);
      }

      // Ambient magma sparks when surface is visible on screen
      const sy = this.risingFloorY - this.cameraY;
      if (sy < C.HEIGHT + 60 && Math.random() < dt * 16) {
        const rx = C.WALL_WIDTH + 16 + Math.random() * (C.WIDTH - C.WALL_WIDTH * 2 - 32);
        this.particles.spawnSparkBurst(rx, this.risingFloorY - 4, 0, '#ff9b26', 1);
      }

      // Check if Rising Magma caught the player
      if (this.player.positionY + C.HITBOX.PLAYER_HURT_RADIUS >= this.risingFloorY) {
        if (this._tryConsumeShield(true)) {
          this.risingFloorY += 95;
        } else {
          this.audio.playLavaSizzle();
          this._triggerDeath();
        }
      }
    }

    _handlePlayerHazardHit() {
      if (this._tryConsumeShield(false)) {
        return true;
      }

      // In Tutorial mode (before crossing the 50m Finish Gate), hitting a hazard triggers a forgiving Safety Rebound!
      if (this.gameMode === 'tutorial' && !this.tutorialCompletedThisRun) {
        this.player.invulnTimer = 0.95;
        const toCenter = this.player.positionX < C.WIDTH * 0.5 ? 1 : -1;
        this.player.wallAttached = 0;
        this.player.floorAttached = false;
        this.player.cancelAim();
        this.player.velocityX = toCenter * 300;
        this.player.velocityY = -520;
        this.shakeMag = 4.0;
        this.audio.playSafetyRebound();
        this.particles.spawnSparkBurst(
          this.player.positionX,
          this.player.positionY,
          toCenter,
          '#36f5b0',
          10
        );
        this.particles.spawnFloatingLabel(
          C.WIDTH * 0.5,
          this.player.positionY - 26,
          this.t().tutRetry || 'SAFE REBOUND! Aim for open wall',
          '#36f5b0',
          12.5
        );
        return true;
      }

      return false;
    }

    _recordRunMaxTempo() {
      this.runMaxTempo = Math.max(this.runMaxTempo, this.tempoTier);
      this.player.tempoTier = this.tempoTier;
      if (this.runMaxTempo > this.bestTempo) {
        this.bestTempo = this.runMaxTempo;
        this._saveInt(STORAGE_KEYS.BEST_TEMPO, this.bestTempo);
        this._syncMilestoneUnlocks();
      }
    }

    _onPlayerLaunch(shot) {
      if (this.hasLaunchedOnce && this.tempoTimer > 0) {
        this.tempoTier = Math.min(C.TEMPO.MAX_TIER, this.tempoTier + 1);
      } else if (!this.hasLaunchedOnce) {
        this.tempoTier = 1;
      } else {
        this.tempoTier = 1;
      }

      this.hasLaunchedOnce = true;
      this._recordRunMaxTempo();
      this.audio.setMusicContext(this.state, this.gameMode, this.tempoTier);

      this.audio.playLaunch(shot.strength, this.tempoTier);
      this.particles.spawnLaunchBurst(
        this.player.positionX,
        this.player.positionY,
        shot.dirX,
        shot.dirY,
        shot.strength,
        this.tempoTier
      );

      if (this.tempoTier >= 2) {
        const tr = this.t();
        const label =
          this.tempoTier === C.TEMPO.MAX_TIER
            ? `x${this.tempoTier} ${tr.max || 'MAX'} ${tr.tempo || 'TEMPO'}!`
            : `x${this.tempoTier} ${tr.tempo || 'TEMPO'}!`;
        this.particles.spawnFloatingLabel(
          this.player.positionX + (this.player.positionX < C.WIDTH * 0.5 ? 44 : -44),
          this.player.positionY - 22,
          label,
          this.tempoTier >= C.TEMPO.DOUBLE_DROP_TIER ? C.COLORS.tempoGold : C.COLORS.tempoCyan,
          13
        );
      }
    }

    _onPlayerAttach(evt) {
      // Check if player hit an Elastic Bounce Pad Surface!
      if (evt.type === 'wall' && this.generator.surfaces) {
        const surfaces = this.generator.surfaces;
        for (let i = 0; i < surfaces.length; i++) {
          const s = surfaces[i];
          if (s.type === 'bouncePad' && s.containsWallPoint(evt.side, this.player.positionY)) {
            s.triggerBounce();
            const outDir = -evt.side;
            this.player.wallAttached = 0;
            this.player.floorAttached = false;
            this.player.cancelAim();
            this.player.velocityX = outDir * ((C.SURFACES && C.SURFACES.BOUNCE_VX) || 700);
            this.player.velocityY = (C.SURFACES && C.SURFACES.BOUNCE_VY) || -750;
            this.player.stretchAmount = 0.42;

            this.hasLaunchedOnce = true;
            this.tempoTier = Math.min(C.TEMPO.MAX_TIER, this.tempoTier + 1);
            this._recordRunMaxTempo();

            this.audio.playBouncePad();
            this.particles.spawnStickBurst(this.player.positionX, this.player.positionY, outDir, 950);
            this.particles.spawnFloatingLabel(
              this.player.positionX + outDir * 36,
              this.player.positionY - 18,
              this.t().bounce || 'BOUNCE!',
              '#ff79c6',
              15
            );
            return;
          }
        }
      }

      this.audio.playStick(evt.impactSpeed);
      if (evt.impactSpeed > 900) {
        this.shakeMag = Math.max(this.shakeMag, 2.2);
      }

      // Open fresh rhythm window upon wall contact
      if (this.hasLaunchedOnce) {
        this.tempoTimer = C.TEMPO.WINDOW_SEC;
      }

      if (evt.type === 'wall') {
        this.particles.spawnStickBurst(
          this.player.positionX,
          this.player.positionY,
          evt.normalX,
          evt.impactSpeed
        );
      } else {
        this.particles.spawnSparkBurst(
          this.player.positionX,
          C.FLOOR_Y,
          0,
          this.player.getColorPalette().primary,
          5
        );
      }

      if (this.pointer.isDown) {
        this.pointer.startX = this.pointer.currX;
        this.pointer.startY = this.pointer.currY;
        this.player.beginAim();
      }
    }

    _updateWallSurfaces(dt) {
      const surfaces = this.generator.surfaces;
      if (!surfaces) return;

      for (let i = 0; i < surfaces.length; i++) {
        surfaces[i].update(dt);
      }

      if (!this.player.alive || this.player.wallAttached === 0) return;

      const side = this.player.wallAttached;
      const py = this.player.positionY;

      for (let i = 0; i < surfaces.length; i++) {
        const s = surfaces[i];
        if (!s.containsWallPoint(side, py)) continue;

        if (s.type === 'iceWall') {
          const slideSpeed = (C.SURFACES && C.SURFACES.ICE_SLIDE_SPEED) || 88;
          this.player.positionY = Math.min(
            C.FLOOR_Y - this.player.radius,
            this.player.positionY + slideSpeed * dt
          );
          if (Math.random() < dt * 14) {
            this.particles.spawnSparkBurst(
              side < 0 ? C.WALL_WIDTH + 2 : C.WIDTH - C.WALL_WIDTH - 2,
              this.player.positionY - 10,
              -side,
              '#b8f2ff',
              1
            );
          }
        } else if (s.type === 'crackedWall') {
          const crackDur = (C.SURFACES && C.SURFACES.CRACK_DURATION) || 1.25;
          s.crackTimer += dt * 1.35;
          if (s.crackTimer >= crackDur) {
            s.broken = true;
            s.regenTimer = 0;
            const outDir = -side;
            this.player.wallAttached = 0;
            this.player.cancelAim();
            this.player.velocityX = outDir * 95;
            this.player.velocityY = 40;
            this.audio.playCrack();
            this.particles.spawnSparkBurst(
              this.player.positionX,
              this.player.positionY,
              outDir,
              '#d97706',
              8
            );
          }
        }
      }
    }

    _checkNearMisses() {
      if (this.player.isAttached() || !this.player.alive) return;

      let triggered = false;
      const obstacles = this.generator.obstacles;
      for (let i = 0; i < obstacles.length; i++) {
        if (obstacles[i].checkNearMiss && obstacles[i].checkNearMiss(this.player)) {
          triggered = true;
          break;
        }
      }

      if (!triggered) {
        for (let i = 0; i < this.projectiles.length; i++) {
          if (this.projectiles[i].checkNearMiss && this.projectiles[i].checkNearMiss(this.player)) {
            triggered = true;
            break;
          }
        }
      }

      if (triggered) {
        this.gems += 2;
        this.runGemsEarned += 2;
        this.totalCloseCalls += 1;
        this.hudGemPulse = 1;
        this._saveInt(STORAGE_KEYS.GEMS, this.gems);
        this._saveInt(STORAGE_KEYS.TOTAL_CLOSE_CALLS, this.totalCloseCalls);
        this._syncMilestoneUnlocks();
        this.slowMoTimer = 0.12;
        this.audio.playCloseCall();
        this.particles.spawnFloatingLabel(
          this.player.positionX,
          this.player.positionY - 22,
          this.t().closeCall || 'CLOSE CALL! +2✦',
          '#74f2ff',
          14
        );
      }
    }

    _tryConsumeShield(isLavaBounce = false) {
      if (this.player.invulnTimer > 0) return true;
      if (!this.player.hasShield) return false;

      this.player.hasShield = false;
      this.player.invulnTimer = 0.7;
      const toCenter = this.player.positionX < C.WIDTH * 0.5 ? 1 : -1;
      this.player.wallAttached = 0;
      this.player.floorAttached = false;
      this.player.cancelAim();
      this.player.velocityX = isLavaBounce ? toCenter * 220 : toCenter * 340;
      this.player.velocityY = isLavaBounce ? -840 : -580;
      this.shakeMag = 5.5;
      this.audio.playShieldBreak();
      this.particles.spawnSparkBurst(
        this.player.positionX,
        this.player.positionY,
        toCenter,
        '#74f2ff',
        12
      );
      this.particles.spawnFloatingLabel(
        this.player.positionX,
        this.player.positionY - 22,
        this.t().shieldSaved || 'SHIELD SAVED!',
        '#74f2ff',
        15
      );
      return true;
    }

    _checkLandingState(simX, simY, wallSide) {
      const r = C.HITBOX.PLAYER_HURT_RADIUS;
      if (wallSide === 0 && this.activeBoss && !this.activeBoss.defeated) {
        if (this.activeBoss.checkTrajectoryHitsBoss(simX, simY)) {
          return 'bossHit';
        }
      }
      if (wallSide !== 0 && this.activeBoss && !this.activeBoss.defeated && this.activeBoss.wallZap) {
        const z = this.activeBoss.wallZap;
        if ((z.warningTimer > 0 || z.activeTimer > 0) && z.side === wallSide) {
          if (simY >= z.centerY - z.halfH && simY <= z.centerY + z.halfH) {
            return 'danger';
          }
        }
      }
      const obstacles = this.generator.obstacles;
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (o.checkPointCollision && o.checkPointCollision(simX, simY, r)) {
          return 'danger';
        }
      }
      if (wallSide !== 0 && this.generator.surfaces) {
        const surfaces = this.generator.surfaces;
        for (let i = 0; i < surfaces.length; i++) {
          const s = surfaces[i];
          if (s.type === 'bouncePad' && s.containsWallPoint(wallSide, simY)) {
            return 'bounce';
          }
        }
      }
      return 'safe';
    }

    _updateAndCheckCollectibles(dt) {
      const items = this.generator.collectibles;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.collected) continue;
        item.update(dt, this.player);
        if (item.checkPickup(this.player)) {
          item.collected = true;
          if (item.itemType === 'shield') {
            this.player.hasShield = true;
            this.audio.playShieldGain();
            this.particles.spawnSparkBurst(item.x, item.y, 0, '#74f2ff', 10);
            this.particles.spawnFloatingLabel(
              item.x,
              item.y - 14,
              this.t().shieldGain || 'SHIELD!',
              '#74f2ff',
              15
            );
          } else {
            const amount = this.tempoTier >= C.TEMPO.DOUBLE_DROP_TIER ? 2 : 1;
            this.gems += amount;
            this.runGemsEarned += amount;
            this.hudGemPulse = 1;
            this._saveInt(STORAGE_KEYS.GEMS, this.gems);
            this.audio.playCollect(amount > 1);
            this.particles.spawnCollectBurst(item.x, item.y, amount);
          }
        }
      }
    }

    _checkThemeMilestone() {
      const themes = C.THEMES;
      const tr = this.t();
      for (let i = themes.length - 1; i > this.announcedThemeIdx; i--) {
        if (this.currentMeters >= themes[i].minMeters) {
          this.announcedThemeIdx = i;
          const key = themes[i].key;
          this.themeBannerText = (tr.themes && tr.themes[key]) || key.toUpperCase();
          this.themeBannerTimer = 2.4;
          break;
        }
      }
    }

    _getBossDisplayName(def, tr) {
      const arch = def.archetype;
      const base = (tr && tr[arch.nameKey]) || arch.defaultName;
      return def.cycle > 1 ? `${base} MK-${def.cycle}` : base;
    }

    _checkBossMilestoneSpawn() {
      const Bosses = JellyGame.Bosses;
      if (!Bosses || this.gameMode === 'tutorial' || this.activeBoss) return;

      const targetMeters = Bosses.getMilestoneMeters(this.nextBossIndex);
      if (this.currentMeters >= targetMeters - 12 && this.bossWarnedIndex < this.nextBossIndex) {
        this.bossWarnedIndex = this.nextBossIndex;
        this.bossWarningTimer = 2.4;
        this.audio.playBossWarning();
      }

      if (this.currentMeters >= targetMeters) {
        this._spawnBossForIndex(this.nextBossIndex);
      }
    }

    _spawnBossForIndex(bossIdx) {
      const Bosses = JellyGame.Bosses;
      if (!Bosses) return null;

      const def = Bosses.getBossDefForIndex(bossIdx);
      const anchorY = Math.round(this.player.positionY);
      const boss = new Bosses.BossEntity(def, anchorY);
      this.activeBoss = boss;
      this.nextBossIndex = bossIdx;
      this.bossWarnedIndex = Math.max(this.bossWarnedIndex, bossIdx);
      this.bossWarningTimer = 0;

      const clearTop = boss.arenaTopY - 40;
      const clearBottom = boss.arenaFloorY + 40;
      if (this.generator.obstacles) {
        this.generator.obstacles = this.generator.obstacles.filter((o) => {
          const top = o.topY != null ? o.topY : o.y - (o.height || 40) * 0.5;
          const bottom = o.bottomY != null ? o.bottomY : o.y + (o.height || 40) * 0.5;
          return bottom < clearTop || top > clearBottom;
        });
      }
      if (this.generator.surfaces) {
        this.generator.surfaces = this.generator.surfaces.filter((s) => {
          const top = s.topY != null ? s.topY : s.y - (s.height || 40) * 0.5;
          const bottom = s.bottomY != null ? s.bottomY : s.y + (s.height || 40) * 0.5;
          return bottom < clearTop || top > clearBottom;
        });
      }
      this.generator.nextChunkBottomY = Math.min(this.generator.nextChunkBottomY, boss.arenaTopY - 80);

      if (this.gameMode === 'rising') {
        this.risingFloorY = Math.max(this.risingFloorY, boss.arenaFloorY + 38);
      }

      this.projectiles.length = 0;
      this.player.invulnTimer = Math.max(this.player.invulnTimer, 0.85);
      this.shakeMag = Math.max(this.shakeMag, 6.5);
      this.audio.playBossWarning();
      return boss;
    }

    _handleBossCombatStep() {
      const boss = this.activeBoss;
      if (!boss || boss.defeated || !this.player.alive) return;

      const p = this.player;
      // 1. Arena Ceiling & Energy Floor Seals keep the duel framed cleanly
      if (p.positionY - p.radius < boss.arenaTopY) {
        p.positionY = boss.arenaTopY + p.radius;
        if (p.velocityY < 0) {
          p.velocityY = Math.abs(p.velocityY) * 0.65;
          p.stretchAmount = 0.22;
        }
      }
      if (p.positionY + p.radius > boss.arenaFloorY) {
        p.positionY = boss.arenaFloorY - p.radius;
        if (!p.isAttached() && p.velocityY > 0) {
          p.velocityY = -Math.max(480, Math.abs(p.velocityY) * 0.84);
          if (Math.abs(p.velocityX) < 130) {
            p.velocityX = (p.positionX < C.WIDTH * 0.5 ? -1 : 1) * 185;
          }
          p.stretchAmount = 0.3;
          this.audio.playStick(340);
          this.particles.spawnSparkBurst(
            p.positionX,
            boss.arenaFloorY,
            0,
            boss.archetype.primaryColor,
            6
          );
        }
      }

      // 2. Check Slingshot Slam Hit vs Boss Core / Orbiting Shield Orbs
      const slamEvt = boss.checkPlayerSlam(p, this.tempoTier, this.particles, this.audio);
      if (!slamEvt) return;

      if (slamEvt.event === 'clang') {
        this.shakeMag = Math.max(this.shakeMag, 3.2);
        return;
      }

      const tr = this.t();
      if (slamEvt.isCrit) {
        this.particles.spawnFloatingLabel(
          boss.x,
          boss.y - boss.hitRadius - 14,
          tr.bossCrit || 'CRIT x2!',
          '#ffd166',
          17
        );
      } else {
        const hitWord = (tr.bossHitLabel || 'HIT!').replace(/^-?\d+\s*/, '');
        this.particles.spawnFloatingLabel(
          boss.x,
          boss.y - boss.hitRadius - 10,
          `-${slamEvt.dmg} ${hitWord}`,
          '#ffffff',
          14
        );
      }

      // Keep Tempo combo alive on clean boss hits!
      this.tempoTimer = C.TEMPO.WINDOW_SEC;

      if (slamEvt.event === 'defeat') {
        this._onBossDefeated(boss, slamEvt);
      } else if (slamEvt.event === 'phase') {
        this.hitStopTimer = 0.045;
        this.shakeMag = Math.max(this.shakeMag, 7.0);
        this.particles.spawnFloatingLabel(
          boss.x,
          boss.y - boss.hitRadius - 32,
          `${tr.bossPhase || 'PHASE'} ${slamEvt.newPhase}!`,
          '#ff9f43',
          16
        );
      } else {
        this.hitStopTimer = slamEvt.isCrit ? 0.036 : 0.022;
        this.shakeMag = Math.max(this.shakeMag, slamEvt.isCrit ? 6.0 : 4.2);
      }
    }

    _onBossDefeated(boss, slamEvt) {
      const tr = this.t();
      const gemsReward = (slamEvt && slamEvt.rewardGems) || boss.rewardGems || 30;
      const Bosses = JellyGame.Bosses;

      this.hitStopTimer = 0.075;
      this.shakeMag = 10.0;
      this.gems += gemsReward;
      this.runGemsEarned += gemsReward;
      this.hudGemPulse = 1;
      this._saveInt(STORAGE_KEYS.GEMS, this.gems);

      this.bossesDefeated += 1;
      this.runBossesDefeated += 1;
      this._saveInt(STORAGE_KEYS.BOSSES_DEFEATED, this.bossesDefeated);

      this.player.hasShield = true;
      this.player.invulnTimer = Math.max(this.player.invulnTimer, 0.9);

      if (Bosses && Bosses.BossBoltProjectile) {
        this.projectiles = this.projectiles.filter(
          (proj) => !(proj instanceof Bosses.BossBoltProjectile)
        );
      } else {
        this.projectiles.length = 0;
      }

      const bossTitle = this._getBossDisplayName(boss.def, tr);
      this.themeBannerText = `👑 ${bossTitle} ${tr.bossDefeated || 'DEFEATED!'} +${gemsReward}✦`;
      this.themeBannerTimer = 2.4;
      this.particles.spawnFloatingLabel(
        boss.x,
        boss.y - 18,
        `+${gemsReward} ✦  🛡️`,
        '#ffd166',
        18
      );

      this.nextBossIndex += 1;
      this.bossWarnedIndex = Math.max(this.bossWarnedIndex, this.nextBossIndex - 1);
      this.bossWarningTimer = 0;

      // Unlock climb above the defeated arena seamlessly
      this.generator.nextChunkBottomY = Math.min(this.generator.nextChunkBottomY, boss.arenaTopY - 80);
      this.generator.generateUpTo(boss.arenaTopY - C.GEN_LOOKAHEAD_PX);
      this.activeBoss = null;
    }

    _getCurrentTheme() {
      const themes = C.THEMES;
      const camMeters = Math.max(
        0,
        (C.START_PLAYER_Y - (this.cameraY + C.HEIGHT * 0.5)) / C.PIXELS_PER_METER
      );

      let idx = 0;
      for (let i = 0; i < themes.length - 1; i++) {
        if (camMeters >= themes[i + 1].minMeters) {
          idx = i + 1;
        }
      }

      const curr = themes[idx];
      const next = themes[idx + 1];
      if (!next) {
        return {
          bgTop: lerpColor(curr.bgTop, curr.bgTop, 0),
          bgBottom: lerpColor(curr.bgBottom, curr.bgBottom, 0),
          parallaxFar: lerpColor(curr.parallaxFar || curr.bgTop, curr.parallaxFar || curr.bgTop, 0),
          parallaxNear: lerpColor(curr.parallaxNear || curr.bgBottom, curr.parallaxNear || curr.bgBottom, 0),
          rayColor: lerpColor(curr.rayColor || curr.wallHighlight, curr.rayColor || curr.wallHighlight, 0),
          wallBase: lerpColor(curr.wallBase, curr.wallBase, 0),
          wallShadow: lerpColor(curr.wallShadow, curr.wallShadow, 0),
          wallInnerEdge: lerpColor(curr.wallInnerEdge, curr.wallInnerEdge, 0),
          wallHighlight: lerpColor(curr.wallHighlight, curr.wallHighlight, 0),
          moteColor: lerpColor(curr.moteColor, curr.moteColor, 0)
        };
      }

      const transitionSpan = 10;
      const startBlend = next.minMeters - transitionSpan;
      const t = clamp((camMeters - startBlend) / transitionSpan, 0, 1);

      return {
        bgTop: lerpColor(curr.bgTop, next.bgTop, t),
        bgBottom: lerpColor(curr.bgBottom, next.bgBottom, t),
        parallaxFar: lerpColor(curr.parallaxFar || curr.bgTop, next.parallaxFar || next.bgTop, t),
        parallaxNear: lerpColor(curr.parallaxNear || curr.bgBottom, next.parallaxNear || next.bgBottom, t),
        rayColor: lerpColor(curr.rayColor || curr.wallHighlight, next.rayColor || next.wallHighlight, t),
        wallBase: lerpColor(curr.wallBase, next.wallBase, t),
        wallShadow: lerpColor(curr.wallShadow, next.wallShadow, t),
        wallInnerEdge: lerpColor(curr.wallInnerEdge, next.wallInnerEdge, t),
        wallHighlight: lerpColor(curr.wallHighlight, next.wallHighlight, t),
        moteColor: lerpColor(curr.moteColor, next.moteColor, t)
      };
    }

    _updateCamera(dt) {
      if (this.activeBoss && !this.activeBoss.defeated) {
        const targetCam = this.activeBoss.cameraTargetY;
        this.cameraY += (targetCam - this.cameraY) * (1 - Math.exp(-5.2 * dt));
        return;
      }

      const screenY = this.player.positionY - this.cameraY;
      const upThreshold = C.HEIGHT * C.CAMERA_UP_TRIGGER_RATIO;
      const downThreshold = C.HEIGHT * C.CAMERA_DOWN_TRIGGER_RATIO;

      if (screenY < upThreshold) {
        const desiredY = this.player.positionY - upThreshold;
        this.cameraY += (desiredY - this.cameraY) * (1 - Math.exp(-C.CAMERA_LERP_UP * dt));
      } else if (screenY > downThreshold && this.cameraY < C.START_CAMERA_Y) {
        const desiredY = Math.min(C.START_CAMERA_Y, this.player.positionY - downThreshold);
        this.cameraY += (desiredY - this.cameraY) * (1 - Math.exp(-C.CAMERA_LERP_DOWN * dt));
      }
    }

    _updateObstaclesAndProjectiles(dt) {
      const obsContext = {
        cameraY: this.cameraY,
        projectiles: this.projectiles,
        particles: this.particles,
        audio: this.audio
      };

      const obstacles = this.generator.obstacles;
      for (let i = 0; i < obstacles.length; i++) {
        obstacles[i].update(dt, obsContext);
      }

      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.update(dt, obsContext);
        if (!p.alive) {
          this.projectiles.splice(i, 1);
        }
      }
    }

    _checkHazards() {
      if (this.activeBoss && this.activeBoss.checkWallZapHazard(this.player)) {
        return true;
      }
      const obstacles = this.generator.obstacles;
      for (let i = 0; i < obstacles.length; i++) {
        if (obstacles[i].checkPlayerCollision(this.player)) {
          return true;
        }
      }
      return this._checkProjectileHits();
    }

    _checkProjectileHits() {
      for (let i = 0; i < this.projectiles.length; i++) {
        if (this.projectiles[i].checkPlayerCollision(this.player)) {
          return true;
        }
      }
      return false;
    }

    _triggerDeath() {
      this.state = 'dead';
      this.deathTimer = 0;
      this.hitStopTimer = 0.055;
      this.shakeMag = 8.5;
      this.tempoTier = 1;
      this.tempoTimer = 0;
      this.player.tempoTier = 1;
      this.player.alive = false;
      this.player.cancelAim();
      this.pointer.isDown = false;
      this.activePointerId = null;
      this.audio.resetStretchTick();
      this.audio.setMusicContext('dead', this.gameMode, 1);
      this.audio.playPop();
      this.particles.spawnPopBurst(this.player.positionX, this.player.positionY);
      this._submitCurrentRunScore();
    }

    render() {
      const ctx = this.ctx;
      const theme = this._getCurrentTheme();

      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      let shakeX = 0;
      let shakeY = 0;
      if (this.shakeMag > 0.1) {
        shakeX = (Math.random() - 0.5) * 2 * this.shakeMag;
        shakeY = (Math.random() - 0.5) * 2 * this.shakeMag;
      }

      this._drawBackground(ctx, theme);

      ctx.save();
      ctx.translate(shakeX, shakeY);

      if (this.state !== 'menu') {
        this._drawAltitudeMarkers(ctx);
        this._drawWorldBestBanner(ctx);
        if (this.gameMode === 'tutorial') {
          this._drawTutorialWorldElements(ctx);
        }
      }
      this._drawWallsAndFloor(ctx, theme);

      // Surfaces, obstacles, collectibles & projectiles (active gameplay / death view only)
      if (this.state !== 'menu') {
        if (this.generator.surfaces) {
          const surfaces = this.generator.surfaces;
          for (let i = 0; i < surfaces.length; i++) {
            surfaces[i].draw(ctx, this.cameraY);
          }
        }

        const obstacles = this.generator.obstacles;
        for (let i = 0; i < obstacles.length; i++) {
          obstacles[i].draw(ctx, this.cameraY);
        }

        const collectibles = this.generator.collectibles;
        for (let i = 0; i < collectibles.length; i++) {
          collectibles[i].draw(ctx, this.cameraY);
        }

        if (this.activeBoss && !this.activeBoss.defeated) {
          this.activeBoss.draw(ctx, this.cameraY);
        }

        for (let i = 0; i < this.projectiles.length; i++) {
          this.projectiles[i].draw(ctx, this.cameraY);
        }
      }

      // First-second intuitive drag hint
      if (!this.hasLaunchedOnce && !this.player.isAiming && this.state === 'playing' && !this.activeModal) {
        this._drawFirstLaunchHint(ctx);
      }

      // Tempo wall timer ring around attached player
      if (
        this.state === 'playing' &&
        this.hasLaunchedOnce &&
        this.player.isAttached() &&
        this.tempoTimer > 0 &&
        !this.player.isAiming
      ) {
        this._drawTempoRing(ctx);
      }

      this.player.draw(ctx, this.cameraY, this._boundCheckLanding);
      this.particles.draw(ctx, this.cameraY);

      // Rising Magma Tide rendered over lower shaft in Rising Floor mode
      if (this.state !== 'menu' && this.gameMode === 'rising') {
        this._drawRisingFloor(ctx);
      }

      if (this.state === 'playing' && this.player.isAttached() && this.player.isAiming) {
        this._drawTouchPullGuide(ctx);
      }

      if (this.showHitboxes && this.state !== 'menu') {
        this._drawDebugHitboxes(ctx);
      }

      ctx.restore();

      if (this.state === 'menu') {
        this._drawMainMenu(ctx);
      } else {
        this._drawHUD(ctx);
        if (this.activeBoss && !this.activeBoss.defeated && this.state === 'playing') {
          this._drawBossHUD(ctx);
        } else if (this.bossWarningTimer > 0 && !this.activeBoss && this.state === 'playing') {
          this._drawBossWarningBanner(ctx);
        }
        if (this.gameMode === 'tutorial' && !this.tutorialCompletedThisRun && this.state === 'playing') {
          this._drawTutorialCoachCard(ctx);
        }
        if (this.gameMode === 'rising' && this.state === 'playing') {
          this._drawRisingDangerHUD(ctx);
        }
        if (this.themeBannerTimer > 0) {
          this._drawThemeBanner(ctx);
        }
        if (this.rewardToast) {
          this._drawRewardToast(ctx);
        }
        if (this.state === 'dead' && this.deathTimer >= 0.35 && !this.activeModal) {
          this._drawDeathOverlay(ctx);
        }
      }

      if (this.activeModal === 'modes') {
        this._drawModeSelectModal(ctx);
      } else if (this.activeModal === 'leaderboard') {
        this._drawLeaderboardModal(ctx);
      } else if (this.activeModal === 'accessories') {
        this._drawAccessoryDrawer(ctx);
      } else if (this.activeModal === 'settings') {
        this._drawSettingsModal(ctx);
      } else if (this.activeModal === 'privacy') {
        this._drawPrivacyModal(ctx);
      }

      ctx.restore();
    }

    _drawTutorialWorldElements(ctx) {
      const tr = this.t();

      // 1. Stage 1 Glowing Wall Target Zone on Right Wall (y = -305)
      if (this.tutorialStepIdx === 0) {
        const targetY = -305 - this.cameraY;
        const targetH = 110;
        if (targetY > -120 && targetY < C.HEIGHT + 120) {
          const pulse = 0.55 + 0.45 * Math.sin(this.hintTime * 5.2);
          const wallX = C.WIDTH - C.WALL_WIDTH;

          ctx.save();
          ctx.fillStyle = `rgba(54, 245, 176, ${0.18 * pulse})`;
          ctx.fillRect(wallX - 18, targetY - targetH * 0.5, 18, targetH);

          ctx.strokeStyle = `rgba(54, 245, 176, ${0.65 + 0.35 * pulse})`;
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 5]);
          roundRectPath(ctx, wallX - 20, targetY - targetH * 0.5, 20, targetH, 8);
          ctx.stroke();
          ctx.setLineDash([]);

          const lbl = tr.tutTargetLabel || 'STICK HERE!';
          ctx.font = `700 11px ${C.FONTS.DISPLAY}`;
          const bw = ctx.measureText(lbl).width + 22;
          const bx = wallX - 28 - bw;
          ctx.fillStyle = 'rgba(8, 22, 20, 0.88)';
          ctx.strokeStyle = '#36f5b0';
          ctx.lineWidth = 1.6;
          roundRectPath(ctx, bx, targetY - 12, bw, 24, 12);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#8affdb';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${lbl} →`, bx + bw * 0.5, targetY + 0.5);
          ctx.restore();
        }
      }

      // 2. Animated Ghost Demo Projection of Our Character teaching the exact move!
      if (this.player.alive && this.player.isAttached() && !this.player.isAiming) {
        this._drawCharacterMoveDemo(ctx);
        this._drawCharacterSpeechBubble(ctx);
      }

      // 3. Tutorial Finish Gate Ribbon at 50m (y = -2235)
      if (!this.tutorialCompletedThisRun) {
        const finishY = (C.TUTORIAL && C.TUTORIAL.FINISH_Y) || -2235;
        const sy = finishY - this.cameraY;
        if (sy > -50 && sy < C.HEIGHT + 50) {
          ctx.save();
          ctx.strokeStyle = '#36f5b0';
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 6]);
          ctx.beginPath();
          ctx.moveTo(C.WALL_WIDTH, sy);
          ctx.lineTo(C.WIDTH - C.WALL_WIDTH, sy);
          ctx.stroke();
          ctx.setLineDash([]);

          const gateText = tr.tutFinishGate || '★ FINISH TRAINING (+15✦) ★';
          ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
          const badgeW = Math.max(176, ctx.measureText(gateText).width + 26);
          const badgeH = 24;
          ctx.fillStyle = '#07221b';
          ctx.strokeStyle = '#36f5b0';
          ctx.lineWidth = 1.8;
          roundRectPath(ctx, C.WIDTH * 0.5 - badgeW * 0.5, sy - badgeH * 0.5, badgeW, badgeH, 12);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#8affdb';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(gateText, C.WIDTH * 0.5, sy + 0.5);
          ctx.restore();
        }
      }
    }

    _drawCharacterMoveDemo(ctx) {
      const px = this.player.positionX;
      const py = this.player.positionY - this.cameraY;
      const targetRight = this.player.positionX < C.WIDTH * 0.5;
      const destX = targetRight
        ? C.WIDTH - C.WALL_WIDTH - C.PLAYER_RADIUS
        : C.WALL_WIDTH + C.PLAYER_RADIUS;
      const destY = py - 155;
      const ctrlX = (px + destX) * 0.5;
      const ctrlY = py - 210;

      // 2.2-second loop: [0..0.42] character stretches back to demonstrate pull; [0.42..1.0] ghost leaps along arc
      const cycle = (this.hintTime % 2.2) / 2.2;
      const pal = this.player.getColorPalette();

      ctx.save();
      // Subtle guide dots along the demo jump path
      ctx.fillStyle = pal.primary;
      for (let i = 1; i <= 7; i++) {
        const u = i / 8;
        const gx = (1 - u) * (1 - u) * px + 2 * (1 - u) * u * ctrlX + u * u * destX;
        const gy = (1 - u) * (1 - u) * py + 2 * (1 - u) * u * ctrlY + u * u * destY;
        ctx.globalAlpha = 0.22;
        ctx.beginPath();
        ctx.arc(gx, gy, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      let demoX = px;
      let demoY = py;
      let scaleX = 1;
      let scaleY = 1;
      let rot = 0;
      let alpha = 0.55;

      if (cycle < 0.42) {
        const pullT = Math.sin((cycle / 0.42) * Math.PI * 0.5);
        const pullDirX = targetRight ? -1 : 1;
        demoX = px + pullDirX * pullT * 20;
        demoY = py + pullT * 24;
        scaleX = 1 + pullT * 0.28;
        scaleY = 1 - pullT * 0.22;
        rot = targetRight ? -0.45 : 0.45;
        alpha = 0.5;
      } else {
        const flyT = (cycle - 0.42) / 0.58;
        demoX =
          (1 - flyT) * (1 - flyT) * px +
          2 * (1 - flyT) * flyT * ctrlX +
          flyT * flyT * destX;
        demoY =
          (1 - flyT) * (1 - flyT) * py +
          2 * (1 - flyT) * flyT * ctrlY +
          flyT * flyT * destY;
        scaleX = 1.18 - flyT * 0.15;
        scaleY = 0.85 + flyT * 0.12;
        rot = (targetRight ? 0.35 : -0.35) * (1 - flyT);
        alpha = flyT > 0.82 ? ((1 - flyT) / 0.18) * 0.58 : 0.58;
      }

      ctx.globalAlpha = clamp(alpha, 0, 0.65);
      ctx.translate(demoX, demoY);
      ctx.rotate(rot);
      ctx.scale(scaleX, scaleY);
      this._drawMiniJellyPreview(ctx, 0, 0, 14, this.equippedAccessory);
      ctx.restore();
    }

    _drawCharacterSpeechBubble(ctx) {
      const tr = this.t();
      const steps = tr.tutorialSteps || [];
      const stepObj = steps[this.tutorialStepIdx] || steps[0];
      if (!stepObj || !stepObj.bubble) return;

      const px = this.player.positionX;
      const py = this.player.positionY - this.cameraY;
      if (py < 155 || py > C.HEIGHT - 60) return;

      const onLeft = px < C.WIDTH * 0.5;
      const bob = Math.sin(this.hintTime * 4.2) * 2.5;

      ctx.save();
      ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
      const textW = ctx.measureText(stepObj.bubble).width;
      const bw = textW + 24;
      const bh = 28;
      const bx = onLeft ? px + 26 : px - 26 - bw;
      const by = py - 44 + bob;

      // Speech bubble shadow
      ctx.fillStyle = 'rgba(6, 12, 24, 0.55)';
      roundRectPath(ctx, bx, by + 3, bw, bh, 14);
      ctx.fill();

      // Speech bubble body
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#091526';
      ctx.lineWidth = 2.2;
      roundRectPath(ctx, bx, by, bw, bh, 14);
      ctx.fill();
      ctx.stroke();

      // Triangular pointer tail pointing directly to our Jelly character
      const tailBaseX = onLeft ? bx + 14 : bx + bw - 14;
      const tailTipX = onLeft ? px + 14 : px - 14;
      const tailTipY = py - 10 + bob * 0.5;
      ctx.beginPath();
      ctx.moveTo(tailBaseX - 5, by + bh - 1);
      ctx.lineTo(tailTipX, tailTipY);
      ctx.lineTo(tailBaseX + 6, by + bh - 1);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#091526';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Cover seam inside bubble
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(tailBaseX - 5, by + bh - 3, 11, 4);

      // Character speech text
      ctx.fillStyle = '#081b2e';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(stepObj.bubble, bx + bw * 0.5, by + bh * 0.5 + 0.5);
      ctx.restore();
    }

    _drawTutorialCoachCard(ctx) {
      const tr = this.t();
      const steps = tr.tutorialSteps || [];
      const stepObj = steps[this.tutorialStepIdx] || steps[0] || {
        title: '1/5 • TUTORIAL',
        desc: '"Pull me down and release to launch!"'
      };

      const cardW = C.WIDTH - C.WALL_WIDTH * 2 - 8;
      const cardH = 74;
      const cardX = (C.WIDTH - cardW) * 0.5;
      const cardY = 66;

      ctx.save();
      // 3D shadow lip
      ctx.fillStyle = 'rgba(5, 10, 20, 0.88)';
      roundRectPath(ctx, cardX, cardY + 3.5, cardW, cardH, 18);
      ctx.fill();

      // Card body
      const grad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
      grad.addColorStop(0, 'rgba(20, 36, 58, 0.95)');
      grad.addColorStop(1, 'rgba(12, 22, 38, 0.95)');
      ctx.fillStyle = grad;
      ctx.strokeStyle = 'rgba(54, 245, 176, 0.52)';
      ctx.lineWidth = 1.8;
      roundRectPath(ctx, cardX, cardY, cardW, cardH, 18);
      ctx.fill();
      ctx.stroke();

      // Left Circular Portrait Well featuring Our Talking Jelly Character!
      const portCx = cardX + 30;
      const portCy = cardY + cardH * 0.5 + 2;
      ctx.fillStyle = 'rgba(8, 15, 28, 0.8)';
      ctx.strokeStyle = this.player.getColorPalette().primary;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(portCx, portCy, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Draw our Jelly character bouncing & talking inside the portrait
      const talkBob = Math.sin(this.hintTime * 8.5) * 1.4;
      this._drawMiniJellyPreview(ctx, portCx, portCy + 2 + talkBob, 13.5, this.equippedAccessory);

      // Animated talking mouth overlay on portrait jelly
      if (Math.sin(this.hintTime * 11) > 0) {
        ctx.fillStyle = '#0e1b2a';
        ctx.beginPath();
        ctx.ellipse(portCx, portCy + 5.2 + talkBob, 2.6, 1.9, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      const textLeftX = cardX + 58;

      // Step progress dots (5 steps)
      for (let i = 0; i < 5; i++) {
        const dx = textLeftX + 4 + i * 10;
        const dy = cardY + 14;
        ctx.fillStyle = i <= this.tutorialStepIdx ? '#36f5b0' : 'rgba(180, 205, 240, 0.25)';
        ctx.beginPath();
        ctx.arc(dx, dy, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Step title
      ctx.fillStyle = '#6effd2';
      ctx.font = `700 10.5px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(stepObj.title, textLeftX + 56, cardY + 14.5);

      // Skip button in top-right of coach card
      const skipW = 58;
      const skipH = 22;
      const skipX = cardX + cardW - skipW - 7;
      const skipY = cardY + 6;
      this.uiRects.tutSkipBtn = { x: skipX, y: skipY, w: skipW, h: skipH };

      ctx.fillStyle = 'rgba(38, 58, 90, 0.92)';
      ctx.strokeStyle = 'rgba(180, 210, 255, 0.3)';
      ctx.lineWidth = 1;
      roundRectPath(ctx, skipX, skipY, skipW, skipH, 11);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#dce8ff';
      ctx.font = `700 9.5px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText(tr.tutSkip || 'SKIP ⏭', skipX + skipW * 0.5, skipY + skipH * 0.5 + 0.5);

      // Word-wrapped first-person character dialogue (up to 2 lines)
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 11px ${C.FONTS.UI}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const words = (stepObj.desc || '').split(' ');
      const maxW = cardW - 68;
      let line1 = '';
      let line2 = '';
      for (let i = 0; i < words.length; i++) {
        const test = line1 ? `${line1} ${words[i]}` : words[i];
        if (!line2 && ctx.measureText(test).width <= maxW) {
          line1 = test;
        } else {
          line2 = line2 ? `${line2} ${words[i]}` : words[i];
        }
      }
      ctx.fillText(line1, textLeftX, cardY + 31);
      if (line2) {
        ctx.fillText(line2, textLeftX, cardY + 47);
      }

      ctx.restore();
    }

    _drawRisingFloor(ctx) {
      const sy = this.risingFloorY - this.cameraY;
      if (sy > C.HEIGHT + 120) return;

      const leftX = C.WALL_WIDTH;
      const rightX = C.WIDTH - C.WALL_WIDTH;
      const spanW = rightX - leftX;
      const clampTopY = Math.max(-20, sy);

      ctx.save();
      // Ambient upward magma heat glow above the wave crest
      const glowGrad = ctx.createLinearGradient(0, sy - 90, 0, sy + 15);
      glowGrad.addColorStop(0, 'rgba(255, 77, 61, 0)');
      glowGrad.addColorStop(1, 'rgba(255, 94, 54, 0.42)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(leftX, sy - 90, spanW, 105);

      // Animated dual-sine magma crest path
      ctx.beginPath();
      ctx.moveTo(leftX, C.HEIGHT + 40);
      const segs = 24;
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const wx = leftX + u * spanW;
        const wave =
          Math.sin(u * Math.PI * 4 + this.hintTime * 5.2) * 4.5 +
          Math.cos(u * Math.PI * 7 - this.hintTime * 3.6) * 2.5;
        ctx.lineTo(wx, clampTopY + wave);
      }
      ctx.lineTo(rightX, C.HEIGHT + 40);
      ctx.closePath();

      const lavaGrad = ctx.createLinearGradient(0, clampTopY, 0, Math.max(clampTopY + 180, C.HEIGHT));
      lavaGrad.addColorStop(0, '#ffbe3b');
      lavaGrad.addColorStop(0.18, '#ff5e36');
      lavaGrad.addColorStop(0.55, '#d62828');
      lavaGrad.addColorStop(1, '#5c0a14');
      ctx.fillStyle = lavaGrad;
      ctx.fill();

      // Incandescent bright top crust line
      ctx.strokeStyle = '#fff3a1';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const wx = leftX + u * spanW;
        const wave =
          Math.sin(u * Math.PI * 4 + this.hintTime * 5.2) * 4.5 +
          Math.cos(u * Math.PI * 7 - this.hintTime * 3.6) * 2.5;
        if (i === 0) ctx.moveTo(wx, clampTopY + wave);
        else ctx.lineTo(wx, clampTopY + wave);
      }
      ctx.stroke();

      // Bubbling magma blisters along the surface
      for (let b = 0; b < 5; b++) {
        const bx = leftX + 35 + ((b * 79 + Math.sin(this.hintTime * 1.7 + b) * 18) % (spanW - 70));
        const by = clampTopY + 14 + Math.sin(this.hintTime * 4 + b * 2.1) * 5;
        const br = 3.5 + 2 * Math.abs(Math.sin(this.hintTime * 3.2 + b));
        ctx.fillStyle = '#fff3a1';
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    _drawRisingDangerHUD(ctx) {
      if (!this.hasLaunchedOnce) return;
      const distPx = Math.max(0, this.risingFloorY - this.player.positionY);
      const distMeters = Math.max(0, Math.round(distPx / C.PIXELS_PER_METER));
      const urgency = clamp(1 - distPx / 420, 0, 1);

      ctx.save();
      // Bottom danger heat vignette when magma is close
      if (urgency > 0.05) {
        const vig = ctx.createLinearGradient(0, C.HEIGHT - 110, 0, C.HEIGHT);
        vig.addColorStop(0, 'rgba(255, 56, 56, 0)');
        vig.addColorStop(1, `rgba(255, 65, 45, ${0.12 + urgency * 0.35})`);
        ctx.fillStyle = vig;
        ctx.fillRect(0, C.HEIGHT - 110, C.WIDTH, 110);
      }

      // Bottom-center proximity pill
      const tr = this.t();
      const pillW = 132;
      const pillH = 26;
      const pillX = (C.WIDTH - pillW) * 0.5;
      const pillY = C.HEIGHT - 38;
      const pulse = urgency > 0.4 ? Math.sin(this.hintTime * 10) * 1.5 : 0;

      ctx.fillStyle = 'rgba(24, 8, 12, 0.86)';
      ctx.strokeStyle = urgency > 0.45 ? '#ff4d3d' : '#ff9b26';
      ctx.lineWidth = 1.6;
      roundRectPath(ctx, pillX, pillY + pulse, pillW, pillH, 13);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = urgency > 0.45 ? '#ffd2cc' : '#ffeaa7';
      ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `${tr.lavaWarning || '▲ MAGMA'}: ${distMeters} m ▲`,
        C.WIDTH * 0.5,
        pillY + pillH * 0.5 + 0.5 + pulse
      );
      ctx.restore();
    }

    _drawWorldBestBanner(ctx) {
      if (this.runStartBestMeters <= 0 || this.bestBannerBroken) return;
      const wy = C.START_PLAYER_Y - this.runStartBestMeters * C.PIXELS_PER_METER;
      const sy = wy - this.cameraY;
      if (sy < -40 || sy > C.HEIGHT + 40) return;

      const tr = this.t();
      ctx.save();

      // Shimmering golden laser ribbon across shaft
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.78)';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(C.WALL_WIDTH, sy);
      ctx.lineTo(C.WIDTH - C.WALL_WIDTH, sy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Golden center banner plaque
      const badgeW = 128;
      const badgeH = 22;
      ctx.fillStyle = '#1b1408';
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 1.6;
      roundRectPath(ctx, C.WIDTH * 0.5 - badgeW * 0.5, sy - badgeH * 0.5, badgeW, badgeH, 11);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffeaa7';
      ctx.font = `700 11px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `★ ${tr.best || 'BEST'}: ${this.runStartBestMeters} m ★`,
        C.WIDTH * 0.5,
        sy + 0.5
      );
      ctx.restore();
    }

    _drawBackground(ctx, theme) {
      const grad = ctx.createLinearGradient(0, 0, 0, C.HEIGHT);
      grad.addColorStop(0, theme.bgTop);
      grad.addColorStop(1, theme.bgBottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);

      // Soft diagonal atmospheric light shafts (Alto's Odyssey / Badland inspired)
      ctx.save();
      ctx.fillStyle = theme.rayColor;
      for (let i = 0; i < 3; i++) {
        const pulse = 0.032 + 0.018 * Math.sin(this.hintTime * 0.7 + i * 2.1);
        ctx.globalAlpha = pulse;
        const rx = 55 + i * 115 + Math.sin(this.hintTime * 0.35 + i) * 14;
        ctx.beginPath();
        ctx.moveTo(rx, 0);
        ctx.lineTo(rx + 64, 0);
        ctx.lineTo(rx - 40, C.HEIGHT);
        ctx.lineTo(rx - 104, C.HEIGHT);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Far parallax architectural monoliths & cavern arches (Monument Valley inspired)
      const farSpan = 340;
      const farOffset = ((-this.cameraY * 0.12) % farSpan + farSpan) % farSpan;
      ctx.save();
      ctx.fillStyle = theme.parallaxFar;
      for (let y = farOffset - farSpan; y < C.HEIGHT + farSpan; y += farSpan) {
        // Left stepped buttress silhouette
        ctx.beginPath();
        ctx.moveTo(C.WALL_WIDTH, y + 20);
        ctx.lineTo(C.WALL_WIDTH + 68, y + 55);
        ctx.lineTo(C.WALL_WIDTH + 68, y + 150);
        ctx.lineTo(C.WALL_WIDTH + 38, y + 172);
        ctx.lineTo(C.WALL_WIDTH + 38, y + 240);
        ctx.lineTo(C.WALL_WIDTH, y + 265);
        ctx.closePath();
        ctx.fill();

        // Right geometric monolith silhouette
        ctx.beginPath();
        ctx.moveTo(C.WIDTH - C.WALL_WIDTH, y + 110);
        ctx.lineTo(C.WIDTH - C.WALL_WIDTH - 76, y + 152);
        ctx.lineTo(C.WIDTH - C.WALL_WIDTH - 76, y + 255);
        ctx.lineTo(C.WIDTH - C.WALL_WIDTH - 42, y + 280);
        ctx.lineTo(C.WIDTH - C.WALL_WIDTH, y + 310);
        ctx.closePath();
        ctx.fill();

        // Subtle distant floating diamond shrine in center-ish background
        const cx = C.WIDTH * 0.5 + ((Math.round(y) % 2 === 0 ? -1 : 1) * 44);
        const cy = y + 95;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 26);
        ctx.lineTo(cx + 15, cy);
        ctx.lineTo(cx, cy + 26);
        ctx.lineTo(cx - 15, cy);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Near parallax framing ribs
      const nearSpan = 240;
      const nearOffset = ((-this.cameraY * 0.25) % nearSpan + nearSpan) % nearSpan;
      ctx.save();
      ctx.fillStyle = theme.parallaxNear;
      for (let y = nearOffset - nearSpan; y < C.HEIGHT + nearSpan; y += nearSpan) {
        ctx.beginPath();
        ctx.moveTo(C.WALL_WIDTH, y + 40);
        ctx.lineTo(C.WALL_WIDTH + 24, y + 56);
        ctx.lineTo(C.WALL_WIDTH + 24, y + 112);
        ctx.lineTo(C.WALL_WIDTH, y + 128);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(C.WIDTH - C.WALL_WIDTH, y + 150);
        ctx.lineTo(C.WIDTH - C.WALL_WIDTH - 24, y + 166);
        ctx.lineTo(C.WIDTH - C.WALL_WIDTH - 24, y + 222);
        ctx.lineTo(C.WIDTH - C.WALL_WIDTH, y + 238);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Ambient drifting spores / motes
      ctx.save();
      for (let i = 0; i < this.ambientMotes.length; i++) {
        const m = this.ambientMotes[i];
        const parallaxY =
          (((m.y - this.cameraY * 0.22 + this.hintTime * m.speedY) % C.HEIGHT) + C.HEIGHT) %
          C.HEIGHT;
        const swayX = m.x + Math.sin(this.hintTime * 1.1 + m.driftPhase) * 6;
        ctx.globalAlpha = m.alpha;
        ctx.fillStyle = theme.moteColor;
        ctx.beginPath();
        ctx.arc(swayX, parallaxY, m.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    _drawAltitudeMarkers(ctx) {
      const stepMeters = 10;
      const stepPx = stepMeters * C.PIXELS_PER_METER;
      const topWorldY = this.cameraY;
      const bottomWorldY = this.cameraY + C.HEIGHT;

      const minMarkerIdx = Math.max(
        1,
        Math.floor((C.START_PLAYER_Y - bottomWorldY) / stepPx)
      );
      const maxMarkerIdx = Math.ceil((C.START_PLAYER_Y - topWorldY) / stepPx);

      ctx.save();
      ctx.font = `600 11px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let idx = minMarkerIdx; idx <= maxMarkerIdx; idx++) {
        const wy = C.START_PLAYER_Y - idx * stepPx;
        const sy = wy - this.cameraY;
        if (sy < -20 || sy > C.HEIGHT + 20) continue;

        // Diegetic architectural cross-wire + carved distance plaque
        ctx.strokeStyle = 'rgba(200, 225, 255, 0.06)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(C.WALL_WIDTH + 6, sy);
        ctx.lineTo(C.WIDTH * 0.5 - 28, sy);
        ctx.moveTo(C.WIDTH * 0.5 + 28, sy);
        ctx.lineTo(C.WIDTH - C.WALL_WIDTH - 6, sy);
        ctx.stroke();

        ctx.fillStyle = 'rgba(14, 22, 38, 0.45)';
        ctx.strokeStyle = 'rgba(200, 225, 255, 0.1)';
        roundRectPath(ctx, C.WIDTH * 0.5 - 24, sy - 9, 48, 18, 9);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(205, 228, 255, 0.34)';
        ctx.fillText(`${idx * stepMeters} m`, C.WIDTH * 0.5, sy + 0.5);
      }
      ctx.restore();
    }

    _drawWallsAndFloor(ctx, theme) {
      const w = C.WALL_WIDTH;

      ctx.fillStyle = theme.wallBase;
      ctx.fillRect(0, 0, w, C.HEIGHT);
      ctx.fillRect(C.WIDTH - w, 0, w, C.HEIGHT);

      ctx.fillStyle = theme.wallShadow;
      ctx.fillRect(0, 0, w * 0.44, C.HEIGHT);
      ctx.fillRect(C.WIDTH - w * 0.44, 0, w * 0.44, C.HEIGHT);

      // Chiseled stone block joints scrolling with camera
      const grooveSpacing = 56;
      const offset = ((-this.cameraY % grooveSpacing) + grooveSpacing) % grooveSpacing;

      ctx.save();
      for (let y = offset - grooveSpacing; y < C.HEIGHT + grooveSpacing; y += grooveSpacing) {
        // Dark mortar seam
        ctx.fillStyle = 'rgba(6, 10, 20, 0.32)';
        ctx.fillRect(0, y, w - 4, 2.5);
        ctx.fillRect(C.WIDTH - w + 4, y, w - 4, 2.5);

        // Upper stone bevel highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
        ctx.fillRect(6, y + 2.5, w - 12, 2);
        ctx.fillRect(C.WIDTH - w + 6, y + 2.5, w - 12, 2);
      }

      ctx.fillStyle = theme.wallInnerEdge;
      ctx.fillRect(w - 4.5, 0, 4.5, C.HEIGHT);
      ctx.fillRect(C.WIDTH - w, 0, 4.5, C.HEIGHT);

      ctx.fillStyle = theme.wallHighlight;
      ctx.fillRect(w - 1.5, 0, 1.5, C.HEIGHT);
      ctx.fillRect(C.WIDTH - w, 0, 1.5, C.HEIGHT);

      // Bioluminescent wall contact glow matching the jelly's active color palette!
      if (this.player.alive && this.player.wallAttached !== 0) {
        const edgeX = this.player.wallAttached < 0 ? w : C.WIDTH - w;
        const py = this.player.positionY - this.cameraY;
        const glowR = 46;
        const glowGrad = ctx.createRadialGradient(edgeX, py, 2, edgeX, py, glowR);
        const isGold = this.tempoTier >= C.TEMPO.DOUBLE_DROP_TIER;
        const pal = this.player.getColorPalette();
        glowGrad.addColorStop(0, isGold ? 'rgba(255, 209, 102, 0.55)' : pal.glow);
        glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(edgeX - 16, py - glowR, 32, glowR * 2);
      }
      ctx.restore();

      const floorScreenY = C.FLOOR_Y - this.cameraY;
      if (floorScreenY < C.HEIGHT + 40) {
        ctx.save();
        ctx.fillStyle = theme.wallBase;
        ctx.fillRect(w, floorScreenY, C.WIDTH - w * 2, C.HEIGHT - floorScreenY + 20);

        ctx.fillStyle = 'rgba(6, 10, 20, 0.35)';
        ctx.fillRect(w, floorScreenY + 4, C.WIDTH - w * 2, 4);

        ctx.fillStyle = C.COLORS.floorAccent;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(w, floorScreenY, C.WIDTH - w * 2, 3.5);
        ctx.restore();
      }
    }

    _drawTempoRing(ctx) {
      const ratio = clamp(this.tempoTimer / C.TEMPO.WINDOW_SEC, 0, 1);
      const sx = this.player.positionX;
      const sy = this.player.positionY - this.cameraY;
      const ringR = this.player.radius + 7;

      ctx.save();
      ctx.strokeStyle =
        this.tempoTier >= C.TEMPO.DOUBLE_DROP_TIER
          ? C.COLORS.tempoGold
          : C.COLORS.tempoCyan;
      ctx.globalAlpha = 0.35 + ratio * 0.5;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(sx, sy, ringR, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * ratio);
      ctx.stroke();
      ctx.restore();
    }

    _drawFirstLaunchHint(ctx) {
      const cycle = (this.hintTime % 2.1) / 2.1;
      const pullT = cycle < 0.65 ? Math.sin((cycle / 0.65) * Math.PI * 0.5) : 1;
      const fadeAlpha = cycle > 0.78 ? 1 - (cycle - 0.78) / 0.22 : Math.min(1, cycle * 4);

      const px = this.player.positionX;
      const py = this.player.positionY - this.cameraY;
      const anchorX = px + 115;
      const anchorY = py - 20;
      const pullX = anchorX - pullT * 52;
      const pullY = anchorY + pullT * 62;

      ctx.save();
      ctx.globalAlpha = fadeAlpha * 0.75;

      ctx.strokeStyle = C.COLORS.jellyPrimary;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.moveTo(px + 12, py - 8);
      ctx.quadraticCurveTo(px + 145, py - 150, C.WIDTH - C.WALL_WIDTH - 22, py - 115);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(anchorX, anchorY);
      ctx.lineTo(pullX, pullY);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pullX, pullY, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }

    _drawTouchPullGuide(ctx) {
      const sx = this.pointer.startX;
      const sy = this.pointer.startY;
      const cx = this.pointer.currX;
      const cy = this.pointer.currY;
      const dist = Math.hypot(cx - sx, cy - sy);
      if (dist < 4) return;

      const isCancel = dist >= C.MIN_DRAG_PX && !this.player.aimValid;
      const stroke = isCancel ? C.COLORS.aimCancel : 'rgba(255, 255, 255, 0.28)';

      ctx.save();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(cx, cy);
      ctx.stroke();

      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isCancel ? C.COLORS.aimCancel : C.COLORS.jellyPrimary;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    _drawDebugHitboxes(ctx) {
      ctx.save();
      ctx.lineWidth = 1.5;

      // Player hurtbox & pickup radius
      if (this.player.alive) {
        const hurt = this.player.getHurtHitbox();
        const pick = this.player.getPickupHitbox();
        ctx.strokeStyle = '#00f5d4';
        ctx.beginPath();
        ctx.arc(hurt.x, hurt.y - this.cameraY, hurt.r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 209, 102, 0.55)';
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(pick.x, pick.y - this.cameraY, pick.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Obstacles
      ctx.strokeStyle = '#ff3860';
      const obstacles = this.generator.obstacles;
      for (let i = 0; i < obstacles.length; i++) {
        const shapes = obstacles[i].getHitboxes ? obstacles[i].getHitboxes() : [];
        for (let j = 0; j < shapes.length; j++) {
          const s = shapes[j];
          if (s.type === 'rect') {
            ctx.strokeRect(s.x, s.y - this.cameraY, s.w, s.h);
          } else if (s.type === 'triangle') {
            ctx.beginPath();
            ctx.moveTo(s.ax, s.ay - this.cameraY);
            ctx.lineTo(s.bx, s.by - this.cameraY);
            ctx.lineTo(s.tx, s.ty - this.cameraY);
            ctx.closePath();
            ctx.stroke();
          }
        }
      }

      // Projectiles
      for (let i = 0; i < this.projectiles.length; i++) {
        const b = this.projectiles[i].getHitbox();
        ctx.strokeRect(b.x, b.y - this.cameraY, b.w, b.h);
      }

      // Collectibles
      ctx.strokeStyle = '#ffd166';
      const cols = this.generator.collectibles;
      for (let i = 0; i < cols.length; i++) {
        if (cols[i].collected) continue;
        const h = cols[i].getHitbox();
        ctx.beginPath();
        ctx.arc(h.x, h.y - this.cameraY, h.r, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }

    _easeOutBack(t) {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    _drawSculptedWord(ctx, text, x, y, fontSize, topFill, botFill, lipColor) {
      ctx.save();
      ctx.font = `700 ${fontSize}px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // 1. Extruded 3D bottom shadow lip
      ctx.fillStyle = lipColor;
      ctx.strokeStyle = '#06101e';
      ctx.lineWidth = 7.5;
      ctx.strokeText(text, x, y + 5.5);
      ctx.fillText(text, x, y + 5.5);

      // 2. Crisp dark ink contour
      ctx.strokeStyle = '#081526';
      ctx.lineWidth = 7;
      ctx.strokeText(text, x, y);

      // 3. Plump vertical gradient body
      const grad = ctx.createLinearGradient(x, y - fontSize * 0.45, x, y + fontSize * 0.45);
      grad.addColorStop(0, topFill);
      grad.addColorStop(1, botFill);
      ctx.fillStyle = grad;
      ctx.fillText(text, x, y);

      // 4. Subtle top inner specular sheen
      ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
      ctx.fillText(text, x, y - 1.4);

      ctx.restore();
    }

    _drawMainMenu(ctx) {
      const tr = this.t();
      ctx.save();

      // Organic parabolic trajectory motif rising from perched jelly into the open shaft
      const jellyX = this.player.positionX;
      const jellyY = this.player.positionY - this.cameraY;
      ctx.save();
      const arcSteps = 11;
      for (let i = 1; i <= arcSteps; i++) {
        const u = i / arcSteps;
        const ax = (1 - u) * (1 - u) * (jellyX + 18) + 2 * (1 - u) * u * 195 + u * u * 356;
        const ay = (1 - u) * (1 - u) * (jellyY - 12) + 2 * (1 - u) * u * 270 + u * u * 252;
        const pulse = 0.25 + 0.25 * Math.sin(this.hintTime * 3.2 - i * 0.45);
        ctx.globalAlpha = (1 - u * 0.55) * pulse;
        ctx.fillStyle = i === arcSteps ? '#ffd166' : C.COLORS.jellyPrimary;
        ctx.beginPath();
        ctx.arc(ax, ay, 4.2 * (1 - u * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Handcrafted Multi-Layer Extruded Logotype (LocoRoco / Cut the Rope inspired)
      const wave1 = Math.sin(this.hintTime * 2.3) * 3.5;
      const wave2 = Math.sin(this.hintTime * 2.3 - 0.85) * 3.5;

      // Soft atmospheric title halo
      ctx.save();
      const titleHalo = ctx.createRadialGradient(
        C.WIDTH * 0.5,
        192,
        10,
        C.WIDTH * 0.5,
        192,
        125
      );
      titleHalo.addColorStop(0, 'rgba(54, 245, 176, 0.16)');
      titleHalo.addColorStop(1, 'rgba(54, 245, 176, 0)');
      ctx.fillStyle = titleHalo;
      ctx.beginPath();
      ctx.arc(C.WIDTH * 0.5, 192, 125, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Decorative golden star-drop emblem floating above title
      this._drawGemEmblem(ctx, C.WIDTH * 0.5, 114 + wave1 * 0.6, 10.5);

      this._drawSculptedWord(
        ctx,
        'JELLY',
        C.WIDTH * 0.5,
        164 + wave1,
        52,
        '#ffffff',
        '#cfe8ff',
        '#193254'
      );

      this._drawSculptedWord(
        ctx,
        'CLIMB',
        C.WIDTH * 0.5,
        220 + wave2,
        54,
        '#8affdb',
        '#10c48b',
        '#05593f'
      );

      // Centerpiece Tactile Play Cushion (430..494)
      const playW = 224;
      const playH = 64;
      const playX = (C.WIDTH - playW) * 0.5;
      const playY = 430;
      const playPressed = this.pressedBtn === 'play';
      this.uiRects.menuPlayBtn = { x: playX, y: playY, w: playW, h: playH };

      ctx.save();
      const pulseScale = 1 + Math.sin(this.hintTime * 3.4) * 0.016;
      const pCx = playX + playW * 0.5;
      const pCy = playY + playH * 0.5;
      ctx.translate(pCx, pCy + (playPressed ? 3.5 : 0));
      if (playPressed) {
        ctx.scale(1.03, 0.94);
      } else {
        ctx.scale(pulseScale, 1 / Math.sqrt(pulseScale));
      }

      // Soft outer ripple aura
      ctx.strokeStyle = 'rgba(54, 245, 176, 0.24)';
      ctx.lineWidth = 2;
      roundRectPath(ctx, -playW * 0.5 - 5, -playH * 0.5 - 4, playW + 10, playH + 11, 34);
      ctx.stroke();

      // 3D base lip
      ctx.fillStyle = '#046c4e';
      ctx.strokeStyle = '#071729';
      ctx.lineWidth = 3;
      roundRectPath(ctx, -playW * 0.5, -playH * 0.5 + 5, playW, playH, 32);
      ctx.fill();
      ctx.stroke();

      // Glossy jelly cushion top face
      const playGrad = ctx.createLinearGradient(0, -playH * 0.5, 0, playH * 0.5);
      playGrad.addColorStop(0, '#6effd2');
      playGrad.addColorStop(0.5, C.COLORS.jellyPrimary);
      playGrad.addColorStop(1, '#0fb882');
      ctx.fillStyle = playGrad;
      roundRectPath(ctx, -playW * 0.5, -playH * 0.5, playW, playH, 32);
      ctx.fill();
      ctx.stroke();

      // Inner top specular jelly shine
      ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
      roundRectPath(ctx, -playW * 0.5 + 18, -playH * 0.5 + 5, playW - 36, 12, 6);
      ctx.fill();

      // Sculpted Play Triangle + Label
      const playText = tr.play || 'PLAY';
      ctx.font = `700 21px ${C.FONTS.DISPLAY}`;
      const textW = ctx.measureText(playText).width;
      const iconW = 14;
      const gap = 10;
      const totalW = iconW + gap + textW;
      const startX = -totalW * 0.5;

      // Play icon with dark outline & ivory fill
      ctx.fillStyle = '#06261c';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(startX, -8.5);
      ctx.lineTo(startX + iconW, 0);
      ctx.lineTo(startX, 8.5);
      ctx.closePath();
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#06261c';
      ctx.fillText(playText, startX + iconW + gap, 1);
      ctx.restore();

      // Flanking Tactile Icon Medallions (Accessories | Leaderboard | Settings)
      const leftCenterX = 99;
      const midCenterX = 225;
      const rightCenterX = 351;
      const medCenterY = 542;

      this.uiRects.menuAccBtn = { x: leftCenterX - 52, y: 506, w: 104, h: 96 };
      this.uiRects.menuLbBtn = { x: midCenterX - 52, y: 506, w: 104, h: 96 };
      this.uiRects.menuSetBtn = { x: rightCenterX - 52, y: 506, w: 104, h: 96 };

      this._drawMenuMedallion(
        ctx,
        leftCenterX,
        medCenterY,
        tr.accessories || 'ACCESSORIES',
        'crown',
        this.pressedBtn === 'accessories',
        this._hasWardrobeBadge()
      );

      this._drawMenuMedallion(
        ctx,
        midCenterX,
        medCenterY,
        tr.leaderboard || 'RANKS',
        'trophy',
        this.pressedBtn === 'leaderboard',
        false
      );

      this._drawMenuMedallion(
        ctx,
        rightCenterX,
        medCenterY,
        tr.settings || 'SETTINGS',
        'gear',
        this.pressedBtn === 'settings',
        false
      );

      ctx.restore();
    }

    _drawModeSelectModal(ctx) {
      const tr = this.t();
      const spring = this._easeOutBack(clamp(this.modalAnim, 0, 1));
      const scale = 0.86 + 0.14 * spring;

      ctx.save();
      ctx.fillStyle = `rgba(6, 10, 20, ${0.74 * clamp(this.modalAnim * 1.5, 0, 1)})`;
      ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);

      const panelW = 368;
      const panelH = 312;
      const panelX = (C.WIDTH - panelW) * 0.5;
      const panelY = (C.HEIGHT - panelH) * 0.5;
      this.uiRects.modalPanel = { x: panelX, y: panelY, w: panelW, h: panelH };

      ctx.translate(C.WIDTH * 0.5, C.HEIGHT * 0.5);
      ctx.scale(scale, scale);
      ctx.translate(-C.WIDTH * 0.5, -C.HEIGHT * 0.5);

      this._drawMonumentTablet(ctx, panelX, panelY, panelW, panelH, 26);

      // Header title
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 20px ${C.FONTS.DISPLAY}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#091324';
      ctx.strokeText(tr.selectModeTitle || 'SELECT MODE', panelX + 24, panelY + 38);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(tr.selectModeTitle || 'SELECT MODE', panelX + 24, panelY + 38);

      // Close medallion
      const closeSize = 34;
      const closeX = panelX + panelW - closeSize - 18;
      const closeY = panelY + 21;
      this.uiRects.modalCloseBtn = { x: closeX, y: closeY, w: closeSize, h: closeSize };
      this._drawCloseMedallion(ctx, closeX, closeY, closeSize);

      const cardW = panelW - 36;
      const cardH = 98;
      const cardX = panelX + 18;

      // Mode Card 1: CLASSIC CLIMB
      const c1Y = panelY + 72;
      this.uiRects.modeClassicBtn = { x: cardX, y: c1Y, w: cardW, h: cardH };
      this._drawModeCard(
        ctx,
        cardX,
        c1Y,
        cardW,
        cardH,
        'classic',
        tr.modeClassic || 'CLASSIC',
        tr.modeSubClassic || 'Endless climb at your own rhythm',
        `${tr.best || 'BEST'}: ${this.bestMeters} m`,
        '#36f5b0',
        '#056e4f'
      );

      // Mode Card 2: RISING FLOOR
      const c2Y = panelY + 186;
      this.uiRects.modeRisingBtn = { x: cardX, y: c2Y, w: cardW, h: cardH };
      this._drawModeCard(
        ctx,
        cardX,
        c2Y,
        cardW,
        cardH,
        'rising',
        tr.modeRising || 'RISING FLOOR',
        tr.modeSubRising || 'Outrun the rising magma tide!',
        `${tr.best || 'BEST'}: ${this.bestRisingMeters} m`,
        '#ff793f',
        '#8c2613'
      );

      ctx.restore();
    }

    _drawModeCard(ctx, x, y, w, h, modeType, title, desc, bestLabel, accent, lip) {
      ctx.save();
      // 3D base lip
      ctx.fillStyle = '#081120';
      roundRectPath(ctx, x, y + 4, w, h, 20);
      ctx.fill();

      // Card body
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      if (modeType === 'rising') {
        grad.addColorStop(0, '#361a24');
        grad.addColorStop(1, '#221019');
      } else {
        grad.addColorStop(0, '#1c324e');
        grad.addColorStop(1, '#122238');
      }
      ctx.fillStyle = grad;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      roundRectPath(ctx, x, y, w, h, 20);
      ctx.fill();
      ctx.stroke();

      // Left illustrated emblem well
      const iconCx = x + 46;
      const iconCy = y + h * 0.5;
      ctx.fillStyle = 'rgba(7, 13, 24, 0.65)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(iconCx, iconCy, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (modeType === 'classic') {
        // Illustrated twin cavern walls + mini jelly + star
        ctx.fillStyle = '#2d466b';
        ctx.fillRect(iconCx - 20, iconCy - 20, 6, 40);
        ctx.fillRect(iconCx + 14, iconCy - 20, 6, 40);
        this._drawMiniJellyPreview(ctx, iconCx - 3, iconCy + 4, 10, this.equippedAccessory);
        this._drawGemEmblem(ctx, iconCx + 5, iconCy - 12, 5.5);
      } else {
        // Illustrated rising magma wave + mini jelly escaping upward
        ctx.save();
        ctx.beginPath();
        ctx.arc(iconCx, iconCy, 28, 0, Math.PI * 2);
        ctx.clip();
        const lGrad = ctx.createLinearGradient(iconCx, iconCy + 2, iconCx, iconCy + 28);
        lGrad.addColorStop(0, '#ffd32a');
        lGrad.addColorStop(0.4, '#ff5e36');
        lGrad.addColorStop(1, '#b31b1b');
        ctx.fillStyle = lGrad;
        ctx.beginPath();
        ctx.moveTo(iconCx - 30, iconCy + 30);
        ctx.lineTo(iconCx - 30, iconCy + 8);
        ctx.quadraticCurveTo(iconCx - 10, iconCy + 2, iconCx, iconCy + 8);
        ctx.quadraticCurveTo(iconCx + 12, iconCy + 14, iconCx + 30, iconCy + 6);
        ctx.lineTo(iconCx + 30, iconCy + 30);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        this._drawMiniJellyPreview(ctx, iconCx, iconCy - 8, 9.5, this.equippedAccessory);
      }

      // Title, Description & Best Score
      const textX = x + 88;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 17px ${C.FONTS.DISPLAY}`;
      ctx.fillText(title, textX, y + 28);

      ctx.fillStyle = 'rgba(215, 232, 255, 0.84)';
      ctx.font = `600 11.5px ${C.FONTS.UI}`;
      ctx.fillText(desc, textX, y + 51);

      ctx.fillStyle = accent;
      ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(`★ ${bestLabel}`, textX, y + 73);

      // Right Play Cushion Button inside Card
      const pR = 20;
      const pCx = x + w - 34;
      const pCy = y + h * 0.5;
      ctx.fillStyle = lip;
      ctx.beginPath();
      ctx.arc(pCx, pCy + 2.5, pR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = accent;
      ctx.strokeStyle = '#071422';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pCx, pCy, pR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#062019';
      ctx.beginPath();
      ctx.moveTo(pCx - 4.5, pCy - 7);
      ctx.lineTo(pCx + 7.5, pCy);
      ctx.lineTo(pCx - 4.5, pCy + 7);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    _drawMenuMedallion(ctx, cx, cy, label, iconType, isPressed, showBadge) {
      const size = 60;
      const half = size * 0.5;
      const pressY = isPressed ? 3 : 0;

      ctx.save();
      ctx.translate(cx, cy);

      // 3D stone base lip
      ctx.fillStyle = '#0c1526';
      ctx.strokeStyle = '#060d18';
      ctx.lineWidth = 2.5;
      roundRectPath(ctx, -half, -half + 4.5, size, size, 20);
      ctx.fill();
      ctx.stroke();

      // Tactile slate-stone medallion face
      const bodyGrad = ctx.createLinearGradient(0, -half, 0, half);
      bodyGrad.addColorStop(0, isPressed ? '#2c4166' : '#324a73');
      bodyGrad.addColorStop(1, '#1b2942');
      ctx.fillStyle = bodyGrad;
      roundRectPath(ctx, -half, -half + pressY, size, size, 20);
      ctx.fill();
      ctx.stroke();

      // Top inner bevel highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      roundRectPath(ctx, -half + 7, -half + 4 + pressY, size - 14, 7, 3.5);
      ctx.fill();

      // Recessed inner emblem well
      ctx.fillStyle = 'rgba(10, 17, 30, 0.45)';
      ctx.beginPath();
      ctx.arc(0, pressY, 20, 0, Math.PI * 2);
      ctx.fill();

      // Custom handcrafted vector icon
      ctx.save();
      ctx.translate(0, pressY);
      if (iconType === 'crown') {
        const cGrad = ctx.createLinearGradient(-12, -10, 12, 8);
        cGrad.addColorStop(0, '#fff0b3');
        cGrad.addColorStop(0.5, '#ffd166');
        cGrad.addColorStop(1, '#f39c12');
        ctx.fillStyle = cGrad;
        ctx.strokeStyle = '#111b2e';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-11, 7);
        ctx.lineTo(-13, -6);
        ctx.lineTo(-5, -1);
        ctx.lineTo(0, -10);
        ctx.lineTo(5, -1);
        ctx.lineTo(13, -6);
        ctx.lineTo(11, 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ff4757';
        ctx.beginPath();
        ctx.arc(0, 2, 2.3, 0, Math.PI * 2);
        ctx.fill();
      } else if (iconType === 'trophy') {
        this._drawTrophyIcon(ctx, 0, 0, 1);
      } else if (iconType === 'gear') {
        ctx.fillStyle = '#d8e6ff';
        ctx.strokeStyle = '#111b2e';
        ctx.lineWidth = 1.8;
        const teeth = 8;
        const outerR = 12.5;
        const innerR = 9.2;
        ctx.beginPath();
        for (let i = 0; i < teeth * 2; i++) {
          const ang = (i * Math.PI) / teeth + Math.PI * 0.125;
          const r = i % 2 === 0 ? outerR : innerR;
          const gx = Math.cos(ang) * r;
          const gy = Math.sin(ang) * r;
          if (i === 0) ctx.moveTo(gx, gy);
          else ctx.lineTo(gx, gy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#223454';
        ctx.beginPath();
        ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      // Notification ruby-gold gem if an accessory is ready to unlock
      if (showBadge) {
        const bounce = Math.abs(Math.sin(this.hintTime * 4.5)) * 3;
        this._drawGemEmblem(ctx, half - 4, -half + 4 - bounce, 6.5);
      }

      // Sculpted micro-ribbon caption underneath medallion
      const tagY = half + 17;
      ctx.font = `700 10.5px ${C.FONTS.DISPLAY}`;
      const tagW = Math.max(76, ctx.measureText(label).width + 18);
      ctx.fillStyle = 'rgba(13, 21, 36, 0.78)';
      ctx.strokeStyle = 'rgba(180, 210, 255, 0.18)';
      ctx.lineWidth = 1;
      roundRectPath(ctx, -tagW * 0.5, tagY - 10, tagW, 20, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#e6f0ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, tagY + 0.5);

      ctx.restore();
    }

    _drawGemEmblem(ctx, x, y, r) {
      ctx.save();
      ctx.translate(x, y);
      const grad = ctx.createLinearGradient(0, -r, 0, r);
      grad.addColorStop(0, '#fff5bd');
      grad.addColorStop(0.55, '#ffd166');
      grad.addColorStop(1, '#f59e0b');
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#111b2e';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.1);
      ctx.lineTo(r * 0.88, 0);
      ctx.lineTo(0, r * 1.1);
      ctx.lineTo(-r * 0.88, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.beginPath();
      ctx.arc(-r * 0.22, -r * 0.25, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    _drawMonumentTablet(ctx, x, y, w, h, radius = 24) {
      // 3D base lip shadow
      ctx.fillStyle = '#070d18';
      roundRectPath(ctx, x, y + 7, w, h, radius);
      ctx.fill();

      // Main chiseled slate-stone body
      const bodyGrad = ctx.createLinearGradient(x, y, x, y + h);
      bodyGrad.addColorStop(0, '#223452');
      bodyGrad.addColorStop(1, '#142036');
      ctx.fillStyle = bodyGrad;
      ctx.strokeStyle = '#091220';
      ctx.lineWidth = 3;
      roundRectPath(ctx, x, y, w, h, radius);
      ctx.fill();
      ctx.stroke();

      // Inner bevel highlight rim
      ctx.strokeStyle = 'rgba(165, 205, 255, 0.22)';
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, x + 3, y + 3, w - 6, h - 6, radius - 2);
      ctx.stroke();

      // Top center specular stone sheen
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      roundRectPath(ctx, x + 22, y + 4, w - 44, 6, 3);
      ctx.fill();
    }

    _drawCloseMedallion(ctx, x, y, size) {
      const r = size * 0.5;
      const cx = x + r;
      const cy = y + r;
      ctx.save();
      ctx.fillStyle = '#0b1322';
      ctx.beginPath();
      ctx.arc(cx, cy + 2.5, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#2c4166';
      ctx.strokeStyle = '#091220';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#e6f0ff';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      const d = 5.2;
      ctx.beginPath();
      ctx.moveTo(cx - d, cy - d);
      ctx.lineTo(cx + d, cy + d);
      ctx.moveTo(cx + d, cy - d);
      ctx.lineTo(cx - d, cy + d);
      ctx.stroke();
      ctx.restore();
    }

    _drawSettingsModal(ctx) {
      const tr = this.t();
      const spring = this._easeOutBack(clamp(this.modalAnim, 0, 1));
      const scale = 0.86 + 0.14 * spring;

      ctx.save();
      ctx.fillStyle = `rgba(6, 10, 20, ${0.72 * clamp(this.modalAnim * 1.5, 0, 1)})`;
      ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);

      const panelW = 364;
      const panelH = 392;
      const panelX = (C.WIDTH - panelW) * 0.5;
      const panelY = (C.HEIGHT - panelH) * 0.5;
      this.uiRects.modalPanel = { x: panelX, y: panelY, w: panelW, h: panelH };

      ctx.translate(C.WIDTH * 0.5, C.HEIGHT * 0.5);
      ctx.scale(scale, scale);
      ctx.translate(-C.WIDTH * 0.5, -C.HEIGHT * 0.5);

      this._drawMonumentTablet(ctx, panelX, panelY, panelW, panelH, 26);

      // Header title
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 21px ${C.FONTS.DISPLAY}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#091324';
      ctx.strokeText(tr.settings || 'SETTINGS', panelX + 26, panelY + 38);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(tr.settings || 'SETTINGS', panelX + 26, panelY + 38);

      // Close medallion
      const closeSize = 34;
      const closeX = panelX + panelW - closeSize - 18;
      const closeY = panelY + 21;
      this.uiRects.modalCloseBtn = { x: closeX, y: closeY, w: closeSize, h: closeSize };
      this._drawCloseMedallion(ctx, closeX, closeY, closeSize);

      const segW = 160;
      const segH = 38;
      const segX = panelX + panelW - segW - 22;

      // Row 1: Sound FX well + custom speaker icon
      const row1Y = panelY + 98;
      ctx.fillStyle = 'rgba(10, 17, 30, 0.55)';
      roundRectPath(ctx, panelX + 18, row1Y - 25, panelW - 36, 50, 16);
      ctx.fill();

      this._drawSpeakerIcon(ctx, panelX + 42, row1Y, this.soundEnabled);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#eef5ff';
      ctx.font = `700 14.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(tr.sound || 'Sound FX', panelX + 64, row1Y + 0.5);

      this.uiRects.soundOnBtn = { x: segX, y: row1Y - segH * 0.5, w: segW * 0.5, h: segH };
      this.uiRects.soundOffBtn = { x: segX + segW * 0.5, y: row1Y - segH * 0.5, w: segW * 0.5, h: segH };

      this._drawSegmentedControl(
        ctx,
        segX,
        row1Y - segH * 0.5,
        segW,
        segH,
        tr.on || 'ON',
        tr.off || 'OFF',
        this.soundEnabled
      );

      // Row 2: Royalty-Free Music well + custom music note icon
      const row2Y = panelY + 158;
      ctx.fillStyle = 'rgba(10, 17, 30, 0.55)';
      roundRectPath(ctx, panelX + 18, row2Y - 25, panelW - 36, 50, 16);
      ctx.fill();

      this._drawMusicIcon(ctx, panelX + 42, row2Y, this.musicEnabled);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#eef5ff';
      ctx.font = `700 14.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(tr.music || 'Music', panelX + 64, row2Y + 0.5);

      this.uiRects.musicOnBtn = { x: segX, y: row2Y - segH * 0.5, w: segW * 0.5, h: segH };
      this.uiRects.musicOffBtn = { x: segX + segW * 0.5, y: row2Y - segH * 0.5, w: segW * 0.5, h: segH };

      this._drawSegmentedControl(
        ctx,
        segX,
        row2Y - segH * 0.5,
        segW,
        segH,
        tr.on || 'ON',
        tr.off || 'OFF',
        this.musicEnabled
      );

      // Row 3: Language well + custom globe icon
      const row3Y = panelY + 218;
      ctx.fillStyle = 'rgba(10, 17, 30, 0.55)';
      roundRectPath(ctx, panelX + 18, row3Y - 25, panelW - 36, 50, 16);
      ctx.fill();

      this._drawGlobeIcon(ctx, panelX + 42, row3Y);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#eef5ff';
      ctx.font = `700 14.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(tr.language || 'Language', panelX + 64, row3Y + 0.5);

      this.uiRects.langEnBtn = { x: segX, y: row3Y - segH * 0.5, w: segW * 0.5, h: segH };
      this.uiRects.langTrBtn = { x: segX + segW * 0.5, y: row3Y - segH * 0.5, w: segW * 0.5, h: segH };

      this._drawSegmentedControl(
        ctx,
        segX,
        row3Y - segH * 0.5,
        segW,
        segH,
        'English',
        'Türkçe',
        this.lang === 'en'
      );

      // Row 4: Play Store Compliance — Privacy & Terms + Data Reset buttons
      const btnY = panelY + 272;
      const btnH = 40;
      const gap = 10;
      const halfBtnW = (panelW - 36 - gap) * 0.5;
      const privX = panelX + 18;
      const rstX = privX + halfBtnW + gap;

      this.uiRects.settingsPrivacyBtn = { x: privX, y: btnY, w: halfBtnW, h: btnH };
      this.uiRects.settingsResetBtn = { x: rstX, y: btnY, w: halfBtnW, h: btnH };

      // Privacy & Terms tactile button
      ctx.fillStyle = '#0b1322';
      roundRectPath(ctx, privX, btnY + 3, halfBtnW, btnH, 16);
      ctx.fill();
      ctx.fillStyle = '#293e62';
      ctx.strokeStyle = 'rgba(165, 205, 255, 0.25)';
      ctx.lineWidth = 1.3;
      roundRectPath(ctx, privX, btnY, halfBtnW, btnH, 16);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#e6f0ff';
      ctx.font = `700 12px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText(tr.privacyBtn || 'Privacy & Terms', privX + halfBtnW * 0.5, btnY + btnH * 0.5 + 0.5);

      // Reset Data tactile button
      ctx.fillStyle = '#0b1322';
      roundRectPath(ctx, rstX, btnY + 3, halfBtnW, btnH, 16);
      ctx.fill();
      ctx.fillStyle = this.confirmResetPending ? '#7a1c28' : '#26293e';
      ctx.strokeStyle = this.confirmResetPending
        ? '#ff5e57'
        : 'rgba(255, 130, 140, 0.24)';
      ctx.lineWidth = 1.3;
      roundRectPath(ctx, rstX, btnY, halfBtnW, btnH, 16);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = this.confirmResetPending ? '#ffe3e3' : '#ffb8c0';
      ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
      const resetLabel = this.confirmResetPending
        ? tr.confirmReset || 'Tap Again to Confirm'
        : tr.resetDataBtn || 'Reset Data';
      ctx.fillText(resetLabel, rstX + halfBtnW * 0.5, btnY + btnH * 0.5 + 0.5);

      if (this.resetStatusMsg) {
        ctx.fillStyle = C.COLORS.jellyPrimary;
        ctx.font = `700 12px ${C.FONTS.DISPLAY}`;
        ctx.fillText(this.resetStatusMsg, C.WIDTH * 0.5, panelY + 344);
      } else {
        ctx.fillStyle = 'rgba(180, 202, 235, 0.45)';
        ctx.font = `600 11px ${C.FONTS.DISPLAY}`;
        ctx.fillText('Jelly Climb v1.1 • Play Store Ready', C.WIDTH * 0.5, panelY + 346);
      }

      ctx.restore();
    }

    _drawPrivacyModal(ctx) {
      const tr = this.t();
      const spring = this._easeOutBack(clamp(this.modalAnim, 0, 1));
      const scale = 0.86 + 0.14 * spring;

      ctx.save();
      ctx.fillStyle = `rgba(6, 10, 20, ${0.76 * clamp(this.modalAnim * 1.5, 0, 1)})`;
      ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);

      const panelW = 392;
      const panelH = 476;
      const panelX = (C.WIDTH - panelW) * 0.5;
      const panelY = (C.HEIGHT - panelH) * 0.5;
      this.uiRects.modalPanel = { x: panelX, y: panelY, w: panelW, h: panelH };

      ctx.translate(C.WIDTH * 0.5, C.HEIGHT * 0.5);
      ctx.scale(scale, scale);
      ctx.translate(-C.WIDTH * 0.5, -C.HEIGHT * 0.5);

      this._drawMonumentTablet(ctx, panelX, panelY, panelW, panelH, 26);

      // Header
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 19px ${C.FONTS.DISPLAY}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#091324';
      ctx.strokeText(tr.privacyTitle || 'PRIVACY & TERMS', panelX + 24, panelY + 36);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(tr.privacyTitle || 'PRIVACY & TERMS', panelX + 24, panelY + 36);

      // Close medallion
      const closeSize = 34;
      const closeX = panelX + panelW - closeSize - 18;
      const closeY = panelY + 19;
      this.uiRects.modalCloseBtn = { x: closeX, y: closeY, w: closeSize, h: closeSize };
      this._drawCloseMedallion(ctx, closeX, closeY, closeSize);

      // Recessed reading well
      const wellX = panelX + 20;
      const wellY = panelY + 66;
      const wellW = panelW - 40;
      const wellH = 326;
      ctx.fillStyle = 'rgba(9, 15, 28, 0.68)';
      ctx.strokeStyle = 'rgba(165, 205, 255, 0.14)';
      ctx.lineWidth = 1.2;
      roundRectPath(ctx, wellX, wellY, wellW, wellH, 18);
      ctx.fill();
      ctx.stroke();

      // Word-wrapped policy lines
      const lines = tr.policyLines || [];
      ctx.fillStyle = '#dce8ff';
      ctx.font = `600 12.5px ${C.FONTS.UI}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      let cursorY = wellY + 18;
      const maxTextW = wellW - 32;
      for (let i = 0; i < lines.length; i++) {
        const words = lines[i].split(' ');
        let currentLine = '';
        for (let w = 0; w < words.length; w++) {
          const testLine = currentLine ? `${currentLine} ${words[w]}` : words[w];
          if (ctx.measureText(testLine).width > maxTextW && currentLine) {
            ctx.fillText(currentLine, wellX + 16, cursorY);
            cursorY += 18;
            currentLine = '   ' + words[w];
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) {
          ctx.fillText(currentLine, wellX + 16, cursorY);
          cursorY += 26;
        }
      }

      // Bottom buttons: Back to Settings + Open Full Policy HTML
      const btnY = panelY + panelH - 64;
      const btnH = 40;
      const gap = 12;
      const halfW = (wellW - gap) * 0.5;
      const backX = wellX;
      const openX = wellX + halfW + gap;

      this.uiRects.privacyBackBtn = { x: backX, y: btnY, w: halfW, h: btnH };
      this.uiRects.privacyOpenPageBtn = { x: openX, y: btnY, w: halfW, h: btnH };

      ctx.fillStyle = '#283c5e';
      roundRectPath(ctx, backX, btnY, halfW, btnH, 16);
      ctx.fill();
      ctx.fillStyle = '#e6f0ff';
      ctx.font = `700 12px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tr.backToSettings || '← Back', backX + halfW * 0.5, btnY + btnH * 0.5 + 0.5);

      ctx.fillStyle = C.COLORS.jellyPrimary;
      roundRectPath(ctx, openX, btnY, halfW, btnH, 16);
      ctx.fill();
      ctx.fillStyle = '#06241b';
      ctx.fillText(tr.openFullPolicy || 'Full Policy ↗', openX + halfW * 0.5, btnY + btnH * 0.5 + 0.5);

      ctx.restore();
    }

    _drawSpeakerIcon(ctx, x, y, isOn) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = isOn ? C.COLORS.jellyPrimary : '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-3, -4);
      ctx.lineTo(2, -9);
      ctx.lineTo(2, 9);
      ctx.lineTo(-3, 4);
      ctx.lineTo(-8, 4);
      ctx.closePath();
      ctx.fill();

      if (isOn) {
        ctx.strokeStyle = C.COLORS.jellyPrimary;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(3, 0, 4.5, -0.7, 0.7);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(3, 0, 8, -0.75, 0.75);
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#ff5e57';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(5, -4);
        ctx.lineTo(11, 4);
        ctx.moveTo(11, -4);
        ctx.lineTo(5, 4);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawMusicIcon(ctx, x, y, isOn) {
      ctx.save();
      ctx.translate(x, y);
      const col = isOn ? '#ffd166' : '#94a3b8';
      ctx.fillStyle = col;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Beamed eighth notes
      ctx.beginPath();
      ctx.arc(-4.5, 4.5, 3.2, 0, Math.PI * 2);
      ctx.arc(4.5, 3.0, 3.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-1.8, 4.5);
      ctx.lineTo(-1.8, -6.5);
      ctx.lineTo(7.2, -8.0);
      ctx.lineTo(7.2, 3.0);
      ctx.stroke();

      if (!isOn) {
        ctx.strokeStyle = '#ff5e57';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-7, -7);
        ctx.lineTo(8, 8);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawGlobeIcon(ctx, x, y) {
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = '#74b9ff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 0, 4.2, 8.5, 0, 0, Math.PI * 2);
      ctx.moveTo(-8, 0);
      ctx.lineTo(8, 0);
      ctx.stroke();
      ctx.restore();
    }

    _drawSegmentedControl(ctx, x, y, w, h, leftLabel, rightLabel, isLeftActive) {
      ctx.save();
      // Recessed well
      ctx.fillStyle = '#091220';
      ctx.strokeStyle = 'rgba(170, 205, 255, 0.14)';
      ctx.lineWidth = 1.2;
      roundRectPath(ctx, x, y, w, h, 20);
      ctx.fill();
      ctx.stroke();

      const halfW = w * 0.5;
      const activeX = isLeftActive ? x + 3 : x + halfW + 1;

      // 3D lip on active rocker
      ctx.fillStyle = '#057a58';
      roundRectPath(ctx, activeX, y + 5, halfW - 4, h - 8, 16);
      ctx.fill();

      // Active rocker top face
      ctx.fillStyle = C.COLORS.jellyPrimary;
      roundRectPath(ctx, activeX, y + 3, halfW - 4, h - 8, 16);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 12.5px ${C.FONTS.DISPLAY}`;

      ctx.fillStyle = isLeftActive ? '#06241b' : 'rgba(205, 222, 248, 0.68)';
      ctx.fillText(leftLabel, x + halfW * 0.5, y + h * 0.5);

      ctx.fillStyle = !isLeftActive ? '#06241b' : 'rgba(205, 222, 248, 0.68)';
      ctx.fillText(rightLabel, x + halfW * 1.5, y + h * 0.5);
      ctx.restore();
    }

    _drawHUD(ctx) {
      const tr = this.t();
      ctx.save();

      // Top-left tactile pause/menu medallion
      const mBtn = this.uiRects.topMenuBtn;
      ctx.fillStyle = '#09111f';
      roundRectPath(ctx, mBtn.x, mBtn.y + 3, mBtn.w, mBtn.h, 14);
      ctx.fill();

      ctx.fillStyle = 'rgba(26, 40, 64, 0.9)';
      ctx.strokeStyle = 'rgba(175, 210, 255, 0.25)';
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, mBtn.x, mBtn.y, mBtn.w, mBtn.h, 14);
      ctx.fill();
      ctx.stroke();

      // Two sculpted pause/menu bars
      ctx.fillStyle = '#e6f0ff';
      roundRectPath(ctx, mBtn.x + 11, mBtn.y + 14, 18, 3.2, 1.6);
      ctx.fill();
      roundRectPath(ctx, mBtn.x + 11, mBtn.y + 22.5, 13, 3.2, 1.6);
      ctx.fill();

      // Top-center plump extruded altitude counter with milestone bounce
      const mPulse = 1 + Math.sin(this.meterMilestonePulse * Math.PI) * 0.22;
      ctx.save();
      ctx.translate(C.WIDTH * 0.5, 30);
      ctx.scale(mPulse, mPulse);
      this._drawSculptedWord(
        ctx,
        `${this.currentMeters} m`,
        0,
        0,
        30,
        '#ffffff',
        '#d8ecff',
        '#0c1a30'
      );
      ctx.restore();

      const activeBest = this.getActiveBestMeters();
      if (activeBest > 0) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = this.isNewRecord
          ? C.COLORS.jellyPrimary
          : 'rgba(205, 225, 255, 0.68)';
        ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
        ctx.fillText(`${tr.best || 'BEST'}: ${activeBest} m`, C.WIDTH * 0.5, 50);
      }

      // Tempo ribbon badge when active (x2+), or next Boss altitude tracker when idle
      if (this.tempoTier >= 2 && this.state === 'playing') {
        const isHigh = this.tempoTier >= C.TEMPO.DOUBLE_DROP_TIER;
        const pillW = 110;
        const pillH = 24;
        const pillX = (C.WIDTH - pillW) * 0.5;
        const pillY = activeBest > 0 ? 68 : 54;

        ctx.fillStyle = 'rgba(9, 16, 30, 0.72)';
        ctx.strokeStyle = isHigh ? C.COLORS.tempoGold : C.COLORS.tempoCyan;
        ctx.lineWidth = 1.5;
        roundRectPath(ctx, pillX, pillY, pillW, pillH, 12);
        ctx.fill();
        ctx.stroke();

        if (this.player.isAttached() && this.tempoTimer > 0) {
          const ratio = clamp(this.tempoTimer / C.TEMPO.WINDOW_SEC, 0, 1);
          ctx.fillStyle = isHigh ? 'rgba(255, 209, 102, 0.28)' : 'rgba(54, 245, 176, 0.24)';
          roundRectPath(ctx, pillX + 2, pillY + 2, (pillW - 4) * ratio, pillH - 4, 10);
          ctx.fill();
        }

        ctx.fillStyle = isHigh ? '#ffeaa7' : C.COLORS.jellyPrimary;
        ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tempoText =
          this.tempoTier === C.TEMPO.MAX_TIER
            ? `⚡ x${this.tempoTier} ${tr.max || 'MAX'}`
            : `⚡ x${this.tempoTier} ${tr.tempo || 'TEMPO'}`;
        ctx.fillText(tempoText, C.WIDTH * 0.5, pillY + pillH * 0.5 + 0.5);
      } else if (
        this.state === 'playing' &&
        this.gameMode !== 'tutorial' &&
        !this.activeBoss &&
        JellyGame.Bosses
      ) {
        const nextMilestone = JellyGame.Bosses.getMilestoneMeters(this.nextBossIndex);
        const nearBoss = nextMilestone - this.currentMeters <= 25;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = nearBoss ? '#ffd166' : 'rgba(255, 209, 102, 0.72)';
        ctx.font = `700 10.5px ${C.FONTS.DISPLAY}`;
        ctx.fillText(
          `👑 ${tr.bossNextAt || 'BOSS AT'} ${nextMilestone} m`,
          C.WIDTH * 0.5,
          activeBest > 0 ? 67 : 52
        );
      }

      // Top-right tactile collectible & avatar capsule (bounces on pickup!)
      const btn = this.uiRects.topShopBtn;
      const gScale = 1 + Math.sin(this.hudGemPulse * Math.PI) * 0.16;
      ctx.save();
      const bCx = btn.x + btn.w * 0.5;
      const bCy = btn.y + btn.h * 0.5;
      ctx.translate(bCx, bCy);
      ctx.scale(gScale, gScale);
      ctx.translate(-bCx, -bCy);

      ctx.fillStyle = '#09111f';
      roundRectPath(ctx, btn.x, btn.y + 3, btn.w, btn.h, 20);
      ctx.fill();

      ctx.fillStyle = 'rgba(26, 40, 64, 0.92)';
      ctx.strokeStyle = this._hasWardrobeBadge()
        ? C.COLORS.collectOuter
        : 'rgba(175, 210, 255, 0.26)';
      ctx.lineWidth = 1.6;
      roundRectPath(ctx, btn.x, btn.y, btn.w, btn.h, 20);
      ctx.fill();
      ctx.stroke();

      this._drawGemEmblem(ctx, btn.x + 19, btn.y + btn.h * 0.5, 7);

      ctx.fillStyle = '#fff5d6';
      ctx.font = `700 14px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${this.gems}`, btn.x + 31, btn.y + btn.h * 0.5 + 0.5);

      this._drawMiniJellyPreview(
        ctx,
        btn.x + btn.w - 19,
        btn.y + btn.h * 0.5 + 1,
        10,
        this.equippedAccessory
      );

      if (this._hasWardrobeBadge()) {
        ctx.fillStyle = '#ff4757';
        ctx.strokeStyle = '#09111f';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(btn.x + btn.w - 5, btn.y + 5, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      ctx.restore();
    }

    _drawThemeBanner(ctx) {
      const t = this.themeBannerTimer;
      const alpha = t < 0.4 ? t / 0.4 : t > 2.0 ? (2.4 - t) / 0.4 : 1;
      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);

      const labelText = `✦  ${this.themeBannerText}  ✦`;
      ctx.font = `700 13px ${C.FONTS.DISPLAY}`;
      const pillW = clamp(ctx.measureText(labelText).width + 38, 212, C.WIDTH - 36);
      const pillH = 34;
      const pillX = (C.WIDTH - pillW) * 0.5;
      const pillY = this.activeBoss && !this.activeBoss.defeated ? 148 : 104;

      ctx.fillStyle = 'rgba(12, 19, 34, 0.85)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, pillX, pillY, pillW, pillH, 17);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, C.WIDTH * 0.5, pillY + pillH * 0.5 + 0.5);

      ctx.restore();
    }

    _drawBossWarningBanner(ctx) {
      const Bosses = JellyGame.Bosses;
      if (!Bosses) return;
      const tr = this.t();
      const def = Bosses.getBossDefForIndex(this.nextBossIndex);
      const bossName = this._getBossDisplayName(def, tr);
      const pulse = 0.5 + 0.5 * Math.sin(this.hintTime * 11);
      const alpha = clamp(Math.min(1, this.bossWarningTimer * 2), 0, 1);

      ctx.save();
      ctx.globalAlpha = alpha;

      const w = 282;
      const h = 44;
      const x = (C.WIDTH - w) * 0.5;
      const y = 98;

      ctx.fillStyle = 'rgba(34, 12, 18, 0.9)';
      ctx.strokeStyle = pulse > 0.5 ? '#ff5e57' : '#ffd166';
      ctx.lineWidth = 2;
      roundRectPath(ctx, x, y, w, h, 14);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ff7b72';
      ctx.font = `700 10.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(`⚠ ${tr.bossIncoming || 'BOSS APPROACHING!'}`, C.WIDTH * 0.5, y + 14);

      ctx.fillStyle = '#fff5d6';
      ctx.font = `700 12.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(`${bossName}  •  ${def.milestoneMeters} m`, C.WIDTH * 0.5, y + 31);

      ctx.restore();
    }

    _drawBossHUD(ctx) {
      const boss = this.activeBoss;
      if (!boss || boss.defeated) return;
      const tr = this.t();
      const arch = boss.archetype;
      const enraged = boss.phase >= 2;
      const accent = enraged ? arch.enrageColor : arch.primaryColor;
      const bossTitle = this._getBossDisplayName(boss.def, tr);

      ctx.save();
      const cardW = 296;
      const cardH = 44;
      const cardX = (C.WIDTH - cardW) * 0.5;
      const cardY = 98;

      ctx.fillStyle = 'rgba(10, 17, 32, 0.88)';
      ctx.strokeStyle = boss.phaseBannerTimer > 0 ? '#ffd166' : accent;
      ctx.lineWidth = boss.phaseBannerTimer > 0 ? 2.4 : 1.7;
      roundRectPath(ctx, cardX, cardY, cardW, cardH, 14);
      ctx.fill();
      ctx.stroke();

      // Boss Name & Phase indicator row
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(`👑 ${bossTitle}`, cardX + 12, cardY + 14);

      ctx.textAlign = 'right';
      const phaseWord = tr.bossPhase || 'PHASE';
      const statusText = enraged
        ? `⚡ ${phaseWord} ${boss.phase}/${boss.maxPhases} • ${boss.hp}/${boss.maxHp}`
        : `${phaseWord} ${boss.phase}/${boss.maxPhases} • ${boss.hp}/${boss.maxHp}`;
      ctx.fillStyle = enraged ? '#ffd166' : accent;
      ctx.font = `700 10.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(statusText, cardX + cardW - 12, cardY + 14);

      // Segmented HP Track
      const barX = cardX + 12;
      const barY = cardY + 26;
      const barW = cardW - 24;
      const barH = 10;

      ctx.fillStyle = '#070d18';
      roundRectPath(ctx, barX, barY, barW, barH, 5);
      ctx.fill();

      const maxHp = Math.max(1, boss.maxHp);
      if (maxHp <= 22) {
        const gap = maxHp > 14 ? 1.5 : 2.2;
        const segW = (barW - 4 - gap * (maxHp - 1)) / maxHp;
        for (let i = 0; i < maxHp; i++) {
          const sx = barX + 2 + i * (segW + gap);
          const sy = barY + 2;
          const sh = barH - 4;
          if (i < boss.hp) {
            ctx.fillStyle = boss.hurtFlashTimer > 0 ? '#ffffff' : accent;
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
          }
          roundRectPath(ctx, sx, sy, segW, sh, 2);
          ctx.fill();
        }
      } else {
        const ratio = clamp(boss.hp / maxHp, 0, 1);
        ctx.fillStyle = boss.hurtFlashTimer > 0 ? '#ffffff' : accent;
        if (ratio > 0) {
          roundRectPath(ctx, barX + 2, barY + 2, (barW - 4) * ratio, barH - 4, 3);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    _drawRewardToast(ctx) {
      const toast = this.rewardToast;
      if (!toast || !toast.accessory) return;
      const tr = this.t();
      const t = toast.timer;
      const maxT = toast.maxTimer || 3.1;
      const inOut = t < 0.35 ? t / 0.35 : t > maxT - 0.3 ? (maxT - t) / 0.3 : 1;
      const alpha = clamp(inOut, 0, 1);

      ctx.save();
      ctx.globalAlpha = alpha;
      const slideY = (1 - this._easeOutBack(clamp(inOut, 0, 1))) * -22;

      const w = 278;
      const h = 52;
      const x = (C.WIDTH - w) * 0.5;
      const baseY = this.activeBoss && !this.activeBoss.defeated ? 148 : 96;
      const y = baseY + slideY;

      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, 'rgba(42, 31, 14, 0.94)');
      grad.addColorStop(1, 'rgba(18, 28, 48, 0.95)');
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      roundRectPath(ctx, x, y, w, h, 26);
      ctx.fill();
      ctx.stroke();

      this._drawMiniJellyPreview(ctx, x + 30, y + h * 0.5 + 1, 14, toast.accessory.id);

      const accName =
        (tr.accNames && tr.accNames[toast.accessory.id]) || toast.accessory.name;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd166';
      ctx.font = `700 10.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(`🏆 ${tr.rewardUnlockedToast || 'UNLOCKED'}!`, x + 54, y + 17);

      ctx.fillStyle = '#ffffff';
      ctx.font = `700 13.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(accName, x + 54, y + 35);

      if (toast.bonusDrops > 0) {
        ctx.fillStyle = 'rgba(255, 209, 102, 0.2)';
        roundRectPath(ctx, x + w - 66, y + 14, 54, 24, 12);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffeaa7';
        ctx.font = `700 12px ${C.FONTS.DISPLAY}`;
        ctx.fillText(`+${toast.bonusDrops}✦`, x + w - 39, y + 26.5);
      }

      ctx.restore();
    }

    _drawDeathOverlay(ctx) {
      const tr = this.t();
      const rawT = clamp((this.deathTimer - 0.35) / 0.26, 0, 1);
      const spring = this._easeOutBack(rawT);
      const scale = 0.88 + 0.12 * spring;

      ctx.save();
      ctx.globalAlpha = rawT;

      ctx.fillStyle = 'rgba(6, 10, 20, 0.68)';
      ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);

      const cardW = 316;
      const cardH = 304;
      const cardX = (C.WIDTH - cardW) * 0.5;
      const cardY = C.HEIGHT * 0.29;

      ctx.translate(C.WIDTH * 0.5, cardY + cardH * 0.5);
      ctx.scale(scale, scale);
      ctx.translate(-C.WIDTH * 0.5, -(cardY + cardH * 0.5));

      this._drawMonumentTablet(ctx, cardX, cardY, cardW, cardH, 26);

      // Recessed dark score well at top of tablet
      ctx.fillStyle = 'rgba(9, 15, 28, 0.62)';
      roundRectPath(ctx, cardX + 20, cardY + 20, cardW - 40, 106, 18);
      ctx.fill();

      this._drawSculptedWord(
        ctx,
        `${this.currentMeters} m`,
        C.WIDTH * 0.5,
        cardY + 52,
        38,
        '#ffffff',
        '#cfe8ff',
        '#091526'
      );

      const activeBest = this.getActiveBestMeters();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.isNewRecord ? C.COLORS.jellyPrimary : 'rgba(195, 218, 250, 0.78)';
      ctx.font = `700 13px ${C.FONTS.DISPLAY}`;
      const subText = this.isNewRecord
        ? `★ ${tr.newBest || 'NEW BEST!'} (${activeBest} m)`
        : `${tr.best || 'BEST'}: ${activeBest} m`;
      ctx.fillText(subText, C.WIDTH * 0.5, cardY + 86);

      // Run stats badge inside score well
      ctx.fillStyle = '#ffd166';
      ctx.font = `700 12.5px ${C.FONTS.DISPLAY}`;
      const statsText =
        this.runBossesDefeated > 0
          ? `+${this.runGemsEarned} ✦  •  ⚡ x${this.runMaxTempo}  •  👑 ${this.runBossesDefeated}`
          : `+${this.runGemsEarned} ✦   •   ⚡ ${tr.tempo || 'TEMPO'} x${this.runMaxTempo}`;
      ctx.fillText(statsText, C.WIDTH * 0.5, cardY + 109);

      // Primary Tactile PLAY AGAIN Cushion Button
      const btnW = 256;
      const btnH = 50;
      const btnX = (C.WIDTH - btnW) * 0.5;
      const retryY = cardY + 144;
      this.uiRects.retryBtn = { x: btnX, y: retryY, w: btnW, h: btnH };

      ctx.fillStyle = '#046c4e';
      roundRectPath(ctx, btnX, retryY + 4, btnW, btnH, 25);
      ctx.fill();

      const retryGrad = ctx.createLinearGradient(0, retryY, 0, retryY + btnH);
      retryGrad.addColorStop(0, '#6effd2');
      retryGrad.addColorStop(1, '#12c48b');
      ctx.fillStyle = retryGrad;
      roundRectPath(ctx, btnX, retryY, btnW, btnH, 25);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      roundRectPath(ctx, btnX + 18, retryY + 4, btnW - 36, 9, 4.5);
      ctx.fill();

      ctx.fillStyle = '#06261c';
      ctx.font = `700 15.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(`▶  ${tr.playAgain || 'PLAY AGAIN'}`, C.WIDTH * 0.5, retryY + btnH * 0.5 + 1);

      // Secondary Tactile Action Row: Accessories (left) & Leaderboard (right)
      const shopY = cardY + 206;
      const shopH = 40;
      const halfGap = 10;
      const halfW = (btnW - halfGap) * 0.5;
      const shopX = btnX;
      const lbX = btnX + halfW + halfGap;

      this.uiRects.deathShopBtn = { x: shopX, y: shopY, w: halfW, h: shopH };
      this.uiRects.deathLbBtn = { x: lbX, y: shopY, w: halfW, h: shopH };

      // Left: Accessories
      ctx.fillStyle = '#0b1322';
      roundRectPath(ctx, shopX, shopY + 3, halfW, shopH, 20);
      ctx.fill();

      ctx.fillStyle = '#283c5e';
      const gearAlert = this._hasWardrobeBadge() || this.runUnlockedGear.length > 0;
      ctx.strokeStyle = gearAlert
        ? C.COLORS.collectOuter
        : 'rgba(180, 210, 255, 0.25)';
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, shopX, shopY, halfW, shopH, 20);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = gearAlert ? '#ffeaa7' : '#e6f0ff';
      ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
      const shopLabel =
        this.runUnlockedGear.length > 0
          ? `🏆 ${tr.rewardsTab || 'MILESTONES'}!`
          : `✦ ${this.gems}  ${tr.accessories || 'SHOP'}`;
      ctx.fillText(
        shopLabel,
        shopX + halfW * 0.5,
        shopY + shopH * 0.5 + 0.5
      );

      // Right: Mode Leaderboard
      ctx.fillStyle = '#0b1322';
      roundRectPath(ctx, lbX, shopY + 3, halfW, shopH, 20);
      ctx.fill();

      ctx.fillStyle = '#283c5e';
      ctx.strokeStyle =
        this.gameMode === 'rising' ? 'rgba(255, 121, 63, 0.55)' : 'rgba(54, 245, 176, 0.45)';
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, lbX, shopY, halfW, shopH, 20);
      ctx.fill();
      ctx.stroke();

      this._drawTrophyIcon(ctx, lbX + 20, shopY + shopH * 0.5, 0.62);
      ctx.fillStyle = '#ffeaa7';
      ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(tr.leaderboard || 'RANKS', lbX + halfW * 0.5 + 8, shopY + shopH * 0.5 + 0.5);

      // Quiet Tactile Menu Pill
      const menuY = cardY + 256;
      const menuH = 34;
      this.uiRects.deathMenuBtn = { x: btnX, y: menuY, w: btnW, h: menuH };

      ctx.fillStyle = 'rgba(10, 17, 30, 0.55)';
      roundRectPath(ctx, btnX, menuY, btnW, menuH, 17);
      ctx.fill();

      ctx.fillStyle = 'rgba(205, 222, 248, 0.78)';
      ctx.font = `700 12px ${C.FONTS.DISPLAY}`;
      ctx.fillText(tr.menu || 'MENU', C.WIDTH * 0.5, menuY + menuH * 0.5 + 0.5);

      ctx.restore();
    }

    _drawAccessoryDrawer(ctx) {
      const tr = this.t();
      const accMod = JellyGame.Accessories;
      const allList = accMod ? accMod.LIST : [];
      const activeTab = this.wardrobeTab || 'head';
      const isRewardsTab = activeTab === 'rewards';
      const stats = this._getProgressionStats();

      const tabItems = isRewardsTab
        ? (accMod && accMod.MILESTONE_LIST) || []
        : (accMod && accMod.BY_SLOT && accMod.BY_SLOT[activeTab]) || allList;

      const spring = this._easeOutBack(clamp(this.modalAnim, 0, 1));
      const scale = 0.86 + 0.14 * spring;

      ctx.save();
      ctx.fillStyle = `rgba(6, 10, 20, ${0.74 * clamp(this.modalAnim * 1.5, 0, 1)})`;
      ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);

      const panelW = 396;
      const panelH = 642;
      const panelX = (C.WIDTH - panelW) * 0.5;
      const panelY = (C.HEIGHT - panelH) * 0.5;
      this.uiRects.modalPanel = { x: panelX, y: panelY, w: panelW, h: panelH };

      ctx.translate(C.WIDTH * 0.5, C.HEIGHT * 0.5);
      ctx.scale(scale, scale);
      ctx.translate(-C.WIDTH * 0.5, -C.HEIGHT * 0.5);

      this._drawMonumentTablet(ctx, panelX, panelY, panelW, panelH, 26);

      // Header title + owned gear progress pill (0/18 Gear)
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 20px ${C.FONTS.DISPLAY}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#091324';
      ctx.strokeText(tr.accessories || 'ACCESSORIES', panelX + 24, panelY + 32);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(tr.accessories || 'ACCESSORIES', panelX + 24, panelY + 32);

      const gearCountText = `${this._getOwnedGearCount()}/${allList.length} ${tr.gearUnit || 'Gear'}`;
      const gearPillW = 92;
      const closeSize = 34;
      const closeX = panelX + panelW - closeSize - 18;
      const closeY = panelY + 16;
      const gearPillX = closeX - gearPillW - 10;
      const gearPillY = panelY + 20;
      ctx.fillStyle = 'rgba(54, 245, 176, 0.14)';
      ctx.strokeStyle = 'rgba(54, 245, 176, 0.36)';
      ctx.lineWidth = 1.2;
      roundRectPath(ctx, gearPillX, gearPillY, gearPillW, 24, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#8affdb';
      ctx.font = `700 11px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText(gearCountText, gearPillX + gearPillW * 0.5, gearPillY + 12.5);

      this.uiRects.modalCloseBtn = { x: closeX, y: closeY, w: closeSize, h: closeSize };
      this._drawCloseMedallion(ctx, closeX, closeY, closeSize);

      // Interactive Hero Stage Alcove (live combined Head + Face + Back Jelly + Color Swatches)
      const stageX = panelX + 20;
      const stageY = panelY + 54;
      const stageW = panelW - 40;
      const stageH = 92;

      ctx.fillStyle = 'rgba(9, 15, 28, 0.68)';
      ctx.strokeStyle = 'rgba(165, 205, 255, 0.14)';
      ctx.lineWidth = 1.2;
      roundRectPath(ctx, stageX, stageY, stageW, stageH, 18);
      ctx.fill();
      ctx.stroke();

      const pedX = stageX + 52;
      const pedY = stageY + 69;
      const activePal = this.player.getColorPalette();
      const spotGrad = ctx.createRadialGradient(pedX, pedY - 18, 4, pedX, pedY - 18, 44);
      spotGrad.addColorStop(0, activePal.glow);
      spotGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = spotGrad;
      ctx.beginPath();
      ctx.arc(pedX, pedY - 18, 44, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#283c5e';
      ctx.strokeStyle = '#091324';
      ctx.lineWidth = 1.8;
      roundRectPath(ctx, pedX - 28, pedY, 56, 10, 5);
      ctx.fill();
      ctx.stroke();

      const bWave = Math.sin(this.wardrobePreviewBounce * Math.PI);
      const jumpY = -bWave * 11;
      const sqX = 1 - bWave * 0.14 + Math.sin(this.hintTime * 3.6) * 0.03;
      const sqY = 1 / sqX;

      ctx.save();
      ctx.translate(pedX, pedY - 21 + jumpY);
      ctx.scale(sqX, sqY);
      this._drawMiniJellyPreview(ctx, 0, 0, 21, this.equippedAccessory);
      ctx.restore();

      // Active slot pills showing equipped combo (HAT | FACE | BACK)
      const slotPillMeta = [
        ['head', (tr.slotNames && tr.slotNames.head) || 'HAT'],
        ['face', (tr.slotNames && tr.slotNames.face) || 'FACE'],
        ['back', (tr.slotNames && tr.slotNames.back) || 'BACK']
      ];
      for (let i = 0; i < slotPillMeta.length; i++) {
        const [sKey, sLbl] = slotPillMeta[i];
        const isActiveSlot = this.equippedSlots && this.equippedSlots[sKey] !== 'none';
        const px = stageX + 102 + i * 44;
        const py = stageY + 11;
        ctx.fillStyle = isActiveSlot ? 'rgba(54, 245, 176, 0.2)' : 'rgba(255, 255, 255, 0.06)';
        ctx.strokeStyle = isActiveSlot ? C.COLORS.jellyPrimary : 'rgba(165, 205, 255, 0.18)';
        ctx.lineWidth = 1;
        roundRectPath(ctx, px, py, 40, 20, 10);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isActiveSlot ? '#8affdb' : 'rgba(180, 200, 232, 0.55)';
        ctx.font = `700 9px ${C.FONTS.DISPLAY}`;
        ctx.fillText(sLbl, px + 20, py + 10.5);
      }

      // Golden Drops counter pouch on top-right of Hero Stage
      const pouchW = 104;
      const pouchX = stageX + stageW - pouchW - 10;
      const pouchY = stageY + 9;
      ctx.fillStyle = 'rgba(255, 209, 102, 0.16)';
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.4)';
      ctx.lineWidth = 1.2;
      roundRectPath(ctx, pouchX, pouchY, pouchW, 24, 12);
      ctx.fill();
      ctx.stroke();

      this._drawGemEmblem(ctx, pouchX + 15, pouchY + 12, 5.5);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffeaa7';
      ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(
        `${this.gems} ${tr.dropsUnit || 'Drops'}`,
        pouchX + 26,
        pouchY + 12.5,
        pouchW - 34
      );

      // 5 Bioluminescent Jelly Color Swatches
      this.uiRects.colorSwatches = [];
      const colors = C.JELLY_COLORS || [];
      const swStartX = stageX + 114;
      const swY = stageY + 61;
      const swSpacing = 48;

      for (let i = 0; i < colors.length; i++) {
        const col = colors[i];
        const sx = swStartX + i * swSpacing;
        const unlocked = this.unlockedColors.has(col.id);
        const equipped = this.equippedColor === col.id;
        this.uiRects.colorSwatches.push({
          color: col,
          rect: { x: sx - 18, y: swY - 18, w: 36, h: 38 }
        });

        ctx.save();
        ctx.translate(sx, swY);
        if (equipped) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(0, 0, 14.5, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = col.primary;
        ctx.strokeStyle = col.rim;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.beginPath();
        ctx.arc(-3.5, -3.5, 3, 0, Math.PI * 2);
        ctx.fill();

        if (!unlocked) {
          ctx.fillStyle = this.gems >= col.cost ? '#ffd166' : 'rgba(195, 212, 240, 0.65)';
          ctx.font = `700 9.5px ${C.FONTS.DISPLAY}`;
          ctx.textAlign = 'center';
          ctx.fillText(`✦${col.cost}`, 0, 19);
        }
        ctx.restore();
      }

      // 4-Category Filter Tabs: HATS (head) | GLASSES (face) | BACK (back) | GOALS (rewards)
      const tabBarX = panelX + 20;
      const tabBarY = panelY + 154;
      const tabBarW = panelW - 40;
      const tabH = 36;
      const tabGap = 6;
      const oneTabW = (tabBarW - tabGap * 3) / 4;

      const tabs = [
        { key: 'head', rectKey: 'wardrobeTabHeadBtn', label: tr.tabHead || 'HATS', count: 8 },
        { key: 'face', rectKey: 'wardrobeTabFaceBtn', label: tr.tabFace || 'GLASSES', count: 7 },
        { key: 'back', rectKey: 'wardrobeTabBackBtn', label: tr.tabBack || 'BACK', count: 3 },
        { key: 'rewards', rectKey: 'wardrobeTabRewardsBtn', label: `🏆 ${tr.rewardsTab || 'GOALS'}`, gold: true }
      ];

      for (let i = 0; i < tabs.length; i++) {
        const tb = tabs[i];
        const tx = tabBarX + i * (oneTabW + tabGap);
        const isOn = activeTab === tb.key;
        this.uiRects[tb.rectKey] = { x: tx, y: tabBarY, w: oneTabW, h: tabH };

        ctx.fillStyle = isOn ? (tb.gold ? '#925406' : '#057a58') : '#091220';
        roundRectPath(ctx, tx, tabBarY + 2.5, oneTabW, tabH - 2, 14);
        ctx.fill();

        ctx.fillStyle = isOn
          ? tb.gold
            ? '#ffd166'
            : C.COLORS.jellyPrimary
          : 'rgba(20, 32, 54, 0.9)';
        ctx.strokeStyle = isOn ? 'transparent' : 'rgba(165, 205, 255, 0.16)';
        ctx.lineWidth = 1.2;
        roundRectPath(ctx, tx, tabBarY, oneTabW, tabH - 2, 14);
        ctx.fill();
        if (!isOn) ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 11px ${C.FONTS.DISPLAY}`;
        ctx.fillStyle = isOn ? (tb.gold ? '#261402' : '#06241b') : 'rgba(205, 222, 248, 0.78)';
        ctx.fillText(tb.label, tx + oneTabW * 0.5, tabBarY + (tabH - 2) * 0.5 + 0.5);

        // Notification dot on GOALS if unseen reward unlocked, or emerald dot if slot equipped
        if (tb.key === 'rewards' && this.unseenRewards.size > 0 && !isOn) {
          ctx.fillStyle = '#ff4757';
          ctx.beginPath();
          ctx.arc(tx + oneTabW - 8, tabBarY + 7, 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (
          tb.key !== 'rewards' &&
          this.equippedSlots &&
          this.equippedSlots[tb.key] !== 'none' &&
          !isOn
        ) {
          ctx.fillStyle = '#36f5b0';
          ctx.beginPath();
          ctx.arc(tx + oneTabW - 8, tabBarY + 7, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Clipped Scrollable Showcase Well for Category Cards
      const wellX = panelX + 20;
      const wellY = panelY + 199;
      const wellW = panelW - 40;
      const wellH = 406;
      this.uiRects.wardrobeWell = { x: wellX, y: wellY, w: wellW, h: wellH };
      this.uiRects.shopCards = [];

      ctx.fillStyle = 'rgba(7, 12, 22, 0.55)';
      ctx.strokeStyle = 'rgba(165, 205, 255, 0.12)';
      ctx.lineWidth = 1.1;
      roundRectPath(ctx, wellX, wellY, wellW, wellH, 18);
      ctx.fill();
      ctx.stroke();

      const cols = 2;
      const gapX = 12;
      const gapY = 10;
      const padX = 10;
      const padY = 10;
      const cardW = (wellW - padX * 2 - gapX) / cols;
      const cardH = 124;
      const rows = Math.ceil(tabItems.length / cols);
      const totalH = rows * cardH + Math.max(0, rows - 1) * gapY + padY * 2;
      const maxScroll = Math.max(0, totalH - wellH);
      if (this.wardrobeScrollY > maxScroll) this.wardrobeScrollY = maxScroll;
      if (this.wardrobeScrollY < 0) this.wardrobeScrollY = 0;

      ctx.save();
      roundRectPath(ctx, wellX + 2, wellY + 2, wellW - 4, wellH - 4, 16);
      if (typeof ctx.clip === 'function') ctx.clip();

      for (let i = 0; i < tabItems.length; i++) {
        const acc = tabItems[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = wellX + padX + col * (cardW + gapX);
        const cy = wellY + padY + row * (cardH + gapY) - this.wardrobeScrollY;

        if (cy + cardH < wellY || cy > wellY + wellH) continue;

        this.uiRects.shopCards.push({
          accessory: acc,
          rect: { x: cx, y: cy, w: cardW, h: cardH }
        });

        this._drawGearShowcaseCard(ctx, acc, cx, cy, cardW, cardH, stats, tr, isRewardsTab);
      }
      ctx.restore();

      // Scrollbar thumb when category overflows 3 rows
      if (maxScroll > 0) {
        const trackH = wellH - 24;
        const thumbH = Math.max(32, (wellH / totalH) * trackH);
        const thumbY = wellY + 12 + (this.wardrobeScrollY / maxScroll) * (trackH - thumbH);
        ctx.fillStyle = 'rgba(165, 205, 255, 0.28)';
        roundRectPath(ctx, wellX + wellW - 6, thumbY, 3, thumbH, 1.5);
        ctx.fill();
      }

      // Bottom close hint
      ctx.fillStyle = 'rgba(185, 205, 235, 0.52)';
      ctx.font = `600 11.5px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText(tr.closeHint || 'Tap outside or ✕ to close', C.WIDTH * 0.5, panelY + panelH - 18);

      ctx.restore();
    }

    _drawGearShowcaseCard(ctx, acc, cx, cy, cardW, cardH, stats, tr, showGoalTag) {
      const accMod = JellyGame.Accessories;
      const unlocked = this.unlockedAccessories.has(acc.id);
      const equipped = this.equippedSlots && this.equippedSlots[acc.slot] === acc.id;
      const isMilestone = acc.unlockType === 'milestone';
      const affordable = !unlocked && !isMilestone && this.gems >= acc.cost;
      const prog = isMilestone && accMod ? accMod.getMilestoneProgress(acc, stats) : null;
      const bonusDrops = (acc.milestone && acc.milestone.bonusDrops) || 0;

      ctx.fillStyle = equipped
        ? 'rgba(54, 245, 176, 0.16)'
        : isMilestone && unlocked
        ? 'rgba(42, 34, 18, 0.68)'
        : 'rgba(14, 23, 40, 0.78)';
      ctx.strokeStyle = equipped
        ? C.COLORS.jellyPrimary
        : affordable || (isMilestone && unlocked)
        ? C.COLORS.collectOuter
        : 'rgba(165, 205, 255, 0.14)';
      ctx.lineWidth = equipped ? 2.2 : 1.3;
      roundRectPath(ctx, cx, cy, cardW, cardH, 16);
      ctx.fill();
      ctx.stroke();

      // Top-left slot pill (when in GOALS tab) or milestone bonus badge (top-right)
      if (showGoalTag) {
        const sLabel = (tr.slotNames && tr.slotNames[acc.slot]) || acc.slot.toUpperCase();
        ctx.fillStyle = 'rgba(165, 205, 255, 0.12)';
        roundRectPath(ctx, cx + 8, cy + 7, 42, 16, 8);
        ctx.fill();
        ctx.fillStyle = 'rgba(205, 224, 250, 0.78)';
        ctx.font = `700 8.5px ${C.FONTS.DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.fillText(sLabel, cx + 29, cy + 15.5);
      }

      if (isMilestone && bonusDrops > 0) {
        ctx.fillStyle = unlocked ? 'rgba(54, 245, 176, 0.18)' : 'rgba(255, 209, 102, 0.16)';
        roundRectPath(ctx, cx + cardW - 52, cy + 7, 44, 17, 8.5);
        ctx.fill();
        ctx.fillStyle = unlocked ? '#8affdb' : '#ffeaa7';
        ctx.font = `700 9.5px ${C.FONTS.DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.fillText(unlocked ? `✓+${bonusDrops}✦` : `+${bonusDrops}✦`, cx + cardW - 30, cy + 16);
      }

      // Soft mini pedestal disc + Jelly wearing ONLY this preview item
      ctx.fillStyle = equipped ? 'rgba(54, 245, 176, 0.25)' : 'rgba(255, 255, 255, 0.06)';
      ctx.beginPath();
      ctx.ellipse(cx + cardW * 0.5, cy + 54, 21, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      if (!unlocked && isMilestone) ctx.globalAlpha = 0.8;
      this._drawMiniJellyPreview(ctx, cx + cardW * 0.5, cy + 39, 15.5, acc.id);
      ctx.restore();

      // Localized accessory name
      const accName = (tr.accNames && tr.accNames[acc.id]) || acc.name;
      ctx.fillStyle = '#f1f5ff';
      ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(accName, cx + cardW * 0.5, cy + 72, cardW - 14);

      if (isMilestone && !unlocked && prog) {
        const goalLabel = (tr.accMilestones && tr.accMilestones[acc.id]) || `${prog.target}`;
        ctx.fillStyle = '#94b8e8';
        ctx.font = `600 9.5px ${C.FONTS.UI}`;
        ctx.fillText(goalLabel, cx + cardW * 0.5, cy + 87);

        const barW = cardW - 24;
        const barH = 17;
        const barX = cx + 12;
        const barY = cy + 98;
        ctx.fillStyle = '#070e1c';
        ctx.strokeStyle = 'rgba(165, 205, 255, 0.18)';
        ctx.lineWidth = 1;
        roundRectPath(ctx, barX, barY, barW, barH, 8.5);
        ctx.fill();
        ctx.stroke();

        if (prog.ratio > 0) {
          const fillW = Math.max(10, (barW - 4) * prog.ratio);
          const barGrad = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
          barGrad.addColorStop(0, '#ffd166');
          barGrad.addColorStop(1, '#36f5b0');
          ctx.fillStyle = barGrad;
          roundRectPath(ctx, barX + 2, barY + 2, fillW, barH - 4, 6.5);
          ctx.fill();
        }

        const stat = acc.milestone && acc.milestone.stat;
        const unitSuffix = stat === 'bestClassic' || stat === 'bestRising' ? ' m' : '';
        const prefix = stat === 'bestTempo' ? 'x' : '';
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 9.5px ${C.FONTS.DISPLAY}`;
        ctx.fillText(
          `${prefix}${prog.current} / ${prefix}${prog.target}${unitSuffix}`,
          cx + cardW * 0.5,
          barY + barH * 0.5 + 0.5
        );
      } else {
        if (isMilestone) {
          const goalLabel = (tr.accMilestones && tr.accMilestones[acc.id]) || '';
          ctx.fillStyle = '#ffeaa7';
          ctx.font = `600 9.5px ${C.FONTS.UI}`;
          ctx.fillText(goalLabel, cx + cardW * 0.5, cy + 85);
        }
        const badgeW = 104;
        const badgeH = 24;
        const badgeX = cx + (cardW - badgeW) * 0.5;
        const badgeY = cy + 93;
        this._drawGearCardButton(
          ctx,
          badgeX,
          badgeY,
          badgeW,
          badgeH,
          equipped,
          unlocked,
          affordable,
          equipped
            ? `✓ ${tr.equipped || 'EQUIPPED'}`
            : unlocked
            ? tr.equip || 'EQUIP'
            : affordable
            ? `${tr.buy || 'GET'} • ✦${acc.cost}`
            : `✦ ${acc.cost}`
        );
      }
    }

    _drawGearCardButton(ctx, x, y, w, h, equipped, unlocked, affordable, label) {
      const r = h * 0.5;
      if (equipped) {
        ctx.fillStyle = '#057856';
        roundRectPath(ctx, x, y + 2.5, w, h, r);
        ctx.fill();
        ctx.fillStyle = C.COLORS.jellyPrimary;
        roundRectPath(ctx, x, y, w, h, r);
        ctx.fill();
        ctx.fillStyle = '#06241b';
      } else if (unlocked) {
        ctx.fillStyle = '#0b1322';
        roundRectPath(ctx, x, y + 2.5, w, h, r);
        ctx.fill();
        ctx.fillStyle = '#2c4166';
        roundRectPath(ctx, x, y, w, h, r);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
      } else {
        ctx.fillStyle = affordable ? '#925406' : 'rgba(9, 15, 26, 0.6)';
        roundRectPath(ctx, x, y + 2.5, w, h, r);
        ctx.fill();
        ctx.fillStyle = affordable ? '#ffd166' : 'rgba(255, 255, 255, 0.06)';
        roundRectPath(ctx, x, y, w, h, r);
        ctx.fill();
        ctx.fillStyle = affordable ? '#261402' : 'rgba(185, 200, 225, 0.5)';
      }
      ctx.font = `700 11px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w * 0.5, y + h * 0.5 + 0.5);
    }

    _drawTrophyIcon(ctx, x, y, scale = 1) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);

      const tGrad = ctx.createLinearGradient(0, -12, 0, 12);
      tGrad.addColorStop(0, '#fff5bd');
      tGrad.addColorStop(0.55, '#ffd166');
      tGrad.addColorStop(1, '#f39c12');
      ctx.fillStyle = tGrad;
      ctx.strokeStyle = '#111b2e';
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';

      // Handles
      ctx.beginPath();
      ctx.arc(-8, -4, 4.5, Math.PI * 0.45, Math.PI * 1.55);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(8, -4, 4.5, -Math.PI * 0.55, Math.PI * 0.55);
      ctx.stroke();

      // Cup body
      ctx.beginPath();
      ctx.moveTo(-8, -10);
      ctx.lineTo(8, -10);
      ctx.lineTo(6.5, -1);
      ctx.quadraticCurveTo(5, 4, 2, 4.5);
      ctx.lineTo(2, 8);
      ctx.lineTo(6, 10.5);
      ctx.lineTo(-6, 10.5);
      ctx.lineTo(-2, 8);
      ctx.lineTo(-2, 4.5);
      ctx.quadraticCurveTo(-5, 4, -6.5, -1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Highlight gleam
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.ellipse(-3.2, -5.5, 1.5, 3, -0.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    _drawRankCrest(ctx, x, y, rank, ghost = false) {
      ctx.save();
      ctx.translate(x, y);
      if (ghost) ctx.globalAlpha = 0.4;

      if (rank >= 1 && rank <= 3) {
        const palettes = {
          1: { top: '#fff5b8', mid: '#ffd166', bot: '#d97706', rim: '#78350f', text: '#3b1d02' },
          2: { top: '#ffffff', mid: '#cbd5e1', bot: '#64748b', rim: '#334155', text: '#0f172a' },
          3: { top: '#fed7aa', mid: '#f4a261', bot: '#b45309', rim: '#5a2308', text: '#2e1002' }
        };
        const p = palettes[rank];

        if (rank === 1 && !ghost) {
          // Crowned gold champion medallion
          const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
          glow.addColorStop(0, 'rgba(255, 209, 102, 0.42)');
          glow.addColorStop(1, 'rgba(255, 209, 102, 0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(0, 0, 22, 0, Math.PI * 2);
          ctx.fill();

          // Tiny sculpted crown floating on shield rim
          ctx.fillStyle = '#ffd166';
          ctx.strokeStyle = p.rim;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(-8, -11);
          ctx.lineTo(-9, -17);
          ctx.lineTo(-3.5, -13.5);
          ctx.lineTo(0, -18.5);
          ctx.lineTo(3.5, -13.5);
          ctx.lineTo(9, -17);
          ctx.lineTo(8, -11);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        const sGrad = ctx.createLinearGradient(0, -13, 0, 14);
        sGrad.addColorStop(0, p.top);
        sGrad.addColorStop(0.55, p.mid);
        sGrad.addColorStop(1, p.bot);
        ctx.fillStyle = sGrad;
        ctx.strokeStyle = p.rim;
        ctx.lineWidth = 1.6;

        // Hex-crest shield silhouette
        ctx.beginPath();
        ctx.moveTo(0, -13);
        ctx.lineTo(12, -8);
        ctx.lineTo(10, 5);
        ctx.lineTo(0, 13.5);
        ctx.lineTo(-10, 5);
        ctx.lineTo(-12, -8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = p.text;
        ctx.font = `700 13px ${C.FONTS.DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${rank}`, 0, 0.5);
      } else {
        ctx.fillStyle = 'rgba(17, 27, 46, 0.85)';
        ctx.strokeStyle = 'rgba(165, 205, 255, 0.22)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, 12.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(205, 222, 248, 0.86)';
        ctx.font = `700 11px ${C.FONTS.DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`#${rank}`, 0, 0.5);
      }

      ctx.restore();
    }

    _drawModeTabIcon(ctx, x, y, mode, active) {
      ctx.save();
      ctx.translate(x, y);
      if (mode === 'rising') {
        ctx.fillStyle = active ? '#2b0903' : '#ff793f';
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.quadraticCurveTo(6.5, -1, 4.5, 5.5);
        ctx.quadraticCurveTo(1.5, 7.5, -0.5, 6);
        ctx.quadraticCurveTo(-5.5, 5, -5, -0.5);
        ctx.quadraticCurveTo(-2, -3.5, 0, -7);
        ctx.closePath();
        ctx.fill();
      } else {
        // Summit / altitude diamond peak
        ctx.fillStyle = active ? '#06241b' : '#36f5b0';
        ctx.beginPath();
        ctx.moveTo(0, -6.5);
        ctx.lineTo(6.5, 5);
        ctx.lineTo(2, 5);
        ctx.lineTo(0, 2);
        ctx.lineTo(-2, 5);
        ctx.lineTo(-6.5, 5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    _drawLeaderboardModal(ctx) {
      const tr = this.t();
      const spring = this._easeOutBack(clamp(this.modalAnim, 0, 1));
      const scale = 0.86 + 0.14 * spring;
      const isRising = this.lbTab === 'rising';
      const accent = isRising ? '#ff793f' : C.COLORS.jellyPrimary;
      const accentLip = isRising ? '#8c2613' : '#057a58';

      ctx.save();
      ctx.fillStyle = `rgba(6, 10, 20, ${0.76 * clamp(this.modalAnim * 1.5, 0, 1)})`;
      ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);

      const panelW = 396;
      const panelH = 622;
      const panelX = (C.WIDTH - panelW) * 0.5;
      const panelY = (C.HEIGHT - panelH) * 0.5;
      this.uiRects.modalPanel = { x: panelX, y: panelY, w: panelW, h: panelH };

      ctx.translate(C.WIDTH * 0.5, C.HEIGHT * 0.5);
      ctx.scale(scale, scale);
      ctx.translate(-C.WIDTH * 0.5, -C.HEIGHT * 0.5);

      this._drawMonumentTablet(ctx, panelX, panelY, panelW, panelH, 26);

      // Ambient radial spotlight glow inside header matching selected game mode
      ctx.save();
      roundRectPath(ctx, panelX + 3, panelY + 3, panelW - 6, panelH - 6, 23);
      if (typeof ctx.clip === 'function') ctx.clip();
      const auraGrad = ctx.createRadialGradient(
        panelX + panelW * 0.45,
        panelY + 26,
        8,
        panelX + panelW * 0.45,
        panelY + 26,
        210
      );
      auraGrad.addColorStop(
        0,
        isRising ? 'rgba(255, 121, 63, 0.22)' : 'rgba(54, 245, 176, 0.2)'
      );
      auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = auraGrad;
      ctx.fillRect(panelX, panelY, panelW, 130);
      ctx.restore();

      const bucket =
        this.leaderboard && this.leaderboard.data
          ? this.leaderboard.data[this.lbTab]
          : { entries: [], playerEntry: null, playerRank: null, totalPlayers: 0 };
      const entries = bucket.entries || [];

      // Sculpted Trophy Crest + Decorative Twinkle Stars + Title
      this._drawTrophyIcon(ctx, panelX + 34, panelY + 34, 0.96);
      ctx.fillStyle = 'rgba(255, 240, 175, 0.8)';
      ctx.beginPath();
      ctx.arc(panelX + 20, panelY + 21, 1.8, 0, Math.PI * 2);
      ctx.arc(panelX + 47, panelY + 22, 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 18.5px ${C.FONTS.DISPLAY}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#091324';
      const titleY = entries.length > 0 ? panelY + 28 : panelY + 35;
      ctx.strokeText(tr.leaderboardTitle || 'LEADERBOARD', panelX + 54, titleY);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(tr.leaderboardTitle || 'LEADERBOARD', panelX + 54, titleY);

      if (entries.length > 0) {
        const count = bucket.totalPlayers || entries.length;
        const unit = count === 1 ? tr.climberUnit || 'climber' : tr.climbersUnit || 'climbers';
        const countStr = `${count} ${unit}`;
        ctx.fillStyle = accent;
        ctx.font = `700 10.5px ${C.FONTS.UI}`;
        ctx.fillText(countStr, panelX + 55, panelY + 46);
      }

      // Close medallion & Animated Refresh medallion
      const closeSize = 34;
      const closeX = panelX + panelW - closeSize - 18;
      const closeY = panelY + 18;
      this.uiRects.modalCloseBtn = { x: closeX, y: closeY, w: closeSize, h: closeSize };
      this._drawCloseMedallion(ctx, closeX, closeY, closeSize);

      const refX = closeX - 42;
      const refY = closeY;
      this.uiRects.lbRefreshBtn = { x: refX, y: refY, w: closeSize, h: closeSize };
      const rCx = refX + closeSize * 0.5;
      const rCy = refY + closeSize * 0.5;
      ctx.fillStyle = '#233554';
      ctx.strokeStyle = '#091220';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(rCx, rCy, closeSize * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.save();
      ctx.translate(rCx, rCy);
      if (this.leaderboard && this.leaderboard.loading) {
        ctx.rotate(this.hintTime * 6);
      }
      ctx.strokeStyle = '#8affdb';
      ctx.fillStyle = '#8affdb';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0.35, Math.PI * 1.75);
      ctx.stroke();
      const ahAng = Math.PI * 1.75;
      const ahX = Math.cos(ahAng) * 7;
      const ahY = Math.sin(ahAng) * 7;
      ctx.beginPath();
      ctx.moveTo(ahX + 3.5, ahY + 1.5);
      ctx.lineTo(ahX - 1.5, ahY - 3.5);
      ctx.lineTo(ahX - 3.5, ahY + 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 2-Mode Tab Segmented Bar (CLASSIC | RISING FLOOR) with vector mode emblems
      const tabW = panelW - 36;
      const tabH = 42;
      const tabX = panelX + 18;
      const tabY = panelY + 62;
      const halfTabW = tabW * 0.5;
      this.uiRects.lbTabClassicBtn = { x: tabX, y: tabY, w: halfTabW, h: tabH };
      this.uiRects.lbTabRisingBtn = { x: tabX + halfTabW, y: tabY, w: halfTabW, h: tabH };

      ctx.fillStyle = '#091220';
      ctx.strokeStyle = 'rgba(170, 205, 255, 0.16)';
      ctx.lineWidth = 1.2;
      roundRectPath(ctx, tabX, tabY, tabW, tabH, 21);
      ctx.fill();
      ctx.stroke();

      const activeTabX = isRising ? tabX + halfTabW + 2 : tabX + 3;
      ctx.fillStyle = accentLip;
      roundRectPath(ctx, activeTabX, tabY + 5, halfTabW - 5, tabH - 8, 17);
      ctx.fill();
      ctx.fillStyle = accent;
      roundRectPath(ctx, activeTabX, tabY + 3, halfTabW - 5, tabH - 8, 17);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      roundRectPath(ctx, activeTabX + 12, tabY + 5.5, halfTabW - 29, 5, 2.5);
      ctx.fill();

      ctx.textBaseline = 'middle';
      ctx.font = `700 12.5px ${C.FONTS.DISPLAY}`;

      const classicLabel = tr.modeClassic || 'CLASSIC';
      const classicW = ctx.measureText(classicLabel).width;
      const classicCenterX = tabX + halfTabW * 0.5;
      this._drawModeTabIcon(ctx, classicCenterX - classicW * 0.5 - 6, tabY + tabH * 0.5, 'classic', !isRising);
      ctx.textAlign = 'center';
      ctx.fillStyle = !isRising ? '#06241b' : 'rgba(205, 222, 248, 0.72)';
      ctx.fillText(classicLabel, classicCenterX + 8, tabY + tabH * 0.5);

      const risingLabel = tr.modeRising || 'RISING FLOOR';
      const risingW = ctx.measureText(risingLabel).width;
      const risingCenterX = tabX + halfTabW * 1.5;
      this._drawModeTabIcon(ctx, risingCenterX - risingW * 0.5 - 6, tabY + tabH * 0.5, 'rising', isRising);
      ctx.fillStyle = isRising ? '#240b03' : 'rgba(205, 222, 248, 0.72)';
      ctx.fillText(risingLabel, risingCenterX + 8, tabY + tabH * 0.5);

      // Player Profile Identity Card (no backend database jargon!)
      const profX = panelX + 18;
      const profY = panelY + 114;
      const profW = panelW - 36;
      const profH = 48;
      const profGrad = ctx.createLinearGradient(profX, profY, profX + profW, profY + profH);
      profGrad.addColorStop(0, 'rgba(18, 30, 52, 0.85)');
      profGrad.addColorStop(1, 'rgba(10, 17, 30, 0.82)');
      ctx.fillStyle = profGrad;
      ctx.strokeStyle = 'rgba(165, 205, 255, 0.18)';
      ctx.lineWidth = 1.2;
      roundRectPath(ctx, profX, profY, profW, profH, 16);
      ctx.fill();
      ctx.stroke();

      const activePal = this.player.getColorPalette();
      const avGlow = ctx.createRadialGradient(
        profX + 26,
        profY + profH * 0.5,
        2,
        profX + 26,
        profY + profH * 0.5,
        21
      );
      avGlow.addColorStop(0, activePal.glow);
      avGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = avGlow;
      ctx.beginPath();
      ctx.arc(profX + 26, profY + profH * 0.5, 21, 0, Math.PI * 2);
      ctx.fill();

      this._drawMiniJellyPreview(
        ctx,
        profX + 26,
        profY + profH * 0.5,
        13,
        this.equippedAccessory,
        this.equippedColor
      );

      const nick = this.leaderboard ? this.leaderboard.nickname : 'JELLY';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 14px ${C.FONTS.DISPLAY}`;
      ctx.fillText(nick, profX + 50, profY + 16.5);

      const src = this.leaderboard ? this.leaderboard.storageSource : 'offline';
      const isConnected = src === 'mongodb' || src === 'local';
      const statusDotCol = isConnected ? '#36f5b0' : '#ffd166';
      const statusText = isConnected
        ? tr.dbMongo || 'Global Online'
        : tr.dbOffline || 'Offline Mode';
      const allGearCount = JellyGame.Accessories ? JellyGame.Accessories.LIST.length : 18;
      const subtitleText = `${statusText}  •  ${this._getOwnedGearCount()}/${allGearCount} ${tr.gearUnit || 'Gear'}`;

      ctx.fillStyle = statusDotCol;
      ctx.beginPath();
      ctx.arc(profX + 54, profY + 34, 3.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(195, 218, 250, 0.78)';
      ctx.font = `600 10.5px ${C.FONTS.UI}`;
      ctx.fillText(subtitleText, profX + 62, profY + 34.5);

      // Tactile 3D [EDIT] button on right of profile strip
      const editW = 80;
      const editH = 29;
      const editX = profX + profW - editW - 9;
      const editY = profY + (profH - editH) * 0.5;
      this.uiRects.lbEditNickBtn = { x: editX, y: editY, w: editW, h: editH };

      ctx.fillStyle = '#09111f';
      roundRectPath(ctx, editX, editY + 2, editW, editH, 14.5);
      ctx.fill();
      ctx.fillStyle = '#283e62';
      ctx.strokeStyle = 'rgba(165, 205, 255, 0.3)';
      ctx.lineWidth = 1.2;
      roundRectPath(ctx, editX, editY, editW, editH, 14.5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#e6f0ff';
      ctx.font = `700 11px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText(`✎ ${tr.editNick || 'EDIT'}`, editX + editW * 0.5, editY + editH * 0.5 + 0.5);

      // Recessed Scrollable Hall-of-Fame Well
      const wellX = panelX + 18;
      const wellY = panelY + 172;
      const wellW = panelW - 36;
      const wellH = 342;
      this.uiRects.lbListWell = { x: wellX, y: wellY, w: wellW, h: wellH };
      this.uiRects.lbPromoBtn = null;

      ctx.fillStyle = 'rgba(8, 13, 24, 0.78)';
      ctx.strokeStyle = 'rgba(165, 205, 255, 0.14)';
      ctx.lineWidth = 1.2;
      roundRectPath(ctx, wellX, wellY, wellW, wellH, 18);
      ctx.fill();
      ctx.stroke();

      const rowGap = 7;
      const openSlots = entries.length > 0 && entries.length < 3 ? 3 - entries.length : 0;
      const showPromo = entries.length > 0 && entries.length <= 4;
      const promoH = showPromo ? 72 : 0;

      let totalContentH = 12;
      for (let i = 0; i < entries.length; i++) {
        const rk = entries[i].rank;
        totalContentH += (rk === 1 ? 60 : rk <= 3 ? 52 : 44) + rowGap;
      }
      totalContentH += openSlots * (48 + rowGap);
      if (showPromo) totalContentH += promoH + 8;

      const maxScroll = Math.max(0, totalContentH - wellH);
      if (this.lbScrollY > maxScroll) this.lbScrollY = maxScroll;
      if (this.lbScrollY < 0) this.lbScrollY = 0;

      ctx.save();
      roundRectPath(ctx, wellX + 2, wellY + 2, wellW - 4, wellH - 4, 16);
      if (typeof ctx.clip === 'function') ctx.clip();

      if (entries.length === 0) {
        const emCx = wellX + wellW * 0.5;
        const emCy = wellY + 115;
        const emGlow = ctx.createRadialGradient(emCx, emCy, 6, emCx, emCy, 56);
        emGlow.addColorStop(0, activePal.glow);
        emGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = emGlow;
        ctx.beginPath();
        ctx.arc(emCx, emCy, 56, 0, Math.PI * 2);
        ctx.fill();

        this._drawRankCrest(ctx, emCx, emCy - 34, 1, false);
        this._drawMiniJellyPreview(
          ctx,
          emCx,
          emCy + 10,
          22,
          this.equippedAccessory,
          this.equippedColor
        );
        ctx.fillStyle = 'rgba(215, 232, 255, 0.86)';
        ctx.font = `700 13.5px ${C.FONTS.DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.fillText(
          tr.emptyLeaderboard || 'No climbs recorded yet — be #1!',
          emCx,
          wellY + 190
        );
        this.uiRects.lbPromoBtn = this._drawLbMilestonePromo(
          ctx,
          wellX + 8,
          wellY + wellH - 82,
          wellW - 16,
          72,
          tr
        );
      } else {
        const myId = this.leaderboard ? this.leaderboard.playerId : '';
        const rx = wellX + 8;
        const rw = wellW - 16;
        let curY = wellY + 8 - this.lbScrollY;

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const rk = entry.rank;
          const rowH = rk === 1 ? 60 : rk <= 3 ? 52 : 44;

          if (curY + rowH >= wellY && curY <= wellY + wellH) {
            this._drawLeaderboardRow(ctx, entry, rx, curY, rw, rowH, entry.playerId === myId, isRising, accent, tr);
          }
          curY += rowH + rowGap;
        }

        // Stylized ghost podium placeholders if Top 3 isn't full yet
        for (let slot = entries.length + 1; slot <= 3; slot++) {
          const slotH = 48;
          if (curY + slotH >= wellY && curY <= wellY + wellH) {
            ctx.save();
            ctx.setLineDash([5, 4]);
            ctx.fillStyle = 'rgba(13, 21, 38, 0.45)';
            ctx.strokeStyle =
              slot === 2 ? 'rgba(203, 213, 225, 0.25)' : 'rgba(244, 162, 97, 0.25)';
            ctx.lineWidth = 1.2;
            roundRectPath(ctx, rx, curY, rw, slotH, 14);
            ctx.fill();
            ctx.stroke();
            ctx.setLineDash([]);

            this._drawRankCrest(ctx, rx + 26, curY + slotH * 0.5, slot, true);
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(180, 200, 232, 0.56)';
            ctx.font = `600 11.5px ${C.FONTS.UI}`;
            ctx.fillText(
              tr.openPodiumSlot || 'PODIUM OPEN — Climb to claim!',
              rx + 56,
              curY + slotH * 0.5 + 0.5
            );
            ctx.restore();
          }
          curY += slotH + rowGap;
        }

        // Interactive Milestone Promo banner at bottom when board is short
        if (showPromo) {
          const promoY = Math.max(curY + 4, wellY + wellH - promoH - 8);
          if (promoY + promoH >= wellY && promoY <= wellY + wellH) {
            this.uiRects.lbPromoBtn = this._drawLbMilestonePromo(
              ctx,
              rx,
              promoY,
              rw,
              promoH,
              tr
            );
          }
        }
      }
      ctx.restore();

      // Subtle vertical scrollbar thumb if list scrolls
      if (maxScroll > 0) {
        const trackH = wellH - 24;
        const thumbH = Math.max(30, (wellH / totalContentH) * trackH);
        const thumbY = wellY + 12 + (this.lbScrollY / maxScroll) * (trackH - thumbH);
        ctx.fillStyle = 'rgba(165, 205, 255, 0.25)';
        roundRectPath(ctx, wellX + wellW - 6, thumbY, 3, thumbH, 1.5);
        ctx.fill();
      }

      // Pinned Footer "YOUR RANK" Summary Bar with target meter gap!
      const footX = panelX + 18;
      const footY = panelY + 526;
      const footW = panelW - 36;
      const footH = 48;
      ctx.fillStyle = isRising ? 'rgba(54, 20, 14, 0.94)' : 'rgba(12, 34, 34, 0.94)';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.6;
      roundRectPath(ctx, footX, footY, footW, footH, 16);
      ctx.fill();
      ctx.stroke();

      const localBest = isRising ? this.bestRisingMeters : this.bestMeters;
      const myRankNum = bucket.playerRank;
      const myRankStr = myRankNum ? `#${myRankNum}` : '--';
      ctx.textAlign = 'left';
      ctx.fillStyle = accent;
      ctx.font = `700 13px ${C.FONTS.DISPLAY}`;
      ctx.fillText(`${tr.yourRank || 'YOUR RANK'}: ${myRankStr}`, footX + 16, footY + footH * 0.5 + 0.5);

      // Compute motivating gap to the climber right above you (if any)
      let gapLabel = '';
      if (myRankNum && myRankNum > 1 && entries.length >= myRankNum - 1) {
        const targetEntry = entries[myRankNum - 2];
        const myScore = (bucket.playerEntry && bucket.playerEntry.meters) || localBest;
        const delta = targetEntry ? targetEntry.meters - myScore + 1 : 0;
        if (delta > 0) {
          gapLabel = `▲ +${delta} m → #${targetEntry.rank}`;
        }
      }

      ctx.textAlign = 'right';
      if (gapLabel) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 13.5px ${C.FONTS.DISPLAY}`;
        ctx.fillText(`${localBest} m`, footX + footW - 16, footY + 17);
        ctx.fillStyle = '#ffeaa7';
        ctx.font = `700 10.5px ${C.FONTS.UI}`;
        ctx.fillText(gapLabel, footX + footW - 16, footY + 34);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 14px ${C.FONTS.DISPLAY}`;
        ctx.fillText(
          localBest > 0 ? `${localBest} m` : tr.unranked || 'Climb to rank!',
          footX + footW - 16,
          footY + footH * 0.5 + 0.5
        );
      }

      // Close hint beneath footer
      ctx.fillStyle = 'rgba(185, 205, 235, 0.52)';
      ctx.font = `600 11.5px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText(tr.closeHint || 'Tap outside or ✕ to close', C.WIDTH * 0.5, panelY + panelH - 18);

      ctx.restore();
    }

    _drawLeaderboardRow(ctx, entry, rx, ry, rw, rowH, isMe, isRising, accent, tr) {
      const rk = entry.rank;
      const isChamp = rk === 1;

      const cardGrad = ctx.createLinearGradient(rx, ry, rx + rw, ry + rowH);
      if (isChamp) {
        cardGrad.addColorStop(0, 'rgba(72, 54, 18, 0.85)');
        cardGrad.addColorStop(1, 'rgba(30, 26, 20, 0.88)');
      } else if (isMe) {
        cardGrad.addColorStop(0, isRising ? 'rgba(84, 34, 22, 0.82)' : 'rgba(14, 54, 48, 0.82)');
        cardGrad.addColorStop(1, 'rgba(16, 26, 44, 0.86)');
      } else if (rk === 2) {
        cardGrad.addColorStop(0, 'rgba(34, 48, 72, 0.82)');
        cardGrad.addColorStop(1, 'rgba(20, 30, 50, 0.82)');
      } else if (rk === 3) {
        cardGrad.addColorStop(0, 'rgba(54, 34, 24, 0.78)');
        cardGrad.addColorStop(1, 'rgba(24, 28, 46, 0.82)');
      } else {
        cardGrad.addColorStop(0, 'rgba(22, 34, 56, 0.74)');
        cardGrad.addColorStop(1, 'rgba(16, 25, 42, 0.74)');
      }

      ctx.fillStyle = cardGrad;
      ctx.strokeStyle = isChamp
        ? '#ffd166'
        : isMe
        ? accent
        : rk === 2
        ? 'rgba(203, 213, 225, 0.42)'
        : rk === 3
        ? 'rgba(244, 162, 97, 0.42)'
        : 'rgba(165, 205, 255, 0.12)';
      ctx.lineWidth = isChamp || isMe ? 1.8 : 1.1;
      roundRectPath(ctx, rx, ry, rw, rowH, 15);
      ctx.fill();
      ctx.stroke();

      // Vector Rank Crest
      this._drawRankCrest(ctx, rx + 26, ry + rowH * 0.5 + (isChamp ? 3 : 0), rk, false);

      // Soft avatar glow halo on #1 Champion
      const avX = rx + 64;
      const avY = ry + rowH * 0.5;
      if (isChamp) {
        const hGlow = ctx.createRadialGradient(avX, avY, 2, avX, avY, 22);
        hGlow.addColorStop(0, 'rgba(255, 209, 102, 0.36)');
        hGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = hGlow;
        ctx.beginPath();
        ctx.arc(avX, avY, 22, 0, Math.PI * 2);
        ctx.fill();
      }

      this._drawMiniJellyPreview(
        ctx,
        avX,
        avY,
        isChamp ? 13.5 : rk <= 3 ? 12 : 11,
        entry.accessory || 'none',
        entry.color || 'mint'
      );

      // Nickname + Champion / YOU micro tag
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isChamp ? '#fff5cf' : isMe ? '#ffffff' : '#e6f0ff';
      ctx.font = `700 ${isChamp ? 14 : 13}px ${C.FONTS.DISPLAY}`;
      const nameLabel = isMe ? `${entry.nickname} (${tr.youTag || 'YOU'})` : entry.nickname;
      const nameY = ry + rowH * 0.34;
      ctx.fillText(nameLabel, rx + 88, nameY);

      // Tempo + Champion tag beneath nickname
      ctx.fillStyle = 'rgba(255, 209, 102, 0.88)';
      ctx.font = `600 10.5px ${C.FONTS.DISPLAY}`;
      const subRowY = ry + rowH * 0.69;
      const subText = isChamp
        ? `★ ${tr.championTag || 'CHAMPION'}  •  ⚡ x${entry.maxTempo || 1}`
        : `⚡ ${tr.tempo || 'TEMPO'} x${entry.maxTempo || 1}`;
      ctx.fillText(subText, rx + 88, subRowY);

      // Right-aligned Sculpted Score Pill
      const scoreText = `${entry.meters} m`;
      const pillW = 72;
      const pillH = isChamp ? 30 : 26;
      const pillX = rx + rw - pillW - 10;
      const pillY = ry + (rowH - pillH) * 0.5;
      ctx.fillStyle = isChamp
        ? 'rgba(255, 209, 102, 0.2)'
        : isMe
        ? 'rgba(54, 245, 176, 0.16)'
        : 'rgba(10, 17, 32, 0.65)';
      ctx.strokeStyle = isChamp
        ? 'rgba(255, 209, 102, 0.5)'
        : isMe
        ? accent
        : 'rgba(165, 205, 255, 0.16)';
      ctx.lineWidth = 1;
      roundRectPath(ctx, pillX, pillY, pillW, pillH, pillH * 0.5);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = isChamp ? '#ffd166' : isMe ? accent : '#ffffff';
      ctx.font = `700 ${isChamp ? 14.5 : 13.5}px ${C.FONTS.DISPLAY}`;
      ctx.fillText(scoreText, pillX + pillW * 0.5, pillY + pillH * 0.5 + 0.5);
    }

    _drawLbMilestonePromo(ctx, x, y, w, h, tr) {
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, 'rgba(32, 26, 56, 0.85)');
      grad.addColorStop(1, 'rgba(16, 28, 50, 0.88)');
      ctx.fillStyle = grad;
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.36)';
      ctx.lineWidth = 1.2;
      roundRectPath(ctx, x, y, w, h, 14);
      ctx.fill();
      ctx.stroke();

      // Preview miniature milestone gear icons inside promo banner
      const previews = ['halo', 'visor', 'horns', 'jetpack', 'wings'];
      for (let i = 0; i < previews.length; i++) {
        this._drawMiniJellyPreview(
          ctx,
          x + 24 + i * 25,
          y + 27,
          9.0,
          previews[i],
          ['amber', 'azure', 'coral', 'mint', 'violet'][i]
        );
      }

      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd166';
      ctx.font = `700 11px ${C.FONTS.DISPLAY}`;
      ctx.fillText(`🏆 ${tr.rewardsTab || 'MILESTONES'} →`, x + w - 12, y + 23);

      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(218, 232, 255, 0.85)';
      ctx.font = `600 10.5px ${C.FONTS.UI}`;
      ctx.fillText(
        tr.milestoneHintStrip || 'Hit altitude & tempo goals to earn rare gear!',
        x + 14,
        y + 52
      );

      return { x, y, w, h };
    }

    _drawMiniJellyPreview(ctx, x, y, r, accessoryId, colorId) {
      let pal = null;
      const targetColor = colorId || this.equippedColor;
      if (C.JELLY_COLORS && targetColor) {
        for (let i = 0; i < C.JELLY_COLORS.length; i++) {
          if (C.JELLY_COLORS[i].id === targetColor) {
            pal = C.JELLY_COLORS[i];
            break;
          }
        }
      }
      if (!pal) {
        pal = this.player
          ? this.player.getColorPalette()
          : {
              light: '#9bffdb',
              primary: C.COLORS.jellyPrimary,
              secondary: C.COLORS.jellySecondary,
              rim: C.COLORS.jellyRim
            };
      }

      ctx.save();
      ctx.translate(x, y);

      const eyeScale = r / C.PLAYER_RADIUS;

      // Back-slot accessories (cape, wings, jetpack) drawn cleanly behind body sphere
      if (JellyGame.Accessories && accessoryId && accessoryId !== 'none') {
        ctx.save();
        ctx.scale(eyeScale, eyeScale);
        JellyGame.Accessories.drawAccessory(
          ctx,
          accessoryId,
          C.PLAYER_RADIUS,
          0,
          0,
          this.hintTime,
          0.2,
          'back'
        );
        ctx.restore();
      }

      const grad = ctx.createRadialGradient(-r * 0.28, -r * 0.3, r * 0.15, 0, 0, r * 1.05);
      grad.addColorStop(0, pal.light);
      grad.addColorStop(0.45, pal.primary);
      grad.addColorStop(1, pal.secondary);

      ctx.fillStyle = grad;
      ctx.strokeStyle = pal.rim;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Glossy specular shine on preview jelly
      ctx.fillStyle = C.COLORS.jellyHighlight;
      ctx.beginPath();
      ctx.ellipse(-r * 0.32, -r * 0.35, r * 0.24, r * 0.14, -0.55, 0, Math.PI * 2);
      ctx.fill();

      // Cute eyes & smile scaled cleanly to preview size
      ctx.save();
      ctx.scale(eyeScale, eyeScale);
      for (const side of [-1, 1]) {
        ctx.fillStyle = C.COLORS.jellyEye;
        ctx.beginPath();
        ctx.arc(side * 5.2, 0.5, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(side * 5.2 - 0.8, -0.3, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = C.COLORS.jellyEye;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 4.0, 2.2, 0.2, Math.PI - 0.2);
      ctx.stroke();

      if (JellyGame.Accessories && accessoryId && accessoryId !== 'none') {
        JellyGame.Accessories.drawAccessory(
          ctx,
          accessoryId,
          C.PLAYER_RADIUS,
          0,
          0,
          this.hintTime,
          0.2,
          'front'
        );
      }
      ctx.restore();

      ctx.restore();
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;
    const game = new Game(canvas);
    JellyGame.instance = game;
    game.start();
  });
})(window);
