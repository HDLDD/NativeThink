#!/usr/bin/env node
/**
 * walk-phone.mjs —— APK 装机后的四条走查，跑在**任何** CDP 可达的 Android WebView 上
 * （模拟器 `phone-emu.mjs cdp` 转发出来的端口，或真机 9223）。
 *
 * 为什么单独一条脚本：这四条此前只能"手机插着 + 人肉点"，而它们全是**只在 APK 成立**的
 * 界面路径（收藏回顾整页崩那次，网页版怎么点都不复现）。模拟器是一次性 profile，
 * 所以这里**允许灌夹具、允许写数据** —— 用户主力机上绝不允许。
 *
 * 四条：① 收藏页「开始回顾」不再整页崩（2026-10-17 用户报障）；② 纠偏本错点归纳 +
 * 按类重考；③ 纠偏条目送进句子拼写的「纠偏表达」桶；④ 首页「待重认」横幅计数与深链。
 *
 * 判据一律"界面上真的出现了"，不看存储自证；每条都带失败明细，退出码非 0 即红。
 * 用法：node scripts/walk-phone.mjs [--port 9226]
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const PORT = argv[argv.indexOf('--port') + 1] || '9226';
const DEV = path.join(ROOT, 'scripts', 'device-eval.mjs');

/**
 * device-eval 打印的是 `JSON.stringify(值, null, 1)` —— **只能解析一次**。
 * 第一版这里连解两次，于是 `has()` 永远拿到 '"true"'（带引号）而判假，
 * 一次跑出 20 条红、其中十几条是测法错不是产品缺陷（"先证伪自己的测法"又一次应验）。
 */
const ev = (expr) => {
  const out = execFileSync(process.execPath, [DEV, 'eval', expr], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, CDP_PORT: PORT }, timeout: 60000,
  }).trim();
  try { return JSON.parse(out); } catch { return out; }
};
const truthy = (v) => v === true || v === 'true';
const same = (a, b) => String(a) === String(b);
const sleep = (ms) => execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`], { cwd: ROOT });

const results = [];
const ok = (cond, name, detail = '') => { results.push({ pass: !!cond, name, detail }); console.log(`${cond ? '✓' : '✗'} ${name}${detail ? `  — ${String(detail).slice(0, 110)}` : ''}`); };
const has = (t) => truthy(ev(`(()=>{const n=(s)=>(s||'').replace(/\\s+/g,'');return n(document.body.innerText).includes(n(${JSON.stringify(t)}));})()`));
const nav = (p) => { ev(`(()=>{location.href='https://localhost${p}';return 'go';})()`); sleep(2500); };
/**
 * safeStorage 的真实前缀**必须从现有键反推**，不许照文档手拼。
 * 它是 `__miaoda___global___<anon>__:`（结尾两个下划线）—— 第一版我拼成单个 `:`，
 * 于是 seed 的 removeItem 打在空气上：③ 的「共 1 句」其实是上一轮残留，
 * 而"落库 n:0"是我的读取键名错。两条红都是测法错，产品没问题。
 */
const PREFIX_JS = `(()=>{const k=Object.keys(localStorage).find(x=>x.indexOf('__nativethink_')>=0);if(k)return k.slice(0,k.indexOf('__nativethink_'));const anon=localStorage.getItem('__miaoda_anon_id_v1')||'walk-anon';return '__miaoda___global___'+anon+'__:';})()`;
/** 按文案点：先要**精确等值**的可点元素，退一步才允许包含匹配（否则点「认识」会命中「不认识」） */
const clickText = (t) => ev(`(()=>{const n=(s)=>(s||'').replace(/\\s+/g,'');const want=${JSON.stringify(t)};
  const all=[...document.querySelectorAll('button,a,[role="button"],div,span')].filter(e=>e.offsetParent&&n(e.innerText));
  const pick=(f)=>all.filter(f);
  const hit=pick(e=>n(e.innerText)===n(want)&&/^(BUTTON|A)$/.test(e.tagName))
    [0]||pick(e=>n(e.innerText)===n(want))[0]
    ||pick(e=>n(e.innerText).includes(n(want))&&/^(BUTTON|A)$/.test(e.tagName)).slice(-1)[0]
    ||pick(e=>n(e.innerText).includes(n(want))).slice(-1)[0];
  if(!hit)return 'NOCAND';hit.click();return 'clicked:'+(hit.tagName+':'+n(hit.innerText).slice(0,24));})()`);

/* ── 0. 就绪与几何 ── */
const geo = ev('({t:document.title,w:window.innerWidth,h:window.innerHeight,dpr:window.devicePixelRatio,u:location.pathname})');
console.log(`WebView: ${JSON.stringify(geo)}`);
ok(geo && geo.t === 'NativeThink', 'App 起来了（title=NativeThink）', JSON.stringify(geo));
ok(geo && Math.abs(geo.w - 393) <= 3, '布局视口 ≈393 CSS（对齐真机）', `cssW=${geo && geo.w} dpr=${geo && geo.dpr}`);

/* ── 1. 灌夹具（模拟器 profile 可写；真机跑这条要先确认不是主力机） ── */
const seed = ev(`(()=>{
  const anon=localStorage.getItem('__miaoda_anon_id_v1')||'walk-anon';
  if(!localStorage.getItem('__miaoda_anon_id_v1')) localStorage.setItem('__miaoda_anon_id_v1',anon);
  const p='__miaoda___global___'+anon+'__:';
  const now=Date.now();
  localStorage.setItem(p+'__nativethink_vocab_setup_done','1');
  localStorage.setItem(p+'__nativethink_favorites',JSON.stringify([
    {id:'f1',type:'vocabulary',content:'serendipity',meaning:'意外发现珍宝的运气',example:'Finding that shop was pure serendipity.',category:'CET6',createdAt:now-4000},
    {id:'f2',type:'chunk',content:'in no time',meaning:'很快',example:'We will fix it in no time.',category:'chunks',createdAt:now-3000},
    {id:'f3',type:'expression',content:'I am looking forward to it.',meaning:'我很期待',example:'',category:'think',createdAt:now-2000},
    {id:'f4',type:'word',content:'diligent',meaning:'勤奋的',example:'a diligent student',category:'CET4',createdAt:now-1000}
  ]));
  localStorage.setItem(p+'__nativethink_correction_notes',JSON.stringify([
    {id:'c1',source:'think',wrong:'I very like it',right:'I really like it',chineseHint:'',note:'词性误用：very 修饰动词要用 really',createdAt:now-5000},
    {id:'c2',source:'writing',wrong:'He gave me a good advice',right:'He gave me some good advice',chineseHint:'',note:'advice 是不可数名词',createdAt:now-4000},
    {id:'c3',source:'think',wrong:'I go there yesterday',right:'I went there yesterday',chineseHint:'',note:'时态错了：事情发生在过去',createdAt:now-3000},
    {id:'c4',source:'conversation',wrong:'open the light',right:'turn on the light',chineseHint:'开灯',note:'整句字面直译，母语者不这么说',createdAt:now-2000},
    {id:'c5',source:'writing',wrong:'There have many people',right:'There are many people',chineseHint:'',note:'',createdAt:now-1000}
  ]));
  localStorage.removeItem(p+'__nativethink_spelling_sentences');
  return {prefix:p,notes:5,favs:4};
})()`);
console.log(`夹具：${JSON.stringify(seed)}`);
ev('(()=>{location.reload();return "re";})()');
sleep(4000);

/* ── 2. 走查④：首页「待重认」横幅（此刻 5 条都没重考过） ── */
nav('/');
ok(has('中式表达还没重认过'), '④ 首页出现「表达纠偏待重考」横幅', has('中式表达还没重认过') ? '文案在' : '没找到文案');
const banner0 = ev(`(()=>{const m=(document.body.innerText||'').replace(/\\s+/g,' ').match(/(\\d+) 条中式表达还没重认过/);return m?m[1]:null;})()`);
ok(same(banner0, 5), '④ 横幅计数=5（=没重考过的条数，不是全部）', `读到 ${banner0}`);

/* ── 3. 走查①：收藏页「开始回顾」不再整页崩 ── */
nav('/favorites');
ok(has('共 4 条收藏'), '① 收藏页渲染出 4 条夹具', '');
ok(has('表达纠偏 · 5 条'), '① 纠偏本区块在同页（含错点类别 chips）', '');
ok(has('词性混用') && has('中式直译'), '① 错点归纳 chips 在 APK 界面上真的出现', '');
const crashBefore = has('页面出错') || has('出错了');
ok(!crashBefore, '① 浏览态无「页面出错」卡', '');
console.log(`  点「开始回顾」→ ${clickText('开始回顾')}`);
sleep(2500);
const reviewUi = has('已回顾') || has('认识') && has('不认识') || /1\s*\/\s*4/.test(ev('document.body.innerText') || '');
ok(!has('页面出错'), '① 点「开始回顾」后没有整页崩（这是用户报障的那条）', '');
ok(reviewUi, '① 回顾界面真的出来了（认识/不认识 + 计数）', '');
console.log(`  点「认识」→ ${clickText('认识')}`);
sleep(1200);
ok(/2\s*\/\s*4|已回顾/.test(ev('document.body.innerText') || ''), '① 评分能推进到下一张', '');
ev('(()=>{const b=[...document.querySelectorAll("button")].find(x=>/返回|退出/.test(x.innerText||""));if(b)b.click();return b?"back":"none";})()');
sleep(1500);

/* ── 4. 走查③：纠偏条目 → 句子拼写「纠偏表达」桶 ── */
nav('/favorites');
const sent = ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/送进句子拼写/.test(x.title||''));if(!b)return 'NOBTN';b.click();return 'clicked';})()`);
ok(sent === 'clicked', '③ 收藏页每条的「送进拼写」按钮在 APK 里可点', sent);
/**
 * 落库要**轮询**而不是固定 sleep：写盘发生在 React 事件里，1.2s 读到 0 让我误报过一次
 * "没落库"（实际有）。同时以 UI 的按钮 title 翻转为主证（界面上真的出现了 > 存储自证）。
 */
const readStore = () => ev(`(()=>{const p=${PREFIX_JS};const raw=JSON.parse(localStorage.getItem(p+'__nativethink_spelling_sentences')||'[]');return {n:raw.length,sample:raw[0]&&{en:raw[0].en,level:raw[0].level,source:raw[0].source}};})()`);
let spellStore = readStore();
for (let i = 0; i < 10 && !(spellStore && spellStore.n >= 1); i++) { sleep(700); spellStore = readStore(); }
ok(spellStore && spellStore.n === 1 && spellStore.sample && spellStore.sample.level === 'correction',
  '③ 落库一条 correction 桶的题', JSON.stringify(spellStore));
const flipped = truthy(ev(`(()=>[...document.querySelectorAll('button')].some(x=>/这句已在句子拼写库里/.test(x.title||'')))()`));
ok(flipped, '③ 按钮 title 翻成「这句已在句子拼写库里」（UI 上的落库回执）', '');
nav('/spelling');
ok(has('句子拼写') || has('开始'), '③ 拼写页打开正常', '');
/**
 * 词库下拉的触发器有稳定 title（SpellingPage.tsx:1259 `title="切换词书"`），
 * 而「全部词库」这串字同时是触发器文案和下拉项文案 —— 按文案点会点错，必须按 title 点。
 */
const opened = ev(`(()=>{const b=document.querySelector('button[title="切换词书"]');if(!b)return 'NOTRIGGER';
  // Radix 的下拉在 pointerdown 上开，合成 .click() 打不开它（实测 NOITEM 的真正原因）
  b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0,pointerId:1}));
  b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,button:0,pointerId:1}));
  b.click();
  return 'opened:'+(b.innerText||'').trim();})()`);
console.log(`  开词库下拉 → ${JSON.stringify(opened)}`);
sleep(1200);
ok(has('纠偏表达'), '③ 词库下拉里有「纠偏表达」这一档', JSON.stringify(opened));
const chose = ev(`(()=>{const it=[...document.querySelectorAll('[role="menuitem"]')].find(e=>/纠偏表达/.test(e.innerText||'')&&e.offsetParent);if(!it)return 'NOITEM';it.click();return 'chose';})()`);
sleep(2500);
ok(chose === 'chose', '③ 点得到「纠偏表达」那一项', JSON.stringify(chose));
const triggerLabel = ev(`(()=>{const b=document.querySelector('button[title="切换词书"]');return b?(b.innerText||'').trim():'NOTRIGGER';})()`);
ok(/纠偏表达/.test(String(triggerLabel)), '③ 触发器已切到「纠偏表达」（不是只显示、状态没跟上）', JSON.stringify(triggerLabel));
const poolExpr = `(()=>{const t=(document.body.innerText||'');const i=t.indexOf('共');const j=t.indexOf('句',i);return i>=0&&j>i?t.slice(i,j+1).replace(/[^0-9]/g,''):null;})()`;
const pool = ev(poolExpr);
ok(same(pool, 1), '③ 纠偏桶题池=1 句（只含送进来的那句）', `共 ${pool} 句`);
// 正对照：切到「四级」（真词库），题池必须明显变大 —— 否则"共 1 句"可能只是页面本来就只报 1。
// 词库要走 IndexedDB 预载，APK 冷 profile 下这一步要十几秒，所以**轮询**而不是固定 sleep。
const openMenu = () => ev(`(()=>{const b=document.querySelector('button[title="切换词书"]');if(!b)return 0;
  b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0,pointerId:1}));
  b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,button:0,pointerId:1}));b.click();return 1;})()`);
const pickItem = (label) => ev(`(()=>{const it=[...document.querySelectorAll('[role="menuitem"]')].find(e=>new RegExp(${JSON.stringify(label)}).test(e.innerText||'')&&e.offsetParent);if(!it)return 'NOITEM';it.click();return 'ok';})()`);
/**
 * 正对照要能扛住"切书正在预载"：触发器带 `disabled={building || levelLoading}`
 * （SpellingPage.tsx:1257），预载那几秒点不动 —— 第一版点一次就判失败，红得莫名其妙。
 */
let chose4 = 'never';
for (let i = 0; i < 6 && chose4 !== 'ok'; i++) {
  openMenu();
  sleep(1200);
  chose4 = pickItem('^四级');
  if (chose4 !== 'ok') {
    const st = ev(`(()=>{const b=document.querySelector('button[title="切换词书"]');return b?(b.disabled?'DISABLED(预载中)':'ENABLED-NOTFOUND'):'NOTRIGGER';})()`);
    console.log(`  重试 ${i + 1}：${chose4} · 触发器 ${JSON.stringify(st)}`);
    sleep(2500);
  }
}
let poolCet4 = null;
for (let i = 0; i < 30; i++) {
  sleep(1500);
  poolCet4 = ev(poolExpr);
  if (Number(poolCet4) > Number(pool)) break;
}
const label4 = ev(`(()=>{const b=document.querySelector('button[title="切换词书"]');return b?(b.innerText||'').trim():'NOTRIGGER';})()`);
ok(chose4 === 'ok' && /四级/.test(String(label4)), '③ 正对照：能切到真词库「四级」（触发器文案跟着变）', `${JSON.stringify(chose4)} / ${JSON.stringify(label4)}`);
ok(Number(poolCet4) > Number(pool), '③ 正对照：四级题池远大于纠偏桶（证明纠偏桶是真过滤，不是页面永远报同一个数）', `四级 ${poolCet4} 句 vs 纠偏 ${pool} 句`);

/* ── 5. 走查②：纠偏重考按类筛选 + 答后类别反馈 + 完成页汇总 ── */
nav('/vocabulary?tab=correction');
sleep(1500);
ok(has('纠偏重考') && has('条待纠偏'), '② 深链直达纠偏重考起跑页（不是模式列表）', '');
ok(has('开始重考（5 题）'), '② 起跑页整本题数=5', '');
console.log(`  点类别 chip → ${clickText('中式直译 1')}`);
sleep(800);
ok(has('开始重考（1 题）'), '② 按类限定后按钮题数变成筛后的 1 题', '');
ok(has('整句按字面翻是最大来源'), '② 选中类别给出针对性建议', '');
console.log(`  开始 → ${clickText('开始重考（1 题）')}`);
sleep(1800);
const optCount = ev(`(()=>[...document.querySelectorAll('button')].filter(b=>/italic/.test(b.className)&&b.offsetParent).length)()`);
ok(same(optCount, 4), '② 单条类别的题仍有 4 个选项（干扰项取自整本，不是只剩一个必对）', `${optCount} 个`);
const pick = ev(`(()=>{const n=(s)=>(s||'').replace(/\\s+/g,' ');const bs=[...document.querySelectorAll('button')].filter(b=>/italic/.test(b.className)&&b.offsetParent);const t=bs.find(b=>n(b.innerText)==='turn on the light');if(!t)return 'NOOPT';t.click();return 'answered';})()`);
sleep(1200);
ok(pick === 'answered', '② 答对那一句', pick);
ok(has('对了') && has('中式直译'), '② 揭示块有判定 + 类别徽标', '');
ok(has('先想英语里这个意思通常用什么句型开口'), '② 揭示块给了该类的改法建议', '');
console.log(`  看结果 → ${clickText('看结果')}`);
sleep(1500);
ok(has('重考完成'), '② 完成页到达', '');
ok(!has('这轮还没认出的错点'), '② 全对时不显示「还没认出的错点」（计数口径正确）', '');

/* ── 6. 回首页：横幅计数应随重考退场 ── */
nav('/');
const banner1 = ev(`(()=>{const m=(document.body.innerText||'').replace(/\\s+/g,' ').match(/(\\d+) 条中式表达还没重认过/);return m?m[1]:(has2()?'gone':null);function has2(){return false;}})()`);
ok(same(banner1, 4), '④ 重考过一条后横幅从 5 变 4（考过即退场）', `读到 ${banner1}`);

/* ── 汇总 ── */
const fail = results.filter((r) => !r.pass);
console.log('');
console.log(fail.length === 0
  ? `APK 走查：${results.length}/${results.length} 全部通过 ✓`
  : `APK 走查：${results.length - fail.length}/${results.length} 通过，${fail.length} 条红：\n  - ${fail.map((f) => f.name).join('\n  - ')}`);
process.exit(fail.length ? 1 : 0);
