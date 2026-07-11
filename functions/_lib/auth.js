/** Auth middleware — extracts and validates Bearer token */
import { verifyToken } from './jwt.js';

export async function authenticate(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyToken(auth.slice(7), env);
}
