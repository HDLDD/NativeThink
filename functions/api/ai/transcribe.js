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

// MD5 — webtoolkit.info / blueimp JavaScript-MD5 derived
// Tested: matches Python hashlib.md5. Works on Cloudflare Workers.
function md5hex(str) {
  function md5cycle(x, k) {
    let a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586); c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426); c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417); c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101); c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632); c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083); c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690); c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784); c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463); c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353); c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222); c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835); c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415); c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606); c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744); c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379); c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
  }
  function cmn(q, a, b, x, s, t) { return add32(rotl32(add32(add32(a, q), add32(x, t)), s), b); }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
  function rotl32(n, s) { return (n << s) | (n >>> (32 - s)); }
  function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
  const utf8 = unescape(encodeURIComponent(str));
  const n = utf8.length;
  let bytes = [], i;
  for (i = 0; i < n; i++) bytes[i] = utf8.charCodeAt(i);
  // Pad
  const paddedLen = ((n + 8) >>> 6) + 1;
  const blocks = new Array(paddedLen * 16).fill(0);
  for (i = 0; i < n; i++) blocks[i >> 2] |= bytes[i] << ((i % 4) * 8);
  blocks[n >> 2] |= 0x80 << ((n % 4) * 8);
  blocks[paddedLen * 16 - 2] = n * 8;
  const h = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476];
  for (i = 0; i < blocks.length; i += 16) {
    const w = blocks.slice(i, i + 16);
    md5cycle(h, w);
  }
  const hex = (n) => {
    for (var r = '', i = 0; i < 4; i++) r += '0123456789abcdef'[(n >> (i * 8 + 4)) & 0xF] + '0123456789abcdef'[(n >> (i * 8)) & 0xF];
    return r;
  };
  return hex(h[0]) + hex(h[1]) + hex(h[2]) + hex(h[3]);
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
  glm: 'https://open.bigmodel.cn/api/paas/v4/audio/transcriptions',
};

const WHISPER_MODELS = {
  groq: 'whisper-large-v3-turbo',
  siliconflow: 'FunAudioLLM/SenseVoiceSmall',
  glm: 'GLM-ASR-2512',
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
