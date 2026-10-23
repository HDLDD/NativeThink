/**
 * 思维模式复习的纯调度层：SM-2 / 会话队列 / 薄弱排序。
 *
 * 这一层**没有副作用**：不读存储、不取当前时间（`now` / `today` 一律由调用方传入）、
 * 不修改入参。存储与 React 接线在 use-think-patterns.ts（Task 4）。
 *
 * 只允许 `import type` —— 运行时零依赖，守卫才能把本文件真转译后直接 import 跑
 * （scripts/verify-think-patterns.mjs 的纯函数段）。
 *
 * SM-2 口径与句子复习（use-sentence-review.ts）一致：
 *   quality 5 = 识别对 + 迁移过；4 = 识别错 + 迁移过；3 = AI 不可用但自评做到；
 *   2 = 迁移失败（含自评没做到）。quality < 3 视为失败：repetitions=0、interval=0、
 *   nextReview=now（当轮可再练）、lapses+1。
 *   通过后间隔 1 → 3 → interval×easeFactor 天，easeFactor 最低 1.3。
 *   mastered 额外要求 aiTransferPasses >= 2 —— 纯自评不能把模式刷成已掌握。
 */
import type { IThinkPattern } from '@/data/think-patterns';

const DAY_MS = 24 * 60 * 60 * 1000;

export const THINK_PATTERN_STORAGE_KEY = '__nativethink_think_pattern_progress';

export interface IThinkPatternProgress {
  patternId: string;
  status: 'learning' | 'reviewing' | 'mastered';
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: number;
  lastReview: number;
  lapses: number;
  firstReviewedAt: number;
  /** 首次复习的本地日期键（YYYY-MM-DD），由调用方用 formatDate 传入 */
  firstReviewedOn: string;
  recognitionCorrect: number;
  recognitionTotal: number;
  transferPasses: number;
  transferAttempts: number;
  /** 只统计 AI 判定的迁移通过；自评不计入，mastered 用它兜底 */
  aiTransferPasses: number;
  lastAttempt?: {
    at: number;
    /** 本次尝试的本地日期键，供队列判断「今天已通过 / 今天失败」 */
    on: string;
    pass: boolean;
    recognitionCorrect: boolean;
    answer: string;
    feedback: string;
    /** AI 给出的证据短语 */
    evidence?: string;
    source: 'ai' | 'self';
  };
}

export interface IThinkPatternState {
  progress: Record<string, IThinkPatternProgress>;
  /** 日期 → 当天练过的模式 id（用于今日计数与去重） */
  daily: Record<string, string[]>;
}

export interface PatternResultInput {
  patternId: string;
  recognitionCorrect: boolean;
  transferPassed: boolean;
  source: 'ai' | 'self';
  answer: string;
  feedback: string;
  evidence?: string;
  today: string;
}

/** hook.grade 的入参：patternId 由调用方给，today 由 hook 补 */
export type PatternGradeInput = Omit<PatternResultInput, 'today'>;
/** 会话组件的 onGrade 入参：patternId 由顶层补 */
export type PatternSessionGradeInput = Omit<PatternResultInput, 'patternId' | 'today'>;

export interface BuildReviewQueueInput {
  patterns: IThinkPattern[];
  progress: Record<string, IThinkPatternProgress>;
  now?: number;
  today: string;
  maxPatterns?: number;
  maxNewPerDay?: number;
}

export interface PatternWeakItem {
  pattern: IThinkPattern;
  progress: IThinkPatternProgress;
  failureRate: number;
}

export type PatternSessionResult = 'pass' | 'fail';

/**
 * 一轮会话的纯状态：队列、当前下标、轮内重试次数、每个模式的**最终**结果。
 * 由 PatternReviewMode 持有，applySessionResult / advanceSession 只算新对象，不修改入参。
 * results 以 patternId 为键 —— 同一模式失败后重试通过，最终只留 'pass' 一条，完成页按不同模式计数。
 */
export interface PatternSessionState {
  queue: string[];
  index: number;
  retries: Record<string, number>;
  results: Record<string, PatternSessionResult>;
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

export function initialPatternProgress(patternId: string, now = Date.now()): IThinkPatternProgress {
  return {
    patternId,
    status: 'learning',
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    nextReview: now,
    lastReview: 0,
    lapses: 0,
    firstReviewedAt: now,
    firstReviewedOn: '',
    recognitionCorrect: 0,
    recognitionTotal: 0,
    transferPasses: 0,
    transferAttempts: 0,
    aiTransferPasses: 0,
  };
}

export function applyPatternResult(
  prev: IThinkPatternProgress | undefined,
  input: PatternResultInput,
  now = Date.now(),
): IThinkPatternProgress {
  const base = prev ?? initialPatternProgress(input.patternId, now);
  let { easeFactor, interval, repetitions, lapses, aiTransferPasses } = base;

  const quality: 2 | 3 | 4 | 5 = !input.transferPassed
    ? 2
    : input.source === 'self'
      ? 3
      : input.recognitionCorrect
        ? 5
        : 4;

  if (quality < 3) {
    // 失败立即回到「现在」：当轮就能再练，下一次会话也一定会再出现。
    repetitions = 0;
    interval = 0;
    lapses += 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 3;
    else interval = Math.round(Math.max(1, interval) * easeFactor);
    // 只有 AI 判定过、且这次真的迁移通过，才计入掌握所需的 AI 通过次数。
    if (input.source === 'ai' && input.transferPassed) aiTransferPasses += 1;
  }

  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  const mastered = repetitions >= 4 && interval >= 21 && aiTransferPasses >= 2;
  const status: IThinkPatternProgress['status'] =
    quality < 3 ? 'learning' : mastered ? 'mastered' : 'reviewing';

  return {
    ...base,
    status,
    easeFactor,
    interval,
    repetitions,
    lapses,
    aiTransferPasses,
    nextReview: interval === 0 ? now : now + interval * DAY_MS,
    lastReview: now,
    firstReviewedOn: base.firstReviewedOn || input.today,
    recognitionTotal: base.recognitionTotal + 1,
    recognitionCorrect: base.recognitionCorrect + (input.recognitionCorrect ? 1 : 0),
    transferAttempts: base.transferAttempts + 1,
    transferPasses: base.transferPasses + (input.transferPassed ? 1 : 0),
    lastAttempt: {
      at: now,
      on: input.today,
      pass: input.transferPassed,
      recognitionCorrect: input.recognitionCorrect,
      answer: truncate(input.answer, 300),
      feedback: truncate(input.feedback, 400),
      evidence: input.evidence ? truncate(input.evidence, 200) : undefined,
      source: input.source,
    },
  };
}

/**
 * 是否该在**本轮会话**出现：到期、未掌握，且今天还没有通过过。
 * 今天失败（lastAttempt.pass === false）不算「今天已通过」，所以失败项会回队。
 */
export function isDue(p: IThinkPatternProgress, now: number, today: string): boolean {
  return p.status !== 'mastered' && p.nextReview <= now &&
    !(p.lastAttempt?.pass === true && p.lastAttempt.on === today);
}

/** 识别题轮换：按累计识别次数取模（deterministic，不依赖随机数）。 */
export function pickRecognitionIndex(total: number, length: number): number {
  return length > 0 ? total % length : 0;
}

/** 迁移题轮换：按累计迁移尝试次数取模。 */
export function pickTransferIndex(total: number, length: number): number {
  return length > 0 ? total % length : 0;
}

/**
 * 一轮会话的队列：到期项（按 nextReview 升序）在前，新引入项在后，合并后截断。
 * 每日上限按「不同模式」算：maxPatterns=10、maxNewPerDay=2（今天已引入的计入额度）。
 */
export function buildReviewQueue({
  patterns, progress, now = Date.now(), today, maxPatterns = 10, maxNewPerDay = 2,
}: BuildReviewQueueInput): string[] {
  const knownIds = new Set(patterns.map((p) => p.id));
  const newIntroducedToday = Object.values(progress)
    .filter((p) => knownIds.has(p.patternId) && p.firstReviewedOn === today).length;
  const newBudget = Math.max(0, maxNewPerDay - newIntroducedToday);
  const due = Object.values(progress)
    .filter((p) => knownIds.has(p.patternId) && isDue(p, now, today))
    .sort((a, b) => a.nextReview - b.nextReview)
    .map((p) => p.patternId);
  const known = new Set(Object.keys(progress));
  const fresh = patterns.filter((p) => !known.has(p.id)).slice(0, newBudget).map((p) => p.id);
  return [...due, ...fresh].slice(0, maxPatterns);
}

/**
 * 轮内失败回队尾。返回新对象，不修改入参；超过 maxRetries 次就不再回队
 * （但 nextReview=now 会让它在下一次会话再次出现）。
 */
export function pushRetry(
  queue: string[],
  patternId: string,
  retries: Record<string, number>,
  maxRetries = 2,
): { queue: string[]; retries: Record<string, number>; retried: boolean } {
  const count = retries[patternId] ?? 0;
  if (count >= maxRetries) return { queue, retries, retried: false };
  return {
    queue: [...queue, patternId],
    retries: { ...retries, [patternId]: count + 1 },
    retried: true,
  };
}

/**
 * 通过后清掉排在后面的重复副本；当前位置及之前的一律保留
 * （队首可能正是刚答完的那张，由调用方自行推进下标）。
 */
export function dropQueuedRetries(queue: string[], currentIndex: number, patternId: string): string[] {
  return queue.filter((id, i) => i <= currentIndex || id !== patternId);
}

/* ── 会话状态机（纯函数）────────────────────────────────────────────────────
 * 队列/下标/重试/结果编排从 PatternReviewMode 抽出来：组件只做 setSession(applySessionResult(...))。
 * 这些语义改坏后界面看起来照常（少回队一次、完成页多数一个），静态检查看不见 ——
 * 所以由 verify-think-patterns 真转译真跑，并逐条跑变异。
 */

/** 开一轮会话：队列拷贝一份（不持有调用方的数组引用） */
export function createPatternSession(queue: string[]): PatternSessionState {
  return { queue: [...queue], index: 0, retries: {}, results: {} };
}

/**
 * 记一次结果并同步调整队列：通过 → 记 pass 并清掉排在后面的重复副本；
 * 失败 → 记 fail 并回队尾（最多 maxRetries 次，超过后队列不变，由调用方 advance 到收尾）。
 * results 按 patternId 覆盖：重试通过后最终结果就是 pass，完成页不会把同一模式数两次。
 */
export function applySessionResult(
  state: PatternSessionState,
  patternId: string,
  passed: boolean,
  maxRetries = 2,
): PatternSessionState {
  const results: Record<string, PatternSessionResult> = {
    ...state.results,
    [patternId]: passed ? 'pass' : 'fail',
  };
  if (passed) {
    return { ...state, results, queue: dropQueuedRetries(state.queue, state.index, patternId) };
  }
  const retry = pushRetry(state.queue, patternId, state.retries, maxRetries);
  return { ...state, results, queue: retry.queue, retries: retry.retries };
}

/** 推进到下一张；已在队尾则 done=true（下标越界前就停住，不产生空卡）。 */
export function advanceSession(state: PatternSessionState): { state: PatternSessionState; done: boolean } {
  if (state.index + 1 >= state.queue.length) return { state, done: true };
  return { state: { ...state, index: state.index + 1 }, done: false };
}

/** 完成页计数：按不同模式（results 的键）统计，重试不重复计数。 */
export function sessionCounts(
  state: PatternSessionState,
): { total: number; passed: number; failed: number } {
  const values = Object.values(state.results);
  const passed = values.filter((r) => r === 'pass').length;
  const failed = values.filter((r) => r === 'fail').length;
  return { total: values.length, passed, failed };
}

/**
 * 薄弱模式：lapses 降序 → 迁移失败率降序 → nextReview 升序，取前 limit 个。
 * 只收 lapses > 0 或有迁移失败的；没有记录的模式不参与。
 */
export function getWeakPatterns(
  patterns: IThinkPattern[],
  progress: Record<string, IThinkPatternProgress>,
  limit = 3,
): PatternWeakItem[] {
  return patterns
    .map((pattern) => {
      const p = progress[pattern.id];
      if (!p) return null;
      const failureRate = p.transferAttempts === 0 ? 0 : (p.transferAttempts - p.transferPasses) / p.transferAttempts;
      return { pattern, progress: p, failureRate };
    })
    .filter((row): row is PatternWeakItem => !!row && (row.progress.lapses > 0 || row.failureRate > 0))
    .sort((a, b) =>
      b.progress.lapses - a.progress.lapses ||
      b.failureRate - a.failureRate ||
      a.progress.nextReview - b.progress.nextReview)
    .slice(0, limit);
}

/**
 * `daily` 只保留 [today - (days - 1), today] 这段日期（含今天共 days 天），
 * 不是「最后 N 个键」—— 隔了几天没练也不会把有效日期误删。结果按日期升序。
 *
 * 上界必须有：设备时钟回拨/时区切换可能在 `daily` 里留下 `> today` 的键，
 * 未来日期既不该计入今日，也不该留到未来 —— 一旦留下，新"今天"会把它当历史重复计。
 */
export function pruneDaily(
  daily: Record<string, string[]>,
  today: string,
  days = 31,
): Record<string, string[]> {
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() - (days - 1));
  const pad = (n: number) => String(n).padStart(2, '0');
  const cutoff = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return Object.fromEntries(
    Object.entries(daily)
      .filter(([key]) => key >= cutoff && key <= today)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}
