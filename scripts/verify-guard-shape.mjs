/**
 * verify-guard-shape.mjs — 守卫自身的"恒真断言"扫描（元守卫）。
 *
 * 为什么需要（2026-10-17 真实翻车）：改一条断言时把
 *   ok(/x/.test(src), '名字')
 * 写成了
 *   ok(/x/, src, '名字')
 * —— 第一个实参成了**正则字面量对象本身**，对象永远真。守卫照样打印 "N/N 通过 ✓"，
 * 而变异实验（把实现改坏）跑下去才发现那条断言根本没在管事。静态看代码看不出来，
 * 所以把它做成一条全仓扫描。
 *
 * 判据：任何形如 ok/assert/check/expect/t(...) 的调用，第一个实参不许是"恒真的字面量"
 * （正则字面量、字符串、数字、模板串、true、数组/对象/函数/箭头函数）。
 * 顺带钉：断言必须带名字（第二个实参），否则红了一屏也不知道是哪条。
 *
 * 自证（正对照）：内置一段"就是上面那个 bug"的样本，扫描器必须报它；
 * 再加一段健康样本必须不报 —— 两头都验，扫描器自己才不会是假绿。
 *
 * 用法：node scripts/verify-guard-shape.mjs（verify:all 自动发现）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });

const ALWAYS_TRUTHY = new Set([
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateExpression,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.ArrayLiteralExpression,
  ts.SyntaxKind.ObjectLiteralExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ClassExpression,
]);
/**
 * ⚠️ 已知盲区：布尔字面量**不**列在这里。像
 *   if (坏味道.test(src)) check(false, 'X'); else check(true, 'X');
 * 这种"外层已经判过、分支里再记一笔"的写法在本仓守卫里是合法的（brand-fonts / char-hygiene 各一处），
 * 把它一起判红只会逼人放宽断言。代价：`check(true, '占位')` 这类空壳仍要靠变异实验抓。
 */

/** 本文件里真正是"断言记录器"的函数名：形如 (cond, name|label, detail) */
function assertionHelpers(sf) {
  const names = new Set();
  const visit = (n) => {
    const params = ts.isArrowFunction(n) || ts.isFunctionExpression(n)
      ? n.parameters
      : ts.isFunctionDeclaration(n) ? n.parameters : null;
    if (params && params.length >= 2) {
      const second = params[1].name.getText().replace(/[{}[\]]/g, '');
      if (/^(name|label|title|msg)$/.test(second)) {
        const holder = n.parent;
        if (ts.isVariableDeclaration(holder)) names.add(holder.name.getText());
        else if (ts.isFunctionDeclaration(n)) names.add(n.name.getText());
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
}

/** 扫一段源码 → {problems, inspected}（供全仓扫描与自证两用） */
function scan(fileName, text) {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const helpers = assertionHelpers(sf);
  const problems = [];
  let inspected = 0;
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const walk = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && helpers.has(n.expression.text)) {
      inspected++;
      const a0 = n.arguments[0];
      if (a0 && ALWAYS_TRUTHY.has(a0.kind)) {
        problems.push({ line: lineOf(a0.pos), why: '恒真条件（第一个实参是字面量本体，不是判断结果）', text: a0.getText().slice(0, 60) });
      } else if (n.arguments.length < 2) {
        problems.push({ line: lineOf(n.pos), why: '断言没有名字（红了不知道是哪条）', text: n.getText().slice(0, 60) });
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return { problems, inspected, helpers: [...helpers] };
}

/* ── 自证：扫描器自己必须抓得住本轮真实的那次写法 ── */
{
  const decl = "const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });\nconst check = (cond, label, detail) => {};\n";
  const bad = decl + "const src = '';\nok(/a/, src, '名字');\nok(/b/.test(src), '正常');\nok('字面量当条件');\ncheck(1, '数字当条件');\nok(/c/\n  , src, '跨行的那一版（本轮真实翻车就是跨行写的）');\n";
  const found = scan('bad.mjs', bad).problems;
  ok(found.length === 4, '正对照：抓得住 `ok(/re/, src, name)`（含跨行写法）、字符串与数字当条件',
    found.map((p) => `${p.line}:${p.why}`).join(' | '));
  const lines = found.map((p) => p.line).join(',');
  ok(lines === '4,6,7,8', '正对照：报的行号逐个对得上（含跨行那条），漏一个就说明形状表/识别器被改坏', `lines=${lines}`);
  const good = decl + "const src = '';\nok(/b/.test(src), '正常');\ncheck(src.includes('x'), '另一条', '细节');\n";
  const g = scan('good.mjs', good);
  ok(g.problems.length === 0 && g.inspected === 2,
    '反面对照：健康写法一条不报，且**确实看过**这两条断言（inspected 为 0 就说明识别器没认出来，全仓扫描会变成真空通过）',
    `inspected=${g.inspected} helpers=${g.helpers.join(',')}`);
}

/* ── 全仓扫描 ── */
const dir = path.join(ROOT, 'scripts');
const guards = fs.readdirSync(dir).filter((f) => /^verify-.*\.mjs$/.test(f) && f !== 'verify-all.mjs');
ok(guards.length >= 25, `扫到 ${guards.length} 条守卫（verify:all 靠同一套命名自动发现）`, guards.join(','));
const all = [];
let inspectedTotal = 0;
const noHelper = [];
for (const f of guards) {
  const r = scan(f, fs.readFileSync(path.join(dir, f), 'utf8'));
  inspectedTotal += r.inspected;
  if (r.helpers.length === 0) noHelper.push(f);
  for (const p of r.problems) all.push(`${f}:${p.line} ${p.why} → ${p.text}`);
}
ok(inspectedTotal >= 1000, `识别器在全仓真跑了 ${inspectedTotal} 条断言调用（不是空转）`, String(inspectedTotal));
ok(noHelper.length === 0, `每条守卫都有自己的断言记录器（识别不出来=那条守卫完全没被扫）`, noHelper.join(','));
ok(all.length === 0, '全部守卫没有恒真断言、每条都有名字', all.slice(0, 8).join('\n      '));

let pass = 0, fail = 0, failures = [];
for (const r of results) { if (r.pass) pass++; else { fail++; failures.push(r); } }
console.log('');
console.log(`断言 ${pass}/${pass + fail} 通过${fail ? '' : ' ✓'}`);
failures.forEach((r) => console.log(`  ✗ ${r.name}${r.detail ? `\n      ↳ ${r.detail}` : ''}`));
if (all.length) console.log('  问题清单:\n      ' + all.join('\n      '));
process.exit(fail ? 1 : 0);
