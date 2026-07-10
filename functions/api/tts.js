/**
 * Cloudflare Pages Function — TTS MP3 proxy.
 *
 * GET /api/tts?text=hello+world&rate=0.9
 *
 * Proxies Google Translate TTS from Cloudflare's global edge.
 * The user's browser never talks to Google directly — Cloudflare does —
 * so this works everywhere including mainland China.
 *
 * Responses are cached at CDN edge. First play of each word calls upstream;
 * every subsequent play of the same word is instant (~10ms from edge cache).
 */

const GOOGLE_TTS = 'https://translate.google.com/translate_tts';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const text = url.searchParams.get('text');
  const lang = url.searchParams.get('lang') || 'en';

  // Validate
  if (!text || text.trim().length === 0) {
    return new Response('Missing "text" parameter', { status: 400 });
  }
  if (text.length > 400) {
    return new Response('Text too long (max 400 chars). Split longer text into chunks.', { status: 400 });
  }

  const trimmed = text.trim();
  const upstream = `${GOOGLE_TTS}?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(trimmed)}`;

  try {
    const upstreamResp = await fetch(upstream, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      },
    });

    if (!upstreamResp.ok) {
      return new Response(`Upstream returned ${upstreamResp.status}`, { status: 502 });
    }

    // Google TTS returns clean audio/mpeg — no binary parsing needed.
    // Cache at CDN edge for one year (immutable — same text always produces same audio).
    return new Response(upstreamResp.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'CDN-Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(`TTS proxy error: ${err.message}`, { status: 500 });
  }
}
