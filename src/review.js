(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});

  const STORAGE_KEYS = Object.freeze({
    RUNS: 'jelly_climb_native_runs',
    LAST_PROMPT_AT: 'jelly_climb_review_last_at',
    PROMPT_COUNT: 'jelly_climb_review_count'
  });

  const MIN_COOLDOWN_MS = 21 * 24 * 60 * 60 * 1000; // 21 days between review sheets
  const MAX_LIFETIME_PROMPTS = 2;

  let _pendingReview = false;
  let _promptedThisSession = false;

  function _isNative() {
    try {
      return Boolean(
        global.Capacitor &&
          typeof global.Capacitor.isNativePlatform === 'function' &&
          global.Capacitor.isNativePlatform()
      );
    } catch (_) {
      return false;
    }
  }

  function _getPlugin(name) {
    try {
      return global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins[name]
        ? global.Capacitor.Plugins[name]
        : null;
    } catch (_) {
      return null;
    }
  }

  function _readInt(key) {
    try {
      const v = parseInt(global.localStorage.getItem(key) || '0', 10);
      return Number.isFinite(v) ? v : 0;
    } catch (_) {
      return 0;
    }
  }

  function _writeInt(key, val) {
    try {
      global.localStorage.setItem(key, String(Math.floor(val)));
    } catch (_) {}
  }

  function _canPromptNow() {
    if (!_isNative() || _promptedThisSession) return false;
    const count = _readInt(STORAGE_KEYS.PROMPT_COUNT);
    if (count >= MAX_LIFETIME_PROMPTS) return false;
    const lastAt = _readInt(STORAGE_KEYS.LAST_PROMPT_AT);
    if (lastAt > 0 && Date.now() - lastAt < MIN_COOLDOWN_MS) return false;
    return true;
  }

  /**
   * Initializes fullscreen native shell polish on iOS/Android (hidden status bar + splash hide).
   */
  function initNativeShell() {
    if (!_isNative()) return;
    try {
      const statusBar = _getPlugin('StatusBar');
      if (statusBar && typeof statusBar.hide === 'function') {
        statusBar.hide().catch(function () {});
      }
      const splash = _getPlugin('SplashScreen');
      if (splash && typeof splash.hide === 'function') {
        global.setTimeout(function () {
          splash.hide().catch(function () {});
        }, 350);
      }
    } catch (_) {}
  }

  /**
   * Called when a player defeats a Boss — queues a review prompt for the end of the run
   * so we never interrupt mid-climb slingshot action!
   */
  function onBossDefeated() {
    if (_canPromptNow()) {
      _pendingReview = true;
    }
  }

  /**
   * Called after a completed run ends cleanly (on death summary / return to menu).
   * Prompts Apple SKStoreReviewController (iOS) or Google Play In-App Review (Android)
   * strictly at high-satisfaction moments.
   */
  async function maybePromptAfterRun(opts) {
    const info = opts || {};
    if (!_isNative() || info.isTutorial || info.isQaWarpRun) return false;

    const runs = _readInt(STORAGE_KEYS.RUNS) + 1;
    _writeInt(STORAGE_KEYS.RUNS, runs);

    const hitRecordMoment = Boolean(info.isNewRecord && runs >= 3 && (info.meters || 0) >= 120);
    const shouldAsk = _pendingReview || hitRecordMoment || Boolean(info.bossesDefeatedThisRun > 0);
    if (!shouldAsk || !_canPromptNow()) return false;

    const plugin = _getPlugin('InAppReview');
    if (!plugin || typeof plugin.requestReview !== 'function') return false;

    _pendingReview = false;
    _promptedThisSession = true;
    _writeInt(STORAGE_KEYS.LAST_PROMPT_AT, Date.now());
    _writeInt(STORAGE_KEYS.PROMPT_COUNT, _readInt(STORAGE_KEYS.PROMPT_COUNT) + 1);

    try {
      await plugin.requestReview();
      return true;
    } catch (_) {
      return false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNativeShell);
  } else {
    initNativeShell();
  }

  JellyGame.Review = Object.freeze({
    initNativeShell,
    onBossDefeated,
    maybePromptAfterRun
  });
})(window);
