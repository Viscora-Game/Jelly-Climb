import {
  syncNetlifyEnv,
  serverlessStore,
  sanitizePlayerId,
  sanitizeMode,
  jsonResponse,
  parseRequestJson
} from '../lib/netlifyHelper.mjs';

export default async (req) => {
  syncNetlifyEnv();

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mode = sanitizeMode(url.searchParams.get('mode') || 'classic');
      if (!mode) {
        return jsonResponse({ ok: false, error: 'mode must be classic or rising' }, 400);
      }
      const playerId = sanitizePlayerId(url.searchParams.get('playerId') || '');
      const limit = url.searchParams.get('limit') || 50;
      const result = await serverlessStore.queryLeaderboard(mode, playerId, limit);
      return jsonResponse(result, 200);
    }

    if (req.method === 'POST') {
      const body = await parseRequestJson(req);
      const out = await serverlessStore.submitScore(body);
      return jsonResponse(out.body, out.status);
    }

    return jsonResponse({ ok: false, error: 'Method Not Allowed' }, 405);
  } catch (err) {
    console.error('[netlify/api/leaderboard] Error:', err);
    return jsonResponse({ ok: false, error: err.message || 'Internal Server Error' }, 500);
  }
};

export const config = {
  path: '/api/leaderboard'
};
