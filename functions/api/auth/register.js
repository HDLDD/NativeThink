/** POST /api/auth/register */
import { hashPassword } from '../../_lib/crypto.js';
import { signToken } from '../../_lib/jwt.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !email.includes('@') || email.length > 255)
    return Response.json({ error: 'Valid email required' }, { status: 400 });
  if (!password || password.length < 6)
    return Response.json({ error: 'Password must be at least 6 characters' }, { status: 400 });

  const existing = await env.KV.get(`users:email:${email}`, 'json');
  if (existing)
    return Response.json({ error: 'Email already registered' }, { status: 409 });

  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash: await hashPassword(password),
    createdAt: Date.now(),
  };

  await env.KV.put(`users:email:${email}`, JSON.stringify(user));

  const token = await signToken({ userId: user.id, email: user.email }, env);
  return Response.json({ token, user: { id: user.id, email: user.email } });
}
