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
    MUSIC_VOLUME: 'jelly_climb_music_vol',
    HAPTICS: 'jelly_climb_haptics',
    TUTORIAL_DONE: 'jelly_climb_onboarding_v2_done',
    GAME_MODE: 'jelly_climb_mode',
    BEST_TEMPO: 'jelly_climb_best_tempo',
    TOTAL_CLOSE_CALLS: 'jelly_climb_close_calls',
    REWARDS_CLAIMED: 'jelly_climb_rewards_claimed',
    BOSSES_DEFEATED: 'jelly_climb_bosses_defeated',
    ABILITY_LEVELS: 'jelly_climb_ability_levels',
    EQUIPPED_ABILITY: 'jelly_climb_equipped_ability'
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
      this.viewW = C.WIDTH;
      this.viewH = C.HEIGHT;
      this.padLeft = 0;
      this.padRight = 0;
      this.padTop = 0;
      this.padBottom = 0;

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

      // Boss encounter progression (500m -> 1000m -> 2000m -> 4000m -> 8000m...)
      this.bossesDefeated = this._loadInt(STORAGE_KEYS.BOSSES_DEFEATED, 0);
      this.activeBoss = null;
      this.nextBossIndex = 0;
      this.runBossesDefeated = 0;
      this.bossWarnedIndex = -1;
      this.bossWarningTimer = 0;

      // Jelly Powers / Relics progression (Shield, Air Dash, Chrono Rewind, Guardian Angel)
      this.abilityLevels = this._loadAbilityLevels();
      this.equippedAbility = this._loadEquippedAbility();
      this.abilityCooldown = 0;
      this.abilityMaxCooldown = 0;
      this.angelCharges = 0;
      this.angelMaxCharges = 0;
      this.chronoBuffer = [];
      this.chronoSampleTimer = 0;
      this.chronoRewindAnim = null;
      this.angelReviveAnim = null;
      this.shockwaveRings = [];
      this.lastTapInfo = { time: 0, x: 0, y: 0 };
      this._syncRunAbilityState();

      // Altitude theme banner state
      this.announcedThemeIdx = 0;
      this.themeBannerText = '';
      this.themeBannerTimer = 0;

      // Language, sound FX & royalty-free music settings (primary English, secondary Turkish)
      this.lang = this._loadLang();
      this.soundEnabled = this._loadBool(STORAGE_KEYS.SOUND, true);
      this.musicEnabled = this._loadBool(STORAGE_KEYS.MUSIC, true);
      this.musicVolume = clamp(this._loadInt(STORAGE_KEYS.MUSIC_VOLUME, 70), 0, 100) / 100;
      this.hapticsEnabled = this._loadBool(STORAGE_KEYS.HAPTICS, true);
      this.musicSliderDragging = false;
      this.audio.setEnabled(this.soundEnabled);
      this.audio.setMusicVolume(this.musicVolume);
      this.audio.setMusicEnabled(this.musicEnabled && this.musicVolume > 0.01);
      if (JellyGame.Haptics) {
        JellyGame.Haptics.setEnabled(this.hapticsEnabled);
      }

      // Super Magnet power-up & dormant Native Ad state
      this.magnetTimer = 0;
      this.adReviveUsedThisRun = false;
      this.adDoubleUsedThisRun = false;
      this.adBusy = false;

      // UI & state flags
      this.state = 'menu'; // 'menu' | 'playing' | 'dead'
      this.activeModal = null; // null | 'modes' | 'leaderboard' | 'accessories' | 'settings' | 'privacy' | 'pause'
      this.settingsReturnModal = null;
      this._isAppHidden = Boolean(global.document && global.document.hidden);
      this.confirmResetPending = false;
      this.resetStatusMsg = '';
      this.showHitboxes = false;
      this.deathTimer = 0;
      this.hitStopTimer = 0;
      this.shakeMag = 0;
      this.camPunchX = 0;
      this.camPunchY = 0;
      this.camPunchVx = 0;
      this.camPunchVy = 0;
      this.camZoom = 1;
      this.hasLaunchedOnce = false;
      this.hintTime = 0;
      this.pressedBtn = null;

      // Tactile UI spring & micro-animation states
      this.modalAnim = 0;
      this.hudGemPulse = 0;
      this.meterMilestonePulse = 0;
      this.wardrobePreviewBounce = 0;
      this.profilePillBounce = 0;

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
        menuProfileBtn: null,
        retryBtn: null,
        deathShopBtn: null,
        deathLbBtn: null,
        deathMenuBtn: null,
        deathAdReviveBtn: null,
        deathAdDoubleBtn: null,
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
        wardrobeTabPowersBtn: null,
        wardrobeTabRewardsBtn: null,
        wardrobeWell: null,
        abilityOrbBtn: null,
        shopCards: [],
        powerCards: [],
        missionClaimBtns: [],
        colorSwatches: [],
        soundOnBtn: null,
        soundOffBtn: null,
        hapticsOnBtn: null,
        hapticsOffBtn: null,
        musicToggleBtn: null,
        musicSliderTrack: null,
        musicSliderHit: null,
        langEnBtn: null,
        langTrBtn: null,
        settingsPrivacyBtn: null,
        settingsResetBtn: null,
        privacyOpenPageBtn: null,
        privacyBackBtn: null,
        pauseResumeBtn: null,
        pauseRestartBtn: null,
        pauseSettingsBtn: null,
        pauseMenuBtn: null
      };

      this._boundCheckLanding = this._checkLandingState.bind(this);

      this.ambientMotes = this._createAmbientMotes(42);

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
        if (raw === null || raw === '') return fallback;
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
      const base = { head: 'none', face: 'none', back: 'none', skin: 'none' };
      try {
        const rawSlots = global.localStorage.getItem(STORAGE_KEYS.EQUIPPED_SLOTS);
        if (rawSlots && accMod) {
          const normalized = accMod.normalizeSlots(JSON.parse(rawSlots));
          for (const slot of ['head', 'face', 'back', 'skin']) {
            if (normalized[slot] !== 'none' && this.unlockedAccessories.has(normalized[slot])) {
              base[slot] = normalized[slot];
            }
          }
          return base;
        }
        const legacy = global.localStorage.getItem(STORAGE_KEYS.EQUIPPED);
        if (legacy && accMod) {
          const normalized = accMod.normalizeSlots(legacy);
          for (const slot of ['head', 'face', 'back', 'skin']) {
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
        const valid =
          id &&
          this.unlockedColors.has(id) &&
          (!C.JELLY_COLORS || C.JELLY_COLORS.some((c) => c.id === id));
        if (valid) return id;
      } catch (_) {}
      return 'mint';
    }

    _saveEquippedColor(id) {
      try {
        global.localStorage.setItem(STORAGE_KEYS.EQUIPPED_COLOR, id);
      } catch (_) {}
    }

    _loadAbilityLevels() {
      const defaults = { shield: 0, airDash: 0, chrono: 0, angel: 0 };
      try {
        const raw = global.localStorage.getItem(STORAGE_KEYS.ABILITY_LEVELS);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object') {
          for (const key of Object.keys(defaults)) {
            const val = Math.floor(Number(parsed[key]) || 0);
            defaults[key] = val < 0 ? 0 : val > 10 ? 10 : val;
          }
        }
      } catch (_) {}
      return defaults;
    }

    _saveAbilityLevels() {
      try {
        global.localStorage.setItem(STORAGE_KEYS.ABILITY_LEVELS, JSON.stringify(this.abilityLevels));
      } catch (_) {}
    }

    _loadEquippedAbility() {
      try {
        const id = global.localStorage.getItem(STORAGE_KEYS.EQUIPPED_ABILITY);
        if (id && id !== 'none' && this.abilityLevels && this.abilityLevels[id] >= 1) {
          return id;
        }
      } catch (_) {}
      return 'none';
    }

    _saveEquippedAbility(id) {
      try {
        global.localStorage.setItem(STORAGE_KEYS.EQUIPPED_ABILITY, id || 'none');
      } catch (_) {}
    }

    getAbilityLevel(id) {
      return (this.abilityLevels && this.abilityLevels[id]) || 0;
    }

    _syncRunAbilityState() {
      const Ab = JellyGame.Abilities;
      this.abilityCooldown = 0;
      this.abilityMaxCooldown = 0;
      this.chronoBuffer = [];
      this.chronoSampleTimer = 0;
      this.chronoRewindAnim = null;
      this.angelReviveAnim = null;
      this.shockwaveRings = [];

      if (Ab && this.equippedAbility === 'angel') {
        const lvl = this.getAbilityLevel('angel');
        this.angelMaxCharges = Ab.getCharges('angel', lvl);
        this.angelCharges = this.angelMaxCharges;
      } else {
        this.angelMaxCharges = 0;
        this.angelCharges = 0;
      }
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
        global.localStorage.removeItem(STORAGE_KEYS.ABILITY_LEVELS);
        global.localStorage.removeItem(STORAGE_KEYS.EQUIPPED_ABILITY);
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
      this.equippedSlots = { head: 'none', face: 'none', back: 'none', skin: 'none' };
      this.equippedAccessory = 'none';
      this.unlockedColors = new Set(['mint']);
      this.equippedColor = 'mint';
      this.abilityLevels = { shield: 0, airDash: 0, chrono: 0, angel: 0 };
      this.equippedAbility = 'none';
      this._syncRunAbilityState();
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
      if (JellyGame.Missions) {
        JellyGame.Missions.resetAll();
      }
      if (this.state !== 'menu') {
        const msg = this.resetStatusMsg;
        this.settingsReturnModal = null;
        this.openMenu();
        this.activeModal = 'settings';
        this.modalAnim = 1;
        this.resetStatusMsg = msg;
      }
      this.audio.playUnlock();
    }

    _getProgressionStats() {
      return {
        bestMeters: this.bestMeters,
        bestRisingMeters: this.bestRisingMeters,
        bestTempo: this.bestTempo,
        totalCloseCalls: this.totalCloseCalls,
        bossesDefeated: this.bossesDefeated
      };
    }

    _recordMissionProgress(type, value = 1) {
      if (this.gameMode === 'tutorial' || this.isQaWarpRun || !JellyGame.Missions) return;
      const newlyDone = JellyGame.Missions.recordProgress(type, value);
      if (newlyDone && newlyDone.length > 0) {
        const m = newlyDone[0];
        this.rewardToast = {
          kind: 'mission',
          mission: m,
          bonusDrops: m.reward || 0,
          timer: 3.0,
          maxTimer: 3.0
        };
        this.audio.playUnlock();
        if (JellyGame.Haptics) JellyGame.Haptics.closeCall();
      }
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
      const unclaimedMissions = JellyGame.Missions ? JellyGame.Missions.getUnclaimedCount() : 0;
      return this.unseenRewards.size > 0 || unclaimedMissions > 0 || this._hasAffordableUnlock();
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
      if (JellyGame.Abilities && JellyGame.Abilities.LIST) {
        for (let i = 0; i < JellyGame.Abilities.LIST.length; i++) {
          const ab = JellyGame.Abilities.LIST[i];
          if (this.getAbilityLevel(ab.id) === 0 && this.gems >= ab.unlockCost) {
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
          x: C.WALL_WIDTH + 8 + Math.random() * (C.WIDTH - C.WALL_WIDTH * 2 - 16),
          y: Math.random() * C.HEIGHT,
          radius: 1 + Math.random() * 1.9,
          alpha: 0.16 + Math.random() * 0.3,
          speedY: 10 + Math.random() * 16,
          driftPhase: Math.random() * Math.PI * 2,
          twinklePhase: Math.random() * Math.PI * 2,
          streakLen: 12 + Math.random() * 12
        });
      }
      return motes;
    }

    _setupResize() {
      const updateSize = () => {
        this.dpr = Math.min(global.devicePixelRatio || 1, 2);
        const rect = this.canvas.getBoundingClientRect();
        const ratioHOverW =
          rect.width > 10 && rect.height > 10 ? rect.height / rect.width : C.HEIGHT / C.WIDTH;
        const targetRatio = C.HEIGHT / C.WIDTH;
        if (ratioHOverW >= targetRatio) {
          this.viewW = C.WIDTH;
          this.viewH = C.WIDTH * ratioHOverW;
        } else {
          this.viewH = C.HEIGHT;
          this.viewW = Math.max(C.WIDTH, C.HEIGHT / ratioHOverW);
        }
        this.padLeft = (this.viewW - C.WIDTH) * 0.5;
        this.padRight = this.viewW - C.WIDTH - this.padLeft;
        this.padTop = (this.viewH - C.HEIGHT) * 0.5;
        this.padBottom = this.viewH - C.HEIGHT - this.padTop;
        JellyGame.VIEW_PAD_Y = Math.ceil(Math.max(this.padTop, this.padBottom)) + 60;
        this.canvas.width = Math.round(this.viewW * this.dpr);
        this.canvas.height = Math.round(this.viewH * this.dpr);
      };
      updateSize();
      if (typeof global.requestAnimationFrame === 'function') {
        global.requestAnimationFrame(updateSize);
      }
      global.addEventListener('resize', updateSize);
      global.addEventListener('orientationchange', updateSize);
    }

    _toLogicalPoint(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * this.viewW - this.padLeft,
        y: ((clientY - rect.top) / rect.height) * this.viewH - this.padTop
      };
    }

    _fillViewportRect(ctx) {
      ctx.fillRect(-this.padLeft - 20, -this.padTop - 20, this.viewW + 40, this.viewH + 40);
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
        const cleaned = input.value.replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim();
        if (cleaned.length < 2) {
          input.value = cleaned;
          try { input.focus(); } catch (_) {}
          return;
        }
        if (this.leaderboard) {
          this.leaderboard
            .setNickname(cleaned, {
              color: this.equippedColor,
              accessory: this.equippedAccessory
            })
            .then(() => {
              if (this.activeModal === 'leaderboard') {
                this.leaderboard.fetchLeaderboard(this.lbTab);
              }
            });
        }
        this.profilePillBounce = 1;
        this.audio.playUnlock();
        closeOverlay();
      });

      input.addEventListener('keydown', (e) => {
        if (e.code === 'Escape') {
          e.preventDefault();
          closeOverlay();
        }
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
          if (pointInRect(pt.x, pt.y, this.uiRects.musicSliderHit)) {
            this.musicSliderDragging = true;
            this.activePointerId = e.pointerId;
            try {
              this.canvas.setPointerCapture(e.pointerId);
            } catch (_) {}
            this._setMusicVolumeFromSliderX(pt.x);
            return;
          }
          this._handleSettingsTap(pt.x, pt.y);
          return;
        }
        if (this.activeModal === 'privacy') {
          this._handlePrivacyTap(pt.x, pt.y);
          return;
        }
        if (this.activeModal === 'pause') {
          this._handlePauseTap(pt.x, pt.y);
          return;
        }

        if (this.state === 'menu') {
          this._handleMenuPointerDown(pt.x, pt.y, e.pointerId);
          return;
        }

        // Top-left menu/pause button during active play opens Pause modal; returns to Menu when dead
        if (pointInRect(pt.x, pt.y, this.uiRects.topMenuBtn)) {
          if (this.state === 'playing') {
            this.pauseGame(true);
          } else {
            this.audio.playUiTap();
            this.openMenu();
          }
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
            if (pointInRect(pt.x, pt.y, this.uiRects.deathAdReviveBtn)) {
              this.audio.playUiTap();
              this._triggerAdRevive();
            } else if (pointInRect(pt.x, pt.y, this.uiRects.deathAdDoubleBtn)) {
              this.audio.playUiTap();
              this._triggerAdDoubleDrops();
            } else if (pointInRect(pt.x, pt.y, this.uiRects.deathShopBtn)) {
              this.audio.playUiTap();
              this._openAccessoriesDrawer();
            } else if (pointInRect(pt.x, pt.y, this.uiRects.deathLbBtn)) {
              this.audio.playUiTap();
              this.openLeaderboard(this.gameMode === 'rising' ? 'rising' : 'classic');
            } else if (pointInRect(pt.x, pt.y, this.uiRects.deathMenuBtn)) {
              this.audio.playUiTap();
              this._exitDeathWithInterstitial(() => this.openMenu());
            } else {
              this.audio.playUiTap();
              this._exitDeathWithInterstitial(() => this.resetRun());
            }
          }
          return;
        }

        // Bottom-right Ability Orb quick tap (never interferes with slingshot aim)
        if (
          this.state === 'playing' &&
          this.equippedAbility &&
          this.equippedAbility !== 'none' &&
          pointInRect(pt.x, pt.y, this.uiRects.abilityOrbBtn)
        ) {
          this._tryActivateAbility(pt.x, pt.y, true);
          return;
        }

        // Quick airborne double-tap triggers active ability cleanly (left/right side steers Air Dash)
        const nowSec =
          (global.performance && typeof global.performance.now === 'function'
            ? global.performance.now()
            : Date.now()) * 0.001;
        if (
          this.state === 'playing' &&
          !this.player.isAttached() &&
          nowSec - this.lastTapInfo.time <= 0.32 &&
          Math.hypot(pt.x - this.lastTapInfo.x, pt.y - this.lastTapInfo.y) <= 72
        ) {
          this.lastTapInfo.time = 0;
          if (this._tryActivateAbility(pt.x, pt.y, false)) {
            return;
          }
        }
        if (this.state === 'playing' && !this.player.isAttached()) {
          this.lastTapInfo = { time: nowSec, x: pt.x, y: pt.y };
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
        if (this.activeModal === 'settings' && this.musicSliderDragging && e.pointerId === this.activePointerId) {
          e.preventDefault();
          const pt = this._toLogicalPoint(e.clientX, e.clientY);
          this._setMusicVolumeFromSliderX(pt.x);
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

        if (this.activeModal === 'settings' && this.musicSliderDragging && e.pointerId === this.activePointerId) {
          this.musicSliderDragging = false;
          this.activePointerId = null;
          if (!canceled) {
            this.audio.playUiTap();
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
          const dragDist = Math.hypot(dx, dy);
          this.player.updateAim(dx, dy, this.tempoTier);

          const shot = this.player.releaseLaunch();
          if (shot) {
            this.lastTapInfo.time = 0;
            this._onPlayerLaunch(shot);
          } else if (dragDist < C.MIN_DRAG_PX) {
            const nowSec =
              (global.performance && typeof global.performance.now === 'function'
                ? global.performance.now()
                : Date.now()) * 0.001;
            if (
              nowSec - this.lastTapInfo.time <= 0.34 &&
              Math.hypot(this.pointer.currX - this.lastTapInfo.x, this.pointer.currY - this.lastTapInfo.y) <= 65
            ) {
              this.lastTapInfo.time = 0;
              this._tryActivateAbility(this.pointer.currX, this.pointer.currY, false);
            } else {
              this.lastTapInfo = { time: nowSec, x: this.pointer.currX, y: this.pointer.currY };
            }
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
        this._cancelActiveInput();
      });
      global.addEventListener('focus', () => {
        if (!(global.document && global.document.hidden)) {
          this._isAppHidden = false;
          this._lastTime = performance.now();
          this.audio.resumeFromBackground();
        }
      });

      const handleAppHide = () => {
        this._isAppHidden = true;
        this._cancelActiveInput();
        this.audio.suspendForBackground();
        if (this.state === 'playing' && !this.activeModal) {
          this.pauseGame(false);
        }
      };

      const handleAppShow = () => {
        if (global.document && global.document.hidden) return;
        this._isAppHidden = false;
        this._lastTime = performance.now();
        this.audio.resumeFromBackground();
      };

      if (global.document && typeof global.document.addEventListener === 'function') {
        global.document.addEventListener('visibilitychange', () => {
          if (global.document.hidden) {
            handleAppHide();
          } else {
            handleAppShow();
          }
        });
        global.document.addEventListener('freeze', handleAppHide);
        global.document.addEventListener('resume', handleAppShow);
      }
      global.addEventListener('pagehide', handleAppHide);
      global.addEventListener('pageshow', (e) => {
        if (!e || e.persisted || !(global.document && global.document.hidden)) {
          handleAppShow();
        }
      });

      global.addEventListener('keydown', (e) => {
        const targetTag = e.target && e.target.tagName;
        if (
          targetTag === 'INPUT' ||
          targetTag === 'TEXTAREA' ||
          (e.target && e.target.isContentEditable)
        ) {
          return;
        }
        const isLocalQa =
          !global.JELLY_NATIVE_RELEASE &&
          global.location &&
          (global.location.hostname === '127.0.0.1' || global.location.hostname === 'localhost');
        if (isLocalQa && e.code === 'KeyH') {
          this.showHitboxes = !this.showHitboxes;
          return;
        }
        if (isLocalQa && e.code === 'KeyJ') {
          e.preventDefault();
          this.gems += 1000;
          this.hudGemPulse = 1;
          return;
        }
        if (isLocalQa && e.code === 'KeyK') {
          e.preventDefault();
          const skins = ['soccer', 'basketball', 'tennis', 'eightBall', 'none'];
          this._qaSkinIdx = this._qaSkinIdx === undefined ? 0 : (this._qaSkinIdx + 1) % skins.length;
          const sk = skins[this._qaSkinIdx];
          if (sk !== 'none') this.unlockedAccessories.add(sk);
          this.equippedSlots.skin = sk;
          this._saveEquippedSlots();
          this.wardrobePreviewBounce = 1;
          return;
        }
        if (isLocalQa && e.code === 'KeyT') {
          e.preventDefault();
          const showcaseMeters = [265, 508, 620, 815, 1170, 1580, 2100, 2508, 2660];
          this._qaThemeIdx =
            this._qaThemeIdx === undefined ? 0 : (this._qaThemeIdx + 1) % showcaseMeters.length;
          const m = showcaseMeters[this._qaThemeIdx];
          if (this.state !== 'playing') {
            this.gameMode = 'classic';
            this.resetRun();
          }
          this.isQaWarpRun = true;
          this.activeBoss = null;
          this.hasLaunchedOnce = true;
          const py = C.START_PLAYER_Y - m * C.PIXELS_PER_METER;
          this.highestY = py;
          this.currentMeters = m;
          this.cameraY = py - C.HEIGHT * 0.56;
          this.player.wallAttached = -1;
          this.player.floorAttached = false;
          this.player.cancelAim();
          this.player.velocityX = 0;
          this.player.velocityY = 0;
          this.player.positionX = C.WALL_WIDTH + this.player.radius;
          this.player.positionY = py;
          this.projectiles.length = 0;
          this.generator.obstacles = [];
          this.generator.surfaces = [];
          this.generator.collectibles = [];
          this.generator.nextChunkBottomY = py - 340;
          this.generator.highestObstacleTopY = py - 280;
          if (JellyGame.Bosses) {
            this.nextBossIndex = 0;
            while (JellyGame.Bosses.getMilestoneMeters(this.nextBossIndex) <= m) {
              this.nextBossIndex += 1;
            }
          }
          const Obs = JellyGame.Obstacles;
          if (Obs) {
            if (Obs.OrbitalMineObstacle) {
              this.generator.obstacles.push(new Obs.OrbitalMineObstacle(py - 235, 38, 1.7, 0.5));
            }
            if (Obs.CrusherPistonObstacle && m >= 500) {
              this.generator.obstacles.push(new Obs.CrusherPistonObstacle(1, py - 120, 3.4, 2.2));
            } else if (Obs.PendulumSawObstacle) {
              this.generator.obstacles.push(new Obs.PendulumSawObstacle(py - 125, 96, 1.85, 0.4));
            }
            if (Obs.ArrowShooter) {
              this.generator.obstacles.push(new Obs.ArrowShooter(1, py - 30, 2.65, 1.9));
            }
            if (Obs.WindVortexSurface) {
              this.generator.surfaces.push(new Obs.WindVortexSurface(C.WIDTH * 0.56, py + 75, 29));
            }
          }
          this._checkThemeMilestone();
          return;
        }
        if (isLocalQa && (e.code === 'KeyB' || e.code === 'KeyV')) {
          e.preventDefault();
          if (this.state !== 'playing') {
            this.gameMode = 'classic';
            this.resetRun();
          }
          let bossIdx = 0;
          if (e.code === 'KeyV') {
            bossIdx = 8; // Ascended Craggo (3500m Heaven!)
          } else {
            this._qaBossIdx = this._qaBossIdx === undefined ? 0 : (this._qaBossIdx + 1) % 9;
            bossIdx = this._qaBossIdx;
          }
          const targetM = JellyGame.Bosses ? JellyGame.Bosses.getMilestoneMeters(bossIdx) : 250;
          this.isQaWarpRun = true;
          this.hasLaunchedOnce = true;
          this.highestY = C.START_PLAYER_Y - targetM * C.PIXELS_PER_METER;
          this.currentMeters = targetM;
          const boss = this._spawnBossForIndex(bossIdx);
          if (boss) {
            boss.introTimer = 0;
            if (e.code === 'KeyV' || bossIdx >= 7) {
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
          this._closeActiveModal();
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
            this._exitDeathWithInterstitial(() => this.resetRun());
          }
        } else if (this.state === 'playing') {
          if (e.code === 'Escape' || e.code === 'KeyP') {
            e.preventDefault();
            this.pauseGame(true);
          } else if (e.code === 'Space') {
            e.preventDefault();
            this._tryActivateAbility();
          } else if (e.code === 'KeyR') {
            this.resetRun();
          }
        }
      });
    }

    _cancelActiveInput() {
      this.player.cancelAim();
      this.audio.resetStretchTick();
      this.pointer.isDown = false;
      this.activePointerId = null;
      this.pressedBtn = null;
      this.lbDragging = false;
      this.wardrobeDragging = false;
      this.musicSliderDragging = false;
    }

    pauseGame(playSound = true) {
      if (this.state !== 'playing') return;
      this._cancelActiveInput();
      this.settingsReturnModal = null;
      if (this.activeModal === 'pause') return;
      if (playSound && !this.audio.isBackgrounded) {
        this.audio.playUiTap();
      }
      this.modalAnim = 0;
      this.activeModal = 'pause';
    }

    resumeGame(playSound = true) {
      this.settingsReturnModal = null;
      if (this.activeModal === 'pause') {
        this.activeModal = null;
      }
      this._cancelActiveInput();
      this._lastTime = performance.now();
      if (playSound) {
        this.audio.unlock();
        this.audio.playUiTap();
      }
    }

    _closeActiveModal() {
      if (!this.activeModal) return;
      if (this.activeModal === 'pause') {
        this.resumeGame(false);
        return;
      }
      if (this.activeModal === 'settings' || this.activeModal === 'privacy') {
        this.confirmResetPending = false;
        this.resetStatusMsg = '';
        if (this.settingsReturnModal === 'pause' && this.state === 'playing') {
          this.settingsReturnModal = null;
          this.modalAnim = 0;
          this.activeModal = 'pause';
          return;
        }
        this.settingsReturnModal = null;
      }
      this.activeModal = null;
    }

    _handlePauseTap(px, py) {
      if (
        pointInRect(px, py, this.uiRects.modalCloseBtn) ||
        pointInRect(px, py, this.uiRects.pauseResumeBtn)
      ) {
        this.resumeGame(true);
        return;
      }
      if (pointInRect(px, py, this.uiRects.pauseRestartBtn)) {
        this.audio.playUiTap();
        this.settingsReturnModal = null;
        this.resetRun();
        return;
      }
      if (pointInRect(px, py, this.uiRects.pauseSettingsBtn)) {
        this.audio.playUiTap();
        this.settingsReturnModal = 'pause';
        this.confirmResetPending = false;
        this.resetStatusMsg = '';
        this.modalAnim = 0;
        this.activeModal = 'settings';
        return;
      }
      if (pointInRect(px, py, this.uiRects.pauseMenuBtn)) {
        this.audio.playUiTap();
        this.settingsReturnModal = null;
        this.openMenu();
      }
    }

    _handleMenuPointerDown(px, py, pointerId) {
      if (pointInRect(px, py, this.uiRects.menuProfileBtn)) {
        this.pressedBtn = 'profile';
      } else if (pointInRect(px, py, this.uiRects.menuPlayBtn)) {
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
      if (btnId === 'profile' && pointInRect(px, py, this.uiRects.menuProfileBtn)) {
        this.audio.playUiTap();
        this._openNicknameEditor();
      } else if (btnId === 'play' && pointInRect(px, py, this.uiRects.menuPlayBtn)) {
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
        this._closeActiveModal();
        return;
      }

      if (this.uiRects.modalPanel && !pointInRect(px, py, this.uiRects.modalPanel)) {
        this._closeActiveModal();
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
      } else if (pointInRect(px, py, this.uiRects.hapticsOnBtn)) {
        this.hapticsEnabled = true;
        if (JellyGame.Haptics) {
          JellyGame.Haptics.setEnabled(true);
          JellyGame.Haptics.tap();
        }
        this._saveBool(STORAGE_KEYS.HAPTICS, true);
        this.audio.playUiTap();
      } else if (pointInRect(px, py, this.uiRects.hapticsOffBtn)) {
        this.hapticsEnabled = false;
        if (JellyGame.Haptics) JellyGame.Haptics.setEnabled(false);
        this._saveBool(STORAGE_KEYS.HAPTICS, false);
        this.audio.playUiTap();
      } else if (pointInRect(px, py, this.uiRects.musicSliderHit)) {
        this._setMusicVolumeFromSliderX(px);
        this.audio.playUiTap();
      } else if (pointInRect(px, py, this.uiRects.musicToggleBtn)) {
        this.musicEnabled = !this.musicEnabled;
        if (this.musicEnabled && this.musicVolume <= 0.05) {
          this.musicVolume = 0.7;
          this._saveInt(STORAGE_KEYS.MUSIC_VOLUME, 70);
        }
        this.audio.setMusicVolume(this.musicVolume);
        this.audio.setMusicEnabled(this.musicEnabled);
        if (this.musicEnabled) this.audio.unlock();
        this._saveBool(STORAGE_KEYS.MUSIC, this.musicEnabled);
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

    _setMusicVolumeFromSliderX(px) {
      const track = this.uiRects.musicSliderTrack;
      if (!track) return;
      const ratio = clamp((px - track.x) / Math.max(1, track.w), 0, 1);
      const pct = Math.round(ratio * 100);
      this.musicVolume = pct / 100;
      this.musicEnabled = pct > 0;
      this.audio.setMusicVolume(this.musicVolume);
      if (this.musicEnabled) {
        this.audio.unlock();
      }
      this._saveInt(STORAGE_KEYS.MUSIC_VOLUME, pct);
      this._saveBool(STORAGE_KEYS.MUSIC, this.musicEnabled);
    }

    _handlePrivacyTap(px, py) {
      if (pointInRect(px, py, this.uiRects.modalCloseBtn)) {
        this.audio.playUiTap();
        this._closeActiveModal();
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
        this._closeActiveModal();
      }
    }

    _openAccessoriesDrawer(preferredTab = null) {
      if (
        preferredTab === 'head' ||
        preferredTab === 'face' ||
        preferredTab === 'back' ||
        preferredTab === 'powers' ||
        preferredTab === 'rewards'
      ) {
        this.wardrobeTab = preferredTab;
      } else if (this.unseenRewards.size > 0 || this.runUnlockedGear.length > 0) {
        this.wardrobeTab = 'rewards';
      } else if (
        this.wardrobeTab !== 'head' &&
        this.wardrobeTab !== 'face' &&
        this.wardrobeTab !== 'back' &&
        this.wardrobeTab !== 'powers' &&
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
      if (slot !== 'head' && slot !== 'face' && slot !== 'back' && slot !== 'skin') return;
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
        ['wardrobeTabPowersBtn', 'powers'],
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
            if (this.equippedSlots && this.equippedSlots.skin && this.equippedSlots.skin !== 'none') {
              this.equippedSlots.skin = 'none';
              this._saveEquippedSlots();
            }
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
            if (this.equippedSlots && this.equippedSlots.skin && this.equippedSlots.skin !== 'none') {
              this.equippedSlots.skin = 'none';
              this._saveEquippedSlots();
            }
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

      if (this.wardrobeTab === 'rewards' && this.uiRects.missionClaimBtns && JellyGame.Missions) {
        for (let i = 0; i < this.uiRects.missionClaimBtns.length; i++) {
          const btn = this.uiRects.missionClaimBtns[i];
          if (!pointInRect(px, py, btn.rect)) continue;
          const reward = JellyGame.Missions.claimMission(btn.missionId);
          if (reward > 0) {
            this.gems += reward;
            this.hudGemPulse = 1;
            this._saveInt(STORAGE_KEYS.GEMS, this.gems);
            this.wardrobePreviewBounce = 1;
            if (this.audio.playMissionClaim) this.audio.playMissionClaim();
            else this.audio.playUnlock();
            if (JellyGame.Haptics) JellyGame.Haptics.closeCall();
          }
          return;
        }
      }

      if (this.wardrobeTab === 'powers' && this.uiRects.powerCards) {
        const Ab = JellyGame.Abilities;
        for (let i = 0; i < this.uiRects.powerCards.length; i++) {
          const pCard = this.uiRects.powerCards[i];
          if (!pointInRect(px, py, pCard.rect)) continue;
          const ab = pCard.ability;
          const lvl = this.getAbilityLevel(ab.id);
          const nextCost = Ab ? Ab.getNextUpgradeCost(ab.id, lvl) : null;

          // Tapped bottom Upgrade / Unlock button (or locked card body) -> buy or level up!
          if ((lvl === 0 || pointInRect(px, py, pCard.upgradeRect)) && nextCost !== null) {
            if (this.gems >= nextCost) {
              this.gems -= nextCost;
              this._saveInt(STORAGE_KEYS.GEMS, this.gems);
              this.abilityLevels[ab.id] = lvl + 1;
              this._saveAbilityLevels();
              this.equippedAbility = ab.id;
              this._saveEquippedAbility(ab.id);
              this._syncRunAbilityState();
              this.wardrobePreviewBounce = 1;
              if (this.audio.playRelicUpgrade) this.audio.playRelicUpgrade();
              else this.audio.playUnlock();
            } else {
              this.audio.playStick(300);
            }
            return;
          }

          // Tapped upper card area of an unlocked Power -> toggle Equip / Unequip
          if (lvl >= 1) {
            this.equippedAbility = this.equippedAbility === ab.id ? 'none' : ab.id;
            this._saveEquippedAbility(this.equippedAbility);
            this._syncRunAbilityState();
            this.wardrobePreviewBounce = 1;
            this.audio.playCollect(false);
          }
          return;
        }
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
      this._syncRunAbilityState();

      this.cameraY = C.START_CAMERA_Y;
      this.highestY = C.START_PLAYER_Y;
      this.currentMeters = 0;
      this.tempoTier = 1;
      this.tempoTimer = 0;
      this.slowMoTimer = 0;
      this.magnetTimer = 0;
      this.themeBannerTimer = 0;
      this.state = 'menu';
      this.activeModal = null;
      this.settingsReturnModal = null;
      this.confirmResetPending = false;
      this.resetStatusMsg = '';
      this.pressedBtn = null;
      this.pointer.isDown = false;
      this.activePointerId = null;
      if (this.audio.setBossIntensity) this.audio.setBossIntensity(false);
      this.audio.setMusicContext('menu', this.gameMode, 1);
    }

    resetRun() {
      if (this.state === 'playing') {
        this._submitCurrentRunScore();
      }
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
      this.magnetTimer = 0;
      this.adReviveUsedThisRun = false;
      this.adDoubleUsedThisRun = false;
      this.adBusy = false;
      if (this.audio.setBossIntensity) this.audio.setBossIntensity(false);
      this._syncRunAbilityState();

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
      this.settingsReturnModal = null;
      this.confirmResetPending = false;
      this.resetStatusMsg = '';
      this.pressedBtn = null;
      this.deathTimer = 0;
      this.hitStopTimer = 0;
      this.shakeMag = 0;
      this.camPunchX = 0;
      this.camPunchY = 0;
      this.camPunchVx = 0;
      this.camPunchVy = 0;
      this.camZoom = 1;
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
      // Always paint an immediate frame so canvas never remains blank if visibility events lag
      this.render();
      this._rafId = global.requestAnimationFrame(this._boundLoop);
    }

    _loop(now) {
      const isHiddenNow = Boolean(global.document && global.document.hidden);
      if (this._isAppHidden && !isHiddenNow) {
        this._isAppHidden = false;
        this._lastTime = now;
      }

      const rawDt = (now - this._lastTime) / 1000;
      this._lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0), C.MAX_FRAME_DT);

      if (!this._isAppHidden) {
        this.update(dt);
        this.render();
      }

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
      if (this.profilePillBounce > 0) {
        this.profilePillBounce = Math.max(0, this.profilePillBounce - dt * 3.5);
      }

      // Advance modal spring-open animation and pause world action while modal is open
      if (this.activeModal) {
        this.modalAnim = Math.min(1, this.modalAnim + dt * 5.2);
        return;
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

      if (this.state === 'menu') {
        this.player.updateVisuals(dt);
        return;
      }

      if (this.shakeMag > 0) {
        this.shakeMag = Math.max(0, this.shakeMag - dt * 28);
      }

      // Damped spring directional camera punch + subtle velocity-driven micro FOV zoom
      const camDt = Math.min(dt, 0.05);
      this.camPunchVx += (-this.camPunchX * 240 - this.camPunchVx * 15) * camDt;
      this.camPunchVy += (-this.camPunchY * 240 - this.camPunchVy * 15) * camDt;
      this.camPunchX = clamp(this.camPunchX + this.camPunchVx * camDt, -14, 14);
      this.camPunchY = clamp(this.camPunchY + this.camPunchVy * camDt, -14, 14);

      let targetZoom = 1;
      if (this.state === 'playing' && !this.activeBoss) {
        if (!this.player.isAttached()) {
          const flySpeed = Math.hypot(this.player.velocityX, this.player.velocityY);
          targetZoom = 1 - clamp((flySpeed - 420) / 1400, 0, 0.024);
        } else if (this.player.isAiming && this.player.aimValid) {
          targetZoom = 1 + this.player.dragStrength * 0.01;
        }
      }
      this.camZoom += (targetZoom - this.camZoom) * Math.min(1, camDt * 6.5);

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

      this._updateShockwaveRings(dt);

      if (this.chronoRewindAnim) {
        this._updateChronoRewind(dt);
        this.particles.update(dt);
        return;
      }

      if (this.angelReviveAnim) {
        this._updateAngelRevive(dt);
        this.particles.update(dt);
        return;
      }

      // Micro slow-mo dilation during Close Call moments
      let simDt = dt;
      if (this.slowMoTimer > 0) {
        this.slowMoTimer = Math.max(0, this.slowMoTimer - dt);
        simDt = dt * 0.44;
      }

      if (this.abilityCooldown > 0 && this.hasLaunchedOnce) {
        this.abilityCooldown = Math.max(0, this.abilityCooldown - simDt);
      }
      if (this.magnetTimer > 0) {
        this.magnetTimer = Math.max(0, this.magnetTimer - simDt);
      }
      if (this.audio && this.audio.setBossIntensity) {
        this.audio.setBossIntensity(Boolean(this.activeBoss && !this.activeBoss.defeated));
      }
      this._recordChronoSnapshot(simDt, false);

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

      // Sync biome gravity scale & apply special/atmospheric wall surface physics
      const playerMeters = Math.max(0, (C.START_PLAYER_Y - this.player.positionY) / C.PIXELS_PER_METER);
      const playerAtm = this._getAtmosphereAtMeters(playerMeters);
      this.player.gravityScale = this.gameMode === 'tutorial' ? 1.0 : playerAtm.gravityScale;
      this._updateWallSurfaces(simDt, playerAtm);

      // Sub-stepped physics & pickups
      let remaining = simDt;
      while (remaining > 0 && this.state === 'playing') {
        const step = Math.min(remaining, C.MAX_SUBSTEP_DT);
        remaining -= step;

        const attachEvt = this.player.stepPhysics(step);
        if (attachEvt) {
          this._onPlayerAttach(attachEvt);
          this._recordChronoSnapshot(0, true);
        }

        this._updateAndCheckCollectibles(step);
        this._checkWindVortexBoost();

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
          const prevMeters = this.currentMeters;
          const prevDecade = Math.floor(this.currentMeters / 10);
          this.highestY = this.player.positionY;
          this.currentMeters = Math.max(
            0,
            Math.floor((C.START_PLAYER_Y - this.highestY) / C.PIXELS_PER_METER)
          );
          if (this.currentMeters > prevMeters) {
            this._recordMissionProgress('climbMeters', this.currentMeters - prevMeters);
          }
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
              this.t().newBest || 'NEW BEST!',
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
            ? tr.tutComplete || 'TUTORIAL COMPLETE! +15 DROPS'
            : tr.tutCompleteDone || 'TUTORIAL COMPLETE!',
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
        } else if (!this._consumeHeartOrSurvive(true) && !this._tryFatalRescue(true)) {
          this.audio.playLavaSizzle();
          this._triggerDeath();
        }
      }
    }

    _consumeHeartOrSurvive(isLavaBounce = false) {
      if (this.player.invulnTimer > 0) return true;
      if (this.player.hp <= 1) return false;

      this.player.hp -= 1;
      this.player.invulnTimer = 1.05;
      const toCenter = this.player.positionX < C.WIDTH * 0.5 ? 1 : -1;
      this.player.wallAttached = 0;
      this.player.floorAttached = false;
      this.player.cancelAim();
      this.player.velocityX = isLavaBounce ? toCenter * 220 : toCenter * 310;
      this.player.velocityY = isLavaBounce ? -800 : -490;
      this.player.stretchAmount = 0.28;
      this.hitStopTimer = Math.max(this.hitStopTimer, 0.04);
      this.shakeMag = Math.max(this.shakeMag, 6.5);
      if (isLavaBounce) {
        this.risingFloorY += 105;
        this.audio.playLavaSizzle();
      } else {
        this.audio.playSafetyRebound();
      }
      this.particles.spawnSparkBurst(
        this.player.positionX,
        this.player.positionY,
        toCenter,
        '#ff6b81',
        12
      );
      this.particles.spawnFloatingLabel(
        this.player.positionX,
        this.player.positionY - 24,
        `-1 ${this.t().hpShort || 'HP'} (${this.player.hp}/${this.player.maxHp})`,
        '#ff6b81',
        15
      );
      return true;
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

      return this._consumeHeartOrSurvive(false) || this._tryFatalRescue(false);
    }

    _spawnShockwaveRing(x, y, maxR = 68, color = '#74f2ff', lineWidth = 3) {
      this.shockwaveRings.push({ x, y, r: 10, maxR, color, lineWidth, alpha: 1 });
    }

    _updateShockwaveRings(dt) {
      for (let i = this.shockwaveRings.length - 1; i >= 0; i--) {
        const ring = this.shockwaveRings[i];
        ring.r += (ring.maxR - ring.r) * Math.min(1, dt * 6.5);
        ring.alpha -= dt * 1.45;
        if (ring.alpha <= 0) {
          this.shockwaveRings.splice(i, 1);
        }
      }
    }

    _recordChronoSnapshot(dt, forceSave = false) {
      if (this.equippedAbility !== 'chrono' || !this.player.alive || this.state !== 'playing') return;
      this.chronoSampleTimer += dt;
      if (!forceSave && this.chronoSampleTimer < 0.1) return;
      this.chronoSampleTimer = 0;

      const p = this.player;
      const snap = {
        t: this.hintTime,
        x: p.positionX,
        y: p.positionY,
        vx: p.velocityX,
        vy: p.velocityY,
        wallAttached: p.wallAttached,
        floorAttached: p.floorAttached,
        attached: p.isAttached(),
        cameraY: this.cameraY,
        risingFloorY: this.risingFloorY,
        bossIndex: this.activeBoss && !this.activeBoss.defeated ? this.activeBoss.index : -1
      };

      const buf = this.chronoBuffer;
      buf.push(snap);
      while (buf.length > 65 || (buf.length > 1 && this.hintTime - buf[0].t > 5.5)) {
        buf.shift();
      }
    }

    _tryActivateAbility(tapX, tapY, fromOrb = false) {
      const Ab = JellyGame.Abilities;
      const id = this.equippedAbility;
      if (!Ab || !id || id === 'none' || this.state !== 'playing' || this.activeModal) return false;
      if (this.chronoRewindAnim || this.angelReviveAnim) return false;

      const lvl = this.getAbilityLevel(id);
      if (lvl < 1 || id === 'angel') return false;

      if (this.abilityCooldown > 0) {
        this.audio.playStick(240);
        return false;
      }

      const tr = this.t();
      const p = this.player;

      if (id === 'shield') {
        if (p.hasShield) {
          this.audio.playStick(340);
          return false;
        }
        const cd = Ab.getCooldown('shield', lvl);
        this.abilityCooldown = cd;
        this.abilityMaxCooldown = cd;
        p.hasShield = true;
        this.audio.playShieldGain();
        this._spawnShockwaveRing(p.positionX, p.positionY, 88, '#36f5b0', 4.0);
        this._spawnShockwaveRing(p.positionX, p.positionY, 60, '#74f2ff', 2.4);
        this.particles.spawnSparkBurst(p.positionX, p.positionY, 0, '#74f2ff', 18);
        this.particles.spawnFloatingLabel(
          p.positionX,
          p.positionY - 26,
          tr.powerTriggerShell || 'CRYSTAL SHELL!',
          '#36f5b0',
          14.5
        );
        return true;
      }

      if (id === 'airDash') {
        if (p.isAttached()) return false;
        const cd = Ab.getCooldown('airDash', lvl);
        this.abilityCooldown = cd;
        this.abilityMaxCooldown = cd;

        let dirX;
        if (!fromOrb && typeof tapX === 'number') {
          dirX = tapX < C.WIDTH * 0.5 ? -1 : 1;
        } else {
          dirX = p.positionX < C.WIDTH * 0.5 ? 1 : -1;
        }

        p.velocityX = dirX * 530;
        p.velocityY = -685;
        p.stretchAmount = 0.44;
        p.wobbleTime = 0;
        p.wobbleAmp = 0.25;
        this.hasLaunchedOnce = true;
        this.tempoTimer = C.TEMPO.WINDOW_SEC;
        this.shakeMag = Math.max(this.shakeMag, 3.8);

        if (this.audio.playAirDash) this.audio.playAirDash();
        else this.audio.playLaunch(0.8);

        this._spawnShockwaveRing(p.positionX, p.positionY, 78, '#48dbfb', 3.4);
        this._spawnShockwaveRing(p.positionX - dirX * 14, p.positionY + 12, 58, '#ffeaa7', 2.4);
        this._spawnShockwaveRing(p.positionX - dirX * 26, p.positionY + 22, 38, '#ffffff', 1.8);
        this.particles.spawnSparkBurst(p.positionX, p.positionY, -dirX, '#48dbfb', 16);
        this.particles.spawnFloatingLabel(
          p.positionX,
          p.positionY - 24,
          tr.powerTriggerDash || 'HYDRO DASH!',
          '#74f2ff',
          14
        );
        return true;
      }

      if (id === 'chrono') {
        return this._startChronoRewind();
      }

      return false;
    }

    _startChronoRewind() {
      const Ab = JellyGame.Abilities;
      if (!Ab || this.equippedAbility !== 'chrono' || this.abilityCooldown > 0) return false;
      if (this.chronoRewindAnim || this.angelReviveAnim || this.chronoBuffer.length === 0) return false;

      const lvl = this.getAbilityLevel('chrono');
      if (lvl < 1) return false;

      const curBossIdx = this.activeBoss && !this.activeBoss.defeated ? this.activeBoss.index : -1;
      const nowT = this.hintTime;

      let pool = this.chronoBuffer.filter((s) => s.bossIndex === curBossIdx);
      if (pool.length === 0) pool = this.chronoBuffer;

      // Prefer a safe attached snapshot ~3.5s–4.8s back; fall back gracefully on young runs
      let targetIdx = 0;
      const idealList = pool.filter((s) => nowT - s.t >= 3.0 && nowT - s.t <= 4.9);
      const attachedIdeal = idealList.filter((s) => s.attached);
      const chosen =
        attachedIdeal.length > 0
          ? attachedIdeal[0]
          : idealList.length > 0
          ? idealList[0]
          : pool.find((s) => s.attached) || pool[0];

      targetIdx = Math.max(0, this.chronoBuffer.indexOf(chosen));
      const path = this.chronoBuffer.slice(targetIdx).reverse();
      if (path.length === 0) path.push(chosen);

      const cd = Ab.getCooldown('chrono', lvl);
      this.abilityCooldown = cd;
      this.abilityMaxCooldown = cd;
      this.player.cancelAim();
      this.pointer.isDown = false;
      this.activePointerId = null;
      this.projectiles.length = 0;
      this.player.hp = Math.max(1, this.player.hp);
      this.player.invulnTimer = 0.95;

      this._spawnShockwaveRing(this.player.positionX, this.player.positionY, 96, '#74f2ff', 4.0);
      this._spawnShockwaveRing(this.player.positionX, this.player.positionY, 64, '#a78bfa', 2.6);
      if (this.audio.playChronoRewind) this.audio.playChronoRewind();
      else this.audio.playShieldGain();

      this.particles.spawnFloatingLabel(
        this.player.positionX,
        this.player.positionY - 26,
        this.t().powerTriggerChrono || 'TIME REWIND!',
        '#74f2ff',
        15
      );

      this.chronoRewindAnim = {
        elapsed: 0,
        duration: 0.9,
        startX: this.player.positionX,
        startY: this.player.positionY,
        startCamY: this.cameraY,
        startRisingY: this.risingFloorY,
        path,
        target: chosen
      };
      return true;
    }

    _updateChronoRewind(dt) {
      const anim = this.chronoRewindAnim;
      if (!anim) return;

      anim.elapsed += dt;
      const rawT = clamp(anim.elapsed / anim.duration, 0, 1);
      const ease =
        rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) * 0.5;
      const idxFloat = ease * Math.max(0, anim.path.length - 1);
      const i0 = Math.floor(idxFloat);
      const i1 = Math.min(anim.path.length - 1, i0 + 1);
      const frac = idxFloat - i0;
      const a = anim.path[i0] || anim.target;
      const b = anim.path[i1] || anim.target;

      this.player.positionX = a.x + (b.x - a.x) * frac;
      this.player.positionY = a.y + (b.y - a.y) * frac;
      this.player.velocityX = 0;
      this.player.velocityY = 0;
      this.cameraY = anim.startCamY + (anim.target.cameraY - anim.startCamY) * ease;
      this.risingFloorY = anim.startRisingY + (anim.target.risingFloorY - anim.startRisingY) * ease;

      if (Math.random() < 0.55) {
        this.particles.spawnSparkBurst(
          this.player.positionX,
          this.player.positionY,
          0,
          Math.random() < 0.5 ? '#74f2ff' : '#a78bfa',
          2
        );
      }

      if (rawT >= 1) {
        const tg = anim.target;
        this.player.positionX = tg.x;
        this.player.positionY = tg.y;
        this.player.wallAttached = tg.wallAttached;
        this.player.floorAttached = tg.floorAttached;
        this.player.velocityX = tg.attached ? 0 : tg.vx * 0.4;
        this.player.velocityY = tg.attached ? 0 : Math.min(0, tg.vy * 0.4);
        this.player.invulnTimer = 0.95;
        this.player.hp = Math.max(1, this.player.hp);
        this.cameraY = tg.cameraY;
        this.risingFloorY = Math.max(tg.risingFloorY, tg.y + 115);
        this.projectiles.length = 0;
        this.chronoBuffer = [tg];
        this.chronoRewindAnim = null;
        this._spawnShockwaveRing(tg.x, tg.y, 82, '#74f2ff', 3.4);
        this._spawnShockwaveRing(tg.x, tg.y, 52, '#a78bfa', 2.2);
      }
    }

    _findNearestSafeWallSpot(refY) {
      const p = this.player;
      const nearSide = p.positionX < C.WIDTH * 0.5 ? -1 : 1;
      const sides = [nearSide, -nearSide];
      const offsets = [0, -55, 55, -110, 110, -170, 170, -230];
      const minY = this.activeBoss && !this.activeBoss.defeated ? this.activeBoss.arenaTopY + 55 : -999999;
      const maxY =
        this.activeBoss && !this.activeBoss.defeated
          ? this.activeBoss.arenaFloorY - 55
          : C.FLOOR_Y - p.radius - 10;

      for (let oi = 0; oi < offsets.length; oi++) {
        for (let si = 0; si < sides.length; si++) {
          const side = sides[si];
          const wallEdgeX = side < 0 ? C.WALL_WIDTH + p.radius : C.WIDTH - C.WALL_WIDTH - p.radius;
          const testY = clamp(refY + offsets[oi], minY, maxY);

          if (this._checkLandingState(wallEdgeX, testY, side) !== 'safe') continue;

          // Ensure no nearby obstacle hitbox sits close above/below
          let blocked = false;
          const obstacles = this.generator.obstacles;
          for (let k = 0; k < obstacles.length; k++) {
            const o = obstacles[k];
            if (o.side === side && Math.abs(o.y - testY) < 62) {
              blocked = true;
              break;
            }
          }
          if (!blocked) {
            return { side, x: wallEdgeX, y: testY };
          }
        }
      }

      const fallbackX = nearSide < 0 ? C.WALL_WIDTH + p.radius : C.WIDTH - C.WALL_WIDTH - p.radius;
      return { side: nearSide, x: fallbackX, y: clamp(refY - 50, minY, maxY) };
    }

    _startAngelRevive(isLava = false) {
      if (this.equippedAbility !== 'angel' || this.angelCharges <= 0) return false;
      if (this.angelReviveAnim || this.chronoRewindAnim) return false;

      const Ab = JellyGame.Abilities;
      const lvl = this.getAbilityLevel('angel');
      const spec = Ab && Ab.getAngelSpec
        ? Ab.getAngelSpec(lvl)
        : { charges: 1, grantShield: lvl >= 2, rescueLift: 36, invulnSec: 1.5, shockwave: lvl >= 7 };

      this.angelCharges -= 1;
      const p = this.player;
      p.cancelAim();
      this.pointer.isDown = false;
      this.activePointerId = null;
      p.wallAttached = 0;
      p.floorAttached = false;
      p.velocityX = 0;
      p.velocityY = 0;
      p.hp = Math.max(1, p.hp);
      p.invulnTimer = spec.invulnSec;
      this.hitStopTimer = 0.06;
      this.shakeMag = Math.max(this.shakeMag, spec.shockwave ? 8.5 : 6.0);
      this.projectiles.length = 0;

      // Lv 7+ Divine Shockwave pushes back active boss cooldown & blasts golden radiance!
      if (spec.shockwave && this.activeBoss && !this.activeBoss.defeated) {
        this.activeBoss.attackTimer = Math.min(this.activeBoss.attackTimer || 0, -1.2);
        this.activeBoss.wallZap = null;
      }

      const rescueLift = spec.rescueLift || 36;
      const baseTargetY = isLava
        ? Math.min(p.positionY - rescueLift * 0.4, this.risingFloorY - 145 - rescueLift * 0.35)
        : p.positionY - rescueLift;
      const safeSpot = this._findNearestSafeWallSpot(baseTargetY);
      if (this.gameMode === 'rising') {
        this.risingFloorY = Math.max(this.risingFloorY, safeSpot.y + 150);
      }

      if (this.audio.playAngelRevive) this.audio.playAngelRevive();
      else this.audio.playUnlock();
      if (JellyGame.Haptics) JellyGame.Haptics.revive();

      this._spawnShockwaveRing(p.positionX, p.positionY, spec.shockwave ? 165 : 100, '#ffd166', spec.shockwave ? 5.2 : 4.2);
      this._spawnShockwaveRing(p.positionX, p.positionY, spec.shockwave ? 112 : 64, '#fff5bd', 2.8);
      this.particles.spawnCollectBurst(p.positionX, p.positionY, spec.shockwave ? 6 : 4);
      this.particles.spawnFloatingLabel(
        p.positionX,
        p.positionY - 28,
        spec.grantShield
          ? this.t().powerTriggerAngelShield || 'SHIELDED REVIVE!'
          : this.t().powerTriggerAngel || 'GUARDIAN ANGEL!',
        spec.grantShield ? '#74f2ff' : '#ffd166',
        16
      );

      this.angelReviveAnim = {
        elapsed: 0,
        duration: 1.12,
        startX: p.positionX,
        startY: p.positionY,
        endX: safeSpot.x,
        endY: safeSpot.y,
        side: safeSpot.side,
        grantShield: spec.grantShield,
        invulnSec: spec.invulnSec,
        shockwave: spec.shockwave
      };
      return true;
    }

    _updateAngelRevive(dt) {
      const anim = this.angelReviveAnim;
      if (!anim) return;

      anim.elapsed += dt;
      const rawT = clamp(anim.elapsed / anim.duration, 0, 1);
      const ease =
        rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) * 0.5;
      const arcLift = Math.sin(rawT * Math.PI) * -58;

      this.player.positionX = anim.startX + (anim.endX - anim.startX) * ease;
      this.player.positionY = anim.startY + (anim.endY - anim.startY) * ease + arcLift;
      this.player.invulnTimer = anim.invulnSec || 1.5;

      if (Math.random() < 0.55) {
        this.particles.spawnSparkBurst(
          this.player.positionX,
          this.player.positionY,
          0,
          Math.random() < 0.5 ? '#ffd166' : '#fff5bd',
          2
        );
      }

      if (rawT >= 1) {
        this.player.positionX = anim.endX;
        this.player.positionY = anim.endY;
        this.player.wallAttached = anim.side;
        this.player.floorAttached = false;
        this.player.velocityX = 0;
        this.player.velocityY = 0;
        this.player.invulnTimer = anim.invulnSec || 1.5;
        this.player.hp = Math.max(1, this.player.hp);
        // Lv 2+ Guardian Angel grants a 1-hit Post-Revive Bubble Shield!
        if (anim.grantShield) {
          this.player.hasShield = true;
          this.audio.playShieldGain();
        }
        this.tempoTimer = C.TEMPO.WINDOW_SEC;
        this.angelReviveAnim = null;
        this._spawnShockwaveRing(anim.endX, anim.endY, anim.shockwave ? 116 : 84, anim.grantShield ? '#74f2ff' : '#ffd166', 3.6);
        this._spawnShockwaveRing(anim.endX, anim.endY, 56, '#fff5bd', 2.4);
      }
    }

    _tryFatalRescue(isLava = false) {
      if (this.chronoRewindAnim || this.angelReviveAnim) return true;
      if (this.equippedAbility === 'chrono' && this.abilityCooldown <= 0 && this.chronoBuffer.length > 0) {
        if (this._startChronoRewind()) return true;
      }
      if (this.equippedAbility === 'angel' && this.angelCharges > 0) {
        if (this._startAngelRevive(isLava)) return true;
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
      const prevAttachWall = this.player.wallAttached;
      if (this.hasLaunchedOnce && this.tempoTimer > 0) {
        this.tempoTier = Math.min(C.TEMPO.MAX_TIER, this.tempoTier + 1);
      } else if (!this.hasLaunchedOnce) {
        this.tempoTier = 1;
      } else {
        this.tempoTier = 1;
      }

      this.hasLaunchedOnce = true;
      this._recordRunMaxTempo();
      this._recordMissionProgress('launches', 1);
      if (this.tempoTier >= 2) this._recordMissionProgress('reachTempo', this.tempoTier);
      this.audio.setMusicContext(this.state, this.gameMode, this.tempoTier);

      this.audio.playLaunch(shot.strength, this.tempoTier);
      if (JellyGame.Haptics) JellyGame.Haptics.launch();
      this.camPunchVx -= shot.dirX * (22 + shot.strength * 30);
      this.camPunchVy -= shot.dirY * (22 + shot.strength * 30);
      this.particles.spawnLaunchBurst(
        this.player.positionX,
        this.player.positionY,
        shot.dirX,
        shot.dirY,
        shot.strength,
        this.tempoTier,
        this.player.getColorPalette().primary
      );

      // Tactile weather spray droplets when pushing off snowy or rain-soaked walls
      const launchMeters = Math.max(0, (C.START_PLAYER_Y - this.player.positionY) / C.PIXELS_PER_METER);
      const launchAtm = this._getAtmosphereAtMeters(launchMeters);
      if (launchAtm.weather === 'snow' || launchAtm.weather === 'rain') {
        const sprayX =
          prevAttachWall !== 0
            ? prevAttachWall < 0
              ? C.WALL_WIDTH + 4
              : C.WIDTH - C.WALL_WIDTH - 4
            : this.player.positionX;
        const sprayCol = launchAtm.weather === 'snow' ? '#d4fbff' : '#74f2ff';
        this.particles.spawnSparkBurst(sprayX, this.player.positionY, shot.dirX, sprayCol, 4);
      }

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
      const pal = this.player.getColorPalette();

      // Check if player hit an Elastic Bounce Pad Surface!
      if (evt.type === 'wall' && this.generator.surfaces) {
        const surfaces = this.generator.surfaces;
        for (let i = 0; i < surfaces.length; i++) {
          const s = surfaces[i];
          if (s.type === 'bouncePad' && s.containsWallPoint(evt.side, this.player.positionY)) {
            s.triggerBounce(this.player.positionY);
            const outDir = -evt.side;
            this.player.wallAttached = 0;
            this.player.floorAttached = false;
            this.player.cancelAim();
            this.player.velocityX = outDir * ((C.SURFACES && C.SURFACES.BOUNCE_VX) || 700);
            this.player.velocityY = (C.SURFACES && C.SURFACES.BOUNCE_VY) || -750;
            this.player.stretchAmount = 0.42;
            this.player.wobbleAmp = 0.28;
            this.player.wobbleTime = 0;
            this.camPunchVx += outDir * 60;
            this.camPunchVy -= 42;

            this.hasLaunchedOnce = true;
            this.tempoTier = Math.min(C.TEMPO.MAX_TIER, this.tempoTier + 1);
            this._recordRunMaxTempo();
            this.audio.setMusicContext(this.state, this.gameMode, this.tempoTier);

            this.audio.playBouncePad();
            this.particles.spawnStickBurst(this.player.positionX, this.player.positionY, outDir, 950, '#ff79c6');
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
      if (JellyGame.Haptics) {
        JellyGame.Haptics.land(clamp(evt.impactSpeed / 1000, 0.2, 1));
      }
      if (evt.impactSpeed > 900) {
        this.shakeMag = Math.max(this.shakeMag, 2.2);
      }
      if (evt.type === 'wall') {
        this.camPunchVx -= evt.normalX * clamp(evt.impactSpeed * 0.08, 12, 52);
        this.camPunchVy += clamp((evt.impactVy || 0) * 0.055, -20, 36);
      } else {
        this.camPunchVy += clamp(evt.impactSpeed * 0.06, 12, 42);
      }

      // Open fresh rhythm window upon wall contact
      if (this.hasLaunchedOnce) {
        this.tempoTimer = C.TEMPO.WINDOW_SEC;
      }

      if (evt.type === 'wall') {
        const wallEdgeX = evt.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
        this.particles.spawnWallSplat(
          wallEdgeX,
          this.player.positionY,
          evt.side,
          pal.primary,
          clamp(evt.impactSpeed / 950, 0.35, 1.0)
        );
        this.particles.spawnStickBurst(
          this.player.positionX,
          this.player.positionY,
          evt.normalX,
          evt.impactSpeed,
          pal.primary
        );
      } else {
        this.particles.spawnSparkBurst(
          this.player.positionX,
          C.FLOOR_Y,
          0,
          pal.primary,
          5
        );
      }

      if (this.pointer.isDown) {
        this.pointer.startX = this.pointer.currX;
        this.pointer.startY = this.pointer.currY;
        this.player.beginAim();
      }
    }

    _isWallPointSafeForSlip(px, py, wallSide) {
      const guardR = C.PLAYER_RADIUS + 10;
      const obstacles = this.generator.obstacles;
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (o.checkPointCollision && o.checkPointCollision(px, py, guardR)) {
          return false;
        }
      }
      if (this.activeBoss && !this.activeBoss.defeated && this.activeBoss.wallZap) {
        const z = this.activeBoss.wallZap;
        if ((z.warningTimer > 0 || z.activeTimer > 0) && z.side === wallSide) {
          if (py + guardR >= z.centerY - z.halfH && py - guardR <= z.centerY + z.halfH) {
            return false;
          }
        }
      }
      return true;
    }

    _applyAtmosphericWallSlip(dt, onIceWall, atm) {
      if (
        onIceWall ||
        !atm ||
        atm.wallSlip <= 0 ||
        this.state !== 'playing' ||
        this.gameMode === 'tutorial' ||
        !this.hasLaunchedOnce ||
        (this.activeBoss && !this.activeBoss.defeated) ||
        !this.player.alive ||
        this.player.wallAttached === 0
      ) {
        return;
      }

      const side = this.player.wallAttached;
      const aimMult = this.player.isAiming
        ? C.ATMOSPHERE ? C.ATMOSPHERE.AIM_SLIP_MULTIPLIER : 0.45
        : 1;
      const nextY = Math.min(
        C.FLOOR_Y - this.player.radius,
        this.player.positionY + atm.wallSlip * aimMult * dt
      );
      if (nextY <= this.player.positionY) return;
      if (!this._isWallPointSafeForSlip(this.player.positionX, nextY, side)) return;

      this.player.positionY = nextY;
      this.player.anchorY = nextY;

      if (Math.random() < dt * (atm.weather === 'rain' ? 11 : 7)) {
        const edgeX = side < 0 ? C.WALL_WIDTH + 2 : C.WIDTH - C.WALL_WIDTH - 2;
        const microCol =
          atm.weather === 'snow'
            ? '#c6faff'
            : atm.weather === 'rain'
              ? '#74f2ff'
              : '#d8b8ff';
        this.particles.spawnSparkBurst(edgeX, this.player.positionY + 6, -side, microCol, 1);
      }
      if (atm.weather === 'rain' && Math.random() < dt * 2.5) {
        this.particles.spawnWallSplat(
          side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH,
          this.player.positionY,
          side,
          'rgba(116, 242, 255, 0.55)',
          0.22
        );
      }
    }

    _updateWallSurfaces(dt, atm = null) {
      const surfaces = this.generator.surfaces;
      let onIceWall = false;
      const side = this.player.wallAttached;
      const py = this.player.positionY;

      if (surfaces) {
        for (let i = 0; i < surfaces.length; i++) {
          surfaces[i].update(dt);
        }
      }

      if (!this.player.alive || side === 0) return;

      if (surfaces) {
        for (let i = 0; i < surfaces.length; i++) {
          const s = surfaces[i];
          if (!s.containsWallPoint(side, py)) continue;

          if (s.type === 'iceWall') {
            onIceWall = true;
            const slideSpeed = (C.SURFACES && C.SURFACES.ICE_SLIDE_SPEED) || 88;
            const nextY = Math.min(
              C.FLOOR_Y - this.player.radius,
              this.player.positionY + slideSpeed * dt
            );
            this.player.positionY = nextY;
            this.player.anchorY = nextY;
            if (Math.random() < dt * 14) {
              this.particles.spawnSparkBurst(
                side < 0 ? C.WALL_WIDTH + 2 : C.WIDTH - C.WALL_WIDTH - 2,
                this.player.positionY - 10,
                -side,
                '#b8f2ff',
                1
              );
            }
            if (Math.random() < dt * 5.5) {
              this.particles.spawnWallSplat(
                side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH,
                this.player.positionY,
                side,
                this.player.getColorPalette().primary,
                0.28
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
              this.camPunchVx += outDir * 32;
              this.audio.playCrack();
              if (this.particles.spawnDebris) {
                this.particles.spawnDebris(
                  side < 0 ? C.WALL_WIDTH + 4 : C.WIDTH - C.WALL_WIDTH - 4,
                  this.player.positionY,
                  outDir,
                  '#9c6b3b',
                  9
                );
              }
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

      this._applyAtmosphericWallSlip(dt, onIceWall, atm);
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
        this._recordMissionProgress('closeCalls', 1);
        this.slowMoTimer = 0.12;
        this.audio.playCloseCall();
        if (JellyGame.Haptics) JellyGame.Haptics.closeCall();
        this.particles.spawnFloatingLabel(
          this.player.positionX,
          this.player.positionY - 22,
          this.t().closeCall || 'CLOSE CALL! +2',
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
      if (JellyGame.Haptics) JellyGame.Haptics.shield();
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
      const magnetActive = this.magnetTimer > 0;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.collected) continue;
        item.update(dt, this.player, magnetActive);
        if (item.checkPickup(this.player)) {
          item.collected = true;
          if (item.itemType === 'shield') {
            this.player.hasShield = true;
            this.audio.playShieldGain();
            if (JellyGame.Haptics) JellyGame.Haptics.shield();
            this.particles.spawnSparkBurst(item.x, item.y, 0, '#74f2ff', 10);
            this.particles.spawnFloatingLabel(
              item.x,
              item.y - 14,
              this.t().shieldGain || 'SHIELD!',
              '#74f2ff',
              15
            );
          } else if (item.itemType === 'magnet') {
            this.magnetTimer = 7.0;
            if (this.audio.playMagnetGain) this.audio.playMagnetGain();
            else this.audio.playShieldGain();
            if (JellyGame.Haptics) JellyGame.Haptics.shield();
            this._spawnShockwaveRing(item.x, item.y, 78, '#ff6b81', 3.2);
            this._spawnShockwaveRing(item.x, item.y, 48, '#ffe875', 2.2);
            this.particles.spawnSparkBurst(item.x, item.y, 0, '#ffe875', 12);
            this.particles.spawnFloatingLabel(
              item.x,
              item.y - 16,
              this.t().magnetGain || 'SUPER MAGNET!',
              '#ffe875',
              15
            );
          } else {
            const amount = this.tempoTier >= C.TEMPO.DOUBLE_DROP_TIER ? 2 : 1;
            this.gems += amount;
            this.runGemsEarned += amount;
            this.hudGemPulse = 1;
            this.player.wobbleAmp = Math.max(this.player.wobbleAmp, 0.14);
            this.player.wobbleTime = 0;
            this._saveInt(STORAGE_KEYS.GEMS, this.gems);
            this._recordMissionProgress('collectGems', amount);
            this.audio.playCollect(amount > 1);
            if (JellyGame.Haptics) JellyGame.Haptics.collect();
            this.particles.spawnCollectBurst(item.x, item.y, amount);
          }
        }
      }
    }

    _checkWindVortexBoost() {
      const surfaces = this.generator.surfaces;
      if (!surfaces || !this.player.alive || this.player.isAttached()) return;

      for (let i = 0; i < surfaces.length; i++) {
        const s = surfaces[i];
        if (s.type === 'windVortex' && s.checkPlayerTrigger && s.checkPlayerTrigger(this.player)) {
          this.player.velocityY = Math.min(this.player.velocityY - 260, -760);
          if (Math.abs(this.player.velocityX) < 150) {
            this.player.velocityX = (this.player.positionX < C.WIDTH * 0.5 ? 1 : -1) * 260;
          }
          this.player.stretchAmount = 0.4;
          this.camPunchVy -= 48;
          this.hasLaunchedOnce = true;
          this.tempoTimer = C.TEMPO.WINDOW_SEC;
          if (this.audio.playWindBoost) this.audio.playWindBoost();
          else this.audio.playBouncePad();
          this._spawnShockwaveRing(s.x, s.y, 56, '#74f2ff', 2.6);
          this.particles.spawnSparkBurst(s.x, s.y, 0, '#36f5b0', 10);
          this.particles.spawnFloatingLabel(
            s.x,
            s.y - 24,
            this.t().windBoost || 'UPDRAFT!',
            '#74f2ff',
            14
          );
          break;
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
          const baseTitle = (tr.themes && tr.themes[key]) || key.toUpperCase();
          const hint = tr.themePhysicsHints && tr.themePhysicsHints[key];
          this.themeBannerText = hint ? `${baseTitle}  •  ${hint}` : baseTitle;
          this.themeBannerTimer = 2.4;
          break;
        }
      }
    }

    _getBossDisplayName(def, tr) {
      const arch = def.archetype;
      const base = (tr && tr[arch.nameKey]) || arch.defaultName;
      if (def.cycle > 1) {
        const prefix = (tr && tr.bossAscendedPrefix) || 'ASCENDED';
        return def.cycle === 2 ? `${prefix} ${base}` : `${prefix} ${base} +${def.cycle - 1}`;
      }
      return base;
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
      const tr = this.t();
      this.player.maxHp = 3;
      this.player.hp = 3;
      this.particles.spawnFloatingLabel(
        this.player.positionX,
        this.player.positionY - 26,
        tr.bossHeartsHint || '+3 BOSS HEARTS!',
        '#ff6b81',
        14.5
      );
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
        if (JellyGame.Haptics) JellyGame.Haptics.bossHit(slamEvt.isCrit);
      }
    }

    _onBossDefeated(boss, slamEvt) {
      const tr = this.t();
      const gemsReward = (slamEvt && slamEvt.rewardGems) || boss.rewardGems || 30;
      const Bosses = JellyGame.Bosses;

      this.hitStopTimer = 0.075;
      this.shakeMag = 10.0;
      if (JellyGame.Haptics) JellyGame.Haptics.revive();
      this.gems += gemsReward;
      this.runGemsEarned += gemsReward;
      this.hudGemPulse = 1;
      this._saveInt(STORAGE_KEYS.GEMS, this.gems);

      this.bossesDefeated += 1;
      this.runBossesDefeated += 1;
      this._saveInt(STORAGE_KEYS.BOSSES_DEFEATED, this.bossesDefeated);
      if (JellyGame.Review) JellyGame.Review.onBossDefeated();
      this._syncMilestoneUnlocks();
      this._recordMissionProgress('defeatBoss', 1);
      if (this.audio.setBossIntensity) this.audio.setBossIntensity(false);

      // Normal climb returns to 1 Heart + fresh Bubble Shield bonus
      this.player.maxHp = 1;
      this.player.hp = 1;
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
      this.themeBannerText = `${bossTitle} ${tr.bossDefeated || 'DEFEATED!'} (+${gemsReward})`;
      this.themeBannerTimer = 2.4;
      this.particles.spawnFloatingLabel(
        boss.x,
        boss.y - 18,
        `+${gemsReward} ${tr.dropsUnit || 'Drops'}`,
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

    _getAtmosphereAtMeters(meters) {
      const m = Math.max(0, meters || 0);
      const themes = C.THEMES;
      let idx = 0;
      for (let i = 0; i < themes.length - 1; i++) {
        if (m >= themes[i + 1].minMeters) {
          idx = i + 1;
        }
      }
      const curr = themes[idx];
      const next = themes[idx + 1];
      let t = 0;
      if (next) {
        const span = 10;
        t = clamp((m - (next.minMeters - span)) / span, 0, 1);
      }
      const dom = t >= 0.5 && next ? next : curr;
      const baseSlip = next
        ? (curr.wallSlip || 0) + ((next.wallSlip || 0) - (curr.wallSlip || 0)) * t
        : curr.wallSlip || 0;
      const atmCfg = C.ATMOSPHERE || {};
      const extraStart = atmCfg.HIGH_ALT_SLIP_START_M || 1550;
      const extraFull = atmCfg.HIGH_ALT_SLIP_FULL_M || 3500;
      const extraMax = atmCfg.HIGH_ALT_EXTRA_SLIP || 12;
      const highAltProgress = clamp((m - extraStart) / Math.max(1, extraFull - extraStart), 0, 1);
      const gravityScale = next
        ? (curr.gravityScale || 1) + ((next.gravityScale || 1) - (curr.gravityScale || 1)) * t
        : curr.gravityScale || 1;
      const isHeaven = dom.key === 'heaven';
      return {
        curr,
        next,
        blend: t,
        dom,
        weather: dom.weather || 'spores',
        wallSlip: isHeaven ? 0 : baseSlip > 0 || m >= extraStart ? baseSlip + highAltProgress * extraMax : 0,
        gravityScale
      };
    }

    _getCurrentTheme() {
      const camMeters = Math.max(
        0,
        (C.START_PLAYER_Y - (this.cameraY + C.HEIGHT * 0.5)) / C.PIXELS_PER_METER
      );
      const atm = this._getAtmosphereAtMeters(camMeters);
      const curr = atm.curr;
      const next = atm.next || curr;
      const t = atm.next ? atm.blend : 0;

      return {
        key: atm.dom.key || 'cavern',
        wallStyle: atm.dom.wallStyle || 'stone',
        bgStyle: atm.dom.bgStyle || 'cavern',
        bgStyleFrom: curr.bgStyle || 'canopy',
        bgStyleTo: next.bgStyle || curr.bgStyle || 'canopy',
        bgBlend: t,
        weather: atm.weather,
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
      this.player.hp = 0;
      this.player.alive = false;
      this.player.cancelAim();
      this.pointer.isDown = false;
      this.activePointerId = null;
      this.audio.resetStretchTick();
      if (this.audio.setBossIntensity) this.audio.setBossIntensity(false);
      this.audio.setMusicContext('dead', this.gameMode, 1);
      this.audio.playPop();
      if (JellyGame.Haptics) JellyGame.Haptics.death();
      this.particles.spawnPopBurst(this.player.positionX, this.player.positionY);
      this._submitCurrentRunScore();
      if (JellyGame.Review && typeof JellyGame.Review.maybePromptAfterRun === 'function') {
        const reviewSnap = {
          isTutorial: this.gameMode === 'tutorial',
          isQaWarpRun: Boolean(this.isQaWarpRun),
          isNewRecord: Boolean(this.isNewRecord),
          meters: this.currentMeters || 0,
          bossesDefeatedThisRun: this.runBossesDefeated || 0
        };
        global.setTimeout(() => {
          if (this.state === 'dead' && !this.adBusy) {
            JellyGame.Review.maybePromptAfterRun(reviewSnap);
          }
        }, 1100);
      }
    }

    async _triggerAdRevive() {
      const Ads = JellyGame.Ads;
      if (!Ads || !Ads.canShowRewarded('revive') || this.adReviveUsedThisRun || this.adBusy) return;
      this.adBusy = true;
      try {
        const res = await Ads.showRewarded('revive');
        if (res && res.rewarded && this.state === 'dead') {
          this.adReviveUsedThisRun = true;
          const p = this.player;
          const safeSpot = this._findNearestSafeWallSpot(p.positionY - 64);
          this.state = 'playing';
          this.deathTimer = 0;
          p.alive = true;
          p.hp = Math.max(1, p.maxHp || 1);
          p.hasShield = true;
          p.invulnTimer = 2.0;
          p.positionX = safeSpot.x;
          p.positionY = safeSpot.y;
          p.wallAttached = safeSpot.side;
          p.floorAttached = false;
          p.velocityX = 0;
          p.velocityY = 0;
          this.projectiles.length = 0;
          if (this.gameMode === 'rising') {
            this.risingFloorY = Math.max(this.risingFloorY, safeSpot.y + 170);
          }
          this.audio.setMusicContext('playing', this.gameMode, 1);
          if (this.audio.playAngelRevive) this.audio.playAngelRevive();
          if (JellyGame.Haptics) JellyGame.Haptics.revive();
          this._spawnShockwaveRing(safeSpot.x, safeSpot.y, 92, '#74f2ff', 3.6);
        }
      } finally {
        this.adBusy = false;
      }
    }

    async _triggerAdDoubleDrops() {
      const Ads = JellyGame.Ads;
      if (
        !Ads ||
        !Ads.canShowRewarded('doubleDrops') ||
        this.adDoubleUsedThisRun ||
        this.runGemsEarned <= 0 ||
        this.adBusy
      ) {
        return;
      }
      this.adBusy = true;
      try {
        const res = await Ads.showRewarded('doubleDrops');
        if (res && res.rewarded && this.state === 'dead') {
          this.adDoubleUsedThisRun = true;
          const bonus = this.runGemsEarned;
          this.gems += bonus;
          this.runGemsEarned += bonus;
          this.hudGemPulse = 1;
          this._saveInt(STORAGE_KEYS.GEMS, this.gems);
          if (this.audio.playMissionClaim) this.audio.playMissionClaim();
          else this.audio.playUnlock();
          if (JellyGame.Haptics) JellyGame.Haptics.closeCall();
        }
      } finally {
        this.adBusy = false;
      }
    }

    async _exitDeathWithInterstitial(afterFn) {
      if (this.adBusy) return;
      const Ads = JellyGame.Ads;
      if (
        this.gameMode === 'tutorial' ||
        !Ads ||
        !Ads.isEnabled() ||
        typeof Ads.maybeShowInterstitialAfterRun !== 'function'
      ) {
        if (typeof afterFn === 'function') afterFn();
        return;
      }

      this.adBusy = true;
      try {
        await Ads.maybeShowInterstitialAfterRun({
          skipBecauseRewarded: Boolean(this.adReviveUsedThisRun || this.adDoubleUsedThisRun)
        });
      } catch (_) {
        // Never block restarting or returning to menu if an ad fails
      } finally {
        this.adBusy = false;
      }
      if (typeof afterFn === 'function') afterFn();
    }

    render() {
      const ctx = this.ctx;
      const theme = this._getCurrentTheme();

      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.translate(this.padLeft, this.padTop);

      let shakeX = 0;
      let shakeY = 0;
      if (this.shakeMag > 0.1) {
        shakeX = (Math.random() - 0.5) * 2 * this.shakeMag;
        shakeY = (Math.random() - 0.5) * 2 * this.shakeMag;
      }

      const Art = JellyGame.Art;
      if (this.state === 'menu' && Art) {
        Art.drawMenuVista(
          ctx,
          C.WIDTH,
          C.HEIGHT,
          this.padLeft,
          this.padTop,
          this.padRight,
          this.padBottom,
          this.hintTime
        );
      } else {
        this._drawBackground(ctx, theme);
      }

      ctx.save();
      ctx.translate(shakeX + this.camPunchX, shakeY + this.camPunchY);
      if (this.state === 'playing' && Math.abs(this.camZoom - 1) > 0.0005) {
        ctx.translate(C.WIDTH * 0.5, C.HEIGHT * 0.5);
        ctx.scale(this.camZoom, this.camZoom);
        ctx.translate(-C.WIDTH * 0.5, -C.HEIGHT * 0.5);
      }

      if (this.state !== 'menu') {
        this._drawAltitudeMarkers(ctx);
        this._drawWorldBestBanner(ctx);
        if (this.gameMode === 'tutorial') {
          this._drawTutorialWorldElements(ctx);
        }
        this._drawWallsAndFloor(ctx, theme);
      }

      // Surfaces, obstacles, collectibles & projectiles (active gameplay / death view only)
      if (this.state !== 'menu') {
        if (this.generator.surfaces) {
          const surfaces = this.generator.surfaces;
          for (let i = 0; i < surfaces.length; i++) {
            surfaces[i].draw(ctx, this.cameraY, theme);
          }
        }

        const obstacles = this.generator.obstacles;
        for (let i = 0; i < obstacles.length; i++) {
          obstacles[i].draw(ctx, this.cameraY, theme);
        }

        const collectibles = this.generator.collectibles;
        for (let i = 0; i < collectibles.length; i++) {
          collectibles[i].draw(ctx, this.cameraY);
        }

        if (this.activeBoss && !this.activeBoss.defeated) {
          this.activeBoss.draw(ctx, this.cameraY);
        }

        for (let i = 0; i < this.projectiles.length; i++) {
          this.projectiles[i].draw(ctx, this.cameraY, theme);
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

      if (this.chronoRewindAnim) {
        this._drawChronoRewindGhost(ctx);
      }
      if (this.angelReviveAnim) {
        this._drawAngelReviveWings(ctx);
      }

      if (this.state !== 'menu') {
        this.player.draw(ctx, this.cameraY, this._boundCheckLanding);
      }
      this._drawShockwaveRings(ctx);
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

      if (this.chronoRewindAnim) {
        ctx.save();
        ctx.fillStyle = 'rgba(72, 219, 251, 0.14)';
        this._fillViewportRect(ctx);
        ctx.restore();
      } else if (this.angelReviveAnim) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 209, 102, 0.13)';
        this._fillViewportRect(ctx);
        ctx.restore();
      }

      if (this.state === 'menu') {
        this._drawMainMenu(ctx);
      } else {
        this._drawHUD(ctx);
        if (this.state === 'playing' && this.equippedAbility && this.equippedAbility !== 'none') {
          this._drawAbilityHUDOrb(ctx);
        }
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
      } else if (this.activeModal === 'pause') {
        this._drawPauseModal(ctx);
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

          const gateText = tr.tutFinishGate || 'FINISH TRAINING (+15)';
          ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
          const badgeW = Math.max(188, ctx.measureText(gateText).width + 58);
          const badgeH = 24;
          ctx.fillStyle = '#07221b';
          ctx.strokeStyle = '#36f5b0';
          ctx.lineWidth = 1.8;
          roundRectPath(ctx, C.WIDTH * 0.5 - badgeW * 0.5, sy - badgeH * 0.5, badgeW, badgeH, 12);
          ctx.fill();
          ctx.stroke();

          this._drawUiRow(
            ctx,
            [
              { icon: 'star', r: 4.4, color: '#8affdb', gap: 5 },
              { text: gateText, color: '#8affdb', gap: 4 },
              { icon: 'gem', r: 4.3, gap: 5 },
              { icon: 'star', r: 4.4, color: '#8affdb' }
            ],
            C.WIDTH * 0.5,
            sy + 0.5,
            'center',
            '#8affdb'
          );
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

      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      ctx.save();
      if (Art) {
        Art.drawCartoonPanel(ctx, cardX, cardY, cardW, cardH, 18);
      } else {
        ctx.fillStyle = '#221848';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.6;
        roundRectPath(ctx, cardX, cardY, cardW, cardH, 18);
        ctx.fill();
        ctx.stroke();
      }

      // Left Circular Portrait Well featuring Our Talking Jelly Character!
      const portCx = cardX + 30;
      const portCy = cardY + cardH * 0.5 + 1;
      ctx.fillStyle = '#1b1138';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(portCx, portCy, 21.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Draw our Jelly character bouncing & talking inside the portrait
      const talkBob = Math.sin(this.hintTime * 8.5) * 1.4;
      this._drawMiniJellyPreview(ctx, portCx, portCy + 2 + talkBob, 13.5, this.equippedAccessory);

      // Animated talking mouth overlay on portrait jelly
      if (Math.sin(this.hintTime * 11) > 0) {
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.ellipse(portCx, portCy + 5.2 + talkBob, 2.6, 1.9, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      const textLeftX = cardX + 58;

      // Step progress dots (5 steps)
      for (let i = 0; i < 5; i++) {
        const dx = textLeftX + 4 + i * 10;
        const dy = cardY + 14;
        ctx.fillStyle = i <= this.tutorialStepIdx ? '#6affc9' : 'rgba(255, 248, 235, 0.25)';
        ctx.beginPath();
        ctx.arc(dx, dy, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Step title
      ctx.fillStyle = '#ffe875';
      ctx.font = `700 10.5px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(stepObj.title, textLeftX + 56, cardY + 14.5);

      // Skip button in top-right of coach card
      const skipW = 58;
      const skipH = 22;
      const skipX = cardX + cardW - skipW - 8;
      const skipY = cardY + 6;
      this.uiRects.tutSkipBtn = { x: skipX, y: skipY, w: skipW, h: skipH };

      if (Art) {
        Art.drawCartoonButton(ctx, skipX, skipY, skipW, skipH, 'slate', 11);
      } else {
        ctx.fillStyle = '#4d3e88';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.8;
        roundRectPath(ctx, skipX, skipY, skipW, skipH, 11);
        ctx.fill();
        ctx.stroke();
      }

      ctx.font = `700 9.5px ${C.FONTS.DISPLAY}`;
      this._drawUiRow(
        ctx,
        [
          { text: tr.tutSkip || 'SKIP', color: '#fff8eb', gap: 4 },
          { icon: 'skip', r: 3.8, color: '#fff8eb' }
        ],
        skipX + skipW * 0.5,
        skipY + skipH * 0.5 + 0.5,
        'center',
        '#fff8eb'
      );

      // Word-wrapped first-person character dialogue (up to 2 lines)
      ctx.fillStyle = '#fff8eb';
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
      const viewBottom = C.HEIGHT + this.padBottom;
      const sy = this.risingFloorY - this.cameraY;
      if (sy > viewBottom + 120) return;

      const leftX = C.WALL_WIDTH;
      const rightX = C.WIDTH - C.WALL_WIDTH;
      const spanW = rightX - leftX;
      const clampTopY = Math.max(-this.padTop - 20, sy);

      ctx.save();
      // Ambient upward magma heat glow above the wave crest
      const glowGrad = ctx.createLinearGradient(0, sy - 90, 0, sy + 15);
      glowGrad.addColorStop(0, 'rgba(255, 77, 61, 0)');
      glowGrad.addColorStop(1, 'rgba(255, 94, 54, 0.42)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(leftX, sy - 90, spanW, 105);

      // Animated dual-sine magma crest path
      ctx.beginPath();
      ctx.moveTo(leftX, viewBottom + 40);
      const segs = 24;
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const wx = leftX + u * spanW;
        const wave =
          Math.sin(u * Math.PI * 4 + this.hintTime * 5.2) * 4.5 +
          Math.cos(u * Math.PI * 7 - this.hintTime * 3.6) * 2.5;
        ctx.lineTo(wx, clampTopY + wave);
      }
      ctx.lineTo(rightX, viewBottom + 40);
      ctx.closePath();

      const lavaGrad = ctx.createLinearGradient(0, clampTopY, 0, Math.max(clampTopY + 180, viewBottom));
      lavaGrad.addColorStop(0, '#ffbe3b');
      lavaGrad.addColorStop(0.18, '#ff5e36');
      lavaGrad.addColorStop(0.55, '#d62828');
      lavaGrad.addColorStop(1, '#5c0a14');
      ctx.fillStyle = lavaGrad;
      ctx.fill();

      // Thick comic ink + incandescent top crust line
      const traceCrest = () => {
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
      };
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = C.COLORS.ink || '#1b1136';
      ctx.lineWidth = 6.5;
      traceCrest();
      ctx.stroke();

      ctx.strokeStyle = '#fff5a8';
      ctx.lineWidth = 3;
      traceCrest();
      ctx.stroke();

      // Bubbling cartoon magma blisters along the surface
      for (let b = 0; b < 5; b++) {
        const bx = leftX + 35 + ((b * 79 + Math.sin(this.hintTime * 1.7 + b) * 18) % (spanW - 70));
        const by = clampTopY + 16 + Math.sin(this.hintTime * 4 + b * 2.1) * 5;
        const br = 3.8 + 2 * Math.abs(Math.sin(this.hintTime * 3.2 + b));
        ctx.fillStyle = '#fff5a8';
        ctx.strokeStyle = C.COLORS.ink || '#1b1136';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
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
        const botY = C.HEIGHT + this.padBottom;
        const vig = ctx.createLinearGradient(0, botY - 120, 0, botY);
        vig.addColorStop(0, 'rgba(255, 56, 56, 0)');
        vig.addColorStop(1, `rgba(255, 65, 45, ${0.12 + urgency * 0.35})`);
        ctx.fillStyle = vig;
        ctx.fillRect(-this.padLeft - 10, botY - 120, this.viewW + 20, 140);
      }

      // Bottom-center proximity pill
      const tr = this.t();
      const ink = C.COLORS.ink || '#1b1136';
      const pillW = 138;
      const pillH = 28;
      const pillX = (C.WIDTH - pillW) * 0.5;
      const pillY = C.HEIGHT - 40;
      const pulse = urgency > 0.4 ? Math.sin(this.hintTime * 10) * 1.5 : 0;

      ctx.fillStyle = ink;
      roundRectPath(ctx, pillX, pillY + 2.5 + pulse, pillW, pillH, 14);
      ctx.fill();

      ctx.fillStyle = urgency > 0.45 ? '#8c1d2e' : '#4a1d28';
      ctx.strokeStyle = urgency > 0.45 ? '#ff5e57' : '#ffbe3b';
      ctx.lineWidth = 2.2;
      roundRectPath(ctx, pillX, pillY + pulse, pillW, pillH, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fff5d6';
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
      const ink = C.COLORS.ink || '#1b1136';
      ctx.save();

      // Golden dashed cartoon finish ribbon across shaft
      ctx.strokeStyle = 'rgba(255, 224, 102, 0.85)';
      ctx.lineWidth = 2.6;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(C.WALL_WIDTH, sy);
      ctx.lineTo(C.WIDTH - C.WALL_WIDTH, sy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Warm inked cream-gold center banner plaque
      const badgeW = 132;
      const badgeH = 24;
      ctx.fillStyle = '#ffeaa7';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.2;
      roundRectPath(ctx, C.WIDTH * 0.5 - badgeW * 0.5, sy - badgeH * 0.5, badgeW, badgeH, 12);
      ctx.fill();
      ctx.stroke();

      ctx.font = `700 11px ${C.FONTS.DISPLAY}`;
      this._drawUiRow(
        ctx,
        [
          { icon: 'star', r: 4.3, color: '#ff9f1c', gap: 5 },
          { text: `${tr.best || 'BEST'}: ${this.runStartBestMeters} m`, color: ink, gap: 5 },
          { icon: 'star', r: 4.3, color: '#ff9f1c' }
        ],
        C.WIDTH * 0.5,
        sy + 0.5,
        'center',
        ink
      );
      ctx.restore();
    }

    _drawBackground(ctx, theme) {
      const Art = JellyGame.Art;
      const viewTop = -this.padTop;
      const viewBottom = C.HEIGHT + this.padBottom;
      const grad = ctx.createLinearGradient(0, viewTop, 0, viewBottom);
      grad.addColorStop(0, theme.bgTop);
      grad.addColorStop(1, theme.bgBottom);
      ctx.fillStyle = grad;
      this._fillViewportRect(ctx);

      // Subtle painterly grain over sky/backdrop so flat gradients feel hand-painted
      if (Art) {
        Art.overlayGrain(
          ctx,
          -this.padLeft - 4,
          viewTop - 4,
          this.viewW + 8,
          Math.max(C.HEIGHT, this.viewH) + 8,
          0.036
        );
      }

      // Warm diagonal cartoon light shafts
      const stormFlash =
        theme.weather === 'rain'
          ? Math.pow(Math.max(0, Math.sin(this.hintTime * 1.15) * Math.sin(this.hintTime * 3.7)), 14) * 0.085
          : 0;
      const heavenGlow = theme.weather === 'feathers' ? 0.055 : 0;
      ctx.save();
      ctx.fillStyle = theme.rayColor;
      for (let i = 0; i < 3; i++) {
        const pulse = 0.042 + heavenGlow + 0.02 * Math.sin(this.hintTime * 0.7 + i * 2.1) + stormFlash;
        ctx.globalAlpha = pulse;
        const rx = 55 + i * 115 + Math.sin(this.hintTime * 0.35 + i) * 14;
        ctx.beginPath();
        ctx.moveTo(rx, viewTop - 10);
        ctx.lineTo(rx + 68, viewTop - 10);
        ctx.lineTo(rx - 44, viewBottom + 10);
        ctx.lineTo(rx - 112, viewBottom + 10);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Ground-to-canopy vertical ascent story (hills -> giant world tree -> cloud decks -> sky)
      const climbPx = Math.max(0, C.START_CAMERA_Y - this.cameraY);
      const camMeters = Math.max(
        0,
        (C.START_PLAYER_Y - (this.cameraY + C.HEIGHT * 0.5)) / C.PIXELS_PER_METER
      );
      if (Art && Art.drawAscentVistaBackdrop) {
        const floorScreenY = C.FLOOR_Y - this.cameraY;
        Art.drawAscentVistaBackdrop(
          ctx,
          C.WIDTH,
          C.HEIGHT,
          this.padLeft,
          this.padBottom,
          floorScreenY,
          climbPx,
          camMeters,
          this.hintTime
        );
      }

      // Handcrafted 3-layer painterly biome backdrops (Sky Anchors -> Grounded Horizon Vistas -> Seamless 720px Architecture)
      const bgFrom = theme.bgStyleFrom || theme.bgStyle || 'canopy';
      const bgTo = theme.bgStyleTo || bgFrom;
      const bgBlend = theme.bgBlend || 0;
      if (Art && Art.drawBiomeBackdrop) {
        if (bgFrom !== bgTo && bgBlend > 0.005) {
          if (bgFrom !== 'canopy') {
            Art.drawBiomeBackdrop(
              ctx,
              bgFrom,
              C.WIDTH,
              C.HEIGHT,
              this.padTop,
              this.padBottom,
              C.WALL_WIDTH,
              this.cameraY,
              this.hintTime,
              1 - bgBlend,
              camMeters
            );
          }
          if (bgTo !== 'canopy') {
            Art.drawBiomeBackdrop(
              ctx,
              bgTo,
              C.WIDTH,
              C.HEIGHT,
              this.padTop,
              this.padBottom,
              C.WALL_WIDTH,
              this.cameraY,
              this.hintTime,
              bgBlend,
              camMeters
            );
          }
        } else {
          const activeBg = bgFrom;
          const biomeFade =
            activeBg === 'canopy'
              ? 0
              : activeBg === 'monolith'
                ? clamp((camMeters - 102) / 16, 0, 1)
                : 1;
          if (biomeFade > 0.01) {
            Art.drawBiomeBackdrop(
              ctx,
              activeBg,
              C.WIDTH,
              C.HEIGHT,
              this.padTop,
              this.padBottom,
              C.WALL_WIDTH,
              this.cameraY,
              this.hintTime,
              biomeFade,
              camMeters
            );
          }
        }
      }

      // Ambient drifting biome weather: spores (0-120m) -> snow (frost) -> embers (foundry) -> rain (storm) -> stars (cosmos)
      const moteTop = -this.padTop;
      const moteSpan = Math.max(C.HEIGHT, this.viewH);
      const weather = theme.weather || 'spores';
      const spanW = C.WIDTH - C.WALL_WIDTH * 2 - 16;
      ctx.save();
      for (let i = 0; i < this.ambientMotes.length; i++) {
        const m = this.ambientMotes[i];
        const baseY = (m.y / C.HEIGHT) * moteSpan;

        if (weather === 'bubbles') {
          const wy =
            moteTop +
            ((((baseY - this.cameraY * 0.22 - this.hintTime * (m.speedY * 1.9)) % moteSpan) + moteSpan) %
              moteSpan);
          const wx = m.x + Math.sin(this.hintTime * 1.8 + m.driftPhase) * 10;
          const r = m.radius * 1.55;
          ctx.globalAlpha = Math.min(0.62, m.alpha * 1.4);
          ctx.fillStyle = 'rgba(110, 255, 175, 0.22)';
          ctx.strokeStyle = '#9effc4';
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.arc(wx, wy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(wx - r * 0.32, wy - r * 0.32, Math.max(0.8, r * 0.25), 0, Math.PI * 2);
          ctx.fill();
        } else if (weather === 'sand') {
          const wy =
            moteTop +
            ((((baseY - this.cameraY * 0.2 + this.hintTime * (m.speedY * 0.9)) % moteSpan) + moteSpan) %
              moteSpan);
          const windX = this.hintTime * (95 + m.speedY * 2.2);
          const wx =
            C.WALL_WIDTH +
            8 +
            ((((m.x - C.WALL_WIDTH - 8 + windX) % spanW) + spanW) % spanW);
          ctx.globalAlpha = Math.min(0.55, m.alpha * 1.35);
          ctx.strokeStyle = i % 3 === 0 ? '#fff2bd' : '#ffcf78';
          ctx.lineWidth = m.radius > 2 ? 1.8 : 1.15;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(wx, wy);
          ctx.lineTo(wx + 12, wy + 2.5);
          ctx.stroke();
        } else if (weather === 'feathers') {
          const wy =
            moteTop +
            ((((baseY - this.cameraY * 0.16 + this.hintTime * (m.speedY * 1.1)) % moteSpan) + moteSpan) %
              moteSpan);
          const sway = Math.sin(this.hintTime * 1.4 + m.driftPhase);
          const wx = m.x + sway * 18;
          ctx.save();
          ctx.translate(wx, wy);
          ctx.rotate(sway * 0.45);
          ctx.globalAlpha = Math.min(0.82, m.alpha * 1.75);
          if (i % 3 === 0) {
            // Drifting golden-white celestial feather
            ctx.fillStyle = '#fff9d6';
            ctx.strokeStyle = 'rgba(255, 209, 71, 0.7)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(0, 0, m.radius * 2.1, m.radius * 0.72, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            // Soft warm divine light sparkle
            ctx.fillStyle = '#fff5b8';
            ctx.beginPath();
            ctx.arc(0, 0, m.radius * 0.95, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        } else if (weather === 'snow') {
          const wy =
            moteTop +
            ((((baseY - this.cameraY * 0.24 + this.hintTime * (m.speedY * 2.2)) % moteSpan) + moteSpan) %
              moteSpan);
          const wx = m.x + Math.sin(this.hintTime * 1.55 + m.driftPhase) * 14;
          const r = m.radius * 1.25;
          ctx.globalAlpha = Math.min(0.68, m.alpha * 1.5);
          ctx.fillStyle = '#e6fdff';
          ctx.beginPath();
          ctx.arc(wx, wy, r, 0, Math.PI * 2);
          ctx.fill();
          if (m.radius > 2.1) {
            ctx.strokeStyle = 'rgba(210, 252, 255, 0.55)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(wx - r * 1.7, wy);
            ctx.lineTo(wx + r * 1.7, wy);
            ctx.moveTo(wx, wy - r * 1.7);
            ctx.lineTo(wx, wy + r * 1.7);
            ctx.stroke();
          }
        } else if (weather === 'embers') {
          const wy =
            moteTop +
            ((((baseY - this.cameraY * 0.24 - this.hintTime * (m.speedY * 2.6)) % moteSpan) + moteSpan) %
              moteSpan);
          const wx = m.x + Math.sin(this.hintTime * 2.2 + m.driftPhase) * 10;
          const flicker = 0.65 + 0.35 * Math.sin(this.hintTime * 9 + m.twinklePhase);
          ctx.globalAlpha = Math.min(0.8, m.alpha * 1.65 * flicker);
          ctx.fillStyle = i % 3 === 0 ? '#fff3a1' : theme.moteColor;
          ctx.beginPath();
          ctx.arc(wx, wy, m.radius * 1.05, 0, Math.PI * 2);
          ctx.fill();
        } else if (weather === 'rain') {
          const fallY = this.hintTime * (290 + m.speedY * 7);
          const wy =
            moteTop +
            ((((baseY - this.cameraY * 0.24 + fallY) % moteSpan) + moteSpan) % moteSpan);
          const windX = this.hintTime * 44;
          const wx =
            C.WALL_WIDTH +
            8 +
            ((((m.x - C.WALL_WIDTH - 8 - windX) % spanW) + spanW) % spanW);
          const len = m.streakLen || 16;
          ctx.globalAlpha = Math.min(0.58, m.alpha * 1.35);
          ctx.strokeStyle = i % 3 === 0 ? '#d8f6ff' : theme.moteColor;
          ctx.lineWidth = m.radius > 2.1 ? 1.5 : 1.05;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(wx, wy);
          ctx.lineTo(wx - len * 0.16, wy + len);
          ctx.stroke();
        } else if (weather === 'stars') {
          const wy =
            moteTop +
            ((((baseY - this.cameraY * 0.14 + this.hintTime * 3) % moteSpan) + moteSpan) % moteSpan);
          const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.hintTime * 3.4 + m.twinklePhase));
          ctx.globalAlpha = Math.min(0.85, m.alpha * 1.8 * twinkle);
          ctx.fillStyle = i % 4 === 0 ? '#c56cf0' : '#ffffff';
          ctx.beginPath();
          ctx.arc(m.x, wy, m.radius * 0.9, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const parallaxY =
            moteTop +
            ((((baseY - this.cameraY * 0.22 + this.hintTime * m.speedY) % moteSpan) + moteSpan) %
              moteSpan);
          const swayX = m.x + Math.sin(this.hintTime * 1.1 + m.driftPhase) * 6;
          ctx.globalAlpha = m.alpha;
          ctx.fillStyle = theme.moteColor;
          ctx.beginPath();
          ctx.arc(swayX, parallaxY, m.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    _drawAltitudeMarkers(ctx) {
      const stepMeters = 10;
      const stepPx = stepMeters * C.PIXELS_PER_METER;
      const topWorldY = this.cameraY - this.padTop;
      const bottomWorldY = this.cameraY + C.HEIGHT + this.padBottom;

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
        if (sy < -this.padTop - 20 || sy > C.HEIGHT + this.padBottom + 20) continue;

        // Inked wooden/stone milestone plaque along shaft
        ctx.strokeStyle = 'rgba(255, 245, 214, 0.14)';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(C.WALL_WIDTH + 6, sy);
        ctx.lineTo(C.WIDTH * 0.5 - 30, sy);
        ctx.moveTo(C.WIDTH * 0.5 + 30, sy);
        ctx.lineTo(C.WIDTH - C.WALL_WIDTH - 6, sy);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(29, 19, 58, 0.72)';
        ctx.strokeStyle = 'rgba(255, 244, 214, 0.28)';
        ctx.lineWidth = 1.6;
        roundRectPath(ctx, C.WIDTH * 0.5 - 26, sy - 10, 52, 20, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 244, 214, 0.72)';
        ctx.fillText(`${idx * stepMeters} m`, C.WIDTH * 0.5, sy + 0.5);
      }
      ctx.restore();
    }

    _drawWallsAndFloor(ctx, theme) {
      const Art = JellyGame.Art;
      const ink = C.COLORS.ink || '#1b1136';
      const w = C.WALL_WIDTH;
      const viewTop = -this.padTop;
      const viewBottom = C.HEIGHT + this.padBottom;
      const fullH = Math.max(C.HEIGHT, this.viewH);
      const leftOuter = -this.padLeft - 28;
      const rightOuter = C.WIDTH + this.padRight + 28;

      ctx.fillStyle = theme.wallBase;
      ctx.fillRect(leftOuter, viewTop - 28, w - leftOuter, fullH + 56);
      ctx.fillRect(C.WIDTH - w, viewTop - 28, rightOuter - (C.WIDTH - w), fullH + 56);

      ctx.fillStyle = theme.wallShadow;
      ctx.fillRect(leftOuter, viewTop - 28, w * 0.44 - leftOuter, fullH + 56);
      ctx.fillRect(
        C.WIDTH - w * 0.44,
        viewTop - 28,
        rightOuter - (C.WIDTH - w * 0.44),
        fullH + 56
      );

      // Staggered organic cartoon block pattern scrolling cleanly with world Y
      const wallStyle = theme.wallStyle || 'stone';
      const blockH = 64;
      const firstIdx = Math.floor((this.cameraY + viewTop - 40) / blockH);
      const lastIdx = Math.ceil((this.cameraY + viewBottom + 40) / blockH);

      ctx.save();
      for (let idx = firstIdx; idx <= lastIdx; idx++) {
        const wy = idx * blockH;
        const y = wy - this.cameraY;
        const hashL = Math.abs((idx * 73 + 19) % 5);
        const hashR = Math.abs((idx * 97 + 31) % 5);

        if (wallStyle === 'slimeOoze') {
          // Organic dark-jade rock blocks with bubbling emerald ooze beads & glossy specular shine
          ctx.fillStyle = hashL % 2 === 0 ? 'rgba(92, 255, 165, 0.14)' : 'rgba(10, 40, 34, 0.36)';
          roundRectPath(ctx, leftOuter + 4, y + 4, w - leftOuter - 10, blockH - 8, 10);
          ctx.fill();
          ctx.fillStyle = hashR % 2 === 0 ? 'rgba(92, 255, 165, 0.14)' : 'rgba(10, 40, 34, 0.36)';
          roundRectPath(ctx, C.WIDTH - w + 6, y + 4, rightOuter - (C.WIDTH - w) - 10, blockH - 8, 10);
          ctx.fill();

          // Dark mortar seam + glowing trapped bubbles inside wall rock
          ctx.strokeStyle = 'rgba(10, 36, 30, 0.5)';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(leftOuter + 4, y + 2);
          ctx.lineTo(w - 7, y + 2);
          ctx.moveTo(C.WIDTH - w + 7, y + 32);
          ctx.lineTo(rightOuter - 4, y + 32);
          ctx.stroke();

          ctx.fillStyle = 'rgba(148, 255, 196, 0.42)';
          ctx.beginPath();
          ctx.arc(w * 0.48, y + 18 + hashL * 6, 3.2, 0, Math.PI * 2);
          ctx.arc(C.WIDTH - w * 0.48, y + 20 + hashR * 5, 3.2, 0, Math.PI * 2);
          ctx.fill();

          if (hashL === 1 || hashL === 3) {
            ctx.fillStyle = '#56ff9a';
            ctx.strokeStyle = ink;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(w - 4.5, y + 22, 4.8, -Math.PI * 0.5, Math.PI * 0.5);
            ctx.fill();
            ctx.stroke();
          }
          if (hashR === 2 || hashR === 4) {
            ctx.fillStyle = '#56ff9a';
            ctx.strokeStyle = ink;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(C.WIDTH - w + 4.5, y + 40, 4.8, Math.PI * 0.5, Math.PI * 1.5);
            ctx.fill();
            ctx.stroke();
          }
        } else if (wallStyle === 'sandstone') {
          // Sun-baked carved desert sandstone slabs with sunlit top bevels & subtle golden temple zig-zag trim
          ctx.fillStyle = hashL % 2 === 0 ? 'rgba(255, 224, 146, 0.22)' : 'rgba(108, 46, 18, 0.3)';
          roundRectPath(ctx, leftOuter + 4, y + 3, w - leftOuter - 10, blockH - 6, 6);
          ctx.fill();
          ctx.fillStyle = hashR % 2 === 0 ? 'rgba(255, 224, 146, 0.22)' : 'rgba(108, 46, 18, 0.3)';
          roundRectPath(ctx, C.WIDTH - w + 6, y + 3, rightOuter - (C.WIDTH - w) - 10, blockH - 6, 6);
          ctx.fill();

          // Sunlit warm upper block highlight bevel
          ctx.fillStyle = 'rgba(255, 242, 188, 0.28)';
          ctx.fillRect(6, y + 5, w - 14, 3);
          ctx.fillRect(C.WIDTH - w + 8, y + 5, w - 14, 3);

          // Carved desert temple chevron glyph
          ctx.strokeStyle = 'rgba(255, 218, 128, 0.48)';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(8, y + 36);
          ctx.lineTo(w * 0.45, y + 29);
          ctx.lineTo(w - 10, y + 36);
          ctx.moveTo(C.WIDTH - w + 10, y + 36);
          ctx.lineTo(C.WIDTH - w * 0.45, y + 29);
          ctx.lineTo(C.WIDTH - 8, y + 36);
          ctx.stroke();
        } else if (wallStyle === 'celestialMarble') {
          // Polished ivory-white fluted marble temple slabs with soft warm veining & gleaming golden inlaid sun-diamond
          ctx.fillStyle = hashL % 2 === 0 ? 'rgba(255, 255, 255, 0.56)' : 'rgba(218, 198, 165, 0.32)';
          roundRectPath(ctx, leftOuter + 4, y + 3, w - leftOuter - 10, blockH - 6, 7);
          ctx.fill();
          ctx.fillStyle = hashR % 2 === 0 ? 'rgba(255, 255, 255, 0.56)' : 'rgba(218, 198, 165, 0.32)';
          roundRectPath(ctx, C.WIDTH - w + 6, y + 3, rightOuter - (C.WIDTH - w) - 10, blockH - 6, 7);
          ctx.fill();

          // Subtle diagonal warm marble vein + gold cornice seam
          ctx.strokeStyle = 'rgba(180, 158, 128, 0.32)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(6, y + 14);
          ctx.quadraticCurveTo(w * 0.5, y + 22, w - 9, y + 10);
          ctx.moveTo(C.WIDTH - w + 9, y + 48);
          ctx.quadraticCurveTo(C.WIDTH - w * 0.5, y + 38, C.WIDTH - 6, y + 52);
          ctx.stroke();

          ctx.strokeStyle = 'rgba(235, 174, 34, 0.72)';
          ctx.lineWidth = 1.9;
          for (const rx of [w * 0.46, C.WIDTH - w * 0.46]) {
            const ry = y + blockH * 0.5;
            ctx.beginPath();
            ctx.moveTo(rx, ry - 7.5);
            ctx.lineTo(rx + 5.2, ry);
            ctx.lineTo(rx, ry + 7.5);
            ctx.lineTo(rx - 5.2, ry);
            ctx.closePath();
            ctx.stroke();
          }
        } else if (wallStyle === 'frost') {
          // Faceted crystalline glacier blocks with crisp diagonal moonlit specular bands
          ctx.fillStyle = hashL % 2 === 0 ? 'rgba(188, 247, 255, 0.24)' : 'rgba(255, 255, 255, 0.1)';
          roundRectPath(ctx, leftOuter + 4, y + 3, w - leftOuter - 10, blockH - 6, 8);
          ctx.fill();
          ctx.fillStyle = hashR % 2 === 0 ? 'rgba(188, 247, 255, 0.22)' : 'rgba(255, 255, 255, 0.08)';
          roundRectPath(ctx, C.WIDTH - w + 6, y + 3, rightOuter - (C.WIDTH - w) - 10, blockH - 6, 8);
          ctx.fill();

          ctx.strokeStyle = 'rgba(224, 252, 255, 0.42)';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(5, y + 12);
          ctx.lineTo(w - 9, y + 28);
          ctx.moveTo(5, y + 22);
          ctx.lineTo(w - 15, y + 32);
          ctx.moveTo(C.WIDTH - w + 9, y + 34);
          ctx.lineTo(C.WIDTH - 5, y + 18);
          ctx.stroke();
        } else if (wallStyle === 'obsidianLava') {
          // Chiseled dark obsidian slabs with branching glowing yellow-orange magma veins
          ctx.fillStyle = 'rgba(27, 12, 24, 0.5)';
          roundRectPath(ctx, leftOuter + 4, y + 4, w - leftOuter - 10, blockH - 8, 9);
          ctx.fill();
          roundRectPath(ctx, C.WIDTH - w + 6, y + 4, rightOuter - (C.WIDTH - w) - 10, blockH - 8, 9);
          ctx.fill();

          const pulse = 0.52 + 0.28 * Math.sin(this.hintTime * 3.2 + idx * 0.9);
          ctx.strokeStyle = `rgba(255, 138, 46, ${pulse})`;
          ctx.lineWidth = 2.8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(4, y + blockH * 0.48);
          ctx.lineTo(w * 0.5, y + blockH * 0.55);
          ctx.lineTo(w - 8, y + blockH * 0.45 + (hashL - 2) * 3);
          ctx.moveTo(C.WIDTH - w + 8, y + blockH * 0.45 + (hashR - 2) * 3);
          ctx.lineTo(C.WIDTH - w * 0.5, y + blockH * 0.55);
          ctx.lineTo(C.WIDTH - 4, y + blockH * 0.48);
          ctx.stroke();
        } else if (wallStyle === 'stormCoil') {
          // Riveted storm-tower bronze/steel armor plates with glowing cyan Tesla conduit bar
          ctx.fillStyle = 'rgba(22, 16, 48, 0.38)';
          roundRectPath(ctx, leftOuter + 4, y + 4, w - leftOuter - 10, blockH - 8, 7);
          ctx.fill();
          roundRectPath(ctx, C.WIDTH - w + 6, y + 4, rightOuter - (C.WIDTH - w) - 10, blockH - 8, 7);
          ctx.fill();

          ctx.fillStyle = 'rgba(125, 230, 255, 0.62)';
          roundRectPath(ctx, 6, y + 29, w - 13, 4.5, 2);
          ctx.fill();
          roundRectPath(ctx, C.WIDTH - w + 7, y + 29, w - 13, 4.5, 2);
          ctx.fill();
          for (const rx of [10, w - 11, C.WIDTH - w + 11, C.WIDTH - 10]) {
            ctx.fillStyle = '#ffe484';
            ctx.beginPath();
            ctx.arc(rx, y + 13, 2.0, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (wallStyle === 'astralRune') {
          // Carved cartoon mystic blocks + twinkling diamond runes
          ctx.fillStyle = 'rgba(20, 11, 52, 0.42)';
          roundRectPath(ctx, leftOuter + 4, y + 4, w - leftOuter - 10, blockH - 8, 9);
          ctx.fill();
          roundRectPath(ctx, C.WIDTH - w + 6, y + 4, rightOuter - (C.WIDTH - w) - 10, blockH - 8, 9);
          ctx.fill();

          const runeAlpha = 0.4 + 0.28 * Math.sin(this.hintTime * 2.4 + idx * 0.7);
          ctx.strokeStyle = `rgba(244, 162, 255, ${runeAlpha})`;
          ctx.lineWidth = 2;
          for (const rx of [w * 0.46, C.WIDTH - w * 0.46]) {
            const ry = y + blockH * 0.5;
            ctx.beginPath();
            ctx.moveTo(rx, ry - 8);
            ctx.lineTo(rx + 6, ry);
            ctx.lineTo(rx, ry + 8);
            ctx.lineTo(rx - 6, ry);
            ctx.closePath();
            ctx.stroke();
          }
        } else {
          // Hand-carved chunky cartoon stone blocks with mossy grass tufts (Cavern & Valley)
          const offL = (hashL % 2) * 14;
          const offR = (hashR % 2) * 14;
          ctx.fillStyle = hashL % 2 === 0 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(27, 17, 54, 0.2)';
          roundRectPath(ctx, leftOuter + 4, y + 3, w - leftOuter - 11, blockH - 7, 8);
          ctx.fill();
          ctx.fillStyle = hashR % 2 === 0 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(27, 17, 54, 0.2)';
          roundRectPath(ctx, C.WIDTH - w + 7, y + 3 + offR * 0.25, rightOuter - (C.WIDTH - w) - 11, blockH - 7, 8);
          ctx.fill();

          // Dark cartoon mortar groove
          ctx.strokeStyle = 'rgba(27, 17, 54, 0.45)';
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(leftOuter + 4, y + offL * 0.15);
          ctx.lineTo(w - 6, y + offL * 0.15);
          ctx.moveTo(C.WIDTH - w + 6, y + offR * 0.25);
          ctx.lineTo(rightOuter - 4, y + offR * 0.25);
          ctx.stroke();

          // Occasional cute overhanging moss tuft along inner stone seam (cavern biome)
          if (theme.key === 'cavern' && hashL === 2) {
            ctx.fillStyle = '#8ce827';
            ctx.strokeStyle = ink;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(w - 5, y + 16, 4.5, -Math.PI * 0.5, Math.PI * 0.5);
            ctx.fill();
            ctx.stroke();
          }
          if (theme.key === 'cavern' && hashR === 3) {
            ctx.fillStyle = '#8ce827';
            ctx.strokeStyle = ink;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(C.WIDTH - w + 5, y + 38, 4.5, Math.PI * 0.5, Math.PI * 1.5);
            ctx.fill();
            ctx.stroke();
          }
        }
      }

      if (Art) {
        Art.overlayGrain(ctx, leftOuter, viewTop - 10, w - leftOuter, fullH + 20, 0.045);
        Art.overlayGrain(ctx, C.WIDTH - w, viewTop - 10, rightOuter - (C.WIDTH - w), fullH + 20, 0.045);
      }

      // Inner colored cliff trim + bold cartoon ink edge contour
      ctx.fillStyle = theme.wallInnerEdge;
      ctx.fillRect(w - 6.5, viewTop - 20, 6.5, fullH + 40);
      ctx.fillRect(C.WIDTH - w, viewTop - 20, 6.5, fullH + 40);

      ctx.fillStyle = theme.wallHighlight;
      ctx.fillRect(w - 4.5, viewTop - 20, 2.5, fullH + 40);
      ctx.fillRect(C.WIDTH - w + 2, viewTop - 20, 2.5, fullH + 40);

      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(w, viewTop - 20);
      ctx.lineTo(w, viewBottom + 20);
      ctx.moveTo(C.WIDTH - w, viewTop - 20);
      ctx.lineTo(C.WIDTH - w, viewBottom + 20);
      ctx.stroke();

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
      if (floorScreenY < viewBottom + 40) {
        ctx.save();
        ctx.fillStyle = theme.wallBase;
        ctx.fillRect(w, floorScreenY, C.WIDTH - w * 2, viewBottom - floorScreenY + 30);

        // Lush cartoon mossy floor cap
        ctx.fillStyle = '#7de01d';
        ctx.fillRect(w, floorScreenY, C.WIDTH - w * 2, 10);
        ctx.fillStyle = '#b5ff47';
        ctx.fillRect(w, floorScreenY + 1, C.WIDTH - w * 2, 3.5);

        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(w, floorScreenY);
        ctx.lineTo(C.WIDTH - w, floorScreenY);
        ctx.stroke();
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
      const Art = JellyGame.Art;
      const font = `700 ${fontSize}px ${C.FONTS.DISPLAY}`;
      if (Art) {
        Art.drawCartoonText(ctx, text, x, y, font, topFill, botFill, lipColor, Math.max(4.5, fontSize * 0.14));
        return;
      }
      ctx.save();
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.fillStyle = lipColor || '#1b1136';
      ctx.strokeStyle = '#1b1136';
      ctx.lineWidth = 7.5;
      ctx.strokeText(text, x, y + 5);
      ctx.fillText(text, x, y + 5);
      ctx.strokeText(text, x, y);
      ctx.fillStyle = topFill;
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    _drawMainMenu(ctx) {
      const tr = this.t();
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      ctx.save();

      // 0. Compact Top-Right Profile Pill with Quick Pencil Edit Badge
      this._drawMenuProfilePill(ctx);

      // 1. Hand-lettered Cartoon Logo at top (echoing store icon)
      if (Art) {
        Art.drawCartoonLogo(ctx, C.WIDTH * 0.5, 134, 0.96, this.hintTime);
      } else {
        this._drawSculptedWord(ctx, 'JELLY', C.WIDTH * 0.5, 118, 52, '#fffdf5', '#e8d4ae', ink);
        this._drawSculptedWord(ctx, 'CLIMB', C.WIDTH * 0.5, 174, 54, '#ffef6b', '#ee5a0e', ink);
      }

      // 2. Hero Cartoon Stage: Mossy Floating Island + Bouncing Equipped Jelly + Golden Gem Arc
      const islandX = C.WIDTH * 0.5;
      const islandY = 348;
      if (Art) {
        Art.drawCartoonMossIsland(ctx, islandX, islandY, 148, 56, 1);
      }

      // Playful dashed comic hop arc toward floating Jel Özü
      const gemX = 338;
      const gemY = 238 + Math.sin(this.hintTime * 3.1) * 5;
      ctx.save();
      const arcSteps = 7;
      for (let i = 1; i <= arcSteps; i++) {
        const u = i / (arcSteps + 1);
        const ax = (1 - u) * (1 - u) * (islandX + 18) + 2 * (1 - u) * u * 276 + u * u * gemX;
        const ay = (1 - u) * (1 - u) * (islandY - 46) + 2 * (1 - u) * u * 238 + u * u * gemY;
        const pulse = 0.55 + 0.35 * Math.sin(this.hintTime * 4 - i * 0.5);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#fff9d6';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(ax, ay, 4.2 * (1 - u * 0.25), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      this._drawGemEmblem(ctx, gemX, gemY, 13.5);

      // Live Hero Jelly Mascot bouncing proudly on the mossy island!
      const bounceCycle = Math.abs(Math.sin(this.hintTime * 3.2));
      const jumpH = bounceCycle * 18;
      const sqY = bounceCycle < 0.14 ? 0.86 : 1 + bounceCycle * 0.1;
      const sqX = 1 / sqY;
      const heroX = islandX - 6;
      const heroY = islandY - 31 - jumpH;

      // Ground contact shadow shrinking as Jelly hops
      ctx.fillStyle = 'rgba(27, 17, 54, 0.32)';
      ctx.beginPath();
      ctx.ellipse(heroX, islandY - 6, 26 * (1 - bounceCycle * 0.3), 6 * (1 - bounceCycle * 0.3), 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(heroX, heroY);
      ctx.scale(sqX, sqY);
      this._drawMiniJellyPreview(ctx, 0, 0, 29, this.equippedAccessory, this.equippedColor, true);
      ctx.restore();

      // 3. Centerpiece Chunky Cartoon PLAY Cushion Button
      const playW = 228;
      const playH = 66;
      const playX = (C.WIDTH - playW) * 0.5;
      const playY = 438;
      const playPressed = this.pressedBtn === 'play';
      this.uiRects.menuPlayBtn = { x: playX, y: playY, w: playW, h: playH };

      ctx.save();
      const pulseScale = playPressed ? 1 : 1 + Math.sin(this.hintTime * 3.4) * 0.015;
      const pCx = playX + playW * 0.5;
      const pCy = playY + playH * 0.5;
      ctx.translate(pCx, pCy);
      ctx.scale(pulseScale, 1 / Math.sqrt(pulseScale));

      if (Art) {
        Art.drawCartoonButton(ctx, -playW * 0.5, -playH * 0.5, playW, playH, 'green', 33, playPressed);
      } else {
        ctx.fillStyle = '#15c98a';
        roundRectPath(ctx, -playW * 0.5, -playH * 0.5, playW, playH, 33);
        ctx.fill();
      }

      const playText = tr.play || 'PLAY';
      ctx.font = `700 22px ${C.FONTS.DISPLAY}`;
      const textW = ctx.measureText(playText).width;
      const iconW = 15;
      const gap = 10;
      const totalW = iconW + gap + textW;
      const startX = -totalW * 0.5;
      const pyOff = playPressed ? 2.5 : 0;

      ctx.fillStyle = ink;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(startX, -9 + pyOff);
      ctx.lineTo(startX + iconW, pyOff);
      ctx.lineTo(startX, 9 + pyOff);
      ctx.closePath();
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ink;
      ctx.fillText(playText, startX + iconW + gap, 1 + pyOff);
      ctx.restore();

      // 4. Flanking Tactile Cartoon Icon Medallions (Accessories | Leaderboard | Settings)
      const leftCenterX = 95;
      const midCenterX = 225;
      const rightCenterX = 355;
      const medCenterY = 564;

      this.uiRects.menuAccBtn = { x: leftCenterX - 52, y: medCenterY - 36, w: 104, h: 98 };
      this.uiRects.menuLbBtn = { x: midCenterX - 52, y: medCenterY - 36, w: 104, h: 98 };
      this.uiRects.menuSetBtn = { x: rightCenterX - 52, y: medCenterY - 36, w: 104, h: 98 };

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

    _drawMenuProfilePill(ctx) {
      if (!this.leaderboard) {
        this.uiRects.menuProfileBtn = null;
        return;
      }
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      const nick = this.leaderboard.nickname || 'JELLY';
      const isDefaultNick = /^JELLY-[A-Z0-9]{4}$/i.test(nick);
      const isPressed = this.pressedBtn === 'profile';

      ctx.save();
      ctx.font = `700 12.5px ${C.FONTS.DISPLAY}`;
      const measuredW = ctx.measureText(nick).width;

      const pillH = 38;
      const pillW = clamp(Math.ceil(measuredW + 84), 118, 194);
      const pillX = C.WIDTH - 14 - pillW;
      const pillY = 14;
      const pillR = pillH * 0.5;

      // Generous invisible touch hitbox so thumbs never miss the mini profile pill
      this.uiRects.menuProfileBtn = {
        x: pillX - 6,
        y: pillY - 6,
        w: pillW + 12,
        h: pillH + 12
      };

      const cx = pillX + pillW * 0.5;
      const cy = pillY + pillH * 0.5;
      const saveBounce = 1 + Math.sin(this.profilePillBounce * Math.PI) * 0.14;
      const pressDy = isPressed ? 2.2 : 0;

      ctx.translate(cx, cy + pressDy);
      ctx.scale(saveBounce, saveBounce);
      ctx.translate(-cx, -cy);

      // Chunky 3D comic bottom lip shadow
      ctx.fillStyle = ink;
      roundRectPath(ctx, pillX, pillY + (isPressed ? 1.5 : 3.5), pillW, pillH, pillR);
      ctx.fill();

      // Tactile deep-violet capsule body matching menu medallions & HUD pills
      const bodyGrad = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH);
      bodyGrad.addColorStop(0, isPressed ? '#443582' : '#3a2c70');
      bodyGrad.addColorStop(1, isPressed ? '#2c2059' : '#251a4e');
      ctx.fillStyle = bodyGrad;
      ctx.strokeStyle = isPressed ? '#6affc9' : isDefaultNick ? '#ffd147' : '#fff4d6';
      ctx.lineWidth = 2.4;
      roundRectPath(ctx, pillX, pillY, pillW, pillH, pillR);
      ctx.fill();
      ctx.stroke();

      // Outer ink crisping ring
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.6;
      roundRectPath(ctx, pillX - 1, pillY - 1, pillW + 2, pillH + 2, pillR + 1);
      ctx.stroke();

      // Subtle glossy upper bevel sheen
      ctx.fillStyle = 'rgba(255, 255, 255, 0.13)';
      roundRectPath(ctx, pillX + 8, pillY + 3, pillW - 16, 10, 5);
      ctx.fill();

      // Left circular mini Jelly avatar badge (live color + skin + accessories!)
      const avCx = pillX + 19;
      const avCy = pillY + pillH * 0.5;
      ctx.fillStyle = '#d9f2ff';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(avCx, avCy, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      this._drawMiniJellyPreview(
        ctx,
        avCx,
        avCy + 1,
        9.2,
        this.equippedAccessory,
        this.equippedColor,
        false
      );

      // Middle crisp player nickname (clamped cleanly before pencil button)
      const textStartX = pillX + 37;
      const maxNickW = pillW - 76;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 12.5px ${C.FONTS.DISPLAY}`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = ink;
      ctx.strokeText(nick, textStartX, avCy + 0.5, maxNickW);
      ctx.fillStyle = '#fff8eb';
      ctx.fillText(nick, textStartX, avCy + 0.5, maxNickW);

      // Right circular sunny-gold Pencil Edit Badge (gently pulses for default JELLY-XXXX name!)
      const penCx = pillX + pillW - 18.5;
      const penCy = avCy;
      const penPulse = isDefaultNick ? 1 + Math.sin(this.hintTime * 4.4) * 0.08 : 1;

      ctx.save();
      ctx.translate(penCx, penCy);
      ctx.scale(penPulse, penPulse);

      if (isDefaultNick) {
        const glowA = 0.25 + 0.2 * Math.sin(this.hintTime * 4.4);
        ctx.fillStyle = `rgba(255, 209, 71, ${glowA})`;
        ctx.beginPath();
        ctx.arc(0, 0, 15.5, 0, Math.PI * 2);
        ctx.fill();
      }

      const penGrad = ctx.createLinearGradient(0, -12, 0, 12);
      penGrad.addColorStop(0, '#ffe875');
      penGrad.addColorStop(1, '#ff9f1c');
      ctx.fillStyle = penGrad;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Tiny glossy highlight dot on pencil medallion
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.ellipse(-3.5, -5.5, 3.2, 1.8, -0.45, 0, Math.PI * 2);
      ctx.fill();

      // Crisp dark ink pencil icon inside gold badge
      this._drawUiIcon(ctx, 'pencil', 0.2, 0.4, 5.8, '#fffdf5');
      ctx.restore();

      ctx.restore();
    }

    _drawModeSelectModal(ctx) {
      const tr = this.t();
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      const spring = this._easeOutBack(clamp(this.modalAnim, 0, 1));
      const scale = 0.86 + 0.14 * spring;

      ctx.save();
      ctx.fillStyle = `rgba(17, 10, 38, ${0.72 * clamp(this.modalAnim * 1.5, 0, 1)})`;
      this._fillViewportRect(ctx);

      const panelW = 368;
      const panelH = 316;
      const panelX = (C.WIDTH - panelW) * 0.5;
      const panelY = (C.HEIGHT - panelH) * 0.5;
      this.uiRects.modalPanel = { x: panelX, y: panelY, w: panelW, h: panelH };

      ctx.translate(C.WIDTH * 0.5, C.HEIGHT * 0.5);
      ctx.scale(scale, scale);
      ctx.translate(-C.WIDTH * 0.5, -C.HEIGHT * 0.5);

      this._drawMonumentTablet(ctx, panelX, panelY, panelW, panelH, 26);

      // Header pill plaque with gamepad emblem & comic title
      const modeTitle = tr.selectModeTitle || 'SELECT MODE';
      const plaqueW = 224;
      const plaqueH = 36;
      const plaqueX = panelX + 54;
      const plaqueY = panelY + 20;

      ctx.fillStyle = ink;
      roundRectPath(ctx, plaqueX, plaqueY + 2.5, plaqueW, plaqueH, 18);
      ctx.fill();

      const plqGrad = ctx.createLinearGradient(0, plaqueY, 0, plaqueY + plaqueH);
      plqGrad.addColorStop(0, '#4d3a8f');
      plqGrad.addColorStop(1, '#291d59');
      ctx.fillStyle = plqGrad;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.6;
      roundRectPath(ctx, plaqueX, plaqueY, plaqueW, plaqueH, 18);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      roundRectPath(ctx, plaqueX + 14, plaqueY + 3.5, plaqueW - 28, 5, 2.5);
      ctx.fill();

      ctx.font = `700 18.5px ${C.FONTS.DISPLAY}`;
      this._drawUiRow(
        ctx,
        [
          { icon: 'gamepad', r: 9.2, color: '#fff8eb', gap: 9 },
          { text: modeTitle, color: '#fff8eb', stroke: ink, strokeW: 4.2 }
        ],
        plaqueX + plaqueW * 0.5,
        plaqueY + plaqueH * 0.5 + 0.5,
        'center',
        '#fff8eb',
        plaqueW - 20
      );

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
        '#097550',
        '#097550'
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
        '#b0390c',
        '#b0390c'
      );

      ctx.restore();
    }

    _drawModeCard(ctx, x, y, w, h, modeType, title, desc, bestLabel, accent, lip) {
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      const isRising = modeType === 'rising';
      ctx.save();

      if (Art) {
        Art.drawCartoonCard(ctx, x, y, w, h, isRising ? 'gold' : 'mint', 20);
      } else {
        ctx.fillStyle = isRising ? '#ffe08a' : '#dcfff0';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.4;
        roundRectPath(ctx, x, y, w, h, 20);
        ctx.fill();
        ctx.stroke();
      }

      // Left rounded-square cartoon diorama thumbnail card
      const thumbW = 76;
      const thumbH = 76;
      const thumbX = x + 11;
      const thumbY = y + (h - thumbH) * 0.5;
      const thumbR = 16;
      const tCx = thumbX + thumbW * 0.5;
      const t = this.hintTime || 0;

      // Subtle 3D lip under thumbnail frame
      ctx.fillStyle = isRising ? '#96340b' : '#0b6645';
      roundRectPath(ctx, thumbX, thumbY + 2.5, thumbW, thumbH, thumbR);
      ctx.fill();

      ctx.save();
      roundRectPath(ctx, thumbX, thumbY, thumbW, thumbH, thumbR);
      ctx.clip();

      if (modeType === 'classic') {
        // Sunny azure cartoon sky with soft rays & puffy clouds
        const skyGrad = ctx.createLinearGradient(0, thumbY, 0, thumbY + thumbH);
        skyGrad.addColorStop(0, '#1e52ba');
        skyGrad.addColorStop(0.55, '#469df2');
        skyGrad.addColorStop(1, '#9de3ff');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(thumbX, thumbY, thumbW, thumbH);

        ctx.fillStyle = 'rgba(255, 250, 224, 0.16)';
        ctx.beginPath();
        ctx.moveTo(thumbX + 18, thumbY);
        ctx.lineTo(thumbX + 46, thumbY);
        ctx.lineTo(thumbX + 16, thumbY + thumbH);
        ctx.lineTo(thumbX - 10, thumbY + thumbH);
        ctx.closePath();
        ctx.fill();

        // Cozy sky clouds left and right behind Jelly
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        for (const [cxOff, cyOff, sc] of [
          [-26, 26, 0.85],
          [26, 22, 0.78]
        ]) {
          ctx.beginPath();
          ctx.arc(tCx + cxOff, thumbY + cyOff, 7.5 * sc, 0, Math.PI * 2);
          ctx.arc(tCx + cxOff + 7 * sc, thumbY + cyOff - 2 * sc, 8.5 * sc, 0, Math.PI * 2);
          ctx.arc(tCx + cxOff + 14 * sc, thumbY + cyOff + 1 * sc, 6.2 * sc, 0, Math.PI * 2);
          ctx.fill();
        }

        // Miniature mossy floating island perched near thumbnail floor
        if (Art) {
          Art.drawCartoonMossIsland(ctx, tCx, thumbY + 57, 62, 22, 1);
        } else {
          ctx.fillStyle = '#7de01d';
          ctx.fillRect(tCx - 28, thumbY + 52, 56, 12);
        }

        // Floating golden Jel Özü sparkle top-right corner
        const bob = Math.sin(t * 3.1) * 1.8;
        if (Art) {
          Art.drawGemEmblem(ctx, thumbX + thumbW - 14, thumbY + 15 + bob * 0.4, 5.2);
        }

        // Soft bounce shadow + equipped Jelly hopping proudly on mossy island
        const bounceCycle = Math.abs(Math.sin(t * 3.1));
        const jumpH = bounceCycle * 5.5;
        ctx.fillStyle = 'rgba(27, 17, 54, 0.28)';
        ctx.beginPath();
        ctx.ellipse(tCx, thumbY + 50, 11 * (1 - bounceCycle * 0.22), 2.8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(tCx, thumbY + 35 - jumpH);
        const sqY = bounceCycle < 0.14 ? 0.9 : 1 + bounceCycle * 0.08;
        ctx.scale(1 / sqY, sqY);
        this._drawMiniJellyPreview(ctx, 0, 0, 12, this.equippedAccessory, this.equippedColor, true);
        ctx.restore();
      } else {
        // Dramatic volcanic magma cavern twilight sky
        const skyLava = ctx.createLinearGradient(0, thumbY, 0, thumbY + thumbH);
        skyLava.addColorStop(0, '#2a0f3b');
        skyLava.addColorStop(0.55, '#821c33');
        skyLava.addColorStop(1, '#eb541c');
        ctx.fillStyle = skyLava;
        ctx.fillRect(thumbX, thumbY, thumbW, thumbH);

        // Distant jagged volcanic spire silhouettes
        ctx.fillStyle = '#47152e';
        ctx.beginPath();
        ctx.moveTo(thumbX, thumbY + 56);
        ctx.lineTo(thumbX + 16, thumbY + 36);
        ctx.lineTo(thumbX + 34, thumbY + 50);
        ctx.lineTo(thumbX + 58, thumbY + 33);
        ctx.lineTo(thumbX + thumbW, thumbY + 52);
        ctx.lineTo(thumbX + thumbW, thumbY + thumbH);
        ctx.lineTo(thumbX, thumbY + thumbH);
        ctx.closePath();
        ctx.fill();

        // Dynamic curved comic escape swoosh launching upward from lava
        const escapeBob = Math.sin(t * 4.0 + 0.8) * 1.6;
        ctx.fillStyle = 'rgba(255, 250, 232, 0.9)';
        ctx.beginPath();
        ctx.moveTo(thumbX + 11, thumbY + 55);
        ctx.quadraticCurveTo(thumbX + 19, thumbY + 34, tCx + 5, thumbY + 33 + escapeBob);
        ctx.lineTo(tCx + 7, thumbY + 29 + escapeBob);
        ctx.quadraticCurveTo(thumbX + 24, thumbY + 35, thumbX + 11, thumbY + 55);
        ctx.closePath();
        ctx.fill();

        // Leaping hero Jelly dodging rising magma
        ctx.save();
        ctx.translate(tCx + 6, thumbY + 30 + escapeBob);
        ctx.rotate(0.08);
        ctx.scale(0.95, 1.06);
        this._drawMiniJellyPreview(ctx, 0, 0, 11.5, this.equippedAccessory, this.equippedColor, true);
        ctx.restore();

        // Molten bubbling cartoon lava tide across full bottom edge
        const waveShift = Math.sin(t * 3.8) * 1.8;
        const lGrad = ctx.createLinearGradient(0, thumbY + 51, 0, thumbY + thumbH);
        lGrad.addColorStop(0, '#ffe875');
        lGrad.addColorStop(0.28, '#ff7726');
        lGrad.addColorStop(1, '#ba181d');
        ctx.fillStyle = lGrad;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(thumbX - 2, thumbY + thumbH + 2);
        ctx.lineTo(thumbX - 2, thumbY + 56 + waveShift * 0.4);
        ctx.quadraticCurveTo(tCx - 14, thumbY + 50 - waveShift, tCx, thumbY + 56);
        ctx.quadraticCurveTo(tCx + 15, thumbY + 62 + waveShift, thumbX + thumbW + 2, thumbY + 54 - waveShift * 0.4);
        ctx.lineTo(thumbX + thumbW + 2, thumbY + thumbH + 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Inner top highlight bar across thumbnail card
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      roundRectPath(ctx, thumbX + 6, thumbY + 3, thumbW - 12, 5, 2.5);
      ctx.fill();
      ctx.restore();

      // Crisp rounded-square comic ink border frame
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.6;
      roundRectPath(ctx, thumbX, thumbY, thumbW, thumbH, thumbR);
      ctx.stroke();

      // Title, Description & Best Score (crisp dark ink on bright card)
      const textX = x + 97;
      const maxTextW = w - 160;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ink;
      ctx.font = `700 17.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(title, textX, y + 28, maxTextW);

      ctx.fillStyle = isRising ? '#5c3114' : '#214d40';
      ctx.font = `600 11.5px ${C.FONTS.UI}`;
      ctx.fillText(desc, textX, y + 51, maxTextW);

      ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
      this._drawUiRow(
        ctx,
        [
          { icon: 'star', r: 4.5, color: '#ffbe3b', gap: 5 },
          { text: bestLabel, color: accent }
        ],
        textX,
        y + 73,
        'left',
        accent
      );

      // Right Cartoon Play Cushion Button inside Card
      const pR = 20;
      const pCx = x + w - 34;
      const pCy = y + h * 0.5;
      if (Art) {
        Art.drawCartoonButton(ctx, pCx - pR, pCy - pR, pR * 2, pR * 2, isRising ? 'orange' : 'green', pR);
      } else {
        ctx.fillStyle = isRising ? '#ff6d28' : '#15c98a';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(pCx, pCy, pR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.moveTo(pCx - 4.5, pCy - 7);
      ctx.lineTo(pCx + 7.5, pCy);
      ctx.lineTo(pCx - 4.5, pCy + 7);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    _drawMenuMedallion(ctx, cx, cy, label, iconType, isPressed, showBadge) {
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      const size = 64;
      const half = size * 0.5;
      const pressY = isPressed ? 3 : 0;

      ctx.save();
      ctx.translate(cx, cy);

      if (Art) {
        Art.drawCartoonButton(ctx, -half, -half, size, size, 'slate', 22, isPressed);
      } else {
        ctx.fillStyle = '#342863';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.6;
        roundRectPath(ctx, -half, -half + pressY, size, size, 22);
        ctx.fill();
        ctx.stroke();
      }

      // Cozy twilight well inside medallion
      ctx.fillStyle = 'rgba(20, 12, 48, 0.45)';
      ctx.beginPath();
      ctx.arc(0, pressY + 1, 21, 0, Math.PI * 2);
      ctx.fill();

      // Unified cartoon vector icon
      ctx.save();
      ctx.translate(0, pressY);
      if (iconType === 'crown') {
        const cGrad = ctx.createLinearGradient(-12, -10, 12, 8);
        cGrad.addColorStop(0, '#fff5bd');
        cGrad.addColorStop(0.5, '#ffd147');
        cGrad.addColorStop(1, '#f08c00');
        ctx.fillStyle = cGrad;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.4;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-12, 7.5);
        ctx.lineTo(-14, -6.5);
        ctx.lineTo(-5.5, -1);
        ctx.lineTo(0, -11);
        ctx.lineTo(5.5, -1);
        ctx.lineTo(14, -6.5);
        ctx.lineTo(12, 7.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ff4757';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 2, 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (iconType === 'trophy') {
        this._drawTrophyIcon(ctx, 0, 0, 1.04);
      } else if (iconType === 'gear') {
        if (Art) {
          Art.drawGearIcon(ctx, 0, 0, 1.02);
        }
      }
      ctx.restore();

      // Notification golden Jel Özü gem if an accessory is ready to unlock
      if (showBadge) {
        const bounce = Math.abs(Math.sin(this.hintTime * 4.5)) * 3.5;
        this._drawGemEmblem(ctx, half - 3, -half + 3 - bounce, 7.5);
      }

      // Warm cream cartoon ribbon caption underneath medallion
      const tagY = half + 19;
      ctx.font = `700 10.5px ${C.FONTS.DISPLAY}`;
      const tagW = Math.max(80, ctx.measureText(label).width + 18);
      ctx.fillStyle = '#d3b888';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      roundRectPath(ctx, -tagW * 0.5, tagY - 8.5, tagW, 21, 10.5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fff8eb';
      roundRectPath(ctx, -tagW * 0.5, tagY - 10.5, tagW, 21, 10.5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, tagY + 0.5);

      ctx.restore();
    }

    _drawGemEmblem(ctx, x, y, r) {
      if (JellyGame.Art) {
        JellyGame.Art.drawGemEmblem(ctx, x, y, r);
        return;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = '#ffd147';
      ctx.strokeStyle = '#1b1136';
      ctx.lineWidth = Math.max(1.5, r * 0.25);
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.15);
      ctx.lineTo(r * 0.9, 0);
      ctx.lineTo(0, r * 1.15);
      ctx.lineTo(-r * 0.9, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    _drawUiIcon(ctx, kind, x, y, r = 5.5, color = '#ffd166') {
      if (kind === 'gem') {
        this._drawGemEmblem(ctx, x, y, r);
        return;
      }
      if (kind === 'trophy') {
        this._drawTrophyIcon(ctx, x, y, r / 10.5);
        return;
      }

      const ink = C.COLORS.ink || '#1b1136';
      ctx.save();
      ctx.translate(x, y);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (kind === 'crown') {
        const w = r * 1.12;
        const h = r * 0.85;
        ctx.fillStyle = color || '#ffd147';
        ctx.strokeStyle = ink;
        ctx.lineWidth = Math.max(1.5, r * 0.28);
        ctx.beginPath();
        ctx.moveTo(-w, h);
        ctx.lineTo(-w * 1.05, -h * 0.55);
        ctx.lineTo(-w * 0.42, h * 0.08);
        ctx.lineTo(0, -h * 1.05);
        ctx.lineTo(w * 0.42, h * 0.08);
        ctx.lineTo(w * 1.05, -h * 0.55);
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff5bd';
        ctx.beginPath();
        ctx.arc(0, h * 0.42, r * 0.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 'bolt') {
        ctx.fillStyle = color || '#ffd147';
        ctx.strokeStyle = ink;
        ctx.lineWidth = Math.max(1.4, r * 0.26);
        ctx.beginPath();
        ctx.moveTo(r * 0.28, -r * 1.08);
        ctx.lineTo(-r * 0.76, r * 0.12);
        ctx.lineTo(-r * 0.06, r * 0.12);
        ctx.lineTo(-r * 0.34, r * 1.08);
        ctx.lineTo(r * 0.78, -r * 0.14);
        ctx.lineTo(r * 0.08, -r * 0.14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (kind === 'lock') {
        const bw = r * 1.48;
        const bh = r * 1.12;
        ctx.strokeStyle = ink;
        ctx.lineWidth = Math.max(1.8, r * 0.34);
        ctx.beginPath();
        ctx.arc(0, -r * 0.22, r * 0.46, Math.PI, 0);
        ctx.stroke();
        ctx.fillStyle = color || '#94b8e8';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.5;
        roundRectPath(ctx, -bw * 0.5, -r * 0.18, bw, bh, r * 0.3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc(0, r * 0.34, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 'warning') {
        ctx.fillStyle = color || '#ff5e57';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.02);
        ctx.lineTo(r * 1.02, r * 0.88);
        ctx.lineTo(-r * 1.02, r * 0.88);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = ink;
        ctx.fillRect(-r * 0.14, -r * 0.38, r * 0.28, r * 0.68);
        ctx.beginPath();
        ctx.arc(0, r * 0.54, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 'play') {
        ctx.fillStyle = color || ink;
        ctx.beginPath();
        ctx.moveTo(-r * 0.62, -r * 0.86);
        ctx.lineTo(r * 0.92, 0);
        ctx.lineTo(-r * 0.62, r * 0.86);
        ctx.closePath();
        ctx.fill();
      } else if (kind === 'skip') {
        ctx.fillStyle = color || '#fff8eb';
        ctx.beginPath();
        ctx.moveTo(-r * 0.85, -r * 0.72);
        ctx.lineTo(r * 0.15, 0);
        ctx.lineTo(-r * 0.85, r * 0.72);
        ctx.closePath();
        ctx.fill();
        roundRectPath(ctx, r * 0.28, -r * 0.72, r * 0.36, r * 1.44, r * 0.16);
        ctx.fill();
      } else if (kind === 'upgrade') {
        ctx.strokeStyle = color || ink;
        ctx.lineWidth = Math.max(1.9, r * 0.36);
        ctx.beginPath();
        ctx.moveTo(0, r * 0.75);
        ctx.lineTo(0, -r * 0.68);
        ctx.moveTo(-r * 0.68, -r * 0.04);
        ctx.lineTo(0, -r * 0.74);
        ctx.lineTo(r * 0.68, -r * 0.04);
        ctx.stroke();
      } else if (kind === 'check') {
        ctx.strokeStyle = color || ink;
        ctx.lineWidth = Math.max(2.0, r * 0.38);
        ctx.beginPath();
        ctx.moveTo(-r * 0.72, r * 0.04);
        ctx.lineTo(-r * 0.14, r * 0.62);
        ctx.lineTo(r * 0.82, -r * 0.56);
        ctx.stroke();
      } else if (kind === 'star' || kind === 'spark') {
        const inner = kind === 'spark' ? r * 0.38 : r * 0.46;
        const points = kind === 'spark' ? 4 : 5;
        ctx.fillStyle = color || '#ffd147';
        ctx.strokeStyle = ink;
        ctx.lineWidth = Math.max(1.3, r * 0.24);
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
          const rad = i % 2 === 0 ? r * 1.06 : inner;
          const ang = -Math.PI * 0.5 + (i * Math.PI) / points;
          const px = Math.cos(ang) * rad;
          const py = Math.sin(ang) * rad;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (kind === 'pencil') {
        ctx.rotate(-Math.PI * 0.25);
        ctx.fillStyle = color || '#fff8eb';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.4;
        roundRectPath(ctx, -r * 0.85, -r * 0.28, r * 1.25, r * 0.56, r * 0.12);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(r * 0.45, -r * 0.28);
        ctx.lineTo(r * 0.95, 0);
        ctx.lineTo(r * 0.45, r * 0.28);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (kind === 'gear') {
        if (JellyGame.Art && JellyGame.Art.drawGearIcon) {
          JellyGame.Art.drawGearIcon(ctx, 0, 0, r / 12.2);
        }
      } else if (kind === 'restart') {
        ctx.strokeStyle = ink;
        ctx.lineWidth = Math.max(3.2, r * 0.55);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.68, -Math.PI * 0.82, Math.PI * 0.72);
        ctx.stroke();
        ctx.strokeStyle = color || '#fff8eb';
        ctx.lineWidth = Math.max(1.8, r * 0.3);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.68, -Math.PI * 0.82, Math.PI * 0.72);
        ctx.stroke();
        // Curved arrow head at top-left
        ctx.fillStyle = color || '#fff8eb';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-r * 0.24, -r * 0.96);
        ctx.lineTo(-r * 0.88, -r * 0.78);
        ctx.lineTo(-r * 0.58, -r * 0.22);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (kind === 'home') {
        ctx.fillStyle = color || '#fff8eb';
        ctx.strokeStyle = ink;
        ctx.lineWidth = Math.max(1.5, r * 0.26);
        // Chimney + cottage roof + base
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.92);
        ctx.lineTo(r * 0.94, -r * 0.08);
        ctx.lineTo(r * 0.66, -r * 0.08);
        ctx.lineTo(r * 0.66, r * 0.82);
        ctx.lineTo(-r * 0.66, r * 0.82);
        ctx.lineTo(-r * 0.66, -r * 0.08);
        ctx.lineTo(-r * 0.94, -r * 0.08);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = ink;
        roundRectPath(ctx, -r * 0.22, r * 0.14, r * 0.44, r * 0.64, r * 0.12);
        ctx.fill();
      } else if (kind === 'gamepad') {
        // Chunky thick-inked cartoon game controller icon
        ctx.fillStyle = color || '#fff8eb';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(-r * 0.65, -r * 0.55);
        ctx.lineTo(r * 0.65, -r * 0.55);
        ctx.quadraticCurveTo(r * 1.22, -r * 0.5, r * 1.24, r * 0.34);
        ctx.quadraticCurveTo(r * 1.16, r * 0.88, r * 0.68, r * 0.68);
        ctx.lineTo(r * 0.38, r * 0.32);
        ctx.lineTo(-r * 0.38, r * 0.32);
        ctx.lineTo(-r * 0.68, r * 0.68);
        ctx.quadraticCurveTo(-r * 1.16, r * 0.88, -r * 1.24, r * 0.34);
        ctx.quadraticCurveTo(-r * 1.22, -r * 0.5, -r * 0.65, -r * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Left D-pad plus + right A/B dots
        ctx.fillStyle = ink;
        ctx.fillRect(-r * 0.68, -r * 0.14, r * 0.48, r * 0.2);
        ctx.fillRect(-r * 0.54, -r * 0.28, r * 0.2, r * 0.48);
        ctx.beginPath();
        ctx.arc(r * 0.42, -r * 0.14, r * 0.12, 0, Math.PI * 2);
        ctx.arc(r * 0.68, r * 0.04, r * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    _drawUiRow(ctx, parts, anchorX, y, align = 'center', defaultColor = '#ffffff', maxWidth = 0) {
      if (!parts || parts.length === 0) return;
      const widths = new Array(parts.length);
      let totalW = 0;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const w = p.icon ? p.w || (p.r || 5.5) * 2 : ctx.measureText(p.text || '').width;
        widths[i] = w;
        totalW += w;
        if (i < parts.length - 1) totalW += p.gap != null ? p.gap : 4;
      }

      const fitScale = maxWidth > 0 && totalW > maxWidth ? maxWidth / totalW : 1;
      ctx.save();
      ctx.translate(anchorX, y);
      if (fitScale < 1) ctx.scale(fitScale, 1);

      let cursorX = align === 'center' ? -totalW * 0.5 : align === 'right' ? -totalW : 0;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const w = widths[i];
        if (p.icon) {
          this._drawUiIcon(ctx, p.icon, cursorX + w * 0.5, p.dy || 0, p.r || 5.5, p.color || defaultColor);
        } else if (p.text) {
          if (p.stroke) {
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.lineWidth = p.strokeW || 4;
            ctx.strokeStyle = p.stroke;
            ctx.strokeText(p.text, cursorX, 0);
          }
          ctx.fillStyle = p.color || defaultColor;
          ctx.fillText(p.text, cursorX, 0);
        }
        cursorX += w + (i < parts.length - 1 ? (p.gap != null ? p.gap : 4) : 0);
      }

      ctx.restore();
    }

    _drawMonumentTablet(ctx, x, y, w, h, radius = 26) {
      if (JellyGame.Art) {
        JellyGame.Art.drawCartoonPanel(ctx, x, y, w, h, radius);
        return;
      }
      ctx.fillStyle = '#221848';
      ctx.strokeStyle = '#1b1136';
      ctx.lineWidth = 3;
      roundRectPath(ctx, x, y, w, h, radius);
      ctx.fill();
      ctx.stroke();
    }

    _drawCloseMedallion(ctx, x, y, size) {
      if (JellyGame.Art) {
        JellyGame.Art.drawCloseMedallion(ctx, x, y, size);
        return;
      }
      const r = size * 0.5;
      ctx.fillStyle = '#e63956';
      ctx.strokeStyle = '#1b1136';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    _drawSettingsModal(ctx) {
      const tr = this.t();
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      const spring = this._easeOutBack(clamp(this.modalAnim, 0, 1));
      const scale = 0.86 + 0.14 * spring;

      ctx.save();
      ctx.fillStyle = `rgba(17, 10, 38, ${0.72 * clamp(this.modalAnim * 1.5, 0, 1)})`;
      this._fillViewportRect(ctx);

      const panelW = 364;
      const panelH = 458;
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
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4.8;
      ctx.strokeStyle = ink;
      ctx.strokeText(tr.settings || 'SETTINGS', panelX + 26, panelY + 38);
      ctx.fillStyle = '#fff8eb';
      ctx.fillText(tr.settings || 'SETTINGS', panelX + 26, panelY + 38);

      // Close medallion
      const closeSize = 34;
      const closeX = panelX + panelW - closeSize - 18;
      const closeY = panelY + 21;
      this.uiRects.modalCloseBtn = { x: closeX, y: closeY, w: closeSize, h: closeSize };
      this._drawCloseMedallion(ctx, closeX, closeY, closeSize);

      const segW = 160;
      const segH = 38;
      const segX = panelX + panelW - segW - 24;

      // Row 1: Sound FX warm cream card + comic speaker icon
      const row1Y = panelY + 98;
      if (Art) {
        Art.drawCartoonCard(ctx, panelX + 18, row1Y - 25, panelW - 36, 50, 'cream', 16);
      }

      this._drawSpeakerIcon(ctx, panelX + 42, row1Y, this.soundEnabled);

      ctx.textAlign = 'left';
      ctx.fillStyle = ink;
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

      // Row 2: Adaptive Music Volume Slider inside warm cream card
      const row2Y = panelY + 160;
      if (Art) {
        Art.drawCartoonCard(ctx, panelX + 18, row2Y - 25, panelW - 36, 50, 'cream', 16);
      }

      const effMusicRatio = this.musicEnabled ? clamp(this.musicVolume, 0, 1) : 0;
      const musicOnNow = effMusicRatio > 0.01;
      this.uiRects.musicToggleBtn = {
        x: panelX + 18,
        y: row2Y - 25,
        w: segX - (panelX + 24),
        h: 50
      };

      this._drawMusicIcon(ctx, panelX + 42, row2Y, musicOnNow);

      ctx.textAlign = 'left';
      ctx.fillStyle = ink;
      ctx.font = `700 14.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(tr.music || 'Music', panelX + 64, row2Y + 0.5);

      const trackX = segX + 6;
      const trackW = 104;
      this.uiRects.musicSliderTrack = { x: trackX, y: row2Y, w: trackW };
      this.uiRects.musicSliderHit = { x: trackX - 10, y: row2Y - 24, w: trackW + 20, h: 48 };

      // Chunky inked slider groove
      ctx.fillStyle = '#1b1138';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      roundRectPath(ctx, trackX, row2Y - 5.5, trackW, 11, 5.5);
      ctx.fill();
      ctx.stroke();

      if (effMusicRatio > 0.01) {
        const fillW = Math.max(10, trackW * effMusicRatio);
        const sGrad = ctx.createLinearGradient(trackX, row2Y, trackX + fillW, row2Y);
        sGrad.addColorStop(0, '#15c98a');
        sGrad.addColorStop(1, '#6affc9');
        ctx.fillStyle = sGrad;
        roundRectPath(ctx, trackX + 1, row2Y - 4, fillW - 2, 8, 4);
        ctx.fill();
      }

      // Chunky inked slider knob
      const knobX = trackX + trackW * effMusicRatio;
      ctx.fillStyle = musicOnNow ? '#ffe875' : '#b8b0cc';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(knobX, row2Y, 9.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = musicOnNow ? '#0b7853' : '#6c5c94';
      ctx.font = `700 12.5px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(effMusicRatio * 100)}%`, segX + segW - 2, row2Y + 0.5);

      // Row 3: Haptics / Vibration well + comic pulse icon
      const row3Y = panelY + 222;
      if (Art) {
        Art.drawCartoonCard(ctx, panelX + 18, row3Y - 25, panelW - 36, 50, 'cream', 16);
      }

      this._drawHapticsIcon(ctx, panelX + 42, row3Y, this.hapticsEnabled);

      ctx.textAlign = 'left';
      ctx.fillStyle = ink;
      ctx.font = `700 14.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(tr.haptics || 'Haptics', panelX + 64, row3Y + 0.5);

      this.uiRects.hapticsOnBtn = { x: segX, y: row3Y - segH * 0.5, w: segW * 0.5, h: segH };
      this.uiRects.hapticsOffBtn = { x: segX + segW * 0.5, y: row3Y - segH * 0.5, w: segW * 0.5, h: segH };

      this._drawSegmentedControl(
        ctx,
        segX,
        row3Y - segH * 0.5,
        segW,
        segH,
        tr.on || 'ON',
        tr.off || 'OFF',
        this.hapticsEnabled
      );

      // Row 4: Language well + comic globe icon
      const row4Y = panelY + 284;
      if (Art) {
        Art.drawCartoonCard(ctx, panelX + 18, row4Y - 25, panelW - 36, 50, 'cream', 16);
      }

      this._drawGlobeIcon(ctx, panelX + 42, row4Y);

      ctx.textAlign = 'left';
      ctx.fillStyle = ink;
      ctx.font = `700 14.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(tr.language || 'Language', panelX + 64, row4Y + 0.5);

      this.uiRects.langEnBtn = { x: segX, y: row4Y - segH * 0.5, w: segW * 0.5, h: segH };
      this.uiRects.langTrBtn = { x: segX + segW * 0.5, y: row4Y - segH * 0.5, w: segW * 0.5, h: segH };

      this._drawSegmentedControl(
        ctx,
        segX,
        row4Y - segH * 0.5,
        segW,
        segH,
        'English',
        'Türkçe',
        this.lang === 'en'
      );

      // Row 5: Play Store Compliance — Privacy & Terms + Data Reset cartoon buttons
      const btnY = panelY + 340;
      const btnH = 42;
      const gap = 10;
      const halfBtnW = (panelW - 36 - gap) * 0.5;
      const privX = panelX + 18;
      const rstX = privX + halfBtnW + gap;

      this.uiRects.settingsPrivacyBtn = { x: privX, y: btnY, w: halfBtnW, h: btnH };
      this.uiRects.settingsResetBtn = { x: rstX, y: btnY, w: halfBtnW, h: btnH };

      if (Art) {
        Art.drawCartoonButton(ctx, privX, btnY, halfBtnW, btnH, 'slate', 16);
        Art.drawCartoonButton(ctx, rstX, btnY, halfBtnW, btnH, this.confirmResetPending ? 'rose' : 'orange', 16);
      }

      ctx.fillStyle = '#fff8eb';
      ctx.font = `700 12.5px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText(tr.privacyBtn || 'Privacy & Terms', privX + halfBtnW * 0.5, btnY + btnH * 0.5 + 0.5);

      ctx.fillStyle = this.confirmResetPending ? '#fff8eb' : ink;
      ctx.font = `700 12px ${C.FONTS.DISPLAY}`;
      const resetLabel = this.confirmResetPending
        ? tr.confirmReset || 'Tap Again to Confirm'
        : tr.resetDataBtn || 'Reset Data';
      ctx.fillText(resetLabel, rstX + halfBtnW * 0.5, btnY + btnH * 0.5 + 0.5);

      if (this.resetStatusMsg) {
        ctx.fillStyle = '#6affc9';
        ctx.font = `700 12.5px ${C.FONTS.DISPLAY}`;
        ctx.fillText(this.resetStatusMsg, C.WIDTH * 0.5, panelY + 416);
      } else {
        ctx.fillStyle = 'rgba(255, 248, 235, 0.56)';
        ctx.font = `600 11.5px ${C.FONTS.DISPLAY}`;
        ctx.fillText('Jelly Climb v1.3.0', C.WIDTH * 0.5, panelY + 418);
      }

      ctx.restore();
    }

    _drawPauseModal(ctx) {
      const tr = this.t();
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      const spring = this._easeOutBack(clamp(this.modalAnim, 0, 1));
      const scale = 0.86 + 0.14 * spring;

      ctx.save();
      ctx.fillStyle = `rgba(17, 10, 38, ${0.74 * clamp(this.modalAnim * 1.5, 0, 1)})`;
      this._fillViewportRect(ctx);

      const panelW = 340;
      const panelH = 322;
      const panelX = (C.WIDTH - panelW) * 0.5;
      const panelY = (C.HEIGHT - panelH) * 0.5;
      this.uiRects.modalPanel = { x: panelX, y: panelY, w: panelW, h: panelH };

      ctx.translate(C.WIDTH * 0.5, C.HEIGHT * 0.5);
      ctx.scale(scale, scale);
      ctx.translate(-C.WIDTH * 0.5, -C.HEIGHT * 0.5);

      this._drawMonumentTablet(ctx, panelX, panelY, panelW, panelH, 26);

      // Warm gold cartoon pause badge beside header title
      const badgeCx = panelX + 34;
      const badgeCy = panelY + 35;
      ctx.fillStyle = '#ffcf4d';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(badgeCx, badgeCy, 12.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = ink;
      roundRectPath(ctx, badgeCx - 5, badgeCy - 5.5, 3.6, 11, 1.5);
      ctx.fill();
      roundRectPath(ctx, badgeCx + 1.4, badgeCy - 5.5, 3.6, 11, 1.5);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 20.5px ${C.FONTS.DISPLAY}`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4.6;
      ctx.strokeStyle = ink;
      ctx.strokeText(tr.pauseTitle || 'PAUSED', panelX + 54, panelY + 36);
      ctx.fillStyle = '#fff8eb';
      ctx.fillText(tr.pauseTitle || 'PAUSED', panelX + 54, panelY + 36);

      const closeSize = 34;
      const closeX = panelX + panelW - closeSize - 18;
      const closeY = panelY + 19;
      this.uiRects.modalCloseBtn = { x: closeX, y: closeY, w: closeSize, h: closeSize };
      this._drawCloseMedallion(ctx, closeX, closeY, closeSize);

      // Warm cream mode + altitude status plaque with Jelly crest & corner mossy leaf sprout
      const pillX = panelX + 22;
      const pillY = panelY + 62;
      const pillW = panelW - 44;
      const pillH = 38;
      if (Art) {
        Art.drawCartoonCard(ctx, pillX, pillY, pillW, pillH, 'cream', 15);
      }

      // Tiny storybook leaf sprout perched atop the left edge of the status plaque
      ctx.save();
      ctx.translate(pillX + 18, pillY + 1);
      ctx.fillStyle = '#7de01d';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(-3.5, -4, 4.4, 2.3, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#b5ff47';
      ctx.beginPath();
      ctx.ellipse(3.5, -4.5, 4.8, 2.5, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Left mini hero medallion inside status plaque
      const miniCx = pillX + 22;
      const miniCy = pillY + pillH * 0.5;
      ctx.fillStyle = '#253978';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(miniCx, miniCy, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      this._drawMiniJellyPreview(ctx, miniCx, miniCy + 0.5, 8.6, 'none', this.equippedColor, false);

      // Right golden gem crest inside status plaque
      this._drawGemEmblem(ctx, pillX + pillW - 21, miniCy, 7.2);

      const modeLabel =
        this.gameMode === 'rising'
          ? tr.modeRising || 'RISING FLOOR'
          : this.gameMode === 'tutorial'
            ? tr.modeTutorial || 'TUTORIAL'
            : tr.modeClassic || 'CLASSIC';
      const modeColor =
        this.gameMode === 'rising' ? '#b0390c' : this.gameMode === 'tutorial' ? '#9e5b04' : '#166e3a';

      ctx.font = `700 13px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = modeColor;
      ctx.fillText(
        `${modeLabel}  •  ${Math.floor(this.currentMeters)} m`,
        panelX + panelW * 0.5 + 1,
        pillY + pillH * 0.5 + 0.5,
        pillW - 88
      );

      // Subtle themed divider flourishes flanking the pause subtitle
      const hintText = tr.pauseHint || 'World & physics are paused';
      ctx.font = `600 11.5px ${C.FONTS.DISPLAY}`;
      const hintTw = Math.min(pillW - 54, ctx.measureText(hintText).width);
      const hintCy = panelY + 114;
      const divGap = hintTw * 0.5 + 10;
      ctx.strokeStyle = 'rgba(255, 224, 140, 0.32)';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pillX + 10, hintCy);
      ctx.lineTo(C.WIDTH * 0.5 - divGap, hintCy);
      ctx.moveTo(C.WIDTH * 0.5 + divGap, hintCy);
      ctx.lineTo(pillX + pillW - 10, hintCy);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 248, 235, 0.84)';
      ctx.fillText(hintText, panelX + panelW * 0.5, hintCy + 0.5, pillW - 40);

      // Primary Emerald Resume CTA
      const btnX = panelX + 22;
      const btnW = panelW - 44;
      const resY = panelY + 130;
      const resH = 52;
      this.uiRects.pauseResumeBtn = { x: btnX, y: resY, w: btnW, h: resH };

      if (Art) {
        Art.drawCartoonButton(ctx, btnX, resY, btnW, resH, 'green', 26);
      }

      ctx.font = `700 16px ${C.FONTS.DISPLAY}`;
      this._drawUiRow(
        ctx,
        [
          { icon: 'play', r: 5.8, color: ink, gap: 8 },
          { text: tr.resume || 'RESUME', color: ink }
        ],
        C.WIDTH * 0.5,
        resY + resH * 0.5 + 1,
        'center',
        ink,
        btnW - 24
      );

      // Secondary row: Restart + Settings (with inked cartoon icons)
      const secY = panelY + 195;
      const secH = 44;
      const gap = 10;
      const halfW = (btnW - gap) * 0.5;
      const rstX = btnX;
      const setX = btnX + halfW + gap;
      this.uiRects.pauseRestartBtn = { x: rstX, y: secY, w: halfW, h: secH };
      this.uiRects.pauseSettingsBtn = { x: setX, y: secY, w: halfW, h: secH };

      for (const item of [
        { x: rstX, icon: 'restart', color: '#ffe478', label: tr.restartRun || 'RESTART' },
        { x: setX, icon: 'gear', color: '#fff8eb', label: tr.settings || 'SETTINGS' }
      ]) {
        if (Art) {
          Art.drawCartoonButton(ctx, item.x, secY, halfW, secH, 'slate', 16);
        }
        ctx.font = `700 12.2px ${C.FONTS.DISPLAY}`;
        this._drawUiRow(
          ctx,
          [
            { icon: item.icon, r: 5.8, color: item.color, gap: 6 },
            { text: item.label, color: '#fff8eb' }
          ],
          item.x + halfW * 0.5,
          secY + secH * 0.5 + 0.5,
          'center',
          '#fff8eb',
          halfW - 14
        );
      }

      // Main Menu button with cozy home icon
      const menuY = panelY + 252;
      const menuH = 42;
      this.uiRects.pauseMenuBtn = { x: btnX, y: menuY, w: btnW, h: menuH };

      if (Art) {
        Art.drawCartoonButton(ctx, btnX, menuY, btnW, menuH, 'rose', 16);
      }

      ctx.font = `700 13.5px ${C.FONTS.DISPLAY}`;
      this._drawUiRow(
        ctx,
        [
          { icon: 'home', r: 6.2, color: '#fff8eb', gap: 7 },
          { text: tr.mainMenuBtn || 'MAIN MENU', color: '#fff8eb' }
        ],
        btnX + btnW * 0.5,
        menuY + menuH * 0.5 + 0.5,
        'center',
        '#fff8eb',
        btnW - 22
      );

      ctx.restore();
    }

    _drawPrivacyModal(ctx) {
      const tr = this.t();
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      const spring = this._easeOutBack(clamp(this.modalAnim, 0, 1));
      const scale = 0.86 + 0.14 * spring;

      ctx.save();
      ctx.fillStyle = `rgba(17, 10, 38, ${0.74 * clamp(this.modalAnim * 1.5, 0, 1)})`;
      this._fillViewportRect(ctx);

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
      ctx.font = `700 19.5px ${C.FONTS.DISPLAY}`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4.6;
      ctx.strokeStyle = ink;
      ctx.strokeText(tr.privacyTitle || 'PRIVACY & TERMS', panelX + 24, panelY + 36);
      ctx.fillStyle = '#fff8eb';
      ctx.fillText(tr.privacyTitle || 'PRIVACY & TERMS', panelX + 24, panelY + 36);

      const closeSize = 34;
      const closeX = panelX + panelW - closeSize - 18;
      const closeY = panelY + 19;
      this.uiRects.modalCloseBtn = { x: closeX, y: closeY, w: closeSize, h: closeSize };
      this._drawCloseMedallion(ctx, closeX, closeY, closeSize);

      // Warm cream parchment reading card
      const wellX = panelX + 20;
      const wellY = panelY + 66;
      const wellW = panelW - 40;
      const wellH = 324;
      if (Art) {
        Art.drawCartoonCard(ctx, wellX, wellY, wellW, wellH, 'cream', 18);
      }

      const lines = tr.policyLines || [];
      ctx.fillStyle = ink;
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
      const btnH = 42;
      const gap = 12;
      const halfW = (wellW - gap) * 0.5;
      const backX = wellX;
      const openX = wellX + halfW + gap;

      this.uiRects.privacyBackBtn = { x: backX, y: btnY, w: halfW, h: btnH };
      this.uiRects.privacyOpenPageBtn = { x: openX, y: btnY, w: halfW, h: btnH };

      if (Art) {
        Art.drawCartoonButton(ctx, backX, btnY, halfW, btnH, 'slate', 16);
        Art.drawCartoonButton(ctx, openX, btnY, halfW, btnH, 'green', 16);
      }
      ctx.fillStyle = '#fff8eb';
      ctx.font = `700 12.5px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tr.backToSettings || '← Back', backX + halfW * 0.5, btnY + btnH * 0.5 + 0.5);

      ctx.fillStyle = ink;
      ctx.fillText(tr.openFullPolicy || 'Full Policy ↗', openX + halfW * 0.5, btnY + btnH * 0.5 + 0.5);

      ctx.restore();
    }

    _drawSpeakerIcon(ctx, x, y, isOn) {
      if (JellyGame.Art) {
        JellyGame.Art.drawSpeakerIcon(ctx, x, y, isOn);
      }
    }

    _drawMusicIcon(ctx, x, y, isOn) {
      if (JellyGame.Art) {
        JellyGame.Art.drawMusicIcon(ctx, x, y, isOn);
      }
    }

    _drawGlobeIcon(ctx, x, y) {
      if (JellyGame.Art) {
        JellyGame.Art.drawGlobeIcon(ctx, x, y);
      }
    }

    _drawHapticsIcon(ctx, x, y, isOn) {
      const ink = '#1b1136';
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = isOn ? '#ffd147' : '#b8b0cc';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      roundRectPath(ctx, -6, -9.5, 12, 19, 3.2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isOn ? '#36f5b0' : '#7b7096';
      roundRectPath(ctx, -3.8, -6.5, 7.6, 11, 1.5);
      ctx.fill();

      if (isOn) {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(side * 9.5, -5.5);
          ctx.quadraticCurveTo(side * 12, 0, side * 9.5, 5.5);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    _drawSegmentedControl(ctx, x, y, w, h, leftLabel, rightLabel, isLeftActive) {
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      ctx.save();
      // Chunky inked dark-plum recessed track
      ctx.fillStyle = '#1b1138';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.2;
      roundRectPath(ctx, x, y, w, h, 19);
      ctx.fill();
      ctx.stroke();

      const halfW = w * 0.5;
      const activeX = isLeftActive ? x + 3 : x + halfW + 1;

      if (Art) {
        Art.drawCartoonButton(ctx, activeX, y + 3, halfW - 4, h - 8, 'green', 15);
      } else {
        ctx.fillStyle = C.COLORS.jellyPrimary;
        roundRectPath(ctx, activeX, y + 3, halfW - 4, h - 8, 15);
        ctx.fill();
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 12.5px ${C.FONTS.DISPLAY}`;

      ctx.fillStyle = isLeftActive ? ink : '#f5e9cf';
      ctx.fillText(leftLabel, x + halfW * 0.5, y + h * 0.5);

      ctx.fillStyle = !isLeftActive ? ink : '#f5e9cf';
      ctx.fillText(rightLabel, x + halfW * 1.5, y + h * 0.5);
      ctx.restore();
    }

    _drawHeartIcon(ctx, cx, cy, size, filled) {
      if (JellyGame.Art) {
        JellyGame.Art.drawHeartIcon(ctx, cx, cy, size, filled);
      }
    }

    _drawHUD(ctx) {
      const tr = this.t();
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      ctx.save();

      // Top-left tactile cartoon pause/menu medallion
      const mBtn = this.uiRects.topMenuBtn;
      if (Art) {
        Art.drawCartoonButton(ctx, mBtn.x, mBtn.y, mBtn.w, mBtn.h, 'slate', 14);
      } else {
        ctx.fillStyle = '#342863';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.4;
        roundRectPath(ctx, mBtn.x, mBtn.y, mBtn.w, mBtn.h, 14);
        ctx.fill();
        ctx.stroke();
      }

      // Two sculpted pause/menu bars
      ctx.fillStyle = '#fff8eb';
      roundRectPath(ctx, mBtn.x + 11, mBtn.y + 13.5, 18, 3.6, 1.8);
      ctx.fill();
      roundRectPath(ctx, mBtn.x + 11, mBtn.y + 22, 13, 3.6, 1.8);
      ctx.fill();

      // Player Hearts capsule beside top-left Menu button (1 Heart normal, 3 Boss Arena Hearts)
      const hMax = this.player.maxHp || 1;
      const hCur = clamp(this.player.hp || 0, 0, hMax);
      const hpX = mBtn.x + mBtn.w + 8;
      const hpY = mBtn.y + 4;
      const hpW = hMax * 21 + 12;
      const hpH = 32;

      ctx.fillStyle = ink;
      roundRectPath(ctx, hpX, hpY + 2.5, hpW, hpH, 16);
      ctx.fill();

      ctx.fillStyle = hMax >= 3 ? '#451d36' : '#2a1f54';
      ctx.strokeStyle = hMax >= 3 ? '#ffd147' : ink;
      ctx.lineWidth = 2.4;
      roundRectPath(ctx, hpX, hpY, hpW, hpH, 16);
      ctx.fill();
      ctx.stroke();

      for (let i = 0; i < hMax; i++) {
        this._drawHeartIcon(ctx, hpX + 16.5 + i * 21, hpY + hpH * 0.5 + 1, 7.9, i < hCur);
      }

      // Top-center plump comic-inked altitude counter with milestone bounce
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
        '#fffdf5',
        '#ffe8b3',
        ink
      );
      ctx.restore();

      const activeBest = this.getActiveBestMeters();
      if (activeBest > 0) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = ink;
        ctx.strokeText(`${tr.best || 'BEST'}: ${activeBest} m`, C.WIDTH * 0.5, 50);
        ctx.fillStyle = this.isNewRecord ? '#6affc9' : '#fff5d6';
        ctx.fillText(`${tr.best || 'BEST'}: ${activeBest} m`, C.WIDTH * 0.5, 50);
      }

      // Tempo ribbon badge when active (x2+), or next Boss altitude tracker when idle
      if (this.tempoTier >= 2 && this.state === 'playing') {
        const isHigh = this.tempoTier >= C.TEMPO.DOUBLE_DROP_TIER;
        const pillW = 114;
        const pillH = 25;
        const pillX = (C.WIDTH - pillW) * 0.5;
        const pillY = activeBest > 0 ? 68 : 54;

        ctx.fillStyle = ink;
        roundRectPath(ctx, pillX, pillY + 2, pillW, pillH, 12.5);
        ctx.fill();

        ctx.fillStyle = '#251b4d';
        ctx.strokeStyle = isHigh ? '#ffd147' : '#6affc9';
        ctx.lineWidth = 2.2;
        roundRectPath(ctx, pillX, pillY, pillW, pillH, 12.5);
        ctx.fill();
        ctx.stroke();

        if (this.player.isAttached() && this.tempoTimer > 0) {
          const ratio = clamp(this.tempoTimer / C.TEMPO.WINDOW_SEC, 0, 1);
          ctx.fillStyle = isHigh ? 'rgba(255, 209, 71, 0.34)' : 'rgba(106, 255, 201, 0.28)';
          roundRectPath(ctx, pillX + 2, pillY + 2, (pillW - 4) * ratio, pillH - 4, 10);
          ctx.fill();
        }

        const tempoLabel =
          this.tempoTier === C.TEMPO.MAX_TIER
            ? `x${this.tempoTier} ${tr.max || 'MAX'}`
            : `x${this.tempoTier} ${tr.tempo || 'TEMPO'}`;
        ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
        this._drawUiRow(
          ctx,
          [
            { icon: 'bolt', r: 4.5, color: isHigh ? '#ffe875' : '#6affc9', gap: 4 },
            { text: tempoLabel, color: isHigh ? '#ffe875' : '#6affc9' }
          ],
          C.WIDTH * 0.5,
          pillY + pillH * 0.5 + 0.5,
          'center',
          isHigh ? '#ffe875' : '#6affc9',
          pillW - 12
        );
      } else if (
        this.state === 'playing' &&
        this.gameMode !== 'tutorial' &&
        !this.activeBoss &&
        JellyGame.Bosses
      ) {
        const nextMilestone = JellyGame.Bosses.getMilestoneMeters(this.nextBossIndex);
        const nearBoss = nextMilestone - this.currentMeters <= 25;
        const nextCol = nearBoss ? '#ffe875' : '#ffdf91';
        const bossLabel = `${tr.bossNextAt || 'BOSS AT'} ${nextMilestone} m`;
        ctx.font = `700 10.5px ${C.FONTS.DISPLAY}`;
        const pillW = Math.min(184, Math.max(114, ctx.measureText(bossLabel).width + 32));
        const pillH = 20;
        const pillX = (C.WIDTH - pillW) * 0.5;
        const pillY = activeBest > 0 ? 67 : 53;

        ctx.fillStyle = ink;
        roundRectPath(ctx, pillX, pillY + 2, pillW, pillH, 10);
        ctx.fill();

        ctx.fillStyle = '#251b4d';
        ctx.strokeStyle = nearBoss ? '#ffd147' : ink;
        ctx.lineWidth = nearBoss ? 2 : 1.8;
        roundRectPath(ctx, pillX, pillY, pillW, pillH, 10);
        ctx.fill();
        ctx.stroke();

        this._drawUiRow(
          ctx,
          [
            { icon: 'crown', r: 4.5, color: '#ffd147', gap: 5 },
            { text: bossLabel, color: nextCol }
          ],
          C.WIDTH * 0.5,
          pillY + pillH * 0.5 + 0.5,
          'center',
          nextCol,
          pillW - 14
        );
      }

      // Active Super Magnet power-up countdown pill + pulsing magnetic halo around player
      if (this.state === 'playing' && this.magnetTimer > 0) {
        const mRatio = clamp(this.magnetTimer / 7.0, 0, 1);
        const mpW = 114;
        const mpH = 22;
        const mpX = (C.WIDTH - mpW) * 0.5;
        const mpY = (activeBest > 0 ? 94 : 80);

        ctx.fillStyle = ink;
        roundRectPath(ctx, mpX, mpY + 2, mpW, mpH, 11);
        ctx.fill();

        ctx.fillStyle = '#2d1448';
        ctx.strokeStyle = '#ff6b81';
        ctx.lineWidth = 2;
        roundRectPath(ctx, mpX, mpY, mpW, mpH, 11);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 107, 129, 0.36)';
        roundRectPath(ctx, mpX + 2, mpY + 2, (mpW - 4) * mRatio, mpH - 4, 9);
        ctx.fill();

        ctx.font = `700 10.5px ${C.FONTS.DISPLAY}`;
        this._drawUiRow(
          ctx,
          [
            { icon: 'spark', r: 4.2, color: '#ffe875', gap: 4 },
            { text: `${this.magnetTimer.toFixed(1)}s`, color: '#fff8eb' }
          ],
          C.WIDTH * 0.5,
          mpY + mpH * 0.5 + 0.5,
          'center',
          '#fff8eb',
          mpW - 12
        );

        // Subtle magnetic ripple ring around Jelly in world coordinates
        const pSy = this.player.positionY - this.cameraY;
        const pulseR = 30 + ((this.hintTime * 55) % 34);
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 224, 110, 0.42)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.player.positionX, pSy, pulseR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
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

      ctx.fillStyle = ink;
      roundRectPath(ctx, btn.x, btn.y + 3, btn.w, btn.h, 20);
      ctx.fill();

      ctx.fillStyle = '#2d215c';
      ctx.strokeStyle = this._hasWardrobeBadge() ? '#ffd147' : ink;
      ctx.lineWidth = 2.4;
      roundRectPath(ctx, btn.x, btn.y, btn.w, btn.h, 20);
      ctx.fill();
      ctx.stroke();

      this._drawGemEmblem(ctx, btn.x + 19, btn.y + btn.h * 0.5, 7);

      ctx.fillStyle = '#fff8eb';
      ctx.font = `700 14px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${this.gems}`, btn.x + 31, btn.y + btn.h * 0.5 + 0.5);

      this._drawMiniJellyPreview(
        ctx,
        btn.x + btn.w - 19,
        btn.y + btn.h * 0.5 + 1,
        10.5,
        this.equippedAccessory
      );

      if (this._hasWardrobeBadge()) {
        ctx.fillStyle = '#ff4757';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(btn.x + btn.w - 5, btn.y + 5, 5.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      ctx.restore();
    }

    _drawShockwaveRings(ctx) {
      if (!this.shockwaveRings || this.shockwaveRings.length === 0) return;
      ctx.save();
      for (let i = 0; i < this.shockwaveRings.length; i++) {
        const ring = this.shockwaveRings[i];
        ctx.globalAlpha = clamp(ring.alpha, 0, 1);
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = ring.lineWidth;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y - this.cameraY, ring.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawChronoRewindGhost(ctx) {
      const anim = this.chronoRewindAnim;
      if (!anim || !anim.path || anim.path.length === 0) return;
      ctx.save();

      // Glowing time-thread ribbon across recorded path
      ctx.strokeStyle = 'rgba(116, 242, 255, 0.48)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < anim.path.length; i++) {
        const pt = anim.path[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y - this.cameraY);
        else ctx.lineTo(pt.x, pt.y - this.cameraY);
      }
      ctx.stroke();

      // Afterimage echoes along path
      const total = anim.path.length;
      const stride = Math.max(1, Math.floor(total / 10));
      for (let i = 0; i < total; i += stride) {
        const pt = anim.path[i];
        const alpha = 0.16 + (i / total) * 0.34;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#74f2ff';
        ctx.strokeStyle = '#a78bfa';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y - this.cameraY, this.player.radius * 0.84, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Rotating counter-clockwise Chronos dial ring around rewinding Jelly
      const px = this.player.positionX;
      const py = this.player.positionY - this.cameraY;
      const dialR = this.player.radius + 13;
      const spin = -this.hintTime * 11;
      ctx.globalAlpha = 0.92;
      ctx.strokeStyle = '#74f2ff';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(px, py, dialR, spin, spin + Math.PI * 1.45);
      ctx.stroke();

      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, dialR + 5, -spin, -spin + Math.PI * 0.9);
      ctx.stroke();

      ctx.restore();
    }

    _drawAngelReviveWings(ctx) {
      const anim = this.angelReviveAnim;
      if (!anim) return;
      const sx = this.player.positionX;
      const sy = this.player.positionY - this.cameraY;
      const flap = Math.sin(this.hintTime * 16) * 0.28;

      ctx.save();
      ctx.translate(sx, sy);

      // Soft warm radiance behind Angel Jelly
      const glow = ctx.createRadialGradient(0, 0, 6, 0, 0, 56);
      glow.addColorStop(0, 'rgba(255, 245, 189, 0.55)');
      glow.addColorStop(1, 'rgba(255, 209, 102, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 56, 0, Math.PI * 2);
      ctx.fill();

      // Double-layered golden-ivory Seraph Wings
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.scale(side, 1);
        ctx.rotate(-0.22 + flap);
        const wingGrad = ctx.createLinearGradient(0, -24, 44, 18);
        wingGrad.addColorStop(0, '#fffbe6');
        wingGrad.addColorStop(1, '#ffd166');
        ctx.fillStyle = wingGrad;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(6, -3);
        ctx.quadraticCurveTo(32, -36, 46, -10);
        ctx.quadraticCurveTo(38, 9, 27, 14);
        ctx.quadraticCurveTo(30, 23, 14, 19);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Inner cream wing feather detail
        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.beginPath();
        ctx.moveTo(9, 1);
        ctx.quadraticCurveTo(25, -16, 33, -4);
        ctx.quadraticCurveTo(25, 8, 13, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Floating golden halo hovering right above Jelly during glide
      const haloBob = Math.sin(this.hintTime * 10) * 2;
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.ellipse(0, -this.player.radius - 13 + haloBob, 14, 5, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    _drawAbilityHUDOrb(ctx) {
      const Ab = JellyGame.Abilities;
      const id = this.equippedAbility;
      if (!Ab || !id || id === 'none') {
        this.uiRects.abilityOrbBtn = null;
        return;
      }
      const def = Ab.getById(id);
      if (!def) return;

      const lvl = this.getAbilityLevel(id);
      const cx = C.WIDTH - 52;
      const cy = C.HEIGHT - 68;
      const r = 24;
      this.uiRects.abilityOrbBtn = { x: cx - r - 6, y: cy - r - 6, w: (r + 6) * 2, h: (r + 6) * 2 };

      const tr = this.t();
      const isPassive = def.kind === 'passive';
      const cdLeft = this.abilityCooldown;
      const cdMax = Math.max(1, this.abilityMaxCooldown || Ab.getCooldown(id, lvl) || 1);
      const isAirLocked = id === 'airDash' && this.player.isAttached();
      const isShieldLocked = id === 'shield' && this.player.hasShield;
      const isReady = isPassive ? this.angelCharges > 0 : cdLeft <= 0 && !isAirLocked && !isShieldLocked;

      const ink = C.COLORS.ink || '#1b1136';
      ctx.save();
      // Chunky inked drop lip
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(cx, cy + 3.5, r, 0, Math.PI * 2);
      ctx.fill();

      // Cozy twilight-plum orb medallion body
      const orbGrad = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
      orbGrad.addColorStop(0, '#3e2f78');
      orbGrad.addColorStop(1, '#22174a');
      ctx.fillStyle = orbGrad;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (isPassive) {
        const hasCharge = this.angelCharges > 0;
        ctx.strokeStyle = hasCharge ? def.primaryColor : 'rgba(255, 244, 214, 0.25)';
        ctx.lineWidth = hasCharge ? 2.6 : 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 2.6, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = hasCharge ? 1 : 0.35;
        Ab.drawIcon(ctx, id, cx, cy - 2, 13, this.hintTime);
        ctx.globalAlpha = 1;

        const total = Math.max(1, this.angelMaxCharges || Ab.getCharges('angel', lvl));
        const dotSp = 8;
        const startX = cx - ((total - 1) * dotSp) * 0.5;
        for (let i = 0; i < total; i++) {
          ctx.fillStyle = i < this.angelCharges ? '#ffd147' : 'rgba(255, 255, 255, 0.2)';
          ctx.beginPath();
          ctx.arc(startX + i * dotSp, cy + 14, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        if (cdLeft > 0) {
          const ratio = clamp(1 - cdLeft / cdMax, 0, 1);
          ctx.strokeStyle = 'rgba(255, 244, 214, 0.16)';
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.arc(cx, cy, r - 2.6, 0, Math.PI * 2);
          ctx.stroke();

          ctx.strokeStyle = def.primaryColor;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, r - 2.6, -Math.PI * 0.5, -Math.PI * 0.5 + ratio * Math.PI * 2);
          ctx.stroke();

          ctx.globalAlpha = 0.28;
          Ab.drawIcon(ctx, id, cx, cy, 13, this.hintTime);
          ctx.globalAlpha = 1;

          ctx.fillStyle = '#fff8eb';
          ctx.font = `700 12.5px ${C.FONTS.DISPLAY}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${Math.ceil(cdLeft)}`, cx, cy + 0.5);
        } else {
          const pulse = isReady ? 0.72 + 0.28 * Math.sin(this.hintTime * 5) : 0.35;
          ctx.strokeStyle = isReady ? def.primaryColor : 'rgba(255, 244, 214, 0.3)';
          ctx.globalAlpha = pulse;
          ctx.lineWidth = isReady ? 2.6 : 1.6;
          ctx.beginPath();
          ctx.arc(cx, cy, r - 2.6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = isReady ? 1 : 0.48;
          Ab.drawIcon(ctx, id, cx, cy - 1, 13.5, this.hintTime);
          ctx.globalAlpha = 1;

          if (isReady) {
            ctx.font = `700 8.5px ${C.FONTS.DISPLAY}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 3;
            ctx.strokeStyle = ink;
            ctx.strokeText(tr.powerReady || 'READY', cx, cy + r + 8);
            ctx.fillStyle = def.accentColor;
            ctx.fillText(tr.powerReady || 'READY', cx, cy + r + 8);
          }
        }
      }

      ctx.restore();
    }

    _drawThemeBanner(ctx) {
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      const t = this.themeBannerTimer;
      const alpha = t < 0.4 ? t / 0.4 : t > 2.0 ? (2.4 - t) / 0.4 : 1;
      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);

      ctx.font = `700 13px ${C.FONTS.DISPLAY}`;
      const pillW = clamp(ctx.measureText(this.themeBannerText).width + 64, 212, C.WIDTH - 32);
      const pillH = 36;
      const pillX = (C.WIDTH - pillW) * 0.5;
      const pillY = this.activeBoss && !this.activeBoss.defeated ? 148 : 104;

      if (Art) {
        Art.drawCartoonCard(ctx, pillX, pillY, pillW, pillH, 'cream', 18);
      } else {
        ctx.fillStyle = '#fff7e5';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.4;
        roundRectPath(ctx, pillX, pillY, pillW, pillH, 18);
        ctx.fill();
        ctx.stroke();
      }

      this._drawUiRow(
        ctx,
        [
          { icon: 'spark', r: 4.8, color: '#ffbe3b', gap: 7 },
          { text: this.themeBannerText, color: ink, gap: 7 },
          { icon: 'spark', r: 4.8, color: '#ffbe3b' }
        ],
        C.WIDTH * 0.5,
        pillY + pillH * 0.5 + 0.5,
        'center',
        ink,
        pillW - 20
      );

      ctx.restore();
    }

    _drawBossWarningBanner(ctx) {
      const Bosses = JellyGame.Bosses;
      if (!Bosses) return;
      const tr = this.t();
      const ink = C.COLORS.ink || '#1b1136';
      const def = Bosses.getBossDefForIndex(this.nextBossIndex);
      const bossName = this._getBossDisplayName(def, tr);
      const pulse = 0.5 + 0.5 * Math.sin(this.hintTime * 11);
      const alpha = clamp(Math.min(1, this.bossWarningTimer * 2), 0, 1);

      ctx.save();
      ctx.globalAlpha = alpha;

      const w = 286;
      const h = 46;
      const x = (C.WIDTH - w) * 0.5;
      const y = 98;

      ctx.fillStyle = ink;
      roundRectPath(ctx, x, y + 3, w, h, 16);
      ctx.fill();

      const isDivine = def.cycle > 1 || def.archetype.id === 'seraphos';
      ctx.fillStyle = isDivine ? '#4a3512' : '#5c1428';
      ctx.strokeStyle = isDivine ? '#ffe875' : pulse > 0.5 ? '#ff5e57' : '#ffd147';
      ctx.lineWidth = 2.5;
      roundRectPath(ctx, x, y, w, h, 16);
      ctx.fill();
      ctx.stroke();

      ctx.font = `700 10.5px ${C.FONTS.DISPLAY}`;
      this._drawUiRow(
        ctx,
        [
          { icon: isDivine ? 'crown' : 'warning', r: 4.8, color: isDivine ? '#ffe875' : '#ff7b72', gap: 5 },
          { text: tr.bossIncoming || 'BOSS APPROACHING!', color: isDivine ? '#fff3b0' : '#ff9ca3' }
        ],
        C.WIDTH * 0.5,
        y + 14.5,
        'center',
        isDivine ? '#fff3b0' : '#ff9ca3'
      );

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff8eb';
      ctx.font = `700 12.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(`${bossName}  •  ${def.milestoneMeters} m`, C.WIDTH * 0.5, y + 32);

      ctx.restore();
    }

    _drawBossHUD(ctx) {
      const boss = this.activeBoss;
      if (!boss || boss.defeated) return;
      const tr = this.t();
      const ink = C.COLORS.ink || '#1b1136';
      const arch = boss.archetype;
      const enraged = boss.phase >= 2;
      const isDivine = boss.isAscended || arch.id === 'seraphos';
      const accent = isDivine
        ? enraged
          ? '#fff3a1'
          : '#ffe478'
        : enraged
          ? arch.enrageColor
          : arch.primaryColor;
      const bossTitle = this._getBossDisplayName(boss.def, tr);

      ctx.save();
      const cardW = 298;
      const cardH = 46;
      const cardX = (C.WIDTH - cardW) * 0.5;
      const cardY = 98;

      ctx.fillStyle = ink;
      roundRectPath(ctx, cardX, cardY + 3, cardW, cardH, 16);
      ctx.fill();

      ctx.fillStyle = isDivine ? '#3c2b63' : '#2d215c';
      ctx.strokeStyle = isDivine || boss.phaseBannerTimer > 0 ? '#ffd147' : ink;
      ctx.lineWidth = 2.6;
      roundRectPath(ctx, cardX, cardY, cardW, cardH, 16);
      ctx.fill();
      ctx.stroke();

      ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
      this._drawUiRow(
        ctx,
        [
          { icon: 'crown', r: 4.8, color: '#ffd147', gap: 5 },
          { text: bossTitle, color: '#fff8eb' }
        ],
        cardX + 12,
        cardY + 14.5,
        'left',
        '#fff8eb',
        162
      );

      const phaseWord = tr.bossPhase || 'PHASE';
      const statusCore = `${phaseWord} ${boss.phase}/${boss.maxPhases} • ${boss.hp}/${boss.maxHp}`;
      ctx.font = `700 10.5px ${C.FONTS.DISPLAY}`;
      if (enraged) {
        this._drawUiRow(
          ctx,
          [
            { icon: 'bolt', r: 4.3, color: '#ffd147', gap: 3 },
            { text: statusCore, color: '#ffd147' }
          ],
          cardX + cardW - 12,
          cardY + 14.5,
          'right',
          '#ffd147'
        );
      } else {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = accent;
        ctx.fillText(statusCore, cardX + cardW - 12, cardY + 14.5);
      }

      // Inked Segmented HP Track
      const barX = cardX + 12;
      const barY = cardY + 26.5;
      const barW = cardW - 24;
      const barH = 11;

      ctx.fillStyle = ink;
      roundRectPath(ctx, barX, barY, barW, barH, 5.5);
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
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
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
      if (!toast || (!toast.accessory && toast.kind !== 'mission')) return;
      const tr = this.t();
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      const t = toast.timer;
      const maxT = toast.maxTimer || 3.1;
      const inOut = t < 0.35 ? t / 0.35 : t > maxT - 0.3 ? (maxT - t) / 0.3 : 1;
      const alpha = clamp(inOut, 0, 1);

      ctx.save();
      ctx.globalAlpha = alpha;
      const slideY = (1 - this._easeOutBack(clamp(inOut, 0, 1))) * -22;

      const w = 282;
      const h = 54;
      const x = (C.WIDTH - w) * 0.5;
      const baseY = this.activeBoss && !this.activeBoss.defeated ? 148 : 96;
      const y = baseY + slideY;

      if (Art) {
        Art.drawCartoonCard(ctx, x, y, w, h, 'gold', 27);
      }

      let headLabel = `${tr.rewardUnlockedToast || 'UNLOCKED'}!`;
      let bodyLabel = '';
      if (toast.kind === 'mission' && toast.mission) {
        headLabel = tr.missionCompletedToast || 'DAILY MISSION DONE!';
        const tpl = (tr.missionLabels && tr.missionLabels[toast.mission.type]) || toast.mission.type;
        bodyLabel = tpl.replace('{n}', String(toast.mission.target));
        // Cozy star-check medallion on left
        ctx.fillStyle = '#15c98a';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(x + 30, y + h * 0.5, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        this._drawUiIcon(ctx, 'check', x + 30, y + h * 0.5, 6.5, ink);
      } else {
        this._drawMiniJellyPreview(ctx, x + 30, y + h * 0.5, 14, toast.accessory.id);
        bodyLabel = (tr.accNames && tr.accNames[toast.accessory.id]) || toast.accessory.name;
      }

      ctx.font = `700 10.5px ${C.FONTS.DISPLAY}`;
      this._drawUiRow(
        ctx,
        [
          { icon: 'trophy', r: 4.8, color: '#ff9f1c', gap: 5 },
          { text: headLabel, color: '#b0390c' }
        ],
        x + 54,
        y + 17.5,
        'left',
        '#b0390c'
      );

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ink;
      ctx.font = `700 13px ${C.FONTS.DISPLAY}`;
      ctx.fillText(bodyLabel, x + 54, y + 36, w - 128);

      if (toast.bonusDrops > 0) {
        ctx.fillStyle = ink;
        roundRectPath(ctx, x + w - 66, y + 14, 54, 24, 12);
        ctx.fill();
        ctx.font = `700 12px ${C.FONTS.DISPLAY}`;
        this._drawUiRow(
          ctx,
          [
            { text: `+${toast.bonusDrops}`, color: '#ffe875', gap: 3 },
            { icon: 'gem', r: 3.9 }
          ],
          x + w - 39,
          y + 26.5,
          'center',
          '#ffe875'
        );
      }

      ctx.restore();
    }

    _drawDeathOverlay(ctx) {
      const tr = this.t();
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      const rawT = clamp((this.deathTimer - 0.35) / 0.26, 0, 1);
      const spring = this._easeOutBack(rawT);
      const scale = 0.88 + 0.12 * spring;

      ctx.save();
      ctx.globalAlpha = rawT;

      ctx.fillStyle = 'rgba(17, 10, 38, 0.72)';
      this._fillViewportRect(ctx);

      const Ads = JellyGame.Ads;
      const showAdRevive = Boolean(
        Ads && Ads.isEnabled() && Ads.canShowRewarded('revive') && !this.adReviveUsedThisRun
      );
      const showAdDouble = Boolean(
        Ads &&
          Ads.isEnabled() &&
          Ads.canShowRewarded('doubleDrops') &&
          !this.adDoubleUsedThisRun &&
          this.runGemsEarned > 0
      );
      const hasAdRow = showAdRevive || showAdDouble;
      const adExtraH = hasAdRow ? 50 : 0;
      this.uiRects.deathAdReviveBtn = null;
      this.uiRects.deathAdDoubleBtn = null;

      const cardW = 318;
      const cardH = 310 + adExtraH;
      const cardX = (C.WIDTH - cardW) * 0.5;
      const cardY = C.HEIGHT * 0.285 - adExtraH * 0.4;

      ctx.translate(C.WIDTH * 0.5, cardY + cardH * 0.5);
      ctx.scale(scale, scale);
      ctx.translate(-C.WIDTH * 0.5, -(cardY + cardH * 0.5));

      this._drawMonumentTablet(ctx, cardX, cardY, cardW, cardH, 26);

      // Warm cream cartoon scoreboard card inside tablet
      if (Art) {
        Art.drawCartoonCard(ctx, cardX + 20, cardY + 18, cardW - 40, 110, 'cream', 18);
      }

      this._drawSculptedWord(
        ctx,
        `${this.currentMeters} m`,
        C.WIDTH * 0.5,
        cardY + 51,
        38,
        '#ffe875',
        '#ff9f1c',
        ink
      );

      const activeBest = this.getActiveBestMeters();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 13px ${C.FONTS.DISPLAY}`;
      if (this.isNewRecord) {
        this._drawUiRow(
          ctx,
          [
            { icon: 'star', r: 4.8, color: '#ffbe3b', gap: 5 },
            { text: `${tr.newBest || 'NEW BEST!'} (${activeBest} m)`, color: '#097550' }
          ],
          C.WIDTH * 0.5,
          cardY + 86,
          'center',
          '#097550'
        );
      } else {
        ctx.fillStyle = '#5a4a82';
        ctx.fillText(`${tr.best || 'BEST'}: ${activeBest} m`, C.WIDTH * 0.5, cardY + 86);
      }

      // Run stats badge inside score well (Gems earned + Bosses defeated)
      ctx.font = `700 12.5px ${C.FONTS.DISPLAY}`;
      const runStatParts =
        this.runBossesDefeated > 0
          ? [
              { text: `+${this.runGemsEarned}`, color: '#b0390c', gap: 4 },
              { icon: 'gem', r: 4.5, gap: 7 },
              { text: '•', color: '#5a4a82', gap: 7 },
              { icon: 'crown', r: 4.6, color: '#ffd147', gap: 4 },
              { text: `${this.runBossesDefeated}`, color: ink }
            ]
          : [
              { text: `+${this.runGemsEarned}`, color: '#b0390c', gap: 4 },
              { icon: 'gem', r: 4.5, gap: 5 },
              { text: tr.dropsUnit || 'Drops', color: ink }
            ];
      this._drawUiRow(ctx, runStatParts, C.WIDTH * 0.5, cardY + 110, 'center', ink, 250);

      // Optional Dormant Rewarded Ad Row (strictly hidden unless JellyGame.Ads.CONFIG.ENABLED === true)
      const btnW = 258;
      const btnX = (C.WIDTH - btnW) * 0.5;
      let nextBtnY = cardY + 146;
      if (hasAdRow) {
        const adH = 40;
        const adGap = 8;
        if (showAdRevive && showAdDouble) {
          const hw = (btnW - adGap) * 0.5;
          this.uiRects.deathAdReviveBtn = { x: btnX, y: nextBtnY, w: hw, h: adH };
          this.uiRects.deathAdDoubleBtn = { x: btnX + hw + adGap, y: nextBtnY, w: hw, h: adH };
          if (Art) {
            Art.drawCartoonButton(ctx, btnX, nextBtnY, hw, adH, 'gold', 18);
            Art.drawCartoonButton(ctx, btnX + hw + adGap, nextBtnY, hw, adH, 'orange', 18);
          }
          ctx.font = `700 11px ${C.FONTS.DISPLAY}`;
          ctx.textAlign = 'center';
          ctx.fillStyle = ink;
          ctx.fillText(tr.adReviveBtn || 'REVIVE (AD)', btnX + hw * 0.5, nextBtnY + adH * 0.5 + 0.5, hw - 10);
          ctx.fillText(tr.adDoubleBtn || '2X DROPS (AD)', btnX + hw + adGap + hw * 0.5, nextBtnY + adH * 0.5 + 0.5, hw - 10);
        } else {
          const isRev = showAdRevive;
          if (isRev) this.uiRects.deathAdReviveBtn = { x: btnX, y: nextBtnY, w: btnW, h: adH };
          else this.uiRects.deathAdDoubleBtn = { x: btnX, y: nextBtnY, w: btnW, h: adH };
          if (Art) {
            Art.drawCartoonButton(ctx, btnX, nextBtnY, btnW, adH, isRev ? 'gold' : 'orange', 18);
          }
          ctx.font = `700 12.5px ${C.FONTS.DISPLAY}`;
          ctx.textAlign = 'center';
          ctx.fillStyle = ink;
          ctx.fillText(
            isRev ? tr.adReviveBtn || 'REVIVE (AD)' : tr.adDoubleBtn || '2X DROPS (AD)',
            C.WIDTH * 0.5,
            nextBtnY + adH * 0.5 + 0.5
          );
        }
        nextBtnY += adH + 10;
      }

      // Primary Tactile PLAY AGAIN Cushion Button
      const btnH = 50;
      const retryY = nextBtnY;
      this.uiRects.retryBtn = { x: btnX, y: retryY, w: btnW, h: btnH };

      if (Art) {
        Art.drawCartoonButton(ctx, btnX, retryY, btnW, btnH, 'green', 25);
      }

      ctx.font = `700 16px ${C.FONTS.DISPLAY}`;
      this._drawUiRow(
        ctx,
        [
          { icon: 'play', r: 5.5, color: ink, gap: 8 },
          { text: tr.playAgain || 'PLAY AGAIN', color: ink }
        ],
        C.WIDTH * 0.5,
        retryY + btnH * 0.5 + 1,
        'center',
        ink
      );

      // Secondary Tactile Action Row: Accessories (left) & Leaderboard (right)
      const shopY = retryY + 62;
      const shopH = 42;
      const halfGap = 10;
      const halfW = (btnW - halfGap) * 0.5;
      const shopX = btnX;
      const lbX = btnX + halfW + halfGap;

      this.uiRects.deathShopBtn = { x: shopX, y: shopY, w: halfW, h: shopH };
      this.uiRects.deathLbBtn = { x: lbX, y: shopY, w: halfW, h: shopH };

      const gearAlert = this._hasWardrobeBadge() || this.runUnlockedGear.length > 0;
      if (Art) {
        Art.drawCartoonButton(ctx, shopX, shopY, halfW, shopH, gearAlert ? 'gold' : 'slate', 18);
        Art.drawCartoonButton(ctx, lbX, shopY, halfW, shopH, 'slate', 18);
      }

      const shopBtnCol = gearAlert ? ink : '#fff8eb';
      ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
      const shopParts =
        this.runUnlockedGear.length > 0
          ? [
              { icon: 'trophy', r: 4.8, color: shopBtnCol, gap: 4 },
              { text: `${tr.rewardsTab || 'MILESTONES'}!`, color: shopBtnCol }
            ]
          : [
              { icon: 'gem', r: 4.2, gap: 4 },
              { text: `${this.gems}  ${tr.accessories || 'SHOP'}`, color: shopBtnCol }
            ];
      this._drawUiRow(
        ctx,
        shopParts,
        shopX + halfW * 0.5,
        shopY + shopH * 0.5 + 0.5,
        'center',
        shopBtnCol,
        halfW - 14
      );

      ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
      this._drawUiRow(
        ctx,
        [
          { icon: 'trophy', r: 5.2, color: '#ffd147', gap: 5 },
          { text: tr.leaderboard || 'RANKS', color: '#fff8eb' }
        ],
        lbX + halfW * 0.5,
        shopY + shopH * 0.5 + 0.5,
        'center',
        '#fff8eb',
        halfW - 14
      );

      // Quiet Tactile Menu Pill
      const menuY = shopY + 52;
      const menuH = 34;
      this.uiRects.deathMenuBtn = { x: btnX, y: menuY, w: btnW, h: menuH };

      ctx.fillStyle = '#1b1138';
      ctx.strokeStyle = 'rgba(255, 248, 235, 0.2)';
      ctx.lineWidth = 1.6;
      roundRectPath(ctx, btnX, menuY, btnW, menuH, 17);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff8eb';
      ctx.font = `700 12px ${C.FONTS.DISPLAY}`;
      ctx.fillText(tr.menu || 'MENU', C.WIDTH * 0.5, menuY + menuH * 0.5 + 0.5);

      ctx.restore();
    }

    _drawAccessoryDrawer(ctx) {
      const tr = this.t();
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
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
      ctx.fillStyle = `rgba(17, 10, 38, ${0.74 * clamp(this.modalAnim * 1.5, 0, 1)})`;
      this._fillViewportRect(ctx);

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
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4.6;
      ctx.strokeStyle = ink;
      ctx.strokeText(tr.accessories || 'ACCESSORIES', panelX + 24, panelY + 32);
      ctx.fillStyle = '#fff8eb';
      ctx.fillText(tr.accessories || 'ACCESSORIES', panelX + 24, panelY + 32);

      const gearCountText = `${this._getOwnedGearCount()}/${allList.length} ${tr.gearUnit || 'Gear'}`;
      const gearPillW = 92;
      const closeSize = 34;
      const closeX = panelX + panelW - closeSize - 18;
      const closeY = panelY + 16;
      const gearPillX = closeX - gearPillW - 10;
      const gearPillY = panelY + 20;
      ctx.fillStyle = '#dcfff0';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      roundRectPath(ctx, gearPillX, gearPillY, gearPillW, 24, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#097550';
      ctx.font = `700 11px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText(gearCountText, gearPillX + gearPillW * 0.5, gearPillY + 12.5);

      this.uiRects.modalCloseBtn = { x: closeX, y: closeY, w: closeSize, h: closeSize };
      this._drawCloseMedallion(ctx, closeX, closeY, closeSize);

      // Interactive Hero Stage Alcove (cobalt sky diorama + mossy pedestal + live Jelly + Color Swatches)
      const stageX = panelX + 20;
      const stageY = panelY + 54;
      const stageW = panelW - 40;
      const stageH = 92;

      const stageGrad = ctx.createLinearGradient(stageX, stageY, stageX, stageY + stageH);
      stageGrad.addColorStop(0, '#1f3f94');
      stageGrad.addColorStop(1, '#3162c4');
      ctx.fillStyle = stageGrad;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.4;
      roundRectPath(ctx, stageX, stageY, stageW, stageH, 18);
      ctx.fill();
      ctx.stroke();

      const pedX = stageX + 52;
      const pedY = stageY + 75;

      // Mini mossy stone pedestal under preview Jelly
      ctx.fillStyle = '#644061';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      roundRectPath(ctx, pedX - 27, pedY + 3, 54, 10, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#8ce827';
      roundRectPath(ctx, pedX - 28, pedY - 1, 56, 7, 3.5);
      ctx.fill();
      ctx.stroke();

      const bWave = Math.sin(this.wardrobePreviewBounce * Math.PI);
      const jumpY = -bWave * 9;
      const sqX = 1 - bWave * 0.14 + Math.sin(this.hintTime * 3.6) * 0.03;
      const sqY = 1 / sqX;

      ctx.save();
      ctx.translate(pedX, pedY - 19 + jumpY);
      ctx.scale(sqX, sqY);
      this._drawMiniJellyPreview(ctx, 0, 0, 18.5, this.equippedAccessory, this.equippedColor, true);
      ctx.restore();

      // Active slot pills showing equipped combo (HAT | FACE | BACK | PWR)
      const slotPillMeta = [
        ['head', (tr.slotNames && tr.slotNames.head) || 'HAT'],
        ['face', (tr.slotNames && tr.slotNames.face) || 'FACE'],
        ['back', (tr.slotNames && tr.slotNames.back) || 'BACK'],
        ['power', (tr.slotNames && tr.slotNames.power) || 'PWR']
      ];
      for (let i = 0; i < slotPillMeta.length; i++) {
        const [sKey, sLbl] = slotPillMeta[i];
        const isActiveSlot =
          sKey === 'power'
            ? this.equippedAbility && this.equippedAbility !== 'none'
            : this.equippedSlots && this.equippedSlots[sKey] !== 'none';
        const px = stageX + 92 + i * 38;
        const py = stageY + 11;
        ctx.fillStyle = isActiveSlot
          ? sKey === 'power'
            ? '#74f2ff'
            : '#6affc9'
          : 'rgba(27, 17, 54, 0.45)';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.6;
        roundRectPath(ctx, px, py, 35, 20, 10);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isActiveSlot ? ink : 'rgba(255, 248, 235, 0.72)';
        ctx.font = `700 8.5px ${C.FONTS.DISPLAY}`;
        ctx.fillText(sLbl, px + 17.5, py + 10.5, 31);
      }

      // Golden Drops counter pouch on top-right of Hero Stage
      const pouchW = 100;
      const pouchX = stageX + stageW - pouchW - 10;
      const pouchY = stageY + 9;
      ctx.fillStyle = '#fff2c2';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      roundRectPath(ctx, pouchX, pouchY, pouchW, 24, 12);
      ctx.fill();
      ctx.stroke();

      this._drawGemEmblem(ctx, pouchX + 15, pouchY + 12, 5.5);
      ctx.textAlign = 'left';
      ctx.fillStyle = ink;
      ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(
        `${this.gems} ${tr.dropsUnit || 'Drops'}`,
        pouchX + 26,
        pouchY + 12.5,
        pouchW - 34
      );

      // 5 Inked Cartoon Jelly Color Swatches
      this.uiRects.colorSwatches = [];
      const colors = C.JELLY_COLORS || [];
      const swStartX = stageX + 114;
      const swY = stageY + 61;
      const swSpacing = 48;
      const hasBodySkin = Boolean(this.equippedSlots && this.equippedSlots.skin && this.equippedSlots.skin !== 'none');

      for (let i = 0; i < colors.length; i++) {
        const col = colors[i];
        const sx = swStartX + i * swSpacing;
        const unlocked = this.unlockedColors.has(col.id);
        const equipped = !hasBodySkin && this.equippedColor === col.id;
        this.uiRects.colorSwatches.push({
          color: col,
          rect: { x: sx - 18, y: swY - 18, w: 36, h: 38 }
        });

        ctx.save();
        ctx.translate(sx, swY);
        if (equipped) {
          ctx.strokeStyle = '#fff8eb';
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.arc(0, 0, 14.5, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = col.primary;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, 11.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
        ctx.beginPath();
        ctx.arc(-3.5, -3.5, 3, 0, Math.PI * 2);
        ctx.fill();

        if (!unlocked) {
          const priceCol = this.gems >= col.cost ? '#ffe875' : 'rgba(255, 248, 235, 0.75)';
          ctx.font = `700 9.5px ${C.FONTS.DISPLAY}`;
          this._drawUiRow(
            ctx,
            [
              { icon: 'gem', r: 3.3, gap: 2 },
              { text: `${col.cost}`, color: priceCol }
            ],
            0,
            19.5,
            'center',
            priceCol
          );
        }
        ctx.restore();
      }

      // 5-Category Filter Tabs: HATS | GLASSES | BACK | POWERS | GOALS
      const tabBarX = panelX + 20;
      const tabBarY = panelY + 154;
      const tabBarW = panelW - 40;
      const tabH = 36;
      const tabGap = 5;
      const oneTabW = (tabBarW - tabGap * 4) / 5;

      const tabs = [
        { key: 'head', rectKey: 'wardrobeTabHeadBtn', label: tr.tabHead || 'HATS' },
        { key: 'face', rectKey: 'wardrobeTabFaceBtn', label: tr.tabFace || 'GLASSES' },
        { key: 'back', rectKey: 'wardrobeTabBackBtn', label: tr.tabBack || 'BACK' },
        { key: 'powers', rectKey: 'wardrobeTabPowersBtn', label: tr.tabPowers || 'POWERS', icon: 'spark', cyan: true },
        { key: 'rewards', rectKey: 'wardrobeTabRewardsBtn', label: tr.rewardsTab || 'GOALS', icon: 'trophy', gold: true }
      ];

      for (let i = 0; i < tabs.length; i++) {
        const tb = tabs[i];
        const tx = tabBarX + i * (oneTabW + tabGap);
        const isOn = activeTab === tb.key;
        this.uiRects[tb.rectKey] = { x: tx, y: tabBarY, w: oneTabW, h: tabH };

        if (Art) {
          const scheme = isOn ? (tb.gold ? 'gold' : tb.cyan ? 'orange' : 'green') : 'slate';
          Art.drawCartoonButton(ctx, tx, tabBarY, oneTabW, tabH - 2, scheme, 12, !isOn);
        }

        const txtCol = isOn ? ink : '#fff8eb';
        ctx.font = `700 10px ${C.FONTS.DISPLAY}`;
        if (tb.icon) {
          const icoCol = isOn ? ink : tb.gold ? '#ffd147' : '#ffaa1d';
          this._drawUiRow(
            ctx,
            [
              { icon: tb.icon, r: 4.3, color: icoCol, gap: 3.5 },
              { text: tb.label, color: txtCol }
            ],
            tx + oneTabW * 0.5,
            tabBarY + (tabH - 2) * 0.5 + (isOn ? 0.5 : 2),
            'center',
            txtCol,
            oneTabW - 6
          );
        } else {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = txtCol;
          ctx.fillText(tb.label, tx + oneTabW * 0.5, tabBarY + (tabH - 2) * 0.5 + (isOn ? 0.5 : 2), oneTabW - 6);
        }

        const unclaimedMissions = JellyGame.Missions ? JellyGame.Missions.getUnclaimedCount() : 0;
        if (tb.key === 'rewards' && (this.unseenRewards.size > 0 || unclaimedMissions > 0) && !isOn) {
          ctx.fillStyle = '#ff4757';
          ctx.strokeStyle = ink;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(tx + oneTabW - 6, tabBarY + 6, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (
          tb.key === 'powers' &&
          this.equippedAbility &&
          this.equippedAbility !== 'none' &&
          !isOn
        ) {
          ctx.fillStyle = '#ffaa1d';
          ctx.beginPath();
          ctx.arc(tx + oneTabW - 7, tabBarY + 6.5, 3.2, 0, Math.PI * 2);
          ctx.fill();
        } else if (
          tb.key !== 'rewards' &&
          tb.key !== 'powers' &&
          this.equippedSlots &&
          this.equippedSlots[tb.key] !== 'none' &&
          !isOn
        ) {
          ctx.fillStyle = '#6affc9';
          ctx.beginPath();
          ctx.arc(tx + oneTabW - 7, tabBarY + 6.5, 3.2, 0, Math.PI * 2);
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
      this.uiRects.powerCards = [];
      this.uiRects.missionClaimBtns = [];

      ctx.fillStyle = '#191138';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.4;
      roundRectPath(ctx, wellX, wellY, wellW, wellH, 18);
      ctx.fill();
      ctx.stroke();

      if (activeTab === 'powers' && JellyGame.Abilities) {
        const abList = JellyGame.Abilities.LIST || [];
        const pCols = 2;
        const pGapX = 12;
        const pGapY = 12;
        const pPadX = 10;
        const pPadY = 11;
        const pCardW = (wellW - pPadX * 2 - pGapX) / pCols;
        const pCardH = 186;
        this.wardrobeScrollY = 0;

        for (let i = 0; i < abList.length; i++) {
          const ab = abList[i];
          const col = i % pCols;
          const row = Math.floor(i / pCols);
          const cx = wellX + pPadX + col * (pCardW + pGapX);
          const cy = wellY + pPadY + row * (pCardH + pGapY);
          const upRect = this._drawPowerShowcaseCard(ctx, ab, cx, cy, pCardW, pCardH, tr);
          this.uiRects.powerCards.push({
            ability: ab,
            rect: { x: cx, y: cy, w: pCardW, h: pCardH },
            upgradeRect: upRect
          });
        }

        ctx.fillStyle = '#ffe875';
        ctx.font = `600 11px ${C.FONTS.DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.fillText(
          tr.powersHint || 'Pick 1 Power (tap orb or double-tap to use)',
          C.WIDTH * 0.5,
          panelY + panelH - 18,
          panelW - 40
        );
        ctx.restore();
        return;
      }

      const cols = 2;
      const gapX = 12;
      const gapY = 10;
      const padX = 10;
      const padY = 10;
      const cardW = (wellW - padX * 2 - gapX) / cols;
      const cardH = 124;
      const rows = Math.ceil(tabItems.length / cols);

      const dailyList =
        isRewardsTab && JellyGame.Missions ? JellyGame.Missions.getMissions() : [];
      const mRowH = 48;
      const mGap = 7;
      const missionsBlockH =
        dailyList.length > 0 ? 22 + dailyList.length * mRowH + (dailyList.length - 1) * mGap + 28 : 0;

      const totalH = missionsBlockH + rows * cardH + Math.max(0, rows - 1) * gapY + padY * 2;
      const maxScroll = Math.max(0, totalH - wellH);
      if (this.wardrobeScrollY > maxScroll) this.wardrobeScrollY = maxScroll;
      if (this.wardrobeScrollY < 0) this.wardrobeScrollY = 0;

      ctx.save();
      roundRectPath(ctx, wellX + 2, wellY + 2, wellW - 4, wellH - 4, 16);
      if (typeof ctx.clip === 'function') ctx.clip();

      // Section 1 (GOALS tab): Daily 3 Mini Missions with one-tap Claim buttons
      if (dailyList.length > 0) {
        let curY = wellY + padY - this.wardrobeScrollY;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffe875';
        ctx.font = `700 11px ${C.FONTS.DISPLAY}`;
        ctx.fillText(tr.dailyMissionsTitle || 'DAILY MISSIONS', wellX + padX + 2, curY + 8);
        curY += 22;

        const mW = wellW - padX * 2;
        for (let i = 0; i < dailyList.length; i++) {
          const m = dailyList[i];
          const done = m.progress >= m.target;
          const claimable = done && !m.claimed;
          if (curY + mRowH >= wellY && curY <= wellY + wellH) {
            if (Art) {
              Art.drawCartoonCard(
                ctx,
                wellX + padX,
                curY,
                mW,
                mRowH,
                m.claimed ? 'mint' : claimable ? 'gold' : 'cream',
                14
              );
            }

            // Left cartoon icon badge
            const icX = wellX + padX + 20;
            const icY = curY + mRowH * 0.5;
            ctx.fillStyle = '#253978';
            ctx.strokeStyle = ink;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(icX, icY, 13, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            this._drawUiIcon(ctx, m.icon || 'star', icX, icY, 5.2, '#ffe875');

            // Mission text + progress bar
            const tpl = (tr.missionLabels && tr.missionLabels[m.type]) || m.type;
            const mText = tpl.replace('{n}', String(m.target));
            const txtX = wellX + padX + 40;
            const btnW = 76;
            const barW = mW - 40 - btnW - 14;

            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = ink;
            ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
            ctx.fillText(mText, txtX, curY + 15.5, barW);

            // Progress bar track
            const barY = curY + 29;
            ctx.fillStyle = 'rgba(27, 17, 54, 0.16)';
            roundRectPath(ctx, txtX, barY, barW - 36, 8, 4);
            ctx.fill();
            const ratio = clamp(m.progress / Math.max(1, m.target), 0, 1);
            if (ratio > 0) {
              ctx.fillStyle = done ? '#15c98a' : '#ff9f1c';
              roundRectPath(ctx, txtX, barY, Math.max(6, (barW - 36) * ratio), 8, 4);
              ctx.fill();
            }
            ctx.fillStyle = '#5a4a82';
            ctx.font = `700 9.5px ${C.FONTS.DISPLAY}`;
            ctx.textAlign = 'right';
            ctx.fillText(`${Math.min(m.progress, m.target)}/${m.target}`, txtX + barW, barY + 4.5);

            // Right Claim / Reward pill
            const bx = wellX + padX + mW - btnW - 7;
            const by = curY + 9;
            const bh = mRowH - 18;
            if (claimable) {
              if (Art) Art.drawCartoonButton(ctx, bx, by, btnW, bh, 'green', 12);
              ctx.font = `700 10.5px ${C.FONTS.DISPLAY}`;
              this._drawUiRow(
                ctx,
                [
                  { text: `${tr.missionClaim || 'CLAIM'}`, color: ink, gap: 3 },
                  { text: `+${m.reward}`, color: ink }
                ],
                bx + btnW * 0.5,
                by + bh * 0.5 + 0.5,
                'center',
                ink,
                btnW - 8
              );
              this.uiRects.missionClaimBtns.push({
                missionId: m.id,
                rect: { x: bx, y: by, w: btnW, h: bh }
              });
            } else if (m.claimed) {
              ctx.fillStyle = 'rgba(9, 117, 80, 0.16)';
              ctx.strokeStyle = '#097550';
              ctx.lineWidth = 1.6;
              roundRectPath(ctx, bx, by, btnW, bh, 12);
              ctx.fill();
              ctx.stroke();
              ctx.font = `700 10px ${C.FONTS.DISPLAY}`;
              this._drawUiRow(
                ctx,
                [
                  { icon: 'check', r: 4, color: '#097550', gap: 3 },
                  { text: tr.missionDone || 'DONE', color: '#097550' }
                ],
                bx + btnW * 0.5,
                by + bh * 0.5 + 0.5,
                'center',
                '#097550'
              );
            } else {
              ctx.fillStyle = '#fff2c2';
              ctx.strokeStyle = ink;
              ctx.lineWidth = 1.6;
              roundRectPath(ctx, bx, by, btnW, bh, 12);
              ctx.fill();
              ctx.stroke();
              ctx.font = `700 11px ${C.FONTS.DISPLAY}`;
              this._drawUiRow(
                ctx,
                [
                  { text: `+${m.reward}`, color: '#b0390c', gap: 3 },
                  { icon: 'gem', r: 4 }
                ],
                bx + btnW * 0.5,
                by + bh * 0.5 + 0.5,
                'center',
                '#b0390c'
              );
            }
          }
          curY += mRowH + mGap;
        }

        // Section 2 header divider: Milestone Rewards
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffe875';
        ctx.font = `700 11px ${C.FONTS.DISPLAY}`;
        ctx.fillText(tr.milestonesSectionTitle || 'MILESTONE REWARDS', wellX + padX + 2, curY + 9);
      }

      for (let i = 0; i < tabItems.length; i++) {
        const acc = tabItems[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = wellX + padX + col * (cardW + gapX);
        const cy = wellY + padY + missionsBlockH + row * (cardH + gapY) - this.wardrobeScrollY;

        if (cy + cardH < wellY || cy > wellY + wellH) continue;

        this.uiRects.shopCards.push({
          accessory: acc,
          rect: { x: cx, y: cy, w: cardW, h: cardH }
        });

        this._drawGearShowcaseCard(ctx, acc, cx, cy, cardW, cardH, stats, tr, isRewardsTab);
      }
      ctx.restore();

      if (maxScroll > 0) {
        const trackH = wellH - 24;
        const thumbH = Math.max(32, (wellH / totalH) * trackH);
        const thumbY = wellY + 12 + (this.wardrobeScrollY / maxScroll) * (trackH - thumbH);
        ctx.fillStyle = 'rgba(255, 248, 235, 0.35)';
        roundRectPath(ctx, wellX + wellW - 6, thumbY, 3, thumbH, 1.5);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(255, 248, 235, 0.65)';
      ctx.font = `600 11.5px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText(tr.closeHint || 'Tap outside or ✕ to close', C.WIDTH * 0.5, panelY + panelH - 18);

      ctx.restore();
    }

    _drawPowerShowcaseCard(ctx, ab, cx, cy, cardW, cardH, tr) {
      const Ab = JellyGame.Abilities;
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      const lvl = this.getAbilityLevel(ab.id);
      const unlocked = lvl >= 1;
      const equipped = this.equippedAbility === ab.id;
      const nextCost = Ab ? Ab.getNextUpgradeCost(ab.id, lvl) : null;
      const canAfford = nextCost !== null && this.gems >= nextCost;

      if (Art) {
        Art.drawCartoonCard(ctx, cx, cy, cardW, cardH, equipped ? 'mint' : canAfford ? 'gold' : 'cream', 16);
      }

      // Cozy twilight-cobalt cartoon medallion on top-left
      const medX = cx + 28;
      const medY = cy + 30;
      ctx.fillStyle = '#253978';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(medX, medY, 18.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.save();
      if (!unlocked) ctx.globalAlpha = 0.72;
      if (Ab) Ab.drawIcon(ctx, ab.id, medX, medY, 11.5, this.hintTime);
      ctx.restore();

      // Top-right Level Pill
      ctx.fillStyle = unlocked ? '#221848' : 'rgba(27, 17, 54, 0.14)';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.4;
      roundRectPath(ctx, cx + cardW - 60, cy + 10, 50, 19, 9.5);
      ctx.fill();
      ctx.stroke();
      ctx.font = `700 9.5px ${C.FONTS.DISPLAY}`;
      if (unlocked) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffe875';
        ctx.fillText(`LV.${lvl}/10`, cx + cardW - 35, cy + 19.5);
      } else {
        this._drawUiRow(
          ctx,
          [
            { icon: 'lock', r: 3.6, color: '#5a4a82', gap: 3 },
            { text: '0/10', color: ink }
          ],
          cx + cardW - 35,
          cy + 19.5,
          'center',
          ink
        );
      }

      // Localized Title & Description (dark ink on warm cream card)
      const pName = (tr.abilityNames && tr.abilityNames[ab.id]) || ab.id;
      const pDesc = (tr.abilityDescs && tr.abilityDescs[ab.id]) || '';
      ctx.textAlign = 'left';
      ctx.fillStyle = ink;
      ctx.font = `700 12.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(pName, cx + 10, cy + 62, cardW - 20);

      ctx.fillStyle = '#5a4a82';
      ctx.font = `600 9.5px ${C.FONTS.UI}`;
      ctx.fillText(pDesc, cx + 10, cy + 79, cardW - 20);

      // Cooldown / Charges & Meaningful Per-Level Perk Progression Line
      let statText = '';
      if (ab.id === 'angel') {
        const spec = Ab && Ab.getAngelSpec ? Ab.getAngelSpec(Math.max(1, lvl)) : { charges: 1, grantShield: false, shockwave: false };
        const unit = spec.charges > 1 ? tr.powerRevivesUnit || 'revives' : tr.powerReviveUnit || 'revive';
        let curSummary = `${spec.charges} ${unit}`;
        if (lvl >= 2 && spec.grantShield) curSummary += tr.angelTagShield || '+Shield';
        if (lvl >= 7 && spec.shockwave) curSummary += tr.angelTagWave || '+Wave';
        const nextPerk =
          lvl >= 10
            ? tr.powerMaxed || 'MAX'
            : (tr.angelNextPerks && tr.angelNextPerks[Math.max(2, lvl + 1)]) || `Lv.${lvl + 1}`;
        statText = lvl >= 10 ? `${curSummary} • MAX` : `${curSummary} • ${nextPerk}`;
      } else {
        const curCd = Ab.getCooldown(ab.id, Math.max(1, lvl));
        const nxtCd = lvl > 0 && lvl < 10 ? Ab.getCooldown(ab.id, lvl + 1) : null;
        const unit = tr.powerCdSec || 's';
        statText = nxtCd ? `${curCd}${unit} → ${nxtCd}${unit}` : `${curCd}${unit}`;
      }
      ctx.fillStyle = unlocked ? '#097550' : '#b0390c';
      ctx.font = `700 10.5px ${C.FONTS.DISPLAY}`;
      ctx.fillText(statText, cx + 10, cy + 98, cardW - 20);

      // 10-pip mini level bar
      const pipW = (cardW - 20 - 9 * 2.5) / 10;
      const pipY = cy + 112;
      for (let k = 0; k < 10; k++) {
        ctx.fillStyle = k < lvl ? '#15c98a' : 'rgba(27, 17, 54, 0.14)';
        ctx.strokeStyle = k < lvl ? ink : 'transparent';
        ctx.lineWidth = 1;
        roundRectPath(ctx, cx + 10 + k * (pipW + 2.5), pipY, pipW, 5.5, 2.5);
        ctx.fill();
        if (k < lvl) ctx.stroke();
      }

      // Action buttons along bottom
      const btnY = cy + cardH - 36;
      const btnH = 26;
      if (!unlocked) {
        const fullW = cardW - 18;
        const bx = cx + 9;
        this._drawGearCardButton(ctx, bx, btnY, fullW, btnH, false, false, canAfford, [
          { text: `${tr.powerUnlock || 'UNLOCK'} •`, gap: 4 },
          { icon: 'gem', r: 4.0, gap: 2 },
          { text: `${nextCost}` }
        ]);
        return { x: bx, y: btnY, w: fullW, h: btnH };
      }

      const eqW = 58;
      const upW = cardW - 18 - eqW - 6;
      const eqX = cx + 9;
      const upX = eqX + eqW + 6;
      this._drawGearCardButton(
        ctx,
        eqX,
        btnY,
        eqW,
        btnH,
        equipped,
        true,
        false,
        equipped ? [{ icon: 'check', r: 4.6, color: ink }] : tr.equip || 'EQUIP'
      );
      this._drawGearCardButton(
        ctx,
        upX,
        btnY,
        upW,
        btnH,
        false,
        nextCost === null,
        canAfford,
        nextCost !== null
          ? [
              { icon: 'upgrade', r: 4.2, color: canAfford ? ink : '#6b5e85', gap: 3 },
              { icon: 'gem', r: 3.9, gap: 2 },
              { text: `${nextCost}` }
            ]
          : tr.powerMaxed || 'MAX'
      );
      return { x: upX, y: btnY, w: upW, h: btnH };
    }

    _drawGearShowcaseCard(ctx, acc, cx, cy, cardW, cardH, stats, tr, showGoalTag) {
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      const accMod = JellyGame.Accessories;
      const unlocked = this.unlockedAccessories.has(acc.id);
      const equipped = this.equippedSlots && this.equippedSlots[acc.slot] === acc.id;
      const isMilestone = acc.unlockType === 'milestone';
      const affordable = !unlocked && !isMilestone && this.gems >= acc.cost;
      const prog = isMilestone && accMod ? accMod.getMilestoneProgress(acc, stats) : null;
      const bonusDrops = (acc.milestone && acc.milestone.bonusDrops) || 0;

      if (Art) {
        const variant = equipped ? 'mint' : isMilestone && unlocked ? 'gold' : affordable ? 'gold' : 'cream';
        Art.drawCartoonCard(ctx, cx, cy, cardW, cardH, variant, 16);
      }

      // Top-left slot pill (when in GOALS tab) or milestone bonus badge (top-right)
      if (showGoalTag) {
        const sLabel = (tr.slotNames && tr.slotNames[acc.slot]) || acc.slot.toUpperCase();
        ctx.fillStyle = '#221848';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.4;
        roundRectPath(ctx, cx + 8, cy + 7, 42, 16, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff8eb';
        ctx.font = `700 8.5px ${C.FONTS.DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.fillText(sLabel, cx + 29, cy + 15.5);
      }

      if (isMilestone && bonusDrops > 0) {
        ctx.fillStyle = unlocked ? '#097550' : '#221848';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.4;
        roundRectPath(ctx, cx + cardW - 52, cy + 7, 44, 17, 8.5);
        ctx.fill();
        ctx.stroke();
        const badgeCol = unlocked ? '#a6ffe2' : '#ffe875';
        ctx.font = `700 9.5px ${C.FONTS.DISPLAY}`;
        const badgeParts = unlocked
          ? [
              { icon: 'check', r: 3.4, color: badgeCol, gap: 2 },
              { text: `+${bonusDrops}`, color: badgeCol, gap: 1.5 },
              { icon: 'gem', r: 3.3 }
            ]
          : [
              { text: `+${bonusDrops}`, color: badgeCol, gap: 2 },
              { icon: 'gem', r: 3.3 }
            ];
        this._drawUiRow(ctx, badgeParts, cx + cardW - 30, cy + 16, 'center', badgeCol);
      }

      // Cozy twilight-cobalt display medallion showcasing the item itself cleanly!
      const medCx = cx + cardW * 0.5;
      const medCy = cy + 37;
      ctx.fillStyle = equipped ? '#1a5e63' : '#253978';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(medCx, medCy, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.save();
      if (!unlocked && isMilestone) ctx.globalAlpha = 0.78;
      if (accMod && accMod.drawStandaloneCardIcon) {
        accMod.drawStandaloneCardIcon(ctx, acc, medCx, medCy, 14.5, this.hintTime);
      } else {
        this._drawMiniJellyPreview(ctx, medCx, medCy, 15.5, acc.id);
      }
      ctx.restore();

      // Localized accessory name in bold ink
      const accName = (tr.accNames && tr.accNames[acc.id]) || acc.name;
      ctx.fillStyle = ink;
      ctx.font = `700 11.5px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(accName, cx + cardW * 0.5, cy + 71, cardW - 14);

      if (isMilestone && !unlocked && prog) {
        const goalLabel = (tr.accMilestones && tr.accMilestones[acc.id]) || `${prog.target}`;
        ctx.fillStyle = '#5a4a82';
        ctx.font = `600 9.5px ${C.FONTS.UI}`;
        ctx.fillText(goalLabel, cx + cardW * 0.5, cy + 86);

        const barW = cardW - 24;
        const barH = 18;
        const barX = cx + 12;
        const barY = cy + 97;
        ctx.fillStyle = '#1b1138';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.6;
        roundRectPath(ctx, barX, barY, barW, barH, 9);
        ctx.fill();
        ctx.stroke();

        if (prog.ratio > 0) {
          const fillW = Math.max(10, (barW - 4) * prog.ratio);
          const barGrad = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
          barGrad.addColorStop(0, '#ffd147');
          barGrad.addColorStop(1, '#36f5b0');
          ctx.fillStyle = barGrad;
          roundRectPath(ctx, barX + 2, barY + 2, fillW, barH - 4, 7);
          ctx.fill();
        }

        const stat = acc.milestone && acc.milestone.stat;
        const unitSuffix = stat === 'bestClassic' || stat === 'bestRising' ? ' m' : '';
        const prefix = stat === 'bestTempo' ? 'x' : '';
        ctx.fillStyle = '#fff8eb';
        ctx.font = `700 9.5px ${C.FONTS.DISPLAY}`;
        ctx.fillText(
          `${prefix}${prog.current} / ${prefix}${prog.target}${unitSuffix}`,
          cx + cardW * 0.5,
          barY + barH * 0.5 + 0.5
        );
      } else {
        if (isMilestone) {
          const goalLabel = (tr.accMilestones && tr.accMilestones[acc.id]) || '';
          ctx.fillStyle = '#9e5b04';
          ctx.font = `600 9.5px ${C.FONTS.UI}`;
          ctx.fillText(goalLabel, cx + cardW * 0.5, cy + 84);
        }
        const badgeW = 104;
        const badgeH = 24;
        const badgeX = cx + (cardW - badgeW) * 0.5;
        const badgeY = cy + 92;
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
            ? [
                { icon: 'check', r: 4.1, color: ink, gap: 4 },
                { text: tr.equipped || 'EQUIPPED' }
              ]
            : unlocked
            ? tr.equip || 'EQUIP'
            : affordable
            ? [
                { text: `${tr.buy || 'GET'} •`, gap: 3 },
                { icon: 'gem', r: 3.8, gap: 2 },
                { text: `${acc.cost}` }
              ]
            : [
                { icon: 'gem', r: 3.8, gap: 3 },
                { text: `${acc.cost}` }
              ]
        );
      }
    }

    _drawGearCardButton(ctx, x, y, w, h, equipped, unlocked, affordable, labelOrParts) {
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      const r = h * 0.5;
      const scheme = equipped ? 'green' : unlocked ? 'slate' : affordable ? 'gold' : 'disabled';
      const txtColor = equipped || affordable ? ink : unlocked ? '#fff8eb' : '#5e5342';

      if (Art) {
        Art.drawCartoonButton(ctx, x, y, w, h, scheme, r);
      } else {
        ctx.fillStyle = equipped ? '#36f5b0' : unlocked ? '#342863' : '#b5a892';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2;
        roundRectPath(ctx, x, y, w, h, r);
        ctx.fill();
        ctx.stroke();
      }

      ctx.font = `700 11px ${C.FONTS.DISPLAY}`;
      if (Array.isArray(labelOrParts)) {
        this._drawUiRow(
          ctx,
          labelOrParts,
          x + w * 0.5,
          y + h * 0.5 + 0.5,
          'center',
          txtColor,
          w - 10
        );
      } else {
        ctx.fillStyle = txtColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelOrParts, x + w * 0.5, y + h * 0.5 + 0.5, w - 10);
      }
    }

    _drawTrophyIcon(ctx, x, y, scale = 1) {
      if (JellyGame.Art) {
        JellyGame.Art.drawTrophyIcon(ctx, x, y, scale);
      }
    }

    _drawRankCrest(ctx, x, y, rank, ghost = false) {
      const ink = C.COLORS.ink || '#1b1136';
      ctx.save();
      ctx.translate(x, y);
      if (ghost) ctx.globalAlpha = 0.45;

      if (rank >= 1 && rank <= 3) {
        const palettes = {
          1: { top: '#fff5b8', mid: '#ffd147', bot: '#d97706', text: ink },
          2: { top: '#ffffff', mid: '#d0dced', bot: '#7a8ca8', text: ink },
          3: { top: '#ffe0bd', mid: '#f4a261', bot: '#b45309', text: ink }
        };
        const p = palettes[rank];

        if (rank === 1 && !ghost) {
          ctx.fillStyle = '#ffd147';
          ctx.strokeStyle = ink;
          ctx.lineWidth = 1.8;
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(-8, -11);
          ctx.lineTo(-9.5, -17.5);
          ctx.lineTo(-3.5, -13.5);
          ctx.lineTo(0, -19);
          ctx.lineTo(3.5, -13.5);
          ctx.lineTo(9.5, -17.5);
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
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.2;
        ctx.lineJoin = 'round';

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
        ctx.fillStyle = '#362968';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 12.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fff8eb';
        ctx.font = `700 11px ${C.FONTS.DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`#${rank}`, 0, 0.5);
      }

      ctx.restore();
    }

    _drawModeTabIcon(ctx, x, y, mode, active) {
      const ink = C.COLORS.ink || '#1b1136';
      ctx.save();
      ctx.translate(x, y);
      ctx.lineJoin = 'round';
      if (mode === 'rising') {
        ctx.fillStyle = active ? ink : '#ff9f43';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.quadraticCurveTo(6.5, -1, 4.5, 5.5);
        ctx.quadraticCurveTo(1.5, 7.5, -0.5, 6);
        ctx.quadraticCurveTo(-5.5, 5, -5, -0.5);
        ctx.quadraticCurveTo(-2, -3.5, 0, -7);
        ctx.closePath();
        ctx.fill();
        if (!active) ctx.stroke();
      } else {
        ctx.fillStyle = active ? ink : '#6affc9';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -6.5);
        ctx.lineTo(6.5, 5);
        ctx.lineTo(2, 5);
        ctx.lineTo(0, 2);
        ctx.lineTo(-2, 5);
        ctx.lineTo(-6.5, 5);
        ctx.closePath();
        ctx.fill();
        if (!active) ctx.stroke();
      }
      ctx.restore();
    }

    _drawLeaderboardModal(ctx) {
      const tr = this.t();
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      const spring = this._easeOutBack(clamp(this.modalAnim, 0, 1));
      const scale = 0.86 + 0.14 * spring;
      const isRising = this.lbTab === 'rising';
      const accent = isRising ? '#ff793f' : '#36f5b0';

      ctx.save();
      ctx.fillStyle = `rgba(17, 10, 38, ${0.74 * clamp(this.modalAnim * 1.5, 0, 1)})`;
      this._fillViewportRect(ctx);

      const panelW = 396;
      const panelH = 622;
      const panelX = (C.WIDTH - panelW) * 0.5;
      const panelY = (C.HEIGHT - panelH) * 0.5;
      this.uiRects.modalPanel = { x: panelX, y: panelY, w: panelW, h: panelH };

      ctx.translate(C.WIDTH * 0.5, C.HEIGHT * 0.5);
      ctx.scale(scale, scale);
      ctx.translate(-C.WIDTH * 0.5, -C.HEIGHT * 0.5);

      this._drawMonumentTablet(ctx, panelX, panelY, panelW, panelH, 26);

      const bucket =
        this.leaderboard && this.leaderboard.data
          ? this.leaderboard.data[this.lbTab]
          : { entries: [], playerEntry: null, playerRank: null, totalPlayers: 0 };
      const entries = bucket.entries || [];

      // Sculpted Trophy Crest + Title
      this._drawTrophyIcon(ctx, panelX + 34, panelY + 34, 0.96);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 18.5px ${C.FONTS.DISPLAY}`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = ink;
      const titleY = entries.length > 0 ? panelY + 28 : panelY + 35;
      ctx.strokeText(tr.leaderboardTitle || 'LEADERBOARD', panelX + 54, titleY);
      ctx.fillStyle = '#fff8eb';
      ctx.fillText(tr.leaderboardTitle || 'LEADERBOARD', panelX + 54, titleY);

      if (entries.length > 0) {
        const count = bucket.totalPlayers || entries.length;
        const unit = count === 1 ? tr.climberUnit || 'climber' : tr.climbersUnit || 'climbers';
        const countStr = `${count} ${unit}`;
        ctx.fillStyle = isRising ? '#ffb554' : '#72ffcb';
        ctx.font = `700 10.5px ${C.FONTS.UI}`;
        ctx.fillText(countStr, panelX + 55, panelY + 46);
      }

      // Close medallion & Refresh medallion
      const closeSize = 34;
      const closeX = panelX + panelW - closeSize - 18;
      const closeY = panelY + 18;
      this.uiRects.modalCloseBtn = { x: closeX, y: closeY, w: closeSize, h: closeSize };
      this._drawCloseMedallion(ctx, closeX, closeY, closeSize);

      const refX = closeX - 42;
      const refY = closeY;
      this.uiRects.lbRefreshBtn = { x: refX, y: refY, w: closeSize, h: closeSize };
      if (Art) {
        Art.drawCartoonButton(ctx, refX, refY, closeSize, closeSize, 'slate', closeSize * 0.5);
      }
      const rCx = refX + closeSize * 0.5;
      const rCy = refY + closeSize * 0.5;

      ctx.save();
      ctx.translate(rCx, rCy);
      if (this.leaderboard && this.leaderboard.loading) {
        ctx.rotate(this.hintTime * 6);
      }
      ctx.strokeStyle = '#72ffcb';
      ctx.fillStyle = '#72ffcb';
      ctx.lineWidth = 2.2;
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

      // 2-Mode Tab Segmented Bar (CLASSIC | RISING FLOOR)
      const tabW = panelW - 36;
      const tabH = 42;
      const tabX = panelX + 18;
      const tabY = panelY + 62;
      const halfTabW = tabW * 0.5;
      this.uiRects.lbTabClassicBtn = { x: tabX, y: tabY, w: halfTabW, h: tabH };
      this.uiRects.lbTabRisingBtn = { x: tabX + halfTabW, y: tabY, w: halfTabW, h: tabH };

      ctx.fillStyle = '#191138';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.4;
      roundRectPath(ctx, tabX, tabY, tabW, tabH, 21);
      ctx.fill();
      ctx.stroke();

      const activeTabX = isRising ? tabX + halfTabW + 2 : tabX + 3;
      if (Art) {
        Art.drawCartoonButton(ctx, activeTabX, tabY + 3, halfTabW - 5, tabH - 8, isRising ? 'orange' : 'green', 17);
      }

      ctx.textBaseline = 'middle';
      ctx.font = `700 12.5px ${C.FONTS.DISPLAY}`;

      const classicLabel = tr.modeClassic || 'CLASSIC';
      const classicW = ctx.measureText(classicLabel).width;
      const classicCenterX = tabX + halfTabW * 0.5;
      this._drawModeTabIcon(ctx, classicCenterX - classicW * 0.5 - 6, tabY + tabH * 0.5, 'classic', !isRising);
      ctx.textAlign = 'center';
      ctx.fillStyle = !isRising ? ink : '#fff8eb';
      ctx.fillText(classicLabel, classicCenterX + 8, tabY + tabH * 0.5);

      const risingLabel = tr.modeRising || 'RISING FLOOR';
      const risingW = ctx.measureText(risingLabel).width;
      const risingCenterX = tabX + halfTabW * 1.5;
      this._drawModeTabIcon(ctx, risingCenterX - risingW * 0.5 - 6, tabY + tabH * 0.5, 'rising', isRising);
      ctx.fillStyle = isRising ? ink : '#fff8eb';
      ctx.fillText(risingLabel, risingCenterX + 8, tabY + tabH * 0.5);

      // Warm Cream Player Profile Identity Card
      const profX = panelX + 18;
      const profY = panelY + 114;
      const profW = panelW - 36;
      const profH = 48;
      if (Art) {
        Art.drawCartoonCard(ctx, profX, profY, profW, profH, 'cream', 16);
      }

      this._drawMiniJellyPreview(
        ctx,
        profX + 26,
        profY + profH * 0.5,
        13.5,
        this.equippedAccessory,
        this.equippedColor
      );

      const nick = this.leaderboard ? this.leaderboard.nickname : 'JELLY';
      ctx.textAlign = 'left';
      ctx.fillStyle = ink;
      ctx.font = `700 14px ${C.FONTS.DISPLAY}`;
      ctx.fillText(nick, profX + 50, profY + 16.5);

      const src = this.leaderboard ? this.leaderboard.storageSource : 'offline';
      const isConnected = src === 'mongodb' || src === 'local';
      const statusDotCol = isConnected ? '#099672' : '#d97706';
      const statusText = isConnected
        ? tr.dbMongo || 'Online'
        : tr.dbOffline || 'Offline';
      const allGearCount = JellyGame.Accessories ? JellyGame.Accessories.LIST.length : 18;
      const subtitleText = `${statusText}  •  ${this._getOwnedGearCount()}/${allGearCount} ${tr.gearUnit || 'Gear'}`;

      ctx.fillStyle = statusDotCol;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(profX + 54, profY + 34, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#5a4a82';
      ctx.font = `600 10.5px ${C.FONTS.UI}`;
      ctx.fillText(subtitleText, profX + 63, profY + 34.5);

      // Tactile Cartoon [EDIT] button on right of profile strip
      const editW = 80;
      const editH = 29;
      const editX = profX + profW - editW - 9;
      const editY = profY + (profH - editH) * 0.5;
      this.uiRects.lbEditNickBtn = { x: editX, y: editY, w: editW, h: editH };

      if (Art) {
        Art.drawCartoonButton(ctx, editX, editY, editW, editH, 'slate', 14.5);
      }

      ctx.font = `700 11px ${C.FONTS.DISPLAY}`;
      this._drawUiRow(
        ctx,
        [
          { icon: 'pencil', r: 4.5, color: '#fff8eb', gap: 5 },
          { text: tr.editNick || 'EDIT', color: '#fff8eb' }
        ],
        editX + editW * 0.5,
        editY + editH * 0.5 + 0.5,
        'center',
        '#fff8eb',
        editW - 10
      );

      // Recessed Scrollable Hall-of-Fame Well
      const wellX = panelX + 18;
      const wellY = panelY + 172;
      const wellW = panelW - 36;
      const wellH = 342;
      this.uiRects.lbListWell = { x: wellX, y: wellY, w: wellW, h: wellH };
      this.uiRects.lbPromoBtn = null;

      ctx.fillStyle = '#191138';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.4;
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

        this._drawRankCrest(ctx, emCx, emCy - 34, 1, false);
        this._drawMiniJellyPreview(
          ctx,
          emCx,
          emCy + 10,
          22,
          this.equippedAccessory,
          this.equippedColor,
          true
        );
        ctx.fillStyle = '#fff8eb';
        ctx.font = `700 13.5px ${C.FONTS.DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.fillText(
          tr.emptyLeaderboard || 'No climbs yet, claim #1!',
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

        for (let slot = entries.length + 1; slot <= 3; slot++) {
          const slotH = 48;
          if (curY + slotH >= wellY && curY <= wellY + wellH) {
            ctx.save();
            ctx.setLineDash([5, 4]);
            ctx.fillStyle = 'rgba(255, 247, 229, 0.08)';
            ctx.strokeStyle = 'rgba(255, 247, 229, 0.25)';
            ctx.lineWidth = 1.6;
            roundRectPath(ctx, rx, curY, rw, slotH, 14);
            ctx.fill();
            ctx.stroke();
            ctx.setLineDash([]);

            this._drawRankCrest(ctx, rx + 26, curY + slotH * 0.5, slot, true);
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(255, 248, 235, 0.65)';
            ctx.font = `600 11.5px ${C.FONTS.UI}`;
            ctx.fillText(
              tr.openPodiumSlot || 'Open spot, set a score!',
              rx + 56,
              curY + slotH * 0.5 + 0.5
            );
            ctx.restore();
          }
          curY += slotH + rowGap;
        }

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

      if (maxScroll > 0) {
        const trackH = wellH - 24;
        const thumbH = Math.max(30, (wellH / totalContentH) * trackH);
        const thumbY = wellY + 12 + (this.lbScrollY / maxScroll) * (trackH - thumbH);
        ctx.fillStyle = 'rgba(255, 248, 235, 0.32)';
        roundRectPath(ctx, wellX + wellW - 6, thumbY, 3, thumbH, 1.5);
        ctx.fill();
      }

      // Pinned Footer "YOUR RANK" Summary Bar
      const footX = panelX + 18;
      const footY = panelY + 526;
      const footW = panelW - 36;
      const footH = 48;
      if (Art) {
        Art.drawCartoonCard(ctx, footX, footY, footW, footH, isRising ? 'gold' : 'mint', 16);
      }

      const localBest = isRising ? this.bestRisingMeters : this.bestMeters;
      const myRankNum = bucket.playerRank;
      const myRankStr = myRankNum ? `#${myRankNum}` : '--';
      ctx.textAlign = 'left';
      ctx.fillStyle = isRising ? '#b0390c' : '#097550';
      ctx.font = `700 13px ${C.FONTS.DISPLAY}`;
      ctx.fillText(`${tr.yourRank || 'YOUR RANK'}: ${myRankStr}`, footX + 16, footY + footH * 0.5 + 0.5);

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
        ctx.fillStyle = ink;
        ctx.font = `700 13.5px ${C.FONTS.DISPLAY}`;
        ctx.fillText(`${localBest} m`, footX + footW - 16, footY + 17);
        ctx.fillStyle = '#b0390c';
        ctx.font = `700 10.5px ${C.FONTS.UI}`;
        ctx.fillText(gapLabel, footX + footW - 16, footY + 34);
      } else {
        ctx.fillStyle = ink;
        ctx.font = `700 14px ${C.FONTS.DISPLAY}`;
        ctx.fillText(
          localBest > 0 ? `${localBest} m` : tr.unranked || 'Climb to rank!',
          footX + footW - 16,
          footY + footH * 0.5 + 0.5
        );
      }

      ctx.fillStyle = 'rgba(255, 248, 235, 0.65)';
      ctx.font = `600 11.5px ${C.FONTS.DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText(tr.closeHint || 'Tap outside or ✕ to close', C.WIDTH * 0.5, panelY + panelH - 18);

      ctx.restore();
    }

    _drawLeaderboardRow(ctx, entry, rx, ry, rw, rowH, isMe, isRising, accent, tr) {
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      const rk = entry.rank;
      const isChamp = rk === 1;

      if (Art) {
        const variant = isChamp ? 'gold' : isMe ? 'mint' : 'cream';
        Art.drawCartoonCard(ctx, rx, ry, rw, rowH, variant, 15);
      }

      // Vector Rank Crest
      this._drawRankCrest(ctx, rx + 26, ry + rowH * 0.5 + (isChamp ? 3 : 0), rk, false);

      const avX = rx + 64;
      const avY = ry + rowH * 0.5;
      this._drawMiniJellyPreview(
        ctx,
        avX,
        avY,
        isChamp ? 13.5 : rk <= 3 ? 12 : 11,
        entry.accessory || 'none',
        entry.color || 'mint',
        isChamp
      );

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ink;
      ctx.font = `700 ${isChamp ? 14 : 13}px ${C.FONTS.DISPLAY}`;
      const nameLabel = isMe ? `${entry.nickname} (${tr.youTag || 'YOU'})` : entry.nickname;
      const pillW = 74;
      const pillX = rx + rw - pillW - 10;
      const nameX = rx + 94;
      const maxNameW = Math.max(80, pillX - nameX - 10);
      const nameY = isChamp ? ry + rowH * 0.35 : ry + rowH * 0.5 + 0.5;
      ctx.fillText(nameLabel, nameX, nameY, maxNameW);

      if (isChamp) {
        ctx.font = `700 10.5px ${C.FONTS.DISPLAY}`;
        const subRowY = ry + rowH * 0.69;
        this._drawUiRow(
          ctx,
          [
            { icon: 'star', r: 4.1, color: '#ff9f1c', gap: 4 },
            { text: tr.championTag || 'CHAMPION' }
          ],
          nameX,
          subRowY,
          'left',
          '#b0390c'
        );
      }

      // Right-aligned Inked Cartoon Score Pill
      const scoreText = `${entry.meters} m`;
      const pillH = isChamp ? 30 : 26;
      const pillY = ry + (rowH - pillH) * 0.5;
      ctx.fillStyle = isChamp ? '#221848' : isMe ? '#097550' : '#322563';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.8;
      roundRectPath(ctx, pillX, pillY, pillW, pillH, pillH * 0.5);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = isChamp ? '#ffe875' : '#fff8eb';
      ctx.font = `700 ${isChamp ? 14.5 : 13.5}px ${C.FONTS.DISPLAY}`;
      ctx.fillText(scoreText, pillX + pillW * 0.5, pillY + pillH * 0.5 + 0.5);
    }

    _drawLbMilestonePromo(ctx, x, y, w, h, tr) {
      const Art = JellyGame.Art;
      const ink = (Art && Art.PALETTE.INK) || '#1b1136';
      if (Art) {
        Art.drawCartoonCard(ctx, x, y, w, h, 'gold', 14);
      }

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

      ctx.font = `700 11px ${C.FONTS.DISPLAY}`;
      this._drawUiRow(
        ctx,
        [
          { icon: 'trophy', r: 4.8, color: '#ff9f1c', gap: 4 },
          { text: `${tr.rewardsTab || 'MILESTONES'} →`, color: '#b0390c' }
        ],
        x + w - 12,
        y + 23,
        'right',
        '#b0390c'
      );

      ctx.textAlign = 'left';
      ctx.fillStyle = ink;
      ctx.font = `600 10.5px ${C.FONTS.UI}`;
      ctx.fillText(
        tr.milestoneHintStrip || 'Hit altitude & tempo goals to earn rare gear!',
        x + 14,
        y + 52
      );

      return { x, y, w, h };
    }

    _drawMiniJellyPreview(ctx, x, y, r, accessoryId, colorId, determined = false) {
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

      const ink = C.COLORS.ink || '#1b1136';
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

      const activeSkin =
        JellyGame.Accessories && JellyGame.Accessories.getActiveSkin && accessoryId && accessoryId !== 'none'
          ? JellyGame.Accessories.getActiveSkin(accessoryId)
          : null;

      // Cel-shaded cartoon Jelly (or Sport Ball Skin!) body with thick ink outline
      ctx.fillStyle = pal.primary;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      if (typeof ctx.clip === 'function') ctx.clip();

      if (activeSkin && JellyGame.Accessories.drawBodySkin) {
        JellyGame.Accessories.drawBodySkin(ctx, activeSkin, r, false);
      } else {
        ctx.fillStyle = pal.light;
        ctx.beginPath();
        ctx.ellipse(-r * 0.25, -r * 0.3, r * 0.72, r * 0.56, -0.35, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = pal.primary;
        ctx.beginPath();
        ctx.ellipse(-r * 0.08, -r * 0.1, r * 0.88, r * 0.78, -0.25, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = pal.secondary;
        ctx.beginPath();
        ctx.arc(r * 0.34, r * 0.38, r * 0.98, 0, Math.PI * 2);
        ctx.arc(-r * 0.16, -r * 0.2, r * 0.82, 0, Math.PI * 2, true);
        ctx.fill();
      }
      ctx.restore();

      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1.8, 2.5 * Math.min(1.2, eyeScale));
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

      // Glossy cartoon specular shine on preview jelly
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(-r * 0.33, -r * 0.36, r * 0.24, r * 0.13, -0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-r * 0.54, -r * 0.12, r * 0.08, 0, Math.PI * 2);
      ctx.fill();

      // Cute comic eyes, cheeks, brows & smile scaled cleanly to preview size
      const isDarkSkin = activeSkin === 'eightBall';
      const faceInk = isDarkSkin ? '#fff8eb' : ink;
      ctx.save();
      ctx.scale(eyeScale, eyeScale);
      for (const side of [-1, 1]) {
        const ex = side * 5.3;
        if (isDarkSkin) {
          ctx.fillStyle = '#fffdf7';
          ctx.beginPath();
          ctx.arc(ex, 0.4, 3.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = ink;
          ctx.beginPath();
          ctx.arc(ex, 0.4, 1.75, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(ex - 0.65, -0.45, 0.8, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = ink;
          ctx.beginPath();
          ctx.arc(ex, 0.4, 2.9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(ex - 0.9, -0.5, 1.05, 0, Math.PI * 2);
          ctx.fill();
        }

        if (determined) {
          ctx.strokeStyle = faceInk;
          ctx.lineWidth = 2.0;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(ex - side * 2.9, -4.4);
          ctx.lineTo(ex + side * 2.2, -3.0);
          ctx.stroke();
        }
      }

      ctx.fillStyle = isDarkSkin ? 'rgba(255, 118, 150, 0.52)' : 'rgba(255, 118, 150, 0.35)';
      ctx.beginPath();
      ctx.ellipse(-8.2, 3.2, 2.2, 1.2, 0, 0, Math.PI * 2);
      ctx.ellipse(8.2, 3.2, 2.2, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = faceInk;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      if (determined) {
        ctx.fillStyle = '#a81948';
        ctx.beginPath();
        ctx.arc(0, 3.4, 3.1, 0.1, Math.PI - 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(0, 4.0, 2.4, 0.2, Math.PI - 0.2);
        ctx.stroke();
      }

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

  function bootGame() {
    if (JellyGame.instance) return;
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;
    const game = new Game(canvas);
    JellyGame.instance = game;
    game.start();
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootGame);
  } else {
    bootGame();
  }
})(window);
