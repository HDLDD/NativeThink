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
/** 取 `--flag 值`：必须判 indexOf<0 —— 否则 `argv[-1+1]` 会把 argv[0]（如 `--base`）当成端口拿走（walk-phone 同款坑） */
const flag = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const PORT = flag('port', '9222');
const BASE = flag('base', 'http://127.0.0.1:8001');
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
/** 页面表达式**自己 return 一段 JSON 字符串**时要解两次：device-eval 打的是 JSON.stringify(值)，
 *  而"值"已经是字符串 —— 第一版在这三条上各中一次（量到的明明是绿数据，断言却拿字符串比属性）。 */
const JO = (expr) => { const v = ev(expr); if (v && typeof v === 'object') return v; try { return JSON.parse(String(v)); } catch { return { e: String(v).slice(0, 60) }; } };

/**
 * 一次按下，量五件事：pointerdown→下一帧的毫秒、涟漪是否建了节点、按压缩放有没有发生、
 * **布局盒**（offsetLeft/offsetTop）动没动（只缩放不占位）、以及 toast 有没有冒出来。
 * ⚠️ "不占位"必须看布局盒而不是 getBoundingClientRect —— 后者**含 scale**：
 *    实测 strong 档 115px 宽缩到 0.97 时视觉左边自己就动了 1.7px，用它判会假红；
 *    而真正要钉的是"会不会把下面的卡片推得跳一下"，那是布局问题，只有 offsetLeft/Top 说得清。
 */
const press = (sel) => String(ev(`(async()=>{
  const el=document.querySelector('${sel}'); if(!el) return 'NO_TARGET';
  const r0=el.getBoundingClientRect();
  if(r0.width<4||r0.top<0||r0.top>innerHeight-4) return 'OFF_SCREEN:'+JSON.stringify({top:Math.round(r0.top),h:Math.round(r0.height)});
  const x=r0.left+r0.width/2, y=r0.top+r0.height/2;
  const 布局0=[el.offsetLeft,el.offsetTop];
  // 采样期间监听真实的收尾事件：scale 量到 1 时要用它分辨"委托被 pointercancel 提前收了"还是"根本没挂上"
  const 收尾={up:0,cancel:0};
  const tap=(e)=>{收尾[e.type==='pointerup'?'up':'cancel']++;};
  document.addEventListener('pointerup',tap);document.addEventListener('pointercancel',tap);
  const t0=performance.now();
  el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:x,clientY:y,pointerType:'touch'}));
  const built=document.querySelectorAll('.fx-ripple').length;
  const 挂上了=el.hasAttribute('data-pressing');
  await new Promise(k=>requestAnimationFrame(()=>requestAnimationFrame(k)));
  const ms=performance.now()-t0;
  // 采样而不是单帧读数：紧接导航之后的头两帧里，转场可能还没拿到第一个 tick
  // （本机实测抖过一次 scale 读到 1 —— 那不是产品没缩，是我只取了一帧）。逐帧取最小值，量的仍是同一件事。
  let scale='';
  for(let f=0;f<6;f++){const s=getComputedStyle(el).scale||'';
    if(s&&(!scale||Number(s)<Number(scale)))scale=s;
    await new Promise(k=>requestAnimationFrame(k));}
  const 挂时=el.hasAttribute('data-pressing');
  const 布局稳=el.offsetLeft===布局0[0]&&el.offsetTop===布局0[1];
  const toasts=document.querySelectorAll('[data-sonner-toast]').length;
  el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:x,clientY:y,pointerType:'touch'}));
  await new Promise(k=>requestAnimationFrame(k));
  document.removeEventListener('pointerup',tap);document.removeEventListener('pointercancel',tap);
  return JSON.stringify({ms:+ms.toFixed(1),built,挂上了,scale,挂时,布局稳,收尾,
    还在页面上:document.contains(el),收回:!el.hasAttribute('data-pressing'),toasts});
})()`));

ev(`(()=>{location.href='${BASE}/vocabulary';return 'go';})()`);
sleep(3200);
ok(!has('页面出错'), '⓪ /vocabulary 打开没有「页面出错」');

/* ① 委托真的挂着：按一个基座按钮，涟漪建了节点、按压缩放确实发生 */
const a = JSON.parse(press('[data-press]') || '{}');
ok(a.built >= 1 && a.ms <= 100, `① pointerdown → 下一帧 ≤100ms 且涟漪建了节点`, JSON.stringify(a));
ok(a.挂上了 === true, '① 按下时委托挂上了 data-pressing（缩放不能只靠 :active —— 模拟器 APK 实测触摸下 :active 恒 false）', JSON.stringify(a));
ok(Number(a.scale) < 1 && Number(a.scale) > 0.9 && a.挂时 === true,
  '① 合成 pointerdown 也能量到缩放在发生（换成 JS 挂属性之前这条根本测不到）', `scale=${a.scale} 读时还挂着=${a.挂时}`);
ok(a.布局稳 === true, '① 按下前后**布局盒**不动（offsetLeft/offsetTop 逐位相等 = 只缩放不占位，不会把下面的卡片推得跳一下）', JSON.stringify(a));
ok(a.收回 === true, '① pointerup 后 data-pressing 收回（不收回就是一个永久按住的按钮）', JSON.stringify(a));
ok(a.toasts === 0, '① 按下不弹 toast（练习界面零提示口径没被动画带破）');

/* ② 涟漪播完自己摘掉，不留在 DOM 里 */
sleep(700);
const cleaned = String(ev(`(()=>document.querySelectorAll('.fx-ripple').length)()`));
ok(Number(cleaned) === 0, '② 涟漪播完自清（600ms 后节点数归 0，不无界堆积）', `当前 ${cleaned}`);

/* ③ 键盘触发不画涟漪也不挂按压态（没有触点坐标；Enter 的 :active 由浏览器自己决定） */
const kb = String(ev(`(async()=>{
  const el=document.querySelector('[data-press]');
  const before=document.querySelectorAll('.fx-ripple').length;
  el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:0,clientY:0,pointerType:'keyboard'}));
  await new Promise(k=>requestAnimationFrame(k));
  return JSON.stringify({before,after:document.querySelectorAll('.fx-ripple').length,挂:el.hasAttribute('data-pressing')});
})()`));
ok(/"after":0[,}]/.test(kb) && /"挂":false/.test(kb), '③ 键盘触发：一个涟漪都不画、也不挂 data-pressing', kb);

/* ④ reduce 偏好下委托层直接不建节点（不是靠 CSS 藏），缩放也被钉回 1 */
const rm = String(ev(`(async()=>{
  const real=window.matchMedia;
  window.matchMedia=(q)=>String(q).includes('prefers-reduced-motion')?{matches:true,addEventListener(){},removeListener(){}}:real(q);
  const el=document.querySelector('[data-press]');
  el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:20,clientY:20,pointerType:'touch'}));
  await new Promise(k=>requestAnimationFrame(k));
  const n=document.querySelectorAll('.fx-ripple').length;
  const scale=getComputedStyle(el).scale;
  el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch'}));
  window.matchMedia=real;
  return JSON.stringify({节点:n,scale});
})()`));
ok(/"节点":0/.test(rm), '④ reduce 下**不建节点**（藏而不建是两回事：藏的那版 DOM 里仍有残留）', rm);
ok(/"scale":"1"/.test(rm), '④ reduce 下新机制那条也 scale:1 !important 兜住了（否则挂了属性照样缩）', rm);

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

/* ⑦ 三面各自都有接线（运行时数一遍，不是只看源码）
   参与者口径 = 默认可点三种 + 显式 data-press，减去 off。批 2 翻默认之后，
   还按 [data-press] 数的话这一层新覆盖的裸按钮全都量不到（覆盖假绿）。 */
const DEF = 'button, a[href], [role="button"]';
const P = `${DEF}:not([data-press="off"]), [data-press]:not([data-press="off"])`;
const 参与者 = () => Number(ev(`(()=>document.querySelectorAll('${P}').length)()`));
for (const [route, min] of [['/vocabulary', 15], ['/chunks', 80], ['/video', 12]]) {
  ev(`(()=>{location.href='${BASE}${route}';return 'go';})()`);
  sleep(2800);
  const n = 参与者();
  ok(!has('页面出错') && n >= min, `⑦ ${route} 上有 ≥${min} 个走词汇的参与者（实测 ${n}）且没崩`);
}

/* ⑧ 默认可点层：裸 <button>（没写 data-press）也要有同一套手感 —— 这一条量的正是批 2 新覆盖的那一片 */
const bare = JO(`(async()=>{
  const els=[...document.querySelectorAll('button:not([data-press])')];
  const el=els.find((e)=>{const r=e.getBoundingClientRect();
    return r.width>=8&&r.height>=8&&r.top>=0&&r.bottom<=innerHeight
      &&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('button')===e;});
  if(!el) return JSON.stringify({e:'NO_BARE_BUTTON'});
  const 布局0=[el.offsetLeft,el.offsetTop];
  el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,
    clientX:el.getBoundingClientRect().left+4,clientY:el.getBoundingClientRect().top+4,pointerType:'touch'}));
  await new Promise(k=>requestAnimationFrame(()=>requestAnimationFrame(k)));
  const out={挂上了:el.hasAttribute('data-pressing'),scale:getComputedStyle(el).scale,
    涟漪:document.querySelectorAll('.fx-ripple').length,
    布局稳:el.offsetLeft===布局0[0]&&el.offsetTop===布局0[1]};
  el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch'}));
  await new Promise(k=>requestAnimationFrame(k));
  out.收回=!el.hasAttribute('data-pressing');
  return JSON.stringify(out);})()`);
ok(bare.挂上了 === true && Number(bare.scale) < 1 && Number(bare.scale) > 0.9,
  '⑧ 裸按钮（没写 data-press）按下也挂上按压态并缩到 soft 档', JSON.stringify(bare));
ok(bare.涟漪 >= 1 && bare.收回 === true && bare.布局稳 === true,
  '⑧ 裸按钮的涟漪照建、抬手收回、布局盒不动（默认可点不是"只缩不给涟漪"的半套词汇）', JSON.stringify(bare));
sleep(700);

/* ⑨ 三条边界都用**注入夹具**，不靠页面正好有没有这种元素（判据不许取决于运气）：
   · off 必须整块退出（不挂态、不画涟漪）
   · 静态定位的裸 button：`.fx-ripple-host` 是 absolute inset:0，宿主不补 relative 就会画到别人的框里
   · 行内 `<a>`：行内盒既不能被 scale 也不能当包含块，只能不画 */
const 夹具 = JO(`(async()=>{
  const box=document.createElement('div');
  const mk=(tag,txt)=>{const e=document.createElement(tag);e.textContent=txt;e.style.cssText='width:120px;height:36px';box.appendChild(e);return e;};
  const off=mk('button','例外口子'); off.setAttribute('data-press','off');
  const st=mk('button','静态宿主');
  const p=document.createElement('p'); p.textContent='正文里有一句 ';
  const il=document.createElement('a'); il.href='#probe'; il.textContent='行内链接';
  p.appendChild(il); p.appendChild(document.createTextNode(' 用来试。')); box.appendChild(p);
  document.body.appendChild(box);
  const 按下=async(el,x=10,y=10)=>{
    el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:x,clientY:y,pointerType:'touch'}));
    await new Promise(k=>requestAnimationFrame(()=>requestAnimationFrame(k)));};
  const 抬起=(el)=>el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch'}));
  await 按下(off);
  const 例外={挂:off.hasAttribute('data-pressing'),涟漪:off.querySelectorAll('.fx-ripple').length};
  抬起(off);
  const st原宽=st.getBoundingClientRect().width;
  await 按下(st);
  const host=st.querySelector(':scope > .fx-ripple-host');
  const a=st.getBoundingClientRect(), b=host&&host.getBoundingClientRect();
  const 静态={位置:getComputedStyle(st).position,有宿主:!!host,真缩了:a.width<st原宽-0.2,
    重合:!!b&&Math.abs(a.left-b.left)<1&&Math.abs(a.top-b.top)<1&&Math.abs(a.width-b.width)<1};
  抬起(st);
  await new Promise(k=>requestAnimationFrame(k));
  const il原宽=il.getBoundingClientRect().width;
  const before=document.querySelectorAll('.fx-ripple-host').length;
  await 按下(il,2,2);
  const 行内={显示:getComputedStyle(il).display,新增宿主:document.querySelectorAll('.fx-ripple-host').length-before,
    计算值:getComputedStyle(il).scale,在画:il.getBoundingClientRect().width<il原宽-0.2,原宽:+il原宽.toFixed(2),按下宽:+il.getBoundingClientRect().width.toFixed(2)};
  抬起(il);
  box.remove();
  return JSON.stringify({例外,静态,行内});})()`);
ok(夹具.例外 && 夹具.例外.挂 === false && 夹具.例外.涟漪 === 0,
  '⑨ data-press="off" 整块退出词汇（默认层的例外口子真的有效）', JSON.stringify(夹具&&夹具.例外));
ok(夹具.静态 && 夹具.静态.位置 === 'relative' && 夹具.静态.有宿主 && 夹具.静态.重合 === true && 夹具.静态.真缩了 === true,
  '⑩ 静态定位的裸按钮：委托层把它补成 relative，涟漪层与按钮盒逐位重合（不补就是画在某个祖先的框里）；按下时 rect 真的在缩',
  JSON.stringify(夹具&&夹具.静态));
ok(夹具.行内 && 夹具.行内.显示 === 'inline' && 夹具.行内.新增宿主 === 0 && 夹具.行内.在画 === false,
  '⑩ 行内链接：一个涟漪宿主都不建，且**Computed scale 写着 0.985 但画面没动**（非替换行内盒不可 transform —— ' +
  '所以正文里的 <a> 天然不参与，不必逐条写 off；只认 rect 读数，不认 CSS 直觉）', JSON.stringify(夹具&&夹具.行内));
sleep(700);

/* ⑪ 入场/转场这一档**运行时**确认曲线真的解析出来了：静态守卫只能证明写了 var(--fx-ease)，
   token 名被改错时 computed 会退回 `ease`/`linear`，而源码看起来仍然"同源"。 */
const 入场 = JO(`(()=>{const pe=document.querySelector('.page-enter');
  const g=(e)=>{if(!e)return null;const c=getComputedStyle(e);
    return {曲线:c.animationTimingFunction,名:c.animationName,时长:c.animationDuration};};
  return JSON.stringify({路由:g(pe)});})()`);
ok(入场.路由 && /cubic-bezier\(0\.22, 1, 0\.36, 1\)/.test(入场.路由.曲线) && 入场.路由.名 === 'page-enter',
  '⑪ 路由级入场：var(--fx-ease) 在运行时解析成全站那条曲线，动画名对得上（token 名写错这里就红）', JSON.stringify(入场.路由));
/* 卡片入场必须到**有 .stagger 的那一屏**去量（在 /video 上量会得到 null，那就是空判断） */
ev(`(()=>{location.href='${BASE}/';return 'go';})()`);
sleep(2800);
const 卡片 = JO(`(()=>{const st=document.querySelector('.stagger');const kid=st&&st.firstElementChild;
  if(!kid)return JSON.stringify({e:'这一屏没有 .stagger 的第一个子元素'});
  const c=getComputedStyle(kid);
  return JSON.stringify({曲线:c.animationTimingFunction,名:c.animationName,时长:c.animationDuration,
    宿主类:String(st.className).slice(0,28)});})()`);
ok(/cubic-bezier\(0\.22, 1, 0\.36, 1\)/.test(String(卡片.曲线)) && 卡片.名 === 'card-enter',
  '⑪ 卡片逐张入场与路由入场同一条曲线、同一个动画名（首页 QuickStartGrid 那一屏实测）', JSON.stringify(卡片));

const fails = results.filter((x) => !x).length;
console.log(`\n交互层走查 ${results.length - fails}/${results.length} 通过${fails ? '' : ' ✓'}`);
process.exit(fails ? 1 : 0);
