/**
 * Cloudflare Pages Function — 获取 B站视频字幕
 *
 * GET /api/bilibili-subtitle?bvid=BV1xxx&page=1
 *
 * 1. 获取视频 CID
 * 2. 获取字幕列表
 * 3. 下载字幕 JSON → 解析为中英双语分段
 *
 * 注意：Bilibili API 可能因 Cloudflare 网络限制不可达。
 * 此时返回空字幕 + 由前端 AI 补充。
 */

const BILIBILI_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Safe JSON fetch — returns null on any error */
async function safeFetchJson(url, headers = {}) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': BILIBILI_UA, ...headers } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

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

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const bvid = (url.searchParams.get('bvid') || '').trim().toUpperCase();
  const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;

  // Validate BVID
  if (!/^BV[A-Za-z0-9]{10,}$/.test(bvid)) {
    return new Response(JSON.stringify({ error: '无效的 BVID' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 400,
    });
  }

  // Step 1: Get view info (page list, titles, CIDs)
  const viewData = await safeFetchJson(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { Referer: 'https://www.bilibili.com' });
  const pages = viewData?.data?.pages || [];
  const targetPage = pages[page - 1] || pages[0] || null;

  // Build episode list (even if view API fails, return episode count from BVID metadata)
  const episodeList = pages.length > 0
    ? pages.map((p) => ({
        page: p.page || 0,
        part: (p.part || `Episode ${p.page || 1}`).trim() || `Episode ${p.page || 1}`,
        duration: p.duration || 0,
      }))
    : [];

  // Step 2: Fetch subtitles for target page
  let segments = [];
  let source = 'none';

  if (targetPage && targetPage.cid) {
    const subData = await safeFetchJson(
      `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${targetPage.cid}`,
      { Referer: 'https://www.bilibili.com' },
    );
    const subtitles = subData?.data?.subtitle?.subtitles || [];

    if (subtitles.length > 0) {
      try {
        const best = subtitles.find((s) => s.lan === 'en') || subtitles[0];
        const subUrl = (best.subtitle_url || '').startsWith('//')
          ? `https:${best.subtitle_url}`
          : best.subtitle_url;

        if (subUrl) {
          const subJson = await safeFetchJson(subUrl, { Referer: 'https://www.bilibili.com' });
          const body = subJson?.body || [];
          segments = body
            .filter((item) => item.content && item.from != null && item.to != null)
            .map((item) => {
              const parts = item.content.split('<#>');
              return {
                start: item.from,
                end: item.to,
                en: (parts[0] || '').trim(),
                zh: (parts[1] || '').trim(),
                keywords: extractKeywords(parts[0] || ''),
              };
            })
            .filter((s) => s.en.length > 0);
          source = 'bilibili';
        }
      } catch { /* subtitle fetch failed silently */ }
    }
  }

  // Always return 200 — even if everything fails, the frontend handles empty gracefully
  return new Response(JSON.stringify({
    bvid,
    page,
    cid: targetPage?.cid || 0,
    part: targetPage?.part || '',
    segments,
    source,
    error: null,
    totalEpisodes: pages.length || (episodeList.length || 1),
    episodeList,
  }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
