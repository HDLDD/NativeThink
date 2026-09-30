# 语块训练（`/chunks`）

> 模块 key `chunks`，`src/pages/ChunkTrainingPage/ChunkTrainingPage.tsx` —— **全仓最大的单文件（2713 行）**。五个 tab。

## 1. 功能

| tab | TabsTrigger / Content | 玩法 |
|-----|----------------------|------|
| 语块库 library | `:1017` / `:1055` | 浏览 + 分页（`LIBRARY_PAGE_SIZE = 20`，`:95`） |
| 替换训练 replace | `/` :1836 | 四选一：把中式表达换成语块（`checkAnswer` `:631`） |
| 接龙 chain | `/` :2031 | 用指定语块造句，AI 判 PASS/FAIL（`:652`） |
| 短语 phrases | `/` :2165 | 按 A-Z 浏览 + 生成例句 |
| 复习 review | `/` :2408 | 翻转卡 + 4 档评分（`handleReviewMark` `:447`） |

`activeTab` 初始来自 `__nativethink_chunk_position.tab` 或 `usePageMemory('chunk-page')`（`:134/:137-140/:156`）。

## 2. 数据

`MOCK_CHUNKS` 实测 **748 条**（`^  { id:` 计数）。由 `scripts/gen-chunks.mjs:124` 与 `scripts/gen-data.mjs:807` **整体 `writeFileSync` 重写**（仓库里还留着 `chunks.ts.bak`）→ **重跑生成脚本会覆盖手改**。

合并池 `allChunks`（`:257`）= 内置 + `__nativethink_custom_chunks`。SRS 走 `src/lib/use-phrase-learning.ts`（键 `__nativethink_phrase_learning`、`__nativethink_phrase_daily_quota`，`:6-7`）。

## 3. AI 调用点：9 处（8 `aiChat` + 1 `aiStream`），判空前置已全部补齐

2026-09-30 之前有 4 处缺 `!result.trim()`、其中 1 处还用贪婪正则；现在 9 处都合规，
由 `npm run verify:ai-parse` 全仓扫（含注释过滤与元判据固件）。

| 位置 | 用途 | 返回 | 判空 |
|------|------|------|------|
| `:680` | 接龙判定 | 纯文本，**要求首行 PASS/FAIL**（`:725-726` 取首行，非 FAIL 即通过） | — |
| `:229` | 例句翻译 | 纯文本 | ✅ `:236-238` |
| `:298` | 短语例句 | JSON | ✅ `:305` 判空 → `:306` `extractJson` |
| `:793` | **批量生成语块** | JSON 数组 | ✅ `:822` 判空 → `:823` `extractJson` |
| `:855` | 选项讲解 | 纯文本 | ✅ `:874` |
| `:887` | 生成例句 | JSON | ✅ `:900` 前已补判空（原先空串直接喂 `extractJson` 会抛「无法从 AI 返回中提取有效 JSON」→ 误报「AI 生成失败」） |
| `:320` | 生成语块 | JSON | ✅ 已补判空（顺带删掉了原先重复的两次 `Array.isArray` 守卫） |
| `:947` | AI 出题 | JSON 数组 | ✅ 已换 `extractJson`（原先是贪婪 `match(/[[sS]*]/)` + `JSON.parse`，空返回误报「AI 返回格式异常」） |
| `:983` | 接龙挑战 | JSON 对象 | ✅ 已补判空 |

## 4. 存储

| key | API | 上限 |
|-----|-----|------|
| `__nativethink_chunk_position` | **裸 `localStorage`**（`:139/:149`，滚动 250ms 防抖） | — |
| `__nativethink_custom_chunks` | safeStorage（`:180/:200`） | **无上限** |
| `__nativethink_chunk_ai_sentences` | safeStorage（`:206/:214`） | — |
| `__nativethink_example_trans` | safeStorage（`:219/:222`） | — |
| `__nativethink_ai_replacements` | safeStorage（`:252/:255`） | — |
| `__nativethink_phrase_examples` | safeStorage（`:270/:272`） | 每词 10（`:310`） |
| `__nativethink_chunk_review_session` | 断点（`:475/:479/:486/:495`） | — |
| `__nativethink_chunk_memorized` | `:549/:561` | — |
| `__nativethink_vocab_autospeak` | **与词汇模块共用**（`:100`，读写 `:374/:379`，`safeStorage`） | — |

`__nativethink_chunk_position` 是**裸 localStorage** → 不参与云同步（见 `storage-and-stats.md` §3.4）。

## 5. 朗读

复习正/反面自动朗读 **rate 0.85**（`:388-404`），翻开例句用 `cleanText`；library/phrases 打开详情自动读（`:279-282/:289-292`）；例句 rate 0.9（`:1548/:1793/:2603`）；前 3 张 `prewarm`（`:416-420/:440-444`）。自动发音开关与词汇共用同一个键（`:373-379`）。

学习时长：`:506` 每张卡 0.2、`:699` 替换答题 1 —— 这两处是**本地动作**，每次都涨，刻意不走闸门；`:730` 接龙 1 走 `creditOnce('chunks', creditKey('chain', chunkContent, input))`，与思维/对话同口径（按"造了一句"的动作计，同一语块同一句只记一次）。守卫 `verify:study-credit` ④ 专门钉住"本地动作不许被闸门吞掉"（M5 变异就是把它改成 creditOnce）。

## 6. 注意事项

1. **两处违反「洗牌必须用 `use-stable-shuffle`」的硬规矩**：
   - ~~`useMemo(() => generateReplacementExercises(allChunks), [allChunks])` + 内部三处 `Math.random()`~~ → **已修 2026-09-30**：新增 `exercisePool = useStableShuffle(allChunks)`，`generateReplacementExercises(shuffledChunks)` 改成**给定同一入参输出逐字相同**的纯函数（选题与顺序取自稳定序列，干扰项按固定步长取，选项位置用内容哈希旋转）。集合变化只做增量同步，正在作答的题不再被悄悄换掉。
   - ~~`suggestPhrases` 在 `useMemo` 里手写 Fisher-Yates，deps 含 `phraseState.progress` → 学一个词推荐区就跳序~~ → **已修**：改为从 `exercisePool` 过滤未学过的取前 5 条（稳定顺序，只增删不重排）。
2. **`toggleMemorized` 在 updater 内写 safeStorage**（`:558-562`）→ StrictMode 双调用写两遍。规则见 `capped-cache.ts:32-35`。
3. ~~phrases tab 一次性铺全部 748+~~（**已修 2026-09-30，量过再改**）：headless Chrome 393×851 / DPR 3 直接落在短语库 tab 实测 **4,805 个 DOM 元素 / 797 个按钮**（默认「语块库」tab 只有 788 个元素）。现在每个字母段默认铺 6 条（`PHRASE_LETTER_PREVIEW`），重测 **1,148 元素 / 205 按钮（-76%）**，展开一段回到 1,244 —— A-Z 跳转的 25 个字母段一个不少，折叠不是删内容。守卫：`npm run verify:list-scaling` 补 8 条断言（10→18），含「字母段内不再有直接 `.map` 全量渲染」的正对照；变异实测：退回全量渲染会红 2 条。library 的分页（`:580-586`）保持不变。
4. ~~**4 处 AI 调用把「服务不可用」误报成「格式异常」**~~（**已修 2026-09-30**，见第 3 节）。守卫：`npm run verify:ai-parse` 全仓扫解析点。
5. `:947` 的 AI 出题**没走 `extractJson`**，是仓库明令禁止的贪婪正则路线（`utils.ts:34` 注释解释为什么）。
6. **接龙判定的容错方向**：`:725-726` 取首行，**只有明确 FAIL 才算不过** —— AI 返回别的首行（说明文字、markdown 符号）都算通过。改成"必须 PASS 才过"会让大量正确造句被判错，改之前先想清楚。
7. **无守卫**：`verify-vocab-cards.mjs` 覆盖的是背单词四个模式；语块只有 `__nativethink_vocab_autospeak` 接线被 `verify-overlay-fit` / 词汇侧断言顺带碰到，本页 5 个 tab 的交互与上述漂移点没有脚本兜。
