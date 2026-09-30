# 句子学习（`/sentences`）

> 模块 key `sentences`，目录 `src/pages/SentenceLabPage/`（主文件 + 6 个组件）。五个 tab，其中**只有两个**会写学习时长。

## 1. 功能

| tab | 组件 | 干什么 | 调 AI | 写时长 |
|-----|------|--------|-------|--------|
| 句子精讲 | `SentenceExplain.tsx` | 逐句看「翻译思路」三层 + 语法点，跳到语法地图 | 否 | **否** |
| 切分练习 | `ChunkDrill.tsx` | 三步读句法：找动词 → 定主干 → 切意群；内含跟读评价 | 否 | +0.3 |
| 句型库 | `PatternLibrary.tsx` | 15 个句型按槽位拼句子 | 否 | **否** |
| 造句练习 | `BuildPractice.tsx` | 按参考句骨架自己写，AI 四段批改 | 是 | +0.5 |
| 语法地图 | `GrammarMap.tsx` | 30 条语法点，5 组 | 否 | **否** |

## 2. 实现方法

### 2.1 语料 158 句，三层来源

```
src/data/sentence-lab.ts:448-452
  SENTENCE_LAB_BOOKS  24 句  s01–s24   手写标注（书籍）
+ SENTENCE_LAB_EXTRA  12 句  s25–s36   手写标注（演讲）
+ SENTENCE_LAB_AUTO  122 句  a001–a122 脚本生成，每条 auto: true
= 158
```

- 自动那批由 `scripts/expand-sentence-corpus.cjs` 生成，来源分布：`《…》` 67、`演讲·*` 45、站内刊物 10。
- `auto?: boolean` 定义在 `sentence-lab.ts:37-38`，UI 打「自动生成 / 自动标注」角标（`SentenceExplain.tsx:118-123`、`ChunkDrill.tsx:263-270`）。
- 精讲数据 `src/data/sentence-explain.ts` 是 `Record<id, {translation[], grammar[]}>`，**158 条 key 与语料 1:1**，由 `scripts/annotate-sentence-explain.cjs` 生成。
- 句型 `sentence-patterns.ts` 15 个，5 类（`PATTERN_CATEGORIES:39`），槽位结构 `frame[] + slots[{key,hint,sample}]`，拼装 `buildSentence`（`PatternLibrary.tsx:13-21`）。
- 语法 `grammar-map.ts:338` = `GRAMMAR_BASE`(16) + `GRAMMAR_EXTRA`(14) = 30，分组 `GRAMMAR_GROUPS:34-40`（分布 9/7/6/6/2）。
- 语法点名 → 条目匹配是「名字互含 + 正则兜底映射到 gXX」两级（`SentenceExplain.tsx:35-53`），匹配不到按钮 disabled 并提示「语法地图里暂无对应条目」（`:199-207`）。
- **造句题库不来自 sentence-lab**，复用反翻译数据 `MOCK_BACK_TRANSLATIONS`（`src/data/backtranslation.ts:12`，201 条），过滤 `referenceSentence && keyword` 后 `slice(0, 400)`（`BuildPractice.tsx:40-43`）。

### 2.2 意群定位：`src/lib/sentence-parse.ts`

数据里只存 `segments[]`（每个意群的文本 + 角色 `r`），**位置全靠运行时逐块定位回字符区间**：

- `resolveSegments(item)`（`:29-49`）：把片段内部空白放宽成 `\s+`、撇号/引号/破折号折叠（`foldChars`），从 cursor 起逐块 `RegExp.exec`；**任一块定位不到就返回 `null`**，调用方回退。
- `standardBreaks(item)`（`:73-94`）：基于 `resolveSegments`，每个非首意群的起始位置 → 词序号集合。
- `tokenize`（`:58-67`）：`/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*|[^A-Za-z0-9]+/g`，词内撇号算一个词。
- `splitByBreaks`（`:97-114`）：断点集合 → 意群文本数组。

为什么不直接在数据里拼好片段：文件头 `:1-6` 解释了 —— 拼接会丢掉标点归属和空格，渲染出的分块与原文对不上。

### 2.3 拆句交互 = 三态状态机

`Phase = 'split' | 'backbone' | 'reveal'`（`ChunkDrill.tsx:18`），`checkSplit():105-114` 与 `reveal():117-125` 推进，换句 `reset()`（`:78-89`，挂在 `useEffect([idx])`）。

评分入 SM-2：`quality = 断句全对且主干选对 → 5 / 仅主干对 → 3 / 否则 2`（`:119-122`）。

### 2.4 错句复习队列

`src/lib/use-sentence-review.ts`：SM-2（`:55-87`），**答错立即到期**（`interval = 0` → `nextReview = now`，`:63-68,83-84`）；键 `__nativethink_sentence_review`（内嵌 `daily` 表，`:12-13`），日期走 `formatDate`（`:10,100`）。唯一消费点 `ChunkDrill.tsx:10,57`：语料池换成到期句（`:61-67`），入口是「复习队列 + 角标」按钮（`:195-210`），池空自动退出复习模式（`:91`）。

### 2.5 跟读评价

`SpeakBack.tsx` **只由 ChunkDrill 挂载**（`ChunkDrill.tsx:16,454`），不是独立 tab。

## 3. 注意事项

1. ~~主干判定的下标和数据数组不是同一个来源~~（**已修 2026-09-30**）：候选按钮改成来自 `backboneOptions`（由 `resolved` 逐块映射 `seg.t`，长度与 `item.segments` **恒等**），评分与候选从此同源。原缺陷：按钮来自 `stdParts`（= `splitByBreaks(item.en, breaks)`），判定却用 `item.segments[backbonePick]?.r === 'core'`，而 `standardBreaks` 有两处会让长度掉下去：
   - `wordStarts.findIndex((p) => p >= start)` 找不到时 `continue`（`sentence-parse.ts:88-90`）—— 该意群的断点被丢弃，`stdParts` 少一段；
   - 两个意群起点落在同一个词序号时，`Set` 去重 —— 同样少一段。

   **守卫里用真实语料把这个分歧跑出来了**（不是引用注释）：`I’m going home.` 按 `'I' / '’m' / 'going home.'` 切分时，`’m` 与 `going` 都映射到同一个词序号 → `stdParts` 只有 2 段而 `segments` 有 3 段 —— 旧写法下用户点「看起来对」的那块就被判成选错主干，且不报错。守卫：`npm run verify:sentence-lab`（16 断言，A 段真转译 `sentence-parse.ts`），变异实测把渲染改回 `stdParts.map` 会红 2 条。
2. ~~定位失败时"什么都不切就算全对"~~（**已修 2026-09-30**）：`resolved === null` 现在被当作**数据问题**而不是成绩 —— `checkSplit` 提示「这句的标注与原文对不上，暂时无法判分」，`reveal` 在 `grade()` / `addStudyMinutes()` 之前直接 return，坏数据既不进复习队列也不涨进度环。判据用 `!resolved` 而不是 `breaks.size === 0`：单意群句子的断点本来就是 0，那是合法情形，不能被跳过计分（守卫专门钉了这条）。
3. **`runDemo` 的定时器没有清理**（`ChunkDrill.tsx:134`）：`window.setTimeout(() => setPhase('reveal'), 1800)`。1.8s 窗口内换句或离开页面，`phase` 会被旧定时器推到 `reveal` 而内容是另一句。
4. **生成器文件不能手改**：`sentence-lab-auto.ts:3` 写「请勿手改」，因为 `expand-sentence-corpus.cjs` 每次续跑用 `fs.writeFileSync` **整体重写**（`:22,380-396`），内容全来自进度文件 `scripts/.sentence-auto-state.json`（`:23,422,491`）。`sentence-explain.ts` 同理（状态 `.sentence-explain-state.json`，另有 `--rewrite` 全量重写）。手写两批 s01–s36 可以直接编辑，但要同时保证片段能逐字定位（见第 2 条）。
5. **页头文案与语料不是一个口径**：`SentenceLabPage.tsx:47` 写「22 本公版书 + 30 篇演讲 + 站内刊物」，那是**素材池**（`books.ts:1` 22 本、`speeches.ts:29` 30 条）；语料里实际出现的标题是 19 本书 + 22 个演讲标签。别把这句当语料数。
6. ~~造句即使失败也记 0.5 分钟~~（**已修 2026-09-30**）：原先 `setFeedback(out || '（没有返回内容，请重试）')` 后**无条件** `addStudyMinutes(0.5)` —— 空串是服务不可用（`use-ai.ts:82-85`），用户既看到一段假反馈、进度环又涨了；而提示"请重试"意味着同一次作答会被记第二遍。现在空串直接 `toast.error` + return，只有真拿到反馈才落反馈、才计时长。
7. **tab 状态不持久化**：`useState('explain')`（`SentenceLabPage.tsx:22`）。同页的 `writing-prompt-tab` 用了 `usePageMemory`，这里没用 —— 想改就一起改，别只改一处。
8. **长句的断点列表是 O(n²)**：`ChunkDrill.tsx:313-343` 每个词 2 个按钮，`wordIdx` 用 `tokens.slice(0,i).filter(...)` 每格重算（`:315`）。
9. **守卫**：`npm run verify:sentence-lab`（16 断言）覆盖意群定位、断点丢弃导致的位置变化、主干候选与评分同源、坏数据不判分也不计时长；`npm run verify:ai-parse` 扫本页 AI 调用点。生成器的结构校验（`expand-sentence-corpus.cjs:6-8,305`：意群必须按序逐字出现在原句、必须有 core、字段齐全）只保证**写进数据的东西自洽**，不覆盖页面行为。**仍未被覆盖**：语法地图、句型库、句子精讲三个 tab —— 改它们还是要手动开 `/sentences` 逐 tab 看。
10. **`sentence-explain.ts:5` 的注释指向 `sentence-grammar-link.ts`，该文件不存在**（同款注释在 `annotate-sentence-explain.cjs:106`）。语法映射的真实实现其实在 `SentenceExplain.tsx:35-53`。
