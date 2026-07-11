/** GET /api/auth/me */
import { authenticate } from '../../_lib/auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  const session = await authenticate(request, env);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({ user: { id: session.userId, email: session.email } });
}
