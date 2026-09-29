/**
 * verify-bundle-budget.mjs — 「首屏到底必须下载什么」的预算守卫。
 *
 * 起因（2026-09-29 性能体检）：vite.config 里给 recharts/d3 和 react-markdown 写了强制
 * manualChunks 规则，本意是"拆出去别混进入口"，实际效果**正好相反** —— 被强制归组的 chunk
 * 会变成入口的静态依赖，于是全站只有 /progress 用得着的图表库（压缩后 111KB）和只有 5 个页面
 * 用得着的 Markdown 渲染器（45KB），每一条路由首屏都得下载。
 * 静态检查看不出来（源码里明明是 lazy import），只有从**产物**反查依赖图才看得见。
 *
 * 本脚本做三件事：
 *   ① 从 dist/client/index.html 的 modulepreload + 入口 chunk 的**静态** import 递归出"首屏必需集合"；
 *   ② 断言这个集合里不许出现 recharts / markdown / 词库数据 chunk；
 *   ③ 断言首屏必需的 gzip 总量不超过预算（超了就是有人往壳里塞了重依赖）。
 *
 * 用法：先 `npm run build:web`，再 `node scripts/verify-bundle-budget.mjs`
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist/client');

let pass = 0, fail = 0;
const failures = [];
const check = (cond, label, detail) => {
  if (cond) pass++; else { fail++; failures.push(label + (detail ? ` — ${detail}` : '')); }
};

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/client 不存在或不完整 —— 先跑 npm run build:web 再跑本脚本（不许拿"没构建"当通过）');
  process.exit(1);
}

const ASSETS = join(DIST, 'assets');
const files = readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
const gzipKB = (f) => +(gzipSync(readFileSync(join(ASSETS, f))).length / 1024).toFixed(1);

/** 一个 chunk 的静态依赖（import{x}from"./a.js"）与动态依赖（import("./a.js")）要分清 */
function depsOf(name) {
  const src = readFileSync(join(ASSETS, name), 'utf8');
  const stat = new Set();
  const dyn = new Set();
  for (const m of src.matchAll(/import[^;{}]{0,200}?from\s*["'`](\.\/[^"'`]+)["'`]/g)) stat.add(m[1].replace('./', ''));
  for (const m of src.matchAll(/import\(\s*["'`]\.\/([^"'`]+)["'`]\s*\)/g)) dyn.add(m[1]);
  // rolldown 的 __vitePreload(() => import("./x.js"), __vite__mapDeps([...])) 也算动态
  for (const m of src.matchAll(/"assets\/([A-Za-z0-9._-]+\.js)"/g)) dyn.add(m[1]);
  return { stat: [...stat].filter((f) => files.includes(f)), dyn: [...dyn].filter((f) => files.includes(f)) };
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const preloads = [...html.matchAll(/assets\/([A-Za-z0-9._-]+\.js)/g)].map((m) => m[1]);
const entry = preloads.find((f) => /^index-/.test(f));
check(!!entry, '脚手架自检：从 index.html 找到入口 chunk', preloads.join(' '));

// 首屏必需 = modulepreload 列出的 + 沿静态 import 递归
const needed = new Set(preloads.filter((f) => files.includes(f)));
const queue = [...needed];
while (queue.length) {
  const cur = queue.shift();
  for (const d of depsOf(cur).stat) if (!needed.has(d)) { needed.add(d); queue.push(d); }
}

const list = [...needed].sort();
const totalKB = list.reduce((a, f) => a + gzipKB(f), 0);
console.log(`首屏必需 JS：${list.length} 个 chunk，gzip 合计 ${totalKB.toFixed(1)} KB`);
for (const f of list) console.log(`   ${String(gzipKB(f)).padStart(7)} KB  ${f}`);

const bad = (re, what) => list.filter((f) => re.test(f));
check(bad(/charts|ProgressCharts|recharts|d3-/i, '').length === 0, '首屏不下载图表库（只有 /progress 用得到）', bad(/charts|ProgressCharts/i).join(','));
check(bad(/markdown|micromark|mdast|unified|lib-/i, '').length === 0, '首屏不下载 Markdown 渲染器（只有 5 个页面 + 更新日志用得到）', bad(/markdown|lib-/i).join(','));
// 词书**数据** chunk 命名是 wordbank-<level>-<hash>.js；wordbank-<hash>.js 是加载器本体（2.4KB，必须首屏在）
const LEVELS = ['zhongkao', 'gaokao', 'cet4', 'cet6', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'];
const bookChunks = list.filter((f) => LEVELS.some((l) => new RegExp(`^wordbank-${l}-`).test(f) || new RegExp(`^${l}\\.detail-`).test(f)));
check(bookChunks.length === 0, '首屏不下载任何一本词书数据', bookChunks.join(','));
check(bad(/^books-|^scp|^reading/i, '').length === 0, '首屏不下载书/语料正文', bad(/^books-|^reading/i).join(','));
// 预算：2026-09-29 实测 540KB（壳 + react/router/radix/motion/icons + 词库加载器 + utils）
const BUDGET = 600;
check(totalKB <= BUDGET, `首屏必需 JS gzip ≤ ${BUDGET}KB（当前 ${totalKB.toFixed(1)}KB）`);

// 反向确认：这些重依赖确实还在，只是变成按需 —— 防"被谁整段删掉"造成假通过
const hasCharts = files.some((f) => /ProgressCharts/.test(f));
const hasMarkdown = files.some((f) => /react-markdown|remark|markdown/i.test(f)) ||
  files.some((f) => readFileSync(join(ASSETS, f), 'utf8').includes('micromark'));
check(hasCharts, '正对照：图表库仍在产物里（是按需，不是被删了）');
check(hasMarkdown, '正对照：Markdown 渲染器仍在产物里（是按需，不是被删了）');

/*
 * 源码级卫生检查：平台 SDK 只准动态加载。
 * `@lark-apaas/client-toolkit-lite` 那个 chunk 实测 507KB raw / 160KB gzip，
 * 静态 import 它的四个功能页（思维/语块/对话/写作）每次进入都要下载解析一遍，
 * 而它只在"用户没配 AI Key"那条平台兜底分支里才被碰到。
 * 入口那处同步 require 同理（会连 zone.js / axios / lodash 全量一起拖进来）。
 */
{
  const { execSync } = await import('node:child_process');
  let grepOut = '';
  try { grepOut = execSync('git grep -n "lark-apaas/client-toolkit-lite" -- src', { cwd: ROOT, encoding: 'utf8' }); } catch { grepOut = ''; }
  const hits = grepOut.split('\n').filter((l) => /:\d+:/.test(l));
  const statics = hits.filter((l) => {
    const code = l.replace(/^[^:]+:\d+:/, '').trim();
    return /^import\s/.test(code) || /^export\s+\{[^}]*\}\s+from\s+['"]@lark-apaas/.test(code);
  });
  check(hits.length > 0, '脚手架自检：抓到平台 SDK 的引用点（抓不到说明 grep 失效）', `${hits.length} 处`);
  check(statics.length === 0, '没有文件静态 import 平台 SDK（只准 import()）', statics.join(' | ').slice(0, 220));
}

console.log('');
console.log(`断言 ${pass}/${pass + fail} 通过${fail ? '' : ' ✓'}`);
if (fail) { failures.slice(0, 20).forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
