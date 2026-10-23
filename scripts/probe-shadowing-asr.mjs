#!/usr/bin/env node
/**
 * 路线 2 最小验证：音频 → ASR 转写 → scoreSpeech 词级对齐。
 *
 * 只回答一个问题：**手里这段英文录音，能不能拿到可用转写并算出词级命中率？**
 * 不录麦克风（那一步在浏览器/APK 里验），也不评音素级发音。
 *
 * 默认：Edge TTS 生成一句英文 → 直接调用 provider 的 Whisper 兼容接口
 *       → 用 src/lib/speech-score.ts 里真实的 scoreSpeech 打分。
 *
 * 用法：
 *   node scripts/probe-shadowing-asr.mjs
 *   node scripts/probe-shadowing-asr.mjs --audio 我的录音.wav --text "I thought the weather would be better today."
 *   node scripts/probe-shadowing-asr.mjs --provider groq --key $GROQ_API_KEY
 *   node scripts/probe-shadowing-asr.mjs --via-function   # 走本地 functions/api/ai/transcribe.js
 *   node scripts/probe-shadowing-asr.mjs --dry-run        # 不联网：只验脚本、音频与 scoreSpeech
 *
 * 退出码：0 = 拿到可用转写且词级命中率 ≥ 0.8；1 = 失败或不可用。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_TEXT = 'I thought the weather would be better today.';
const DEFAULT_VOICE = 'en-US-AriaNeural';
const PASS_ACCURACY = 0.8;

const PROVIDERS = {
  glm: {
    label: '智谱 GLM',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/audio/transcriptions',
    model: 'GLM-ASR-2512',
    keyEnv: 'GLM_API_KEY',
    hint: '出厂 scripts/.apikey 是 GLM Key，但未必开通了 GLM-ASR-2512；可换 --provider groq --key $GROQ_API_KEY，或到智谱控制台确认 ASR 权限。',
  },
  groq: {
    label: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
    model: 'whisper-large-v3-turbo',
    keyEnv: 'GROQ_API_KEY',
    hint: '把 Key 放进环境变量 GROQ_API_KEY，或显式传 --key。',
  },
  siliconflow: {
    label: '硅基流动',
    endpoint: 'https://api.siliconflow.cn/v1/audio/transcriptions',
    model: 'FunAudioLLM/SenseVoiceSmall',
    keyEnv: 'SILICONFLOW_API_KEY',
    hint: '把 Key 放进环境变量 SILICONFLOW_API_KEY，或显式传 --key。',
  },
};

function parseArgs(argv) {
  const out = { provider: 'glm', voice: DEFAULT_VOICE };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const take = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} 缺少参数`);
      return v;
    };
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--provider') out.provider = take();
    else if (a === '--key') out.key = take();
    else if (a === '--text') out.text = take();
    else if (a === '--audio') out.audio = take();
    else if (a === '--voice') out.voice = take();
    else if (a === '--via-function') out.viaFunction = true;
    else if (a === '--via-url') out.viaUrl = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--keep') out.keep = true;
    else if (a.startsWith('--key=')) out.key = a.slice('--key='.length);
    else if (a.startsWith('--provider=')) out.provider = a.slice('--provider='.length);
    else if (a.startsWith('--text=')) out.text = a.slice('--text='.length);
    else if (a.startsWith('--audio=')) out.audio = a.slice('--audio='.length);
    else if (a.startsWith('--voice=')) out.voice = a.slice('--voice='.length);
    else throw new Error(`未知参数：${a}`);
  }
  return out;
}

function help() {
  console.log(`路线 2 最小验证：音频 → ASR → 词级评分

用法：
  node scripts/probe-shadowing-asr.mjs [选项]

选项：
  --provider <glm|groq|siliconflow>  默认 glm（读 scripts/.apikey）
  --key <key>                        显式 Key（默认读环境变量 / 出厂 Key）
  --text <英文句子>                   目标句（默认：${DEFAULT_TEXT}）
  --audio <文件>                     用现成录音；不给就用 Edge TTS 生成
  --voice <ShortName>                Edge TTS 音色（默认 ${DEFAULT_VOICE}）
  --via-function                     走本地 functions/api/ai/transcribe.js（multipart 上传）
  --via-url                          配合 --via-function：走旧的 JSON audioUrl 路径
  --dry-run                          不调 ASR，只验证音频与 scoreSpeech 提取
  --keep                             保留生成的临时音频

示例：
  node scripts/probe-shadowing-asr.mjs
  node scripts/probe-shadowing-asr.mjs --via-function
  node scripts/probe-shadowing-asr.mjs --audio B:/tmp/take.wav --text "Would you like that hot or iced?"
`);
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.webm') return 'audio/webm';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.m4a' || ext === '.mp4') return 'audio/mp4';
  return 'audio/mpeg';
}

function redact(value, key) {
  const s = String(value ?? '');
  return key ? s.split(key).join('[REDACTED]') : s;
}

function probeDuration(file) {
  try {
    const raw = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file,
    ], { encoding: 'utf8', timeout: 10000 });
    const sec = Number(JSON.parse(raw)?.format?.duration);
    return Number.isFinite(sec) ? sec : null;
  } catch {
    return null;
  }
}

/**
 * 从 speech-score.ts 里提取真实的 tokenizeSpeech + scoreSpeech。
 * 不整文件 import：Node 里没有应用构建链，用 AST 抽函数最稳。
 */
function loadScoreSpeech() {
  const file = path.join(ROOT, 'src/lib/speech-score.ts');
  const source = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const wanted = new Set(['tokenizeSpeech', 'scoreSpeech']);
  const nodes = [];
  sf.forEachChild((node) => {
    if (node.name && wanted.has(node.name.text) && ts.isFunctionDeclaration(node)) nodes.push(node);
  });
  const missing = [...wanted].filter((name) => !nodes.some((n) => n.name?.text === name));
  if (missing.length) throw new Error(`未能从 src/lib/speech-score.ts 提取：${missing.join(', ')}`);

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const code = nodes.map((n) => printer.printNode(ts.EmitHint.Unspecified, n, sf)).join('\n\n');
  const js = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'module', js)(mod.exports, mod);
  if (typeof mod.exports.scoreSpeech !== 'function') throw new Error('scoreSpeech 提取后不可调用');
  return mod.exports.scoreSpeech;
}

async function synthesizeEdge(text, voice) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text, { rate: '+0%' });
    const chunks = [];
    for await (const chunk of audioStream) chunks.push(chunk);
    return Buffer.concat(chunks);
  } finally {
    try { tts.close(); } catch { /* ignore */ }
  }
}

/** Windows 离线兜底：System.Speech 合成 WAV（Edge TTS 被网络/风控挡住时用） */
function synthesizeSapi(text, outPath) {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SetOutputToWaveFile($env:NT_ASR_WAV)
try {
  $en = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'en-*' } | Select-Object -First 1
  if ($en) { $s.SelectVoice($en.VoiceInfo.Name) }
  $s.Speak($env:NT_ASR_TEXT)
} finally { $s.Dispose() }
`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, NT_ASR_WAV: outPath, NT_ASR_TEXT: text },
    timeout: 60000,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

function resolveKey(provider, explicit) {
  if (explicit) return explicit.trim();
  const envKey = process.env[PROVIDERS[provider].keyEnv];
  if (envKey && envKey.trim()) return envKey.trim();
  if (provider === 'glm') {
    const file = path.join(ROOT, 'scripts/.apikey');
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  }
  return '';
}

function extractText(data) {
  if (!data) return '';
  if (typeof data.text === 'string') return data.text.trim();
  if (typeof data.transcript === 'string') return data.transcript.trim();
  if (Array.isArray(data.segments)) return data.segments.map((s) => s.text || '').join(' ').trim();
  if (Array.isArray(data.results)) return data.results.map((r) => r.text || '').join(' ').trim();
  return '';
}

function segmentsOf(data) {
  return Array.isArray(data?.segments) && data.segments.length ? data.segments : null;
}

async function callAsrDirect({ provider, key, audio, filename, mime }) {
  const cfg = PROVIDERS[provider];
  const attempt = async (verbose) => {
    const form = new FormData();
    form.append('file', new Blob([audio], { type: mime }), filename);
    form.append('model', cfg.model);
    form.append('language', 'en');
    if (verbose) form.append('response_format', 'verbose_json');

    const t0 = performance.now();
    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(60000),
    });
    const ms = Math.round(performance.now() - t0);
    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { /* 非 JSON 错误体 */ }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}: ${raw.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return { ms, data, raw };
  };

  try {
    return await attempt(true);
  } catch (err) {
    // 有些 ASR 模型不收 verbose_json；只在 400/422 时退一步，认证失败不重试
    if ((err?.status === 400 || err?.status === 422) && provider !== 'groq') {
      console.warn(`  provider 不接受 verbose_json（${err.message}），重试不带 response_format…`);
      return await attempt(false);
    }
    throw err;
  }
}

async function callAsrViaFunction({ provider, key, audio, filename, mime, viaUrl }) {
  const mod = await import(pathToFileURL(path.join(ROOT, 'functions/api/ai/transcribe.js')).href);
  let server = null;
  try {
    let request;
    if (viaUrl) {
      server = http.createServer((req, res) => {
        if (req.url === '/audio.mp3') {
          res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': audio.length });
          res.end(audio);
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const port = server.address().port;
      request = new Request(`http://127.0.0.1:${port}/api/ai/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
        body: JSON.stringify({
          apiKey: key,
          provider,
          audioUrl: `http://127.0.0.1:${port}/audio.mp3`,
        }),
      });
    } else {
      // 路线 2 客户端真正走的形状：multipart 上传
      const form = new FormData();
      form.append('audio', new Blob([audio], { type: mime }), filename);
      form.append('provider', provider);
      form.append('apiKey', key);
      form.append('language', 'en');
      request = new Request('http://127.0.0.1/api/ai/transcribe', {
        method: 'POST',
        headers: { Origin: 'http://127.0.0.1' },
        body: form,
      });
    }

    const t0 = performance.now();
    const res = await mod.onRequest({ request, env: {} });
    const ms = Math.round(performance.now() - t0);
    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { /* ignore */ }
    if (!res.ok) {
      const err = new Error(`函数 HTTP ${res.status}: ${raw.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    if (data?.error) throw new Error(`函数返回错误：${data.error}`);
    return { ms, data };
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { help(); return; }

  const provider = args.provider;
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`不支持的 provider：${provider}（可选：${Object.keys(PROVIDERS).join(' / ')}）`);
  const text = (args.text || DEFAULT_TEXT).trim();
  if (!text) throw new Error('目标句为空');

  const scoreSpeech = loadScoreSpeech();
  // 提取自证：同一句必须 100%，空转写必须 0%
  const self = scoreSpeech(text, text);
  const empty = scoreSpeech(text, '');
  if (self.accuracy !== 1 || empty.accuracy !== 0) {
    throw new Error(`scoreSpeech 提取自检失败：${self.accuracy} / ${empty.accuracy}`);
  }

  console.log('=== 路线 2 最小验证 ===');
  console.log(`目标句：${text}`);
  console.log(`Provider：${cfg.label} / ${cfg.model}`);
  console.log(`通道：${args.viaFunction
    ? `functions/api/ai/transcribe.js（${args.viaUrl ? 'JSON audioUrl' : 'multipart 上传'}，本地真跑）`
    : '直接调用 provider'}`);
  console.log(`scoreSpeech 自检：同句 ${(self.accuracy * 100).toFixed(0)}%，空转写 ${(empty.accuracy * 100).toFixed(0)}%`);

  let audioPath = args.audio ? path.resolve(args.audio) : null;
  let generated = false;
  let audio = null;

  if (audioPath) {
    if (!fs.existsSync(audioPath)) throw new Error(`音频不存在：${audioPath}`);
    audio = fs.readFileSync(audioPath);
  } else if (!args.dryRun) {
    console.log(`音频：未提供 --audio，用 Edge TTS 生成（${args.voice}）…`);
    try {
      audio = await synthesizeEdge(text, args.voice);
      audioPath = path.join(os.tmpdir(), `nativethink-asr-${Date.now()}.mp3`);
      fs.writeFileSync(audioPath, audio);
      generated = true;
    } catch (err) {
      if (process.platform !== 'win32') {
        throw new Error(`Edge TTS 失败（${err.message}）；非 Windows 环境请用 --audio 传录音文件`);
      }
      console.warn(`  Edge TTS 失败（${err.message}），改用 Windows SAPI 离线合成…`);
      audioPath = path.join(os.tmpdir(), `nativethink-asr-${Date.now()}.wav`);
      synthesizeSapi(text, audioPath);
      audio = fs.readFileSync(audioPath);
      generated = true;
    }
  }

  try {
    if (audio) {
      const duration = probeDuration(audioPath);
      const words = text.split(/\s+/).filter(Boolean).length;
      console.log(`音频：${path.basename(audioPath)}，${(audio.length / 1024).toFixed(1)} KB` +
        (duration ? `，${duration.toFixed(2)}s（约 ${(words / duration).toFixed(2)} 词/秒）` : ''));
      if (args.viaFunction && args.viaUrl && path.extname(audioPath).toLowerCase() !== '.mp3') {
        console.warn('  注意：JSON audioUrl 路径固定按 audio/mpeg 转发；非 mp3 可能被上游误判。multipart 路径按实际 MIME 转发。');
      }
    } else {
      console.log('音频：--dry-run 跳过生成（传 --audio 可验证真实文件）');
    }

    if (args.dryRun) {
      console.log('结论：DRY-RUN OK —— scoreSpeech 可用；加 --audio 或去掉 --dry-run 再验 ASR。');
      return;
    }

    const key = resolveKey(provider, args.key);
    if (!key) {
      throw new Error(`没有 ${provider} 的 Key。${cfg.hint}`);
    }
    console.log(`Key：已读取（${key.length} 字符，已隐藏）`);

    const filename = audioPath ? path.basename(audioPath) : 'audio.mp3';
    let result;
    try {
      result = args.viaFunction
        ? await callAsrViaFunction({ provider, key, audio, filename, mime: mimeFor(filename), viaUrl: args.viaUrl })
        : await callAsrDirect({ provider, key, audio, filename, mime: mimeFor(filename) });
    } catch (err) {
      console.error(`ASR 失败：${redact(err.message, key)}`);
      console.error(`下一步：${cfg.hint}`);
      process.exitCode = 1;
      return;
    }

    const transcript = extractText(result.data).replace(/\s+/g, ' ').trim();
    const segments = segmentsOf(result.data);
    console.log(`耗时：${result.ms} ms`);
    console.log(`转写：${transcript ? `"${transcript}"` : '（空）'}`);
    if (segments) {
      const first = segments[0]?.start;
      const last = segments[segments.length - 1]?.end;
      console.log(`segments：${segments.length} 段` +
        (Number.isFinite(first) && Number.isFinite(last) ? `（${first}s – ${last}s）` : '（无时间戳）'));
    } else {
      console.log('segments：无 —— 路线 2 的语速层请改用录音总时长（ffprobe/AudioBuffer.duration）');
    }

    if (!transcript) {
      const preview = redact(JSON.stringify(result.data ?? result.raw ?? null)?.slice(0, 600), key);
      console.error(`响应预览：${preview}`);
      if (args.viaFunction) {
        console.error('提示：现有 /api/ai/transcribe 只解析 data.segments；GLM-ASR-2512 返回 {text}，需要在函数里补 text 兜底。');
      }
      console.error('结论：FAIL —— 转写为空，这条通道没有返回可用文本。');
      process.exitCode = 1;
      return;
    }

    const score = scoreSpeech(text, transcript);
    const matched = Math.round(score.accuracy * score.targetWords.length);
    console.log(`词级评分：${(score.accuracy * 100).toFixed(1)}%（${matched}/${score.targetWords.length} 词）`);
    console.log(`漏词：${score.missed.length ? score.missed.join(', ') : '无'}`);
    console.log(`识别词：${score.spokenWords.join(' ') || '（空）'}`);

    const pass = score.accuracy >= PASS_ACCURACY;
    console.log(`结论：${pass ? 'PASS' : 'WARN'} —— 音频 → 转写 → 词级评分链路可用` +
      (pass ? '。' : `，但命中率低于 ${PASS_ACCURACY * 100}%（换更安静/更清晰的录音再试）。`));
    if (!pass) process.exitCode = 1;
  } finally {
    if (generated && audioPath && !args.keep) {
      try { fs.rmSync(audioPath, { force: true }); } catch { /* ignore */ }
    } else if (generated && audioPath && args.keep) {
      console.log(`已保留生成的音频：${audioPath}`);
    }
  }
}

main().catch((err) => {
  console.error(`失败：${redact(err?.message || err)}`);
  process.exitCode = 1;
});
