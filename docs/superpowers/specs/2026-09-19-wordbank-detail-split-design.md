# wordbank detail 字段按需加载 —— 设计文档

- 日期：2026-09-19
- 状态：待评审
- 前置分析：[2026-09-19-wordbank-detail-split-analysis.md](./2026-09-19-wordbank-detail-split-analysis.md)（测量数据与消费者分布）
- 关联：[AGENTS.md](../../../AGENTS.md)、[ROADMAP.md](../../../ROADMAP.md)

---

## 1. 目标

把 wordbank 词条的 **detail 字段**（`collocations` / `examples` / `deepExplanation`）从等级主文件中拆出、改为按需加载，使只做搜索与列表浏览的流程不必下载这部分数据。

**唯一量化目标**：`GlobalWordSearch` 的全量预加载体积由 **9.66 MB gzip 降至 ≈2.8 MB gzip**，且**搜索覆盖范围与搜索结果完全不变**（只影响展开后的详情面板）。

依据（前置分析 §3.3、本次新增的分等级测量）：

| 口径 | gzip |
|---|---|
| 9 个等级全量 | 9.66 MB |
| 9 个等级仅核心字段 | 2.78 MB |
| 差（detail 部分） | 6.87 MB |

`queryWords` 的搜索只用 `word` / `meaning` / `phonetic`，筛选用 `topics` / `register` / `pos` / `frequencyRank` —— **全部属于核心字段**。因此只加载核心字段不改变任何查询语义。这是本方案优于"削减预加载等级数"的关键：后者省得更多（7.24 MB）但会把搜索覆盖从 9 个等级缩到 3 个。

## 2. 非目标

| 不做 | 原因 |
|---|---|
| 移除 `synonyms` / `antonyms` / `wordFamily` | 虽 99.999% 为空，但 gzip 收益≈0，且会触碰 3 处消费方（`GlobalWordSearch:332-354`、`DeepVocabularyPage:1388-1410`、`SpellingPage:547`） |
| 紧凑编码 / 元组数组格式 | 实测 gzip 仅 −5.4%，叠加 detail 拆分后只再省 0.23 MB |
| 按词懒加载 detail | 会让 `CollocationsTab` 退化为 N 次异步请求 |
| 调整 `GlobalWordSearch` 的预加载等级数 | 会缩小搜索覆盖，不如本方案 |
| 改动 `dictionary/` 相关体积 | 与本任务无关 |
| 删除 `preloadAll` / `preloadProgressive` 死代码 | 属独立清理，避免混入本次改动 |

## 3. 架构

三层，自下而上：

```
数据层    <level>.ts（核心字段 + hasCollocations）  +  <level>.detail.ts（IWordDetailMap）
            ↑ 由 scripts/split-wordbank-detail.mjs 确定性产出
加载层    wordbank.ts：loadLevel(核心，现有) / loadDetail(按需，新增) + 就地补齐
消费层    7 个消费方按需 await preloadDetail(...)，靠 version 号触发重渲染
```

### 3.1 数据层

- `<level>.ts`：**文件名与导出名不变**（仍为 `<LEVEL>_WORDS`），内容改为仅含核心字段。这样一来 `wordbank.ts` 现有 `switch` 里的 9 条 `import('./data/<level>')` 完全不用改。
- `<level>.detail.ts`：新增，导出 `export const <LEVEL>_DETAIL: IWordDetailMap`。
- 新增核心字段 `hasCollocations: boolean`，取值 = 拆分前 `collocations.length > 0`。
  **它存在的唯一理由**：让 `DeepVocabularyPage.tsx:451` 的 `collocOnly` 过滤在 detail 尚未加载时仍能得到与改动前**逐条相同**的结果集。

产出工具 `scripts/split-wordbank-detail.mjs`（新增）：

- **用 TypeScript 编译器加载真实数组**，不用正则解析：`ts.transpileModule(source)` → 写临时 `.mjs` → 动态 import。理由：数据文件是 TS 对象字面量，且存在**两种引号风格**（`zhongkao`/`gaokao`/`postgraduate`/`professional` 用单引号，其余用双引号），正则方案会静默漏掉 4 个等级（前置分析 §3.1 已踩过这个坑）。此技术已在本次会话中验证可用。
- 输出统一使用无引号键 + 双引号字符串，消除双风格隐患。
- **幂等**：若 `<level>.ts` 已无 detail 字段则跳过（避免二次拆分把 detail 当核心）。
- 纳入 npm 脚本 `wordbank:split`，并在文档中说明：**重新运行任何词库生成器后必须再跑本脚本**，否则 detail 会重新混回主文件。

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
  /** 拆分前 collocations.length > 0；供 collocOnly 过滤在 detail 未加载时保持正确 */
  hasCollocations: boolean;
  // ── detail 字段（保留在类型中作为占位，detail 加载后就地补齐）──
  collocations: string[];
  examples: IExample[];
  deepExplanation: string;
  // ── 以下三个字段 99.999% 为空，本次保留不动 ──
  synonyms: string[];
  antonyms: string[];
  wordFamily: string[];
}
```

**为什么 detail 字段仍留在 `IWordEntry` 上**：所有渲染代码都在读 `w.collocations.length` / `w.examples[0]`。保留字段并以空值占位，可让渲染层在不改动的情况下安全降级（detail 未到位时显示为空，而非抛 `TypeError`）。

### 3.3 加载层（`src/data/wordbank/wordbank.ts`）

新增导出：

```ts
export function isDetailReady(level: string): boolean;
/** 幂等；并发安全；失败静默（调用方按空 detail 降级） */
export function preloadDetail(levels: string[]): Promise<void>;
```

新增内部状态与常量：

```ts
const _detailCache: Record<string, IWordDetailMap> = {};
const _detailLoaded: Set<string> = new Set();
const _detailLoading: Map<string, Promise<void>> = new Map();
const DETAIL_IDB_PREFIX = 'wb_detail_';
const DETAIL_LS_PREFIX = '__nativethink_wbd_';
```

`loadDetail(level)` 流程（与现有 `loadLevel` 同构，复用其缓存策略）：

1. `_detailLoaded.has(level)` → 直接返回
2. `_detailLoading.has(level)` → await 同一个 promise（防并发重复加载）
3. 读缓存（IndexedDB `wb_detail_<level>` → localStorage 兜底，版本不符则丢弃）
4. 未命中 → `await import('./data/<level>.detail')`，取导出名含 `DETAIL` 的键
5. `applyDetail(level, map)` **就地补齐**
6. `saveToCache` 同构写入 detail 缓存（fire-and-forget）
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

**就地补齐（而非重建对象）是刻意的，且是 load-bearing 的**：`queryWords` 返回的是 `_levelCache` 内对象的引用，已渲染的列表持有同一批引用；就地改字段配合消费方的 version 号即可让详情面板刷新，无需重新查询。

进一步地，`ensureIndexes()` 构建 `_levelIndex` 与 `_allWordsCache` 时执行的是 `deduped.push(w)` / `all.push(w)`——**推入的是同一批对象引用，不是副本**。因此就地补齐会自动对 `_levelIndex`、`_allWordsCache`、`_wordIndex` 全部生效。**实现时若把 `applyDetail` 写成重建对象（例如 `w = {...w, ...d}`），上述三个索引仍指向旧对象，detail 将永远不可见**——这是本设计最容易踩坏的一处。

**缓存版本必须递增**：`CACHE_VERSION` 由 `2` 改为 `3`。

- 理由：旧 `wb_<level>` 里存的是**含 detail 的全字段结构**。若不递增，改造后首次加载会命中旧缓存，得到"看起来正常但缺 `hasCollocations`"的数据（值为 `undefined` → `collocOnly` 过滤全部判假，功能静默损坏）。
- 代价：老用户首次访问会重新下载一次；但此时下载的是**核心文件（2.78 MB）而非 9.66 MB**，实际更快。

### 3.4 消费方义务

| 消费方 | 用到的 detail | 改造要求 |
|---|---|---|
| `GlobalWordSearch.tsx` | 展开面板：`examples:288`、`collocations:313`、`synonyms/antonyms:332-354`、`deepExplanation:366` | 全量预加载**保持加载 9 个等级的核心**；`expandedWord` 变化时 `await preloadDetail([level])` 后 bump version |
| `DeepVocabularyPage.tsx` | `collocOnly` 过滤 `:451`、详情面板 `:1372-1470`、`collocWordPopup:1770`、收藏 `:834` | **`:451` 改用 `hasCollocations`**（同步、语义不变）；选中词 / 进入需 detail 的模式时 `await preloadDetail([level])` |
| `CollocationsTab.tsx` | 全库建索引 `:285-301` | 它建索引的 `:270` 是**同步 `useMemo`，无法 await**。改用本仓库既有 `dataVersion` 模式：`useEffect` 里 `await preloadDetail(selectedLevels)` → `setDetailVersion(v=>v+1)`，并把 `detailVersion` 加入 `useMemo` 依赖 |
| `SpellingPage.tsx` | 构建拼写题 `:798`、`synonyms:547` | 生成题目前 `await preloadDetail([level])` |
| `FlashcardMode.tsx` | `examples[0]:121,349` | 进入卡片模式时确保 detail 就绪 |
| `DailyLearningMode.tsx` | `examples:256,363,858`、`collocations:552,865` | 同上 |
| `PageReader.tsx`、`AppSidebar.tsx`、`MobileBottomNav.tsx` | **无**（只做查词/预加载） | 无需改动 |

**降级约定**：`preloadDetail` 失败时静默返回，消费方按"detail 为空"渲染（列表仍可见、例句区为空），不弹错、不阻断页面。

## 4. 验证方案

| 档 | 手段 | 通过标准 |
|---|---|---|
| V1 | `npm run typecheck` + `npm run lint:eslint` | 均 exit 0 |
| V2 | `npm run build:web` | exit 0 |
| V3 | **全新 clone 构建**（`git archive` + junction `node_modules` + `vite build`） | exit 0 |
| V4 | **Node 断言（针对真实源码）**：用项目自带 tsc 转译 `wordbank.ts` 与拆分脚本产物后在 Node 直接调用，断言：①`hasCollocations` 与拆分前 `collocations.length > 0` 在**全部 75,113 条**上逐条一致；②`applyDetail` 就地补齐后字段值与 detail 源文件一致；③`collocOnly` 过滤结果集与改动前**完全相同**（对比 ID 集合） | 全部断言通过 |
| V5 | **体积指标**：拆分后 9 级核心合计 gzip、以及 `GlobalWordSearch` 全量预加载对应的 chunk 集合 gzip | 核心合计 ≈2.8 MB（原 9.66 MB）；不劣于 3.2 MB |

V4 沿用本次会话已验证可用的手法（tsc `transpileModule` → 临时 `.mjs` → 动态 import → Node 断言），不引入测试框架（本项目无 vitest/jest，见 AGENTS.md）。

## 5. 验收标准

1. V1–V4 全部通过。
2. `GlobalWordSearch` 首次打开时加载的 wordbank 体积由 9.66 MB gzip 降至 ≈2.8 MB gzip。
3. 搜索功能**行为不变**：同一查询词的结果条数、顺序、可见字段与改动前一致。
4. `collocOnly` 过滤的结果集与改动前逐条相同（V4③）。
5. 词汇页各模式（浏览 / 闪卡 / 每日学习 / 搭配 / 详情面板）功能与改动前逐项对照一致，无空白详情面板。
6. `CACHE_VERSION` 已递增，且升级后旧缓存不会导致 `collocOnly` 静默失效。

## 6. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 就地补齐后**已渲染的列表不刷新**，详情面板显示空白 | 消费方一律在 `await preloadDetail` 后 bump version（本仓库 `DeepVocabularyPage:370` 已有 `dataVersion` 先例）；消费方清单已在上表逐个列出，不遗漏 |
| 旧 IndexedDB 缓存缺 `hasCollocations` → `collocOnly` 静默返回空 | `CACHE_VERSION` 递增至 3；V4① 全量断言兜底 |
| 词库生成器重跑**覆盖拆分结果** | 拆分脚本幂等且纳入 npm 脚本；在 `AGENTS.md` 与脚本头部注明"改词库后必须重跑 `wordbank:split`" |
| 正则解析漏掉单引号等级（本次已踩坑） | 拆分脚本用 tsc 转译 + 动态 import，不做正则解析 |
| `preloadDetail` 与 `loadLevel` 并发导致重复加载/竞态 | 用 `_detailLoading: Map<level, Promise>` 去重，与现有 `_loading` 同构 |
| 拆分后主文件仍有 detail 字段占位，误以为未拆分 | V5 体积指标 + V4② 字段一致性断言 |

## 7. 回滚

逐提交 revert 即可。唯一副作用：`CACHE_VERSION` 回退会让用户已有的 v3 缓存失效并重新下载一次核心文件（2.78 MB），不影响数据正确性（学习进度存在另一套 key，与本缓存无关）。

## 8. 交付物

- `scripts/split-wordbank-detail.mjs`（新增）+ `package.json` 的 `wordbank:split` 脚本
- `src/data/wordbank/schema.ts`（新增 `IWordDetail` / `IWordDetailMap` / `hasCollocations`）
- `src/data/wordbank/data/*.ts`（改写为核心字段）+ `*.detail.ts`（新增 9 个）
- `src/data/wordbank/wordbank.ts`（新增 detail 加载层 + `CACHE_VERSION` 递增）
- 7 个消费方适配（见 §3.4）
- `AGENTS.md` 补充"改词库后必须重跑 `wordbank:split`"约定
