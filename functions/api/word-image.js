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

export async function onRequest(context) {
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

  const images = [];
  const seen = new Set();
  const push = (raw) => {
    if (!raw) return;
    const u = String(raw).replace(/^http:\/\//i, 'https://');
    if (!u.startsWith('https://') || seen.has(u) || u.length > 500) return;
    seen.add(u);
    images.push(u);
  };

  // ── 源 1：百度图片建议接口 ──
  try {
    const res = await fetch(api, {
      headers: { 'User-Agent': CHROME_UA, Referer: 'https://image.baidu.com/', Accept: 'application/json' },
    });
    if (res.ok) {
      const text = await res.text();
      const start = text.indexOf('{');
      if (start !== -1) {
        const data = JSON.parse(text.slice(start));
        const items = Array.isArray(data?.data) ? data.data : [];
        for (const item of items) push(item?.thumbURL || item?.middleURL || item?.hoverURL || '');
      }
    }
  } catch { /* fall through to bing */ }

  // ── 源 2（备选）：Bing 图片 async HTML（百度限流/为空时） ──
  if (images.length < 3) {
    try {
      const bingUrl = `https://cn.bing.com/images/async?q=${encodeURIComponent(word)}&first=0&count=10&mmasync=1`;
      const res = await fetch(bingUrl, {
        headers: { 'User-Agent': CHROME_UA, Referer: 'https://cn.bing.com/', Accept: 'text/html' },
      });
      if (res.ok) {
        const html = await res.text();
        // 直接抽取 murl（原图地址）— 属性内是 &quot; 转义
        const re1 = /murl&quot;:&quot;(https?:\/\/[^&]+?)&quot;/g;
        const re2 = /murl":"(https?:\/\/[^"]+?)"/g;
        let m;
        while ((m = re1.exec(html)) !== null) push(m[1].replace(/&amp;/g, '&'));
        while ((m = re2.exec(html)) !== null) push(m[1].replace(/\\u002f/gi, '/').replace(/&amp;/g, '&'));
      }
    } catch { /* give up — empty list */ }
  }

  return json({ images: images.slice(0, 8) });
}
