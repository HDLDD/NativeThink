/**
 * Analyze and report duplicate sentences in wordbank corpus data.
 * Usage: npx tsx scripts/dedup-corpus.ts [--dry] [--fix]
 *   --dry  : report duplicates only (default)
 *   --fix  : deduplicate and generate new unique sentences
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- IExample interface (mirrors src/data/wordbank/schema.ts) ----
interface IExample {
  en: string;
  zh: string;
}

interface IWordEntry {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  meaning: string;
  level: string;
  frequencyRank: number;
  collocations: string[];
  examples: IExample[];
  synonyms: string[];
  antonyms: string[];
  wordFamily: string[];
  register: string;
  emotion: string;
  topics: string[];
  hasNoChineseEquivalent: boolean;
  deepExplanation: string;
}

interface DedupStats {
  file: string;
  totalWords: number;
  totalExamples: number;
  uniqueEn: number;
  uniqueZh: number;
  dupEnCount: number;
  dupZhCount: number;
  duplicateEnExamples: { en: string; words: string[] }[];
  duplicateZhExamples: { zh: string; words: string[] }[];
}

// Files to analyze
const WORD_DATA_DIR = path.resolve(__dirname, '../src/data/wordbank/data');
const FILES = ['cet4.ts', 'cet6.ts', 'ielts.ts', 'toefl.ts', 'advanced.ts'];

function extractWordsFromFile(filePath: string): { varName: string; words: IWordEntry[] } | null {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Extract the array name (e.g., CET4_WORDS)
  const varMatch = content.match(/export const (\w+): IWordEntry\[\] = (\[[\s\S]*\]);?\s*$/);
  if (!varMatch) {
    console.error(`Could not parse: ${filePath}`);
    return null;
  }

  const varName = varMatch[1];

  // Use Function constructor to safely evaluate the array literal
  // This is safe because we control the source files
  try {
    const fn = new Function(`return ${varMatch[2]}`);
    const words: IWordEntry[] = fn();
    return { varName, words };
  } catch (e) {
    console.error(`Failed to parse ${filePath}:`, e);
    return null;
  }
}

function analyzeFile(fileName: string, allGlobalEn: Map<string, string[]>): DedupStats | null {
  const filePath = path.join(WORD_DATA_DIR, fileName);
  const result = extractWordsFromFile(filePath);
  if (!result) return null;

  const { words } = result;
  const enSeen = new Map<string, string[]>(); // en -> [word1, word2, ...]
  const zhSeen = new Map<string, string[]>();
  let totalExamples = 0;

  for (const w of words) {
    for (const ex of w.examples) {
      totalExamples++;
      const enKey = ex.en.toLowerCase().trim();
      const zhKey = ex.zh.trim();

      if (!enSeen.has(enKey)) enSeen.set(enKey, []);
      enSeen.get(enKey)!.push(w.word);

      if (!zhSeen.has(zhKey)) zhSeen.set(zhKey, []);
      zhSeen.get(zhKey)!.push(w.word);
    }
  }

  const duplicateEnExamples: { en: string; words: string[] }[] = [];
  const duplicateZhExamples: { zh: string; words: string[] }[] = [];
  let dupEnCount = 0;
  let dupZhCount = 0;

  for (const [enKey, wordList] of enSeen) {
    if (wordList.length > 1) {
      duplicateEnExamples.push({ en: enKey, words: [...new Set(wordList)] });
      dupEnCount += wordList.length - 1; // extra copies beyond the first
    }
    // Also check across files
    if (allGlobalEn.has(enKey)) {
      const globalWords = allGlobalEn.get(enKey)!;
      for (const w of wordList) {
        if (!globalWords.includes(w)) {
          globalWords.push(w);
        }
      }
    }
  }

  for (const [zhKey, wordList] of zhSeen) {
    if (wordList.length > 1) {
      duplicateZhExamples.push({ zh: zhKey, words: [...new Set(wordList)] });
      dupZhCount += wordList.length - 1;
    }
  }

  return {
    file: fileName,
    totalWords: words.length,
    totalExamples,
    uniqueEn: enSeen.size,
    uniqueZh: zhSeen.size,
    dupEnCount,
    dupZhCount,
    duplicateEnExamples,
    duplicateZhExamples,
  };
}

function main() {
  const args = process.argv.slice(2);
  const isDry = args.includes('--dry') || !args.includes('--fix');
  const isFix = args.includes('--fix');

  console.log('='.repeat(70));
  console.log('CORPUS DUPLICATE SENTENCE ANALYSIS');
  console.log('='.repeat(70));

  // First pass: collect all EN sentences globally to find cross-file duplicates
  const allGlobalEn = new Map<string, string[]>();

  // First pass: collect all data
  const allStats: DedupStats[] = [];
  for (const file of FILES) {
    const filePath = path.join(WORD_DATA_DIR, file);
    const result = extractWordsFromFile(filePath);
    if (!result) continue;

    for (const w of result.words) {
      for (const ex of w.examples) {
        const enKey = ex.en.toLowerCase().trim();
        if (!allGlobalEn.has(enKey)) allGlobalEn.set(enKey, []);
        const existing = allGlobalEn.get(enKey)!;
        if (!existing.includes(w.word)) {
          existing.push(w.word);
        }
      }
    }
  }

  // Second pass: per-file analysis
  let grandTotalExamples = 0;
  let grandTotalDupEn = 0;
  let grandTotalDupZh = 0;

  for (const file of FILES) {
    const stats = analyzeFile(file, allGlobalEn);
    if (!stats) continue;
    allStats.push(stats);

    console.log(`\n--- ${stats.file} ---`);
    console.log(`  Words: ${stats.totalWords}`);
    console.log(`  Examples: ${stats.totalExamples}`);
    console.log(`  Unique EN: ${stats.uniqueEn}`);
    console.log(`  Unique ZH: ${stats.uniqueZh}`);
    console.log(`  Duplicate EN (within file): ${stats.dupEnCount}`);
    console.log(`  Duplicate ZH (within file): ${stats.dupZhCount}`);

    if (stats.duplicateEnExamples.length > 0) {
      console.log(`\n  Duplicate EN sentences (top 10):`);
      for (const dup of stats.duplicateEnExamples.slice(0, 10)) {
        console.log(`    "${dup.en.slice(0, 80)}..." → words: [${dup.words.join(', ')}]`);
      }
    }

    if (stats.duplicateZhExamples.length > 0) {
      console.log(`\n  Duplicate ZH sentences (top 10):`);
      for (const dup of stats.duplicateZhExamples.slice(0, 10)) {
        console.log(`    "${dup.zh.slice(0, 60)}" → words: [${dup.words.join(', ')}]`);
      }
    }

    grandTotalExamples += stats.totalExamples;
    grandTotalDupEn += stats.dupEnCount;
    grandTotalDupZh += stats.dupZhCount;
  }

  // Cross-file duplicates
  console.log(`\n${'='.repeat(70)}`);
  console.log('CROSS-FILE DUPLICATE EN SENTENCES');
  console.log('='.repeat(70));

  let crossFileCount = 0;
  const crossFileDups: { en: string; words: string[] }[] = [];
  for (const [en, wordList] of allGlobalEn) {
    if (wordList.length > 1) {
      crossFileDups.push({ en, words: wordList });
      crossFileCount += wordList.length - 1;
    }
  }

  console.log(`Total cross-file duplicate EN sentences: ${crossFileCount}`);
  console.log(`Sentences appearing in multiple words: ${crossFileDups.length}`);

  // Show some examples
  console.log(`\nSample cross-file duplicates (top 20):`);
  for (const dup of crossFileDups.slice(0, 20)) {
    console.log(`  "${dup.en.slice(0, 80)}${dup.en.length > 80 ? '...' : ''}"`);
    console.log(`    → words: [${dup.words.join(', ')}]`);
  }

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total examples across all files: ${grandTotalExamples}`);
  console.log(`Total within-file EN duplicates: ${grandTotalDupEn}`);
  console.log(`Total within-file ZH duplicates: ${grandTotalDupZh}`);
  console.log(`Total cross-file EN duplicates: ${crossFileCount}`);
  console.log(`Total duplicate instances: ${grandTotalDupEn + crossFileCount}`);

  // Also find the most common "generic" example sentences
  console.log(`\n--- Generic/placeholder example sentences ---`);
  const genericPatterns = [
    /^An example with/i,
    /^使用.*的例句/i,
    /^a sentence with/i,
    /^example with/i,
    /^an? .* example/i,
  ];

  let genericCount = 0;
  for (const file of FILES) {
    const filePath = path.join(WORD_DATA_DIR, file);
    const result = extractWordsFromFile(filePath);
    if (!result) continue;

    for (const w of result.words) {
      for (const ex of w.examples) {
        for (const pattern of genericPatterns) {
          if (pattern.test(ex.en) || pattern.test(ex.zh)) {
            genericCount++;
            console.log(`  [${file}] "${ex.en}" / "${ex.zh}" (word: ${w.word})`);
            break;
          }
        }
      }
    }
  }
  console.log(`Generic/placeholder examples: ${genericCount}`);

  if (isFix) {
    console.log(`\n--fix mode: Will generate deduplicated files...`);
    // TODO: implement dedup
  } else {
    console.log(`\nRun with --fix to deduplicate.`);
  }
}

main();
