import { withCors, preflight, isPreflight } from '../../_lib/cors.js';
import { checkOrigin, checkRate, trackFactoryUsage } from '../../_lib/guard.js';
/**
 * POST /api/ai/transcribe — 音频转写
 *
 * 两种入口：
 * 1. 影子跟读录音：multipart/form-data，字段 audio（文件）+ provider + apiKey + language
 * 2. B 站字幕：application/json，{ apiKey, provider, bvid, cid, page } 或 { apiKey, provider, audioUrl }
 *
 * 支持的提供商：groq / siliconflow / glm。
 * 返回统一带 **text**（GLM 只回 text，不回 segments）与 segments（有时间戳时）。
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

export async function signWbi(params) {
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

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ASR_PROVIDERS = new Set(Object.keys(WHISPER_ENDPOINTS));

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function extForMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('wav')) return 'wav';
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  return 'webm';
}

export function normalizeTranscript(data) {
  const rawSegments = Array.isArray(data?.segments) ? data.segments : [];
  const segments = rawSegments
    .filter((s) => s && typeof s.text === 'string' && s.text.trim())
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

  let text = '';
  if (typeof data?.text === 'string') text = data.text.trim();
  if (!text && typeof data?.transcript === 'string') text = data.transcript.trim();
  if (!text && Array.isArray(data?.results)) {
    text = data.results.map((r) => r?.text || '').join(' ').trim();
  }
  if (!text && segments.length) text = segments.map((s) => s.en).join(' ').trim();
  return { text, segments };
}

async function readInput(request) {
  const ct = String(request.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('multipart/form-data')) {
    const form = await request.formData();
    const audio = form.get('audio');
    if (!audio || typeof audio.arrayBuffer !== 'function') {
      throw new Error('缺少 audio 音频文件');
    }
    if (audio.size > MAX_UPLOAD_BYTES) {
      throw new Error(`音频过大（${(audio.size / 1024 / 1024).toFixed(1)} MB，上限 ${MAX_UPLOAD_BYTES / 1024 / 1024} MB）`);
    }
    const mime = audio.type || 'audio/webm';
    return {
      kind: 'upload',
      provider: String(form.get('provider') || 'glm').toLowerCase(),
      apiKey: String(form.get('apiKey') || '').trim(),
      language: String(form.get('language') || 'en').slice(0, 8),
      audioBuffer: await audio.arrayBuffer(),
      mime,
      filename: audio.name || `take.${extForMime(mime)}`,
    };
  }
  if (ct.includes('application/json')) {
    const body = await request.json();
    return { kind: 'json', body };
  }
  throw new Error('Content-Type 必须是 application/json 或 multipart/form-data');
}

async function transcribeWithProvider({ provider, apiKey, audioBuffer, mime, filename, language }) {
  const endpoint = WHISPER_ENDPOINTS[provider];
  const model = WHISPER_MODELS[provider];

  const send = async (verbose, withLanguage) => {
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: mime || 'audio/webm' }), filename || `take.${extForMime(mime)}`);
    formData.append('model', model);
    if (verbose) formData.append('response_format', 'verbose_json');
    if (withLanguage) formData.append('language', language || 'en');

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });
    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { /* 非 JSON 错误体 */ }
    return { ok: res.ok, status: res.status, raw, data };
  };

  let out = await send(true, true);
  // 部分 ASR 模型不收 verbose_json / language；只在形状类错误时退一步，鉴权失败不重试
  if (!out.ok && (out.status === 400 || out.status === 422) && provider !== 'groq') {
    out = await send(false, false);
  }
  if (!out.ok) {
    const detail = String(out.raw || '').replace(apiKey, '[REDACTED]').slice(0, 240);
    throw new Error(`${out.status}: ${detail}`);
  }
  return out.data || {};
}

async function handler(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const originCheck = checkOrigin(request);
  if (!originCheck.ok) return json({ error: 'Origin not allowed' }, 403);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRate(ip).ok) return json({ error: 'Too many requests, slow down' }, 429);

  let input;
  try {
    input = await readInput(request);
  } catch (err) {
    return json({ error: err.message, text: '', segments: [] }, 400);
  }

  const isUpload = input.kind === 'upload';
  const body = isUpload ? input : input.body;
  const provider = String(body.provider || (isUpload ? 'glm' : 'groq')).toLowerCase();
  if (!ASR_PROVIDERS.has(provider)) {
    return json({ error: `提供商 ${provider} 不支持语音转写`, text: '', segments: [] }, 400);
  }

  const envKey = env?.[`AI_KEY_${provider.toUpperCase()}`] || env?.SERVER_AI_KEY || '';
  const apiKey = String(body.apiKey || envKey || '').trim();
  if (!apiKey) {
    return json({ error: '未配置语音转写 Key', text: '', segments: [] }, 503);
  }
  if (!body.apiKey && envKey) {
    trackFactoryUsage(request, provider, WHISPER_MODELS[provider]);
  }

  const language = String(body.language || 'en').slice(0, 8);
  const bilibiliCookie = env?.BILIBILI_COOKIE || '';

  try {
    let audioBuffer;
    let mime = 'audio/mpeg';
    let filename = 'audio.mp3';
    let episodeList = [];

    if (isUpload) {
      audioBuffer = body.audioBuffer;
      mime = body.mime;
      filename = body.filename;
    } else {
      // Optional B站 login state — higher-quality audio streams with SESSDATA
      let audioUrl = body.audioUrl;
      const currentPage = body.page || 1;

      if (!audioUrl && body.bvid) {
        const viewRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${body.bvid}`, {
          headers: { 'User-Agent': BILIBILI_UA, 'Referer': 'https://www.bilibili.com/', Cookie: bilibiliCookie },
        });
        const viewData = await viewRes.json();
        if (viewData.code !== 0) throw new Error('B站 API 错误');

        const pages = viewData.data.pages || [];
        const targetPage = pages[currentPage - 1] || pages[0];
        if (!targetPage) throw new Error('未找到分集');

        episodeList = pages.map((p) => ({
          page: p.page, part: p.part || `Episode ${p.page}`, duration: p.duration || 0,
        }));

        const signed = await signWbi({ bvid: body.bvid, cid: String(targetPage.cid), fnval: 16, fnver: 0, fourk: 1 });
        const playUrl = `https://api.bilibili.com/x/player/wbi/playurl?${new URLSearchParams(signed).toString()}`;
        const playRes = await fetch(playUrl, {
          headers: { 'User-Agent': BILIBILI_UA, 'Referer': 'https://www.bilibili.com/', Cookie: bilibiliCookie },
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

      const audioRes = await fetch(audioUrl, {
        headers: { 'User-Agent': BILIBILI_UA, 'Referer': 'https://www.bilibili.com/', Cookie: bilibiliCookie },
      });
      if (!audioRes.ok) throw new Error('下载音频失败');
      audioBuffer = await audioRes.arrayBuffer();
    }

    const data = await transcribeWithProvider({ provider, apiKey, audioBuffer, mime, filename, language });
    const { text, segments } = normalizeTranscript(data);

    return json({
      text,
      segments,
      provider,
      model: WHISPER_MODELS[provider],
      source: 'whisper',
      error: null,
      episodeList,
      totalEpisodes: episodeList.length,
    });
  } catch (err) {
    const message = String(err?.message || '转写失败').replace(apiKey, '[REDACTED]');
    return json({ error: message, text: '', segments: [], source: 'none' }, 502);
  }
}


// ── CORS：Capacitor APK (https://localhost) 跨域 + OPTIONS 预检 ──
export async function onRequest(context) {
  if (isPreflight(context.request)) return preflight();
  return withCors(await handler(context));
}
