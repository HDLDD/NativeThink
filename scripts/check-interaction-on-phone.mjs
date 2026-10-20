#!/usr/bin/env node
/**
 * check-interaction-on-phone.mjs —— 按压词汇在**真机 WebView** 上的凭据。
 *
 * 为什么电脑侧走查不够：`dispatchEvent(new PointerEvent(...))` 是合成事件，不会产生浏览器
 * 的"用户激活"，所以 `:active` 那档缩放**根本不会生效** —— 电脑侧只能量到涟漪与不占位，
 * 量不到"按下去真的缩了"。这里走 CDP `Input.dispatchTouchEvent`，是设备级的真触摸。
 *
 * 前置：App 已启动、`adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>`，
 *       页面停在有 `[data-press]` 的界面（背单词 / 语块 / 视频精听任选）。
 * 用法：node scripts/check-interaction-on-phone.mjs [--port 9223] [--index 0]
 */
const argv = process.argv.slice(2);
const PORT = argv[argv.indexOf('--port') + 1] || '9223';
const INDEX = Number(argv[argv.indexOf('--index') + 1] || '0');

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && /localhost/.test(t.url));
if (!page) { console.error('✗ 没找到 App 的 WebView target（转发建了吗？App 在前台吗？）'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.error || r.result?.exceptionDetails) throw new Error(JSON.stringify(r.error || r.result.exceptionDetails));
  return r.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (c, n, d = '') => { results.push(c); console.log(`${c ? '✓' : '✗'} ${n}${d ? `  — ${String(d).slice(0, 160)}` : ''}`); };

await send('Runtime.enable');
const read = (sel) => ev(`(()=>{const el=document.querySelectorAll('${sel}')[${INDEX}];if(!el)return 'NO_TARGET';
  const r=el.getBoundingClientRect();const cs=getComputedStyle(el);
  return JSON.stringify({标签:(el.innerText||el.getAttribute('title')||el.tagName).replace(/\\s+/g,' ').trim().slice(0,12),
    x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),w:Math.round(r.width),h:Math.round(r.height),
    左:r.left,顶:r.top,宽:r.width,高:r.height,
    scale:cs.scale||'',涟漪:document.querySelectorAll('.fx-ripple').length,
    toast:document.querySelectorAll('[data-sonner-toast]').length,
    档位:el.getAttribute('data-press'),css缩放值:cs.getPropertyValue('--fx-press-soft')+'/'+cs.getPropertyValue('--fx-press-strong')});})()`);

const sel = '[data-press]';
const before = JSON.parse(String(await ev(`(()=>{const n=document.querySelectorAll('${sel}').length;return JSON.stringify({可点数:n})})()`)));
ok(before.可点数 > INDEX, `⓪ 这个界面上有走词汇的可点元素（共 ${before.可点数} 个，取第 ${INDEX} 个）`);
const a = JSON.parse(await read(sel));
ok(a !== 'NO_TARGET' && a.w > 4 && a.y > 0 && a.y < 1600, `① 目标在屏幕上：「${a.标签}」${a.w}×${a.h} @${a.x},${a.y}（档位 ${a.档位}）`);
ok(Number(a.scale) === 1 || a.scale === '', `② 按下前 scale 是 1（实测 "${a.scale}"）`);

/* 真触摸按下：CDP Input.dispatchTouchEvent 会产生浏览器激活，:active 才成立 */
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
await sleep(90);
const b = JSON.parse(await read(sel));
const sc = Number(String(b.scale).replace(/[^0-9.]/g, '')) || 1;
ok(sc < 1 && sc > 0.9, `③ 真触摸按下时 scale 真的变了（实测 ${sc}，档位 ${b.档位} 应对应 ${b.档位 === 'strong' ? '0.970' : '0.985'}）`, `css 变量 ${b.css缩放值}`);
ok(b.涟漪 >= 1, `④ 涟漪在真机上建了节点（${b.涟漪} 个）`);
ok(Math.abs(b.左 - a.左) < 0.5 && Math.abs(b.顶 - a.顶) < 0.5 && Math.abs(b.高 - a.高) < 0.5,
  '⑤ 按下前后 rect 不动（缩放不占位，不会把下面的字幕/卡片推得跳一下）', `位移 ${((b.左 - a.左).toFixed(2))}/${((b.顶 - a.顶).toFixed(2))}`);
ok(b.toast === 0, '⑥ 按下过程中没有冒出 toast');
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(260);
const c = JSON.parse(await read(sel));
ok(Number(String(c.scale).replace(/[^0-9.]/g, '')) === 1 || c.scale === '', `⑦ 抬手后回到 1（实测 "${c.scale}"）`);
await sleep(600);
const d = JSON.parse(await read(sel));
ok(d.涟漪 === 0, `⑧ 涟漪播完在真机上自清（600ms 后 ${d.涟漪} 个节点）`);

const fails = results.filter((x) => !x).length;
console.log(`\n真机按压词汇 ${results.length - fails}/${results.length} 通过${fails ? '' : ' ✓'}`);
ws.close();
process.exit(fails ? 1 : 0);
