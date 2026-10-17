#!/usr/bin/env node
/**
 * phone-emu.mjs — 电脑侧安卓模拟器（AVD）一键驱动：把"装机验证"从手机上解绑
 *
 * 为什么：d0e47380 是用户的主力机（真实学习数据，走查只能只读），而且它经常不在手上；
 * 同时有一类缺陷**只在 APK 里成立**（Capacitor 原生桥、系统语音插件永久挂死那种、
 * 抽屉导航不关、textZoom 120%、safe-area 内缩），网页版与 headless Chrome 复现不出来。
 * 模拟器既是真 Android + 真 WebView + 真原生桥，又是一次性 profile —— 可以随便写夹具。
 *
 * 覆盖边界（要诚实）：
 *  ✓ 原生桥 / WebView 行为 / 装机后能不能打开某页 / 存储持久化 / 布局几何（本 AVD 凑 CSS 393）
 *  ✗ 机型特有：厂商 ROM 的 INJECT_EVENTS 限制、厂商 WebView 版本与 textZoom 倍数、
 *     物理状态栏 inset、厂商后台查杀 —— 这些仍然只能真机
 *
 * AVD 数据盘默认 **D:\AndroidAvd**（不写 C 盘；userdata 会长到几 GB）。
 * 本机 SDK 没装 cmdline-tools（无 avdmanager），所以 AVD 由本脚本手写 config.ini 生成。
 *
 * 用法：
 *   node scripts/phone-emu.mjs check                  # 体检：加速/镜像/AVD/产物/adb
 *   node scripts/phone-emu.mjs avd [--force]          # 建 AVD（1080x2340@440dpi → CSS≈393）
 *   node scripts/phone-emu.mjs start [--window]       # 起模拟器（默认无窗口）
 *   node scripts/phone-emu.mjs wait [--timeout 240]
 *   node scripts/phone-emu.mjs install [apk]          # 默认 release/NativeThink-emu-x86_64.apk
 *   node scripts/phone-emu.mjs launch                 # 打开 App
 *   node scripts/phone-emu.mjs cdp [--port 9226]      # 按 WebView pid 建 CDP 转发
 *   node scripts/phone-emu.mjs smoke                  # 几何 + 原生桥在位的凭据
 *   node scripts/phone-emu.mjs stop                   # 关模拟器 + 清端口转发
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SDK = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME
  || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const ADB = path.join(SDK, 'platform-tools', 'adb.exe');
const EMU = path.join(SDK, 'emulator', 'emulator.exe');
const AEHD = path.join(SDK, 'extras', 'google', 'Android_Emulator_Hypervisor_Driver', 'silent_install.bat');
const AVD_HOME = process.env.ANDROID_AVD_HOME || 'D:/AndroidAvd';
const AVD_NAME = 'nativethink-emu';
const PKG = 'com.nativethink.app';
const EMU_APK = path.join(ROOT, 'release', 'NativeThink-emu-x86_64.apk');
const IMG_DIR = path.join(SDK, 'system-images', 'android-34', 'google_apis', 'x86_64');

const argv = process.argv.slice(2);
const verb = argv[0] || 'check';
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i === -1 || i + 1 >= argv.length ? dflt : argv[i + 1];
};
const env = { ...process.env, ANDROID_SDK_ROOT: SDK, ANDROID_HOME: SDK, ANDROID_AVD_HOME: AVD_HOME };
// stderr 一律吞掉：adb 的 "device offline / not found"、taskkill 的 GBK "未找到任务" 都是噪音，
// 真失败由下面的 die()/状态行说清楚（保留 stdout 给 install 这类需要回显的地方）。
const sh = (file, args, opt = {}) => execFileSync(file, args, { encoding: 'utf8', env, maxBuffer: 64e6, stdio: ['ignore', 'pipe', 'ignore'], ...opt });
const die = (msg) => { console.error('✗ ' + msg); process.exit(1); };
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const readLastLines = (file, n) => {
  try { return readFileSync(file, 'utf8').replace(/\r/g, '').split('\n').filter(Boolean).slice(-n).join('\n'); }
  catch { return '(日志还读不到)'; }
};
/**
 * 进程在不在。⚠️ Windows 上 `emulator.exe` 只是启动器，真正的虚拟机是
 * `qemu-system-x86_64-headless.exe`：只杀 emulator.exe 会留下孤儿 VM 继续占着 5554/5555 控制台端口，
 * 于是 `adb devices` 永远挂一个假的 `emulator-5554 offline`（实测卡了两次，都以为是模拟器没起来）。
 * 所以"活着"的判据必须两个镜像名都看。
 */
const EMU_IMAGES = ['emulator.exe', 'qemu-system-x86_64-headless.exe', 'qemu-system-x86_64.exe'];
const emulatorAlive = () => {
  try { return /emulator\.exe|qemu-system-x86_64/i.test(sh('tasklist', ['/FO', 'CSV', '/NH'])); }
  catch { return false; }
};
const serial = () => `emulator-${flag('console', '5554')}`;
/**
 * 所有对设备的 adb 调用一律带超时：设备处于 `offline`（TCG 起不来、或刚强杀留下僵尸条目）时
 * `adb shell getprop` 会**无限期挂住**，把整个脚本钉死在这里（实测两次，都是我去 tail 日志才发现）。
 * 挂住不是"慢"，是必须报错让上一层的 try/catch 变成可见状态。
 */
const adb = (...args) => {
  const opts = args.length && typeof args[args.length - 1] === 'object' ? args.pop() : {};
  return sh(ADB, ['-s', serial(), ...args.map(String)], { timeout: 20000, ...opts });
};

const AVD_INI = path.join(AVD_HOME, `${AVD_NAME}.ini`);
const AVD_DIR = path.join(AVD_HOME, `${AVD_NAME}.avd`);
const AVD_CFG = path.join(AVD_DIR, 'config.ini');

/* CSS 宽度 = 1080 / (440/160) = 392.7 ≈ 真机实测的 393（AGENTS 那条"别用 428 估算"同源） */
const CONFIG = [
  `AvdId=${AVD_NAME}`,
  'avd.ini.displayname=NativeThink 手机仿真 (393 CSS)',
  'avd.ini.encoding=UTF-8',
  'abi.type=x86_64',
  'hw.cpu.arch=x86_64',
  'image.sysdir.1=system-images/android-34/google_apis/x86_64/',
  'tag.id=google_apis',
  'tag.display=Google APIs',
  'target=android-34',
  'hw.cpu.ncore=4',
  'hw.ramSize=4096',
  'disk.dataPartition.size=8000M',
  'hw.gpu.enabled=yes',
  'hw.gpu.mode=auto',
  'hw.lcd.width=1080',
  'hw.lcd.height=2340',
  'hw.lcd.density=440',
  'hw.keyboard=yes',
  'hw.audioInput=yes',
  'hw.audioOutput=yes',
  'hw.battery=yes',
  'hw.accelerometer=yes',
  'hw.gps=yes',
  'hw.sdCard=no',
  'hw.camera.back=none',
  'hw.camera.front=none',
  'showDeviceProfileNames=no',
  '',
].join('\n');

switch (verb) {

case 'check': {
  const line = (label, ok, detail) => console.log(`${ok ? '✓' : '✗'} ${label.padEnd(9)} ${detail}`);
  line('SDK', existsSync(SDK), SDK);
  line('adb', existsSync(ADB), ADB);
  line('emulator', existsSync(EMU), EMU);
  line('系统镜像', existsSync(path.join(IMG_DIR, 'system.img')),
    existsSync(path.join(IMG_DIR, 'system.img')) ? IMG_DIR : `${IMG_DIR}（缺 system.img —— 从 dl.google.com 下 x86_64-34_r14.zip 解进来）`);
  line('AVD', existsSync(AVD_CFG), existsSync(AVD_CFG) ? AVD_CFG : `未建（node scripts/phone-emu.mjs avd）`);
  line('模拟器包', existsSync(EMU_APK), existsSync(EMU_APK) ? EMU_APK : `未打（npm run package:apk:emu）`);
  console.log(`  数据盘   ANDROID_AVD_HOME=${AVD_HOME}`);
  let accel = '';
  try { accel = sh(EMU, ['-accel-check']).replace(/\r/g, ''); } catch (e) { accel = String(e.stdout || e.message); }
  const needDriver = !/is installed and usable|hardware acceleration is/i.test(accel);
  console.log(`${needDriver ? '✗' : '✓'} 加速      ${accel.trim().split('\n').filter(Boolean).join(' / ')}`);
  if (needDriver) console.log(`  ↳ 管理员运行一次： "${AEHD}"\n     （本机 BIOS 虚拟化已开、Hyper-V 未运行 → 装 AEHD 即可）`);
  try {
    const dev = sh(ADB, ['devices']).replace(/\r/g, '').split('\n').slice(1).filter(Boolean);
    console.log(`  设备     ${dev.length ? dev.join(' | ') : '(无 —— start)'}`);
  } catch { console.log('  设备     adb server 还没起'); }
  process.exit(0);
}

case 'avd': {
  if (existsSync(AVD_CFG) && !argv.includes('--force')) die(`AVD 已存在：${AVD_CFG}（要重建加 --force）`);
  if (!existsSync(path.join(IMG_DIR, 'system.img'))) die(`镜像不在 ${IMG_DIR}`);
  mkdirSync(AVD_DIR, { recursive: true });
  writeFileSync(AVD_INI, `avd.ini.encoding=UTF-8\npath=${AVD_DIR.replace(/\\/g, '/')}\npath.rel=avd/${AVD_NAME}.avd\ntarget=android-34\n`, 'utf8');
  writeFileSync(AVD_CFG, CONFIG, 'utf8');
  console.log(`✓ AVD 已建：${AVD_NAME}（1080x2340 @440dpi → CSS 392.7，data 8G，RAM 4G）\n  ${AVD_INI}\n  ${AVD_CFG}`);
  process.exit(0);
}

case 'start': {
  if (!existsSync(AVD_CFG)) die('先跑 node scripts/phone-emu.mjs avd');
  if (emulatorAlive()) { console.log('模拟器已在跑（tasklist 里能看到 emulator.exe）；接着 wait / install'); process.exit(0); }
  const logFile = path.join(AVD_HOME, 'emulator.log');
  const args = ['-avd', AVD_NAME, '-no-boot-anim', '-no-snapshot-save', '-gpu', 'auto',
    '-cores', '4', '-memory', '4096'];
  if (!argv.includes('--window')) args.push('-no-window');
  // --tcg：没装 AEHD/WHPX 时的软件模拟兜底（boot 慢到十几分钟，但能把 install/cdp/smoke 这条链先跑通）
  if (argv.includes('--tcg')) args.push('-accel', 'off');
  /**
   * 启动方式踩了两次坑，定型为"写 .bat + cmd /c start"：
   *  ① node spawn(detached) —— 父 node 一退出，Git Bash 把整个进程树连模拟器一起杀掉（日志停在 kernel cmdline，无 ERROR）；
   *  ② powershell Start-Process -PassThru —— 分离成功的子进程**继承了我们的 stdout 句柄**，
   *     execFileSync 等 stdout EOF，于是启动命令自己挂死（模拟器其实活着）。
   * cmd 的 start 会新建进程并立刻返回，日志由 bat 内部重定向，不占我们的句柄。
   */
  const bat = path.join(AVD_HOME, 'start-emu.bat');
  writeFileSync(bat, [
    '@echo off',
    `set ANDROID_SDK_ROOT=${SDK}`,
    `set ANDROID_HOME=${SDK}`,
    `set ANDROID_AVD_HOME=${AVD_HOME}`,
    `"${EMU}" ${args.join(' ')} >> "${logFile}" 2>&1`,
    '',
  ].join('\r\n'), 'utf8');
  sh('cmd', ['/c', 'start', 'NativeThink-EMU', '/MIN', '"C:\\Windows\\System32\\cmd.exe"', '/c', `"${bat}"`]);
  sleep(6000);
  if (!emulatorAlive()) { console.log(readLastLines(logFile, 14)); die('模拟器 6 秒内就退出了（上面是日志尾巴）'); }
  console.log(`✓ 模拟器在跑${argv.includes('--tcg') ? '（--tcg 软件模拟：boot 可能要十几分钟）' : ''}；日志 ${logFile}`);
  console.log('  接着：node scripts/phone-emu.mjs wait' + (argv.includes('--tcg') ? ' --timeout 1500' : ''));
  process.exit(0);
}

case 'wait': {
  const timeoutMs = Number(flag('timeout', 240)) * 1000;
  // wait-for-device 只是省一次轮询的便利，超时不能把脚本炸掉（execFileSync 超时抛 ETIMEDOUT）
  try { sh(ADB, ['-s', serial(), 'wait-for-device'], { timeout: Math.min(timeoutMs, 120000) }); }
  catch { console.log('  （wait-for-device 还没等到设备上线，继续轮询 boot_completed…）'); }
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    let out = '';
    try { out = adb('shell', 'getprop', 'sys.boot_completed').trim(); } catch { /* 还没起 / device offline */ }
    if (out === '1') {
      console.log(`✓ 启动完成（${((Date.now() - t0) / 1000).toFixed(0)}s）· ${serial()}`);
      console.log('  接着：node scripts/phone-emu.mjs install && node scripts/phone-emu.mjs launch');
      process.exit(0);
    }
    sleep(3000);
  }
  let dev = '';
  try { dev = sh(ADB, ['devices']).replace(/\r/g, '').trim().split('\n').slice(1).filter(Boolean).join(' / '); } catch { /* ignore */ }
  die(`等 sys.boot_completed 超时（设备当前状态：${dev || '(adb 里看不见)'}）。常见两种原因：`
    + '\n  ① 没装 AEHD/WHPX 又用 --tcg 软模拟 —— 本机实测 x86_64 TCG 会长时间停在 device offline，别指望它，装驱动；'
    + '\n  ② -no-window + GPU 模式不兼容 → 用 start --window 看真正的报错窗口');
}

case 'install': {
  const apk = argv[1] && !argv[1].startsWith('--') ? path.resolve(ROOT, argv[1]) : EMU_APK;
  if (!existsSync(apk)) die(`没有 ${apk} —— 先 npm run package:apk:emu`);
  console.log(`装 ${path.basename(apk)} → ${serial()}（几百 MB，慢的话看得到进度条）`);
  // 装机包 ~796MB，20s 上限会把它掐死 —— 这类长操作单独放宽
  console.log(adb('install', '-r', '-t', '-g', apk, { timeout: Number(flag('install-timeout', 900)) * 1000 }).replace(/\r/g, '').trim());
  process.exit(0);
}

case 'launch': {
  console.log(adb('shell', 'am', 'start', '-n', `${PKG}/${PKG}.MainActivity`).replace(/\r/g, '').trim());
  process.exit(0);
}

case 'cdp': case 'smoke': {
  const port = flag('port', '9226');
  // verification.md §3 第 5 条：adb shell 用 ['cat','/proc/net/unix'] 这种"多实参数组"形式会挂住
  // （0 字节输出）→ 这里整条命令当一个字符串传，并带超时。
  let unix = '';
  try { unix = adb('shell', 'cat /proc/net/unix'); }
  catch { die('读 /proc/net/unix 失败（模拟器没在跑？先 start / wait）'); }
  const m = unix.match(/webview_devtools_remote_(\d+)/);
  if (!m) die('没有 webview_devtools_remote_* —— App 没在前台？跑 launch（调试包才会开 WebView 调试）');
  sh(ADB, ['forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${m[1]}`]);
  console.log(`✓ CDP 转发 tcp:${port} → webview_devtools_remote_${m[1]}`);
  if (verb === 'smoke') {
    const probe = '(function(){var cs=getComputedStyle(document.documentElement);return JSON.stringify({title:document.title,path:location.pathname,cssW:window.innerWidth,cssH:window.innerHeight,dpr:window.devicePixelRatio,zoom:cs.webkitTextSizeAdjust,sherpaPlugin:!!(window.Capacitor&&window.Capacitor.plugins&&window.Capacitor.plugins.SherpaTts),ua:navigator.userAgent.slice(0,54)});})()';
    console.log(sh(process.execPath, [path.join(ROOT, 'scripts', 'device-eval.mjs'), 'eval', probe], { env: { ...env, CDP_PORT: port } }).trim());
    console.log('   期望：cssW≈393、dpr 2.75、sherpaPlugin:true（原生桥在位，才谈得上验插件类缺陷）');
  }
  console.log(`   走查：CDP_PORT=${port} node scripts/device-eval.mjs eval "<表达式>"  /  shot .screen-emu.png`);
  process.exit(0);
}

case 'stop': {
  const wasAlive = emulatorAlive();
  let killedBy = '';
  try { const r = adb('emu', 'kill').replace(/\r/g, '').trim(); if (r) console.log('  ' + r); killedBy = 'adb emu kill'; }
  catch { /* 设备 offline 时 emu kill 会失败，下面兜底 */ }
  sleep(3000);
  if (emulatorAlive()) {
    // adb 那条路走不通（设备 offline）或只杀掉启动器 —— 两个镜像名都要收，否则孤儿 VM 占着控制台端口
    for (const img of EMU_IMAGES) {
      try { sh('taskkill', ['/IM', img, '/F']); killedBy += (killedBy ? ' +' : '') + `taskkill ${img}`; }
      catch { /* 该镜像本来就没有 */ }
    }
    sleep(1500);
  }
  try { sh(ADB, ['forward', '--remove-all']); } catch { /* ignore */ }
  // 端口已经放掉但 adb 还认那个假设备时，重启 adb server 才能清掉幻影条目
  if (!emulatorAlive()) {
    const listed = (() => { try { return sh(ADB, ['devices']).replace(/\r/g, ''); } catch { return ''; } })();
    if (/emulator-\d+\s+offline/.test(listed)) {
      try { sh(ADB, ['kill-server']); sh(ADB, ['devices']); console.log('  （adb 里那条 offline 幻影已随 kill-server 清掉）'); } catch { /* ignore */ }
    }
  }
  const still = emulatorAlive();
  console.log(`${still ? '✗ 还活着' : '✓ 已关闭'}${wasAlive ? '' : '（本来就没在跑）'}${still ? '' : ` · 途径：${killedBy || '无需'}`}${still ? ' · 手动收：taskkill /IM qemu-system-x86_64-headless.exe /F' : ' · 端口转发已清'}`);
  process.exit(still ? 1 : 0);
}

case 'status': {
  const devices = sh(ADB, ['devices']).replace(/\r/g, '').split('\n').slice(1).filter(Boolean);
  console.log(`emulator.exe 进程：${emulatorAlive() ? '在' : '不在'}`);
  console.log(`adb 设备：${devices.length ? devices.join(' | ') : '(无)'}`);
  let boot = '';
  try { boot = adb('shell', 'getprop', 'sys.boot_completed').trim(); } catch { boot = ''; }
  if (!devices.length) console.log('sys.boot_completed：—（没有设备，先 start）');
  else console.log(`sys.boot_completed：${boot || '(取不到)'}${boot === '1' ? ' ✓ 可以 install / launch 了' : '（还在起来；超过十几分钟没动静基本就是没驱动 / TCG 走不通）'}`);
  process.exit(0);
}

default:
  console.log('未知子命令：' + verb + '（check/avd/start/wait/install/launch/cdp/smoke/stop/status）');
  process.exit(2);
}
