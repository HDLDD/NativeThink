/**
 * 拼写题面与判分的词形口径（单点）。
 *
 * 词库例句用的是排版弯引号（U+2019，实测 6,863 条）而不是 ASCII 撇号；
 * 旧实现 `w.replace(/[^a-zA-Z'-]/g, '')` 会把 `It’s` 剥成 `Its`、把数字剥成空串，
 * 于是界面显示错、用户按原句拼写反而被判错。这里把「展示词」与「判分词」分开：
 * - 展示：弯引号/破折号归一成 ASCII，保留重音字母与数字；
 * - 判分：在展示口径上再折叠重音、转小写，用户输入走同一套规则。
 */

/** 归一单个词：两端引号去掉（‘Okay / scared,’），词内撇号保留（It’s → It's） */
export function normalizeSpellingWord(raw: unknown): string {
  let word = String(raw ?? '')
    .replace(/[\u2018\u2019\u02bc\u02b9]/g, "'")
    .replace(/[\u201c\u201d]/g, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[^\p{L}\p{N}'-]/gu, '');
  word = word.replace(/^'+|'+$/g, '').replace(/^-+|-+$/g, '');
  return word;
}

export interface ISpellingToken {
  /** 原词（保留标点，用于填空模式里非空位的阅读展示） */
  raw: string;
  /** 归一后的展示/答案词 */
  word: string;
}

/** 按空白切句，丢掉纯标点 token —— 破折号、省略号不该变成一个空格子 */
export function spellingTokens(en: unknown): ISpellingToken[] {
  return String(en ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, word: normalizeSpellingWord(raw) }))
    .filter((t) => t.word.length > 0);
}

export function getSpellingWords(en: unknown): string[] {
  return spellingTokens(en).map((t) => t.word);
}

/** 判分口径：大小写、弯/直引号、重音符号、数字千位分隔符都不影响对错 */
export function normalizeSpellingAnswer(raw: unknown): string {
  return normalizeSpellingWord(raw)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/** Fisher-Yates 洗牌（挖空位选择用，替代 sort(() => Math.random() - 0.5)） */
export function shuffledCopy<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
