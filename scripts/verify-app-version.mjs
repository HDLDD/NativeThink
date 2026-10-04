/**
 * verify-app-version.mjs — 「版本号只有一个载体」的链路守卫。
 *
 * 背景（2026-10-05 迁移）：scripts/ensure-web-build.mjs 判据② 原先靠扫描入口 chunk 里的
 * x.y.z 裸字面量核对版本 —— 那些字面量是反馈上报的 appVersion 字段顺带带进包的。反馈功能
 * 整体下架后这条链断了，迁移为「构建期把版本盖进 index.html 的 <meta name="app-version">」。
 * 本脚本钉住整条链路，任一处断了判据②就会静默失效（装出版本无法核对的包而无人知晓）。
 *
 * 链路：源(version.properties) → 注入(vite.config 替换占位符) → 载体(index.html)
 *      → 消费(ensure-web-build 按 meta 核对) → 端到端(产物存在时 index/404 两页 meta 一致)
 *      → 单载体(旧 __APP_VERSION__ 链不得复活 —— 两个载体就会漂移)
 *
 * 用法：node scripts/verify-app-version.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

let pass = 0, fail = 0, skipped = 0;
const failures = [];
const check = (cond, label, detail) => {
  if (cond) pass++;
  else { fail++; failures.push(label + (detail ? ` — ${detail}` : '')); }
};
const skip = (label) => { skipped++; console.log('  ․ ' + label); };

// ── ① 源：version.properties ──
const props = read('android/version.properties');
const want = (props.match(/versionName=(\d+\.\d+\.\d+)/) || [])[1] || '';
check(!!want, '① version.properties 有 major.minor.patch 形态的 versionName', props.replace(/\n/g, ' '));
check(/versionCode=\d+/.test(props), '① version.properties 有 versionCode（Android 拒绝非递增升级）');

// ── ② 注入：vite.config.ts ──
const vite = read('vite.config.ts');
check(/version\.properties/.test(vite) && /android/.test(vite),
  '② vite.config 读 android/version.properties（与 APK 身份同源）');
check(/\.replace\(\/{{appVersion}}\/g, appVersion\)/.test(vite),
  '② fixHtmlPlaceholders 把 {{appVersion}} 替换成读到的版本（占位符不许进产物）');

// ── ③ 载体：index.html ──
const html = read('index.html');
check(/<meta[^>]*name="app-version"[^>]*content="{{appVersion}}"[^>]*\/?>/.test(html),
  '③ index.html 有 app-version 占位符 meta（构建期被换成版本号）');

// ── ④ 消费：ensure-web-build.mjs ──
const ensure = read('scripts/ensure-web-build.mjs');
check(/name="app-version"/.test(ensure), '④ ensure-web-build 按 app-version meta 核对产物版本');
check(!/__APP_VERSION__/.test(ensure), '④ ensure-web-build 不再引用 __APP_VERSION__（旧扫描链已拆）');

// ── ⑤ 单一载体：全仓代码不得复活旧 define 链 ──
// 剥注释后扫描（历史说明文字可以提，代码引用不行 —— 两个载体就会有第二个漂移源）。
// 本文件自身要排除：断言正则里写着这个名字。
const strip = (s) => s.replace(/^[ \t]*\/\/[^\n]*/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const codeFiles = ['vite.config.ts'];
for (const d of ['src', 'scripts', 'functions', 'electron', 'server']) {
  if (!existsSync(join(ROOT, d))) continue;
  for (const rel of readdirSync(join(ROOT, d), { recursive: true })) {
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(rel)) continue;
    const p = join(d, rel).replace(/\\/g, '/');
    if (p === 'scripts/verify-app-version.mjs') continue;
    codeFiles.push(p);
  }
}
const hits = codeFiles.filter((f) => /__APP_VERSION__/.test(strip(read(f))));
check(hits.length === 0, '⑤ 旧 __APP_VERSION__ define 链无残留（版本只有 meta 一个载体）', hits.join(', '));

// ── ⑥ 端到端：产物存在时（先 npm run build:web） ──
const metaOf = (abs) => (readFileSync(abs, 'utf8').match(/<meta[^>]*name="app-version"[^>]*content="([^"]+)"/) || [])[1] || '';
const DIST_INDEX = join(ROOT, 'dist', 'client', 'index.html');
if (!existsSync(DIST_INDEX)) {
  skip('⑥ 没有 dist/client 产物，端到端段跳过（先 npm run build:web 再跑本脚本）');
} else {
  const mIndex = metaOf(DIST_INDEX);
  check(mIndex !== '' && mIndex !== '{{appVersion}}',
    '⑥ 产物 index.html 的 meta 已替换成版本号（不是空串/占位符）', mIndex);
  check(mIndex === want, `⑥ 产物 meta 与 version.properties 一致（${want}）`, mIndex);
  const DIST_404 = join(ROOT, 'dist', 'client', '404.html');
  if (existsSync(DIST_404)) {
    check(metaOf(DIST_404) === want, '⑥ 404.html 的 meta 与版本一致（由 index.html 复制而来）', metaOf(DIST_404));
  } else {
    skip('⑥ 404.html 不存在，跳过');
  }
}

console.log('');
console.log(`断言 ${pass}/${pass + fail} 通过${skipped ? `（另有 ${skipped} 条因缺产物跳过）` : ''}${fail ? '' : ' ✓'}`);
if (fail) {
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
