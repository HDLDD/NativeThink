# 首页 / 学习记录 / 收藏 / 备份

> 四个"围绕其它模块"的页面：`DashboardPage`（430 行 + 9 个子组件）、`ProgressPage`（1110 行 + 2 个子组件）、`FavoritesPage`（342 行），加上数据底座 `use-favorites.ts` / `backup.ts` / `use-achievements.ts`。

## 1. 首页 `/`

无模块 key（不参与 `moduleProgress`）。组成：`HeroCard` + `KpiCard` + `ProgressCard`/`RingProgress` + `ModuleProgressCard` + `QuickStartGrid` + `DailySentenceCard` + `HistoryCalendar`，外加 2026-10-10 新增的 `ReviewDueCard` + `WeekGlanceCard`。

**今日待复习（`ReviewDueCard.tsx`）**：横幅复用侧边栏角标同一数据源 `useGlobalDueCount`（`DashboardPage.tsx:18,51,336` 直扫 SM-2 存储，不挂完整学习状态实例）。**口径：`dueCount <= 0` 时整卡 `return null`（`ReviewDueCard.tsx:17`）**—— 没有复习义务就不渲染"已清零"占位卡；点击进 `/vocabulary`。外层行 gate 是 `(lastVisit || dueCount > 0)`（`DashboardPage.tsx:319`），两卡都空时整行不占位。

**本周学习概览（`WeekGlanceCard.tsx`）**：`calendar`（`__nativethink_calendar`，`useLearningStats` 直接暴露）取近 7 个自然日分钟画柱状 + 周合计/打卡天数/达标天数，点击进 `/progress`（`:405` 接线）。**日期一律 `formatDate` 循环生成再按字符串查表（`:26-29`）**—— 不能 `slice(-7)` 取数组尾：calendar 只在跨出 31 天窗口后才 push 新条目，跨天当天没学习时尾部是昨天，柱状会整体错位一天。柱状容器 `h-28` 固定高度（`:69`），标题/柱/星期三层不互压。守卫 `npm run verify-dashboard-glance`（16 断言，变异 5 条）。

**每日一句（daily chunk）**：

| key | 位置 | 内容 |
|-----|------|------|
| `__nativethink_daily_chunk` | `:66` 读 / `:76` 写 | `{date, chunk}`，按本地日期换 |
| `__nativethink_daily_history` | `:100` 读 / `:91`、`:138` 写 | 生成过的语块，`id: ai_<ts>` |
| `__nativethink_last_visit` | `:249` | 上次访问（回访问候/断点提示）。**「继续上次学习」的 labels 表（`DashboardPage.tsx:277-289`）是"路径 → 文案"的穷举映射，不在新增页面六件套里** —— 每上一个新路由要补一行，漏了该页访问后续学条静默不出现（`/sentences` 真实漏过，2026-10-10 补上，守卫 `verify-dashboard-glance` ① 钉住） |
| `__nativethink_achievements` | `use-achievements.ts:5,121,135` | 成就解锁列表 |

AI 生成：`aiChat`（`:154`），system 要求**只返回一个 JSON 对象**（`{content, meaning, example, exampleZh, category, difficulty}`）。

**进度环**：`RingProgress.tsx:15` `const safeValue = Number.isFinite(value) ? value : 0;` —— 非法值回退 0，这就是坑表里「进度环 NaN」的兜底位置。

## 2. 学习记录 `/progress`

图表 + 各模块分项重置 + 导出/恢复。

- `ProgressCharts.tsx:33-42` `MODULE_COLORS`、`:44-53` `MODULE_NAMES`：颜色**按 key 取**（此前按下标对位数组，错位且 conversation/spelling 同为 `#F59E0B`，饼图图例无法区分 —— 注释 `:31-32`）。缺 key 时回落灰 `#94A3B8` / 回落 key 名，**不报错**。
- 重置是分类型的：学习统计 `:111`、句子拼写 `:119`、阅读 `:124-143`、词汇 `:174`、按词书 `:200`、短语库 `:208`、全部 `:277`。多数提示带「刷新页面后生效」—— 因为这些模块的 hook 不在本页，内存态还在（见 `cloud-sync.md` 的陈旧内存态问题）。
- `FavoriteReviewMode.tsx`（460 行）：收藏的复习模式，也在这里。

## 3. 收藏 `/favorites`

`use-favorites.ts`：

```
FAVORITES_KEY   = __nativethink_favorites        （safeStorage，会同步）
LEGACY_KEY      = __nativethink_favorites_v2     （裸 localStorage，读一次即删 :21,26）
```

- 类型联合 9 个：`chunk | expression | vocabulary | think | shadowing | word | article | writing_prompt | spelling`（`:10`）。
- **去重口径 = `content + type` 相同即拒**（`:77`）。所以写作题收藏的是 `title`、句子学习收藏的是 `item.en`、句型收藏的是 `'模式:' + id`、造句收藏的是用户自己写的原文 —— **同一句英文在不同模块会产生不同条目**（`type` 不同），而 `type` 相同时靠 `content` 判重。
- 跨实例广播 `nativethink-favorites-changed`（`:60,70`），并且它**是三个订阅 `nativethink-sync-down` 的 hook 之一**（`:53`）。
- `clearAll()` 是一次 `persist([])`，注释写明原因：「循环调 `removeFavorite` 会因陈旧闭包只删掉最后一条（ProgressPage 重置踩过）」（`:96-99`）。


### 表达纠偏本（2026-10-16 新增，`src/lib/correction-notes.ts`）

键 `__nativethink_correction_notes`（上限 200，**appendCapped 只拒绝新增、绝不裁剪** —— 用户练习产物不可重算）。AI 判定"你说得不地道"的表达自动收集，三个完成点各喂各的 Markdown 表格：思维检测 detector（`Chinglish Expression | Natural English | Notes`）、写作批改（`Original | Correction | Explanation`，**错=对的噪声行跳过**）、对话分析（`我的表达 | 中文翻译 | 更地道的说法 | 原因分析` 四列，中文进 `chineseHint`）。共用纯函数 `parseMarkdownTables`（表头/分隔行不进数据、无表返空），守卫 `verify-correction-notes`(46) 转译真跑三源样本 + **store 整段真跑**（去重/记账/删除/填满上限只拒不裁/落盘失败可见）。收藏页顶部区块回看：默认 6 条折叠 + 来源标签 + 逐条删除（误判有出口）；收集路径零 toast。云同步/备份按 `__nativethink_` 前缀整片覆盖，新键零成本继承。写盘失败必须可见（`safeStorage` 配额满返回 false 不抛错，教训见 vocabulary.md 收藏一节）。

**二期（2026-10-16 已做）**：条目变成主动提取题 —— 词汇页**第 9 模式「纠偏重考」**（`CorrectionDrillMode.tsx`，四选一，题干用 `chineseHint`、答案用 `right`、干扰项取其它条目的 `right`）。条目多一个可选 `review: { lastAt, correct, wrong }`，`recordCorrectionReview` 记账、`orderForDrill` 按「没考过 → 最久没练 → 错得多」排队；**不写 SM-2**（句子不是词书词条），细节与行号见 [词汇深度](./vocabulary.md) 的「纠偏重考」一节。

## 4. 备份与恢复（`src/lib/backup.ts`）

`IBackupFile = { app:'NativeThink', version:2, exportedAt, data, idb? }`：

- `exportBackup()`：扫 `localStorage` 里带 safeStorage 前缀的键，**剥掉前缀**存进 `data`（`:33-38`）；IDB 上限 40MB（`IDB_LIMIT_BYTES :28`）。
- `importBackup()`：校验 `app` 字段后逐键 `safeStorage.setItem`（`:87-96`），**单键失败不阻断整体**；`idb` 部分逐键 `idbSet`。
- UI 在 `ProgressPage.tsx:286-310`，导出提示会带「+ N 份翻译缓存」，`idbCount` 为 0 时**自动省略**该短语（`:297`）—— 所以界面不会说谎，见下面第 4 条。

## 5. 注意事项

1. ~~**首页的 AI 生成把「服务不可用」报成「格式异常」**，而且走禁用的贪婪正则~~（**已修 2026-09-30**）：现在先判 `!result.trim()` 给「AI 服务暂不可用」，解析走 `extractJson`。顺带把 `category` / `difficulty` 夹到 `IChunk` 的取值域 —— 原先 `parsed.category || 'daily'` 会把模型随口返回的陌生值原样存进每日一句与历史，取色/标签处按联合类型查表会拿到 undefined。守卫：`npm run verify:ai-parse`（全仓 25 个解析点，带元判据固件）。
2. **`MODULES` / `MODULE_COLORS` / `MODULE_NAMES` / `MODULE_PROGRESS_KEYS` 四份清单要靠人对齐**，其中 `MODULE_PROGRESS_KEYS`（`use-learning-stats.ts:70-80`）是白名单投影，漏了它新模块的进度会被 `mergeStats` **静默丢弃**。详见 `shell-and-navigation.md` §4。
3. **重置类操作分模块、且大多要刷新才生效**。加新重置项时照 `handleResetReading` 的做法：先按 `localStorage` 键名扫一遍（`:128-133`，注意它匹配的是**含前缀的完整键名**，用 `k.includes(...)` / `k.endsWith(...)`），再单独处理 IndexedDB。
4. ~~**【已确认缺陷】备份从来不含整书翻译缓存**~~ → **【已修，2026-09-30】** 留档备查：`exportBackup()` 原先这样找章节：

   ```
   for (const k of Object.keys(data)) {            // data = localStorage 里带前缀的应用键
     if (k.startsWith('booktrans-') && k.endsWith('-index')) manifestKeys.push(k);
   }
   ```

   `booktrans-*` **只存在于 IndexedDB**，所以 `manifestKeys` 恒空 → `idb` 恒 `undefined`、`idbCount` 恒 0，`idb.ts` 也没有枚举键的 API（只有 `idbGet/idbSet/idbDelete/idbHas/idbClear`）。

   现在的形态：`book-translation.ts` 新增 `dumpBookTranslationCache(bookId, maxBytes)`（**键格式知识留在拥有它的模块里**，按 manifest 登记的章节导出，含清单键本身）；`backup.ts` 用 `BOOK_META` + `loadImportedBooks()` 拿到随包 22 本与用户导入书的 id，逐本导出，累计到 `IDB_LIMIT_BYTES` 就停并如实标 `idbSkipped`。
   **守卫：`npm run verify:backup-idb`（16 断言）** —— A 段用忠实 IDB 替身真跑导出函数（有缓存/无缓存/超上限/跨书隔离），并带"旧枚举方式在同一数据下拿到 0 个键"的正对照；B 段静态守接线，变异实测：把 IDB 分支改回旧的 `Object.keys(data)` 枚举会红 5 条。
5. **`importBackup` 会覆盖同键**且不校验 `version`，也没有"合并"语义：拿旧备份恢复会把新进度回退。恢复前 UI 应该提示这一点。
6. **收藏的判重是 `content + type`**，所以想给同一句英文做"跨模块统一收藏"需要显式设计，不是把 `type` 改一改就能合并 —— 历史数据已经按 type 分开了。
7. **`use-achievements` 只在自身文件里读写**（`:5,121,135`），不订阅 `nativethink-sync-down`（订阅者只有 3 个，见 `cloud-sync.md`）→ 云同步下来的新成就要点开首页才重算。
