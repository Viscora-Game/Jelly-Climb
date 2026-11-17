'use strict';

const { serverlessStore, setCorsHeaders } = require('../lib/serverlessHelper');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  try {
    const health = await serverlessStore.getHealthStats();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(health));
  } catch (err) {
    console.error('[api/health] Error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'Internal Server Error' }));
  }
};
