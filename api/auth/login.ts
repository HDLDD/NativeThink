/** POST /api/auth/login — sign in */

import { getKV } from '../_lib/kv';
import { verifyPassword } from '../_lib/crypto';
import { signToken } from '../_lib/jwt';
import type { User } from '../_lib/types';

export const config = { runtime: 'edge' };

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return Response.json({ error: 'Email and password required' }, { status: 400 });
  }

  const kv = getKV();
  const raw = await kv.get<string>(`users:email:${email}`);
  if (!raw) {
    return Response.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const user: User = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return Response.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const token = await signToken({ userId: user.id, email: user.email });
  return Response.json({ token, user: { id: user.id, email: user.email } });
}
