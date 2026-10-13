#!/usr/bin/env node
/**
 * 生成四六级两本派生词书的全字段主文件：
 *   cet46freq  —— 四六级高频 3000（真题考频优先：observed 段按 f/df 降序，缺口按 Gutenberg 通用度补足）
 *   cet46elite —— 四六级高分 3000（六级独有拔高词，四段排序 + 高频书补足池接续）
 *
 * 输入：
 *   - scripts/data/cet46freq.json / cet46elite.json —— 词单快照
 *     （选词由真题语料 + Gutenberg + 中考/高考/cet4/cet6 词表离线分析得出，
 *      words: [word, 真题词次, 真题套数, Gutenberg 排名, 书内序号]）
 *   - src/data/wordbank/data/cet4.ts + cet6.ts（核心字段）与对应 .detail.ts
 *
 * 合并规则：同一词在 cet4 与 cet6 都有时——词条字段取 cet4（释义更精炼、无人名等噪音）；
 * detail 按字段回退（cet4 的 collocations/examples 为空时用 cet6 的）。
 *
 * 输出：src/data/wordbank/data/cet46freq.ts / cet46elite.ts（全字段，含 detail）
 * 之后必须按项目约定跑 `npm run wordbank:split` 拆出 detail。
 *
 * 用法: node scripts/generate-cet46-books.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'src/data/wordbank/data');
const TMP = path.join(process.env.TEMP || '/tmp', 'nt-gen-cet46');
fs.mkdirSync(TMP, { recursive: true });

const q = (s) => JSON.stringify(String(s ?? ''));
const strArr = (a) => '[' + (Array.isArray(a) ? a : []).map(q).join(',') + ']';
const exArr = (a) => '[' + (Array.isArray(a) ? a : [])
  .map((e) => `{en:${q(e?.en)},zh:${q(e?.zh)}}`).join(',') + ']';

async function loadTs(file, keyHint) {
  const src = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const tmp = path.join(TMP, file.replace(/\.ts$/, '.mjs').replace(/\./g, '-'));
  fs.writeFileSync(tmp, js);
  const mod = await import(pathToFileURL(tmp).href + '?v=' + Date.now());
  const key = Object.keys(mod).find((k) => k.toUpperCase().includes(keyHint));
  if (!key) throw new Error(`${file}: 未找到含 ${keyHint} 的导出`);
  return mod[key];
}

const OTHER_LEVELS = ['zhongkao', 'gaokao', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'];
const [cet4, cet6, cet4d, cet6d, ...others] = await Promise.all([
  loadTs('cet4.ts', 'WORDS'),
  loadTs('cet6.ts', 'WORDS'),
  loadTs('cet4.detail.ts', 'DETAIL'),
  loadTs('cet6.detail.ts', 'DETAIL'),
  ...OTHER_LEVELS.map((lv) => loadTs(`${lv}.ts`, 'WORDS')),
]);
const m4 = new Map(cet4.map((e) => [e.word.toLowerCase(), e]));
const m6 = new Map(cet6.map((e) => [e.word.toLowerCase(), e]));

// 音标回退索引：cet4/cet6 里都有少量空音标词条（源数据缺陷），
// 按其余 7 本词库顺序取第一个非空音标，尽量让两本书音标齐全。
const phoneticIndex = new Map();
for (const arr of others) {
  for (const e of arr) {
    const k = e.word.toLowerCase();
    if (!phoneticIndex.has(k) && typeof e.phonetic === 'string' && e.phonetic) phoneticIndex.set(k, e.phonetic);
  }
}
const emptyPhonetic = [];

const BOOKS = [
  { level: 'cet46freq', json: 'cet46freq.json', exportName: 'CET46FREQ_WORDS', desc: '四六级高频 3000' },
  { level: 'cet46elite', json: 'cet46elite.json', exportName: 'CET46ELITE_WORDS', desc: '四六级高分 3000' },
];

let totalRows = 0;
for (const book of BOOKS) {
  const snap = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', book.json), 'utf8'));
  const words = snap.words;
  if (!Array.isArray(words) || words.length !== 3000) throw new Error(`${book.json}: 词单应为 3000 词`);

  const seen = new Set();
  const rows = words.map(([w, , , , rank], i) => {
    if (seen.has(w)) throw new Error(`${book.level}: 词单内重复 ${w}`);
    seen.add(w);
    if (rank !== i + 1) throw new Error(`${book.level}: 序号不连续 @ ${w} rank=${rank} i=${i + 1}`);
    const e4 = m4.get(w), e6 = m6.get(w);
    const src = e4 ?? e6;
    if (!src) throw new Error(`${book.level}: cet4/cet6 中均无 ${w}`);
    const phonetic = (e4?.phonetic || e6?.phonetic || phoneticIndex.get(w) || '');
    if (!phonetic) emptyPhonetic.push(w);
    const d4 = cet4d[w], d6 = cet6d[w];
    const collocations = (d4?.collocations?.length ? d4.collocations : d6?.collocations) ?? [];
    const examples = (d4?.examples?.length ? d4.examples : d6?.examples) ?? [];
    const deep = d4?.deepExplanation || d6?.deepExplanation || '';
    for (const f of ['partOfSpeech', 'meaning', 'register', 'emotion']) {
      if (typeof src[f] !== 'string' || !src[f]) throw new Error(`${book.level}: ${w} 字段 ${f} 非法: ${src[f]}`);
    }
    return '  {'
      + `word:${q(w)},phonetic:${q(phonetic)},partOfSpeech:${q(src.partOfSpeech)},`
      + `meaning:${q(src.meaning)},level:${q(book.level)},frequencyRank:${rank},`
      + `register:${q(src.register)},emotion:${q(src.emotion)},topics:${strArr(src.topics)},`
      + `hasNoChineseEquivalent:${Boolean(src.hasNoChineseEquivalent)},hasCollocations:${collocations.length > 0},`
      + `collocations:${strArr(collocations)},examples:${exArr(examples)},deepExplanation:${q(deep)},`
      + `synonyms:${strArr(src.synonyms)},antonyms:${strArr(src.antonyms)},wordFamily:${strArr(src.wordFamily)}`
      + '},';
  });

  const out = `// ${book.level} wordbank — ${words.length} words（${book.desc}）
// 选词: 真题考频优先（20 套六级真题）+ Gutenberg 通用度补足；词条取自 cet4/cet6 词库（cet4 优先）。
// Generated by scripts/generate-cet46-books.mjs, then split by scripts/split-wordbank-detail.mjs
// 重新生成：node scripts/generate-cet46-books.mjs && npm run wordbank:split
import type { IWordEntry } from '../schema';

export const ${book.exportName}: IWordEntry[] = [
${rows.join('\n')}
];
`;
  fs.writeFileSync(path.join(DATA_DIR, `${book.level}.ts`), out);
  const withColloc = words.filter(([w]) => ((cet4d[w]?.collocations?.length ? cet4d[w].collocations : cet6d[w]?.collocations) ?? []).length > 0).length;
  console.log(`${book.level.padEnd(11)} ${words.length} 词（有搭配 ${withColloc}）→ src/data/wordbank/data/${book.level}.ts`);
  totalRows += rows.length;
}
console.log(`共输出 ${totalRows} 条词条。音标仍缺失: ${emptyPhonetic.length ? emptyPhonetic.join(', ') : '无'}。下一步：npm run wordbank:split`);
