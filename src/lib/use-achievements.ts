/**
 * 成就解锁的存储与提示层。
 *
 * 定义、阈值与「还差多少」的计算都在 `achievements-data.ts`（纯逻辑，守卫真跑）；
 * 这里只管读盘、解锁落盘与 toast。真实次数由 `achievement-sources.ts` 提供。
 */
import { useState, useEffect, useCallback } from 'react';
import { useSyncDown } from './sync-down';
import { safeStorage } from './safe-storage';
import { persistText } from './capped-cache';
import { toast } from 'sonner';
import { ACHIEVEMENT_DEFINITIONS, buildAchievementStats, type IAchievementStats } from '@/lib/achievements-data';
import { readAchievementCounts } from '@/lib/achievement-sources';
import { useLearningStats } from '@/lib/use-learning-stats';

const ACHIEVEMENTS_KEY = '__nativethink_achievements';

export interface IUnlockedAchievement {
  id: string;
  unlockedAt: number;
}

export function useAchievements() {
  const [unlocked, setUnlocked] = useState<IUnlockedAchievement[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reloadFromStorage = useCallback(() => {
    try {
      const saved = safeStorage.getItem(ACHIEVEMENTS_KEY);
      if (saved) {
        setUnlocked(JSON.parse(saved));
      }
    } catch {
      // scopedStorage unavailable — keep current state
    }
  }, []);

  useEffect(() => {
    reloadFromStorage();
    setLoaded(true);
  }, [reloadFromStorage]);

  // 云同步下行后重读：另一台设备解锁的成就这台要立即看到。
  // 解锁只往列表里加（persist 直接写 storage），重读不会产生回声写入。
  useSyncDown(reloadFromStorage);

  const persist = useCallback((items: IUnlockedAchievement[]) => {
    setUnlocked(items);
    persistText(ACHIEVEMENTS_KEY, JSON.stringify(items));
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
    (stats: IAchievementStats) => {
      // Build list of newly unlocked achievements in one pass to avoid stale closure issues
      const newlyUnlocked: IUnlockedAchievement[] = [];
      ACHIEVEMENT_DEFINITIONS.forEach((achievement) => {
        if (!unlocked.some((a) => a.id === achievement.id) && achievement.achieved(stats)) {
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

/**
 * 挂在外壳上的成就判定（`Layout.tsx` 唯一调用点）。
 *
 * 此前没有任何地方调用 `checkAndUnlock` —— 解锁逻辑写完了但没人跑，成就页永远是一排 🔒。
 * 学习时长与真实计数一变就重判一次；两个 loaded 门都要过，否则首屏会拿默认空值判一轮。
 */
export function useAchievementCheck() {
  const { stats, loaded: statsLoaded } = useLearningStats();
  const { checkAndUnlock, loaded: achievementsLoaded } = useAchievements();

  useEffect(() => {
    if (!statsLoaded || !achievementsLoaded) return;
    checkAndUnlock(buildAchievementStats(stats, readAchievementCounts()));
  }, [stats, statsLoaded, achievementsLoaded, checkAndUnlock]);
}
