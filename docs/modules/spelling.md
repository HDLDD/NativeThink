# 句子拼写（`/spelling`）

> 模块 key `spelling`。`SpellingPage.tsx` 1987 行 + `index.ts`，逻辑拆在 `src/lib/use-spelling-learning.ts` 与 `use-spelling-sentences.ts`。

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

### 2.1 题目来源四条路

| 来源 | `source` | 位置 | 落盘 |
|------|----------|------|------|
| 词库例句 | `word_example` | `extractLevelSentences()` `:834-857`，从 `queryWords({level})` 抽 `w.examples`，带 `sourceWord` + `level` | **不落 localStorage**，只进模块级缓存 `_wbCache` / `_wbCacheAll`（`:84-108`），id 由文本哈希 `_wbId()` 生成（`:87-91`，稳定） |
| 收藏单词 | `favorite` | `importFavoriteWords()` `:912-937`，取 `favorites.filter(type==='word')`，`level: 'favorites'` | 同上 |
| AI 批量 | `ai_generated` | `use-spelling-sentences.ts:205-213`，带 `batchId` | localStorage `__nativethink_spelling_sentences`（`:11`） |
| 用户手建 | `user_created` | 类型里有（`types/spelling.ts:7`），**全仓无任何写入点** | — |

词库 → 难度映射 `getDifficulty`（`:823-827`）：zhongkao/gaokao/cet4 → beginner，advanced → advanced，其余 intermediate。九个等级常量 `ALL_LEVELS`（`:829`）。

### 2.2 队列与排期

`buildSessionQueue`（`use-spelling-learning.ts:255-293`）顺序：

```
到期句（按最老 nextReview）→ 从未出过的（洗牌）→ 出过的（最久未出优先）
排除 completed 与 mastered
```

**注意**：`learning/reviewing` 状态的句子**总是入选，忽略 SM-2 的到期时间**（`:276-279` 注释「ignore SM-2 timing for linear flow」）—— 排期只用来决定顺序，不用来决定进不进队。这和背单词侧「到期才出」的语义不同。

截断到「本轮句数」（`SpellingPage.tsx:480`，预设 5/10/20/50 + 数字输入 1–500，`:1316-1349`）。

### 2.3 挖空与逐词播放

- `selectBlanks`（`:111-119`）：只取去标点后长度 > 2 的词，空数 ≈ `词数 × 0.35`，`[...candidates].sort(() => Math.random() - 0.5)`。
- 逐词播放 `playWordByWord`（`:414-422`）：**按词长估算间隔的串播**（`rate: 0.8`），引擎没有词级回调（`:390-392` 注释）；`setTimeout` 数组 + `cancelWordPlay` 清理。

### 2.4 存储键

| key | 用途 | 位置 |
|-----|------|------|
| `__nativethink_spelling_progress` | SM-2 主体 | `use-spelling-learning.ts:11` |
| `__nativethink_spelling_completed` | 本轮完成 | `:12` |
| `__nativethink_spelling_served` | 最近出题记录，**超 4000 条剪最旧** | `:13,26-45` |
| `__nativethink_spelling_sentences` | AI 生成的句子 | `use-spelling-sentences.ts:11` |
| `__nativethink_spelling_round_size` | 本轮句数 | `SpellingPage.tsx:451,502,1342` |
| `__nativethink_spelling_resume` | 断点 `{activeLevel, currentIndex}` | `:967,975` |

收藏类型 `spelling`（`:700-709`，`category: 'spelling'`）；时长 +0.3/次判分（`:616`）。

## 3. 注意事项

1. **自动朗读只在 dictation 生效**：`if (mode === 'dictation' && autoRead) tts.speak(...)`（`:556`，500ms 延时）。fill 模式整句朗读等于把被挖空的答案念出来 —— 同族决策在背单词侧有明文注释（`DailyLearningMode.tsx:303`）。
2. **页内自动朗读开关是本地 state、不持久化、默认 true**（`:441`），**与背单词那个 `__nativethink_vocab_autospeak` 键无关**。用户在词汇里关了自动朗读，进拼写页还是会响。
3. **断点键是单个全局键、不按 level 分**（`:971-987` 存 `{activeLevel, currentIndex}`），与 AGENTS.md「断点续学键按（模式, level）分」的约定不符。后果：它只能记住**一本**的位置 —— 在 A 书读到 20 句、切去 B 书读 3 句，回来 A 的位置已经没了。挂载时会自动恢复上一本词书并带位置（`:990-1016` 自动进书、`:1019-1031` 恢复 index，`pendingResumeIndex` 在 `rebuildSession` 消费 `:484-486`）。
4. **`buildSessionQueue` 内部有副作用**：`markServed(queue)` 落盘（`use-spelling-learning.ts:289`）。**被调用一次就污染一次跨轮次状态**，而 `rebuildSession` 每次调用都会触发它 —— 不要把它当纯函数放进 `useMemo` 的依赖里反复求值。
5. **当前句走 memo + ref 双轨兜底**：`currentSentenceRef.current = memo || ref.current`（`:409-411`）。memo 抖动时会保留上一条句子，而**判分和朗读都读它**。同类风险见 AGENTS.md「ref 不随组件重挂载归零」。
6. **重排队列有 4 个入口**共用同一个 `importDirty` 自增（`:443,520-525,1144,1689,1786`），初始化 effect 条件里含 `sessionQueue.length`（`:508-518`），并且「全部完成」时自动清完成标记再重排。加第五个入口前先确认不会互相打环。
7. ~~**`aiBatchAdd` 缺 `!raw.trim()` 前置**~~（**已修 2026-09-30**）：空串现在直接返回「AI 服务暂不可用，请稍后重试」，不再被喂进 `extractJson` 变成误导性的「解析失败」。守卫：`npm run verify:ai-parse` 全仓扫 24 个解析点。
8. **`sort(() => Math.random() - 0.5)` 是有偏洗牌**（`:117`）。仓库对"洗牌列表 + 下标定位当前题"的规定是用 `use-stable-shuffle.ts`（`AGENTS.md` 坑表）。这里因为洗完立刻 `slice` 且不跟下标绑定，暂时不会漂移；但填空位每次重渲染都可能变，别把它接到"按 index 定位题目"上。
9. **预热语速与实播语速不同键，且预热不切句**：`prewarm(..., {rate:0.85})`（`:549,553`）vs `speak(en)` 用 `settings.rate`（默认 0.9，`:556`），而缓存键含语速（`sherpa-tts.ts:168-171`，`use-tts.ts:818-819` 明文说键不匹配会让预热白做）；超过 180 字符的句子，`prewarm` 的整句键和 `speak` 的分块键本就不同 —— 长句永远预热不命中。
10. **「错词重练」在本页只有「重试错词」按钮**：只清空判错的格子、**保留判分可见**（`handleRetryWrong` `:675-695`），渲染条件 `mode === 'dictation' && results.score < results.total`（`:1499-1509`）→ fill 模式没有这个入口。错词计数确实持久化进 SM-2 的 `wrongWords`（`use-spelling-learning.ts:185-188`），但页面只用聚合值 `stats.totalWrongWords`（`:248`），**没有按词聚合的复习列表视图**。
11. **CHANGELOG 里的「听写语速滑杆」不是本页**：提交 `e33a780` 只改了 `DeepVocabularyPage/components/DailyLearningMode.tsx`（+83/−3），属于**背单词的拼写/听写子模式**。全站语速滑杆在 `TTSSettings.tsx:614-623`（0.5–1.5，默认 0.9）。`SpellingPage.tsx` 里没有任何 `Slider`，三处 `rate` 全是硬编码（`:419,549,553`）。
12. **死代码**：`types/spelling.ts:7` 的 `'user_created'` 无写入点；`use-spelling-sentences.ts:12` 的 `BATCH_COUNTER_KEY` 声明后从未使用。
13. **`使用攻略.md:60` 与代码不符**：写着「练法有单词拼写、句子拼写、听写、填空」四种，代码是 2 个 mode（dictation/fill）× 2 个音频模式（sentence/word）。
14. **无守卫**：拼写页没有任何 verify 脚本命中（见 `sentence-lab.md` 第 9 条）。改队列顺序、`markServed` 剪枝、断点恢复都得手动跑一轮：出一轮题 → 刷新 → 看是否接着上次位置、且不重复刚出过的。
