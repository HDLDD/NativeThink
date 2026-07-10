const fs = require('fs');
const SRC = 'src/data/shadowing.ts';
const raw = fs.readFileSync(SRC, 'utf-8');

function parseSentencesBlock(block) {
  const sentences = [];
  const S = (id, text, annotatedText, translation, duration) => {
    sentences.push({ id, text, annotatedText, translation, duration });
  };
  const code = 'return [' + block + ']';
  // Debug: show first block
  if (!parseSentencesBlock._debugged) {
    parseSentencesBlock._debugged = true;
    console.log('DEBUG block length:', block.length);
    console.log('DEBUG block last 80 chars:', JSON.stringify(block.slice(-80)));
    console.log('DEBUG code last 120 chars:', JSON.stringify(code.slice(-120)));
  }
  try {
    new Function('S', code)(S);
  } catch (e) {
    console.error('Parse error:', e.message.substring(0, 200));
    console.error('  Code around error:', code.substring(Math.max(0, e.stack?.match(/at.*<anonymous>:(\d+):(\d+)/)?.[1]-3) || 0, 500));
  }
  return sentences;
}
parseSentencesBlock._debugged = false;

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
  const sentencesEnd = i - 1; // exclude the closing ]
  const block = raw.slice(sentencesStart, sentencesEnd);
  const all = parseSentencesBlock(block);
  materials.push({
    id: m[1], title: m[2], category: m[3],
    contentSentences: all.filter(s => !s.id.startsWith('pad-')),
    padSentences: all.filter(s => s.id.startsWith('pad-')),
  });
}

console.log('Total materials:', materials.length);
let totalContent = 0, totalPad = 0;
const issues = [];
for (const mat of materials) {
  totalContent += mat.contentSentences.length;
  totalPad += mat.padSentences.length;
  if (mat.contentSentences.length < 2) issues.push(mat.id + ':' + mat.title + ' has only ' + mat.contentSentences.length + ' content sentences');
}
console.log('Content sentences:', totalContent);
console.log('Pad sentences:', totalPad);
console.log('Avg content/material:', (totalContent/materials.length).toFixed(1));

if (issues.length > 0) {
  console.log('\nIssues:', issues.length);
  issues.slice(0, 10).forEach(i => console.log(' ', i));
}

console.log('\n--- First 5 materials ---');
for (const mat of materials.slice(0, 5)) {
  console.log('#' + mat.id + ' ' + mat.title + ': ' + mat.contentSentences.length + ' content, ' + mat.padSentences.length + ' pad');
  if (mat.contentSentences.length > 0) {
    console.log('  1st: "' + mat.contentSentences[0].text.substring(0, 60) + '"');
  }
}
