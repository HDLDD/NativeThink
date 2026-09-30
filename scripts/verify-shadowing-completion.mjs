#!/usr/bin/env node
/**
 * verify-shadowing-completion.mjs — 影子跟读「完成标记」与「删除 AI 追加句」的索引契约守卫。
 *
 * 起因（读代码逐行核实的真实缺陷，见 docs/modules/shadowing.md §3.1）：
 *   完成键 = `${corpusId}-${句序}`，句序是**合并数组索引**（原句 + AI 追加句）；
 *   但删除按钮传的是 extras 的**本地索引**（`idx - sentences.length`），
 *   而 handleDeleteSentence 拿这个数字去做合并索引的位移。
 *   后果：原 8 句 + 追加 3 句、全做完后删第一条追加句 → `id-0` 被删、
 *   `id-1…id-10` 集体下移一位 → 完成数少 1、绿勾指错句、
 *   `totalCompleted >= totalSentences` 不再成立 → **100% 成就横幅与「再来一遍」永久消失**。
 *
 * 本脚本两层都守：
 *   A. 把 `src/lib/shadowing-progress.ts` **真转译真跑**，覆盖删除/位移/隔离/边界，
 *      并带"旧调用方式"的正对照 —— 证明一旦索引语义再次被混用，这里会红。
 *   B. 静态守接线：删除路径必须传合并索引、键构造必须单一来源、
 *      两处 AI 分析必须先判空串。
 *
 * 用法：node scripts/verify-shadowing-completion.mjs
 * 退出码：0 = 全绿；1 = 有失败；2 = 脚手架自身有问题
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(process.env.TEMP || '/tmp', 'shadowing-completion-check');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });

/* ───────────────────────── A. 真实纯函数行为 ───────────────────────── */
const LIB = path.join(ROOT, 'src/lib/shadowing-progress.ts');
const libSrc = fs.readFileSync(LIB, 'utf8');

// 该模块必须零外部依赖，否则这里转译出来的就不是"产品里那份实现"
const leftoverImports = [...libSrc.matchAll(/^\s*import\s.*$/gm)].map((m) => m[0].trim());
if (leftoverImports.length) {
  console.error('脚手架错误：shadowing-progress.ts 不再是零依赖模块 ->\n' + leftoverImports.join('\n'));
  process.exit(2);
}

const js = ts.transpileModule(libSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const outFile = path.join(TMP, 'shadowing-progress-under-test.mjs');
fs.writeFileSync(outFile, js);
const mod = await import(pathToFileURL(outFile).href);

const K = mod.shadowingCompletionKey;
const ok2 = (c, n, d) => ok(c, n, d);

// A1 脚手架自检：键构造与解析必须互逆（不互逆说明转译/导入没拿到真实现）
ok2(mod.parseCompletionIndex(K('7', 3), '7') === 3,
  '脚手架自检：completionKey / parseCompletionIndex 互逆');
ok2(mod.countCompletedForCorpus([K('7', 0), K('7', 1)], '7') === 2,
  '脚手架自检：countCompletedForCorpus 能数到真实键');

// A2 历史缺陷场景（正确修法）：8 原句 + 3 追加句，用户做完了除「第一条追加句」以外的全部 10 句。
//    删掉第一条追加句（合并索引 8）→ 剩下 10 句恰好都已完成，100% 横幅**应当**成立。
const BASE = 8, EXTRA = 3;
const doneExceptFirstExtra = new Set(
  Array.from({ length: BASE + EXTRA }, (_, i) => i)
    .filter((i) => i !== BASE)              // 合并索引 8（第一条追加句）没做
    .map((i) => K('c1', i)),
);
const afterDelete = mod.shiftCompletionAfterDelete(doneExceptFirstExtra, 'c1', BASE);
const remainingTotal = BASE + EXTRA - 1;
const banner = (keys, total) => mod.countCompletedForCorpus(keys, 'c1') >= total;
ok2(mod.countCompletedForCorpus(afterDelete, 'c1') === remainingTotal && banner(afterDelete, remainingTotal),
  '删第一条 AI 追加句后完成数 = 新句数（100% 判定成立）',
  `completed=${mod.countCompletedForCorpus(afterDelete, 'c1')} total=${remainingTotal}`);
ok2(afterDelete.has(K('c1', 0)),
  '第 1 句（id-0）的完成标记没有被误删');
ok2(!afterDelete.has(K('c1', 10)),
  '位移后不留末尾孤儿键 id-10');
ok2(
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].every((i) => afterDelete.has(K('c1', i))) && afterDelete.size === 10,
  '位移结果恰好是连续 0..9（绿勾不会指到错误的句子）',
  [...afterDelete].sort((a, b) => Number(a.slice(3)) - Number(b.slice(3))).join(','),
);

// A3 正对照：同一场景下若退回"把 extras 本地索引(0)当合并索引传"的旧调用方式，
//    被删的是 id-0（一句根本没人删的原句标记），完成数掉到 9 < 10 → 横幅永不出现。
//    这条必须为真，否则说明 A2 那组断言抓不到回归（计数在"全做完"的场景下两边都是 10，不具判别力）。
const regressed = mod.shiftCompletionAfterDelete(doneExceptFirstExtra, 'c1', 0);
ok2(
  mod.countCompletedForCorpus(regressed, 'c1') === remainingTotal - 1 && !banner(regressed, remainingTotal),
  '正对照：旧调用方式（本地索引）会少计 1 句、100% 横幅消失 —— 守卫真能抓到回归',
  `completed=${mod.countCompletedForCorpus(regressed, 'c1')} 应为 ${remainingTotal - 1}`,
);
// 位移错位的直接证据：原句第 8 句（合并索引 7）明明做过，标记却没了；
// 而索引 8 上挂着的是被删那句之后、属于别句的标记 —— 绿勾整体指错句子。
ok2(
  !regressed.has(K('c1', 7)) && regressed.has(K('c1', 8)) && afterDelete.has(K('c1', 7)),
  '正对照第二信号：旧调用方式让标记整体错位（id-7 丢失、id-8 挂到别句），而正确修法保住 id-7',
  `regressed=[${[...regressed].sort().join(',')}]`,
);

// A4 删中间追加句（合并索引 9）：0..8 原样保留，10 → 9
const allDone = new Set(Array.from({ length: BASE + EXTRA }, (_, i) => K('c1', i)));
const mid = mod.shiftCompletionAfterDelete(allDone, 'c1', 9);
ok2(mod.countCompletedForCorpus(mid, 'c1') === 10 && mid.has(K('c1', 8)) && mid.has(K('c1', 9)) && !mid.has(K('c1', 10)),
  '删中间追加句：前段不动、后段左移一格');

// A5 跨语料隔离：另一个语料的完成标记原样保留、且不计入当前语料
const mixed = new Set([...allDone, K('c2', 0), K('c2', 1)]);
const shiftedMixed = mod.shiftCompletionAfterDelete(mixed, 'c1', BASE);
ok2(shiftedMixed.has(K('c2', 0)) && shiftedMixed.has(K('c2', 1)),
  '位移不碰其它语料的完成标记');
ok2(mod.countCompletedForCorpus(shiftedMixed, 'c1') === 10 && mod.countCompletedForCorpus(mixed, 'c2') === 2,
  '完成数按语料分别统计（此前用全局 Set.size 除以当前句数会虚高）');

// A6 「再来一遍」只清当前语料
const cleared = mod.clearCompletionForCorpus(mixed, 'c1');
ok2(mod.countCompletedForCorpus(cleared, 'c1') === 0 && mod.countCompletedForCorpus(cleared, 'c2') === 2,
  'clearCompletionForCorpus 只清目标语料');

// A7 索引换算与守卫：内置原句不可删
ok2(mod.extrasLocalIndex(BASE, BASE) === 0 && mod.extrasLocalIndex(BASE + 2, BASE) === 2,
  'extrasLocalIndex：合并索引 → 追加段本地索引');
ok2(mod.extrasLocalIndex(BASE - 1, BASE) === -1 && mod.extrasLocalIndex(0, BASE) === -1,
  'extrasLocalIndex：落在原句段返回 -1（调用方必须放弃删除）');

// A8 非法/外来键不被当成本语料的完成标记
ok2(mod.parseCompletionIndex('c1-x', 'c1') === null && mod.parseCompletionIndex('c11-0', 'c1') === null,
  'parseCompletionIndex 拒绝非数字后缀与别的语料 id');

/* ───────────────────────── B. 页面接线（源码级契约） ───────────────────────── */
const PAGE = path.join(ROOT, 'src/pages/ShadowingPage/ShadowingPage.tsx');
const page = fs.readFileSync(PAGE, 'utf8');

ok2(/handleDeleteSentence\(selectedCorpus\.id,\s*idx\)/.test(page),
  '删除按钮传**合并索引**（idx）');
ok2(!/handleDeleteSentence\(selectedCorpus\.id,\s*idx\s*-\s*selectedCorpus\.sentences\.length\)/.test(page),
  '正对照：不再存在「传 extras 本地索引」的旧调用');
ok2(/from '@\/lib\/shadowing-progress'/.test(page),
  '页面从 shadowing-progress 引入纯函数（索引换算单点归属）');
ok2(
  (page.match(/shadowingCompletionKey\(/g) || []).length >= 3,
  '完成键构造统一走 shadowingCompletionKey（≥3 处：markCompleted / 按钮态 / 句行）',
  String((page.match(/shadowingCompletionKey\(/g) || []).length),
);
ok2(!/`\$\{selectedCorpus\.id\}-\$\{/.test(page),
  '页面里不再手写裸模板键（避免又冒出一处不同源的索引）');
ok2(/shiftCompletionAfterDelete\(prev,\s*corpusId,\s*mergedIdx\)/.test(page) && /clearCompletionForCorpus\(prev,\s*selectedCorpus\.id\)/.test(page),
  '位移与清空都调用纯函数，不在组件里重写');
ok2(/extrasLocalIndex\(mergedIdx,\s*baseLen\)/.test(page) && /if\s*\(localIdx\s*<\s*0\)\s*return/.test(page),
  '删除路径先换算本地索引，并拒绝删除内置原句');

// 两处发音分析都必须先判空串（use-ai 失败返回 ''，本页 catch 永不触发）
const setCalls = [...page.matchAll(/setAiAnalysis\(result\)/g)].length;
const trimGuards = [...page.matchAll(/if\s*\(!result\.trim\(\)\)/g)].length;
ok2(setCalls === 2 && trimGuards >= 2,
  '两处 AI 分析都有 !result.trim() 前置（空串=服务不可用，不是"结果为空"）',
  `setAiAnalysis=${setCalls} trim 守卫=${trimGuards}`);

/* ───────────────────────── 汇总 ───────────────────────── */
const failed = results.filter((r) => !r.pass);
for (const r of results) {
  if (!r.pass) console.log(`  ✗ ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
}
console.log(`\n断言 ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) { console.log('✗ 有失败'); process.exit(1); }
console.log('✓ 跟读完成标记与删除索引契约全部成立');
