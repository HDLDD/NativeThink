// 每次打 APK 前自增 versionCode（Android 只接受递增版本号的升级安装）
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const file = path.resolve(__dirname, '..', 'android', 'version.properties');
let code = 1;
let name = '1.0.0';
if (fs.existsSync(file)) {
  const m = fs.readFileSync(file, 'utf8').match(/versionCode=(\d+)/);
  const n = fs.readFileSync(file, 'utf8').match(/versionName=([\w.]+)/);
  if (m) code = parseInt(m[1], 10);
  if (n) name = n[1];
}
code += 1;
// 版本名按 1.<code>.0 递增，便于识别
const [major] = name.split('.');
const nextName = `${major}.${code}.0`;
fs.writeFileSync(file, `versionCode=${code}\nversionName=${nextName}\n`);
console.log(`[android-version] versionCode=${code} versionName=${nextName}`);
try { execSync('git rev-parse --short HEAD', { stdio: 'ignore' }); } catch { /* ignore */ }
