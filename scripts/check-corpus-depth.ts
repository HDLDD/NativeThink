/**
 * Check depth: how many words have real examples vs only placeholders.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORD_DATA_DIR = path.resolve(__dirname, '../src/data/wordbank/data');
const FILES = ['cet4.ts', 'cet6.ts', 'ielts.ts', 'toefl.ts', 'advanced.ts'];

function extractWords(filePath: string): any[] | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const varMatch = content.match(/export const (\w+): IWordEntry\[\] = (\[[\s\S]*\]);?\s*$/);
  if (!varMatch) { console.error(`Parse fail: ${filePath}`); return null; }
  try {
    return new Function(`return ${varMatch[2]}`)();
  } catch (e) { console.error(`Eval fail ${filePath}:`, e); return null; }
}

const PLACEHOLDER_RE = /^An example with/i;
const PLACEHOLDER_ZH_RE = /^使用.*的例句/i;

for (const file of FILES) {
  const filePath = path.join(WORD_DATA_DIR, file);
  const words = extractWords(filePath);
  if (!words) continue;

  let onlyPlaceholders = 0;
  let mixedRealAndPlaceholder = 0;
  let allReal = 0;
  let noExamples = 0;
  let totalPlaceholderExamples = 0;

  for (const w of words) {
    const examples = w.examples || [];
    if (examples.length === 0) {
      noExamples++;
      continue;
    }

    const placeholderCount = examples.filter((ex: any) =>
      PLACEHOLDER_RE.test(ex.en) || PLACEHOLDER_ZH_RE.test(ex.zh)
    ).length;
    const realCount = examples.length - placeholderCount;

    totalPlaceholderExamples += placeholderCount;

    if (placeholderCount === 0) {
      allReal++;
    } else if (realCount === 0) {
      onlyPlaceholders++;
    } else {
      mixedRealAndPlaceholder++;
    }
  }

  console.log(`\n--- ${file} (${words.length} words) ---`);
  console.log(`  All real examples:     ${allReal}`);
  console.log(`  Mixed real+placeholder: ${mixedRealAndPlaceholder}`);
  console.log(`  ONLY placeholders:     ${onlyPlaceholders}`);
  console.log(`  No examples:           ${noExamples}`);
  console.log(`  Total placeholder ex:  ${totalPlaceholderExamples}`);
}
