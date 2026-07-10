/**
 * Quick dry-run test: expand first material to verify full pipeline
 */
const fs = require('fs');
const path = require('path');

const API_KEY = 'sk-3c3af2b45baf4638a3eebe7c25d07b4d';
const SRC = path.join(__dirname, '..', 'src', 'data', 'shadowing.ts');
const raw = fs.readFileSync(SRC, 'utf-8');

// ── Parse first material ──────────────────────────────────────────
function parseSentencesBlock(block) {
  const sentences = [];
  const S = (id, text, annotatedText, translation, duration) => {
    sentences.push({ id, text, annotatedText, translation, duration });
  };
  try { new Function('S', 'return [' + block + ']')(S); } catch(e) {
    console.error('Parse error:', e.message.substring(0, 100));
  }
  return sentences;
}

const matStartRe = /\{\s*id:'(\d+)',\s*title:'([^']+)',\s*category:'([^']+)',\s*difficulty:'([^']+)',\s*accent:'([^']+)',\s*totalDuration:(\d+),\s*description:'([^']+)',\s*sentences:\[/g;
const m = matStartRe.exec(raw);

const sentencesStart = matStartRe.lastIndex;
let depth = 1, i = sentencesStart, inStr = false, strChar = '';
while (i < raw.length && depth > 0) {
  const ch = raw[i];
  if (inStr) {
    if (ch === '\\') { i += 2; continue; }
    if (ch === strChar) inStr = false;
    i++; continue;
  }
  if (ch === "'" || ch === '"') { inStr = true; strChar = ch; i++; continue; }
  if (ch === '[') depth++;
  else if (ch === ']') depth--;
  i++;
}
const sentencesEnd = i - 1;
const block = raw.slice(sentencesStart, sentencesEnd);
const all = parseSentencesBlock(block);

const contentSentences = all.filter(s => !s.id.startsWith('pad-'));

const mat = {
  id: m[1], title: m[2], category: m[3], difficulty: m[4], accent: m[5],
  totalDuration: parseInt(m[6]), description: m[7],
  contentSentences,
  fullBlock: raw.slice(m.index, sentencesEnd + 1),
};

console.log('Material:', mat.id, mat.title);
console.log('Content sentences:', mat.contentSentences.length);

// ── Build prompt ──────────────────────────────────────────────────
const currentDialog = mat.contentSentences.map((s, i) =>
  (i + 1) + '. "' + s.text + '" → ' + s.translation
).join('\n');

const prompt = `You are an ESL content creator for a Chinese English-learning app. Expand a shadowing practice corpus.

Material: "${mat.title}" — ${mat.description}
Category: 日常对话 | Level: 初级 | Accent: 美式 English

Current dialogue (${mat.contentSentences.length} sentences):
${currentDialog}

## Tasks
1. **Extend**: Write 5-8 MORE sentences that naturally continue this 日常对话. Keep the same characters, tone, and setting. Use natural spoken English with contractions.

2. **Practice sentences**: Write 8 theme-relevant pronunciation sentences for "${mat.title}". Make them specific to this scenario — NOT generic like "Practice makes perfect."

## Requirements per sentence
- "text": natural spoken English
- "annotatedText": add <u>...</u> around 1-3 stressed syllables
- "translation": natural Chinese (口语化的中文)
- "duration": speaking seconds (2-5)

## Respond ONLY with JSON:
{"extension":[{"text":"...","annotatedText":"...","translation":"...","duration":N},...],"practice":[{"text":"...","annotatedText":"...","translation":"...","duration":N},...]}`;

// ── Call API ──────────────────────────────────────────────────────
async function main() {
  console.log('Calling DeepSeek API...\n');

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are a professional ESL content creator. Always respond with valid JSON only, no markdown.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('API error:', res.status, text.substring(0, 300));
    return;
  }

  const data = await res.json();
  const content = data.choices[0].message.content;
  console.log('Raw AI response (first 500 chars):');
  console.log(content.substring(0, 500));
  console.log('');

  // Parse response
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const m = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) parsed = JSON.parse(m[1]);
    else {
      const objMatch = content.match(/\{[\s\S]*"extension"[\s\S]*"practice"[\s\S]*\}/);
      if (objMatch) parsed = JSON.parse(objMatch[0]);
    }
  }

  if (!parsed) {
    console.error('Could not parse response');
    return;
  }

  console.log('Extension sentences:', parsed.extension?.length || 0);
  parsed.extension?.forEach(s => console.log('  "' + s.text + '" → ' + s.translation));
  console.log('Practice sentences:', parsed.practice?.length || 0);
  parsed.practice?.slice(0, 3).forEach(s => console.log('  "' + s.text + '" → ' + s.translation));
}

main().catch(err => console.error('Fatal:', err));
