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
    // Step 1: Check for existing user
    let existing;
    try {
      existing = await env.KV.get(`users:email:${email}`, 'json');
    } catch (kvErr) {
      return Response.json({ error: 'KV读取出错: ' + (kvErr.message || kvErr) }, { status: 500 });
    }
    if (existing)
      return Response.json({ error: '该邮箱已注册' }, { status: 409 });

    // Step 2: Hash password (CPU-intensive — PBKDF2 210k iterations)
    let passwordHash;
    try {
      passwordHash = await hashPassword(password);
    } catch (hashErr) {
      return Response.json({ error: '密码加密失败: ' + (hashErr.message || hashErr) }, { status: 500 });
    }

    const user = {
      id: (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomUUID?.() ?? (Date.now().toString(36) + Math.random().toString(36).slice(2, 10))),
      email,
      passwordHash,
      createdAt: Date.now(),
    };

    // Step 3: Save to KV
    try {
      await env.KV.put(`users:email:${email}`, JSON.stringify(user));
    } catch (putErr) {
      return Response.json({ error: 'KV写入失败: ' + (putErr.message || putErr) }, { status: 500 });
    }

    // Step 4: Sign token
    let token;
    try {
      token = await signToken({ userId: user.id, email: user.email }, env);
    } catch (jwtErr) {
      return Response.json({ error: '令牌生成失败: ' + (jwtErr.message || jwtErr) }, { status: 500 });
    }

    return Response.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    return Response.json({ error: '未知错误: ' + (e.message || String(e)) }, { status: 500 });
  }
}
