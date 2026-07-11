/** GET /api/auth/me — validate token and return current user */

import { authenticateRequest } from '../_lib/auth-middleware.js';

export const config = { runtime: 'edge' };

export async function GET(request: Request) {
  const session = await authenticateRequest(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return Response.json({ user: { id: session.userId, email: session.email } });
}
