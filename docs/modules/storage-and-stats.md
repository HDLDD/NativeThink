# 存储与学习统计

> 本项目**没有后端业务库**：所有用户数据在设备本机（localStorage + IndexedDB），网页与 APK 都不写系统目录。这一篇是所有模块文档的底座 —— 改任何持久化之前先读这里。

## 1. 四套存储，各自适用场景

| 机制 | 模块 | 用于 |
|------|------|------|
| `safeStorage` | `src/lib/safe-storage.ts`（209 行） | 带用户前缀的 localStorage 封装，绝大多数业务键 |
| 裸 `localStorage` | 各处直接调用 | **用户学习数据**（AGENTS.md 明确认可，理由见 §3.2） |
| IndexedDB | `src/lib/idb.ts`（140 行） | 大容量：词库缓存、书籍全文、译文、TTS 模型状态 |
| `capped-cache` | `src/lib/capped-cache.ts`（53 行） | 按词/按条累积的 JSON 缓存，FIFO 封顶 |

`usePageMemory`（`src/lib/use-page-memory.ts`）是 tab/筛选/滚动位置的统一记忆，底层也是 `safeStorage`，但**键是裸短名**（如 `'writing-prompt-tab'`）。

## 2. 实现方法

### 2.1 safeStorage 的键格式与自愈

```
平台内：  __miaoda_<appId>_<userId>__:<key>          （safe-storage.ts:98）
独立运行：__miaoda___global____<anonId>__:<key>      （appId 缺省 '__global__' :88）
```

- `appId` 取 `window.appId`，`userId` 依次试 `window._userInfo.user_id` → `window.__PLATFORM_USER__.user_id` → **兜底 anonId**（`:70-81`）。
- anonId 存在引导键 `__miaoda_anon_id_v1`。
- **自愈**（`:27-44`）：引导键丢了但带前缀的数据还在时，从既有键名里反解出 `anon_…` 恢复，否则新生成的 ID 会让所有历史数据"隐身"（看起来像丢数据）。场景：用户清了部分 localStorage、或导入备份后首次打开。
- **前缀会被缓存**：`_prefix` 一旦算出整会话不变（`:93-100`）。
- 老键迁移：`tryMigrate` 支持从旧格式 `__miaoda_<appId>__:<key>` 搬过来，并用 `_migratedKeys` 去重避免重复检查（`:123-140`）。

### 2.2 学习统计

`src/lib/use-learning-stats.ts`（326 行）：

| key | 内容 |
|-----|------|
| `__nativethink_learning_stats` | `ILearningStats`（`todayMinutes` / `streakDays` / `lastStudyDate` / `totalDays` / `dailyGoalMinutes` / `moduleProgress`） |
| `__nativethink_calendar` | `[{date, checkedIn, minutes, modules[]}]` |

- **以 localStorage 为权威源**：`addStudyMinutes` 先 `readStatsFromStorage()` 拿 base 再叠加（`:244-246`），因为多组件实例的本地 state 可能过期；写完 `notifyChanged` 广播（`:278`）。
- 跨实例同步：`STATS_CHANGED_EVENT = 'nativethink-stats-changed'`、`CALENDAR_CHANGED_EVENT = 'nativethink-calendar-changed'`（`:9-10`），hook 内已订阅并重读（`:212-216`），带防回环（重读回来的同内容不回写）。还订阅 `visibilitychange` 检查（`:169`）与 `nativethink-sync-down`（`:204`）。
- `addStudyMinutes(minutes, moduleKey)` 的真实语义（`:266-271`）：`moduleProgress[key] += minutes * 0.5`，**上限 100**；`todayMinutes` 与日历按原值累加。
- 跨零点：`lastStudyDate !== today` 时 `todayMinutes` 归零、`streakDays` 只在"昨天也学过"时 +1 否则重置为 1、`totalDays + 1`（`:249-260`）。
- 日期一律 `formatDate()`（本地日期，`:243`）。

### 2.3 capped-cache 的规则

- `cappedPut(obj, key, value, max)` 是**纯函数**，不落盘 —— 落盘交给调用方的 persist effect。原因写在注释里：StrictMode 下 updater 会被调用两次，在里面写副作用等于写两遍（`:32-35`）。
- **FIFO 而非 LRU**：对象键序 = 插入序，淘汰零成本；这些缓存本来就是"翻到的词才有价值"的积累型数据（`:8-10`）。
- **键必须是非纯数字字符串**：纯数字键在 JS 对象里按数值排最前，会破坏插入序淘汰（`:11-13`）。
- `migrateStorageKey(oldKey, newKey)` 提供一次性键搬家，新键已有数据时不动（`:44-53`）。

### 2.4 IndexedDB

`src/lib/idb.ts` 提供 `idbGet/idbSet/idbDelete`，单一 `wordbank` KV store（键名任意复用，例如词库缓存 `wb-<level>`、书籍译文 `booktrans-<id>-ch<n>`、书籍全文 `book-full-v2-<gutenbergId>`）。

词库侧的策略是 **IndexedDB 为主、localStorage 为兜底**：`saveToCache` 先 `idbSet`，只有在 IDB 抛错时才镜像进 localStorage（`wordbank.ts`），避免同一份数据写两遍挤爆配额。

## 3. 注意事项

### 3.1 日期

**禁止 `toISOString().slice(0,10)`** —— 东八区凌晨会错一天，日历和连续天数都会算错。统一用 `formatDate()`。

### 3.2 学习数据实际都走 `safeStorage`

AGENTS.md **旧版**坑表里那句「用户学习数据用原生 `localStorage` 或带事件同步的 hook」是与现状不符的旧建议（2026-09-29 改造索引时已把这条改成"新键先决定走哪一侧"）。实测：`use-learning-stats` `use-word-learning` `use-spelling-learning` `use-favorites` `quickcard-history` `custom-words` `word-notes` `use-sentence-review` `tts-settings` `reader-highlight` **全部走 `safeStorage`**（各自 `grep -c 'safeStorage\.'` ≥ 2，裸 `localStorage` 为 0）。"带事件同步"那半句仍然成立，而且正是进度不丢的机制（§2.2）。

真正要防的是**前缀变化**：`getUserId()` 在平台 user 出现后会变（`:66-82`），而 `_prefix` 一算出就缓存整会话（`:94-100`）→ 会话中途登录，前缀仍是旧的，看起来"记忆丢失"。已有的两道缓解都有限：`tryMigrate` 只搬旧格式 `__miaoda_<appId>__:`（`:123-140`），`recoverAnonIdFromStorage` 只匹配 `__global__` 标记（`:31-44`），**平台登录态（带真实 appId/userId）的前缀不在恢复范围内**。新增用户数据键时优先想清楚它挂在哪一侧，不要指望迁移。

### 3.3 `moduleProgress` 的键必须与 `MODULES[].key` 一一对应

`addStudyMinutes` 里那句 `if (modKey in newStats.moduleProgress)`（`:267`）意味着 **写一个不存在的 key 会静默什么都不发生** —— 不报错、不进进度环。这正是坑表里「进度环 NaN / 0%」的来源。新增模块时四处同步：`src/app.tsx` 路由+lazy → `AppSidebar.tsx` 的 `NAV_ITEMS`+`ROUTE_PREFETCH` → `DashboardPage/constants.ts` 的 `MODULES` → `use-learning-stats.ts` 的 `ILearningStats.moduleProgress` 类型。

### 3.4 云同步：两条上行路径的口径不一致（重要）

`use-cloud-sync.ts` 里 `DATA_PREFIX = '__nativethink_'`（`:8`）**只在 `syncUp` 的全量扫描里生效**（`:55`）。而登录后的 `registerCloudWrite()`（`:91-105`）注册的是 `safeStorage` 的双写处理器：

```
safeStorage.setItem(key, value)            // safe-storage.ts:168-178
  └─ if (_cloudSyncHandler) _cloudSyncHandler(key, value)   ← 没有任何前缀过滤
       └─ pendingRef[key] = value → 3s 防抖 flushPending → POST /api/data/sync
```

所以真实规则是：

| 键 | 写入方式 | 增量双写（登录后） | `syncUp` 全量扫描 |
|----|---------|------------------|------------------|
| `__nativethink_*` | `safeStorage` | ✅ 上行 | ✅ 上行 |
| `__reader_progress_*` / `__reader_trans_*` / `__reader_lookup_recent` | `safeStorage` | ✅ **照样上行** | ❌ 被前缀过滤掉 |
| `usePageMemory` 裸短名（`'writing-prompt-tab'`…） | `safeStorage` | ✅ **照样上行** | ❌ 被过滤掉 |
| 裸 `localStorage` | 不经 safeStorage | ❌ 完全不同步 | ❌ 不同步 |
| IndexedDB（词库缓存、书籍全文、译文） | 不经 localStorage | ❌ 完全不同步 | ❌ 不同步 |

**别把"没加 `__nativethink_` 前缀"当成"不会上云"** —— 只要走 `safeStorage`，登录后就会推上去；前缀只影响全量补推。真正的隐私/容量边界是"是否经过 safeStorage"。

现存裸 `localStorage` 只有三类，改它们等于改同步边界，要三思：① `use-favorites.ts:21,26` 的旧键迁移（读一次就删）；② `services/ai-config.ts` 的 7 处 —— **用户 API Key 存裸 localStorage，因此不上云，这是有意的**；③ 词库缓存的 IDB 失败兜底（`wordbank.ts`）。

真正不上云的只有下面两类，**跟键名前缀无关**：

- **裸 `localStorage`**（不经 safeStorage 就触发不了双写）。实测逐条核到行的清单：`ChunkTrainingPage.tsx:139,149` 的 `__nativethink_chunk_position`（语块阅读位置）；`CollocationsTab.tsx:138,151,154` 的 `__nativethink_colloc_state` 与 `:183,324` 的 `__nativethink_colloc_scroll`（搭配浏览状态/滚动）；`wordbank.ts:477` 与 `DeepVocabularyPage.tsx:322,328` 的 `__nativethink_level_memory`；`services/ai-config.ts` 的 7 处（**API Key 因此不上云，这是有意的**）；`use-favorites.ts:21,26` 的旧键迁移；以及 `ProgressPage.tsx:128-134,154-155`（导出/重置按前缀扫全量）、`backup.ts`、`api-client.ts`、`local-llm.ts`、`local-mt.ts`、`WordImage.tsx`。
- **IndexedDB**：词库缓存、书籍全文解析、整书译文（`booktrans-*`）、TTS 结果。

**核心学习数据其实是同步的**：`use-word-learning`（SM-2 进度与 `__nativethink_vocab_session_<level>` 断点，`:144`）、`DailyLearningMode.tsx:807` 的 `__nativethink_daily_session_<level>`、`QuickCardMode.tsx:84,89,277,473`、`CollocationsTab.tsx:191,204,213,223` 的 memorized 集合 —— 都走 `safeStorage`。不上云的那批基本都是**滚动位置、浏览状态、设置开关**这一类。所以"换设备进度没了"通常不是进度没同步，而是 §3.2 的前缀变化或 §3.5 之外的陈旧内存态（见 `docs/modules/cloud-sync.md`）。

### 3.5 断点续学键按（模式, level）分

约定格式 `__nativethink_<模式>_session_<level>`：`vocab_session`（复习检测）、`daily_session`（每日学习）、`quickcard_session`（快速闪卡）、`chunk_review_session`（语块复习）。历史事故：切词书时同帧"新 level + 旧队列"先于重建落盘，把另一本书的断点覆盖了。修法是分键 + 落盘前校验队列归属。

**已知不符合约定的两处**：句子拼写用单个全局键 `__nativethink_spelling_resume` 存 `{activeLevel, currentIndex}`（`SpellingPage.tsx:967-987`），只能记住一本的位置；详见 `docs/modules/spelling.md`。

### 3.6 按词累积的缓存一律走 `capped-cache`

以前 AI 例句/搭配翻译/深度解析只增不减，重度使用把 localStorage 撑爆，**写入失败后整份缓存静默丢失**。新缓存必须封顶；落盘放 persist effect，updater 保持纯。

**仍在封顶之外的累积点**（本次文档盘点发现，供后续收敛）：`__nativethink_custom_prompts`（写作 AI 题，整份 JSON 每次变化重写）、`__nativethink_writing_history`（只有 `slice(-50)`，无键级上限）、`__nativethink_spelling_sentences`（AI 批量句子无上限）。

### 3.7 组件卸载会带走 state

切 tab 会卸载组件，state 随之消失。任何"用户学到了第几题/哪本书"都必须显式持久化 + 挂载后恢复，别指望组件内存。参考 `quickcard-history.ts` 与 `FlashcardMode` 的 `saveSession`。

### 3.8 长任务结束时不要用点击时的陈旧快照回写

合并必须用 `setX((prev) => ...)` 函数式；并且长任务要与其它写路径互斥（守卫标志位）。参考 AGENTS.md 坑表与 `QuickCardMode.scheduleRelearn`。

### 3.9 重装 APK 可能清掉 localStorage

某些 ROM 上 WebView 的 localStorage 会随应用更新被清。**重装前用「学习记录 → 导出」备份**，重要数据走云同步。这条要写进用户可见的说明，不是只在文档里。
