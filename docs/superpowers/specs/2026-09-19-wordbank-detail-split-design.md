# wordbank detail 字段按需加载 —— 设计文档（修订版）

- 日期：2026-09-19（修订：采纳"detail 默认加载 + 仅核心路径"简化）
- 状态：待评审
- 前置分析：[2026-09-19-wordbank-detail-split-analysis.md](./2026-09-19-wordbank-detail-split-analysis.md)
- 关联：[AGENTS.md](../../../AGENTS.md)、[ROADMAP.md](../../../ROADMAP.md)

---

## 1. 目标

把 wordbank 词条的 **detail 字段**（`collocations` / `examples` / `deepExplanation`）从等级主文件中拆出，使**只做搜索的流程**不必下载这部分数据。

**唯一量化目标**：`GlobalWordSearch` 的全量预加载由 **9.66 MB gzip 降至 ≈2.8 MB gzip**，且**搜索覆盖与搜索结果完全不变**。

依据：

| 口径 | gzip |
|---|---|
| 9 个等级全量 | 9.66 MB |
| 9 个等级仅核心字段 | 2.78 MB |
| 差（detail 部分） | 6.87 MB |

`queryWords` 的搜索只用 `word` / `meaning` / `phonetic`，筛选用 `topics` / `register` / `pos` / `frequencyRank` —— **全部属于核心字段**。故只加载核心不改变任何查询语义。这优于"削减预加载等级数"（省 7.24 MB 但搜索覆盖从 9 级缩到 3 级）。

### 1.1 为什么只有 1 个消费方需要改造

关键设计决策：**`loadLevel(level)` 默认仍然"核心 + detail"一起加载**，只新增一条"仅核心"路径。

由此：

| 流程 | 改动后的行为 |
|---|---|
| 词汇页 / 拼写页 / 阅读器（走 `preloadLevels`） | 仍加载 core + detail，**字节数与改动前完全相同**，其同步消费逻辑天然正确，**一行都不用改** |
| `GlobalWordSearch`（走新增的仅核心路径） | 9 级预加载只拿核心 → 体积收益在此落地；展开某词时按需加载该等级的 detail |

因此需要改造的消费方从原设计的 7 个降为 **1 个**，且**不存在中间态回归**：`preloadLevels` 的契约未变。

## 2. 非目标

| 不做 | 原因 |
|---|---|
| 改造通过 `preloadLevels` 获取 detail 的消费方（`DeepVocabularyPage`、`CollocationsTab`、`FlashcardMode`、`DailyLearningMode`、`SpellingPage`） | 它们的契约不变即正确；多改一处就多一处风险 |
| 移除 `synonyms` / `antonyms` / `wordFamily` | 虽 99.999% 为空，但 gzip 收益≈0，且会触碰 3 处消费方 |
| 紧凑编码 / 元组数组格式 | 实测 gzip 仅 −5.4% |
| 按词懒加载 detail | 会让 `CollocationsTab` 退化为 N 次异步请求 |
| 调整 `GlobalWordSearch` 的预加载等级数 | 会缩小搜索覆盖 |
| 删除 `preloadAll` / `preloadProgressive` 死代码 | 独立清理，避免混入 |

## 3. 架构

```
数据层    <level>.ts（核心字段 + detail 空占位 + hasCollocations）  +  <level>.detail.ts
            ↑ 由 scripts/split-wordbank-detail.mjs 确定性产出
加载层    wordbank.ts：loadLevel(level, withDetail=true 默认) / preloadCoreOnly / preloadDetail
消费层    GlobalWordSearch 改用 preloadCoreOnly + 展开时 preloadDetail（唯一必需改动）
```

### 3.1 数据层

- `<level>.ts`：**文件名与导出名不变**（仍为 `<LEVEL>_WORDS`），内容改为：核心字段 + `hasCollocations` + **detail 三字段的空占位**（`collocations: []`、`examples: []`、`deepExplanation: ''`）。
  - 保留空占位是刻意的：`IWordEntry` 的 detail 字段仍为必填，因此**渲染代码 `w.collocations.length` / `w.examples[0]` 无需加任何保护**，且不会出现 `TypeError`。
  - 空占位是高度重复的内容，gzip 后近似零成本（V5 会实测确认）。
- `<level>.detail.ts`：新增，导出 `export const <LEVEL>_DETAIL: IWordDetailMap`。
- `hasCollocations: boolean` = 拆分前 `collocations.length > 0`。它**不再是 load-bearing**（detail 默认会加载），但保留并用于 `collocOnly` 过滤：这样该查询期过滤不再隐式依赖 detail 的加载时机，且给验证提供一个可全量断言的不变式。

产出工具 `scripts/split-wordbank-detail.mjs`（新增）：

- **用 TypeScript 编译器加载真实数组，不用正则解析**：`ts.transpileModule(source)` → 临时 `.mjs` → 动态 import。数据文件是 TS 对象字面量且存在**两种引号风格**（`zhongkao`/`gaokao`/`postgraduate`/`professional` 单引号，其余双引号），正则方案会静默漏掉 4 个等级（分析文档 §3.1 已踩过）。
- 输出统一为无引号键 + 双引号字符串，消除双风格隐患。
- **幂等**：若检测到主文件已无真实 detail（只剩空占位）则跳过，避免二次拆分。
- 纳入 npm 脚本 `wordbank:split`；**重跑任何词库生成器后必须再跑本脚本**，否则 detail 会重新混回主文件。

### 3.2 类型（`src/data/wordbank/schema.ts`）

```ts
/** detail 字段集合（按需加载） */
export interface IWordDetail {
  collocations: string[];
  examples: IExample[];
  deepExplanation: string;
}

/** key = word.toLowerCase() */
export type IWordDetailMap = Record<string, IWordDetail>;

export interface IWordEntry {
  // ── 核心字段 ──
  word: string;
  phonetic: string;
  partOfSpeech: string;
  meaning: string;
  level: 'zhongkao' | 'gaokao' | 'cet4' | 'cet6' | 'ielts' | 'toefl' | 'postgraduate' | 'professional' | 'advanced';
  frequencyRank: number;
  register: 'formal' | 'neutral' | 'informal';
  emotion: 'positive' | 'neutral' | 'negative';
  topics: string[];
  hasNoChineseEquivalent: boolean;
  /** 拆分前 collocations.length > 0；供 collocOnly 过滤不依赖 detail 加载时机 */
  hasCollocations: boolean;
  // ── detail 字段：类型仍为必填，未加载时为空占位 ──
  collocations: string[];
  examples: IExample[];
  deepExplanation: string;
  // ── 以下三个字段 99.999% 为空，本次保留不动 ──
  synonyms: string[];
  antonyms: string[];
  wordFamily: string[];
}
```

### 3.3 加载层（`src/data/wordbank/wordbank.ts`）

**契约变化仅一处新增，`preloadLevels` 语义完全不变。**

```ts
/** 预加载等级（核心 + detail）—— 语义与改动前一致 */
export function preloadLevels(levels: string[]): Promise<void>;   // 现有，不改

/** 仅预加载核心字段，不加载 detail —— 供只做搜索/查词的流程使用 */
export function preloadCoreOnly(levels: string[]): Promise<void>;  // 新增

/** 按需加载 detail（幂等、并发安全、失败静默） */
export function preloadDetail(levels: string[]): Promise<void>;    // 新增
export function isDetailReady(level: string): boolean;             // 新增
```

内部状态（与现有 `_loaded` / `_loading` 正交）：

```ts
const _detailCache: Record<string, IWordDetailMap> = {};
const _detailLoaded: Set<string> = new Set();
const _detailLoading: Map<string, Promise<void>> = new Map();
const DETAIL_IDB_PREFIX = 'wb_detail_';
const DETAIL_LS_PREFIX = '__nativethink_wbd_';
```

内部签名改为 `loadLevel(level: string, withDetail = true)`：
1. 确保核心已加载（现有逻辑不变）
2. `withDetail === true` 时，继续 `await loadDetail(level)`

- `preloadLevels(levels)` → `Promise.all(levels.map(l => loadLevel(l, true)))`（默认，不变）
- `preloadCoreOnly(levels)` → `Promise.all(levels.map(l => loadLevel(l, false)))`
- `preloadDetail(levels)` → 只走 `loadDetail`，不动核心

`loadDetail(level)`：

1. `_detailLoaded.has(level)` → 返回
2. `_detailLoading.has(level)` → await 同一 promise（防并发重复）
3. 读缓存（IndexedDB `wb_detail_<level>` → localStorage 兜底，版本不符即丢弃）
4. 未命中 → `await import('./data/<level>.detail')`，取导出名含 `DETAIL` 的键
5. `applyDetail(level, map)` 就地补齐
6. 写缓存（fire-and-forget）
7. 标记 `_detailLoaded`

```ts
function applyDetail(level: string, map: IWordDetailMap): void {
  const words = _levelCache[level];
  if (!words) return;
  for (const w of words) {
    const d = map[w.word.toLowerCase()];
    if (!d) continue;
    w.collocations = d.collocations ?? [];
    w.examples = d.examples ?? [];
    w.deepExplanation = d.deepExplanation ?? '';
  }
}
```

**就地补齐（而非重建对象）是刻意的，且是 load-bearing 的**：`queryWords` 返回的是 `_levelCache` 内对象的引用。进一步地，`ensureIndexes()` 构建 `_levelIndex` 与 `_allWordsCache` 时执行 `deduped.push(w)` / `all.push(w)`——**推入的是同一批对象引用而非副本**，因此就地补齐自动对三个索引生效。

> **实现时若把 `applyDetail` 写成重建对象（如 `w = {...w, ...d}`），三个索引仍指向旧对象，detail 将永远不可见**——不报错，界面只是空着。这是本设计最隐蔽的失败模式。

**缓存版本必须递增**：`CACHE_VERSION` 由 `2` 改为 `3`。旧 `wb_<level>` 缓存存的是含真实 detail 的全字段结构；若不递增，改造后首次加载命中旧缓存会导致数据形态混杂（旧结构里 detail 有值但缺少 `hasCollocations`）。代价是老用户重下一次，但此时下载的是核心文件（更小）。

### 3.4 消费方义务

**必需（1 处）** —— `src/components/GlobalWordSearch.tsx`：

| 位置 | 改动 |
|---|---|
| `:69` | `preloadLevels(essential)` → `preloadCoreOnly(essential)` |
| `:75` | `remaining.forEach(level => preloadLevels([level]))` → `preloadCoreOnly([level])` |
| 新增 | `detailReady` state + `useEffect`：`expandedWord` 变化时找到该词的 `level`，若 `!isDetailReady(level)` 则 `await preloadDetail([level])` 后 `setDetailReady(true)`；`!detailReady` 时详情面板显示加载占位 |
| `:119` | `expandedEntry` 派生逻辑不变（`detailReady` 变化会触发重渲染，就地补齐后的对象随即可见） |

**可选（3 处，各自一行，只做查词、不用 detail）**：

| 位置 | 改动 |
|---|---|
| `ArticlePage/components/PageReader.tsx:393` | `preloadLevels(essential)` → `preloadCoreOnly(essential)` |
| `components/AppSidebar.tsx:94-95` | `preloadLevels(['cet4'])` → `preloadCoreOnly(['cet4'])` |
| `components/MobileBottomNav.tsx:49` | 同上 |

**无需改动**：`DeepVocabularyPage`（含 `:451` 的 `collocOnly`，改为使用 `hasCollocations`，见下）、`CollocationsTab`、`FlashcardMode`、`DailyLearningMode`、`SpellingPage`、`DeepVocabularyPage` 的 `preloadLevels` 调用点。

**唯一一处消费方逻辑微调**：`DeepVocabularyPage.tsx:451` 的 `w.collocations.length > 0` → `w.hasCollocations`。语义等价，但让该过滤不再隐式依赖 detail 加载时机。

**降级约定**：`preloadDetail` 失败时静默返回；`GlobalWordSearch` 详情面板回落为"仅显示核心信息（释义/音标）"，不弹错、不阻断。

## 4. 验证方案

| 档 | 手段 | 通过标准 |
|---|---|---|
| V1 | `npm run typecheck` + `npm run lint:eslint` | 均 exit 0 |
| V2 | `npm run build:web` | exit 0 |
| V3 | **全新 clone 构建**（`git archive` + junction `node_modules` + `vite build`） | exit 0 |
| V4 | **Node 断言（针对真实源码）**：用项目自带 tsc 转译后在 Node 直接调用。①全部 **75,113 条**上 `hasCollocations === (拆分前 collocations.length > 0)`；②`applyDetail` 就地补齐后字段值与 detail 源文件逐条一致；③`collocOnly` 过滤结果集（词条 ID 集合）与改动前**完全相同**；④`applyDetail` 后 `_levelIndex` 中对象的 detail 字段也已更新（验证共享引用，防"重建对象"回归） | 全部断言通过 |
| V5 | **体积指标**：拆分后 9 级核心合计 gzip；确认空占位未抵消收益 | 核心合计 ≤3.2 MB（原 9.66 MB） |

V4 沿用本次会话已验证可用的手法（tsc `transpileModule` → 临时 `.mjs` → 动态 import → Node 断言），不引入测试框架（本项目无 vitest/jest，见 AGENTS.md）。

**V4 必须在拆分前先跑一次并留存基线快照**，否则"与改动前完全相同"无法证明。

## 5. 验收标准

1. V1–V4 全部通过。
2. `GlobalWordSearch` 首次打开时加载的 wordbank 体积由 9.66 MB gzip 降至 ≈2.8 MB gzip。
3. 搜索行为不变：同一查询词的结果条数、顺序、可见字段与改动前一致。
4. `collocOnly` 过滤结果集与改动前逐条相同（V4③）。
5. 词汇页 / 拼写页 / 阅读器 / 全局搜索的行为与改动前逐项对照一致；全局搜索展开词的详情面板在 detail 到位后完整显示（含加载中占位）。
6. `CACHE_VERSION` 已递增。
7. `preloadLevels` 的对外契约与调用点数量未变（除上述 1 必需 + 3 可选）。

## 6. 风险与缓解

| 风险 | 缓解 |
|---|---|
| `applyDetail` 写成重建对象 → 三个索引指向旧对象，detail 永不可见（**最隐蔽**） | V4④ 专门断言 `_levelIndex` 内对象的 detail 已更新；设计文档已显式标注为 load-bearing |
| 拆分脚本用正则解析 → 静默漏掉 4 个单引号等级 | 脚本用 tsc 转译 + 动态 import；V4①② 全量断言兜底 |
| 旧 IndexedDB 缓存结构混杂 | `CACHE_VERSION` 递增至 3 |
| 词库生成器重跑覆盖拆分结果 | 脚本幂等 + 纳入 `wordbank:split`；`AGENTS.md` 注明"改词库后必须重跑" |
| 空占位抵消体积收益 | V5 实测门槛 ≤3.2 MB，不达标即需改为彻底省略字段（并相应加渲染保护） |
| `GlobalWordSearch` 展开词时 detail 未就绪出现空白面板 | `detailReady` 状态 + 加载占位；失败静默回落核心信息 |
| `loadDetail` 与 `loadLevel` 并发导致重复加载 | `_detailLoading` Map 去重，与现有 `_loading` 同构 |
| **`preloadLevels` 内的 `levels.map(loadLevel)` 会把 `map` 的索引当作 `withDetail`** —— 索引 `0` 为 falsy，导致**第一个等级永远不加载 detail**（不报错，界面只是空着） | 必须改为显式箭头函数 `levels.map((l) => loadLevel(l, true))`；V4 增加静态守卫断言禁止 `levels.map(loadLevel)` 写法 |
| `loadLevel` 的缓存命中路径会提前 `return`，若把 detail 加载追加到原函数末尾则**缓存命中时 detail 永不加载**（老用户二次访问详情全空） | 必须把原 `loadLevel` 重命名为 `loadCore`，另加薄包装 `loadLevel(level, withDetail)`，保证两条路径都覆盖 |

## 7. 回滚

逐提交 revert。唯一副作用：`CACHE_VERSION` 回退使 v3 缓存失效并重新下载核心文件一次，不影响学习进度（存于另一套 key）。

## 8. 交付物

- `scripts/split-wordbank-detail.mjs`（新增）+ `package.json` 的 `wordbank:split`
- `scripts/verify-wordbank-split.mjs`（新增，V4 断言工具）
- `src/data/wordbank/schema.ts`（`IWordDetail` / `IWordDetailMap` / `hasCollocations`）
- `src/data/wordbank/data/*.ts`（改写为核心 + 空占位）+ `*.detail.ts`（新增 9 个）
- `src/data/wordbank/wordbank.ts`（`preloadCoreOnly` / `preloadDetail` / `isDetailReady` / `loadLevel(withDetail)` / `CACHE_VERSION` → 3）
- `src/components/GlobalWordSearch.tsx`（必需改造）
- `DeepVocabularyPage.tsx:451`（改用 `hasCollocations`）
- 可选三处：`PageReader.tsx`、`AppSidebar.tsx`、`MobileBottomNav.tsx`
- `AGENTS.md` 补充"改词库后必须重跑 `wordbank:split`"
