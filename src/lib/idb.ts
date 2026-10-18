/**
 * IndexedDB wrapper for caching wordbank data.
 * Provides a simple key-value store with versioning.
 *
 * v2 加了独立的 `media` 库给「视频精听」用。**为什么不同库不同 store 都要分开**：
 * `idbClear()` 清的是 wordbank 那份缓存（词库升级/坏缓存自愈会调它），
 * 而用户导入的视频与字幕是**不可重算的本机资产** —— 混在一个 store 里，
 * 一次缓存清理就把人家的视频删干净了。
 */

const DB_NAME = 'nativethink-wordbank';
const DB_VERSION = 2;
/** 视频精听：一条记录 = 元数据 + 字幕 + 媒体 blob（blob 可能几百 MB，只进 IDB，绝不进 localStorage） */
export const MEDIA_STORE = 'media';

let dbInstance: IDBDatabase | null = null;

/**
 * Open or create the IndexedDB database.
 */
function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // Create object store for wordbank data
      if (!db.objectStoreNames.contains('wordbank')) {
        db.createObjectStore('wordbank', { keyPath: 'key' });
      }
      // v2：视频精听的媒体 + 字幕（keyPath 用记录自己的 id，不是 KV 形状）
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
      }
    };
  });
}

/** 在指定 store 上跑一个事务；ok=false 表示事务没提交成功（配额满、store 不存在、浏览器拒绝） */
function withStore<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<{ ok: boolean; value: T | null }> {
  return openDB().then((db) => {
    if (!db) return { ok: false, value: null };
    return new Promise<{ ok: boolean; value: T | null }>((resolve) => {
      try {
        const tx = db.transaction(store, mode);
        const req = run(tx.objectStore(store));
        let value: T | null = null;
        req.onsuccess = () => { value = (req.result ?? null) as T | null; };
        // 以 oncommit 为准：put 的 success 只代表请求完成，事务才代表落盘
        tx.oncomplete = () => resolve({ ok: true, value });
        tx.onerror = () => resolve({ ok: false, value: null });
        tx.onabort = () => resolve({ ok: false, value: null });
      } catch { resolve({ ok: false, value: null }); }
    });
  }).catch(() => ({ ok: false, value: null }));
}

/** 打开失败也要有结果（openDB 原本会 reject；media 这条路全部走这个包装） */
function openDBSafe(): Promise<IDBDatabase | null> {
  return openDB().catch(() => null);
}

/** 写一条 media 记录（含 blob）。返回 false = 没写进去（配额满最常见），调用方必须说出来 */
export async function idbMediaPut<T extends { id: string }>(record: T): Promise<boolean> {
  const r = await withStore<unknown>(MEDIA_STORE, 'readwrite', (s) => s.put(record));
  return r.ok;
}

/** 读一条 media 记录 */
export async function idbMediaGet<T>(id: string): Promise<T | null> {
  const r = await withStore<T>(MEDIA_STORE, 'readonly', (s) => s.get(id));
  return r.ok ? r.value : null;
}

/** 列出全部 media 的**轻量索引**（不取 blob，避免把几百 MB 拉进内存） */
export async function idbMediaAll<T>(): Promise<T[]> {
  const db = await openDBSafe();
  if (!db) return [];
  return new Promise<T[]>((resolve) => {
    try {
      const tx = db.transaction(MEDIA_STORE, 'readonly');
      const out: T[] = [];
      const cur = tx.objectStore(MEDIA_STORE).openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) { resolve(out); return; }
        out.push(c.value as T);
        c.continue();
      };
      cur.onerror = () => resolve(out);
    } catch { resolve([]); }
  });
}

export async function idbMediaDelete(id: string): Promise<boolean> {
  const r = await withStore<unknown>(MEDIA_STORE, 'readwrite', (s) => s.delete(id));
  return r.ok;
}


/**
 * Get a value from IndexedDB.
 * @param key - The key to retrieve
 * @returns The stored value, or null if not found
 */
export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('wordbank', 'readonly');
      const store = tx.objectStore('wordbank');
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : null);
      };
    });
  } catch {
    // IndexedDB not available or error - fail silently
    return null;
  }
}

/**
 * Set a value in IndexedDB.
 * @param key - The key to store
 * @param value - The value to store
 */
export async function idbSet<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('wordbank', 'readwrite');
      const store = tx.objectStore('wordbank');
      const request = store.put({ key, value, timestamp: Date.now() });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch {
    // IndexedDB not available or error - fail silently
  }
}

/**
 * Delete a value from IndexedDB.
 * @param key - The key to delete
 */
export async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('wordbank', 'readwrite');
      const store = tx.objectStore('wordbank');
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch {
    // IndexedDB not available or error - fail silently
  }
}

/**
 * Check if a key exists in IndexedDB.
 * @param key - The key to check
 * @returns true if the key exists
 */
export async function idbHas(key: string): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('wordbank', 'readonly');
      const store = tx.objectStore('wordbank');
      const request = store.count(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result > 0);
    });
  } catch {
    return false;
  }
}

/**
 * Clear all data from the wordbank store.
 */
export async function idbClear(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('wordbank', 'readwrite');
      const store = tx.objectStore('wordbank');
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch {
    // IndexedDB not available or error - fail silently
  }
}
