// Wordbank query engine — lazy-loading edition
// Data files are dynamically imported per-level. Components preload via `preloadLevel()` / `preloadAll()`
// then use sync wrappers once `isLevelReady()` returns true.
import type { IWordEntry, IWordQuery, IWordDetailMap } from './schema';
import { idbGet, idbSet } from '@/lib/idb';

// ── Pre-computed constants (no data loading needed) ──
export const WORD_COUNTS: Record<string, number> = {
  zhongkao: 3223, gaokao: 6008, cet4: 4542, cet6: 7404, ielts: 6609, toefl: 10367, postgraduate: 9602, professional: 8887, advanced: 18471,
};

export const ALL_PARTS_OF_SPEECH: string[] = [
  'adj', 'adv', 'art', 'aux', 'conj', 'det', 'int', 'n', 'num', 'pref', 'prep', 'pron', 'suf', 'v',
];

// ── Dynamic level loaders ──
const ALL_LEVELS = ['zhongkao', 'gaokao', 'cet4', 'cet6', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'] as const;

const CACHE_VERSION = 3; // v3: detail 拆分为独立文件 + 词条新增 hasCollocations
const LS_PREFIX = '__nativethink_wb_';
const IDB_PREFIX = 'wb_';

const _levelCache: Record<string, IWordEntry[]> = {};
const _loaded: Set<string> = new Set();
const _loading: Map<string, Promise<void>> = new Map();

// ── detail 按需加载状态（与核心的 _loaded / _loading 正交）──
const _detailLoaded: Set<string> = new Set();
const _detailLoading: Map<string, Promise<void>> = new Map();
const DETAIL_IDB_PREFIX = 'wb_detail_';
const DETAIL_LS_PREFIX = '__nativethink_wbd_';

/**
 * Load wordbank from IndexedDB (async, high capacity) or localStorage (sync, limited).
 * IndexedDB can store much larger datasets (50%+ disk vs 5-10MB localStorage limit).
 */
async function loadFromCache(level: string): Promise<IWordEntry[] | null> {
  // Try IndexedDB first (async, higher capacity)
  try {
    const idbData = await idbGet<{ v: number; d: IWordEntry[] }>(`${IDB_PREFIX}${level}`);
    if (idbData?.v === CACHE_VERSION && Array.isArray(idbData.d)) {
      return idbData.d;
    }
  } catch { /* IndexedDB not available */ }

  // Fallback to localStorage (sync, limited capacity)
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${level}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.v === CACHE_VERSION && Array.isArray(parsed.d)) {
      // Migrate to IndexedDB for future loads
      idbSet(`${IDB_PREFIX}${level}`, parsed).catch(() => {});
      return parsed.d;
    }
  } catch { /* quota exceeded or corrupt */ }
  return null;
}

/**
 * Save wordbank to IndexedDB (primary) and localStorage (fallback).
 */
async function saveToCache(level: string, words: IWordEntry[]): Promise<void> {
  const data = { v: CACHE_VERSION, d: words };

  // Save to IndexedDB (async, higher capacity)
  try {
    await idbSet(`${IDB_PREFIX}${level}`, data);
  } catch { /* IndexedDB not available */ }

  // Also save to localStorage as fallback (fire-and-forget)
  try {
    localStorage.setItem(`${LS_PREFIX}${level}`, JSON.stringify(data));
  } catch { /* quota exceeded — silently skip */ }
}

// ── Derived indexes (lazy-built, invalidated on each level load) ──
let _indexesDirty = true;
let _allWordsCache: IWordEntry[] | null = null;
const _levelIndex: Map<string, IWordEntry[]> = new Map();
let _wordIndex: Map<string, IWordEntry> | null = null;

function invalidateIndexes() {
  _indexesDirty = true;
  _allWordsCache = null;
  _wordIndex = null;
  _levelIndex.clear();
}

function ensureIndexes() {
  if (!_indexesDirty) return;
  const seen = new Set<string>();
  const all: IWordEntry[] = [];
  for (const lvl of ALL_LEVELS) {
    const words = _levelCache[lvl];
    if (!words) continue;
    const deduped: IWordEntry[] = [];
    for (const w of words) {
      const key = w.word.toLowerCase();
      if (!seen.has(key)) { seen.add(key); deduped.push(w); all.push(w); }
    }
    _levelIndex.set(lvl, deduped);
  }
  _allWordsCache = all;
  _indexesDirty = false;
}

async function loadCore(level: string): Promise<void> {
  if (_loaded.has(level)) return;
  if (_loading.has(level)) { await _loading.get(level); return; }

  // ── Fast path: try IndexedDB/localStorage (instant on repeat visits) ──
  const cached = await loadFromCache(level);
  if (cached) {
    _levelCache[level] = cached;
    _loaded.add(level);
    invalidateIndexes();
    return;
  }

  // ── Slow path: dynamic import from network ──
  const p = (async () => {
    let mod: Record<string, IWordEntry[]>;
    switch (level) {
      case 'zhongkao': mod = await import('./data/zhongkao'); break;
      case 'gaokao': mod = await import('./data/gaokao'); break;
      case 'cet4': mod = await import('./data/cet4'); break;
      case 'cet6': mod = await import('./data/cet6'); break;
      case 'ielts': mod = await import('./data/ielts'); break;
      case 'toefl': mod = await import('./data/toefl'); break;
      case 'postgraduate': mod = await import('./data/postgraduate'); break;
      case 'professional': mod = await import('./data/professional'); break;
      case 'advanced': mod = await import('./data/advanced'); break;
      default: return;
    }
    const key = Object.keys(mod).find((k) => k.toUpperCase().includes('WORDS'));
    const words: IWordEntry[] = (key ? (mod as any)[key] : []);
    _levelCache[level] = words;
    _loaded.add(level);
    invalidateIndexes();

    // Save to cache for next visit (fire-and-forget)
    saveToCache(level, words);
  })();

  _loading.set(level, p);
  try { await p; } finally { _loading.delete(level); }
}

/**
 * 把 detail 就地补齐到已加载的核心词条上。
 *
 * ⚠️ 必须就地改字段，禁止写成重建对象（如 `w = {...w, ...d}`）：
 * ensureIndexes() 里的 `deduped.push(w)` / `all.push(w)` 推入的是**同一批对象引用**，
 * 就地补齐可自动对 _levelIndex / _allWordsCache / _wordIndex 生效；
 * 重建对象会让三个索引仍指向旧对象，detail 永远不可见 —— 且不报错，界面只是空着。
 */
function applyDetail(level: string, map: IWordDetailMap): void {
  const words = _levelCache[level];
  if (!words) return;
  for (const w of words) {
    const d = map[w.word.toLowerCase()];
    if (!d) continue;
    w.collocations = d.collocations ?? [];
    w.examples = d.examples ?? [];
    w.deepExplanation = d.deepExplanation ?? '';
  }
}

/** 按需加载某等级的 detail（幂等、并发安全、失败静默） */
async function loadDetail(level: string): Promise<void> {
  if (_detailLoaded.has(level)) return;
  if (_detailLoading.has(level)) { await _detailLoading.get(level); return; }

  const p = (async () => {
    // ── 缓存命中：IndexedDB 优先，localStorage 兜底 ──
    try {
      const idb = await idbGet<{ v: number; d: IWordDetailMap }>(`${DETAIL_IDB_PREFIX}${level}`);
      if (idb?.v === CACHE_VERSION && idb.d) {
        applyDetail(level, idb.d);
        _detailLoaded.add(level);
        return;
      }
    } catch { /* IndexedDB not available */ }
    try {
      const raw = localStorage.getItem(`${DETAIL_LS_PREFIX}${level}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.v === CACHE_VERSION && parsed.d) {
          idbSet(`${DETAIL_IDB_PREFIX}${level}`, parsed).catch(() => {});
          applyDetail(level, parsed.d);
          _detailLoaded.add(level);
          return;
        }
      }
    } catch { /* quota / corrupt */ }

    // ── 网络加载 ──
    let mod: Record<string, IWordDetailMap>;
    switch (level) {
      case 'zhongkao': mod = await import('./data/zhongkao.detail'); break;
      case 'gaokao': mod = await import('./data/gaokao.detail'); break;
      case 'cet4': mod = await import('./data/cet4.detail'); break;
      case 'cet6': mod = await import('./data/cet6.detail'); break;
      case 'ielts': mod = await import('./data/ielts.detail'); break;
      case 'toefl': mod = await import('./data/toefl.detail'); break;
      case 'postgraduate': mod = await import('./data/postgraduate.detail'); break;
      case 'professional': mod = await import('./data/professional.detail'); break;
      case 'advanced': mod = await import('./data/advanced.detail'); break;
      default: return;
    }
    const key = Object.keys(mod).find((k) => k.toUpperCase().includes('DETAIL'));
    const map: IWordDetailMap = key ? (mod as any)[key] : {};
    applyDetail(level, map);
    _detailLoaded.add(level);

    // 缓存给下次访问（fire-and-forget）
    const data = { v: CACHE_VERSION, d: map };
    idbSet(`${DETAIL_IDB_PREFIX}${level}`, data).catch(() => {});
    try { localStorage.setItem(`${DETAIL_LS_PREFIX}${level}`, JSON.stringify(data)); } catch { /* quota */ }
  })();

  _detailLoading.set(level, p);
  try { await p; } finally { _detailLoading.delete(level); }
}

/**
 * 加载等级。withDetail 默认为 true —— 与改动前行为完全一致（核心 + detail），
 * 因此所有走 preloadLevels 的既有消费方无需任何改动。
 * 只做搜索/查词的流程请用 preloadCoreOnly 跳过 detail。
 *
 * 注意这里是对 loadCore 的包装而非在其末尾追加：loadCore 在缓存命中时会提前 return，
 * 若把 detail 加载写在 loadCore 内部末尾，缓存命中路径将永远不加载 detail。
 */
async function loadLevel(level: string, withDetail = true): Promise<void> {
  await loadCore(level);
  if (withDetail) {
    try { await loadDetail(level); } catch { /* detail 失败不阻断核心可用 */ }
  }
}

let _allReady = false;
async function loadAll(): Promise<void> {
  if (_allReady) return;
  // Load levels SEQUENTIALLY to avoid memory spikes from parallel imports.
  // Each level contains 3k–18k word entries with examples, collocations, etc.
  // Loading 9 levels simultaneously (~75k entries) risks tab crashes.
  for (const lvl of ALL_LEVELS) {
    try { await loadLevel(lvl); } catch { /* skip failed level — other levels still load */ }
  }
  _allReady = true;
}

// ── Public: preload API ──

export function isLevelReady(level: string): boolean { return _loaded.has(level); }
export function isAllReady(): boolean { return _allReady; }

/** Preload one or more levels（核心 + detail，与改动前行为一致；returns promise — await in useEffect） */
export function preloadLevels(levels: string[]): Promise<void> {
  // 必须写成显式箭头函数：Array.map 会把索引作为第二参数传入，而 loadLevel 的
  // 第二参数是 withDetail —— 索引 0 为 falsy，会导致第一个等级不加载 detail。
  return Promise.all(levels.map((l) => loadLevel(l, true))).then(() => {});
}

/** 只加载核心字段（不含 detail）—— 供仅做搜索/查词的流程使用 */
export function preloadCoreOnly(levels: string[]): Promise<void> {
  return Promise.all(levels.map((l) => loadLevel(l, false))).then(() => {});
}

/** 按需加载 detail（幂等、并发安全、失败静默） */
export function preloadDetail(levels: string[]): Promise<void> {
  return Promise.all(levels.map((l) => loadDetail(l).catch(() => {}))).then(() => {});
}

export function isDetailReady(level: string): boolean { return _detailLoaded.has(level); }

/** Preload every level. */
export function preloadAll(): Promise<void> { return loadAll(); }

// ── Public: sync query API (only works after preload) ──

/** Get cached words for a single level. Returns empty array before preload. */
export function getLevelWords(level: string): IWordEntry[] {
  return _levelCache[level] || [];
}

/** Get all cached deduplicated words (lazy-cached after index build). */
function getAllWords(): IWordEntry[] {
  ensureIndexes();
  return _allWordsCache!;
}

export function getWordCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const lvl of ALL_LEVELS) { counts[lvl] = (_levelCache[lvl] || []).length; }
  return counts;
}

export function queryWords(params: IWordQuery = {}): IWordEntry[] {
  ensureIndexes();

  // ── Determine source list ──
  let words: IWordEntry[];

  if (params.level) {
    const levels = Array.isArray(params.level) ? params.level : [params.level];
    if (levels.length === 1 && levels[0] !== 'all') {
      words = _levelIndex.get(levels[0]) || [];
    } else {
      const levelSet = new Set(levels);
      const seen = new Set<string>();
      words = [];
      for (const lvl of ALL_LEVELS) {
        if (!levelSet.has(lvl)) continue;
        for (const w of _levelIndex.get(lvl) || []) {
          const key = w.word.toLowerCase();
          if (!seen.has(key)) { seen.add(key); words.push(w); }
        }
      }
    }
  } else {
    words = _allWordsCache!;
  }

  // ── Apply filters ──
  const q = params.search?.toLowerCase();
  const hasFilters = !!(params.topic || q || params.frequencyMin != null || params.frequencyMax != null || params.register || params.pos);

  if (hasFilters) {
    // Build filter predicate once
    const pred = (w: IWordEntry) => {
      if (params.topic && !w.topics.includes(params.topic)) return false;
      if (q && !(w.word.toLowerCase().includes(q) || w.meaning.includes(q) || w.phonetic.includes(q))) return false;
      if (params.frequencyMin != null && w.frequencyRank < params.frequencyMin) return false;
      if (params.frequencyMax != null && w.frequencyRank > params.frequencyMax) return false;
      if (params.register && w.register !== params.register) return false;
      if (params.pos && !w.partOfSpeech.includes(params.pos)) return false;
      return true;
    };
    words = words.filter(pred);
  }

  // ── Sort (only when needed — avoid copying if no sort) ──
  if (params.sortBy === 'frequency') {
    words = [...words].sort((a, b) => a.frequencyRank - b.frequencyRank);
  } else if (params.sortBy === 'alphabetical') {
    words = [...words].sort((a, b) => a.word.localeCompare(b.word));
  } else if (params.sortBy === 'level') {
    const ord: Record<string, number> = { zhongkao: 0, gaokao: 1, cet4: 2, cet6: 3, ielts: 4, toefl: 5, postgraduate: 6, professional: 7, advanced: 8 };
    words = [...words].sort((a, b) => (ord[a.level] || 0) - (ord[b.level] || 0));
  }
  // No sort requested → return the filtered array as-is (or a shallow copy for slicing)

  // ── Pagination ──
  if (params.offset != null || params.limit != null) {
    const start = params.offset || 0;
    const end = params.limit != null ? start + params.limit : undefined;
    words = words.slice(start, end);
  }

  return words;
}

export function getRandomWords(count: number, level?: string): IWordEntry[] {
  ensureIndexes();
  const pool = level ? (_levelIndex.get(level) || []) : _allWordsCache!;
  // When sampling few items from a huge pool (e.g. 200 from 75K), use index-picking
  // instead of copying the entire array to avoid GC pressure and main-thread block.
  if (count >= pool.length) {
    const arr = [...pool];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  const result: IWordEntry[] = [];
  const seen = new Set<number>();
  while (result.length < count) {
    const idx = Math.floor(Math.random() * pool.length);
    if (!seen.has(idx)) {
      seen.add(idx);
      result.push(pool[idx]);
    }
  }
  return result;
}

export function findWord(word: string): IWordEntry | undefined {
  if (!_wordIndex) {
    ensureIndexes();
    _wordIndex = new Map();
    for (const w of _allWordsCache!) _wordIndex.set(w.word.toLowerCase(), w);
  }
  return _wordIndex.get(word.toLowerCase());
}

// Re-export getAllWords for external consumers (used by CollocationsTab etc.)
export { getAllWords };

export function getAllTopics(): string[] {
  ensureIndexes();
  const topics = new Set<string>();
  for (const w of _allWordsCache!) w.topics.forEach((t) => topics.add(t));
  return Array.from(topics).sort();
}

export function getWordsByLevel(): Record<string, IWordEntry[]> {
  ensureIndexes();
  const groups: Record<string, IWordEntry[]> = {};
  for (const w of _allWordsCache!) {
    if (!groups[w.level]) groups[w.level] = [];
    groups[w.level].push(w);
  }
  return groups;
}

// ── User level utilities for smart preloading ──

/** Get the user's currently selected learning level from localStorage. */
export function getUserLevel(): string {
  try {
    const saved = localStorage.getItem('__nativethink_level_memory');
    if (saved) {
      const lm = JSON.parse(saved);
      // levelMemory structure: { [level]: { word, scrollTop } }
      // Find which level has been used most recently
      const levels = Object.keys(lm);
      if (levels.length > 0) return levels[levels.length - 1]; // Return last used level
    }
  } catch { /* ignore */ }
  return 'cet4'; // Default fallback
}

/** Get a small set of "essential" levels for fast preload (user's level + 1 adjacent). */
export function getEssentialLevels(): string[] {
  const userLevel = getUserLevel();
  const levelOrder = ['zhongkao', 'gaokao', 'cet4', 'cet6', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'];
  const idx = levelOrder.indexOf(userLevel);
  const essential = [userLevel];
  // Add one adjacent level for broader coverage without loading all
  if (idx > 0) essential.push(levelOrder[idx - 1]);
  if (idx < levelOrder.length - 1) essential.push(levelOrder[idx + 1]);
  return essential;
}

/** Progressive preload: load user's level first, then others in background. */
export async function preloadProgressive(
  onLevelLoaded?: (level: string) => void,
): Promise<void> {
  // Phase 1: Load user's essential levels (fast)
  const essential = getEssentialLevels();
  await preloadLevels(essential);
  onLevelLoaded?.('essential');

  // Phase 2: Load remaining levels in background (non-blocking)
  const remaining = ALL_LEVELS.filter(l => !essential.includes(l));
  for (const level of remaining) {
    try {
      await loadLevel(level);
      onLevelLoaded?.(level);
    } catch { /* skip failed level */ }
  }
}

export type { IWordEntry, IWordQuery };
