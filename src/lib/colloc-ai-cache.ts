/**
 * colloc-ai-cache — 搭配 AI 中文翻译缓存（单点归属）。
 *
 * 每日学习（闪卡背面的搭配自动补译）与搭配学习页**共用同一份**缓存，
 * 键名、迁移、上限都只在这一处定义 —— 此前键名散在两个组件里，
 * 还带着 `..._tranlations` 的拼写错误（ProgressPage 的清理清单也跟着抄错）。
 *
 * 容量上限 400 条：这是"翻到才补译"的积累型缓存，封顶防止 localStorage 无限膨胀。
 */

import { migrateStorageKey } from './capped-cache';
import { safeStorage } from './safe-storage';

/** 拼写修正后的键（tranlations → translations）。旧键在首次读取时自动迁移。 */
export const COLLOC_AI_TRANSLATIONS_KEY = '__nativethink_colloc_ai_translations';
/** 旧拼写键 —— 迁移完成后即消失；ProgressPage 的清理清单保留它只为兜底清除 */
export const COLLOC_AI_TRANSLATIONS_LEGACY_KEY = '__nativethink_colloc_ai_tranlations';

const MAX_ENTRIES = 400;

let migrated = false;

function ensureMigrated(): void {
  if (migrated) return;
  migrated = true;
  migrateStorageKey(COLLOC_AI_TRANSLATIONS_LEGACY_KEY, COLLOC_AI_TRANSLATIONS_KEY);
}

export function readCollocAiCache(): Record<string, string> {
  ensureMigrated();
  try {
    const raw = safeStorage.getItem(COLLOC_AI_TRANSLATIONS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * 纯函数：合并一批翻译并按 FIFO 封顶（不落盘 —— 落盘由调用方的
 * persist effect 统一做，保持 setState 更新函数纯净）。
 */
export function mergeCollocAiCache(prev: Record<string, string>, entries: Record<string, string>): Record<string, string> {
  const next = { ...prev, ...entries };
  const keys = Object.keys(next);
  if (keys.length <= MAX_ENTRIES) return next;
  for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete next[k];
  return next;
}

export function persistCollocAiCache(cache: Record<string, string>): void {
  try {
    safeStorage.setItem(COLLOC_AI_TRANSLATIONS_KEY, JSON.stringify(cache));
  } catch { /* quota */ }
}
