/**
 * book-fulltext — 书籍全文运行时升级。
 *
 * books.ts 内置的是压缩版（约 4800 词，避免首屏加载 22 本全集）。
 * 打开书籍时从这里拉取古腾堡完整原文（公版书），复用 books.ts 的
 * 章节切分逻辑 → 真实章节目录 + 完整内容，处理结果存 IndexedDB。
 */

import { buildPages, type IPage, type IParagraph } from './reading';
import { cleanBookParagraphs } from './books';
import { idbGet, idbSet } from '@/lib/idb';

export interface FullBookResult {
  pages: IPage[];
  totalWords: number;
  chapterCount: number;
}

const CACHE_PREFIX = 'book-full-';
const fetchAbort = new Map<number, AbortController>();

function splitParagraphs(text: string): string[] {
  // 古腾堡 txt：段落以空行分隔；把硬换行合并成整段
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\r?\n(?!\r?\n)/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 1);
}

/** 抓取并解析完整原文（带 IndexedDB 缓存；重复打开秒出） */
export async function fetchFullBook(
  gutenbergId: number,
  onStatus?: (s: 'fetching' | 'parsing' | 'done') => void,
): Promise<FullBookResult | null> {
  const cacheKey = CACHE_PREFIX + gutenbergId;
  try {
    const cached = await idbGet<FullBookResult>(cacheKey);
    if (cached?.pages?.length) {
      onStatus?.('done');
      return cached;
    }
  } catch { /* idb 不可用 — 继续网络抓取 */ }

  // 并发去重：同一本书只抓一次
  const existing = fetchAbort.get(gutenbergId);
  if (existing) {
    // 等待进行中的那次
    await new Promise<void>((r) => { const t = setInterval(() => { if (!fetchAbort.has(gutenbergId)) { clearInterval(t); r(); } }, 200); });
    try {
      const cached2 = await idbGet<FullBookResult>(cacheKey);
      if (cached2?.pages?.length) return cached2;
    } catch { /* ignore */ }
    return null;
  }

  const controller = new AbortController();
  fetchAbort.set(gutenbergId, controller);
  try {
    onStatus?.('fetching');
    // 走函数代理（gutenberg.org 无 CORS 头，浏览器无法直连）
    let text: string | null = null;
    try {
      const res = await fetch(`/api/gutenberg?id=${gutenbergId}`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        text = data?.text || null;
      }
    } catch { /* proxy 不可达 */ }
    if (!text || text.length < 5000) return null;

    onStatus?.('parsing');
    const paragraphs: IParagraph[] = cleanBookParagraphs(splitParagraphs(text));
    if (paragraphs.length < 10) return null;

    const pages = buildPages(paragraphs);
    const chapterCount = paragraphs.filter((p) => p.en.startsWith('##CHAPTER##')).length;
    const result: FullBookResult = {
      pages,
      totalWords: paragraphs.reduce((sum, p) => sum + p.en.split(/\s+/).filter(Boolean).length, 0),
      chapterCount,
    };

    try { await idbSet(cacheKey, result); } catch { /* quota — 不阻塞 */ }
    onStatus?.('done');
    return result;
  } finally {
    fetchAbort.delete(gutenbergId);
  }
}
