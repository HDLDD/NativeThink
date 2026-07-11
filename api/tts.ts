/** TTS proxy — Google Translate TTS via Vercel Edge Function */

export const config = { runtime: 'edge' };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const text = url.searchParams.get('text');
  const lang = url.searchParams.get('lang') || 'en';

  if (!text?.trim()) return new Response('Missing text', { status: 400 });
  if (text.length > 400) return new Response('Text too long', { status: 400 });

  const upstream = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(text.trim())}`;

  try {
    const resp = await fetch(upstream, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36' },
    });
    if (!resp.ok) return new Response(`Upstream: ${resp.status}`, { status: 502 });
    return new Response(resp.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}
