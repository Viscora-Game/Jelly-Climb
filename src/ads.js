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
    ENABLED: false,
    TEST_MODE: true,
    INTERSTITIAL_EVERY_RUNS: 3,
    INTERSTITIAL_MIN_COOLDOWN_MS: 45000,
    // Official Google AdMob test Unit IDs (replace with live AdMob IDs on Native release)
    UNIT_IDS: Object.freeze({
      revive: 'ca-app-pub-3940256099942544/5224354917',
      doubleDrops: 'ca-app-pub-3940256099942544/5224354917',
      interstitial: 'ca-app-pub-3940256099942544/1033173712'
    })
  });

  let _initialized = false;
  let _busy = false;
  let _completedRunsSinceInterstitial = 0;
  let _lastInterstitialAt = 0;

  function _getAdMobPlugin() {
    try {
      return global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.AdMob
        ? global.Capacitor.Plugins.AdMob
        : null;
    } catch (_) {
      return null;
    }
  }

  async function init() {
    if (!CONFIG.ENABLED || _initialized) return false;
    const admob = _getAdMobPlugin();
    if (!admob || typeof admob.initialize !== 'function') return false;
    try {
      await admob.initialize({
        initializeForTesting: CONFIG.TEST_MODE
      });
      _initialized = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  function isEnabled() {
    return Boolean(CONFIG.ENABLED);
  }

  function canShowRewarded(placement) {
    if (!CONFIG.ENABLED || _busy) return false;
    if (!placement || placement === 'interstitial' || !CONFIG.UNIT_IDS[placement]) return false;
    return Boolean(_getAdMobPlugin() || CONFIG.TEST_MODE);
  }

  function canShowInterstitial() {
    if (!CONFIG.ENABLED || _busy) return false;
    if (!CONFIG.UNIT_IDS.interstitial) return false;
    return Boolean(_getAdMobPlugin() || CONFIG.TEST_MODE);
  }

  async function showRewarded(placement) {
    if (!canShowRewarded(placement)) {
      return { rewarded: false, reason: 'disabled' };
    }
    _busy = true;
    try {
      const admob = _getAdMobPlugin();
      const adId = CONFIG.UNIT_IDS[placement];

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
    if (!CONFIG.ENABLED) {
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
      const adId = CONFIG.UNIT_IDS.interstitial;

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
