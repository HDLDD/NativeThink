/**
 * cdp-set-files.mjs —— 通过 CDP 把**设备上的文件**塞进网页的 `<input type=file>`，
 * 绕过系统文件选择器（SAF）。为什么需要它：这台 ROM 对 adb shell 拒 INJECT_EVENTS，
 * `input tap` 打不动系统 picker，所以"装机后验证导入这条路径"只剩 CDP 一条路。
 *
 * 注意：paths 是**浏览器进程看到的绝对路径**（对 APK 就是安卓侧路径），
 * 常用可读写位置是 App 自己的外部文件目录：/sdcard/Android/data/<包名>/files/…
 * （adb push 到 /sdcard/Download 再让 App 读，在 Android 13+ 的分区存储下会被拒）。
 *
 * 用法：node scripts/cdp-set-files.mjs --port 9223 --selector 'input[accept^=".srt"]' \
 *          --path /sdcard/Android/data/com.nativethink.app/files/video-lab/x.srt
 * 多个文件重复 --path；--wait 给页面处理时间（毫秒）。
 */
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = arg('port', '9223');
const SELECTOR = arg('selector', '');
const HOST = arg('host', 'localhost');
const paths = [];
for (let i = 0; i < argv.length; i++) if (argv[i] === '--path' && argv[i + 1]) paths.push(argv[++i]);
if (!SELECTOR || !paths.length) { console.log('缺 --selector 或 --path'); process.exit(1); }

const pages = await (await fetch(`http://${HOST}:${PORT}/json`)).json();
const page = pages.find((p) => (p.title || '').includes('NativeThink')) || pages.find((p) => p.type === 'page');
if (!page) { console.log('没有可用的 page target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) rej(new Error(m.error.message)); else res(m.result);
  }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws 连不上')); });

const { root } = await send('DOM.getDocument', { depth: -1 });
const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: SELECTOR });
if (!nodeId) { console.log(`没找到 ${SELECTOR}（页面是不是在 /video 的导入屏？）`); process.exit(1); }
await send('DOM.setFileInputFiles', { nodeId, files: paths });
console.log(`已把 ${paths.length} 个文件塞进 ${SELECTOR}`);
const wait = Number(arg('wait', 0));
if (wait) await new Promise((r) => setTimeout(r, wait));
ws.close();
