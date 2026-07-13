/**
 * IndexedDB wrapper for caching wordbank data.
 * Provides a simple key-value store with versioning.
 */

const DB_NAME = 'nativethink-wordbank';
const DB_VERSION = 1;

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
    };
  });
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
