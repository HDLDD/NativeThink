/**
 * capped-cache — localStorage JSON 缓存的统一读写与容量封顶。
 *
 * 背景：单词 AI 例句/解析、搭配释义这类"按词累积"的缓存只增不减，
 * 重度使用会把 localStorage 慢慢撑爆（写入失败后整份缓存静默丢失）。
 * 这里给所有此类缓存一个统一的上限策略：**超出上限按最早写入淘汰（FIFO）**。
 *
 * FIFO 而非严格 LRU 的原因：对象键序 = 插入序，淘汰零成本；这些缓存本来就是
 * "翻到的词才有价值"的积累型数据，最先进来的往往也是最早学过的。
 *
 * 注意：键必须是**非纯数字**字符串（纯数字键在 JS 对象里按数值排最前，
 * 会破坏插入序淘汰）。现有调用方（小写单词/短语）都满足。
 */

import { safeStorage } from './safe-storage';

export function readJson<T>(storageKey: string, fallback: T): T {
  try {
    const raw = safeStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function persistJson(storageKey: string, value: unknown): void {
  try {
    safeStorage.setItem(storageKey, JSON.stringify(value));
  } catch { /* quota — 下次写入会先淘汰再试 */ }
}

/**
 * 纯函数：合并一个键值对并封顶（不落盘，落盘交给调用方的 persist effect，
 * 保持 setState 更新函数纯净 —— StrictMode 下更新函数会被调用两次）。
 */
export function cappedPut<T>(obj: Record<string, T>, key: string, value: T, max: number): Record<string, T> {
  const next = { ...obj, [key]: value };
  const keys = Object.keys(next);
  if (keys.length <= max) return next;
  for (const k of keys.slice(0, keys.length - max)) delete next[k];
  return next;
}

/** 一次性把旧存储键搬到新键（新键已有数据时不动；搬完删除旧键） */
export function migrateStorageKey(oldKey: string, newKey: string): void {
  try {
    if (safeStorage.getItem(newKey) != null) return;
    const legacy = safeStorage.getItem(oldKey);
    if (legacy == null) return;
    safeStorage.setItem(newKey, legacy);
    safeStorage.removeItem(oldKey);
  } catch { /* ignore */ }
}
