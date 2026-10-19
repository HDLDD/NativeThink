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

/** App 重启后 /video 会**自动续开上次那一课**（`LAST_OPEN_KEY`），这时页面根本不在列表上：
 *  「展开全部」找不到、课行也找不到，① 就变成 `NOROW` 假红（而 `<video>` 明明在）。
 *  先按返回键回到列表 —— 顺带把"上次开着的那课"清掉，后面每次跑都从同一个起点开始。 */
const atList = ev(`(()=>{const v=document.querySelector('video');if(!v)return 'LIST';
  const b=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&e.querySelector('svg[class*="chevron-left"]'));
  if(b){b.click();return 'BACK';}return 'NOBACK';})()`);
if (String(atList) !== 'LIST') sleep(2500);

/** 课表默认只铺前 12 课（>12 要人点「展开全部」）—— 先展开，否则第 13 行以后根本点不到 */
const grew = ev(`(()=>{const n=(s)=>(s||'').replace(/\s+/g,'');const before=n(document.body.innerText).length;
  const b=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&/展开全部/.test(n(e.innerText)));
  if(!b)return 'NOEXPAND';b.click();return 'expanded:'+(n(document.body.innerText).length>before);})()`);
sleep(1500);
if (String(grew) !== 'NOEXPAND') console.log('· 已点「展开全部」（' + grew + '）');

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
    docAt:Math.round(doc.scrollTop),
    fits:B.bottom<=innerHeight+2,vidIn:V.bottom>B.top+2&&V.top<B.bottom-2,olIn:O?(O.bottom>B.top+2&&O.top<B.bottom-2):false,
    ih:innerHeight});})()`));
const setScroll = (px) => { ev(`(()=>{const b=${boxExpr};if(b)b.scrollTop=${px};return 1;})()`); sleep(1400); };
/** 读不到几何就报红，别抛异常把后面几测一起带走（NO_STICKY 曾经直接崩脚本） */
const J = (x) => { try { return JSON.parse(String(x).replace(/^"|"$/g, '').replace(/\\"/g, '"')); } catch { return { err: String(x).slice(0, 40) }; } };
/** 必须先归零再拍"原位"：前面⑥点词会把框滚下去，直接读 rect() 会把已吸住的状态当基准，
 *  于是 ⑨ 那条"比原位至少高 20px"天然为假（真机第一次跑就是这么假红的）。 */
setScroll(0);
const p0 = J(rect());
setScroll(Math.round((p0.h || 0) * 0.55));
const pa = J(rect());
setScroll(Math.round((p0.h || 0) * 0.85));
const pb = J(rect());
ok(pa.top !== undefined && Math.abs(pa.top - pb.top) <= 3 && pa.top < p0.top - 20 && pa.vidIn && (pa.olIn || pb.olIn),
  '⑨ 真机往下滑：播放器钉在滚动框顶上不动，画面与字幕同时在（"能同时查找字幕和视频"）',
  `原位 ${p0.top} · ${pa.st}px→${pa.top} · ${pb.st}px→${pb.top} · 字幕可见 ${pa.olIn}/${pb.olIn} · 视口 ${p0.ih}`);
setScroll(0);
const pc = J(rect());
/** 文档可滚高度在这台 ROM 上天生是 47px（safe-area-top 叠 min-h-screen，与这一屏无关），
 *  所以钉的是"文档 scrollTop 始终是 0"—— 真在滚的必须是自己那个框，
 *  否则 sticky 的约束根被文档抢回去，吸顶就又没了（video-lab.md §3.5 那条根因）。 */
ok(Math.abs(pc.top - p0.top) <= 3 && pc.vh === p0.vh && p0.fits && [p0, pa, pb, pc].every((r) => r.docAt === 0),
  '⑩ 真机滑回顶部恢复原样（位置与画面尺寸都回到吸住之前；整页收在一屏内、滚的一直是框而不是文档）',
  `top ${p0.top}→${pc.top} · 高 ${p0.vh}→${pc.vh} · 框底在屏内 ${p0.fits} · 文档 scrollTop ${p0.docAt}/${pa.docAt}/${pb.docAt}/${pc.docAt}（可滚余量 ${p0.docScroll}）`);

/** ⑪ 跟读（语音识别）：这台机器的 WebView 是"对象能构造但回调一个都不回"那一类，
 *  所以只认两件事 —— 不许永久停在"正在听…"，且必须给出原因或分数。
 *  判据用结构（那行 amber 原因段），不枚举文案：枚举会让改措辞变成假红。 */
const micRead = () => String(ev(`(()=>{const n=(s)=>(s||'').replace(/\\s+/g,'');const t=n(document.body.innerText);
  const b=[...document.querySelectorAll('button')].find(e=>(e.title||'').includes('跟读'));
  const why=[...document.querySelectorAll('p')].filter(e=>/text-amber-600/.test(e.className||'')&&n(e.innerText)).map(e=>n(e.innerText));
  return JSON.stringify({stuck: !!b && n(b.innerText).includes('正在听'),
    reason: why.length ? why[0].slice(0, 26) : '', scored: /识别到/.test(t)});})()`));
const clickedMic = ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&(e.title||'').includes('跟读'));if(b)b.click();return b?'clicked':'NOBTN';})()`);
sleep(2500);
const micMid = micRead();
let mic = micMid;
for (let t = 0; t < 8 && /"stuck":true/.test(mic); t++) { sleep(2000); mic = micRead(); }
ok(/"stuck":false/.test(mic) && (/"reason":"[^"]/.test(mic) || /"scored":true/.test(mic)),
  '⑪ 点跟读：不许卡在"正在听…"，且必须给原因或分数（识别通道在真机 WebView 里往往不回回调）', mic);

const fails = results.filter((x) => !x).length;
console.log(`\n真机核验 ${results.length - fails}/${results.length} 通过${fails ? '' : ' ✓'}`);
process.exit(fails ? 1 : 0);
