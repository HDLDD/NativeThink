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
import { THINK_PATTERNS } from '@/data/think-patterns';
import {
  THINK_PATTERN_STORAGE_KEY,
  applyPatternResult,
  buildReviewQueue,
  isDue,
  pruneDaily,
  type IThinkPatternProgress,
  type IThinkPatternState,
  type PatternGradeInput,
} from '@/lib/think-patterns';

const KNOWN_PATTERN_IDS: ReadonlySet<string> = new Set(THINK_PATTERNS.map((p) => p.id));

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
  grade: (input: PatternGradeInput) => void;
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

function load(): IThinkPatternState {
  try {
    const raw = safeStorage.getItem(THINK_PATTERN_STORAGE_KEY);
    if (!raw) return createEmptyState();
    const parsed = JSON.parse(raw);
    return {
      progress: sanitizeProgress(parsed?.progress, KNOWN_PATTERN_IDS),
      // 用本地 today 裁 daily：设备时钟回拨/时区切换留下的未来键不能当成今天的历史
      daily: pruneDaily(sanitizeDaily(parsed?.daily), formatDate(new Date())),
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
      return {
        progress: { ...prev.progress, [input.patternId]: nextProgress },
        daily: {
          ...pruneDaily(prev.daily, today),
          [today]: todayList.includes(input.patternId) ? todayList : [...todayList, input.patternId],
        },
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
    });
  }, [state.progress]);

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
    grade,
    getProgress,
    resetAll,
  };
}
