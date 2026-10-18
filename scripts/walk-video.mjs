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
const trans = clickText('翻译字幕');
ok(String(trans).startsWith('clicked'), '⑧ 「翻译字幕」按钮点得到', String(trans));
let zhState = '';
for (let t = 0; t < 24; t++) {
  sleep(2500);
  zhState = String(ev(`(()=>{const n=(s)=>(s||'').replace(/\\s+/g,'');const t=n(document.body.innerText);const m=t.match(/(翻译中[^]{0,8}|还没配AIKey[^]{0,26}|已翻译[^]{0,16}|AI这次没返回内容[^]{0,18}|AI返回的编号[^]{0,18}|存不下来[^]{0,20})/);return m?m[0]:'';})()`));
  if (/已翻译|还没配|没返回|编号/.test(zhState)) break;
}
ok(/已翻译|还没配AIKey|没返回内容|编号对不上|存不下来/.test(zhState),
  '⑧ 翻译要么回报句数、要么给出具体的失败原因（不许静默；额度被限流时这一支就是失败原因）', zhState || '60 秒内界面无任何反馈');
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
const del = ev(`(()=>{const s=[...document.querySelectorAll('span')].find(e=>e.offsetParent&&e.querySelector('svg[class*="trash"]'));if(s){s.click();return 'ok';}return 'NOTRASH';})()`);
sleep(1800);
ok(String(del) === 'ok' && has('还没有导入的课程'), '⑨ 删除后回到空态（不许留一条点不开的幽灵课程）', String(del));
const idbLeft = ev(`(async()=>{const req=indexedDB.open('nativethink-wordbank');await new Promise(r=>req.onsuccess=r);const db=req.result;const tx=db.transaction('media','readonly');const c=tx.objectStore('media').count();return await new Promise(r=>{c.onsuccess=()=>r(c.result);c.onerror=()=>r(-1);});})()`);
ok(Number(idbLeft) === 1, '⑨ 删除把 m:/s:/z: 三条一起收掉，media 表只剩索引那一条', `键数 ${idbLeft}`);

console.log('');
let pass = 0; const fails = [];
for (const r of results) { if (r.pass) pass++; else fails.push(r.name); }
console.log(`走查 ${pass}/${results.length} 通过${fails.length ? '' : ' ✓'}`);
fails.forEach((f) => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);
