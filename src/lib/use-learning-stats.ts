import { useState, useEffect, useCallback } from 'react';
import { safeStorage } from './safe-storage';
import { formatDate } from './utils';

const STATS_KEY = '__nativethink_learning_stats';
const CALENDAR_KEY = '__nativethink_calendar';

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
  },
  totalDays: 0,
  lastStudyDate: formatDate(new Date()),
};

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

  const loadFromStorage = useCallback(() => {
    try {
      const savedStats = safeStorage.getItem(STATS_KEY);
      if (savedStats) {
        const parsed = JSON.parse(savedStats);
        const merged = {
          ...DEFAULT_STATS,
          ...parsed,
          moduleProgress: { ...DEFAULT_STATS.moduleProgress, ...(parsed.moduleProgress || {}) },
        };
        setStats(merged);
      }
      const savedCalendar = safeStorage.getItem(CALENDAR_KEY);
      if (savedCalendar) {
        setCalendar(JSON.parse(savedCalendar));
      } else {
        const emptyCal = createEmptyCalendar();
        setCalendar(emptyCal);
        safeStorage.setItem(CALENDAR_KEY, JSON.stringify(emptyCal));
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

  const saveStats = useCallback((newStats: ILearningStats) => {
    setStats(newStats);
    try {
      safeStorage.setItem(STATS_KEY, JSON.stringify(newStats));
    } catch {
      // ignore
    }
  }, []);

  const saveCalendar = useCallback((newCalendar: ICalendarRecord[]) => {
    setCalendar(newCalendar);
    try {
      safeStorage.setItem(CALENDAR_KEY, JSON.stringify(newCalendar));
    } catch {
      // ignore
    }
  }, []);

  const setDailyGoal = useCallback(
    (minutes: number) => {
      const newStats = { ...stats, dailyGoalMinutes: minutes };
      saveStats(newStats);
    },
    [stats, saveStats],
  );

  const addStudyMinutes = useCallback(
    (minutes: number, module: string) => {
      const today = formatDate(new Date());
      // Use functional state updates to avoid stale closure bugs on rapid calls
      setStats((prev) => {
        const newStats = { ...prev };
        // Reset todayMinutes when crossing midnight
        if (prev.lastStudyDate !== today) {
          newStats.todayMinutes = 0;
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = formatDate(yesterday);
          if (prev.lastStudyDate === yesterdayStr) {
            newStats.streakDays = prev.streakDays + 1;
          } else {
            newStats.streakDays = 1;
          }
          newStats.lastStudyDate = today;
          newStats.totalDays = prev.totalDays + 1;
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

        try { safeStorage.setItem(STATS_KEY, JSON.stringify(newStats)); } catch { /* ignore */ }
        return newStats;
      });

      // Update calendar
      setCalendar((prev) => {
        const newCalendar = [...prev];
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
        try { safeStorage.setItem(CALENDAR_KEY, JSON.stringify(newCalendar)); } catch { /* ignore */ }
        return newCalendar;
      });
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

  return {
    stats,
    calendar,
    loaded,
    addStudyMinutes,
    setDailyGoal,
    resetAll,
    setStats: saveStats,
    setCalendar: saveCalendar,
  };
}
