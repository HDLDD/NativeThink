/**
 * Generate src/data/books.ts from Gutenberg data.
 * Fetches 22 books' raw text, cleans + parses into paragraphs,
 * outputs with placeholder zh strings. AI translation runs client-side on first read.
 *
 * Usage: NODE_OPTIONS="--use-system-ca" npx -y tsx scripts/generate-books.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT = path.resolve(__dirname, '../src/data/books.ts');

// 22 books — same as GUTENBERG_BOOKS in ArticlePage
const BOOKS: { id: number; title: string; zhTitle: string; author: string; zhAuthor: string; topic: string }[] = [
  { id: 1342, title: 'Pride and Prejudice', zhTitle: '傲慢与偏见', author: 'Jane Austen', zhAuthor: '简·奥斯汀', topic: 'literature' },
  { id: 84, title: 'Frankenstein', zhTitle: '弗兰肯斯坦', author: 'Mary Shelley', zhAuthor: '玛丽·雪莱', topic: 'literature' },
  { id: 11, title: "Alice's Adventures in Wonderland", zhTitle: '爱丽丝梦游仙境', author: 'Lewis Carroll', zhAuthor: '刘易斯·卡罗尔', topic: 'literature' },
  { id: 1661, title: 'The Adventures of Sherlock Holmes', zhTitle: '福尔摩斯探案集', author: 'Arthur Conan Doyle', zhAuthor: '柯南·道尔', topic: 'literature' },
  { id: 345, title: 'Dracula', zhTitle: '德古拉', author: 'Bram Stoker', zhAuthor: '布莱姆·斯托克', topic: 'literature' },
  { id: 2701, title: 'Moby Dick', zhTitle: '白鲸', author: 'Herman Melville', zhAuthor: '赫尔曼·梅尔维尔', topic: 'literature' },
  { id: 43, title: 'Dr. Jekyll and Mr. Hyde', zhTitle: '化身博士', author: 'Robert Louis Stevenson', zhAuthor: '史蒂文森', topic: 'literature' },
  { id: 174, title: 'The Picture of Dorian Gray', zhTitle: '道林·格雷的画像', author: 'Oscar Wilde', zhAuthor: '奥斯卡·王尔德', topic: 'literature' },
  { id: 730, title: 'Oliver Twist', zhTitle: '雾都孤儿', author: 'Charles Dickens', zhAuthor: '查尔斯·狄更斯', topic: 'literature' },
  { id: 1400, title: 'Great Expectations', zhTitle: '远大前程', author: 'Charles Dickens', zhAuthor: '查尔斯·狄更斯', topic: 'literature' },
  { id: 2600, title: 'War and Peace', zhTitle: '战争与和平', author: 'Leo Tolstoy', zhAuthor: '列夫·托尔斯泰', topic: 'literature' },
  { id: 1184, title: 'The Count of Monte Cristo', zhTitle: '基督山伯爵', author: 'Alexandre Dumas', zhAuthor: '大仲马', topic: 'literature' },
  { id: 98, title: 'A Tale of Two Cities', zhTitle: '双城记', author: 'Charles Dickens', zhAuthor: '查尔斯·狄更斯', topic: 'literature' },
  { id: 1260, title: 'Jane Eyre', zhTitle: '简·爱', author: 'Charlotte Brontë', zhAuthor: '夏洛蒂·勃朗特', topic: 'literature' },
  { id: 768, title: 'Wuthering Heights', zhTitle: '呼啸山庄', author: 'Emily Brontë', zhAuthor: '艾米莉·勃朗特', topic: 'literature' },
  { id: 76, title: 'Huckleberry Finn', zhTitle: '哈克贝利·费恩历险记', author: 'Mark Twain', zhAuthor: '马克·吐温', topic: 'literature' },
  { id: 244, title: 'The Time Machine', zhTitle: '时间机器', author: 'H.G. Wells', zhAuthor: 'H.G.威尔斯', topic: 'literature' },
  { id: 1232, title: 'The Prince', zhTitle: '君主论', author: 'Niccolò Machiavelli', zhAuthor: '马基雅维利', topic: 'philosophy' },
  { id: 1635, title: 'Meditations', zhTitle: '沉思录', author: 'Marcus Aurelius', zhAuthor: '马可·奥勒留', topic: 'philosophy' },
  { id: 3600, title: 'The Wealth of Nations', zhTitle: '国富论', author: 'Adam Smith', zhAuthor: '亚当·斯密', topic: 'business' },
  { id: 1228, title: 'On the Origin of Species', zhTitle: '物种起源', author: 'Charles Darwin', zhAuthor: '查尔斯·达尔文', topic: 'science' },
  { id: 3300, title: 'The Republic', zhTitle: '理想国', author: 'Plato', zhAuthor: '柏拉图', topic: 'philosophy' },
];

function cleanGutenberg(raw: string): string {
  return raw
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // control chars
    .trim();
}

function splitParagraphs(text: string): string[] {
  // Split by double newlines, then filter short/garbage lines
  return text
    .split(/\n\n+/)
    .map((p) => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((p) => {
      if (p.length < 60) return false; // too short
      if (/^(Chapter|CHAPTER|VOLUME|BOOK|PART|SECTION|ACT|SCENE)\s/i.test(p) && p.length < 150) return false;
      if (/^(Produced|Transcribed|Proofread|Scanned|Updated|Release Date|Character set)/i.test(p)) return false;
      return true;
    });
}

function pickBestParagraphs(paras: string[], maxWords: number): string[] {
  let total = 0;
  const result: string[] = [];
  for (const p of paras) {
    const wc = p.split(/\s+/).filter(Boolean).length;
    if (total + wc > maxWords) break;
    result.push(p);
    total += wc;
  }
  return result;
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ').replace(/\r/g, '');
}

async function fetchBook(id: number, maxWords = 5000): Promise<string[]> {
  const url = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
  console.log(`  Fetching ${url}...`);
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`    FAILED: HTTP ${res.status}`);
    return [];
  }
  const raw = await res.text();
  const cleaned = cleanGutenberg(raw);
  const paras = splitParagraphs(cleaned);
  const selected = pickBestParagraphs(paras, maxWords);
  console.log(`    Got ${raw.length} chars → ${cleaned.length} cleaned → ${paras.length} paras → ${selected.length} selected`);
  return selected;
}

async function main() {
  const lines: string[] = [];
  lines.push(`// 22 Gutenberg Books — English text + placeholder Chinese translations`);
  lines.push(`// AI translation runs client-side on first read, cached to localStorage`);
  lines.push(`// Generated by scripts/generate-books.ts`);
  lines.push(``);
  lines.push(`import type { IReadingContent, IParagraph } from './reading';`);
  lines.push(`import { buildPages } from './reading';`);
  lines.push(``);
  lines.push(`// Helper to build book content from English paragraphs (zh empty, client-AI fills in)`);
  lines.push(`function bookContent(`);
  lines.push(`  id: string, title: string, zhTitle: string, author: string, zhAuthor: string,`);
  lines.push(`  topic: string, difficulty: 'intermediate' | 'advanced',`);
  lines.push(`  enParas: string[],`);
  lines.push(`): IReadingContent {`);
  lines.push(`  const paragraphs: IParagraph[] = enParas.map((en) => ({ en, zh: '' }));`);
  lines.push(`  const pages = buildPages(paragraphs);`);
  lines.push(`  const totalWords = enParas.reduce((sum, p) => sum + p.split(/\\s+/).filter(Boolean).length, 0);`);
  lines.push(`  return { id, type: 'book', title, zhTitle, author, zhAuthor, source: 'Project Gutenberg', topic, difficulty, pages, totalWords };`);
  lines.push(`}`);
  lines.push(``);

  const allIds: string[] = [];

  for (const book of BOOKS) {
    const key = book.id.toString();
    allIds.push(key);
    console.log(`\nProcessing: ${book.title} (#${book.id})...`);
    const enParas = await fetchBook(book.id);
    if (enParas.length === 0) {
      console.log(`  SKIPPING — no content fetched`);
      continue;
    }

    // Write the English paragraphs as a const array
    const varName = `_p${book.id}`;
    lines.push(`const ${varName}: string[] = [`);
    for (const p of enParas) {
      lines.push(`  '${esc(p)}',`);
    }
    lines.push(`];`);
    lines.push(``);

    // Build the book content
    const diff = book.topic === 'philosophy' || book.topic === 'science' ? 'advanced' : 'intermediate';
    lines.push(`export const BOOK_${book.id}: IReadingContent = bookContent(`);
    lines.push(`  '${key}', '${esc(book.title)}', '${esc(book.zhTitle)}', '${esc(book.author)}', '${esc(book.zhAuthor)}',`);
    lines.push(`  '${book.topic}', '${diff}', ${varName},`);
    lines.push(`);`);
    lines.push(``);
  }

  // Export the full library array
  lines.push(`export const ALL_BOOKS: IReadingContent[] = [`);
  for (const id of allIds) {
    lines.push(`  BOOK_${id},`);
  }
  lines.push(`].filter(Boolean);`);
  lines.push(``);

  fs.writeFileSync(OUT, lines.join('\n'), 'utf-8');
  console.log(`\n✅ Written: ${OUT} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`   Books with content: ${allIds.length}`);
}

main().catch(console.error);
