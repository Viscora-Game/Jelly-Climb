'use strict';

const { createLeaderboardStore, sanitizePlayerId, sanitizeMode } = require('./leaderboardStore');

// Cached across warm invocations on Fluid Compute; never touches local disk in serverless runtime
let memoryFallbackEntries = [];

const serverlessStore = createLeaderboardStore({
  serverless: true,
  storageLabel: 'ephemeral',
  getEntries: () => memoryFallbackEntries,
  setEntries: (next) => {
    memoryFallbackEntries = next;
  }
});

function setCorsHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string') {
    return req.body ? JSON.parse(req.body) : {};
  }
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 16384) {
        reject(new Error('Request body too large'));
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

module.exports = {
  serverlessStore,
  setCorsHeaders,
  parseJsonBody,
  sanitizePlayerId,
  sanitizeMode
};
