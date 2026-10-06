#!/usr/bin/env node
/**
 * gen-phrase-bank.mjs — 从词书 detail 文件提取真实搭配，按级别划分为短语词库。
 *
 * 数据源：src/data/wordbank/data/<level>.detail.ts 的 collocations 字段
 *   + <level>.ts 的 meaning（作为短语的中文释义来源）
 * 输出：src/data/phrase-bank/<level>.ts（每级一个文件，按需懒加载）
 *       src/data/phrase-bank/index.ts（类型 + 注册表）
 *
 * 用法：node scripts/gen-phrase-bank.mjs
 * 幂等：重跑覆盖输出。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'src', 'data', 'phrase-bank');
const LEVELS = ['zhongkao', 'gaokao', 'cet4', 'cet6', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'];

mkdirSync(OUT_DIR, { recursive: true });

// ── ① 提取 ──
const globalSeen = new Set(); // 全局去重（跨级别：一个短语只归入最低级别）
const byLevel = {};           // level -> IPhraseEntry[]

for (const lvl of LEVELS) {
  byLevel[lvl] = [];
  const detailRaw = readFileSync(join(ROOT, 'src/data/wordbank/data', `${lvl}.detail.ts`), 'utf8');
  const mainRaw = readFileSync(join(ROOT, 'src/data/wordbank/data', `${lvl}.ts`), 'utf8');

  // 单词 → 中文释义（取第一个分号前的主干）
  const wordMeanings = new Map();
  for (const m of mainRaw.matchAll(/word:"([^"]+)",[^}]*meaning:"([^"]*)"/g)) {
    wordMeanings.set(m[1], m[2].split('；')[0].split(';')[0].trim());
  }

  for (const m of detailRaw.matchAll(/"([^"]+)":\{collocations:\[([^\]]*)\]/g)) {
    const word = m[1];
    const colls = [...m[2].matchAll(/"([^"]+)"/g)].map(x => x[1]);
    const meaning = wordMeanings.get(word) || '';
    for (const c of colls) {
      const key = c.toLowerCase().trim();
      if (!key || key.length < 3 || key.length > 60) continue;
      if (globalSeen.has(key)) continue;
      globalSeen.add(key);
      byLevel[lvl].push({
        content: c.trim(),
        level: lvl,
        sourceWord: word,
        meaning,
      });
    }
  }
}

// ── ② 生成 per-level 文件 ──
let total = 0;
for (const lvl of LEVELS) {
  const entries = byLevel[lvl];
  total += entries.length;
  const upper = lvl.charAt(0).toUpperCase() + lvl.slice(1);
  const lines = entries.map(e =>
    '  { content:' + JSON.stringify(e.content) + ',sourceWord:' + JSON.stringify(e.sourceWord) + ',meaning:' + JSON.stringify(e.meaning) + ' },'
  );
  const file = `// phrase-bank/${lvl} — ${entries.length} 条（由 scripts/gen-phrase-bank.mjs 生成，勿手改）
// 数据源：wordbank/data/${lvl}.detail.ts 的 collocations（与主库去重后归入最低级别）
import type { IPhraseEntry } from './types';

export const ${upper}_PHRASES: IPhraseEntry[] = [
${lines.join('\n')}
];
`;
  writeFileSync(join(OUT_DIR, `${lvl}.ts`), file);
  console.log(`${lvl}: ${entries.length} 条`);
}

// ── ③ 类型 + 注册表 ──
const typesFile = `// phrase-bank — 从词书搭配提取的短语词库（gen-phrase-bank.mjs 生成）
// 每个级别一个文件（懒加载），index 做注册表 + 类型定义

export interface IPhraseEntry {
  /** 短语文本（如 "with abandon"） */
  content: string;
  /** 来源单词（如 "abandon"） */
  sourceWord: string;
  /** 来源单词的中文释义主干 */
  meaning: string;
}

export type PhraseLevel = ${LEVELS.map(l => `'${l}'`).join(' | ')};

export const PHRASE_LEVELS: PhraseLevel[] = [${LEVELS.map(l => `'${l}'`).join(', ')}];

export const PHRASE_LEVEL_LABELS: Record<PhraseLevel, string> = {
  zhongkao: '中考',
  gaokao: '高考',
  cet4: '四级',
  cet6: '六级',
  ielts: '雅思',
  toefl: '托福',
  postgraduate: '考研',
  professional: '专业',
  advanced: '高阶',
};
`;
writeFileSync(join(OUT_DIR, 'types.ts'), typesFile);

const loaderLines = LEVELS.map(l => "  " + l + ": () => import('./" + l + "');").join(',\n');
const indexFile = [
  "// phrase-bank — 按级别懒加载的短语词库注册表",
  "import type { PhraseLevel, IPhraseEntry } from './types';",
  "",
  "export type { IPhraseEntry, PhraseLevel };",
  "export { PHRASE_LEVELS, PHRASE_LEVEL_LABELS } from './types';",
  "",
  "const loaders: Record<PhraseLevel, () => Promise<{ [key: string]: IPhraseEntry[] }>> = {",
  loaderLines + ',',
  "};",
  "",
  "const cache: Partial<Record<PhraseLevel, IPhraseEntry[]>> = {};",
  "",
  "/** 按级别加载短语（首次调用触发懒加载，之后走内存缓存） */",
  "export async function loadPhrases(level: PhraseLevel): Promise<IPhraseEntry[]> {",
  "  if (cache[level]) return cache[level]!;",
  "  const mod = await loaders[level]();",
  "  const key = level.charAt(0).toUpperCase() + level.slice(1) + '_PHRASES';",
  "  cache[level] = (mod as Record<string, IPhraseEntry[]>)[key] || [];",
  "  return cache[level]!;",
  "}",
].join('\n');
writeFileSync(join(OUT_DIR, 'index.ts'), indexFile);
`;
writeFileSync(join(OUT_DIR, 'index.ts'), indexFile);

console.log(`\n合计: ${total} 条 → ${OUT_DIR}`);
