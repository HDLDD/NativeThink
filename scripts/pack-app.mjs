/**
 * NativeThink desktop packaging script (Windows).
 *
 * Builds the web app, then assembles a portable Electron app into
 * release/NativeThink-win32-x64/ — copying the Electron runtime, the app
 * bundle (dist + functions + server + electron main), and ONLY the production
 * dependency subtree needed by the local server (jose, undici, msedge-tts...).
 *
 * Usage: npm run app:build
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(root, 'release', 'NativeThink-win32-x64');
const APP = path.join(OUT, 'resources', 'app');
const APP_NAME = 'NativeThink';

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copy(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

/** Recursively collect the production dependency tree of the given entries */
function collectDeps(entries) {
  const resolved = new Set();
  const queue = [...entries];
  const readPkg = (pkgDir) => {
    try { return JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')); }
    catch { return null; }
  };
  while (queue.length > 0) {
    const name = queue.shift();
    if (resolved.has(name) || name.startsWith('@')) {
      // scoped packages: keep the scope dir when copying the parent — handled below
    }
    if (resolved.has(name)) continue;
    const pkgDir = path.join(root, 'node_modules', name);
    if (!fs.existsSync(pkgDir)) {
      console.warn(`[pack] missing dependency: ${name}`);
      continue;
    }
    resolved.add(name);
    const pkg = readPkg(pkgDir);
    const deps = Object.keys(pkg?.dependencies || {});
    for (const d of deps) queue.push(d);
  }
  return [...resolved];
}

console.log('[1/6] building web app...');
run('npm run build:web');

console.log('[2/6] preparing output directory...');
rmrf(OUT);
fs.mkdirSync(APP, { recursive: true });

console.log('[3/6] copying Electron runtime...');
copy(path.join(root, 'node_modules', 'electron', 'dist'), OUT);
fs.renameSync(path.join(OUT, 'electron.exe'), path.join(OUT, `${APP_NAME}.exe`));

console.log('[4/6] copying app bundle...');
fs.copyFileSync(path.join(root, 'package.json'), path.join(APP, 'package.json'));
if (fs.existsSync(path.join(root, 'icon.ico'))) {
  fs.copyFileSync(path.join(root, 'icon.ico'), path.join(APP, 'icon.ico'));
}
for (const dir of ['electron', 'server', 'functions']) {
  copy(path.join(root, dir), path.join(APP, dir));
}
copy(path.join(root, 'dist', 'client'), path.join(APP, 'dist', 'client'));

// 离线小模型（可选 — 存在时才打包，APK/桌面内置后零下载）
if (fs.existsSync(path.join(root, 'models-bundled'))) {
  console.log('[4.5/6] copying bundled offline model (~750MB)...');
  copy(path.join(root, 'models-bundled'), path.join(APP, 'models-bundled'));
}

console.log('[5/6] copying production dependencies...');
const entries = ['jose', 'undici', 'msedge-tts'];
const deps = collectDeps(entries);
for (const dep of deps) {
  copy(path.join(root, 'node_modules', dep), path.join(APP, 'node_modules', dep));
}
console.log(`       ${deps.length} packages: ${deps.join(', ')}`);

console.log('[6/6] done.');
console.log(`→ ${OUT}\\${APP_NAME}.exe`);
