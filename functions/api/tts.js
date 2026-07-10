/**
 * Cloudflare Pages Function — Edge-TTS MP3 proxy.
 *
 * GET /api/tts?text=hello+world&rate=0.9
 *
 * Calls Microsoft Edge TTS from Cloudflare's global edge (NOT the user's browser),
 * so it works even when the user's network blocks direct access to Microsoft.
 * Results are cached at the CDN edge — repeated words play in ~10ms.
 */

// Microsoft Edge TTS endpoint
const EDGE_URL =
  'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4';

function rateToEdge(rate) {
  const pct = Math.round((rate - 1.0) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function uid() {
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function buildSSML(text, rate) {
  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  return (
    `X-RequestId:${uid()}\r\n` +
    `Content-Type:application/ssml+xml\r\n` +
    `X-Timestamp:${new Date().toISOString()}Z\r\n` +
    `Path:ssml\r\n\r\n` +
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'>` +
    `<voice name='en-US-AriaNeural'><prosody rate='${rateToEdge(rate)}' pitch='+0Hz'>${safe}</prosody></voice>` +
    `</speak>`
  );
}

/**
 * Parse Edge TTS binary stream — extract pure MP3 audio.
 * Edge TTS sends binary frames: [2-byte header-len (BE)] [header-json] [audio-bytes]
 * We strip headers and concatenate only the audio bytes.
 */
function extractAudio(buffer) {
  const parts = [];
  let offset = 0;
  const view = new Uint8Array(buffer);

  while (offset < view.length - 2) {
    const headerLen = ((view[offset] << 8) | view[offset + 1]);
    offset += 2;

    if (offset + headerLen > view.length) break;

    // Skip the header text
    const headerText = new TextDecoder().decode(view.subarray(offset, offset + headerLen));
    offset += headerLen;

    // Check if there's a Path:audio marker (implicit — audio data follows after any header)
    // The audio data runs until the next header marker, but we handle it frame-by-frame.
    // Actually, after reading the header, all remaining data until the next header is audio.
    // But the Edge protocol sends audio as separate frames too. Let's just find the next
    // header boundary.

    // Find next header start (next 2-byte header-len followed by valid path)
    let nextHeader = -1;
    for (let i = offset; i < view.length - 1; i++) {
      const candidateLen = ((view[i] << 8) | view[i + 1]);
      // Valid header length is typically 20-200 bytes, and must be followed by "Path:"
      if (candidateLen >= 10 && candidateLen <= 300 && i + 2 + candidateLen <= view.length) {
        const candidateText = new TextDecoder().decode(view.subarray(i + 2, i + 2 + Math.min(candidateLen, 60)));
        if (candidateText.startsWith('Path:')) {
          nextHeader = i;
          break;
        }
      }
    }

    if (nextHeader === -1) {
      // No more headers — rest is audio
      parts.push(view.subarray(offset));
      break;
    } else {
      if (nextHeader > offset) {
        parts.push(view.subarray(offset, nextHeader));
      }
      offset = nextHeader;
    }
  }

  return new Uint8Array(
    parts.reduce((acc, p) => acc + p.length, 0)
  );
  // Merge parts
  const merged = new Uint8Array(parts.reduce((acc, p) => acc + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    merged.set(p, pos);
    pos += p.length;
  }
  return merged;
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const text = url.searchParams.get('text');
  const rate = parseFloat(url.searchParams.get('rate')) || 1.0;

  if (!text || text.trim().length === 0) {
    return new Response('Missing text', { status: 400 });
  }
  if (text.length > 500) {
    return new Response('Text too long', { status: 400 });
  }

  const trimmed = text.trim();
  const effectiveRate = Math.min(1.5, Math.max(0.5, rate));

  // Check CDN cache first
  const cache = caches.default;
  const cacheKey = new Request(
    `https://tts-cache.local/${encodeURIComponent(trimmed.toLowerCase())}|${effectiveRate.toFixed(2)}`,
  );
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const resp = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      },
      body: buildSSML(trimmed, effectiveRate),
    });

    if (!resp.ok) {
      return new Response(`Upstream TTS error: ${resp.status}`, { status: 502 });
    }

    const rawBuffer = await resp.arrayBuffer();
    const audioData = extractAudio(rawBuffer);

    if (audioData.length === 0) {
      return new Response('Empty audio from upstream', { status: 502 });
    }

    const mp3 = new Response(audioData, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'CDN-Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });

    // Store in CDN edge cache for instant replay
    context.waitUntil(cache.put(cacheKey, mp3.clone()));

    return mp3;
  } catch (err) {
    return new Response(`TTS error: ${err.message}`, { status: 500 });
  }
}
