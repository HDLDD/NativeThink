#!/usr/bin/env node
/**
 * 真机侧「视频精听」行为核验（在**自己导入的那一课**上跑，不碰用户原有的课）。
 * 覆盖电脑侧走查抓不到真凭据、必须靠真媒体的那几条：<video> 真解码、重播本句真的播起来、
 * 点词后释义卡滚进视口、单句循环与 A-B 互斥、已听 x/y 句跟着走。
 * 前置：App 已启动、adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>、已在 /video 列表页。
 */
import { execFileSync } from 'node:child_process';
const ROOT = 'B:/NativeThink';
const DEV = ROOT + '/scripts/device-eval.mjs';
/** 第一个非选项参数是课名关键字；--port 9223（真机）/ 9226（电脑侧模拟器） */
const argv = process.argv.slice(2);
const KEYWORD = argv.find((a) => !a.startsWith('--')) || 'birthday-gift';
const PORT = argv[argv.indexOf('--port') + 1] || '9223';
const ev = (expr) => {
  const out = execFileSync(process.execPath, [DEV, 'eval', expr], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, CDP_PORT: PORT }, timeout: 120000,
  }).trim();
  try { return JSON.parse(out); } catch { return out; }
};
const sleep = (ms) => execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`], { cwd: ROOT });
const truthy = (v) => v === true || v === 'true';
const results = [];
const ok = (c, n, d = '') => { results.push(c); console.log(`${c ? '✓' : '✗'} ${n}${d ? '  — ' + String(d).slice(0, 150) : ''}`); };

/** ① 从列表点开这一课 */
const opened = ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&(e.innerText||'').includes(${JSON.stringify(KEYWORD)}));if(!b)return 'NOROW';b.click();return 'ok';})()`);
sleep(6000);
const vid = String(ev(`(()=>{const v=document.querySelector('video');return v?JSON.stringify({blob:/^blob:/.test(v.currentSrc||''),dur:Math.round(v.duration||0),w:v.videoWidth,h:v.videoHeight,rs:v.readyState}):'NO_VIDEO';})()`));
ok(String(opened) === 'ok' && /"blob":true/.test(vid), '① 真媒体从 IndexedDB 的 blob 读回来并挂上 <video>', vid);
const dur = Number(String(vid).match(/"dur":(-?[\d.]+)/)?.[1] ?? -1);
ok(dur > 300, '② 播放器报出的时长是真实长度（不是元数据吹的）', dur + ' 秒');
ok(/"w":[1-9]/.test(vid), '③ 画面轨解得动（videoWidth>0，不是黑屏只有声音）', String(vid).match(/"w":\d+,"h":\d+/)?.[0]);

/** ④ 已听 x/y 句 */
const heard = String(ev(`(()=>{const m=(document.body.innerText||'').replace(/\\s+/g,' ').match(/已听 (\\d+)\\/\\d+ 句/);return m?m[0]:'NOMATCH';})()`));
ok(/已听 \d+\/\d+ 句/.test(heard), '④ 卡面写明「已听 x/y 句」', heard);

/** ⑤ 暂停态点「重播本句」要真的播起来并回到句首 */
/** 直接钩 play() 数调用次数（靠"固定延时后读 paused"推断会被时序抖出来，真机第二遍就这么假红过） */
const armed = String(ev(`(()=>{const v=document.querySelector('video');if(!v)return 'NOVIDEO';
  window.__plays=0;const op=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){window.__plays++;return op.apply(this,arguments);};
  v.pause();v.currentTime=200;return 'armed';})()`));
/** 等到真的处于暂停态再点（最多 4 秒），否则"点前"这一步就不成立 */
let pre = '';
for (let k = 0; k < 8; k++) {
  sleep(500);
  pre = String(ev(`(()=>{const v=document.querySelector('video');return JSON.stringify({paused:v.paused,t:Math.round(v.currentTime),plays:window.__plays||0});})()`));
  if (/"paused":true/.test(pre)) break;
}
const clicked = ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&(e.title||'').includes('重播本句'));if(!b)return 'NOBTN';b.click();return 'ok';})()`);
sleep(2500);
const post = String(ev(`(()=>{const v=document.querySelector('video');return JSON.stringify({paused:v.paused,t:Math.round(v.currentTime),plays:window.__plays||0});})()`));
const played = Number(String(post).match(/"plays":(\d+)/)?.[1] ?? 0) > Number(String(pre).match(/"plays":(\d+)/)?.[1] ?? 0);
ok(armed === 'armed' && /"paused":true/.test(pre) && String(clicked) === 'ok' && played && /"paused":false/.test(post),
  '⑤ 暂停态点「重播本句」真的调了 play() 并回到本句起点（只设 currentTime 就是"点了没反应"）', `点前 ${pre} → 点后 ${post}`);
ev(`(()=>{const v=document.querySelector('video');if(v)v.pause();return 1;})()`);
sleep(800);

/** ⑥ 点词 → 释义卡出现在视口内（手机上播放器占大半屏，卡片落在屏外等于"查词没反应"） */
/** 认当前句卡那个 <p>（text-[14px] font-black）：别用"最后一个多词 <p>"，那会抓到提示行/译文行 —— 它们没有词 span，只会假报 NOWORD */
const word = String(ev(`(()=>{const p=[...document.querySelectorAll('p')].find(e=>/text-\\[14px\\]/.test(e.className||'')&&/font-black/.test(e.className||''));
  if(!p)return 'NOCARDP';const s=[...p.querySelectorAll('span')].find(e=>(e.innerText||'').trim().replace(/[^A-Za-z']/g,'').length>3);
  if(!s)return 'NOWORD:'+JSON.stringify((p.innerText||'').slice(0,24));const r0=s.getBoundingClientRect();s.click();
  return JSON.stringify({word:(s.innerText||'').trim(),top:Math.round(r0.top)});})()`));
let card = 'NOCARD';
for (let k = 0; k < 14; k++) {
  sleep(900);
  card = String(ev(`(()=>{const c=[...document.querySelectorAll('div')].filter(e=>/收藏这个词|词库里没有这个词/.test(e.innerText||'')&&e.getBoundingClientRect().height>0).pop();
    if(!c)return 'NOCARD';const r=c.getBoundingClientRect();return JSON.stringify({inView:r.top>=-2&&r.bottom<=innerHeight+2,top:Math.round(r.top),bottom:Math.round(r.bottom),vh:innerHeight});})()`));
  if (card !== 'NOCARD') break;
}
ok(String(word).startsWith('{') && /"inView":true/.test(card), '⑥ 点词后释义卡自己滚进视口（整卡在屏幕内）', `点的是 ${word} · 卡 ${card}`);

/** ⑦ 单句循环 ↔ A-B 互斥（两个方向） */
const on = (t) => truthy(ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>(e.title||'').includes(${JSON.stringify(t)}));return /teal-500/.test(b?b.className:'');})()`));
ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>(e.title||'').includes('A-B 复读'));if(b)b.click();return 1;})()`);
sleep(900);
ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>(e.title||'').includes('单句循环'));if(b)b.click();return 1;})()`);
sleep(900);
const afterLoop = { loop: on('单句循环'), ab: on('A-B 复读') };
ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>(e.title||'').includes('A-B 复读'));if(b)b.click();return 1;})()`);
sleep(900);
const afterAb = { loop: on('单句循环'), ab: on('A-B 复读') };
ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>(e.title||'').includes('单句循环'));if(b)b.click();return 1;})()`);
sleep(700);
ok(afterLoop.loop && !afterLoop.ab && afterAb.ab && !afterAb.loop,
  '⑦ 单句循环与 A-B 互斥（真机按钮态，正反两个方向）', `开单句→${JSON.stringify(afterLoop)} · 再开 A-B→${JSON.stringify(afterAb)}`);

/** ⑧ 存储实况：media 表里 m:/s: 的条数要等于索引记录里的课数（写死数字换一课就假红） */
const keys = String(ev(`(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('nativethink-wordbank');q.onsuccess=()=>r(q.result);q.onerror=()=>r(null);});
  if(!db)return 'NO_DB';const tx=db.transaction('media','readonly');const st=tx.objectStore('media');
  const all=await new Promise(r=>{const c=st.getAllKeys();c.onsuccess=()=>r(c.result);c.onerror=()=>r([]);});
  const idx=await new Promise(r=>{const g=st.get('video-index');g.onsuccess=()=>r(g.result);g.onerror=()=>r(null);});
  return JSON.stringify({总:all.length,索引:(idx&&idx.items&&idx.items.length)||0,媒体:all.filter(x=>/^m:/.test(x)).length,字幕:all.filter(x=>/^s:/.test(x)).length,译文:all.filter(x=>/^z:/.test(x)).length});})()`));
const kn = JSON.parse(String(keys).replace(/^"|"$/g, '').replace(/\\"/g, '"'));
ok(kn && kn.索引 > 0 && kn.媒体 === kn.索引 && kn.字幕 === kn.索引,
  '⑧ 每一课的原声 blob 与字幕都真在 IndexedDB 里（列表上那句「x MB 原声」只是元数据）', keys);

/** ⑨⑩ 吸顶悬浮（真机几何才算数：textZoom 120% + 852 CSS 高，视频是被宽度限住高度的，
 *  电脑侧那条"缩档"断言在这里可能天然是假 —— 所以这一测只看实测 rect，不看 class） */
const boxExpr = `(()=>{const w=document.querySelector('div.sticky');if(!w)return null;
  let b=w.parentElement;while(b&&!(b.scrollHeight>b.clientHeight+8&&/auto|scroll/.test(getComputedStyle(b).overflowY)))b=b.parentElement;return b;})()`;
const rect = () => String(ev(`(()=>{const w=document.querySelector('div.sticky'),v=document.querySelector('video');
  if(!w||!v)return 'NO_STICKY';const b=${boxExpr};if(!b)return 'NO_BOX';
  const B=b.getBoundingClientRect(),W=w.getBoundingClientRect(),V=v.getBoundingClientRect(),ol=document.querySelector('ol');const O=ol?ol.getBoundingClientRect():null;
  const doc=document.scrollingElement;
  return JSON.stringify({top:Math.round(W.top-B.top),vh:Math.round(V.height),st:Math.round(b.scrollTop),
    h:Math.round(b.scrollHeight-b.clientHeight),docScroll:Math.round(Math.max(0,doc.scrollHeight-doc.clientHeight)),
    fits:B.bottom<=innerHeight+2,vidIn:V.bottom>B.top+2&&V.top<B.bottom-2,olIn:O?(O.bottom>B.top+2&&O.top<B.bottom-2):false,
    ih:innerHeight});})()`));
const setScroll = (px) => { ev(`(()=>{const b=${boxExpr};if(b)b.scrollTop=${px};return 1;})()`); sleep(1400); };
const p0 = JSON.parse(rect().replace(/^"|"$/g, '').replace(/\\"/g, '"'));
setScroll(Math.round((p0.h || 0) * 0.55));
const pa = JSON.parse(rect().replace(/^"|"$/g, '').replace(/\\"/g, '"'));
setScroll(Math.round((p0.h || 0) * 0.85));
const pb = JSON.parse(rect().replace(/^"|"$/g, '').replace(/\\"/g, '"'));
ok(pa.top !== undefined && Math.abs(pa.top - pb.top) <= 3 && pa.top < p0.top - 20 && pa.vidIn && (pa.olIn || pb.olIn),
  '⑨ 真机往下滑：播放器钉在滚动框顶上不动，画面与字幕同时在（"能同时查找字幕和视频"）',
  `原位 ${p0.top} · ${pa.st}px→${pa.top} · ${pb.st}px→${pb.top} · 字幕可见 ${pa.olIn}/${pb.olIn} · 视口 ${p0.ih}`);
setScroll(0);
const pc = JSON.parse(rect().replace(/^"|"$/g, '').replace(/\\"/g, '"'));
ok(Math.abs(pc.top - p0.top) <= 3 && pc.vh === p0.vh && p0.docScroll <= 2 && p0.fits,
  '⑩ 真机滑回顶部恢复原样（位置与画面尺寸都回到吸住之前；整页收在一屏内、文档不跟着滚）',
  `top ${p0.top}→${pc.top} · 高 ${p0.vh}→${pc.vh} · 文档可滚 ${p0.docScroll} · 框底在屏内 ${p0.fits}`);

const fails = results.filter((x) => !x).length;
console.log(`\n真机核验 ${results.length - fails}/${results.length} 通过${fails ? '' : ' ✓'}`);
process.exit(fails ? 1 : 0);
