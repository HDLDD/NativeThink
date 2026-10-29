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
import type { IThinkPattern, IThinkPatternDiagnosticItem, ThinkPatternLayer } from '@/data/think-patterns';

const DAY_MS = 24 * 60 * 60 * 1000;

export const THINK_PATTERN_STORAGE_KEY = '__nativethink_think_pattern_progress';

/** 迁移提交前的自评：1 没把握 / 2 一般 / 3 有把握；2 不计入校准 */
export type PatternConfidence = 1 | 2 | 3;

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
  /** “有把握/没把握”的预测与最终结果一致的次数；一般(2)不计入 */
  calibrationAttempts?: number;
  calibrationHits?: number;
  lastConfidence?: PatternConfidence;
  /** 下一次 7/21/60 天延迟探测的到期时间；undefined 表示尚未安排或已完成 */
  delayedProbeAt?: number;
  /** 已通过的延迟探测数（0→7 天，1→21 天，2→60 天） */
  delayedProbeCount?: number;
  delayedProbeAttempts?: number;
  delayedProbePasses?: number;
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
    /** 提交前的自评；旧记录可能没有 */
    confidence?: PatternConfidence;
    /** 这次是否是独立的延迟探测 */
    delayedProbe?: boolean;
  };
}

export interface IRealTaskRecord {
  promptId: string;
  prompt: string;
  answer: string;
  completedOn: string;
  at: number;
  patternsUsed: string[];
  patternsMissing: string[];
  feedback: string;
  strengths: string[];
  issues: string[];
  wordCount: number;
  source: 'ai' | 'self';
}

/** 每日迁移/校准计数：只用于趋势，不参与 SM-2。旧记录没有这个字段时按空算。 */
export interface IThinkPatternDayStats {
  attempts: number;
  passes: number;
  calibrationAttempts: number;
  calibrationHits: number;
}

export interface IThinkPatternTrendPoint extends IThinkPatternDayStats {
  date: string;
}

export interface IThinkPatternState {
  progress: Record<string, IThinkPatternProgress>;
  /** 日期 → 当天练过的模式 id（用于今日计数与去重） */
  daily: Record<string, string[]>;
  /** 日期 → 当天迁移/校准计数；只保留最近 31 天 */
  dailyStats?: Record<string, IThinkPatternDayStats>;
  /** 最近一次思维体检；只存汇总与建议，不存逐题答案 */
  diagnostic?: IThinkPatternDiagnosticRecord;
  /** 体检复测历史（最多 10 次，按 completedOn 去重） */
  diagnosticHistory?: IThinkPatternDiagnosticRecord[];
  /** 真实任务前后测；只保留前测/后测各一条 */
  realTask?: {
    baseline?: IRealTaskRecord;
    followUp?: IRealTaskRecord;
  };
}

export interface PatternResultInput {
  patternId: string;
  recognitionCorrect: boolean;
  transferPassed: boolean;
  source: 'ai' | 'self';
  answer: string;
  feedback: string;
  evidence?: string;
  /** 提交前的自评；缺省表示旧版本/未选择，不计入校准 */
  confidence?: PatternConfidence;
  /** 这次是否是独立的延迟探测（不是普通复习） */
  delayedProbe?: boolean;
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
    calibrationAttempts: 0,
    calibrationHits: 0,
    delayedProbeCount: 0,
    delayedProbeAttempts: 0,
    delayedProbePasses: 0,
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

  const confidence = input.confidence;
  const calibrated = confidence === 1 || confidence === 3;
  const calibrationHit = calibrated && (
    (confidence === 3 && input.transferPassed) ||
    (confidence === 1 && !input.transferPassed)
  );
  const calibrationAttempts = (base.calibrationAttempts ?? 0) + (calibrated ? 1 : 0);
  const calibrationHits = (base.calibrationHits ?? 0) + (calibrationHit ? 1 : 0);

  const isDelayedProbe = input.delayedProbe === true;
  let delayedProbeAt = base.delayedProbeAt;
  let delayedProbeCount = base.delayedProbeCount ?? 0;
  let delayedProbeAttempts = base.delayedProbeAttempts ?? 0;
  let delayedProbePasses = base.delayedProbePasses ?? 0;
  if (isDelayedProbe) {
    delayedProbeAttempts += 1;
    if (input.transferPassed) {
      delayedProbePasses += 1;
      delayedProbeCount += 1;
      if (delayedProbeCount === 1) delayedProbeAt = now + 21 * DAY_MS;
      else if (delayedProbeCount === 2) delayedProbeAt = now + 60 * DAY_MS;
      else delayedProbeAt = undefined;
    } else {
      // 延迟探测失败：次日再测，但不把下一次排期丢到很久以后
      delayedProbeAt = now + DAY_MS;
    }
  } else if (quality >= 3 && delayedProbeAt == null && delayedProbeCount < 3) {
    // 普通复习第一次通过后安排 7 天后的独立延迟探测
    delayedProbeAt = now + 7 * DAY_MS;
  }

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
    calibrationAttempts,
    calibrationHits,
    lastConfidence: confidence ?? base.lastConfidence,
    delayedProbeAt,
    delayedProbeCount,
    delayedProbeAttempts,
    delayedProbePasses,
    lastAttempt: {
      at: now,
      on: input.today,
      pass: input.transferPassed,
      recognitionCorrect: input.recognitionCorrect,
      answer: truncate(input.answer, 300),
      feedback: truncate(input.feedback, 400),
      evidence: input.evidence ? truncate(input.evidence, 200) : undefined,
      source: input.source,
      confidence,
      delayedProbe: isDelayedProbe,
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
 * 闭卷迁移：同一模式第 3 次及以后复习收起“先想三步”。
 * 失败会把 repetitions 重置为 0，所以当轮重试和下一次失败后的复习自动回到开卷。
 */
export function isClosedBook(
  progress?: Pick<IThinkPatternProgress, 'repetitions'> | null,
): boolean {
  return (progress?.repetitions ?? 0) >= 2;
}

export type DelayedProbeDay = 7 | 21 | 60;

/** 下一次延迟探测的档位：0 次通过 → 7 天，1 次 → 21 天，2 次 → 60 天。 */
export function delayedProbeDays(
  progress?: Pick<IThinkPatternProgress, 'delayedProbeCount'> | null,
): DelayedProbeDay {
  const count = progress?.delayedProbeCount ?? 0;
  return count === 0 ? 7 : count === 1 ? 21 : 60;
}

/** 到期未做的延迟探测，按到期时间升序；最多 max 个。 */
export function buildDelayedProbeQueue(
  progress: Record<string, IThinkPatternProgress>,
  now: number,
  max = 5,
): string[] {
  return Object.values(progress)
    .filter((record) => typeof record.delayedProbeAt === 'number' && record.delayedProbeAt <= now)
    .sort((a, b) => (a.delayedProbeAt ?? 0) - (b.delayedProbeAt ?? 0))
    .slice(0, Math.max(0, max))
    .map((record) => record.patternId);
}

export interface DiagnosticLayerScore {
  layerId: ThinkPatternLayer;
  correct: number;
  total: number;
}

export interface DiagnosticResult {
  correct: number;
  total: number;
  layers: DiagnosticLayerScore[];
  /** 这次识别没抓住的模式，按四层顺序排列 */
  missedPatternIds: string[];
  /** 建议接下来练的模式；当前与 missedPatternIds 同源 */
  recommendedPatternIds: string[];
}

export interface IThinkPatternDiagnosticRecord {
  completedOn: string;
  correct: number;
  total: number;
  layers: DiagnosticLayerScore[];
  recommendedPatternIds: string[];
}

/**
 * 思维体检计分：只算识别对错，不写进度、不生成“思维分”。
 * 缺失/拼错的 patternId 或 choiceId 直接跳过，不让坏数据把整份体检打崩。
 */
export function scoreDiagnostic(
  patterns: IThinkPattern[],
  items: readonly IThinkPatternDiagnosticItem[],
  answers: Record<string, number>,
  layerIds: readonly ThinkPatternLayer[],
): DiagnosticResult {
  const byId = new Map(patterns.map((pattern) => [pattern.id, pattern]));
  const layerOrder = new Map(layerIds.map((layerId, index) => [layerId, index]));
  const perLayer = new Map<ThinkPatternLayer, DiagnosticLayerScore>(
    layerIds.map((layerId) => [layerId, { layerId, correct: 0, total: 0 }]),
  );
  const missed = new Set<string>();
  let correct = 0;

  for (const item of items) {
    const pattern = byId.get(item.patternId);
    const choice = pattern?.recognition.find((candidate) => candidate.id === item.choiceId);
    if (!pattern || !choice) continue;
    const isCorrect = answers[item.choiceId] === choice.answer;
    const layer = perLayer.get(pattern.layer);
    if (layer) {
      layer.total += 1;
      if (isCorrect) layer.correct += 1;
    }
    if (isCorrect) correct += 1;
    else missed.add(pattern.id);
  }

  const missedPatterns = patterns
    .filter((pattern) => missed.has(pattern.id))
    .sort((a, b) => (layerOrder.get(a.layer) ?? 0) - (layerOrder.get(b.layer) ?? 0));
  return {
    correct,
    total: items.length,
    layers: layerIds.map((layerId) => perLayer.get(layerId)!).filter(Boolean),
    missedPatternIds: missedPatterns.map((pattern) => pattern.id),
    recommendedPatternIds: missedPatterns.map((pattern) => pattern.id),
  };
}

/**
 * 按体检结果组一轮复习：去掉已掌握与今天已通过的模式。
 * 返回空数组时由调用方回落到正常的到期队列，不把“全对”变成“今天不用练”。
 */
export function buildDiagnosticQueue(
  recommendedPatternIds: readonly string[],
  progress: Record<string, IThinkPatternProgress>,
  today: string,
  maxPatterns = 10,
): string[] {
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const id of recommendedPatternIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const record = progress[id];
    if (record && (
      record.status === 'mastered' ||
      (record.lastAttempt?.pass === true && record.lastAttempt.on === today)
    )) continue;
    queue.push(id);
    if (queue.length >= maxPatterns) break;
  }
  return queue;
}

/**
 * 自由训练的混合队列：挑练得最少的模式，平手按数据顺序。
 * 不受 due / 每日新名额限制 —— 用户明确点了“自由训练”。
 */
export function pickPracticePatternIds(
  patterns: IThinkPattern[],
  progress: Record<string, IThinkPatternProgress>,
  limit = 5,
): string[] {
  return [...patterns]
    .sort((a, b) =>
      (progress[a.id]?.transferAttempts ?? 0) - (progress[b.id]?.transferAttempts ?? 0))
    .slice(0, Math.max(0, limit))
    .map((pattern) => pattern.id);
}

export interface PatternLayerSummary {
  layerId: ThinkPatternLayer;
  total: number;
  mastered: number;
  due: number;
}

/**
 * 四层模式地图的只读汇总。due 沿用 isDue 口径：未开始的模式不算到期，
 * 今天已通过的模式也不算到期（与概览三格保持一致）。
 */
export function summarizeLayers(
  patterns: IThinkPattern[],
  progress: Record<string, IThinkPatternProgress>,
  layerIds: readonly ThinkPatternLayer[],
  now: number,
  today: string,
): PatternLayerSummary[] {
  return layerIds.map((layerId) => {
    const items = patterns.filter((p) => p.layer === layerId);
    const records = items.map((p) => progress[p.id]).filter((p): p is IThinkPatternProgress => !!p);
    return {
      layerId,
      total: items.length,
      mastered: records.filter((p) => p.status === 'mastered').length,
      due: records.filter((p) => isDue(p, now, today)).length,
    };
  });
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

/** 同 pruneDaily 的窗口口径；坏日期键与未来日期一律丢掉。 */
export function pruneDailyStats(
  stats: Record<string, IThinkPatternDayStats> | undefined,
  today: string,
  days = 31,
): Record<string, IThinkPatternDayStats> {
  if (!stats) return {};
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() - (days - 1));
  const pad = (n: number) => String(n).padStart(2, '0');
  const cutoff = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return Object.fromEntries(
    Object.entries(stats)
      .filter(([key]) => key >= cutoff && key <= today)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** 近 N 天趋势：缺的日期补 0，顺序从最早到今天；首页/概览直接渲染。 */
export function buildTransferTrend(
  stats: Record<string, IThinkPatternDayStats> | undefined,
  today: string,
  days = 7,
): IThinkPatternTrendPoint[] {
  const end = new Date(`${today}T00:00:00`);
  const pad = (n: number) => String(n).padStart(2, '0');
  const points: IThinkPatternTrendPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const d = new Date(end);
    d.setDate(d.getDate() - offset);
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const row = stats?.[date];
    points.push({
      date,
      attempts: row?.attempts ?? 0,
      passes: row?.passes ?? 0,
      calibrationAttempts: row?.calibrationAttempts ?? 0,
      calibrationHits: row?.calibrationHits ?? 0,
    });
  }
  return points;
}
