#!/usr/bin/env node
/**
 * walk-video.mjs —— 「视频精听」在真实浏览器界面里的走查（无头 Chrome + CDP）。
 *
 * 为什么必须走这一遍：静态守卫只能证明"接线在源码里"，而精听页最容易坏的是**运行时**：
 * 字幕文件注入 → 解析 → 落 IDB → 读回来建 object URL → 点句 → 查词 → 收藏 → 送拼写，
 * 断链任何一环界面就是一片空白或"页面出错"。判据一律"界面上真的出现了"。
 *
 * 前置：`npm run build:web` + `node scripts/serve.cjs 8001` + 一个开了
 * `--remote-debugging-port` 的 Chrome（本机 profile 目录在 B:，不写 C:）。
 * 用法：node scripts/walk-video.mjs [--port 9222] [--base http://127.0.0.1:8001]
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const PORT = argv[argv.indexOf('--port') + 1] || '9222';
const BASE = argv[argv.indexOf('--base') + 1] || 'http://127.0.0.1:8001';
const DEV = path.join(ROOT, 'scripts', 'device-eval.mjs');

/** device-eval 打印的是 JSON.stringify(值, null, 1) —— 只能解析一次 */
const ev = (expr) => {
  const out = execFileSync(process.execPath, [DEV, 'eval', expr], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, CDP_PORT: PORT }, timeout: 60000,
  }).trim();
  try { return JSON.parse(out); } catch { return out; }
};
const truthy = (v) => v === true || v === 'true';
const sleep = (ms) => execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`], { cwd: ROOT });

const results = [];
const ok = (cond, name, detail = '') => {
  results.push({ pass: !!cond, name, detail });
  console.log(`${cond ? '✓' : '✗'} ${name}${detail ? `  — ${String(detail).slice(0, 120)}` : ''}`);
};
const has = (t) => truthy(ev(`(()=>{const n=(s)=>(s||'').replace(/\\s+/g,'');return n(document.body.innerText).includes(n(${JSON.stringify(t)}));})()`));
const nav = (p) => { ev(`(()=>{location.href='${BASE}${p}';return 'go';})()`); sleep(2600); };
const crash = () => has('页面出错') || has('Something went wrong');

/** 按文案点：先精确等值的可点元素，退一步才允许包含匹配 */
const clickText = (t) => ev(`(()=>{const n=(s)=>(s||'').replace(/\\s+/g,'');const want=${JSON.stringify(t)};
  const all=[...document.querySelectorAll('button,a,[role="button"],div,span')].filter(e=>e.offsetParent&&n(e.innerText));
  const pick=(f)=>all.filter(f);
  const hit=pick(e=>n(e.innerText)===n(want)&&/^(BUTTON|A)$/.test(e.tagName))[0]
    ||pick(e=>n(e.innerText)===n(want))[0]
    ||pick(e=>n(e.innerText).includes(n(want))&&/^(BUTTON|A)$/.test(e.tagName))[0]
    ||pick(e=>n(e.innerText).includes(n(want))).slice(-1)[0];
  if(!hit)return 'NOCAND';hit.click();return 'clicked:'+(n(hit.innerText).slice(0,26));})()`);

/** 45 句：既够触发"字幕开窗"，又让前 6 句是可核对的真实内容 */
const srtFixture = () => {
  const head = [
    'How do you feel about the result?',
    'I think we should <i>talk it over</i> before deciding.',
    'That sounds reasonable to me.',
    'Let us put it off until tomorrow morning.',
    'Fine, but the deadline will not move.',
    'We had better get the report out by Friday.',
  ];
  const lines = [];
  let n = 1;
  const stamp = (i) => `00:00:${String(Math.floor(i / 60) + 10).padStart(2, '0')},${String((i % 60) * 16).padStart(3, '0')}`;
  head.forEach((text, i) => {
    lines.push(`${n++}`, `${stamp(i * 2)} --> ${stamp(i * 2 + 2)}`, text, '');
  });
  for (let k = 0; k < 39; k++) {
    lines.push(`${n++}`, `${stamp(12 + k * 2)} --> ${stamp(14 + k * 2)}`, `Practice sentence number ${k + 1} for the window test.`, '');
  }
  return lines.join('\r\n');
};

const SUB_ACCEPT = 'input[accept^=".srt"]';
const injectSubtitle = (name, text) => ev(`(()=>{const dt=new DataTransfer();
  dt.items.add(new File([${JSON.stringify(text)}], ${JSON.stringify(name)}, {type:'text/plain'}));
  const inp=document.querySelector('${SUB_ACCEPT}');if(!inp)return 'NOINPUT';
  inp.files=dt.files;inp.dispatchEvent(new Event('change',{bubbles:true}));return 'injected';})()`);

/* ── 0. 归位：这个 profile 专给走查用（B:/tmp/nt-walk-chrome），清干净再跑，保证可重复 ── */
nav('/video');
ev(`(()=>{localStorage.clear();indexedDB.deleteDatabase('nativethink-wordbank');return 1;})()`);
sleep(1200);
nav('/video');
sleep(1500);
ok(!crash() && has('还没有导入的课程'), '⓪ 起点是干净的空态（收藏/生词本/课程都不用上轮的残留）', '');

/* ── 1. 首屏：导入区 + 空态 ── */
ok(has('视频精听') && has('选视频（含音频）') && has('只导字幕'), '① 导入区两个入口都在（媒体可选、字幕必需）', '');

/* ── 2. 注入 SRT → 真的进课程视图 ── */
const inj = injectSubtitle('walk-clip.srt', srtFixture());
ok(String(inj) === 'injected', '② 字幕文件真的灌进 input[type=file]', String(inj));
sleep(3000);
ok(!crash(), '② 导入后不崩', '');
ok(has('walk-clip'), '② 课程标题来自文件名', '');
ok(has('1/45'), '② 计数从 1/45 起（45 句全部解析出来，含多行与内联标记的那句）', String(ev(`(()=>{const m=document.body.innerText.match(/(\\d+)\\s*\\/\\s*45/);return m?m[0]:'NOMATCH';})()`)));
ok(has('仅字幕课程'), '② 无媒体是合法形态：显示"仅字幕课程"而不是坏掉的播放器', '');
ok(has('How do you feel about the result'), '② 当前句卡渲染出第一句原文', '');
ok(!has('<i>'), '② 内联标记没漏进界面（<i>talk it over</i> 应被剥成纯文本）', '');

/* ── 3. 字幕开窗（长列表不许一次铺完） ── */
const rendered = Number(ev(`(()=>document.querySelectorAll('ol li button').length)()`));
ok(rendered > 0 && rendered <= 46, '③ 默认只渲染一个窗口（45 句不全铺）', `渲染 ${rendered} 条`);
ok(has('展开全部'), '③ 有"展开全部"入口（窗口不等于削弱用户入口）', '');
clickText('展开全部');
sleep(700);
const renderedAll = Number(ev(`(()=>document.querySelectorAll('ol li button').length)()`));
ok(renderedAll > rendered, '③ 正对照：点"展开全部"后条目真的变多', `${rendered} → ${renderedAll}`);
clickText('收回收音窗口');
sleep(700);

/* ── 4. 点句跳转 ── */
const jumped = ev(`(()=>{const b=[...document.querySelectorAll('ol li button')].find(e=>/put it off/.test(e.innerText||''));if(!b)return 'NOCAND';b.click();return 'ok';})()`);
sleep(900);
ok(String(jumped) === 'ok' && has('4/45'), '④ 点字幕第 4 句 → 当前句与计数跟着走', String(jumped));

/** 按 title 点图标按钮（这一页大量动作是图标 + title，没有文字；真机走查同一条教训） */
const clickTitle = (t) => ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&(e.title||'').includes(${JSON.stringify(t)}));if(!b)return 'NOBTN';if(b.disabled)return 'DISABLED';b.click();return 'ok';})()`);

/* ── 5. 点词查词 + 生词本 ── */
ev(`(()=>{const b=[...document.querySelectorAll('ol li button')].find(e=>/How do you feel/.test(e.innerText||''));if(b)b.click();return 1;})()`);
sleep(1000);
/** 词面保留字幕原样（'result?' 带问号），点词时页面自己剥标点 —— 探针必须按同一个口径找 */
const wordHit = ev(`(()=>{const p=[...document.querySelectorAll('p')].find(e=>/How do you feel/.test(e.innerText||''));if(!p)return 'NOCARD';const s=[...p.querySelectorAll('span')].find(e=>(e.innerText||'').trim().toLowerCase().startsWith('result'));if(!s)return 'NOWORD:'+p.innerText.slice(0,30);s.click();return 'ok';})()`);
sleep(1600);
ok(String(wordHit) === 'ok', '⑤ 当前句里的词点得到（词级 span 挂了点词）', String(wordHit));
ok(has('收藏这个词') || has('词库里没有这个词'), '⑤ 查词卡出现（命中就给释义与入口，没命中就说没命中）',
  String(ev(`(()=>{const n=(s)=>(s||'').replace(/\\s+/g,'');const m=n(document.body.innerText).match(/(加进生词本|词库里没有这个词)[^]{0,20}/);return m?m[0]:'NOMATCH';})()`)));
clickText('加进生词本');
sleep(1200);
ok(has('已在生词本'), '⑤ 加进生词本后按钮自己变状态（练习界面零提示：不弹 toast）', '');

/* ── 6. 收藏这句 → 收藏页真看得到 ── */
/** 这句的收藏按钮是"图标 + title"，按文案点不到（walk-phone 同一条教训：卡面控件按 title 精确匹配） */
const favClick = clickTitle('收藏这句');
sleep(1200);
ok(String(favClick) === 'ok', '⑥ 「收藏这句」点得到', String(favClick));
ok(truthy(ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>(e.title||'').includes('收藏这句'));return !!b&&/text-rose-500/.test(b.className);})()`)),
  '⑥ 收藏后当前句的按钮自己变实心红（界面反馈，不弹 toast）', '');
nav('/favorites');
ok(!crash(), '⑥ 收藏页不崩', '');
ok(has('视频精听'), '⑥ 收藏页认得 type=video（标签显示「视频精听」）', '');
ok(has('How do you feel about the result'), '⑥ 那句字幕真的进了收藏清单', '');
nav('/video');
sleep(2000);

/* ── 7. 听写这句 → 拼写页「视频精听」桶 ── */
ok(has('1/45') || has('walk-clip'), '⑦ 切走再回来接着上次那一课（不是一屏导入界面）', '');
const sent = clickTitle('送进句子拼写');
sleep(1000);
ok(String(sent) === 'ok', '⑦ 当前句卡有「送进句子拼写」入口（图标按钮按 title 点得到）', String(sent));
nav('/spelling');
sleep(2600);
ok(!crash(), '⑦ 句子拼写页不崩', '');
/** Radix DropdownMenu 在 pointerdown 上打开，`.click()` 打不开（walk-phone 同一坑） */
ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>/切换词书/.test(e.title||''));if(!b)return 'NOBTN';
  b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:1}));b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerId:1}));b.click();return 'opened';})()`);
sleep(1200);
ok(has('视频精听'), '⑦ 拼写页词库下拉里有「视频精听」桶（与「纠偏表达」同一套桶制）',
  String(ev(`(()=>{const n=(s)=>(s||'').replace(/\\s+/g,'');const t=n(document.body.innerText);return '纠偏:'+t.includes('纠偏表达')+' 视频:'+t.includes('视频精听');})()`)));
clickText('视频精听');
sleep(2200);
const bucket = ev(`(()=>{const m=document.body.innerText.match(/(\\d+)\\s*\\/\\s*(\\d+)/);return m?m[0]:'NOMATCH';})()`);
ok(String(bucket) !== 'NOMATCH' && !crash(), '⑦ 选中视频桶后会话能起（界面出现 x/y 计数，不是空池子）', String(bucket));

/* ── 8. P2 双语字幕 + P1 跟读 ── */
nav('/video');
sleep(2000);
const zhBefore = Number(ev(`(()=>[...document.querySelectorAll('ol li p')].filter(e=>/[\\u4e00-\\u9fa5]{2,}/.test(e.innerText||'')).length)()`));
ok(zhBefore === 0, '⑧ 起点：这一课的 45 句都还没有译文（有残留的话下面那条"边翻边上屏"就不算真凭据）', String(zhBefore));
const trans = clickText('翻译字幕');
ok(String(trans).startsWith('clicked'), '⑧ 「翻译字幕」按钮点得到', String(trans));
/** 点下去立刻有进行中态 —— 旧写法要等整轮翻完才第一次上屏，那几十秒里界面看着像坏了 */
const busyNow = String(ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>/翻译/.test(e.innerText||''));return b?(b.innerText||'').replace(/\\s+/g,'')+(b.disabled?'|禁用':'|可点'):'NOBTN';})()`));
ok(/^开始翻译\d+句…\|禁用$/.test(busyNow), '⑧ 点下去按钮就换成「开始翻译 N 句…」并禁用（重复点击不许另起一轮）', busyNow);
let label = busyNow, zhNow = 0, note = '', grewWhileBusy = false;
for (let t = 0; t < 120; t++) {
  sleep(2500);
  const s = String(ev(`(()=>{const n=(x)=>(x||'').replace(/\\s+/g,'');
    const b=[...document.querySelectorAll('button')].find(e=>/翻译/.test(e.innerText||''));
    const zh=[...document.querySelectorAll('ol li p')].filter(e=>/[\\u4e00-\\u9fa5]{2,}/.test(e.innerText||'')).length;
    const body=n(document.body.innerText);
    return JSON.stringify({label:b?n(b.innerText):'NOBTN',zh,note:(body.match(/(已翻译[^§]{0,30}|一句都没[^§]{0,44}|还没配AIKey[^§]{0,34}|存不下来[^§]{0,26})/)||[''])[0]});})()`));
  let st; try { st = JSON.parse(s); } catch { st = { label: '', zh: 0, note: '' }; }
  label = st.label; zhNow = st.zh; note = st.note;
  /** 只认"还没翻完就已经有几行（但不足 45 行）"这一种形态，这才叫增量上屏 */
  if (/翻译中/.test(label) && st.zh > 0 && st.zh < 45) grewWhileBusy = true;
  if (st.note) break;
}
ok(grewWhileBusy, '⑧ 正对照：译文"边翻边上屏"（按钮还写着翻译中，界面已出现一部分中文行）',
  `带中文的字幕行 ${zhBefore} → ${zhNow}，按钮 ${label}`);
ok(/已翻译|还没配AIKey|一句都没|存不下来/.test(note),
  '⑧ 翻译要么回报句数、要么给出具体的失败原因（不许静默；被限流时这一支就是失败原因）', `${note || '5 分钟无反馈'}｜按钮 ${label}`);
ok(zhNow > zhBefore, '⑧ 一轮跑完确实有句子带上译文（不是只弹个提示）', `${zhBefore} → ${zhNow}`);
ok(!crash(), '⑧ 翻译后页面仍活着', '');
clickText('跟读');
sleep(2000);
ok(!crash(), '⑧ 点跟读不崩（这台设备有/无识别通道都要活着）', '');
/** 有的 WebView 是"对象能构造、start() 当场抛"或 onerror/onend 一个都不回 —— 那会卡在"正在听…"，就是"点了没反应" */
let micState = '';
for (let t = 0; t < 8; t++) {
  micState = String(ev(`(()=>{const n=(s)=>(s||'').replace(/\\s+/g,'');const t=n(document.body.innerText);
    const b=[...document.querySelectorAll('button')].find(e=>(e.title||'').includes('跟读'));
    return JSON.stringify({stuck: !!b && n(b.innerText).includes('正在听'), said: /没有语音识别通道|识别到|没听到声音|没识别出来|麦克风权限|没有回应|start\(\) 就失败/.test(t)});})()`));
  if (/stuck":false.*said":true/.test(micState)) break;
  sleep(2000);
}
ok(/"stuck":false/.test(micState) && /"said":true/.test(micState),
  '⑧ 跟读要么给分数要么给原因，而且不许卡在"正在听…"（点了没反应 = 原生桥那族缺陷）', micState);

/* ── 9. 回列表 → 删除这一课（连媒体与译文键一起清） ── */
const back = ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&e.querySelector('svg[class*="chevron-left"]'));if(b){b.click();return 'ok';}return 'NOBACK';})()`);
sleep(1600);
ok(String(back) === 'ok' && has('已导入 1 课'), '⑨ 课程视图能退回列表，列表记住这一课', String(back));
const lastKey = ev(`(()=>{const k=Object.keys(localStorage).find(x=>x.endsWith('__nativethink_video_last_open'));return k?localStorage.getItem(k):'CLEARED';})()`);
ok(String(lastKey) === 'CLEARED', '⑨ 主动返回列表会清掉"上次开着的那课"（否则下次进来又被拽回课程，看不到导入入口）', String(lastKey));
const trashOnce = () => ev(`(()=>{const s=[...document.querySelectorAll('span[role="button"]')].find(e=>e.offsetParent&&e.querySelector('svg[class*="trash"]'));if(s){s.click();return 'ok';}return 'NOTRASH';})()`);
const del1 = trashOnce();
sleep(700);
ok(String(del1) === 'ok' && has('再点一次删除') && has('已导入 1 课'),
  '⑨ 第一次点垃圾桶只进确认态，不许直接删（误触一次就带走整课太重了）', String(del1));
sleep(6000);   // 确认态要自己收回
ok(!has('再点一次删除') && has('已导入 1 课'), '⑨ 正对照：6 秒不点第二下就自动收回确认态（课还在）', '');
const del2 = trashOnce();
sleep(500);
ok(String(trashOnce()) === 'ok' && has('还没有导入的课程'), '⑨ 第二次点才真删，回到空态（不许留一条点不开的幽灵课程）', String(del2));
const idbLeft = ev(`(async()=>{const req=indexedDB.open('nativethink-wordbank');await new Promise(r=>req.onsuccess=r);const db=req.result;const tx=db.transaction('media','readonly');const c=tx.objectStore('media').count();return await new Promise(r=>{c.onsuccess=()=>r(c.result);c.onerror=()=>r(-1);});})()`);
ok(Number(idbLeft) === 1, '⑨ 删除把 m:/s:/z: 三条一起收掉，media 表只剩索引那一条', `键数 ${idbLeft}`);

/* ── 10. 用户视角新增行为：拖拽导入 / 反悔不清残值 / 删课清进度 / 重播真播 / 释义卡在视野里 ── */
nav('/video');
sleep(1800);
/** a. 一次拖进"视频 + 字幕"两个文件 —— 分类、建课、<video> 挂上，全走用户那条路 */
const dropPair = ev(`(()=>{const dt=new DataTransfer();
  dt.items.add(new File(['fake-bytes-not-a-real-mp4'],'wanted-video.mp4',{type:'video/mp4'}));
  dt.items.add(new File([${JSON.stringify(srtFixture())}],'dropped-lesson.srt',{type:'application/x-subrip'}));
  const box=document.querySelector('input[accept^=".srt"]');const zone=box&&box.closest('div[class*="dashed"]');
  if(!zone)return 'NODROPZONE';
  zone.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));
  zone.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
  return 'dropped';})()`);
sleep(4500);
ok(String(dropPair) === 'dropped' && has('wanted-video') && has('1/45'),
  '⑩ 把"视频 + 字幕"两个文件一起拖进导入框真的建了课（文案一直写着"拖进来"）', String(dropPair));
ok(truthy(ev(`(()=>!!document.querySelector('video'))()`)),
  '⑩ 拖进来的媒体真的挂上了 <video>（不是只存了个名字）', '');
/** b. 重播本句：暂停态点了要真的调 play()（用替身记一次调用，别指望假字节能解码） */
const rp = ev(`(()=>{const el=document.querySelector('video');if(!el)return 'NOVIDEO';
  window.__played=0; const op=el.play.bind(el); el.play=()=>{window.__played++;return Promise.resolve();};
  el.pause(); el.currentTime=30;
  const b=[...document.querySelectorAll('button')].find(e=>(e.title||'').includes('重播本句'));if(!b)return 'NOBTN';
  b.click();return 'clicked';})()`);
sleep(900);
/** 这份夹具的第一句从 0:10 起（不是 0:00），所以"回到句首"要看到的正是 10 */
const rpState = ev(`(()=>{const el=document.querySelector('video');return JSON.stringify({played:window.__played||0,t:el?Math.round(el.currentTime):-2});})()`);
ok(String(rp) === 'clicked' && /"played":[1-9]/.test(String(rpState)) && /"t":10/.test(String(rpState)),
  '⑩ 暂停态点「重播本句」会真的调 play() 并回到本句起点（只设 currentTime 就是"点了没反应"）', String(rpState));
/** c. 点词后释义卡要落在视口内（查词要先预热词库，给足时间再判定，别把竞态当缺陷） */
/** 先把当前句钉回第 1 句：上一步为了验重播把 currentTime 拨到 30，卡片此刻显示的是别的句 */
ev(`(()=>{const b=[...document.querySelectorAll('ol li button')].find(e=>/How do you feel/.test(e.innerText||''));if(b)b.click();return 1;})()`);
sleep(900);
const inView = ev(`(()=>{const p=[...document.querySelectorAll('p')].find(e=>/How do you feel/.test(e.innerText||''));
  const s=p?[...p.querySelectorAll('span')].find(e=>(e.innerText||'').trim().toLowerCase().startsWith('result')):null;
  if(!s)return 'NOWORD'; s.click();return 'ok';})()`);
let box2 = 'NOCARD';
for (let k = 0; k < 12; k++) {
  sleep(800);
  /** 认「收藏这个词 / 词库里没有这个词」：命中且已在生词本时按钮写的是「已在生词本」，按加进生词本找会假阴性 */
  box2 = String(ev(`(()=>{const c=[...document.querySelectorAll('div')].filter(e=>/收藏这个词|词库里没有这个词/.test(e.innerText||'')&&e.getBoundingClientRect().height>0).pop();
    if(!c)return 'NOCARD';const r=c.getBoundingClientRect();return JSON.stringify({inView:r.top<innerHeight&&r.bottom>0});})()`));
  if (box2 !== 'NOCARD') break;
}
ok(String(inView) === 'ok' && /"inView":true/.test(String(box2)),
  '⑩ 点词后释义卡在视口内（手机上播放器占大半屏，卡片跑到屏幕外就等于"查词没反应"）', `点词=${String(inView)} · ${String(box2)}`);
/** d. 快捷键写在地面上（title 在触屏不可达；窄视口下这行是隐藏的，所以查 DOM 而不是查可见文案） */
ok(truthy(ev(`(()=>document.body.innerHTML.includes('空格 播放/暂停'))()`)),
  '⑩ 快捷键有一行明说（原来只放在 title 里；窄视口故意藏起来，但键盘用户在电脑上要看得见）', '');
ok(/已听 \d+\/\d+ 句/.test(String(ev(`(()=>{const m=(document.body.innerText||'').replace(/\\s+/g,' ').match(/已听 \\d+\\/\\d+ 句/);return m?m[0]:'NOMATCH';})()`))),
  '⑩ 界面上写明"已听 x/y 句"（原来只有 13/45 那种计数，不知道自己听到了哪儿）',
  String(ev(`(()=>{const m=(document.body.innerText||'').replace(/\\s+/g,' ').match(/已听 \\d+\\/\\d+ 句/);return m?m[0]:'NOMATCH';})()`)));
/** e. 选了视频又反悔：清掉残值，之后只导字幕不该把那段视频悄悄带上 */
/** nav 是整页重载，会把"上次开着的那课"恢复回来 —— 先按返回键回列表，才谈得上空态 */
const backToList = () => {
  const b = ev(`(()=>{const x=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&e.querySelector('svg[class*="chevron-left"]'));if(!x)return 'NOBACK';x.click();return 'ok';})()`);
  sleep(1400); return b;
};
nav('/video'); sleep(1400);
backToList();
trashOnce(); sleep(500); trashOnce(); sleep(2200);
ok(has('还没有导入的课程'), '⑩ 起点回到空态（下面要验"反悔"这条路径）',
  String(ev(`(()=>{const m=(document.body.innerText||'').replace(/\\s+/g,'').match(/已导入\\d+课/);return m?m[0]:'空态';})()`)));
const pick = ev(`(()=>{const dt=new DataTransfer();dt.items.add(new File(['xx'],'wanted-video.mp4',{type:'video/mp4'}));
  const i=document.querySelector('input[accept^="video/"]');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));return 'ok';})()`);
sleep(1400);
ok(has('已选视频：wanted-video.mp4'),
  '⑩ 选完视频界面上写明是哪一份（原来只又弹一个选择器，用户不知道系统记住了什么）', String(pick));
const un = clickText('不要了');
sleep(700);
ok(/^clicked/.test(String(un)) && !has('已选视频'), '⑩ 反悔入口点得动（"不要了"把待绑媒体清掉，界面上那行跟着消失）', String(un));
const dropSub = ev(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(srtFixture())}],'only-subs.srt',{type:'application/x-subrip'}));
  const zone=document.querySelector('input[accept^=".srt"]').closest('div[class*="dashed"]');
  if(!zone)return 'NOZONE';
  zone.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));
  zone.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));return 'ok';})()`);
sleep(4500);
ok(String(dropSub) === 'ok' && has('仅字幕课程') && !truthy(ev(`(()=>!!document.querySelector('video'))()`)),
  '⑩ 正对照：待绑的媒体不会悄悄跟着下一次导入（这一课确实只有字幕）', `drop=${String(dropSub)} · 标题=${ev(`(()=>((document.body.innerText||'').match(/only-subs/)||['?'])[0])()`)}`);
/** f. 听完要给出"这一课都听到了"，删课后这条要跟着清零（同一处反馈也当进度清理的正对照） */
ev(`(()=>{const b=[...document.querySelectorAll('ol li button')].find(e=>/put it off/.test(e.innerText||''));if(b)b.click();return 1;})()`);
sleep(1400);
/** 窗口只铺 40 条，要跳到"最后一句"得先展开（不然测的是窗口最后一行，不是课的最后一句） */
clickText('展开全部');
sleep(1200);
const lastJump = ev(`(()=>{const ls=[...document.querySelectorAll('ol li button')];const b=ls[ls.length-1];if(b)b.click();return ls.length;})()`);
sleep(1800);
ok(Number(lastJump) >= 45 && has('这一课都听到了'),
  '⑩ 跳到最后一句会给出"这一课都听到了"（只有 x/y 计数的话，学到头没有任何信号）',
  `条目 ${String(lastJump)} · ${String(ev(`(()=>{const m=(document.body.innerText||'').replace(/\\s+/g,' ').match(/已听 \\d+\\/\\d+ 句/);return m?m[0]:'NOMATCH';})()`))}`);
nav('/video'); sleep(1400);
backToList();
trashOnce(); sleep(500); trashOnce(); sleep(2200);
const readd = ev(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(srtFixture())}],'only-subs.srt',{type:'application/x-subrip'}));
  const zone=document.querySelector('input[accept^=".srt"]').closest('div[class*="dashed"]');
  zone.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));return 'ok';})()`);
sleep(4500);
const startAt = ev(`(()=>{const m=(document.body.innerText||'').replace(/\\s+/g,'').match(/(\\d+)\\/(\\d+)/);return m?m[1]:'?';})()`);
ok(String(readd) === 'ok' && String(startAt) === '1' && !has('这一课都听到了'),
  '⑩ 删课把这一课的进度一起清掉：重导入同一份字幕从第 1 句开始、"都听到了"也跟着归零（不是跳回上次那句）',
  `起点 ${String(startAt)} · 残留反馈=${has('这一课都听到了')}`);

console.log('');
let pass = 0; const fails = [];
for (const r of results) { if (r.pass) pass++; else fails.push(r.name); }
console.log(`走查 ${pass}/${results.length} 通过${fails.length ? '' : ' ✓'}`);
fails.forEach((f) => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);
