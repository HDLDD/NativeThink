/**
 * 句子复习队列 —— SM-2 间隔重复，与语块学习同一套调度。
 *
 * 触发规则：拆句时「漏切/多切」或「主干选错」即视为未掌握，进入队列；
 * 全对则按 SM-2 推进（间隔 1 → 3 → interval×easeFactor 天）。
 * 队列按到期时间取用，所以复习量自动收敛，不会越积越多。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { safeStorage } from './safe-storage';
import { formatDate } from './utils';

const STORAGE_KEY = '__nativethink_sentence_review';
const DAILY_KEY = '__nativethink_sentence_review_daily';

export interface ISentenceProgress {
  /** 句子 id（sentence-lab 的 id） */
  id: string;
  status: 'new' | 'learning' | 'reviewing' | 'mastered';
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: number;
  lastReview: number;
  /** 累计答错次数（用于展示「最需要复习」） */
  lapses: number;
}

interface IState {
  progress: Record<string, ISentenceProgress>;
  /** 每日复习计数：日期 → 已复习句子 id */
  daily: Record<string, string[]>;
}

const DEFAULTS: IState = { progress: {}, daily: {} };

function load(): IState {
  try {
    const raw = safeStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      progress: parsed?.progress && typeof parsed.progress === 'object' ? parsed.progress : {},
      daily: parsed?.daily && typeof parsed.daily === 'object' ? parsed.daily : {},
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(s: IState): void {
  try { safeStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* quota */ }
}

/** SM-2：quality 0–5（<3 视为失败，重置间隔） */
function sm2(prev: ISentenceProgress | undefined, id: string, quality: number): ISentenceProgress {
  const base: ISentenceProgress = prev ?? {
    id, status: 'new', easeFactor: 2.5, interval: 0, repetitions: 0, nextReview: 0, lastReview: 0, lapses: 0,
  };
  let { easeFactor, interval, repetitions, lapses } = base;

  const now0 = Date.now();

  if (quality < 3) {
    // 答错的句子**立即**回到队列：SM-2 原本给 1 天间隔，但拆句这类技能性训练
    // 「当场没读对」需要马上再练一遍，隔天再见到已经忘光了。
    repetitions = 0;
    interval = 0;
    lapses += 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 3;
    else interval = Math.round(Math.max(1, interval) * easeFactor);
  }
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  const status: ISentenceProgress['status'] =
    quality < 3 ? 'learning' : repetitions >= 4 && interval >= 21 ? 'mastered' : 'reviewing';

  return {
    id, status, easeFactor, interval, repetitions, lapses,
    // interval = 0 → 立刻到期（答错的句子马上可再练）
    nextReview: interval === 0 ? now0 : now0 + interval * 24 * 60 * 60 * 1000,
    lastReview: now0,
  };
}

export function useSentenceReview() {
  const [state, setState] = useState<IState>({ ...DEFAULTS });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { setState(load()); setLoaded(true); }, []);

  const persist = useCallback((next: IState) => { save(next); setState(next); }, []);

  /** 记录一次练习结果：quality 由调用方按表现折算（0–5） */
  const grade = useCallback((id: string, quality: number) => {
    setState((prev) => {
      const today = formatDate(new Date());
      const list = prev.daily[today] ?? [];
      const next: IState = {
        progress: { ...prev.progress, [id]: sm2(prev.progress[id], id, quality) },
        daily: { ...prev.daily, [today]: list.includes(id) ? list : [...list, id] },
      };
      save(next);
      return next;
    });
  }, []);

  const dueIds = useMemo(() => {
    const now = Date.now();
    return Object.values(state.progress)
      .filter((p) => p.nextReview <= now && p.status !== 'mastered')
      .sort((a, b) => (b.lapses - a.lapses) || (a.nextReview - b.nextReview))
      .map((p) => p.id);
  }, [state.progress]);

  const stats = useMemo(() => {
    const all = Object.values(state.progress);
    return {
      tracked: all.length,
      mastered: all.filter((p) => p.status === 'mastered').length,
      learning: all.filter((p) => p.status === 'learning').length,
      reviewedToday: (state.daily[formatDate(new Date())] ?? []).length,
      due: dueIds.length,
    };
  }, [state.progress, state.daily, dueIds]);

  const getProgress = useCallback((id: string) => state.progress[id] ?? null, [state.progress]);

  const resetAll = useCallback(() => persist({ progress: {}, daily: {} }), [persist]);

  return { loaded, grade, dueIds, stats, getProgress, resetAll };
}
