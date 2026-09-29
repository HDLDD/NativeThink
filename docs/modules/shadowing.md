# 影子跟读（`/shadowing`）

> 模块 key `shadowing`，`src/pages/ShadowingPage/ShadowingPage.tsx`（1284 行）。左栏选语料、右栏播放器，无 tab。

## 1. 功能

自动连播 / 单句循环 / 再听一遍 / 「我读完了」逐句打勾 / 语速调节 / AI 生成整篇语料 / AI 追加句子 / 发音难点分析 / **录音并评分**。

语料合并索引：`allSentences = corpus.sentences + extraSentences[id]`（`:229-231`）—— **这个"合并索引 vs extras 本地索引"的区别是本页最大的一处风险**，见 §3.1。

## 2. 实现方法

### 2.1 数据

`MOCK_SHADOWING_MATERIALS` 实测 **117 篇 / 579 句**（`^  { id:` = 117、`S('N-M'` = 579）。文件头的注释「8 materials ~90 sentences」**已过期**（那只是 DAILY 分节的标记）。

写入脚本三个：`pad-shadowing.mjs:43`、`pad-shadowing2.mjs:45`、`clean-shadowing.ts:61`（整文件重写，旁边留着 `shadowing.ts.bak` 与 483KB 的 `shadowing.ts.expand-progress.json`）→ **重跑覆盖手改**。

### 2.2 播放器

| 能力 | 位置 | 关键点 |
|------|------|--------|
| 自动连播 | `useTTS({ onEnd })` `:269-282` | `skipAdvanceRef` 抑制手动推进；`isLoopingRef` 时改走 `loopSpeakRef.current()`（**此前 `onEnd` 直接 return，"循环"其实只是播完停住**）；否则 `currentIdxRef` +1 |
| autoplay 开关 | `:331` `usePageMemory('shadowing-autoplay', false)` | effect 在 `:332-339` |
| 单句循环 | `toggleLoop` `:359`，重播 `loopSpeakRef` `:288-294` | |
| 再听一遍 | `:320` | `skipAdvanceRef.current = true` 防推进 |
| 我读完了 | `:364` | `markCompleted` + 400ms 自动前进（`advanceTimerRef` `:376-380`） |
| 语速 | 滑块 **0.5–1.5，step 0.1** `:1049-1056` | 传给 `speak` 的 `rate` |
| 口音 | `lang: accent === 'UK' ? 'en-GB' : 'en-US'` | `:292/:313/:323/:335` |
| 预合成 | 当前句 + 下一句 `prewarm` `:297-306` | |

**没有和 `__nativethink_vocab_autospeak` 打通**（独立开关键 `shadowing-autoplay`，默认 false）。

### 2.3 录音评分

`recognitionRef` 走浏览器语音识别：卸载时 abort（`:212/:260-266`），`onerror` 分支给提示（`:594-604`），`onend` 触发评分（`:606-659`）。

### 2.4 AI

本页**全部用 `aiChat`（非流式），且 `AbortController` 数量为 0**（实测 `grep -c` = 0）—— 请求一旦发出就收不回来，切语料/离开页面也不会取消。

| 位置 | 用途 | 要求 | 判空 |
|------|------|------|------|
| `:166` | 追加句子 | JSON 数组 | ✅ `:183` 判空 → `:184` `extractJson` |
| `:437` | 生成整篇语料 | JSON 对象 + `validateMaterial`（`:392` 校验 `<u>` 配对 / 乱码 / AI 元文本） | ✅ `:464` |
| `:523` | 发音难点分析 | 中英双语 Markdown 表格 | ❌ |
| `:615` | 录音后分析 | 同上 | ❌ |

### 2.5 存储

| key | 位置 | 上限 |
|-----|------|------|
| `__nativethink_shadowing_completed` | `:78` 读 / `:81` / `:86` 每次变更整体 JSON 写 | **无上限、无 FIFO** |
| `__nativethink_custom_shadowing` | `:92/:99` | — |
| `__nativethink_shadowing_extra` | `:125/:132`，按语料 id 分桶 | — |
| `shadowing-rate` / `shadowing-filter` / `shadowing-autoplay` | `:76` / `:115` / `:331`（`usePageMemory`） | — |

时长：`:316` 点播放即 +1（**纯听也算**）、`:372` 完成一句 +0.5。

## 3. 注意事项

### 3.1 【已确认缺陷】删除 AI 追加句会把完成标记弄乱，100% 横幅从此不再出现

三段索引语义不一致：

- **写**：`markCompleted`（`:366`）`key = ${selectedCorpus.id}-${currentSentenceIdx}`，而 `currentSentenceIdx` 是**合并数组索引**（`:229-231`、`:241`）。
- **读**：`totalCompleted`（`:235-238`）按 `${id}-` 前缀数 key；进度条 `:955/:1169-1175`、「已完成」徽章 `:943`、按钮禁用态 `:1075/:1079`、句行绿勾 `:1209-1210`、**100% 横幅判定 `:1181`**、重置 `:1192-1197` —— 全部读合并索引键。
- **删**：删除按钮（`:1250`）传的是 `idx - selectedCorpus.sentences.length`，即 **extras 的本地索引**，进入 `handleDeleteSentence(corpusId, sentenceIdx)`（`:135`）后，`:138-149` 却把它当**合并索引**做位移：`i < sentenceIdx` 保留、`i === sentenceIdx` 丢弃、`i > sentenceIdx` 改写成 `i-1`。

复现：原 8 句 + AI 追加 3 句，删掉**第一条追加句**（`sentenceIdx = 0`）→ 合并键 `id-0`（第 1 句的完成标记）被 `:146` **删掉**，`id-1…id-10` 整体下移一位 → `totalCompleted` 少 1、绿勾与进度错位到别的句子、`totalCompleted >= totalSentences` 不再成立 → **100% 横幅与重置按钮消失**。
`setExtraSentences` 用本地索引过滤（`:153`）本身是对的 —— **根因是同一个"句子序号"在三个地方含义不同**。修法是让删除路径也传合并索引（或把完成标记改用句子自身的稳定 id，而不是位置索引）。

### 3.2 其它

1. **两处分析调用不判空**（`:523`、`:615`）：`setAiAnalysis(result)` 在 `:552/:652`，失败时空串 → 面板空白；而 `use-ai.ts:82-86` 已经把异常吞成返回 `''`（AbortError 也一样），本页的 `catch` **永不触发** → 用户看到「分析中 → 一片空白」且没有任何提示。修法：先判 `!result.trim()` 再 set，并保留重试入口。
2. **autoplay effect 的依赖数组只写 `[currentSentenceIdx]`**（`:339`）：`autoPlay`、`playbackRate`、`selectedCorpus?.accent`、`tts.speak` 都不在里面。后果 —— 开着自动播放时改语速/换口音**不会对当前句生效**；反过来 `currentSentenceIdx` 不变但句子内容变了（例如追加/删除句子后索引复用）也不会重读。对照 `playCurrentSentence` 的 deps（`:328`）就齐全。
3. **渲染期间直接写 ref**：`:245/:247/:285/:288` 在 render 体内赋 `allSentencesRef/rateRef/isSpeakingRef/loopSpeakRef`。并发渲染下（Suspense / transition）可能与实际提交的值不一致；本页目前没用到这些边界，但把它当地基就是隐患。
4. **两栏都是全量渲染**：左栏 117 篇无分页直接 map（`:847-849`），右栏句列表同样全量（`:1208`，只有 `max-h-[400px]` 滚动，**没有虚拟列表**）。这是继语块 phrases tab 之后第二个待折叠的长列表（参照 `verify-list-scaling.mjs`）。
5. **`cancelPendingAdvance` 的覆盖点齐全**：`:343/:352/:386/:264`（prev / next / selectCorpus / 卸载）都取消了 400ms 自动前进 ✅ —— 新增"离开当前句"的路径时请继续保持。
6. **`__nativethink_shadowing_completed` 无上限**：每篇 579 句全记下来还行，但它是整份 JSON 每次变更重写（`:86`），语料越多写越贵。
7. **无守卫**：本页没有任何 `verify-*.mjs` 覆盖，§3.1 那个缺陷正是**静态检查完全看不出来**的那类（三处都用了一个叫 `idx`/`sentenceIdx` 的名字，含义却不同）。
