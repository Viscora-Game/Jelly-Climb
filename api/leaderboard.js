'use strict';

const {
  serverlessStore,
  setCorsHeaders,
  parseJsonBody,
  sanitizePlayerId,
  sanitizeMode
} = require('../lib/serverlessHelper');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    if (req.method === 'GET') {
      const mode = sanitizeMode((req.query && req.query.mode) || 'classic');
      if (!mode) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: 'mode must be classic or rising' }));
        return;
      }
      const playerId = sanitizePlayerId((req.query && req.query.playerId) || '');
      const limit = (req.query && req.query.limit) || 50;
      const result = await serverlessStore.queryLeaderboard(mode, playerId, limit);
      res.statusCode = 200;
      res.end(JSON.stringify(result));
      return;
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const out = await serverlessStore.submitScore(body);
      res.statusCode = out.status;
      res.end(JSON.stringify(out.body));
      return;
    }

    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }));
  } catch (err) {
    console.error('[api/leaderboard] Error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message || 'Internal Server Error' }));
  }
};
