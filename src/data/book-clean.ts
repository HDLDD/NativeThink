/**
 * Gutenberg 正文清洗 —— 从 `src/data/books.ts` 拆出的**纯函数**（2026-09-29）。
 *
 * 为什么单独成模块：`book-fulltext.ts` 只要 `cleanBookParagraphs` 这一个函数，
 * 但它原先住在 books.ts 里，而 books.ts 同时装着 22 本书的全部节选正文（611KB 源码 /
 * 231KB gzip）。静态 import 一个纯函数 = 把整个书库一起拖进阅读器与文章页的依赖图，
 * 于是 /articles 首屏白背 231KB。搬出来之后 books.ts 只被"真要取节选正文"的路径引用。
 *
 * 行为与原实现逐字一致，未做任何逻辑改动。
 */

import type { IParagraph } from './reading';

// Helper to build book content from English paragraphs (zh empty, client-AI fills in)
const GUTENBERG_PATTERNS = [
  /The Project Gutenberg eBook of/i,
  /Project Gutenberg/i,
  /This eBook is for the use of anyone/i,
  /You may copy it, give it away/i,
  /Gutenberg License/i,
  /Gutenberg™/i,
  /www\.gutenberg\.org/i,
  /Other information and formats/i,
  /Credits:/i,
  /Online Distributed Proofreading/i,
  /Produced by/i,
  /This file was produced from/i,
  /\*\*\* START OF THE PROJECT GUTENBERG EBOOK/i,
  /\*\*\* END OF THE PROJECT GUTENBERG EBOOK/i,
  /CHISWICK PRESS/i,
  /CHARLES WHITTINGHAM/i,
  /TOOKS COURT/i,
];


/**
 * 章节标题识别 —— 覆盖各时期出版物的常见样式（实测 22 本公版书后补齐）：
 *   CHAPTER I. Down the Rabbit-Hole   （章节号 + 同行小标题）
 *   CHAPTER 1. Loomings.
 *   I. A SCANDAL IN BOHEMIA           （裸编号 + 标题）
 *   I.                                （整行只有编号）
 *   BOOK THE FIRST / BOOK I / PART I / VOLUME ONE / LETTER 1 / SECTION 3
 *   THE FIRST BOOK                    （Meditations 式）
 *   第 1 章
 *   STORY OF THE DOOR                 （全大写小节名，见 isCapsHeading）
 */
// 编号部分：数字 / 罗马数字 / 英文数字（用字面量正则，避免模板字符串转义歧义）
const CHAPTER_PATTERNS: RegExp[] = [
  // CHAPTER 1. Loomings. / CHAPTER I. Down the Rabbit-Hole / Chapter Twenty
  /^chapter\s+(\d{1,4}|[ivxlcdm]{1,12}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b[\s.:—–-]*.{0,80}$/i,
  // BOOK I / BOOK THE FIRST / PART II / VOLUME ONE / LETTER 3 / SECTION 2
  /^book\s+(the\s+)?(\d{1,4}|[ivxlcdm]{1,12}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b[\s.:—–-]*.{0,80}$/i,
  /^part\s+(the\s+)?(\d{1,4}|[ivxlcdm]{1,12}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b[\s.:—–-]*.{0,80}$/i,
  /^volume\s+(the\s+)?(\d{1,4}|[ivxlcdm]{1,12}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b[\s.:—–-]*.{0,80}$/i,
  /^letter\s+(\d{1,4}|[ivxlcdm]{1,12}|one|two|three|four|five|six|seven|eight|nine|ten)\b[\s.:—–-]*.{0,80}$/i,
  /^section\s+(\d{1,4}|[ivxlcdm]{1,12}|one|two|three|four|five|six|seven|eight|nine|ten)\b[\s.:—–-]*.{0,80}$/i,
  // THE FIRST BOOK（Meditations 式）
  /^(the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+book\b.{0,60}$/i,
  /^第\s*[0-9一二三四五六七八九十百]+\s*[章节回篇].{0,40}$/,
  // 裸编号：整行只有编号（可带句点）
  /^[ivxlcdm]{1,12}\s*[.·]?$/i,
  // 编号 + 标题：I. A SCANDAL IN BOHEMIA
  /^[ivxlcdm]{1,12}\s*[.·]\s+[A-Z"'“].{2,70}$/,
];

/**
 * 全大写小节名启发式（Jekyll & Hyde 的 STORY OF THE DOOR 等）：
 * 短、全大写、无数字、无句末标点、至少两个词 —— 避免误判普通强调句与目录页。
 */
function isCapsHeading(t: string): boolean {
  if (t.length < 5 || t.length > 55) return false;
  if (t !== t.toUpperCase()) return false;
  if (/\d/.test(t)) return false;
  if (/[.!?:;,]$/.test(t)) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length < 5) return false;
  return /\s/.test(t.trim());
}

function isGutenbergBoilerplate(text: string): boolean {
  return GUTENBERG_PATTERNS.some((p) => p.test(text));
}

/**
 * 仅按"明确章节标记"判断（不含全大写启发式）。
 * 全大写小节名由调用方按 useCapsHeadings 决定是否启用 —— 否则会把
 * 出版社名/书名页（GEORGE ALLEN PUBLISHER）也算成章节。
 */
function isChapterHeader(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return CHAPTER_PATTERNS.some((p) => p.test(trimmed));
}

// Split a paragraph that contains MULTIPLE chapter-like headers (e.g. "CHAPTER I. One CHAPTER II. Two")
// into individual chapter entries, each prefixed with ##CHAPTER##.
const MULTI_CHAPTER_RE = /(?:CHAPTER|Chapter|PART|Part|BOOK|Book|VOLUME|Volume)\s+[IVXLCDM\d]+\.?\s*|\b[IVX]{2,}\.\s+|\b[IVX]\.\s+|\b[IVX]{2,}\s+[A-Z]/g;
function splitMultiChapterParagraph(text: string): string[] | null {
  // Count chapter-like markers
  const matches = [...text.matchAll(MULTI_CHAPTER_RE)];
  if (matches.length < 2) return null; // single or no chapters — handle normally

  // Build split points from match indices
  const parts: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!;
    const end = i < matches.length - 1 ? matches[i + 1].index! : text.length;
    parts.push(text.slice(start, end).trim());
  }
  return parts;
}

export function cleanBookParagraphs(enParas: string[]): IParagraph[] {
  const result: IParagraph[] = [];
  let foundStart = false;
  let foundEnd = false;

  // ── 预扫描：统计"明确章节标记"的数量 ──
  // 若一本书本身有充足的章节标记（>=5），就不要启用"全大写小节名"启发式，
  // 否则会把出版社名、书名页（GEORGE ALLEN PUBLISHER / NEW YORK）误判成章节，
  // 导致目录里塞进几十条垃圾条目。
  let strongMarkers = 0;
  {
    let inContent = false;
    for (const en of enParas) {
      if (/\*\*\* START OF THE PROJECT GUTENBERG EBOOK/i.test(en)) { inContent = true; continue; }
      if (/\*\*\* END OF THE PROJECT GUTENBERG EBOOK/i.test(en)) break;
      if (!inContent) continue;
      if (CHAPTER_PATTERNS.some((p) => p.test(en.trim())) || splitMultiChapterParagraph(en)) strongMarkers++;
      if (strongMarkers >= 5) break;
    }
  }
  const useCapsHeadings = strongMarkers < 5; // 只有缺章节标记的书才靠全大写小节名

  for (const en of enParas) {
    // Handle START/END markers BEFORE the general boilerplate check
    if (/\*\*\* START OF THE PROJECT GUTENBERG EBOOK/i.test(en)) {
      foundStart = true;
      continue; // skip the marker itself
    }
    if (/\*\*\* END OF THE PROJECT GUTENBERG EBOOK/i.test(en)) {
      foundEnd = true;
      continue; // skip the marker itself
    }

    // Skip boilerplate before content starts
    if (!foundStart) {
      if (isGutenbergBoilerplate(en)) continue;
      // If this paragraph doesn't look like boilerplate and we haven't found a START marker,
      // it's probably a book without explicit markers — include it
      foundStart = true;
    }

    if (foundEnd) break; // stop processing after END marker

    // Mark chapters — handle both single-chapter paragraphs and multi-chapter lists
    const chapterParts = splitMultiChapterParagraph(en);
    if (chapterParts) {
      for (const part of chapterParts) {
        result.push({ en: `##CHAPTER##${part}`, zh: '' });
      }
    } else if (isChapterHeader(en) || (useCapsHeadings && isCapsHeading(en.trim()))) {
      result.push({ en: `##CHAPTER##${en}`, zh: '' });
    } else {
      result.push({ en, zh: '' });
    }
  }

  // Fallback: if NO chapters were detected, insert synthetic chapter markers
  // every ~3000 words so the TOC still has entries to show
  const chapterCount = result.filter((p) => p.en.startsWith('##CHAPTER##')).length;
  // 章节标记过少（<3）且篇幅较长 → 视为"没有可用章节结构"，改用等长自动分节，
  // 否则整本书会挤在一两个章节里，目录形同虚设
  const hasAnyChapter = chapterCount >= 3 || result.length <= 30;
  if (!hasAnyChapter && result.length > 5) {
    const synthetic: IParagraph[] = [];
    let wordCount = 0;
    let chapNum = 1;
    const WORDS_PER_CHAPTER = 3000;
    for (let i = 0; i < result.length; i++) {
      const wc = result[i].en.split(/\s+/).filter(Boolean).length;
      if (wordCount >= chapNum * WORDS_PER_CHAPTER) {
        const preview = result[i].en.split(/\s+/).slice(0, 8).join(' ') + '...';
        synthetic.push({ en: `##CHAPTER##Chapter ${chapNum} — ${preview}`, zh: '' });
        chapNum++;
      }
      synthetic.push(result[i]);
      wordCount += wc;
    }
    return synthetic;
  }

  return result;
}
