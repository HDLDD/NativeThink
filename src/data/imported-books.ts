/**
 * imported-books — 用户导入的外部英文书籍（txt / md / 粘贴文本）。
 *
 * 存储：IndexedDB（书籍正文可达数 MB，localStorage 放不下）
 * 解析：优先按章节标记切章（Chapter 1 / CHAPTER I / Part 2 / 第 1 章 等），
 *       没有标记时按固定词数切块并自动命名章节，保证目录可用。
 * 阅读：产出标准 IReadingContent，直接复用阅读器全部能力
 *       （查词/翻译/批注/收藏/朗读/全书翻译）。
 */

import type { IReadingContent, IParagraph } from './reading';
import { buildPages } from './reading';
import { idbGet, idbSet } from '@/lib/idb';

const IDB_KEY = 'imported-books-v1';
export const IMPORTED_ID_PREFIX = 'imp_';

export interface IImportedBook extends IReadingContent {
  importedAt: number;
  /** 原始字节数，便于展示 */
  rawBytes: number;
}

/** 章节标题识别 */
const CHAPTER_PATTERNS: RegExp[] = [
  /^chapter\s+([0-9]+|[ivxlcdm]+)\b.{0,60}$/i,
  /^part\s+([0-9]+|[ivxlcdm]+)\b.{0,60}$/i,
  /^第\s*[0-9一二三四五六七八九十百]+\s*[章节回篇].{0,40}$/,
  /^[ivxlcdm]{1,7}\.\s+[A-Z].{0,60}$/,
];

function isChapterHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 80) return false;
  return CHAPTER_PATTERNS.some((re) => re.test(t));
}

/** 把纯文本切成段落（空行分段；单换行合并） */
function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 1);
}

/** 解析文本 → 段落数组（章节标题标记为 ##CHAPTER##） */
export function parseBookText(raw: string, fallbackTitle: string): { paragraphs: IParagraph[]; chapterCount: number } {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const paragraphs: IParagraph[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    const chunk = buffer.join(' ').replace(/\s+/g, ' ').trim();
    buffer = [];
    if (chunk.length > 1) paragraphs.push({ en: chunk, zh: '' });
  };

  for (const line of lines) {
    if (isChapterHeading(line)) {
      flush();
      paragraphs.push({ en: `##CHAPTER##${line.trim()}`, zh: '' });
      continue;
    }
    if (line.trim() === '') { flush(); continue; }
    buffer.push(line.trim());
    // 过长的连续行也要断开，避免单段巨长
    if (buffer.join(' ').length > 1200) flush();
  }
  flush();

  let chapterCount = paragraphs.filter((p) => p.en.startsWith('##CHAPTER##')).length;

  // 无章节标记 → 按固定词数切块并自动命名，保证目录/跳转可用
  if (chapterCount === 0 && paragraphs.length > 12) {
    const out: IParagraph[] = [];
    let words = 0;
    let idx = 1;
    const PER = 2500;
    for (const p of paragraphs) {
      if (words >= (idx - 1) * PER) {
        const preview = p.en.split(/\s+/).slice(0, 6).join(' ');
        out.push({ en: `##CHAPTER##Section ${idx} — ${preview}…`, zh: '' });
        idx++;
      }
      out.push(p);
      words += p.en.split(/\s+/).filter(Boolean).length;
    }
    chapterCount = idx - 1;
    return { paragraphs: out, chapterCount };
  }

  // 有章节标记但首章前有前言内容 → 补一个"前言"章
  const firstMarker = paragraphs.findIndex((p) => p.en.startsWith('##CHAPTER##'));
  if (firstMarker > 0) {
    paragraphs.splice(firstMarker, 0, { en: '##CHAPTER##前言', zh: '' });
    chapterCount++;
  }

  void fallbackTitle;
  return { paragraphs, chapterCount };
}

/** 读取全部导入书籍（按导入时间倒序） */
export async function loadImportedBooks(): Promise<IImportedBook[]> {
  try {
    const list = await idbGet<IImportedBook[]>(IDB_KEY);
    if (!Array.isArray(list)) return [];
    return [...list].sort((a, b) => b.importedAt - a.importedAt);
  } catch { return []; }
}

async function persist(list: IImportedBook[]): Promise<void> {
  await idbSet(IDB_KEY, list);
}

/** 从文本创建并保存一本导入书籍 */
export async function importBookFromText(opts: {
  title: string;
  author?: string;
  text: string;
}): Promise<IImportedBook> {
  const title = opts.title.trim() || '未命名书籍';
  const { paragraphs, chapterCount } = parseBookText(opts.text, title);
  if (paragraphs.length === 0) throw new Error('文件内容为空或无法解析');

  const totalWords = paragraphs.reduce((s, p) => s + p.en.split(/\s+/).filter(Boolean).length, 0);
  const book: IImportedBook = {
    id: `${IMPORTED_ID_PREFIX}${Date.now().toString(36)}`,
    type: 'book',
    title,
    zhTitle: title,
    author: opts.author?.trim() || undefined,
    source: '导入',
    topic: 'imported',
    difficulty: 'intermediate',
    pages: buildPages(paragraphs),
    totalWords,
    importedAt: Date.now(),
    rawBytes: opts.text.length,
  };
  void chapterCount;

  const list = await loadImportedBooks();
  await persist([book, ...list.filter((b) => b.id !== book.id)]);
  return book;
}

/** 删除一本导入书籍 */
export async function deleteImportedBook(id: string): Promise<void> {
  const list = await loadImportedBooks();
  await persist(list.filter((b) => b.id !== id));
}
