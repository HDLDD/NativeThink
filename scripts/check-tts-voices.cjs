#!/usr/bin/env node
/**
 * 校验离线音色目录与磁盘资产是否自洽。
 * 用法: node scripts/check-tts-voices.cjs
 * 退出码 0 = 通过；1 = 有问题（阻断打包）
 *
 * 为什么需要：speakerId 是 voices.bin 里的数组下标 —— 写错不会报错，只会读成别人的
 * 声音；模型路径写错则要装到手机上才发现。这些都能在打包前静态查出来，不必等真机：
 * 越界与注册表一致性在 §1/§2 查，名字↔下标对应直读模型内嵌元数据在 §2.5 查。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets');
const CATALOG = path.join(ROOT, 'src', 'lib', 'tts-voice-catalog.ts');

/**
 * 模型注册表 —— 必须与 SherpaTtsPlugin.java 的 MODEL_* 常量一致。
 * 改这里时同步改 Java，反过来也一样。
 *
 * numSpeakers 不是估的：它来自模型内嵌元数据的 n_speakers，且与 voices.bin
 * 字节数精确对应（每音色 522240 字节 = style_dim 510×1×256×4B）。§2.5 会在打包前
 * 直读元数据复核这个数，不再只靠这行手抄。
 * 曾因忽略这个对应关系，把一个「103 音色但只有 3 个英语」的中文模型当成英语
 * 多音色模型用，结果是用中文音色读英文 —— 这类错误只有真机能听出来，
 * 所以边界值必须取自模型本身，而不是文档或仓库描述。
 */
const MODELS = {
  kokoro: {
    dir: path.join(ASSETS, 'tts', 'kokoro-int8-multi-lang-v1_0'),
    files: ['model.int8.onnx', 'voices.bin', 'tokens.txt', 'lexicon-us-en.txt'],
    /** Kokoro 复用 Piper 的 espeak 数据，故 dataDir 指向 Piper 音色目录 */
    dataDir: path.join(ASSETS, 'piper', 'vits-piper-en_US-lessac-medium'),
    sampleRate: 24000,
    numSpeakers: 54,
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

/**
 * 读 ONNX 末尾的内嵌元数据（ModelProto.metadata_props，sherpa-onnx 转换脚本写入）。
 * 只取文件尾部 64KB（v1.0 实测 key 在最后 ~2.5KB），不把 114MB 整读进内存。
 * 返回 (key) => value 字符串 | null。序列化格式为 protobuf：key 字符串（field 1）
 * 之后紧跟 0x12（field 2, LEN）→ varint 长度 → value 字节。
 */
function readOnnxMetadata(file, tailBytes = 64 * 1024) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, tailBytes);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    return (key) => {
      const kb = Buffer.from(key, 'ascii');
      let i = buf.indexOf(kb);
      while (i !== -1) {
        if (buf[i + kb.length] === 0x12) {
          let j = i + kb.length + 1;
          let vlen = 0, shift = 0;
          while (j < buf.length) {
            const b = buf[j++];
            vlen |= (b & 0x7f) << shift;
            if (!(b & 0x80)) break;
            shift += 7;
          }
          if (j + vlen <= buf.length) return buf.subarray(j, j + vlen).toString('utf8');
        }
        i = buf.indexOf(kb, i + 1);
      }
      return null;
    };
  } finally {
    fs.closeSync(fd);
  }
}

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
/** 解析出的目录条目，§2.5 的内嵌元数据核对要用 */
let catalogVoices = [];

if (!block) {
  notes.push('KOKORO_VOICES 尚未定义');
} else {
  catalogVoices = [...block[1].matchAll(
    /id:\s*'([^']+)'[\s\S]*?modelId:\s*'([^']+)'[\s\S]*?speakerId:\s*(\d+)/g,
  )].map((m) => ({ id: m[1], modelId: m[2], speakerId: Number(m[3]) }));

  if (catalogVoices.length === 0) {
    notes.push('KOKORO_VOICES 为空');
  } else {
    const seen = new Set();
    for (const v of catalogVoices) {
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
    kokoroVoiceCount = catalogVoices.filter((v) => v.modelId === 'kokoro').length;
    if (kokoroVoiceCount !== EXPECTED_KOKORO_VOICES) {
      notes.push(`Kokoro 音色数 ${kokoroVoiceCount}，设计为 ${EXPECTED_KOKORO_VOICES} 个`);
    }
    console.log(`  音色 ${catalogVoices.length} 个（Kokoro ${kokoroVoiceCount} 个），全部通过边界检查`);
  }
}

// ── 2.5) 音色表 vs 模型内嵌元数据（名字↔下标逐条核对）──
// 「名字 ↔ 下标」的权威表就写在模型文件自己的尾部元数据里（v1.0 实测含
// comment="This is Kokoro v1.0..."、n_speakers=54、speaker2id 全表 54 条）。
// 打包前直接读出来核对即可，不必等真机试听；对不上就阻断（曾用错模型版本，
// speakerId 全部落到中文音色上，真机听感「声音很奇怪」才被发现）。
const kokoroModel = path.join(MODELS.kokoro.dir, 'model.int8.onnx');
if (catalogVoices.length && fs.existsSync(kokoroModel)) {
  const kokoroEntries = catalogVoices.filter((v) => v.modelId === 'kokoro');
  const meta = readOnnxMetadata(kokoroModel);
  const nSpeakers = meta('n_speakers');
  const speaker2id = meta('speaker2id');
  if (nSpeakers === null || speaker2id === null) {
    errors.push('Kokoro 模型内嵌元数据读不到 n_speakers/speaker2id —— 资产可能不是预期的 v1.0 构建，重跑 node scripts/fetch-android-tts.cjs --force');
  } else {
    if (Number(nSpeakers) !== MODELS.kokoro.numSpeakers) {
      errors.push(`Kokoro 元数据 n_speakers=${nSpeakers} ≠ 注册表 numSpeakers=${MODELS.kokoro.numSpeakers}（以元数据为准更新注册表）`);
    }
    const table = new Map(
      speaker2id.split(',').map((s) => s.trim().split('->')).filter((p) => p.length === 2)
        .map((p) => [p[0], Number(p[1])]),
    );
    let ok = 0;
    for (const v of kokoroEntries) {
      const name = v.id.replace(/^kokoro:/, '');
      const real = table.get(name);
      if (real === undefined) {
        errors.push(`音色 ${v.id}: 模型内嵌元数据里没有 ${name}（v1.0 共 ${table.size} 个音色）`);
      } else if (real !== v.speakerId) {
        errors.push(`音色 ${v.id}: speakerId ${v.speakerId} 与元数据不符（${name}->${real}）—— 会读成别人的声音`);
      } else {
        ok++;
      }
    }
    if (ok) {
      console.log(`  内嵌元数据核对: ${ok}/${kokoroEntries.length} 个 Kokoro 音色名字↔下标逐条吻合（n_speakers=${nSpeakers}）`);
    }
  }
}

// ── 3) 默认音色与兜底音色 ──
// 默认音色必须是「用户在设置页真能选到的音色」。设置页渲染 listLocalVoices()
// = [FALLBACK_VOICE, ...KOKORO_VOICES]，所以默认值允许落在 Kokoro 11 音色里，
// 也允许就是兜底的 lessac（实测 RTF 0.076，长文唯一跟得上播放的离线音色——
// 见 tts-voice-catalog.ts 里 DEFAULT_LOCAL_VOICE_ID 的注释）。
// 原先这里硬绑 KOKORO_VOICES，默认改成 piper 后会让守卫误报。
const listMatch = src.match(/export function listLocalVoices\(\)[^{]*\{\s*return\s*\[([^\]]*)\]/);
const fbMatch = src.match(/export const FALLBACK_VOICE[^=]*=\s*\{[\s\S]*?\bid:\s*'([^']+)'/);
const defMatch = src.match(/DEFAULT_LOCAL_VOICE_ID\s*=\s*'([^']+)'/);

if (!defMatch) {
  notes.push('DEFAULT_LOCAL_VOICE_ID 尚未定义');
} else {
  // 把 listLocalVoices() 里的符号解析成真实音色 id
  const reachable = new Set();
  if (listMatch) {
    for (const sym of listMatch[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      if (sym === 'FALLBACK_VOICE') {
        if (fbMatch) reachable.add(fbMatch[1]);
        continue;
      }
      const lit = sym.match(/^'([^']+)'$/);
      if (lit) { reachable.add(lit[1]); continue; }
      const spread = sym.match(/^\.\.\.(\w+)$/);
      if (spread && spread[1] === 'KOKORO_VOICES' && block) {
        for (const m of block[1].matchAll(/\bid:\s*'([^']+)'/g)) reachable.add(m[1]);
      }
    }
  }
  if (!reachable.size) {
    notes.push('无法解析 listLocalVoices() 的可选集合 —— 默认音色可达性检查被跳过');
  } else if (!reachable.has(defMatch[1])) {
    errors.push(
      `DEFAULT_LOCAL_VOICE_ID='${defMatch[1]}' 不在 listLocalVoices() 可选集合里（共 ${reachable.size} 个）—— 用户选不中默认音色`,
    );
  }
}
if (!/export const FALLBACK_VOICE/.test(src)) {
  notes.push('FALLBACK_VOICE 尚未定义');
}

// ── 4) 资产体积报告 ──
const kokoroDir = MODELS['kokoro'].dir;
if (fs.existsSync(kokoroDir)) {
  let total = 0;
  for (const f of fs.readdirSync(kokoroDir)) {
    const p = path.join(kokoroDir, f);
    if (fs.statSync(p).isFile()) total += fs.statSync(p).size;
  }
  console.log(`  Kokoro 资产合计 ${mb(total)}（设计预期约 142MB）`);
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
