/**
 * Fix remaining words that still lack examples after the main enrichment run.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';

function getApiKey(): string {
  try { return fs.readFileSync(path.join(__dirname, '.apikey'), 'utf-8').trim(); } catch { return ''; }
}

const WORD_DATA_DIR = path.resolve(__dirname, '../src/data/wordbank/data');

function extractWords(filePath: string): { varName: string; words: any[]; content: string } | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const varMatch = content.match(/export const (\w+): IWordEntry\[\] = (\[[\s\S]*\]);?\s*$/);
  if (!varMatch) return null;
  try { return { varName: varMatch[1], words: new Function(`return ${varMatch[2]}`)(), content }; }
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

function writeUpdatedFile(filePath: string, varName: string, words: any[]): void {
  const header = [
    `// ${varName.replace('_WORDS', '').replace('_', ' ')} wordbank — ${words.length} words`,
    `// Data source: KyleBing/english-vocabulary (MIT license)`,
    `// Generated independently: may include words also found in lower levels`,
    `import type { IWordEntry } from '../schema';`,
    ``,
    `export const ${varName}: IWordEntry[] = [`,
  ].join('\n');
  const entries = words.map(formatWordEntry);
  const footer = '];';
  const output = header + '\n' + entries.join('\n') + '\n' + footer + '\n';
  fs.writeFileSync(filePath, output, 'utf-8');
}

async function generateForWords(missingWords: { word: string; pos: string; meaning: string }[]): Promise<{ word: string; examples: { en: string; zh: string }[] }[]> {
  const wordList = missingWords.map(w =>
    `"${w.word}" (${w.pos}): ${w.meaning}`
  ).join('\n');

  const prompt = `For each of the following English words, create 1-2 natural, authentic example sentences with Chinese translations.

Requirements:
- Sentences should be natural and commonly used by native English speakers
- Use the word naturally in context - do NOT write "An example with X"
- Chinese translations should be accurate and natural
- Output as a JSON array: [{"word": "theword", "examples": [{"en": "English sentence.", "zh": "中文翻译。"}]}]
- Each word should have 1-2 examples

Words:
${wordList}

Respond ONLY with the valid JSON array, no other text.`;

  const apiKey = getApiKey();
  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, messages: [
      { role: 'system', content: 'You are a professional English lexicographer. Create high-quality example sentences for vocabulary learning.' },
      { role: 'user', content: prompt },
    ], max_tokens: 4096, temperature: 0.7 }),
  });

  const data = await response.json() as any;
  const text = data.choices?.[0]?.message?.content || '';
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  return JSON.parse(jsonMatch[1]?.trim() || text);
}

async function main() {
  console.log('Fixing remaining words without examples...\n');

  const targets: { file: string; varName: string; words: any[] }[] = [];

  // Collect all missing words
  const allMissing: { file: string; varName: string; entry: any; meaning: string }[] = [];
  for (const file of ['ielts.ts', 'advanced.ts']) {
    const data = extractWords(path.join(WORD_DATA_DIR, file));
    if (!data) continue;
    const missing = data.words.filter((w: any) => !w.examples || w.examples.length === 0);
    for (const w of missing) {
      allMissing.push({
        file, varName: data.varName,
        entry: w,
        meaning: w.meaning.split('；')[0].split(';')[0].slice(0, 60),
      });
    }
  }

  console.log(`Found ${allMissing.length} words to fix.`);

  // Generate examples
  const result = await generateForWords(
    allMissing.map(m => ({ word: m.entry.word, pos: m.entry.partOfSpeech, meaning: m.meaning }))
  );

  console.log(`Generated examples for ${result.filter(r => r.examples?.length > 0).length} words.`);

  // Apply results
  const wordMap = new Map(result.map(r => [r.word, r.examples || []]));

  // Group by file
  const byFile = new Map<string, { varName: string; entries: any[] }>();
  for (const m of allMissing) {
    if (!byFile.has(m.file)) {
      const data = extractWords(path.join(WORD_DATA_DIR, m.file));
      if (!data) continue;
      byFile.set(m.file, { varName: data.varName, entries: data.words });
    }
    const examples = wordMap.get(m.entry.word) || [];
    if (examples.length > 0) {
      m.entry.examples = examples;
      console.log(`  ✓ ${m.entry.word}: ${examples[0]?.en?.slice(0, 60)}...`);
    } else {
      console.log(`  ✗ ${m.entry.word}: no examples generated`);
    }
  }

  // Write files
  for (const [file, { varName, entries }] of byFile) {
    const filePath = path.join(WORD_DATA_DIR, file);
    writeUpdatedFile(filePath, varName, entries);
    console.log(`  ✓ Wrote ${file}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
