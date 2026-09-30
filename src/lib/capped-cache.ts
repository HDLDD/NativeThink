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
import { toast } from 'sonner';

export function readJson<T>(storageKey: string, fallback: T): T {
  try {
    const raw = safeStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * 落盘一份 JSON。
 * @returns 是否真的写进去了（配额满 / 隐私模式下是 false）。
 *          过去这里 `catch {}` 吞掉一切，"整份缓存静默丢失"只会在刷新后被发现。
 */
export function persistJson(storageKey: string, value: unknown): boolean {
  try {
    return safeStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    return false;
  }
}

/** 上一次"空间不足"提示的时间戳（全站一条，别刷屏） */
let lastStorageWarnAt = 0;

/**
 * 用户创作、**不可重算**的清单写失败时的诚实提示。
 * 60 秒去抖：持久化是 effect，空间一直满的话每个 state 变化都会失败，
 * 不去抖就是把 toast 堆满屏（与 `use-cloud-sync.ts:41` 的失败提示同策略）。
 */
export function warnStorageFull(): void {
  const now = Date.now();
  if (now - lastStorageWarnAt < 60_000) return;
  lastStorageWarnAt = now;
  toast.error('本机存储空间不足，刚才的改动没能保存', {
    description: '请到「学习记录 → 清理学习数据」删掉不用的自定义条目后重试',
    duration: 6000,
  });
}

/**
 * 纯函数：给"用户/AI 创作、不可重算"的清单设**加入上限**。
 * 与 `cappedPut` 的关键区别 —— 这里**不淘汰已有条目**：
 * 那是用户的作品（自定义题目、AI 生成的句子），悄悄裁掉等于替用户删数据。
 * 超出的部分由调用方如实告诉用户"本次只加进了 N 条"。
 */
export function appendCapped<T>(items: T[], additions: T[], max: number): { next: T[]; added: number } {
  const room = Math.max(0, Math.floor(max) - items.length);
  const taken = additions.slice(0, room);
  return { next: [...items, ...taken], added: taken.length };
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
