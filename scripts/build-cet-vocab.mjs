/**
 * 从 NativeThink wordbank 生成 CET Master 词库 JS
 * 用法: node scripts/build-cet-vocab.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const WB = path.join(ROOT, 'src/data/wordbank/data');
const OUT = path.join(ROOT, 'public/cet/js');

function loadWords(file, exportName) {
  const src = fs.readFileSync(path.join(WB, file), 'utf8');
  const m = src.match(new RegExp(`export const ${exportName}[^=]*=\\s*(\\[[\\s\\S]*\\]);?\\s*$`));
  if (!m) throw new Error('parse fail: ' + file);
  const sandbox = { module: { exports: {} }, exports: {} };
  vm.createContext(sandbox);
  // Object literals — evaluate as expression
  const arr = vm.runInContext(m[1], sandbox);
  return arr;
}

function freqScore(rank, total) {
  if (!rank || rank <= 0) return 3;
  const p = rank / total;
  if (p <= 0.05) return 5;
  if (p <= 0.15) return 4.5;
  if (p <= 0.35) return 4;
  if (p <= 0.6) return 3;
  if (p <= 0.85) return 2;
  return 1;
}

function wrapWord(example, word) {
  if (!example) return '';
  const re = new RegExp(`(${word})`, 'i');
  if (re.test(example)) return example.replace(re, '<em>$1</em>');
  return example;
}

function firstEx(w) {
  const ex = (w.examples && w.examples[0]) || null;
  if (!ex) {
    return {
      en: `The word “${w.word}” is commonly used in CET exams.`,
      zh: `「${w.word}」在四六级考试中很常见。`,
    };
  }
  return { en: ex.en || '', zh: ex.zh || '' };
}

function convert(list, level, total, startId) {
  return list.map((w, i) => {
    const ex = firstEx(w);
    const posRaw = (w.partOfSpeech || 'n').replace(/\s+/g, '');
    const pos = posRaw.endsWith('.') ? posRaw : posRaw + '.';
    const meaning = (w.meaning || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const tip = w.deepExplanation
      ? String(w.deepExplanation).slice(0, 60)
      : (w.wordFamily && w.wordFamily.length
          ? w.wordFamily.slice(0, 3).join(', ')
          : '—');
    return {
      id: startId + i,
      word: w.word,
      phonetic: w.phonetic || '',
      pos,
      meaning,
      example: wrapWord(ex.en, w.word),
      level,
      mastery: 0,
      freq: freqScore(w.frequencyRank || total - i, total),
      collocations: (w.collocations || []).slice(0, 6),
      similar: (w.synonyms || []).slice(0, 4),
      forms: {},
      tip,
      exampleZh: ex.zh,
    };
  });
}

console.log('Loading CET4/CET6 wordbanks...');
const cet4 = loadWords('cet4.ts', 'CET4_WORDS');
const cet6 = loadWords('cet6.ts', 'CET6_WORDS');
console.log('CET4', cet4.length, 'CET6', cet6.length);

// 按 frequencyRank 升序（1 = 最高频）
cet4.sort((a, b) => (a.frequencyRank || 99999) - (b.frequencyRank || 99999));
cet6.sort((a, b) => (a.frequencyRank || 99999) - (b.frequencyRank || 99999));

const v4 = convert(cet4, 4, cet4.length, 1);
const v6 = convert(cet6, 6, cet6.length, 10000);

function writeVocab(name, arr, meta) {
  const body = `/* Auto-generated from NativeThink wordbank — do not edit by hand */
(function (global) {
  "use strict";
  var pack = ${JSON.stringify(arr)};
  if (global.DATA) {
    if (!global.DATA.vocabulary) global.DATA.vocabulary = [];
    // 去重合并（按 word+level）
    var seen = {};
    global.DATA.vocabulary.forEach(function (w) { seen[w.word + ':' + w.level] = 1; });
    pack.forEach(function (w) {
      var k = w.word + ':' + w.level;
      if (!seen[k]) { seen[k] = 1; global.DATA.vocabulary.push(w); }
    });
    if (global.DATA.wordBooks) {
      global.DATA.wordBooks.forEach(function (b) {
        if (b.id === '${meta.bookId}' && b.autoCount !== false) {
          b.desc = '${meta.desc} · ' + pack.length + ' 词';
          b._count = pack.length;
        }
      });
    }
    if (!global.DATA.vocabPacks) global.DATA.vocabPacks = {};
    global.DATA.vocabPacks['${meta.bookId}'] = { count: pack.length, level: ${meta.level} };
  }
})(typeof window !== 'undefined' ? window : globalThis);
`;
  const file = path.join(OUT, name);
  fs.writeFileSync(file, body);
  const kb = (Buffer.byteLength(body) / 1024).toFixed(1);
  console.log(name, arr.length, 'words,', kb + 'KB');
}

writeVocab('vocab-cet4.js', v4, {
  bookId: 'cet4-core',
  level: 4,
  desc: '四级核心 · 全量词库',
});
writeVocab('vocab-cet6.js', v6, {
  bookId: 'cet6-core',
  level: 6,
  desc: '六级核心 · 全量词库',
});

// 高频冲刺包：四级前 800 + 六级前 500 中去掉与四级重复的
const high4 = v4.slice(0, 800);
const set4 = new Set(high4.map((w) => w.word.toLowerCase()));
const high6 = v6.filter((w) => !set4.has(w.word.toLowerCase())).slice(0, 500);
// 冲刺包不单独文件，更新 high-freq 说明即可
const highCount = high4.length + high6.length;
const bookPatch = `
(function (global) {
  "use strict";
  if (!global.DATA || !global.DATA.wordBooks) return;
  global.DATA.wordBooks.forEach(function (b) {
    if (b.id === 'high-freq') {
      b.desc = '词频最高冲刺 · 约 ${highCount} 词';
      b.highFreqCount = ${highCount};
      b.highFreqIds = {};
    }
  });
  // 标记高频词（供 high-freq 词书过滤）
  var ids = {};
  var list = global.DATA.vocabulary || [];
  // 四级 frequencyRank 已排序，前 800 视为高频；六级取与四级不重复的前 500
  var c4 = 0, c6 = 0;
  list.forEach(function (w) {
    if (w.level === 4 && c4 < 800) { ids[w.id] = 1; c4++; }
  });
  list.forEach(function (w) {
    if (w.level === 6 && c6 < 500 && !ids['__w_' + w.word.toLowerCase()]) {
      // 用 word 键去重
    }
  });
  var seen = {};
  list.forEach(function (w) {
    if (w.level === 4 && c4 <= 800) { /* already counted by order */ }
  });
  // 简化：按插入顺序 — cet4 全量后 cet6，前 800 个 level4 + 前 500 个不重复 level6
  var n4 = 0, n6 = 0;
  list.forEach(function (w) {
    if (w.level === 4 && n4 < 800) { ids[w.id] = 1; n4++; seen[w.word.toLowerCase()] = 1; }
  });
  list.forEach(function (w) {
    if (w.level === 6 && n6 < 500 && !seen[w.word.toLowerCase()]) {
      ids[w.id] = 1; n6++; seen[w.word.toLowerCase()] = 1;
    }
  });
  global.DATA.highFreqIds = ids;
})(typeof window !== 'undefined' ? window : globalThis);
`;
fs.writeFileSync(path.join(OUT, 'vocab-highfreq.js'), bookPatch);
console.log('vocab-highfreq.js', highCount, 'approx');

console.log('Total vocabulary:', v4.length + v6.length);
