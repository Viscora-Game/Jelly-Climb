(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});

  const STORAGE_KEY = 'jelly_climb_daily_missions_v1';

  const MISSION_POOL = Object.freeze([
    { id: 'gems_25', type: 'collectGems', target: 25, reward: 20, icon: 'gem' },
    { id: 'gems_45', type: 'collectGems', target: 45, reward: 32, icon: 'gem' },
    { id: 'climb_220', type: 'climbMeters', target: 220, reward: 22, icon: 'upgrade' },
    { id: 'climb_450', type: 'climbMeters', target: 450, reward: 35, icon: 'upgrade' },
    { id: 'close_3', type: 'closeCalls', target: 3, reward: 25, icon: 'spark' },
    { id: 'close_6', type: 'closeCalls', target: 6, reward: 38, icon: 'spark' },
    { id: 'tempo_4', type: 'reachTempo', target: 4, reward: 22, icon: 'star' },
    { id: 'tempo_5', type: 'reachTempo', target: 5, reward: 34, icon: 'star' },
    { id: 'boss_1', type: 'defeatBoss', target: 1, reward: 40, icon: 'crown' },
    { id: 'launch_30', type: 'launches', target: 30, reward: 18, icon: 'play' }
  ]);

  function getTodayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function hashDateSeed(dateKey) {
    let h = 2166136261;
    for (let i = 0; i < dateKey.length; i++) {
      h ^= dateKey.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function pickDailyMissions(dateKey) {
    let seed = hashDateSeed(dateKey);
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    // Group by mission type so the 3 daily missions are always distinct & engaging
    const byType = Object.create(null);
    for (let i = 0; i < MISSION_POOL.length; i++) {
      const m = MISSION_POOL[i];
      if (!byType[m.type]) byType[m.type] = [];
      byType[m.type].push(m);
    }

    const types = Object.keys(byType);
    // Deterministic Fisher-Yates shuffle on types
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = types[i];
      types[i] = types[j];
      types[j] = tmp;
    }

    const chosen = [];
    for (let i = 0; i < Math.min(3, types.length); i++) {
      const variants = byType[types[i]];
      const picked = variants[Math.floor(rand() * variants.length)];
      chosen.push({
        id: picked.id,
        type: picked.type,
        target: picked.target,
        reward: picked.reward,
        icon: picked.icon,
        progress: 0,
        claimed: false
      });
    }
    return chosen;
  }

  let _state = null;

  function _save() {
    if (!_state) return;
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
    } catch (_) {}
  }

  function _ensureTodayState() {
    const today = getTodayKey();
    if (_state && _state.date === today) return _state;

    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.date === today && Array.isArray(parsed.missions) && parsed.missions.length === 3) {
          _state = parsed;
          return _state;
        }
      }
    } catch (_) {}

    _state = {
      date: today,
      missions: pickDailyMissions(today)
    };
    _save();
    return _state;
  }

  function getMissions() {
    return _ensureTodayState().missions;
  }

  /**
   * Updates daily mission progress for an event type.
   * For 'reachTempo', value is treated as a max watermark; for others it adds delta.
   * Returns an array of missions that just transitioned to completed (ready to claim).
   */
  function recordProgress(type, value = 1) {
    if (!type || value <= 0) return [];
    const list = getMissions();
    const newlyDone = [];
    let dirty = false;

    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m.type !== type || m.claimed) continue;
      const wasDone = m.progress >= m.target;
      if (wasDone) continue;

      const nextProg =
        type === 'reachTempo'
          ? Math.min(m.target, Math.max(m.progress, value))
          : Math.min(m.target, m.progress + value);

      if (nextProg !== m.progress) {
        m.progress = nextProg;
        dirty = true;
        if (m.progress >= m.target) {
          newlyDone.push(m);
        }
      }
    }

    if (dirty) _save();
    return newlyDone;
  }

  function claimMission(id) {
    const list = getMissions();
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m.id === id && !m.claimed && m.progress >= m.target) {
        m.claimed = true;
        _save();
        return m.reward || 0;
      }
    }
    return 0;
  }

  function getUnclaimedCount() {
    const list = getMissions();
    let count = 0;
    for (let i = 0; i < list.length; i++) {
      if (!list[i].claimed && list[i].progress >= list[i].target) count += 1;
    }
    return count;
  }

  function resetAll() {
    try {
      global.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    _state = null;
    _ensureTodayState();
  }

  JellyGame.Missions = Object.freeze({
    getTodayKey,
    getMissions,
    recordProgress,
    claimMission,
    getUnclaimedCount,
    resetAll
  });
})(window);
