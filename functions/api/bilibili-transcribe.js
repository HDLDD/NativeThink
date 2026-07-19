/**
 * Cloudflare Pages Function — B站音频转写字幕
 *
 * GET /api/bilibili-transcribe?bvid=BV1xxx&cid=123456&page=1
 *
 * 流程：
 * 1. WBI 签名 → 获取音频 URL（同 bilibili-rag 方式）
 * 2. 下载音频 → 调用 OpenAI Whisper API
 * 3. 返回带时间戳的字幕分段
 *
 * 需要环境变量：
 * - OPENAI_API_KEY: OpenAI 兼容的 API Key（Whisper 模型）
 * - OPENAI_BASE_URL: OpenAI 兼容的基础 URL（可选，默认 https://api.openai.com/v1）
 */

const BILIBILI_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

// ── MD5 (pure JS, Cloudflare Workers compatible) ──

function md5(str) {
  const rotateLeft = (x, n) => (x << n) | (x >>> (32 - n));
  const add32 = (a, b) => (a + b) >>> 0;
  const toHex = (n) => {
    let h = '';
    for (let i = 0; i < 4; i++) {
      h += '0123456789abcdef'[(n >> (i * 8 + 4)) & 0x0F] + '0123456789abcdef'[(n >> (i * 8)) & 0x0F];
    }
    return h;
  };

  const blocks = [];
  const len = str.length * 8;
  for (let i = 0; i < str.length; i += 64) {
    const block = [];
    for (let j = 0; j < 16; j++) {
      let w = 0;
      for (let k = 0; k < 4; k++) {
        const idx = i + j * 4 + k;
        w |= (idx < str.length ? str.charCodeAt(idx) : 0) << (k * 8);
      }
      blocks.push(w >>> 0);
    }
  }

  // Padding
  const totalLen = str.length;
  const paddedLen = (((totalLen + 8) >>> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLen);
  for (let i = 0; i < totalLen; i++) padded[i] = str.charCodeAt(i);
  padded[totalLen] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(paddedLen - 8, len, true);

  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476;

  for (let i = 0; i < paddedLen; i += 64) {
    const w = [];
    for (let j = 0; j < 16; j++) w.push(dv.getUint32(i + j * 4, true));

    let a = h0, b = h1, c = h2, d = h3;

    const F = (x, y, z) => (x & y) | (~x & z);
    const G = (x, y, z) => (x & z) | (y & ~z);
    const H = (x, y, z) => x ^ y ^ z;
    const I = (x, y, z) => y ^ (x | ~z);

    const R = (a, b, c, d, k, s, t, f) => {
      a = add32(a, add32(add32(f(b, c, d), w[k]), t));
      a = add32(rotateLeft(a, s), b);
      return a >>> 0;
    };

    // Round 1
    for (let j = 0; j < 16; j++) {
      const s = [7, 12, 17, 22][j % 4];
      a = R(a, b, c, d, j, s, 0xd76aa478 + j * 0x10000, F);
      [a, b, c, d] = [d, a, b, c];
    }
    // Round 2
    for (let j = 0; j < 16; j++) {
      const k = (1 + j * 5) % 16;
      const s = [5, 9, 14, 20][j % 4];
      a = R(a, b, c, d, k, s, 0xf8e6a000 - j * 0x10000, G);
      [a, b, c, d] = [d, a, b, c];
    }
    // Round 3
    for (let j = 0; j < 16; j++) {
      const k = (5 + j * 3) % 16;
      const s = [4, 11, 16, 23][j % 4];
      a = R(a, b, c, d, k, s, 0x6fa87000 + j * 0x10000, H);
      [a, b, c, d] = [d, a, b, c];
    }
    // Round 4
    for (let j = 0; j < 16; j++) {
      const k = (j * 7) % 16;
      const s = [6, 10, 15, 21][j % 4];
      a = R(a, b, c, d, k, s, 0x50a3c000 - j * 0x10000, I);
      [a, b, c, d] = [d, a, b, c];
    }

    h0 = add32(h0, a) >>> 0;
    h1 = add32(h1, b) >>> 0;
    h2 = add32(h2, c) >>> 0;
    h3 = add32(h3, d) >>> 0;
  }

  return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3);
}

// ── WBI 签名（参照 bilibili-rag）──

async function wbiSign(params) {
  // Get WBI keys
  const navRes = await fetch('https://api.bilibili.com/x/web-interface/nav', {
    headers: { 'User-Agent': BILIBILI_UA, 'Referer': 'https://www.bilibili.com/' },
  });
  const navData = await navRes.json();
  const wbiImg = navData?.data?.wbi_img;
  if (!wbiImg) return params;

  const imgKey = wbiImg.img_url.split('/').pop().split('.')[0];
  const subKey = wbiImg.sub_url.split('/').pop().split('.')[0];
  const mixinKey = MIXIN_KEY_ENC_TAB.slice(0, 32).map((i) => (imgKey + subKey)[i]).join('');

  // Filter params (remove special chars)
  const filtered = {};
  for (const [k, v] of Object.entries(params)) {
    filtered[k] = String(v).replace(/[!'()*]/g, '');
  }

  filtered.wts = Math.floor(Date.now() / 1000);

  // Sort keys
  const sorted = Object.keys(filtered).sort();
  const query = sorted.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(filtered[k])}`).join('&');

  filtered.w_rid = md5(query + mixinKey);
  return filtered;
}

// ── Handler ──

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const bvid = (url.searchParams.get('bvid') || '').trim().toUpperCase();
  const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;

  if (!/^BV[A-Za-z0-9]{10,}$/.test(bvid)) {
    return new Response(JSON.stringify({ error: '无效的 BVID' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 400,
    });
  }

  // Check API key
  const apiKey = env.OPENAI_API_KEY || context?.OPENAI_API_KEY;
  const apiBase = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');

  if (!apiKey) {
    return new Response(JSON.stringify({ error: '未配置 OPENAI_API_KEY', segments: [], source: 'none' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    // Step 1: Get video info + CID
    const viewRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
      headers: { 'User-Agent': BILIBILI_UA, 'Referer': 'https://www.bilibili.com/' },
    });
    const viewData = await viewRes.json();
    if (viewData.code !== 0) throw new Error('B站 API 错误: ' + viewData.message);

    const pages = viewData.data.pages || [];
    const targetPage = pages[page - 1] || pages[0];
    if (!targetPage) throw new Error('未找到该分集');
    const cid = targetPage.cid;

    const episodeList = pages.map((p) => ({
      page: p.page, part: p.part || `Episode ${p.page}`, duration: p.duration || 0,
    }));

    // Step 2: Get audio URL (WBI signed)
    const signedParams = await wbiSign({ bvid, cid: String(cid), fnval: 16, fnver: 0, fourk: 1 });
    const playUrl = `https://api.bilibili.com/x/player/wbi/playurl?${new URLSearchParams(signedParams).toString()}`;
    const playRes = await fetch(playUrl, {
      headers: { 'User-Agent': BILIBILI_UA, 'Referer': 'https://www.bilibili.com/' },
    });
    const playData = await playRes.json();
    if (playData.code !== 0) throw new Error('获取音频失败');

    const dash = playData?.data?.dash || {};
    const audioList = dash.audio || [];
    if (audioList.length === 0) throw new Error('未找到音频流');

    // Pick highest quality under 64kbps
    const best = audioList.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))
      .find((a) => (a.bandwidth || 0) <= 64000) || audioList[0];
    const audioUrl = best.baseUrl || best.base_url || best.url || '';

    if (!audioUrl) throw new Error('音频 URL 为空');

    // Step 3: Download audio and send to Whisper
    const audioRes = await fetch(audioUrl, {
      headers: { 'User-Agent': BILIBILI_UA, 'Referer': 'https://www.bilibili.com/' },
    });
    if (!audioRes.ok) throw new Error('下载音频失败');

    const audioBuffer = await audioRes.arrayBuffer();

    // Step 4: Call Whisper API
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    formData.append('file', blob, 'audio.mp3');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('language', 'en');

    const whisperRes = await fetch(`${apiBase}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      throw new Error(`Whisper API 错误: ${whisperRes.status} ${errText.slice(0, 200)}`);
    }

    const whisperData = await whisperRes.json();

    // Step 5: Parse segments
    const whisperSegments = whisperData.segments || [];
    const segments = whisperSegments
      .filter((s) => s.text && s.text.trim())
      .map((s) => {
        const text = s.text.trim();
        const words = text.split(/\s+/).filter(Boolean);
        const keywords = [];
        const seen = new Set();
        for (const w of words) {
          const clean = w.replace(/[^a-zA-Z]/g, '').toLowerCase();
          if (clean.length > 4 && !seen.has(clean) && keywords.length < 4) {
            seen.add(clean);
            keywords.push({ word: clean, meaning: '' });
          }
        }
        return {
          start: s.start || 0,
          end: s.end || 0,
          en: text,
          zh: '',
          keywords,
        };
      });

    return new Response(JSON.stringify({
      bvid, page, cid,
      part: targetPage.part || '',
      segments,
      source: 'whisper',
      error: null,
      totalEpisodes: pages.length,
      episodeList,
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message,
      segments: [],
      source: 'none',
      bvid, page,
      episodeList: [],
      totalEpisodes: 0,
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
