/**
 * verify-vocab-caches.mjs — 词汇模块缓存基建的回归防线。
 *
 * 覆盖 2026-09 技术债清理引入的两块：
 *  ① capped-cache / colloc-ai-cache 的纯函数（封顶淘汰、合并、键序语义）；
 *  ② 各调用方的接线断言：键名拼写修正后不许再出现散落的旧键引用、
 *     三个无上限缓存（搭配释义/AI 例句/深度解析）必须有 cappedPut 封顶、
 *     持久化必须走 effect（setState 更新函数保持纯 —— StrictMode 双调用规则）。
 *
 * 用法：node scripts/verify-vocab-caches.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
const check = (cond, label, detail) => {
  if (cond) pass++;
  else { fail++; failures.push(label + (detail ? ` — ${detail}` : '')); }
};

/** 把 lib 的 TS 源转成可导入的 .mjs（剥掉相对导入与 export 关键字，统一在末尾导出） */
function transpile(relPath, extraExports) {
  const src = readFileSync(join(ROOT, relPath), 'utf8')
    .replace(/^import[^\n]*\n/gm, '')
    .replace(/^export (?=(const|function|let|class))/gm, '');
  const mod = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const file = join(mkdtempSync(join(tmpdir(), 'nt-caches-')), relPath.replaceAll('/', '_') + '.mjs');
  writeFileSync(file, mod + `\nexport { ${extraExports} };`, 'utf8');
  return file;
}

// ── ① cappedPut：合并 + FIFO 封顶 ──
{
  const mod = await import(pathToFileURL(transpile('src/lib/capped-cache.ts', 'cappedPut')).href);
  const { cappedPut } = mod;

  let obj = {};
  obj = cappedPut(obj, 'a', 1, 5);
  obj = cappedPut(obj, 'b', 2, 5);
  obj = cappedPut(obj, 'a', 11, 5);           // 覆盖同键
  check(Object.keys(obj).length === 2 && obj.a === 11, 'cappedPut：覆盖同键不新增、值更新');

  obj = {};
  for (let i = 0; i < 5; i++) obj = cappedPut(obj, 'k' + i, i, 5);
  check(Object.keys(obj).join(',') === 'k0,k1,k2,k3,k4', 'cappedPut：上限内保留插入序');
  obj = cappedPut(obj, 'k5', 5, 5);           // 第 6 条 → 淘汰最早的 k0
  check(!('k0' in obj) && obj.k5 === 5 && Object.keys(obj).length === 5, 'cappedPut：超限淘汰最早写入（FIFO）');
  obj = cappedPut(obj, 'k2', 99, 5);          // 覆盖中间键不改变淘汰位次
  check(obj.k2 === 99 && !('k0' in obj) && 'k1' in obj, 'cappedPut：覆盖不重置插入序');
}

// ── ② mergeCollocAiCache：多键合并 + 400 上限 ──
{
  const mod = await import(pathToFileURL(transpile('src/lib/colloc-ai-cache.ts', 'mergeCollocAiCache')).href);
  const { mergeCollocAiCache } = mod;

  const merged = mergeCollocAiCache({ a: '甲' }, { b: '乙', c: '丙' });
  check(merged.a === '甲' && merged.c === '丙' && Object.keys(merged).length === 3, 'merge：批量合并保留双方');

  let cache = {};
  for (let i = 0; i < 450; i++) cache = mergeCollocAiCache(cache, { ['p' + i]: '释义' + i });
  check(Object.keys(cache).length === 400, 'merge：超 400 条封顶', `实际 ${Object.keys(cache).length}`);
  check(!('p0' in cache) && cache.p449 === '释义449', 'merge：淘汰的是最早写入的一批');
  const again = mergeCollocAiCache(cache, { p449: '更新' });
  check(again.p449 === '更新' && Object.keys(again).length === 400, 'merge：覆盖已有键不突破上限');
}

// ── ③ 接线断言：键名单点归属 + 三缓存必封顶 + 持久化走 effect ──
{
  const dlm = readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/DailyLearningMode.tsx'), 'utf8');
  const ct = readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/CollocationsTab.tsx'), 'utf8');
  const page = readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx'), 'utf8');
  const cacheLib = readFileSync(join(ROOT, 'src/lib/colloc-ai-cache.ts'), 'utf8');

  // 两个组件都必须走共享模块，且组件内不再出现拼写错误的键名字面量
  check(/from '@\/lib\/colloc-ai-cache'/.test(dlm), '每日学习：搭配缓存走共享模块');
  check(/from '@\/lib\/colloc-ai-cache'/.test(ct), '搭配学习：缓存走共享模块');
  check(!dlm.includes('__nativethink_colloc_ai_tranlations'), '每日学习：不再内联旧拼写键');
  check(!ct.includes('__nativethink_colloc_ai_tranlations'), '搭配学习：不再内联旧拼写键');
  check(cacheLib.includes("export const COLLOC_AI_TRANSLATIONS_KEY = '__nativethink_colloc_ai_translations'"), '正确键名只在共享模块定义一次');
  check(cacheLib.includes("COLLOC_AI_TRANSLATIONS_LEGACY_KEY = '__nativethink_colloc_ai_tranlations'") && cacheLib.includes('migrateStorageKey'), '旧键由共享模块迁移');

  // 封顶
  check(/cappedPut\(prev, key, \{ meaning: detail\.meaning/.test(page), '搭配释义缓存（colloc_cache）封顶');
  check(/cappedPut\(prev, key, \{ \.\.\.prev\[key\], sentences/.test(page), 'AI 例句缓存（word_ai_data）封顶');
  check(/cappedPut\(prev, key, text, 300\)/.test(page), 'AI 深度解析缓存（word_deep）封顶');
  check((page.match(/persistJson\('/g) ?? []).length >= 3, '三个缓存的落盘统一走 persist effect');

  // setState 更新函数必须纯：落盘不写在 updater 里（StrictMode 双调用）
  check(!/setCollocCache\(\(prev\) => \{[\s\S]{0,200}safeStorage\.setItem/.test(page), 'collocCache 更新函数内无落盘副作用');
  check(!/setDeepData\(\(prev\) => \{[\s\S]{0,200}safeStorage\.setItem/.test(page), 'deepData 更新函数内无落盘副作用');

  // ProgressPage 清理清单：新键必清，旧键保留只为兜底
  const progress = readFileSync(join(ROOT, 'src/pages/ProgressPage/ProgressPage.tsx'), 'utf8');
  check(progress.includes("'__nativethink_colloc_ai_translations'"), 'ProgressPage 清理清单包含正确键名');
}

console.log('');
console.log(`断言 ${pass}/${pass + fail} 通过${fail ? '' : ' ✓'}`);
if (fail) {
  failures.slice(0, 20).forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
