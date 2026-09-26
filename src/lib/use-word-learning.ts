import { useState, useEffect, useMemo } from 'react';
import { safeStorage } from '@/lib/safe-storage';
import type { IWordEntry } from '@/data/wordbank/schema';
import { getRandomWords } from '@/data/wordbank';

const STORAGE_KEY_PREFIX = '__nativethink_word_learning';
const DAILY_QUOTA_KEY_PREFIX = '__nativethink_daily_quota';
/**
 * 参与聚合与落盘的等级。'custom' = 生词本（从阅读里收集、词库未收录的词），
 * 它不在词库里，但学习进度与其它等级同构，所以一起聚合 —— 这样 'all' 视图能看到它。
 */
const SUB_LEVELS = ['zhongkao', 'gaokao', 'cet4', 'cet6', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced', 'custom'];
/** 词库里真实存在的等级（'all' 模式下决定进度落到哪本词书；生词本单独处理） */
const WORDBANK_LEVELS = SUB_LEVELS.filter((l) => l !== 'custom');

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
  wrongCount?: number;     // 连续答错累计（quality<=2 时 +1，答对清零）— 错词重练用
  /**
   * 用户主动「不再出现」（已会/不感兴趣）。
   * 主流背单词 App 都有这个出口：没有它，熟练用户会被简单词反复占用时间而流失。
   * 可选字段，老数据无需迁移。
   */
  suspended?: boolean;
}

export interface ILearningState {
  progress: Record<string, IWordProgress>;
  todayLearned: string[];   // word keys learned today
  todayReviewed: string[];  // word keys reviewed today
  lastActiveDate: string;   // YYYY-MM-DD
  /**
   * 每日历史（YYYY-MM-DD → 计数）。用于"本周学习量/正确率"这类报告 ——
   * todayLearned/todayReviewed 只保今天，跨天就没了，无法回溯趋势。
   * 可选字段，老数据免迁移。
   */
  history?: Record<string, { learned: number; reviewed: number; good: number }>;
}

function todayKey(): string {
  // Local calendar date (not UTC) — daily quotas must reset at local midnight
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

/** 状态变更广播事件 —— 入口角标等多个组件要跟着刷新 */
const STATE_EVENT = 'nativethink-word-learning-changed';

function saveState(level: string, state: ILearningState) {
  safeStorage.setItem(storageKey(level), JSON.stringify(state));
  try { window.dispatchEvent(new CustomEvent(STATE_EVENT)); } catch { /* ignore */ }
}

/**
 * 全部等级的到期总数 —— 入口角标用（主流 App 都会在入口显示"待复习 N"，制造回访动机）。
 * 直接扫存储而不是走 hook，避免在侧边栏挂一个完整的学习状态实例。
 *
 * 性能：saveState 每次评分都会广播，而这里要反序列化最多 10 个等级的状态；
 * 词库大时（每级数千词）每张卡都全量解析会明显掉帧，所以做 800ms 结果缓存。
 * 首次挂载用 force=true 绕过缓存，避免显示上一次会话的陈旧数字。
 */
let _dueCache = 0;
let _dueCacheAt = 0;

export function getGlobalDueCount(force = false): number {
  const t = Date.now();
  if (!force && t - _dueCacheAt < 800) return _dueCache;
  const now = t;
  let n = 0;
  for (const lvl of SUB_LEVELS) {
    for (const p of Object.values(loadState(lvl).progress)) {
      if (!p.suspended && p.status !== 'new' && p.nextReview <= now) n++;
    }
  }
  _dueCache = n;
  _dueCacheAt = t;
  return n;
}

/** 订阅全局到期数（状态一变就重算，带节流） */
export function useGlobalDueCount(): number {
  const [n, setN] = useState<number>(() => getGlobalDueCount(true));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      // 节流：连续评分时不每张卡都重算（角标不需要那么实时）
      if (timer) return;
      timer = setTimeout(() => { timer = null; setN(getGlobalDueCount(true)); }, 400);
    };
    window.addEventListener(STATE_EVENT, refresh);
    refresh();
    return () => {
      window.removeEventListener(STATE_EVENT, refresh);
      if (timer) clearTimeout(timer);
    };
  }, []);
  return n;
}

// ── 复习会话的断点续学（中途退出后能接着上次的位置）──
export interface ISavedSession {
  order: string[];
  index: number;
  savedAt: number;
}

function sessionKey(level: string): string {
  return `__nativethink_vocab_session_${level}`;
}

export function saveSession(level: string, s: ISavedSession): void {
  try { safeStorage.setItem(sessionKey(level), JSON.stringify(s)); } catch { /* ignore */ }
}

export function loadSession(level: string): ISavedSession | null {
  try {
    const raw = safeStorage.getItem(sessionKey(level));
    if (!raw) return null;
    const p = JSON.parse(raw) as ISavedSession;
    if (!p || !Array.isArray(p.order) || !p.order.length) return null;
    if (typeof p.index !== 'number' || p.index < 0 || p.index >= p.order.length) return null;
    return p;
  } catch { return null; }
}

export function clearSession(level: string): void {
  try { safeStorage.removeItem(sessionKey(level)); } catch { /* ignore */ }
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
  const merged: ILearningState = { progress: {}, todayLearned: [], todayReviewed: [], lastActiveDate: todayKey(), history: {} };
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
    // history 也要累加 —— 否则 'all' 模式（概览默认就是 all）的本周报告恒为空
    for (const [day, h] of Object.entries(s.history || {})) {
      const cur = merged.history![day] || { learned: 0, reviewed: 0, good: 0 };
      merged.history![day] = {
        learned: cur.learned + h.learned,
        reviewed: cur.reviewed + h.reviewed,
        good: cur.good + h.good,
      };
    }
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

  // Words that are due for review today（不含用户主动屏蔽的词）
  const dueForReview = useMemo(() => {
    const now = Date.now();
    return Object.values(state.progress).filter(
      (p) => p.nextReview <= now && p.status !== 'new' && !p.suspended,
    );
  }, [state.progress]);

  /** 被用户「不再出现」屏蔽的词数（概览里给出口，否则屏蔽后无法找回） */
  const suspendedCount = useMemo(
    () => Object.values(state.progress).filter((p) => p.suspended).length,
    [state.progress],
  );

  // New words available to learn (not yet started)
  const knownKeys = useMemo(() => new Set(Object.keys(state.progress)), [state.progress]);
  const todayRemaining = useMemo(
    () => dailyQuota - state.todayLearned.length,
    [dailyQuota, state.todayLearned.length],
  );

  // Get new words for today from the word bank（跳过已屏蔽/已学的词）
  // 单次随机样本只有 200 个 —— 学到后期大部分都是旧词，一轮抽样常常凑不齐每日目标；
  // 不够就再抽一轮（最多 5 轮），保证「开始学习」给足当天的量。
  const getNewWords = (count: number): IWordEntry[] => {
    const out: IWordEntry[] = [];
    const seen = new Set<string>();
    for (let round = 0; round < 5 && out.length < count; round++) {
      const batch = getRandomWords(200, level === 'all' ? undefined : level);
      for (const w of batch) {
        const k = wordKey(w);
        if (knownKeys.has(k) || seen.has(k)) continue;
        seen.add(k);
        out.push(w);
        if (out.length >= count) break;
      }
    }
    return out;
  };

  /**
   * 「不再出现」开关。屏蔽后不出现在复习队列/新词里；再次打开即恢复原进度。
   * 需要时自动补一条 status='new' 的记录，这样"没学过的词也能直接屏蔽"。
   */
  const setSuspended = (word: IWordEntry, suspended: boolean) => {
    const key = wordKey(word);
    const base: IWordProgress = { wordKey: key, status: 'new', easeFactor: 2.5, interval: 0, repetitions: 0, nextReview: 0, lastReview: 0 };
    const apply = (targets: string[]) => {
      for (const lvl of targets) {
        const s = loadState(lvl);
        s.progress[key] = { ...(s.progress[key] || base), suspended };
        saveState(lvl, s);
      }
    };
    if (isAllLevels) {
      apply([word.level && SUB_LEVELS.includes(word.level) ? word.level : SUB_LEVELS[0]]);
    } else {
      apply([level]);
    }
    setState((prev) => ({
      ...prev,
      progress: { ...prev.progress, [key]: { ...(prev.progress[key] || base), suspended } },
    }));
  };

  const recordReview = (word: IWordEntry, quality: number) => {
    const key = wordKey(word);
    // 错词统计：quality<=2 记一次错，答对清零（错词重练用）
    const applyWrong = (base: IWordProgress | undefined, updated: IWordProgress) => ({
      ...updated,
      wrongCount: quality <= 2 ? ((base as any)?.wrongCount || 0) + 1 : 0,
    });
    // 每日历史（供"本周学习量/正确率"报告回溯）—— 只有当天日期桶，跨天自动分桶
    const bumpHistory = (s: ILearningState, isNew: boolean) => {
      const day = todayKey();
      const h = { ...(s.history || {}) };
      const cur = h[day] || { learned: 0, reviewed: 0, good: 0 };
      h[day] = {
        learned: cur.learned + (isNew ? 1 : 0),
        reviewed: cur.reviewed + 1,
        good: cur.good + (quality >= 3 ? 1 : 0),
      };
      s.history = h;
    };
    // For 'all' mode: persist to the word's source level so per-level data stays accurate
    if (isAllLevels) {
      const sourceLevel = word.level && WORDBANK_LEVELS.includes(word.level) ? word.level : (word.level === 'custom' ? 'custom' : 'cet4');
      const sourceState = loadState(sourceLevel);
      const existing = sourceState.progress[key];
      const updated = applyWrong(existing, sm2Update(
        existing || { wordKey: key, status: 'new', easeFactor: 2.5, interval: 0, repetitions: 0, nextReview: 0, lastReview: 0 },
        quality,
      ));
      sourceState.progress[key] = updated;
      if (!sourceState.todayReviewed.includes(key)) sourceState.todayReviewed = [...sourceState.todayReviewed, key];
      if (!existing && !sourceState.todayLearned.includes(key)) sourceState.todayLearned = [...sourceState.todayLearned, key];
      bumpHistory(sourceState, !existing);
      saveState(sourceLevel, sourceState);
    }
    // Update in-memory state (works for both 'all' and specific levels)
    setState((prev) => {
      const existing = prev.progress[key];
      const updated = applyWrong(existing, sm2Update(
        existing || { wordKey: key, status: 'new', easeFactor: 2.5, interval: 0, repetitions: 0, nextReview: 0, lastReview: 0 },
        quality,
      ));
      const next: ILearningState = {
        ...prev,
        progress: { ...prev.progress, [key]: updated },
        todayReviewed: prev.todayReviewed.includes(key) ? prev.todayReviewed : [...prev.todayReviewed, key],
        todayLearned: existing ? prev.todayLearned : prev.todayLearned.includes(key) ? prev.todayLearned : [...prev.todayLearned, key],
      };
      bumpHistory(next, !existing);
      return next;
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
    suspendedCount,
    setSuspended,
    knownKeys,
    getNewWords,
    recordReview,
    resetProgress,
    resetLevelProgress,
    wordKey,
  };
}
