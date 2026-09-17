// 把离线小模型拷入安卓 assets（cap copy 会清空 assets/public，必须在每次 cap copy 之后调用）
// 用法: node scripts/android-copy-models.cjs
//
// 用硬链接而非真拷贝：模型有 880MB，全量复制要几十秒，硬链接是瞬间完成且不占额外空间
// （模型内容不可变，不存在两边不一致的问题；不支持硬链接时自动退回真拷贝）。
const fs = require('fs');
const path = require('path');
const { copyTree } = require('./lib/link-copy.cjs');

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

copyTree(src, dest, { fresh: true, label: '离线模型 → assets/public/models' });
