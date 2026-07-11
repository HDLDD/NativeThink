/** POST /api/auth/register */
import { hashPassword } from '../../_lib/crypto.js';
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

  if (!email || !email.includes('@') || email.length > 255)
    return Response.json({ error: '请输入有效的邮箱地址' }, { status: 400 });
  if (!password || password.length < 6)
    return Response.json({ error: '密码至少 6 位' }, { status: 400 });

  try {
    const existing = await env.KV.get(`users:email:${email}`, 'json');
    if (existing)
      return Response.json({ error: '该邮箱已注册' }, { status: 409 });

    const user = {
      id: crypto.randomUUID(),
      email,
      passwordHash: await hashPassword(password),
      createdAt: Date.now(),
    };

    await env.KV.put(`users:email:${email}`, JSON.stringify(user));

    const token = await signToken({ userId: user.id, email: user.email }, env);
    return Response.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error('register error:', e);
    return Response.json({ error: '服务器内部错误，请稍后重试' }, { status: 500 });
  }
}
