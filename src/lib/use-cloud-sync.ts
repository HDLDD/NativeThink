/** Bi-directional sync between localStorage and Cloudflare KV */

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from './auth-provider';
import { apiFetch } from './api-client';
import { safeStorage, setCloudSyncHandler } from './safe-storage';
import { emitSyncDown } from './sync-down';

const DATA_PREFIX = '__nativethink_';

export function useCloudSync() {
  const { isAuthenticated } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const lastSyncRef = useRef<number | null>(null);

  // Debounced dual-write: accumulate pending upserts + deletes, flush in batch
  const pendingRef = useRef<Record<string, string>>({});
  const pendingDeletesRef = useRef<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * 下行写入期间为 true。**回声就是这么产生的**：`syncDown` 用 `safeStorage.setItem`
   * 落地云端数据（:79），而 `safeStorage` 每次写入都会同步调用这里注册的双写处理器
   * （`safe-storage.ts:170-177`）→ 刚下载的值被塞进 pendingRef → 3 秒后又 POST 回云端。
   * 配合 5 分钟轮询，登录后即使什么都没做也会周期性地把全量数据来回搬一遍。
   */
  const applyingRemoteRef = useRef(false);

  /**
   * 失败提示的去抖：全站已经有 `<Toaster />`，但同步是后台行为，
   * 离线时不该每 3 秒/每分钟都弹一次 —— 同一档提示 60 秒内最多一次。
   */
  const lastWarnRef = useRef<{ up: number; down: number }>({ up: 0, down: 0 });
  /**
   * 上一次同步是否有过失败/未落云的本地写入。
   * 周期任务靠它决定要不要再做一次**全量** syncUp —— 此前每 5 分钟都无条件
   * `syncDown().then(syncUp)`，等于把整套 `__nativethink_*` 数据反复下载再整份 POST 回云端。
   */
  const needsResyncRef = useRef(false);
  const warnThrottled = (which: 'up' | 'down', message: string) => {
    const now = Date.now();
    if (now - lastWarnRef.current[which] < 60_000) return;
    lastWarnRef.current[which] = now;
    toast.warning(message, { duration: 4000 });
  };

  const needsResyncProbe = useCallback(() => needsResyncRef.current, []);

  const flushPending = useCallback(async () => {
    const upserts = { ...pendingRef.current };
    const deletes = [...pendingDeletesRef.current];
    pendingRef.current = {};
    pendingDeletesRef.current = new Set();
    if (Object.keys(upserts).length === 0 && deletes.length === 0) return;
    try {
      await apiFetch('/api/data/sync', {
        method: 'POST',
        body: JSON.stringify({ upserts, deletes }),
      });
      if (!Object.keys(pendingRef.current).length && !pendingDeletesRef.current.size) needsResyncRef.current = false;
    } catch {
      // Offline — merge back so the next flush retries (newer pending writes win)
      pendingRef.current = { ...upserts, ...pendingRef.current };
      const merged = new Set(pendingDeletesRef.current);
      deletes.forEach((k) => merged.add(k));
      // A delete followed by a re-set of the same key: keep it as an upsert only
      merged.forEach((k) => { if (k in pendingRef.current) merged.delete(k); });
      pendingDeletesRef.current = merged;
      needsResyncRef.current = true;
      // 以前这里是完全静默的（三个空 catch 之一）：数据其实还在本机、也会重试，
      // 但用户以为已经上云了。提示只说事实，不吓唬人去重试。
      warnThrottled('up', '云同步暂未成功，数据已保存在本机并会自动重试');
    }
  }, [warnThrottled]);

  // Push all localStorage data (safeStorage-scoped) to cloud
  const syncUp = useCallback(async () => {
    if (!isAuthenticated) return;
    setSyncing(true);
    try {
      const prefix = safeStorage.getPrefixedKey('');
      const upserts: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const rawKey = localStorage.key(i);
        // Only match keys under the safeStorage prefix
        if (!rawKey?.startsWith(prefix)) continue;
        const appKey = rawKey.slice(prefix.length);
        // Only sync app data (skip platform internals)
        if (!appKey.startsWith(DATA_PREFIX)) continue;
        const val = localStorage.getItem(rawKey);
        if (val) upserts[appKey] = val;
      }
      if (Object.keys(upserts).length > 0) {
        await apiFetch('/api/data/sync', {
          method: 'POST',
          body: JSON.stringify({ upserts }),
        });
      }
      lastSyncRef.current = Date.now();
      needsResyncRef.current = false;
    } catch {
      needsResyncRef.current = true;
      warnThrottled('up', '云同步暂未成功，数据已保存在本机并会自动重试');
    }
    finally { setSyncing(false); }
  }, [isAuthenticated, warnThrottled]);

  // Pull cloud data and merge into localStorage (via safeStorage for correct prefix)
  const syncDown = useCallback(async () => {
    if (!isAuthenticated) return;
    setSyncing(true);
    try {
      const res = await apiFetch('/api/data/sync');
      if (res.ok) {
        const { data } = await res.json() as { data: Record<string, string> };
        /**
         * 必须挂上回声守卫：`safeStorage.setItem` 会**同步**调用已注册的双写处理器
         * （`safe-storage.ts:170-177`）。不加守卫时，刚下载下来的每个键都会进 pendingRef，
         * 3 秒后再被 POST 回云端 —— 登录后什么都没做也会来回搬全量数据。
         */
        applyingRemoteRef.current = true;
        let dropped = 0;
        try {
          for (const [key, value] of Object.entries(data)) {
            try { safeStorage.setItem(key, value); } catch { dropped++; }
          }
        } finally {
          applyingRemoteRef.current = false;
        }
        // 单项写入失败通常是配额满 —— 不说就等于"云端都取下来了"，其实是缺了几项
        if (dropped > 0) {
          needsResyncRef.current = true;
          warnThrottled('down', `云端有 ${dropped} 项未能写入本机（存储空间可能已满）`);
        }
      }
      lastSyncRef.current = Date.now();
      // Notify data hooks that localStorage was just replaced by cloud data（事件名只在 sync-down.ts 里定义）
      emitSyncDown();
    } catch {
      // 下行失败 = "没拿到别的设备的最新数据"，本机数据不受影响
      warnThrottled('down', '云端数据暂未取回，本机数据不受影响');
    }
    finally { setSyncing(false); }
  }, [isAuthenticated, warnThrottled]);

  // Register dual-write handler: debounced batch writes to KV.
  // value === null means deletion.
  const registerCloudWrite = useCallback(() => {
    if (!isAuthenticated) return;
    setCloudSyncHandler((key: string, value: string | null) => {
      // 回声抑制：这条写入来自 syncDown 刚下载的云端数据，不能再推回云端
      if (applyingRemoteRef.current) return;
      if (value === null) {
        delete pendingRef.current[key];
        pendingDeletesRef.current.add(key);
      } else {
        pendingDeletesRef.current.delete(key);
        pendingRef.current[key] = value;
      }
      // Debounce: flush after 3s of inactivity
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(flushPending, 3000);
    });
  }, [isAuthenticated, flushPending]);

  // Unregister dual-write on logout
  const unregister = useCallback(() => {
    setCloudSyncHandler(null);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      // Flush any remaining pending writes before unregistering
      flushPending();
    }
  }, [flushPending]);

  return {
    syncUp,
    syncDown,
    registerCloudWrite,
    unregister,
    syncing,
    lastSync: lastSyncRef.current,
    /**
     * 是否有过失败或未落云的本地写入，需要再做一次全量补推。
     * 必须 useCallback 保持引用稳定：provider 把它放进 5 分钟轮询的依赖数组里，
     * 每次 render 新建函数会让 interval 被反复清掉重建（`setSyncing` 本身就会 render），
     * 结果轮询几乎永远走不到 5 分钟。
     */
    needsResync: needsResyncProbe,
  };
}
