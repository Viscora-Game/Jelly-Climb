(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});

  const LB_KEYS = Object.freeze({
    PLAYER_ID: 'jelly_climb_player_id',
    NICKNAME: 'jelly_climb_nickname',
    CACHE: 'jelly_climb_lb_cache'
  });

  function generatePlayerId() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return 'jc_' + global.crypto.randomUUID().replace(/-/g, '').slice(0, 20);
      }
    } catch (_) {}
    const rand = Math.random().toString(36).slice(2, 12);
    const ts = Date.now().toString(36);
    return ('jc_' + ts + rand).slice(0, 24);
  }

  function sanitizeNick(raw) {
    if (typeof raw !== 'string') return '';
    return raw
      .replace(/[<>&"'`]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12);
  }

  /**
   * Dual-mode Leaderboard client connecting to Node/MongoDB API with seamless offline cache fallback.
   */
  class LeaderboardClient {
    constructor() {
      this.playerId = this._loadOrCreatePlayerId();
      this.nickname = this._loadOrCreateNickname();
      this.storageSource = 'offline'; // 'mongodb' | 'local' | 'offline'
      this.loading = false;
      this.data = {
        classic: { entries: [], playerEntry: null, playerRank: null, totalPlayers: 0 },
        rising: { entries: [], playerEntry: null, playerRank: null, totalPlayers: 0 }
      };
      this._loadCache();
    }

    _apiBase() {
      // Allow optional external API base override (e.g. for mobile APK / TWA builds)
      if (typeof global.JELLY_API_BASE === 'string' && global.JELLY_API_BASE) {
        return global.JELLY_API_BASE.replace(/\/$/, '');
      }
      if (global.location && /^https?:$/.test(global.location.protocol)) {
        return '';
      }
      return null;
    }

    _loadOrCreatePlayerId() {
      try {
        const existing = global.localStorage.getItem(LB_KEYS.PLAYER_ID);
        if (existing && /^[a-zA-Z0-9_-]{6,64}$/.test(existing)) {
          return existing;
        }
        const created = generatePlayerId();
        global.localStorage.setItem(LB_KEYS.PLAYER_ID, created);
        return created;
      } catch (_) {
        return generatePlayerId();
      }
    }

    _loadOrCreateNickname() {
      try {
        const saved = global.localStorage.getItem(LB_KEYS.NICKNAME);
        const clean = sanitizeNick(saved);
        if (clean.length >= 2) return clean;
      } catch (_) {}
      const suffix = this.playerId.slice(-4).toUpperCase();
      const def = `JELLY-${suffix}`;
      try {
        global.localStorage.setItem(LB_KEYS.NICKNAME, def);
      } catch (_) {}
      return def;
    }

    _loadCache() {
      try {
        const raw = global.localStorage.getItem(LB_KEYS.CACHE);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.classic && parsed.rising) {
          this.data.classic = parsed.classic;
          this.data.rising = parsed.rising;
        }
      } catch (_) {}
    }

    _saveCache() {
      try {
        global.localStorage.setItem(LB_KEYS.CACHE, JSON.stringify(this.data));
      } catch (_) {}
    }

    _updateLocalModeEntry(mode, meters, maxTempo, color, accessory) {
      if (mode !== 'classic' && mode !== 'rising') return;
      const bucket = this.data[mode];
      const entries = Array.isArray(bucket.entries) ? [...bucket.entries] : [];
      const nowIso = new Date().toISOString();

      let idx = entries.findIndex((e) => e.playerId === this.playerId);
      if (idx === -1) {
        if (meters <= 0) return;
        entries.push({
          rank: 1,
          playerId: this.playerId,
          nickname: this.nickname,
          mode,
          meters,
          maxTempo: maxTempo || 1,
          color: color || 'mint',
          accessory: accessory || 'none',
          updatedAt: nowIso
        });
      } else {
        const prev = entries[idx];
        const improved = meters > prev.meters;
        entries[idx] = {
          ...prev,
          nickname: this.nickname,
          color: color || prev.color || 'mint',
          accessory: accessory || prev.accessory || 'none',
          meters: improved ? meters : prev.meters,
          maxTempo: Math.max(prev.maxTempo || 1, maxTempo || 1),
          updatedAt: improved ? nowIso : prev.updatedAt
        };
      }

      entries.sort((a, b) => {
        if (b.meters !== a.meters) return b.meters - a.meters;
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      });

      const ranked = entries.map((e, i) => ({ ...e, rank: i + 1 }));
      const myRankIdx = ranked.findIndex((e) => e.playerId === this.playerId);

      this.data[mode] = {
        entries: ranked.slice(0, 50),
        playerRank: myRankIdx !== -1 ? myRankIdx + 1 : null,
        playerEntry: myRankIdx !== -1 ? ranked[myRankIdx] : null,
        totalPlayers: ranked.length
      };
      this._saveCache();
    }

    async _fetchJson(url, options = {}) {
      if (typeof global.fetch !== 'function') {
        throw new Error('fetch unavailable');
      }
      const controller =
        typeof global.AbortController === 'function' ? new global.AbortController() : null;
      const timer = controller ? global.setTimeout(() => controller.abort(), 3500) : null;
      try {
        const res = await global.fetch(url, {
          ...options,
          signal: controller ? controller.signal : undefined
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return await res.json();
      } finally {
        if (timer) global.clearTimeout(timer);
      }
    }

    async fetchLeaderboard(mode) {
      const targetMode = mode === 'rising' ? 'rising' : 'classic';
      const base = this._apiBase();
      if (base === null) {
        this.storageSource = 'offline';
        return this.data[targetMode];
      }

      this.loading = true;
      try {
        const qs = `mode=${encodeURIComponent(targetMode)}&playerId=${encodeURIComponent(
          this.playerId
        )}&limit=50`;
        const json = await this._fetchJson(`${base}/api/leaderboard?${qs}`);
        if (json && json.ok) {
          this.storageSource = json.storage === 'ephemeral' ? 'local' : (json.storage || 'local');
          const serverEntries = Array.isArray(json.entries) ? json.entries : [];
          const cached = this.data[targetMode];
          if (
            json.storage === 'ephemeral' &&
            serverEntries.length === 0 &&
            cached &&
            Array.isArray(cached.entries) &&
            cached.entries.length > 0
          ) {
            return cached;
          }
          this.data[targetMode] = {
            entries: serverEntries,
            playerEntry: json.playerEntry || null,
            playerRank: json.playerRank || null,
            totalPlayers: json.totalPlayers || 0
          };
          this._saveCache();
        }
      } catch (_) {
        this.storageSource = 'offline';
      } finally {
        this.loading = false;
      }
      return this.data[targetMode];
    }

    async submitScore({ mode, meters, maxTempo, color, accessory }) {
      if ((mode !== 'classic' && mode !== 'rising') || meters <= 0) return null;

      this._updateLocalModeEntry(mode, meters, maxTempo, color, accessory);

      const base = this._apiBase();
      if (base === null) {
        this.storageSource = 'offline';
        return null;
      }

      try {
        const json = await this._fetchJson(`${base}/api/leaderboard`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId: this.playerId,
            nickname: this.nickname,
            mode,
            meters,
            maxTempo,
            color,
            accessory
          })
        });
        if (json && json.ok) {
          this.storageSource = json.storage === 'ephemeral' ? 'local' : (json.storage || 'local');
          return json;
        }
      } catch (_) {
        this.storageSource = 'offline';
      }
      return null;
    }

    async setNickname(newName, { color, accessory } = {}) {
      const clean = sanitizeNick(newName);
      if (clean.length < 2) return this.nickname;

      this.nickname = clean;
      try {
        global.localStorage.setItem(LB_KEYS.NICKNAME, clean);
      } catch (_) {}

      for (const m of ['classic', 'rising']) {
        const bucket = this.data[m];
        if (bucket && Array.isArray(bucket.entries)) {
          for (const e of bucket.entries) {
            if (e.playerId === this.playerId) {
              e.nickname = clean;
              if (color) e.color = color;
              if (accessory) e.accessory = accessory;
            }
          }
          if (bucket.playerEntry && bucket.playerEntry.playerId === this.playerId) {
            bucket.playerEntry.nickname = clean;
            if (color) bucket.playerEntry.color = color;
            if (accessory) bucket.playerEntry.accessory = accessory;
          }
        }
      }
      this._saveCache();

      await this.syncProfile({ nickname: clean, color, accessory });
      return this.nickname;
    }

    async syncProfile({ nickname, color, accessory }) {
      const base = this._apiBase();
      if (base === null) return;
      try {
        const json = await this._fetchJson(`${base}/api/leaderboard/profile`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId: this.playerId,
            nickname: nickname || this.nickname,
            color: color || 'mint',
            accessory: accessory || 'none'
          })
        });
        if (json && json.ok) {
          this.storageSource = json.storage || this.storageSource;
        }
      } catch (_) {}
    }

    async resetAllData() {
      const oldId = this.playerId;
      const base = this._apiBase();
      if (base !== null && oldId) {
        try {
          await this._fetchJson(
            `${base}/api/leaderboard/player/${encodeURIComponent(oldId)}`,
            { method: 'DELETE' }
          );
        } catch (_) {}
      }

      const freshId = generatePlayerId();
      this.playerId = freshId;
      this.nickname = `JELLY-${freshId.slice(-4).toUpperCase()}`;
      this.data = {
        classic: { entries: [], playerEntry: null, playerRank: null, totalPlayers: 0 },
        rising: { entries: [], playerEntry: null, playerRank: null, totalPlayers: 0 }
      };

      try {
        global.localStorage.setItem(LB_KEYS.PLAYER_ID, this.playerId);
        global.localStorage.setItem(LB_KEYS.NICKNAME, this.nickname);
        global.localStorage.removeItem(LB_KEYS.CACHE);
      } catch (_) {}
    }
  }

  JellyGame.LeaderboardClient = LeaderboardClient;
})(window);
