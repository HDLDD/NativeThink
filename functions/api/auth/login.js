/** POST /api/auth/login */
import { verifyPassword } from '../../_lib/crypto.js';
import { signToken } from '../../_lib/jwt.js';

export async function onRequest(context) {
  const { request, env } = context;

  // Defensive: KV binding not configured
  if (!env.KV) {
    return Response.json({ error: '存储服务未配置。请在 Cloudflare Pages 后台绑定 KV 命名空间，绑定名称设为 "KV"。' }, { status: 500 });
  }

  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password)
    return Response.json({ error: '请输入邮箱和密码' }, { status: 400 });

  try {
    const raw = await env.KV.get(`users:email:${email}`);
    if (!raw)
      return Response.json({ error: '邮箱或密码错误' }, { status: 401 });

    const user = JSON.parse(raw);
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid)
      return Response.json({ error: '邮箱或密码错误' }, { status: 401 });

    const token = await signToken({ userId: user.id, email: user.email }, env);
    return Response.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error('login error:', e);
    return Response.json({ error: '服务器内部错误，请稍后重试' }, { status: 500 });
  }
}
