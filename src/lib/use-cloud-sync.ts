/** Bi-directional sync between localStorage and Cloudflare KV */

import { useCallback, useRef, useState } from 'react';
import { useAuth } from './auth-provider';
import { apiFetch } from './api-client';
import { safeStorage, setCloudSyncHandler } from './safe-storage';

const DATA_PREFIX = '__nativethink_';

export function useCloudSync() {
  const { isAuthenticated } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const lastSyncRef = useRef<number | null>(null);

  // Debounced dual-write: accumulate pending upserts, flush in batch
  const pendingRef = useRef<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPending = useCallback(async () => {
    const upserts = { ...pendingRef.current };
    pendingRef.current = {};
    if (Object.keys(upserts).length === 0) return;
    try {
      await apiFetch('/api/data/sync', {
        method: 'POST',
        body: JSON.stringify({ upserts }),
      });
    } catch { /* offline — will retry on next syncUp */ }
  }, []);

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
    } catch { /* offline — retry later */ }
    finally { setSyncing(false); }
  }, [isAuthenticated]);

  // Pull cloud data and merge into localStorage (via safeStorage for correct prefix)
  const syncDown = useCallback(async () => {
    if (!isAuthenticated) return;
    setSyncing(true);
    try {
      const res = await apiFetch('/api/data/sync');
      if (res.ok) {
        const { data } = await res.json() as { data: Record<string, string> };
        for (const [key, value] of Object.entries(data)) {
          try { safeStorage.setItem(key, value); } catch { /* quota */ }
        }
      }
      lastSyncRef.current = Date.now();
      // Notify other hooks that localStorage was updated from cloud
      window.dispatchEvent(new Event('nativethink-sync-down'));
    } catch { /* offline */ }
    finally { setSyncing(false); }
  }, [isAuthenticated]);

  // Register dual-write handler: debounced batch writes to KV
  const registerCloudWrite = useCallback(() => {
    if (!isAuthenticated) return;
    setCloudSyncHandler((key: string, value: string) => {
      pendingRef.current[key] = value;
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

  return { syncUp, syncDown, registerCloudWrite, unregister, syncing, lastSync: lastSyncRef.current };
}
