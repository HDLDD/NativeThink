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

/**
 * 错点归纳：把 AI 写在 note / 表格里的那句"为什么中式"归成有限的几类，
 * 让人看得见"我老犯哪一类"，而不是一条条孤立地重认。
 *
 * 规则是**有序**的、首个命中即定型（一条说明常常同时提到"时态"和"冠词"，
 * 归给排在前面的那一类是刻意的口径，改顺序就会改统计）。认不出就落 other，
 * 不硬塞进某个语法桶 —— 错的分类比没分类更误导。
 */
export type CorrectionCategory =
  | 'tense' | 'article' | 'collocation' | 'preposition' | 'literal'
  | 'number' | 'agreement' | 'wordclass' | 'structure' | 'other';

export const CATEGORY_LABELS: Record<CorrectionCategory, string> = {
  tense: '时态 / 体',
  article: '冠词 / 限定词',
  collocation: '搭配 / 选词',
  preposition: '介词',
  literal: '中式直译',
  number: '单复数 / 可数性',
  agreement: '主谓一致',
  wordclass: '词性混用',
  structure: '句法 / 语序',
  other: '其它',
};

/** 每类一句针对性建议（错点面板上直接给，不用再去翻） */
export const CATEGORY_TIPS: Record<CorrectionCategory, string> = {
  tense: '中文靠词汇表时间，英语靠动词形态：先问自己"这件事发生在说之前还是之后"。',
  article: '中文没有冠词：可数名词单数裸奔几乎一定是错的，先定 a / the / 零冠词。',
  collocation: '别问"能不能这么说"，问"母语者跟哪个词"：动宾、形容词+介词成对记。',
  preposition: '介词跟着动词和名词走，换不成中文逻辑，只能连同搭配一起背。',
  literal: '整句按字面翻是最大来源：先想英语里这个意思通常用什么句型开口。',
  number: '中文名词不分单复数：advice / information / furniture 这类不可数要专门记。',
  agreement: '第三人称单数的 -s 中文里不存在，写完专门回头扫一遍主语和动词。',
  wordclass: 'boring / bored、say / tell 这类词性错：把词和它常处的句子位置一起记。',
  structure: '语序与句型：there be、形式主语 it、疑问句倒装都是中文没有的骨架。',
  other: '先把这一条重认一遍，攒够同类再归纳。',
};

const CATEGORY_RULES: Array<[CorrectionCategory, RegExp]> = [
  ['tense', /时态|过去|完成|进行|现在分词|tense|past\b|perfect|progressive/i],
  ['article', /冠词|不定冠|定冠|a\/an|articles?\b|限定词|零冠词/i],
  ['number', /单复数|复数|不可数|可数|plural|uncountable/i],
  ['agreement', /主谓一致|三单|第三人称|subject-?verb|agreement/i],
  ['wordclass', /词性|形容词误用|副词误用|名词误用|part of speech|boring\/bored|-ing\b.*-ed|-ed.*-ing/i],
  ['preposition', /介词|preposition|(?:in|on|at|to)与|搭配介词/i],
  ['literal', /直译|中式|字面|望文生义|chinglish|literal/i],
  ['collocation', /搭配|动宾|固定短|collocation|选词|用词|更自然|习惯用语?/i],
  ['structure', /语序|句型|倒装|形式主语|从句|句式|结构|there be|word order|syntax|sentence structure/i],
];

/**
 * 纯函数：单条归类别（守卫真跑）。
 * **证据有优先级**：先看 AI 的说明列（note），说明为空才退到中文提示列（chineseHint）。
 * 中文提示翻的是句子内容，里面出现"昨天/已经/完成"很正常，拿它当主证据会把一堆
 * 好端端的句子归成"时态错误"。
 */
export function classifyCorrection(n: Pick<ICorrectionNote, 'wrong' | 'right' | 'note' | 'chineseHint'>): CorrectionCategory {
  const evidences = [n.note, n.chineseHint]
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean);
  for (const text of evidences) {
    for (const [cat, re] of CATEGORY_RULES) if (re.test(text)) return cat;
  }
  return 'other';
}

/** 纯函数：按类别汇总（保持首次出现的顺序，数量降序只是展示层的事） */
export function summarizeCorrections(notes: ICorrectionNote[]): Array<{ category: CorrectionCategory; count: number; ids: string[] }> {
  const byCat = new Map<CorrectionCategory, string[]>();
  for (const n of notes) {
    const cat = classifyCorrection(n);
    const bucket = byCat.get(cat);
    if (bucket) bucket.push(n.id);
    else byCat.set(cat, [n.id]);
  }
  return [...byCat.entries()].map(([category, ids]) => ({ category, count: ids.length, ids }));
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
