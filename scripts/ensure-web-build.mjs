/**
 * ensure-web-build.mjs — 打包前保证 `dist/client` 与当前源码、当前版本号一致（不一致就自己重建）。
 *
 * 真实事故（2026-09-30）：`package:apk` 只做 `capacitor copy android`，**不重建 web** ——
 * 它拷的是 `dist/client` 里现成的东西。改完语块接龙判定后直接打包装机，
 * 得到的 78/2.0.33 里仍是上一版产物：接龙修复根本没进包，
 * 而 `BUILD SUCCESSFUL`、versionCode、体积构成全都正常 —— 从打包日志上完全看不出来。
 * 靠人记得"先 build:web"是失败的 design，所以这里让它自动补。
 *
 * 两个触发条件（任一成立就重建）：
 *   ① 有被跟踪的源码文件比 `dist/client/index.html` 新；
 *   ② `dist/client/index.html` 里 <meta name="app-version"> 盖的版本与 `android/version.properties`
 *      的 `versionName` 不一致 —— ②是"重复 bump"的连带后果：`package:apk` 自己会再 bump 一次，
 *      于是包里的 Android 版本是 2.0.34、HTML 里盖的还是上一次构建的 2.0.33（装上看不出来）。
 *
 * 用法：node scripts/ensure-web-build.mjs   （package:apk / package:desktop 前置）
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_INDEX = join(ROOT, 'dist/client/index.html');
const SRC_DIRS = ['src', 'functions', 'electron', 'server', 'index.html', 'vite.config.ts', 'public'];
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '.html', '.json']);

function versionFromProps() {
  try {
    const txt = readFileSync(join(ROOT, 'android/version.properties'), 'utf8');
    const m = /versionName=(.+)/.exec(txt);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

/**
 * dist/client/index.html 里盖的版本号（构建期 fixHtmlPlaceholders 注入的 meta）。
 *
 * 早先的写法是扫入口 chunk 里的 x.y.z 裸字面量 —— 版本恰被反馈上报的 appVersion 字段
 * 带进包里，才顺藤摸到。反馈功能 2026-10-05 整体下架后那条来源没了，改为构建期
 * 把版本盖进 HTML meta：判据从"猜包里有没有字面量"变成"读一处我们自己的标记"。
 * 读不到（旧管线产物 / 注入缺失 / 占位符没替换）返回空串 —— 视为需要重建；
 * 重建后仍读不到会拦下打包，宁可拦住也不装出一只版本无法核对的包。
 */
function versionInDist() {
  try {
    const html = readFileSync(DIST_INDEX, 'utf8');
    return (/<meta[^>]*name="app-version"[^>]*content="([^"]+)"/.exec(html)?.[1] || '').trim();
  } catch { return ''; }
}

function staleReasons() {
  const reasons = [];
  if (!existsSync(DIST_INDEX)) { reasons.push('没有 dist/client'); return reasons; }
  const distMtime = statSync(DIST_INDEX).mtimeMs;
  let files = null;
  try {
    files = execFileSync('git', ['ls-files', '-z', '--', ...SRC_DIRS], { cwd: ROOT, encoding: 'utf8' })
      .split('\0').filter(Boolean).filter((f) => CODE_EXT.has(extname(f)));
  } catch { /* git 不可用 → 只靠版本号那条判据 */ }
  let newest = null; let newestAt = 0;
  for (const rel of files || []) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue;
    const t = statSync(abs).mtimeMs;
    if (t > newestAt) { newestAt = t; newest = rel; }
  }
  if (newest && newestAt > distMtime) {
    reasons.push(`源码比产物新（最新：${newest}）`);
  }
  const want = versionFromProps();
  const found = versionInDist();
  if (want && !found) {
    reasons.push('产物里没有 app-version 标记（旧管线产物或构建期注入缺失）');
  } else if (want && found !== want) {
    reasons.push(`产物内版本是 ${found}，version.properties 已是 ${want}`);
  }
  return reasons;
}

const reasons = staleReasons();
if (!reasons.length) {
  console.log(`✓ dist/client 与源码及版本号一致（${versionFromProps() || '版本未注入'}）`);
  process.exit(0);
}
console.log(`↻ dist/client 需要重建：${reasons.join('；')} —— 自动跑 build:web`);
execSync('npm run build:web', { cwd: ROOT, stdio: 'inherit' });
const after = staleReasons();
if (after.length) {
  console.error(`✗ 重建后仍然不一致：${after.join('；')}`);
  process.exit(1);
}
console.log('✓ 重建完成，产物与源码/版本号一致');
