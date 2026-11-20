import { syncNetlifyEnv, serverlessStore, jsonResponse } from '../lib/netlifyHelper.mjs';

export default async (req, context) => {
  if (req.method !== 'DELETE') {
    return jsonResponse({ ok: false, error: 'Method Not Allowed' }, 405);
  }

  syncNetlifyEnv();
  try {
    const playerId = context && context.params && context.params.playerId;
    const out = await serverlessStore.deletePlayerRecords(playerId);
    return jsonResponse(out.body, out.status);
  } catch (err) {
    console.error('[netlify/api/leaderboard/player] Error:', err);
    return jsonResponse({ ok: false, error: err.message || 'Internal Server Error' }, 500);
  }
};

export const config = {
  path: '/api/leaderboard/player/:playerId'
};
