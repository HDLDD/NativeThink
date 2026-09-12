/**
 * CORS helpers — Capacitor APK 内源为 https://localhost，跨域调用云端函数。
 * 没有 ACAO 头 + OPTIONS 预检支持时，手机端所有 AI/TTS 等请求都会被拦截。
 */

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

/** 给 Response 追加 CORS 头（幂等） */
export function withCors(response) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    try { response.headers.set(k, v); } catch { /* immutable — ignore */ }
  }
  return response;
}

/** OPTIONS 预检响应 */
export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** 统一入口：每个 onRequest 开头调用 — OPTIONS 直接短路 */
export function isPreflight(request) {
  return request.method === 'OPTIONS';
}
