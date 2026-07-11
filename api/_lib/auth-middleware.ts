/** Bearer token extraction and validation middleware */

import { verifyToken } from './jwt';
import type { UserSession } from './types';

export async function authenticateRequest(request: Request): Promise<UserSession | null> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyToken(auth.slice(7));
}
