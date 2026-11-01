/**
 * 成就需要的**真实次数**从哪来（读盘层，页面 / hook / 守卫共用）。
 *
 * 此前成就判定把 `moduleProgress.conversation`（进度分，分钟 × 0.5、上限 100）当成
 * 「对话次数」用 —— 于是「完成 10 次 AI 对话」实际是「对话练够 20 分进度分」，
 * 卡上写的次数和它真正的意思不是一回事。这里改成直接数那两个键里的条目数
 * （一条 = 一次对话 / 一句跟读）。
 *
 * 两个键的**写入方**分别是 `ConversationPage.tsx` 与 `ShadowingPage.tsx`；
 * 键名漂移由 `verify-progress-page` 的 G 段在写读两侧各查一遍。
 */
import { safeStorage } from '@/lib/safe-storage';
import type { IAchievementCounts } from '@/lib/achievements-data';

export const CONVERSATION_HISTORY_KEY = '__nativethink_conversation_history';
export const SHADOWING_COMPLETED_KEY = '__nativethink_shadowing_completed';

export interface ICountStore {
  getItem(key: string): string | null;
}

/** 两份计数都是「一个 JSON 数组，一条 = 一次 / 一句」；坏数据一律 0，不猜一个数 */
export function countJsonEntries(raw: string | null): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function readAchievementCounts(
  store: ICountStore = { getItem: (key) => safeStorage.getItem(key) },
): IAchievementCounts {
  let conversationCount = 0;
  let shadowingCount = 0;
  try {
    conversationCount = countJsonEntries(store.getItem(CONVERSATION_HISTORY_KEY));
    shadowingCount = countJsonEntries(store.getItem(SHADOWING_COMPLETED_KEY));
  } catch {
    return { conversationCount: 0, shadowingCount: 0 };
  }
  return { conversationCount, shadowingCount };
}
