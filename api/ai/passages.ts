/** GET /api/ai/passages — list saved passages (for future Articles feature) */

import { authenticateRequest } from '../_lib/auth-middleware.js';
import { getKV } from '../_lib/kv.js';
import type { GeneratedPassage } from '../_lib/types.js';

export const config = { runtime: 'edge' };

export async function GET(request: Request) {
  const session = await authenticateRequest(request);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const kv = getKV();
  const prefix = `passages:${session.userId}:`;
  const keys = await kv.keys(prefix + '*');

  const passages: GeneratedPassage[] = [];
  for (const k of keys) {
    const raw = await kv.get<string>(k);
    if (raw) {
      try { passages.push(JSON.parse(raw)); } catch { /* skip corrupt */ }
    }
  }

  passages.sort((a, b) => b.createdAt - a.createdAt);
  return Response.json({ passages });
}
