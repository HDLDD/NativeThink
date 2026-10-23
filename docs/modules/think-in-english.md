# 母语思维训练（`/think`）

> 模块 key `think`，`src/pages/ThinkInEnglishPage/ThinkInEnglishPage.tsx`（1421 行）。五个 tab：第一个「模式复习」是 2026-10-23 新增的间隔复习闭环（默认落在这里），其余四个仍是「读题 → 写英文 → AI 对比反馈 → 下一题」。

## 1. 功能与数据

| tab | TabsTrigger / Content | 干什么 |
|-----|----------------------|--------|
| 模式复习 | `:760` / `:796` | 8 个思维模式：对比 → 识别 → 迁移，按 SM-2 排下一次（详见 §2） |
| 中式英语检测 | `:767` / `:801` | 输入英文，AI 找出中式表达并给地道说法（自由输入，无固定题目） |
| 思维转译 | `:774` / `:909` | 看中文场景，直接用英语描述画面 |
| 反翻译训练 | `:781` / `:1074` | 看英文关键词/场景提示，造一个完整情境句 |
| 思维还原 | `:788` / `:1251` | 看“按英语思维写出的中文”，还原成地道英语并对照思维模式 |

`activeTab` 由 `usePageMemory('think-tab', 'patterns')` 持有（`:54`）。**旧存值不改写**：存过 `detector` / `translation` / `backTranslation` / `nativeTranslate` 的浏览器仍落在原 tab，只有从未切过 tab 的新用户默认进「模式复习」。

| 数据 | 实测条数 | 来源与可改性 |
|------|---------|-------------|
| `MOCK_THINK_EXERCISES`（`thinkexercises.ts`） | **200**，其中 `type:'backTranslation'` **100**、`type:'translation'` **100** | **无生成脚本** → 手写可改。页面只用 `translation` 那 100 条（`:126`） |
| `MOCK_BACK_TRANSLATIONS`（`backtranslation.ts`） | **200** | 手写；也被句子学习的造句复用（见 `sentence-lab.md`） |
| `MOCK_NATIVE_TRANSLATES`（`nativetranslate.ts`） | **250**（`n1`–`n250`，前 50 条多行、后 200 条单行） | `scripts/add-exercises.cjs` 与 `add-more.cjs` 都是**读原文件后追加**（不是整体重写）：重跑会在文件末尾重复插入同批 id，**不会**清掉手改，但会造重复题 → 跑前先确认当前 id 范围 |
| `THINK_PATTERNS`（`think-patterns.ts:30`） | **8 个模式 ×（3 识别 + 2 迁移）= 40 项** | 手写；结构、id、答案下标分布（0/1/2 各 8）由 `verify-think-patterns` 守 |

## 2. 模式复习闭环

| 层 | 文件 | 要点 |
|----|------|------|
| 内容 | `src/data/think-patterns.ts` | 8 个模式（`subject-first` … `fill-references`）；识别题三个选项都**语法成立**，差在思维模式；每道识别题另有 `THINK_PATTERN_OPTION_NOTES` 逐项说明（`best` 最直接 / `ok` 也能说但更绕 / `off` 这里不地道，`best` 必须落在正确项）；每模式至少 2 条思维线索 `cues`（当前 3 条）、中式/母语对比 `contrast`；每个迁移场景另有 `thinkingSteps`（先想三步）与 `why`（为什么参考表达自然） |
| 纯调度 | `src/lib/think-patterns.ts` | SM-2（`applyPatternResult:128`）、到期（`isDue:197`）、队列（`buildReviewQueue:216`）、轮内回队（`pushRetry:236`）、通过清副本（`dropQueuedRetries:255`）、**会话状态机**（`createPatternSession:266` / `applySessionResult:275` / `advanceSession:293` / `sessionCounts:299`）、薄弱排序（`getWeakPatterns:312`）、31 天裁剪（`pruneDaily:339`）；零副作用、只允许 `import type` |
| 存储 | `src/lib/use-think-patterns.ts` | 唯一权威源。键 `__nativethink_think_pattern_progress`（纯模块 `think-patterns.ts:21` 定义，hook 引用常量不手抄）；形状 `{ progress, daily }`。读盘时丢弃残缺记录（缺 `status` / `firstReviewedOn` / 任一有限数字字段） |
| AI | `src/lib/think-pattern-ai.ts` | 拼判定 prompt（`:20`）+ 校验 AI 返回（`:49`） |
| UI | `PatternReviewMode.tsx` / `PatternOverview.tsx` / `PatternReviewSession.tsx` | 概览 ↔ 复习 ↔ 完成页；会话四阶段「对比 → 识别 → 迁移 → 反馈」 |

**一轮怎么做**

1. 概览（`PatternOverview.tsx`）：到期 / 今日已练 / 已掌握 三格（`:130-134`）+ 薄弱 Top 3（`:137-173`）+ 8 张模式卡（点开只看中文/母语对比与线索，**不写进度**，`:176-244`）。
2. 会话（`PatternReviewSession.tsx`）：对比卡 → 识别三选一（选完显示**逐项差异**）→ 迁移自由输入 → 反馈 + 参考表达。
   - 识别卡不再只给一个“选对/选偏”的整体解释：三个选项各标 `最直接 / 也能说，但更绕 / 这里不地道`，并逐项说明语法、搭配和语域。例：`conduct an analysis of...` 是自然但更正式的搭配，`make an analysis on...` 才是搭配不自然；只有后者标“不地道”，不会把“更正式”误说成“错”。
   - 迁移卡显示 `transfer.thinkingSteps` 的「写之前先想三步」；反馈卡并排「你的表达 / 参考表达」，再给 `transfer.why`、本模式线索与 AI 证据（自评路径也有 `why`）。
3. 识别/迁移题按**累计次数取模**轮换（`think-patterns.ts:189` 的 `pickRecognitionIndex` / `:194` 的 `pickTransferIndex`），下标在挂载时快照（`PatternReviewSession.tsx:68-72`）—— 评分后 `progress` 变化不会把反馈页的题换掉。
4. 换卡由顶层用 `pattern.id + session.index` 组成的 key 重挂载（`PatternReviewMode.tsx:139`），重试卡从对比阶段重新开始，不带着上一轮的已选项/答案/自评。
5. 本轮队列/下标/重试/结果是一个 `session` 状态，编排全在纯 reducer（`createPatternSession` → `applySessionResult` / `advanceSession` / `sessionCounts`）；组件只 `setSession(...)`。失败回队、最多 2 次、通过清副本、完成页按不同模式计数这些语义由 `verify-think-patterns` 真跑守（M11-M13 变异）。

**SM-2 口径**（与句子复习 `use-sentence-review.ts` 同源）：quality 5 = 识别对 + 迁移过，4 = 识别错 + 迁移过，3 = 自评做到，2 = 迁移失败。`< 3` 记一次 lapse、`repetitions=0`、`interval=0`、`nextReview = now`（当轮可再练）；通过后间隔 1 → 3 → ×`easeFactor` 天（ease 下限 1.3）。`mastered` 额外要求 `aiTransferPasses >= 2` —— **纯自评刷不成已掌握**。

**队列与每日上限**：`maxPatterns = 10`（每日总上限）、`maxNewPerDay = 2`；到期项按 `nextReview` 升序排在前面，新引入项在后，合并后截断。今天已通过的**不再进队**（`isDue:183`），今天失败的下一轮仍会出现。轮内失败回队尾最多 2 次（`pushRetry`），通过后清掉排在后面的重复副本（`dropQueuedRetries`）。

**AI 判定 + 自评降级**：迁移提交先 `creditOnce('think', creditKey('pattern', id, answer))`（按动作计，AI 失败不撤销这次投入），再走非流式 `aiChat`（`PatternReviewMode.tsx:94`，`temperature 0.2` / `maxTokens 512` / **`silent: true`** / **15 秒 `AbortController` 超时**，定时器在 `finally` 清）。prompt 带模式名、一句话原则、全部线索、中式/母语对比、迁移场景与评分焦点；返回只认 `{ pass: boolean, feedback: 非空串, evidence? }`（`validatePatternJudgeResult`）。没配 Key / 超时 abort / 空串（`useAI` 失败约定）/ `extractJson` 抛错 / 形状不合规 → 返回 `null` → 会话回落自评：展示 `modelAnswer` + 检查点 + 「我用上了这个模式 / 还没做到」（`PatternReviewSession.tsx:357-381`）。`judgeSeqRef`（`:90/:152`）让卸载或换卡后回来的旧 Promise 直接丢弃。`silent` 由 `/api` 之上的两层共同遵守：`ai-service.ts` 的 `chat`/`streamChat` 跳过 `hintOfflineFallback()`，`use-ai.ts` 的 `handleChat`/`handleStreamChat` 跳过 `toast.error`（其他页面不传 `silent`，行为不变）。

**薄弱报告**：概览的 Top 3 完全取自模式历史（`getWeakPatterns`：lapses 降序 → 迁移失败率降序 → 下次到期升序），显示 lapses、迁移通过 x/y、上次反馈；不额外请求 AI、不另存一份报告。

**首页入口**：MVP **不加首页横幅**（首页三张横幅的 0 义务整卡不渲染口径不变），入口只有 `/think` 的第一个 tab。

## 3. 实现方法

- **AI**：四个旧 tab 有 4 处 `aiStream`（`:163/:254/:340/:479`）产出**中英双语分节的 Markdown 纯文本**，不解析 JSON；3 处 `aiChat` 出题（`:580/:625/:670`）要求单个 JSON 对象。模式复习另加 1 处非流式 `aiChat`（`PatternReviewMode.tsx:94`），用 `extractJson` 解析判定结果。
- **无 Key 回落**：检测走 `CHINGLISH_DETECTION`，转译走 `THOUGHT_TRANSLATION`，反翻译走 `BACK_TRANSLATION`，**思维还原也走 `THOUGHT_TRANSLATION`**（`:519-523`，传 `user_english_expression` + `native_expression`）—— 不再复用中式英语检测插件。
- **这里的空串守卫顺序是对的**（可作为其它页面的范本）：先 `if (!result.trim()) return;`（`:600/:645/:689`），再 `extractJson`（`:602/:647/:691`）。模式复习的 AI 判定同样是「空串先降级、再解析」。
- **洗牌用 `useStableShuffle`**（`:126-134`）✅ 符合仓库规定。
- **存储**：

| key | 说明 |
|-----|------|
| `__nativethink_practice_history` | `:65/:74-78`，**FIFO 50**，内存去重后取 8 条展示 |
| `__nativethink_custom_translations` / `_backs` / `_natives` | `:107/:110/:113` 读，`:119-121` 写 —— 自建题库**不可重算**，所以不裁剪；写失败经 `persistJson` 返回 false 并 `warnStorageFull()` 提示 |
| `__nativethink_think_pattern_progress` | 模式复习进度（`use-think-patterns.ts:95` 读 / `:144` 写）；读盘清洗 + 31 天 `daily` 裁剪 + 写失败 `warnStorageFull()` |
| `think-tab` | `usePageMemory`，默认 `patterns`（`:54`） |

- **朗读**：旧四个 tab 只有手动喇叭（`:843/:1042/:1155/:1218/:1381`），默认语速，**不接** `__nativethink_vocab_autospeak`。模式复习的参考表达目前**没有喇叭**（纯文本），不要假设它发声。

## 4. 注意事项

1. **提交点的计时口径：按动作计 + 同一作答只记一次**（旧四 tab 的 `:153/:244/:330/:469` 与模式复习的 `PatternReviewMode.tsx:102` 都改成 `creditOnce('think', creditKey(动作类型, 题面, 用户原文))`，闸门在 `src/lib/study-credit.ts`）。记的是"提交了这道题的作答"这个动作本身 —— AI 只负责给反馈，反馈失败不撤销这次真实投入；但同一题同一句**连点只放行一次**（2026-09-30 前的破口正是"失败后重交同一题再 +1"，而 `addStudyMinutes` 一次动今日分钟数、进度环、日历与连胜四处）。刻意**不**改成"拿到反馈才计"：那会让"写了但 AI 挂了"那次彻底归零。`npm run verify:study-credit` 钉住两个方向（口径不许往任一方向漂），变异测试 M1=绕过闸门、M2=改成请求后才计、M11=键里去掉题面。历史留档仍按内容判（先 `if (controller.signal.aborted) return;`，再 `if (full.trim()) recordDetectorHistory(input)`，`:217-219`）。
2. **换题/删题必须中止在途流**：三个 `next*`（`:403-412`/`:431-440`/`:546-557`）与三个删除当前 AI 题的处理器（`:709/:719/:729`）都已先 `abort()` + 清 loading。四个旧提交流在循环里判 `controller.signal.aborted`（先断流不再 setState）、catch 对 abort 静默返回、finally 用 `ref.current === controller` 防旧流把新请求的 loading/ref 清掉。**新增任何“离开当前题”的路径都要照这个模板接 abort** —— 否则旧流内容会写进新题结果框（对照 `WritingPage.tsx:486-493`）。模式复习没有流式请求；在飞判定的旧结果由会话里的 `judgeSeqRef` 作废，判定请求自身另有一个 15 秒超时的 `AbortController`（`PatternReviewMode.tsx:101-121`：建 controller → 设 15s 定时器 → 请求带 `signal` → `finally` 清定时器），两者职责不同（一个防旧结果写错卡，一个防请求永挂）。
3. **检测历史在事件层读写**：`recordDetectorHistory`（`:70-80`）先读盘/写盘完，再 `setDetectorHistory` 只做去重截断；`src/index.tsx:86` 的 StrictMode 不会再把同一条历史写两遍。旧版曾在 updater 内写 safeStorage，已修 —— 改法可作为范本（`capped-cache.ts:32-35`）。
4. **三个 custom 键没有上限**（第 3 节表格），与「按条累积的缓存一律走 `capped-cache.ts`」的约定不符。
5. **`nativetranslate.ts` 生成脚本是“追加”不是“覆盖”**：`add-exercises.cjs:198` / `add-more.cjs:96` 都先读原文件，再在 `];` 前插入新条目。重跑不会清掉手改，但会重复插入同批 id（当前 `n1`–`n250`）—— 跑前先核对现有 id 范围。
6. **流式中断有专属守卫**：`node scripts/verify-think-stream-abort.mjs`（36 断言：四个提交流的 abort 前序/循环断流/catch 静默/finally 身份锁 + 六条离开当前题的路径 + 卸载清理 + 检测历史在 abort 后不落盘；9 条变异逐条验红）。计时口径由 `npm run verify:study-credit` 间接钉住，`extractJson` 解析点由 `verify:ai-parse` 扫到。真实慢流的设备侧行为仍建议真页面或设备走查。
7. **模式复习由 `node scripts/verify-think-patterns.mjs` 守**（当前 **529** 断言：40 个内容项的结构/答案分布、纯调度模块与 AI helper 真转译真跑、**会话状态机真跑**（首次失败回队尾/三次失败收摊/重试通过不留重复/两种模式交错/按不同模式计数/入参不被修改）、store 读盘清洗（含残缺记录与 NaN 排期丢弃）与首次读盘顺序真跑、三个 UI 组件接线，以及页面接入块）。页面那批不只钉“这几个字出现过”：`patterns` 必须是 TabsList / TabsContent 的**第一项**（按出现顺序逐项点名）、组件必须落在 `patterns` 面板体内、旧四个面板的 trigger/content 与各自提交处理器一个都不许少、默认值只许 `usePageMemory('think-tab', 'patterns')`。页面接入那批的 6 条手工变异（顺序/默认值/不渲染/挂错面板/删旧面板/旧面板空壳化）在开发时逐条验红过；其中“挂错面板”第一版是 240 字窗口，被实现跨过 `</TabsContent>` 判绿了，改成按面板体切才红 —— 窗口式正则在多面板页面等于没写。守卫末尾还有 **13 条自动化变异实验**（M1 每日 10 上限 / M2 失败回队 / M3 每日新模式上限 / M4 失败重置 repetitions / M5 mastered 看 AI 通过次数 / M6 去掉 `useSyncDown` / M7 去掉 `creditOnce` 计时 / M8 坏 `pass` 必须被判 null / M9 薄弱排序 lapses 优先 / M10 识别题取模轮换 / M11 会话推进越界 / M12 通过不清重复副本 / M13 完成页按结果计数）：每条同时要求「变异串恰好命中一次」「基线不出现坏行为」「变异后坏行为必须出现」，任一条改坏就红。AI prompt 另钉住 JSON 模板里的 `"evidence"` 键与「中文」反馈要求（删任一个都红），并明确忽略大小写（小写 `i` 也算主语代词）与不要求逐字复述参考表达；判定接线另钉 **15 秒 AbortController + `finally` 清定时器 + `silent: true`**，以及 `ai-service` / `use-ai` 两层对 `silent` 的遵守（各 2 处）。AI 判定失败时界面可直接「重试 AI 判定」；模型把 `pass` 返回为字符串 `"true"`/`"false"` 时也做归一化（新增 3 条断言覆盖重试接线与两种字符串形状）。识别卡另有 **24×3 逐项说明**：每个选项标 `best` / `ok` / `off`（最直接 / 也能说但更绕 / 这里不地道），`best` 必须落在正确项；例如 `conduct an analysis of...` 是自然但更正式，`make an analysis on...` 才是搭配不自然，不再把两者都叫“错”。迁移/反馈卡另扩展：16 个迁移场景都带 `thinkingSteps`（先想三步）与 `why`，反馈并排「你的表达 / 参考表达」，再显示 why、模式线索和 AI 证据（自评也有 why）。
8. **`useSyncDown` 订阅者**：本 store 在列（`use-think-patterns.ts:129`）。`grep -l "useSyncDown(" src/lib` 返回 **16 个文件**，其中 `sync-down.ts` 是**定义**、不算订阅者 —— 订阅者是 **15 个**（原 13 个清单漏了 `correction-notes.ts:288` 与本节）。`cloud-sync.md` §2 与 `verify-cloud-sync-hygiene` 的清单已同步到 15，并加了「清单 ↔ 全仓实际订阅者」双向比对；以后新增订阅必须同时登记，只补本 store 会让数字再次对不上。
9. **模式进度不进单词/句子复习 store**：独立键 `__nativethink_think_pattern_progress`，与 `use-word-learning` / `use-sentence-review` 的 SM-2 互不读写；学习时长只经 `creditOnce` 进 `__nativethink_learning_stats`（`moduleProgress.think`）。别把 `IThinkPatternProgress` 塞进别的复习 store —— 两套排期会互相覆盖，且各自的 `useSyncDown` 回写会把对方的值当脏数据推上云。
