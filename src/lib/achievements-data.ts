/**
 * 成就的定义与"还差多少"计算（纯逻辑，页面 / hook / 守卫共用）。
 *
 * 2026-11-01 从 `use-achievements.ts` 搬出来，为的是让成就卡能说清"你离解锁还差几天"：
 *  - `achieved` 与 `progressOf` **必须同源** —— 守卫拿同一组夹具逐个比对
 *    「进度到没到」⟺「判没判解锁」，任一处改口径另一处立刻对不上（旧实现只有一个
 *    `condition(s) => boolean`，界面想显示进度就得再抄一遍阈值）。
 *  - 给不出真实计数的成就，`progressOf` 返回 null，界面退回 🔒 —— 不拿进度分冒充次数。
 *  - 本文件零 import、无副作用，守卫直接转译真跑。
 */

export interface IAchievementCounts {
  /** 真实对话**次数**（来自 `__nativethink_conversation_history` 的条数） */
  conversationCount: number;
  /** 真实跟读**完成句数**（来自 `__nativethink_shadowing_completed` 的条数） */
  shadowingCount: number;
}

export interface IAchievementStats extends IAchievementCounts {
  streakDays: number;
  totalDays: number;
  todayMinutes: number;
  dailyGoalMinutes: number;
}

export interface IAchievementProgress {
  current: number;
  target: number;
  /** 量词：天 / 分钟 / 次 / 句 —— 描述文案与它必须一致 */
  unit: string;
}

export interface IAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  achieved: (stats: IAchievementStats) => boolean;
  /** 未解锁时给一句"还差多少"；给不出真实计数就返回 null */
  progressOf?: (stats: IAchievementStats) => IAchievementProgress | null;
}

const count = (value: number) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
const days = (target: number) => (s: IAchievementStats) =>
  ({ current: count(s.streakDays), target, unit: '天' }) as IAchievementProgress;
const totals = (target: number) => (s: IAchievementStats) =>
  ({ current: count(s.totalDays), target, unit: '天' }) as IAchievementProgress;

export const ACHIEVEMENT_DEFINITIONS: IAchievement[] = [
  {
    id: 'first_day',
    name: '初学者',
    description: '完成第一天学习',
    icon: '🌱',
    achieved: (s) => count(s.totalDays) >= 1,
    progressOf: totals(1),
  },
  {
    id: 'streak_3',
    name: '三日坚持',
    description: '连续学习 3 天',
    icon: '🔥',
    achieved: (s) => count(s.streakDays) >= 3,
    progressOf: days(3),
  },
  {
    id: 'streak_7',
    name: '一周达人',
    description: '连续学习 7 天',
    icon: '⭐',
    achieved: (s) => count(s.streakDays) >= 7,
    progressOf: days(7),
  },
  {
    id: 'streak_14',
    name: '半月坚持',
    description: '连续学习 14 天',
    icon: '🌟',
    achieved: (s) => count(s.streakDays) >= 14,
    progressOf: days(14),
  },
  {
    id: 'streak_30',
    name: '月度冠军',
    description: '连续学习 30 天',
    icon: '👑',
    achieved: (s) => count(s.streakDays) >= 30,
    progressOf: days(30),
  },
  {
    id: 'first_conversation',
    name: '勇敢开口',
    description: '完成第一次 AI 对话练习',
    icon: '💬',
    achieved: (s) => count(s.conversationCount) >= 1,
    progressOf: (s) => ({ current: count(s.conversationCount), target: 1, unit: '次' }),
  },
  {
    id: 'ten_conversations',
    name: '对话达人',
    description: '完成 10 次 AI 对话练习',
    icon: '🗣️',
    achieved: (s) => count(s.conversationCount) >= 10,
    progressOf: (s) => ({ current: count(s.conversationCount), target: 10, unit: '次' }),
  },
  {
    id: 'first_shadowing',
    name: '跟读新手',
    description: '影子跟读里念完第一句',
    icon: '🎤',
    achieved: (s) => count(s.shadowingCount) >= 1,
    progressOf: (s) => ({ current: count(s.shadowingCount), target: 1, unit: '句' }),
  },
  {
    id: 'goal_hit',
    name: '目标达成',
    description: '当天学习分钟数达到每日目标',
    icon: '🎯',
    // 目标为 0（关掉每日目标）时不算达成：旧写法 `todayMinutes >= dailyGoalMinutes`
    // 在 0/0 上恒真，新用户第一次记账就被判成"已达成目标"。
    achieved: (s) => count(s.dailyGoalMinutes) > 0 && count(s.todayMinutes) >= count(s.dailyGoalMinutes),
    progressOf: (s) => {
      const target = count(s.dailyGoalMinutes);
      if (target <= 0) return null;
      return { current: count(s.todayMinutes), target, unit: '分钟' };
    },
  },
  {
    id: 'heavy_learner',
    name: '学霸模式',
    description: '单日学习超过 60 分钟',
    icon: '📚',
    achieved: (s) => count(s.todayMinutes) >= 60,
    progressOf: (s) => ({ current: count(s.todayMinutes), target: 60, unit: '分钟' }),
  },
  {
    id: 'total_10_days',
    name: '十天之旅',
    description: '累计学习 10 天',
    icon: '📅',
    achieved: (s) => count(s.totalDays) >= 10,
    progressOf: totals(10),
  },
  {
    id: 'total_30_days',
    name: '月度里程碑',
    description: '累计学习 30 天',
    icon: '🏆',
    achieved: (s) => count(s.totalDays) >= 30,
    progressOf: totals(30),
  },
];

/** 学习统计 + 真实计数 → 成就判定入参（装配只这一处，页面与 hook 共用） */
export function buildAchievementStats(
  stats: { streakDays: number; totalDays: number; todayMinutes: number; dailyGoalMinutes: number },
  counts: Partial<IAchievementCounts> = {},
): IAchievementStats {
  return {
    streakDays: stats.streakDays,
    totalDays: stats.totalDays,
    todayMinutes: stats.todayMinutes,
    dailyGoalMinutes: stats.dailyGoalMinutes,
    conversationCount: count(Number(counts.conversationCount)),
    shadowingCount: count(Number(counts.shadowingCount)),
  };
}

export function achievementProgress(
  achievement: IAchievement,
  stats: IAchievementStats,
): IAchievementProgress | null {
  if (!achievement.progressOf) return null;
  const progress = achievement.progressOf(stats);
  if (!progress) return null;
  const current = count(progress.current);
  const target = count(progress.target);
  // 目标为 0 的进度条没有意义（除零 / 永远 100%），按"给不出真实进度"处理
  if (target <= 0) return null;
  return { current, target, unit: progress.unit };
}

/** 0–100 的整数百分比，用于细进度条；已到顶就钉在 100 */
export function achievementRatio(progress: IAchievementProgress): number {
  if (progress.target <= 0) return 0;
  return Math.min(100, Math.round((progress.current / progress.target) * 100));
}

/** 「还差 4 天」；已经到目标返回 null（界面该显示解锁日期，不是"还差 0 天"） */
export function formatAchievementGap(progress: IAchievementProgress | null): string | null {
  if (!progress) return null;
  const remaining = progress.target - progress.current;
  if (remaining <= 0) return null;
  return `还差 ${remaining} ${progress.unit}`;
}
