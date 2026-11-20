import {
  syncNetlifyEnv,
  serverlessStore,
  jsonResponse,
  parseRequestJson
} from '../lib/netlifyHelper.mjs';

export default async (req) => {
  if (req.method !== 'PATCH') {
    return jsonResponse({ ok: false, error: 'Method Not Allowed' }, 405);
  }

  syncNetlifyEnv();
  try {
    const body = await parseRequestJson(req);
    const out = await serverlessStore.updateProfile(body);
    return jsonResponse(out.body, out.status);
  } catch (err) {
    console.error('[netlify/api/leaderboard/profile] Error:', err);
    return jsonResponse({ ok: false, error: err.message || 'Internal Server Error' }, 500);
  }
};

export const config = {
  path: '/api/leaderboard/profile'
};
