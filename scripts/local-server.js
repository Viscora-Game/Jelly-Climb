'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const {
  createLeaderboardStore,
  ensureMongoCollection,
  closeMongoClient,
  sanitizePlayerId,
  sanitizeMode,
  sanitizeNickname,
  sanitizeMeters
} = require('../lib/leaderboardStore');

const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const LOCAL_STORE_PATH = path.join(DATA_DIR, 'leaderboard.json');

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

function saveLocalStore(entries) {
  localEntries = entries;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(localEntries, null, 2), 'utf8');
  } catch (err) {
    console.warn('[local-store] Could not persist local store:', err.message);
  }
}

const store = createLeaderboardStore({
  serverless: false,
  storageLabel: 'local',
  getEntries: () => localEntries,
  setEntries: saveLocalStore
});

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
      } catch (_) {
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

  // Never expose server internals or local database files over HTTP
  const rel = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
  if (
    rel.startsWith('data/') ||
    rel.startsWith('lib/') ||
    rel.startsWith('api/') ||
    rel.startsWith('scripts/') ||
    rel.startsWith('dist/') ||
    rel === 'vercel.json' ||
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
      const health = await store.getHealthStats();
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
      const result = await store.queryLeaderboard(mode, playerId, limit);
      sendJson(res, 200, result);
      return;
    }

    if (pathname === '/api/leaderboard' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const out = await store.submitScore(body);
      sendJson(res, out.status, out.body);
      return;
    }

    if (pathname === '/api/leaderboard/profile' && req.method === 'PATCH') {
      const body = await readJsonBody(req);
      const out = await store.updateProfile(body);
      sendJson(res, out.status, out.body);
      return;
    }

    if (pathname.startsWith('/api/leaderboard/player/') && req.method === 'DELETE') {
      const id = pathname.slice('/api/leaderboard/player/'.length);
      const out = await store.deletePlayerRecords(id);
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
  const col = await ensureMongoCollection({ serverless: false });
  const storageMode = col ? 'mongodb' : 'local';

  const server = http.createServer((req, res) => {
    handleRequest(req, res);
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[server] Jelly Climb running at http://127.0.0.1:${PORT}/ (${storageMode})`);
  });

  const shutdown = async () => {
    server.close();
    await closeMongoClient();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  startServer();
}

module.exports = {
  queryLeaderboard: store.queryLeaderboard,
  submitScore: store.submitScore,
  updateProfile: store.updateProfile,
  deletePlayerRecords: store.deletePlayerRecords,
  sanitizeNickname,
  sanitizeMeters
};
