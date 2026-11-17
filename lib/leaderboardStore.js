'use strict';

let MongoClient = null;
try {
  ({ MongoClient } = require('mongodb'));
} catch (_) {
  // Handled gracefully when mongodb package is unavailable
}

const ALLOWED_MODES = new Set(['classic', 'rising']);
const ALLOWED_COLORS = new Set(['mint', 'coral', 'azure', 'amber', 'violet']);
const ALLOWED_ACCESSORIES = new Set(['none', 'leaf', 'glasses', 'headband', 'beanie', 'crown']);
const COLLECTION_NAME = 'leaderboard_scores';

let sharedClient = null;
let sharedCollection = null;
let initPromise = null;
let lastMongoError = null;

function sanitizePlayerId(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim();
  if (!/^[a-zA-Z0-9_-]{6,64}$/.test(cleaned)) return null;
  return cleaned;
}

function sanitizeNickname(raw) {
  if (typeof raw !== 'string') return 'JELLY';
  const stripped = raw
    .replace(/[<>&"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12);
  return stripped.length >= 2 ? stripped : 'JELLY';
}

function sanitizeMode(raw) {
  return ALLOWED_MODES.has(raw) ? raw : null;
}

function sanitizeColor(raw) {
  return ALLOWED_COLORS.has(raw) ? raw : 'mint';
}

function sanitizeAccessory(raw) {
  return ALLOWED_ACCESSORIES.has(raw) ? raw : 'none';
}

function sanitizeMeters(raw) {
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(100000, Math.floor(num)));
}

function sanitizeTempo(raw) {
  const num = Number(raw);
  if (!Number.isFinite(num)) return 1;
  return Math.max(1, Math.min(5, Math.floor(num)));
}

function formatPublicEntry(doc, rank) {
  return {
    rank,
    playerId: doc.playerId,
    nickname: doc.nickname,
    mode: doc.mode,
    meters: doc.meters,
    maxTempo: doc.maxTempo || 1,
    color: doc.color || 'mint',
    accessory: doc.accessory || 'none',
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt
  };
}

function sortEntries(a, b) {
  if (b.meters !== a.meters) return b.meters - a.meters;
  const ta = new Date(a.updatedAt).getTime();
  const tb = new Date(b.updatedAt).getTime();
  return ta - tb;
}

/**
 * Initializes and caches a single MongoClient across invocations/requests.
 * Pool sizes adapt cleanly to serverless vs long-running server environments.
 */
async function ensureMongoCollection({ serverless = false } = {}) {
  const uri = (process.env.MONGODB_URI || '').trim();
  const dbName = (process.env.MONGODB_DB_NAME || 'jelly_climb').trim();

  if (!uri || !MongoClient) {
    return null;
  }

  if (sharedCollection) {
    return sharedCollection;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      // Serverless Functions share one small pool per warm instance (no pinned min idle sockets),
      // while traditional Node HTTP servers maintain 2 warm sockets and higher burst pool ceiling.
      const poolOpts = serverless
        ? {
            maxPoolSize: 5,
            minPoolSize: 0,
            maxIdleTimeMS: 20000,
            connectTimeoutMS: 8000,
            socketTimeoutMS: 20000,
            serverSelectionTimeoutMS: 5000
          }
        : {
            maxPoolSize: 20,
            minPoolSize: 2,
            maxIdleTimeMS: 120000,
            connectTimeoutMS: 8000,
            socketTimeoutMS: 20000,
            serverSelectionTimeoutMS: 5000
          };

      sharedClient = new MongoClient(uri, poolOpts);
      await sharedClient.connect();
      const db = sharedClient.db(dbName);

      const existingCols = await db.listCollections({ name: COLLECTION_NAME }).toArray();
      const validator = {
        $jsonSchema: {
          bsonType: 'object',
          required: ['playerId', 'nickname', 'mode', 'meters', 'maxTempo', 'color', 'accessory', 'updatedAt'],
          properties: {
            playerId: { bsonType: 'string', minLength: 6, maxLength: 64 },
            nickname: { bsonType: 'string', minLength: 2, maxLength: 14 },
            mode: { enum: ['classic', 'rising'] },
            meters: { bsonType: ['int', 'long', 'double'], minimum: 0, maximum: 100000 },
            maxTempo: { bsonType: ['int', 'long', 'double'], minimum: 1, maximum: 5 },
            color: { enum: ['mint', 'coral', 'azure', 'amber', 'violet'] },
            accessory: { enum: ['none', 'leaf', 'glasses', 'headband', 'beanie', 'crown'] },
            updatedAt: { bsonType: 'date' }
          }
        }
      };

      if (existingCols.length === 0) {
        await db.createCollection(COLLECTION_NAME, {
          validator,
          validationLevel: 'moderate',
          validationAction: 'error'
        });
      }

      const col = db.collection(COLLECTION_NAME);
      await col.createIndex({ playerId: 1, mode: 1 }, { unique: true, name: 'uniq_player_mode' });
      await col.createIndex({ mode: 1, meters: -1, updatedAt: 1 }, { name: 'idx_mode_leaderboard' });

      sharedCollection = col;
      lastMongoError = null;
      return sharedCollection;
    } catch (err) {
      lastMongoError = err.message;
      sharedCollection = null;
      if (sharedClient) {
        try {
          await sharedClient.close();
        } catch (_) {}
        sharedClient = null;
      }
      return null;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

async function closeMongoClient() {
  if (sharedClient) {
    try {
      await sharedClient.close();
    } catch (_) {}
    sharedClient = null;
    sharedCollection = null;
  }
}

function getFallbackCounts(entries) {
  let classic = 0;
  let rising = 0;
  for (const e of entries) {
    if (e.mode === 'classic') classic++;
    else if (e.mode === 'rising') rising++;
  }
  return { classic, rising };
}

function createLeaderboardStore({
  serverless = false,
  getEntries = () => [],
  setEntries = () => {},
  storageLabel = serverless ? 'ephemeral' : 'local'
} = {}) {
  async function getCol() {
    return ensureMongoCollection({ serverless });
  }

  async function getHealthStats() {
    const col = await getCol();
    if (col) {
      try {
        const [classicCount, risingCount] = await Promise.all([
          col.countDocuments({ mode: 'classic' }),
          col.countDocuments({ mode: 'rising' })
        ]);
        return {
          ok: true,
          storage: 'mongodb',
          dbConnected: true,
          counts: { classic: classicCount, rising: risingCount }
        };
      } catch (err) {
        lastMongoError = err.message;
      }
    }

    return {
      ok: true,
      storage: storageLabel,
      dbConnected: false,
      error: lastMongoError,
      counts: getFallbackCounts(getEntries())
    };
  }

  async function queryLeaderboard(mode, playerId, limit = 50) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
    const col = await getCol();

    if (col) {
      const [topDocs, totalPlayers, playerDoc] = await Promise.all([
        col
          .find({ mode }, { projection: { _id: 0 } })
          .sort({ meters: -1, updatedAt: 1 })
          .limit(safeLimit)
          .toArray(),
        col.countDocuments({ mode }),
        playerId ? col.findOne({ playerId, mode }, { projection: { _id: 0 } }) : null
      ]);

      let playerRank = null;
      if (playerDoc) {
        const ahead = await col.countDocuments({
          mode,
          $or: [
            { meters: { $gt: playerDoc.meters } },
            { meters: playerDoc.meters, updatedAt: { $lt: playerDoc.updatedAt } }
          ]
        });
        playerRank = ahead + 1;
      }

      return {
        ok: true,
        storage: 'mongodb',
        mode,
        totalPlayers,
        entries: topDocs.map((d, idx) => formatPublicEntry(d, idx + 1)),
        playerEntry: playerDoc ? formatPublicEntry(playerDoc, playerRank) : null,
        playerRank
      };
    }

    const entries = getEntries();
    const filtered = entries.filter((e) => e.mode === mode).sort(sortEntries);
    const sliced = filtered.slice(0, safeLimit).map((d, idx) => formatPublicEntry(d, idx + 1));

    let playerEntry = null;
    let playerRank = null;
    if (playerId) {
      const idx = filtered.findIndex((e) => e.playerId === playerId);
      if (idx !== -1) {
        playerRank = idx + 1;
        playerEntry = formatPublicEntry(filtered[idx], playerRank);
      }
    }

    return {
      ok: true,
      storage: storageLabel,
      mode,
      totalPlayers: filtered.length,
      entries: sliced,
      playerEntry,
      playerRank
    };
  }

  async function submitScore(payload) {
    const playerId = sanitizePlayerId(payload.playerId);
    const mode = sanitizeMode(payload.mode);
    const meters = sanitizeMeters(payload.meters);

    if (!playerId || !mode || meters === null) {
      return { status: 400, body: { ok: false, error: 'Invalid playerId, mode, or meters' } };
    }

    const nickname = sanitizeNickname(payload.nickname);
    const maxTempo = sanitizeTempo(payload.maxTempo);
    const color = sanitizeColor(payload.color);
    const accessory = sanitizeAccessory(payload.accessory);
    const now = new Date();
    const col = await getCol();

    if (col) {
      const existing = await col.findOne({ playerId, mode });
      let isNewBest = false;

      if (!existing) {
        isNewBest = true;
        await col.insertOne({
          playerId,
          nickname,
          mode,
          meters,
          maxTempo,
          color,
          accessory,
          createdAt: now,
          updatedAt: now
        });
      } else if (meters > existing.meters) {
        isNewBest = true;
        await col.updateOne(
          { playerId, mode },
          {
            $set: {
              nickname,
              meters,
              maxTempo: Math.max(existing.maxTempo || 1, maxTempo),
              color,
              accessory,
              updatedAt: now
            }
          }
        );
      } else {
        await col.updateOne(
          { playerId, mode },
          {
            $set: {
              nickname,
              color,
              accessory,
              maxTempo: Math.max(existing.maxTempo || 1, maxTempo)
            }
          }
        );
      }

      await col.updateMany({ playerId }, { $set: { nickname, color, accessory } });

      const updatedDoc = await col.findOne({ playerId, mode }, { projection: { _id: 0 } });
      const ahead = await col.countDocuments({
        mode,
        $or: [
          { meters: { $gt: updatedDoc.meters } },
          { meters: updatedDoc.meters, updatedAt: { $lt: updatedDoc.updatedAt } }
        ]
      });
      const rank = ahead + 1;

      return {
        status: 200,
        body: {
          ok: true,
          storage: 'mongodb',
          isNewBest,
          rank,
          entry: formatPublicEntry(updatedDoc, rank)
        }
      };
    }

    const entries = [...getEntries()];
    const existing = entries.find((e) => e.playerId === playerId && e.mode === mode);
    let isNewBest = false;
    if (!existing) {
      isNewBest = true;
      entries.push({
        playerId,
        nickname,
        mode,
        meters,
        maxTempo,
        color,
        accessory,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      });
    } else if (meters > existing.meters) {
      isNewBest = true;
      existing.meters = meters;
      existing.maxTempo = Math.max(existing.maxTempo || 1, maxTempo);
      existing.nickname = nickname;
      existing.color = color;
      existing.accessory = accessory;
      existing.updatedAt = now.toISOString();
    }

    for (const e of entries) {
      if (e.playerId === playerId) {
        e.nickname = nickname;
        e.color = color;
        e.accessory = accessory;
      }
    }
    setEntries(entries);

    const sorted = entries.filter((e) => e.mode === mode).sort(sortEntries);
    const idx = sorted.findIndex((e) => e.playerId === playerId);
    const rank = idx + 1;

    return {
      status: 200,
      body: {
        ok: true,
        storage: storageLabel,
        isNewBest,
        rank,
        entry: formatPublicEntry(sorted[idx], rank)
      }
    };
  }

  async function updateProfile(payload) {
    const playerId = sanitizePlayerId(payload.playerId);
    if (!playerId) {
      return { status: 400, body: { ok: false, error: 'Invalid playerId' } };
    }

    const nickname = sanitizeNickname(payload.nickname);
    const color = sanitizeColor(payload.color);
    const accessory = sanitizeAccessory(payload.accessory);
    const col = await getCol();

    if (col) {
      const res = await col.updateMany(
        { playerId },
        { $set: { nickname, color, accessory } }
      );
      return {
        status: 200,
        body: { ok: true, storage: 'mongodb', modifiedCount: res.modifiedCount }
      };
    }

    const entries = [...getEntries()];
    let modified = 0;
    for (const e of entries) {
      if (e.playerId === playerId) {
        e.nickname = nickname;
        e.color = color;
        e.accessory = accessory;
        modified++;
      }
    }
    if (modified > 0) setEntries(entries);

    return {
      status: 200,
      body: { ok: true, storage: storageLabel, modifiedCount: modified }
    };
  }

  async function deletePlayerRecords(playerIdRaw) {
    const playerId = sanitizePlayerId(playerIdRaw);
    if (!playerId) {
      return { status: 400, body: { ok: false, error: 'Invalid playerId' } };
    }

    const col = await getCol();
    if (col) {
      const res = await col.deleteMany({ playerId });
      return {
        status: 200,
        body: { ok: true, storage: 'mongodb', deletedCount: res.deletedCount }
      };
    }

    const entries = getEntries();
    const filtered = entries.filter((e) => e.playerId !== playerId);
    const deleted = entries.length - filtered.length;
    if (deleted > 0) setEntries(filtered);

    return {
      status: 200,
      body: { ok: true, storage: storageLabel, deletedCount: deleted }
    };
  }

  return {
    getHealthStats,
    queryLeaderboard,
    submitScore,
    updateProfile,
    deletePlayerRecords
  };
}

module.exports = {
  createLeaderboardStore,
  ensureMongoCollection,
  closeMongoClient,
  sanitizePlayerId,
  sanitizeNickname,
  sanitizeMode,
  sanitizeMeters
};
