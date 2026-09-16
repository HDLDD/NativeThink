#!/usr/bin/env node
/**
 * 拉取安卓端「真离线」朗读引擎所需的二进制与音色：
 *   - sherpa-onnx Android AAR（含 espeak-ng + ONNX Runtime，静态链接版避免符号冲突）
 *   - 一个 Piper 英文音色（VITS/ONNX，含 espeak-ng-data）
 *
 * 为什么要内置：安卓系统的 TTS 引擎在很多机器上「没有本地音色」，只能联网合成 ——
 * 表现为起播慢、随网速波动、偶尔读不出来或只读一半，且刚读过的句子会命中缓存
 * 才变快。内置引擎后合成完全在设备内完成（实测同类方案 RTF≈0.08，即 3 秒语音
 * 约 250ms 合成完），与网速彻底无关。
 *
 * 源都走 hf-mirror（GitHub 在国内不可达）。
 * 用法: node scripts/fetch-android-tts.cjs [--force] [--voice <名>]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIRROR = 'https://hf-mirror.com';
const LIBS_DIR = path.join(ROOT, 'android', 'app', 'libs');
const ASSETS_DIR = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'piper');

const AAR_REPO = 'csukuangfj/sherpa-onnx-libs';
const AAR_VERSION = '1.12.21';
const AAR_FILE = `android/aar/${AAR_VERSION}/sherpa-onnx-static-link-onnxruntime-${AAR_VERSION}.aar`;

const VOICE = 'vits-piper-en_US-lessac-medium';
const VOICE_REPO = `csukuangfj/${VOICE}`;

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const voiceArg = args.indexOf('--voice');
const voiceRepo = voiceArg >= 0 && args[voiceArg + 1] ? `csukuangfj/${args[voiceArg + 1]}` : VOICE_REPO;

const CONCURRENCY = 8;
const mb = (n) => (n / 1024 / 1024).toFixed(1) + 'MB';

async function head(url) {
  const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(60000) });
  return { ok: r.ok, len: Number(r.headers.get('content-length') || 0) };
}

/** 在目录里找 .onnx 模型文件 */
function findOnnx(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const inner = findOnnx(p);
      if (inner) return inner;
    } else if (e.name.endsWith('.onnx')) {
      return p;
    }
  }
  return null;
}

/** 离线判定音色是否已完整（模型够大 + 文件数够多 + espeak 数据在） */
function voiceLooksComplete(dir) {
  try {
    const onnx = findOnnx(dir);
    if (!onnx || fs.statSync(onnx).size < 50 * 1024 * 1024) return false;
    if (!fs.existsSync(path.join(dir, 'tokens.txt'))) return false;
    const espeak = path.join(dir, 'espeak-ng-data');
    if (!fs.existsSync(espeak) || fs.readdirSync(espeak).length < 50) return false;
    let count = 0;
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name));
        else count++;
      }
    };
    walk(dir);
    return count > 300;
  } catch {
    return false;
  }
}

async function download(url, dest) {
  const tmp = dest + '.part';
  const r = await fetch(url, { signal: AbortSignal.timeout(600000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
  return buf.length;
}

/** 列仓库全部文件（递归） */
async function listRepo(repo) {
  const r = await fetch(`${MIRROR}/api/models/${repo}/tree/main?recursive=true`, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`列目录失败 HTTP ${r.status}`);
  const j = await r.json();
  return j.filter((x) => x.type === 'file').map((x) => ({ path: x.path, size: x.size || 0 }));
}

(async () => {
  fs.mkdirSync(LIBS_DIR, { recursive: true });

  // ── 1) AAR ──
  const aarDest = path.join(LIBS_DIR, `sherpa-onnx-${AAR_VERSION}.aar`);
  const aarUrl = `${MIRROR}/${AAR_REPO}/resolve/main/${AAR_FILE}`;
  if (!FORCE && fs.existsSync(aarDest) && fs.statSync(aarDest).size > 1024 * 1024) {
    console.log(`  跳过 AAR（已存在 ${mb(fs.statSync(aarDest).size)}）`);
  } else {
    const h = await head(aarUrl);
    console.log(`  下载 AAR ${AAR_VERSION} (${mb(h.len)}) …`);
    const n = await download(aarUrl, aarDest);
    console.log(`  ✓ ${path.relative(ROOT, aarDest)}  ${mb(n)}`);
  }

  // ── 2) 音色 ──
  const voiceName = voiceRepo.split('/')[1];
  const voiceDir = path.join(ASSETS_DIR, voiceName);

  // 资源已就位就完全离线跳过 —— 构建不该因为网络抖动而失败
  // （用户网络本来就差，之前这里每次都要列远端目录，一抖就挂）。用 --refresh 强制更新。
  if (!FORCE && voiceLooksComplete(voiceDir)) {
    const onnx = findOnnx(voiceDir);
    console.log(`  跳过音色 ${voiceName}（已就位 ${mb(fs.statSync(onnx).size)} 模型）`);
    console.log(`\n完成：AAR + 音色 ${voiceName} 均已就位（离线校验通过）`);
    return;
  }

  const files = await listRepo(voiceRepo);
  const total = files.reduce((s, f) => s + f.size, 0);
  console.log(`  音色 ${voiceName}：${files.length} 个文件 / ${mb(total)} → assets/piper/${voiceName}/`);

  let done = 0;
  let bytes = 0;
  const queue = [...files];
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift();
      const dest = path.join(voiceDir, f.path);
      if (!FORCE && fs.existsSync(dest) && f.size > 0 && fs.statSync(dest).size === f.size) {
        done++;
        bytes += f.size;
        continue;
      }
      try {
        const n = await download(`${MIRROR}/${voiceRepo}/resolve/main/${encodeURIComponent(f.path)}`, dest);
        done++;
        bytes += n;
        if (done % 40 === 0 || done === files.length) {
          process.stdout.write(`\r    进度 ${done}/${files.length}  ${mb(bytes)}`);
        }
      } catch (e) {
        console.error(`\n    ✗ ${f.path}: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stdout.write('\n');

  // ── 3) 校验 ──
  const onnx = files.filter((f) => f.path.endsWith('.onnx'));
  const tokens = files.find((f) => f.path === 'tokens.txt');
  const espeak = files.some((f) => f.path.startsWith('espeak-ng-data/'));
  console.log('');
  for (const f of onnx) {
    const p = path.join(voiceDir, f.path);
    console.log(`  ${fs.existsSync(p) ? '✓' : '✗'} ${f.path}  ${fs.existsSync(p) ? mb(fs.statSync(p).size) : '缺失'}`);
  }
  console.log(`  ${tokens && fs.existsSync(path.join(voiceDir, 'tokens.txt')) ? '✓' : '✗'} tokens.txt`);
  console.log(`  ${espeak ? '✓' : '✗'} espeak-ng-data/`);
  console.log(`\n完成：AAR + 音色 ${voiceName}，合计新增约 ${mb(fs.statSync(aarDest).size + bytes)}`);
})().catch((e) => {
  console.error('拉取失败:', e);
  process.exit(1);
});
