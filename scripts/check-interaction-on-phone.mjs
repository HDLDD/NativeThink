#!/usr/bin/env node
/**
 * check-interaction-on-phone.mjs —— 按压词汇在**真机 / 模拟器 WebView** 上的凭据。
 *
 * 为什么非要有这条通道（2026-10-20 实测出来的）：
 *   ① `dispatchEvent(new PointerEvent(...))` 是合成事件，不产生浏览器激活；
 *   ② 更关键 —— 在这台 Android WebView 上**连 CDP 设备级真触摸也不进 `:active`**：
 *      pointerdown 带着 pointerType:"touch" 到了元素、涟漪也建了节点，
 *      但按下期间整页 `document.querySelectorAll(':active').length` 恒为 0。
 *   所以缩放不能只靠 `:active`，press-fx 改在 pointerdown 上挂 `data-pressing`；
 *   本脚本因此既量**机制**（属性挂上/收回）也量**结果**（computed scale 真的降了），
 *   而且按坐标 `elementFromPoint().closest('[data-press]')` 取宿主 —— 不按索引，
 *   免得点一下把侧栏/卡片列表改动后，第 N 个元素已经换成了别的东西（第一版就这么假红过）。
 *
 * 前置：App 在前台且停在有参与者的界面（背单词练习面最好，那里是 strong 档；
 *       浏览/配置面的裸按钮走的是批 2 的默认可点层 —— 要专门量它就 `--tier default`
 *       （只挑 `data-press` 为空的元素，否则挑到的永远是基座那批显式接线的）；
 *       转发已建：真机 `adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>`
 *                 / 模拟器 `node scripts/phone-emu.mjs cdp`（9226）。
 * 用法：node scripts/check-interaction-on-phone.mjs [--port 9223] [--tier strong] [--nth 6]
 */
const argv = process.argv.slice(2);
/** 缺省时 `argv[indexOf+1]` 会拿到别的参数（不传 --index 就变成 Number('--port')=NaN），必须正经解析 */
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const PORT = flag('port', '9223');
const TIER = flag('tier', 'strong');
const NTH = Number(flag('nth', '6'));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && /localhost/.test(t.url));
if (!page) { console.error(`✗ 端口 ${PORT} 上没有 App 的 WebView target（转发建了吗？App 在前台吗？）`); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('CDP 连不上')); });
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  /** CDP 的返回层次是 `{id, result:{result:{value}, exceptionDetails?}}` —— 少剥一层就拿到 undefined */
  if (r.error || r.result?.exceptionDetails) throw new Error(JSON.stringify(r.error || r.result.exceptionDetails));
  return r.result.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 读不到就报红，别抛异常把后面几条一起带走（NO_TARGET、正在导航都会给出非 JSON） */
const J = (x) => { try { return JSON.parse(String(x)); } catch { return { err: String(x).slice(0, 60) }; } };
const results = [];
const ok = (c, n, d = '') => { results.push(c); console.log(`${c ? '✓' : '✗'} ${n}${d ? `  — ${String(d).slice(0, 170)}` : ''}`); };

await send('Runtime.enable');

/** 参与者口径与 index.css 的默认层、press-fx 的 closest 同源（守卫 ⑪ 盯着这三处一致）：
 *  批 2 之后裸 `<button>` / `<a href>` / `[role=button]` 不写属性也参与，
 *  这里还按 `[data-press]` 数的话，这一层新覆盖的那一片在设备上全都量不到（覆盖假绿）。 */
const PSEL = 'button, a[href], [role="button"], [data-press]';

/** 按坐标取"按下时该被影响的那个参与者"，与页面结构变化无关 */
const READ = (x, y) => `(()=>{const el=document.elementFromPoint(${x},${y})?.closest?.(${JSON.stringify(PSEL)});
  if(!el)return JSON.stringify({e:'NO_HOST'})
  ;const r=el.getBoundingClientRect();const cs=getComputedStyle(el);
  return JSON.stringify({标签:(el.innerText||el.getAttribute('title')||el.tagName).replace(/\\s+/g,' ').trim().slice(0,16),
    宽:Math.round(r.width),高:Math.round(r.height),档位:el.getAttribute('data-press')||'soft',
    默认参与:!el.hasAttribute('data-press'),
    scale:cs.scale,按压态:el.hasAttribute('data-pressing'),active:el.matches(':active'),
    左:+r.left.toFixed(2),顶:+r.top.toFixed(2),布局左:el.offsetLeft,布局顶:el.offsetTop,
    涟漪:el.querySelectorAll('.fx-ripple').length,涟漪全站:document.querySelectorAll('.fx-ripple').length,
    toast:document.querySelectorAll('[data-sonner-toast]').length})})()`;
const read = async (x, y) => J(await ev(READ(x, y)));

/**
 * 挑目标：**"在屏幕上"不等于"点得到"** —— 新装状态的选词书向导会开一层 dialog-overlay 盖住整页，
 * 按下的是遮罩而不是按钮；页面上也常有 pointer-events:none 的图标壳。
 * 所以三重门：尺寸够、elementFromPoint 命中它或它的后代、自身与祖先链都不许 pointer-events:none。
 * 先要 --tier 那一档（练习面评分行是 strong，那是手感最需要成立的地方），拿不到再退到任意档。
 */
const pickJS = (tier) => `(()=>{const T=${JSON.stringify(tier)};const want=(T==='strong'||T==='soft'||T==='default')?T:null;
  const P=${JSON.stringify(PSEL)};
  const overlay=document.querySelector('[data-slot="dialog-overlay"][data-state="open"]');
  const 档=(el)=>el.getAttribute('data-press')||'soft';
  const els=[...document.querySelectorAll(P)].filter((e)=>e.getAttribute('data-press')!=='off');
  const fits=(el)=>{const r=el.getBoundingClientRect();if(r.width<28||r.height<20||r.top<0||r.bottom>innerHeight)return null;
    const x=Math.round(r.left+r.width/2),y=Math.round(r.top+r.height/2);
    let p=el;while(p){if(getComputedStyle(p).pointerEvents==='none')return null;p=p.parentElement}
    const hit=document.elementFromPoint(x,y);if(!hit)return null;
    if(overlay&&overlay.contains(hit))return null;
    if(!(hit===el||el.contains(hit)))return null;
    return {x,y};};
  for(const only of (want?[true,false]:[false])){
    for(const el of els){
      if(only&&档(el)!==want&&(want!=='default'||el.getAttribute('data-press')!==null))continue;
      const c=fits(el);if(!c)continue;
      return JSON.stringify({i:els.indexOf(el),n:els.length,tier:档(el),默认:el.getAttribute('data-press')===null,x:c.x,y:c.y});}}
  return JSON.stringify({err:'没有可点得到的参与者',n:els.length,
    挡着的:overlay?'dialog-overlay（先走完向导）':'无',
    这一档有几个:els.filter((e)=>(T==='default'?e.getAttribute('data-press')===null:档(e)===T)).length});})()`;

let a = null, AT = null;
for (const tier of (TIER === 'any' ? ['any'] : [TIER, 'any'])) {
  const p = J(await ev(pickJS(tier)));
  if (!p.err) { a = p; AT = tier; break; }
  if (tier === 'any') { console.log(`✗ 挑目标失败：${p.err}（${p.挡着的}；界面共 ${p.n} 个，${TIER} 档 ${p.这一档有几个} 个）`); ws.close(); process.exit(1); }
}
const want = a.tier === 'strong' ? 0.970 : 0.985;
ok(true, `⓪ 挑到一个真的点得到的目标：第 ${a.i} 个，档位 ${a.tier}${a.默认 ? '（默认可点，没写 data-press）' : '（显式接线）'}（界面共 ${a.n} 个参与者，${AT === 'any' ? '兜底到任意档' : '按 --tier ' + TIER + ' 挑'}）`);

/* ── 真触摸按下：CDP Input.dispatchTouchEvent 是设备级事件 ── */
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
/* 响应时延：按下到 computed scale 真的降下来，每 16ms 采一次，最多 400ms */
let first = -1;
for (let t = 0; t <= 400; t += 16) {
  const s = await read(a.x, a.y);
  if (Number(String(s.scale).replace(/[^0-9.]/g, '')) < 1) { first = t; break; }
  await sleep(16);
}
const b = await read(a.x, a.y);
ok(b.e === undefined, `① 目标在屏幕上：「${b.标签}」${b.宽}×${b.高} @${a.x},${a.y}`, b.e || '');
ok(b.按压态 === true, '② 真触摸按下时 press-fx 挂上了 data-pressing（缩放的新机制，实测这台 WebView 触摸下 :active 恒 false）', `:active=${b.active}`);
const sc = Number(String(b.scale).replace(/[^0-9.]/g, '')) || 1;
ok(sc < 1 && Math.abs(sc - want) < 0.02, `③ 按下去 computed scale 到了 ${sc}（档位 ${b.档位} 应对应 ${want}）`, `实测 "${b.scale}"`);
ok(first >= 0 && first <= 150, `④ 响应时延 ${first}ms（判据「按下去 ≤150ms 见到形变」）`);
ok(b.涟漪 >= 1 || b.涟漪全站 >= 1, `⑤ 涟漪在设备上建了节点（本元素 ${b.涟漪}，全站 ${b.涟漪全站}）`);
ok(b.toast === 0, '⑥ 按下过程中没有冒出 toast（练习界面零提示口径没被动画带破）');

/* 按住后把手指移到别处再抬手：属性必须收干净，否则留下一个"永久按着"的元素 */
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + 40, y: a.y + 60 }] });
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(300);
const c = await read(a.x, a.y);
ok(c.按压态 === false, `⑦ 移开再抬手后 data-pressing 收回（实测 ${c.按压态}）`);
await sleep(120);
const c2 = await read(a.x, a.y);
/**
 * "不缩"有**两种合法读数**：显式接线的宿主有基态 `scale: 1`，而默认可点那一层故意不给基态
 * （给了会顶掉宿主的 `hover:scale-*`，见 index.css 同处注释）→ 抬手后 computed 是初始值 `none`。
 * 所以判"收回"要看"是不是还在缩"（≥0.999），不是死盯字面量 1 —— 停在 0.985 照样红。
 */
const 收后 = ['', 'none'].includes(String(c2.scale).trim()) ? 1 : parseFloat(String(c2.scale));
ok(收后 >= 0.999, `⑧ 抬手后回到"不缩"那一态（实测 "${c2.scale}"）`, `换算 ${收后}`);
ok(c2.布局左 === b.布局左 && c2.布局顶 === b.布局顶,
  '⑨ 按下前后**布局盒**逐位不动（offsetLeft/offsetTop —— 缩放不占位，不会把下面的字幕/卡片推得跳一下）',
  `布局 Δ${c2.布局左 - b.布局左},${c2.布局顶 - b.布局顶}；视觉 rect Δ${(c2.左 - b.左).toFixed(2)}（含 scale，本来就该动）`);
ok(Math.abs((c2.左 - b.左)) <= (b.宽 * (1 - sc)) / 2 + 0.5,
  '⑨ 反向：视觉位移不超过"按档位缩放"应得的那点量（超过了就是真的重排了）', `宽 ${b.宽} × (1-${sc}) / 2 = ${((b.宽 * (1 - sc)) / 2).toFixed(2)}px`);

/* 连点：在飞涟漪有上限、宿主只建一个 */
for (let k = 0; k < NTH; k++) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x + k, y: a.y }] });
  await sleep(20);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(20);
}
await sleep(80);
const cap = J(await ev(`(()=>{const el=document.elementFromPoint(${a.x},${a.y})?.closest?.(${JSON.stringify(PSEL)});
  return JSON.stringify({在飞:el.querySelectorAll('.fx-ripple').length,宿主:el.querySelectorAll('.fx-ripple-host').length})})()`));
ok(cap.在飞 >= 1 && cap.在飞 <= 3 && cap.宿主 === 1, `⑩ 连点 ${NTH} 次：在飞 ${cap.在飞}（上限 3）且宿主只 ${cap.宿主} 个（复用不堆叠）`);
await sleep(600);
const d = await read(a.x, a.y);
ok(d.涟漪 === 0, `⑪ 涟漪播完自清（600ms 后本元素 ${d.涟漪} 个节点，不留在 DOM 里）`);

const fails = results.filter((x) => !x).length;
console.log(`\n按压词汇设备凭据 ${results.length - fails}/${results.length} 通过${fails ? '' : ' ✓'}（端口 ${PORT}，${a.tier} 档）`);
ws.close();
process.exit(fails ? 1 : 0);
