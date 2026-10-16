# 词库数据层（`src/data/wordbank/`）

> 代码：`wordbank.ts`（加载与索引）、`meta.ts`（口径常量）、`schema.ts`（类型）、`data/<level>.ts` + `data/<level>.detail.ts`
> 缓存基建：`src/lib/idb.ts`、`src/lib/capped-cache.ts`、`src/lib/colloc-ai-cache.ts`
> 守卫：`node scripts/verify-wordbank-loading.mjs`（49 项）+ `node scripts/verify-wordbank-split.mjs --check <baseline.json>`
> 最后校准：2026-10-13

## 旧镜像清理（2026-10-16，"无法收藏"的底层根因）

真机实测：一台设备的 localStorage 被旧「无条件双写」年代的词库镜像吃到 **5MB 配额顶格**（wb_cet4 1476KB / wb_zhongkao 1124KB / wbd_gaokao 991KB / wbd_zhongkao 587KB / wbd_professional 484KB，总计 5,120KB，**连 100KB 探测都写不进**）—— 收藏/学习进度等用户数据的新增写入全部静默失败（`safeStorage.setItem` 返回 false）。IDB 优先后这些镜像**只在 IDB 挂掉时才有人读**，但旧装机上不会自己消失。

修法（`wordbank.ts` `purgeLsMirrorsIfIdbHealthy`，`loadCore` 首次触发，fire-and-forget）：IDB 探活（set+delete 一个 probe 键）成功时，遍历 `ALL_LEVELS`，**IDB 里已有对应缓存**的 `wb_*`/`wbd_*` LS 镜像删掉；没有的不删（那是它唯一兜底，等 LS 命中迁移）；清单外的同名前缀键不误伤。守卫 `verify-wordbank-loading` ⑧（49→**53**）：清理生效 / 清单外不误伤 / IDB 不可用（含"探活失败但 idbHas 报有货"的**部分故障**形态）不清理，变异 M1（不触发）/M2（绕过提前返回）各红 1 条。

## 数据是怎么摆的

11 个等级（中考 / 高考 / 四级 / 六级 / **四六级高频** / **四六级高分** / 雅思 / 托福 / 考研 / 专业 / 高阶），每等级两个文件：

- **主文件** `data/<level>.ts` → `export const <LEVEL>_WORDS: IWordEntry[]`，只留核心字段，detail 三字段是**空占位**（`split-wordbank-detail.mjs:76`）。
- **detail 文件** `data/<level>.detail.ts` → `export const <LEVEL>_DETAIL: IWordDetailMap`，key 是 `word.toLowerCase()`，value 是 `{collocations, examples, deepExplanation}`，**只收录真有内容的词条**。
- 主文件每条还带一个布尔 `hasCollocations`（`schema.ts:28-29`）—— 它存在的意义是让 `collocOnly` 过滤**不依赖 detail 的加载时机**。

拆分的动机：单本级 JSON 3~12MB，超过 localStorage 5MB 配额；全字段一起加载既撑爆兜底又拖慢首屏。

## 四个口径，别混用

| 常量 | 含义 | 用在哪 |
|---|---|---|
| `WORD_COUNTS[level]` | 该书**可学的去重单词数** = `queryWords({level})` 的池子 | 词书卡显示数、进度分母（`DeepVocabularyPage.tsx:350,1199`、`ProgressPage.tsx:484`） |
| `WORD_ENTRIES[level]` | 该书**词条数**（同词不同词性/词频各一条） | 只用于说明规模，**不作任何分母** |
| `TOTAL_ENTRIES` = 81,113 | 各书词条相加 | 文案里的"数据规模" |
| `TOTAL_UNIQUE_WORDS` = 21,736 | 跨书唯一单词数 | "全部"模式的真实池子 |

`TOTAL_WORDS` 已 `@deprecated`（语义含糊）。**永远不要把各本书的数字相加当"全部"** —— 词书是累积式的，相加得到 68,633，而真实能出卡只有 21,736；要总数用 `getTotalLearnableCount()`（`wordbank.ts:339-341`）。

## 加载层职责

```
preloadLevels(levels)      = 每个等级 loadCore + loadDetail   （默认，卡片要例句）
preloadCoreOnly(levels)    = 只 loadCore                      （搜索/查词够用）
preloadDetail(levels)      = 只 loadDetail                    （展开某词详情时补）
isLevelReady(level)        核心就绪        isDetailReady(level)  detail 就绪
```

- `loadCore`（`:139-181`）：先查缓存（快路径提前 return），未命中才 `import('./data/<level>')`。
- `loadLevel`（`:274-279`）是 `loadCore` 的**包装**而不是在它末尾追加 detail —— 因为 `loadCore` 缓存命中会提前 return，写在里面的话**缓存命中路径永远不加载 detail**。
- `preloadLevels` 必须写显式箭头函数 `levels.map((l) => loadLevel(l, true))`（`:299-303`）：`map` 会把索引当第二参传入，索引 0 是 falsy → **第一个等级永远不加载 detail**（静态守卫在 `verify-wordbank-split.mjs:218-221`）。

## 缓存与换代

| | IndexedDB（主） | localStorage（兜底） |
|---|---|---|
| 核心 | `wb_<level>` | `__nativethink_wb_<level>` |
| detail | `wb_detail_<level>` | `__nativethink_wbd_<level>` |

库名 `nativethink-wordbank`，store `wordbank`。存的值是 `{ v: CACHE_VERSION, d: ... }`，读取时 `v !== CACHE_VERSION` 视为未命中、回落网络，下次写用同键覆盖（当前 `CACHE_VERSION = 4`：v4 = 释义/例文坏字符清理，见下方「坏字符清理」；`wordbank.ts:22`）。**旧版本条目不会被主动删**。

⚠️ 两条硬规则：
1. **改了词条结构、或对数据做了内容清洗（如 U+FFFD / PUA 坏字符清理）必须递增 `CACHE_VERSION`**，否则命中旧缓存 → 数据形态/内容混杂（旧结构有 detail 值但缺 `hasCollocations`；或清理后 UI 仍显示坏字符 —— 2026-10-14 实测确认），而且只在部分设备上出现。
2. **IDB 写成功就不再镜像 localStorage**（`wordbank.ts:63-86`）。以前是无条件双写：每次加载词书都要付一次几 MB 的**同步 `JSON.stringify`** 再吃一发注定失败的 QuotaExceeded（被 catch 吞掉）。隐私模式等 IDB 不可用时兜底仍在（`verify-wordbank-loading.mjs:195-221` 两个方向都测）。

## 去重是两层，不是一层

`ensureIndexes()`（`:117-137`）：

- **书内去重**（每本一个 `bookSeen`）→ `_levelIndex[level]`，决定**这本书的出卡池子**。
- **全局去重**（一个 `globalSeen`）→ `_allWordsCache`，决定**"全部"模式一词一卡**。

历史事故：曾用**单个** `seen` 贯穿所有等级 → 谁先被遍历到谁独占该词，全载时考研池子 = 0、六级只剩 2,127，而且池子大小随"哪几本被加载"漂移（侧边栏悬停预取都会改变它）。

## 四六级两本书（`cet46freq` / `cet46elite`）

**口径**：真题考频优先（四级没有真题语料，用通用度优先兜底），两本互为「高频」与「拔高」，都是通吃版（四级用户看高频 / 六级用户两本都有价值）：

| key | 展示名 | 内容口径 |
|---|---|---|
| `cet46freq` 四六级高频 | 真题考频前段 + 四级通用度前段，合计 3,000 条 |
| `cet46elite` 四六级高分 | 六级真题考频前段 + 六级独有拔高词，合计 3,000 条 |

选词是**离线分析一次定稿**的：六级真题语料（`D:/CetExam-real/text`，约 20 套）统计考频，四级没有真题语料、用 Gutenberg 通用度优先兜底；候选词经剔除表清洗后定稿成词单快照 `scripts/data/cet46freq.json` / `cet46elite.json`（每词 `[word, 真题词次, 真题套数, Gutenberg 排名, 书内序号]`）。**快照是选词口径的唯一载体**，改词单就改它。

**生成管线**（`scripts/generate-cet46-books.mjs` 单点，勿手改产物）：

```bash
node scripts/generate-cet46-books.mjs    # 快照 → 全字段主文件（脚本自带 3000 条/序号连续/字段非空 逐词硬校验）
npm run wordbank:split                   # 拆出 cet46freq.detail.ts / cet46elite.detail.ts（任何生成器之后都必须）
node scripts/verify-wordbank-loading.mjs # 新书池子 = WORD_COUNTS = 3000、跨书唯一数不变
```

合并规则（生成时逐词执行，`generate-cet46-books.mjs:78-102`）：**基础字段取 cet4（缺则整条回退 cet6）**；detail 按**字段**回退（cet4 的搭配/例句为空时用 cet6 的）；音标三级回退（cet4 → cet6 → 其余 7 本按顺序取第一个非空）。`frequencyRank` = 书内序号 i+1，脚本会硬校验序号连续、词单内无重复、cet4/cet6 里至少一本有该词。

**去重顺序**：`ALL_LEVELS` 里两本排在 **cet6 之后** —— 全局去重按该顺序首见者胜，新书的词全部是既有词子集，所以不影响任何旧书的归属（`TOTAL_UNIQUE_WORDS` 21,736 保持不变）。

## `applyDetail` 必须就地改，不许重建对象

`applyDetail`（`:191-201`）直接给已加载词条对象逐字段赋值。因为 `ensureIndexes` 推入索引的是**同一批引用**（`:113-115,130-131`），原地补齐会自动对 `_levelIndex` / `_allWordsCache` / `_wordIndex` 生效。改成重建对象的话三个索引仍指向旧对象 —— **detail 永远不可见、不报错，界面只是空着**。消费端也依赖这点：卡片模式用 tick 触发重渲染而不是 setState 新对象（`QuickCardMode.tsx:312`）。

## 只增不减的缓存一律走 `capped-cache`

`cappedPut`（`capped-cache.ts:36-42`）合并后按 **FIFO** 封顶（键序=插入序，淘汰零成本）。约束与规则：

- 键**不能是纯数字**（会被 V8 排到最前，破坏插入序语义，`:11-12`）。
- `cappedPut` 是纯函数**不落盘**；落盘交给 persist effect —— 否则 StrictMode 双调用会翻倍。
- 现有上限：AI 例句 `__nativethink_word_ai_data` 200 条、搭配释义 `__nativethink_colloc_cache` 300、深度解析 `__nativethink_word_deep` 300、搭配 AI 译文 `__nativethink_colloc_ai_translations` 400（单点归属在 `colloc-ai-cache.ts`，含旧拼写键 `tranlations` 的自动迁移）。

## 坏字符清理（U+FFFD 与私用区 PUA）

两类字符任何字体都渲染不出，真机上显示为 "?" / 方块（2026-10-14 用户：「单词的『?』未知图标出现在中文注释里」；更早还有一例「翻译里有 ???」）。净化脚本 `scripts/clean-wordbank-mojibake.mjs`（幂等，`--dry` 可干跑不写盘）：

- **U+FFFD**（第一批）：曾 10 个词库文件共 5,909 处，成因是丢单个汉字、无法在文件内恢复；口径 = `meaning` 丢掉含乱码的 `；` token、`phonetic`/`examples.zh` 置空、`deepExplanation` 就地去掉。
- **U+E000–U+F8FF 私用区 PUA**（第二批，扩进同一脚本）：全量 16 处 —— 词库 3 处（考研 `common` 的单条释义尾 = 用户可见真身；专业 `verbose`/`prolix` 的带 PUA 重复条目 = 被干净首条按书内去重挡住的隐患）+ 词典 13 处（化学式下标被编成 PUA、`(曾用×)` 等）；词库同口径，**词典整份就地祛符**（`C₁₇H₁₈F₃NO` → `C17H18F3NO`，不编造）。
- **清完必须递增 `CACHE_VERSION`**：文件改了但设备命中的还是 IDB 旧缓存，UI 照旧显示坏字符（实测确认）；老缓存条目等版本不符自然回落。
- 守卫 `node scripts/verify-char-hygiene.mjs`（9 条，verify:all 自动带上）：全量零残留 + 扫描器正/负对照固件自证 + 扫描文件数下限（防路径失效假绿）+ 净化脚本覆盖两个数据目录的自证。

## 改了词库之后必须跑什么

```bash
npm run wordbank:split                        # 幂等：detail 已存在且主文件已含 hasCollocations 就跳过
node scripts/generate-cet46-books.mjs         # 只有改过词单快照、要重生成四六级两本时才需要
node scripts/verify-wordbank-loading.mjs      # 运行时集成：真跑 loadCore/loadDetail/applyDetail
node scripts/verify-char-hygiene.mjs          # 坏字符零残留（U+FFFD + PUA；净化脚本覆盖词库+词典）
node scripts/verify-wordbank-split.mjs --baseline /tmp/wb.json    # 基线（拆分前后都能采）
node scripts/verify-wordbank-split.mjs --check  /tmp/wb.json
```

任何词库**生成器**都会重新写出"全字段主文件"，所以生成之后必须再跑一次拆分。

`verify-wordbank-split` 的基线语义（2026-09-29 重做过）：基线取"当前数据里最权威的那个来源"（有 `hasCollocations` 标记用标记，否则用核心数组），所以**任何时刻都能重建**；同时把「标记 ↔ detail 真值」的分歧清单钉进基线并逐条比对 —— 现有 3 条历史分歧（postgraduate 的 `transistor` ×2、advanced 的 `dexterity`），根因是**同级重复词条在按词键控的 detail 映射里只能留一份**；四六级两本新书分歧为 0。多一条、少一条、换了谁都是红。

## 注意事项速查

| 症状 | 原因 | 位置 |
|---|---|---|
| 详情面板空白、无报错 | `loadLevel` 里 `try{loadDetail}catch{}` 静默吞错 | `wordbank.ts:277` |
| 空白后原地重试无效 | JS 模块表缓存了失败的 import，再 `import` 同一 specifier 不会重新求值 → UI 只能给"刷新页面" | `GlobalWordSearch.tsx:121-123` |
| 死循环重试 | 只看 `examples.length` 判断"没加载好"，而有些词本来就没例句 → 每 tick 重试。必须用 `isDetailReady` | `QuickCardMode.tsx:313-319` |
| 池子随加载顺序变 | 用了单个跨等级 `seen` | `wordbank.ts:101-137` |
| 词书写 X 但只出 Y 张卡 | 显示数填了词条数而非去重词数 | `meta.ts:8-11` |
| 第一个等级没 detail | `levels.map(loadLevel)` | `wordbank.ts:299-303` |
| 加载词书卡一下 | 每次冷加载多付一次几 MB 同步 stringify | `wordbank.ts:63-86` |
| 拆分后 detail 与展示词条错配 / TS1117 | 拆分脚本的去重规则与 `ensureIndexes` 不一致 | `split-wordbank-detail.mjs:83-105` |
| 中文注释里出现 "?" 未知图标 / 翻译里有 `???` | 数据里混进私用区 PUA（U+E000–F8FF，无字形）或 U+FFFD（丢字） | `clean-wordbank-mojibake.mjs` 清理 + **递增 `CACHE_VERSION`**（见「坏字符清理」） |
