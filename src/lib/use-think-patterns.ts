/**
 * 思维模式复习的进度 store（唯一权威源）。
 *
 * 存储形状见 src/lib/think-patterns.ts 的 IThinkPatternState：
 *   { progress: { [patternId]: IThinkPatternProgress }, daily: { [YYYY-MM-DD]: patternId[] } }
 *
 * 四条口径（与 use-phrase-learning / use-word-learning 同款）：
 *  ① **读盘边界清洗**：progress 里键与记录 `patternId` 不一致、或 id 不在 THINK_PATTERNS 里的条目
 *     一律丢弃 —— 幽灵记录会让同一个模式既出现在到期队列、又被当成「没学过」再引入一次，
 *     形状不对的条目还会把界面打崩；`daily` 只收字符串数组桶，坏桶不参与计数。
 *  ② **updater 保持纯**：setState updater 只算新状态，不写 storage、不弹提示（StrictMode 会双调用）；
 *     落盘统一在 effect 里，且先与存储比对同一份 JSON（下行重读后不回写）。
 *  ③ **回声抑制 / 首屏空态不写盘**：云同步下行后重读、以及首次挂载的 hydration 读到什么，
 *     都用 loadedFromStorageRef 标记；回写 effect 见同一引用就跳过。否则刚拉下来的远端值会被
 *     这台设备的旧内存态推回去，fresh device 上空 state 还会抢在第一次下行前写盘（双写排进上行队列 → 盖掉远端进度）。
 *  ④ **写失败可见**：safeStorage.setItem 返回 false（配额满/隐私模式）时 warnStorageFull()，
 *     不让"刷新后进度没了"变成无声事故。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { safeStorage } from '@/lib/safe-storage';
import { useSyncDown } from '@/lib/sync-down';
import { formatDate } from '@/lib/utils';
import { warnStorageFull } from '@/lib/capped-cache';
import { THINK_PATTERN_LAYERS, THINK_PATTERNS } from '@/data/think-patterns';
import {
  THINK_PATTERN_STORAGE_KEY,
  applyPatternResult,
  buildDelayedProbeQueue,
  buildReviewQueue,
  buildTransferTrend,
  isDue,
  pruneDaily,
  pruneDailyStats,
  type DiagnosticLayerScore,
  type DiagnosticResult,
  type IRealTaskRecord,
  type IThinkPatternDayStats,
  type IThinkPatternDiagnosticRecord,
  type IThinkPatternProgress,
  type IThinkPatternState,
  type IThinkPatternTrendPoint,
  type PatternGradeInput,
} from '@/lib/think-patterns';
import type { ThinkPatternLayer } from '@/data/think-patterns';

const KNOWN_PATTERN_IDS: ReadonlySet<string> = new Set(THINK_PATTERNS.map((p) => p.id));
const KNOWN_LAYER_IDS: readonly ThinkPatternLayer[] = THINK_PATTERN_LAYERS.map((layer) => layer.id);

export interface IThinkPatternStats {
  tracked: number;
  mastered: number;
  due: number;
  reviewedToday: number;
}

export interface IThinkPatternsApi {
  loaded: boolean;
  state: IThinkPatternState;
  progress: Record<string, IThinkPatternProgress>;
  stats: IThinkPatternStats;
  /** 本轮复习顺序：到期项在前、新引入项在后（新引入不算 due，见 stats.due） */
  dueQueue: string[];
  /** 独立延迟探测队列（7/21/60 天到期） */
  delayedQueue: string[];
  /** 最近一次思维体检；没有就是 null */
  diagnostic: IThinkPatternDiagnosticRecord | null;
  /** 体检复测历史（按日期新→旧，最多 10 次） */
  diagnosticHistory: IThinkPatternDiagnosticRecord[];
  /** 近 7 天迁移/校准趋势（缺的日期补 0） */
  trend: IThinkPatternTrendPoint[];
  /** 真实任务前测 / 后测；没有就是 null */
  realTask: IThinkPatternState['realTask'] | null;
  grade: (input: PatternGradeInput) => void;
  saveDiagnostic: (result: DiagnosticResult) => void;
  saveRealTask: (stage: 'baseline' | 'followUp', record: IRealTaskRecord) => void;
  getProgress: (patternId: string) => IThinkPatternProgress | null;
  resetAll: () => void;
}

function createEmptyState(): IThinkPatternState {
  return { progress: {}, daily: {} };
}

/**
 * 读盘边界的 progress 清洗（纯函数；守卫会把这整段抽出来真跑）。
 *  - 条目不是对象 → 丢；
 *  - `entry.patternId !== key` → 丢（键与记录不同源：按键取到的是别的模式的排期）；
 *  - key 不在已知模式 id 里 → 丢（内容库删过模式 / 远端脏数据）；
 *  - 缺 status / firstReviewedOn / 任一数字字段（残缺记录，例如只有 `{patternId}`）→ 丢：
 *    `nextReview` 是 undefined 时到期判断静默失效、`formatDate(new Date(undefined))` 还会产出
 *    Invalid Date，这条模式从此既不到期也显示不出下次复习时间。
 * 健康条目**原样保留引用**，不在读盘时顺手重写用户数据。
 */
function sanitizeProgress(raw: unknown, knownIds: ReadonlySet<string>): Record<string, IThinkPatternProgress> {
  const out: Record<string, IThinkPatternProgress> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const numericFields = [
    'easeFactor', 'interval', 'repetitions', 'nextReview', 'lastReview', 'lapses',
    'firstReviewedAt', 'recognitionCorrect', 'recognitionTotal', 'transferPasses',
    'transferAttempts', 'aiTransferPasses',
  ];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    if (entry.patternId !== key) continue;
    if (!knownIds.has(key)) continue;
    if (entry.status !== 'learning' && entry.status !== 'reviewing' && entry.status !== 'mastered') continue;
    if (typeof entry.firstReviewedOn !== 'string') continue;
    if (!numericFields.every((field) => {
      const fieldValue = entry[field];
      return typeof fieldValue === 'number' && Number.isFinite(fieldValue);
    })) continue;
    out[key] = entry as unknown as IThinkPatternProgress;
  }
  return out;
}

/** daily 只收「字符串数组」桶：坏桶会让 `[...todayList, id]` 把字符串拆成字符。 */
function sanitizeDaily(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [day, ids] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(ids)) continue;
    const clean = ids.filter((id): id is string => typeof id === 'string');
    if (clean.length > 0) out[day] = clean;
  }
  return out;
}

/** 每日迁移/校准计数：日期键必须是 YYYY-MM-DD，四项都是非负有限数；坏行整条丢。 */
function sanitizeDailyStats(raw: unknown): Record<string, IThinkPatternDayStats> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, IThinkPatternDayStats> = {};
  const fields: Array<keyof IThinkPatternDayStats> = [
    'attempts', 'passes', 'calibrationAttempts', 'calibrationHits',
  ];
  for (const [day, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    if (!fields.every((field) => {
      const fieldValue = row[field];
      return typeof fieldValue === 'number' && Number.isFinite(fieldValue) && fieldValue >= 0;
    })) continue;
    out[day] = {
      attempts: Math.floor(row.attempts as number),
      passes: Math.floor(row.passes as number),
      calibrationAttempts: Math.floor(row.calibrationAttempts as number),
      calibrationHits: Math.floor(row.calibrationHits as number),
    };
  }
  return out;
}

/**
 * 体检记录的读盘清洗：只保留汇总与建议，不存逐题答案。
 * 坏形状、未知层、未知模式 id 一律丢掉；整份坏掉时回退 undefined，不影响复习进度。
 */
function sanitizeDiagnostic(
  raw: unknown,
  knownPatternIds: ReadonlySet<string>,
  layerIds: readonly ThinkPatternLayer[],
): IThinkPatternDiagnosticRecord | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.completedOn !== 'string' || !entry.completedOn) return undefined;
  if (typeof entry.correct !== 'number' || !Number.isFinite(entry.correct)) return undefined;
  if (typeof entry.total !== 'number' || !Number.isFinite(entry.total)) return undefined;
  if (entry.correct < 0 || entry.total < 0 || entry.correct > entry.total) return undefined;
  if (!Array.isArray(entry.layers)) return undefined;

  const layers: DiagnosticLayerScore[] = [];
  for (const layer of entry.layers) {
    if (!layer || typeof layer !== 'object' || Array.isArray(layer)) continue;
    const row = layer as Record<string, unknown>;
    if (typeof row.layerId !== 'string' || !layerIds.includes(row.layerId as ThinkPatternLayer)) continue;
    if (typeof row.correct !== 'number' || !Number.isFinite(row.correct)) continue;
    if (typeof row.total !== 'number' || !Number.isFinite(row.total)) continue;
    layers.push({
      layerId: row.layerId as ThinkPatternLayer,
      correct: row.correct,
      total: row.total,
    });
  }
  if (layers.length === 0) return undefined;

  const recommendedPatternIds = Array.isArray(entry.recommendedPatternIds)
    ? entry.recommendedPatternIds.filter(
      (id): id is string => typeof id === 'string' && knownPatternIds.has(id),
    )
    : [];
  return {
    completedOn: entry.completedOn,
    correct: entry.correct,
    total: entry.total,
    layers,
    recommendedPatternIds,
  };
}

/** 体检历史：逐条过 sanitizeDiagnostic；同一天只留一条，最多 10 次。 */
function sanitizeDiagnosticHistory(
  raw: unknown,
  knownPatternIds: ReadonlySet<string>,
  layerIds: readonly ThinkPatternLayer[],
): IThinkPatternDiagnosticRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: IThinkPatternDiagnosticRecord[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const clean = sanitizeDiagnostic(entry, knownPatternIds, layerIds);
    if (!clean || seen.has(clean.completedOn)) continue;
    seen.add(clean.completedOn);
    out.push(clean);
    if (out.length >= 10) break;
  }
  return out;
}

function sanitizeRealTaskRecord(
  raw: unknown,
  knownPatternIds: ReadonlySet<string>,
): IRealTaskRecord | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const v = raw as Record<string, unknown>;
  if (typeof v.promptId !== 'string' || !v.promptId) return undefined;
  if (typeof v.prompt !== 'string' || !v.prompt) return undefined;
  if (typeof v.answer !== 'string' || !v.answer.trim()) return undefined;
  if (typeof v.completedOn !== 'string' || !v.completedOn) return undefined;
  if (typeof v.at !== 'number' || !Number.isFinite(v.at)) return undefined;
  if (typeof v.wordCount !== 'number' || !Number.isFinite(v.wordCount)) return undefined;
  if (v.source !== 'ai' && v.source !== 'self') return undefined;
  if (typeof v.feedback !== 'string') return undefined;

  const toIds = (value: unknown): string[] => (Array.isArray(value) ? value : [])
    .filter((id): id is string => typeof id === 'string' && knownPatternIds.has(id));
  const patternsUsed = toIds(v.patternsUsed).filter((id, index, list) => list.indexOf(id) === index);
  const patternsMissing = toIds(v.patternsMissing)
    .filter((id) => !patternsUsed.includes(id))
    .filter((id, index, list) => list.indexOf(id) === index);
  const toPhrases = (value: unknown): string[] => (Array.isArray(value) ? value : [])
    .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
    .map((text) => text.trim())
    .slice(0, 3);

  return {
    promptId: v.promptId,
    prompt: v.prompt,
    answer: v.answer,
    completedOn: v.completedOn,
    at: v.at,
    patternsUsed,
    patternsMissing,
    feedback: v.feedback,
    strengths: toPhrases(v.strengths),
    issues: toPhrases(v.issues),
    wordCount: v.wordCount,
    source: v.source,
  };
}

function sanitizeRealTask(
  raw: unknown,
  knownPatternIds: ReadonlySet<string>,
): IThinkPatternState['realTask'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const v = raw as Record<string, unknown>;
  const baseline = sanitizeRealTaskRecord(v.baseline, knownPatternIds);
  const followUp = sanitizeRealTaskRecord(v.followUp, knownPatternIds);
  if (!baseline && !followUp) return undefined;
  return {
    ...(baseline ? { baseline } : {}),
    ...(followUp ? { followUp } : {}),
  };
}

function load(): IThinkPatternState {
  try {
    const raw = safeStorage.getItem(THINK_PATTERN_STORAGE_KEY);
    if (!raw) return createEmptyState();
    const parsed = JSON.parse(raw);
    const today = formatDate(new Date());
    return {
      progress: sanitizeProgress(parsed?.progress, KNOWN_PATTERN_IDS),
      // 用本地 today 裁 daily：设备时钟回拨/时区切换留下的未来键不能当成今天的历史
      daily: pruneDaily(sanitizeDaily(parsed?.daily), today),
      dailyStats: pruneDailyStats(sanitizeDailyStats(parsed?.dailyStats), today),
      diagnostic: sanitizeDiagnostic(parsed?.diagnostic, KNOWN_PATTERN_IDS, KNOWN_LAYER_IDS),
      diagnosticHistory: sanitizeDiagnosticHistory(
        parsed?.diagnosticHistory, KNOWN_PATTERN_IDS, KNOWN_LAYER_IDS,
      ),
      realTask: sanitizeRealTask(parsed?.realTask, KNOWN_PATTERN_IDS),
    };
  } catch {
    return createEmptyState();
  }
}

export function useThinkPatterns(): IThinkPatternsApi {
  const [state, setState] = useState<IThinkPatternState>(createEmptyState);
  const [loaded, setLoaded] = useState(false);
  /** 「这份 state 是刚从 storage 读进来的」标记：回写 effect 见同一引用就跳过（防下行回声） */
  const loadedFromStorageRef = useRef<IThinkPatternState | null>(null);

  useEffect(() => {
    try {
      const next = load();
      // 初始 hydration 也来自 storage：同样打标记，落盘 effect 才会跳过这一份。
      // 不打标记的话，fresh device 上空的 {progress:{},daily:{}} 会在第一次下行到达前写盘，
      // safeStorage 双写把它排进上行队列，远端进度随后被这份空值盖掉（last-write-wins）。
      loadedFromStorageRef.current = next;
      setState(next);
    } finally {
      // load 自己吞掉解析错误，不会抛；这里仍按仓库口径保证页面不会永远 loading
      setLoaded(true);
    }
  }, []);

  /** 云同步下行后重读，否则这台设备拿着陈旧状态，下一次评分会把远端新值盖掉 */
  useSyncDown(() => {
    const next = load();
    loadedFromStorageRef.current = next;
    setState(next);
  });

  useEffect(() => {
    if (!loaded) return;
    if (loadedFromStorageRef.current === state) {
      loadedFromStorageRef.current = null;
      return;
    }
    const json = JSON.stringify(state);
    // 与存储一字不差就不写：掐掉"下行重读 → 回写 → 双写再把同一份推回云端"的回声
    if (safeStorage.getItem(THINK_PATTERN_STORAGE_KEY) === json) return;
    if (!safeStorage.setItem(THINK_PATTERN_STORAGE_KEY, json)) {
      warnStorageFull();
    }
  }, [loaded, state]);

  /** 评分：只算新状态（纯 updater），today 在事件层取一次，落盘交给 effect */
  const grade = useCallback((input: PatternGradeInput) => {
    const now = Date.now();
    const today = formatDate(new Date(now));
    setState((prev) => {
      const nextProgress = applyPatternResult(prev.progress[input.patternId], { ...input, today }, now);
      const todayList = prev.daily[today] ?? [];
      const dailyStats = pruneDailyStats(prev.dailyStats, today);
      const dayStats = dailyStats[today] ?? {
        attempts: 0, passes: 0, calibrationAttempts: 0, calibrationHits: 0,
      };
      const calibrated = input.confidence === 1 || input.confidence === 3;
      const calibrationHit = calibrated && (
        (input.confidence === 3 && input.transferPassed) ||
        (input.confidence === 1 && !input.transferPassed)
      );
      dailyStats[today] = {
        attempts: dayStats.attempts + 1,
        passes: dayStats.passes + (input.transferPassed ? 1 : 0),
        calibrationAttempts: dayStats.calibrationAttempts + (calibrated ? 1 : 0),
        calibrationHits: dayStats.calibrationHits + (calibrationHit ? 1 : 0),
      };
      return {
        ...prev,
        progress: { ...prev.progress, [input.patternId]: nextProgress },
        daily: {
          ...pruneDaily(prev.daily, today),
          [today]: todayList.includes(input.patternId) ? todayList : [...todayList, input.patternId],
        },
        dailyStats,
      };
    });
  }, []);

  const dueQueue = useMemo(() => {
    const now = Date.now();
    return buildReviewQueue({
      patterns: THINK_PATTERNS,
      progress: state.progress,
      now,
      today: formatDate(new Date(now)),
      // 每天轮转新引入的那一批，别让「今日先练」永远是同一个模式。
      freshSeed: Math.floor(now / 86_400_000),
    });
  }, [state.progress]);

  const delayedQueue = useMemo(() => {
    return buildDelayedProbeQueue(state.progress, Date.now());
  }, [state.progress]);

  const trend = useMemo(
    () => buildTransferTrend(state.dailyStats, formatDate(new Date()), 7),
    [state.dailyStats],
  );

  const stats = useMemo(() => {
    const now = Date.now();
    const today = formatDate(new Date(now));
    const all = Object.values(state.progress);
    return {
      tracked: all.length,
      mastered: all.filter((p) => p.status === 'mastered').length,
      // 只数「到期」：新引入项由 dueQueue 负责，不能算进 due（否则当天数字虚高）
      due: all.filter((p) => isDue(p, now, today)).length,
      reviewedToday: (state.daily[today] ?? []).length,
    };
  }, [state.progress, state.daily]);

  const saveDiagnostic = useCallback((result: DiagnosticResult) => {
    const today = formatDate(new Date());
    const record: IThinkPatternDiagnosticRecord = {
      completedOn: today,
      correct: result.correct,
      total: result.total,
      layers: result.layers,
      recommendedPatternIds: result.recommendedPatternIds,
    };
    setState((prev) => ({
      ...prev,
      diagnostic: record,
      // 同一天重测只留最新一条；历史最多 10 次。
      diagnosticHistory: [
        record,
        ...(prev.diagnosticHistory ?? []).filter((entry) => entry.completedOn !== today),
      ].slice(0, 10),
    }));
  }, []);

  const saveRealTask = useCallback((stage: 'baseline' | 'followUp', record: IRealTaskRecord) => {
    setState((prev) => ({
      ...prev,
      realTask: {
        ...prev.realTask,
        [stage]: record,
      },
    }));
  }, []);

  const getProgress = useCallback(
    (patternId: string) => state.progress[patternId] ?? null,
    [state.progress],
  );

  const resetAll = useCallback(() => setState(createEmptyState()), []);

  return {
    loaded,
    state,
    progress: state.progress,
    stats,
    dueQueue,
    delayedQueue,
    diagnostic: state.diagnostic ?? null,
    diagnosticHistory: state.diagnosticHistory ?? [],
    trend,
    realTask: state.realTask ?? null,
    grade,
    saveDiagnostic,
    saveRealTask,
    getProgress,
    resetAll,
  };
}
