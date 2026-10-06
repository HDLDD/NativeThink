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

  // 单词 → 中文释义 + 例句（含中文翻译）
  const wordData = new Map();
  for (const m of mainRaw.matchAll(/word:"([^"]+)",[^}]*meaning:"([^"]*)"/g)) {
    wordData.set(m[1], { meaning: m[2].split('；')[0].split(';')[0].trim(), examples: [] });
  }

  // 从 detail 提取例句（en + zh）挂到对应单词
  for (const m of detailRaw.matchAll(/"([^"]+)":\{collocations:\[[^\]]*\],examples:\[(.*?)\]/g)) {
    const word = m[1];
    const d = wordData.get(word);
    if (!d) continue;
    for (const ex of m[2].matchAll(/\{en:"([^"]*)",zh:"([^"]*)"\}/g)) {
      if (ex[1] && ex[2]) d.examples.push({ en: ex[1], zh: ex[2] });
    }
  }

  for (const m of detailRaw.matchAll(/"([^"]+)":\{collocations:\[([^\]]*)\]/g)) {
    const word = m[1];
    const colls = [...m[2].matchAll(/"([^"]+)"/g)].map(x => x[1]);
    const d = wordData.get(word) || { meaning: '', examples: [] };
    for (const c of colls) {
      const key = c.toLowerCase().trim();
      if (!key || key.length < 3 || key.length > 60) continue;
      if (globalSeen.has(key)) continue;
      globalSeen.add(key);

      // 预翻译：从例句中找包含该搭配的句子，取其英文 + 中文翻译
      const cLower = key;
      const matched = d.examples.find(ex => ex.en.toLowerCase().includes(cLower));
      // 没找到精确匹配 → 用来源单词的首个例句做上下文
      const context = matched || d.examples[0] || null;

      byLevel[lvl].push({
        content: c.trim(),
        level: lvl,
        sourceWord: word,
        meaning: d.meaning,
        exampleEn: context ? context.en : '',
        exampleZh: context ? context.zh : '',
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
  const lines = entries.map(e => {
    const parts = [
      'content:' + JSON.stringify(e.content),
      'sourceWord:' + JSON.stringify(e.sourceWord),
      'meaning:' + JSON.stringify(e.meaning),
    ];
    if (e.exampleEn) parts.push('exampleEn:' + JSON.stringify(e.exampleEn));
    if (e.exampleZh) parts.push('exampleZh:' + JSON.stringify(e.exampleZh));
    return '  { ' + parts.join(',') + ' },';
  });
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

// ── ③ index.ts + types.ts 不由脚本生成 —— 它们是稳定的手写文件（详见 src/data/phrase-bank/），
//      由脚本反复覆盖会因模板字符串嵌套反引号产生转义 bug（2026-10-07 踩过两次）。

console.log(`\n合计: ${total} 条 → ${OUT_DIR}`);
