#!/usr/bin/env node
/**
 * walk-interaction-fx.mjs —— 交互反馈层的**运行时**走查（无头 Chrome + CDP）。
 *
 * 为什么要有它：静态守卫只能证明"接线在源码里"，而判据①「响应快且不掉帧」和三条边界
 * （涟漪会自清、键盘不画、reduce 不建节点）只有在真浏览器里按下一次才看得见。
 * 毫秒数**只在这条路上量**，不进静态守卫 —— 第 44 测④那条教训：判据落在毫秒上会自己抖。
 *
 * 前置：`npm run build:web` + `node scripts/serve.cjs 8001` + 一个带 --remote-debugging-port 的 Chrome。
 * 用法：node scripts/walk-interaction-fx.mjs [--port 9222] [--base http://127.0.0.1:8001]
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const PORT = argv[argv.indexOf('--port') + 1] || '9222';
const BASE = argv[argv.indexOf('--base') + 1] || 'http://127.0.0.1:8001';
const DEV = path.join(ROOT, 'scripts', 'device-eval.mjs');
const ev = (expr) => {
  const out = execFileSync(process.execPath, [DEV, 'eval', expr], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, CDP_PORT: PORT }, timeout: 60000,
  }).trim();
  try { return JSON.parse(out); } catch { return out; }
};
const sleep = (ms) => execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`], { cwd: ROOT });
const results = [];
const ok = (c, n, d = '') => { results.push(c); console.log(`${c ? '✓' : '✗'} ${n}${d ? `  — ${String(d).slice(0, 150)}` : ''}`); };
const has = (t) => String(ev(`(()=>((document.body.innerText||'').replace(/\\s+/g,'').includes(${JSON.stringify(t)}))||'')()`)) === 'true';

/**
 * 一次按下，量四件事：pointerdown→下一帧的毫秒、涟漪是否建了节点、
 * 按下前后 rect 是否**逐位相等**（只缩放不占位）、以及 toast 有没有冒出来。
 */
const press = (sel) => String(ev(`(async()=>{
  const el=document.querySelector('${sel}'); if(!el) return 'NO_TARGET';
  const r0=el.getBoundingClientRect();
  if(r0.width<4||r0.top<0||r0.top>innerHeight-4) return 'OFF_SCREEN:'+JSON.stringify({top:Math.round(r0.top),h:Math.round(r0.height)});
  const x=r0.left+r0.width/2, y=r0.top+r0.height/2;
  const t0=performance.now();
  el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:x,clientY:y,pointerType:'touch'}));
  const built=document.querySelectorAll('.fx-ripple').length;
  const scale=getComputedStyle(el).scale||'';
  await new Promise(k=>requestAnimationFrame(()=>requestAnimationFrame(k)));
  const ms=performance.now()-t0;
  const r1=el.getBoundingClientRect();
  const toasts=document.querySelectorAll('[data-sonner-toast]').length;
  return JSON.stringify({ms:+ms.toFixed(1),built,scale,rect稳:r0.left===r1.left&&r0.top===r1.top&&r0.width===r1.width&&r0.height===r1.height,toasts});
})()`));

ev(`(()=>{location.href='${BASE}/vocabulary';return 'go';})()`);
sleep(3200);
ok(!has('页面出错'), '⓪ /vocabulary 打开没有「页面出错」');

/* ① 委托真的挂着：按一个基座按钮，涟漪建了节点 */
const a = JSON.parse(press('[data-press]') || '{}');
ok(a.built >= 1 && a.ms <= 100, `① pointerdown → 下一帧 ≤100ms 且涟漪建了节点`, JSON.stringify(a));
ok(a.rect稳 === true, '① 按下前后 rect 逐位相等（缩放走独立 scale，不占位、不推挤布局）', JSON.stringify(a));
ok(a.toasts === 0, '① 按下不弹 toast（练习界面零提示口径没被动画带破）');

/* ② 涟漪播完自己摘掉，不留在 DOM 里 */
sleep(700);
const cleaned = String(ev(`(()=>document.querySelectorAll('.fx-ripple').length)()`));
ok(Number(cleaned) === 0, '② 涟漪播完自清（600ms 后节点数归 0，不无界堆积）', `当前 ${cleaned}`);

/* ③ 键盘触发不画涟漪（没有触点坐标），但缩放仍在 */
const kb = String(ev(`(async()=>{
  const el=document.querySelector('[data-press]');
  const before=document.querySelectorAll('.fx-ripple').length;
  el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:0,clientY:0,pointerType:'keyboard'}));
  await new Promise(k=>requestAnimationFrame(k));
  return JSON.stringify({before,after:document.querySelectorAll('.fx-ripple').length});
})()`));
ok(/"after":0/.test(kb) || /"after":0[,}]/.test(kb), '③ 键盘触发一个涟漪都不画', kb);

/* ④ reduce 偏好下委托层直接不建节点（不是靠 CSS 藏） */
const rm = String(ev(`(async()=>{
  const real=window.matchMedia;
  window.matchMedia=(q)=>String(q).includes('prefers-reduced-motion')?{matches:true,addEventListener(){},removeListener(){}}:real(q);
  const el=document.querySelector('[data-press]');
  el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:20,clientY:20,pointerType:'touch'}));
  await new Promise(k=>requestAnimationFrame(k));
  const n=document.querySelectorAll('.fx-ripple').length;
  window.matchMedia=real;
  return JSON.stringify({节点:n});
})()`));
ok(/"节点":0/.test(rm), '④ reduce 下**不建节点**（藏而不建是两回事：藏的那版 DOM 里仍有残留）', rm);

/* ⑤ 同一元素连点 6 次，在飞涟漪有上限 */
const cap = String(ev(`(async()=>{
  const el=document.querySelector('[data-press]');
  for(let i=0;i<6;i++){ el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:10+i,clientY:10,pointerType:'touch'})); }
  await new Promise(k=>requestAnimationFrame(k));
  return JSON.stringify({在飞:el.querySelectorAll('.fx-ripple').length,宿主:el.querySelectorAll('.fx-ripple-host').length});
})()`));
ok(/"在飞":[1-3],/.test(cap) && /"宿主":1/.test(cap), '⑤ 连点 6 次：在飞 ≤3 且宿主只建一个（复用，不堆叠）', cap);
sleep(700);

/* ⑥ 奖励层：全站唯一一块 canvas，且不拦点击 */
const cel = String(ev(`(()=>{const cs=[...document.querySelectorAll('canvas')];
  const s=cs[0]&&getComputedStyle(cs[0]);
  return JSON.stringify({块数:cs.length,pe:s&&s.pointerEvents,pos:s&&s.position});})()`));
ok(/"块数":1/.test(cel) && /"pe":"none"/.test(cel), '⑥ 奖励层已挂载：全页只有一块 canvas 且 pointer-events:none', cel);

/* ⑦ 三面各自都有接线（运行时数一遍，不是只看源码） */
for (const [route, min] of [['/vocabulary', 1], ['/chunks', 1], ['/video', 1]]) {
  ev(`(()=>{location.href='${BASE}${route}';return 'go';})()`);
  sleep(2800);
  const n = Number(ev(`(()=>document.querySelectorAll('[data-press]').length)()`));
  ok(!has('页面出错') && n >= min, `⑦ ${route} 上有 ≥${min} 个走词汇的可点元素（实测 ${n}）且没崩`);}

const fails = results.filter((x) => !x).length;
console.log(`\n交互层走查 ${results.length - fails}/${results.length} 通过${fails ? '' : ' ✓'}`);
process.exit(fails ? 1 : 0);
