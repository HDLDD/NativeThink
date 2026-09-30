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
 *   ② `dist/client` 里内嵌的 `__APP_VERSION__` 与 `android/version.properties` 的
 *      `versionName` 不一致 —— ②是"重复 bump"的连带后果：`package:apk` 自己会再 bump 一次，
 *      于是包里的 Android 版本是 2.0.34、App 内展示与反馈上报的版本还是上一次构建的 2.0.33。
 *
 * 用法：node scripts/ensure-web-build.mjs   （package:apk / package:desktop 前置）
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_INDEX = join(ROOT, 'dist/client/index.html');
const SRC_DIRS = ['src', 'functions', 'electron', 'server'];
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '.html', '.json']);

function versionFromProps() {
  try {
    const txt = readFileSync(join(ROOT, 'android/version.properties'), 'utf8');
    const m = /versionName=(.+)/.exec(txt);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

/**
 * dist 里内嵌的版本号集合。
 * 压缩后 `__APP_VERSION__` 变成裸字面量（实测形态是 `` appVersion:`2.0.34` ``，
 * 没有 `typeof __APP_VERSION__` 那段 —— define 已经把整个三元式折掉了），
 * 所以只能"扫出所有 x.y.z 字面量，看当前版本在不在里面"。
 * 扫不到（返回空数组）时判据退回不触发 —— 宁可漏报也不误伤发布流程。
 */
function versionsInDist() {
  try {
    const html = readFileSync(DIST_INDEX, 'utf8');
    const entry = /assets\/(index-[\w-]+\.js)/.exec(html)?.[1];
    if (!entry) return [];
    const js = readFileSync(join(ROOT, 'dist/client/assets', entry), 'utf8');
    return [...new Set([...js.matchAll(/[`'"](\d+\.\d+\.\d+)[`'"]/g)].map((m) => m[1]))];
  } catch { return []; }
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
  const found = versionsInDist();
  if (want && found.length && !found.includes(want)) {
    reasons.push(`产物内版本是 ${found.join('/')}，version.properties 已是 ${want}`);
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
