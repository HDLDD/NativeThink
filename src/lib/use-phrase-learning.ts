import { useState, useEffect, useMemo, useCallback } from 'react';
import { safeStorage } from '@/lib/safe-storage';
import type { IChunk } from '@/data/chunks';

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
}

export interface IPhraseLearningState {
  progress: Record<string, IPhraseProgress>;
  todayReviewed: string[];   // phrase keys reviewed today
  lastActiveDate: string;    // YYYY-MM-DD
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
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
          return parsed;
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
        return { ...parsed, progress: newProgress, todayReviewed: parsed.todayReviewed || [], lastActiveDate: parsed.lastActiveDate || todayKey() };
      }
      return { progress: {}, todayReviewed: [], lastActiveDate: todayKey(), ...parsed };
    }
    return { progress: {}, todayReviewed: [], lastActiveDate: todayKey() };
  } catch { return { progress: {}, todayReviewed: [], lastActiveDate: todayKey() }; }
}

function saveState(state: IPhraseLearningState) {
  safeStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

  // Persist
  useEffect(() => { saveState(state); }, [state]);

  // Persist daily quota
  useEffect(() => { safeStorage.setItem(DAILY_QUOTA_KEY, String(dailyQuota)); }, [dailyQuota]);

  // Phrases that are due for review today
  const dueForReview = useMemo(() => {
    const now = Date.now();
    return Object.values(state.progress).filter(
      (p) => p.nextReview <= now && p.status !== 'new',
    );
  }, [state.progress]);

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
      const updated = sm2Update(
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
      );
      return {
        ...prev,
        progress: { ...prev.progress, [key]: updated },
        todayReviewed: prev.todayReviewed.includes(key)
          ? prev.todayReviewed
          : [...prev.todayReviewed, key],
      };
    });
  }, [phraseKey]);

  // Reset all phrase progress
  const resetProgress = useCallback(() => {
    setState({ progress: {}, todayReviewed: [], lastActiveDate: todayKey() });
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
