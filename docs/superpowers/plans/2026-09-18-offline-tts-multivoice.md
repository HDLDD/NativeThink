# 离线 TTS 多音色 SDK 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把只能发一个音色的内置离线朗读引擎，改成可切换 11 个英语音色（24000Hz），新增包体积 166MB。

**Architecture:** 音色元数据归 JS 侧音色目录（`tts-voice-catalog.ts`），原生侧只保留一个「模型 key → 配置」注册表并按 `modelId` 懒加载引擎；JS 把 `modelId` + `speakerId` 跨端传给原生，由 `OfflineTts.generate(text, speakerId, speed)` 合成。不使用 manifest.json —— 每个事实各居一处，无漂移面。

**Tech Stack:** Capacitor 8 + Android 原生插件（sherpa-onnx 1.12.21 AAR）+ React 19 + TypeScript + Vite

**设计文档:** `docs/superpowers/specs/2026-09-18-offline-tts-multivoice-design.md`

## Global Constraints

- 模型仓库：`csukuangfj/kokoro-int8-multi-lang-v1_1`，经 `https://hf-mirror.com` 下载（GitHub 在部分网络不可达）
- 主模型文件 `model.int8.onnx` 体积 109.0MB，`voices.bin` 51.3MB，`lexicon-us-en.txt` 5.7MB
- 输出采样率 24000Hz；**必须**按 `GeneratedAudio.getSampleRate()` 写入 WAV，禁止插值或重采样
- 音色清单：11 个英文音色（美音女声 5 / 美音男声 4 / 英音 2），默认 `kokoro:af_sarah`
- 兜底音色 `piper:lessac`（22050Hz），Kokoro 不可用时自动回退
- espeak-ng-data 与 Piper 共用一份（已实测 355 个文件 SHA-1 全同），不重复打包
- `OfflineTtsKokoroModelConfig` 参数顺序固定：`(model, voices, tokens, dataDir, lexicon, lang, dictDir, lengthScale)`
- 所有配置类的字符串参数为 Kotlin 非空类型：**无值传 `""`，绝不能传 `null`**
- zsh 不用；本仓库用 Git Bash。提交前 `npm run typecheck` 必须通过（pre-commit 钩子会跑 typecheck + eslint）
- 平台为 Windows，路径含反斜杠，写 Node 脚本时用正斜杠或 `path.join`

---

### Task 1: 拉取 Kokoro 模型资产

**Files:**
- Modify: `scripts/fetch-android-tts.cjs`

**Interfaces:**
- Consumes: 无
- Produces: `android/app/src/main/assets/tts/kokoro-int8-multi-lang-v1_1/` 下的 `model.int8.onnx`、`voices.bin`、`tokens.txt`、`lexicon-us-en.txt`

- [ ] **Step 1: 在文件顶部的常量区加入 Kokoro 配置**

找到现有常量块（`const VOICE = 'vits-piper-en_US-lessac-medium';` 附近），在其后追加：

```js
// ── Kokoro 多音色模型（int8 量化）──
// 主模型 109MB，单模型含 103 个音色，输出 24000Hz。
// espeak-ng-data 不在此拉取 —— 与 Piper 音色自带的那份实测逐文件 SHA-1 相同（355 个文件），
// 只保留一份，Kokoro 通过 dataDir 指向 Piper 音色目录复用。
const KOKORO_REPO = 'csukuangfj/kokoro-int8-multi-lang-v1_1';
const KOKORO_DIR_NAME = 'kokoro-int8-multi-lang-v1_1';
/** 白名单：只取英文所需。dict/ 是中文分词，lexicon-zh/gb-en 与 *zh.fst 本项目用不到 */
const KOKORO_FILES = ['model.int8.onnx', 'voices.bin', 'tokens.txt', 'lexicon-us-en.txt'];
```

- [ ] **Step 2: 加入流式下载函数**

109MB 的文件若先 `arrayBuffer()` 会整个读进内存。在现有 `download` 函数之后追加：

```js
/**
 * 流式下载 —— 大文件（100MB+）不能先 arrayBuffer() 全量读进内存。
 * 现有的 download() 用于小文件与并发场景，这里专供大模型。
 */
async function downloadStream(url, dest, label) {
  const tmp = dest + '.part';
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const r = await fetch(url, { signal: AbortSignal.timeout(1800000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const total = Number(r.headers.get('content-length') || 0);
  let got = 0;
  let lastPct = -1;
  const out = fs.createWriteStream(tmp);
  const { Readable } = require('stream');
  const body = Readable.fromWeb(r.body);
  body.on('data', (c) => {
    got += c.length;
    if (total > 0) {
      const pct = Math.floor((got / total) * 100);
      if (pct !== lastPct && pct % 10 === 0) {
        lastPct = pct;
        process.stdout.write(`\r    ${label} ${pct}%  ${mb(got)}/${mb(total)}`);
      }
    }
  });
  await require('stream/promises').pipeline(body, out);
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
  fs.renameSync(tmp, dest);
  return got;
}
```

- [ ] **Step 3: 在 `(async () => { ... })()` 主体中，Piper 音色处理完之后追加 Kokoro 步骤**

定位到 Piper 段的结尾（`console.log(\`\\n完成：AAR + 音色 ${voiceName}，合计新增约 ...\`)` 之前的位置会有个 return，注意 Kokoro 必须放在那个 return 之前，否则离线跳过时不会拉 Kokoro）。

在该处插入：

```js
  // ── 2.5) Kokoro 多音色模型 ──
  const kokoroDir = path.join(ASSETS_DIR, '..', 'tts', KOKORO_DIR_NAME);
  const KOKORO_MIN_BYTES = 100 * 1024 * 1024;

  const kokoroComplete = () => {
    try {
      const m = path.join(kokoroDir, 'model.int8.onnx');
      if (!fs.existsSync(m) || fs.statSync(m).size < KOKORO_MIN_BYTES) return false;
      for (const f of KOKORO_FILES) {
        if (!fs.existsSync(path.join(kokoroDir, f))) return false;
      }
      return true;
    } catch { return false; }
  };

  if (!FORCE && kokoroComplete()) {
    const m = fs.statSync(path.join(kokoroDir, 'model.int8.onnx'));
    console.log(`  跳过 Kokoro（已就位 ${mb(m.size)} 模型）`);
  } else {
    console.log(`  拉取 Kokoro ${KOKORO_DIR_NAME} → assets/tts/${KOKORO_DIR_NAME}/`);
    const files = await listRepo(KOKORO_REPO);
    const wanted = files.filter((f) => KOKORO_FILES.includes(f.path));
    const missing = KOKORO_FILES.filter((n) => !wanted.some((f) => f.path === n));
    if (missing.length) throw new Error(`仓库里找不到这些文件: ${missing.join(', ')}`);
    for (const f of wanted) {
      const dest = path.join(kokoroDir, f.path);
      if (!FORCE && fs.existsSync(dest) && f.size > 0 && fs.statSync(dest).size === f.size) {
        console.log(`    ${f.path} 已就位（${mb(f.size)}）`);
        continue;
      }
      const n = await downloadStream(
        `${MIRROR}/${KOKORO_REPO}/resolve/main/${encodeURIComponent(f.path)}`,
        dest,
        f.path,
      );
      console.log(`  ✓ ${f.path}  ${mb(n)}`);
    }
  }
```

- [ ] **Step 4: 在末尾校验段补上 Kokoro 的报告**

在现有 `console.log('\\n完成：AAR + 音色 ...')` 那一行之后追加：

```js
  for (const f of KOKORO_FILES) {
    const p = path.join(kokoroDir, f);
    console.log(`  ${fs.existsSync(p) ? '✓' : '✗'} kokoro/${f}  ${fs.existsSync(p) ? mb(fs.statSync(p).size) : '缺失'}`);
  }
```

同时把 `--voice` 参数的处理保持不变（Kokoro 不受它影响）。

- [ ] **Step 5: 运行拉取，验证资产落盘**

Run: `cd /b/NativeThink && node scripts/fetch-android-tts.cjs`

Expected 输出包含：
```
  ✓ model.int8.onnx  109.0MB
  ✓ voices.bin  51.3MB
  ✓ lexicon-us-en.txt  5.7MB
  ✓ tokens.txt  ...
  ✓ kokoro/model.int8.onnx  109.0MB
  ✓ kokoro/voices.bin  51.3MB
```

- [ ] **Step 6: 确认体积符合预期**

Run: `du -sh android/app/src/main/assets/tts/kokoro-int8-multi-lang-v1_1/ && ls -la android/app/src/main/assets/tts/kokoro-int8-multi-lang-v1_1/`

Expected: 约 166MB，目录下只有 4 个文件（没有 espeak-ng-data、没有 dict/）

- [ ] **Step 7: 把新资产加入 .gitignore**

166MB 的模型绝不能进版本库（现有 `.gitignore:19` 已用 `android/app/src/main/assets/piper/` 忽略了 Piper 音色，同理）。

先确认当前状态：

Run: `cd /b/NativeThink && git check-ignore -v android/app/src/main/assets/tts/kokoro-int8-multi-lang-v1_1/model.int8.onnx`

Expected: 当前**无输出**（尚未忽略，需要处理）。

在 `.gitignore` 的 `android/app/src/main/assets/piper/` 一行之后追加：

```
android/app/src/main/assets/tts/
```

再验证：

Run: `cd /b/NativeThink && git check-ignore -v android/app/src/main/assets/tts/kokoro-int8-multi-lang-v1_1/model.int8.onnx && git status --short android/app/src/main/assets/`

Expected: 输出 `.gitignore:20:android/app/src/main/assets/tts/`，且 `git status` 不列出任何 Kokoro 模型文件。

- [ ] **Step 8: 提交**

```bash
cd /b/NativeThink
git add scripts/fetch-android-tts.cjs .gitignore
git commit -m "feat(tts): 拉取 Kokoro int8 多音色模型(109MB/103音色) —— 复用 Piper 的 espeak 数据"
```

---

### Task 2: 音色与资产校验脚本

**Files:**
- Create: `scripts/check-tts-voices.cjs`
- Modify: `package.json`（加 script + 串进打包流程）

**Interfaces:**
- Consumes: Task 1 产出的资产文件
- Produces: 可执行校验脚本；退出码 0 表示通过

本任务先建立校验脚手架，Task 4 会往 `tts-voice-catalog.ts` 加真音色后由它守护。为了让脚本在 Task 4 之前也能跑通，本任务先写完整的检查项，并在音色尚未加入时**报告为待办而非失败**。

- [ ] **Step 1: 写校验脚本**

Create `scripts/check-tts-voices.cjs`:

```js
#!/usr/bin/env node
/**
 * 校验离线音色目录与磁盘资产是否自洽。语法：
 *   node scripts/check-tts-voices.cjs
 * 退出码 0 = 通过；1 = 有问题（用于阻断打包）
 *
 * 为什么需要：speakerId 是 voices.bin 里的数组下标，写错不会报错、只会读成别人的声音；
 * 模型路径写错则要装到手机上才发现。这些都能在打包前静态查出来。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets');
const CATALOG = path.join(ROOT, 'src', 'lib', 'tts-voice-catalog.ts');

/** 模型注册表 —— 必须与 SherpaTtsPlugin.java 的 MODEL_* 常量一致 */
const MODELS = {
  'kokoro-v1_1': {
    dir: path.join(ASSETS, 'tts', 'kokoro-int8-multi-lang-v1_1'),
    files: ['model.int8.onnx', 'voices.bin', 'tokens.txt', 'lexicon-us-en.txt'],
    /** Kokoro 复用 Piper 的 espeak 数据 */
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

const errors = [];
const notes = [];

// ── 1) 模型资产 ──
for (const [id, m] of Object.entries(MODELS)) {
  if (!fs.existsSync(m.dir)) {
    errors.push(`模型 ${id}: 目录不存在 ${path.relative(ROOT, m.dir)}（先跑 node scripts/fetch-android-tts.cjs）`);
    continue;
  }
  for (const f of m.files) {
    const p = path.join(m.dir, f);
    if (!fs.existsSync(p)) {
      errors.push(`模型 ${id}: 缺文件 ${f}`);
    } else if (fs.statSync(p).size === 0) {
      errors.push(`模型 ${id}: 文件为空 ${f}`);
    }
  }
  // espeak 数据（dataDir 下须有 espeak-ng-data）
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
// 抓 KOKORO_VOICES 数组里的 { id: '...', ... speakerId: N }
const block = src.match(/export const KOKORO_VOICES[^=]*=\s*\[([\s\S]*?)\n\];/);
if (!block) {
  notes.push('KOKORO_VOICES 尚未定义（Task 4 加入）');
} else {
  const voices = [...block[1].matchAll(/id:\s*'([^']+)'[\s\S]*?modelId:\s*'([^']+)'[\s\S]*?speakerId:\s*(\d+)/g)]
    .map((m) => ({ id: m[1], modelId: m[2], speakerId: Number(m[3]) }));
  if (voices.length === 0) {
    notes.push('KOKORO_VOICES 为空（Task 4 填充）');
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
    const KOKORO_COUNT = voices.filter((v) => v.modelId === 'kokoro-v1_1').length;
    if (KOKORO_COUNT !== 11) {
      notes.push(`Kokoro 音色数 ${KOKORO_COUNT}，设计为 11 个`);
    }
    console.log(`  音色 ${voices.length} 个（Kokoro ${KOKORO_COUNT}），全部通过边界检查`);
  }
}

// ── 3) 默认与兜底音色 ──
const defId = src.match(/DEFAULT_LOCAL_VOICE_ID\s*=\s*'([^']+)'/);
if (!defId) notes.push('DEFAULT_LOCAL_VOICE_ID 尚未定义（Task 4 加入）');
else {
  const body = block ? block[1] : '';
  if (body && !body.includes(`'${defId[1]}'`)) {
    errors.push(`DEFAULT_LOCAL_VOICE_ID='${defId[1]}' 不在 KOKORO_VOICES 里`);
  }
}
if (!/FALLBACK_VOICE/.test(src)) notes.push('FALLBACK_VOICE 尚未定义（Task 4 加入）');

// ── 输出 ──
const mb = (n) => (n / 1024 / 1024).toFixed(1) + 'MB';
let total = 0;
if (fs.existsSync(MODELS['kokoro-v1_1'].dir)) {
  for (const f of fs.readdirSync(MODELS['kokoro-v1_1'].dir)) {
    total += fs.statSync(path.join(MODELS['kokoro-v1_1'].dir, f)).size;
  }
}
console.log(`  Kokoro 资产合计 ${mb(total)}`);

for (const n of notes) console.log(`  · 待办: ${n}`);

if (errors.length) {
  console.error('\n✗ 音色校验失败:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('✓ 音色校验通过');
```

- [ ] **Step 2: 加 npm script 并串进打包流程**

Modify `package.json`，在 `scripts` 中加入：

```json
    "check:tts-voices": "node scripts/check-tts-voices.cjs",
```

并把 `package:apk` 改为先校验：

```json
    "package:apk": "npm run check:tts-voices && node node_modules/@capacitor/cli/bin/capacitor copy android && node scripts/android-copy-models.cjs && cd android && gradlew.bat assembleDebug && cd .. && node -e \"fs.copyFileSync('android/app/build/outputs/apk/debug/app-debug.apk', 'release/NativeThink-mobile-debug.apk')\"",
```

- [ ] **Step 3: 运行校验，确认当前状态**

Run: `cd /b/NativeThink && npm run check:tts-voices`

Expected: 输出 `✓ 音色校验通过`，并列出 `· 待办: KOKORO_VOICES 尚未定义（Task 4 加入）` 等条目，退出码 0。

**如果 Kokoro 资产缺失**（Task 1 未跑或失败），会输出 `✗ 音色校验失败` 并以退出码 1 结束 —— 这正是期望行为，先回去把 Task 1 跑通。

- [ ] **Step 4: 提交**

```bash
cd /b/NativeThink
git add scripts/check-tts-voices.cjs package.json
git commit -m "feat(tts): 音色与资产校验脚本 —— speakerId 越界/模型缺文件在打包前拦截"
```

---

### Task 3: 原生插件支持多模型与 speakerId

**Files:**
- Modify: `android/app/src/main/java/com/nativethink/app/SherpaTtsPlugin.java`

**Interfaces:**
- Consumes: Task 1 的资产目录布局
- Produces: `speak` 接受 `{ text, modelId, speakerId, speed }`；`status` 返回 `loadedModels` / `errorByModel`

这是本计划的核心任务。改动多，但都在一个文件内。

- [ ] **Step 1: 替换常量与字段**

把现有的：

```java
    /** assets 下的音色目录（由 scripts/fetch-android-tts.cjs 拉取） */
    private static final String ASSET_VOICE_DIR = "piper/vits-piper-en_US-lessac-medium";
    private static final String MODEL_NAME = "en_US-lessac-medium.onnx";
```

替换为：

```java
    // ── 模型注册表 ──
    // 每个模型一个独立 OfflineTts 实例，按需加载（Kokoro 109MB 模型不宜开机即载）。
    // 新增模型时同时更新 scripts/check-tts-voices.cjs 的 MODELS 表，二者必须一致。
    private static final String MODEL_KOKORO = "kokoro-v1_1";
    private static final String MODEL_LESSAC = "piper-lessac";

    /** Kokoro：assets/tts/ 下的多音色模型（int8 量化，103 个音色，24000Hz） */
    private static final String KOKORO_ASSET_DIR = "tts/kokoro-int8-multi-lang-v1_1";
    /** Piper 兜底音色：assets/piper/ 下（22050Hz，单音色） */
    private static final String LESSAC_ASSET_DIR = "piper/vits-piper-en_US-lessac-medium";

    /** espeak-ng-data 的父目录 —— Kokoro 复用 Piper 这份数据（实测 355 个文件完全一致），不重复打包 */
    private static final String SHARED_ESPEAK_PARENT = LESSAC_ASSET_DIR;
```

把字段区改为：

```java
    /** 已加载的引擎，按 modelId 索引。sherpa-onnx 的 generate 非线程安全，故整体串行化 */
    private final java.util.concurrent.ConcurrentHashMap<String, OfflineTts> engines =
            new java.util.concurrent.ConcurrentHashMap<>();
    /** 各模型加载失败原因（Kokoro 失败不应掩盖 lessac 的可用性） */
    private final java.util.concurrent.ConcurrentHashMap<String, String> modelErrors =
            new java.util.concurrent.ConcurrentHashMap<>();
    /** 各模型摊包后的目录 */
    private final java.util.concurrent.ConcurrentHashMap<String, File> modelDirs =
            new java.util.concurrent.ConcurrentHashMap<>();
```

删掉原来的 `private OfflineTts tts;` 和 `private File modelDir;`（`wavDir`、`progressLog`、`synthLock` 保留）。

- [ ] **Step 2: 加入模型配置定义与解析**

删掉现有的 `buildConfig(...)` 方法，替换为：

```java
    /** 一个模型的全部配置 */
    private static final class ModelDef {
        final String assetDir;      // assets 下的源目录
        final String kind;          // "kokoro" | "vits"
        final String modelFile;     // 模型文件名
        final String tokensFile;
        final String voicesFile;    // kokoro 专用
        final String lexiconFile;   // kokoro 专用，无则 null
        final String lang;          // kokoro 专用
        final boolean sharedEspeak; // dataDir 是否指向共享的 Piper 目录
        ModelDef(String assetDir, String kind, String modelFile, String tokensFile,
                 String voicesFile, String lexiconFile, String lang, boolean sharedEspeak) {
            this.assetDir = assetDir;
            this.kind = kind;
            this.modelFile = modelFile;
            this.tokensFile = tokensFile;
            this.voicesFile = voicesFile;
            this.lexiconFile = lexiconFile;
            this.lang = lang;
            this.sharedEspeak = sharedEspeak;
        }
    }

    private static final java.util.Map<String, ModelDef> REGISTRY = new java.util.HashMap<>();
    static {
        REGISTRY.put(MODEL_KOKORO, new ModelDef(
                KOKORO_ASSET_DIR, "kokoro", "model.int8.onnx", "tokens.txt",
                "voices.bin", "lexicon-us-en.txt", "en-us", true));
        REGISTRY.put(MODEL_LESSAC, new ModelDef(
                LESSAC_ASSET_DIR, "vits", "en_US-lessac-medium.onnx", "tokens.txt",
                null, null, null, false));
    }

    /**
     * 组装 sherpa-onnx 配置。
     *
     * 注意：这些配置类由 Kotlin 生成，字符串参数全是**非空类型**，构造函数里有
     * Intrinsics.checkNotNullParameter —— 传 null 会立刻抛 NullPointerException。
     * 未用到的子配置也必须给空实例（不能传 null）。
     *
     * Kokoro 的参数顺序不可错位：lang 在 lexicon 之后、dictDir 之前。
     *
     * @param ctx 用于推导模型自身的目录（模型文件都在那里）
     * @param espeakParent espeak-ng-data 的父目录。共享时为 Piper 音色目录，否则为模型自身目录。
     */
    private static OfflineTtsConfig buildConfig(android.content.Context ctx, ModelDef def, File espeakParent) {
        File dir = new File(ctx.getFilesDir(), def.assetDir);
        String dataDirPath = espeakParent.getAbsolutePath();

        OfflineTtsVitsModelConfig vits;
        OfflineTtsKokoroModelConfig kokoro;
        if ("kokoro".equals(def.kind)) {
            vits = new OfflineTtsVitsModelConfig("", "", "", "", "", 0.667f, 0.8f, 1.0f);
            kokoro = new OfflineTtsKokoroModelConfig(
                    new File(dir, def.modelFile).getAbsolutePath(),
                    new File(dir, def.voicesFile).getAbsolutePath(),
                    new File(dir, def.tokensFile).getAbsolutePath(),
                    dataDirPath,                                     // espeak-ng-data 的父目录
                    def.lexiconFile == null ? "" : new File(dir, def.lexiconFile).getAbsolutePath(),
                    def.lang == null ? "" : def.lang,
                    "",                                              // dictDir：中文分词用，英文传空
                    1.0f);                                           // lengthScale：语速走 generate 的 speed
        } else {
            vits = new OfflineTtsVitsModelConfig(
                    new File(dir, def.modelFile).getAbsolutePath(),
                    "",
                    new File(dir, def.tokensFile).getAbsolutePath(),
                    dataDirPath,
                    "",
                    0.667f, 0.8f, 1.0f);
            kokoro = new OfflineTtsKokoroModelConfig("", "", "", "", "", "", "", 1.0f);
        }

        OfflineTtsModelConfig model = new OfflineTtsModelConfig(
                vits,
                new OfflineTtsMatchaModelConfig(),
                kokoro,
                new OfflineTtsKittenModelConfig(),
                Math.max(2, Runtime.getRuntime().availableProcessors() / 2),
                false,
                "cpu");
        return new OfflineTtsConfig(model, "", "", 1, 0.2f);
    }
```

> `sharedEspeak` 的路径推导：`dir` 是 `filesDir/tts/kokoro-int8-multi-lang-v1_1`，其父是 `filesDir/tts`、父的父是 `filesDir`，再拼上 `piper/vits-piper-en_US-lessac-medium` 即为共享 espeak 的父目录。

- [ ] **Step 3: 加入懒加载方法**

在 `buildConfig` 之后加入：

```java
    /** 按需加载模型（幂等）。Kokoro 109MB，首次摊包+建引擎需数秒，故放后台线程。 */
    private OfflineTts ensureModel(String modelId) throws Exception {
        ModelDef def = REGISTRY.get(modelId);
        if (def == null) throw new IllegalArgumentException("unknown_model:" + modelId);
        OfflineTts cached = engines.get(modelId);
        if (cached != null) return cached;

        String err = modelErrors.get(modelId);
        if (err != null) throw new IllegalStateException("model_load_failed:" + modelId + ":" + err);

        synchronized (synthLock) {
            cached = engines.get(modelId);
            if (cached != null) return cached;
            try {
                File dir = new File(getContext().getFilesDir(), def.assetDir);
                modelDirs.put(modelId, dir);
                step("ensureModel " + modelId + ": copying assets → " + dir);
                copyAssets(def.assetDir, dir);

                // 共享 espeak：Kokoro 不打包 espeak-ng-data，靠这份数据工作。
                // 正常流程里 Piper 资产在拉取时已就位，这里只是兜住「asset 里没有」的异常情况。
                File espeakParent;
                if (def.sharedEspeak) {
                    File shared = new File(getContext().getFilesDir(), SHARED_ESPEAK_PARENT);
                    if (!new File(shared, "espeak-ng-data").isDirectory()) {
                        step("shared espeak missing; copying " + SHARED_ESPEAK_PARENT);
                        copyAssets(SHARED_ESPEAK_PARENT, shared);
                    }
                    espeakParent = shared;
                } else {
                    espeakParent = dir;
                }
                try {
                    // eSpeak 优先读这个环境变量；不是所有 ROM 都允许设置，失败不影响主路径
                    android.system.Os.setenv("ESPEAK_DATA_PATH", espeakParent.getAbsolutePath(), true);
                } catch (Throwable ignored) { /* ignore */ }

                long t0 = System.currentTimeMillis();
                step("creating engine " + modelId + " kind=" + def.kind);
                // assetManager 必须传 null：非 null 会走 newFromAsset 分支，把真实文件路径
                // 当 assets 名解析 → 原生层找不到 → 崩溃。（此前踩过这个坑）
                OfflineTts engine = new OfflineTts((AssetManager) null, buildConfig(getContext(), def, espeakParent));
                engines.put(modelId, engine);
                modelErrors.remove(modelId);
                step("ready " + modelId + " in " + (System.currentTimeMillis() - t0)
                        + "ms, sampleRate=" + engine.sampleRate()
                        + " numSpeakers=" + engine.numSpeakers());
                return engine;
            } catch (Throwable t) {
                String msg = describe(t);
                modelErrors.put(modelId, msg);
                step("failed " + modelId + ": " + msg);
                throw new Exception(msg, t);
            }
        }
    }
```

- [ ] **Step 4: 改写 `init` / `status` / `stateObject`**

把 `init` 改为「预加载默认模型（Kokoro）」，把 `status` 改为报告多模型状态：

```java
    /** 预热默认模型（Kokoro）。前端进入阅读/学习页时提前调用。 */
    @PluginMethod
    public void init(PluginCall call) {
        ensureDirs();
        state = STATE_LOADING;
        new Thread(() -> {
            try {
                ensureModel(MODEL_KOKORO);
                state = STATE_READY;
                lastError = null;
            } catch (Throwable t) {
                // Kokoro 不可用不算致命 —— lessac 兜底仍可朗读
                state = STATE_ERROR;
                lastError = describe(t);
            }
            call.resolve(stateObject());
        }).start();
    }
```

`stateObject()` 改为：

```java
    private JSObject stateObject() {
        JSObject o = new JSObject();
        OfflineTts main = engines.get(MODEL_KOKORO);
        o.put("status", state);
        o.put("error", lastError);
        o.put("sampleRate", main != null ? main.sampleRate() : 0);
        o.put("cached", wavDir != null && wavDir.exists() ? wavDir.list().length : 0);
        o.put("route", "files");

        JSArray loaded = new JSArray();
        for (java.util.Map.Entry<String, OfflineTts> e : engines.entrySet()) {
            JSObject m = new JSObject();
            m.put("modelId", e.getKey());
            m.put("sampleRate", e.getValue().sampleRate());
            m.put("numSpeakers", e.getValue().numSpeakers());
            loaded.put(m);
        }
        o.put("loadedModels", loaded);

        JSObject errs = new JSObject();
        for (java.util.Map.Entry<String, String> e : modelErrors.entrySet()) {
            errs.put(e.getKey(), e.getValue());
        }
        o.put("errorByModel", errs);

        try {
            File dir = modelDirs.get(MODEL_KOKORO);
            if (dir != null) {
                File model = new File(dir, "model.int8.onnx");
                o.put("modelBytes", model.exists() ? model.length() : 0);
                File espeak = new File(new File(getContext().getFilesDir(), SHARED_ESPEAK_PARENT), "espeak-ng-data");
                o.put("espeakFiles", espeak.isDirectory() && espeak.list() != null ? espeak.list().length : 0);
            }
        } catch (Throwable ignored) { /* 仅诊断用 */ }
        return o;
    }
```

需要在文件顶部的 import 区加入：

```java
import com.getcapacitor.JSArray;
```

- [ ] **Step 5: 改写 `speak` —— 接受 modelId + speakerId，缓存 key 加音色维度**

```java
    /**
     * 合成一段文本为 WAV。
     * 参数: { text: string, modelId: string, speakerId?: number, speed?: number (1.0=原速) }
     * 返回: { path, bytes, durationMs, cached, ms }
     */
    @PluginMethod
    public void speak(PluginCall call) {
        ensureDirs();
        final String text = call.getString("text", "");
        final String modelId = call.getString("modelId", MODEL_LESSAC);
        final Integer speakerId = call.getInt("speakerId", 0);
        Double speedOpt = call.getDouble("speed", 1.0);
        final double speed = speedOpt == null ? 1.0 : speedOpt;

        if (text == null || text.trim().isEmpty()) {
            call.reject("empty_text");
            return;
        }
        if (!REGISTRY.containsKey(modelId)) {
            // 未知模型直接拒绝，不静默回退到别的模型 —— 否则会读出错误音色且难以察觉
            call.reject("unknown_model:" + modelId);
            return;
        }

        new Thread(() -> {
            try {
                OfflineTts engine = ensureModel(modelId);

                final int sid = speakerId == null ? 0 : speakerId;
                int nsp = engine.numSpeakers();
                if (sid < 0 || sid >= nsp) {
                    // 越界不抛给原生层 —— 那里是数组下标，会直接崩
                    call.reject("speaker_out_of_range:" + sid + "/" + nsp);
                    return;
                }

                // 缓存 key 必须含 modelId 与 speakerId：只按文本+语速缓存会让换音色播出上一个音色
                File wav = new File(wavDir, sha1(modelId + "|" + sid + "|" + speed + "|" + text) + ".wav");
                boolean cached = wav.exists() && wav.length() > 1024;
                long t0 = System.currentTimeMillis();
                if (!cached) {
                    float[] samples;
                    int sampleRate;
                    synchronized (synthLock) {
                        GeneratedAudio audio = engine.generate(text, sid, (float) speed);
                        samples = audio != null ? audio.getSamples() : null;
                        sampleRate = audio != null ? audio.getSampleRate() : 0;
                    }
                    if (samples == null || samples.length == 0) throw new IOException("generate_returned_empty");
                    File tmp = new File(wav.getAbsolutePath() + ".part");
                    writeWav(tmp, samples, sampleRate);
                    if (!tmp.renameTo(wav)) throw new IOException("rename_failed");
                }
                JSObject r = new JSObject();
                r.put("path", wav.getAbsolutePath());
                r.put("bytes", wav.length());
                r.put("durationMs", estimateDurationMs(wav));
                r.put("cached", cached);
                r.put("ms", System.currentTimeMillis() - t0);
                call.resolve(r);
            } catch (Throwable t) {
                call.reject(t.getClass().getSimpleName() + ": " + t.getMessage());
            }
        }).start();
    }
```

- [ ] **Step 6: 编译验证**

Run: `cd /b/NativeThink/android && ./gradlew.bat compileDebugJavaWithJavac 2>&1 | tail -30`

Expected: `BUILD SUCCESSFUL`。若报 `JSArray` 找不到，确认 Step 4 的 import 已加；若报 `OfflineTtsKokoroModelConfig` 参数不匹配，对照 §Global Constraints 里的参数顺序。

- [ ] **Step 7: 确认没有遗漏的旧符号引用**

Run: `cd /b/NativeThink && grep -n "ASSET_VOICE_DIR\|MODEL_NAME\|private OfflineTts tts;" android/app/src/main/java/com/nativethink/app/SherpaTtsPlugin.java`

Expected: 无输出（旧符号已全部替换）。注意 `MODEL_KOKORO` / `MODEL_LESSAC` 是新常量，不要误判为残留。

- [ ] **Step 8: 提交**

```bash
cd /b/NativeThink
git add android/app/src/main/java/com/nativethink/app/SherpaTtsPlugin.java
git commit -m "feat(tts): 原生插件支持多模型与 speakerId —— 修掉换音色串音的缓存 key"
```

---

### Task 4: 音色目录与 JS SDK

**Files:**
- Modify: `src/lib/tts-voice-catalog.ts`（加 `ILocalVoice` / `KOKORO_VOICES` / `FALLBACK_VOICE` / `DEFAULT_LOCAL_VOICE_ID`）
- Modify: `src/lib/sherpa-tts.ts`（多音色 API + 回退链）

**Interfaces:**
- Consumes: Task 3 的 `speak({text, modelId, speakerId, speed})`
- Produces:
  - `ILocalVoice`、`KOKORO_VOICES: ILocalVoice[]`、`FALLBACK_VOICE: ILocalVoice`、`DEFAULT_LOCAL_VOICE_ID: string`、`findLocalVoice(id): ILocalVoice | null`、`isLocalVoiceId(id): boolean`
  - `sherpaSpeak(text, opts?): Promise<{path?, url, durationMs, cached, ms}>`、`sherpaPrewarm(text, opts?): void`、`listLocalVoices(): ILocalVoice[]`
  - `ISherpaStatus.loadedModels?: ISherpaLoadedModel[]`、`ISherpaStatus.errorByModel?: Record<string, string>`

- [ ] **Step 1: 在 `tts-voice-catalog.ts` 末尾追加本地音色定义**

```ts
// ── 本地离线音色（sherpa-onnx + Kokoro int8）──
//
// 与上面 Edge 在线目录的区别：这些音色在设备内合成，不联网。
// speakerId 是 voices.bin 里的数组下标，**写错不会报错、只会读成别人的声音**，
// 故改动后必须真机试听确认（见 docs/superpowers/specs/2026-09-18-offline-tts-multivoice-design.md §6.2）。
// 边界由 scripts/check-tts-voices.cjs 在打包前静态校验。

export interface ILocalVoice {
  /** 传给 sherpaSpeak 的 voiceId，形如 kokoro:af_sarah */
  id: string;
  name: string;
  gender: 'female' | 'male';
  accent: '美音' | '英音';
  /** 原生侧模型注册表的 key —— 必须与 SherpaTtsPlugin.java 的 MODEL_* 常量一致 */
  modelId: 'kokoro-v1_1' | 'piper-lessac';
  /** voices.bin 里的数组下标 */
  speakerId: number;
  /** 一句定位描述，设置页显示 */
  note: string;
}

/**
 * Kokoro int8 多语模型的 11 个英文音色。
 * speakerId 初始值取自 sherpa 官方文档的 v1_0 speaker 表（v1_1 无公开表），
 * 待真机试听校准；若名不符实，改这里的数字即可，无需改原生代码。
 */
export const KOKORO_VOICES: ILocalVoice[] = [
  { id: 'kokoro:af_bella', name: 'Bella', gender: 'female', accent: '美音', modelId: 'kokoro-v1_1', speakerId: 2, note: '温暖亲切' },
  { id: 'kokoro:af_heart', name: 'Heart', gender: 'female', accent: '美音', modelId: 'kokoro-v1_1', speakerId: 3, note: '柔和自然' },
  { id: 'kokoro:af_nicole', name: 'Nicole', gender: 'female', accent: '美音', modelId: 'kokoro-v1_1', speakerId: 6, note: '轻柔低语' },
  { id: 'kokoro:af_sarah', name: 'Sarah', gender: 'female', accent: '美音', modelId: 'kokoro-v1_1', speakerId: 9, note: '清晰标准' },
  { id: 'kokoro:af_sky', name: 'Sky', gender: 'female', accent: '美音', modelId: 'kokoro-v1_1', speakerId: 10, note: '年轻活泼' },
  { id: 'kokoro:am_adam', name: 'Adam', gender: 'male', accent: '美音', modelId: 'kokoro-v1_1', speakerId: 11, note: '沉稳' },
  { id: 'kokoro:am_michael', name: 'Michael', gender: 'male', accent: '美音', modelId: 'kokoro-v1_1', speakerId: 16, note: '自然' },
  { id: 'kokoro:am_puck', name: 'Puck', gender: 'male', accent: '美音', modelId: 'kokoro-v1_1', speakerId: 18, note: '活泼' },
  { id: 'kokoro:am_santa', name: 'Santa', gender: 'male', accent: '美音', modelId: 'kokoro-v1_1', speakerId: 19, note: '低沉厚重' },
  { id: 'kokoro:bf_emma', name: 'Emma', gender: 'female', accent: '英音', modelId: 'kokoro-v1_1', speakerId: 21, note: '标准英音' },
  { id: 'kokoro:bm_george', name: 'George', gender: 'male', accent: '英音', modelId: 'kokoro-v1_1', speakerId: 26, note: '沉稳英音' },
];

/** 兜底音色 —— Kokoro 不可用时自动回退（22050Hz，真机已验证可跑） */
export const FALLBACK_VOICE: ILocalVoice = {
  id: 'piper:lessac', name: 'Lessac', gender: 'female', accent: '美音',
  modelId: 'piper-lessac', speakerId: 0, note: '经典音色',
};

/** 未选择音色时使用 */
export const DEFAULT_LOCAL_VOICE_ID = 'kokoro:af_sarah';

/** 本地音色全集（含兜底） */
export function listLocalVoices(): ILocalVoice[] {
  return [...KOKORO_VOICES, FALLBACK_VOICE];
}

/** 是否为本地离线音色 id */
export function isLocalVoiceId(uri: string | null | undefined): boolean {
  return !!uri && (uri.startsWith('kokoro:') || uri.startsWith('piper:'));
}

/** 按 id 取本地音色；找不到返回 null（调用方自行决定回退） */
export function findLocalVoice(uri: string | null | undefined): ILocalVoice | null {
  if (!uri) return null;
  return listLocalVoices().find((v) => v.id === uri) ?? null;
}
```

- [ ] **Step 2: 运行校验脚本，确认音色被正确识别**

Run: `cd /b/NativeThink && npm run check:tts-voices`

Expected: 输出含 `音色 12 个（Kokoro 11），全部通过边界检查` 和 `✓ 音色校验通过`，且**不再**出现 `KOKORO_VOICES 尚未定义` 待办。剩余待办只应有 `FALLBACK_VOICE` 相关项（若 Step 1 已写则也无）。

- [ ] **Step 3: 故意写错一个 speakerId，确认校验能拦住**

把 `af_bella` 的 `speakerId: 2` 改成 `speakerId: 200`，然后：

Run: `cd /b/NativeThink && npm run check:tts-voices; echo "退出码=$?"`

Expected: 输出 `✗ 音色校验失败` + `speakerId 200 越界（模型 kokoro-v1_1 只有 103 个音色）`，退出码 1。

改回 `speakerId: 2`。

- [ ] **Step 4: 改造 `sherpa-tts.ts` 的类型与状态结构**

把 `ISherpaStatus` 替换为：

```ts
export interface ISherpaLoadedModel {
  modelId: string;
  sampleRate: number;
  numSpeakers: number;
}

export interface ISherpaStatus {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  sampleRate: number;
  cached: number;
  /** 初始化走通的路线：assets（直读）或 files（摊到内部存储） */
  route?: string | null;
  /** 已摊出的模型字节数（诊断用） */
  modelBytes?: number;
  /** espeak 音素数据文件数（诊断用） */
  espeakFiles?: number;
  /** 已加载的模型与各自能力（多音色后新增） */
  loadedModels?: ISherpaLoadedModel[];
  /** 按模型记失败原因 —— Kokoro 失败不影响 lessac 可用 */
  errorByModel?: Record<string, string>;
}
```

把 `ISherpaTtsPlugin` 的 `speak` 签名改为：

```ts
interface ISherpaTtsPlugin {
  status(): Promise<ISherpaStatus>;
  init(): Promise<ISherpaStatus>;
  speak(options: { text: string; modelId: string; speakerId: number; speed?: number }): Promise<ISherpaSpeakResult>;
  purge(): Promise<{ removed: number }>;
  readLog(): Promise<{ log: string }>;
}
```

- [ ] **Step 5: 改造 `sherpaSpeak` / `sherpaPrewarm`，加入回退链**

把现有 `keyOf` / `sherpaSpeak` / `sherpaPrewarm` 三个函数整体替换为：

```ts
/** 合成选项：voiceId 省略时用默认音色；第二参数传数字视为 speed（兼容历史签名） */
export interface ISherpaSpeakOptions {
  voiceId?: string | null;
  speed?: number;
}

function normalizeOpts(opts?: ISherpaSpeakOptions | number): { voiceId: string; speed: number } {
  if (typeof opts === 'number') return { voiceId: DEFAULT_LOCAL_VOICE_ID, speed: opts };
  return {
    voiceId: opts?.voiceId || DEFAULT_LOCAL_VOICE_ID,
    speed: typeof opts?.speed === 'number' ? opts.speed : 1,
  };
}

/** 缓存 key 必须含音色 —— 只按文本+语速缓存会让换音色播出上一个音色的音频 */
function keyOf(voiceId: string, text: string, speed: number): string {
  return `${voiceId}|${speed.toFixed(2)}|${text}`;
}

/** 提示一次音色回退（5 秒内不重复，避免刷屏） */
let _lastVoiceFallback = 0;
function notifyVoiceFallback(from: string, to: string): void {
  const now = Date.now();
  if (now - _lastVoiceFallback < 5000) return;
  _lastVoiceFallback = now;
  void import('sonner').then(({ toast }) => {
    toast.info(`音色「${from}」暂不可用，已改用「${to}」`, { duration: 4000 });
  }).catch(() => { /* 通知失败不影响朗读 */ });
}

/**
 * 合成并返回可播放 URL（设备内合成，不联网）。
 * 音色不可用时自动回退到 lessac；两者都不行才抛错，交由 use-tts 降级到系统/云端引擎。
 */
export async function sherpaSpeak(
  text: string,
  opts?: ISherpaSpeakOptions | number,
): Promise<{ url: string; durationMs: number; cached: boolean; ms: number }> {
  const clean = text.trim();
  if (!clean) throw new Error('empty_text');
  const { voiceId, speed } = normalizeOpts(opts);

  const hit = urlCache.get(keyOf(voiceId, clean, speed));
  if (hit) return { ...hit, cached: true, ms: 0 };

  await warmSherpa();

  const requested = findLocalVoice(voiceId) ?? FALLBACK_VOICE;
  let voice = requested;
  let res: ISherpaSpeakResult;
  try {
    res = await SherpaTts.speak({
      text: clean, modelId: voice.modelId, speakerId: voice.speakerId, speed,
    });
  } catch (e) {
    // 请求的音色失败 → 回退兜底音色；兜底也失败就把错误抛给上层
    if (voice.id === FALLBACK_VOICE.id) throw e;
    voice = FALLBACK_VOICE;
    const fbHit = urlCache.get(keyOf(voice.id, clean, speed));
    if (fbHit) {
      notifyVoiceFallback(requested.name, FALLBACK_VOICE.name);
      return { ...fbHit, cached: true, ms: 0 };
    }
    res = await SherpaTts.speak({
      text: clean, modelId: voice.modelId, speakerId: voice.speakerId, speed,
    });
    notifyVoiceFallback(requested.name, FALLBACK_VOICE.name);
  }

  const url = Capacitor.convertFileSrc(res.path);
  if (urlCache.size >= MAX_CACHE) {
    const oldest = urlCache.keys().next().value;
    if (oldest !== undefined) urlCache.delete(oldest);
  }
  urlCache.set(keyOf(voice.id, clean, speed), { url, durationMs: res.durationMs });
  return { url, durationMs: res.durationMs, cached: res.cached, ms: res.ms };
}

/** 只预热不播放（供阅读器/学习页提前合成下一段） */
export function sherpaPrewarm(text: string, opts?: ISherpaSpeakOptions | number): void {
  if (!isSherpaAvailable() || !text.trim()) return;
  const { voiceId, speed } = normalizeOpts(opts);
  if (urlCache.has(keyOf(voiceId, text.trim(), speed))) return;
  void sherpaSpeak(text, { voiceId, speed }).catch(() => {});
}
```

- [ ] **Step 6: 在 import 区引入音色目录**

在 `sherpa-tts.ts` 顶部的现有 import 之后加入这一行（`ISherpaSpeakResult` 定义在本文件内，不要从别处导入）：

```ts
import { DEFAULT_LOCAL_VOICE_ID, FALLBACK_VOICE, findLocalVoice } from './tts-voice-catalog';
```

- [ ] **Step 7: 重新导出音色查询，供设置页使用**

在 `sherpa-tts.ts` 末尾追加：

```ts
/** 本地离线音色列表（转发自音色目录，避免设置页多引一个模块） */
export { listLocalVoices, KOKORO_VOICES } from './tts-voice-catalog';
export type { ILocalVoice } from './tts-voice-catalog';
```

- [ ] **Step 8: 类型检查**

Run: `cd /b/NativeThink && npm run typecheck`

Expected: 通过，无错误。若报 `urlCache` / `MAX_CACHE` 未定义，说明 Step 5 的替换范围过大——那两个定义应保留。

- [ ] **Step 9: 提交**

```bash
cd /b/NativeThink
git add src/lib/tts-voice-catalog.ts src/lib/sherpa-tts.ts
git commit -m "feat(tts): JS SDK 支持 11 个本地音色 + 加载失败自动回退 lessac"
```

---

### Task 5: 接入朗读链路

**Files:**
- Modify: `src/lib/use-tts.ts`

**Interfaces:**
- Consumes: Task 4 的 `sherpaSpeak(text, {voiceId, speed})`、`sherpaPrewarm(text, {voiceId, speed})`
- Produces: piper 档位按用户所选音色朗读

- [ ] **Step 1: 加入音色解析辅助函数**

在 `use-tts.ts` 的 import 区把 sherpa 相关的引入补上音色工具：

```ts
import { isBundledEngineDisabled, isSherpaAvailable, sherpaPrewarm, sherpaSpeak, warmSherpa } from './sherpa-tts';
import { findLocalVoice, isLocalVoiceId, DEFAULT_LOCAL_VOICE_ID } from './tts-voice-catalog';
```

在 `edgeVoiceFor` 函数之后加入：

```ts
/**
 * 内置离线引擎该用哪个音色。
 * 用户显式选了本地音色 → 用它；选了在线/系统音色 → 内置引擎用默认音色
 * （此时用户要的声音在线通道负责，内置引擎只是网络不可用时的兜底）。
 */
function localVoiceIdFor(selectedURI: string | null | undefined): string {
  return isLocalVoiceId(selectedURI) && findLocalVoice(selectedURI)
    ? (selectedURI as string)
    : DEFAULT_LOCAL_VOICE_ID;
}
```

- [ ] **Step 2: piper 档位传入音色**

把 `use-tts.ts` 的 piper 分支：

```ts
      if (engine === 'piper') {
        // 内置离线引擎：设备内合成（不联网），起播几十毫秒；下一段顺手预合成
        const t0 = Date.now();
        const next = chunks[idx + 1];
        if (next) sherpaPrewarm(next, rate);
        sherpaSpeak(chunks[idx], rate)
          .then(({ url }) => playUrl(url, { engine: 'piper', t0 }))
          .catch(onFail);
        return;
      }
```

改为：

```ts
      if (engine === 'piper') {
        // 内置离线引擎：设备内合成（不联网），起播几十毫秒；下一段顺手预合成
        const t0 = Date.now();
        const voiceId = localVoiceIdFor(settings.selectedVoiceURI);
        const next = chunks[idx + 1];
        if (next) sherpaPrewarm(next, { voiceId, speed: rate });
        sherpaSpeak(chunks[idx], { voiceId, speed: rate })
          .then(({ url }) => playUrl(url, { engine: 'piper', t0 }))
          .catch(onFail);
        return;
      }
```

- [ ] **Step 3: 另一处 prewarm 也传音色**

在 `use-tts.ts:725` 附近把：

```ts
      sherpaPrewarm(cleaned, rate);
```

改为：

```ts
      sherpaPrewarm(cleaned, { voiceId: localVoiceIdFor(settings.selectedVoiceURI), speed: rate });
```

- [ ] **Step 4: 确认没有遗漏的旧签名调用**

Run: `cd /b/NativeThink && grep -n "sherpaSpeak(\|sherpaPrewarm(" src/lib/use-tts.ts`

Expected: 三处调用全部传对象形式（`{ voiceId, speed }`），无 `(text, rate)` 形式的残留。

- [ ] **Step 5: 类型检查**

Run: `cd /b/NativeThink && npm run typecheck`

Expected: 通过。

- [ ] **Step 6: 提交**

```bash
cd /b/NativeThink
git add src/lib/use-tts.ts
git commit -m "feat(tts): 朗读链路按用户所选音色合成"
```

---

### Task 6: 设置页音色选择与试听

**Files:**
- Modify: `src/components/TTSSettings.tsx`

**Interfaces:**
- Consumes: Task 4 的 `KOKORO_VOICES` / `listLocalVoices`、Task 5 已打通的朗读链路
- Produces: 设置页可选 11 个本地音色并逐一试听

现有设置页有一个语音 `<Select>`，目前只列系统语音与 Edge 在线音色。本任务在其中加入本地音色分组。

- [ ] **Step 1: 引入本地音色**

在 `TTSSettings.tsx` 的 import 区加入：

```ts
import { KOKORO_VOICES, FALLBACK_VOICE, isLocalVoiceId } from '@/lib/tts-voice-catalog';
```

- [ ] **Step 2: 把本地音色并入候选列表**

找到把系统语音与在线目录合成 `VoiceOption[]` 的地方（`mergeVoices` 调用处），在其结果里并入本地音色：

```ts
  /**
   * 本地离线音色 → 统一选项。source 标为 'server' 是有意的：
   * mergeVoices 的 rank() 把 server 排在系统语音之前，本地音色应优先展示。
   */
  const localVoiceOptions: VoiceOption[] = [...KOKORO_VOICES, FALLBACK_VOICE].map((v) => ({
    uri: v.id,
    name: `${v.name} · ${v.accent}${v.gender === 'female' ? '女' : '男'}`,
    lang: 'en-US',
    source: 'server' as const,
  }));
```

然后在设置 `voices` 状态的地方把这批并进去（与已有的 `mergeVoices(prev, next)` 调用并列）：

```ts
    setVoices((prev) => mergeVoices(prev, localVoiceOptions));
```

- [ ] **Step 3: 在试听按钮的可见性判断中放行本地音色**

现有试听逻辑里有一段判断"该语音能否试听"。找到设置 `previewing` 或调用 `previewTtsVoice` 的按钮，确认本地音色（`isLocalVoiceId(uri)`）走的是**设备内合成**的试听路径而非联网路径。

具体做法：在试听处理函数里，本地音色直接调 `sherpaSpeak`：

```ts
  /** 试听：本地音色走设备内合成，其余走原有通道 */
  const handlePreview = useCallback(async (uri: string) => {
    setPreviewing(uri);
    try {
      if (isLocalVoiceId(uri)) {
        const { sherpaSpeak } = await import('@/lib/sherpa-tts');
        const { url } = await sherpaSpeak('This is how I sound when reading English.', { voiceId: uri, speed: 0.9 });
        const audio = new Audio(url);
        await audio.play();
        audio.onended = () => setPreviewing(null);
      } else {
        await previewTtsVoice(uri);
        setPreviewing(null);
      }
    } catch {
      setPreviewing(null);
      toast.error('试听失败，请先确认内置朗读引擎已就绪');
    }
  }, []);
```

把模板里试听按钮的 `onClick` 改调 `handlePreview(voice.uri)`。

- [ ] **Step 4: 在引擎状态区显示已加载模型与音色数**

现有状态行显示 `采样率 ${sherpa.sampleRate}Hz`。在其后追加已加载模型信息：

```tsx
                  {sherpa?.loadedModels && sherpa.loadedModels.length > 0 && (
                    <span className="ml-2">
                      已载 {sherpa.loadedModels.map((m) => `${m.modelId}(${m.numSpeakers}音色/${m.sampleRate}Hz)`).join('、')}
                    </span>
                  )}
```

- [ ] **Step 5: 类型检查与 lint**

Run: `cd /b/NativeThink && npm run lint`

Expected: typecheck 与 eslint 均通过。

- [ ] **Step 6: 提交**

```bash
cd /b/NativeThink
git add src/components/TTSSettings.tsx
git commit -m "feat(tts): 设置页可选 11 个本地音色并设备内试听"
```

---

### Task 7: 整体验证与文档更新

**Files:**
- Modify: `ROADMAP.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 1–6 的全部产出
- Produces: 可交付的 APK 与真机验证清单

- [ ] **Step 1: 跑通全部静态校验**

Run: `cd /b/NativeThink && npm run check:tts-voices && npm run lint`

Expected: 两条都通过。校验脚本应报告 `音色 12 个（Kokoro 11）` 与 `Kokoro 资产合计 166.0MB`。

- [ ] **Step 2: 出包**

Run: `cd /b/NativeThink && npm run package:apk`

Expected: `BUILD SUCCESSFUL`，产物 `release/NativeThink-mobile-debug.apk`。

- [ ] **Step 3: 核验 APK 体积与内容**

Run:
```bash
cd /b/NativeThink
ls -la release/NativeThink-mobile-debug.apk
node -e "const a=require('fs').statSync('release/NativeThink-mobile-debug.apk').size; console.log((a/1024/1024).toFixed(0)+'MB')"
```

Expected: 约 886MB（原 720MB + 166MB）。若显著超出，检查 `assets/` 下是否混入了 `espeak-ng-data` 的重复副本或 `dict/`。

Run: `cd /b/NativeThink && unzip -l release/NativeThink-mobile-debug.apk | grep -E "assets/tts/|model.int8.onnx|voices.bin" | head`

Expected: 只列出 4 个 Kokoro 文件，**不应**出现 `assets/tts/kokoro-int8-multi-lang-v1_1/espeak-ng-data/`。

- [ ] **Step 4: 更新 ROADMAP.md**

把「下一步」里的第 2 条（"引擎仍不通 → 换不依赖 eSpeak 的 MMS 模型…"）替换为与当前实现一致的表述，并在「现状」里补上多音色：

```markdown
**现状**：22 本公版书中文对照随包离线可用；阅读器章节与译文严格对齐；朗读三级降级（内置离线引擎 → 系统引擎 → 云端）；内置引擎支持 11 个英语音色（Kokoro int8，24000Hz）；句子学习已上线（拆句 / 句型 / 造句，含错句复习队列与跟读评价）。

**下一步**
1. 真机验证 11 个音色与 speakerId 的对应关系（试听确认名实相符，不符则改 `src/lib/tts-voice-catalog.ts` 的 `speakerId`）
2. 语速与停顿微调（Kokoro 的 lengthScale 目前恒为 1.0，语速走 generate 的 speed 参数）
3. 词库真人发音包：单词集合有限，可预录
4. 扩书与演讲语料（句子语料现 36 句：公版书 24 + 演讲 12）；导入书离线翻译；补 38 个待回填空段
```

- [ ] **Step 5: 更新 CHANGELOG.md**

在 `CHANGELOG.md` 顶部按现有格式加入本版本条目（版本号以 `android/version.properties` 的实际值为准）：

```markdown
### 离线朗读：11 个音色可选
- 内置 Kokoro int8 多音色模型（109MB，103 音色），输出 24000Hz，自然度较原 Piper 明显提升
- 开放 11 个英语音色：美音女声 5 / 美音男声 4 / 英音 2（此前本地音色一个英音都没有）
- 修复换音色会播出上一个音色音频的问题（合成缓存 key 未包含音色维度）
- 音色加载失败自动回退 lessac 兜底音色，并在界面提示，不静默换声音
- 新增打包前校验：speakerId 越界、模型文件缺失会被拦下
```

- [ ] **Step 6: 提交**

```bash
cd /b/NativeThink
git add ROADMAP.md CHANGELOG.md public/CHANGELOG.md
git commit -m "docs: 更新路线图与更新日志 —— 离线朗读 11 音色"
```

- [ ] **Step 7: 交付真机验证清单给用户**

以下步骤**无法在本机执行**（需要安卓真机），交付用户：

1. 安装 `release/NativeThink-mobile-debug.apk`
2. 打开设置 → 朗读设置，确认引擎状态显示 `已载 kokoro-v1_1(103音色/24000Hz)`
3. **逐一点击 11 个音色的试听按钮**，确认标注与实际听感一致：
   - `af_*` / `am_*` 应为美音，`bf_emma` / `bm_george` 应为英音
   - `name` 带"女"的应为女声，带"男"的应为男声
4. 若某个音色名不符实，记录下"音色 id → 实际听感"，回报后改 `speakerId`
5. 任选一段文字用不同音色朗读，确认换音色后声音真的变了（验证缓存 key 修复）
6. 长段落连续朗读，确认不断流
7. 冷启动后首次朗读，记录加载耗时

---

## 附：本计划的验证边界

可以在本机验证的：
- 音色与资产自洽（Task 1、2、7）
- 类型与 lint（Task 4、5、6、7）
- 原生编译通过（Task 3）
- APK 体积与内容（Task 7）

**只能在真机验证的**（已列入 Task 7 Step 7）：
- 11 个 speakerId 与实际音色的对应关系 —— v1.1 无公开 speaker 表，初始值来自 v1.0 文档表
- int8 量化后的音质是否可接受
- 加载耗时与内存占用

这两项是设计文档 §6.2 记录的已知风险，不是本计划的遗漏。
