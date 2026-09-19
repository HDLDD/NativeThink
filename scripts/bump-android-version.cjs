// 每次打 APK 前自增 versionCode（Android 只接受递增版本号的升级安装，否则要求先卸载 → 丢数据）。
//
// versionName 采用 major.minor.patch，**patch 每次构建 +1**（2.0.0 → 2.0.1 → …）。
// 要切到新的 minor / major（如 2.1.0、3.0.0），直接手改 android/version.properties 的
// versionName；本脚本会沿用你写的 major.minor，并继续递增 patch。
const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'android', 'version.properties');
let code = 1;
let name = '2.0.0';
if (fs.existsSync(file)) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/versionCode=(\d+)/);
  const n = raw.match(/versionName=([\w.]+)/);
  if (m) code = parseInt(m[1], 10);
  if (n) name = n[1];
}
code += 1;

const parts = name.split('.');
while (parts.length < 3) parts.push('0');
const patch = parseInt(parts[2], 10);
const nextName = `${parts[0]}.${parts[1]}.${Number.isFinite(patch) ? patch + 1 : 1}`;

fs.writeFileSync(file, `versionCode=${code}\nversionName=${nextName}\n`);
console.log(`[android-version] versionCode=${code} versionName=${nextName}`);
