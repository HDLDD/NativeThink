# 影子跟读（`/shadowing`）

> 模块 key `shadowing`，`src/pages/ShadowingPage/ShadowingPage.tsx`（1672 行）。左栏选语料、右栏播放器，无 tab。
> 注：`renderAnnotated` 仍刻意放文件尾（`:1658-1672`）—— 函数声明有提升，位置不影响运行；插在组件段中间会让本文所有 `文件:行号` 整体漂移。

## 1. 功能

自动连播 / 单句循环 / 再听一遍 / 「我读完了」逐句打勾 / 语速调节 / AI 生成整篇语料 / AI 追加句子 / 发音难点分析 / **录音评分（在线词级 + 本地节奏/音量/音高）**。

语料合并索引：`allSentences = corpus.sentences + extraSentences[id]`（`:281-284`）—— **这个"合并索引 vs extras 本地索引"的区别是本页最大的一处风险**，见 §3.1。

## 2. 实现方法

### 2.1 数据

`MOCK_SHADOWING_MATERIALS` 实测 **117 篇 / 579 句**（`^  { id:` = 117、`S('N-M'` = 579）。文件头的注释「8 materials ~90 sentences」**已过期**（那只是 DAILY 分节的标记）。

写入脚本三个：`pad-shadowing.mjs:43`、`pad-shadowing2.mjs:45`、`clean-shadowing.ts:61`（整文件重写，旁边留着 `shadowing.ts.bak` 与 483KB 的 `shadowing.ts.expand-progress.json`）→ **重跑覆盖手改**。

### 2.2 播放器

| 能力 | 位置 | 关键点 |
|------|------|--------|
| 自动连播 | `useTTS({ onEnd })` `:370-383` | `skipAdvanceRef` 抑制手动推进；`isLoopingRef` 时改走 `loopSpeakRef.current()`（**此前 `onEnd` 直接 return，"循环"其实只是播完停住**）；否则 `currentIdxRef` +1 |
| autoplay 开关 | `:432` `usePageMemory('shadowing-autoplay', false)` | effect 在 `:442-449`，依赖 `[autoPlay, currentSentence, tts.speak]`（见 §3.2 第 2 条） |
| 单句循环 | `toggleLoop` `:469-472`，重播 `loopSpeakRef` `:389-395` | |
| 再听一遍 | `playCurrentSentence` `:421-430` | `skipAdvanceRef.current = true` 防推进（`:423`） |
| 我读完了 | `markCompleted` `:474-492` | 记账 +0.5（`:482`）+ 400ms 自动前进（`advanceTimerRef`，`setTimeout` `:486-490`） |
| 语速 | 滑块 **0.5–1.5，step 0.1** `:1290-1292` | 传给 `speak` 的 `rate` |
| 口音 | `lang: accent === 'UK' ? 'en-GB' : 'en-US'` | `:393/:414/:425/:445`（四处） |
| 预合成 | 当前句 + 下一句 `prewarm` `:398-407` | |

**没有和 `__nativethink_vocab_autospeak` 打通**（独立开关键 `shadowing-autoplay`，默认 false）。

### 2.3 录音评分（路线 2 + 路线 1）

**在线词级（路线 2）**：`MediaRecorder` 录一句（最长 20s）→ `blobToWav16k`（`src/lib/wav.ts`，16kHz 单声道 PCM WAV）→ `transcribeRecording`（`src/services/asr-service.ts`）POST `/api/ai/transcribe`（multipart）→ `scoreSpeech` 词级命中 + `speechPace` 语速。

- `startRecording`（`:825-885`）负责 getUserMedia/录音与 20s 自动停；`handleRecordingStop`（`:742-816`）转 WAV、上传、评分；`analyzeTranscript`（`:680-740`）用转写文本调 AI 反馈；`playRecorded`（`:887-892`）回听原录音。
- 清理：`cancelRecording`（`:324-343`）在卸载（`:347-353`）、切句/切语料（`:356-366`）、开始新录音时停采集并 abort 请求；`clearRecordedAudio`（`:315-322`）负责 revoke Blob URL。
- **必须转 WAV**：Chrome 录出 WebM/Opus，GLM-ASR-2512 实测回 `1214 transcriptions不支持当前文件格式`（2026-10-23 本地真界面复现）；WAV 是 GLM/Groq/SiliconFlow 都稳的容器。
- 评分口径：`scoreSpeech` 只比转写文本（命中率/漏词），`speechPace` 用录音总时长 vs 词数×260ms；界面明写「评分基于转写文本，不评音素发音」。
- 失败退路：没 Key / 转写失败 → 保留录音可回听，不假装打分；AI 反馈失败只提示，词级评分保留。

**本地兜底（路线 1）**：`handleRecordingStop` 在同一份 `uploadBlob` 上并行跑 `analyzeBlob`（`:787`，`src/lib/speech-analysis.ts`），**不等网络**：

- 语速：录音总时长 vs 词数×260ms；
- 音量：RMS/峰值 dBFS；峰值 < -24 或 RMS < -36 → 音量偏低；接近满幅样本占比 > 0.3% → 有爆音（**单帧峰值到 0 dBFS 不算爆音**）；
- 停顿：20ms RMS 能量包络，≥180ms 的静音；与意群边界比对（SpeakBack 用 `standardBreaks`；影子跟读按标点，没标点时只找第一个句中连词）；
- 音高：16kHz 单声道、40ms 帧 / 30ms 跳、70–400Hz 自相关；给中位/p10–p90/整体趋势/句尾是否上扬（疑问句参考）。**只做趋势提示，不评音素**。
- ASR 失败时，词级卡片消失，但本地卡片仍显示语速/停顿/音量/音高；A/B 回放仍可用（「再听一遍」vs「听我的录音」）。
- 本地卡位置：`:1433` 起（`本地节奏分析`）。

### 2.4 AI

本页的 AI 调用仍以 `aiChat`（非流式）为主；录音反馈走 `analyzeTranscript`（`:680-740`）并带 `AbortController`，切句/开始新录音会 abort。其余三处（追加句子/生成整篇/发音难点分析）**仍无 AbortController**。

| 位置 | 用途 | 要求 | 判空 |
|------|------|------|------|
| `:197` | 追加句子 | JSON 数组 | ✅ `:220` 判空 → `:221` `extractJson` |
| `:541` | 生成整篇语料 | JSON 对象 + `validateMaterial`（`:502` 校验 `<u>` 配对 / 乱码 / AI 元文本） | ✅ `:574` |
| `:624` | 发音难点分析 | 中英双语 Markdown 表格 | ✅ `:665-668`（见 §3.2 第 1 条） |
| `:680-740` | 录音转写后的 AI 反馈 | 基于转写文本；提示词禁止声称音素级判断 | ✅ `:728-731` |

### 2.5 存储

| key | 位置 | 上限 |
|-----|------|------|
| `__nativethink_shadowing_completed` | `:104-114`：读一次（`:104-109`）+ 每次变更经 `trimOldest` 后整体 JSON 重写（`:110-114`），写失败 `warnStorageFull()` | **条数 2000 / 64KB 双封顶，FIFO 丢最旧**（2026-10-05） |
| `__nativethink_custom_shadowing` | `:117-122` 读 / `:124-128` 写，失败经 `persistJson`→`warnStorageFull()` | AI 生成材料不可重算 → **不裁剪** |
| `__nativethink_shadowing_extra` | `:152-157` 读 / `:159-161` 写，按语料 id 分桶，写失败同上 | 追加式；AI 追加句是用户资产不裁剪，键数受用过的语料篇数约束 |
| `shadowing-rate` / `shadowing-filter` / `shadowing-autoplay` | `:98` / `:144` / `:432`（`usePageMemory`） | — |

时长：`:417` 点播放即 +1（**纯听也算**）、`:482` 完成一句 +0.5。

## 3. 注意事项

### 3.1 【已修，2026-09-29】删除 AI 追加句曾把完成标记弄乱，100% 横幅永久消失

原缺陷的三段索引语义不一致（留着备查，改动时别退回这个形态）：

- **写**：`markCompleted` 的键 `${selectedCorpus.id}-${currentSentenceIdx}`（现为 `:474-492`），`currentSentenceIdx` 是**合并数组索引**（`:281-284`、`:293`）。
- **读**：`totalCompleted`（`:287-290`）、进度条与「已完成」徽章（`:1174`、`:1527`）、「我读完了」按钮禁用态（`:1313`）、句行绿勾（`:1579-1632`）、**100% 横幅判定（`:1556`）**、重置（`:1568`）—— 全部读合并索引键。
- **删（错）**：删除按钮传 `idx - selectedCorpus.sentences.length`（**extras 本地索引**）进 `handleDeleteSentence`，而它把这个数字当合并索引位移。

后果：原 8 句 + 追加 3 句、做完了除第一条追加句以外的 10 句，此时删掉第一条追加句 → 被删的其实是 `id-0`（第 1 句的标记），标记整体错位一格 → 完成数掉到 9 而新句数是 10 → **100% 横幅与「再来一遍」按钮永久消失**。
`setExtraSentences` 用本地索引过滤本身是对的 —— 根因是**同一个"句子序号"在三个地方含义不同**。

现在的形态：

- 索引换算单点归属在 **`src/lib/shadowing-progress.ts`**（纯函数、零依赖）：`shadowingCompletionKey` / `parseCompletionIndex` / `countCompletedForCorpus` / `isSentenceCompleted` / `shiftCompletionAfterDelete` / `clearCompletionForCorpus` / `extrasLocalIndex`。
- `handleDeleteSentence(corpusId, mergedIdx)` **只收合并索引**，内部用 `extrasLocalIndex` 换算本地索引；`localIdx < 0` 直接 return（内置原句不可删）；当前指针跟着左移/夹紧。
- 键构造、计数、清空、位移在页面里都不再手写 —— `currentDoneKey`（`:295-298`）、`markCompleted`（`:474-492`）、句行绿勾（`:1579-1632`）同源。
- **守卫：`node scripts/verify-shadowing-completion.mjs`（27 断言）** —— A 段真转译真跑纯函数，含"退回旧调用方式"的正对照（同一场景下完成数掉 1 且横幅不成立、`id-7` 丢失），变异实测：把调用点改回 `idx - sentences.length` 会红两条；B 段还守语音标注渲染（§3.2 第 8 条）。

### 3.2 其它

1. **【已修，2026-09-29】两处分析调用现在都先判空串**：`setAiAnalysis(result)` 前有 `if (!result.trim())` + `toast.error('AI 服务暂不可用…')`（`:665-668`、`:728-731`）。修的原因：`use-ai.ts:80-84` 已经把异常吞成返回 `''`（AbortError 也一样），本页的 `catch` **永不触发** —— 原先用户会看到「分析中 → 一片空白且无任何提示」。守卫：`verify-shadowing-completion` 静态断言两处 `!result.trim()` 都在（断言数 = `setAiAnalysis` 出现数）。
2. **【已修，2026-09-30（`40b5b39`）】autoplay effect 的依赖数组**。原写法只写 `[currentSentenceIdx]`：开着自动播放时改语速/换口音**不会对当前句生效**；反过来 `currentSentenceIdx` 不变但句子内容变了（追加/删除句子后索引复用）也不会重读。现在依赖是 `[autoPlay, currentSentence, tts.speak]`（`:442-449`，原委注释 `:433-441`）：`currentSentence` 是"句子身份"，换语料/换句都会重读；`playbackRate`/`accent` **刻意不进依赖** —— 它们是"下一句起生效"的参数，拖语速滑杆时若重新触发，每动一格就把当前句从头再读一遍，比原来更糟。
3. **渲染期间直接写 ref**：`:301/:303/:386/:389` 在 render 体内赋 `allSentencesRef/rateRef/isSpeakingRef/loopSpeakRef`。并发渲染下（Suspense / transition）可能与实际提交的值不一致；本页目前没用到这些边界，但把它当地基就是隐患。
4. **两栏都是全量渲染 —— 但量过之后判定不动**：左栏 117 篇直接 map（`:1086`），右栏句列表同样全量（`:1579-1580`，只有 `max-h-[400px]` 滚动，无虚拟列表）。headless Chrome 393×851 / DPR 3 实测 `/shadowing` 挂载后 **2,219 个 DOM 元素、页高 2,256px**，与写作页折叠后的 2,634px 同量级，不是短语库（4,805）那种规模 —— 所以这轮**没有为它改代码**：没有测量证据就加折叠，等于白白削弱「一眼看完全部语料」的入口。真要动之前先重跑测量，并参照 `verify-list-scaling.mjs` 补断言。（同一份 harness 里 longtask 观察器装在 navigate 之前会因文档切换而丢失，所以这里的结论只建立在 DOM 节点数与页高上。）
5. **`cancelPendingAdvance` 的覆盖点**：`:453`（prev）/ `:462`（next）/ `:496`（selectCorpus）/ `:351`（卸载）都取消了 400ms 自动前进 ✅；`markCompleted` 自己重排前也先撤（`:484`）。**句行直达（`:1588`）不撤** —— 400ms 窗口内点其它句子，在途定时器仍会 +1（小窗口、未修）。新增"离开当前句"的路径时请保持这个约定。
6. **【已修，2026-10-05】`__nativethink_shadowing_completed` 条数 + 字节双封顶**：原来无上限、整份 JSON 每次变更重写（每篇 579 句全记下来还行，语料越多写越贵）。现在落盘前先 `trimOldest([...completedSentences], 2000, 64KB)`（常量 `:101-103`，落盘 `:110-114`），保留最新、从最旧的标记丢；写失败不再静默（`warnStorageFull()`）。守卫：`verify-vocab-caches` ⑥。
7. **守卫覆盖面**：`node scripts/verify-shadowing-completion.mjs`（27 断言）守 §3.1 的索引契约（纯函数真跑 + 接线）与第 8 条的语音标注渲染；`node scripts/verify-shadowing-asr.mjs`（51 断言）守路线 2（WAV 编码、provider 顺序、响应归一、页面接线、旧 Web Speech 必须消失）；`node scripts/verify-speech-analysis.mjs`（39 断言）守路线 1（合成波形的音量/停顿/音高/语速，以及 SpeakBack/跟读页共用 analyzeBlob）。其余交互仍靠无头 Chrome 真点。

8. **【已修，2026-10-05】「语音标注」面板曾把 `<u>` 重读标签整个剥掉 —— 标注形同不存在**（HelpGuide 审计时发现：帮助里写着「每句附语音标注（重读提示）」，界面上却与原句一字不差）。数据层一直是对的：`src/data/shadowing.ts` 用 `<u>…</u>` 圈重读处；两处 AI prompt（`:209`、`:560`）要求产出这个标签，`validateMaterial`（`:502`）还校验开闭配对（`:511-513`）。坏的是渲染站点 `:1225`：对 `annotatedText` 直接 `.replace(/<u>/g, '').replace(/<\/u>/g, '')`。现在改走文件尾的 `renderAnnotated`（`:1658-1672`，函数声明提升；**刻意放文件尾** —— 本页文档的 `文件:行号` 引用全部落在组件段内，插在中间会让它们整体漂移）：只认 `<u>`，重读处渲染为青色加粗下划线，其余按纯文本渲染并剥掉残标签（**不走**危险 HTML 注入 —— annotatedText 可能来自 AI）。守卫：`verify-shadowing-completion` 新增 4 条（渲染接线 / 旧剥标签写法正对照 / 识别逻辑存在 / 剥注释后全页无危险注入），变异实测退回旧写法红两条；行为侧 2026-10-05 无头 Chrome CDP 实测 9/9（句 1 `day`；切到句 2 双标记 `dium`/`tte`；青色 rgb(0,184,148) + 600 字重 + 无标签字面量漏出）。

9. **语料收藏的命中区**（2026-10-28）：`ShadowingPage.tsx:1121-1134` 的心形是 `span role=button`，`p-2.5`（34px 点击区）并带 `aria-label/title`；393px 下原先 22px 的纯图标不好点。不要把它缩回 `p-1`。

## 4. 音频评测路线（2026-10-23 定序）

**定序：路线 2（已实现）→ 路线 1（已实现）→ 路线 3（以后）。** 路线 2 让录音真的参与在线词级评分；路线 1 补上离线兜底与节奏/音量/音高；音素级评测留到以后。

### 4.1 路线 2：录音 → 服务端转写 → 词级评分（2026-10-23 已落地）

数据流：

1. 跟读页 `startRecording`（`:825-885`）用 `MediaRecorder` 录一句，最长 20s；`cancelRecording`（`:324-343`）在卸载、切句、切语料、开始新录音时停采集并 abort 请求。
2. `handleRecordingStop`（`:742-816`）先保留原 Blob 供「听我的录音」，再用 `blobToWav16k`（`src/lib/wav.ts`）转 **16kHz 单声道 16-bit WAV**，交给 `transcribeRecording`（`src/services/asr-service.ts`）。
3. `transcribeRecording` POST `/api/ai/transcribe`（multipart：audio + provider + apiKey + language）；provider 顺序由 `pickAsrCandidates`（`src/lib/asr.ts`）决定：**GLM（出厂 Key）→ Groq → 硅基流动**，一个失败自动换下一个已配置 Key，全部失败才报错。
4. 服务端 `functions/api/ai/transcribe.js` 同时支持 multipart 与旧的 JSON（B 站 audioUrl/bvid）；`normalizeTranscript` 补 `text` 兜底（GLM 只回 `{text}`，不返回 segments）；Origin 白名单 + IP 限流 + 8MB 上传上限；音频转发给上游后即弃，不落盘。
5. 客户端 `scoreSpeech`（`src/lib/speech-score.ts`）算词级命中/漏词，`speechPace` 用录音总时长 vs 词数×260ms 算语速；AI 反馈只基于转写文本，提示词明确禁止声称音素级判断。
6. 界面明写「评分基于转写文本，不评音素发音」；失败保留录音可回听，不假装打分。

**为什么必须转 WAV**：Chrome 的 `MediaRecorder` 产出 WebM/Opus，GLM-ASR-2512 实测回 `1214 transcriptions不支持当前文件格式`（2026-10-23 本地真界面复现）；16k mono WAV 是 GLM/Groq/SiliconFlow 都稳的容器，20s 约 640KB。

**旧路径**：`webkitSpeechRecognition` 已从本页移除；APK WebView 的识别通道不可靠（见 `VideoLabPage.tsx:491-560` 的看门狗与真机记录）。端侧仍无 ASR，网页/APK/桌面三形态统一走服务端转写。

### 4.2 路线 2 的验证（2026-10-23）

- **直连 GLM**：出厂 `scripts/.apikey` 可用；2.56s 英文在 601ms 返回完全正确的转写，`scoreSpeech` 100%。
- **现有端点**：最初只解析 `data.segments`，GLM 返回 `{text}` → `{"segments":[]}`；补 `text` 兜底后，`--via-function` 的 multipart 与 JSON audioUrl 两条路径都通过（444ms / 499ms）。
- **真界面**：本地 Pages Functions + Chrome 假麦克风，录 5.5s → WAV → GLM 转写 → 词级 25%（故意喂错句，2/8 词）+ 漏词逐条显示 + 语速 5.5s/参考 2.1s；AI 反馈按转写给出 0/10；换句后录音/评分/URL 全部清空。
- **守卫**：`node scripts/verify-shadowing-asr.mjs`（51 断言）；探针 `node scripts/probe-shadowing-asr.mjs`（直连 / `--via-function` / `--via-url` / `--dry-run` / `--audio`）。Edge TTS 在本机 403，探针自动回退 Windows SAPI。

### 4.3 路线 1：离线节奏/音量/音高（2026-10-23 已落地）

- 共享库 **`src/lib/speech-analysis.ts`**：
  - `expectedBreakRatios(text)`：按逗号/分号/破折号推导意群边界；没有标点时只找第一个句中连词（and/but/because/...），避免一场句子塞满假边界。
  - `summarizeVolume`：RMS/峰值 dBFS；音量偏低（峰值 < -24 或 RMS < -36）；爆音看「接近满幅的样本占比 > 0.3%」，**单帧峰值到 0 dBFS 不算**。
  - `detectPauses`：20ms RMS 包络，≥180ms 的静音；首尾 8% 不算意群停顿。
  - `summarizePitch`：16kHz 单声道 40ms 帧 / 30ms 跳，70–400Hz 自相关；优先取更短的强峰避免把 220Hz 读成 73Hz；给中位、p10–p90、整体趋势、尾段是否上扬。
  - `analyzePcm` / `analyzeBlob`：把语速、音量、停顿、音高合成一份结果；`analyzeBlob` 只负责浏览器解码。
- **跟读页**：`handleRecordingStop` 在 `:787` 并行跑 `analyzeBlob`；本地卡（`:1433` 起）展示语速/停顿/音量/音高；ASR 失败时仍然显示，且用「再听一遍 / 听我的录音」做 A/B。
- **句子精讲 SpeakBack**：`src/pages/SentenceLabPage/components/SpeakBack.tsx:67` 改用同一个 `analyzeBlob`；界面补音量与音高趋势，停顿边界仍用 `standardBreaks`，A/B 按钮保留。
- **明确不做**：音素对错、口音标准度。音高只给趋势，不把「上扬/下降」当发音评分。
- **守卫**：`node scripts/verify-speech-analysis.mjs`（39 断言，合成波形真跑）。真界面：ASR 被模拟失败时仍显示语速 3.2s/参考 2.1s、停顿 0/1、音量正常、音高 154–222Hz；SpeakBack 同样显示语速/停顿/音量/音高。

### 4.4 路线 3（以后）：音素级发音评测

**预研（2026-10-23）**：目前唯一明确「0 元」的是 **讯飞语音评测（流式版）** —— 个人认证 **1 万次 / 90 天**（https://www.xfyun.cn/services/ise）；腾讯云智聆最低 9.9 元/1 万次，Azure 免费层需要 Azure 账号/订阅。讯飞是 WebSocket（`wss://ise-api.xfyun.cn/v2/open-ise`），生产形态计划 **服务端只签名、客户端直连**：APISecret 不进前端，也绕开 Cloudflare Functions 出站 WebSocket 的不确定性。最小验证脚本 `scripts/probe-pronunciation-xfyun.mjs`（`--dry-run` / `--mock` / 真实 Key）已把签名、16k PCM 分帧、BOM 文本与 XML 总分/word/phone 解析跑通；mock 读数 65 帧 / 82,048 字节 / first=0 / last=2。真实分数待讯飞免费 Key。

- 需要专门的口语评测服务（Azure Pronunciation Assessment / 讯飞 / 腾讯云智聆等）或专门的音素声学模型。
- 需要 Key、服务端代理、隐私与配额设计。
- **禁用** Whisper 转写冒充发音评分：它会倾向于把不标准发音「纠正」成目标词，转写命中率高不代表发音标准。

### 4.5 不在本轮

- 不引入端侧 ASR 模型（体积/性能/三形态一致性问题）。
- 不改现有的完成标记、SM-2、学习统计口径。
