import { useCallback, useEffect, useRef } from 'react';
import { useLearningStats } from './use-learning-stats';
import { useAchievements } from './use-achievements';

/**
 * Hook that combines learning stats with achievement checking.
 * Automatically checks and unlocks achievements when stats are updated.
 */
export function useLearningWithAchievements() {
  const statsHook = useLearningStats();
  const achievementsHook = useAchievements();
  const statsRef = useRef(statsHook.stats);

  // Keep statsRef in sync with actual stats
  useEffect(() => {
    statsRef.current = statsHook.stats;
  }, [statsHook.stats]);

  // Check achievements whenever stats change
  useEffect(() => {
    if (!statsHook.loaded || !achievementsHook.loaded) return;

    const stats = statsRef.current;
    achievementsHook.checkAndUnlock({
      streakDays: stats.streakDays,
      totalDays: stats.totalDays,
      todayMinutes: stats.todayMinutes,
      dailyGoalMinutes: stats.dailyGoalMinutes,
      totalStudyMinutes: stats.todayMinutes, // Using todayMinutes as approximation
      conversationCount: stats.moduleProgress.conversation || 0,
      shadowingCount: stats.moduleProgress.shadowing || 0,
    });
  }, [statsHook.stats, statsHook.loaded, achievementsHook.loaded, achievementsHook.checkAndUnlock]);

  // Wrap addStudyMinutes to trigger achievement check after update
  const addStudyMinutes = useCallback(
    (minutes: number, module: string) => {
      statsHook.addStudyMinutes(minutes, module);

      // Check achievements after a short delay to allow state to update
      setTimeout(() => {
        const stats = statsRef.current;
        achievementsHook.checkAndUnlock({
          streakDays: stats.streakDays,
          totalDays: stats.totalDays,
          todayMinutes: stats.todayMinutes,
          dailyGoalMinutes: stats.dailyGoalMinutes,
          totalStudyMinutes: stats.todayMinutes, // Using todayMinutes as approximation
          conversationCount: stats.moduleProgress.conversation || 0,
          shadowingCount: stats.moduleProgress.shadowing || 0,
        });
      }, 100);
    },
    [statsHook.addStudyMinutes, achievementsHook.checkAndUnlock],
  );

  // Wrap resetAll to also reset achievements
  const resetAll = useCallback(() => {
    statsHook.resetAll();
    achievementsHook.resetAchievements();
  }, [statsHook.resetAll, achievementsHook.resetAchievements]);

  return {
    ...statsHook,
    addStudyMinutes,
    resetAll,
    ...achievementsHook,
  };
}
