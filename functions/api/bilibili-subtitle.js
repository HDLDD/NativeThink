/**
 * Cloudflare Pages Function — 获取 B站视频字幕
 *
 * GET /api/bilibili-subtitle?bvid=BV1xxx&page=1
 *
 * 1. 获取视频 CID
 * 2. 获取字幕列表（含 WBI 签名）
 * 3. 下载字幕 JSON
 * 4. 解析为中英双语分段
 */

const BILIBILI_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── WBI 签名 ──

const MIXIN_KEY_ENC_TABLE = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 37, 12, 52, 56, 7,
  0, 16, 22, 38, 59, 55, 39, 57, 41, 20, 30, 34, 17, 13, 11, 25,
  24, 54, 44, 36, 48, 21, 26, 1, 6, 51, 40, 4,
];

function getMixinKey(key) {
  let mixin = '';
  for (const i of MIXIN_KEY_ENC_TABLE.slice(0, 32)) {
    mixin += key[i];
  }
  return mixin;
}

async function getWbiKeys() {
  const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
    headers: { 'User-Agent': BILIBILI_UA },
  });
  const json = await res.json();
  const { img_key, sub_key } = json.data.wbi_img;
  return { img_key, sub_key };
}

async function signParams(params, imgKey, subKey) {
  const mixinKey = getMixinKey(imgKey + subKey);
  const sorted = Object.keys(params).sort();
  const query = sorted.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
  const s = query + mixinKey;
  const hashBuffer = await crypto.subtle.digest('MD5', new TextEncoder().encode(s));
  const wRid = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return { w_rid: wRid, wts: Math.floor(Date.now() / 1000) };
}

// ── Fetch subtitle ──

async function getSubtitle(bvid, cid) {
  try {
    // Try with WBI signature
    const { img_key, sub_key } = await getWbiKeys();
    const signed = await signParams({ bvid, cid: String(cid) }, img_key, sub_key);
    const url = `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}&w_rid=${signed.w_rid}&wts=${signed.wts}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': BILIBILI_UA,
        'Referer': 'https://www.bilibili.com',
      },
    });
    const data = await res.json();
    const subtitles = data?.data?.subtitle?.subtitles || [];

    if (subtitles.length === 0) return { segments: [], source: 'none' };

    // Prefer English subtitle, fallback to any
    let best = subtitles.find((s) => s.lan === 'en') || subtitles[0];
    const subUrl = best.subtitle_url.startsWith('//') ? `https:${best.subtitle_url}` : best.subtitle_url;

    const subRes = await fetch(subUrl, {
      headers: { 'User-Agent': BILIBILI_UA, 'Referer': 'https://www.bilibili.com' },
    });
    const subData = await subRes.json();
    const body = subData.body || [];

    // Parse subtitle content (format: "English<#>Chinese" or just English)
    const segments = body
      .filter((item) => item.content && item.from !== undefined && item.to !== undefined)
      .map((item) => {
        const parts = item.content.split('<#>');
        const en = (parts[0] || '').trim();
        const zh = (parts[1] || '').trim();
        return {
          start: item.from,
          end: item.to,
          en,
          zh,
          keywords: extractKeywords(en),
        };
      })
      .filter((s) => s.en.length > 0);

    return { segments, source: 'bilibili' };
  } catch (err) {
    return { segments: [], source: 'none', error: err.message };
  }
}

// ── Basic keyword extraction ──

function extractKeywords(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const keywords = [];
  const seen = new Set();
  for (const w of words) {
    const clean = w.replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (clean.length > 4 && !seen.has(clean) && keywords.length < 5) {
      seen.add(clean);
      keywords.push({ word: clean, meaning: '' });
    }
  }
  return keywords;
}

// ── Handler ──

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const bvid = url.searchParams.get('bvid');
  const page = parseInt(url.searchParams.get('page') || '1', 10);

  if (!bvid || !/^BV[A-Za-z0-9]{10,}$/.test(bvid.toUpperCase())) {
    return new Response(JSON.stringify({ error: '无效的 BVID' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 400,
    });
  }

  try {
    // Step 1: Get video info → CID for the requested page
    const viewRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
      headers: { 'User-Agent': BILIBILI_UA },
    });
    const viewData = await viewRes.json();
    if (viewData.code !== 0) {
      return new Response(JSON.stringify({ error: 'B站 API 错误', message: viewData.message }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        status: 400,
      });
    }
    const pages = viewData.data.pages || [];
    const targetPage = pages[page - 1] || pages[0];
    if (!targetPage) {
      return new Response(JSON.stringify({ error: '未找到该分集' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        status: 404,
      });
    }
    const cid = targetPage.cid;

    // Step 2: Get subtitles for this CID
    const result = await getSubtitle(bvid, cid);

    return new Response(JSON.stringify({
      bvid,
      page,
      cid,
      part: targetPage.part || '',
      segments: result.segments,
      source: result.source,
      error: result.error || null,
      totalEpisodes: pages.length,
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 500,
    });
  }
}
