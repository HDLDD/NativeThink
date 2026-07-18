/**
 * Cloudflare Pages Function — 获取 B站视频字幕
 *
 * GET /api/bilibili-subtitle?bvid=BV1xxx&page=1
 *
 * 1. 获取视频 CID
 * 2. 获取字幕列表
 * 3. 下载字幕 JSON → 解析为中英双语分段
 */

const BILIBILI_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function getSubtitle(bvid, cid) {
  try {
    const url = `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': BILIBILI_UA, 'Referer': 'https://www.bilibili.com' },
    });
    const data = await res.json();
    const subtitles = data?.data?.subtitle?.subtitles || [];

    if (subtitles.length === 0) return { segments: [], source: 'none' };

    const best = subtitles.find((s) => s.lan === 'en') || subtitles[0];
    const subUrl = best.subtitle_url.startsWith('//') ? `https:${best.subtitle_url}` : best.subtitle_url;

    const subRes = await fetch(subUrl, {
      headers: { 'User-Agent': BILIBILI_UA, 'Referer': 'https://www.bilibili.com' },
    });
    const subData = await subRes.json();
    const body = subData.body || [];

    const segments = body
      .filter((item) => item.content && item.from !== undefined && item.to !== undefined)
      .map((item) => {
        const parts = item.content.split('<#>');
        const en = (parts[0] || '').trim();
        const zh = (parts[1] || '').trim();
        return { start: item.from, end: item.to, en, zh, keywords: extractKeywords(en) };
      })
      .filter((s) => s.en.length > 0);

    return { segments, source: 'bilibili' };
  } catch (err) {
    return { segments: [], source: 'none', error: err.message };
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
  const bvid = url.searchParams.get('bvid');
  const page = parseInt(url.searchParams.get('page') || '1', 10);

  if (!bvid || !/^BV[A-Za-z0-9]{10,}$/.test(bvid.toUpperCase())) {
    return new Response(JSON.stringify({ error: '无效的 BVID' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 400,
    });
  }

  try {
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

    const result = await getSubtitle(bvid, targetPage.cid);

    return new Response(JSON.stringify({
      bvid, page,
      cid: targetPage.cid,
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
