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

// v2：随包全文取代联网拉取，缓存键换代以丢弃旧的解析结果
const CACHE_PREFIX = 'book-full-v2-';
const inFlight = new Map<number, Promise<FullBookResult | null>>();

function splitParagraphs(text: string): string[] {
  // 古腾堡 txt：段落以空行分隔；把硬换行合并成整段
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\r?\n(?!\r?\n)/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 1);
}

/**
 * 随包全文（scripts/dump-book-texts.cjs 导出到 public/books/<id>.txt）。
 * 这是首选来源：零网络、零等待，且不会出现「联网失败 → 静默退回压缩节选」。
 * 节选与全文的章节结构完全不同（实测基督山伯爵：节选 1 章 vs 全文 124 章），
 * 一旦退回节选，章节会缺失、译文会按章号错位贴上别章的中文。
 */
async function loadBundledText(gutenbergId: number): Promise<string | null> {
  try {
    const res = await fetch(`/books/${gutenbergId}.txt`);
    if (!res.ok) return null;
    const t = await res.text();
    if (!t || t.length < 5000) return null;
    // 静态托管在文件缺失时会用 SPA 兜底、以 200 返回 index.html —— 那不是书
    if (/^\s*<(!doctype|html)/i.test(t)) return null;
    return t;
  } catch { return null; }
}

/** 联网兜底：随包没有这本书（例如用户新导入）时走函数代理 */
async function loadRemoteText(gutenbergId: number): Promise<string | null> {
  try {
    const res = await fetch(`/api/gutenberg?id=${gutenbergId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.text || null;
  } catch { return null; }
}

/** 抓取并解析完整原文（Promise 共享去重 + IndexedDB 缓存） */
export function fetchFullBook(
  gutenbergId: number,
  onStatus?: (s: 'fetching' | 'parsing' | 'done') => void,
): Promise<FullBookResult | null> {
  const existing = inFlight.get(gutenbergId);
  if (existing) return existing;

  const cacheKey = CACHE_PREFIX + gutenbergId;
  (window as any).__ft = 'start';
  const p = (async (): Promise<FullBookResult | null> => {
    try {
      const cached = await idbGet<FullBookResult>(cacheKey);
      (window as any).__ft = cached ? 'cache-hit' : 'cache-miss';
      if (cached?.pages?.length) {
        onStatus?.('done');
        return cached;
      }
    } catch { (window as any).__ft = 'idb-err'; }

    (window as any).__ft = 'fetching';
    // 随包全文优先（本地文件，秒到）；包里没有才联网
    let text = await loadBundledText(gutenbergId);
    (window as any).__ft = text ? 'bundled' : 'proxy';
    if (!text) text = await loadRemoteText(gutenbergId);
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
  })();

  inFlight.set(gutenbergId, p);
  p.finally(() => inFlight.delete(gutenbergId)).catch(() => {});
  return p;
}
