/**
 * reader-shared — PageReader 双阅读模式（小说滚动 / 翻页）共享的类型与工具。
 *
 * 小说模式把 `##CHAPTER##` 标记的段落流切分成"章"，实现起点式
 * 章节目录 + 章内自然滚动阅读；翻页模式保留原有分页交互。
 */
import type { IPage, IParagraph } from '@/data/reading';

/** 阅读模式：novel = 章节制滚动阅读（默认）；paged = 左右翻页（保留旧实现） */
export type ReaderMode = 'novel' | 'paged';
export type ReaderFontSize = 'sm' | 'base' | 'lg' | 'xl';

/** 字号 → Tailwind 类（两套阅读视图共用，保证视觉一致） */
export const FONT_SIZE_CLASSES: Record<ReaderFontSize, string> = {
  sm: 'text-base leading-7',
  base: 'text-lg leading-8',
  lg: 'text-xl leading-9',
  xl: 'text-2xl leading-10',
};

const CHAPTER_PREFIX = '##CHAPTER##';

// ── 阅读进度持久化（__reader_progress_<contentId>） ──
// page:      翻页模式页码 / 小说模式当前章起始页（兼容 ArticlePage 的进度展示）
// chapter:   小说模式当前章节号
// ratio:     小说模式当前章内滚动比例（0-1）
// perChapter:小说模式每章的章内滚动位置 — "记住每章阅读位置"
export interface ReaderProgress {
  page: number;
  chapter?: number;
  ratio?: number;
  perChapter?: Record<string, number>;
}

export interface NovelChapterItem {
  /** 段落所在分页索引（对齐 validPages，翻译/显示状态按此定位） */
  pageIdx: number;
  paraIdx: number;
  para: IParagraph;
}

export interface NovelChapter {
  title: string;
  items: NovelChapterItem[];
  wordCount: number;
  /** 章首所在分页页码（pageNumber-1，与翻页模式进度互通） */
  startPage: number;
  /** 第一个 ##CHAPTER## 标记之前的内容（版权页/前言/题记） */
  isFrontMatter: boolean;
}

/** 把分页段落流切分成章节（小说模式的数据骨架）。
 *  无章节标记的内容（刊物/AI 文章/维基条目）→ 整体作为单章"全文"。 */
export function buildNovelChapters(pages: IPage[], fallbackTitle: string): NovelChapter[] {
  const valid = (pages || []).filter((pg) => pg && Array.isArray(pg.paragraphs));
  const chapters: NovelChapter[] = [];
  let current: NovelChapter | null = null;
  let seenMarker = false;

  const closeCurrent = () => {
    if (current) chapters.push(current);
  };

  valid.forEach((pg, pageIdx) => {
    pg.paragraphs.forEach((para, paraIdx) => {
      if (!para || typeof para.en !== 'string' || !para.en) return;
      if (para.en.startsWith(CHAPTER_PREFIX)) {
        closeCurrent();
        seenMarker = true;
        current = {
          title: para.en.replace(CHAPTER_PREFIX, '').trim() || `第 ${chapters.length + 1} 章`,
          items: [{ pageIdx, paraIdx, para }],
          wordCount: 0,
          startPage: Math.max(0, pg.pageNumber - 1),
          isFrontMatter: false,
        };
        return;
      }
      if (!current) {
        // 第一个章节标记前的内容 → 前言章
        current = {
          title: '前言',
          items: [],
          wordCount: 0,
          startPage: Math.max(0, pg.pageNumber - 1),
          isFrontMatter: true,
        };
      }
      current.items.push({ pageIdx, paraIdx, para });
      current.wordCount += para.en.split(/\s+/).filter(Boolean).length;
    });
  });
  closeCurrent();

  if (chapters.length === 0) {
    return [{ title: fallbackTitle || '全文', items: [], wordCount: 0, startPage: 0, isFrontMatter: false }];
  }
  // 全文没有任何章节标记 → 整本作为单章"全文"
  if (!seenMarker && chapters.length === 1) {
    chapters[0].title = fallbackTitle || '全文';
    chapters[0].isFrontMatter = false;
  }
  return chapters;
}

/** 翻页模式页码 → 小说模式章节号（取"包含该页"的最后一章） */
export function chapterForPage(chapters: NovelChapter[], page: number): number {
  let idx = 0;
  chapters.forEach((ch, i) => {
    if (ch.startPage <= page) idx = i;
  });
  return idx;
}

// ── 段落批注 ──
export interface ParaNote {
  en: string;
  note: string;
  ts: number;
}
export type ReaderNotesMap = Record<string, ParaNote>;

/** 段落批注存储 key：__nativethink_reader_notes_<contentId> */
export const readerNotesStorageKey = (contentId: string) => `__nativethink_reader_notes_${contentId}`;

/** 段落批注 key — 对全文升级稳定：对段落全文取 djb2 hash（key 只依赖段落文本本身，
 *  与章节号/段落序号解耦，全文升级导致分页重排后批注依然能对上） */
export function paraNoteKey(en: string): string {
  const s = (en || '').trim();
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return `p${h.toString(36)}_${s.length}`;
}

/** 预计阅读时长（学习者按 ~150 词/分钟估算） */
export function chapterEstMinutes(words: number): number {
  return Math.max(1, Math.round(words / 150));
}
