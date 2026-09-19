# wordbank detail 字段拆分 —— 可行性与风险分析

- 日期：2026-09-19
- 状态：**分析存档，未改动任何生产代码**
- 触发：体积优化讨论中识别出 wordbank 是真正的体积大头
- 结论：**建议立项为独立工程；不存在"低风险且有明显收益"的子集**

---

## 1. 结论摘要

1. wordbank 9 个等级合计 **38.5 MB（原始）/ 9.66 MB（gzip）**，共 75,113 条词条，是主包（989.8 kB）的约 39 倍。
2. 唯一有意义的优化方向是**把 detail 字段（examples / collocations / deepExplanation）改为按需加载**，预期 **gzip −71.2%**。
3. 三个"看起来更简单"的方案经实测**均无价值**：
   - 紧凑编码（去掉字段名）：原始 −35.8%，但 **gzip 仅 −5.4%**
   - 删除恒空字段：原始 −2.85 MB，gzip 几乎为 0
   - 二者叠加：相对 detail 拆分只再省 0.23 MB
4. 但 detail 拆分**不是低风险改动**：它触碰 6 个消费方，其中 2 处做的是**跨全库操作**，另有 3 个数据生成脚本会覆盖手工拆分。

---

## 2. 现状架构（已实现的部分是好的）

- 每个等级已是**独立动态 import**（独立 chunk），由 `src/data/wordbank/wordbank.ts:118-129` 的 switch 加载。
- 有 IndexedDB（主）+ localStorage（兜底）缓存，`CACHE_VERSION = 2`。
- `WORD_COUNTS` 为硬编码常量，展示词数无需加载数据。

所以问题不在"没有分片"，而在**单个等级文件内部的字段构成**。

---

## 3. 测量数据

### 3.1 各等级规模（条目数与 `WORD_COUNTS` 常量完全吻合，证明解析正确）

| 等级 | 体积 | 条目 |
|---|---|---|
| zhongkao | 1,933 KB | 3,223 |
| gaokao | 3,327 KB | 6,008 |
| cet4 | 2,403 KB | 4,542 |
| cet6 | 3,993 KB | 7,404 |
| ielts | 3,888 KB | 6,609 |
| toefl | 5,454 KB | 10,367 |
| postgraduate | 5,051 KB | 9,602 |
| professional | 3,609 KB | 8,887 |
| advanced | 9,813 KB | 18,471 |
| **合计** | **38.5 MB** | **75,113** |

> 注意：数据文件存在**两种引号风格**——`zhongkao`/`gaokao`/`postgraduate`/`professional` 用单引号（`word:'ability'`），其余用双引号（`word:"dexterity"`）。任何解析脚本都必须同时兼容，否则会得到 4 个等级的假 0。

### 3.2 字段占用

| 字段 | 值体积 | 占总体积 |
|---|---|---|
| examples | 7.16 MB | 18.6% |
| collocations | 5.49 MB | 14.2% |
| topics | 1.07 MB | 2.8% |
| meaning | 0.94 MB | 2.4% |
| 其余 12 个字段合计 | ~3.5 MB | ~9% |
| **结构开销**（字段名/引号/括号/逗号） | **20.4 MB** | **52.8%** |

**关键反直觉发现**：`synonyms`、`antonyms`、`wordFamily` 在 **75,112 / 75,113** 条词条中为空数组（99.999%），全库合计值体积 ≈ 0.00 MB。它们是三个彻底死掉的字段，却每条都贡献约 38 字节结构开销（约 2.85 MB）。

### 3.3 决定性测量：gzip 视角

| 方案 | 原始 | gzip | gzip 降幅 |
|---|---|---|---|
| (a) 现状 | 33.85 MB | **9.66 MB** | — |
| (b) 仅去字段名（紧凑编码） | 21.75 MB (−35.8%) | **9.14 MB** | **−5.4%** |
| (c) 仅去 detail 字段 | 17.72 MB (−47.6%) | **2.78 MB** | **−71.2%** |
| (d) 两者都做 | 8.34 MB (−75.4%) | 2.55 MB | −73.6% |

**结论**：
- 高重复的字段名被 gzip 压得几乎无成本 → **紧凑编码不值得做**（(b) 只降 5.4%）。
- 真正占网络成本的是 **examples + collocations 这类唯一文本** → 只有 (c) 有效。
- (d) 相对 (c) 只再省 0.23 MB → **紧凑编码叠加后毫无额外价值**。

---

## 4. 消费者分布（决定改动面）

| detail 字段 | 消费方 | 性质 |
|---|---|---|
| `examples` | `GlobalWordSearch.tsx:288,294`、`DeepVocabularyPage.tsx:499,523,834,1470`、**`SpellingPage.tsx:798`**、`FlashcardMode.tsx:121,349`、`DailyLearningMode.tsx:256,363,858`、`CollocationsTab.tsx:299,909` | 含**核心流程** |
| `collocations` | `GlobalWordSearch.tsx:313`、**`DeepVocabularyPage.tsx:451`**、`:541`、`:1372`、`DailyLearningMode.tsx:552`、**`CollocationsTab.tsx:285,288`** | 含**跨全库操作** |
| `deepExplanation` | `GlobalWordSearch.tsx:366`、`DeepVocabularyPage.tsx:1446,1464,1621` | 仅详情面板 |
| `synonyms` / `antonyms` | `GlobalWordSearch.tsx:332-354`、`DeepVocabularyPage.tsx:1388-1410`、`SpellingPage.tsx:547` | 实际已死（99.999% 为空） |

### 两个真实阻塞点

1. **`DeepVocabularyPage.tsx:451`**
   ```ts
   if (collocOnly) words = words.filter((w) => w.collocations.length > 0);
   ```
   这是**跨整级的查询期过滤**。若 `collocations` 改为按需加载，此过滤会把所有词判为"无搭配"，功能直接损坏。必须先在核心数据里补一个 `hasCollocations: boolean` 位。

2. **`CollocationsTab.tsx:285-301`**
   遍历**全部**词条的 `collocations` 与 `examples` 建索引。按词懒加载会让它退化为 N 次异步请求，必须改成按等级批量加载。

### 次要但必须处理的回归点

- **`SpellingPage.tsx:798`** 用 `examples` 构建拼写题 → 属于核心流程，不能只加载核心字段。
- **`GlobalWordSearch` 详情面板**（`288-371`）渲染 examples / collocations / synonyms / antonyms / deepExplanation → 只加载核心字段会让搜索详情变空。

---

## 5. 数据管线约束（被低估的风险）

数据文件由**多个可再生的生成器**产出：

| 脚本 | 覆盖等级 |
|---|---|
| `scripts/generate-wordbank.ts`（输出目录 `src/data/wordbank/data/{level}.ts`，见其第 9、18 行） | zhongkao、gaokao、postgraduate、professional |
| `scripts/gen-wordbank.mjs` / `gen-wordbank-full.mjs` / `real-wordbank.mjs` / `parse-wordbank.mjs` 等 | 其余等级 |

**含义**：任何手工拆分都会在下次运行生成器时被整体覆盖。拆分必须**内建进生成管线**（或增加一个确定性的后处理脚本），否则方案不成立——这是"低风险"定性不成立的核心理由。

---

## 6. 风险分级

| 方案 | gzip 收益 | 改动面 | 风险 |
|---|---|---|---|
| 紧凑编码 | −5.4% | 生成器 + 解码 | 收益过低，不值得 |
| 删除恒空字段 | ~0% | 生成器 + 3 处消费方的 `?.` 兜底 | 收益近零，不值得 |
| **detail 拆分（按等级）** | **−71.2%** | 生成管线（5+ 脚本或 1 个后处理）+ `wordbank.ts` + 6 个消费方（含 2 处跨全库逻辑重构） | **中高** |

**因此：不存在"低风险且有明显收益"的子集。** 低风险选项的收益约等于零，有收益的选项不是低风险。

---

## 7. 若立项，建议的最小可行设计

1. **数据层**：每个等级生成两个文件
   - `<level>.core.ts` —— `word`, `phonetic`, `partOfSpeech`, `meaning`, `level`, `frequencyRank`, `register`, `emotion`, `topics`, `hasNoChineseEquivalent`, 以及新增 `hasCollocations: boolean`
   - `<level>.detail.ts` —— `{ [wordLower]: { collocations, examples, deepExplanation } }`
   - 由一个确定性的后处理脚本产出，纳入生成管线；`CACHE_VERSION` 需递增（当前为 2）。
2. **加载层**（`wordbank.ts`）：核心字段按现有 `loadLevel` 加载；新增 `preloadDetail(levels)` / `isDetailReady(level)`；核心加载后 detail 字段填 `[]` / `''` 占位。
3. **消费方适配**：
   - `DeepVocabularyPage` 的 `collocOnly` 过滤改用 `hasCollocations`（保持同步、语义不变）。
   - `CollocationsTab` 改为 `await preloadDetail([level])` 后一次性建索引（保持批量，不退化为 N 次请求）。
   - `SpellingPage`、`FlashcardMode`、`DailyLearningMode`、`GlobalWordSearch` 在需要 detail 的入口 `await preloadDetail(...)`。
4. **验收指标**：9 等级合计 gzip 由 9.66 MB 降至 ≈2.78 MB；词汇页与拼写页功能与改动前逐项对照一致；`collocOnly` 过滤结果集与改动前完全相同。

---

## 8. 本次未做的事

**未改动任何生产代码。** 分析基于只读测量（字段统计、gzip 压缩对比、消费者 grep、生成器审阅）。所有临时测量脚本已从 `%TEMP%` 删除。
