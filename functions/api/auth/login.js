/** POST /api/auth/login */
import { verifyPassword } from '../../_lib/crypto.js';
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
  if (!email || !password)
    return Response.json({ error: 'Email and password required' }, { status: 400 });

  const raw = await env.KV.get(`users:email:${email}`);
  if (!raw)
    return Response.json({ error: 'Invalid credentials' }, { status: 401 });

  const user = JSON.parse(raw);
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid)
    return Response.json({ error: 'Invalid credentials' }, { status: 401 });

  const token = await signToken({ userId: user.id, email: user.email }, env);
  return Response.json({ token, user: { id: user.id, email: user.email } });
}
