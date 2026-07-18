/**
 * Cloudflare Pages Function — 获取 B站视频/合集信息
 *
 * GET /api/bilibili-info?bvid=BV1xxx
 *
 * 代理 Bilibili API 获取视频标题、集数、时长、分集列表
 */

const BILIBILI_API = 'https://api.bilibili.com/x/web-interface/view';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const bvid = url.searchParams.get('bvid');

  if (!bvid || !/^BV[A-Za-z0-9]{10,}$/.test(bvid.toUpperCase())) {
    return new Response(JSON.stringify({ error: '无效的 BVID' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 400,
    });
  }

  try {
    const res = await fetch(`${BILIBILI_API}?bvid=${bvid}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const data = await res.json();

    if (data.code !== 0) {
      return new Response(JSON.stringify({ error: 'B站 API 返回错误', code: data.code, message: data.message }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        status: 400,
      });
    }

    const d = data.data;
    return new Response(JSON.stringify({
      title: d.title || '',
      episodes: d.videos || 0,
      duration: d.duration || 0,
      channel: d.owner?.name || '',
      pages: (d.pages || []).map((p) => ({
        page: p.page,
        part: p.part,
        duration: p.duration,
      })),
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
