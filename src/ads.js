(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});

  /**
   * Dormant AdMob Adapter ready for Native Capacitor AdMob (@capacitor-community/admob).
   * Supports:
   *  - Optional Rewarded Ads: 'revive' & 'doubleDrops' (Death screen buttons)
   *  - Paced Interstitial Ad: every 3 completed runs (skipped if player already watched a Rewarded Ad
   *    on that run, with a 45s minimum anti-spam cooldown)
   *
   * IMPORTANT: ENABLED is intentionally `false` until Native store build activation.
   * While ENABLED === false:
   *  - Zero ad scripts are initialized
   *  - Zero ad UI buttons appear in the game
   *  - Zero interstitial pauses happen between runs
   */
  const CONFIG = Object.freeze({
    // Per-platform native ad activation:
    // - iOS: LIVE with real AdMob App ID + Rewarded/Interstitial units
    // - Android: stays dormant until Google Play closed testing finishes
    // - Web browser: ALWAYS disabled
    PLATFORM_ENABLED: Object.freeze({
      ios: true,
      android: false
    }),
    TEST_MODE: false,
    INTERSTITIAL_EVERY_RUNS: 3,
    INTERSTITIAL_MIN_COOLDOWN_MS: 45000,
    UNIT_IDS: Object.freeze({
      android: Object.freeze({
        revive: 'ca-app-pub-3940256099942544/5224354917',
        doubleDrops: 'ca-app-pub-3940256099942544/5224354917',
        interstitial: 'ca-app-pub-3940256099942544/1033173712'
      }),
      ios: Object.freeze({
        revive: 'ca-app-pub-5810332619798187/1845592682',
        doubleDrops: 'ca-app-pub-5810332619798187/1845592682',
        interstitial: 'ca-app-pub-5810332619798187/6839025371'
      })
    })
  });

  let _initialized = false;
  let _busy = false;
  let _completedRunsSinceInterstitial = 0;
  let _lastInterstitialAt = 0;

  function _isNativePlatform() {
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

  function _getPlatform() {
    try {
      if (global.Capacitor && typeof global.Capacitor.getPlatform === 'function') {
        const p = global.Capacitor.getPlatform();
        if (p === 'ios' || p === 'android') return p;
      }
    } catch (_) {}
    try {
      if (global.navigator && /iPhone|iPad|iPod/i.test(global.navigator.userAgent || '')) {
        return 'ios';
      }
    } catch (_) {}
    return 'android';
  }

  function _getUnitId(placement) {
    const bucket = CONFIG.UNIT_IDS[_getPlatform()] || CONFIG.UNIT_IDS.android;
    return bucket && bucket[placement] ? bucket[placement] : '';
  }

  function _getAdMobPlugin() {
    try {
      return global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.AdMob
        ? global.Capacitor.Plugins.AdMob
        : null;
    } catch (_) {
      return null;
    }
  }

  function isEnabled() {
    if (!_isNativePlatform()) return false;
    const plat = _getPlatform();
    return Boolean(CONFIG.PLATFORM_ENABLED[plat]);
  }

  async function init() {
    if (!isEnabled() || _initialized) return false;
    const admob = _getAdMobPlugin();
    if (!admob || typeof admob.initialize !== 'function') return false;
    try {
      // Request Apple ATT permission cleanly on iOS before initializing AdMob
      if (_getPlatform() === 'ios' && typeof admob.requestTrackingAuthorization === 'function') {
        try {
          await admob.requestTrackingAuthorization();
        } catch (_) {}
      }
      await admob.initialize({
        initializeForTesting: CONFIG.TEST_MODE
      });
      _initialized = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  function canShowRewarded(placement) {
    if (!isEnabled() || _busy) return false;
    if (!placement || placement === 'interstitial' || !_getUnitId(placement)) return false;
    return Boolean(_getAdMobPlugin() || CONFIG.TEST_MODE);
  }

  function canShowInterstitial() {
    if (!isEnabled() || _busy) return false;
    if (!_getUnitId('interstitial')) return false;
    return Boolean(_getAdMobPlugin() || CONFIG.TEST_MODE);
  }

  async function showRewarded(placement) {
    if (!canShowRewarded(placement)) {
      return { rewarded: false, reason: 'disabled' };
    }
    _busy = true;
    try {
      const admob = _getAdMobPlugin();
      const adId = _getUnitId(placement);

      if (admob && typeof admob.prepareRewardVideoAd === 'function' && typeof admob.showRewardVideoAd === 'function') {
        if (!_initialized) await init();
        await admob.prepareRewardVideoAd({
          adId,
          isTesting: CONFIG.TEST_MODE
        });
        const reward = await admob.showRewardVideoAd();
        const rewarded = Boolean(reward);
        if (rewarded) {
          _completedRunsSinceInterstitial = 0;
          _lastInterstitialAt = Date.now();
        }
        return { rewarded, reward };
      }

      // Local Native-preview mock when ENABLED + TEST_MODE without native plugin
      if (CONFIG.TEST_MODE) {
        await new Promise((resolve) => global.setTimeout(resolve, 450));
        _completedRunsSinceInterstitial = 0;
        _lastInterstitialAt = Date.now();
        return { rewarded: true, simulated: true };
      }

      return { rewarded: false, reason: 'no_plugin' };
    } catch (err) {
      return { rewarded: false, reason: (err && err.message) || 'ad_error' };
    } finally {
      _busy = false;
    }
  }

  async function maybeShowInterstitialAfterRun(options) {
    const opts = options || {};
    if (!isEnabled()) {
      return { shown: false, reason: 'disabled' };
    }
    if (opts.skipBecauseRewarded) {
      _completedRunsSinceInterstitial = 0;
      return { shown: false, reason: 'rewarded_grace' };
    }

    _completedRunsSinceInterstitial += 1;
    if (_completedRunsSinceInterstitial < CONFIG.INTERSTITIAL_EVERY_RUNS) {
      return { shown: false, reason: 'run_threshold', runs: _completedRunsSinceInterstitial };
    }

    const now = Date.now();
    if (_lastInterstitialAt > 0 && now - _lastInterstitialAt < CONFIG.INTERSTITIAL_MIN_COOLDOWN_MS) {
      return { shown: false, reason: 'cooldown' };
    }

    if (!canShowInterstitial()) {
      return { shown: false, reason: 'unavailable' };
    }

    _busy = true;
    try {
      const admob = _getAdMobPlugin();
      const adId = _getUnitId('interstitial');

      if (admob && typeof admob.prepareInterstitial === 'function' && typeof admob.showInterstitial === 'function') {
        if (!_initialized) await init();
        await admob.prepareInterstitial({
          adId,
          isTesting: CONFIG.TEST_MODE
        });
        await admob.showInterstitial();
        _completedRunsSinceInterstitial = 0;
        _lastInterstitialAt = Date.now();
        return { shown: true };
      }

      if (CONFIG.TEST_MODE) {
        await new Promise((resolve) => global.setTimeout(resolve, 400));
        _completedRunsSinceInterstitial = 0;
        _lastInterstitialAt = Date.now();
        return { shown: true, simulated: true };
      }

      return { shown: false, reason: 'no_plugin' };
    } catch (err) {
      return { shown: false, reason: (err && err.message) || 'ad_error' };
    } finally {
      _busy = false;
    }
  }

  // Initialize AdMob + Apple ATT cleanly after the first screen settles (Apple Guideline 5.1.2)
  function _scheduleNativeInit() {
    if (!isEnabled()) return;
    global.setTimeout(function () {
      init().catch(function () {});
    }, 1500);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _scheduleNativeInit);
  } else {
    _scheduleNativeInit();
  }

  JellyGame.Ads = Object.freeze({
    CONFIG,
    init,
    isEnabled,
    canShowRewarded,
    canShowInterstitial,
    showRewarded,
    maybeShowInterstitialAfterRun
  });
})(window);
