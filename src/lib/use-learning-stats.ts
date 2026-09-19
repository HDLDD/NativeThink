import { useState, useEffect, useCallback } from 'react';
import { safeStorage } from './safe-storage';
import { formatDate } from './utils';

const STATS_KEY = '__nativethink_learning_stats';
const CALENDAR_KEY = '__nativethink_calendar';

/** 跨组件实例同步：任一实例写入后广播，其它实例从 storage 重读 */
export const STATS_CHANGED_EVENT = 'nativethink-stats-changed';
export const CALENDAR_CHANGED_EVENT = 'nativethink-calendar-changed';

export interface ILearningStats {
  streakDays: number;
  dailyGoalMinutes: number;
  todayMinutes: number;
  moduleProgress: {
    think: number;
    chunks: number;
    conversation: number;
    shadowing: number;
    vocabulary: number;
    writing: number;
    /** 文章阅读 */
    articles: number;
    /** 句子拼写 */
    spelling: number;
    /** 句子学习（拆句/句型/造句） */
    sentences: number;
  };
  totalDays: number;
  lastStudyDate: string;
}

export interface ICalendarRecord {
  date: string;
  checkedIn: boolean;
  minutes: number;
  modules: string[];
}

const DEFAULT_STATS: ILearningStats = {
  streakDays: 0,
  dailyGoalMinutes: 30,
  todayMinutes: 0,
  moduleProgress: {
    think: 0,
    chunks: 0,
    conversation: 0,
    shadowing: 0,
    vocabulary: 0,
    writing: 0,
    articles: 0,
    spelling: 0,
    sentences: 0,
  },
  totalDays: 0,
  lastStudyDate: formatDate(new Date()),
};

/**
 * moduleProgress 的权威键清单 —— 顺序即统计图表的取色顺序。
 * 必须与 src/pages/DashboardPage/constants.ts 的 MODULES[].key 一一对应。
 *
 * 这里用「白名单投影」而不是对象展开合并：老用户的 localStorage 里可能残留
 * 已废弃的键（例如 cet —— 它曾被写入且从未被移除），直接展开会让它继续出现在
 * 统计图表里，而 MODULE_COLORS 已按新长度收窄，取色会得到 undefined。
 */
const MODULE_PROGRESS_KEYS = [
  'think',
  'chunks',
  'conversation',
  'shadowing',
  'vocabulary',
  'writing',
  'articles',
  'spelling',
  'sentences',
] as const;

function mergeStats(parsed: Partial<ILearningStats> | null | undefined): ILearningStats {
  const src = (parsed?.moduleProgress || {}) as Record<string, unknown>;
  const moduleProgress = {} as ILearningStats['moduleProgress'];
  for (const k of MODULE_PROGRESS_KEYS) {
    const v = src[k];
    // 非有限数一律回落 0 —— 兜住旧数据里的 null/NaN/字符串
    moduleProgress[k] = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }
  return { ...DEFAULT_STATS, ...(parsed || {}), moduleProgress };
}

function readStatsFromStorage(): ILearningStats {
  try {
    const saved = safeStorage.getItem(STATS_KEY);
    if (saved) return mergeStats(JSON.parse(saved));
  } catch {
    // ignore
  }
  return { ...DEFAULT_STATS, lastStudyDate: formatDate(new Date()) };
}

function readCalendarFromStorage(): ICalendarRecord[] | null {
  try {
    const saved = safeStorage.getItem(CALENDAR_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore
  }
  return null;
}

function writeStatsToStorage(stats: ILearningStats): void {
  try {
    safeStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // ignore
  }
}

function writeCalendarToStorage(calendar: ICalendarRecord[]): void {
  try {
    safeStorage.setItem(CALENDAR_KEY, JSON.stringify(calendar));
  } catch {
    // ignore
  }
}

function notifyChanged(type: 'stats' | 'calendar'): void {
  try {
    window.dispatchEvent(
      new Event(type === 'stats' ? STATS_CHANGED_EVENT : CALENDAR_CHANGED_EVENT),
    );
  } catch {
    // ignore
  }
}

function createEmptyCalendar(): ICalendarRecord[] {
  const today = new Date();
  const records: ICalendarRecord[] = [];
  // Create last 30 days of empty records
  for (let i = 30; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    records.push({
      date: formatDate(date),
      checkedIn: false,
      minutes: 0,
      modules: [],
    });
  }
  return records;
}

export function useLearningStats() {
  const [stats, setStats] = useState<ILearningStats>(DEFAULT_STATS);
  const [calendar, setCalendar] = useState<ICalendarRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  // 跨天感知：今日目标/时长在第二天要显示为 0（即使还没开始学习）
  const [todayStr, setTodayStr] = useState(() => formatDate(new Date()));

  useEffect(() => {
    const check = () => {
      const d = formatDate(new Date());
      setTodayStr((prev) => (prev === d ? prev : d));
    };
    const id = setInterval(check, 30_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  const loadFromStorage = useCallback(() => {
    try {
      const savedStats = safeStorage.getItem(STATS_KEY);
      if (savedStats) {
        setStats(mergeStats(JSON.parse(savedStats)));
      }
      const savedCalendar = safeStorage.getItem(CALENDAR_KEY);
      if (savedCalendar) {
        setCalendar(JSON.parse(savedCalendar));
      } else {
        const emptyCal = createEmptyCalendar();
        setCalendar(emptyCal);
        writeCalendarToStorage(emptyCal);
      }
    } catch {
      // scopedStorage unavailable — use defaults (already set in useState)
    }
  }, []);

  // Load on mount
  useEffect(() => {
    loadFromStorage();
    setLoaded(true);
  }, [loadFromStorage]);

  // Re-load when cloud sync completes (syncDown populates localStorage)
  useEffect(() => {
    const onSyncDown = () => loadFromStorage();
    window.addEventListener('nativethink-sync-down', onSyncDown);
    return () => window.removeEventListener('nativethink-sync-down', onSyncDown);
  }, [loadFromStorage]);

  // 跨实例同步：Header / Dashboard / 各练习页各自持有 hook 状态，
  // 任一实例写入后其它实例必须重读，否则改目标会用陈旧 stats 覆盖进度。
  useEffect(() => {
    const onStats = () => loadFromStorage();
    window.addEventListener(STATS_CHANGED_EVENT, onStats);
    window.addEventListener(CALENDAR_CHANGED_EVENT, onStats);
    return () => {
      window.removeEventListener(STATS_CHANGED_EVENT, onStats);
      window.removeEventListener(CALENDAR_CHANGED_EVENT, onStats);
    };
  }, [loadFromStorage]);

  const saveStats = useCallback((newStats: ILearningStats) => {
    setStats(newStats);
    writeStatsToStorage(newStats);
    notifyChanged('stats');
  }, []);

  const saveCalendar = useCallback((newCalendar: ICalendarRecord[]) => {
    setCalendar(newCalendar);
    writeCalendarToStorage(newCalendar);
    notifyChanged('calendar');
  }, []);

  const setDailyGoal = useCallback(
    (minutes: number) => {
      // 以 storage 最新数据为底，只改目标分钟数，避免陈旧闭包冲掉今日进度/连胜
      const latest = readStatsFromStorage();
      saveStats({ ...latest, dailyGoalMinutes: minutes });
    },
    [saveStats],
  );

  const addStudyMinutes = useCallback(
    (minutes: number, module: string) => {
      const today = formatDate(new Date());
      // 以 storage 为权威源，再叠加本次学习（多实例下本地 state 可能过期）
      const base = readStatsFromStorage();
      const newStats: ILearningStats = { ...base, moduleProgress: { ...base.moduleProgress } };

      // Reset todayMinutes when crossing midnight
      if (base.lastStudyDate !== today) {
        newStats.todayMinutes = 0;
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = formatDate(yesterday);
        if (base.lastStudyDate === yesterdayStr) {
          newStats.streakDays = base.streakDays + 1;
        } else {
          newStats.streakDays = 1;
        }
        newStats.lastStudyDate = today;
        newStats.totalDays = base.totalDays + 1;
      }
      newStats.todayMinutes += minutes;

      // Update module progress (cap at 100)
      const modKey = module as keyof typeof newStats.moduleProgress;
      if (modKey in newStats.moduleProgress) {
        newStats.moduleProgress[modKey] = Math.min(
          100,
          newStats.moduleProgress[modKey] + minutes * 0.5,
        );
      }

      setStats(newStats);
      writeStatsToStorage(newStats);
      notifyChanged('stats');

      // Update calendar
      const prevCal = readCalendarFromStorage() || [];
      const newCalendar = [...prevCal];
      const todayIdx = newCalendar.findIndex((r) => r.date === today);
      if (todayIdx >= 0) {
        newCalendar[todayIdx] = {
          ...newCalendar[todayIdx],
          checkedIn: true,
          minutes: newCalendar[todayIdx].minutes + minutes,
          modules: newCalendar[todayIdx].modules.includes(module)
            ? newCalendar[todayIdx].modules
            : [...newCalendar[todayIdx].modules, module],
        };
      } else {
        newCalendar.push({ date: today, checkedIn: true, minutes, modules: [module] });
      }
      setCalendar(newCalendar);
      writeCalendarToStorage(newCalendar);
      notifyChanged('calendar');
    },
    [],
  );

  const resetAll = useCallback(() => {
    const freshStats: ILearningStats = {
      ...DEFAULT_STATS,
      lastStudyDate: formatDate(new Date()),
    };
    saveStats(freshStats);
    const newCalendar = createEmptyCalendar();
    saveCalendar(newCalendar);
  }, [saveStats, saveCalendar]);

  // 今日分钟数是"当天"概念 — 跨天后显示为 0（持久化数据不动，不影响连胜计算）
  const displayStats = stats.lastStudyDate === todayStr
    ? stats
    : { ...stats, todayMinutes: 0 };

  return {
    stats: displayStats,
    calendar,
    loaded,
    addStudyMinutes,
    setDailyGoal,
    resetAll,
    setStats: saveStats,
    setCalendar: saveCalendar,
  };
}
