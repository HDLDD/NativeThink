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

1. **下行会把刚下载的数据原样再推回去**（回声）。`registerCloudWrite()` 在 `CloudSyncProvider.tsx:24` **同步**注册，而 `syncDown` 的 `:79` 在其之后异步执行 → 每一个下载键都触发双写处理器 → 进 `pendingRef` → 3 秒后再 POST 回云端。代码里**没有任何抑制回声/去重/版本号标记**。配合 5 分钟轮询，登录后即使什么都没做，也会周期性地把全量数据下载再上传一遍。
2. **下行后大部分 hook 仍持陈旧内存态**：`nativethink-sync-down` 的订阅者实测**只有 3 个** —— `use-favorites.ts:53`、`use-learning-stats.ts:204`、`use-spelling-sentences.ts:41`。未订阅且会读到旧内存值的包括：`use-word-learning`、`use-phrase-learning`、`use-spelling-learning`、`use-sentence-review`、`custom-words`、`quickcard-history`、`word-notes`、`use-achievements`、`use-custom-scenarios`、`tts-settings`、`capped-cache`/`colloc-ai-cache`、`reader-highlight`、`services/ai-config`。表现：**A 设备改了，B 设备要重开页面才看到**；更糟的是 B 设备那个陈旧实例一有写入，就把刚拉下来的新值覆盖回去。
3. **同步失败完全静默**。`use-cloud-sync.ts:31/66/85` 三个 `catch` 是空实现，该文件与 `CloudSyncProvider.tsx` 都没有 import `toast`（实测 grep 计数 0）。`syncing` / `lastSync` 虽然 return 了（`:117`），但**没有任何组件消费**（grep `.tsx` 无命中）→ 没有状态 UI。唯一的"同步"字样提示是 `AuthDialog.tsx:34/37` 的「登录成功！数据已同步」—— 那是乐观文案，不代表同步成功。**全站已经有了 `<Toaster />`（`src/index.tsx:93-98`）之后，这里补提示的成本已经降到一行**，但仍然没补。
4. **KV 是全量覆盖式写入**，没有冲突解决：后写的值赢。跨设备并行学习会丢一边。
5. **API Key 故意不上云**：`services/ai-config.ts` 用 7 处裸 `localStorage`（`ai_key_<provider>` / `ai_active_provider`），不经 `safeStorage` → 不进双写、不进全量扫描。换设备要重新配 Key，这是预期行为，别"顺手"迁到 safeStorage。
6. **IndexedDB 里的东西一概不同步**：词库缓存、书籍全文解析、整书译文（`booktrans-*`）、TTS 结果。换设备后背单词进度能同步，但已经翻过的书要重新联网/重新解析，译好的整本书要重翻。
7. **重装 APK 可能清掉 localStorage**（某些 ROM 的 WebView 行为）。同步是主要防线，但前提是用户**登录了**；没登录时只有「学习记录 → 导出」。
8. **`functions/api/debug/` 是空目录**，别以为那里有什么调试端点。
9. 账号侧的 JWT/加密在 `functions/_lib/{auth,jwt,crypto}.js`，`api-client.ts:31-45,62-77` 会把服务端 500/超时翻成友好文案 —— 然后被上面第 3 条的那些空 `catch` 吞掉。
