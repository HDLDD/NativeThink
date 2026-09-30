/**
 * rv-articles — 「用复习词汇生成文章」（阅读页 AI 标签）的纯函数层。
 *
 * 这套功能有三条容易做坏的语义，全部收在这里以便单测：
 *  1. **词表 = 到期词 − 任何一篇现存文章用过的词**（`rvWords`）。
 *     「已经生成的复习单词从记录里删除、未被选中的保留」就是这条派生 ——
 *     不存在单独的"已用清单"：两份真相一定会漂移，而这里删掉文章就自动放回。
 *  2. **分篇**：按「每篇词数」把选中的词切批；一次最多生成 `limit` 篇，
 *     超出的批次**不消费**（对应词仍在词表与选中态里，下次可继续）。
 *  3. 一篇文章声明它用掉了哪些词（`rvWords`）是书面的、可回放的依据 —— 但只记**真的出现在正文里**的词
 *     （`coveredReviewWords`），漏掉的回到词表继续等复习。
 */

import { matchesHighlight } from './reader-highlight';

export interface IRvArticleLike {
  /** 该文章用掉的待复习词（小写 wordKey）；非复习词汇文章没有此字段 */
  rvWords?: string[] | null;
}

/** 所有现存文章用过的词 key（并集；重复词、空串都安全） */
export function usedReviewWordKeys(articles: IRvArticleLike[]): Set<string> {
  const used = new Set<string>();
  for (const a of articles) {
    for (const k of a.rvWords ?? []) {
      if (k) used.add(k);
    }
  }
  return used;
}

/** 待复习词表：过期词里**去掉已被文章用掉的**，保持原顺序 */
export function reviewWordRecord<T extends { wordKey: string }>(due: T[], used: Set<string>): T[] {
  return due.filter((w) => !used.has(w.wordKey));
}

/**
 * 把选中的词按「每篇词数」切批；最多保留 `limit` 批。
 * `skippedBatches` = 因超限没有排进本次的批数（对应词不消费，留在列表）。
 */
export function planRvBatches<T>(
  selected: T[],
  perArticle: number,
  limit: number,
): { batches: T[][]; skippedBatches: number } {
  const per = Math.max(1, Math.floor(perArticle));
  const all: T[][] = [];
  for (let i = 0; i < selected.length; i += per) all.push(selected.slice(i, i + per));
  const keep = Math.max(0, Math.floor(limit));
  return { batches: all.slice(0, keep), skippedBatches: Math.max(0, all.length - keep) };
}

/** 正文拆成小写单词序列（保留词内撇号/连字符，之后再由 norm 口径归一） */
export function tokenizeWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? []);
}

/** 与 `reader-highlight.ts` 的 `norm` 同口径：只留小写字母 */
const lettersOnly = (w: string) => w.toLowerCase().replace(/[^a-z]/g, '');

/**
 * 短语键（含空格/连字符）按**连续 token 序列**匹配，每个位置沿用高亮那套形态容忍。
 * 单词键走 `matchesHighlight`，避免在这里长出第二套变形规则。
 */
function keyAppears(key: string, tokens: string[]): boolean {
  const parts = key.toLowerCase().split(/[\s'-]+/).map(lettersOnly).filter(Boolean);
  if (!parts.length) return false;
  if (parts.length === 1) return tokens.some((t) => matchesHighlight(t, parts));
  for (let i = 0; i + parts.length <= tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < parts.length; j++) {
      const tk = lettersOnly(tokens[i + j]);
      if (tk !== parts[j] && !matchesHighlight(tk, [parts[j]])) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * 目标词里**真的出现在正文中**的那些。
 *
 * 为什么需要：提示词要求"用上全部词"，但词数一放开，模型漏用是常态。
 * 如果按"点过名就算用过"来记 `rvWords`，那些没进文章的词就从记录里消失了 ——
 * 正是用户报的"对不上完整的需要复习的单词"的另一种复发。
 * 所以：`rvWords` 只记真出现在文里的，漏掉的自动回到词表继续等复习。
 *
 * 形态归并**复用阅读器那一个函数**（`reader-highlight.ts:107`），
 * 不在这里重写第二套 s/ed/ing 规则 —— 两处口径必须一致，否则高亮显示"命中"而记录说"没用上"。
 */
export function coveredReviewWords(keys: string[], text: string): string[] {
  const tokens = tokenizeWords(text);
  return keys.filter((k) => !!k && keyAppears(k, tokens));
}

/** 段落数随词数走：约每 3 词 1 段，下限 3 上限 12（上限是为了别把 4096 token 的回复写断） */
export function rvParaCount(wordCount: number): number {
  return Math.max(3, Math.min(12, Math.ceil(Math.max(0, wordCount) / 3)));
}

export interface IRvPromptArgs {
  keys: string[];
  paraCount: number;
  level: string;
  /** 体裁 key（说明文/记叙文/…），由 `RV_GENRES` 提供 */
  genre: string;
  /** 主题 key，'free' 表示不限 */
  topic: string;
  genreLabel: string;
  topicLabel: string;
}

/**
 * 生成提示词的**唯一构造点**（放这里是为了能真跑单测：体裁/主题没进提示词，
 * UI 上的选择就是假的）。
 */
export function buildRvPrompt(a: IRvPromptArgs): { system: string; user: string } {
  const wordList = a.keys.join(', ');
  const topicClause = a.topic === 'free' ? '' : ` on the topic of "${a.topicLabel}"`;
  const system = [
    `Write an English article (${a.genreLabel}) of exactly ${a.paraCount} paragraphs for ${a.level} learners${topicClause}`,
    `that naturally incorporates ALL of these words: ${wordList}.`,
    `Every listed word must appear at least once (inflected forms are fine).`,
    'Keep it coherent as a piece of writing, not a list of sentences.',
    'Return ONLY valid JSON: {"title":"...","paragraphs":[{"en":"paragraph","zh":"Chinese translation"}]}',
  ].join(' ');
  return { system, user: `Use all these words: ${wordList}.` };
}

/**
 * 「重写这一篇」用的词表：优先按文章**实际用掉**的词重写；
 * 老数据里没记 `rvWords` 的文章退回它的高亮词表，两者都没有就不给重写入口。
 */
export function rvRegenKeys(article: { rvWords?: string[] | null; highlightWords?: string[] | null }): string[] {
  const src = article.rvWords?.length ? article.rvWords : article.highlightWords ?? [];
  return (src ?? []).filter(Boolean);
}
