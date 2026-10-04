# 影子跟读（`/shadowing`）

> 模块 key `shadowing`，`src/pages/ShadowingPage/ShadowingPage.tsx`（1345 行）。左栏选语料、右栏播放器，无 tab。
> 注：新增的 `renderAnnotated` 刻意放文件尾（`:1337-1345`），保持组件段行号与本文档 `文件:行号` 引用一致 —— 别挪到组件前面（函数声明有提升，位置不影响运行）。

## 1. 功能

自动连播 / 单句循环 / 再听一遍 / 「我读完了」逐句打勾 / 语速调节 / AI 生成整篇语料 / AI 追加句子 / 发音难点分析 / **录音并评分**。

语料合并索引：`allSentences = corpus.sentences + extraSentences[id]`（`:252-254`）—— **这个"合并索引 vs extras 本地索引"的区别是本页最大的一处风险**，见 §3.1。

## 2. 实现方法

### 2.1 数据

`MOCK_SHADOWING_MATERIALS` 实测 **117 篇 / 579 句**（`^  { id:` = 117、`S('N-M'` = 579）。文件头的注释「8 materials ~90 sentences」**已过期**（那只是 DAILY 分节的标记）。

写入脚本三个：`pad-shadowing.mjs:43`、`pad-shadowing2.mjs:45`、`clean-shadowing.ts:61`（整文件重写，旁边留着 `shadowing.ts.bak` 与 483KB 的 `shadowing.ts.expand-progress.json`）→ **重跑覆盖手改**。

### 2.2 播放器

| 能力 | 位置 | 关键点 |
|------|------|--------|
| 自动连播 | `useTTS({ onEnd })` `:296-309` | `skipAdvanceRef` 抑制手动推进；`isLoopingRef` 时改走 `loopSpeakRef.current()`（**此前 `onEnd` 直接 return，"循环"其实只是播完停住**）；否则 `currentIdxRef` +1 |
| autoplay 开关 | `:358` `usePageMemory('shadowing-autoplay', false)` | effect 在 `:369-375`，依赖 `[autoPlay, currentSentence, tts.speak]`（见 §3.2 第 2 条） |
| 单句循环 | `toggleLoop` `:395-398`，重播 `loopSpeakRef` `:315-321` | |
| 再听一遍 | `playCurrentSentence` `:347-356` | `skipAdvanceRef.current = true` 防推进（`:349`） |
| 我读完了 | `markCompleted` `:400-418` | 记账 +0.5（`:408`）+ 400ms 自动前进（`advanceTimerRef` `:278`，`setTimeout` `:412-416`） |
| 语速 | 滑块 **0.5–1.5，step 0.1** `:1100-1102` | 传给 `speak` 的 `rate` |
| 口音 | `lang: accent === 'UK' ? 'en-GB' : 'en-US'` | `:319/:340/:351/:371`（四处） |
| 预合成 | 当前句 + 下一句 `prewarm` `:324-333` | |

**没有和 `__nativethink_vocab_autospeak` 打通**（独立开关键 `shadowing-autoplay`，默认 false）。

### 2.3 录音评分

`recognitionRef`（`:235`）走浏览器语音识别：卸载时 abort（`:286-293`），`onerror` 分支给提示（`:637-647`），`onend` 触发评分（`:649-707`）。

### 2.4 AI

本页**全部用 `aiChat`（非流式），且 `AbortController` 数量为 0**（实测 `grep -c` = 0）—— 请求一旦发出就收不回来，切语料/离开页面也不会取消。

| 位置 | 用途 | 要求 | 判空 |
|------|------|------|------|
| `:183` | 追加句子 | JSON 数组 | ✅ `:206` 判空 → `:207` `extractJson` |
| `:467` | 生成整篇语料 | JSON 对象 + `validateMaterial`（`:428` 校验 `<u>` 配对 / 乱码 / AI 元文本） | ✅ `:500` |
| `:553` | 发音难点分析 | 中英双语 Markdown 表格 | ✅ `:590-595`（见 §3.2 第 1 条） |
| `:652` | 录音后分析 | 同上 | ✅ `:696-700` |

### 2.5 存储

| key | 位置 | 上限 |
|-----|------|------|
| `__nativethink_shadowing_completed` | `:86-101`：读一次（`:90-95`）+ 每次变更经 `trimOldest` 后整体 JSON 重写（`:96-101`），写失败 `warnStorageFull()` | **条数 2000 / 64KB 双封顶，FIFO 丢最旧**（2026-10-05） |
| `__nativethink_custom_shadowing` | `:106` 读 / `:114` 写，失败经 `persistJson`→`warnStorageFull()` | AI 生成材料不可重算 → **不裁剪** |
| `__nativethink_shadowing_extra` | `:140` 读 / `:147` 写，按语料 id 分桶，写失败同上 | 追加式；AI 追加句是用户资产不裁剪，键数受用过的语料篇数约束 |
| `shadowing-rate` / `shadowing-filter` / `shadowing-autoplay` | `:84` / `:130` / `:358`（`usePageMemory`） | — |

时长：`:343` 点播放即 +1（**纯听也算**）、`:408` 完成一句 +0.5。

## 3. 注意事项

### 3.1 【已修，2026-09-29】删除 AI 追加句曾把完成标记弄乱，100% 横幅永久消失

原缺陷的三段索引语义不一致（留着备查，改动时别退回这个形态）：

- **写**：`markCompleted` 的键 `${selectedCorpus.id}-${currentSentenceIdx}`（现为 `:400-418`），`currentSentenceIdx` 是**合并数组索引**（`:252-254`、`:264`）。
- **读**：`totalCompleted`（`:258`）、进度条与「已完成」徽章（`:983-985`、`:1200`、`:1217-1223`）、「我读完了」按钮禁用态（`:1123`）、句行绿勾（`:1275-1282`）、**100% 横幅判定（`:1229`）**、重置（`:1239-1244`）—— 全部读合并索引键。
- **删（错）**：删除按钮传 `idx - selectedCorpus.sentences.length`（**extras 本地索引**）进 `handleDeleteSentence`，而它把这个数字当合并索引位移。

后果：原 8 句 + 追加 3 句、做完了除第一条追加句以外的 10 句，此时删掉第一条追加句 → 被删的其实是 `id-0`（第 1 句的标记），标记整体错位一格 → 完成数掉到 9 而新句数是 10 → **100% 横幅与「再来一遍」按钮永久消失**。
`setExtraSentences` 用本地索引过滤本身是对的 —— 根因是**同一个"句子序号"在三个地方含义不同**。

现在的形态：

- 索引换算单点归属在 **`src/lib/shadowing-progress.ts`**（纯函数、零依赖）：`shadowingCompletionKey` / `parseCompletionIndex` / `countCompletedForCorpus` / `isSentenceCompleted` / `shiftCompletionAfterDelete` / `clearCompletionForCorpus` / `extrasLocalIndex`。
- `handleDeleteSentence(corpusId, mergedIdx)` **只收合并索引**，内部用 `extrasLocalIndex` 换算本地索引；`localIdx < 0` 直接 return（内置原句不可删）；当前指针跟着左移/夹紧。
- 键构造、计数、清空、位移在页面里都不再手写 —— `currentDoneKey`（`:266-268`）、`markCompleted`（`:400-418`）、句行绿勾（`:1253`、`:1278-1282`）同源。
- **守卫：`node scripts/verify-shadowing-completion.mjs`（27 断言）** —— A 段真转译真跑纯函数，含"退回旧调用方式"的正对照（同一场景下完成数掉 1 且横幅不成立、`id-7` 丢失），变异实测：把调用点改回 `idx - sentences.length` 会红两条；B 段还守语音标注渲染（§3.2 第 8 条）。

### 3.2 其它

1. **【已修，2026-09-29】两处分析调用现在都先判空串**：`setAiAnalysis(result)` 前有 `if (!result.trim())` + `toast.error('AI 服务暂不可用…')`（`:590-595`、`:696-700`）。修的原因：`use-ai.ts:80-84` 已经把异常吞成返回 `''`（AbortError 也一样），本页的 `catch` **永不触发** —— 原先用户会看到「分析中 → 一片空白且无任何提示」。守卫：`verify-shadowing-completion` 静态断言两处 `!result.trim()` 都在（断言数 = `setAiAnalysis` 出现数）。
2. **【已修，2026-09-30（`40b5b39`）】autoplay effect 的依赖数组**。原写法只写 `[currentSentenceIdx]`：开着自动播放时改语速/换口音**不会对当前句生效**；反过来 `currentSentenceIdx` 不变但句子内容变了（追加/删除句子后索引复用）也不会重读。现在依赖是 `[autoPlay, currentSentence, tts.speak]`（`:369-375`，原委注释 `:359-368`）：`currentSentence` 是"句子身份"，换语料/换句都会重读；`playbackRate`/`accent` **刻意不进依赖** —— 它们是"下一句起生效"的参数，拖语速滑杆时若重新触发，每动一格就把当前句从头再读一遍，比原来更糟。
3. **渲染期间直接写 ref**：`:272/:274/:312/:315` 在 render 体内赋 `allSentencesRef/rateRef/isSpeakingRef/loopSpeakRef`。并发渲染下（Suspense / transition）可能与实际提交的值不一致；本页目前没用到这些边界，但把它当地基就是隐患。
4. **两栏都是全量渲染 —— 但量过之后判定不动**：左栏 117 篇直接 map（`:891`），右栏句列表同样全量（`:1251-1252`，只有 `max-h-[400px]` 滚动，无虚拟列表）。headless Chrome 393×851 / DPR 3 实测 `/shadowing` 挂载后 **2,219 个 DOM 元素、页高 2,256px**，与写作页折叠后的 2,634px 同量级，不是短语库（4,805）那种规模 —— 所以这轮**没有为它改代码**：没有测量证据就加折叠，等于白白削弱「一眼看完全部语料」的入口。真要动之前先重跑测量，并参照 `verify-list-scaling.mjs` 补断言。（同一份 harness 里 longtask 观察器装在 navigate 之前会因文档切换而丢失，所以这里的结论只建立在 DOM 节点数与页高上。）
5. **`cancelPendingAdvance` 的覆盖点**：`:379`（prev）/ `:388`（next）/ `:422`（selectCorpus）/ `:291`（卸载）都取消了 400ms 自动前进 ✅；`markCompleted` 自己重排前也先撤（`:410`）。**句行直达（`:1260-1264`）不撤** —— 400ms 窗口内点其它句子，在途定时器仍会 +1（小窗口、未修）。新增"离开当前句"的路径时请保持这个约定。
6. **【已修，2026-10-05】`__nativethink_shadowing_completed` 条数 + 字节双封顶**：原来无上限、整份 JSON 每次变更重写（每篇 579 句全记下来还行，语料越多写越贵）。现在落盘前先 `trimOldest([...completedSentences], 2000, 64KB)`（常量 `:87-89`，落盘 `:96-101`），保留最新、从最旧的标记丢；写失败不再静默（`warnStorageFull()`）。守卫：`verify-vocab-caches` ⑥。
7. **守卫覆盖面**：`node scripts/verify-shadowing-completion.mjs`（27 断言）守 §3.1 的索引契约（纯函数真跑 + 接线）与第 8 条的语音标注渲染；其余交互仍靠无头 Chrome 真点 —— §3.1 那个缺陷正是**静态检查完全看不出来**的那类（三处都用了一个叫 `idx`/`sentenceIdx` 的名字，含义却不同）。

8. **【已修，2026-10-05】「语音标注」面板曾把 `<u>` 重读标签整个剥掉 —— 标注形同不存在**（HelpGuide 审计时发现：帮助里写着「每句附语音标注（重读提示）」，界面上却与原句一字不差）。数据层一直是对的：`src/data/shadowing.ts` 用 `<u>…</u>` 圈重读处；两处 AI prompt（`:197`、`:490`）要求产出这个标签，`validateMaterial`（`:428`）还校验开闭配对（`:437-439`）。坏的是渲染站点 `:1035`：对 `annotatedText` 直接 `.replace(/<u>/g, '').replace(/<\/u>/g, '')`。现在改走文件尾的 `renderAnnotated`（`:1337-1345`，函数声明提升；**刻意放文件尾** —— 本页文档的 `文件:行号` 引用全部落在组件段内，插在中间会让它们整体漂移）：只认 `<u>`，重读处渲染为青色加粗下划线，其余按纯文本渲染并剥掉残标签（**不走**危险 HTML 注入 —— annotatedText 可能来自 AI）。守卫：`verify-shadowing-completion` 新增 4 条（渲染接线 / 旧剥标签写法正对照 / 识别逻辑存在 / 剥注释后全页无危险注入），变异实测退回旧写法红两条；行为侧 2026-10-05 无头 Chrome CDP 实测 9/9（句 1 `day`；切到句 2 双标记 `dium`/`tte`；青色 rgb(0,184,148) + 600 字重 + 无标签字面量漏出）。
