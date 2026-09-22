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
  const update = useCallback((next: string) => setWordNote(word, next), [word]);
  return [note, update];
}

/** 有助记的词数（概览里展示，鼓励用户多写） */
export function countWordNotes(): number {
  return Object.keys(read()).length;
}
