/** POST/GET /api/data/sync — batch upload/download user data */
import { authenticate } from '../../_lib/auth.js';
import { userDataKey } from '../../_lib/kv.js';

export async function onRequest(context) {
  const { request, env } = context;
  const session = await authenticate(request, env);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Upload (POST): save all localStorage keys to KV
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const upserts = body.upserts || {};
    const keys = Object.keys(upserts);
    for (const key of keys) {
      await env.KV.put(userDataKey(session.userId, key), upserts[key]);
    }
    return Response.json({ ok: true, synced: keys.length });
  }

  // Download (GET): pull all cloud data
  const prefix = userDataKey(session.userId, '');
  const list = await env.KV.list({ prefix });
  const data = {};
  for (const k of list.keys) {
    const rawKey = k.name.replace(prefix, '');
    const value = await env.KV.get(k.name);
    if (value !== null) data[rawKey] = value;
  }
  return Response.json({ data });
}
