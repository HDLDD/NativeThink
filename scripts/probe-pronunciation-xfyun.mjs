#!/usr/bin/env node
/**
 * 路线 3 最小验证：讯飞语音评测（流式版，ISE）音频 → 音素级评分。
 *
 * 为什么是讯飞：目前唯一明确「0 元」的口语评测（个人认证 1 万次 / 90 天）：
 *   https://www.xfyun.cn/services/ise
 * 腾讯云智聆最低 9.9 元/1 万次；Azure 免费层需要 Azure 账号/订阅。
 *
 * 接口是 WebSocket（wss://ise-api.xfyun.cn/v2/open-ise），本脚本验证三件事：
 *   1) 鉴权 URL 的 HMAC-SHA256 签名能生成；
 *   2) 16k mono PCM 分帧、首帧/中间帧/末帧协议能跑；
 *   3) 结果 XML 的总分/准确度/流利度/完整度 + word/phone 能解析。
 *
 * 用法：
 *   node scripts/probe-pronunciation-xfyun.mjs --dry-run
 *   node scripts/probe-pronunciation-xfyun.mjs --mock
 *   node scripts/probe-pronunciation-xfyun.mjs --appid xxx --api-key xxx --api-secret xxx --text "I thought the weather would be better today."
 *   node scripts/probe-pronunciation-xfyun.mjs --audio take.wav --text "..." --appid ... --api-key ... --api-secret ...
 *
 * Key 也可走环境变量：XFYUN_APPID / XFYUN_API_KEY / XFYUN_API_SECRET。
 * 真实模式不打印 Key；mock / dry-run 用假 Key 只验证协议。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { WebSocket, WebSocketServer } from 'ws';
const DEFAULT_TEXT = 'I thought the weather would be better today.';
const ISE_HOST = 'ise-api.xfyun.cn';
const ISE_PATH = '/v2/open-ise';
const FRAME_BYTES = 1280; // 16kHz mono 16-bit = 40ms
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const LOCAL_KEY_FILE = path.join(ROOT, 'scripts/.xfyun.json');

const MOCK_XML = `<xml_result>
  <read_sentence lan="en" type="study" total_score="82.5" accuracy_score="80.0" fluency_score="85.0" integrity_score="100.0">
    <rec_paper>
      <read_sentence total_score="82.5" accuracy_score="80.0" fluency_score="85.0" integrity_score="100.0">
        <sentence>
          <word content="I" total_score="92"><syll><phone content="ay" total_score="90"/></syll></word>
          <word content="thought" total_score="70"><syll><phone content="th" total_score="55"/><phone content="ao" total_score="74"/></syll></word>
          <word content="the" total_score="88"><syll><phone content="dh" total_score="86"/></syll></word>
          <word content="weather" total_score="80"><syll><phone content="w" total_score="78"/><phone content="eh" total_score="72"/></syll></word>
          <word content="better" total_score="84"><syll><phone content="b" total_score="83"/><phone content="er" total_score="80"/></syll></word>
        </sentence>
      </read_sentence>
    </rec_paper>
  </read_sentence>
</xml_result>`;

function parseArgs(argv) {
  const out = { text: DEFAULT_TEXT, delayMs: 15 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const take = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} 缺少参数`);
      return v;
    };
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--appid') out.appid = take();
    else if (a === '--api-key') out.apiKey = take();
    else if (a === '--api-secret') out.apiSecret = take();
    else if (a === '--text') out.text = take();
    else if (a === '--audio') out.audio = take();
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--mock') out.mock = true;
    else if (a === '--keep') out.keep = true;
    else if (a === '--delay') out.delayMs = Number(take());
    else throw new Error(`未知参数：${a}`);
  }
  return out;
}

function help() {
  console.log(`路线 3 最小验证：讯飞语音评测（ISE）音频 → 音素级评分

免费额度：个人认证 1 万次 / 90 天，https://www.xfyun.cn/services/ise
Key：控制台 → 我的应用 → 语音评测（流式版）→ APPID / APIKey / APISecret
也可以写进 scripts/.xfyun.json（已 gitignore，不会进仓库）：
  {"appid":"...","apiKey":"...","apiSecret":"..."}

用法：
  node scripts/probe-pronunciation-xfyun.mjs --dry-run
  node scripts/probe-pronunciation-xfyun.mjs --mock
  node scripts/probe-pronunciation-xfyun.mjs --appid <APPID> --api-key <APIKey> --api-secret <APISecret>
  node scripts/probe-pronunciation-xfyun.mjs --audio take.wav --text "..." --appid ... --api-key ... --api-secret ...

选项：
  --text <英文句子>   目标句（默认：${DEFAULT_TEXT}）
  --audio <文件>      用现成录音；不给就用 Windows SAPI 生成一句
  --delay <ms>        音频帧间隔（默认 15ms；越大越接近实时）
  --dry-run           只验签名、WAV/PCM 分帧、XML 解析（不联网）
  --mock              本地模拟讯飞 WebSocket，验证完整客户端协议（不联网）
  --keep              保留临时音频
`);
}

function redact(s, key) {
  const text = String(s ?? '');
  return key ? text.split(key).join('[REDACTED]') : text;
}

function loadLocalKeys() {
  try {
    if (!fs.existsSync(LOCAL_KEY_FILE)) return {};
    const data = JSON.parse(fs.readFileSync(LOCAL_KEY_FILE, 'utf8'));
    return { appid: data.appid, apiKey: data.apiKey, apiSecret: data.apiSecret };
  } catch {
    return {};
  }
}

function signUrl({ appId, apiKey, apiSecret, host = ISE_HOST, secure = true }) {
  const date = new Date().toUTCString();
  const origin = `host: ${host}\ndate: ${date}\nGET ${ISE_PATH} HTTP/1.1`;
  const signature = crypto.createHmac('sha256', apiSecret).update(origin).digest('base64');
  const authorization = Buffer.from(JSON.stringify({
    api_key: apiKey,
    algorithm: 'hmac-sha256',
    headers: 'host date request-line',
    signature,
  }), 'utf8').toString('base64');
  const scheme = secure ? 'wss' : 'ws';
  return `${scheme}://${host}${ISE_PATH}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(host)}`;
}

/** 解析 16k mono 16-bit PCM WAV；返回 data chunk（不含 44 字节头） */
function parseWav16k(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('不是 WAV 文件');
  }
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ' && body + 16 <= buf.length) {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = buf.subarray(body, Math.min(buf.length, body + size));
    }
    offset = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV 缺 fmt/data chunk');
  if (fmt.audioFormat !== 1 || fmt.channels !== 1 || fmt.sampleRate !== 16000 || fmt.bits !== 16) {
    throw new Error(`需要 16kHz mono 16-bit PCM WAV（当前 ${fmt.sampleRate}Hz/${fmt.channels}ch/${fmt.bits}bit）`);
  }
  return data;
}

function ensure16kWav(file) {
  try {
    return parseWav16k(fs.readFileSync(file));
  } catch (err) {
    const out = path.join(os.tmpdir(), `nt-ise-16k-${Date.now()}.wav`);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-ar', '16000', '-ac', '1', '-sample_fmt', 's16', out], {
      timeout: 60000,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const pcm = parseWav16k(fs.readFileSync(out));
    try { fs.rmSync(out, { force: true }); } catch { /* ignore */ }
    return pcm;
  }
}

function synthesizeSapi(text, outPath) {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SetOutputToWaveFile($env:NT_ISE_WAV)
try {
  $en = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'en-*' } | Select-Object -First 1
  if ($en) { $s.SelectVoice($en.VoiceInfo.Name) }
  $s.Speak($env:NT_ISE_TEXT)
} finally { $s.Dispose() }
`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, NT_ISE_WAV: outPath, NT_ISE_TEXT: text },
    timeout: 60000,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

function firstFrame(appId, text, chunk) {
  return {
    common: { app_id: appId },
    business: {
      category: 'read_sentence',
      rstcd: 'utf8',
      group: 'pupil',
      sub: 'ise',
      tte: 'utf-8',
      cmd: 'ssb',
      auf: 'audio/L16;rate=16000',
      ent: 'en_vip',
      aus: 1,
      aue: 'raw',
      text: '\uFEFF' + text,
      ise_unite: '1',
      rst: 'entirety',
      extra_ability: 'multi_dimension',
    },
    data: { status: 0, encoding: 'raw', data_type: 1, data: chunk.toString('base64') },
  };
}

function attrsOf(tag) {
  const out = {};
  const re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tag))) out[m[1]] = m[2];
  return out;
}

function num(v) {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function parseIseResult(xml) {
  const readTags = [...String(xml).matchAll(/<read_sentence\b([^>]*)>/g)].map((m) => attrsOf(m[1]));
  const root = readTags.find((a) => a.total_score && a.accuracy_score) || readTags[0] || {};
  const words = [...String(xml).matchAll(/<word\b([^>]*)>/g)]
    .map((m) => attrsOf(m[1]))
    .filter((w) => w.content)
    .map((w) => ({ content: w.content, score: num(w.total_score), phoneScore: num(w.phone_score) }));
  const phones = [...String(xml).matchAll(/<phone\b([^>]*)>/g)]
    .map((m) => attrsOf(m[1]))
    .filter((p) => p.content)
    .map((p) => ({ content: p.content, score: num(p.total_score) }));
  return {
    total: num(root.total_score),
    accuracy: num(root.accuracy_score),
    fluency: num(root.fluency_score),
    integrity: num(root.integrity_score),
    words,
    phones,
    raw: String(xml),
  };
}

function printResult(result, label) {
  console.log(`\n${label}`);
  console.log(`总分 ${result.total.toFixed(1)} · 准确度 ${result.accuracy.toFixed(1)} · 流利度 ${result.fluency.toFixed(1)} · 完整度 ${result.integrity.toFixed(1)}`);
  const words = [...result.words].sort((a, b) => a.score - b.score).slice(0, 6);
  const phones = [...result.phones].sort((a, b) => a.score - b.score).slice(0, 8);
  console.log(`单词（低分优先）：${words.map((w) => `${w.content} ${w.score.toFixed(0)}`).join(' / ') || '无'}`);
  console.log(`音素（低分优先）：${phones.map((p) => `/${p.content}/ ${p.score.toFixed(0)}`).join(' / ') || '无'}`);
}

function runClient({ url, appId, text, pcm, delayMs = 15, timeoutMs = 30000 }) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let settled = false;
    let lastResult = null;
    let sid = '';
    const timer = setTimeout(() => finish(new Error('评测超时（30s）')), timeoutMs);
    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve({ ...result, sid });
    };

    socket.on('open', async () => {
      try {
        const chunks = [];
        for (let i = 0; i < pcm.length; i += FRAME_BYTES) chunks.push(pcm.subarray(i, i + FRAME_BYTES));
        if (!chunks.length) throw new Error('音频为空');
        socket.send(JSON.stringify(firstFrame(appId, text, chunks[0])));
        for (let i = 1; i < chunks.length; i++) {
          if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
          const status = i === chunks.length - 1 ? 2 : 1;
          socket.send(JSON.stringify({ data: { status, data: chunks[i].toString('base64') } }));
        }
        if (chunks.length === 1) {
          if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
          socket.send(JSON.stringify({ data: { status: 2, data: '' } }));
        }
      } catch (err) {
        finish(err);
      }
    });

    socket.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.sid) sid = msg.sid;
      if (msg.code && Number(msg.code) !== 0) {
        finish(new Error(`讯飞错误 ${msg.code}: ${msg.message || msg.desc || ''}`));
        return;
      }
      const data = msg.data;
      const xmlBase64 = typeof data === 'string' ? data : data?.data;
      if (xmlBase64) {
        try {
          const xml = Buffer.from(xmlBase64, 'base64').toString('utf8');
          if (xml.includes('<summary') || xml.includes('<read_sentence') || xml.includes('<read_word')) {
            lastResult = parseIseResult(xml);
          }
        } catch { /* 非 XML 中间消息 */ }
      }
      if (data && (data.status === 2 || data.status === '2')) {
        if (lastResult) finish(null, lastResult);
        else finish(new Error('收到末帧但没有可解析的评测结果'));
      }
    });

    socket.on('error', (err) => finish(err));
    socket.on('close', () => {
      if (!settled) finish(lastResult ? null : new Error('连接关闭但没有结果'), lastResult);
    });
  });
}

async function startMock() {
  const server = new WebSocketServer({ port: 0, path: ISE_PATH });
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const state = { frames: 0, bytes: 0, appId: '', text: '', firstStatus: null, lastStatus: null };
  server.on('connection', (socket) => {
    socket.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      state.frames++;
      if (msg.common?.app_id) state.appId = msg.common.app_id;
      if (msg.business?.text) state.text = msg.business.text;
      if (msg.data) {
        if (msg.data.status === 0) state.firstStatus = 0;
        if (msg.data.status === 2) state.lastStatus = 2;
        if (msg.data.data) state.bytes += Buffer.from(msg.data.data, 'base64').length;
      }
      if (msg.data?.status === 2) {
        socket.send(JSON.stringify({
          code: 0,
          sid: 'mock-ise',
          data: { status: 2, data: Buffer.from(MOCK_XML).toString('base64') },
        }));
      }
    });
  });
  return { server, port: server.address().port, state };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { help(); return; }

  if (args.dryRun) {
    const url = signUrl({ appId: 'demo-app', apiKey: 'demo-key', apiSecret: 'demo-secret' });
    const parsed = new URL(url);
    console.log('=== 讯飞 ISE 最小验证（dry-run） ===');
    console.log(`签名 URL：${parsed.origin}${parsed.pathname}`);
    console.log(`authorization：${parsed.searchParams.get('authorization')?.slice(0, 24)}…（已生成）`);
    console.log(`date：${parsed.searchParams.get('date')}`);
    const result = parseIseResult(MOCK_XML);
    printResult(result, '内置样例 XML 解析：');
    console.log('\n结论：DRY-RUN OK —— 签名、协议字段与 XML 解析可用；真实分数需要讯飞 Key。');
    return;
  }

  let pcm = null;
  let audioPath = args.audio ? path.resolve(args.audio) : null;
  let generated = false;

  if (args.mock) {
    if (!audioPath) {
      if (process.platform !== 'win32') throw new Error('mock 模式请用 --audio 传一段 16k/mono WAV');
      audioPath = path.join(os.tmpdir(), `nt-ise-${Date.now()}.wav`);
      console.log(`音频：未提供 --audio，用 Windows SAPI 生成（${audioPath}）…`);
      synthesizeSapi(args.text, audioPath);
      generated = true;
    }
    console.log('音频：转 16kHz mono 16-bit PCM…');
    pcm = ensure16kWav(audioPath);
    const mock = await startMock();
    try {
      const url = signUrl({
        appId: 'demo-app',
        apiKey: 'demo-key',
        apiSecret: 'demo-secret',
        host: `127.0.0.1:${mock.port}`,
        secure: false,
      });
      console.log(`\n模拟讯飞 WebSocket：ws://127.0.0.1:${mock.port}${ISE_PATH}`);
      const result = await runClient({
        url,
        appId: 'demo-app',
        text: args.text,
        pcm,
        delayMs: args.delayMs,
      });
      printResult(result, '模拟评测结果：');
      console.log(`\n协议读数：帧数 ${mock.state.frames} · 音频 ${mock.state.bytes} 字节 · app_id=${mock.state.appId} · first=${mock.state.firstStatus} last=${mock.state.lastStatus}`);
      console.log(`文本前缀：${JSON.stringify(mock.state.text.slice(0, 6))}（应为 BOM）`);
      const ok = mock.state.frames > 1 && mock.state.bytes > 0
        && mock.state.appId === 'demo-app' && mock.state.firstStatus === 0
        && mock.state.lastStatus === 2 && mock.state.text.startsWith('\uFEFF')
        && result.words.length > 0 && result.phones.length > 0;
      console.log(ok ? '结论：MOCK PASS —— 客户端协议、分帧与结果解析成立。' : '结论：MOCK FAIL —— 上面某项读数不符合预期。');
      if (!ok) process.exitCode = 1;
    } finally {
      await new Promise((r) => mock.server.close(r));
      if (generated && !args.keep) {
        try { fs.rmSync(audioPath, { force: true }); } catch { /* ignore */ }
      }
    }
    return;
  }

  // 真实模式：CLI > 环境变量 > scripts/.xfyun.json
  const local = loadLocalKeys();
  const appid = args.appid || process.env.XFYUN_APPID || local.appid;
  const apiKey = args.apiKey || process.env.XFYUN_API_KEY || local.apiKey;
  const apiSecret = args.apiSecret || process.env.XFYUN_API_SECRET || local.apiSecret;
  if (!appid || !apiKey || !apiSecret) {
    console.error('缺少讯飞 Key：--appid / --api-key / --api-secret、XFYUN_APPID / XFYUN_API_KEY / XFYUN_API_SECRET，或 scripts/.xfyun.json');
    console.error('免费额度：个人认证 1 万次 / 90 天，https://www.xfyun.cn/services/ise');
    process.exitCode = 2;
    return;
  }
  if (!args.appid && !process.env.XFYUN_APPID && local.appid) {
    console.log('Key：读取 scripts/.xfyun.json（已隐藏）');
  }

  if (!audioPath) {
    if (process.platform !== 'win32') throw new Error('请用 --audio 传一段 16k/mono WAV（非 Windows 无法自动生成）');
    audioPath = path.join(os.tmpdir(), `nt-ise-${Date.now()}.wav`);
    console.log(`音频：未提供 --audio，用 Windows SAPI 生成（${audioPath}）…`);
    synthesizeSapi(args.text, audioPath);
    generated = true;
  }
  console.log('音频：转 16kHz mono 16-bit PCM…');
  pcm = ensure16kWav(audioPath);
  console.log(`音频：${(pcm.length / 32000).toFixed(2)}s / ${pcm.length} 字节`);

  const url = signUrl({ appId: appid, apiKey, apiSecret });
  console.log(`鉴权：已签名（Key 已隐藏）`);
  try {
    const result = await runClient({ url, appId: appid, text: args.text, pcm, delayMs: args.delayMs });
    printResult(result, '讯飞评测结果：');
    if (result.sid) console.log(`sid：${result.sid}`);
    console.log(`\n结论：PASS —— 音频 → 音素级评分链路可用（${(pcm.length / 32000).toFixed(2)}s 音频）。`);
  } catch (err) {
    console.error(`评测失败：${redact(redact(err.message, apiSecret), apiKey)}`);
    console.error('常见原因：Key 未开通「语音评测（流式版）」、免费额度未领取、text 超长、音频不是 16k mono。');
    process.exitCode = 1;
  } finally {
    if (generated && !args.keep) {
      try { fs.rmSync(audioPath, { force: true }); } catch { /* ignore */ }
    }
  }
}

main().catch((err) => {
  console.error(`失败：${redact(err?.message || err)}`);
  process.exitCode = 1;
});
