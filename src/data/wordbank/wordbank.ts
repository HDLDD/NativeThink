// Wordbank query engine - search, filter, sort words
import type { IWordEntry, IWordQuery } from './schema';
import { CET4_WORDS } from './data/cet4';
import { CET6_WORDS } from './data/cet6';
import { IELTS_WORDS } from './data/ielts';
import { TOEFL_WORDS } from './data/toefl';
import { ADVANCED_WORDS } from './data/advanced';

/** Clean text for display and TTS: unescape backslash-apostrophe and remove stray slashes */
function cleanSlash(s: string): string {
  return s
    .replace(/\\'/g, "'")
    .replace(/\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clean word entry data by removing '/' from meaning and examples */
function cleanWordEntry(w: IWordEntry): IWordEntry {
  return {
    ...w,
    meaning: cleanSlash(w.meaning),
    examples: w.examples.map((ex) => ({
      en: cleanSlash(ex.en),
      zh: cleanSlash(ex.zh),
    })),
  };
}

// Registry of all word sources (ordered by level, lowest first)
const ALL_SOURCES: { name: string; level: string; words: IWordEntry[] }[] = [
  { name: 'CET4', level: 'cet4', words: CET4_WORDS },
  { name: 'CET6', level: 'cet6', words: CET6_WORDS },
  { name: 'IELTS', level: 'ielts', words: IELTS_WORDS },
  { name: 'TOEFL', level: 'toefl', words: TOEFL_WORDS },
  { name: 'ADVANCED', level: 'advanced', words: ADVANCED_WORDS },
];

const LEVEL_ORDER = ['cet4', 'cet6', 'ielts', 'toefl', 'advanced'];

// ── Caches: cleanWordEntry is expensive (spread + map), cache the results ──
let _allWordsCache: IWordEntry[] | null = null;
const _levelWordsCache: Record<string, IWordEntry[]> = {};
let _wordIndexCache: Map<string, IWordEntry> | null = null;

function invalidateCaches() {
  _allWordsCache = null;
  _wordIndexCache = null;
  for (const k of Object.keys(_levelWordsCache)) delete _levelWordsCache[k];
}

function getWordIndex(): Map<string, IWordEntry> {
  if (_wordIndexCache) return _wordIndexCache;
  _wordIndexCache = new Map();
  for (const w of getAllWords()) {
    _wordIndexCache.set(w.word.toLowerCase(), w);
  }
  return _wordIndexCache;
}

/** Get words from a specific level file (no cross-level dedup). Results are cached. */
function getLevelWords(level: string): IWordEntry[] {
  if (_levelWordsCache[level]) return _levelWordsCache[level];
  const src = ALL_SOURCES.find((s) => s.level === level);
  if (!src) return [];
  const cleaned = src.words.map(cleanWordEntry);
  _levelWordsCache[level] = cleaned;
  return cleaned;
}

/** Get all words from all sources (deduplicated by word, lowest level kept). Results are cached. */
export function getAllWords(): IWordEntry[] {
  if (_allWordsCache) return _allWordsCache;
  const seen = new Set<string>();
  const result: IWordEntry[] = [];
  for (const src of ALL_SOURCES) {
    for (const w of src.words) {
      const key = w.word.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(cleanWordEntry(w));
      }
    }
  }
  _allWordsCache = result;
  return result;
}

/** Query words with filters. Uses cached word data and single-pass filtering. */
export function queryWords(params: IWordQuery = {}): IWordEntry[] {
  // Get the base word pool (now cached)
  let words: IWordEntry[];

  if (params.level) {
    const inputLevels = Array.isArray(params.level) ? params.level : [params.level];
    if (inputLevels.length === 1 && inputLevels[0] !== 'all') {
      words = getLevelWords(inputLevels[0]);
    } else {
      const levelSet = new Set(inputLevels);
      const seen = new Set<string>();
      words = [];
      for (const src of ALL_SOURCES) {
        if (!levelSet.has(src.level)) continue;
        for (const w of getLevelWords(src.level)) {
          const key = w.word.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            words.push(w);
          }
        }
      }
    }
  } else {
    words = getAllWords();
  }

  // Build a single filter predicate combining all active conditions
  const hasTopic = !!params.topic;
  const hasSearch = !!params.search;
  const hasFreqMin = params.frequencyMin != null;
  const hasFreqMax = params.frequencyMax != null;
  const hasRegister = !!params.register;
  const hasPos = !!params.pos;

  if (hasTopic || hasSearch || hasFreqMin || hasFreqMax || hasRegister || hasPos) {
    const topic = params.topic!;
    const q = params.search?.toLowerCase();
    const freqMin = params.frequencyMin!;
    const freqMax = params.frequencyMax!;
    const register = params.register!;
    const pos = params.pos!;

    words = words.filter((w) => {
      if (hasTopic && !w.topics.includes(topic)) return false;
      if (hasSearch && !(w.word.toLowerCase().includes(q!) || w.meaning.includes(q!) || w.phonetic.includes(q!))) return false;
      if (hasFreqMin && w.frequencyRank < freqMin) return false;
      if (hasFreqMax && w.frequencyRank > freqMax) return false;
      if (hasRegister && w.register !== register) return false;
      if (hasPos && !w.partOfSpeech.includes(pos)) return false;
      return true;
    });
  }

  // Sort
  if (params.sortBy === 'frequency') {
    words.sort((a, b) => a.frequencyRank - b.frequencyRank);
  } else if (params.sortBy === 'alphabetical') {
    words.sort((a, b) => a.word.localeCompare(b.word));
  } else if (params.sortBy === 'level') {
    const order: Record<string, number> = { cet4: 0, cet6: 1, ielts: 2, toefl: 3, advanced: 4 };
    words.sort((a, b) => (order[a.level] || 0) - (order[b.level] || 0));
  }

  // Pagination
  if (params.offset) {
    words = words.slice(params.offset);
  }
  if (params.limit) {
    words = words.slice(0, params.limit);
  }

  return words;
}

/** Get unique topics across all words */
export function getAllTopics(): string[] {
  const topics = new Set<string>();
  getAllWords().forEach((w) => w.topics.forEach((t) => topics.add(t)));
  return Array.from(topics).sort();
}

/** Get words grouped by level (deduplicated across levels) */
export function getWordsByLevel(): Record<string, IWordEntry[]> {
  const groups: Record<string, IWordEntry[]> = {};
  getAllWords().forEach((w) => {
    if (!groups[w.level]) groups[w.level] = [];
    groups[w.level].push(w);
  });
  return groups;
}

/** Get word count per level (each level's file word count, independent vocabulary sets) */
export function getWordCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const src of ALL_SOURCES) {
    counts[src.level] = src.words.length;
  }
  return counts;
}

// Pre-computed counts (avoids pulling full word data for simple level counting)
export const WORD_COUNTS: Record<string, number> = {
  cet4: 4542,
  cet6: 7404,
  ielts: 6609,
  toefl: 10367,
  advanced: 18471,
};

/** Get a random selection of words. Uses cached data. */
export function getRandomWords(count: number, level?: string): IWordEntry[] {
  const pool = level ? getLevelWords(level) : getAllWords();
  // Fisher-Yates partial shuffle: only shuffle `count` picks
  const arr = [...pool];
  for (let i = 0; i < Math.min(count, arr.length); i++) {
    const j = i + Math.floor(Math.random() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

/** Search a single word by exact match. O(1) using cached index. */
export function findWord(word: string): IWordEntry | undefined {
  return getWordIndex().get(word.toLowerCase());
}
