# 朗读（TTS）

> 全站唯一的朗读入口是 `src/lib/use-tts.ts`。**不要在页面里直接调 `speechSynthesis`** —— 那条路绕过了切片、降级、缓存和「读到哪」的进度上报。

## 单词短朗读云端优先（2026-10-16，"部分单词发音不准"的定论）

用户报「in 开头的单词不发 i 的音，stuff 不发 s」。PC 上用 **APK 包内同款模型 + 同份 lexicon/espeak 数据**合成并用 ASR 回转写定量实测：Kokoro int8 读 "stuff" 在 /s/ 前插一段浊音（帧级剖面 lf=1.00，ASR 听成 "This stuff"/"Stop!"）、"input" 读成 "import"、"in" 读成含混音，**54 个音色只有 1 个过起首三项测试**；lessac 把 "study" 读成 "Sorry"。注音表逐词核对是对的（`stuff s t ˈ ʌ f`）—— 音素输入正确、模型合成缺陷，**词库 override / 文本变体 / 换音色都救不了**，这是小模型的质量上限。

修法（`use-tts.ts` 引擎排序处）：单词级短文本（**单切片 ≤24 字符**）且 `navigator.onLine !== false` 时，安卓默认排列把云端 `cf` 插到最前（`cloudFirst = wantsOnlineVoice || shortWordRead`，并进「选在线音色」那条既有分支）；失败自动落回原离线链；例句/长文本仍离线优先。四种排法语义：默认（单词联网=云端先，其余不变）/ 选在线音色（原本就 cf 先）/ 只用系统引擎（`preferNative` 分支在 cloudFirst **之前**判断，仍是纯 `['native']`）/ 护栏停用（piper 不进候选）。桌面本来就是 `['cf','edge','google']` 不受影响。**prewarm 必须与 speak 同路（117 装机后发现的欠账）**：`prewarm` 原先还按旧规则把单词预热给离线引擎 —— speak 已云端优先、预热却喂错引擎，每次单词朗读冷启动。现把判定收敛为模块级共享判据 `isShortWordRead(text)`（联网 && ≤24 字符），speak 与 prewarm 单点共用；prewarm 对单词短文本预热同一个云端 URL，长文本仍预热离线引擎。守卫 `verify-native-tts` D23-D27（44 断言；变异：去联网判定 / shortWordRead 不并入 / preferNative 被掺 / prewarm 不同路，各红 1 条）。真机排法验证见 verification.md 第 33 测。


## 离线朗读：首包砍半 + 「长文不断」的实测边界（2026-10-19）

用户诉求：「朗读声音如果能在保证音质的前提下还能快速输出、长文不断就好了，无论是什么离线音色」。
把这句话拆成三个**能各自证伪**的问题，分别量完再动手 —— 工具 `scripts/check-tts-latency.mjs`（全程直连 `Capacitor.Plugins.SherpaTts`，绕开 JS 缓存层；每段文本带运行级 nonce，否则第二次跑全命中原生文件缓存 `sha1(model|speaker|speed|text)`，测的就不是合成了）。

| 问题 | 实测 | 结论 |
|---|---|---|
| 切片边界是不是**播放层**（每片新建 `Audio` 元素）慢？ | 无头 Chrome 里逐片 `new Audio(url)`：`playing` 距创建 **29–46ms**（中位 32）；提前 `load()` 下一个元素后 **1ms** | 播放层不是瓶颈 —— 32ms 比句间自然停顿短得多。别去改 Web Audio / 预加载音频元素那套 |
| 首包为什么慢？ | piper 分支原先在 `sherpaSpeak(本片)` **之前**先 `sherpaPrewarm(下一片)`；原生 `synthLock` 串行 → 本片排到队列第二位 → **首包 = 2×单片合成** | 改成"本片先入队、预取排在后面"（`use-tts.ts:720-724`）。模拟器实测 lessac **1466ms → 772ms**、Kokoro **22680ms → 11612ms**，而**两轮总时长不变**（1466/1656、22680/23011）—— 只是把首包提前，没让整体变快。**真机（d0e47380 / Redmi Turbo 3，2026-10-19 晚补量）同一测复现了"砍半而总量不变"**：lessac **1207ms → 609ms**（两轮全完 1207 / 1200），Kokoro **20508ms → 9989ms**（20508 / 19965）；缓存层同一句第二次读 **597ms → 3ms** |
| 长文会不会断？ | RTF（合成 ms ÷ 音频 ms；speed 0.9、冷合成）。**四核 x86_64 模拟器**：lessac **0.09–0.17**、Kokoro Bella **1.38–1.75**。**真机 8 核 → `numThreads=4`**（45/109/228 字三档各测）：lessac **0.08–0.12**、Kokoro Bella **1.18–1.25** | RTF>1 ⇒ 合成追不上播放，**切片边界必然饿住**，加大预取深度只会让队列积压（§2.6 那条口径再次确认）。lessac 长文是连续的，Kokoro 不是 —— **真机也没有把它救过 1.0**，只是从模拟器的 1.4–1.75 压到 1.2 上下 |
| 加线程能不能救 Kokoro？ | 改 `SherpaTtsPlugin.java:410` 的 `numThreads` 三档：cores/2(2) → **1.44–1.75**、cores-1(3) → **1.38–1.45**、吃满(4) → **1.23–1.34** | 次线性，**越不过 1.0**，而吃满核数会跟 UI/音频线程抢 CPU。numThreads 不是这条的优化项，已回到 `cores/2` 并把这条曲线写进代码注释 |

**产品决定：不悄悄换引擎、也不悄悄换音色。** 用户要的是"我选的这个音色"，而"选了 X 实际给你 Y"正是这个项目反复被报的装饰性参数问题。所以改成**在选它的地方把代价说清**：`TTSSettings.tsx` 里选中 Kokoro 音色时，那行小字写明「合成慢于播放（RTF≈1.2~1.7）→ 长文每句之间会有停顿、第一句要等十秒上下；要连续请换 Lessac 或在线音色」。守卫 `verify-tts-hardening` D6 钉住这段文案不许被删。

**别去动的地方**：想靠"给慢音色把切片改小"来提首包 —— `chunkText` 的 180 是全站唯一切片口径，阅读器「读到哪」的反查表恒等式（各段词数之和 === 各切片词数之和，`verify-tts-progress` 6175 条逐页断言）依赖它。引擎相关的切片长度会把这个恒等式拆掉。

**守卫的判据别用毫秒数**：D 段先写成"旧序首包 > 新序首包 × 1.5"，同一条断言在本机抖出过 43/16 与 43/31 两种读数（替身每次 15ms，调度抖动就吃掉了差别）。改成确定性证据：本片在队列里**排第几件** + 两次合成的 `start/end` 是否严格交替（`__ttsOverlapped`）。变异验证：把替身的串行接队尾去掉 → D2 立刻红，说明这条正对照真的在管事。

**这条已经证完了（2026-10-19 晚，d0e47380 / Redmi Turbo 3，8 核 → `numThreads=4`）**：`node scripts/check-tts-latency.mjs --port 9223 --quick` 实测 Kokoro RTF **1.18–1.25** —— 比四核模拟器（1.38–1.75）好，但**仍然越不过 1.0**，所以设置面板那句"长文每句之间会有停顿"**保持原样、不放宽**（`RTF≈1.2~1.7` 这个区间正好把真机压在低端）。真机同时复现了首包"砍半而两轮总时长相等"（lessac 1207→609ms / 1207 vs 1200ms；Kokoro 20508→9989ms / 20508 vs 19965ms），见开头那张表。

## 取消必须按"代际"，不能按布尔（2026-10-20，"快速闪卡部分单词/句子无法朗读"的根因）

症状与 2026-10-15 那次（§预合成下一张）**不是同一个 bug**：这次连点喇叭也有时会没声，
自动朗读则是每隔几张死一张。取证通道是 `node scripts/walk-quickcard-tts.mjs --port 9226 --fixture …`
（模拟器 APK，把 `Audio.play` / `fetch` / `speechSynthesis` / Capacitor 桥全记下），
受控夹具 13 张里抓到这张：

```
自动→ play尝试:https://localhos(piper)  fetch…  play尝试:blob  play-拒:piper/AbortError  play-拒:blob/AbortError
```

**同一次自动朗读发起了两回，两回都被 AbortError 掐死** —— 掐它的不是网络，是 App 自己。

链条：`speak()` 开头是 `abortedRef=true → ssCancel/stopAudio → abortedRef=false`，**同步走完**；
而被 `stopAudio()` 掐掉的那个 `<audio>`（`src=''`）会在**之后**派发 `onerror`，
旧链的 handler 读到的 `abortedRef` 已经是 `false`，于是按"本引擎失败了"继续降级/进下一句，
第一件事就是 `playUrl → stopAudio()` —— 把**刚起播的新朗读**掐了。两次连续朗读（自动 + 手动、
或快速切卡）就会互相掐，最后谁都没声。

修法（`src/lib/use-tts.ts`，守卫 `verify-tts-hardening` E 节 10 条钉住）：

- `chainGenRef` **单调递增的代际号**，`speak()` 与 `cancel()` 各 `++`（且 `++` 必须排在
  `abortedRef.current = true` 之前）；链函数把它作为形参一路传下去，共 5 处续链调用。
- 链体第一件事就是 `if (gen !== chainGenRef.current) return;`（**排在 `engines` 组装之前**，
  否则旧链已经先跑过一次 `stopAudio` 了）；`playUrl` 的入口 / `onended` / `onerror` /
  25s 看门狗 / `play().catch()` 五条退出路径各自都比一遍。
- `stopAudio()` **先把 `onplay/onended/onerror/onpause` 摘干净**再 `pause(); src=''` ——
  旧元素的 AbortError 不该再驱动任何链。
- 原生引擎"暂停后恢复重播"那条 `nativeReplayRef` 也是续链，同样必须带 `gen`
  （E4 就是当场抓到这一处漏传：不带 gen 时它取的是"调用那一刻"的当代，
  于是隔了一轮之后仍会把旧文本盖到新朗读上）。

修后同一套夹具：点喇叭 13/13、点例句 13/13（含 185 字切成两片的 `appliance`，两片都响）、
自动朗读不再有 AbortError。

**踩过的测法坑**（都写进脚本注释了，下轮别再犯）：① 页面上有**两个** `lucide-volume2` 图标 ——
「自动发音」开关和词面喇叭同图标，按图标取第一个会把开关当喇叭点，于是一边测一边把自动朗读关掉，
读数变成"13/13 自动都没声"；② 该设备此前被走过 `vocab_autospeak=0`，**默认开**的开关是关着的，
"自动朗读没声"在那个设备上根本是预期行为；③ 先清缓冲再读会把"点击当帧就发生的那次 play"抹掉，
必须改成**按 `performance.now()` 时间窗归属**；④ **进轮之后也不许清缓冲** —— 第一张的朗读就在进轮那几百毫秒里发起，
清了读数就变成"每轮第一张都不读"，我差点据此再修一个不存在的缺陷。真要定性第一张，读**组件自己的状态**：
从卡面 `<h2>` 上的 `__reactFiber$` 往上走到 QC 的 hooks 链，取 `lastSpokenRef`（形如 `0-mankind` 就是 effect 跑过并记了账），
配合事件缓冲一起看 —— 这次实测第一张确实 `play尝试 → play-ok`，"1/13 没声"是测量伪影。



同一段英文，在手机上要能离线、即时、连续地读出来；离线引擎崩了/网络断了要自动换下一条通道，而不是静音。

- 多引擎降级：sherpa-onnx 离线（Piper / Kokoro）→ 系统语音 → 云端 `/api/tts` → Edge → Google。
- 音色：1 个 Piper（默认 lessac）+ 11 个可选 Kokoro 英语音色 + 12 个在线 Edge 音色。
- 长文切片朗读、逐句进度、预取流水线、断点/暂停/跳过。
- 结果缓存三层：JS Map（120 条）→ 原生文件缓存（sha1）→ 云端 Cache API。
- 自检与自愈：朗读自检按钮、离线引擎闪退护栏。

## 2. 实现方法

### 2.1 引擎候选顺序

`src/lib/use-tts.ts:485-499`，一个五元素类型数组 `'piper' | 'native' | 'cf' | 'edge' | 'google'`，按平台与设置分四种排法：

| 条件 | 候选顺序 |
|------|---------|
| 安卓默认 | `piper, native, cf, edge, google` |
| 显式选在线音色（`srv:edge:*`） | `cf, piper, native, edge, google` |
| 打开「只用系统引擎」`preferNative` | **只有** `native` |
| 内置引擎被闪退护栏停用 | 从候选中剔除 piper |
| 非安卓（网页/桌面/iOS） | `cf, edge, google` |

「只用系统引擎」必须真的只用系统引擎（`:427-428` 注释）：用户正是因为内置引擎闪退才打开这个开关，若仍把 piper 排第一就完全避不开。

### 2.2 降级只在「没出过声」时发生

`use-tts.ts:544-596`：`madeSound`（`:562`）分流 —— 同一句已经出声就不再换引擎重试（否则用户会听到同一句被读两遍），直接跳下一句；原生分支同款 `spokeAtLeastOnce`（`:631,643,685-693`）。全部引擎都失败才兜底 `speechSynthesis.speak`，仍失败才 toast（`:512-541`，提示 5s 去抖 `:77-84`）。

### 2.3 切片：180 是被上游钉死的水位线

`chunkText(text, maxLen = 180)`（`use-tts.ts:330`）。理由在 `:315-329`：云端 `/api/tts` 代理 Google Translate TTS，**上游硬上限恰好 200 字符**（实测 200 通过、205 起 400）；函数侧把越界判成 400 而不是放行（`functions/api/tts.js:27-32`），因为放行后上游会给出误导性的 502。历史上切片是 400，导致云端几乎每段都失败。

`scripts/verify-tts-progress.mjs:71-77` 会按函数名抽出真实实现并断言源码里仍是 `maxLen = 180` —— 改这个数字要同时改守卫。

**例外**：桌面本地合成上限是 400（`server/local-server.mjs:482`），走的是 msedge-tts / Windows SAPI，不是 Google。

### 2.4 「读到哪」只能靠 `onChunk`

原生引擎没有词级回调，所以进度只能这样算（`use-tts.ts:34-41` 定义、`:503-508` 上报）：`onChunk(chunkIndex, wordsBefore)`，`wordsBefore` 由 `countWords` 累加（口径 `:326-329`），并且**只在 `engineIdx === 0` 时上报**，避免降级重试把同一段重复点亮。

反查表在阅读器：`PageReader.tsx:146-184` 维护 `readRangesRef`（区间表），用 `onChunk` 顺序扫表得到 `(pageIdx, paraIdx, ratio)`。成立的前提是恒等式「各段词数之和 === 各切片词数之和」，由 `verify-tts-progress.mjs:173-178` 逐页断言。

### 2.5 看门狗与双触发防护

- URL 引擎 25s 安全定时器（`:587`）触发时先过 `madeSound` 分流（`:562-590`）；
- **新引擎接棒前必须清掉上一个引擎的看门狗**（`:539-543`，注释直指「同一句被两个引擎各读一遍」）；
- 原生分支用 `settled` + `clearWatchdog/teardown`（`:634-636`，看门狗声明 `:642`），**先问引擎有没有英语音色再决定要不要猜沉默**（`:618`）：有音色 ⇒ 看门狗预算 `max(12s, 预期时长×2)`；没有 ⇒ 快速降级 5s。两档口径收在 `nativeSilenceBudgetMs()`（`:221`，常量 `:217-218`）。**为什么不能是固定秒数**：真机 Redmi Turbo 3 实测 `speak()` 是**整句念完才 resolve**，约 380ms/词（1 词 1361ms / 8 词 3752ms / 14 词 4986ms / 27 词 10317ms），且**从不派发 `onRangeStart`** —— 固定 2.5s 等于"只允许 6 个词"，抬到 5s 也只是推到 13 个词，长句照样被掐（详见注意事项 12）；
- 「立即 resolve 但从未 `onRangeStart`」判为**假成功**并降级，阈值 `min(expectedMs*0.4, 1500)`（`:685-688`）；`expectedMs` 按实测 **400ms/词** 估（`:629`，旧值 260 低估约 1.5 倍）；
- 原生引擎**不派发 `onRangeStart` 时也要报实测**：整句念完补一条 `startEvidence: false`（`:694`），设置页据此写「整句念完 Xms」而不是「起播 Xms」（`TTSSettings.tsx:580-584`）—— 否则这台设备上用系统引擎朗读成功之后，「上次朗读实测」永远是空白。
- 用户暂停时撤看门狗，免得把正在读的那句杀掉（`:578-590`、`pause()` `:977-992`）。

### 2.6 音色体系

| | |
|---|---|
| 默认音色 | `piper:lessac`（`tts-voice-catalog.ts:140`，兜底 `FALLBACK_VOICE` 同一对象 `:124-127`） |
| Kokoro 可选 | 11 个英语音色，`speakerId` = 2,3,6,9,10,11,16,18,19,21,26（`:109-121`；2026-10-05 与模型内嵌 `speaker2id` 元数据逐条核对吻合） |
| 在线 Edge | 另有一套 12 个 `srv:edge:*`（`:40-62`） |
| **speakerId 表在前端** | 原生插件只认 `modelId`（`SherpaTtsPlugin.java:43-45`），越界拒绝（`:457-461`） |

**RTF 决定 Kokoro 不适合长文**：同一段 122 字符稳态实测，lessac 音频 5789ms / 合成 428ms → **RTF 0.076**；Kokoro 6819ms / 6867ms → **RTF 1.008**（`tts-voice-catalog.ts:132-140`）。RTF > 1 时合成追不上播放，**加大预取深度也解决不了** —— 2026-10-19 又在四核模拟器上按三档线程重量过，见本文开头那张表。

改音色必须同步四处：① Java `MODEL_*` 常量与 `REGISTRY`（`java:61-62,288-296`）；② `scripts/check-tts-voices.cjs:29-45` 的 `MODELS`；③ `tts-voice-catalog.ts:95` 声明的 `modelId`；④ 资产白名单 `scripts/fetch-android-tts.cjs:37`。然后跑 `npm run check:tts-voices`（已嵌在 `package:apk` 前置，失败 `exit 1` 阻断打包）：它除越界检查外，还直读模型内嵌 `speaker2id` 元数据逐条核对名字↔下标，并对 `n_speakers` 与注册表的 `numSpeakers` 做交叉核对。

### 2.7 缓存与在途去重

| 层 | 键 | 上限 | 位置 |
|----|-----|------|------|
| JS Map | `voiceId\|speed.toFixed(2)\|text` | 120，FIFO | `sherpa-tts.ts:150-152,168-171,260-264` |
| 原生文件 | `sha1(modelId\|speakerId\|speed\|text)+'.wav'` | `cacheDir/sherpa-tts`，命中判 `length>1024`，先写 `.part` 再 rename | `java:463-478` |
| 云端 Cache API | `nativethink-tts-v1` | 10s 超时 + `priority:'low'`；**FIFO 裁到 400 条** | `use-tts.ts:275-300` |

键里**必须含音色与语速**：只按文本+语速会「换音色播出上一个音色的音频」（`sherpa-tts.ts:168-171` 注释）。

云端结果缓存的条数上限 `MAX_TTS_CACHE_ENTRIES = 400`（`use-tts.ts:289-292`，2026-10-05 加）：**Cache Storage 与 IndexedDB 共享同源配额**，只增不减会把配额吃满，连带**整书译文写入静默失败**（那是 IDB 的另一大户 —— 2026-09 体检结论）。`cache.keys()` 近似插入序，所以从头部删就是 FIFO，不需要额外时间戳。

同一批把**播放用的 Blob URL 用完即 revoke**：每段音频一个 objectURL，`stopAudio()` 里释放（`:387`），分派引擎时记下当前 URL（`:558`，只认 `blob:` 前缀，非 blob 的引擎不记）。不 revoke 的话 objectURL 会驻留到页面卸载 —— 连着朗读整本书这种长会话里内存单调上涨。

在途去重 `inflight: Map<key, Promise>`（`sherpa-tts.ts:195-230`）：原生是 `synthLock` 串行的，同文本并发请求会各占一条线程阻塞在锁上。真机闪退链写在这里：每次 `new Thread` + `generate()` → `OutOfMemoryError: pthread_create failed` → App 崩（`java:95-105`，栈原文抄在 `verify-tts-hardening.mjs:5-9`）。修法是单线程 `ttsWorker` + 独立 `loadWorker`（`java:106-117`）+ 队列上限 `MAX_PENDING_TTS = 8`，满了 `call.reject("busy: too many pending tts requests")`（`java:119-140,490-493`）。

### 2.8 闪退自愈

`checkBundledEngineHealth()` 在 app 启动最早处调用（`src/index.tsx:11,15`）。实现思路（`sherpa-tts.ts:43-52,111-132`）：**加载前打 `__nativethink_sherpa_try`、到 ready 才清除**；启动时发现 try 键还在，说明上次加载过程中崩了，就写 `__nativethink_sherpa_off` 停用内置引擎。注释明确写了**不能用时间新旧判定**（`:38-42`）。用户手动恢复走 `reenableBundledEngine()`（`:27-32`），按钮在 `TTSSettings.tsx:468-476`。

诊断回显：`reportPlayback` 只在**首次起播**写 `lastPlaybackReport`（`use-tts.ts:247-260`），降级标记 `fellBack: engineIdx > 0`，设置页每秒轮询读取（`TTSSettings.tsx:92-93`）；主动自检按钮 `probeTtsEngines()`（`use-tts.ts:1068-1130`）依次探 native(5s 看门狗)/cloud(8s)/edge/google 直连/浏览器语音。

### 2.9 系统语音（Android 原生插件）的插件边界

| 契约 | 位置 | 破坏后果 |
|---|---|---|
| **Capacitor 插件对象不许穿过 Promise 边界** | `native-tts.ts:51,53,67-77`（具名持有者 `INativeTtsHandle`） | 插件是 Proxy，`typeof plugin.then === 'function'`；`async` 函数直接 `return 插件` 会让 Promise 同化去调 `plugin.then(res, rej)` —— 这一句被当成一次真实原生调用发给 Android，而原生没有 `then` 方法，于是 **res/rej 永不调用 → 永久 pending**。它**不是抛错**：外层 `try/catch` 兜不住（同化发生在 try 块之外），还缓存在模块级 `pluginPromise`（`:53`）里拖死整个会话 |
| 取语音列表必须有界 | `native-tts.ts:81-92`（`VOICE_LIST_TIMEOUT_MS = 4000` + `withTimeout`） | 原生不响应时设置页永远停在「读取中…」 |
| 自检第一步必须带超时 | `use-tts.ts:1074-1080` | 「自检中…」永不返回。云端那步早就有 8s 超时（`:1102-1103` 注释写着「必须带超时」），native 这步漏了同一条口径 |
| 6 个调用点全部解构持有者 | `native-tts.ts:89,179,186` + `use-tts.ts:393,601,980` | 漏一处就是那条链静默失效（speak / stop / 试听 / 去安装 / 音色列表各一处） |
| **先问能力再猜沉默** | `native-tts.ts:148-157`（`hasEnglishVoice`，空列表**不**缓存）+ `use-tts.ts:598,221` | 固定秒数的看门狗必然掐断比它长的真实朗读（`speak()` 整句念完才 resolve，约 380ms/词）。有英语音色 ⇒ 引擎是活的 ⇒ 预算 `max(12s, 预期×2)`；没有 ⇒ 才用 5s 快速降级 |

真机 2.0.45 实测（2026-10-05，USB/CDP）：朗读设置里「系统语音引擎」永远「读取中…」、点「朗读自检」永远「自检中…」、每调用一次多一条未捕获的 `"TextToSpeech.then()" is not implemented on android`。**原生侧本身是好的** —— 直连 `getSupportedVoices()` 返回 4 条语音、其中 1 条本地英语（`voiceURI:"en"`），所以修完就能出声。**只有 APK 会中**：网页/桌面没有原生 Proxy，`isPluginAvailable` 那条分支也走不到。

守卫：`node scripts/verify-native-tts.mjs`（37 条，替身真跑）。替身逐条复刻 Capacitor 代理的三个行为：任意字符串属性取到函数（所以 `then` 也是函数）、已实现方法正常 resolve、未知方法**另开一个会 reject 的 Promise 且绝不调用传进来的回调**（正是第三条让同化永远等不到结果）。A 段先自证"旧写法确实永久挂死 + 留下一条未捕获拒绝"，C 段让替身装死证明超时是真的而不是恰好快，E 段用**全新模块实例**证明 `hasEnglishVoice` 有界返回且空列表不被钉死；守卫自带 45s 看门狗，实现被改坏时**快速变红而不是卡住** `verify:all`。

**2.0.47 的实测台账**（同一台 Redmi Turbo 3，绕过 App 包装层直调插件，rate=1.0）：

| 文本 | 词数 | `speak()` 耗时 | 每词 | `onRangeStart` |
|---|---|---|---|---|
| 单词 | 1 | 1361ms | 1361 | 未触发 |
| 短句 | 8 | 3752ms | 469 | 未触发 |
| 例句 | 14 | 4986ms | 356 | 未触发 |
| 长句 | 27 | 10317ms | 382 | 未触发 |

同版本上机还抓到一次完整故障序列（开着「只用系统引擎」点例句朗读）：`getSupportedVoices 14ms` → `speak 1908ms` → `speak 1736ms` → **`speak 未回包`** → `stop` → `[tts] native engine silent → falling back` —— 也就是 5s 档仍会掐断 13 词以上的句子，这条台账是 §2.5 那套两档预算的由来。

## 3. 注意事项

1. **切片上限 180 不能改大**。改成 200 以上，整条云端链路会失败并**静默**降级到更差的引擎，看起来"能读"但音质/延迟都变了。守卫会红：`node scripts/verify-tts-progress.mjs`。
2. **引擎候选顺序没有任何脚本断言**。`verify-tts-hardening.mjs` 只读 `sherpa-tts.ts`/Java/`TTSSettings.tsx`，**不覆盖 `use-tts.ts:485-499` 的排序**（2026-10-19 起 D 段覆盖了 piper 分支的**入队顺序**，但排序本身仍没有断言）。改排序要真机验证四种排法（默认 / 选在线音色 / 只用系统引擎 / 护栏已停用）。
3. **自动朗读开关 `__nativethink_vocab_autospeak` 现在真的四处共用**（2026-09-30 补齐）：复习检测 `FlashcardMode.tsx:64-67`、每日学习 `DailyLearningMode.tsx:219-221`、语块复习 `ChunkTrainingPage.tsx:373-379`、**快速闪卡 `QuickCardMode.tsx`**（本轮新增：读键门控朗读 effect + 进度行上给开关，默认开与其余三处同口径）。此前快速闪卡完全不读它，而别处的提示语写着「与复习检测/快速闪卡共用此设置」—— 用户关掉后快速闪卡照样出声。守卫：`verify:vocab-cards` 断言四处都读同一键、快速闪卡门控位于 `tts.speak` 之前、且开关入口与写键都在。
4. **刻意不自动朗读**：配对 `matching`（视觉任务，`DailyLearningMode.tsx:291`）、拼写/填空（`:303`「那等于把答案念出来」）、句子拼写的 fill 模式（`SpellingPage.tsx:556` 只在 dictation 自动读）。新增子模式时先想清楚朗读会不会泄答案。
5. **预合成与实播的键可能不同**，两种情况都会让预热白做：① 语速不一致 —— 预热写死 `rate: 0.85`（`SpellingPage.tsx:549,553`）而 `speak()` 用 `settings.rate`（默认 0.9）；② 长句 —— `prewarm` 不切句、`speak` 走 `chunkText(…, 180)`（`use-tts.ts:881-905` vs `:907` 起），超 180 字符的句子预热键与分块键本就不同。缓存键含语速这件事在 `sherpa-tts.ts:168-171` 有明文注释。
6. **Kokoro 音色总数口径已统一为 54（2026-10-05）**：Java 两处与 `fetch-android-tts.cjs:31` 的「103」是 v1.1-zh 的遗留口径，已改。权威值 = 模型内嵌元数据（`n_speakers=54`、`speaker2id` 54 条，`comment` 写明 "This is Kokoro v1.0"），`voices.bin` 28,200,960 B ÷ 522,240 B/音色 = 54.0 交叉吻合。守卫：`check-tts-voices.cjs` §2.5 直读元数据核对名字↔下标与 `n_speakers`，不符即 `exit 1` 阻断打包。
7. **`TTSSettings.tsx:457-461` 的诊断文案「正常应为约 60MB」指的是 lessac（63MB）**，而该处 `modelBytes` 取自 Kokoro（114MB）；`sherpa-tts.ts:110` 的「模型 60MB」同样偏指 lessac。别按这条文案判断资产是否完整。
8. **`assetManager` 必须传 null**（`java:341-347`）：否则 filesDir 的绝对路径会被当成 assets 名解析，原生直接崩。
9. **模型常驻不释放、失败过的模型不再重试**（`java:298-311`）—— 想重试要重启 App，不是再点一次。
10. **`/api/tts-voices` 只有桌面版有**（`server/local-server.mjs:671`，Cloudflare 侧无此函数）。前端因此用 `platformTag() === 'desktop'` 限定（`TTSSettings.tsx:143-157`）。去掉这个判断的后果：网页每次路由切换一个 404，APK 里因为 `index.html` 的 `/api/` 重写会真的发一次网络请求。守卫：`verify-tts-hardening.mjs:132-145`。
11. **降级链里任何一环"永不 settle"都会吃掉整条链**，而且比"失败"更糟 —— 失败会降级，挂住不会。具体形状：内置引擎被闪退护栏停用时候选是 `['native','cf','edge','google']`（`use-tts.ts:492`），native 那环一旦挂住，后面的云端永远轮不到；而看门狗写在 `.then` 回调**内部**（`:642-655`），`.then` 不执行时它根本没起 —— 于是"闪退自愈"反而把朗读彻底弄死。所以：native 分支 `.then` 之前的每个 await（含 `getNativeTts()`、`pickPreferredEnglishVoice()`、`hasEnglishVoice()`）都必须自带超时，这条就是 §2.9 那两处超时的由来。改这里跑 `verify-native-tts`。
12. **"没在 X 毫秒内出声"不等于"不会出声"，而固定秒数的看门狗一定会掐断真实朗读**。真机 Redmi Turbo 3 实测（台账见 §2.9）：系统引擎 `speak()` 是**整句念完才 resolve**，约 380ms/词，且**从不派发 `onRangeStart`**。于是 2.5s ≈ "只允许 6 个词"，抬到 5s 也只是"只允许 13 个词"—— 2026-10-06 先按后者修过一版，上机立刻抓到 14 词例句在第 5 秒被 `stop` + 降级掐断。现在的口径是**先问能力再猜沉默**：`hasEnglishVoice()` 为真 ⇒ 预算 `max(12s, 预期时长×2)`；为假（缺语音包，正是原来要防的那种无声挂住）⇒ 才用 5s 快速降级。**通用口径**：给外部引擎设"沉默即判死"的阈值之前，先在这台设备上量一次真实耗时，并问自己"这个信号到底是起播还是收工"—— 拿不到起播事件时，任何固定秒数都是在按句长抽签。
13. **APK 的 `/api/*` 重写只覆盖 `fetch`**（`index.html:25-35`）。音频/图片类 URL 得自己读 `window.__API_BASE__` 拼接（`use-tts.ts:258-266` 的 `cfTtsUrl` 就是这么做的）—— 新增任何非 fetch 的资源加载都要照做，否则 APK 里 404。
14. **改完必跑**：`npm run check:tts-voices`（音色/模型）、`node scripts/verify-tts-progress.mjs`（切片+阅读器反查表，实测 6175 断言）、`node scripts/verify-tts-hardening.mjs`（降级/在途去重/桌面限定，实测 15 项；**注意它没有 npm script，只能裸跑**）。
