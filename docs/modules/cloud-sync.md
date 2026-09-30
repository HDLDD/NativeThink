# 云同步与账号

> 唯一目的：**登录用户换设备/重装 APK 时不至于从零开始**。代码一共三处：`src/lib/use-cloud-sync.ts`（120 行）、`src/components/CloudSyncProvider.tsx`（58 行）、`src/lib/safe-storage.ts` 的双写钩子。
> 后端是 `functions/api/data/sync.js` + Cloudflare KV（`functions/_lib/kv.js`），账号是 `functions/api/auth/{login,register,me}.js`。

## 1. 实现方法

### 1.1 三条触发路径

`CloudSyncProvider.tsx`：

| 时机 | 动作 | 行号 |
|------|------|------|
| 登录态变 true | `syncDown().then(() => { syncUp(); })` + `registerCloudWrite()` | `:18-26` |
| 每 5 分钟 | `syncDown().then(() => { syncUp(); })` | `:30-40` |
| 页面重新可见 | 只 `syncDown()`，60s 节流 | `:43-56` |

顺序是刻意的：先拉再推，避免双写把更新云端数据盖掉（`:19` 注释）。

### 1.2 两条上行通道，口径不同（最容易踩的地方）

```
A. 增量双写：safeStorage.setItem → _cloudSyncHandler(key, value) → pendingRef → 3s 防抖 POST
   （safe-storage.ts:170-177 → use-cloud-sync.ts:91-105 → flushPending :21-39）
   ↑ 不挑键名，任何经 safeStorage 的写入都会上云

B. 全量补推：syncUp 扫 localStorage，两道过滤
   （use-cloud-sync.ts:47-59）
     if (!rawKey?.startsWith(prefix)) continue;        // 只扫本用户前缀
     if (!appKey.startsWith(DATA_PREFIX)) continue;    // 只收 __nativethink_
```

所以「`__nativethink_` 前缀 = 会同步」这个说法**只对 B 成立**。判断一个键会不会上云，要问的是"它是不是经 `safeStorage` 写的"，而不是"它有没有那个前缀"。

`DATA_PREFIX = '__nativethink_'`（`:8`）。

### 1.3 下行

`syncDown`（`:68-87`）：GET `/api/data/sync` → 对每个键 `safeStorage.setItem(key, value)`（`:79`）→ 派发 `nativethink-sync-down`（`:84`）。

### 1.4 离线与重试

`flushPending` 的 `catch` 把 `upserts`/`deletes` 合并回 pending 等下次重试，并处理"删了又写回"的抵消（`:31-38`）。防抖 3000ms（`:103`）。

### 1.5 anonId 与键前缀

见 `docs/modules/storage-and-stats.md` §2.1：`__miaoda_<appId>_<userId>__:<key>`，userId 兜底 anonId，引导键 `__miaoda_anon_id_v1` 丢了能从既有键名反解恢复（`safe-storage.ts:31-46`）；前缀缓存整会话不变（`:94-100`）。

## 2. 注意事项

1. ~~**下行会把刚下载的数据原样再推回去**（回声）~~ → **【已修，2026-09-30】** 留档备查：`registerCloudWrite()` 在 `CloudSyncProvider.tsx:24` **同步**注册，而 `syncDown` 的 `safeStorage.setItem` 在其之后异步执行，于是每个下载键都触发双写处理器 → 进 `pendingRef` → 3 秒后再 POST 回云端。现在 `syncDown` 用 `applyingRemoteRef` + `try/finally` 包住落地循环，处理器开头 `if (applyingRemoteRef.current) return;` 跳过。守卫：`npm run verify:cloud-sync`（18 断言，A 段真跑：下载后 0 次 POST、同键在本地再写一次必须 1 次 POST 作正对照；变异实测删掉守卫行 → 行为断言立刻红）。
2. ~~**下行后大部分 hook 仍持陈旧内存态**~~（**已修 2026-09-30**）：订阅收成单一出口 `src/lib/sync-down.ts`（`SYNC_DOWN_EVENT` 只在这里定义一次，`onSyncDown(cb, target?)` 是可注入 target 的纯订阅、能在 Node 里真跑，`useSyncDown(cb)` 是它的 hook 壳；`syncDown` 落地后调 `emitSyncDown()`，不再有任何文件自己拼事件名）。现有 **7 个订阅者**：`use-favorites.ts:52`、`use-learning-stats.ts:203`、`use-spelling-sentences.ts:51`、`use-word-learning.ts:301`、`use-phrase-learning.ts:135`、`custom-words.ts:94`、`word-notes.ts:63`。
   **仍未订阅**（读到旧内存态的候选，按需再补）：`use-sentence-review`、`use-spelling-learning`、`quickcard-history`、`use-achievements`、`use-custom-scenarios`、`tts-settings`、`services/ai-config` —— 它们要么只在挂载时读一次、要么写的键本来就不需要同步这台设备的实时视图。
   **回声写**也要防：SM-2 与语块进度都有"state 变了就回写 storage"的 effect，下行重读会让它原样再写一遍 → 登录后被双写 POST 回云端。两道判据都在：① 下行回调把刚读进来的对象引用记进 `loadedFromStorageRef`，回写 effect 见到同一引用就跳过；② `saveState` 里序列化结果与存储一字不差也不写。实测（真浏览器 + localStorage 记账替身）只靠 ② 是不够的 —— `loadState` 会补齐缺省字段，重串出来的字节可能与存储不同，①才是主力。证据：`verify-cloud-sync` ④ 43 条断言（含用假 target 真跑 `onSyncDown` 的通知/退订/异常隔离），10 条变异全红；无头 Chrome 12 项验收（改 storage + 派发事件 → 界面「N 个到期」不刷新就跟着变，且该键零次回写，另有"记账替身确实记得到一次写入"的正对照）。
3. ~~**同步失败完全静默**~~ → **【已修，2026-09-30】**：`flushPending` 与 `syncUp` 失败给「云同步暂未成功，数据已保存在本机并会自动重试」，`syncDown` 失败给「云端数据暂未取回，本机数据不受影响」，下行单项写入失败（配额满）会如实说缺了几项。三类提示都按 60 秒去抖（`warnThrottled`），离线时不会变成闹钟。`syncing`/`lastSync` 仍然没有组件消费（要做状态 UI 时再用）。守卫：`verify:cloud-sync` 断言 `use-cloud-sync.ts` 里**空 catch 数为 0**。
4. ~~**周期任务无条件全量 `syncUp()`**~~ → **【已修】**：5 分钟轮询改成 `if (needsResync()) syncUp()`，只在有过失败/未落云写入时补推；**登录那一次仍然无条件全量补推**（首启要把本地既有数据填满云端）。`needsResync` 必须 `useCallback` 稳定 —— 它在 provider 的 `setInterval` 依赖数组里，内联箭头函数会让 `setSyncing` 每次 render 都重建定时器，5 分钟永远走不满（这条也有断言守着）。
5. **KV 是全量覆盖式写入**，没有冲突解决：后写的值赢。跨设备并行学习会丢一边。
6. **API Key 故意不上云**：`services/ai-config.ts` 用 7 处裸 `localStorage`（`ai_key_<provider>` / `ai_active_provider`），不经 `safeStorage` → 不进双写、不进全量扫描。换设备要重新配 Key，这是预期行为，别"顺手"迁到 safeStorage。
7. **IndexedDB 里的东西一概不同步**：词库缓存、书籍全文解析、整书译文（`booktrans-*`）、TTS 结果。换设备后背单词进度能同步，但已经翻过的书要重新联网/重新解析，译好的整本书要重翻（**导出备份现在会带上它**，见 dashboard-progress-favorites.md §5.4）。
8. **重装 APK 可能清掉 localStorage**（某些 ROM 的 WebView 行为）。同步是主要防线，但前提是用户**登录了**；没登录时只有「学习记录 → 导出」。
9. **`functions/api/debug/` 是空目录**，别以为那里有什么调试端点。
10. 账号侧的 JWT/加密在 `functions/_lib/{auth,jwt,crypto}.js`，`api-client.ts:31-45,62-77` 会把服务端 500/超时翻成友好文案 —— 然后被上面第 3 条的那些空 `catch` 吞掉。
