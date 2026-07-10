/**
 * Safe storage wrapper — compatible with @lark-apaas/client-toolkit-lite
 * scopedStorage key prefixes, PLUS per-user isolation via platform user_id.
 *
 * Key format (on miaoda platform):
 *   __miaoda_<appId>_<userId>__:<key>
 *
 * Key format (standalone — Vite dev, GitHub Pages):
 *   __miaoda___global____<anonId>__:<key>
 *   where <anonId> is a stable anonymous ID generated once per browser.
 *
 * This ensures:
 *   - Different apps on the same domain don't share data (appId scope)
 *   - Different users in the same app don't share data (userId scope)
 *   - Same user across sessions always sees their own data
 */

// Bootstrap key for the anonymous ID — uses the legacy prefix so it's
// compatible with data written before per-user scoping was added.
const ANON_ID_KEY = '__miaoda_anon_id_v1';

function generateAnonId(): string {
  return `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getAnonId(): string {
  try {
    const existing = localStorage.getItem(ANON_ID_KEY);
    if (existing) return existing;
  } catch { /* ignore */ }
  const id = generateAnonId();
  try {
    localStorage.setItem(ANON_ID_KEY, id);
  } catch { /* ignore */ }
  return id;
}

function getUserId(): string {
  // Try platform user profile first
  try {
    if (typeof window !== 'undefined' && (window as any)._userInfo?.user_id) {
      return (window as any)._userInfo.user_id;
    }
  } catch { /* ignore */ }

  // Try platform SDK direct call
  try {
    // @ts-expect-error — dynamic import would be better, but this is sync-safe
    const platformUser = (window as any).__PLATFORM_USER__;
    if (platformUser?.user_id) return platformUser.user_id;
  } catch { /* ignore */ }

  // Fallback: anonymous ID (stable per browser)
  return getAnonId();
}

function getAppId(): string {
  try {
    if (typeof window !== 'undefined' && (window as any).appId) {
      return (window as any).appId;
    }
  } catch { /* ignore */ }
  return '__global__';
}

// Cache the prefix — it won't change during the session
let _prefix: string | null = null;
let _oldPrefix: string | null = null;
function getPrefix(): string {
  if (_prefix) return _prefix;
  const appId = getAppId();
  const userId = getUserId();
  _prefix = `__miaoda_${appId}_${userId}__:`;
  return _prefix;
}
function getOldPrefix(): string {
  if (_oldPrefix) return _oldPrefix;
  const appId = getAppId();
  _oldPrefix = `__miaoda_${appId}__:`;
  return _oldPrefix;
}

/** Clear the cached prefix (for testing) */
export function clearPrefixCache(): void {
  _prefix = null;
  _oldPrefix = null;
}

function prefixKey(key: string): string {
  return getPrefix() + key;
}

function oldPrefixKey(key: string): string {
  return getOldPrefix() + key;
}

// Track which keys we've already migrated to avoid redundant checks
const _migratedKeys = new Set<string>();

function tryMigrate(key: string): void {
  if (_migratedKeys.has(key)) return;
  _migratedKeys.add(key);

  const newFullKey = prefixKey(key);
  const oldFullKey = oldPrefixKey(key);

  // Skip if new key and old key are the same (no user_id change)
  if (newFullKey === oldFullKey) return;

  try {
    const newValue = localStorage.getItem(newFullKey);
    if (newValue !== null) return; // Already has new data

    const oldValue = localStorage.getItem(oldFullKey);
    if (oldValue !== null) {
      // Migrate: copy old → new, then remove old
      localStorage.setItem(newFullKey, oldValue);
      localStorage.removeItem(oldFullKey);
    }
  } catch { /* ignore */ }
}

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      tryMigrate(key);
      return localStorage.getItem(prefixKey(key));
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    try {
      _migratedKeys.add(key); // No need to check old on write
      localStorage.setItem(prefixKey(key), value);
    } catch {
      // Storage full or unavailable — silently ignore
    }
  },

  removeItem(key: string): void {
    try {
      localStorage.removeItem(prefixKey(key));
      // Also clean up old-format key if it exists
      try {
        localStorage.removeItem(oldPrefixKey(key));
      } catch { /* ignore */ }
    } catch {
      // ignore
    }
  },

  /** Expose for debugging — returns the raw prefixed key. */
  getPrefixedKey(key: string): string {
    return prefixKey(key);
  },

  /** Returns the current user identifier (for debugging). */
  getCurrentUserId(): string {
    return getUserId();
  },
};
