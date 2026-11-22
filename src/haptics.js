(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});

  let _enabled = true;
  let _lastPulseMs = 0;

  function _capHaptics() {
    try {
      return global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.Haptics
        ? global.Capacitor.Plugins.Haptics
        : null;
    } catch (_) {
      return null;
    }
  }

  function _now() {
    return global.performance && typeof global.performance.now === 'function'
      ? global.performance.now()
      : Date.now();
  }

  function _vibrate(pattern) {
    if (!_enabled) return;
    try {
      if (global.navigator && typeof global.navigator.vibrate === 'function') {
        global.navigator.vibrate(pattern);
      }
    } catch (_) {
      // Ignore unsupported browser environments
    }
  }

  function _impact(style, fallbackPattern, minGapMs = 24) {
    if (!_enabled) return;
    const t = _now();
    if (t - _lastPulseMs < minGapMs) return;
    _lastPulseMs = t;

    const cap = _capHaptics();
    if (cap && typeof cap.impact === 'function') {
      try {
        cap.impact({ style });
        return;
      } catch (_) {}
    }
    _vibrate(fallbackPattern);
  }

  function _notify(type, fallbackPattern) {
    if (!_enabled) return;
    const cap = _capHaptics();
    if (cap && typeof cap.notification === 'function') {
      try {
        cap.notification({ type });
        return;
      } catch (_) {}
    }
    _vibrate(fallbackPattern);
  }

  JellyGame.Haptics = Object.freeze({
    setEnabled(val) {
      _enabled = Boolean(val);
    },
    isEnabled() {
      return _enabled;
    },
    tap() {
      _impact('LIGHT', 8, 22);
    },
    stretch() {
      _impact('LIGHT', 6, 45);
    },
    launch() {
      _impact('LIGHT', 11, 25);
    },
    land(intensity = 0.5) {
      if (intensity > 0.65) {
        _impact('MEDIUM', 16, 25);
      } else {
        _impact('LIGHT', 9, 25);
      }
    },
    collect() {
      _impact('LIGHT', 10, 20);
    },
    closeCall() {
      _notify('SUCCESS', [12, 26, 16]);
    },
    shield() {
      _impact('MEDIUM', [14, 24, 18], 30);
    },
    bossHit(isCrit = false) {
      _impact('HEAVY', isCrit ? [22, 28, 30] : 22, 20);
    },
    revive() {
      _notify('SUCCESS', [16, 35, 22, 35, 28]);
    },
    death() {
      _notify('ERROR', [32, 36, 48]);
    }
  });
})(window);
