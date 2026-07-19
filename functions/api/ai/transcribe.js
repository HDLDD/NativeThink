/**
 * POST /api/ai/transcribe — 音频转写字幕
 *
 * 使用 AI 提供商的 Whisper 兼容 API 将 B站音频转为字幕。
 * 支持的提供商：groq, siliconflow
 *
 * Body: { apiKey, provider, bvid, cid, page }
 * 或 { apiKey, provider, audioUrl }
 *
 * 流程：
 * 1. 获取 B站音频 URL（WBI 签名）
 * 2. 下载音频
 * 3. 调用 Whisper API 转写
 * 4. 返回字幕分段
 */

const BILIBILI_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ── WBI 签名 ──

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

// MD5 implementation adapted from webtoolkit.info / PHP.js
// Correct, portable, works on Cloudflare Workers
function md5hex(str) {
  const utf8 = unescape(encodeURIComponent(str));
  const x = [];
  let k, l;
  for (k = 0; k < utf8.length; k++) {
    x[k >> 2] = (x[k >> 2] || 0) | ((utf8.charCodeAt(k) & 0xFF) << ((k % 4) * 8));
  }
  const len = utf8.length * 8;
  x[k >> 2] = (x[k >> 2] || 0) | (0x80 << ((k % 4) * 8));
  x[(((k + 8) >> 6) << 4) + 14] = len;
  const add32 = (a, b) => (a + b) >>> 0;
  const rotl32 = (x, n) => (x << n) | (x >>> (32 - n));
  const F = (x, y, z) => (x & y) | (~x & z);
  const G = (x, y, z) => (x & z) | (y & ~z);
  const H = (x, y, z) => x ^ y ^ z;
  const I = (x, y, z) => y ^ (x | ~z);
  const FF = (a, b, c, d, x, s, ac) => add32(rotl32(add32(add32(add32(a, F(b, c, d)), x), ac), s), b);
  const GG = (a, b, c, d, x, s, ac) => add32(rotl32(add32(add32(add32(a, G(b, c, d)), x), ac), s), b);
  const HH = (a, b, c, d, x, s, ac) => add32(rotl32(add32(add32(add32(a, H(b, c, d)), x), ac), s), b);
  const II = (a, b, c, d, x, s, ac) => add32(rotl32(add32(add32(add32(a, I(b, c, d)), x), ac), s), b);
  let a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
  for (let i = 0; i < x.length; i += 16) {
    const w = x.slice(i, i + 16);
    let aa = a, bb = b, cc = c, dd = d;
    let j;
    for (j = 0; j < 16; j++) a = FF(a, b, c, d, w[j], 7 + (j % 4 == 3 ? 5 : j % 4 == 1 ? 5 : 5), 0xd76aa478 + j * 0x10000);
    // Actually implement the 4 rounds properly:
    [a,b,c,d] = [aa,bb,cc,dd]; // reset
    a = FF(a,b,c,d,w[0],7,0xd76aa478); d = FF(d,a,b,c,w[1],12,0xe8c7b756); c = FF(c,d,a,b,w[2],17,0x242070db); b = FF(b,c,d,a,w[3],22,0xc1bdceee);
    a = FF(a,b,c,d,w[4],7,0xf57c0faf); d = FF(d,a,b,c,w[5],12,0x4787c62a); c = FF(c,d,a,b,w[6],17,0xa8304613); b = FF(b,c,d,a,w[7],22,0xfd469501);
    a = FF(a,b,c,d,w[8],7,0x698098d8); d = FF(d,a,b,c,w[9],12,0x8b44f7af); c = FF(c,d,a,b,w[10],17,0xffff5bb1); b = FF(b,c,d,a,w[11],22,0x895cd7be);
    a = FF(a,b,c,d,w[12],7,0x6b901122); d = FF(d,a,b,c,w[13],12,0xfd987193); c = FF(c,d,a,b,w[14],17,0xa679438e); b = FF(b,c,d,a,w[15],22,0x49b40821);
    a = GG(a,b,c,d,w[1],5,0xf61e2562); d = GG(d,a,b,c,w[6],9,0xc040b340); c = GG(c,d,a,b,w[11],14,0x265e5a51); b = GG(b,c,d,a,w[0],20,0xe9b6c7aa);
    a = GG(a,b,c,d,w[5],5,0xd62f105d); d = GG(d,a,b,c,w[10],9,0x02441453); c = GG(c,d,a,b,w[15],14,0xd8a1e681); b = GG(b,c,d,a,w[4],20,0xe7d3fbc8);
    a = GG(a,b,c,d,w[9],5,0x21e1cde6); d = GG(d,a,b,c,w[14],9,0xc33707d6); c = GG(c,d,a,b,w[3],14,0xf4d50d87); b = GG(b,c,d,a,w[8],20,0x455a14ed);
    a = GG(a,b,c,d,w[13],5,0xa9e3e905); d = GG(d,a,b,c,w[2],9,0xfcefa3f8); c = GG(c,d,a,b,w[7],14,0x676f02d9); b = GG(b,c,d,a,w[12],20,0x8d2a4c8a);
    a = HH(a,b,c,d,w[5],4,0xfffa3942); d = HH(d,a,b,c,w[8],11,0x8771f681); c = HH(c,d,a,b,w[11],16,0x6d9d6122); b = HH(b,c,d,a,w[14],23,0xfde5380c);
    a = HH(a,b,c,d,w[1],4,0xa4beea44); d = HH(d,a,b,c,w[4],11,0x4bdecfa9); c = HH(c,d,a,b,w[7],16,0xf6bb4b60); b = HH(b,c,d,a,w[10],23,0xbebfbc70);
    a = HH(a,b,c,d,w[13],4,0x289b7ec6); d = HH(d,a,b,c,w[0],11,0xeaa127fa); c = HH(c,d,a,b,w[3],16,0xd4ef3085); b = HH(b,c,d,a,w[6],23,0x04881d05);
    a = HH(a,b,c,d,w[9],4,0xd9d4d039); d = HH(d,a,b,c,w[12],11,0xe6db99e5); c = HH(c,d,a,b,w[15],16,0x1fa27cf8); b = HH(b,c,d,a,w[2],23,0xc4ac5665);
    a = II(a,b,c,d,w[0],6,0xf4292244); d = II(d,a,b,c,w[7],10,0x432aff97); c = II(c,d,a,b,w[14],15,0xab9423a7); b = II(b,c,d,a,w[5],21,0xfc93a039);
    a = II(a,b,c,d,w[12],6,0x655b59c3); d = II(d,a,b,c,w[3],10,0x8f0ccc92); c = II(c,d,a,b,w[10],15,0xffeff47d); b = II(b,c,d,a,w[1],21,0x85845dd1);
    a = II(a,b,c,d,w[8],6,0x6fa87e4f); d = II(d,a,b,c,w[15],10,0xfe2ce6e0); c = II(c,d,a,b,w[6],15,0xa3014314); b = II(b,c,d,a,w[13],21,0x4e0811a1);
    a = II(a,b,c,d,w[4],6,0xf7537e82); d = II(d,a,b,c,w[11],10,0xbd3af235); c = II(c,d,a,b,w[2],15,0x2ad7d2bb); b = II(b,c,d,a,w[9],21,0xeb86d391);
    a = add32(a, aa); b = add32(b, bb); c = add32(c, cc); d = add32(d, dd);
  }
  const hex = (n) => ('00000000' + (n >>> 0).toString(16)).slice(-8);
  return hex(a) + hex(b) + hex(c) + hex(d);
}

function getMixinKey(imgKey, subKey) {
  let mixin = '';
  for (const i of MIXIN_KEY_ENC_TAB.slice(0, 32)) mixin += (imgKey + subKey)[i];
  return mixin;
}

async function signWbi(params) {
  const navRes = await fetch('https://api.bilibili.com/x/web-interface/nav', {
    headers: { 'User-Agent': BILIBILI_UA, 'Referer': 'https://www.bilibili.com/' },
  });
  const navData = await navRes.json();
  const w = navData?.data?.wbi_img;
  if (!w) return params;

  const ik = w.img_url.split('/').pop().split('.')[0];
  const sk = w.sub_url.split('/').pop().split('.')[0];
  const mixinKey = getMixinKey(ik, sk);

  const filtered = {};
  for (const [k, v] of Object.entries(params)) {
    filtered[k] = String(v).replace(/[!'()*]/g, '');
  }
  filtered.wts = Math.floor(Date.now() / 1000);
  const sorted = Object.keys(filtered).sort();
  const query = sorted.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(filtered[k])}`).join('&');
  filtered.w_rid = md5hex(query + mixinKey);
  return filtered;
}

// ── Provider Whisper endpoints ──

const WHISPER_ENDPOINTS = {
  groq: 'https://api.groq.com/openai/v1/audio/transcriptions',
  siliconflow: 'https://api.siliconflow.cn/v1/audio/transcriptions',
  // Qwen/DashScope uses their own ASR SDK, not OpenAI-compatible
};

const WHISPER_MODELS = {
  groq: 'whisper-large-v3-turbo',
  siliconflow: 'FunAudioLLM/SenseVoiceSmall',
};

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { apiKey, provider, bvid, audioUrl: providedUrl } = body;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: '未提供 API Key', segments: [] }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const prov = provider || 'groq';
  const whEndpoint = WHISPER_ENDPOINTS[prov];
  const whModel = WHISPER_MODELS[prov];

  if (!whEndpoint) {
    return new Response(JSON.stringify({ error: `提供商 ${prov} 不支持语音转写`, segments: [] }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    // Step 1: Get audio URL (from bvid or provided)
    let audioUrl = providedUrl;
    let episodeList = [];
    let currentPage = body.page || 1;

    if (!audioUrl && bvid) {
      const viewRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
        headers: { 'User-Agent': BILIBILI_UA, 'Referer': 'https://www.bilibili.com/' },
      });
      const viewData = await viewRes.json();
      if (viewData.code !== 0) throw new Error('B站 API 错误');

      const pages = viewData.data.pages || [];
      const targetPage = pages[currentPage - 1] || pages[0];
      if (!targetPage) throw new Error('未找到分集');

      episodeList = pages.map((p) => ({
        page: p.page, part: p.part || `Episode ${p.page}`, duration: p.duration || 0,
      }));

      const signed = await signWbi({ bvid, cid: String(targetPage.cid), fnval: 16, fnver: 0, fourk: 1 });
      const playUrl = `https://api.bilibili.com/x/player/wbi/playurl?${new URLSearchParams(signed).toString()}`;
      const playRes = await fetch(playUrl, {
        headers: { 'User-Agent': BILIBILI_UA, 'Referer': 'https://www.bilibili.com/' },
      });
      const playData = await playRes.json();
      const audioList = playData?.data?.dash?.audio || [];
      if (audioList.length === 0) throw new Error('未找到音频流');

      const best = audioList
        .filter((a) => a.bandwidth > 0)
        .sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))
        .find((a) => (a.bandwidth || 0) <= 64000) || audioList[0];
      audioUrl = best.baseUrl || best.base_url || best.url;
    }

    if (!audioUrl) throw new Error('无法获取音频 URL');

    // Step 2: Download audio
    const audioRes = await fetch(audioUrl, {
      headers: { 'User-Agent': BILIBILI_UA, 'Referer': 'https://www.bilibili.com/' },
    });
    if (!audioRes.ok) throw new Error('下载音频失败');

    const audioBuffer = await audioRes.arrayBuffer();

    // Step 3: Call Whisper API
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'audio.mp3');
    formData.append('model', whModel);
    formData.append('response_format', 'verbose_json');
    formData.append('language', 'en');

    const whRes = await fetch(whEndpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!whRes.ok) {
      const err = await whRes.text();
      throw new Error(`${whRes.status}: ${err.slice(0, 200)}`);
    }

    const data = await whRes.json();

    // Step 4: Parse into segments
    const rawSegments = data.segments || [];
    const segments = rawSegments
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
        return { start: s.start || 0, end: s.end || 0, en: text, zh: '', keywords };
      });

    return new Response(JSON.stringify({
      segments,
      source: 'whisper',
      error: null,
      episodeList,
      totalEpisodes: episodeList.length,
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message,
      segments: [],
      source: 'none',
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
