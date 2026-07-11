// Reading content types — used by the unified PageReader component

export type ContentType = 'book' | 'publication' | 'ai' | 'speech' | 'wikipedia';
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type TransMode = 'en' | 'bilingual' | 'zh';

export interface IParagraph {
  en: string;
  zh: string;
}

export interface IPage {
  paragraphs: IParagraph[];
  pageNumber: number;
}

/** Unified reading content for the PageReader */
export interface IReadingContent {
  id: string;
  type: ContentType;
  title: string;
  zhTitle: string;
  author?: string;
  zhAuthor?: string;
  source: string;
  topic: string;
  difficulty: Level;
  cover?: string;
  pages: IPage[];
  totalWords: number;
}

/** Build pages from paragraph pairs — autopaginate by word count (~200-400 words/page) */
export function buildPages(paragraphs: IParagraph[], maxWordsPerPage = 300): IPage[] {
  const pages: IPage[] = [];
  let current: IParagraph[] = [];
  let currentWords = 0;

  for (const p of paragraphs) {
    const wc = p.en.split(/\s+/).filter(Boolean).length;
    if (currentWords + wc > maxWordsPerPage && current.length > 0) {
      pages.push({ paragraphs: current, pageNumber: pages.length + 1 });
      current = [];
      currentWords = 0;
    }
    current.push(p);
    currentWords += wc;
  }
  if (current.length > 0) {
    pages.push({ paragraphs: current, pageNumber: pages.length + 1 });
  }
  return pages;
}

/** Tokenize paragraph into clickable words (preserving punctuation positions) */
export function tokenizeWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}
