// 一次性处理脚本：ECDICT csv → 按首字母分块的懒加载词典数据
const fs = require('fs');

const csv = fs.readFileSync('C:/Users/31037/AppData/Local/Temp/ecdict.csv', 'utf8');
const lines = csv.split('\n');

function parseLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const buckets = new Map();
let kept = 0;
let total = 0;
for (let li = 1; li < lines.length; li++) {
  const line = lines[li].trim();
  if (!line) continue;
  const cols = parseLine(line);
  const word = (cols[0] || '').trim();
  if (!/^[a-zA-Z][a-zA-Z'-]*$/.test(word)) continue;
  total++;
  const phonetic = (cols[1] || '').trim();
  const definition = (cols[2] || '').trim();
  const translation = (cols[3] || '').trim();
  const collins = cols[5];
  const oxford = cols[6];
  const bnc = parseInt(cols[8]) || 0;
  const frq = parseInt(cols[9]) || 0;
  const exchange = (cols[10] || '').trim();
  const common = bnc > 0 || frq > 0 || oxford === '1' || (collins && collins !== '0');
  if (!common) continue;
  if (!translation && !definition) continue;

  const letter = word[0].toLowerCase();
  if (!buckets.has(letter)) buckets.set(letter, { entries: [], forms: {} });
  const b = buckets.get(letter);
  b.entries.push({
    w: word.toLowerCase(),
    p: phonetic,
    t: translation.split('\\n').slice(0, 4).join('; '),
    d: definition.length > 160 ? definition.slice(0, 157) + '...' : definition,
  });
  kept++;

  if (exchange) {
    for (const part of exchange.split('/')) {
      const [k, v] = part.split(':');
      if (!v) continue;
      if (k === '0') continue;
      if (['d', 'p', 'i', '3', 's', 'r', 't'].includes(k)) {
        const form = v.toLowerCase();
        if (/^[a-z]+$/.test(form)) {
          const fl = form[0];
          if (!buckets.has(fl)) buckets.set(fl, { entries: [], forms: {} });
          if (!buckets.get(fl).forms[form]) buckets.get(fl).forms[form] = word.toLowerCase();
        }
      }
    }
  }
}

let totalSize = 0;
fs.mkdirSync('src/data/dictionary/data', { recursive: true });
const letters = [...buckets.keys()].sort();
const indexMeta = {};
for (const letter of letters) {
  const b = buckets.get(letter);
  b.entries.sort((a, c) => (a.w < c.w ? -1 : a.w > c.w ? 1 : 0));
  const payload = JSON.stringify({ e: b.entries, f: b.forms });
  const size = Buffer.byteLength(payload);
  totalSize += size;
  indexMeta[letter] = { count: b.entries.length, kb: Math.round(size / 1024) };
  const escaped = payload.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const out = '// ECDICT subset - auto-generated, do not edit\n// { e: entries sorted by word, f: inflected-form -> headword }\nexport default \'' + escaped + '\';\n';
  fs.writeFileSync('src/data/dictionary/data/' + letter + '.ts', out);
}
fs.writeFileSync('scripts/dict-meta.json', JSON.stringify({ letters: indexMeta, totalSizeMB: Math.round(totalSize / 1024 / 1024 * 10) / 10, kept, total }));
console.log(JSON.stringify({ letters: letters.length, kept, total, sizeMB: Math.round(totalSize / 1024 / 1024 * 10) / 10 }));
