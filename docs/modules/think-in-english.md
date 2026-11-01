# 母语思维训练（`/think`）

> 模块 key `think`，`src/pages/ThinkInEnglishPage/ThinkInEnglishPage.tsx`（1421 行）。五个 tab：第一个「模式训练」是 2026-10-23 新增的间隔复习闭环（默认落在这里），其余四个仍是「读题 → 写英文 → AI 对比反馈 → 下一题」。

## 1. 功能与数据

| tab | TabsTrigger / Content | 干什么 |
|-----|----------------------|--------|
| 模式训练 | `:760` / `:796` | 15 个思维模式（四层）：体检 → 对比 → 识别 → 迁移，按 SM-2 排下一次（详见 §2） |
| 中式英语检测 | `:767` / `:801` | 输入英文，AI 找出中式表达并给地道说法（自由输入，无固定题目） |
| 思维转译 | `:774` / `:909` | 看中文场景，直接用英语描述画面 |
| 反翻译训练 | `:781` / `:1074` | 看英文关键词/场景提示，造一个完整情境句 |
| 思维还原 | `:788` / `:1251` | 看“按英语思维写出的中文”，还原成地道英语并对照思维模式 |

`activeTab` 由 `usePageMemory('think-tab', 'patterns')` 持有（`:54`）。**旧存值不改写**：存过 `detector` / `translation` / `backTranslation` / `nativeTranslate` 的浏览器仍落在原 tab，只有从未切过 tab 的新用户默认进「模式训练」。

| 数据 | 实测条数 | 来源与可改性 |
|------|---------|-------------|
| `MOCK_THINK_EXERCISES`（`thinkexercises.ts`） | **200**，其中 `type:'backTranslation'` **100**、`type:'translation'` **100** | **无生成脚本** → 手写可改。页面只用 `translation` 那 100 条（`:126`） |
| `MOCK_BACK_TRANSLATIONS`（`backtranslation.ts`） | **200** | 手写；也被句子学习的造句复用（见 `sentence-lab.md`） |
| `MOCK_NATIVE_TRANSLATES`（`nativetranslate.ts`） | **250**（`n1`–`n250`，前 50 条多行、后 200 条单行） | `scripts/add-exercises.cjs` 与 `add-more.cjs` 都是**读原文件后追加**（不是整体重写）：重跑会在文件末尾重复插入同批 id，**不会**清掉手改，但会造重复题 → 跑前先确认当前 id 范围 |
| `THINK_PATTERNS`（`think-patterns.ts:51`） | **15 个模式 ×（5 识别 + 5 迁移：3 新情境 + 2 换措辞）= 150 项** | 手写；结构、id、四层 `layer`、迁移 `kind`、答案下标分布（0/1/2 各 25）由 `verify-think-patterns` 守 |
| `THINK_PATTERN_DIAGNOSTIC`（`think-patterns.ts`） | **15 题（每模式 1 道识别）** | 手写；题面引用必须真实存在且不重复，由 `verify-think-patterns` 守 |
| `THINK_PATTERN_REWRITES`（`think-patterns.ts`） | **75 题（每道识别题派生 1 条改写）** | 把非最佳选项当原句、最佳选项当目标；按题号轮转模式（前 10 题覆盖 10 个模式）；`source≠target` 由守卫守 |
| `THINK_REAL_TASKS`（`think-patterns.ts`） | **2 封邮件（前测/后测）** | 同题型不同内容；5 个目标模式；AI 分析或手动勾选，前后测只对比模式使用/缺失 |
| `THINK_SPEAKING_PROMPTS`（`think-patterns.ts`） | **2 条口头任务（60–90 秒）** | 客户电话：项目延迟 / 质量投诉；目标模式与真实任务同一组 5 个；本地录音 + 回听 + 自评，不上传、不接 ASR |
| `THINK_LONG_TASKS`（`think-patterns.ts`） | **6 条（长邮件 / 客户对话 / 图表 1 / 实景图 3）** | 每条 5 个目标模式；图表用内联 SVG，实景图在 `public/images/think/*.webp`（带 alt、懒加载）；AI 分析或手动自查，不写 SM-2 |

## 2. 模式训练闭环

| 层 | 文件 | 要点 |
|----|------|------|
| 内容 | `src/data/think-patterns.ts` | 15 个模式（`subject-first` … `cohesion`），分四层（`structure` 信息结构 / `verb` 动词与焦点 / `clarity` 逻辑与信息 / `pragmatics` 语域与语用）；识别题三个选项都**语法成立**，差在思维模式；每道识别题另有 `THINK_PATTERN_OPTION_NOTES` 逐项说明（`best` 最直接 / `ok` 也能说但更绕 / `off` 这里不地道，`best` 必须落在正确项）；每模式至少 2 条思维线索 `cues`（当前 3 条）、中式/母语对比 `contrast`；每个迁移场景另有 `kind`（缺省 `scenario`，换措辞题标 `wording`）、`thinkingSteps`（先想三步）与 `why`（为什么参考表达自然） |
| 纯调度 | `src/lib/think-patterns.ts` | SM-2（`applyPatternResult:176`）、到期（`isDue:285`）、闭卷判定（`isClosedBook:304`）、延迟档位（`delayedProbeDays:313`）、延迟队列（`buildDelayedProbeQueue:321`）、体检计分（`scoreDiagnostic:361`）、按体检组队（`buildDiagnosticQueue:405`）、自由训练混合队列（`pickPracticePatternIds:431`）、四层统计（`summarizeLayers:454`）、队列（`buildReviewQueue:477`）、轮内回队（`pushRetry:497`）、通过清副本（`dropQueuedRetries:516`）、**会话状态机**（`createPatternSession:527` / `applySessionResult:536` / `advanceSession:554` / `sessionCounts:560`）、薄弱排序（`getWeakPatterns:573`）、31 天裁剪（`pruneDaily:600`）；零副作用、只允许 `import type` |
| 存储 | `src/lib/use-think-patterns.ts` | 唯一权威源。键 `__nativethink_think_pattern_progress`（纯模块 `think-patterns.ts:21` 定义，hook 引用常量不手抄）；形状 `{ progress, daily, dailyStats?, diagnostic?, diagnosticHistory?, realTask? }`。读盘时丢弃残缺记录（缺 `status` / `firstReviewedOn` / 任一有限数字字段）；`diagnostic` 只留已知层/已知模式建议，坏形状整份丢弃；`dailyStats` 按本地日裁 31 天，`diagnosticHistory` 同日去重、最多 10 次 |
| AI | `src/lib/think-pattern-ai.ts` | 拼判定 prompt（`:20`）+ 校验 AI 返回（`:49`） |
| UI | `PatternReviewMode.tsx` / `PatternOverview.tsx` / `PatternDetail.tsx` / `PatternDiagnostic.tsx` / `PatternReviewSession.tsx` / `PatternRewriteDrill.tsx` / `RealTaskAssessment.tsx` / `SpeakingPractice.tsx` | 概览 ↔ 模式详情 ↔ 体检 ↔ 三稿训练 ↔ 改写快练 ↔ 真实任务前后测 ↔ 口头任务 ↔ 完成页 |

**一轮怎么做**

1. 体检（`PatternDiagnostic.tsx`）：15 道跨模式识别题 → 四层 `correct/total` → 建议先练模式；不调 `grade`、不写 SM-2，结果只存汇总（`diagnostic` / `diagnosticHistory`）。
2. 概览（`PatternOverview.tsx`）：一行状态 + **一张「今日先练」焦点卡**（体检建议 → 薄弱 → 到期；卡内只有一个主按钮）+ 一句“之后接着练”的名字；体检 / 薄弱报告 / 趋势 / 真实任务 / 口头任务 / 长文对话 / 自由训练 / 改写快练都收成文字入口。**模式库默认摊开**：15 个模式按四层分组，每层带“已掌握 x/y · 到期 n”和进度条；卡片显示到期/复习中/已掌握、迁移通过率、lapses、连续通过点（4 格）与 AI 通过数（2 格），今天练过的标「今天已练」，未开始的卡不显示 0/4 假指标。每张卡有「详情」和「练/开始」两个独立按钮；支持**按层**（全部层级/四层）与**按状态**（全部状态/到期/进行中/已掌握）筛选，空结果可一键清除；筛选值存 `think-library-filter`（`usePageMemory`），进详情再返回或刷新都不丢。自由训练只保留“混合 5 个”，单模式直接走卡片，避免两套入口重复。排序由 `sortPatternsForLibrary` 统一：到期 → 进行中 → 未开始 → 已掌握，同档 lapses 优先。点详情进**模式详情页**（中文默认 / 英语默认 / 线索 / 反例与改法 / 排期），**不写进度**。
3. 会话（`PatternReviewSession.tsx`）：对比 → 识别 → **首稿 → 反馈 → 改写 → 反馈 → 新场景 → 最终反馈**。
   - 识别卡不再只给一个“选对/选偏”的整体解释：三个选项各标 `最直接 / 也能说，但更绕 / 这里不地道`，并逐项说明语法、搭配和语域。例：`conduct an analysis of...` 是自然但更正式的搭配，`make an analysis on...` 才是搭配不自然；只有后者标“不地道”，不会把“更正式”误说成“错”。
   - **三稿闭环**：首稿后必须按反馈改写；改写失败最多再改一版；改写通过后换一个新场景再写。最终只有**改写 + 新场景都通过**才记 pass，且只落一次 SM-2；首稿/改写的 AI 判定仍失败则逐稿自评。
   - 首稿卡默认收起「写之前先想三步」，点开才显示 `transfer.thinkingSteps`；改写卡展示上一稿反馈，新场景卡不再给三步。反馈卡并排「你的表达 / 参考表达」，再给 `transfer.why`、本模式线索与 AI 证据。
   - 首稿/新场景显示 `新情境 / 换措辞`；独立的 7/21/60 天延迟探测从概览「延迟探测（N）」进入，会话标 `延迟 N 天` 并闭卷。首稿提交前选「没把握 / 一般 / 有把握」，最终反馈显示「你的判断 · 判断准确/偏了」。
   - 第 3 次及以后复习（`repetitions >= 2`）进入**闭卷**：首稿与新场景收起三步，反馈卡再给「回看三步」；失败会重置 `repetitions`，重试卡自动回到开卷。
4. 识别/迁移题按**累计次数取模**轮换（`think-patterns.ts:205` 的 `pickRecognitionIndex` / `:210` 的 `pickTransferIndex`），迁移题每模式 5 条；下标在挂载时快照（`PatternReviewSession.tsx:72-75`）—— 评分后 `progress` 变化不会把反馈页的题换掉。
5. 换卡由顶层用 `pattern.id + session.index` 组成的 key 重挂载（`PatternReviewMode.tsx`），重试卡从对比阶段重新开始，不带着上一轮的已选项/答案/自评。
6. 本轮队列/下标/重试/结果是一个 `session` 状态，编排全在纯 reducer（`createPatternSession` → `applySessionResult` / `advanceSession` / `sessionCounts`）；组件只 `setSession(...)`。失败回队、最多 2 次、通过清副本、完成页按不同模式计数这些语义由 `verify-think-patterns` 真跑守（M11-M13 变异）。

**真实任务前后测**：写 80–120 词邮件，AI 标出 5 个目标模式哪些用上/还缺；前测与后测同题型、不同内容，页面只对比模式数量与缺失项，不造总分。AI 不可用时手动勾选“用上了哪些模式”；记录存 `realTask.baseline/followUp`，不写 SM-2。

**口头任务**（`SpeakingPractice.tsx`）：两条 60–90 秒真实场景（客户电话：项目延迟 / 质量投诉），目标模式与真实任务同一组 5 个。本地 `getUserMedia` + `MediaRecorder` 录音，停止后可回听并选「说顺了 / 还差一点」；到 90 秒自动停止（`secondsRef` + `stopRecordingRef`），换题/重录会丢弃旧 `onstop`，卸载时停轨并 `revokeObjectURL`。**不上传、不接 ASR、不做发音评分**；麦克风不可用时提示“可以先开口练，不录音”。自评结果不写 SM-2，也不计入学习时长。

**长文 / 对话 / 无中文源**（`LongTaskPractice.tsx`）：六条内置任务——150–220 词长邮件、100–180 词客户投诉对话、100–140 词图表描述（内联 SVG 画 6 周趋势），以及 3 条**实景看图任务**（车站赶车 / 服务台 / 团队白板，`public/images/think/{station-transfer,service-counter,team-whiteboard}.webp`）。所有无中文源题面全英文，**没有中文源可翻**；图片带 alt 与 `loading="lazy"`。每条 5 个目标模式；`textarea` 实时词数与目标区间，草稿按任务存裸 `localStorage` 的 `__nativethink_think_long_task_drafts`（350ms 去抖）。「分析这次作答」走 `analyzeTask('long-task', ...)`（先 `creditOnce`，20 秒超时，`silent: true`），AI 不可用时显示**手动自查**（勾选用上的模式，只回看、不落分）。「AI 再出一道」调用 `buildGeneratedPracticePrompt` / `validateGeneratedPracticeTask`，只把新题加进本地练习列表，**不进入掌握判定**；无 Key/坏 JSON/超时返回 null，界面给内联提示。全流程不写 SM-2、不弹 toast。

**SM-2 口径**（与句子复习 `use-sentence-review.ts` 同源）：quality 5 = 识别对 + 迁移过，4 = 识别错 + 迁移过，3 = 自评做到，2 = 迁移失败。`< 3` 记一次 lapse、`repetitions=0`、`interval=0`、`nextReview = now`（当轮可再练）；通过后间隔 1 → 3 → ×`easeFactor` 天（ease 下限 1.3）。`mastered` 额外要求 `aiTransferPasses >= 2` —— **纯自评刷不成已掌握**。

**自评校准**：迁移提交前先选 `1 没把握 / 2 一般 / 3 有把握`；只有 1/3 会与最终结果（AI 或自评）比对，累计 `calibrationHits / calibrationAttempts`，2 不计入。老记录缺这两个字段按 0 起算；概览焦点卡显示「校准 x/y」。

**队列与每日上限**：`maxPatterns = 10`（每日总上限）、`maxNewPerDay = 2`；到期项按 `nextReview` 升序排在前面，新引入项在后，合并后截断。今天已通过的**不再进队**（`isDue:183`），今天失败的下一轮仍会出现。轮内失败回队尾最多 2 次（`pushRetry`），通过后清掉排在后面的重复副本（`dropQueuedRetries`）。

**AI 判定 + 自评降级**：迁移提交先 `creditOnce('think', creditKey('pattern', id, answer))`（按动作计，AI 失败不撤销这次投入），再走非流式 `aiChat`（`PatternReviewMode.tsx:94`，`temperature 0.2` / `maxTokens 512` / **`silent: true`** / **15 秒 `AbortController` 超时**，定时器在 `finally` 清）。prompt 带模式名、一句话原则、全部线索、中式/母语对比、迁移场景与评分焦点；返回只认 `{ pass: boolean, feedback: 非空串, evidence? }`（`validatePatternJudgeResult`）。没配 Key / 超时 abort / 空串（`useAI` 失败约定）/ `extractJson` 抛错 / 形状不合规 → 返回 `null` → 会话回落自评：展示 `modelAnswer` + 检查点 + 「我用上了这个模式 / 还没做到」（`PatternReviewSession.tsx:453-494`）。`judgeSeqRef`（`:93/:157`）让卸载或换卡后回来的旧 Promise 直接丢弃。`silent` 由 `/api` 之上的两层共同遵守：`ai-service.ts` 的 `chat`/`streamChat` 跳过 `hintOfflineFallback()`，`use-ai.ts` 的 `handleChat`/`handleStreamChat` 跳过 `toast.error`（其他页面不传 `silent`，行为不变）。

**薄弱聚焦**：概览的「今日先练」用 `getWeakPatterns` 选最该练的模式（lapses 降序 → 迁移失败率降序 → 下次到期升序）。「薄弱报告（N）」按需展开 Top 3，逐行显示 lapses、迁移 pass/attempts 与最近反馈摘要（80 字截断），点行进入模式详情；默认收起，避免和焦点卡抢视线。

**模式详情**（`PatternDetail.tsx`）：从焦点卡的「看看…的中文默认与反例」或模式库任一行进入。只读展示中文默认 / 英语默认 / 线索 / 反例与改法（优先取带 `off` 项的识别题；没有 `off` 时退回非最佳项并标「还能更直接」）/ 当前排期与最近反馈；底部「练这个模式」走 `startPractice([id])`。**不调 `grade`、不写 SM-2**。

**断点续练**：三稿会话的队列、阶段、当前题号、已选答案、自评档位、草稿与已出反馈写进裸 `localStorage` 的 `__nativethink_think_session_resume`（**不走 safeStorage、不参与云同步**）。输入去抖 350ms；`pagehide` 与「退出」各补一次落盘，完成一卡时 `clearPatternResume()`。概览读 `loadPatternResume()` → `isResumeUsable`，显示「继续上次训练 · 第 x/5 步」；点「放弃」清键。恢复时沿用原队列与识别/迁移题号，不重新抽题；超过 2 天、队列为空、`queue[index]` 与模式不一致、反馈阶段缺结果、未知阶段/模式 id 一律整份丢弃（`sanitizePatternResume` 真跑）。**第二个读者是首页续学条**（`src/lib/resume-overview.ts`，2026-11-01）：它只调 `loadPatternResume()` + `resumeStepLabel()`，不另写一套有效期判断，所以首页显示「第 4/5 步 · 改写」和点进去看到的步骤必然同一份口径。

**首页今日模式**（`DashboardPage/TodayPatternCard.tsx`）：有模式进度才渲染（`stats.tracked === 0` 整卡 `return null`，与三张 0 义务横幅同口径）。显示今日到期/延迟计数、下一个模式名、近 7 天迁移柱与 `passes/attempts`，点击进 `/think`。趋势来自 store 的 `trend`（`buildTransferTrend` 七天补零），不在组件里另算一套。

**趋势与体检复测**：`grade` 在同一个 updater 里累计 `dailyStats[today] = { attempts, passes, calibrationAttempts, calibrationHits }`，落盘保留 `diagnostic / realTask / 历史`（`...prev`）；`saveDiagnostic` 同步追加 `diagnosticHistory`（同日只留最新，最多 10 次）。趋势**不在 `/think` 概览里另画一套**（2026-10-31 起「练习」tab 只放玩法，避免同一份进度两处各说一遍）：首页 `TodayPatternCard` 用 store 的 7 天 `trend` 画迁移柱；学习记录页的「思维迁移趋势」卡（`ProgressPage/components/TransferTrendCard.tsx`，2026-11-01）用同一份已清洗 `dailyStats` 画 14 天双折线 + 通过率 / 校准命中，没有数据时只给 `/think` 入口，不造百分比。

**跨模块证据**（`think-evidence.ts` 纯函数）：读纠偏本（写作/对话/检测三来源），按原因里的线索词归到最可能的模式（如「主语/话题/句首」→ `subject-first`，「请求/礼貌/台阶」→ `polite-request`），作为**待诊断候选**；同一条可命中多个模式，按命中条目数排序取 Top 3。概览「薄弱报告」面板内显示来源计数、最近 3 条 `原句 → 地道说法` 与候选 chip，点 chip 进模式详情。**不写 SM-2、不改纠偏本**。

**首页入口**：模式训练**不进**首页三张 0 义务横幅的行门控；P2 起在首页加独立的 `TodayPatternCard`（有模式进度才渲染，到期 0 时显示“今天已完成”），点击进 `/think`。三张横幅的 0 义务整卡不渲染口径不变。

## 3. 实现方法

- **AI**：四个旧 tab 有 4 处 `aiStream`（`:163/:254/:340/:479`）产出**中英双语分节的 Markdown 纯文本**，不解析 JSON；3 处 `aiChat` 出题（`:580/:625/:670`）要求单个 JSON 对象。模式训练另加 3 处非流式 `aiChat`（迁移判定 / 真实任务或长文分析 / AI 额外出题），都用 `extractJson` 解析结果。
- **无 Key 回落**：检测走 `CHINGLISH_DETECTION`，转译走 `THOUGHT_TRANSLATION`，反翻译走 `BACK_TRANSLATION`，**思维还原也走 `THOUGHT_TRANSLATION`**（`:519-523`，传 `user_english_expression` + `native_expression`）—— 不再复用中式英语检测插件。
- **这里的空串守卫顺序是对的**（可作为其它页面的范本）：先 `if (!result.trim()) return;`（`:600/:645/:689`），再 `extractJson`（`:602/:647/:691`）。模式训练的 AI 判定同样是「空串先降级、再解析」。
- **洗牌用 `useStableShuffle`**（`:126-134`）✅ 符合仓库规定。
- **存储**：

| key | 说明 |
|-----|------|
| `__nativethink_practice_history` | `:65/:74-78`，**FIFO 50**，内存去重后取 8 条展示 |
| `__nativethink_custom_translations` / `_backs` / `_natives` | `:107/:110/:113` 读，`:119-121` 写 —— 自建题库**不可重算**，所以不裁剪；写失败经 `persistJson` 返回 false 并 `warnStorageFull()` 提示 |
| `__nativethink_think_pattern_progress` | 模式训练进度（`use-think-patterns.ts:163` 读 / `:213` 写）；读盘清洗 + 31 天 `daily`/`dailyStats` 裁剪 + `diagnosticHistory` 同日去重（≤10）+ 写失败 `warnStorageFull()` |
| `__nativethink_think_session_resume` | 三稿会话断点（`think-session-resume.ts`），**裸 localStorage、不云同步**；2 天过期、坏形状整份丢；写失败静默（可丢的临时状态） |
| `__nativethink_think_long_task_drafts` | 长文/对话按任务存草稿，**裸 localStorage、不云同步**；350ms 去抖，写失败静默 |
| `think-tab` | `usePageMemory`，默认 `patterns`（`:54`） |
| `think-library-filter` | `usePageMemory` 保存模式库的层/状态筛选；坏旧值运行时回退到“全部” |

- **朗读**：旧四个 tab 只有手动喇叭（`:843/:1042/:1155/:1218/:1381`），默认语速，**不接** `__nativethink_vocab_autospeak`。模式训练的参考表达目前**没有喇叭**（纯文本），不要假设它发声。

## 4. 注意事项

1. **提交点的计时口径：按动作计 + 同一作答只记一次**（旧四 tab 的 `:153/:244/:330/:469` 与模式训练的 `PatternReviewMode.tsx:102` 都改成 `creditOnce('think', creditKey(动作类型, 题面, 用户原文))`，闸门在 `src/lib/study-credit.ts`）。记的是"提交了这道题的作答"这个动作本身 —— AI 只负责给反馈，反馈失败不撤销这次真实投入；但同一题同一句**连点只放行一次**（2026-09-30 前的破口正是"失败后重交同一题再 +1"，而 `addStudyMinutes` 一次动今日分钟数、进度环、日历与连胜四处）。刻意**不**改成"拿到反馈才计"：那会让"写了但 AI 挂了"那次彻底归零。`npm run verify:study-credit` 钉住两个方向（口径不许往任一方向漂），变异测试 M1=绕过闸门、M2=改成请求后才计、M11=键里去掉题面。历史留档仍按内容判（先 `if (controller.signal.aborted) return;`，再 `if (full.trim()) recordDetectorHistory(input)`，`:217-219`）。
2. **换题/删题必须中止在途流**：三个 `next*`（`:403-412`/`:431-440`/`:546-557`）与三个删除当前 AI 题的处理器（`:709/:719/:729`）都已先 `abort()` + 清 loading。四个旧提交流在循环里判 `controller.signal.aborted`（先断流不再 setState）、catch 对 abort 静默返回、finally 用 `ref.current === controller` 防旧流把新请求的 loading/ref 清掉。**新增任何“离开当前题”的路径都要照这个模板接 abort** —— 否则旧流内容会写进新题结果框（对照 `WritingPage.tsx:486-493`）。模式训练没有流式请求；在飞判定的旧结果由会话里的 `judgeSeqRef` 作废，判定请求自身另有一个 15 秒超时的 `AbortController`（`PatternReviewMode.tsx:101-121`：建 controller → 设 15s 定时器 → 请求带 `signal` → `finally` 清定时器），两者职责不同（一个防旧结果写错卡，一个防请求永挂）。
3. **检测历史在事件层读写**：`recordDetectorHistory`（`:70-80`）先读盘/写盘完，再 `setDetectorHistory` 只做去重截断；`src/index.tsx:86` 的 StrictMode 不会再把同一条历史写两遍。旧版曾在 updater 内写 safeStorage，已修 —— 改法可作为范本（`capped-cache.ts:32-35`）。
4. **三个 custom 键没有上限**（第 3 节表格），与「按条累积的缓存一律走 `capped-cache.ts`」的约定不符。
5. **`nativetranslate.ts` 生成脚本是“追加”不是“覆盖”**：`add-exercises.cjs:198` / `add-more.cjs:96` 都先读原文件，再在 `];` 前插入新条目。重跑不会清掉手改，但会重复插入同批 id（当前 `n1`–`n250`）—— 跑前先核对现有 id 范围。
6. **流式中断有专属守卫**：`node scripts/verify-think-stream-abort.mjs`（36 断言：四个提交流的 abort 前序/循环断流/catch 静默/finally 身份锁 + 六条离开当前题的路径 + 卸载清理 + 检测历史在 abort 后不落盘；9 条变异逐条验红）。计时口径由 `npm run verify:study-credit` 间接钉住，`extractJson` 解析点由 `verify:ai-parse` 扫到。真实慢流的设备侧行为仍建议真页面或设备走查。
7. **模式训练由 `node scripts/verify-think-patterns.mjs` 守**（当前 **1380** 断言：150 个内容项的结构/答案分布、四层 `layer` 元数据与每层 ≥2 模式、迁移 `kind`（每模式 3 新情境 + 2 换措辞）、15 题体检表引用真实且不重复、纯调度模块与 AI helper 真转译真跑、**会话状态机真跑**（首次失败回队尾/三次失败收摊/重试通过不留重复/两种模式交错/按不同模式计数/入参不被修改）、三稿阶段/改写重试/最终一次落分、体检计分 / 按结果组队 / 真延迟排期（7→21→60、失败次日重测、独立队列）真跑、store 读盘清洗（含残缺记录与 NaN 排期丢弃）与首次读盘顺序真跑、store 体检记录清洗与保存、自评校准三级/预测一致计数/老记录兼容、自由训练混合队列/任选模式/完成页再练一组、改写快练 75 题派生/前 10 题覆盖 10 模式/10 题一组/自评不写 SM-2/解释只讲当前原句与参考、真实任务前后测（2 封邮件/5 目标模式/AI 或自评/不写 SM-2）、口头任务（2 条 60–90 秒/5 目标模式/本地录音回听/到 90 秒自动停止/不上传不接 ASR）、薄弱报告/模式详情、断点续练（真跑 sanitize/标签/本地存储 + 恢复沿用题号）、每日迁移/校准趋势（31 天裁剪/7 天补零真跑）、体检历史（同日去重/≤10）、跨模块证据归因（纯函数真跑）、首页今日模式卡、长文/对话/无中文源（6 条/3 张实景图存在性/5 目标模式/本地草稿/AI 或自查）、AI 额外出题（模式库 prompt/校验 2-3 个真实 id）、模式库摊开（层/状态筛选、筛选持久化、到期优先排序、卡片快练/详情、未开始不显示假指标）、九个 UI 组件接线，以及页面接入块）。页面那批不只钉“这几个字出现过”：`patterns` 必须是 TabsList / TabsContent 的**第一项**（按出现顺序逐项点名）、组件必须落在 `patterns` 面板体内、旧四个面板的 trigger/content 与各自提交处理器一个都不许少、默认值只许 `usePageMemory('think-tab', 'patterns')`。页面接入那批的 6 条手工变异（顺序/默认值/不渲染/挂错面板/删旧面板/旧面板空壳化）在开发时逐条验红过；其中“挂错面板”第一版是 240 字窗口，被实现跨过 `</TabsContent>` 判绿了，改成按面板体切才红 —— 窗口式正则在多面板页面等于没写。守卫末尾还有 **19 条自动化变异实验**（M1 每日 10 上限 / M2 失败回队 / M3 每日新模式上限 / M4 失败重置 repetitions / M5 mastered 看 AI 通过次数 / M6 去掉 `useSyncDown` / M7 去掉 `creditOnce` 计时 / M8 坏 `pass` 必须被判 null / M9 薄弱排序 lapses 优先 / M10 识别题取模轮换 / M11 会话推进越界 / M12 通过不清重复副本 / M13 完成页按结果计数 / M14 闭卷阈值 / M15 诊断计分恒真 / M16 诊断队列跳过已掌握 / M17 延迟 7 天阈值 / M18 自评校准不计入 / M19 自由训练不挑最少练的）：每条同时要求「变异串恰好命中一次」「基线不出现坏行为」「变异后坏行为必须出现」，任一条改坏就红。AI prompt 另钉住 JSON 模板里的 `"evidence"` 键与「中文」反馈要求（删任一个都红），并明确忽略大小写（小写 `i` 也算主语代词）与不要求逐字复述参考表达；判定接线另钉 **15 秒 AbortController + `finally` 清定时器 + `silent: true`**，以及 `ai-service` / `use-ai` 两层对 `silent` 的遵守（各 2 处）。AI 判定失败时界面可直接「重试 AI 判定」；模型把 `pass` 返回为字符串 `"true"`/`"false"` 时也做归一化（新增 3 条断言覆盖重试接线与两种字符串形状）。识别卡另有 **75×3 逐项说明**：每个选项标 `best` / `ok` / `off`（最直接 / 也能说但更绕 / 这里不地道），`best` 必须落在正确项；例如 `conduct an analysis of...` 是自然但更正式，`make an analysis on...` 才是搭配不自然，不再把两者都叫“错”。迁移/反馈卡另扩展：75 个迁移场景（45 新情境 + 30 换措辞）都带 `thinkingSteps`（先想三步，迁移卡默认收起、可展开）与 `why`，反馈并排「你的表达 / 参考表达」，再显示 why、模式线索和 AI 证据（自评也有 why）。
8. **`useSyncDown` 订阅者**：本 store 在列（`use-think-patterns.ts:198`）。`grep -l "useSyncDown(" src/lib` 返回 **16 个文件**，其中 `sync-down.ts` 是**定义**、不算订阅者 —— 订阅者是 **15 个**（原 13 个清单漏了 `correction-notes.ts:288` 与本节）。`cloud-sync.md` §2 与 `verify-cloud-sync-hygiene` 的清单已同步到 15，并加了「清单 ↔ 全仓实际订阅者」双向比对；以后新增订阅必须同时登记，只补本 store 会让数字再次对不上。
9. **模式进度不进单词/句子复习 store**：独立键 `__nativethink_think_pattern_progress`，与 `use-word-learning` / `use-sentence-review` 的 SM-2 互不读写；学习时长只经 `creditOnce` 进 `__nativethink_learning_stats`（`moduleProgress.think`）。别把 `IThinkPatternProgress` 塞进别的复习 store —— 两套排期会互相覆盖，且各自的 `useSyncDown` 回写会把对方的值当脏数据推上云。
