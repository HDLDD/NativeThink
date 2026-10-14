#!/usr/bin/env node
/**
 * verify-char-hygiene.mjs — 数据「不可见坏字符」零残留守卫。
 *
 * 守两类字符（任何字体都渲染不出，浏览器/系统只能画成 "?" 或方块 —— 用户看到的就是
 * 「中文注释里出现 '?' 未知图标」）：
 *   - U+FFFD 替换符：曾 5909 处，真机反馈「翻译里有 ???」（clean-wordbank-mojibake.mjs 第一轮清了）
 *   - U+E000–U+F8FF 私用区 PUA：2026-10-14 真机反馈的元凶 —— 考研 `common` 释义尾部、
 *     词典化学式下标（`C₁₇H₁₈F₃NO`）等共 16 处（净化脚本第二轮清了）
 *
 * 覆盖：src/data 全部 .ts 文本数据 + public/books 全书文本。
 * 元判据自带正/负对照：扫描器打得中固件里的坏字符、不误伤正常中文与化学式；
 * 扫描文件数设下限，防"路径失效 → 扫了个空 → 假绿"。
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const fails = [];
const check = (ok, label) => { if (ok) pass++; else { fail++; fails.push(label); } };

/** 扫描器：返回坏字符命中（码点 + 上下文），最多报 50 处 */
function scanText(text) {
  const hits = [];
  const re = /[\uFFFD\uE000-\uF8FF]/g;
  let m;
  while ((m = re.exec(text))) {
    const cp = m[0].codePointAt(0);
    hits.push({
      cp: 'U+' + cp.toString(16).toUpperCase(),
      ctx: text.slice(Math.max(0, m.index - 12), m.index + 13).replace(/\n/g, '⏎'),
    });
    if (hits.length > 50) break;
  }
  return hits;
}
function walk(dir, exts) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (f !== 'node_modules') out.push(...walk(p, exts));
    } else if (exts.some((e) => f.endsWith(e))) out.push(p);
  }
  return out;
}
const fmt = (hits) => '\n    ' + hits.slice(0, 8).join('\n    ');

// ① 扫描器自证：正对照（固件里的坏字符必须命中）+ 负对照（正常中文不许误伤）
check(scanText('样例：小规\uFFFD的 + 冗长的；\uE40A嗦的').length === 2,
  '自证：扫描器打得中固件里的 U+FFFD 与 PUA（正对照）');
check(scanText('样例：小规则的 冗长的；啰嗦的 C17H18F3NO').length === 0,
  '自证：正常中文 / 化学式下标不带样式时不误伤（负对照）');

// ② src/data 全量（词库、词典、语块、短语库、语料……）
const dataFiles = walk(join(ROOT, 'src/data'), ['.ts', '.tsx']);
check(dataFiles.length >= 40, `src/data 扫到 ${dataFiles.length} 个文件（≥40，防路径失效假绿）`);
const dataHits = [];
for (const p of dataFiles) {
  for (const h of scanText(readFileSync(p, 'utf8'))) {
    dataHits.push(`${relative(ROOT, p).replace(/\\/g, '/')} ${h.cp} …${h.ctx}…`);
  }
}
check(dataHits.length === 0, 'src/data 零坏字符（U+FFFD + PUA）' + (dataHits.length ? fmt(dataHits) : ''));

// ③ public/books（阅读器直读的全书文本）
const booksDir = join(ROOT, 'public/books');
if (existsSync(booksDir)) {
  const bookFiles = walk(booksDir, ['.txt']);
  check(bookFiles.length > 0, `public/books 扫到 ${bookFiles.length} 个文本文件`);
  const bookHits = [];
  for (const p of bookFiles) {
    for (const h of scanText(readFileSync(p, 'utf8'))) bookHits.push(`${relative(ROOT, p).replace(/\\/g, '/')} ${h.cp}`);
  }
  check(bookHits.length === 0, 'public/books 零坏字符' + (bookHits.length ? fmt(bookHits) : ''));
} else {
  check(true, 'public/books 不存在（跳过）');
}

// ④ 净化脚本静态自证：两类字符都得清、两个数据目录都得覆盖、残留必须 exit 1
const cleaner = readFileSync(join(ROOT, 'scripts/clean-wordbank-mojibake.mjs'), 'utf8');
check(/E000/.test(cleaner) && /F8FF/.test(cleaner), '净化脚本覆盖私用区（U+E000–F8FF）');
check(/wordbank\/data/.test(cleaner) && /dictionary\/data/.test(cleaner), '净化脚本覆盖词库与词典两个数据目录');
check(/process\.exit\(1\)/.test(cleaner), '净化脚本对残留坏字符 exit 1（清了还敢残留就红）');

console.log('');
console.log(`断言 ${pass}/${pass + fail} 通过${fail ? '' : ' ✓'}`);
if (fail) {
  fails.slice(0, 20).forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
