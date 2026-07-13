import { useState, useEffect, useCallback } from 'react';
import { safeStorage } from './safe-storage';
import { toast } from 'sonner';

const ACHIEVEMENTS_KEY = '__nativethink_achievements';

export interface IAchievement {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji
  condition: (stats: {
    streakDays: number;
    totalDays: number;
    todayMinutes: number;
    dailyGoalMinutes: number;
    totalStudyMinutes: number;
    conversationCount: number;
    shadowingCount: number;
  }) => boolean;
}

export const ACHIEVEMENT_DEFINITIONS: IAchievement[] = [
  {
    id: 'first_day',
    name: '初学者',
    description: '完成第一天学习',
    icon: '🌱',
    condition: (s) => s.totalDays >= 1,
  },
  {
    id: 'streak_3',
    name: '三日坚持',
    description: '连续学习 3 天',
    icon: '🔥',
    condition: (s) => s.streakDays >= 3,
  },
  {
    id: 'streak_7',
    name: '一周达人',
    description: '连续学习 7 天',
    icon: '⭐',
    condition: (s) => s.streakDays >= 7,
  },
  {
    id: 'streak_14',
    name: '半月坚持',
    description: '连续学习 14 天',
    icon: '🌟',
    condition: (s) => s.streakDays >= 14,
  },
  {
    id: 'streak_30',
    name: '月度冠军',
    description: '连续学习 30 天',
    icon: '👑',
    condition: (s) => s.streakDays >= 30,
  },
  {
    id: 'first_conversation',
    name: '勇敢开口',
    description: '完成第一次 AI 对话练习',
    icon: '💬',
    condition: (s) => s.conversationCount >= 1,
  },
  {
    id: 'ten_conversations',
    name: '对话达人',
    description: '完成 10 次 AI 对话练习',
    icon: '🗣️',
    condition: (s) => s.conversationCount >= 10,
  },
  {
    id: 'first_shadowing',
    name: '跟读新手',
    description: '完成第一次影子跟读',
    icon: '🎤',
    condition: (s) => s.shadowingCount >= 1,
  },
  {
    id: 'goal_hit',
    name: '目标达成',
    description: '某天学习时长达到每日目标',
    icon: '🎯',
    condition: (s) => s.todayMinutes >= s.dailyGoalMinutes,
  },
  {
    id: 'heavy_learner',
    name: '学霸模式',
    description: '单日学习超过 60 分钟',
    icon: '📚',
    condition: (s) => s.todayMinutes >= 60,
  },
  {
    id: 'total_10_days',
    name: '十天之旅',
    description: '累计学习 10 天',
    icon: '📅',
    condition: (s) => s.totalDays >= 10,
  },
  {
    id: 'total_30_days',
    name: '月度里程碑',
    description: '累计学习 30 天',
    icon: '🏆',
    condition: (s) => s.totalDays >= 30,
  },
];

export interface IUnlockedAchievement {
  id: string;
  unlockedAt: number;
}

export function useAchievements() {
  const [unlocked, setUnlocked] = useState<IUnlockedAchievement[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = safeStorage.getItem(ACHIEVEMENTS_KEY);
      if (saved) {
        setUnlocked(JSON.parse(saved));
      }
    } catch {
      // scopedStorage unavailable — use defaults
    } finally {
      setLoaded(true);
    }
  }, []);

  const persist = useCallback((items: IUnlockedAchievement[]) => {
    setUnlocked(items);
    try {
      safeStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  }, []);

  const unlock = useCallback(
    (id: string) => {
      if (unlocked.some((a) => a.id === id)) return false;
      const achievement = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === id);
      if (!achievement) return false;
      const newUnlock: IUnlockedAchievement = { id, unlockedAt: Date.now() };
      persist([...unlocked, newUnlock]);
      toast.success(`${achievement.icon} 成就解锁：${achievement.name}！`, {
        description: achievement.description,
        duration: 4000,
      });
      return true;
    },
    [unlocked, persist],
  );

  const checkAndUnlock = useCallback(
    (stats: Parameters<IAchievement['condition']>[0]) => {
      // Build list of newly unlocked achievements in one pass to avoid stale closure issues
      const newlyUnlocked: IUnlockedAchievement[] = [];
      ACHIEVEMENT_DEFINITIONS.forEach((achievement) => {
        if (!unlocked.some((a) => a.id === achievement.id) && achievement.condition(stats)) {
          newlyUnlocked.push({ id: achievement.id, unlockedAt: Date.now() });
        }
      });

      if (newlyUnlocked.length > 0) {
        // Persist all new unlocks at once
        persist([...unlocked, ...newlyUnlocked]);

        // Show toast for each new unlock
        newlyUnlocked.forEach((nu) => {
          const def = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === nu.id);
          if (def) {
            toast.success(`${def.icon} 成就解锁：${def.name}！`, {
              description: def.description,
              duration: 4000,
            });
          }
        });
      }

      return newlyUnlocked.length > 0;
    },
    [unlocked, persist],
  );

  const isUnlocked = useCallback(
    (id: string) => unlocked.some((a) => a.id === id),
    [unlocked],
  );

  const resetAchievements = useCallback(() => {
    persist([]);
  }, [persist]);

  return {
    unlocked,
    loaded,
    checkAndUnlock,
    isUnlocked,
    unlock,
    resetAchievements,
    definitions: ACHIEVEMENT_DEFINITIONS,
  };
}
