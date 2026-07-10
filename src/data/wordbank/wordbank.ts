// Wordbank query engine — lazy-loading edition
// Data files are dynamically imported per-level. Components preload via `preloadLevel()` / `preloadAll()`
// then use sync wrappers once `isLevelReady()` returns true.
import type { IWordEntry, IWordQuery } from './schema';

// ── Pre-computed constants (no data loading needed) ──
export const WORD_COUNTS: Record<string, number> = {
  cet4: 4542, cet6: 7404, ielts: 6609, toefl: 10367, advanced: 18471,
};

export const ALL_PARTS_OF_SPEECH: string[] = [
  'adj', 'adv', 'art', 'aux', 'conj', 'det', 'int', 'n', 'num', 'pref', 'prep', 'pron', 'suf', 'v',
];

// ── Dynamic level loaders ──
const ALL_LEVELS = ['cet4', 'cet6', 'ielts', 'toefl', 'advanced'] as const;

const CACHE_VERSION = 1;
const LS_PREFIX = '__nativethink_wb_';

const _levelCache: Record<string, IWordEntry[]> = {};
const _loaded: Set<string> = new Set();
const _loading: Map<string, Promise<void>> = new Map();

function loadFromCache(level: string): IWordEntry[] | null {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${level}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.v === CACHE_VERSION && Array.isArray(parsed.d)) return parsed.d;
  } catch { /* quota exceeded or corrupt */ }
  return null;
}

function saveToCache(level: string, words: IWordEntry[]) {
  try {
    localStorage.setItem(`${LS_PREFIX}${level}`, JSON.stringify({ v: CACHE_VERSION, d: words }));
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

async function loadLevel(level: string): Promise<void> {
  if (_loaded.has(level)) return;
  if (_loading.has(level)) { await _loading.get(level); return; }

  // ── Fast path: try localStorage synchronously (instant on repeat visits) ──
  const cached = loadFromCache(level);
  if (cached) {
    _levelCache[level] = cached;
    _loaded.add(level);
    invalidateIndexes();
    return; // async fn wraps in resolved promise — effectively sync
  }

  // ── Slow path: dynamic import from network ──
  const p = (async () => {
    let mod: Record<string, IWordEntry[]>;
    switch (level) {
      case 'cet4': mod = await import('./data/cet4'); break;
      case 'cet6': mod = await import('./data/cet6'); break;
      case 'ielts': mod = await import('./data/ielts'); break;
      case 'toefl': mod = await import('./data/toefl'); break;
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

let _allReady = false;
async function loadAll(): Promise<void> {
  if (_allReady) return;
  await Promise.all(ALL_LEVELS.map(loadLevel));
  _allReady = true;
}

// ── Public: preload API ──

export function isLevelReady(level: string): boolean { return _loaded.has(level); }
export function isAllReady(): boolean { return _allReady; }

/** Preload one or more levels (returns promise — await in useEffect). */
export function preloadLevels(levels: string[]): Promise<void> {
  return Promise.all(levels.map(loadLevel)).then(() => {});
}

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
    const ord: Record<string, number> = { cet4: 0, cet6: 1, ielts: 2, toefl: 3, advanced: 4 };
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
  const arr = [...pool];
  for (let i = 0; i < Math.min(count, arr.length); i++) {
    const j = i + Math.floor(Math.random() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
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

export type { IWordEntry, IWordQuery };
