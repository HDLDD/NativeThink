/**
 * Quick fix: find and report words still missing examples after enrichment.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORD_DATA_DIR = path.resolve(__dirname, '../src/data/wordbank/data');
const FILES = ['cet4.ts', 'cet6.ts', 'ielts.ts', 'toefl.ts', 'advanced.ts'];

function extractWords(filePath: string): { varName: string; words: any[] } | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const varMatch = content.match(/export const (\w+): IWordEntry\[\] = (\[[\s\S]*\]);?\s*$/);
  if (!varMatch) return null;
  try { return { varName: varMatch[1], words: new Function(`return ${varMatch[2]}`)() }; }
  catch (e) { return null; }
}

for (const file of FILES) {
  const data = extractWords(path.join(WORD_DATA_DIR, file));
  if (!data) continue;
  const missing = data.words.filter((w: any) => !w.examples || w.examples.length === 0);
  if (missing.length > 0) {
    console.log(`\n${file} - ${missing.length} words missing examples:`);
    for (const w of missing) {
      console.log(`  ${w.word} (${w.partOfSpeech}): ${w.meaning.split('；')[0].split(';')[0].slice(0, 50)}`);
    }
  }
}
