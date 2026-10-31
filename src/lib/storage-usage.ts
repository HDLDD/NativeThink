/**
 * 设置页「学习数据」的本地占用统计（纯逻辑，可注入替身真跑）。
 *
 * 只数当前用户前缀下的键：safeStorage 的键名前缀会随登录态变化，
 * 直接遍历 localStorage.length 会把别的账号/其它站点的数据算进来。
 */

export interface IStorageLike {
  length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
}

export interface IStorageUsage {
  entries: number;
  /** UTF-16 字节数（和浏览器对 localStorage 的计量口径一致） */
  bytes: number;
}

export function measureLocalStorage(storage: IStorageLike, prefix: string): IStorageUsage {
  let entries = 0;
  let bytes = 0;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const value = storage.getItem(key) ?? '';
    entries++;
    bytes += (key.length + value.length) * 2;
  }
  return { entries, bytes };
}

export function formatBytes(raw: number): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const text = unit === 0
    ? String(Math.round(value))
    : value.toFixed(1).replace(/\.0$/, '');
  return `${text} ${units[unit]}`;
}