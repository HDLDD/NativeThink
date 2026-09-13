/**
 * GET /api/gutenberg?id=1342 — 古腾堡公版书全文代理
 *
 * gutenberg.org 不返回 CORS 头，浏览器无法直连 — 由函数代理。
 * 桌面本地服务器 / APK(云) / 网页 同一实现。
 */

import { withCors, preflight, isPreflight } from '../_lib/cors.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36';

async function handler(context) {
  const url = new URL(context.request.url);
  const id = (url.searchParams.get('id') || '').trim();
  if (!/^\d{1,5}$/.test(id)) {
    return withCors(new Response(JSON.stringify({ error: 'invalid id' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
  }

  const urls = [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
  ];

  for (const u of urls) {
    try {
      const res = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.length > 1000) {
        return withCors(new Response(JSON.stringify({ text }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
    } catch { /* try next url */ }
  }

  return withCors(new Response(JSON.stringify({ error: 'book not reachable' }), { status: 502, headers: { 'Content-Type': 'application/json' } }));
}

// ── CORS：Capacitor APK (https://localhost) 跨域 + OPTIONS 预检 ──
export async function onRequest(context) {
  if (isPreflight(context.request)) return preflight();
  return withCors(await handler(context));
}
