# 词库数据层（`src/data/wordbank/`）

> 代码：`wordbank.ts`（加载与索引）、`meta.ts`（口径常量）、`schema.ts`（类型）、`data/<level>.ts` + `data/<level>.detail.ts`
> 缓存基建：`src/lib/idb.ts`、`src/lib/capped-cache.ts`、`src/lib/colloc-ai-cache.ts`
> 守卫：`node scripts/verify-wordbank-loading.mjs`（45 项）+ `node scripts/verify-wordbank-split.mjs --check <baseline.json>`
> 最后校准：2026-09-29

## 数据是怎么摆的

9 个等级（中考 / 高考 / 四级 / 六级 / 雅思 / 托福 / 考研 / 专业 / 高阶），每等级两个文件：

- **主文件** `data/<level>.ts` → `export const <LEVEL>_WORDS: IWordEntry[]`，只留核心字段，detail 三字段是**空占位**（`split-wordbank-detail.mjs:69`）。
- **detail 文件** `data/<level>.detail.ts` → `export const <LEVEL>_DETAIL: IWordDetailMap`，key 是 `word.toLowerCase()`，value 是 `{collocations, examples, deepExplanation}`，**只收录真有内容的词条**。
- 主文件每条还带一个布尔 `hasCollocations`（`schema.ts:28-29`）—— 它存在的意义是让 `collocOnly` 过滤**不依赖 detail 的加载时机**。

拆分的动机：单本级 JSON 3~12MB，超过 localStorage 5MB 配额；全字段一起加载既撑爆兜底又拖慢首屏。

## 四个口径，别混用

| 常量 | 含义 | 用在哪 |
|---|---|---|
| `WORD_COUNTS[level]` | 该书**可学的去重单词数** = `queryWords({level})` 的池子 | 词书卡显示数、进度分母（`DeepVocabularyPage.tsx:315,1137`、`ProgressPage.tsx:478`） |
| `WORD_ENTRIES[level]` | 该书**词条数**（同词不同词性/词频各一条） | 只用于说明规模，**不作任何分母** |
| `TOTAL_ENTRIES` = 75,113 | 各书词条相加 | 文案里的"数据规模" |
| `TOTAL_UNIQUE_WORDS` = 21,736 | 跨书唯一单词数 | "全部"模式的真实池子 |

`TOTAL_WORDS` 已 `@deprecated`（语义含糊）。**永远不要把各本书的数字相加当"全部"** —— 词书是累积式的，相加得到 62,633，而真实能出卡只有 21,736；要总数用 `getTotalLearnableCount()`（`wordbank.ts:335-338`）。

## 加载层职责

```
preloadLevels(levels)      = 每个等级 loadCore + loadDetail   （默认，卡片要例句）
preloadCoreOnly(levels)    = 只 loadCore                      （搜索/查词够用）
preloadDetail(levels)      = 只 loadDetail                    （展开某词详情时补）
isLevelReady(level)        核心就绪        isDetailReady(level)  detail 就绪
```

- `loadCore`（`:139-179`）：先查缓存（快路径提前 return），未命中才 `import('./data/<level>')`。
- `loadLevel`（`:262-275`）是 `loadCore` 的**包装**而不是在它末尾追加 detail —— 因为 `loadCore` 缓存命中会提前 return，写在里面的话**缓存命中路径永远不加载 detail**。
- `preloadLevels` 必须写显式箭头函数 `levels.map((l) => loadLevel(l, true))`：`map` 会把索引当第二参传入，索引 0 是 falsy → **第一个等级永远不加载 detail**（静态守卫在 `verify-wordbank-split.mjs:218-221`）。

## 缓存与换代

| | IndexedDB（主） | localStorage（兜底） |
|---|---|---|
| 核心 | `wb_<level>` | `__nativethink_wb_<level>` |
| detail | `wb_detail_<level>` | `__nativethink_wbd_<level>` |

库名 `nativethink-wordbank`，store `wordbank`。存的值是 `{ v: CACHE_VERSION, d: ... }`，读取时 `v !== CACHE_VERSION` 视为未命中、回落网络，下次写用同键覆盖（当前 `CACHE_VERSION = 3`，`wordbank.ts:22`）。**旧版本条目不会被主动删**。

⚠️ 两条硬规则：
1. **改了词条结构必须递增 `CACHE_VERSION`**，否则命中旧缓存 → 数据形态混杂（旧结构有 detail 值但缺 `hasCollocations`），而且只在部分设备上出现。
2. **IDB 写成功就不再镜像 localStorage**（`wordbank.ts:63-86`）。以前是无条件双写：每次加载词书都要付一次几 MB 的**同步 `JSON.stringify`** 再吃一发注定失败的 QuotaExceeded（被 catch 吞掉）。隐私模式等 IDB 不可用时兜底仍在（`verify-wordbank-loading.mjs:195-221` 两个方向都测）。

## 去重是两层，不是一层

`ensureIndexes()`（`:117-137`）：

- **书内去重**（每本一个 `bookSeen`）→ `_levelIndex[level]`，决定**这本书的出卡池子**。
- **全局去重**（一个 `globalSeen`）→ `_allWordsCache`，决定**"全部"模式一词一卡**。

历史事故：曾用**单个** `seen` 贯穿所有等级 → 谁先被遍历到谁独占该词，九本全载时考研池子 = 0、六级只剩 2,127，而且池子大小随"哪几本被加载"漂移（侧边栏悬停预取都会改变它）。

## `applyDetail` 必须就地改，不许重建对象

`applyDetail`（`:189-199`）直接给已加载词条对象逐字段赋值。因为 `ensureIndexes` 推入索引的是**同一批引用**（`:113-115,130-131`），原地补齐会自动对 `_levelIndex` / `_allWordsCache` / `_wordIndex` 生效。改成重建对象的话三个索引仍指向旧对象 —— **detail 永远不可见、不报错，界面只是空着**。消费端也依赖这点：卡片模式用 tick 触发重渲染而不是 setState 新对象（`QuickCardMode.tsx:312`）。

## 只增不减的缓存一律走 `capped-cache`

`cappedPut`（`capped-cache.ts:36-42`）合并后按 **FIFO** 封顶（键序=插入序，淘汰零成本）。约束与规则：

- 键**不能是纯数字**（会被 V8 排到最前，破坏插入序语义，`:11-12`）。
- `cappedPut` 是纯函数**不落盘**；落盘交给 persist effect —— 否则 StrictMode 双调用会翻倍。
- 现有上限：AI 例句 `__nativethink_word_ai_data` 200 条、搭配释义 `__nativethink_colloc_cache` 300、深度解析 `__nativethink_word_deep` 300、搭配 AI 译文 `__nativethink_colloc_ai_translations` 400（单点归属在 `colloc-ai-cache.ts`，含旧拼写键 `tranlations` 的自动迁移）。

## 改了词库之后必须跑什么

```bash
npm run wordbank:split                        # 幂等：detail 已存在且主文件已含 hasCollocations 就跳过
node scripts/verify-wordbank-loading.mjs      # 运行时集成：真跑 loadCore/loadDetail/applyDetail
node scripts/verify-wordbank-split.mjs --baseline /tmp/wb.json    # 基线（拆分前后都能采）
node scripts/verify-wordbank-split.mjs --check  /tmp/wb.json
```

任何词库**生成器**都会重新写出"全字段主文件"，所以生成之后必须再跑一次拆分。

`verify-wordbank-split` 的基线语义（2026-09-29 重做过）：基线取"当前数据里最权威的那个来源"（有 `hasCollocations` 标记用标记，否则用核心数组），所以**任何时刻都能重建**；同时把「标记 ↔ detail 真值」的分歧清单钉进基线并逐条比对 —— 现有 3 条历史分歧（postgraduate 的 `transistor` ×2、advanced 的 `dexterity`），根因是**同级重复词条在按词键控的 detail 映射里只能留一份**。多一条、少一条、换了谁都是红。

## 注意事项速查

| 症状 | 原因 | 位置 |
|---|---|---|
| 详情面板空白、无报错 | `loadLevel` 里 `try{loadDetail}catch{}` 静默吞错 | `wordbank.ts:273` |
| 空白后原地重试无效 | JS 模块表缓存了失败的 import，再 `import` 同一 specifier 不会重新求值 → UI 只能给"刷新页面" | `GlobalWordSearch.tsx:121-123` |
| 死循环重试 | 只看 `examples.length` 判断"没加载好"，而有些词本来就没例句 → 每 tick 重试。必须用 `isDetailReady` | `QuickCardMode.tsx:313-319` |
| 池子随加载顺序变 | 用了单个跨等级 `seen` | `wordbank.ts:101-137` |
| 词书写 X 但只出 Y 张卡 | 显示数填了词条数而非去重词数 | `meta.ts:8-11` |
| 第一个等级没 detail | `levels.map(loadLevel)` | `wordbank.ts:294-298` |
| 加载词书卡一下 | 每次冷加载多付一次几 MB 同步 stringify | `wordbank.ts:63-86` |
| 拆分后 detail 与展示词条错配 / TS1117 | 拆分脚本的去重规则与 `ensureIndexes` 不一致 | `split-wordbank-detail.mjs:76-98` |
