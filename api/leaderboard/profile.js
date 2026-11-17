'use strict';

const { serverlessStore, setCorsHeaders, parseJsonBody } = require('../../lib/serverlessHelper');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    if (req.method !== 'PATCH') {
      res.statusCode = 405;
      res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }));
      return;
    }
    const body = await parseJsonBody(req);
    const out = await serverlessStore.updateProfile(body);
    res.statusCode = out.status;
    res.end(JSON.stringify(out.body));
  } catch (err) {
    console.error('[api/leaderboard/profile] Error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message || 'Internal Server Error' }));
  }
};
