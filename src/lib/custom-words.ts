/**
 * custom-words — 生词本：从阅读里收集、**词库未收录**的词。
 *
 * 为什么需要：阅读器里点词查义后「加入学习」原先只在 `findWord` 命中时可用，
 * 未收录就只弹一句「词库未收录，无法加入学习」—— 而恰恰是这些词（文章里的生词、
 * 专有名词、超纲词）才是用户最想记的。主流背单词 App 都有"生词本"承接这类词。
 *
 * 设计取舍：
 *  - 独立存储（safeStorage），不写进词库数据文件；
 *  - 学习进度复用 `useWordLearning('custom')` 这一路（SUB_LEVELS 已含 'custom'），
 *    因此 SM-2、错词重练、屏蔽、预测这些能力**零成本继承**；
 *  - 转成 IWordEntry 时补齐词库 schema 的必填字段（默认值），避免下游到处判空。
 */
import { useEffect, useState, useCallback } from 'react';
import { useSyncDown } from './sync-down';
import { safeStorage } from './safe-storage';
import type { IWordEntry } from '@/data/wordbank/schema';

const KEY = '__nativethink_custom_words';
const EVENT = 'nativethink-custom-words-changed';

export interface ICustomWord {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  meaning: string;
  /** 来源说明（如「阅读：傲慢与偏见」），便于用户回忆在哪遇到的 */
  source?: string;
  addedAt: number;
}

let _cache: ICustomWord[] | null = null;

function read(): ICustomWord[] {
  if (_cache) return _cache;
  try {
    const raw = safeStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    _cache = Array.isArray(parsed) ? parsed.filter((x) => x && typeof x.word === 'string') : [];
  } catch { _cache = []; }
  return _cache;
}

function write(list: ICustomWord[]) {
  _cache = list;
  try { safeStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* ignore */ }
}

/**
 * 云同步下行后作废模块缓存 —— 直接 read() 会命中 `_cache`，"重读"就成了摆设：
 * 显示层继续拿本机旧内存，下一次写入还会把云端刚拉下来的值盖回去。
 */
export function invalidateCustomWordsCache(): void {
  _cache = null;
}

/** 加入生词本（同一个词只保留一条，重复加入时更新释义） */
export function addCustomWord(w: Omit<ICustomWord, 'addedAt'>): boolean {
  const key = w.word.trim().toLowerCase();
  if (!key) return false;
  const list = read();
  const i = list.findIndex((x) => x.word.toLowerCase() === key);
  const entry: ICustomWord = { ...w, word: w.word.trim(), addedAt: Date.now() };
  if (i >= 0) {
    const next = [...list];
    next[i] = { ...next[i], ...entry, addedAt: next[i].addedAt };
    write(next);
    return false; // 已存在
  }
  write([entry, ...list]);
  return true;
}

export function removeCustomWord(word: string): void {
  const key = word.trim().toLowerCase();
  write(read().filter((x) => x.word.toLowerCase() !== key));
}

export function getCustomWords(): ICustomWord[] {
  return read();
}

export function isCustomWord(word: string): boolean {
  const key = word.trim().toLowerCase();
  return read().some((x) => x.word.toLowerCase() === key);
}

/**
 * 订阅式读取（多个组件同时显示生词本时保持一致）。
 * 返回 `{ words, remove }` —— 之前是"数组上挂一个 remove 方法"，调用方得做类型断言，
 * 语义不清晰也容易误用。
 */
export function useCustomWords(): { words: ICustomWord[]; remove: (w: string) => void } {
  const [words, setWords] = useState<ICustomWord[]>(() => read());
  useEffect(() => {
    const onChange = () => setWords(read());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  // 云同步下行后也重读：生词本在另一台设备上增删过，这台不该继续显示旧的整份列表。
  // **必须先作废模块缓存** —— 直接 read() 会命中 _cache，重读变摆设。
  useSyncDown(() => {
    invalidateCustomWordsCache();
    setWords(getCustomWords());
  });
  const remove = useCallback((w: string) => removeCustomWord(w), []);
  return { words, remove };
}

/**
 * 转成词库的 IWordEntry（补齐必填字段）。
 * `level: 'custom'` 让进度落到独立的一份 state，不污染任何真实词书。
 */
export function toWordEntry(cw: ICustomWord): IWordEntry {
  return {
    word: cw.word,
    phonetic: cw.phonetic,
    partOfSpeech: cw.partOfSpeech || '—',
    meaning: cw.meaning,
    level: 'custom',
    frequencyRank: 0,
    collocations: [],
    examples: [],
    synonyms: [],
    antonyms: [],
    wordFamily: [],
    register: 'neutral',
    emotion: 'neutral',
    topics: [],
    hasNoChineseEquivalent: false,
    hasCollocations: false,
    deepExplanation: '',
  };
}
