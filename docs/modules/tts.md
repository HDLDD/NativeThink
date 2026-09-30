# 朗读（TTS）

> 全站唯一的朗读入口是 `src/lib/use-tts.ts`。**不要在页面里直接调 `speechSynthesis`** —— 那条路绕过了切片、降级、缓存和「读到哪」的进度上报。

## 1. 功能

同一段英文，在手机上要能离线、即时、连续地读出来；离线引擎崩了/网络断了要自动换下一条通道，而不是静音。

- 多引擎降级：sherpa-onnx 离线（Piper / Kokoro）→ 系统语音 → 云端 `/api/tts` → Edge → Google。
- 音色：1 个 Piper（默认 lessac）+ 11 个可选 Kokoro 英语音色 + 12 个在线 Edge 音色。
- 长文切片朗读、逐句进度、预取流水线、断点/暂停/跳过。
- 结果缓存三层：JS Map（120 条）→ 原生文件缓存（sha1）→ 云端 Cache API。
- 自检与自愈：朗读自检按钮、离线引擎闪退护栏。

## 2. 实现方法

### 2.1 引擎候选顺序

`src/lib/use-tts.ts:425-433`，一个五元素类型数组 `'piper' | 'native' | 'cf' | 'edge' | 'google'`，按平台与设置分四种排法：

| 条件 | 候选顺序 |
|------|---------|
| 安卓默认 | `piper, native, cf, edge, google` |
| 显式选在线音色（`srv:edge:*`） | `cf, piper, native, edge, google` |
| 打开「只用系统引擎」`preferNative` | **只有** `native` |
| 内置引擎被闪退护栏停用 | 从候选中剔除 piper |
| 非安卓（网页/桌面/iOS） | `cf, edge, google` |

「只用系统引擎」必须真的只用系统引擎（`:427-428` 注释）：用户正是因为内置引擎闪退才打开这个开关，若仍把 piper 排第一就完全避不开。

### 2.2 降级只在「没出过声」时发生

`use-tts.ts:484-537`：`madeSound` 分流 —— 同一句已经出声就不再换引擎重试（否则用户会听到同一句被读两遍），直接跳下一句；原生分支同款 `spokeAtLeastOnce`（`:561,620-624`）。全部引擎都失败才兜底 `speechSynthesis.speak`，仍失败才 toast（`:452-475`，提示 5s 去抖 `:75-82`）。

### 2.3 切片：180 是被上游钉死的水位线

`chunkText(text, maxLen = 180)`（`use-tts.ts:288`）。理由在 `:273-282`：云端 `/api/tts` 代理 Google Translate TTS，**上游硬上限恰好 200 字符**（实测 200 通过、205 起 400）；函数侧把越界判成 400 而不是放行（`functions/api/tts.js:27-32`），因为放行后上游会给出误导性的 502。历史上切片是 400，导致云端几乎每段都失败。

`scripts/verify-tts-progress.mjs:71-77` 会按函数名抽出真实实现并断言源码里仍是 `maxLen = 180` —— 改这个数字要同时改守卫。

**例外**：桌面本地合成上限是 400（`server/local-server.mjs:482`），走的是 msedge-tts / Windows SAPI，不是 Google。

### 2.4 「读到哪」只能靠 `onChunk`

原生引擎没有词级回调，所以进度只能这样算（`use-tts.ts:31-41` 定义、`:445-449` 上报）：`onChunk(chunkIndex, wordsBefore)`，`wordsBefore` 由 `countWords` 累加（口径 `:283-286`），并且**只在 `engineIdx === 0` 时上报**，避免降级重试把同一段重复点亮。

反查表在阅读器：`PageReader.tsx:146-184` 维护 `readRangesRef`（区间表），用 `onChunk` 顺序扫表得到 `(pageIdx, paraIdx, ratio)`。成立的前提是恒等式「各段词数之和 === 各切片词数之和」，由 `verify-tts-progress.mjs:173-178` 逐页断言。

### 2.5 看门狗与双触发防护

- URL 引擎 25s 安全定时器触发时先过 `madeSound` 分流（`:521-526`）；
- **新引擎接棒前必须清掉上一个引擎的看门狗**（`:496-500`，注释直指「同一句被两个引擎各读一遍」）；
- 原生分支用 `settled` + `clearWatchdog/teardown`（`:560-569`），2.5s 无声即降级；
- 「立即 resolve 但从未 `onRangeStart`」判为**假成功**并降级，阈值 `min(expectedMs*0.4, 1500)`（`:598-624`）；
- 用户暂停时撤看门狗，免得把正在读的那句杀掉（`:521-523`、`pause()` `:906-909`）。

### 2.6 音色体系

| | |
|---|---|
| 默认音色 | `piper:lessac`（`tts-voice-catalog.ts:140`，兜底 `FALLBACK_VOICE` 同一对象 `:124-127`） |
| Kokoro 可选 | 11 个英语音色，`speakerId` = 2,3,6,9,10,11,16,18,19,21,26（`:109-121`） |
| 在线 Edge | 另有一套 12 个 `srv:edge:*`（`:40-62`） |
| **speakerId 表在前端** | 原生插件只认 `modelId`（`SherpaTtsPlugin.java:43-45`），越界拒绝（`:457-461`） |

**RTF 决定 Kokoro 不适合长文**：同一段 122 字符稳态实测，lessac 音频 5789ms / 合成 428ms → **RTF 0.076**；Kokoro 6819ms / 6867ms → **RTF 1.008**（`tts-voice-catalog.ts:132-138`）。RTF > 1 时合成追不上播放，**加大预取深度也解决不了**。

改音色必须同步四处：① Java `MODEL_*` 常量与 `REGISTRY`（`java:61-62,288-296`）；② `scripts/check-tts-voices.cjs:28-44` 的 `MODELS`；③ `tts-voice-catalog.ts:94` 声明的 `modelId`；④ 资产白名单 `scripts/fetch-android-tts.cjs:37`。然后跑 `npm run check:tts-voices`（已嵌在 `package:apk` 前置，失败 `exit 1` 阻断打包）。

### 2.7 缓存与在途去重

| 层 | 键 | 上限 | 位置 |
|----|-----|------|------|
| JS Map | `voiceId\|speed.toFixed(2)\|text` | 120，FIFO | `sherpa-tts.ts:150-152,168-171,260-264` |
| 原生文件 | `sha1(modelId\|speakerId\|speed\|text)+'.wav'` | `cacheDir/sherpa-tts`，命中判 `length>1024`，先写 `.part` 再 rename | `java:463-478` |
| 云端 Cache API | `nativethink-tts-v1` | 10s 超时 + `priority:'low'` | `use-tts.ts:240-264` |

键里**必须含音色与语速**：只按文本+语速会「换音色播出上一个音色的音频」（`sherpa-tts.ts:168-171` 注释）。

在途去重 `inflight: Map<key, Promise>`（`sherpa-tts.ts:195-230`）：原生是 `synthLock` 串行的，同文本并发请求会各占一条线程阻塞在锁上。真机闪退链写在这里：每次 `new Thread` + `generate()` → `OutOfMemoryError: pthread_create failed` → App 崩（`java:95-105`，栈原文抄在 `verify-tts-hardening.mjs:5-9`）。修法是单线程 `ttsWorker` + 独立 `loadWorker`（`java:106-117`）+ 队列上限 `MAX_PENDING_TTS = 8`，满了 `call.reject("busy: too many pending tts requests")`（`java:119-140,490-493`）。

### 2.8 闪退自愈

`checkBundledEngineHealth()` 在 app 启动最早处调用（`src/index.tsx:11,15`）。实现思路（`sherpa-tts.ts:43-52,111-132`）：**加载前打 `__nativethink_sherpa_try`、到 ready 才清除**；启动时发现 try 键还在，说明上次加载过程中崩了，就写 `__nativethink_sherpa_off` 停用内置引擎。注释明确写了**不能用时间新旧判定**（`:38-42`）。用户手动恢复走 `reenableBundledEngine()`（`:27-32`），按钮在 `TTSSettings.tsx:468-476`。

诊断回显：`reportPlayback` 只在**首次起播**写 `lastPlaybackReport`（`use-tts.ts:210-223`），降级标记 `fellBack: engineIdx > 0`，设置页每秒轮询读取（`TTSSettings.tsx:92-93`）；主动自检按钮 `probeTtsEngines()`（`use-tts.ts:988-1045`）依次探 native(2.5s 看门狗)/cloud(8s)/edge/google 直连/浏览器语音。

## 3. 注意事项

1. **切片上限 180 不能改大**。改成 200 以上，整条云端链路会失败并**静默**降级到更差的引擎，看起来"能读"但音质/延迟都变了。守卫会红：`node scripts/verify-tts-progress.mjs`。
2. **引擎候选顺序没有任何脚本断言**。`verify-tts-hardening.mjs` 只读 `sherpa-tts.ts`/Java/`TTSSettings.tsx`，**不覆盖 `use-tts.ts:425-433`**。改排序要真机验证四种排法（默认 / 选在线音色 / 只用系统引擎 / 护栏已停用）。
3. **自动朗读开关 `__nativethink_vocab_autospeak` 现在真的四处共用**（2026-09-30 补齐）：复习检测 `FlashcardMode.tsx:64-67`、每日学习 `DailyLearningMode.tsx:219-221`、语块复习 `ChunkTrainingPage.tsx:373-379`、**快速闪卡 `QuickCardMode.tsx`**（本轮新增：读键门控朗读 effect + 进度行上给开关，默认开与其余三处同口径）。此前快速闪卡完全不读它，而别处的提示语写着「与复习检测/快速闪卡共用此设置」—— 用户关掉后快速闪卡照样出声。守卫：`verify:vocab-cards` 断言四处都读同一键、快速闪卡门控位于 `tts.speak` 之前、且开关入口与写键都在。
4. **刻意不自动朗读**：配对 `matching`（视觉任务，`DailyLearningMode.tsx:291`）、拼写/填空（`:303`「那等于把答案念出来」）、句子拼写的 fill 模式（`SpellingPage.tsx:556` 只在 dictation 自动读）。新增子模式时先想清楚朗读会不会泄答案。
5. **预合成与实播的键可能不同**，两种情况都会让预热白做：① 语速不一致 —— 预热写死 `rate: 0.85`（`SpellingPage.tsx:549,553`）而 `speak()` 用 `settings.rate`（默认 0.9）；② 长句 —— `prewarm` 不切句、`speak` 走 `chunkText(…, 180)`（`use-tts.ts:807-824` vs `:844`），超 180 字符的句子预热键与分块键本就不同。缓存键含语速这件事在 `use-tts.ts:818-819` 有明文注释。
6. **Kokoro 音色总数三个口径不一致**（实测以磁盘为准）：Java 注释与 `fetch-android-tts.cjs:31` 写 103，`check-tts-voices.cjs:35` 写 54；`voices.bin` 实测 28,200,960 B ÷ 522,240 B/音色 = **54.0**。前端只用了其中 11 个，所以不影响功能，但 `numSpeakers` 的注释得改。
7. **`TTSSettings.tsx:457-461` 的诊断文案「正常应为约 60MB」指的是 lessac（63MB）**，而该处 `modelBytes` 取自 Kokoro（114MB）；`sherpa-tts.ts:110` 的「模型 60MB」同样偏指 lessac。别按这条文案判断资产是否完整。
8. **`assetManager` 必须传 null**（`java:341-347`）：否则 filesDir 的绝对路径会被当成 assets 名解析，原生直接崩。
9. **模型常驻不释放、失败过的模型不再重试**（`java:298-311`）—— 想重试要重启 App，不是再点一次。
10. **`/api/tts-voices` 只有桌面版有**（`server/local-server.mjs:671`，Cloudflare 侧无此函数）。前端因此用 `platformTag() === 'desktop'` 限定（`TTSSettings.tsx:143-157`）。去掉这个判断的后果：网页每次路由切换一个 404，APK 里因为 `index.html` 的 `/api/` 重写会真的发一次网络请求。守卫：`verify-tts-hardening.mjs:132-145`。
11. **APK 的 `/api/*` 重写只覆盖 `fetch`**（`index.html:25-35`）。音频/图片类 URL 得自己读 `window.__API_BASE__` 拼接（`use-tts.ts:232-238` 的 `cfTtsUrl` 就是这么做的）—— 新增任何非 fetch 的资源加载都要照做，否则 APK 里 404。
12. **改完必跑**：`npm run check:tts-voices`（音色/模型）、`node scripts/verify-tts-progress.mjs`（切片+阅读器反查表，实测 6175 断言）、`node scripts/verify-tts-hardening.mjs`（降级/在途去重/桌面限定，实测 15 项；**注意它没有 npm script，只能裸跑**）。
