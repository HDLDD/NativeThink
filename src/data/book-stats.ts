/**
 * 内置书的真实规模 —— 由 scripts/dump-book-texts.cjs 生成 public/books/index.json。
 *
 * 为什么需要：books.ts 里的 totalWords 是「压缩节选」的词数（每本约 4800 词，
 * 目的是首屏不加载 22 本全集），书单直接用它会让所有书看起来一样厚
 * （基督山伯爵实际 46 万词，节选只有 4,870 词）。阅读器内页已由 fetchFullBook
 * 升级为全文词数，这里补上书单等外部列表的真实数字。
 */

export interface IBookStat {
  words: number;
  chapters: number;
}

let cache: Record<string, IBookStat> = {};
let inflight: Promise<Record<string, IBookStat>> | null = null;

/** 载入真实规模清单（并发去重；失败则保持为空，调用方回落到节选数字） */
export function loadBookStats(): Promise<Record<string, IBookStat>> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('/books/index.json');
      if (res.ok) {
        const data = (await res.json()) as Record<string, IBookStat>;
        if (data && typeof data === 'object') cache = data;
      }
    } catch { /* 没有清单时不影响使用 */ }
    return cache;
  })();
  return inflight;
}

/** 取某本书的真实规模；无记录返回 null（调用方回落到 totalWords） */
export function getBookStat(id: string): IBookStat | null {
  return cache[id] ?? null;
}
