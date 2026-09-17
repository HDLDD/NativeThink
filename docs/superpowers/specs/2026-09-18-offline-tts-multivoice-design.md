# 离线语音合成 SDK —— 多音色 + 高采样率

日期：2026-09-18
状态：设计已批准，待实现

## 1. 背景与目标

### 现状

App 已内置离线朗读引擎（sherpa-onnx + Piper VITS），但因三层硬编码而只能发出**一个音色**：

| 位置 | 硬编码内容 |
|---|---|
| `android/.../SherpaTtsPlugin.java` | `ASSET_VOICE_DIR = "piper/vits-piper-en_US-lessac-medium"` |
| 同上 | `tts.generate(text, 0, speed)` —— speakerId 恒为 0 |
| `src/lib/sherpa-tts.ts` | `sherpaSpeak(text, speed)` —— 无音色概念 |

`OfflineTts` 原生 API 其实支持多说话人（`numSpeakers()` / `generate(text, speakerId, speed)`），只是从未被使用。

### 目标

1. **多音色**：内置 11 个英语音色，覆盖美音/英音、男声/女声
2. **高采样率**：24000Hz（现为 22050Hz），且**必须是模型原生**，不做插值造假
3. **音质提升**：换用 Kokoro-82M 模型（250MB 级），自然度高于 Piper medium

### 关于"高采样率"的边界（重要）

采样率是模型训练时烧死的属性，无法通过 SDK 调高：

- 把 22050Hz 插值到 44100Hz 不增加任何声音信息，只让文件大一倍——这是假的高采样率
- 现实中不存在 44100Hz 的可离线部署 TTS 模型（VITS 系全部训练在 22050Hz）
- **22050Hz 对语音已到 CD 级**：奈奎斯特频率 11kHz 完整覆盖语音有效频段（基频 + 共振峰）

因此本方案把"高采样率"落实为：
- 24000Hz 原生输出（较现状 +8.8%）
- **不经二次重采样**：WAV 严格按 `GeneratedAudio.getSampleRate()` 报告的值写入
- 16-bit PCM 单声道，与现状一致（已是模型原生精度）

### 非目标

- 不做运行时下载音色包（全部随包内置）
- 不自己量化模型（用现成产物，避免音质劣化风险）
- 不支持中文朗读（剥离中文资产，见 §4.1）

## 2. 模型与音色选型（已实测验证）

### 选定：`csukuangfj/kokoro-int8-multi-lang-v1_1`（int8 量化）

| 文件 | 体积 | 用途 |
|---|---|---|
| `model.int8.onnx` | 109.0MB | 主模型（int8 量化） |
| `voices.bin` | 51.3MB | 音色嵌入表（103 个音色） |
| `lexicon-us-en.txt` | 5.7MB | 美音发音词典 |
| `tokens.txt` | ~0.5KB | 词表 |
| `espeak-ng-data/` | **0** | 与 Piper 自带的那份逐文件相同，复用 |
| **合计新增** | **166.0MB** | |

输出采样率 **24000Hz**。

### 体积预算的约束（决定了选型）

主模型占新增体积的 **86%**，是唯一有意义的杠杆。**降低音色数量省不下任何空间**——`voices.bin` 与模型大小无关，speakerId 只是数组下标，砍到 3 个音色仍是 360.6MB。所以只能换更小的模型。

espeak-ng-data 复用产生额外节省：实测 Kokoro 的 `espeak-ng-data/` 与 Piper 自带的那份**逐文件 SHA-1 完全一致**（355 个文件全部匹配，`phondata`/`phontab`/`phonindex` 逐字节相同），故只保留一份。这是从 187.7MB 降到 166.0MB 的关键。

### 体积对照

| 方案 | 主模型 | 新增体积 | 相对 |
|---|---|---|---|
| ~~kokoro-multi-lang-v1_0（fp32）~~ | 310.5MB | 360.6MB | 基准 |
| **kokoro-int8-multi-lang-v1_1** | **109.0MB** | **166.0MB** | **−54%** |

### 为什么接受 int8 带来的代价

int8 量化会与 fp32 存在轻微音质差异（本方案选 int8 纯粹出于体积约束）。取舍如下：

| 维度 | fp32 v1.0 | int8 v1.1 |
|---|---|---|
| speakerId 映射来源 | sherpa 官方文档公开的 speaker 表 | **无可靠公开来源**（v1.1 仓库 README 仅一句介绍） |
| 音色嵌入 | 与 v1.1 非同一套（见下） | 需真机试听确定 |
| 音质 | 基准 | 量化，待真机确认 |
| 新增体积 | 360.6MB | 166.0MB |

**两版音色库互不相同**：为验证能否沿用 v1.0 的映射，下载两版 `voices.bin` 做字节比对（每音色 522240 字节，v1.0 = 54 × 522240 = 28200960，v1.1 = 103 × 522240 = 53790720，均整除吻合）。按 SHA-1 逐块比对，**v1.0 的 54 个音色嵌入在 v1.1 中一个都找不到**——两版是独立训练的音色库，非追加或重排。

因此 v1.1 的 11 个英文音色 speakerId **必须在真机上逐个试听确认**（见 §6.2）。这是本方案唯一的未验证假设，已明确记录。

> 音色命名沿用 Kokoro 官方规范 `<语种><性别>_<名字>`：`af_bella` = American English / female / bella。故 v1.1 的英文音色命名与 v1.0 相同，只是数组下标可能不同。

### 音色清单（11 个）

speakerId 取自 v1.0 公开表作为**初始猜测值**，待真机试听校准（§6.2）。若试听发现名不符实，改 `tts-voice-catalog.ts` 里该音色的 `speakerId` 即可，无需改原生代码。

| 初始 speakerId | 音色名 | 性别 | 口音 | 定位 |
|---|---|---|---|---|
| 2 | af_bella | 女 | 美音 | 温暖亲切 |
| 3 | af_heart | 女 | 美音 | 柔和自然 |
| 6 | af_nicole | 女 | 美音 | 轻柔低语 |
| 9 | af_sarah | 女 | 美音 | 清晰标准（默认） |
| 10 | af_sky | 女 | 美音 | 年轻活泼 |
| 11 | am_adam | 男 | 美音 | 沉稳 |
| 16 | am_michael | 男 | 美音 | 自然 |
| 18 | am_puck | 男 | 美音 | 活泼 |
| 19 | am_santa | 男 | 美音 | 低沉厚重 |
| 21 | bf_emma | 女 | 英音 | 标准英音 |
| 26 | bm_george | 男 | 英音 | 沉稳英音 |

**英音价值**：`src/lib/tts-voice-catalog.ts` 的 Edge 在线目录已在区分美音/英音/澳音，但**本地音色此前一个英音都没有**。这两个填补空白。

**默认音色** `af_sarah`。

> `af` 单名音色属于 `kokoro-en-v0_19` 模型（另一套 ID），本方案的多语模型中不存在，故不列。

### 兜底音色

保留现有 `vits-piper-en_US-lessac-medium`（22050Hz，已验证真机可跑），作为 Kokoro 不可用时的自动回退。不增加包体积（本来就在包里），且其 espeak 数据被 Kokoro 复用。

## 3. 架构

### 3.1 分层

```
┌─ 表现层 ────────────────────────────────────────────┐
│ TTSSettings.tsx   音色分组下拉 + 逐个试听           │
└────────────────────┬───────────────────────────────┘
                     │ voiceId
┌─ SDK 公开 API ─────▼───────────────────────────────┐
│ src/lib/sherpa-tts.ts                              │
│   listVoices()  speak(text,{voiceId,speed})        │
│   prewarm(text,{voiceId,speed})  purgeVoices()     │
└────────────────────┬───────────────────────────────┘
                     │ Capacitor 桥
┌─ 原生 ─────────────▼───────────────────────────────┐
│ SherpaTtsPlugin.java                               │
│   · 每模型一个 OfflineTts 实例（Kokoro + lessac）  │
│   · speakerId 跨端传递                             │
│   · 缓存 key 含音色维度                            │
└────────────────────────────────────────────────────┘
```

### 3.2 音色清单的归属

**不引入 manifest.json。** 模型定义硬编码在 Java（2 条），音色元数据归 JS 的音色目录。理由：

- speakerId 本来就要由 JS 跨端传给原生（一次调用一个音色，不是批量解析），原生无需知道完整音色表
- 引入 manifest 要新增 JSON schema、Java 侧解析、一个新资产文件——这些复杂度换不到减少一处真实重复
- 每个事实各居一处，不存在漂移：模型路径只在 Java，音色→speakerId 只在 JS 目录
- 与项目现有约定一致：`tts-voice-catalog.ts` 已经在承担"音色目录"这个职责（Edge 音色就在里面），本地音色是同一职责的自然延伸

**JS 侧**（`src/lib/tts-voice-catalog.ts`）新增 `KOKORO_VOICES`，每条含 `voiceId` / 显示名 / 性别 / 口音 / `modelId` / `speakerId`：

```ts
export interface ILocalVoice {
  /** 传给 sherpaSpeak 的 voiceId，形如 kokoro:af_sarah */
  id: string;
  name: string;
  gender: 'female' | 'male';
  accent: '美音' | '英音';
  /** 原生侧模型注册表的 key */
  modelId: 'kokoro-v1_1' | 'piper-lessac';
  /** voices.bin 里的数组下标 */
  speakerId: number;
  /** 一句定位描述，设置页显示 */
  note: string;
}

export const KOKORO_VOICES: ILocalVoice[] = [
  { id: 'kokoro:af_bella',  name: 'Bella',  gender: 'female', accent: '美音', modelId: 'kokoro-v1_1', speakerId: 2,  note: '温暖亲切' },
  { id: 'kokoro:af_heart',  name: 'Heart',  gender: 'female', accent: '美音', modelId: 'kokoro-v1_1', speakerId: 3,  note: '柔和自然' },
  { id: 'kokoro:af_nicole', name: 'Nicole', gender: 'female', accent: '美音', modelId: 'kokoro-v1_1', speakerId: 6,  note: '轻柔低语' },
  { id: 'kokoro:af_sarah',  name: 'Sarah',  gender: 'female', accent: '美音', modelId: 'kokoro-v1_1', speakerId: 9,  note: '清晰标准' },
  { id: 'kokoro:af_sky',    name: 'Sky',    gender: 'female', accent: '美音', modelId: 'kokoro-v1_1', speakerId: 10, note: '年轻活泼' },
  { id: 'kokoro:am_adam',   name: 'Adam',   gender: 'male',   accent: '美音', modelId: 'kokoro-v1_1', speakerId: 11, note: '沉稳' },
  { id: 'kokoro:am_michael',name: 'Michael',gender: 'male',   accent: '美音', modelId: 'kokoro-v1_1', speakerId: 16, note: '自然' },
  { id: 'kokoro:am_puck',   name: 'Puck',   gender: 'male',   accent: '美音', modelId: 'kokoro-v1_1', speakerId: 18, note: '活泼' },
  { id: 'kokoro:am_santa',  name: 'Santa',  gender: 'male',   accent: '美音', modelId: 'kokoro-v1_1', speakerId: 19, note: '低沉厚重' },
  { id: 'kokoro:bf_emma',   name: 'Emma',   gender: 'female', accent: '英音', modelId: 'kokoro-v1_1', speakerId: 21, note: '标准英音' },
  { id: 'kokoro:bm_george', name: 'George', gender: 'male',   accent: '英音', modelId: 'kokoro-v1_1', speakerId: 26, note: '沉稳英音' },
];

/** 兜底音色 —— Kokoro 不可用时自动回退 */
export const FALLBACK_VOICE: ILocalVoice = {
  id: 'piper:lessac', name: 'Lessac', gender: 'female', accent: '美音',
  modelId: 'piper-lessac', speakerId: 0, note: '经典音色',
};

/** 默认音色（未选择时使用） */
export const DEFAULT_LOCAL_VOICE_ID = 'kokoro:af_sarah';
```

**原生侧**（`SherpaTtsPlugin.java`）模型注册表，2 条硬编码：

```java
// 模型 key → 配置。kind 决定走哪个 OfflineTtsXxxModelConfig
private static final String MODEL_KOKORO = "kokoro-v1_1";
private static final String MODEL_LESSAC = "piper-lessac";
```

`speak` 接收 `voiceId` 对应的 `modelId` + `speakerId`，按 `modelId` 懒加载对应引擎。

> 跨端传的是 `modelId` 字符串而非数组下标，避免两侧枚举顺序差异导致加载错模型；未知 `modelId` 直接拒绝。

### 3.3 原生插件改造

| 改动 | 说明 |
|---|---|
| 模型注册表 | 取代 `ASSET_VOICE_DIR` 常量：`modelId` → 配置的映射，每个模型持有独立 `OfflineTts` 实例 |
| 摊包路径 | `filesDir/<model.dir>`，沿用现有 `copyAssets` 逻辑与"已存在且大小一致则跳过"判断 |
| 懒加载 | 首次用到某模型才加载，避免冷启动同时加载两个引擎吃内存 |
| `speak` 参数 | 新增 `modelId` + `speakerId`（由 JS 侧的 voiceId 解析后传入） |
| 缓存 key | 现为 `sha1(text + "\|" + speed)` → 改为 `sha1(voiceId + "\|" + text + "\|" + speed)`。**现有代码换音色会串音，这是必须修的 bug** |
| `status` | 增加 `numSpeakers`、`loadedModels`，让设置页能显示真实可用音色数 |
| 引擎配置 | Kokoro 走 `OfflineTtsKokoroModelConfig`；注意其 8 个字符串参数均为 Kotlin 非空类型，无值须传 `""` 而非 `null`（此前踩过 NPE 坑） |

`OfflineTtsConfig` 构造函数签名（已从 AAR 反解确认，**参数顺序必须严格一致**）：

```
OfflineTtsConfig(model: OfflineTtsModelConfig, ruleFsts: String, ruleFars: String,
                 maxNumSentences: Int, silenceScale: Float)

OfflineTtsModelConfig(vits, matcha, kokoro, kitten, numThreads: Int, debug: Boolean, provider: String)

// 8 个字段，顺序不可错位 —— lang 在 lexicon 之后、dictDir 之前
OfflineTtsKokoroModelConfig(model, voices, tokens, dataDir, lexicon, lang, dictDir, lengthScale: Float)
```

Kokoro 参数取值：`model` / `voices` / `tokens` 为绝对路径；`dataDir` 为 `espeak-ng-data` 的**父目录**（与 VITS 的 dataDir 约定一致，见现有注释）；`lexicon` 为 `lexicon-us-en.txt` 绝对路径；`lang` 为 `"en-us"`；`dictDir` 传 `""`（英文不需要 jieba 词典，且非空类型不能传 null）；`lengthScale` 传 `1.0`（语速由 `generate` 的 speed 参数实时控制，不走这里）。

**跨端请求形状**（`speak` 的入参）：

```
{ text: String, modelId: String, speakerId: Int, speed: Double }
```

原生按 `modelId` 查注册表取配置并懒加载引擎，把 `speakerId` 原样交给 `tts.generate(text, speakerId, speed)`。未知 `modelId` 直接 `reject`，不静默回退到别的模型——否则会读出错误音色且难以察觉。

### 3.4 JS API

```ts
// 向后兼容：opts 省略时用默认音色，旧调用点无需改动
// 兼容数字形式的第二参数（历史签名是 speed）
sherpaSpeak(text: string, opts?: { voiceId?: string; speed?: number } | number)
  : Promise<{ url: string; durationMs: number; cached: boolean; ms: number }>
sherpaPrewarm(text: string, opts?: { voiceId?: string; speed?: number } | number): void

// 新增（定义在 tts-voice-catalog.ts；sherpa-tts.ts 转发，避免设置页多引一个模块）
listLocalVoices(): ILocalVoice[]
getSherpaStatus(): ISherpaStatus
```

```ts
export interface ISherpaSpeakResult {
  path: string;
  bytes: number;
  durationMs: number;
  cached: boolean;
  ms: number;
}

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
  route?: string | null;
  loadedModels?: ISherpaLoadedModel[];   // 新增：已加载的模型与各自能力
  errorByModel?: Record<string, string>; // 新增：按模型记失败原因（Kokoro 失败不影响 lessac）
}
```

`src/lib/use-tts.ts` 的 piper 档位改为携带 `voiceId`（由 `TTSSettings.selectedVoiceURI` 提供），`sherpaPrewarm` 调用点同步传音色。

**音色回退链**（`sherpa-tts.ts` 内实现）：

```
请求的音色可用        → 用它
该音色模型加载失败    → 换 FALLBACK_VOICE（lessac）
lessac 也失败/被护栏停用 → 抛错，交给 use-tts 降级到系统/云端引擎
```

回退时通过既有 `notifyTtsFailure` 同类的 toast 告知用户，不静默降级换声音。

### 3.5 数据流

```
用户在设置页选音色
  → TTSSettings 写入 selectedVoiceURI = "kokoro:af_sarah"
  → tts-settings 持久化（safeStorage）
  → use-tts 的 speak() 读设置，piper 档位调用 sherpaSpeak(text, {voiceId, speed})
  → sherpa-tts 查 catalog 得 {modelId, speakerId}
  → 插件 ensureModel(modelId)（懒加载，首次摊包 + 建引擎）
  → tts.generate(text, speakerId, speed)
  → WAV 落盘 cacheDir，路径经 convertFileSrc 返回
  → WebView <audio> 播放（播放队列/暂停/续读全部复用现有逻辑）
```

## 4. 构建集成

### 4.1 扩展 `scripts/fetch-android-tts.cjs`

沿用现有模式：`--voice` 参数化、离线已就位就跳过（构建不因网络抖动失败）、hf-mirror 并发下载。

新增 Kokoro 拉取，**按白名单只取英文所需文件**：

```
model.int8.onnx, voices.bin, tokens.txt, lexicon-us-en.txt
```

不取（各有理由）：

| 不取的文件 | 体积 | 理由 |
|---|---|---|
| `espeak-ng-data/` | 17.2MB | 与 Piper 自带那份逐文件 SHA-1 相同（已实测 355 个文件全部匹配），共享同一份 |
| `dict/` | 13.9MB | 中文分词，英文用不到 |
| `lexicon-gb-en.txt` | 6.1MB | 英音词典，espeak 可接管；若真机发现英音不标准再加回 |
| `lexicon-zh.txt` + `*zh.fst` | 2.3MB | 中文，用不到 |

> 共享 espeak 的实现方式：Java 里 Kokoro 的 `dataDir` 指向 `piper/vits-piper-en_US-lessac-medium`（espeak-ng-data 的父目录），与 lessac 音色复用同一份数据。前提是 Piper 音色已就位 —— 拉取顺序须保证 Piper 在前。

`model.int8.onnx` 有 109MB，下载需用流式写入（`Readable.fromWeb`）而非先 `arrayBuffer()` 全量读进内存；现有脚本对 63MB 模型用的是后者，这里要改。

### 4.2 APK 体积（实测）

| 项 | 体积 | 说明 |
|---|---|---|
| 上一版 APK（实测） | 687MB | `ls` 实测 719947994 字节 |
| **本版 APK（实测）** | **813MB** | |
| 新增 | **+126MB** | |

**关键：不能用磁盘上的文件体积估算 APK 涨幅。** 资产在 APK 内会被压缩，Kokoro 的 166.0MB 在包内只占 **126.3MB**。按未压缩体积估会偏高约 40MB。

包内构成（`node scripts/report-apk-size.cjs` 实测）：

| 目录 | 未压缩 | 包内占用 |
|---|---|---|
| `assets/public/models`（离线小模型） | 877.9MB | 541.3MB |
| `assets/tts/`（Kokoro 多音色） | 166.0MB | 126.3MB |
| `assets/piper/`（Piper 音色） | 77.4MB | 65.1MB |
| `assets/public/`其它（web 产物） | 121.4MB | 46.5MB |
| `lib/`（原生库） | 29.3MB | 29.3MB |
| 其它 | 9.8MB | 4.2MB |
| **合计** | **1281.7MB** | **812.8MB** |

已在 `android/app/build.gradle` 限制 `abiFilters 'arm64-v8a', 'armeabi-v7a'`（省约 42MB），继续沿用。

> 附带发现（不在本次范围）：`public/CetThink-mobile.apk`（6.8MB）被当作 web 静态资源打进了 NativeThink 的 APK。这是既有状况，可另做清理。

### 4.3 存储影响

Play 渠道的 APK 体积上限是 200MB，本方案远超，故**这条路只适用于本地直装**（现有 APK 已有 720MB，同样如此，不改变分发方式）。

运行时额外占用：模型摊到 `filesDir` 约 166MB，加上已有的 878MB 书籍模型，内部存储需预留约 1.1GB。

## 5. 错误处理

| 场景 | 行为 |
|---|---|
| Kokoro 加载抛异常 | 记 `state=error` + 原因，`speak` 自动回退 lessac 音色，不中断朗读 |
| Kokoro 原生崩溃（Java 接不住） | 复用现有 `checkBundledEngineHealth()` 护栏：加载前打标记、成功才清除；下次启动发现标记残留则自动停用，回退系统/云端引擎 |
| 音色包体积过大导致摊包失败（存储不足） | 捕获 `IOException`，提示"存储空间不足，已改用系统朗读"，不静默失败 |
| speakerId 超出 `numSpeakers()` | 拒绝合成并回报，避免原生层越界 |
| 模型文件损坏（大小不符） | 校验失败则重新摊包一次；仍失败则回退 |

## 6. 验证

### 6.1 构建期（本机可执行）

1. `node scripts/fetch-android-tts.cjs` 拉全模型，校验文件数与体积
2. 校验脚本 `scripts/check-tts-voices.cjs` 通过：确认 11 个英文音色的 speakerId 均在 `0..numSpeakers-1` 内、模型资产文件齐全、`modelId` 与 Java 注册表一致
3. `npm run typecheck` 通过
4. `npm run package:apk` 出包，确认 APK 体积符合预期

### 6.2 真机（需用户在手机上执行）

本环境无法运行安卓，故以下为交付给用户的步骤：

1. **音色映射人工确认（最关键）**：设置页逐个试听 11 个音色，确认标注与实际听感一致（如 `af_bella` 确实是女声、`bm_george` 确实是英音男声）。这是本方案唯一的未验证假设——v1.0 与 v1.1 音色库非同一套（已实测），初始 speakerId 取自 v1.0 公开表，需靠耳朵校准。
2. **int8 音质确认**：与 lessac（未量化，22050Hz）对比同一句，确认清晰度可接受、无明显机械感或杂音。若不可接受，退回 fp32 v1.0（+194.6MB）或只保留 lessac。
3. **采样率核验**：设置页应显示 24000Hz
4. **换音色不串音**：同一句话用不同音色播，确认音频未命中错误缓存（验证缓存 key 修复）
5. **长文本连续朗读**：整段/整章连续朗读不断流
6. **冷启动加载耗时**：109MB 模型首次加载，记录耗时是否可接受

### 6.3 若映射不符的处理

若试听发现某 speakerId 名不符实：改 `src/lib/tts-voice-catalog.ts` 里该音色的 `speakerId` 后重新打包即可，**无需改原生代码**。

若大面积错位（说明 v1.1 音色顺序与 v1.0 表差异很大），处理顺序：

1. 先按听感重新标定：11 个音色逐个试听，把"实际听到的性别/口音"与名字对齐后改 `speakerId`
2. 若某个期望的音色（如英音）在 103 个音色中找不到对应，则把音色数减到已确认的那些
3. 兜底：**lessac 始终可用**，即使 Kokoro 全部音色都标不准，朗读功能不受影响

### 6.4 回退到 fp32 的路径

若 int8 音质或映射问题无法接受，切回 `kokoro-multi-lang-v1_0` 只需改三处：`fetch-android-tts.cjs` 的仓库名与白名单、`SherpaTtsPlugin.java` 的模型配置（`model.onnx` + `espeak-ng-data` 路径）、`scripts/check-tts-voices.cjs` 的预期文件清单。代价是新增体积从 166.0MB 回到 360.6MB（APK 约 1080MB）。

## 7. 影响文件

| 文件 | 改动 |
|---|---|
| `scripts/check-tts-voices.cjs` | 新增（音色与资产校验） |
| `android/app/src/main/java/com/nativethink/app/SherpaTtsPlugin.java` | 模型注册表、speakerId、缓存 key、Kokoro 配置 |
| `src/lib/sherpa-tts.ts` | 多音色 API，保持旧签名兼容 |
| `src/lib/tts-voice-catalog.ts` | 增补 `KOKORO_VOICES` |
| `src/lib/use-tts.ts` | piper 档位传 voiceId |
| `src/components/TTSSettings.tsx` | 音色分组下拉 + 试听 |
| `scripts/fetch-android-tts.cjs` | Kokoro 拉取 + 白名单 + 流式下载大文件 |
| `android/app/src/main/assets/tts/kokoro-int8-multi-lang-v1_1/**` | 新增（构建产物，gitignore） |
| `ROADMAP.md` | 更新朗读引擎现状 |

## 8. 参考

- [sherpa-onnx Kokoro 模型文档](https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/kokoro.html) —— speaker 表与配置参数来源（v1_0 部分；v1_1 无对应文档）
- [sherpa-onnx tts-models 发布页](https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models)
- [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) —— 上游模型
- [hexgrad/Kokoro-82M-v1.1-zh](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh) —— v1.1 上游
- `csukuangfj/kokoro-int8-multi-lang-v1_1`（hf-mirror）—— **本方案采用的仓库**
- `csukuangfj/kokoro-multi-lang-v1_0`（hf-mirror）—— 回退备选（fp32，官方有文档）
