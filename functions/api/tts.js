/**
 * Cloudflare Pages Function — Edge-TTS MP3 endpoint
 *
 * Accepts: GET /api/tts?text=hello+world&voice=en-US-AriaNeural&rate=0.9
 * Returns: audio/mpeg MP3 stream (cached at CDN edge for instant replay)
 *
 * Uses Microsoft Edge TTS (free, no API key required).
 * Cloudflare CDN caching: repeated words served from edge cache (~10ms).
 */

// Microsoft Edge TTS endpoint
const EDGE_TTS_URL =
  'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4';

// Best American English neural voices
const DEFAULT_VOICE = 'en-US-AriaNeural';   // Female
const ALT_VOICE = 'en-US-GuyNeural';        // Male

// Map our app's rate (0.5-1.5) to SSML prosody rate percentage
function ssmlRate(rate) {
  const pct = Math.round((rate - 1.0) * 100);
  if (pct === 0) return 'medium';
  if (pct > 0) return `+${pct}%`;
  return `${pct}%`;
}

function buildSSML(text, voice, rate) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
  <voice name="${voice}">
    <prosody rate="${ssmlRate(rate)}" pitch="+0Hz">
      ${escaped}
    </prosody>
  </voice>
</speak>`;
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const text = url.searchParams.get('text');
  const voice = url.searchParams.get('voice') || DEFAULT_VOICE;
  const rate = parseFloat(url.searchParams.get('rate')) || 1.0;

  // Validate
  if (!text || text.trim().length === 0) {
    return new Response('Missing text parameter', { status: 400 });
  }
  if (text.length > 600) {
    return new Response('Text too long (max 600 chars)', { status: 400 });
  }

  // Build cache key from parameters — same input → same cached response
  const cacheKey = `${text.trim().toLowerCase()}|${voice}|${rate.toFixed(2)}`;
  const cache = caches.default;

  // Check Cloudflare cache
  const cached = await cache.match(new Request(`https://tts-cache.local/${encodeURIComponent(cacheKey)}`));
  if (cached) {
    return cached;
  }

  const ssml = buildSSML(text.trim(), voice, Math.min(1.5, Math.max(0.5, rate)));

  try {
    const response = await fetch(EDGE_TTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: ssml,
    });

    if (!response.ok) {
      // Try alternate voice
      const retry = await fetch(EDGE_TTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body: buildSSML(text.trim(), ALT_VOICE, Math.min(1.5, Math.max(0.5, rate))),
      });

      if (!retry.ok) {
        return new Response(`TTS API error: ${retry.status}`, { status: 502 });
      }

      const mp3 = new Response(retry.body, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'CDN-Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*',
        },
      });

      context.waitUntil(cache.put(
        new Request(`https://tts-cache.local/${encodeURIComponent(cacheKey)}`),
        mp3.clone(),
      ));

      return mp3;
    }

    const mp3 = new Response(response.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'CDN-Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });

    // Cache at CDN edge for instant replay
    context.waitUntil(cache.put(
      new Request(`https://tts-cache.local/${encodeURIComponent(cacheKey)}`),
      mp3.clone(),
    ));

    return mp3;
  } catch (err) {
    return new Response(`TTS error: ${err.message}`, { status: 500 });
  }
}
