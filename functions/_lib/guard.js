/**
 * guard.js — /api/ai/* 的防滥用守卫（2026-09 体检结论落地）。
 *
 * 1. Origin 白名单：拦截"任意第三方网页把我们的 Functions 当免费 AI 中继"。
 *    浏览器跨源 POST 一定带 Origin（同源 POST 也带），伪造 Origin 只能来自
 *    非浏览器脚本 —— 那类滥用由下面的 IP 限流兜底。Electron 端走本地 server，
 *    不经过 Cloudflare Functions，故白名单只需覆盖 Web/Capacitor/本地开发。
 *
 * 2. IP 限流：CF-Connecting-IP 分钟窗计数（isolate 内存，非持久 —— 免费档
 *    KV 每日写入上限 1000，逐请求写 KV 会把配额打爆；内存窗口已足够削突发）。
 *
 * 3. 出厂 Key 用量监控：每次用服务端 Key（客户端未配 Key）都记一笔内存计数并
 *    console.log 结构化日志（CF 控制台 Real-time Logs / wrangler tail 可见），
 *    GET /api/ai/chat 返回当日快照（仅计数，无敏感数据）。
 */

const ALLOWED_ORIGINS = new Set([
  'https://nativethink.pages.dev',
  'https://localhost',
  'http://localhost',
  'http://127.0.0.1',
]);

/** 本地开发/Capacitor/Electron 带端口的形式 */
function isLocalOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export function checkOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  if (ALLOWED_ORIGINS.has(origin) || isLocalOrigin(origin)) return { ok: true };
  // 浏览器对 POST 一定带 Origin；缺失/不在白名单 → 非白名单来源
  return { ok: false, origin };
}

// ── IP 分钟窗限流（isolate 内存） ──
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const rateMap = new Map(); // ip -> { count, resetAt }

export function checkRate(ip) {
  const now = Date.now();
  let entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    rateMap.set(ip, entry);
  }
  entry.count += 1;
  // 顺手清理过期项，防 Map 无限增长
  if (rateMap.size > 5_000) {
    for (const [k, v] of rateMap) if (now > v.resetAt) rateMap.delete(k);
  }
  return { ok: entry.count <= MAX_PER_WINDOW, count: entry.count };
}

// ── 出厂 Key 用量监控（isolate 内存 + 结构化日志） ──
const usage = { day: '', factoryTotal: 0, byProvider: {} };

export function trackFactoryUsage(request, provider, model) {
  const day = new Date().toISOString().slice(0, 10);
  if (usage.day !== day) {
    usage.day = day;
    usage.factoryTotal = 0;
    usage.byProvider = {};
  }
  usage.factoryTotal += 1;
  usage.byProvider[provider] = (usage.byProvider[provider] || 0) + 1;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  // 结构化日志：CF 控制台 Real-time Logs / wrangler pages deployment tail 可检索
  console.log(JSON.stringify({ type: 'ai_factory_usage', day, provider, model, ip }));
}

export function usageSnapshot() {
  return { day: usage.day, factoryTotal: usage.factoryTotal, byProvider: { ...usage.byProvider } };
}

/** messages 数组的形状与体量校验（防超大 payload / 非字符串透传） */
export function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  if (messages.length > 80) return false;   // 长对话历史（AI 对话全量上下文）也要装得下
  let total = 0;
  for (const m of messages) {
    if (!m || typeof m !== 'object') return false;
    if (typeof m.role !== 'string' || typeof m.content !== 'string') return false;
    total += m.content.length;
    if (total > 64_000) return false;
  }
  return true;
}
