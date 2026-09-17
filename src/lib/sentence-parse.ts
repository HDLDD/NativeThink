/**
 * 拆句解析 —— 把标注好的意群定位回整句的字符区间，并算出「标准断点」。
 *
 * 为什么不在数据里靠「片段直接拼接」：那样每段都得精确带上尾随空格，作者一疏忽
 * 就错位。这里改为运行时匹配，对空白与撇号宽容，匹配不上会明确报错（开发期即可发现）。
 */
import type { ISentenceLabItem, ISentenceSegment } from '@/data/sentence-lab';

export interface IResolvedSegment {
  seg: ISentenceSegment;
  /** 在整句中的字符区间 [start, end) */
  start: number;
  end: number;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 撇号/引号/破折号统一，避免同一句因排版差异匹配失败 */
function foldChars(s: string): string {
  return s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-');
}

/**
 * 把意群逐块定位到整句。返回 null 表示数据有问题（片段在原文中找不到），
 * 调用方应回退到「按片段顺序铺排」而不是硬算区间。
 */
export function resolveSegments(item: ISentenceLabItem): IResolvedSegment[] | null {
  const out: IResolvedSegment[] = [];
  let cursor = 0;
  for (const seg of item.segments) {
    const raw = seg.t.trim();
    if (!raw) return null;
    // 片段内部的空白一律放宽为 \s+，其余字符逐字匹配（撇号先折叠）
    const pattern = foldChars(raw)
      .split(/\s+/)
      .map(escapeRe)
      .join('\\s+');
    const re = new RegExp(pattern, 'g');
    const hay = foldChars(item.en);
    re.lastIndex = cursor;
    const m = re.exec(hay);
    if (!m) return null;
    out.push({ seg, start: m.index, end: m.index + m[0].length });
    cursor = m.index + m[0].length;
  }
  return out;
}

/** 词元：单词或分隔符（标点、空白），用于渲染可点击的断点 */
export interface IToken {
  text: string;
  /** 是否为可断开的「词」（含词内撇号，如 it'll） */
  isWord: boolean;
}

export function tokenize(en: string): IToken[] {
  const tokens: IToken[] = [];
  // 词 = 字母数字 + 词内撇号/连字符；其余（空格、标点在词后）算分隔
  const re = /[A-Za-z0-9]+(?:['\u2019-][A-Za-z0-9]+)*|[^A-Za-z0-9]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(en))) {
    tokens.push({ text: m[0], isWord: /^[A-Za-z0-9]/.test(m[0]) });
  }
  return tokens;
}

/**
 * 标准断点 —— 每个意群的首词之前是一个断点。
 * 返回值是「词序号」的集合：第 n 个词之前断开（0 号不算，那是句首）。
 */
export function standardBreaks(item: ISentenceLabItem): Set<number> {
  const resolved = resolveSegments(item);
  if (!resolved) return new Set();
  const tokens = tokenize(item.en);
  // 记录每个词的起始字符下标 → 词序号
  const wordStarts: number[] = [];
  let pos = 0;
  for (const tk of tokens) {
    if (tk.isWord) wordStarts.push(pos);
    pos += tk.text.length;
  }
  const breaks = new Set<number>();
  // 第一个意群之外的每个意群，取它起始位置对应的词序号
  for (let i = 1; i < resolved.length; i++) {
    const start = resolved[i].start;
    // 找到起始位置之后（含）的第一个词
    let wi = wordStarts.findIndex((p) => p >= start);
    if (wi < 0) continue;
    breaks.add(wi);
  }
  return breaks;
}

/** 断点集合 → 意群切分结果（每个意群由若干词组成），用于渲染对照 */
export function splitByBreaks(en: string, breaks: Set<number>): string[] {
  const tokens = tokenize(en);
  const parts: string[] = [];
  let cur = '';
  let wordIdx = 0;
  for (const tk of tokens) {
    if (tk.isWord) {
      if (wordIdx > 0 && breaks.has(wordIdx) && cur.trim()) {
        parts.push(cur.trim());
        cur = '';
      }
      wordIdx++;
    }
    cur += tk.text;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}
