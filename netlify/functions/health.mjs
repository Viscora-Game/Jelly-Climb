import { syncNetlifyEnv, serverlessStore, jsonResponse } from '../lib/netlifyHelper.mjs';

export default async (req) => {
  if (req.method !== 'GET') {
    return jsonResponse({ ok: false, error: 'Method Not Allowed' }, 405);
  }

  syncNetlifyEnv();
  try {
    const health = await serverlessStore.getHealthStats();
    return jsonResponse(health, 200);
  } catch (err) {
    console.error('[netlify/api/health] Error:', err);
    return jsonResponse({ ok: false, error: 'Internal Server Error' }, 500);
  }
};

export const config = {
  path: '/api/health'
};
