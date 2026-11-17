'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

let MongoClient = null;
try {
  ({ MongoClient } = require('mongodb'));
} catch (_) {
  // Handled gracefully: falls back to persistent local JSON store
}

const ROOT_DIR = __dirname;
const ENV_PATH = path.join(ROOT_DIR, '.env');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const LOCAL_STORE_PATH = path.join(DATA_DIR, 'leaderboard.json');

const ALLOWED_MODES = new Set(['classic', 'rising']);
const ALLOWED_COLORS = new Set(['mint', 'coral', 'azure', 'amber', 'violet']);
const ALLOWED_ACCESSORIES = new Set(['none', 'leaf', 'glasses', 'headband', 'beanie', 'crown']);

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
});

function loadDotEnv() {
  try {
    if (!fs.existsSync(ENV_PATH)) return;
    const raw = fs.readFileSync(ENV_PATH, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch (err) {
    console.warn('[env] Failed to read .env:', err.message);
  }
}

loadDotEnv();

const PORT = Number(process.env.PORT) || 8123;
const MONGODB_URI = (process.env.MONGODB_URI || '').trim();
const MONGODB_DB_NAME = (process.env.MONGODB_DB_NAME || 'jelly_climb').trim();
const COLLECTION_NAME = 'leaderboard_scores';

let mongoClient = null;
let mongoCollection = null;
let mongoStatus = {
  connected: false,
  storage: 'local', // 'mongodb' | 'local'
  lastError: null
};

// Local JSON fallback store (classic & rising entries persisted cleanly if MongoDB URI is unset/offline)
let localEntries = [];

function loadLocalStore() {
  try {
    if (!fs.existsSync(LOCAL_STORE_PATH)) {
      localEntries = [];
      return;
    }
    const raw = fs.readFileSync(LOCAL_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      localEntries = parsed;
    }
  } catch (err) {
    console.warn('[local-store] Could not load local store:', err.message);
    localEntries = [];
  }
}

function saveLocalStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(localEntries, null, 2), 'utf8');
  } catch (err) {
    console.warn('[local-store] Could not persist local store:', err.message);
  }
}

/**
 * Configure MongoDB client for a long-running Node HTTP API server (OLTP short queries & upserts).
 * Pool sizing follows mongodb-connection guidelines to balance warm burst concurrency with low M0/M2 RAM overhead.
 */
async function initMongoDB() {
  if (!MONGODB_URI || !MongoClient) {
    if (!MONGODB_URI) {
      console.log('[db] MONGODB_URI not set. Using persistent local fallback at data/leaderboard.json.');
    } else {
      console.log('[db] mongodb driver missing. Run "npm install" to enable MongoDB.');
    }
    mongoStatus = { connected: false, storage: 'local', lastError: null };
    return;
  }

  try {
    mongoClient = new MongoClient(MONGODB_URI, {
      maxPoolSize: 20,              // Supports concurrent leaderboard bursts without saturating Atlas shared-tier connection limits
      minPoolSize: 2,               // Keeps warm sockets ready to eliminate cold TLS/auth latency spikes
      maxIdleTimeMS: 120000,        // Prunes idle connections after 2 minutes
      connectTimeoutMS: 8000,       // Bounds initial connection wait time
      socketTimeoutMS: 20000,       // Prevents hung reads/writes
      serverSelectionTimeoutMS: 5000 // Fails fast to local fallback if cluster is unreachable
    });

    await mongoClient.connect();
    const db = mongoClient.db(MONGODB_DB_NAME);

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
    } else {
      try {
        await db.command({
          collMod: COLLECTION_NAME,
          validator,
          validationLevel: 'moderate',
          validationAction: 'error'
        });
      } catch (_) {
        // Ignore if database user lacks collMod privilege on Atlas shared tier
      }
    }

    mongoCollection = db.collection(COLLECTION_NAME);

    // 1. Unique per-player per-mode record identity
    await mongoCollection.createIndex({ playerId: 1, mode: 1 }, { unique: true, name: 'uniq_player_mode' });
    // 2. ESR compound index covering top-N sorted retrieval & rank counting per mode
    await mongoCollection.createIndex(
      { mode: 1, meters: -1, updatedAt: 1 },
      { name: 'idx_mode_leaderboard' }
    );

    mongoStatus = { connected: true, storage: 'mongodb', lastError: null };
    console.log(`[db] Connected cleanly to MongoDB (${MONGODB_DB_NAME}.${COLLECTION_NAME}).`);
  } catch (err) {
    mongoCollection = null;
    mongoStatus = { connected: false, storage: 'local', lastError: err.message };
    console.warn('[db] MongoDB unavailable, falling back to local store:', err.message);
  }
}

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

async function getHealthStats() {
  if (mongoCollection && mongoStatus.connected) {
    try {
      const [classicCount, risingCount] = await Promise.all([
        mongoCollection.countDocuments({ mode: 'classic' }),
        mongoCollection.countDocuments({ mode: 'rising' })
      ]);
      return {
        ok: true,
        storage: 'mongodb',
        dbConnected: true,
        counts: { classic: classicCount, rising: risingCount }
      };
    } catch (err) {
      return {
        ok: true,
        storage: 'local',
        dbConnected: false,
        error: err.message,
        counts: getLocalCounts()
      };
    }
  }
  return {
    ok: true,
    storage: 'local',
    dbConnected: false,
    counts: getLocalCounts()
  };
}

function getLocalCounts() {
  let classic = 0;
  let rising = 0;
  for (const e of localEntries) {
    if (e.mode === 'classic') classic++;
    else if (e.mode === 'rising') rising++;
  }
  return { classic, rising };
}

async function queryLeaderboard(mode, playerId, limit = 50) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));

  if (mongoCollection && mongoStatus.connected) {
    const [topDocs, totalPlayers, playerDoc] = await Promise.all([
      mongoCollection
        .find({ mode }, { projection: { _id: 0 } })
        .sort({ meters: -1, updatedAt: 1 })
        .limit(safeLimit)
        .toArray(),
      mongoCollection.countDocuments({ mode }),
      playerId ? mongoCollection.findOne({ playerId, mode }, { projection: { _id: 0 } }) : null
    ]);

    let playerRank = null;
    if (playerDoc) {
      const ahead = await mongoCollection.countDocuments({
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

  // Local fallback
  const filtered = localEntries.filter((e) => e.mode === mode).sort(sortEntries);
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
    storage: 'local',
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

  if (mongoCollection && mongoStatus.connected) {
    const existing = await mongoCollection.findOne({ playerId, mode });
    let isNewBest = false;

    if (!existing) {
      isNewBest = true;
      await mongoCollection.insertOne({
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
      await mongoCollection.updateOne(
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
      await mongoCollection.updateOne(
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

    // Keep player's cosmetic avatar & nickname consistent across both modes
    await mongoCollection.updateMany(
      { playerId },
      { $set: { nickname, color, accessory } }
    );

    const updatedDoc = await mongoCollection.findOne({ playerId, mode }, { projection: { _id: 0 } });
    const ahead = await mongoCollection.countDocuments({
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

  // Local store fallback
  const existing = localEntries.find((e) => e.playerId === playerId && e.mode === mode);
  let isNewBest = false;
  if (!existing) {
    isNewBest = true;
    localEntries.push({
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

  for (const e of localEntries) {
    if (e.playerId === playerId) {
      e.nickname = nickname;
      e.color = color;
      e.accessory = accessory;
    }
  }
  saveLocalStore();

  const sorted = localEntries.filter((e) => e.mode === mode).sort(sortEntries);
  const idx = sorted.findIndex((e) => e.playerId === playerId);
  const rank = idx + 1;

  return {
    status: 200,
    body: {
      ok: true,
      storage: 'local',
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

  if (mongoCollection && mongoStatus.connected) {
    const res = await mongoCollection.updateMany(
      { playerId },
      { $set: { nickname, color, accessory } }
    );
    return {
      status: 200,
      body: { ok: true, storage: 'mongodb', modifiedCount: res.modifiedCount }
    };
  }

  let modified = 0;
  for (const e of localEntries) {
    if (e.playerId === playerId) {
      e.nickname = nickname;
      e.color = color;
      e.accessory = accessory;
      modified++;
    }
  }
  if (modified > 0) saveLocalStore();

  return {
    status: 200,
    body: { ok: true, storage: 'local', modifiedCount: modified }
  };
}

async function deletePlayerRecords(playerIdRaw) {
  const playerId = sanitizePlayerId(playerIdRaw);
  if (!playerId) {
    return { status: 400, body: { ok: false, error: 'Invalid playerId' } };
  }

  if (mongoCollection && mongoStatus.connected) {
    const res = await mongoCollection.deleteMany({ playerId });
    return {
      status: 200,
      body: { ok: true, storage: 'mongodb', deletedCount: res.deletedCount }
    };
  }

  const before = localEntries.length;
  localEntries = localEntries.filter((e) => e.playerId !== playerId);
  const deleted = before - localEntries.length;
  if (deleted > 0) saveLocalStore();

  return {
    status: 200,
    body: { ok: true, storage: 'local', deletedCount: deleted }
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function readJsonBody(req, maxBytes = 16384) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function serveStaticFile(reqPath, res) {
  let cleanPath = reqPath === '/' ? '/index.html' : reqPath;
  try {
    cleanPath = decodeURIComponent(cleanPath);
  } catch (_) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  const normalized = path.normalize(cleanPath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.resolve(ROOT_DIR, '.' + path.sep + normalized);

  if (!fullPath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Never serve server internals or local database files directly
  const rel = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
  if (
    rel.startsWith('data/') ||
    rel === 'server.js' ||
    rel === 'package.json' ||
    rel === 'package-lock.json' ||
    rel === '.env'
  ) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  fs.stat(fullPath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(fullPath).pipe(res);
  });
}

async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  try {
    if (pathname === '/api/health' && req.method === 'GET') {
      const health = await getHealthStats();
      sendJson(res, 200, health);
      return;
    }

    if (pathname === '/api/leaderboard' && req.method === 'GET') {
      const mode = sanitizeMode(parsedUrl.searchParams.get('mode') || 'classic');
      if (!mode) {
        sendJson(res, 400, { ok: false, error: 'mode must be classic or rising' });
        return;
      }
      const playerId = sanitizePlayerId(parsedUrl.searchParams.get('playerId') || '');
      const limit = parsedUrl.searchParams.get('limit') || 50;
      const result = await queryLeaderboard(mode, playerId, limit);
      sendJson(res, 200, result);
      return;
    }

    if (pathname === '/api/leaderboard' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const out = await submitScore(body);
      sendJson(res, out.status, out.body);
      return;
    }

    if (pathname === '/api/leaderboard/profile' && req.method === 'PATCH') {
      const body = await readJsonBody(req);
      const out = await updateProfile(body);
      sendJson(res, out.status, out.body);
      return;
    }

    if (pathname.startsWith('/api/leaderboard/player/') && req.method === 'DELETE') {
      const id = pathname.slice('/api/leaderboard/player/'.length);
      const out = await deletePlayerRecords(id);
      sendJson(res, out.status, out.body);
      return;
    }
  } catch (err) {
    console.error('[api] Error handling', req.method, pathname, err);
    sendJson(res, 500, { ok: false, error: err.message || 'Internal Server Error' });
    return;
  }

  serveStaticFile(pathname, res);
}

async function startServer() {
  loadLocalStore();
  await initMongoDB();

  const server = http.createServer((req, res) => {
    handleRequest(req, res);
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[server] Jelly Climb running at http://127.0.0.1:${PORT}/ (${mongoStatus.storage})`);
  });

  const shutdown = async () => {
    server.close();
    if (mongoClient) {
      try {
        await mongoClient.close();
      } catch (_) {}
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  startServer();
}

module.exports = {
  initMongoDB,
  queryLeaderboard,
  submitScore,
  updateProfile,
  deletePlayerRecords,
  sanitizeNickname,
  sanitizeMeters
};
