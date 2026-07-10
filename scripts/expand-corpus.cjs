/**
 * Batch expand shadowing corpus using DeepSeek API.
 *
 * For each material:
 *   1. Extend core dialogue/speech/story with 5-8 more sentences
 *   2. Replace the 15 generic "pad-*" sentences with 8 theme-relevant practice sentences
 *
 * Usage: node scripts/expand-corpus.cjs <deepseek-api-key> [--dry-run] [--resume]
 */

const fs = require('fs');
const path = require('path');

const API_KEY = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : (() => {
      try { return fs.readFileSync(path.join(__dirname, '.apikey'), 'utf-8').trim(); } catch { return null; }
    })();
const DRY_RUN = process.argv.includes('--dry-run');
const RESUME = process.argv.includes('--resume');
const APPLY_ONLY = process.argv.includes('--apply');

if (!API_KEY || API_KEY.startsWith('--')) {
  console.error('Usage: node scripts/expand-corpus.cjs <deepseek-api-key> [--dry-run] [--resume]');
  process.exit(1);
}

const API_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';
const DELAY_MS = 2500;

const SRC = path.join(__dirname, '..', 'src', 'data', 'shadowing.ts');
const PROGRESS_FILE = SRC + '.expand-progress.json';

// ── Helpers ────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ').replace(/\r/g, '');
}

// ── Parse sentences block ──────────────────────────────────────────
function parseSentences(block) {
  const sentences = [];
  const S = (id, text, annotatedText, translation, duration) => {
    sentences.push({ id, text, annotatedText, translation, duration });
  };
  try { new Function('S', 'return [' + block + ']')(S); } catch(e) {}
  return sentences;
}

// ── Parse all materials ────────────────────────────────────────────
function parseMaterials() {
  const raw = fs.readFileSync(SRC, 'utf-8');
  const matStartRe = /\{\s*id:'(\d+)',\s*title:'([^']+)',\s*category:'([^']+)',\s*difficulty:'([^']+)',\s*accent:'([^']+)',\s*totalDuration:(\d+),\s*description:'([^']+)',\s*sentences:\[/g;

  const materials = [];
  let m;
  while ((m = matStartRe.exec(raw)) !== null) {
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
    const sentencesEnd = i - 1; // position of matching ]
    const allSentences = parseSentences(raw.slice(sentencesStart, sentencesEnd));

    materials.push({
      id: m[1], title: m[2], category: m[3], difficulty: m[4], accent: m[5],
      totalDuration: parseInt(m[6]), description: m[7],
      contentSentences: allSentences.filter(s => !s.id.startsWith('pad-')),
      padSentences: allSentences.filter(s => s.id.startsWith('pad-')),
    });
  }
  return materials;
}

// ── Build prompt ────────────────────────────────────────────────────
function buildPrompt(m) {
  const catLabel = m.category === 'daily' ? '日常对话' : m.category === 'speech' ? '演讲' : '故事';
  const diffLabel = m.difficulty === 'beginner' ? '初级' : m.difficulty === 'intermediate' ? '中级' : '高级';
  const accentLabel = m.accent === 'US' ? '美式' : '英式';

  const dialog = m.contentSentences.map((s, i) =>
    `${i + 1}. "${s.text}" → ${s.translation}`
  ).join('\n');

  return `You are an ESL content creator for a Chinese English-learning app. Expand a shadowing practice corpus.

Material: "${m.title}" — ${m.description}
Category: ${catLabel} | Level: ${diffLabel} | Accent: ${accentLabel} English

Current dialogue (${m.contentSentences.length} sentences):
${dialog}

## Tasks
1. **Extend**: Write ${m.contentSentences.length >= 7 ? '3-5' : '5-8'} MORE sentences that naturally continue this ${catLabel}. Keep the same characters, tone, and setting. Use natural spoken English with contractions.

2. **Practice sentences**: Write 8 theme-relevant pronunciation sentences for "${m.title}". Make them specific to this scenario — NOT generic platitudes. Include a mix of short and medium length.

## Requirements per sentence
- "text": natural spoken/colloquial English
- "annotatedText": add <u>...</u> tags around 1-3 stressed syllables
- "translation": natural colloquial Chinese (口语化中文)
- "duration": estimated speaking time in seconds (2-5)

## Respond ONLY with this JSON (no markdown, no extra text):
{"extension":[{"text":"...","annotatedText":"...","translation":"...","duration":N},...],"practice":[{"text":"...","annotatedText":"...","translation":"...","duration":N},...]}`;
}

// ── AI call ────────────────────────────────────────────────────────
async function callAI(messages) {
  const res = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL, messages,
      temperature: 0.8,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.substring(0, 200)}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

// ── Parse response ─────────────────────────────────────────────────
function parseResponse(raw) {
  // Direct JSON
  try { const p = JSON.parse(raw); if (validate(p)) return p; } catch {}
  // Markdown code block
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) { try { const p = JSON.parse(m[1]); if (validate(p)) return p; } catch {} }
  // Find JSON object
  const obj = raw.match(/\{[\s\S]*"extension"[\s\S]*"practice"[\s\S]*\}/);
  if (obj) { try { const p = JSON.parse(obj[0]); if (validate(p)) return p; } catch {} }
  throw new Error('Could not parse response');
}

function validate(p) {
  if (!Array.isArray(p.extension) || !Array.isArray(p.practice)) return false;
  p.extension = p.extension.filter(s => s.text && s.translation && s.text.length > 5);
  p.practice = p.practice.filter(s => s.text && s.translation && s.text.length > 5);
  for (const arr of [p.extension, p.practice]) {
    for (const s of arr) {
      if (!s.annotatedText) s.annotatedText = s.text;
      if (!s.duration || s.duration < 1) s.duration = 3;
    }
  }
  return p.extension.length > 0 && p.practice.length > 0;
}

// ── Build material block ───────────────────────────────────────────
function buildBlock(m, extension, practice, isLast) {
  const lines = [];
  let seq = 0;

  // Original content sentences
  for (const s of m.contentSentences) {
    seq++;
    lines.push(`S('${m.id}-${seq}','${esc(s.text)}','${esc(s.annotatedText)}','${esc(s.translation)}',${s.duration})`);
  }
  // Extension
  for (const s of extension) {
    seq++;
    lines.push(`S('${m.id}-${seq}','${esc(s.text)}','${esc(s.annotatedText)}','${esc(s.translation)}',${s.duration})`);
  }
  // Practice
  let pn = 0;
  for (const s of practice) {
    pn++;
    lines.push(`S("pad-${pn}","${esc(s.text)}","${esc(s.annotatedText)}","${esc(s.translation)}",${s.duration})`);
  }

  const newDuration = [...m.contentSentences, ...extension, ...practice]
    .reduce((s, x) => s + (x.duration || 3), 0);

  const header = `  { id:'${m.id}',title:'${esc(m.title)}',category:'${m.category}',difficulty:'${m.difficulty}',accent:'${m.accent}',totalDuration:${newDuration},description:'${esc(m.description)}',`;
  const comma = isLast ? '' : ',';
  return `${header}
    sentences:[ ${lines[0]}
${lines.slice(1).map(l => `      ${l}`).join(',\n')}
    ]}${comma}`;
}

// ── Write final file ───────────────────────────────────────────────
function writeFinalFile(materials, results) {
  const raw = fs.readFileSync(SRC, 'utf-8');

  // Extract header (everything before first material) and footer (after last)
  const firstMatIdx = raw.indexOf("{ id:'1',");
  const header = raw.slice(0, firstMatIdx);

  // Find end of last material
  const lastMat = materials[materials.length - 1];
  const lastSearchStr = `id:'${lastMat.id}',title:'${esc(lastMat.title)}',`;
  const lastStart = raw.indexOf(lastSearchStr);
  let pos = lastStart;
  let depth = 0, inStr = false, strChar = '';
  // Find the closing ]}, of the last material
  while (pos < raw.length) {
    const ch = raw[pos];
    if (inStr) {
      if (ch === '\\') { pos += 2; continue; }
      if (ch === strChar) inStr = false;
      pos++; continue;
    }
    if (ch === "'" || ch === '"') { inStr = true; strChar = ch; pos++; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { pos++; break; }
    }
    pos++;
  }
  const footer = raw.slice(pos);

  // Assemble blocks
  const blocks = materials.map((m, i) => {
    const r = results[m.id];
    if (r) {
      return buildBlock(m, r.extension, r.practice, i === materials.length - 1);
    }
    // Return original block (fallback)
    return null; // will be handled below
  });

  const outputBlocks = [];
  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    const r = results[m.id];
    if (r) {
      outputBlocks.push(buildBlock(m, r.extension, r.practice, i === materials.length - 1));
    } else {
      // Reconstruct original block with comma for non-last
      outputBlocks.push(buildBlock(m, [], [], i === materials.length - 1));
      console.log(`  WARNING: #${m.id} has no AI result, using original`);
    }
  }

  const output = header + outputBlocks.join('\n\n') + footer;
  fs.writeFileSync(SRC, output, 'utf-8');
  console.log(`Written ${output.length} bytes to ${SRC}`);
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  const materials = parseMaterials();
  console.log(`Parsed ${materials.length} materials`);

  // ── Apply-only mode: write final file from saved progress ────────
  if (APPLY_ONLY) {
    if (!fs.existsSync(PROGRESS_FILE)) {
      console.error('No progress file found at', PROGRESS_FILE);
      process.exit(1);
    }
    const prog = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    console.log(`Loaded ${Object.keys(prog.results).length} results from progress file`);
    fs.copyFileSync(SRC, SRC + '.bak');
    console.log('Backup: ' + SRC + '.bak');
    writeFinalFile(materials, prog.results);
    // Clean up progress file
    fs.unlinkSync(PROGRESS_FILE);
    console.log('Done! Removed progress file.');
    return;
  }

  console.log(`Content sentences: ${materials.reduce((s, m) => s + m.contentSentences.length, 0)}`);
  console.log(`Pad sentences: ${materials.reduce((s, m) => s + m.padSentences.length, 0)}`);
  if (DRY_RUN) console.log('[DRY RUN — progress saved, final file NOT written]\n');

  // Load progress if resuming
  let results = {};
  let startIdx = 0;
  if ((RESUME || DRY_RUN) && fs.existsSync(PROGRESS_FILE)) {
    const prog = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    results = prog.results || {};
    startIdx = prog.lastIdx + 1;
    console.log(`Resuming from index ${startIdx} (${Object.keys(results).length} already done)\n`);
  }

  // Backup original file (only when doing real run from start)
  if (!DRY_RUN && startIdx === 0) {
    fs.copyFileSync(SRC, SRC + '.bak');
    console.log('Backup: ' + SRC + '.bak\n');
  }

  let ok = 0, fail = 0;

  for (let i = startIdx; i < materials.length; i++) {
    const m = materials[i];
    if (results[m.id]) { ok++; continue; } // already done

    const label = `[${i + 1}/${materials.length}] #${m.id} ${m.title}`;
    let success = false;

    // Retry up to 3 times with backoff
    for (let attempt = 0; attempt < 3 && !success; attempt++) {
      if (attempt > 0) {
        const wait = attempt * 3000;
        process.stdout.write(`retry#${attempt}(${wait/1000}s)... `);
        await sleep(wait);
      } else {
        process.stdout.write(`${label} ... `);
      }

      try {
        const prompt = buildPrompt(m);
        const rawResp = await callAI([
          { role: 'system', content: 'You are a professional ESL content creator. Respond ONLY with valid JSON, no markdown, no explanation.' },
          { role: 'user', content: prompt },
        ]);
        const parsed = parseResponse(rawResp);
        results[m.id] = { extension: parsed.extension, practice: parsed.practice };
        console.log(`OK (+${parsed.extension.length}e +${parsed.practice.length}p)`);
        ok++;
        success = true;
      } catch (err) {
        if (attempt < 2) {
          console.log(`ERR(retry): ${err.message.substring(0, 60)}`);
        } else {
          console.log(`FAIL: ${err.message.substring(0, 100)}`);
          results[m.id] = null;
        }
      }
    }

    if (!success) fail++;

    // Save progress (always)
    try {
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
          lastIdx: i, ok, fail,
          results,
          time: new Date().toISOString(),
        }, null, 2));
    } catch (e) {
      console.error('WARN: Could not save progress:', e.message);
    }

    // Delay between calls
    if (i < materials.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\nAI calls: ${ok} ok, ${fail} failed`);

  // Write final file
  if (!DRY_RUN) {
    if (ok > 0) {
      writeFinalFile(materials, results);
      console.log('Done!');
    } else {
      console.log('No successful AI calls — file not written.');
    }
  } else {
    console.log(`\nTo apply results: node scripts/expand-corpus.cjs --apply`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
