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
  const { request, env } = context;
  const url = new URL(request.url);
  // NOTE: Bilibili API bvid lookup is case-sensitive — never toUpperCase()
  const bvid = (url.searchParams.get('bvid') || '').trim();
  const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
  // Optional B站 login state (SESSDATA) — unlocks B站 AI-generated subtitles
  const cookieHeader = env?.BILIBILI_COOKIE || '';

  // Validate BVID
  if (!/^BV[A-Za-z0-9]{10,}$/.test(bvid)) {
    return new Response(JSON.stringify({ error: '无效的 BVID' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 400,
    });
  }

  // Step 1: Get view info (page list, titles, CIDs)
  const viewData = await safeFetchJson(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
    Referer: 'https://www.bilibili.com',
    Cookie: cookieHeader,
  });
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
    // B站 AI 字幕是异步生成的：首次请求经常返回空/部分字幕。
    // 轮询重试直到有完整英文字幕（最多 ~6s），避免前端拿到空结果。
    for (let attempt = 0; attempt < 5; attempt++) {
      const subData = await safeFetchJson(
        `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${targetPage.cid}`,
        { Referer: 'https://www.bilibili.com', Cookie: cookieHeader },
      );
      const subtitles = subData?.data?.subtitle?.subtitles || [];

      if (subtitles.length > 0) {
        try {
          // Prefer a REAL English track. B站 AI subtitles use lan like
          // "ai-en" (English) or "ai-zh" (Chinese) — matching "en" picks
          // ai-en; a plain Chinese video often only has ai-zh, which we
          // must NOT put into the en field.
          const hasEnglishTrack = subtitles.some((s) => /en/.test(s.lan || ''));
          const best = hasEnglishTrack
            ? subtitles.find((s) => /en/.test(s.lan || ''))
            : null;
          const subUrl = best ? ((best.subtitle_url || '').startsWith('//') ? `https:${best.subtitle_url}` : best.subtitle_url) : null;

          if (subUrl) {
            const subJson = await safeFetchJson(subUrl, { Referer: 'https://api.bilibili.com', Cookie: cookieHeader });
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
            // Only accept when the track is English OR there are no Chinese-only
            // tracks available (best is null). A Chinese AI track must not be
            // shown as "English" subtitles.
            if (!hasEnglishTrack) segments = [];
            // Only accept when we have a useful amount of English text
            if (segments.length > 20) {
              source = 'bilibili';
              break;
            }
            // Partial/empty → AI subtitle still generating, retry
            segments = [];
          }
        } catch { /* subtitle fetch failed silently — retry */ }
      }
      // Wait between attempts (B站 AI 字幕生成通常需要 1-3 秒)
      if (attempt < 4) await new Promise((r) => setTimeout(r, 1200));
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
