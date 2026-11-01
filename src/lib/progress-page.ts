/**
 * 学习记录页 — 图表、日历与成就的纯逻辑（页面与守卫共用）。
 *
 * 为什么要单独抽：模块占比图过去把 `moduleProgress` 的原始分值塞给 Recharts，
 * tooltip 却按 `${value}%` 显示 —— 三个模块各 50 分时会显示三个 50%，但实际份额
 * 是 33% / 33% / 33%。归一与最大余数补差必须在一个可测试的地方做。
 */

export interface IModuleShare {
  key: string;
  name: string;
  color: string;
  /** 0–100 的整数，所有非空项相加恰好 100（最大余数法） */
  percent: number;
}

export const MODULE_COLORS: Record<string, string> = {
  think: 'var(--brand)',
  chunks: '#1F2937',
  conversation: '#6366F1',
  shadowing: '#F97316',
  vocabulary: '#EC4899',
  writing: '#8B5CF6',
  articles: '#0EA5E9',
  spelling: '#F43F5E',
  video: '#14B8A6',
  sentences: '#F59E0B',
};

export const MODULE_NAMES: Record<string, string> = {
  vocabulary: '词汇深度',
  articles: '文章阅读',
  spelling: '句子拼写',
  video: '视频精听',
  think: '思维训练',
  chunks: '语块训练',
  conversation: '对话练习',
  shadowing: '影子跟读',
  sentences: '句子学习',
  writing: '写作练习',
};

/**
 * 模块进度分 → 整数百分比。
 *
 * 输入是 `moduleProgress`（每个模块的分值，不是分钟），先过滤 0/负数/NaN，
 * 再用最大余数法把舍入误差补到余数最大的项上 —— 否则 1/1/1 会显示 33/33/33，
 * tooltip 加起来只有 99%。返回按 percent 降序（同分保持原 key 顺序）。
 */
export function buildModuleShares(
  progress: Record<string, number>,
  names: Record<string, string> = MODULE_NAMES,
  colors: Record<string, string> = MODULE_COLORS,
): IModuleShare[] {
  const items = Object.entries(progress)
    .map(([key, value]) => ({ key, value: Number(value) }))
    .filter((x) => Number.isFinite(x.value) && x.value > 0);
  const total = items.reduce((sum, x) => sum + x.value, 0);
  if (!(total > 0)) return [];

  const raw = items.map((x) => (x.value / total) * 100);
  const floors = raw.map((x) => Math.floor(x));
  let remainder = 100 - floors.reduce((sum, x) => sum + x, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < order.length && remainder > 0; i++) {
    floors[order[i].index] += 1;
    remainder -= 1;
  }

  return items
    .map((x, index) => ({
      key: x.key,
      name: names[x.key] ?? x.key,
      color: colors[x.key] ?? '#94A3B8',
      percent: floors[index],
    }))
    .sort((a, b) => b.percent - a.percent || a.key.localeCompare(b.key));
}

/* ───────────── 思维迁移趋势（学习记录页） ───────────── */

export interface ITransferTrendSummary {
  attempts: number;
  passes: number;
  /** 0–100 的整数；一次都没练时为 null —— 不把「没练过」画成 0% */
  passRate: number | null;
  calibrationAttempts: number;
  calibrationHits: number;
  calibrationRate: number | null;
  /** 当天至少有 1 次迁移尝试的天数（补零的日子不算） */
  activeDays: number;
}

/** `2026-11-01` → `11/1`（与页面既有图表标签同形；不经过 Date，避开时区） */
export function formatTransferTrendLabel(date: string): string {
  const parts = String(date).split('-');
  if (parts.length !== 3) return String(date);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return String(date);
  return `${month}/${day}`;
}

/**
 * 把最近 N 天的迁移/校准计数收成一组可展示的汇总。
 * 输入来自 think store 的 `dailyStats`（读盘时已清洗、31 天窗口），这里仍做数值兜底：
 * 负数/NaN 记 0，通过数按尝试数封顶，避免坏数据把通过率算到 100% 以上。
 */
export function summarizeTransferTrend(
  points: ReadonlyArray<{
    attempts: number;
    passes: number;
    calibrationAttempts: number;
    calibrationHits: number;
  }>,
): ITransferTrendSummary {
  const safe = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);
  let attempts = 0;
  let passes = 0;
  let calibrationAttempts = 0;
  let calibrationHits = 0;
  let activeDays = 0;
  for (const point of points) {
    const dayAttempts = safe(point.attempts);
    attempts += dayAttempts;
    passes += safe(point.passes);
    calibrationAttempts += safe(point.calibrationAttempts);
    calibrationHits += safe(point.calibrationHits);
    if (dayAttempts > 0) activeDays += 1;
  }
  const rate = (hits: number, total: number) =>
    total > 0 ? Math.min(100, Math.round((hits / total) * 100)) : null;
  return {
    attempts,
    passes,
    passRate: rate(Math.min(passes, attempts), attempts),
    calibrationAttempts,
    calibrationHits,
    calibrationRate: rate(Math.min(calibrationHits, calibrationAttempts), calibrationAttempts),
    activeDays,
  };
}

export function isCurrentMonth(year: number, month: number, now: Date = new Date()): boolean {
  return year === now.getFullYear() && month === now.getMonth();
}

/** 只能翻到本月为止；未来月份没有数据，也不该让人以为有记录 */
export function canGoToNextMonth(year: number, month: number, now: Date = new Date()): boolean {
  return year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth());
}

/**
 * 成就解锁优先，未解锁在后；两组内部保持定义表原顺序（不按名称/时间乱跳）。
 * 返回新数组，不改调用方传入的 definitions。
 */
export function sortAchievements<T extends { id: string }>(definitions: T[], unlockedIds: Iterable<string>): T[] {
  const unlocked = new Set(unlockedIds);
  const order = new Map(definitions.map((d, index) => [d.id, index]));
  return [...definitions].sort((a, b) => {
    const ua = unlocked.has(a.id) ? 0 : 1;
    const ub = unlocked.has(b.id) ? 0 : 1;
    if (ua !== ub) return ua - ub;
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  });
}