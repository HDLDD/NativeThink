import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-provider';
import { useCloudSync } from '@/lib/use-cloud-sync';

/**
 * CloudSyncProvider — wires cloud sync into the auth lifecycle.
 * Renders nothing; just runs side effects for data synchronization.
 * Must be placed inside <AuthProvider>.
 */
export default function CloudSyncProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { syncUp, syncDown, registerCloudWrite, unregister, needsResync } = useCloudSync();
  const lastSyncRef = useRef(0);

  // Auth-driven sync: pull cloud data on login, then push + register dual-write
  useEffect(() => {
    if (isAuthenticated) {
      // Pull remote data first (so dual-write doesn't overwrite newer cloud data),
      // then push local data to fill in anything the cloud is missing.
      syncDown().then(() => {
        syncUp();
        lastSyncRef.current = Date.now();
      });
      registerCloudWrite();
    } else {
      unregister();
    }
  }, [isAuthenticated]);

  // Periodic sync every 5 minutes
  useEffect(() => {
    if (!isAuthenticated) return;
    const id = setInterval(() => {
      syncDown().then(() => {
        // 只在"有过失败/未落云的本地写入"时才做全量补推。
        // 此前每 5 分钟都无条件 syncUp()，等于把整套数据整份再 POST 回云端一次。
        if (needsResync()) syncUp();
        lastSyncRef.current = Date.now();
      });
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [isAuthenticated, syncDown, syncUp, needsResync]);

  // Sync on page visibility change (user returns to tab)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isAuthenticated) {
        const now = Date.now();
        // Throttle: at most one sync per 60 seconds from visibility changes
        if (now - lastSyncRef.current > 60_000) {
          syncDown();
          lastSyncRef.current = now;
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isAuthenticated, syncDown]);

  return <>{children}</>;
}
