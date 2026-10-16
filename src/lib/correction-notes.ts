/**
 * correction-notes — 表达纠偏本：AI 判定"你说得不地道"的表达自动收集。
 *
 * 为什么需要：思维检测 / 写作批改 / 对话分析三处都会以 Markdown 表格给出
 * 「中式表达 → 地道说法」的对照，但看完就散在历史里 —— 摆脱中式英语恰恰需要
 * 把这些**自己的错句**攒起来反复重看重练（收集与回看在收藏页，重考走词汇页第 9 模式
 * 「纠偏重考」，本模块只负责存储、抽取、记账与排序）。
 *
 * 设计取舍：
 *  - 照抄 custom-words 的 store 骨架（safeStorage + 模块级缓存 + 事件广播 + 云同步下行重读）；
 *  - 纠偏条目是用户练习产物、不可重算 → `appendCapped` **只拒绝新增、绝不裁剪**
 *    （AGENTS.md 那条"按词累积缓存"分两类口径）；写失败必须可见（warnStorageFull）；
 *  - 三个来源的表格列序不同，抽取映射放在各自 `extract*Rows`，共用 `parseMarkdownTables` 纯函数。
 */
import { useEffect, useState, useCallback } from 'react';
import { useSyncDown } from './sync-down';
import { safeStorage } from './safe-storage';
import { appendCapped, persistJson, warnStorageFull } from './capped-cache';

const KEY = '__nativethink_correction_notes';
const EVENT = 'nativethink-correction-notes-changed';
/** 纠偏本上限 —— 200 条足够回看，且按 wrong 去重后增速很慢 */
const MAX_NOTES = 200;

export interface ICorrectionNote {
  id: string;
  source: 'think' | 'writing' | 'conversation';
  /** 用户的中式/出错表达 */
  wrong: string;
  /** 地道说法 */
  right: string;
  /** 中文提示（对话分析表带；其它来源为空） */
  chineseHint: string;
  /** 说明（AI 的 notes/explanation/原因分析） */
  note: string;
  createdAt: number;
  /** 重考统计（纠偏重考模式写；没考过就没有这个字段） */
  review?: { lastAt: number; correct: number; wrong: number };
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * 解析一段文本里的所有 Markdown 表格 → string[][][]（表 → 行 → 单元格）。
 * 认表格的门槛：`|` 开头的行 + 下一行是 `---|---` 分隔行；表头不算数据行。
 * 纯函数，守卫直接转译真跑。
 */
export function parseMarkdownTables(md: string): string[][][] {
  const lines = String(md || '').split('\n');
  const tables: string[][][] = [];
  const cells = (line: string) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) continue;
    const rows: string[][] = [];
    let j = i + 2;
    for (; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(lines[j])) continue;
      const c = cells(lines[j]);
      if (c.some((x) => x)) rows.push(c);
    }
    if (rows.length) tables.push(rows);
    i = j - 1;
  }
  return tables;
}

const clean = (s: string) => s.replace(/[*_`]/g, '').trim();

/** 思维检测：Chinglish Expression | Natural English | Notes（2~3 列） */
export function extractDetectorRows(md: string): Omit<ICorrectionNote, 'id' | 'source' | 'createdAt'>[] {
  const out: Omit<ICorrectionNote, 'id' | 'source' | 'createdAt'>[] = [];
  for (const table of parseMarkdownTables(md)) {
    for (const r of table) {
      if (r.length < 2) continue;
      const wrong = clean(r[0]); const right = clean(r[1]);
      if (!wrong || !right || /chinglish expression/i.test(wrong)) continue;
      out.push({ wrong, right, chineseHint: '', note: clean(r[2] || '') });
    }
  }
  return out;
}

/** 写作批改：Original | Correction | Explanation */
export function extractWritingRows(md: string): Omit<ICorrectionNote, 'id' | 'source' | 'createdAt'>[] {
  const out: Omit<ICorrectionNote, 'id' | 'source' | 'createdAt'>[] = [];
  for (const table of parseMarkdownTables(md)) {
    for (const r of table) {
      if (r.length < 2) continue;
      const wrong = clean(r[0]); const right = clean(r[1]);
      if (!wrong || !right || /original/i.test(wrong) || norm(wrong) === norm(right)) continue;
      out.push({ wrong, right, chineseHint: '', note: clean(r[2] || '') });
    }
  }
  return out;
}

/** 对话分析：我的表达 | 中文翻译 | 更地道的说法 | 原因分析 */
export function extractConversationRows(md: string): Omit<ICorrectionNote, 'id' | 'source' | 'createdAt'>[] {
  const out: Omit<ICorrectionNote, 'id' | 'source' | 'createdAt'>[] = [];
  for (const table of parseMarkdownTables(md)) {
    for (const r of table) {
      if (r.length < 3) continue;
      const wrong = clean(r[0]); const chineseHint = clean(r[1]); const right = clean(r[2]);
      if (!wrong || !right || /我的表达/.test(wrong)) continue;
      out.push({ wrong, right, chineseHint, note: clean(r[3] || '') });
    }
  }
  return out;
}

let _cache: ICorrectionNote[] | null = null;

function read(): ICorrectionNote[] {
  if (_cache) return _cache;
  try {
    const raw = safeStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    _cache = Array.isArray(parsed) ? parsed.filter((x) => x && typeof x.wrong === 'string' && typeof x.right === 'string') : [];
  } catch { _cache = []; }
  return _cache;
}

function write(list: ICorrectionNote[]): void {
  _cache = list;
  if (!persistJson(KEY, list)) warnStorageFull();
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* ignore */ }
}

/**
 * 批量入库（三个 AI 反馈完成点调用）：按 wrong 归一化去重（同句反复被抓只留最早一条），
 * 满了**拒绝新增**（用户数据不裁剪）。返回真正入库的条数，调用方不提示（零 toast 口径，
 * 反馈位置在纠偏本自己的计数里）—— 唯一例外是写失败，persistJson 已负责 warnStorageFull。
 */
export function addCorrectionNotes(
  source: ICorrectionNote['source'],
  rows: Omit<ICorrectionNote, 'id' | 'source' | 'createdAt'>[],
): number {
  const list = read();
  const known = new Set(list.map((n) => norm(n.wrong)));
  const now = Date.now();
  const fresh = rows
    .filter((r) => r.wrong && r.right && !known.has(norm(r.wrong)))
    .map((r, i) => ({ ...r, id: `cn_${now.toString(36)}_${i}_${Math.random().toString(36).slice(2, 6)}`, source, createdAt: now }));
  if (fresh.length === 0) return 0;
  const { next, added } = appendCapped(list, fresh, MAX_NOTES);
  if (added > 0) write(next);
  return added;
}

export function removeCorrectionNote(id: string): void {
  write(read().filter((n) => n.id !== id));
}

/** 重考记账：答对/答错都更新 review（最久没练的下次排前面） */
export function recordCorrectionReview(id: string, correct: boolean): void {
  const list = read();
  const now = Date.now();
  let hit = false;
  const next = list.map((n) => {
    if (n.id !== id) return n;
    hit = true;
    return {
      ...n,
      review: {
        lastAt: now,
        correct: (n.review?.correct ?? 0) + (correct ? 1 : 0),
        wrong: (n.review?.wrong ?? 0) + (correct ? 0 : 1),
      },
    };
  });
  if (hit) write(next);
}

/**
 * 重考队列排序（纯函数）：**没考过的优先**，其次"最久没练"在前，最后按答错次数多者优先。
 * 与收藏练习的轮转同一思路 —— 不重复、不把已经记住的反复端上来。
 */
export function orderForDrill(notes: ICorrectionNote[]): ICorrectionNote[] {
  return [...notes].sort((a, b) => {
    const au = a.review ? 1 : 0;
    const bu = b.review ? 1 : 0;
    if (au !== bu) return au - bu;
    if (au === 0) return b.createdAt - a.createdAt;
    const al = a.review!.lastAt;
    const bl = b.review!.lastAt;
    if (al !== bl) return al - bl;
    return (b.review!.wrong - a.review!.wrong);
  });
}

export function invalidateCorrectionNotesCache(): void {
  _cache = null;
}

export function useCorrectionNotes(): {
  notes: ICorrectionNote[];
  add: typeof addCorrectionNotes;
  remove: (id: string) => void;
} {
  const [notes, setNotes] = useState<ICorrectionNote[]>(() => read());
  const reload = useCallback(() => setNotes([...read()]), []);
  useEffect(() => {
    window.addEventListener(EVENT, reload);
    return () => window.removeEventListener(EVENT, reload);
  }, [reload]);
  // 云同步下行：先作废模块缓存再重读（直接 read() 会命中本机旧内存）
  useSyncDown(() => { invalidateCorrectionNotesCache(); reload(); });
  return { notes, add: addCorrectionNotes, remove: removeCorrectionNote };
}
