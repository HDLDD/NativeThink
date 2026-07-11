/** GET/PUT /api/data/:key — user data via KV proxy */

import { authenticateRequest } from '../_lib/auth-middleware';
import { getKV, userDataKey } from '../_lib/kv';

export const config = { runtime: 'edge' };

export async function GET(request: Request) {
  const session = await authenticateRequest(request);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const key = new URL(request.url).pathname.replace('/api/data/', '');
  if (!key) return Response.json({ error: 'Missing key' }, { status: 400 });

  const kv = getKV();
  const value = await kv.get<string>(userDataKey(session.userId, key));
  return Response.json({ value: value ?? null });
}

export async function PUT(request: Request) {
  const session = await authenticateRequest(request);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const key = new URL(request.url).pathname.replace('/api/data/', '');
  if (!key) return Response.json({ error: 'Missing key' }, { status: 400 });

  let body: { value?: string };
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const kv = getKV();
  await kv.set(userDataKey(session.userId, key), body.value ?? '');
  return Response.json({ ok: true });
}
