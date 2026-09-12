/**
 * NativeThink local API server (for the Electron desktop build).
 *
 * - Serves the built SPA from dist/client (with history-API fallback)
 * - Adapts functions/api/** (Cloudflare Pages Functions) to plain Node http,
 *   so the exact same backend code runs locally with zero network dependency
 * - Emulates the Cloudflare KV binding with a JSON file store
 *
 * Zero third-party dependencies except `jose` (already a runtime dep).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BILIBILI_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// 跨域隔离 → SharedArrayBuffer/多线程 WASM（离线小模型加载与推理提速数倍）
// credentialless 允许跨域图片/音频继续加载（Chromium），不支持的头会被忽略（降级单线程）
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

/** JSON-file emulation of the Cloudflare KV binding (get/put/delete/list) */
class LocalKV {
  constructor(file) {
    this.file = file;
    this.data = {};
    try {
      this.data = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
    } catch { /* first run */ }
    this._saveTimer = null;
  }
  _save() {
    // Debounce writes — sync endpoints can burst
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify(this.data));
      } catch { /* disk full / readonly — ignore */ }
    }, 200);
  }
  flush() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data));
    } catch { /* ignore */ }
  }
  async get(key, type) {
    const v = this.data[key];
    if (v === undefined) return null;
    if (type === 'json') { try { return JSON.parse(v); } catch { return null; } }
    return v;
  }
  async put(key, value) { this.data[key] = value; this._save(); }
  async delete(key) { delete this.data[key]; this._save(); }
  async list({ prefix = '' } = {}) {
    const keys = Object.keys(this.data)
      .filter((k) => k.startsWith(prefix))
      .map((name) => ({ name }));
    return { keys, list_complete: true, cursor: undefined };
  }
}

/** Route table: URL path → Pages Function module (relative to functionsDir) */
const ROUTES = {
  '/api/ai/chat': 'api/ai/chat.js',
  '/api/ai/passage': 'api/ai/passage.js',
  '/api/ai/transcribe': 'api/ai/transcribe.js',
  '/api/auth/login': 'api/auth/login.js',
  '/api/auth/register': 'api/auth/register.js',
  '/api/auth/me': 'api/auth/me.js',
  '/api/data/sync': 'api/data/sync.js',
  '/api/feedback/submit': 'api/feedback/submit.js',
  '/api/tts': 'api/tts.js',
  '/api/wikipedia': 'api/wikipedia.js',
  '/api/word-image': 'api/word-image.js',
};

function ensureJwtSecret(dataDir) {
  const secretFile = path.join(dataDir, 'jwt-secret.txt');
  try {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing) return existing;
  } catch { /* generate */ }
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  } catch { /* ignore */ }
  return secret;
}

function loadServerConfig(dataDir) {
  // Optional user-provided server keys (mirror of the Cloudflare env vars)
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, 'server-config.json'), 'utf8')) || {};
  } catch { return {}; }
}

/**
 * Start the local server.
 * @param {{ port?: number, distDir: string, functionsDir: string, dataDir: string, proxy?: string | null }} opts
 * @returns {Promise<import('node:http').Server>}
 */
export async function startServer(opts) {
  const {
    port = 31745,
    distDir,
    functionsDir,
    dataDir,
    proxy = null,
  } = opts;

  fs.mkdirSync(dataDir, { recursive: true });

  // Route outbound fetch through the user's system proxy when available
  // (needed for Wikipedia / Google TTS behind restrictive networks).
  if (proxy) {
    try {
      const undici = await import('undici');
      undici.setGlobalDispatcher(new undici.ProxyAgent(proxy));
      console.log(`[NativeThink] outbound requests via proxy ${proxy}`);
    } catch (err) {
      console.warn('[NativeThink] proxy setup failed, using direct connection:', err.message);
    }
  }

  const kv = new LocalKV(path.join(dataDir, 'kv.json'));
  const fileConfig = loadServerConfig(dataDir);
  const env = {
    KV: kv,
    JWT_SECRET: ensureJwtSecret(dataDir),
    // Server-side AI keys: process env first, then dataDir/server-config.json
    SERVER_AI_KEY: process.env.SERVER_AI_KEY || fileConfig.SERVER_AI_KEY,
    FEISHU_WEBHOOK_URL: process.env.FEISHU_WEBHOOK_URL || fileConfig.FEISHU_WEBHOOK_URL,
    // B站登录态（SESSDATA）— 解锁 B站 AI 字幕与高清播放
    BILIBILI_COOKIE: fileConfig.bilibiliSessdata ? `SESSDATA=${fileConfig.bilibiliSessdata}` : undefined,
  };
  for (const p of ['deepseek', 'doubao', 'qwen', 'glm', 'siliconflow', 'moonshot', 'groq']) {
    const k = `AI_KEY_${p.toUpperCase()}`;
    env[k] = process.env[k] || fileConfig[k];
  }

  // Pre-import all route modules (they are plain ESM)
  const routeModules = new Map();
  for (const [route, rel] of Object.entries(ROUTES)) {
    try {
      const mod = import(`${pathToFileUrl(path.join(functionsDir, rel))}`);
      routeModules.set(route, mod); // store promise — lazy await on first use
    } catch { /* missing function — route will 404 */ }
  }

  function pathToFileUrl(p) {
    return 'file:///' + p.replace(/\\/g, '/').replace(/ /g, '%20');
  }

  function serveStatic(req, res, pathname) {
    let rel = decodeURIComponent(pathname);
    if (rel === '/') rel = '/index.html';
    const filePath = path.join(distDir, rel);
    // Prevent path traversal
    if (!filePath.startsWith(distDir)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.stat(filePath, (err, stat) => {
      let finalPath = filePath;
      if (err || !stat.isFile()) {
        // SPA fallback — client router handles unknown paths
        finalPath = path.join(distDir, 'index.html');
      }
      fs.readFile(finalPath, (err2, buf) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
          return;
        }
        const ext = path.extname(finalPath).toLowerCase();
        // Hashed assets are immutable → cache for a year; HTML revalidates
        const isHashed = /-[A-Za-z0-9_-]{8,}\./.test(path.basename(finalPath));
        const cacheControl = ext === '.html'
          ? 'no-cache'
          : isHashed
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600';
        // Compress text assets when the client supports gzip (JS/CSS/SVG/JSON
        // ship ~3-4x smaller — noticeably faster first paint on cold start)
        const compressible = ['.js', '.css', '.svg', '.json', '.html', '.txt', '.map'].includes(ext);
        const acceptsGzip = String(req.headers['accept-encoding'] || '').includes('gzip');
        if (compressible && acceptsGzip && buf.length > 1024) {
          zlib.gzip(buf, { level: 6 }, (err3, gz) => {
            if (err3 || gz.length >= buf.length) {
              res.writeHead(200, {
                'Content-Type': MIME[ext] || 'application/octet-stream',
                'Content-Length': buf.length,
                'Cache-Control': cacheControl,
                ...ISOLATION_HEADERS,
              });
              res.end(buf);
              return;
            }
            res.writeHead(200, {
              'Content-Type': MIME[ext] || 'application/octet-stream',
              'Content-Length': gz.length,
              'Content-Encoding': 'gzip',
              'Vary': 'Accept-Encoding',
              'Cache-Control': cacheControl,
              ...ISOLATION_HEADERS,
            });
            res.end(gz);
          });
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Content-Length': buf.length,
          'Cache-Control': cacheControl,
          ...ISOLATION_HEADERS,
        });
        res.end(buf);
      });
    });
  }

  // ── Local TTS (Edge neural voices online + Windows SAPI/OneCore offline) ──
  // - Edge-TTS: dozens of high-quality neural voices, direct connection works
  //   in CN (the msedge-tts package handles the Edge UA + token handshake)
  // - Windows local voices (e.g. Microsoft Zira en-US) work fully offline

  const ttsCacheDir = path.join(dataDir, 'tts-cache');

  // Curated Edge neural voices (id short name → label). English first.
  const EDGE_VOICES = [
    { id: 'srv:edge:en-US-AvaNeural', name: 'Ava (US, Natural)', lang: 'en-US', gender: 'female' },
    { id: 'srv:edge:en-US-AndrewNeural', name: 'Andrew (US, Natural)', lang: 'en-US', gender: 'male' },
    { id: 'srv:edge:en-US-EmmaNeural', name: 'Emma (US, Natural)', lang: 'en-US', gender: 'female' },
    { id: 'srv:edge:en-US-BrianNeural', name: 'Brian (US, Natural)', lang: 'en-US', gender: 'male' },
    { id: 'srv:edge:en-US-AriaNeural', name: 'Aria (US)', lang: 'en-US', gender: 'female' },
    { id: 'srv:edge:en-US-JennyNeural', name: 'Jenny (US)', lang: 'en-US', gender: 'female' },
    { id: 'srv:edge:en-US-GuyNeural', name: 'Guy (US)', lang: 'en-US', gender: 'male' },
    { id: 'srv:edge:en-US-AnaNeural', name: 'Ana (US, child)', lang: 'en-US', gender: 'female' },
    { id: 'srv:edge:en-GB-SoniaNeural', name: 'Sonia (UK)', lang: 'en-GB', gender: 'female' },
    { id: 'srv:edge:en-GB-RyanNeural', name: 'Ryan (UK)', lang: 'en-GB', gender: 'male' },
    { id: 'srv:edge:en-GB-LibbyNeural', name: 'Libby (UK)', lang: 'en-GB', gender: 'female' },
    { id: 'srv:edge:en-AU-NatashaNeural', name: 'Natasha (AU)', lang: 'en-AU', gender: 'female' },
    { id: 'srv:edge:en-AU-WilliamNeural', name: 'William (AU)', lang: 'en-AU', gender: 'male' },
    { id: 'srv:edge:en-IE-EmilyNeural', name: 'Emily (IE)', lang: 'en-IE', gender: 'female' },
    { id: 'srv:edge:en-IN-NeerjaNeural', name: 'Neerja (IN)', lang: 'en-IN', gender: 'female' },
    { id: 'srv:edge:zh-CN-XiaoxiaoNeural', name: '晓晓 (中文)', lang: 'zh-CN', gender: 'female' },
    { id: 'srv:edge:zh-CN-YunxiNeural', name: '云希 (中文)', lang: 'zh-CN', gender: 'male' },
  ];

  /** In-flight synthesis dedup — identical text synthesizes only once */
  const synthInflight = new Map();

  /** Lazily initialized msedge-tts module (null if unavailable) */
  let _edgeTtsMod;
  async function getEdgeTts() {
    if (_edgeTtsMod === undefined) {
      try {
        _edgeTtsMod = await import('msedge-tts');
      } catch (err) {
        console.warn('[tts] msedge-tts unavailable:', err.message);
        _edgeTtsMod = null;
      }
    }
    return _edgeTtsMod;
  }

  // One persistent Edge-TTS connection per voice — avoids a ~1s WebSocket
  // handshake on every synthesis. Re-created on error.
  const _edgeTtsByVoice = new Map();
  async function getEdgeTtsFor(voiceShortName) {
    const mod = await getEdgeTts();
    if (!mod) return null;
    let inst = _edgeTtsByVoice.get(voiceShortName);
    if (!inst) {
      inst = new mod.MsEdgeTTS();
      await inst.setMetadata(voiceShortName, mod.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      _edgeTtsByVoice.set(voiceShortName, inst);
    }
    return inst;
  }

  /** Synthesize via Edge-TTS (online neural voices) → mp3 file */
  function synthesizeEdgeMp3(text, voiceShortName, rate, outPath) {
    const pct = Math.round((rate - 1) * 100);
    const rateStr = `${pct >= 0 ? '+' : ''}${pct}%`;
    const attempt = () => getEdgeTtsFor(voiceShortName).then(async (tts) => {
      if (!tts) throw new Error('msedge-tts not installed');
      const { audioStream } = tts.toStream(text, { rate: rateStr });
      const chunks = [];
      for await (const c of audioStream) chunks.push(c);
      fs.writeFileSync(outPath, Buffer.concat(chunks));
    });
    // Stale/broken connection → drop the cached instance and retry once
    return attempt().catch(async (err) => {
      _edgeTtsByVoice.delete(voiceShortName);
      console.warn('[tts] edge retry after error:', err.message);
      await attempt();
    });
  }

  function sapiRateFrom(rateParam) {
    const rate = parseFloat(rateParam || '1');
    const r = Number.isFinite(rate) ? rate : 1;
    // frontend rate 0.5–1.5 → SAPI Rate -10..10 / WinRT SpeakingRate 0.5–2.0
    return Math.max(-10, Math.min(10, Math.round((r - 1) * 10)));
  }

  function winrtRateFrom(rateParam) {
    const rate = parseFloat(rateParam || '1');
    const r = Number.isFinite(rate) ? rate : 1;
    return Math.max(0.5, Math.min(2.0, r));
  }

  function runPowerShell(script, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const encoded = Buffer.from(script, 'utf16le').toString('base64');
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        try { child.kill(); } catch { /* ignore */ }
        reject(new Error('powershell timeout'));
      }, timeoutMs);
      child.stdout.on('data', (c) => { stdout += c; });
      child.stderr.on('data', (c) => { stderr += c; });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve(stdout);
        else reject(new Error(`powershell exit ${code}: ${stderr.slice(0, 300)}`));
      });
      child.on('error', (err) => { clearTimeout(timeout); reject(err); });
    });
  }

  /** List every available TTS voice: Edge neural (online) + Windows SAPI (offline) */
  function listLocalVoices() {
    const script = [
      '$out = @()',
      'try {',
      '  Add-Type -AssemblyName System.Speech',
      '  $sapi = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      '  foreach ($v in $sapi.GetInstalledVoices()) {',
      '    $n = $v.VoiceInfo.Name; $l = $v.VoiceInfo.Culture.Name; $g = $v.VoiceInfo.Gender',
      '    $out += ("sapi:" + $n + "|" + $l + "|" + $g)',
      '  }',
      '} catch { }',
      '$out -join "`n"',
    ].join('\r\n');
    const parse = (stdout) => {
      const voices = [];
      const seen = new Set();
      for (const line of stdout.split('\n').map((s) => s.trim()).filter(Boolean)) {
        const m = line.match(/^sapi:(.+)\|([^|]+)\|(Female|Male|NotSet)?/i);
        if (!m) continue;
        const [, name, lang, gender] = m;
        const key = `sapi:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        voices.push({
          id: `srv:${key}`,
          name: `${name.replace(/^Microsoft /, '').replace(' Desktop', '')} (本地)`,
          lang: (lang || 'en-US').replace('_', '-'),
          gender: (gender || '').toLowerCase() === 'female' ? 'female' : (gender || '').toLowerCase() === 'male' ? 'male' : 'unknown',
          engine: 'sapi:',
        });
      }
      // Edge neural voices first (highest quality, online), then local voices
      const all = [...EDGE_VOICES, ...voices];
      const rank = (l) => (l.startsWith('en') ? 0 : l.startsWith('zh') ? 1 : 2);
      all.sort((a, b) => rank(a.lang) - rank(b.lang));
      return all;
    };
    return runPowerShell(script, 15000)
      .then((stdout) => parse(stdout))
      .catch(() => parse('')); // enumeration failure → still offer Edge voices
  }

  function synthesizeWav(text, rate, outPath, voiceSpec) {
    return new Promise((resolve, reject) => {
      // Here-string requires '@ at line start — keep the script multi-line.
      // Sanitize text: no newlines, and never emit the '@ sequence.
      const safeText = text.replace(/\r?\n/g, ' ').replace(/'@/g, "' @");
      // SAPI desktop voice (default: Microsoft Zira Desktop en-US)
      const sapiName = voiceSpec && voiceSpec.startsWith('sapi:')
        ? voiceSpec.slice('sapi:'.length).replace(/'/g, "''")
        : 'Microsoft Zira Desktop';
      const psScript = [
        '$ErrorActionPreference = "Stop"',
        'Add-Type -AssemblyName System.Speech',
        '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
        `try { $s.SelectVoice('${sapiName}') } catch { }`,
        `$s.Rate = ${sapiRateFrom(rate)}`,
        `$s.SetOutputToWaveFile('${outPath}')`,
        "$s.Speak(@'",
        safeText,
        "'@)",
        '$s.Dispose()',
      ].join('\r\n');
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
        windowsHide: true,
      });
      let stderr = '';
      const timeout = setTimeout(() => {
        try { child.kill(); } catch { /* ignore */ }
        reject(new Error('tts timeout'));
      }, 20000);
      child.stderr.on('data', (c) => { stderr += c; });
      child.on('close', (code) => {
        clearTimeout(timeout);
        fs.stat(outPath, (err, stat) => {
          if (code === 0 && !err && stat.size > 44) resolve();
          else reject(new Error(`tts failed (code ${code}): ${stderr.slice(0, 200)}`));
        });
      });
      child.on('error', (err) => { clearTimeout(timeout); reject(err); });
    });
  }

  function handleLocalTts(req, res, url) {
    const text = (url.searchParams.get('text') || '').trim();
    const rate = url.searchParams.get('rate') || '1';
    const voice = url.searchParams.get('voice') || '';
    if (!text) {
      res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Missing "text" parameter');
      return;
    }
    if (text.length > 400) {
      res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Text too long (max 400 chars)');
      return;
    }
    // voice routing: srv:edge:* → online neural mp3 | srv:sapi:* / default → local wav
    const isEdge = voice.startsWith('srv:edge:');
    const ext = isEdge ? '.mp3' : '.wav';
    const mime = isEdge ? 'audio/mpeg' : 'audio/wav';
    const cacheKey = crypto.createHash('md5').update(`${text}|${rate}|${voice}`).digest('hex');
    const cachePath = path.join(ttsCacheDir, `${cacheKey}${ext}`);

    const respondWav = () => {
      const stream = fs.createReadStream(cachePath);
      stream.on('open', () => {
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*',
        });
        stream.pipe(res);
      });
      stream.on('error', () => {
        res.writeHead(500).end('tts read error');
      });
    };

    const synthesize = async () => {
      const exists = await fs.promises.stat(cachePath).then(() => true).catch(() => false);
      if (exists) return;
      if (isEdge) {
        await synthesizeEdgeMp3(text, voice.slice('srv:edge:'.length), parseFloat(rate) || 1, cachePath);
      } else {
        // SAPI spawn occasionally hiccups under load — one retry before failing
        try {
          await synthesizeWav(text, rate, cachePath, voice || null);
        } catch (err) {
          console.warn('[api] tts retry after:', err.message);
          await synthesizeWav(text, rate, cachePath, voice || null);
        }
      }
    };

    fs.stat(cachePath, (err, stat) => {
      if (!err && stat.size > 44) { respondWav(); return; }
      // Synthesize in PARALLEL (no queue) — each chunk writes its own cache
      // file, and playback order is handled by the browser. Serializing here
      // made multi-chunk page reading lag progressively behind.
      fs.mkdirSync(ttsCacheDir, { recursive: true });
      // In-flight dedup: identical text requested twice synthesizes once
      const inflight = synthInflight.get(cachePath);
      if (inflight) { inflight.then(respondWav, respondWav); return; }
      const job = synthesize();
      synthInflight.set(cachePath, job);
      job.then(respondWav).catch(async (synthErr) => {
        console.error('[api] local tts error:', synthErr.message);
        // Offline SAPI default is the last-resort fallback (works without network)
        if (isEdge) {
          try {
            const wavPath = cachePath.replace(/\.mp3$/, '-fallback.wav');
            await synthesizeWav(text, rate, wavPath, null);
            const stream2 = fs.createReadStream(wavPath);
            stream2.on('open', () => {
              res.writeHead(200, { 'Content-Type': 'audio/wav', 'Access-Control-Allow-Origin': '*' });
              stream2.pipe(res);
            });
            stream2.on('error', () => { if (!res.headersSent) res.writeHead(500).end(); });
            return;
          } catch (fallbackErr) {
            console.error('[api] tts fallback error:', fallbackErr.message);
          }
        }
        // Final fallback: the Google-proxy Pages Function (needs a system proxy)
        try {
          await handleApi(req, res, '/api/tts');
        } catch {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' }).end('tts synthesis failed');
          }
        }
      }).finally(() => synthInflight.delete(cachePath));
    });
  }

  /** Local desktop settings (B站 cookie, server AI keys) — persisted to dataDir */
  function loadLocalConfig() {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, 'server-config.json'), 'utf8')) || {};
    } catch { return {}; }
  }

  function handleLocalConfig(req, res, url) {
    if (req.method === 'GET') {
      const cfg = loadLocalConfig();
      const body = JSON.stringify({
        sessdata: cfg.bilibiliSessdata || '',
        hasSessdata: !!cfg.bilibiliSessdata,
      });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }).end(body);
      return;
    }
    if (req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => { raw += c; if (raw.length > 64 * 1024) req.destroy(); });
      req.on('end', () => {
        try {
          const body = JSON.parse(raw || '{}');
          const cfg = loadLocalConfig();
          if (typeof body.sessdata === 'string') cfg.bilibiliSessdata = body.sessdata.trim();
          fs.writeFileSync(path.join(dataDir, 'server-config.json'), JSON.stringify(cfg, null, 2));
          // Live-update the env used by Pages Functions
          env.BILIBILI_COOKIE = cfg.bilibiliSessdata ? `SESSDATA=${cfg.bilibiliSessdata}` : undefined;
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
            .end(JSON.stringify({ ok: true, restartNeeded: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }
    res.writeHead(405).end();
  }

  async function handleApi(req, res, pathname) {
    const rel = ROUTES[pathname];
    if (!rel || !routeModules.has(pathname)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    try {
      const mod = await routeModules.get(pathname);
      // Build a standard Request from the NodeIncomingMessage
      const url = `http://127.0.0.1:${port}${req.url}`;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v === undefined) continue;
        headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
      }
      let body;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        body = Buffer.concat(chunks);
      }
      const abortController = new AbortController();
      res.on('close', () => abortController.abort());
      const request = new Request(url, {
        method: req.method,
        headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
        signal: abortController.signal,
      });

      const response = await mod.onRequest({ request, env, params: {}, data: {} });

      const respHeaders = {};
      response.headers.forEach((v, k) => { respHeaders[k] = v; });
      // Same-origin app, but keep CORS permissive so `vite dev` can target this server
      respHeaders['Access-Control-Allow-Origin'] = '*';
      res.writeHead(response.status, respHeaders);
      if (response.body) {
        Readable.fromWeb(response.body).pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      console.error(`[api] ${pathname} error:`, err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  const server = http.createServer((req, res) => {
    const pathname = (req.url || '/').split('?')[0];
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      });
      res.end();
      return;
    }
    if (pathname === '/api/tts' || pathname === '/api/local-tts') {
      // Windows local synthesis first (offline, instant on cache hit);
      // falls through to the Google-proxy function on failure
      handleLocalTts(req, res, new URL(`http://127.0.0.1:${port}${req.url}`));
    } else if (pathname === '/api/tts-voices') {
      // Enumerate installed Windows voices (SAPI + OneCore/WinRT)
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      listLocalVoices().then(
        (voices) => res.end(JSON.stringify({ voices })),
        (err) => {
          console.error('[api] tts-voices error:', err.message);
          res.end(JSON.stringify({ voices: [], error: err.message }));
        },
      );
    } else if (pathname === '/api/server-config') {
      handleLocalConfig(req, res, new URL(`http://127.0.0.1:${port}${req.url}`));
    } else if (pathname.startsWith('/api/')) {
      handleApi(req, res, pathname).catch((err) => {
        console.error('[server] unhandled api error:', err);
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    } else {
      serveStatic(req, res, pathname);
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      console.log(`[NativeThink] local server running at http://127.0.0.1:${port}`);
      resolve(server);
      // Warm up Edge-TTS connections so the first user-triggered synthesis
      // skips the ~1s WebSocket handshake
      setTimeout(async () => {
        for (const v of ['en-US-AvaNeural', 'en-US-AriaNeural', 'en-US-BrianNeural']) {
          try { await getEdgeTtsFor(v); } catch { /* offline — retry on demand */ }
        }
        console.log('[tts] edge connections warmed up');
      }, 300);
    });
  });
}

// Allow standalone testing: `node server/local-server.mjs`
if (process.argv[1] && process.argv[1].endsWith('local-server.mjs')) {
  const root = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
  startServer({
    port: Number(process.env.NATIVETHINK_PORT || 31745),
    distDir: path.join(root, 'dist', 'client'),
    functionsDir: path.join(root, 'functions'),
    dataDir: path.join(root, '.local-data'),
  }).then((s) => {
    s.on('close', () => process.exit(0));
  }).catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
}
