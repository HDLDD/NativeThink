#!/usr/bin/env node
/**
 * verify-ai-parse.mjs — 「AI 返回解析」两条全仓约定的回归守卫。
 *
 * 守的两条规矩（AGENTS.md 通用坑表 + docs/modules/ai-services.md §3）：
 *   ① 解析前必须先判 `!result.trim()` —— `useAI` 失败/中止时返回**空串**并自己 toast
 *      （`use-ai.ts:82-85`），空串喂进 extractJson 会抛「无法从 AI 返回中提取有效 JSON」，
 *      于是"服务不可用/限流/没配 Key"被报成误导性的「AI 返回格式异常」。
 *   ② 解析一律走 `extractJson`（括号配平），不许再用 `match(/\{[\s\S]*\}/)` 这类贪婪正则 ——
 *      贪婪 `.*` 会跨多个 JSON 片段把中间文本一起吞进同一个匹配。
 *
 * 为什么要写成守卫而不只是文档：本轮清点发现违反 ① 的调用点**不是当初记的 4 处，而是 7 处**
 * （阅读页 3 处、背单词页 3 处、拼写批量加句 1 处）—— 说明这类问题只会随新增调用点继续长，
 * 需要一个每次提交都能重扫全仓的检查。
 *
 * 元判据自证：同一个检查函数会被拿去跑两段"故意写坏"的固件（缺判空 / 用贪婪正则），
 * 必须都能报错才算这个守卫真的在做事 —— 否则"全仓 0 违规"可能只是检查器坏了。
 *
 * 用法：node scripts/verify-ai-parse.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });

const UNGUARDED_WINDOW = 45;   // 判空必须在这个行数内（同一个 try 块里，调用与解析之间不会更远）
/**
 * 贪婪正则的特征串：`[\s\S]*` 后面直接跟闭合括号 —— 也就是"一直吃到最后一个 } 或 ]"。
 * 只写 `[\s\S]*` 会误伤合法的惰性写法（book-translation 剥代码栅栏用的就是 `([\s\S]*?)`），
 * 也匹配不到产品源码里 `\{[\s\S]*\}` 这种带转义的形态。
 */
const GREEDY_FRAGS = [String.raw`[\s\S]*\}`, String.raw`[\s\S]*\]`, String.raw`[\s\S]*}`];

/** 注释行不参与判定 —— 否则"原先这里是 match(/\{[\s\S]*\}/)"这种解释性注释会被当成违规 */
const isComment = (ln) => /^\s*(\/\/|\*|\/\*|<!--)/.test(ln);

/** 扫一段源码，返回违规列表。对文件内容和对固件用同一个函数 —— 元判据才可证 */
function inspect(text, label) {
  const lines = text.split(/\r?\n/);
  const violations = [];
  let sites = 0;
  lines.forEach((ln, i) => {
    if (isComment(ln)) return;
    if (/extractJson\s*[<(]/.test(ln)) {
      if (/export function extractJson/.test(ln)) return;   // 定义本身
      sites++;
      const win = lines
        .slice(Math.max(0, i - UNGUARDED_WINDOW), i)
        .filter((l) => !isComment(l))
        .join('\n');
      if (!/\.trim\(\)/.test(win)) violations.push(`${label}:${i + 1} extractJson 前没有 !x.trim() 判空`);
    }
    if (ln.includes('match(') && GREEDY_FRAGS.some((f) => ln.includes(f))) {
      violations.push(`${label}:${i + 1} 贪婪正则 match(/…[\\s\\S]*…/)`);
    }
  });
  return { sites, violations };
}

/* ───────────── 元判据：检查器必须能抓出故意写坏的固件 ───────────── */
const FIXTURE_UNGUARDED = [
  'async function gen(aiChat: any) {',
  '  const result = await aiChat([], {});',
  '  const parsed = extractJson<{ t: string }>(result);',   // ← 缺判空
  '  return parsed.t;',
  '}',
].join('\n');
const FIXTURE_GREEDY = [
  'function parse(result: string) {',
  '  if (!result.trim()) return null;',
  '  const m = result.match(/\\{[\\s\\S]*\\}/);',              // ← 贪婪正则
  '  return m ? JSON.parse(m[0]) : null;',
  '}',
].join('\n');
const FIXTURE_CLEAN = [
  'async function gen(aiChat: any) {',
  '  const result = await aiChat([], {});',
  '  if (!result.trim()) { toast.error(\'AI 服务暂不可用\'); return null; }',
  '  const parsed = extractJson<{ t: string }>(result);',
  '  return parsed.t;',
  '}',
].join('\n');

const metaUnguarded = inspect(FIXTURE_UNGUARDED, 'fixture-unguarded');
ok(metaUnguarded.sites === 1 && metaUnguarded.violations.length === 1,
  '元判据：缺判空的固件必须被抓出 1 条违规（否则"全仓 0 违规"没有意义）',
  JSON.stringify(metaUnguarded));
const metaGreedy = inspect(FIXTURE_GREEDY, 'fixture-greedy');
ok(metaGreedy.violations.length === 1,
  '元判据：用贪婪正则的固件必须被抓出 1 条违规',
  JSON.stringify(metaGreedy));
const metaClean = inspect(FIXTURE_CLEAN, 'fixture-clean');
ok(metaClean.sites === 1 && metaClean.violations.length === 0,
  '元判据配对：写对的固件必须 0 违规（否则上面两条红是检查器本身坏了）',
  JSON.stringify(metaClean));

/* ───────────── 全仓扫描 ───────────── */
function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f.name)) out.push(p);
  }
  return out;
}
const files = walk(path.join(ROOT, 'src')).filter((f) => !/[\\/]utils\.ts$/.test(f));

let totalSites = 0;
const allViolations = [];
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const r = inspect(fs.readFileSync(f, 'utf8'), rel);
  totalSites += r.sites;
  allViolations.push(...r.violations);
}

ok(totalSites >= 20,
  `解析点数量有下限（当前 ${totalSites} 处）—— 守卫不能扫到 0 个点还自称通过`);
ok(allViolations.length === 0,
  '①② 全仓所有 extractJson 调用点都有判空前置，且没有贪婪正则残留',
  allViolations.slice(0, 6).join(' ; '));

/* ───────────── 行为证据：空串喂进 extractJson 确实抛「格式异常」类错误 ───────────── */
// 真转译 src/lib/utils.ts 的 extractJson，不重写实现 —— 否则证明不了产品代码的行为
const TMP = path.join(process.env.TEMP || '/tmp', 'ai-parse-check');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const utilSrc = fs.readFileSync(path.join(ROOT, 'src/lib/utils.ts'), 'utf8');
// 只去掉 import 行：extractJson 本身是纯函数，不依赖 clsx/twMerge 那些外部模块
const stripped = utilSrc.split(/\r?\n/).filter((ln) => !/^\s*import\s/.test(ln)).join('\n');
if (/^\s*import\s/m.test(stripped)) {
  console.error('脚手架错误：utils.ts 里仍有未剥离的 import');
  process.exit(2);
}
const js = ts.transpileModule(stripped, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const outFile = path.join(TMP, 'utils-under-test.mjs');
fs.writeFileSync(outFile, js);
let u;
try {
  u = await import(pathToFileURL(outFile).href);
} catch (e) {
  console.error('脚手架错误：utils.ts 转译后无法加载 -> ' + e.message);
  process.exit(2);
}
if (typeof u?.extractJson !== 'function') {
  console.error('脚手架错误：没拿到真实的 extractJson');
  process.exit(2);
}
let threwOnEmpty = false;
let emptyMsg = '';
try { u.extractJson(''); } catch (e) { threwOnEmpty = true; emptyMsg = String(e?.message || e); }
ok(threwOnEmpty,
  '① 的行为依据：extractJson("") 确实抛错 —— 少了判空前置就会把它当成"格式异常"报给用户',
  emptyMsg);
ok(/JSON|JSON|提取|解析/.test(emptyMsg),
  '① 抛出的正是那句会被误读成"格式异常"的文案', emptyMsg);
ok(u.extractJson('{"a":1} trailing').a === 1 && u.extractJson('[1,2]').length === 2,
  '脚手架自检：extractJson 对夹带文本/数组仍能括号配平取出');
// 正对照：贪婪正则在同一份输入上会多吞（这就是规矩 ② 的理由）
const tricky = '前缀 {"a":1} 中间说明 {"b":2} 后缀';
const greedyMatch = tricky.match(/\{[\s\S]*\}/)?.[0] ?? '';
ok(greedyMatch.length > 0 && greedyMatch.includes('"b"'),
  '② 的行为依据：贪婪匹配把两段 JSON 之间的说明文字一起吞进来（extractJson 不会）',
  `贪婪取到 ${greedyMatch.length} 字符`);
ok(JSON.stringify(u.extractJson(tricky)) === '{"a":1}',
  '正对照配对：同一输入 extractJson 只取第一段平衡对象', JSON.stringify(u.extractJson(tricky)));

/* ───────────────────────── 汇总 ───────────────────────── */
const failed = results.filter((r) => !r.pass);
for (const r of failed) console.log(`  ✗ ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
console.log(`\n断言 ${results.length - failed.length}/${results.length} 通过（解析点 ${totalSites} 处）`);
if (failed.length) { console.log('✗ 有失败'); process.exit(1); }
console.log('✓ AI 解析约定全仓成立');
