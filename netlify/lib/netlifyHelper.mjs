import { MongoClient } from 'mongodb';
import serverlessHelper from '../../lib/serverlessHelper.js';

serverlessHelper.setMongoClient(MongoClient);

const MAX_JSON_BODY_BYTES = 16384;

function readEnv(key) {
  try {
    if (typeof Netlify !== 'undefined' && Netlify.env && typeof Netlify.env.get === 'function') {
      const val = Netlify.env.get(key);
      if (val) return val;
    }
  } catch (_) {}
  return process.env[key];
}

export function syncNetlifyEnv() {
  const uri = readEnv('MONGODB_URI');
  if (uri && !process.env.MONGODB_URI) {
    process.env.MONGODB_URI = uri;
  }
  const dbName = readEnv('MONGODB_DB_NAME');
  if (dbName && !process.env.MONGODB_DB_NAME) {
    process.env.MONGODB_DB_NAME = dbName;
  }
}

export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function parseRequestJson(req) {
  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_JSON_BODY_BYTES) {
    throw new Error('Request body too large');
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_) {
    throw new Error('Invalid JSON payload');
  }
}

export const { serverlessStore, sanitizePlayerId, sanitizeMode } = serverlessHelper;
