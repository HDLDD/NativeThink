/** POST /api/auth/register — create account */

import { getKV } from '../_lib/kv.js';
import { hashPassword } from '../_lib/crypto.js';
import { signToken } from '../_lib/jwt.js';
import type { User } from '../_lib/types.js';

export const config = { runtime: 'edge' };

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !email.includes('@') || email.length > 255) {
    return Response.json({ error: 'Valid email required' }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return Response.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }

  const kv = getKV();

  // Check existing
  const existing = await kv.get<User>(`users:email:${email}`);
  if (existing) {
    return Response.json({ error: 'Email already registered' }, { status: 409 });
  }

  const user: User = {
    id: crypto.randomUUID(),
    email,
    passwordHash: await hashPassword(password),
    createdAt: Date.now(),
  };

  await kv.set(`users:email:${email}`, JSON.stringify(user));

  const token = await signToken({ userId: user.id, email: user.email });

  return Response.json({ token, user: { id: user.id, email: user.email } });
}
