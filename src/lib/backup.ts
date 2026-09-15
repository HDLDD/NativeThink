/**
 * backup — 学习数据备份与恢复（防安装包更新/重装导致的数据丢失）。
 *
 * 覆盖范围：
 *  1) 全部 safeStorage 作用域内的应用数据（localStorage，__nativethink_*）
 *  2) IndexedDB 里的整书对照翻译缓存（最贵的可再生产物，重翻耗时数小时）
 *
 * 用法：
 *  - 更新安装包前导出一次（progress 页「导出学习数据」）
 *  - 重装后在 progress 页「从备份恢复」选择该 JSON 即可全部还原
 */

import { safeStorage } from './safe-storage';
import { idbGet, idbSet } from './idb';

export interface IBackupFile {
  app: 'NativeThink';
  version: 2;
  exportedAt: string;
  /** safeStorage 应用键值（去掉内部前缀） */
  data: Record<string, string>;
  /** 整书翻译缓存：key = booktrans-<bookId>-<ch|index> */
  idb?: Record<string, unknown>;
}

const IDB_BACKUP_PREFIX = 'booktrans-';
/** 备份体积上限（避免超大文件；超出则跳过 IDB 部分并在结果里说明） */
const IDB_LIMIT_BYTES = 40 * 1024 * 1024;

/** 导出全部可备份数据 */
export async function exportBackup(): Promise<{ file: IBackupFile; localStorageCount: number; idbCount: number; idbSkipped: boolean }> {
  const prefix = safeStorage.getPrefixedKey('');
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    data[key.slice(prefix.length)] = localStorage.getItem(key) || '';
  }

  // IndexedDB：整书翻译缓存（按需、限量）
  let idb: Record<string, unknown> | undefined;
  let idbSkipped = false;
  try {
    const manifestKeys: string[] = [];
    for (const k of Object.keys(data)) {
      if (k.startsWith(IDB_BACKUP_PREFIX) && k.endsWith('-index')) manifestKeys.push(k);
    }
    // 也从 IndexedDB 侧补齐（localStorage 未镜像这些键时）
    const candidateKeys = new Set<string>(manifestKeys);
    const idbData: Record<string, unknown> = {};
    let bytes = 0;
    for (const key of candidateKeys) {
      const val = await idbGet<unknown>(key);
      if (val == null) continue;
      const size = JSON.stringify(val).length;
      if (bytes + size > IDB_LIMIT_BYTES) { idbSkipped = true; break; }
      bytes += size;
      idbData[key] = val;
    }
    if (Object.keys(idbData).length > 0) idb = idbData;
  } catch { /* IDB 不可用则跳过 */ }

  const file: IBackupFile = {
    app: 'NativeThink',
    version: 2,
    exportedAt: new Date().toISOString(),
    data,
    ...(idb ? { idb } : {}),
  };
  return { file, localStorageCount: Object.keys(data).length, idbCount: idb ? Object.keys(idb).length : 0, idbSkipped };
}

/** 从备份恢复（覆盖同键；返回恢复条数） */
export async function importBackup(file: IBackupFile): Promise<{ restored: number; restoredIdb: number; idbSkipped: boolean }> {
  if (!file || file.app !== 'NativeThink' || !file.data || typeof file.data !== 'object') {
    throw new Error('备份文件格式不正确');
  }
  let restored = 0;
  for (const [key, value] of Object.entries(file.data)) {
    if (typeof value !== 'string') continue;
    try {
      safeStorage.setItem(key, value);
      restored++;
    } catch { /* 单键失败不阻断整体恢复 */ }
  }

  let restoredIdb = 0;
  let idbSkipped = false;
  if (file.idb && typeof file.idb === 'object') {
    for (const [key, value] of Object.entries(file.idb)) {
      if (!key.startsWith(IDB_BACKUP_PREFIX)) continue;
      try { await idbSet(key, value); restoredIdb++; } catch { idbSkipped = true; }
    }
  }
  return { restored, restoredIdb, idbSkipped };
}
