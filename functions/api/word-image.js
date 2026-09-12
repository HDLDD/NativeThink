import { withCors, preflight, isPreflight } from '../_lib/cors.js';
/**
 * GET /api/word-image?word=apple — 单词插图代理
 *
 * 通过国内可直连的百度图片建议接口（无需 API Key）检索与单词匹配的
 * 真实照片缩略图，转换为 https 地址后返回。客户端负责缓存与展示。
 *
 * 返回: { images: string[] }（已去重、https 化，最多 8 张）
 */

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    status,
  });
}

async function handler(context) {
  const url = new URL(context.request.url);
  const word = (url.searchParams.get('word') || '').trim().toLowerCase();

  // 单词形态校验（防注入/防滥用）
  if (!word || !/^[a-z][a-z'\- ]{0,30}$/.test(word)) {
    return json({ images: [] });
  }

  const api =
    `https://image.baidu.com/search/acjson?tn=resultjson_com&ipn=rj&ct=201326592&fp=result` +
    `&word=${encodeURIComponent(word)}&queryWord=${encodeURIComponent(word)}` +
    `&cl=2&lm=-1&ie=utf-8&oe=utf-8&pn=0&rn=10`;

  // 学习场景安全过滤 — 命中可疑词的 URL 直接丢弃
  const UNSAFE_RE = /(sex|porn|nsfw|nude|lingerie|bikini|sexy|lust|erotic|boobs|breast|xxx|hentai|sensual|escort)/i;

  const images = [];
  const seen = new Set();
  const push = (raw) => {
    if (!raw) return;
    const u = String(raw).replace(/^http:\/\//i, 'https://');
    if (!u.startsWith('https://') || seen.has(u) || u.length > 500) return;
    if (UNSAFE_RE.test(u)) return;
    seen.add(u);
    images.push(u);
  };

  // ── 双源并行：Bing 安全搜索（相关+安全） + 百度（实物图命中率高） ──
  const bingUrl = `https://cn.bing.com/images/async?q=${encodeURIComponent(word)}&first=0&count=10&mmasync=1&adlt=strict`;
  const fromBing = fetch(bingUrl, {
    headers: { 'User-Agent': CHROME_UA, Referer: 'https://cn.bing.com/', Accept: 'text/html' },
  })
    .then(async (res) => {
      if (!res.ok) return;
      const html = await res.text();
      // 优先 turl 缩略图（Bing CDN，几十 KB 秒开）；murl 原图作为换图备选
      const reT1 = /turl&quot;:&quot;(https?:\/\/[^&]+?)&quot;/g;
      const reT2 = /turl":"(https?:\/\/[^"]+?)"/g;
      const re1 = /murl&quot;:&quot;(https?:\/\/[^&]+?)&quot;/g;
      const re2 = /murl":"(https?:\/\/[^"]+?)"/g;
      let m;
      while ((m = reT1.exec(html)) !== null) push(m[1].replace(/&amp;/g, '&'));
      while ((m = reT2.exec(html)) !== null) push(m[1].replace(/\\u002f/gi, '/').replace(/&amp;/g, '&'));
      while ((m = re1.exec(html)) !== null) push(m[1].replace(/&amp;/g, '&'));
      while ((m = re2.exec(html)) !== null) push(m[1].replace(/\\u002f/gi, '/').replace(/&amp;/g, '&'));
    })
    .catch(() => {});

  const fromBaidu = fetch(api, {
    headers: { 'User-Agent': CHROME_UA, Referer: 'https://image.baidu.com/', Accept: 'application/json' },
  })
    .then(async (res) => {
      if (!res.ok) return;
      const text = await res.text();
      const start = text.indexOf('{');
      if (start === -1) return;
      const data = JSON.parse(text.slice(start));
      const items = Array.isArray(data?.data) ? data.data : [];
      for (const item of items) push(item?.thumbURL || item?.middleURL || item?.hoverURL || '');
    })
    .catch(() => {});

  await Promise.allSettled([fromBing, fromBaidu]);

  // 相关性优先：URL 里含单词本身的排前面（如 apple-pie.jpg 之于 apple）
  const w = word.replace(/[^a-z]/g, '');
  if (w.length >= 3) {
    images.sort((a, b) => {
      const am = a.toLowerCase().includes(w) ? 0 : 1;
      const bm = b.toLowerCase().includes(w) ? 0 : 1;
      return am - bm;
    });
  }

  return json({ images: images.slice(0, 8) });
}


// ── CORS：Capacitor APK (https://localhost) 跨域 + OPTIONS 预检 ──
export async function onRequest(context) {
  if (isPreflight(context.request)) return preflight();
  return withCors(await handler(context));
}
