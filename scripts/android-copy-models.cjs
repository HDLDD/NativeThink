// 把离线小模型拷入安卓 assets（cap copy 会清空 assets/public，必须在每次 cap copy 之后调用）
// 用法: node scripts/android-copy-models.cjs
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'models-bundled');
const dest = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'public', 'models');

if (!fs.existsSync(src)) {
  console.log('[android-copy-models] models-bundled/ 不存在 — 跳过（APK 将不含离线模型）');
  process.exit(0);
}
if (!fs.existsSync(path.join(root, 'android', 'app', 'src', 'main', 'assets'))) {
  console.log('[android-copy-models] 尚未执行 cap copy — 跳过');
  process.exit(0);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
const size = (function dirSize(d) {
  let n = 0;
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    n += fs.statSync(p).isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return n;
})(dest);
console.log(`[android-copy-models] 已拷贝离线模型 → assets/public/models (${Math.round(size / 1024 / 1024)}MB)`);
