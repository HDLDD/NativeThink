import { safeStorage } from './safe-storage';
import { idbSet } from './idb';
import type { IImportedBook } from '@/data/imported-books';

export interface IBackupFile {
  app: 'NativeThink';
  version: 2;
  exportedAt: string;
  data: Record<string, string>;
  idb?: Record<string, unknown>;
  importedBooks?: IImportedBook[];
}

const IDB_BACKUP_PREFIX = 'booktrans-';
const IDB_LIMIT_BYTES = 40 * 1024 * 1024;

export async function exportBackup(): Promise<{
  file: IBackupFile; localStorageCount: number; idbCount: number;
  importedBookCount: number; idbSkipped: boolean;
}> {
  const prefix = safeStorage.getPrefixedKey('');
  const data: Record<string, string> = Object.create(null);
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    data[key.slice(prefix.length)] = localStorage.getItem(key) || '';
  }

  // 用户原书不可重算：读不全就拒绝导出，不受派生缓存的限额裁剪。
  const { loadImportedBooks } = await import('@/data/imported-books');
  const importedBooks = await loadImportedBooks();
  const idb: Record<string, unknown> = Object.create(null);
  let idbSkipped = false;
  try {
    const [{ BOOK_META }, { dumpBookTranslationCache }] = await Promise.all([
      import('@/data/books-meta'),
      import('@/data/book-translation'),
    ]);
    const bookIds = [...BOOK_META.map((book) => book.id), ...importedBooks.map((book) => book.id)];
    let bytes = 0;
    for (const bookId of bookIds) {
      const dump = await dumpBookTranslationCache(bookId, IDB_LIMIT_BYTES - bytes);
      if (dump.skipped) idbSkipped = true;
      for (const [key, value] of Object.entries(dump.entries)) {
        idb[key] = value;
        bytes += JSON.stringify(value).length;
      }
      if (bytes >= IDB_LIMIT_BYTES) { idbSkipped = true; break; }
    }
  } catch { idbSkipped = true; }

  const file: IBackupFile = {
    app: 'NativeThink', version: 2, exportedAt: new Date().toISOString(), data,
    importedBooks,
    ...(Object.keys(idb).length ? { idb } : {}),
  };
  return {
    file, localStorageCount: Object.keys(data).length,
    idbCount: Object.keys(idb).length, importedBookCount: importedBooks.length, idbSkipped,
  };
}

export async function importBackup(file: IBackupFile): Promise<{
  restored: number; failed: number; restoredIdb: number; failedIdb: number;
  restoredBooks: number; failedBooks: number; idbSkipped: boolean;
}> {
  if (!file || file.app !== 'NativeThink' || file.version !== 2 ||
    !file.data || typeof file.data !== 'object' || Array.isArray(file.data) ||
    !Object.values(file.data).every((value) => typeof value === 'string') ||
    (file.idb !== undefined && (!file.idb || typeof file.idb !== 'object' || Array.isArray(file.idb)))) {
    throw new Error('备份文件格式不正确');
  }
  const imported: typeof import('@/data/imported-books') = await import('@/data/imported-books');
  if (file.importedBooks !== undefined) imported.validateImportedBooks(file.importedBooks);

  let restored = 0;
  let failed = 0;
  for (const [key, value] of Object.entries(file.data)) {
    if (safeStorage.setItem(key, value)) restored++;
    else failed++;
  }

  let restoredBooks = 0;
  let failedBooks = 0;
  if (file.importedBooks?.length) {
    try {
      await imported.restoreImportedBooks(file.importedBooks);
      restoredBooks = file.importedBooks.length;
    } catch { failedBooks = file.importedBooks.length; }
  }

  let restoredIdb = 0;
  let failedIdb = 0;
  for (const [key, value] of Object.entries(file.idb ?? {})) {
    if (!key.startsWith(IDB_BACKUP_PREFIX)) continue;
    try { await idbSet(key, value); restoredIdb++; }
    catch { failedIdb++; }
  }
  return { restored, failed, restoredIdb, failedIdb, restoredBooks, failedBooks, idbSkipped: failedIdb > 0 };
}
