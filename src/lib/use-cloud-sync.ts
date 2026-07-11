/** Bi-directional sync between localStorage and Vercel KV */

import { useCallback, useRef, useState } from 'react';
import { useAuth } from './auth-provider';
import { apiFetch } from './api-client';
import { setCloudSyncHandler } from './safe-storage';

const DATA_PREFIX = '__nativethink_';

export function useCloudSync() {
  const { isAuthenticated } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const lastSyncRef = useRef<number | null>(null);
  const handlerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Push all localStorage data to cloud
  const syncUp = useCallback(async () => {
    if (!isAuthenticated) return;
    setSyncing(true);
    try {
      const upserts: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const rawKey = localStorage.key(i);
        if (rawKey?.startsWith(DATA_PREFIX)) {
          const val = localStorage.getItem(rawKey);
          if (val) upserts[rawKey] = val;
        }
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

  // Pull cloud data and merge into localStorage
  const syncDown = useCallback(async () => {
    if (!isAuthenticated) return;
    setSyncing(true);
    try {
      const res = await apiFetch('/api/data/sync');
      if (res.ok) {
        const { data } = await res.json() as { data: Record<string, string> };
        for (const [key, value] of Object.entries(data)) {
          try { localStorage.setItem(key, value); } catch { /* quota */ }
        }
      }
      lastSyncRef.current = Date.now();
    } catch { /* offline */ }
    finally { setSyncing(false); }
  }, [isAuthenticated]);

  // Register dual-write handler
  const registerCloudWrite = useCallback(() => {
    if (!isAuthenticated) return;
    setCloudSyncHandler((key: string, value: string) => {
      // Fire-and-forget background write
      apiFetch(`/api/data/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }).catch(() => { /* ignore */ });
    });
  }, [isAuthenticated]);

  // Unregister on logout
  const unregister = useCallback(() => {
    setCloudSyncHandler(null);
  }, []);

  return { syncUp, syncDown, registerCloudWrite, unregister, syncing, lastSync: lastSyncRef.current };
}
