# 写作（`/writing`）

> 模块 key `writing`，页面 `src/pages/WritingPage/WritingPage.tsx`（单文件 1215 行，无 `index.ts`）。

## 1. 功能

100 道内置题 + AI 生成的自定义题 → 用户写英文 → AI 按固定七个二级标题批改 → 收藏 / 历史留档 / 朗读自己的作文。

## 2. 实现方法

### 2.1 题库

| | |
|---|---|
| 内置 | `WRITING_PROMPTS`（`WritingPage.tsx:62-355`），id `'1'`→`'100'` |
| 字段 | `id/title/description/category/wordLimit{min,max}/difficulty/tips[]`（`:52-58`） |
| 分类 | 4 类：日常叙事 35 / 观点表达 24 / 议论文 23 / 职场写作 18（tab 映射 `:844-849`） |
| 字数区间写法 | 第 1–24 题 `max` 一律 9999 = 「≥min 词」，渲染分支 `:1024,1205`；25–100 有真实区间 |
| 自定义题 | localStorage `__nativethink_custom_prompts`（`:435,443`），id 前缀 `ai_${Date.now()}` → `isAi = id.startsWith('ai_')`（`:1125`） |
| tab 记忆 | `usePageMemory('writing-prompt-tab')`（`:366`） |

### 2.2 批改

- 配了 Key：`aiStream()` 流式（`:517`），system 是**英文 markdown 模板**，七个固定二级标题：Overall Score / Strengths / Grammar & Language Corrections（表格）/ Naturalness / Structure / Improvement Suggestions / Vocabulary Boost（`:523-549`），`temperature 0.4` + `signal`（`:557`）。
- 没配 Key：兜底走平台插件 `getCapabilityClient().load(PLUGIN_IDS.CHINGLISH_DETECTION).callStream(...)`（`:567-571`，`plugin-ids.ts:4`）；`getCapabilityClient()` **可能返回 `null`**，`.load` 抛错被 catch（`:597-601`）。
- **结果是 markdown 文本，不是 JSON**：`full += chunk.content; setFeedback(full)`（`:560-565` 的 Key 流、`:573-578` 的插件流），渲染 `ReactMarkdown + remarkGfm`（`:1078`）。

### 2.3 生成自定义题

`aiChat` + `extractJson`（`:628,659`），`temperature 0.9 / maxTokens 1024`（`:653`），入参只有分类/难度/关键词三项（`:640,642,650`），成功后立刻 `startWriting(newPrompt)`（`:674`）。

### 2.4 默认只渲染 12 张卡

`PromptGrid`（`:1110-1138`）：`visible = showAll ? list : list.slice(0, 12)`（`:1120`），`list.length > 12` 时给「展开其余 N 题（共 M 题）」/「收起，只看前 12 题」（`:1133`）。实测依据：全量渲染时手机页高 17,604px（≈21 屏），挂载期长任务合计 1055ms（4× CPU 节流）；改后 2,634px / 118ms。对照数据抄在 `scripts/verify-list-scaling.mjs:4-8`。

### 2.5 其它状态

| key | 行为 |
|-----|------|
| `__nativethink_writing_draft` | 800ms 防抖保存（`:402-414`），进页面给「已恢复草稿 + 放弃草稿」条（恢复 `:384-401`、放弃 `:415-420`、横条 JSX `:982-993`） |
| `__nativethink_writing_history` | 落盘 `trimOldest(history, 50, 256KB)`（常量 `:357-359`，effect `:422-428`）—— 条数 + 字节双封顶、保留最新，写失败 `warnStorageFull()`；首页只列最后 5 条（`:878`），点开走历史 Dialog（`:899-909`） |
| `__nativethink_custom_prompts` | 每次 `customPrompts` 变化整份重写（`:441-444`） |

学习时长：选题 +0.5（`:496`，本地动作直调 `addStudyMinutes`），提交批改 +3（`:508` 走 `creditOnce('writing', creditKey('submit', selectedPrompt.id, text), 3)` —— 按交卷动作计，同一题同一篇只记一次，批改失败连点不再刷 +3）→ `moduleProgress.writing`。收藏类型 `writing_prompt`，`content = prompt.title`（`:1152-1159`）。

## 3. 注意事项

1. **流式批改必须在新开一条流之前 abort 旧流**。两处 abort 点（`startWriting` `:486-489`、`reset` `:609-611`）都是为修「旧流完成回调误清新题草稿」补的，注释在 `:486-487`（另有卸载清理 `:451-456` 一并 abort）。**新增任何"离开当前题"的路径而不调 `abortRef.current?.abort()`，同一个 bug 就会复现。**
2. **流跑完但内容为空 ≠ 解析失败**。`useAI.streamChat` 异常时 `yield {content:'',done:true}` 并 toast（`use-ai.ts:67-73`），所以「不完整」与「正常空」对调用方不可区分；写作页用 `!full.trim()` 兜（`:581-587`），**不写历史、不删草稿**，注释里就是历史 bug 说明。
3. ~~**`__nativethink_custom_prompts` 没有条数上限**~~（2026-09-30 处置，口径要说清）：**没有给它加裁剪** —— 自建题是用户/AI 创作、不可重算的东西，静默裁掉等于替用户删数据。改成"写失败必须可见"：`:443` 走 `persistJson('__nativethink_custom_prompts', …)`，返回 false 时 `warnStorageFull()` 给一条 60 秒去抖的提示并指路「学习记录 → 清理学习数据」。原先唯一无界的累积点 `__nativethink_writing_history`（只有 `slice(-50)`）**2026-10-05 已处置**：改为 `trimOldest(history, 50, 256KB)` 条数 + 字节双封顶（`:422-428`）—— 历史是"看最近几篇"的滚动窗口，丢最旧的与产品语义一致，不像自建题那样属于用户资产。守卫：`verify-vocab-caches` ⑥。
4. **AI 生成面板给了 10 个分类，其中 6 类没有对应 tab**（创意写作/科技前沿/社会热点/个人成长/文化对比/环保绿色，`:733` vs `:806-849`）—— 生成的题只在「全部题目」里出现。用户报「生成的题找不到」多半是这个。
5. **去重只喂了内置 100 题的标题**（`:627` 用 `WRITING_PROMPTS` 而不是 `allPrompts`）：**已生成的自定义题不参与去重**，所以会重复出题。
6. **每块 `setFeedback(full)` → 整篇 `ReactMarkdown` 重渲染**（`:563,576`；渲染在固定 `h-[400px]` 的 ScrollArea 里 `:1075-1078`）。长反馈在低端机上是持续重排源；改成节流要保住"实时看到字在出"的体验。
7. **写作页没有「不再出现」**：全仓 `不再出现` 只在背单词链路（`use-word-learning.ts:38,364` 的屏蔽开关及其组件入口）与阅读复习词出队（`reading.ts:45`）里出现。这里唯一的"消失"入口是删除 AI 题（`handleDeletePrompt` `:685-688`，X 按钮仅 `isAi` 时渲染 `:1183-1191`）—— 内置题删不掉是设计。
8. **有守卫**：`node scripts/verify-list-scaling.mjs`（18 断言；写作段守题库 ≥100、`slice(0, 12)`、展开/收起两入口、两个 `TabsContent` 面板都走 `PromptGrid`，正对照是「不存在 `allPrompts.map(` 全量渲染」；另两段是词库浏览分页与短语库字母段折叠这两个同类不变量）。把折叠改回去会立刻变红。
