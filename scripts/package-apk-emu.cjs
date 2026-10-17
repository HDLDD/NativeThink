#!/usr/bin/env node
/**
 * package-apk-emu.cjs — 电脑侧 x86_64 模拟器安装包（与发布 APK 完全分线）
 *
 * 为什么要它：手机的装机验证此前只能等 d0e47380 插上 USB，而"只在 APK 成立"的那类缺陷
 * （原生 TTS 插件桥、抽屉导航不关、textZoom 120%、safe-area 内缩）在网页版复现不出来。
 * AVD 是 x86_64，而发布 APK 的 abiFilters 只有 arm 两档（见 android/app/build.gradle 注释）
 * —— 直接把发布产物丢进模拟器要么装不上要么离线朗读崩，所以给模拟器单独出一条构建线。
 *
 * 与发布线的三处不同（都刻意的）：
 *  ① **不自增版本号**（不烧 versionCode，release 版本线仍由 package:apk 走）；
 *  ② NT_EMU=1 让 gradle 只打 x86_64（sherpa-onnx AAR 里 jni/x86_64/*.so 确实在，离线引擎不残）；
 *  ③ 产物落 release/NativeThink-emu-x86_64.apk，**绝不覆盖** NativeThink-mobile-debug.apk。
 *
 * 收尾必做产物自证（AGENTS 那条"缺资产会静默出残包"同源）：从 APK 自己的 zip 中央目录
 * 读条目名，确认 lib/x86_64/libsherpa-onnx-jni.so 与 www 资源都在、arm 目录不在。
 * 用法：npm run package:apk:emu
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const run = (cmd, args, opts = {}) => {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd: opts.cwd || ROOT, stdio: 'inherit', env: { ...process.env, ...(opts.env || {}) } });
};
const node = (script, opts) => run(process.execPath, [script], opts);

const OUT = path.join(ROOT, 'release', 'NativeThink-emu-x86_64.apk');
const GRADLE_APK = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

node('scripts/ensure-web-build.mjs');
run('node', [path.join(ROOT, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor'), 'copy', 'android']);
node('scripts/android-copy-models.cjs');
run('cmd', ['/c', 'gradlew.bat', 'assembleDebug'], { cwd: path.join(ROOT, 'android'), env: { NT_EMU: '1' } });

if (!fs.existsSync(GRADLE_APK)) { console.error('✗ gradle 没产 APK：' + GRADLE_APK); process.exit(1); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.copyFileSync(GRADLE_APK, OUT);

/* ── 产物自证：只读 zip 中央目录的条目名（不解压、不依赖外部工具） ── */
function zipEntryNames(file) {
  const buf = fs.readFileSync(file);
  // 从尾部找 EOCD（PK\x05\x06），拿到中央目录起点与条数
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是 zip（找不到中央目录结尾）');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('中央目录条目解析失败 @' + off);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    names.push(buf.toString('utf8', off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

const names = zipEntryNames(OUT);
const has = (re) => names.filter((n) => re.test(n));
const checks = [
  ['x86_64 的离线朗读原生库', /lib\/x86_64\/libsherpa-onnx-jni\.so$/, 1],
  ['WebView 入口（www 资源）', /assets\/public\/index\.html$/, 1],
  ['词库与离线朗读模型随包（缺了就静默残包）', /assets\/(public\/books\/|piper\/|tts\/)/, 1],
];
let bad = 0;
for (const [label, re, min] of checks) {
  const hit = has(re);
  const ok = hit.length >= min;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${label}：${hit.length} 条${hit.length ? `（例 ${hit[0]}）` : ''}`);
}
const arm = has(/lib\/armeabi-v7a\/|lib\/arm64-v8a\//);
console.log(`${arm.length === 0 ? '✓' : '✗'} 没有混进 arm 架构（模拟器装不上还白胖 42MB）：${arm.length} 条`);
if (arm.length > 0) bad++;
const size = fs.statSync(OUT).size;
console.log(`\n产物：${path.relative(ROOT, OUT)}（${(size / 2 ** 20).toFixed(1)} MB）`);
if (bad) { console.error('✗ 产物自证没通过，别拿这个包装模拟器'); process.exit(1); }
console.log('下一步：node scripts/phone-emu.mjs install && node scripts/phone-emu.mjs cdp');
