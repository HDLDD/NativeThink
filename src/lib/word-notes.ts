/**
 * word-notes — 每个词的用户助记笔记。
 *
 * 为什么值得做：主流背单词 App（Anki / 墨墨 / 不背单词）都有"词笔记/助记"，
 * 而且**用户自己写的助记是记忆效果最强的线索**（自我参照效应），比任何预置例句都管用。
 * 本项目的阅读器已经有段落批注（useReaderNotes），但背单词侧一直没有承接。
 *
 * 存储：safeStorage 一个 Map<wordKey, string>，按词 key（小写）存，不写进词库数据。
 */
import { useEffect, useState, useCallback } from 'react';
import { useSyncDown } from './sync-down';
import { safeStorage } from './safe-storage';

const KEY = '__nativethink_word_notes';
const EVENT = 'nativethink-word-notes-changed';

let _cache: Record<string, string> | null = null;

function read(): Record<string, string> {
  if (_cache) return _cache;
  try {
    const raw = safeStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    _cache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch { _cache = {}; }
  return _cache;
}

function write(next: Record<string, string>) {
  _cache = next;
  try { safeStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* ignore */ }
}

/**
 * 云同步下行后作废模块缓存 —— 直接 getWordNote() 会命中 `_cache`，"重读"就成了摆设。
 */
export function invalidateWordNotesCache(): void {
  _cache = null;
}

export function getWordNote(word: string): string {
  return read()[word.trim().toLowerCase()] ?? '';
}

export function setWordNote(word: string, note: string): void {
  const key = word.trim().toLowerCase();
  if (!key) return;
  const next = { ...read() };
  const text = note.trim();
  if (!text) delete next[key];
  else next[key] = text;
  write(next);
}

export function hasWordNote(word: string): boolean {
  return getWordNote(word) !== '';
}

/** 订阅式读取（同一词在多个组件显示时保持一致） */
export function useWordNote(word: string): [string, (note: string) => void] {
  const [note, setNote] = useState<string>(() => getWordNote(word));
  useEffect(() => { setNote(getWordNote(word)); }, [word]);
  useEffect(() => {
    const onChange = () => setNote(getWordNote(word));
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [word]);
  // 云同步下行后重读这个词的助记（另一台设备改过就要看得见，否则本机的旧文本会在下次编辑时盖回去）。
  // **必须先作废模块缓存** —— 直接 getWordNote() 会命中 _cache，重读变摆设。
  useSyncDown(() => {
    invalidateWordNotesCache();
    setNote(getWordNote(word));
  });
  const update = useCallback((next: string) => setWordNote(word, next), [word]);
  return [note, update];
}

/** 有助记的词数（概览里展示，鼓励用户多写） */
export function countWordNotes(): number {
  return Object.keys(read()).length;
}
