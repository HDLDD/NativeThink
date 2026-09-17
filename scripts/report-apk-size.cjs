#!/usr/bin/env node
/**
 * 报告 APK 内各部分的实际占用（压缩后）。
 * 用法: node scripts/report-apk-size.cjs [apk路径]
 *
 * 为什么需要：`unzip -l` 报的是**未压缩**大小，而 APK 是压缩容器 ——
 * 用文件系统上的源目录体积估算包体积会明显偏高（本项目实测：Kokoro 资产
 * 磁盘上 166MB，包内只占 126MB）。要判断真实涨幅只能用这里的方式算。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const file = process.argv[2] || path.join(ROOT, 'release', 'NativeThink-mobile-debug.apk');

if (!fs.existsSync(file)) {
  console.error(`找不到 APK: ${file}`);
  console.error('先跑 npm run package:apk');
  process.exit(1);
}

const buf = fs.readFileSync(file);

// 定位 End of Central Directory
let eocd = -1;
for (let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
  if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) {
  console.error('不是有效的 ZIP/APK（找不到中央目录结尾记录）');
  process.exit(1);
}

const count = buf.readUInt16LE(eocd + 10);
let off = buf.readUInt32LE(eocd + 16);

const buckets = {};
let totalRaw = 0;
let totalComp = 0;

for (let i = 0; i < count; i++) {
  if (buf.readUInt32LE(off) !== 0x02014b50) {
    console.error(`中央目录第 ${i} 条签名不符 @${off}，结果可能不完整`);
    break;
  }
  const compSize = buf.readUInt32LE(off + 20);
  const rawSize = buf.readUInt32LE(off + 24);
  const nameLen = buf.readUInt16LE(off + 28);
  const extraLen = buf.readUInt16LE(off + 30);
  const cmtLen = buf.readUInt16LE(off + 32);
  const name = buf.toString('utf8', off + 46, off + 46 + nameLen);

  let key;
  if (name.startsWith('assets/public/models')) key = 'assets/public/models（离线小模型）';
  else if (name.startsWith('assets/public/')) key = 'assets/public/其它（web 构建产物）';
  else if (name.startsWith('assets/piper/')) key = 'assets/piper/（Piper 音色）';
  else if (name.startsWith('assets/tts/')) key = 'assets/tts/（Kokoro 多音色模型）';
  else if (name.startsWith('lib/')) key = 'lib/（原生库）';
  else if (name.startsWith('assets/')) key = 'assets/其它';
  else key = '其它（dex/res/META-INF）';

  const b = buckets[key] || (buckets[key] = { raw: 0, comp: 0, n: 0 });
  b.raw += rawSize;
  b.comp += compSize;
  b.n++;
  totalRaw += rawSize;
  totalComp += compSize;

  off += 46 + nameLen + extraLen + cmtLen;
}

const MB = (n) => (n / 1048576).toFixed(1) + 'MB';
console.log(`\n${path.relative(ROOT, file)}`);
console.log('  目录                                  条目     未压缩      包内占用');
console.log('  ' + '─'.repeat(70));
for (const [k, v] of Object.entries(buckets).sort((a, b) => b[1].comp - a[1].comp)) {
  console.log(`  ${k.padEnd(36)} ${String(v.n).padStart(5)} ${MB(v.raw).padStart(10)} ${MB(v.comp).padStart(12)}`);
}
console.log('  ' + '─'.repeat(70));
console.log(`  ${'合计'.padEnd(36)} ${String(count).padStart(5)} ${MB(totalRaw).padStart(10)} ${MB(totalComp).padStart(12)}`);
console.log(`\n  磁盘上 APK 实际大小: ${MB(buf.length)}`);
