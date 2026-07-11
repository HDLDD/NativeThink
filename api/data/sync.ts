/** POST /api/data/sync — batch upload (first-login migration) */

import { authenticateRequest } from '../_lib/auth-middleware.js';
import { getKV, userDataKey } from '../_lib/kv.js';

export const config = { runtime: 'edge' };

// First-login: upload all localStorage keys to cloud
export async function POST(request: Request) {
  const session = await authenticateRequest(request);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { upserts?: Record<string, string> };
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const upserts = body.upserts || {};
  const kv = getKV();

  // Write each key individually (Vercel KV doesn't have mset)
  const keys = Object.keys(upserts);
  for (const key of keys) {
    await kv.set(userDataKey(session.userId, key), upserts[key]);
  }

  return Response.json({ ok: true, synced: keys.length });
}

// Pull all cloud data down
export async function GET(request: Request) {
  const session = await authenticateRequest(request);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const kv = getKV();
  const prefix = userDataKey(session.userId, '');
  const keys = await kv.keys(prefix + '*');

  const data: Record<string, string> = {};
  for (const k of keys) {
    const rawKey = k.replace(prefix, '');
    const value = await kv.get<string>(k);
    if (value !== null) data[rawKey] = value;
  }

  return Response.json({ data });
}
