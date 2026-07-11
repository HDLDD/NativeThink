import { useState, useEffect, useMemo } from 'react';
import { safeStorage } from '@/lib/safe-storage';
import type { IWordEntry } from '@/data/wordbank/schema';
import { getRandomWords } from '@/data/wordbank';

const STORAGE_KEY_PREFIX = '__nativethink_word_learning';
const DAILY_QUOTA_KEY_PREFIX = '__nativethink_daily_quota';
const SUB_LEVELS = ['zhongkao', 'gaokao', 'cet4', 'cet6', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'];

export function loadLevelState(level: string): ILearningState {
  return loadState(level);
}

function storageKey(level: string): string {
  return `${STORAGE_KEY_PREFIX}_${level}`;
}
function dailyQuotaKey(level: string): string {
  return `${DAILY_QUOTA_KEY_PREFIX}_${level}`;
}

export interface IWordProgress {
  wordKey: string;
  status: 'new' | 'learning' | 'reviewing' | 'mastered';
  easeFactor: number;     // SM-2: default 2.5, min 1.3
  interval: number;        // days until next review
  repetitions: number;     // successful review count
  nextReview: number;      // Date.now() at next review time
  lastReview: number;      // timestamp
}

export interface ILearningState {
  progress: Record<string, IWordProgress>;
  todayLearned: string[];   // word keys learned today
  todayReviewed: string[];  // word keys reviewed today
  lastActiveDate: string;   // YYYY-MM-DD
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadState(level: string): ILearningState {
  try {
    const saved = safeStorage.getItem(storageKey(level));
    if (saved) return JSON.parse(saved);
    // Migration: if no per-level data, try legacy global key (only for 'all' level)
    if (level === 'all') {
      const legacy = safeStorage.getItem('__nativethink_word_learning');
      if (legacy) {
        const parsed = JSON.parse(legacy);
        // Save it to the new per-level key and clean up legacy
        saveState('all', parsed);
        safeStorage.removeItem('__nativethink_word_learning');
        return parsed;
      }
    }
    return { progress: {}, todayLearned: [], todayReviewed: [], lastActiveDate: todayKey() };
  } catch { return { progress: {}, todayLearned: [], todayReviewed: [], lastActiveDate: todayKey() }; }
}

function saveState(level: string, state: ILearningState) {
  safeStorage.setItem(storageKey(level), JSON.stringify(state));
}

function loadDailyQuota(level: string): number {
  try {
    // 1. Per-level saved quota (set via DailyLearningMode UI)
    const v = safeStorage.getItem(dailyQuotaKey(level));
    if (v) return parseInt(v);
    // 2. Wizard-set daily count (global, set on setup completion)
    const wizardVal = safeStorage.getItem('__nativethink_daily_vocab_count');
    if (wizardVal) {
      const n = parseInt(wizardVal);
      // Migrate to per-level key
      safeStorage.setItem(dailyQuotaKey(level), String(n));
      return n;
    }
    return 20;
  } catch { return 20; }
}

// SM-2 algorithm: returns updated progress
function sm2Update(prev: IWordProgress, quality: number): IWordProgress {
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

function aggregateAllLevels(): ILearningState {
  const merged: ILearningState = { progress: {}, todayLearned: [], todayReviewed: [], lastActiveDate: todayKey() };
  const learnedSet = new Set<string>();
  const reviewedSet = new Set<string>();
  for (const lvl of SUB_LEVELS) {
    const s = loadState(lvl);
    for (const [key, prog] of Object.entries(s.progress)) {
      if (!merged.progress[key] || prog.repetitions > merged.progress[key].repetitions) {
        merged.progress[key] = prog;
      }
    }
    s.todayLearned.forEach((k) => learnedSet.add(k));
    s.todayReviewed.forEach((k) => reviewedSet.add(k));
  }
  merged.todayLearned = Array.from(learnedSet);
  merged.todayReviewed = Array.from(reviewedSet);
  return merged;
}

export function useWordLearning(level: string) {
  const isAllLevels = level === 'all';
  const [state, setState] = useState<ILearningState>(() =>
    isAllLevels ? aggregateAllLevels() : loadState(level),
  );
  const [dailyQuota, setDailyQuota] = useState<number>(() => loadDailyQuota(level));

  // Reload state + quota when level changes (separate word pools per level)
  useEffect(() => {
    if (isAllLevels) {
      setState(aggregateAllLevels());
    } else {
      setState(loadState(level));
    }
    setDailyQuota(loadDailyQuota(level));
  }, [level, isAllLevels]);

  // Reset daily counters if it's a new day
  useEffect(() => {
    const today = todayKey();
    if (state.lastActiveDate !== today) {
      setState((prev) => ({ ...prev, todayLearned: [], todayReviewed: [], lastActiveDate: today }));
    }
  }, [state.lastActiveDate]);

  // Persist: for 'all' mode we write back to sub-levels via recordReview; skip bulk save
  useEffect(() => {
    if (isAllLevels) return; // 'all' is read-only aggregation; writes go to sub-levels
    saveState(level, state);
  }, [level, state, isAllLevels]);
  useEffect(() => {
    safeStorage.setItem(dailyQuotaKey(level), String(dailyQuota));
  }, [level, dailyQuota]);

  const wordKey = (w: IWordEntry) => w.word.toLowerCase();

  // Words that are due for review today
  const dueForReview = useMemo(() => {
    const now = Date.now();
    return Object.values(state.progress).filter(
      (p) => p.nextReview <= now && p.status !== 'new',
    );
  }, [state.progress]);

  // New words available to learn (not yet started)
  const knownKeys = useMemo(() => new Set(Object.keys(state.progress)), [state.progress]);
  const todayRemaining = useMemo(
    () => dailyQuota - state.todayLearned.length,
    [dailyQuota, state.todayLearned.length],
  );

  // Get new words for today from the word bank
  const getNewWords = (count: number): IWordEntry[] => {
    const all = getRandomWords(200, level === 'all' ? undefined : level);
    return all.filter((w) => !knownKeys.has(wordKey(w))).slice(0, count);
  };

  const recordReview = (word: IWordEntry, quality: number) => {
    const key = wordKey(word);
    // For 'all' mode: persist to the word's source level so per-level data stays accurate
    if (isAllLevels) {
      const sourceLevel = word.level && SUB_LEVELS.includes(word.level) ? word.level : 'cet4';
      const sourceState = loadState(sourceLevel);
      const existing = sourceState.progress[key];
      const updated = sm2Update(
        existing || { wordKey: key, status: 'new', easeFactor: 2.5, interval: 0, repetitions: 0, nextReview: 0, lastReview: 0 },
        quality,
      );
      sourceState.progress[key] = updated;
      if (!sourceState.todayReviewed.includes(key)) sourceState.todayReviewed = [...sourceState.todayReviewed, key];
      if (!existing && !sourceState.todayLearned.includes(key)) sourceState.todayLearned = [...sourceState.todayLearned, key];
      saveState(sourceLevel, sourceState);
    }
    // Update in-memory state (works for both 'all' and specific levels)
    setState((prev) => {
      const existing = prev.progress[key];
      const updated = sm2Update(
        existing || { wordKey: key, status: 'new', easeFactor: 2.5, interval: 0, repetitions: 0, nextReview: 0, lastReview: 0 },
        quality,
      );
      return {
        ...prev,
        progress: { ...prev.progress, [key]: updated },
        todayReviewed: prev.todayReviewed.includes(key) ? prev.todayReviewed : [...prev.todayReviewed, key],
        todayLearned: existing ? prev.todayLearned : prev.todayLearned.includes(key) ? prev.todayLearned : [...prev.todayLearned, key],
      };
    });
  };

  const resetProgress = () => {
    const empty = { progress: {}, todayLearned: [], todayReviewed: [], lastActiveDate: todayKey() };
    if (isAllLevels) {
      for (const lvl of SUB_LEVELS) saveState(lvl, empty);
    } else {
      saveState(level, empty);
    }
    setState(empty);
  };

  // Reset progress for a specific wordbank level — clears that level's dedicated storage
  const resetLevelProgress = (targetLevel: string) => {
    saveState(targetLevel, { progress: {}, todayLearned: [], todayReviewed: [], lastActiveDate: todayKey() });
    safeStorage.removeItem(dailyQuotaKey(targetLevel));
    // If we're currently viewing that level, reset in-memory state too
    if (targetLevel === level) {
      setState({ progress: {}, todayLearned: [], todayReviewed: [], lastActiveDate: todayKey() });
      setDailyQuota(20);
    }
    // If viewing 'all', re-aggregate
    if (isAllLevels) {
      setState(aggregateAllLevels());
    }
  };

  return {
    state,
    dailyQuota,
    setDailyQuota,
    todayRemaining,
    dueForReview,
    knownKeys,
    getNewWords,
    recordReview,
    resetProgress,
    resetLevelProgress,
    wordKey,
  };
}
