/**
 * quickcard-history — 快速闪卡「每轮学完的词表」本地留档。
 *
 * 为什么需要：快速闪卡是随手过的模式，一轮 20~100 个词刷完就什么也不剩，
 * 用户想"回头把刚才没记住的那几个再过一遍"没有任何入口。主流背单词 App
 * （墨墨/不背/扇贝）都会把每次学完的词表落成一条记录，可回看、可重练。
 *
 * 设计取舍：
 *  - 只存**词面 + 认识与否**，不存释义快照 —— 释义/例句永远从词库实时取，
 *    避免词库更新后记录里留着过时的旧释义（也把存储量压到最小）。
 *  - 最多保留 MAX_RUNS 轮（滚动淘汰最旧的），避免 localStorage 无限膨胀。
 *  - 与 custom-words 同一套「safeStorage + 事件广播 + 模块级缓存」写法，
 *    多组件同时展示时保持一致。
 */
import { useEffect, useState, useCallback } from 'react';
import { useSyncDown } from './sync-down';
import { safeStorage } from './safe-storage';

const KEY = '__nativethink_quickcard_runs';
const EVENT = 'nativethink-quickcard-runs-changed';
const MAX_RUNS = 20;
/**
 * 单轮最多落盘多少个词 —— 「全部」模式下一轮可能几千词，全存会把 localStorage 撑爆
 * （词库 detail 缓存也在这块配额里）。留档只用于"回头重练"，截断到 300 足够。
 */
const MAX_WORDS_PER_RUN = 300;

export interface IQuickCardWordResult {
  word: string;
  known: boolean;
}

export interface IQuickCardRun {
  id: string;
  /** 词书 key（'all' 表示混合） */
  level: string;
  /** 结束时间戳 */
  at: number;
  known: number;
  unknown: number;
  /** 本轮出过的词，按出卡顺序 */
  words: IQuickCardWordResult[];
  /** 切分依据（当时的每轮数量）；0/缺省 = 未切分（「全部」档位） */
  size?: number;
}

let _cache: IQuickCardRun[] | null = null;

function read(): IQuickCardRun[] {
  if (_cache) return _cache;
  try {
    const raw = safeStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    _cache = Array.isArray(parsed)
      ? parsed.filter((r) => r && typeof r.id === 'string' && Array.isArray(r.words))
      : [];
  } catch { _cache = []; }
  return _cache;
}

function write(list: IQuickCardRun[]) {
  _cache = list;
  try { safeStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota / private mode */ }
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* ignore */ }
}

/**
 * 云同步下行后作废 runs 缓存 —— 直接 listQuickCardRuns() 会命中 `_cache`，重读变摆设。
 * （「当前累积」不走缓存，每次现读，不需要这一下。）
 */
export function invalidateQuickCardRunsCache(): void {
  _cache = null;
}

/** 全部记录（最新在前）；传 level 只看该词书 */
export function listQuickCardRuns(level?: string): IQuickCardRun[] {
  const all = read();
  const list = level ? all.filter((r) => r.level === level) : all;
  return [...list].sort((a, b) => b.at - a.at);
}

export function getQuickCardRun(id: string): IQuickCardRun | undefined {
  return read().find((r) => r.id === id);
}

/**
 * 词表指纹 —— **同一批词（与顺序无关）视为同一份列表**。
 *
 * 用途：同一个 10 词列表被反复重练时，不要在学习记录里排出一长串一模一样的条目；
 * 再次学完就更新原来那条（时间/对错刷新 + 提到最前），而不是新增。
 */
export function listSignature(words: IQuickCardWordResult[]): string {
  return words.map((w) => w.word.trim().toLowerCase()).sort().join('\u0001');
}

/** 落一条记录；返回写入后的记录（id/at 已补齐）。重复词表会**替换**已有条目而不是新增 */
export function saveQuickCardRun(
  run: Omit<IQuickCardRun, 'id' | 'at'> & { id?: string; at?: number },
): IQuickCardRun {
  const entry: IQuickCardRun = {
    id: run.id || `qc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    level: run.level,
    at: run.at ?? Date.now(),
    known: run.known,
    unknown: run.unknown,
    words: run.words.slice(0, MAX_WORDS_PER_RUN),
    size: run.size,
  };
  const sig = listSignature(entry.words);
  // 同词书 + 同词表 → 顶掉旧的那条（避免列表里出现一串完全相同的记录）
  const rest = read().filter((r) => !(r.level === entry.level && listSignature(r.words) === sig));
  const kept = [entry, ...rest].slice(0, MAX_RUNS);
  write(kept);
  return entry;
}

export function removeQuickCardRun(id: string): void {
  write(read().filter((r) => r.id !== id));
}

export function clearQuickCardRuns(level?: string): void {
  write(level ? read().filter((r) => r.level !== level) : []);
}

// ────────────────────────────────────────────────────────────────────────────
// 「当前累积」桶 —— 学完的词表按**选择的数量**切成整份记录，
// 不足一份的余数先留在这里，等下一轮补满再自动升格成一条完整记录。
// 这就是"所学单词超出选择的单词量 → 列对应数量的列表保存，多余的存在当前单词量里"。
// ────────────────────────────────────────────────────────────────────────────

export interface IQuickCardPending {
  level: string;
  /** 切分依据（= 当时的每轮数量） */
  size: number;
  words: IQuickCardWordResult[];
}

const PENDING_KEY = '__nativethink_quickcard_pending';

function readPending(): IQuickCardPending | null {
  try {
    const raw = safeStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p.level !== 'string' || !Array.isArray(p.words)) return null;
    return { level: p.level, size: Number(p.size) || 0, words: p.words };
  } catch { return null; }
}

function writePending(p: IQuickCardPending | null) {
  try {
    if (!p || p.words.length === 0) safeStorage.removeItem(PENDING_KEY);
    else safeStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch { /* quota */ }
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* ignore */ }
}

export function getQuickCardPending(level?: string): IQuickCardPending | null {
  const p = readPending();
  if (!p) return null;
  return level && p.level !== level ? null : p;
}

export function clearQuickCardPending(): void { writePending(null); }

/**
 * 把一轮学完的词并入「当前累积」，并按 size 切出完整记录。
 *
 * @returns 本轮实际升格成的完整记录数
 *
 * size <= 0（「全部」档位）时不做切分：一轮本来就没有"对应数量"可言，整轮存一条。
 */
export function absorbQuickCardRun(
  level: string,
  size: number,
  words: IQuickCardWordResult[],
): number {
  if (words.length === 0) return 0;
  if (size <= 0) {
    saveQuickCardRun({ level, known: words.filter((w) => w.known).length, unknown: words.filter((w) => !w.known).length, words });
    return 1;
  }
  const prev = getQuickCardPending(level);
  // 数量档位变了：旧余数先按它自己的 size 结算掉，避免两种数量混在一份记录里
  let carry: IQuickCardWordResult[] = [];
  if (prev && prev.size !== size) {
    if (prev.words.length > 0) {
      saveQuickCardRun({
        level,
        known: prev.words.filter((w) => w.known).length,
        unknown: prev.words.filter((w) => !w.known).length,
        words: prev.words,
      });
    }
  } else if (prev) {
    carry = prev.words;
  }

  const pool = [...carry, ...words];
  let made = 0;
  let rest = pool;
  while (rest.length >= size) {
    const slice = rest.slice(0, size);
    saveQuickCardRun({
      level,
      known: slice.filter((w) => w.known).length,
      unknown: slice.filter((w) => !w.known).length,
      words: slice,
    });
    made++;
    rest = rest.slice(size);
  }
  writePending(rest.length > 0 ? { level, size, words: rest } : null);
  return made;
}

/** 订阅式读取（默认只看当前词书；`level` 传 undefined 看全部） */
export function useQuickCardRuns(level?: string): {
  runs: IQuickCardRun[];
  pending: IQuickCardPending | null;
  remove: (id: string) => void;
  clear: () => void;
} {
  const [runs, setRuns] = useState<IQuickCardRun[]>(() => listQuickCardRuns(level));
  const [pending, setPending] = useState<IQuickCardPending | null>(() => getQuickCardPending(level));
  useEffect(() => {
    const onChange = () => { setRuns(listQuickCardRuns(level)); setPending(getQuickCardPending(level)); };
    onChange(); // level 变化时立即重读，不等下一次广播
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [level]);
  // 云同步下行后重读留档与当前累积（另一台设备的记录这台要看得见）。
  // **必须先作废 runs 缓存** —— 直接 listQuickCardRuns() 拿到的是本机旧内存。
  useSyncDown(() => {
    invalidateQuickCardRunsCache();
    setRuns(listQuickCardRuns(level));
    setPending(getQuickCardPending(level));
  });
  const remove = useCallback((id: string) => removeQuickCardRun(id), []);
  const clear = useCallback(() => clearQuickCardRuns(level), [level]);
  return { runs, pending, remove, clear };
}

// ────────────────────────────────────────────────────────────────────────────
// 未学完的那一轮（断点续学）—— 退出快速闪卡 / 切走 tab / 关掉 App 再回来，
// 顺序、位置、每张卡的作答结果、是否停在起跑页都要原样恢复。
// ────────────────────────────────────────────────────────────────────────────

const SESSION_KEY = '__nativethink_quickcard_session';

/** 断点按**词书分键**：单键时切词书的同一帧会以"新 level + 旧词表"写脏数据，
 *  把另一本书的续学进度永久覆盖掉（SM-2 复习检测早已是 per-level 键）。 */
const sessionKeyOf = (level: string) => `${SESSION_KEY}_${level || 'all'}`;

export interface IQuickCardSession {
  level: string;
  /** 出卡顺序（词面） */
  order: string[];
  index: number;
  /** 与 order 对齐的作答结果；null = 未作答 */
  results: (boolean | null)[];
  revealed: boolean;
  paused: boolean;
  at: number;
}

export function loadQuickCardSession(level: string): IQuickCardSession | null {
  try {
    const raw = safeStorage.getItem(sessionKeyOf(level));
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.order) || s.order.length === 0) return null;
    return {
      level: typeof s.level === 'string' ? s.level : 'all',
      order: s.order.filter((x: unknown) => typeof x === 'string'),
      index: Math.max(0, Number(s.index) || 0),
      results: Array.isArray(s.results) ? s.results : [],
      revealed: !!s.revealed,
      paused: !!s.paused,
      at: Number(s.at) || 0,
    };
  } catch { return null; }
}

export function saveQuickCardSession(s: Omit<IQuickCardSession, 'at'>): void {
  try { safeStorage.setItem(sessionKeyOf(s.level), JSON.stringify({ ...s, at: Date.now() })); } catch { /* quota */ }
}

/** 清掉该词书的断点 */
export function clearQuickCardSession(level: string): void {
  try { safeStorage.removeItem(sessionKeyOf(level)); } catch { /* ignore */ }
}
