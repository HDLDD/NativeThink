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

## 3. AI 调用点：8 处，只有 3 处守住了空串前置

| 位置 | 用途 | 返回 | 判空 |
|------|------|------|------|
| `:680` | 接龙判定 | 纯文本，**要求首行 PASS/FAIL**（`:725-726` 取首行，非 FAIL 即通过） | — |
| `:229` | 例句翻译 | 纯文本 | ✅ `:236-238` |
| `:298` | 短语例句 | JSON | ✅ `:305` 判空 → `:306` `extractJson` |
| `:855` | 选项讲解 | 纯文本 | ✅ `:874` |
| `:887` | 生成例句 | JSON | ❌ `:900` 直接 `extractJson('')` → 抛「无法从 AI 返回中提取有效 JSON」→ `:912` 误报「AI 生成失败」 |
| `:320` | 生成语块 | JSON | ❌ `:327` 直接 `extractJson`，且 `:328/:329` 重复守卫 |
| `:947` | AI 出题 | JSON 数组 | ❌ **不用 `extractJson`**，改用正则 + `JSON.parse`（`:954-956`）→ 空返回误报「AI 返回格式异常」 |
| `:983` | 接龙挑战 | — | ❌ `:990` 无判空 |

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

学习时长：`:456` 每张卡 0.2、`:641` 替换答题 1、`:671` 接龙 1（**在 await 之前 → 失败也记**）。

## 6. 注意事项

1. **两处违反「洗牌必须用 `use-stable-shuffle`」的硬规矩**：
   - `:524` `const staticExercises = useMemo(() => generateReplacementExercises(allChunks), [allChunks])`，而 `generateReplacementExercises`（`:116-126`）内部有**三处** `Math.random()`（`:118` 选题、`:123` 选干扰项、`:124` 排选项）。`allChunks` 身份一变（新增自定义语块、AI 生成语块）就整套题重排 → **当前题漂移**，正是 AGENTS.md 坑表那条。对照：`:619` 的 chain tab 已经正确用了 `useStableShuffle` ✅。
   - `:512-520` `suggestPhrases` 在 `useMemo` 里手写 Fisher-Yates，且 deps 含 `phraseState.progress` → **学一个词，「随便看看」那 5 条就跳序**。
2. **`toggleMemorized` 在 updater 内写 safeStorage**（`:558-562`）→ StrictMode 双调用写两遍。规则见 `capped-cache.ts:32-35`。
3. **phrases tab 一次性铺全部 748+**（`:2221-2224` 按 A-Z 直接 map，无分页无虚拟列表）。library 有分页（`:580-586`），写作页也已折叠 —— **这是目前最大的未收敛长列表**，改它参照 `verify-list-scaling.mjs` 的断言形态补一条守卫。
4. **4 处 AI 调用把「服务不可用」误报成「格式异常」**（第 3 节表格里 ❌ 的那几行）。修法是统一 `if (!result.trim()) return;` 前置，参考同文件 `:305` 与 `ThinkInEnglishPage.tsx:556`。
5. `:947` 的 AI 出题**没走 `extractJson`**，是仓库明令禁止的贪婪正则路线（`utils.ts:34` 注释解释为什么）。
6. **接龙判定的容错方向**：`:725-726` 取首行，**只有明确 FAIL 才算不过** —— AI 返回别的首行（说明文字、markdown 符号）都算通过。改成"必须 PASS 才过"会让大量正确造句被判错，改之前先想清楚。
7. **无守卫**：`verify-vocab-cards.mjs` 覆盖的是背单词四个模式；语块只有 `__nativethink_vocab_autospeak` 接线被 `verify-overlay-fit` / 词汇侧断言顺带碰到，本页 5 个 tab 的交互与上述漂移点没有脚本兜。
