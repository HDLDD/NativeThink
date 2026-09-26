#!/usr/bin/env node
/**
 * device-eval.mjs — 真机 WebView 调试小工具（走 adb forward 的 CDP 通道）。
 *
 * 前置：
 *   adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>
 *   （socket 名用 adb shell cat /proc/net/unix | grep webview_devtools_remote 查）
 *
 * 为什么存在：无线 adb（TLS）在这台 ROM 上没有 INJECT_EVENTS，`input tap` 会被拒；
 * 但 CDP 在 WebView 进程内，不受限制 —— 截图 / 求值 / 点击全走这里。
 * 坐标一律给**物理像素**（与 adb screencap 截图同量纲），内部按 innerWidth 自动折算。
 *
 * 用法：
 *   node scripts/device-eval.mjs eval  "document.title"
 *   node scripts/device-eval.mjs tap   400 1630
 *   node scripts/device-eval.mjs shot  .screen.png
 *   node scripts/device-eval.mjs back
 * 环境变量 CDP_PORT 默认 9223。
 */
import { writeFileSync } from 'node:fs';

const PORT = process.env.CDP_PORT || '9223';
const [, , cmd, ...args] = process.argv;

const pages = await (await fetch(`http://localhost:${PORT}/json`)).json();
const page = pages.find((p) => p.type === 'page');
if (!page) { console.error('no page target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  const timer = setTimeout(() => {
    pending.delete(id);
    reject(new Error(`CDP ${method} 超时（页面可能在后台被冻结，把 App 调到前台再试）`));
  }, 6000);
  pending.set(id, (m) => {
    clearTimeout(timer);
    resolve(m);
  });
  ws.send(JSON.stringify({ id, method, params }));
});

/** 物理像素 → CSS 像素折算系数 */
async function scale() {
  const r = await send('Runtime.evaluate', {
    expression: 'JSON.stringify({ iw: window.innerWidth, ih: window.innerHeight, ow: window.outerWidth })',
    returnByValue: true,
  });
  const { iw } = JSON.parse(r.result?.result?.value || '{}');
  return iw ? iw / 1280 : 1; // 截图宽 1280（物理）
}

if (cmd === 'eval') {
  const r = await send('Runtime.evaluate', { expression: args[0], returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(r.result?.result?.value ?? r.result, null, 1));
} else if (cmd === 'tap') {
  const [px, py] = args.map(Number);
  const k = await scale();
  const x = Math.round(px * k), y = Math.round(py * k);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
  console.log(`tapped css=(${x},${y})`);
} else if (cmd === 'shot') {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(args[0], Buffer.from(r.result.data, 'base64'));
  console.log(`saved ${args[0]}`);
} else if (cmd === 'back') {
  await send('Runtime.evaluate', { expression: 'history.back()' });
  console.log('history.back()');
} else {
  console.error('usage: device-eval.mjs eval|tap|shot|back ...');
  process.exit(1);
}
ws.close();
process.exit(0);
