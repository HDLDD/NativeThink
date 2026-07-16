/**
 * 句子拼写 — 学习引擎 Hook
 * SM-2 间隔重复 + 错词跟踪
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { safeStorage } from './safe-storage';
import type { ISpellingSentence, ISpellingProgress, ISpellingLearningState, SpellingMode } from '@/types/spelling';

const STORAGE_KEY = '__nativethink_spelling_progress';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadState(): ISpellingLearningState {
  try {
    const saved = safeStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return { progress: {}, todayPracticed: [], lastActiveDate: todayKey() };
}

function saveState(state: ISpellingLearningState) {
  safeStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * SM-2 algorithm for sentence spelling
 * quality: 0 (complete failure) — 5 (perfect recall)
 */
function sm2Update(prev: ISpellingProgress, quality: number): ISpellingProgress {
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
    // Incorrect — reset
    repetitions = 0;
    interval = 1;
  }

  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  const nextReview = Date.now() + interval * 24 * 60 * 60 * 1000;

  return {
    ...prev,
    status: repetitions >= 5 ? 'mastered' : repetitions > 0 ? 'reviewing' : 'learning',
    easeFactor,
    interval,
    repetitions,
    nextReview,
    lastReview: Date.now(),
  };
}

export function useSpellingLearning() {
  const [state, setState] = useState<ISpellingLearningState>(loadState);

  // Reset daily counters if new day
  useEffect(() => {
    const today = todayKey();
    if (state.lastActiveDate !== today) {
      setState((prev) => ({ ...prev, todayPracticed: [], lastActiveDate: today }));
    }
  }, [state.lastActiveDate]);

  // Persist
  useEffect(() => {
    saveState(state);
  }, [state]);

  /** Get progress for a specific sentence */
  const getProgress = useCallback(
    (sentenceId: string): ISpellingProgress => {
      return state.progress[sentenceId] || {
        sentenceId,
        status: 'new' as const,
        easeFactor: 2.5,
        interval: 0,
        repetitions: 0,
        nextReview: 0,
        lastReview: 0,
        wrongWords: {},
        totalAttempts: 0,
        correctAttempts: 0,
        lastMode: 'dictation' as SpellingMode,
      };
    },
    [state.progress],
  );

  /** Record a practice attempt */
  const recordAttempt = useCallback(
    (
      sentenceId: string,
      quality: number,
      wrongWords: Record<string, number>,
      mode: SpellingMode,
    ) => {
      setState((prev) => {
        const existing = prev.progress[sentenceId];
        const updated = sm2Update(
          existing || {
            sentenceId,
            status: 'new' as const,
            easeFactor: 2.5,
            interval: 0,
            repetitions: 0,
            nextReview: 0,
            lastReview: 0,
            wrongWords: {},
            totalAttempts: 0,
            correctAttempts: 0,
            lastMode: mode,
          },
          quality,
        );

        // Merge wrong words
        const mergedWrong = { ...updated.wrongWords };
        for (const [word, count] of Object.entries(wrongWords)) {
          mergedWrong[word] = (mergedWrong[word] || 0) + count;
        }

        const today = todayKey();
        const todayPracticed = prev.todayPracticed.includes(sentenceId)
          ? prev.todayPracticed
          : [...prev.todayPracticed, sentenceId];

        return {
          ...prev,
          progress: {
            ...prev.progress,
            [sentenceId]: {
              ...updated,
              wrongWords: mergedWrong,
              totalAttempts: updated.totalAttempts + 1,
              correctAttempts: quality >= 3 ? updated.correctAttempts + 1 : updated.correctAttempts,
              lastMode: mode,
              lastReview: Date.now(),
            },
          },
          todayPracticed,
          lastActiveDate: today,
        };
      });
    },
    [],
  );

  /** Calculate quality from correct/total word ratio */
  const calculateQuality = useCallback(
    (correctWords: number, totalWords: number): number => {
      if (totalWords === 0) return 0;
      const ratio = correctWords / totalWords;
      if (ratio >= 1) return 5;
      if (ratio >= 0.8) return 4;
      if (ratio >= 0.6) return 3;
      if (ratio >= 0.4) return 2;
      if (ratio >= 0.2) return 1;
      return 0;
    },
    [],
  );

  /** Sentences due for review (nextReview <= now) */
  const dueForReview = useMemo(() => {
    const now = Date.now();
    return Object.values(state.progress).filter(
      (p) => p.nextReview <= now && p.status !== 'new' && p.status !== 'mastered',
    );
  }, [state.progress]);

  /** Practice stats across all sentences */
  const stats = useMemo(() => {
    const entries = Object.values(state.progress);
    return {
      total: entries.length,
      learning: entries.filter((p) => p.status === 'learning').length,
      reviewing: entries.filter((p) => p.status === 'reviewing').length,
      mastered: entries.filter((p) => p.status === 'mastered').length,
      todayPracticed: state.todayPracticed.length,
      totalWrongWords: entries.reduce((sum, p) => sum + Object.keys(p.wrongWords).length, 0),
    };
  }, [state.progress, state.todayPracticed]);

  /** Build session queue: due sentences first, then new ones */
  const buildSessionQueue = useCallback(
    (allSentences: ISpellingSentence[]): string[] => {
      const now = Date.now();
      const progress = state.progress;

      // Separate into due and new
      const due: string[] = [];
      const newOnes: string[] = [];
      const mastered: string[] = [];

      for (const s of allSentences) {
        const p = progress[s.id];
        if (!p || p.status === 'new') {
          newOnes.push(s.id);
        } else if (p.status === 'mastered' && p.nextReview > now) {
          mastered.push(s.id);
        } else if (p.nextReview <= now) {
          due.push(s.id);
        } else {
          // Not due yet — include if near review time (within 1 day)
          if (p.nextReview - now < 24 * 60 * 60 * 1000) {
            due.push(s.id);
          }
        }
      }

      // Order: due first (by oldest nextReview), then new (shuffled)
      due.sort((a, b) => (progress[a]?.nextReview || 0) - (progress[b]?.nextReview || 0));
      const shuffled = [...newOnes].sort(() => Math.random() - 0.5);

      return [...due, ...shuffled, ...mastered];
    },
    [state.progress],
  );

  /** Reset progress for a specific sentence */
  const resetSentenceProgress = useCallback((sentenceId: string) => {
    setState((prev) => {
      const newProgress = { ...prev.progress };
      delete newProgress[sentenceId];
      return { ...prev, progress: newProgress };
    });
  }, []);

  /** Reset all progress */
  const resetAllProgress = useCallback(() => {
    setState({ progress: {}, todayPracticed: [], lastActiveDate: todayKey() });
  }, []);

  return {
    state,
    getProgress,
    recordAttempt,
    calculateQuality,
    dueForReview,
    stats,
    buildSessionQueue,
    resetSentenceProgress,
    resetAllProgress,
  };
}
