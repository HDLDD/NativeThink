/**
 * Check for duplicate example sentences in wordbank corpus.
 *
 * Two types of checks:
 *   1. Within-word duplicates: a single word has the same example (en or zh) twice in its examples array.
 *   2. Cross-word duplicates: the same English sentence appears for more than one word.
 *
 * Usage: npx tsx scripts/check-duplicates.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Interfaces ----
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

// ---- Config ----
const WORD_DATA_DIR = path.resolve(__dirname, '../src/data/wordbank/data');
const FILES = ['cet4.ts', 'cet6.ts', 'ielts.ts', 'toefl.ts', 'advanced.ts'];

// ---- Helpers ----
function extractWordsFromFile(filePath: string): { varName: string; words: IWordEntry[] } | null {
  const content = fs.readFileSync(filePath, 'utf-8');

  const varMatch = content.match(/export const (\w+): IWordEntry\[\] = (\[[\s\S]*\]);?\s*$/);
  if (!varMatch) {
    console.error(`  Could not parse: ${filePath}`);
    return null;
  }

  try {
    const fn = new Function(`return ${varMatch[2]}`);
    const words: IWordEntry[] = fn();
    return { varName: varMatch[1], words };
  } catch (e) {
    console.error(`  Failed to parse ${filePath}:`, e);
    return null;
  }
}

// ============================================================
// CHECK 1: Within-word duplicates
// For each word, check if any en or zh example appears twice
// within that same word's examples array.
// ============================================================
function checkWithinWordDuplicates(allWords: { word: string; level: string; examples: IExample[] }[]) {
  console.log('='.repeat(80));
  console.log('CHECK 1: WITHIN-WORD DUPLICATES');
  console.log('  (Does a single word have the same example sentence twice?)');
  console.log('='.repeat(80));

  let wordsWithDupEn = 0;
  let wordsWithDupZh = 0;
  let wordsWithAnyDup = 0;
  const withinWordDetails: {
    word: string;
    level: string;
    dupEn: { text: string; count: number }[];
    dupZh: { text: string; count: number }[];
  }[] = [];

  for (const w of allWords) {
    const enCount = new Map<string, number>();
    const zhCount = new Map<string, number>();

    for (const ex of w.examples) {
      const enKey = ex.en.trim();
      const zhKey = ex.zh.trim();
      enCount.set(enKey, (enCount.get(enKey) || 0) + 1);
      zhCount.set(zhKey, (zhCount.get(zhKey) || 0) + 1);
    }

    const dupEn: { text: string; count: number }[] = [];
    const dupZh: { text: string; count: number }[] = [];

    for (const [text, count] of enCount) {
      if (count > 1) dupEn.push({ text, count });
    }
    for (const [text, count] of zhCount) {
      if (count > 1) dupZh.push({ text, count });
    }

    if (dupEn.length > 0 || dupZh.length > 0) {
      wordsWithAnyDup++;
      if (dupEn.length > 0) wordsWithDupEn++;
      if (dupZh.length > 0) wordsWithDupZh++;
      withinWordDetails.push({ word: w.word, level: w.level, dupEn, dupZh });
    }
  }

  console.log(`\nTotal words checked: ${allWords.length}`);
  console.log(`Words with duplicate EN examples (within themselves): ${wordsWithDupEn}`);
  console.log(`Words with duplicate ZH examples (within themselves): ${wordsWithDupZh}`);
  console.log(`Words with ANY duplicate (EN or ZH): ${wordsWithAnyDup}`);

  if (withinWordDetails.length > 0) {
    console.log(`\n--- Full detail for each word with within-word duplicates ---\n`);
    for (const detail of withinWordDetails) {
      console.log(`  Word: "${detail.word}" (${detail.level})`);
      for (const de of detail.dupEn) {
        console.log(`    EN dup (appears ${de.count}x): "${de.text.slice(0, 120)}${de.text.length > 120 ? '...' : ''}"`);
      }
      for (const dz of detail.dupZh) {
        console.log(`    ZH dup (appears ${dz.count}x): "${dz.text.slice(0, 80)}${dz.text.length > 80 ? '...' : ''}"`);
      }
    }
  } else {
    console.log(`\n  (No within-word duplicates found — all clean.)`);
  }

  return withinWordDetails;
}

// ============================================================
// CHECK 2: Cross-word duplicates
// The same English sentence appears for more than one word.
// ============================================================
function checkCrossWordDuplicates(
  allWords: { word: string; level: string; examples: IExample[] }[],
) {
  console.log(`\n${'='.repeat(80)}`);
  console.log('CHECK 2: CROSS-WORD DUPLICATES');
  console.log('  (Same English sentence used for different words)');
  console.log('='.repeat(80));

  // Map: normalized en text -> [{word, level, zh}]
  const enMap = new Map<string, { word: string; level: string; zh: string }[]>();

  for (const w of allWords) {
    for (const ex of w.examples) {
      const enKey = ex.en.trim();
      if (!enMap.has(enKey)) enMap.set(enKey, []);
      const entries = enMap.get(enKey)!;
      // Avoid duplicate entries for the same word (e.g. if a word already has this en twice)
      if (!entries.some((e) => e.word === w.word)) {
        entries.push({ word: w.word, level: w.level, zh: ex.zh });
      }
    }
  }

  // Collect sentences that appear for >1 word
  const crossWordDups: { en: string; entries: { word: string; level: string; zh: string }[] }[] = [];

  for (const [en, entries] of enMap) {
    if (entries.length > 1) {
      crossWordDups.push({ en, entries });
    }
  }

  // Sort by number of words (most duplicated first)
  crossWordDups.sort((a, b) => b.entries.length - a.entries.length);

  const totalDupInstances = crossWordDups.reduce(
    (sum, d) => sum + d.entries.length - 1,
    0,
  );

  console.log(`\nTotal unique English sentences across all words: ${enMap.size}`);
  console.log(`Sentences that appear for >1 word: ${crossWordDups.length}`);
  console.log(`Total duplicate instances (extra copies): ${totalDupInstances}`);

  // Top 20
  console.log(`\n--- Top 20 most duplicated sentences ---\n`);
  const top20 = crossWordDups.slice(0, 20);
  for (let i = 0; i < top20.length; i++) {
    const dup = top20[i];
    console.log(`  #${i + 1} (appears in ${dup.entries.length} words):`);
    console.log(`    EN: "${dup.en.slice(0, 150)}${dup.en.length > 150 ? '...' : ''}"`);
    const wordList = dup.entries.map((e) => `${e.word}(${e.level})`).join(', ');
    console.log(`    Words: [${wordList}]`);
    // Show the ZH translations to see if they differ
    const zhSet = new Set(dup.entries.map((e) => e.zh));
    if (zhSet.size > 1) {
      console.log(`    ZH translations differ across words:`);
      for (const e of dup.entries) {
        console.log(`      ${e.word}: "${e.zh.slice(0, 80)}${e.zh.length > 80 ? '...' : ''}"`);
      }
    }
    console.log();
  }

  // Distribution: how many sentences appear in exactly N words
  console.log(`--- Distribution: how many sentences appear in exactly N words ---`);
  const distMap = new Map<number, number>();
  for (const dup of crossWordDups) {
    const n = dup.entries.length;
    distMap.set(n, (distMap.get(n) || 0) + 1);
  }
  const sortedDist = [...distMap.entries()].sort((a, b) => a[0] - b[0]);
  for (const [n, count] of sortedDist) {
    console.log(`  Appears in ${n} words: ${count} sentences`);
  }

  return { crossWordDups, totalDupInstances };
}

// ============================================================
// CHECK 3: Per-file summary
// ============================================================
function perFileSummary(
  fileData: { file: string; words: IWordEntry[] }[],
) {
  console.log(`\n${'='.repeat(80)}`);
  console.log('PER-FILE SUMMARY');
  console.log('='.repeat(80));
  console.log();

  for (const fd of fileData) {
    let totalExamples = 0;
    const enSet = new Set<string>();

    for (const w of fd.words) {
      for (const ex of w.examples) {
        totalExamples++;
        enSet.add(ex.en.trim());
      }
    }

    console.log(`  ${fd.file}:`);
    console.log(`    Words: ${fd.words.length}`);
    console.log(`    Total examples: ${totalExamples}`);
    console.log(`    Unique EN examples: ${enSet.size}`);
    console.log(`    Avg examples/word: ${(totalExamples / fd.words.length).toFixed(2)}`);
  }
}

// ============================================================
// MAIN
// ============================================================
function main() {
  console.log('WORD BANK CORPUS — DUPLICATE EXAMPLE SENTENCE ANALYSIS');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log(`Files: ${FILES.join(', ')}`);
  console.log();

  // Load all files
  const allWordsFlat: { word: string; level: string; examples: IExample[] }[] = [];
  const fileData: { file: string; words: IWordEntry[] }[] = [];

  for (const file of FILES) {
    const filePath = path.join(WORD_DATA_DIR, file);
    console.log(`Loading ${file}...`);
    const result = extractWordsFromFile(filePath);
    if (!result) {
      console.error(`  FAILED to load ${file}`);
      continue;
    }
    console.log(`  Loaded ${result.words.length} words (${result.varName})`);
    fileData.push({ file, words: result.words });

    for (const w of result.words) {
      allWordsFlat.push({
        word: w.word,
        level: w.level || file.replace('.ts', ''),
        examples: w.examples,
      });
    }
  }

  console.log(`\nTotal words loaded: ${allWordsFlat.length}\n`);

  // Run checks
  const withinWordDetails = checkWithinWordDuplicates(allWordsFlat);
  const { crossWordDups, totalDupInstances } = checkCrossWordDuplicates(allWordsFlat);
  perFileSummary(fileData);

  // ============================================================
  // FINAL SUMMARY
  // ============================================================
  console.log(`\n${'='.repeat(80)}`);
  console.log('FINAL SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Total words across all files: ${allWordsFlat.length}`);
  console.log(`  Words with within-word duplicates: ${withinWordDetails.length}`);
  console.log(`  Cross-word duplicate sentences: ${crossWordDups.length}`);
  console.log(`  Cross-word duplicate instances: ${totalDupInstances}`);
  console.log();

  // Additional: check for the specific bug pattern mentioned by the user
  // "starting from the 7th sentence, all following content is repeated"
  console.log('--- Checking for "7th+ sentences repeated" pattern ---');
  console.log('  (Words with >=7 examples where the 7th+ examples duplicate earlier ones)\n');

  let bugPatternCount = 0;
  for (const w of allWordsFlat) {
    if (w.examples.length >= 7) {
      // Check if examples from index 6 onward duplicate any of the first 6
      const first6En = new Set(w.examples.slice(0, 6).map((e) => e.en.trim()));
      const first6Zh = new Set(w.examples.slice(0, 6).map((e) => e.zh.trim()));
      let hasDup = false;
      for (let i = 6; i < w.examples.length; i++) {
        if (first6En.has(w.examples[i].en.trim()) || first6Zh.has(w.examples[i].zh.trim())) {
          hasDup = true;
          break;
        }
      }
      if (hasDup) {
        bugPatternCount++;
        console.log(`  BUG PATTERN: "${w.word}" (${w.level}) has ${w.examples.length} examples`);
        // Show which ones are duplicated
        const enSeen = new Map<string, number[]>();
        w.examples.forEach((ex, idx) => {
          const key = ex.en.trim();
          if (!enSeen.has(key)) enSeen.set(key, []);
          enSeen.get(key)!.push(idx);
        });
        for (const [en, indices] of enSeen) {
          if (indices.length > 1) {
            console.log(`    EN duplicated at indices ${indices.join(', ')}: "${en.slice(0, 100)}${en.length > 100 ? '...' : ''}"`);
          }
        }
      }
    }
  }
  if (bugPatternCount === 0) {
    console.log('  No words matched this exact pattern.');
  } else {
    console.log(`\n  Total words matching this pattern: ${bugPatternCount}`);
  }
}

main();
