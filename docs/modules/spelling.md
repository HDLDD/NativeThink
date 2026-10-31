# 句子拼写（`/spelling`）

> 模块 key `spelling`。`SpellingPage.tsx` + `index.ts` + `components/SpellingPoolPicker.tsx`（题池大厅），逻辑拆在 `src/lib/use-spelling-learning.ts`、`use-spelling-sentences.ts`、`spelling-words.ts`（题面/判分词形口径）与 `spelling-pools.ts`（题池数据/状态描述，纯逻辑可真跑）。

## 1. 功能

听写整句 / 填单词空，音频可整句或逐词，判分后按格子显示对错，SM-2 排期到下一轮。

**两个维度正交，一共 2×2 = 4 种玩法**（`src/types/spelling.ts:9-14`）：

| | 说明 | UI 文案 |
|---|---|---|
| `mode = 'dictation'` | 整句听写，逐格填字母 | 「句子拼写」 |
| `mode = 'fill'` | 句中挖空填单词 | 「单词拼写」 |
| `audioMode = 'sentence'` | 整句朗读 | — |
| `audioMode = 'word'` | 逐词串播 | — |

## 2. 实现方法

### 2.1 题目来源五条路

| 来源 | `source` | 位置 | 落盘 |
|------|----------|------|------|
| 词库例句 | `word_example` | `extractLevelSentences()` `:834-857`，从 `queryWords({level})` 抽 `w.examples`，带 `sourceWord` + `level` | **不落 localStorage**，只进模块级缓存 `_wbCache` / `_wbCacheAll`（`:84-108`），id 由文本哈希 `_wbId()` 生成（`:87-91`，稳定） |
| 收藏单词 | `favorite` | `importFavoriteWords()` `:912-937`，取 `favorites.filter(type==='word')`，`level: 'favorites'` | 同上 |
| AI 批量 | `ai_generated` | `use-spelling-sentences.ts:205-213`，带 `batchId` | localStorage `__nativethink_spelling_sentences`（`:11`） |
| 纠偏本条目 | `correction` | `correctionToSpellingItem()` `use-spelling-sentences.ts:45-56`；两个写入点：收藏页每条的键盘钮（`FavoritesPage.tsx:66`+`:130`）与纠偏重考卡面的「拼写这句」（`CorrectionDrillMode.tsx:310`） | localStorage `__nativethink_spelling_sentences`，`level` 固定 `'correction'`（`:32` 的 `CORRECTION_LEVEL`） |
| 用户手建 | `user_created` | 类型里有（`types/spelling.ts:7`），**全仓无任何写入点** | — |

**纠偏条目为什么单独占一个桶**：词库桶动辄几千句（实测四级 6,827 句），自己那句错句混进去等于再也翻不到。桶名在题池大厅里叫「纠偏表达」（数据表 `spelling-pools.ts:55`，卡片 `SpellingPoolPicker.tsx:48`）。**切到这个桶必须绕开词库那条加载路径**（`handleLevelChange` 的早退分支 `SpellingPage.tsx:977`）—— 否则会去 `preloadLevels('correction')` 并弹「该词库没有例句」这种谎。难度按词数分三档（≤7 / ≤13 / 更多，`use-spelling-sentences.ts:54`）—— 纠偏条目是整句、普遍比词库例句长，套词库那套 `getDifficulty` 会一律落到 intermediate。判重口径单点在 `normSentenceKey()`（`:35-37`，`addSentence` / `addSentences` / `upsertSentences` 三处都走它），别退回各处自己写 `trim().toLowerCase()`。

**题池大厅（2026-10-31）**：首屏与练习页共用 `SpellingPoolPicker`，把纠偏表达 / 视频精听 / 11 本词书 / 全部词库放进同一张可搜索的表（`spelling-pools.ts:55`），不再只靠首次使用的 12 张卡和右上角隐藏下拉。每张卡显示词数、已加载池的「已完成 x/y 句」、`readResumeIndex` 的「上次第 N 句」；空纠偏/精听池给「拼写这句 / 听写这句」的入口指引，不静默禁用。练习页顶部是显式「词书与题池」按钮（`SpellingPage.tsx:1394`），首屏选池后即使池子是空的也离开大厅（`hallEntered`，`:465`），去练习页看空态；玩法（句子/单词拼写）和本轮句数在首屏就能选，玩法键 `__nativethink_spelling_mode`（`:90`）。搜索无结果时保留搜索框并给「清除搜索」。

词库 → 难度映射 `getDifficulty`：zhongkao/gaokao/cet4 → beginner，advanced → advanced，其余 intermediate。九个等级常量 `ALL_LEVELS`。

**题面与判分的词形口径单点在 `src/lib/spelling-words.ts`（2026-10-23 修）**：词库例句大量使用排版弯引号（U+2019 实测覆盖 6,863 条例句）、数字 token（2,764 个）和长破折号。旧 `getWords` 用 `[^a-zA-Z'-]` 剥字符，会把 `It’s` 显示成 `Its`（用户按原句拼 `It's` 反而判错）、把 `2024` 剥成空串、把单独的长破折号变成一个空格子。现在的口径：

- `spellingTokens()`：弯引号（U+2018/2019/02BC/02B9）→ ASCII 撇号；连字符变体（U+2010–2015/2212）→ `-`；其余标点剥掉；**纯标点 token 直接丢弃**（不占格）；保留 `\p{L}` / `\p{N}`（重音字母、数字不丢）。
- `getSpellingWords()`：题面展示词（保留重音与数字，两端引号已去掉）。
- `normalizeSpellingAnswer()`：判分口径 = 展示口径 + 小写 + NFD 折叠重音（`blasé` 与 `blase` 都算对）。**不会**把 `Its` 和 `It's` 当同一个词 —— 撇号是拼写的一部分。
- `splitForFill()` 与 `getSpellingWords()` 共用同一份 token 列表：空位用归一答案词、非空位保留原词与标点，**下标不会因为丢标点 token 而错位**。
- `selectBlanks()` 改用 Fisher-Yates（`shuffledCopy`），不再用 `sort(() => Math.random() - 0.5)`。

### 2.2 队列与排期

`planSessionQueue`（`use-spelling-learning.ts:127-163`，纯函数，可直接真跑）顺序：

```
到期句（按最老 nextReview）→ 从未出过的（洗牌）→ 出过的（最久未出优先）
排除 completed 与 mastered
```

**注意**：`learning/reviewing` 状态的句子**总是入选，忽略 SM-2 的到期时间**（「ignore SM-2 timing for linear flow」）—— 排期只用来决定顺序，不用来决定进不进队。这和背单词侧「到期才出」的语义不同。

**「本轮句数」的截断发生在 markServed 之前**（`SpellingPage.tsx:487` 把 `roundSize` 传给 `buildSessionQueue`，`use-spelling-learning.ts:331-347` 再用 `planSessionQueue` 的 `limit` 截断）。旧实现先在整池上 `markServed`、再由页面 `slice` —— 一本 6,827 句的词书点一次「重新排队」就把整池标成"刚出过"，「从未出过优先 / 最久未出排后」的排序当场失效。`markServed` 现在只登记本轮真正会出的那几十句。

预设 5/10/20/50 + 数字输入 1–500；**切换词书会读回该书自己的断点**（`SpellingPage.tsx:977` 的 `readResumeIndex(lvl)`），不再只存在 storage 里、切回来仍从第 1 句开始。本轮句数与玩法选择都跨会话保存（`persistRoundSize` `:530`、`SPELLING_MODE_KEY` `:90`），首屏与练习页写同一把键。

**断点现在连本轮队列一起存**（2026-10-31）：`persistResume(level, index, queue)` 把队列 id 顺序写进 `__nativethink_spelling_resume_<level>` 的 `queue` 字段，切书/刷新时 `readResumeQueue` 读回并按原顺序续学。只存下标不够 —— 重新 `buildSessionQueue` 会洗牌，「上次第 2 句」会落到另一句。队列里任何 id 不在当前池（句子被删、词书变更）就回退新建队列；旧断点没有 `queue` 字段也回退，不强制迁移。队列最多 500 个 id；切书瞬间先别落盘空队列（`sessionQueue.length === 0` 直接 return），否则会覆盖 `rebuildSession` 刚写好的本轮队列。

**完成本轮后整个练习界面退出，换成独立的「本轮完成」页**（2026-10-23）：队列最后一题点「下一句 / 完成」或「跳过」时 `completionShown = true`，页面只渲染 `CompletionBanner`（本轮 N 句已完成 / 今日已练习 M 句 / 再来一轮 / 学习记录），拼写模式头部、题卡与上下句导航全部不渲染（`SpellingPage.tsx` 的 `!completionShown` 条件）。「再来一轮」只 `resetCompletedAll + setImportDirty`，由 `rebuildSession` 排好新队列后再关完成页，避免先闪回旧题卡。旧实现只是把完成横幅插在练习界面顶部，题卡还留在下面 —— 这就是本次要修的行为。

**词书加载 / 建库成功不弹 toast**（用户明确要求）：已移除「已加载 X 词库 N 条例句」「该词库没有例句」「数据库建立完成：共导入 N 条例句」三条提示 —— 加载过程交给触发按钮的 spinner 和页面内容切换，空库交给空态。只有 `加载词库失败` / `建库失败` 仍用 `toast.error`。

### 2.3 挖空与逐词播放

- `selectBlanks`（`SpellingPage.tsx:125-132`）：只取归一后长度 > 2 的词，空数 ≈ `词数 × 0.35`，洗牌用 Fisher-Yates（`shuffledCopy`），不再用有偏的 `sort(() => Math.random() - 0.5)`。
- `splitForFill`（`:136-147`）与 `getSpellingWords` 共用 `spellingTokens`：空位 content 是归一答案，非空位 content 是原词（保留标点），两者下标同源。
- 空格下划线（`DictationInput`）：`h-[2.5px]`、`bg-foreground/55` + `group-hover:bg-foreground/75`，聚焦时 3px 品牌色（旧 `bg-white/90` 在浅色渐变卡上几乎看不见）；填空模式的空位边框同步用 `border-muted-foreground/40 hover:/60`。
- 逐词播放 `playWordByWord`（`:414-422`）：**按词长估算间隔的串播**（`rate: 0.8`），引擎没有词级回调（`:390-392` 注释）；`setTimeout` 数组 + `cancelWordPlay` 清理。
- **提交后的整句重读**（`handleSubmit`）：先 `cancelAutoRead()`、`cancelWordPlay()`，再 `tts.speak(currentSentence.en)`。自动朗读的 500ms 定时器收进 `autoReadTimerRef`（可撤销），不再是 effect 里的局部 `timer` —— 旧写法下，句子进场 500ms 内提交、或先点过「逐词播放」还没播完，都会在重读途中再 `speak` 一次把整句链掐成「只读了开头一小段」。手动播放按钮与逐词播放同样先撤自动朗读定时器。

### 2.4 存储键

| key | 用途 | 位置 |
|-----|------|------|
| `__nativethink_spelling_progress` | SM-2 主体 | `use-spelling-learning.ts:11` |
| `__nativethink_spelling_completed` | 本轮完成 | `:12` |
| `__nativethink_spelling_served` | 最近出题记录，**超 4000 条剪最旧** | `:13,26-45` |
| `__nativethink_spelling_sentences` | AI 生成的句子 + 收藏导入 + 例句导入，**上限 1200 条**（`use-spelling-sentences.ts:21` 的 `SPELLING_SENTENCE_LIMIT`） | 到上限**只拒绝新增、不裁剪已有**（`appendCapped`，`:97`）；`aiBatchAdd` 回报 `skipped`（`:233`），页面把它显示成"另有 N 条未导入"，满库时点导入也不会误报"都已导入过"。落盘走 `persistJson`，失败 `warnStorageFull()`（`:38`） |
| `__nativethink_spelling_round_size` | 本轮句数 | `SpellingPage.tsx:91,483,530-535,1475` |
| `__nativethink_spelling_mode` | 玩法 `dictation` / `fill`（首屏与练习页共用） | `:90,408,616` |
| `__nativethink_spelling_resume_<level>` + `..._last` | 断点 `{currentIndex, queue?}`（按词书分键，queue 是本轮 id 顺序，最多 500 个）+ 上次在哪一本 | `spelling-resume.ts:20,47,59-100`；迁移见 `:103` |

收藏类型 `spelling`（`:700-709`，`category: 'spelling'`）；时长 +0.3/次判分（`:616`）。

## 3. 注意事项

1. **自动朗读只在 dictation 生效**：`if (mode === 'dictation' && autoRead) tts.speak(...)`（`:556`，500ms 延时）。fill 模式整句朗读等于把被挖空的答案念出来 —— 同族决策在背单词侧有明文注释（`DailyLearningMode.tsx:303`）。
2. **页内自动朗读开关是本地 state、不持久化、默认 true**（`:441`），**与背单词那个 `__nativethink_vocab_autospeak` 键无关**。用户在词汇里关了自动朗读，进拼写页还是会响。
3. ~~断点键是单个全局键、不按 level 分~~（**已修 2026-09-30**）：逻辑抽到 **`src/lib/spelling-resume.ts`**（纯函数，可注入替身存储），键改成 `__nativethink_spelling_resume_<level>` + `__nativethink_spelling_resume_last` 指针；老用户的全局键在首次读取时一次性搬走并删除，**且目标键已有数据时不被旧值覆盖**。守卫：`npm run verify:spelling-resume`（35 断言）真跑迁移/跨书互不覆盖/坏 JSON/负数下标/按前缀重置/本轮队列往返与形状清洗，并带「旧全局单键在同样操作后只剩最后一本」的正对照；变异实测：把 `persistResume` 改回写单个全局键会红 4 条，把队列一起写掉/读掉会红对应断言。挂载时仍自动恢复上一本并带位置与队列。**队列恢复是新行为（2026-10-31）**：只存下标会因重新洗牌落到另一句；现在 `persistResume(level, index, queue)` + `readResumeQueue` 按原顺序续学，队列 id 不在当前池时回退新建。
4. **`buildSessionQueue` 内部仍有副作用**：`markServed(queue)` 落盘（`use-spelling-learning.ts:343`），但**现在只登记截断后的本轮**。被调用一次就更新一次"最近出过"状态，`rebuildSession` 每次调用都会触发它 —— 不要把它当纯函数放进 `useMemo` 的依赖里反复求值。纯排队部分已抽成 `planSessionQueue`，守卫直接真跑。
5. **当前句只由 `useMemo` 解析，不再用 ref 兜底**（`SpellingPage.tsx:414-419`）。旧写法 `memo || ref.current` 会在切到空的「纠偏表达」/被删句时保留上一本书的句子 —— 界面显示旧句、还能继续判分、写进旧句的 SM-2。现在队列为空就是 `undefined`，页面渲染空态（`:1444-1460`）。
6. **重排队列有多个入口**共用同一个 `importDirty` 自增（`SpellingPage.tsx:528,985,1172,1190,1778,1823,1876`：自动重排、导入收藏、AI 加句两处、再来一轮、重新排队、重置记录），初始化 effect 条件里含 `sessionQueue.length`，并且「当前桶全部完成」时自动清完成标记再重排。**触发 effect 只依赖 `[importDirty]`、通过 `rebuildSessionRef` 取最新闭包**（`:538-542`）—— 旧依赖里带着 `rebuildSession`，而它在每次答题（progress 变化）和每次「下一句」（completedIds 变化）后都会换身份，导致点过一次「重新排队」之后每答一题就重建队列、跳回第 1 句。加第五个入口前先确认不会互相打环。自动重排的判据也改成**当前桶**的 `completedInPool >= poolIds.size`（`:519-529`），不再拿全站完成数和 hook 句子条数比。**导入收藏单词 / AI 加句也走 importDirty**（`importFavoriteWords` 与两处 `onGenerate`）：`addSentences` 的 setState 还没进当前闭包，直接 `rebuildSession()` 会用旧句子库，刚导入的句子要等下一次重排才出现。
7. ~~**`aiBatchAdd` 缺 `!raw.trim()` 前置**~~（**已修 2026-09-30**）：空串现在直接返回「AI 服务暂不可用，请稍后重试」，不再被喂进 `extractJson` 变成误导性的「解析失败」。守卫：`npm run verify:ai-parse` 全仓扫 30 个解析点。
8. **洗牌已改 Fisher-Yates**：`selectBlanks` 用 `shuffledCopy`（`src/lib/spelling-words.ts:51-58`），`planSessionQueue` 用 `use-spelling-learning.ts:18` 的本地 `shuffle` —— 两个都是 Fisher-Yates。旧 `sort(() => Math.random() - 0.5)` 有偏且结果不稳定 —— 填空位每次重渲染可能换位置。别把"按 index 定位题目"接到随机结果上；仓库统一口径仍是 `use-stable-shuffle.ts`。
9. **预热语速与实播语速不同键，且预热不切句**：`prewarm(..., {rate:0.85})`（`:549,553`）vs `speak(en)` 用 `settings.rate`（默认 0.9，`:556`），而缓存键含语速（`sherpa-tts.ts:168-171`，`use-tts.ts:818-819` 明文说键不匹配会让预热白做）；超过 180 字符的句子，`prewarm` 的整句键和 `speak` 的分块键本就不同 —— 长句永远预热不命中。
10. **「错词重练」在本页只有「重试错词」按钮**：只清空判错的格子、**保留判分可见**（`handleRetryWrong` `:675-695`），渲染条件 `mode === 'dictation' && results.score < results.total`（`:1499-1509`）→ fill 模式没有这个入口。错词计数确实持久化进 SM-2 的 `wrongWords`（`use-spelling-learning.ts:185-188`），但页面只用聚合值 `stats.totalWrongWords`（`:248`），**没有按词聚合的复习列表视图**。
11. **CHANGELOG 里的「听写语速滑杆」不是本页**：提交 `e33a780` 只改了 `DeepVocabularyPage/components/DailyLearningMode.tsx`（+83/−3），属于**背单词的拼写/听写子模式**。全站语速滑杆在 `TTSSettings.tsx:614-623`（0.5–1.5，默认 0.9）。`SpellingPage.tsx` 里没有任何 `Slider`，三处 `rate` 全是硬编码（`:419,549,553`）。
12. **死代码**：`types/spelling.ts:7` 的 `'user_created'` 无写入点；`use-spelling-sentences.ts:12` 的 `BATCH_COUNTER_KEY` 声明后从未使用。
13. **`使用攻略.md:60` 与代码不符**：写着「练法有单词拼写、句子拼写、听写、填空」四种，代码是 2 个 mode（dictation/fill）× 2 个音频模式（sentence/word）。
14. **守卫**：`npm run verify:spelling-resume`（35 断言）覆盖断点分键/迁移/重置枚举/非法下标/本轮队列往返与形状清洗；`node scripts/verify-spelling-logic.mjs`（41 断言）真跑题面词形/判分/`planSessionQueue` 顺序与截断，并静态钉住 importDirty 只触发一次、空桶不残留旧句、切模式清判分态、逐词串播切句先取消、提交重读前撤销自动朗读/逐词定时器、导入后不拿旧闭包重排、加载成功不弹 toast、完成页替换练习界面并显示本轮句数、空格下划线可见性、切词书读回断点、按桶判断自动重排；`node scripts/verify-spelling-hall.mjs`（45 断言）真跑题池分组/搜索/0 基断点显示/空池指引/total=0 不算加载，并静态钉住两处挂载、显式入口、稳定 data 属性与首屏空池离开；`npm run verify:ai-parse` 扫批量加句的解析约定。**仍未被覆盖**：`served` 超 4000 条剪枝、预热与实播的键匹配 —— 改这些仍要手动跑一轮：出一轮题 → 刷新 → 看是否接着上次位置、且不重复刚出过的。
15. **「纠偏表达」桶的三条硬约束（2026-10-17 新增，`verify-correction-notes` ⑦ 逐条钉 + 变异 10 条验红）**：① 切桶走早退分支，不许 `preloadLevels`/`extractLevelSentences`（不然弹「该词库没有例句」，把能练的池子说成空的）；② 题面必须是条目的 `right`（把用户自己的中式原句当"标准答案"来拼是反的）；③ 中文提示按 `chineseHint → note → ''` 兜底 —— 填空档靠中文给提示，全空就等于没有提示。另外：`source` 加了 `'correction'` 之后，`user_created` 仍是死代码（无写入点），别以为"自定义句子"就是它。
16. **提交后切换玩法必须清空判分态**（`handleModeChange`，`SpellingPage.tsx:580-585`）：旧实现只 `setMode`，`submitted` / `results` 残留 —— 切到「单词拼写」后输入框仍是 disabled、对错色按上一模式的 wordIndex 串位。现在切换同时 `setSubmitted(false)` + `setResults(null)`，输入重置 effect 会重算空位。
17. **空桶是真空态，不是"沿用上一句"**：切到没有条目的「纠偏表达」/「视频精听」或没有例句的词书时，`currentSentence` 为 `undefined`，页面渲染 `EmptyState` 并给出对应入口（`SpellingPage.tsx:1444-1460`）。旧 ref 兜底会让上一本书的句子继续显示、继续可提交。
18. **题池大厅的边界**：`SPELLING_POOLS` 必须由 meta 的 11 本词书展开（`verify-spelling-hall` 会逐本对词数），纠偏/精听 key 直接引用 `CORRECTION_LEVEL` / `VIDEO_LEVEL`，别写字符串；`describeSpellingPool` 里断点存 0 基、显示 1 基，`total=0` 不能当已加载；首屏 `activeLevel=""`，不能把默认 `all` 标成当前池。守卫 45 条 + 四条变异（拔挂载/去稳定 key/删空态/漏纠偏池）。
