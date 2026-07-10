/**
 * Phase 1: Clean corpus - remove duplicates and placeholder sentences.
 * Phase 2: Enrich corpus - generate real example sentences via DeepSeek API.
 *
 * Usage:
 *   npx tsx scripts/fix-corpus.ts --phase1           # dedup + remove placeholders
 *   npx tsx scripts/fix-corpus.ts --phase2 [key]     # generate real examples via API
 *   npx tsx scripts/fix-corpus.ts --all [key]        # both phases
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORD_DATA_DIR = path.resolve(__dirname, '../src/data/wordbank/data');
const FILES = ['cet4.ts', 'cet6.ts', 'ielts.ts', 'toefl.ts', 'advanced.ts'];

// API config
const API_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';
const DELAY_MS = 1500;

function getApiKey(argvKey?: string): string | null {
  if (argvKey) return argvKey;
  try { return fs.readFileSync(path.join(__dirname, '.apikey'), 'utf-8').trim(); } catch { return null; }
}

const PLACEHOLDER_EN_RE = /^An example with/i;
const PLACEHOLDER_ZH_RE = /^使用.*的例句/i;

function isPlaceholder(ex: { en: string; zh: string }): boolean {
  return PLACEHOLDER_EN_RE.test(ex.en.trim()) || PLACEHOLDER_ZH_RE.test(ex.zh.trim());
}

function normalizeEn(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeZh(s: string): string {
  return s.replace(/[，。、！？；：""''【】《》（）\s]/g, '').trim();
}

interface IWordEntry {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  meaning: string;
  level: string;
  frequencyRank: number;
  collocations: string[];
  examples: { en: string; zh: string }[];
  synonyms: string[];
  antonyms: string[];
  wordFamily: string[];
  register: string;
  emotion: string;
  topics: string[];
  hasNoChineseEquivalent: boolean;
  deepExplanation: string;
}

function extractWords(filePath: string): { varName: string; words: IWordEntry[]; rawContent: string } | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const varMatch = content.match(/export const (\w+): IWordEntry\[\] = (\[[\s\S]*\]);?\s*$/);
  if (!varMatch) { console.error(`Parse fail: ${filePath}`); return null; }
  try {
    const words: IWordEntry[] = new Function(`return ${varMatch[2]}`)();
    return { varName: varMatch[1], words, rawContent: content };
  } catch (e) { console.error(`Eval fail ${filePath}:`, e); return null; }
}

function serializeWord(w: IWordEntry): string {
  const parts: string[] = [];
  parts.push(`{word:${JSON.stringify(w.word)}`);
  parts.push(`phonetic:${JSON.stringify(w.phonetic)}`);
  parts.push(`partOfSpeech:${JSON.stringify(w.partOfSpeech)}`);
  parts.push(`meaning:${JSON.stringify(w.meaning)}`);
  parts.push(`level:${JSON.stringify(w.level)}`);
  parts.push(`frequencyRank:${w.frequencyRank}`);
  parts.push(`collocations:${JSON.stringify(w.collocations)}`);
  parts.push(`examples:${JSON.stringify(w.examples)}`);
  parts.push(`synonyms:${JSON.stringify(w.synonyms)}`);
  parts.push(`antonyms:${JSON.stringify(w.antonyms)}`);
  parts.push(`wordFamily:${JSON.stringify(w.wordFamily)}`);
  parts.push(`register:${JSON.stringify(w.register)}`);
  parts.push(`emotion:${JSON.stringify(w.emotion)}`);
  parts.push(`topics:${JSON.stringify(w.topics)}`);
  parts.push(`hasNoChineseEquivalent:${w.hasNoChineseEquivalent}`);
  parts.push(`deepExplanation:${JSON.stringify(w.deepExplanation)}}`);
  return parts.join(',');
}

function formatWordEntry(w: IWordEntry): string {
  // Pretty-print with indentation matching existing style
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

function writeUpdatedFile(
  filePath: string,
  varName: string,
  words: IWordEntry[],
  level: string,
): void {
  // Build the TypeScript file content
  const header = [
    `// ${varName.replace('_WORDS', '').replace('_', ' ')} wordbank — ${words.length} words`,
    `// Data source: KyleBing/english-vocabulary (MIT license)`,
    `// Generated independently: may include words also found in lower levels`,
    `import type { IWordEntry } from '../schema';`,
    ``,
    `export const ${varName}: IWordEntry[] = [`,
  ].join('\n');

  const entries = words.map(formatWordEntry);
  const footer = `];`;

  const output = header + '\n' + entries.join('\n') + '\n' + footer + '\n';
  fs.writeFileSync(filePath, output, 'utf-8');
}

// ─── Phase 1: Dedup + Remove Placeholders ───────────────────────

function phase1(): { wordsNeedingExamples: { file: string; words: IWordEntry[] }[] } {
  console.log('='.repeat(70));
  console.log('PHASE 1: Deduplicate & Remove Placeholder Sentences');
  console.log('='.repeat(70));

  const results: { file: string; words: IWordEntry[] }[] = [];

  for (const file of FILES) {
    const filePath = path.join(WORD_DATA_DIR, file);
    const data = extractWords(filePath);
    if (!data) continue;

    console.log(`\nProcessing ${file} (${data.words.length} words)...`);

    let dupRemoved = 0;
    let placeholderRemoved = 0;
    let wordsAffectedByDup = 0;
    let wordsAffectedByPlaceholder = 0;

    // Build global EN set for cross-word dedup within this file
    const seenEn = new Set<string>();

    for (const w of data.words) {
      const newExamples: { en: string; zh: string }[] = [];
      const seenInWord = new Set<string>();

      for (const ex of w.examples) {
        // Check if it's a placeholder
        if (isPlaceholder(ex)) {
          placeholderRemoved++;
          wordsAffectedByPlaceholder++;
          continue;
        }

        const enKey = normalizeEn(ex.en);
        const zhKey = normalizeZh(ex.zh);

        // Skip if this EN sentence already appeared in this word or globally in this file
        if (seenInWord.has(enKey) || seenEn.has(enKey)) {
          dupRemoved++;
          wordsAffectedByDup++;
          continue;
        }

        seenInWord.add(enKey);
        seenEn.add(enKey);
        newExamples.push(ex);
      }

      w.examples = newExamples;
    }

    console.log(`  Duplicates removed: ${dupRemoved} (from ${wordsAffectedByDup} words)`);
    console.log(`  Placeholders removed: ${placeholderRemoved} (from ${wordsAffectedByPlaceholder} words)`);

    // Count words now without examples
    const needExamples = data.words.filter(w => w.examples.length === 0);
    console.log(`  Words now with ZERO examples: ${needExamples.length}`);

    if (needExamples.length > 0) {
      results.push({ file, words: needExamples });
    }

    // Extract level from variable name for header comment
    const level = data.varName.toLowerCase().replace('_words', '');
    writeUpdatedFile(filePath, data.varName, data.words, level);
    console.log(`  ✓ Wrote updated ${file}`);
  }

  const totalNeed = results.reduce((sum, r) => sum + r.words.length, 0);
  console.log(`\nTotal words needing new examples: ${totalNeed}`);
  return results;
}

// ─── Phase 2: Generate Examples via DeepSeek API ─────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function callDeepSeek(apiKey: string, prompt: string): Promise<string> {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system' as const, content: 'You are a professional English lexicographer and ESL materials writer. You create high-quality example sentences for vocabulary learning.' },
      { role: 'user' as const, content: prompt },
    ],
    max_tokens: 4096,
    temperature: 0.7,
  };

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

async function generateExamplesForBatch(
  apiKey: string,
  batch: IWordEntry[],
): Promise<{ word: string; examples: { en: string; zh: string }[] }[]> {
  const wordList = batch.map(w => {
    return `"${w.word}" (${w.partOfSpeech}): ${w.meaning.split('；')[0].split(';')[0]}`;
  }).join('\n');

  const prompt = `For each of the following English words, create 1-2 natural, authentic example sentences with Chinese translations.

Requirements:
- Sentences should be natural and commonly used by native English speakers
- Use the word naturally in context - do NOT write "An example with X"
- Chinese translations should be accurate and natural
- Output as a JSON array of objects with format: [{"word": "theword", "examples": [{"en": "English sentence.", "zh": "中文翻译。"}]}]
- Each word should have 1-2 examples
- Sentences should reflect the word's actual usage and meaning

Words to create examples for:
${wordList}

Respond ONLY with the valid JSON array, no other text.`;

  const response = await callDeepSeek(apiKey, prompt);

  // Parse JSON from response
  try {
    // Try to extract JSON if wrapped in markdown code blocks
    let jsonStr = response.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
      console.error('  API response is not an array, got:', typeof parsed);
      return [];
    }
    return parsed;
  } catch (e) {
    console.error('  Failed to parse API response as JSON');
    console.error('  Response preview:', response.slice(0, 500));
    return [];
  }
}

async function phase2(
  apiKey: string,
  wordsNeedingExamples: { file: string; words: IWordEntry[] }[],
) {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 2: Generate Real Example Sentences via DeepSeek API');
  console.log('='.repeat(70));

  const BATCH_SIZE = 15; // words per API call
  let totalGenerated = 0;
  let totalFailed = 0;

  for (const { file, words } of wordsNeedingExamples) {
    console.log(`\nProcessing ${file} (${words.length} words need examples)...`);

    if (words.length === 0) {
      console.log('  No words to process, skipping.');
      continue;
    }

    const filePath = path.join(WORD_DATA_DIR, file);
    const data = extractWords(filePath);
    if (!data) continue;

    // Build a word lookup map for quick updates
    const wordMap = new Map<string, IWordEntry>();
    for (const w of data.words) {
      wordMap.set(w.word, w);
    }

    let successCount = 0;
    let failCount = 0;

    // Process in batches
    for (let i = 0; i < words.length; i += BATCH_SIZE) {
      const batch = words.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(words.length / BATCH_SIZE);

      process.stdout.write(`  Batch ${batchNum}/${totalBatches} (${batch.length} words)... `);

      try {
        const results = await generateExamplesForBatch(apiKey, batch);

        for (const result of results) {
          if (!result.examples || result.examples.length === 0) {
            failCount++;
            continue;
          }

          const entry = wordMap.get(result.word);
          if (entry) {
            // Validate examples aren't placeholders
            const validExamples = result.examples.filter(
              (ex: any) => !isPlaceholder(ex)
            );
            if (validExamples.length > 0) {
              entry.examples = validExamples;
              successCount++;
            } else {
              failCount++;
            }
          }
        }

        console.log(`${successCount} updated so far (${failCount} failed)`);
        totalGenerated += successCount;
        totalFailed += failCount;
      } catch (e: any) {
        console.log(`ERROR: ${e.message}`);
        failCount += batch.length;
        totalFailed += batch.length;
      }

      // Rate limiting
      if (i + BATCH_SIZE < words.length) {
        await sleep(DELAY_MS);
      }
    }

    // Write updated file after each file is processed
    writeUpdatedFile(filePath, data.varName, data.words, '');
    console.log(`  ✓ Wrote updated ${file} (${successCount} enriched, ${failCount} failed)`);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`PHASE 2 COMPLETE`);
  console.log(`  Generated: ${totalGenerated} words enriched`);
  console.log(`  Failed: ${totalFailed} words`);
  console.log('='.repeat(70));
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  const doPhase1 = args.includes('--phase1') || args.includes('--all');
  const doPhase2 = args.includes('--phase2') || args.includes('--all');

  const apiKeyIdx = args.findIndex(a => !a.startsWith('--'));
  const apiKey = apiKeyIdx >= 0 ? args[apiKeyIdx] : getApiKey();

  if (!doPhase1 && !doPhase2) {
    console.log('Usage: npx tsx scripts/fix-corpus.ts [--phase1] [--phase2] [--all] [apiKey]');
    console.log('  --phase1  Remove duplicates and placeholder sentences');
    console.log('  --phase2  Generate real examples via DeepSeek API');
    console.log('  --all     Run both phases');
    process.exit(1);
  }

  if (doPhase1) {
    const wordsNeeding = phase1();

    if (doPhase2) {
      if (!apiKey) {
        console.error('\nERROR: No API key found for Phase 2.');
        console.error('Provide as argument or create scripts/.apikey file.');
        process.exit(1);
      }
      await phase2(apiKey, wordsNeeding);
    }
  } else if (doPhase2) {
    if (!apiKey) {
      console.error('\nERROR: No API key found for Phase 2.');
      process.exit(1);
    }
    // For phase2 only, re-scan files to find words with no examples
    const wordsNeeding: { file: string; words: IWordEntry[] }[] = [];
    for (const file of FILES) {
      const filePath = path.join(WORD_DATA_DIR, file);
      const data = extractWords(filePath);
      if (!data) continue;
      const need = data.words.filter(w => w.examples.length === 0);
      if (need.length > 0) {
        wordsNeeding.push({ file, words: need });
      }
    }
    const total = wordsNeeding.reduce((s, r) => s + r.words.length, 0);
    console.log(`Found ${total} words needing examples across ${wordsNeeding.length} files.`);
    await phase2(apiKey, wordsNeeding);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
