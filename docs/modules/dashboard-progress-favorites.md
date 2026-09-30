# 首页 / 学习记录 / 收藏 / 备份

> 四个"围绕其它模块"的页面：`DashboardPage`（430 行 + 9 个子组件）、`ProgressPage`（1110 行 + 2 个子组件）、`FavoritesPage`（342 行），加上数据底座 `use-favorites.ts` / `backup.ts` / `use-achievements.ts`。

## 1. 首页 `/`

无模块 key（不参与 `moduleProgress`）。组成：`HeroCard` + `KpiCard` + `ProgressCard`/`RingProgress` + `ModuleProgressCard` + `QuickStartGrid` + `DailySentenceCard` + `HistoryCalendar`。

**每日一句（daily chunk）**：

| key | 位置 | 内容 |
|-----|------|------|
| `__nativethink_daily_chunk` | `:66` 读 / `:76` 写 | `{date, chunk}`，按本地日期换 |
| `__nativethink_daily_history` | `:100` 读 / `:91`、`:138` 写 | 生成过的语块，`id: ai_<ts>` |
| `__nativethink_last_visit` | `:249` | 上次访问（回访问候/断点提示） |
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

## 4. 备份与恢复（`src/lib/backup.ts`）

`IBackupFile = { app:'NativeThink', version:2, exportedAt, data, idb? }`：

- `exportBackup()`：扫 `localStorage` 里带 safeStorage 前缀的键，**剥掉前缀**存进 `data`（`:33-38`）；IDB 上限 40MB（`IDB_LIMIT_BYTES :28`）。
- `importBackup()`：校验 `app` 字段后逐键 `safeStorage.setItem`（`:87-96`），**单键失败不阻断整体**；`idb` 部分逐键 `idbSet`。
- UI 在 `ProgressPage.tsx:286-310`，导出提示会带「+ N 份翻译缓存」，`idbCount` 为 0 时**自动省略**该短语（`:297`）—— 所以界面不会说谎，见下面第 4 条。

## 5. 注意事项

1. ~~**首页的 AI 生成把「服务不可用」报成「格式异常」**，而且走禁用的贪婪正则~~（**已修 2026-09-30**）：现在先判 `!result.trim()` 给「AI 服务暂不可用」，解析走 `extractJson`。顺带把 `category` / `difficulty` 夹到 `IChunk` 的取值域 —— 原先 `parsed.category || 'daily'` 会把模型随口返回的陌生值原样存进每日一句与历史，取色/标签处按联合类型查表会拿到 undefined。守卫：`npm run verify:ai-parse`（全仓 24 个解析点，带元判据固件）。
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
