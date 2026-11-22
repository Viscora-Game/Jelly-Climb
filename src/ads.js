(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});

  /**
   * Dormant Rewarded-Ad Adapter ready for Native Capacitor AdMob (@capacitor-community/admob).
   *
   * IMPORTANT: ENABLED is intentionally `false` until Native store build activation.
   * While ENABLED === false:
   *  - Zero ad scripts are initialized
   *  - Zero ad UI buttons appear in the game
   *  - All placements cleanly report unavailable
   */
  const CONFIG = Object.freeze({
    ENABLED: false,
    TEST_MODE: true,
    // Official Google AdMob test Rewarded Unit IDs (replace with live AdMob IDs on Native release)
    UNIT_IDS: Object.freeze({
      revive: 'ca-app-pub-3940256099942544/5224354917',
      doubleDrops: 'ca-app-pub-3940256099942544/5224354917'
    })
  });

  let _initialized = false;
  let _busy = false;

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
    if (!placement || !CONFIG.UNIT_IDS[placement]) return false;
    // In Native Capacitor build, verify AdMob plugin is present (or allow test simulation in TEST_MODE)
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
        return { rewarded: Boolean(reward), reward };
      }

      // Local Native-preview mock when ENABLED + TEST_MODE without native plugin
      if (CONFIG.TEST_MODE) {
        await new Promise((resolve) => global.setTimeout(resolve, 450));
        return { rewarded: true, simulated: true };
      }

      return { rewarded: false, reason: 'no_plugin' };
    } catch (err) {
      return { rewarded: false, reason: (err && err.message) || 'ad_error' };
    } finally {
      _busy = false;
    }
  }

  JellyGame.Ads = Object.freeze({
    CONFIG,
    init,
    isEnabled,
    canShowRewarded,
    showRewarded
  });
})(window);
