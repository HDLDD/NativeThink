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

function md5hex(str) {
  // Simple portable MD5 for WBI signing
  let h = 0x67452301, g = 0xEFCDAB89, f = 0x98BADCFE, e = 0x10325476;
  const words = [];
  for (let i = 0; i < str.length; i++) words.push(str.charCodeAt(i));
  words.push(0x80);
  while (words.length % 16 != 14) words.push(0);
  words.push(Math.floor(str.length * 8 / 0x100000000));
  words.push(str.length * 8 & 0xFFFFFFFF);
  for (let j = 0; j < words.length; j += 16) {
    const w = words.slice(j, j + 16);
    let a = h, b = g, c = f, d = e;
    for (let k = 0; k < 64; k++) {
      let t, i = Math.floor(k / 16);
      if (i == 0) t = (b & c) | (~b & d);
      else if (i == 1) t = (d & b) | (~d & c);
      else if (i == 2) t = b ^ c ^ d;
      else t = c ^ (b | ~d);
      const idx = i == 0 ? k : i == 1 ? (1 + k * 5) % 16 : i == 2 ? (5 + k * 3) % 16 : (k * 7) % 16;
      const s = [[7,12,17,22],[5,9,14,20],[4,11,16,23],[6,10,15,21]][i][k % 4];
      const K = Math.floor(Math.abs(Math.sin(k + 1)) * 0x100000000);
      const tmp = d;
      d = c; c = b; b = ((a + t + w[idx] + K) << s | (a + t + w[idx] + K) >>> (32 - s)) + b >>> 0;
      a = tmp;
    }
    h = h + a >>> 0; g = g + b >>> 0; f = f + c >>> 0; e = e + d >>> 0;
  }
  return [h, g, f, e].map((n) => ('00000000' + (n >>> 0).toString(16)).slice(-8)).join('');
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
