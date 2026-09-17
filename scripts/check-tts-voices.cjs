#!/usr/bin/env node
/**
 * 校验离线音色目录与磁盘资产是否自洽。
 * 用法: node scripts/check-tts-voices.cjs
 * 退出码 0 = 通过；1 = 有问题（阻断打包）
 *
 * 为什么需要：speakerId 是 voices.bin 里的数组下标 —— 写错不会报错，只会读成别人的
 * 声音，且只有真机才能听出来；模型路径写错则要装到手机上才发现。这些都能在打包前
 * 静态查出来，不必等真机。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets');
const CATALOG = path.join(ROOT, 'src', 'lib', 'tts-voice-catalog.ts');

/**
 * 模型注册表 —— 必须与 SherpaTtsPlugin.java 的 MODEL_* 常量一致。
 * 改这里时同步改 Java，反过来也一样。
 */
const MODELS = {
  'kokoro-v1_1': {
    dir: path.join(ASSETS, 'tts', 'kokoro-int8-multi-lang-v1_1'),
    files: ['model.int8.onnx', 'voices.bin', 'tokens.txt', 'lexicon-us-en.txt'],
    /** Kokoro 复用 Piper 的 espeak 数据，故 dataDir 指向 Piper 音色目录 */
    dataDir: path.join(ASSETS, 'piper', 'vits-piper-en_US-lessac-medium'),
    sampleRate: 24000,
    numSpeakers: 103,
  },
  'piper-lessac': {
    dir: path.join(ASSETS, 'piper', 'vits-piper-en_US-lessac-medium'),
    files: ['en_US-lessac-medium.onnx', 'tokens.txt'],
    dataDir: path.join(ASSETS, 'piper', 'vits-piper-en_US-lessac-medium'),
    sampleRate: 22050,
    numSpeakers: 1,
  },
};

/** 设计预期：Kokoro 提供 11 个英文音色 */
const EXPECTED_KOKORO_VOICES = 11;

const errors = [];
const notes = [];
const mb = (n) => (n / 1024 / 1024).toFixed(1) + 'MB';

// ── 1) 模型资产是否齐全 ──
for (const [id, m] of Object.entries(MODELS)) {
  if (!fs.existsSync(m.dir)) {
    errors.push(`模型 ${id}: 目录不存在 ${path.relative(ROOT, m.dir)} —— 先跑 node scripts/fetch-android-tts.cjs`);
    continue;
  }
  for (const f of m.files) {
    const p = path.join(m.dir, f);
    if (!fs.existsSync(p)) errors.push(`模型 ${id}: 缺文件 ${f}`);
    else if (fs.statSync(p).size === 0) errors.push(`模型 ${id}: 文件为空 ${f}`);
  }
  const espeak = path.join(m.dataDir, 'espeak-ng-data');
  if (!fs.existsSync(espeak)) {
    errors.push(`模型 ${id}: 缺 espeak-ng-data（${path.relative(ROOT, espeak)}）`);
  } else {
    const n = fs.readdirSync(espeak).length;
    if (n < 50) errors.push(`模型 ${id}: espeak-ng-data 只有 ${n} 个条目，疑似未拉全`);
  }
}

// ── 2) 音色目录 ──
const src = fs.readFileSync(CATALOG, 'utf8');
const block = src.match(/export const KOKORO_VOICES[^=]*=\s*\[([\s\S]*?)\n\];/);
let kokoroVoiceCount = 0;

if (!block) {
  notes.push('KOKORO_VOICES 尚未定义');
} else {
  const voices = [...block[1].matchAll(
    /id:\s*'([^']+)'[\s\S]*?modelId:\s*'([^']+)'[\s\S]*?speakerId:\s*(\d+)/g,
  )].map((m) => ({ id: m[1], modelId: m[2], speakerId: Number(m[3]) }));

  if (voices.length === 0) {
    notes.push('KOKORO_VOICES 为空');
  } else {
    const seen = new Set();
    for (const v of voices) {
      if (seen.has(v.id)) errors.push(`音色 id 重复: ${v.id}`);
      seen.add(v.id);

      const m = MODELS[v.modelId];
      if (!m) {
        errors.push(`音色 ${v.id}: modelId '${v.modelId}' 不在模型注册表里（原生会拒绝合成）`);
        continue;
      }
      if (!(v.speakerId >= 0 && v.speakerId < m.numSpeakers)) {
        errors.push(`音色 ${v.id}: speakerId ${v.speakerId} 越界（模型 ${v.modelId} 只有 ${m.numSpeakers} 个音色）`);
      }
    }
    kokoroVoiceCount = voices.filter((v) => v.modelId === 'kokoro-v1_1').length;
    if (kokoroVoiceCount !== EXPECTED_KOKORO_VOICES) {
      notes.push(`Kokoro 音色数 ${kokoroVoiceCount}，设计为 ${EXPECTED_KOKORO_VOICES} 个`);
    }
    console.log(`  音色 ${voices.length} 个（Kokoro ${kokoroVoiceCount} 个），全部通过边界检查`);
  }
}

// ── 3) 默认音色与兜底音色 ──
const defMatch = src.match(/DEFAULT_LOCAL_VOICE_ID\s*=\s*'([^']+)'/);
if (!defMatch) {
  notes.push('DEFAULT_LOCAL_VOICE_ID 尚未定义');
} else if (block && !block[1].includes(`'${defMatch[1]}'`)) {
  errors.push(`DEFAULT_LOCAL_VOICE_ID='${defMatch[1]}' 不在 KOKORO_VOICES 里`);
}
if (!/export const FALLBACK_VOICE/.test(src)) {
  notes.push('FALLBACK_VOICE 尚未定义');
}

// ── 4) 资产体积报告 ──
const kokoroDir = MODELS['kokoro-v1_1'].dir;
if (fs.existsSync(kokoroDir)) {
  let total = 0;
  for (const f of fs.readdirSync(kokoroDir)) {
    const p = path.join(kokoroDir, f);
    if (fs.statSync(p).isFile()) total += fs.statSync(p).size;
  }
  console.log(`  Kokoro 资产合计 ${mb(total)}（设计预期 166MB 量级）`);
  const stray = fs.readdirSync(kokoroDir).filter((f) => f === 'espeak-ng-data' || f === 'dict');
  if (stray.length) {
    notes.push(`Kokoro 目录出现本该共享/剥离的 ${stray.join('、')} —— 会白占体积`);
  }
}

// ── 输出 ──
for (const n of notes) console.log(`  · 待办: ${n}`);

if (errors.length) {
  console.error('\n✗ 音色校验失败:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('✓ 音色校验通过');
