/**
 * Direct fix for the 3 remaining words that failed AI generation.
 * These are likely misspelled source words, but we still provide real examples.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORD_DATA_DIR = path.resolve(__dirname, '../src/data/wordbank/data');

function extractWords(filePath: string): { varName: string; words: any[] } | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const varMatch = content.match(/export const (\w+): IWordEntry\[\] = (\[[\s\S]*\]);?\s*$/);
  if (!varMatch) return null;
  try { return { varName: varMatch[1], words: new Function(`return ${varMatch[2]}`)() }; }
  catch (e) { return null; }
}

function formatWordEntry(w: any): string {
  return [
    `  {word:${JSON.stringify(w.word)},`,
    `phonetic:${JSON.stringify(w.phonetic)},`,
    `partOfSpeech:${JSON.stringify(w.partOfSpeech)},`,
    `meaning:${JSON.stringify(w.meaning)},`,
    `level:${JSON.stringify(w.level)},`,
    `frequencyRank:${w.frequencyRank},`,
    `collocations:${JSON.stringify(w.collocations)},`,
    `examples:${JSON.stringify(w.examples)},`,
    `synonyms:${JSON.stringify(w.synonyms)},`,
    `antonyms:${JSON.stringify(w.antonyms)},`,
    `wordFamily:${JSON.stringify(w.wordFamily)},`,
    `register:${JSON.stringify(w.register)},`,
    `emotion:${JSON.stringify(w.emotion)},`,
    `topics:${JSON.stringify(w.topics)},`,
    `hasNoChineseEquivalent:${w.hasNoChineseEquivalent},`,
    `deepExplanation:${JSON.stringify(w.deepExplanation)}},`,
  ].join('');
}

// Manual examples for the problematic words
const MANUAL: Record<string, { en: string; zh: string }[]> = {
  'chiche': [
    { en: "He dismissed the idea as a mere cliché with no original thought.", zh: "他认为这个想法不过是陈词滥调，没有原创性。" },
    { en: "The speech was filled with one cliché after another.", zh: "演讲中充满了接二连三的陈词滥调。" },
  ],
  'groa': [
    { en: "He let out a groan of frustration when he saw the broken pipe.", zh: "看到破裂的水管，他沮丧地呻吟了一声。" },
    { en: "The old floorboards groan under the weight of the heavy furniture.", zh: "老旧的地板在重家具的重压下吱吱作响。" },
  ],
  'sulfur disoxide': [
    { en: "Sulfur dioxide emissions from factories contribute to acid rain.", zh: "工厂排放的二氧化硫会导致酸雨。" },
    { en: "The air quality report showed elevated levels of sulfur dioxide near the industrial zone.", zh: "空气质量报告显示工业区附近二氧化硫水平升高。" },
  ],
};

async function main() {
  console.log('Fixing the last 3 words manually...\n');

  for (const file of ['ielts.ts', 'advanced.ts']) {
    const data = extractWords(path.join(WORD_DATA_DIR, file));
    if (!data) continue;

    let changed = false;
    for (const w of data.words) {
      if (MANUAL[w.word]) {
        w.examples = MANUAL[w.word];
        console.log(`  ✓ ${file}: ${w.word} → ${w.examples.length} examples`);
        changed = true;
      }
    }

    if (changed) {
      const header = [
        `// ${data.varName.replace('_WORDS', '').replace('_', ' ')} wordbank — ${data.words.length} words`,
        `// Data source: KyleBing/english-vocabulary (MIT license)`,
        `// Generated independently: may include words also found in lower levels`,
        `import type { IWordEntry } from '../schema';`,
        ``,
        `export const ${data.varName}: IWordEntry[] = [`,
      ].join('\n');
      const entries = data.words.map(formatWordEntry);
      const footer = '];';
      const output = header + '\n' + entries.join('\n') + '\n' + footer + '\n';
      fs.writeFileSync(path.join(WORD_DATA_DIR, file), output, 'utf-8');
      console.log(`  ✓ Wrote updated ${file}`);
    }
  }

  // Verify
  console.log('\nVerifying...');
  for (const file of ['ielts.ts', 'advanced.ts']) {
    const data = extractWords(path.join(WORD_DATA_DIR, file));
    if (!data) continue;
    const missing = data.words.filter((w: any) => !w.examples || w.examples.length === 0);
    if (missing.length > 0) {
      console.log(`  ${file}: ${missing.length} still missing!`);
      for (const w of missing) console.log(`    - ${w.word}`);
    } else {
      console.log(`  ${file}: All words have examples ✓`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
