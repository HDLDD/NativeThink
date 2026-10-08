import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { safeStorage } from '@/lib/safe-storage';
import { useSyncDown } from '@/lib/sync-down';
import { formatDate } from '@/lib/utils';
import type { IChunk } from '@/data/chunks';

/**
 * 短语/语块的 SM-2 学习进度存储（**单一权威源，三个消费者共用**）：
 *  ① 语块页「短语复习」tab（ChunkTrainingPage）
 *  ② 语块页「闪卡」tab（ChunkFlashcards）
 *  ③ 词汇深度页「短语闪卡」（PhraseFlashcardMode，2026-10-09 新增）
 * 进度按 content.toLowerCase() 记键，所以同一短语在哪个入口学都算同一份进度。
 * wrongCount / suspended / todayLearned / history 是与词汇侧 use-word-learning 对齐的加法项，
 * 老存档由 loadState 的 normalize 补齐，无需迁移。
 */

const STORAGE_KEY = '__nativethink_phrase_learning';
const DAILY_QUOTA_KEY = '__nativethink_phrase_daily_quota';

export interface IPhraseProgress {
  phraseKey: string;        // the chunk content (lowercased for key)
  status: 'new' | 'learning' | 'reviewing' | 'mastered';
  easeFactor: number;       // SM-2: default 2.5, min 1.3
  interval: number;          // days until next review
  repetitions: number;       // successful review count
  nextReview: number;        // Date.now() at next review time
  lastReview: number;        // timestamp
  /** 答错累计（quality<=2 +1，答对清零）—— 错词重练队列用（与 use-word-learning 同口径） */
  wrongCount?: number;
  /** 用户主动「不再出现」：不进复习队列、不在补新里出现，进度保留可恢复 */
  suspended?: boolean;
}

export interface IPhraseLearningState {
  progress: Record<string, IPhraseProgress>;
  todayReviewed: string[];   // phrase keys reviewed today
  /** 今天首次复习的短语（= 今天新学）—— 概览「今天新学 x/y」用 */
  todayLearned: string[];
  lastActiveDate: string;    // YYYY-MM-DD
  /** 每日历史（YYYY-MM-DD → 计数）—— 「本周学习量/正确率」跨天回溯用（老数据免迁移） */
  history?: Record<string, { reviewed: number; good: number }>;
}

function todayKey(): string {
  // 本地日期，避免东八区 00:00–07:59 仍落在 UTC「昨天」
  return formatDate(new Date());
}

/**
 * 补齐缺省字段：老存档没有 todayLearned / history（UI 直接读 `state.todayLearned.length`），
 * 不补齐会在读旧数据时崩掉。所有出口（含"新格式直接返回"那条）都必须过这里。
 */
function normalize(state: Partial<IPhraseLearningState> | null | undefined): IPhraseLearningState {
  return {
    progress: state?.progress ?? {},
    todayReviewed: state?.todayReviewed ?? [],
    todayLearned: state?.todayLearned ?? [],
    lastActiveDate: state?.lastActiveDate ?? todayKey(),
    history: state?.history,
  };
}

function loadState(): IPhraseLearningState {
  try {
    const saved = safeStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migrate old format: Record<string, 'new'|'known'|'learning'> → new format
      if (parsed.progress && typeof parsed.progress === 'object') {
        // Check if it's already the new format (object values with easeFactor)
        const firstValue = Object.values(parsed.progress)[0];
        if (firstValue && typeof firstValue === 'object' && 'easeFactor' in (firstValue as object)) {
          return normalize(parsed);
        }
        // Old format detected — migrate to new format
        const newProgress: Record<string, IPhraseProgress> = {};
        for (const [key, status] of Object.entries(parsed.progress)) {
          const s = status as string;
          newProgress[key] = {
            phraseKey: key,
            status: s === 'known' ? 'reviewing' : s === 'learning' ? 'learning' : 'new',
            easeFactor: s === 'known' ? 2.5 : 2.0,
            interval: s === 'known' ? 3 : 1,
            repetitions: s === 'known' ? 2 : 0,
            nextReview: s === 'known' ? Date.now() + 3 * 24 * 60 * 60 * 1000 : Date.now(),
            lastReview: s === 'known' ? Date.now() : 0,
          };
        }
        return normalize({ ...parsed, progress: newProgress });
      }
      return normalize(parsed);
    }
    return normalize(null);
  } catch { return normalize(null); }
}

function saveState(state: IPhraseLearningState) {
  const json = JSON.stringify(state);
  // 与存储一字不差就不写：掐掉"下行重读 → 回写 → 双写再把同一份推回云端"的回声
  if (safeStorage.getItem(STORAGE_KEY) === json) return;
  safeStorage.setItem(STORAGE_KEY, json);
}

// ── 短语闪卡会话断点（顺序 + 位置），每个短语库一条，中途退出后仍可续学 ──
// 键里带 bank 前缀，与词汇侧的 __nativethink_vocab_session_<level> 分开命名，
// 免得"四级短语闪卡"和"四级单词复习"互相覆盖断点。
export interface ISavedPhraseSession {
  order: string[];
  index: number;
  savedAt: number;
}

const PHRASE_SESSION_KEY_PREFIX = '__nativethink_phrase_session_';

export function savePhraseSession(bank: string, s: ISavedPhraseSession): void {
  try { safeStorage.setItem(`${PHRASE_SESSION_KEY_PREFIX}${bank}`, JSON.stringify(s)); } catch { /* ignore */ }
}

export function loadPhraseSession(bank: string): ISavedPhraseSession | null {
  try {
    const raw = safeStorage.getItem(`${PHRASE_SESSION_KEY_PREFIX}${bank}`);
    if (!raw) return null;
    const p = JSON.parse(raw) as ISavedPhraseSession;
    if (!p || !Array.isArray(p.order) || !p.order.length) return null;
    if (typeof p.index !== 'number' || p.index < 0 || p.index >= p.order.length) return null;
    return p;
  } catch { return null; }
}

export function clearPhraseSession(bank: string): void {
  try { safeStorage.removeItem(`${PHRASE_SESSION_KEY_PREFIX}${bank}`); } catch { /* ignore */ }
}

// SM-2 algorithm: returns updated progress
function sm2Update(prev: IPhraseProgress, quality: number): IPhraseProgress {
  // quality: 0-5 (0=complete blackout, 5=perfect)
  let { easeFactor, interval, repetitions } = prev;

  if (quality >= 3) {
    // Correct response
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 3;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  } else {
    // Incorrect response — reset
    repetitions = 0;
    interval = 1;
  }

  // Update ease factor (SM-2 formula)
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  const now = Date.now();
  const nextReview = now + interval * 24 * 60 * 60 * 1000;

  return {
    ...prev,
    status: repetitions >= 5 ? 'mastered' : repetitions > 0 ? 'reviewing' : 'learning',
    easeFactor,
    interval,
    repetitions,
    nextReview,
    lastReview: now,
  };
}

export function usePhraseLearning(allPhrases: IChunk[]) {
  const [state, setState] = useState<IPhraseLearningState>(loadState);
  /** 「这份 state 是刚从 storage 读进来的」标记：回写 effect 见同一引用就跳过（防下行回声，见 use-word-learning 的同款注释） */
  const loadedFromStorageRef = useRef<IPhraseLearningState | null>(null);
  const [dailyQuota, setDailyQuota] = useState<number>(() => {
    try { const v = safeStorage.getItem(DAILY_QUOTA_KEY); return v ? parseInt(v) : 10; } catch { return 10; }
  });

  // Build phrase lookup map: lowercase content → IChunk
  const phraseMap = useMemo(() => {
    const map = new Map<string, IChunk>();
    allPhrases.forEach((p) => map.set(p.content.toLowerCase(), p));
    return map;
  }, [allPhrases]);

  // Reset daily counters if it's a new day
  useEffect(() => {
    const today = todayKey();
    if (state.lastActiveDate !== today) {
      setState((prev) => ({ ...prev, todayReviewed: [], lastActiveDate: today }));
    }
  }, [state.lastActiveDate]);

  /** 云同步下行后重读（语块复习进度与每日配额），否则这台设备拿着陈旧状态，下一次评分会把远端新值盖掉 */
  useSyncDown(() => {
    const next = loadState();
    loadedFromStorageRef.current = next;
    setState(next);
    try {
      const v = safeStorage.getItem(DAILY_QUOTA_KEY);
      setDailyQuota(v ? parseInt(v) : 10);
    } catch { /* 保持当前值 */ }
  });

  // Persist
  useEffect(() => {
    if (loadedFromStorageRef.current === state) {
      loadedFromStorageRef.current = null;
      return;
    }
    saveState(state);
  }, [state]);

  // Persist daily quota
  useEffect(() => { safeStorage.setItem(DAILY_QUOTA_KEY, String(dailyQuota)); }, [dailyQuota]);

  // Phrases that are due for review today（不含用户主动「不再出现」的）
  const dueForReview = useMemo(() => {
    const now = Date.now();
    return Object.values(state.progress).filter(
      (p) => p.nextReview <= now && p.status !== 'new' && !p.suspended,
    );
  }, [state.progress]);

  /** 被「不再出现」屏蔽的短语数（概览里给出口，否则屏蔽后无法找回） */
  const suspendedCount = useMemo(
    () => Object.values(state.progress).filter((p) => p.suspended).length,
    [state.progress],
  );

  // New phrases available to learn (not yet started)
  const learnedKeys = useMemo(() => new Set(Object.keys(state.progress)), [state.progress]);
  const todayRemaining = useMemo(
    () => Math.max(0, dailyQuota - state.todayReviewed.length),
    [dailyQuota, state.todayReviewed.length],
  );

  // Get new phrases for today
  const getNewPhrases = useCallback((count: number): IChunk[] => {
    return allPhrases
      .filter((p) => !learnedKeys.has(p.content.toLowerCase()))
      .sort(() => Math.random() - 0.5)
      .slice(0, count);
  }, [allPhrases, learnedKeys]);

  // Get a mixed review queue: due reviews first, then new phrases up to daily quota
  const getReviewQueue = useCallback((totalCount: number = 20): IChunk[] => {
    const duePhrases: IChunk[] = [];
    const dueSet = new Set(dueForReview.map((p) => p.phraseKey));

    for (const phrase of allPhrases) {
      const key = phrase.content.toLowerCase();
      if (dueSet.has(key)) {
        duePhrases.push(phrase);
      }
    }

    // Shuffle due phrases
    duePhrases.sort(() => Math.random() - 0.5);

    // Fill remaining slots with new phrases
    const remaining = totalCount - duePhrases.length;
    if (remaining > 0) {
      const newPhrases = getNewPhrases(remaining);
      return [...duePhrases, ...newPhrases];
    }

    return duePhrases.slice(0, totalCount);
  }, [allPhrases, dueForReview, getNewPhrases]);

  const phraseKey = useCallback((phrase: IChunk) => phrase.content.toLowerCase(), []);

  // Record a review with SM-2 quality score (0-5)
  const recordReview = useCallback((phrase: IChunk, quality: number) => {
    const key = phraseKey(phrase);
    setState((prev) => {
      const existing = prev.progress[key];
      const updated: IPhraseProgress = {
        ...sm2Update(
          existing || {
            phraseKey: key,
            status: 'new',
            easeFactor: 2.5,
            interval: 0,
            repetitions: 0,
            nextReview: 0,
            lastReview: 0,
          },
          quality,
        ),
        // 错词统计：quality<=2 记一次错，答对清零（错词重练用，与词汇侧同口径）
        wrongCount: quality <= 2 ? (existing?.wrongCount || 0) + 1 : 0,
      };
      // 每日历史（供"本周学习量/正确率"跨天回溯）—— 只有当天日期桶，跨天自动分桶
      const day = todayKey();
      const history = { ...(prev.history || {}) };
      const cur = history[day] || { reviewed: 0, good: 0 };
      history[day] = { reviewed: cur.reviewed + 1, good: cur.good + (quality >= 3 ? 1 : 0) };
      return {
        ...prev,
        progress: { ...prev.progress, [key]: updated },
        todayReviewed: prev.todayReviewed.includes(key)
          ? prev.todayReviewed
          : [...prev.todayReviewed, key],
        todayLearned: existing
          ? prev.todayLearned
          : prev.todayLearned.includes(key) ? prev.todayLearned : [...prev.todayLearned, key],
        history,
      };
    });
  }, [phraseKey]);

  /**
   * 「不再出现」开关（已会 / 不感兴趣）。屏蔽后不出现在到期队列与补新里；再次打开即恢复原进度。
   * 需要时自动补一条 status='new' 的记录，这样"没学过的短语也能直接屏蔽"。
   */
  const setSuspended = useCallback((phrase: IChunk, suspended: boolean) => {
    const key = phraseKey(phrase);
    const base: IPhraseProgress = {
      phraseKey: key, status: 'new', easeFactor: 2.5, interval: 0, repetitions: 0, nextReview: 0, lastReview: 0,
    };
    setState((prev) => ({
      ...prev,
      progress: { ...prev.progress, [key]: { ...(prev.progress[key] || base), suspended } },
    }));
  }, [phraseKey]);

  // Reset all phrase progress
  const resetProgress = useCallback(() => {
    setState({ progress: {}, todayReviewed: [], todayLearned: [], lastActiveDate: todayKey() });
  }, []);

  // Get progress summary stats
  const getStats = useCallback(() => {
    const all = Object.values(state.progress);
    const mastered = all.filter((p) => p.status === 'mastered').length;
    const reviewing = all.filter((p) => p.status === 'reviewing').length;
    const learning = all.filter((p) => p.status === 'learning').length;
    const newCount = all.filter((p) => p.status === 'new').length;
    const dueNow = dueForReview.length;
    const totalStarted = all.length;
    return { mastered, reviewing, learning, newCount, dueNow, totalStarted, total: allPhrases.length };
  }, [state.progress, dueForReview.length, allPhrases.length]);

  return {
    state,
    dailyQuota,
    setDailyQuota,
    todayRemaining,
    dueForReview,
    suspendedCount,
    setSuspended,
    learnedKeys,
    getNewPhrases,
    getReviewQueue,
    recordReview,
    resetProgress,
    phraseKey,
    phraseMap,
    getStats,
  };
}
