#!/usr/bin/env node
/**
 * walk-phone.mjs —— APK 装机后的四条走查，跑在**任何** CDP 可达的 Android WebView 上
 * （模拟器 `phone-emu.mjs cdp` 转发出来的端口，或真机 9223）。
 *
 * 为什么单独一条脚本：这四条此前只能"手机插着 + 人肉点"，而它们全是**只在 APK 成立**的
 * 界面路径（收藏回顾整页崩那次，网页版怎么点都不复现）。模拟器是一次性 profile，
 * 所以这里**允许灌夹具、允许写数据** —— 用户主力机上绝不允许。
 *
 * 五条：① 收藏页「开始回顾」不再整页崩（2026-10-17 用户报障）；② 纠偏本错点归纳 +
 * 按类重考（含 5b：结果图形件在界面上真的画出来了 —— 判定色点 + 正确率弧，一个字不写）；
 * ③ 纠偏条目送进句子拼写的「纠偏表达」桶；④ 首页「待重认」横幅计数与深链。
 *
 * 判据一律"界面上真的出现了"，不看存储自证；每条都带失败明细，退出码非 0 即红。
 * 用法：node scripts/walk-phone.mjs [--port 9226] [--base https://localhost]
 *   `--base http://127.0.0.1:8001` + 无头 Chrome 也能跑（本机构建产物那条通道）——
 *   夹具写的是 localStorage，桌面 profile 一样是 throwaway，所以这条不违反"主力机只读"。
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
/** 取 `--flag 值`：**必须判 indexOf<0**，否则 `argv[-1+1]` 会把 argv[0]（就是 `--port` 本身）当成值拿走 */
const flag = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const PORT = flag('port', '9226');
const BASE = flag('base', 'https://localhost');
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
const nav = (p) => { ev(`(()=>{location.href='${BASE}${p}';return 'go';})()`); sleep(2500); };
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
/* 视口这条**按通道给不同的门**：设备上是 393 CSS（真机口径，textZoom 120% 另算）；
   本机 headless 的窗口有 500+ 下限，钉 393 只会冤枉产品 —— 所以照实写明这条在本通道不成立。 */
const 设备通道 = BASE === 'https://localhost';
ok(设备通道 ? Math.abs(geo.w - 393) <= 3 : geo.w >= 360,
  设备通道 ? '布局视口 ≈393 CSS（对齐真机）' : '布局视口 ≥360（本机通道量不到 393，那条只在设备 base 上钉）',
  `cssW=${geo && geo.w} dpr=${geo && geo.dpr} base=${BASE}`);

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
/**
 * 词库要走 IndexedDB 预载，APK 冷 profile 下「正在加载词书…」要挂十几秒 ——
 * 固定 sleep 会把"页面还没出控件"误报成"页面打不开"（2026-11-01 走查 7 条红的真因之一）。
 * 所以先轮询到题池触发器出现，再判这条。
 */
const TRIGGER = 'button[title="切换词书与题池"]';
let ready = 0;
for (let i = 0; i < 40; i += 1) {
  ready = ev(`(()=>document.querySelector(${JSON.stringify(TRIGGER)})?1:0)()`);
  if (ready) break;
  sleep(1500);
}
ok(!!ready && has('句子拼写'), '③ 拼写页打开正常（轮询到题池触发器才算打开，不再拿固定 sleep 当就绪）', `trigger=${JSON.stringify(ready)}`);
/**
 * 2026-11-01 起题池切换是**显式按钮 + Dialog 里的题池卡片**（`SpellingPoolPicker`，
 * 稳定钩子 `[data-spelling-pool="<key>"]`），不再是右上角下拉的 `[role="menuitem"]`。
 * 触发器带 `disabled={building || levelLoading}`，预载那几秒点不动 → openPicker 回 -1，靠重试扛。
 */
const openPicker = () => ev(`(()=>{const b=document.querySelector(${JSON.stringify(TRIGGER)});if(!b)return 0;if(b.disabled)return -1;b.click();return 1;})()`);
const pickPool = (key) => ev(`(()=>{const it=document.querySelector('[data-spelling-pool="${key}"]');if(!it||!it.offsetParent)return 'NOITEM';it.click();return 'chose';})()`);
const triggerLabel = () => ev(`(()=>{const b=document.querySelector(${JSON.stringify(TRIGGER)});return b?(b.innerText||'').replace(/\\s+/g,' ').trim():'NOTRIGGER';})()`);
ok(openPicker() === 1, '③ 点「词书与题池」开得出题池选择器');
sleep(900);
ok(truthy(ev(`(()=>{const it=document.querySelector('[data-spelling-pool="correction"]');return !!(it&&/纠偏表达/.test(it.innerText||'')&&it.offsetParent);})()`)),
  '③ 题池卡里有「纠偏表达」这一档');
const chose = pickPool('correction');
sleep(2500);
ok(chose === 'chose', '③ 点得到「纠偏表达」那张卡', JSON.stringify(chose));
ok(/纠偏表达/.test(String(triggerLabel())), '③ 触发器已切到「纠偏表达」（不是只显示、状态没跟上）', JSON.stringify(triggerLabel()));
const poolExpr = `(()=>{const t=(document.body.innerText||'');const i=t.indexOf('共');const j=t.indexOf('句',i);return i>=0&&j>i?t.slice(i,j+1).replace(/[^0-9]/g,''):null;})()`;
const pool = ev(poolExpr);
ok(same(pool, 1), '③ 纠偏桶题池=1 句（只含送进来的那句）', `共 ${JSON.stringify(pool)} 句`);
// 正对照：切到「四级」（真词库），题池必须明显变大 —— 否则"共 1 句"可能只是页面本来就只报 1。
let chose4 = 'never';
for (let i = 0; i < 12 && chose4 !== 'chose'; i += 1) {
  const opened = openPicker();
  sleep(1200);
  chose4 = pickPool('cet4');
  if (chose4 !== 'chose') {
    console.log(`  重试 ${i + 1}：${chose4} · 开框 ${JSON.stringify(opened)} · 触发器 ${JSON.stringify(triggerLabel())}`);
    sleep(2500);
  }
}
let poolCet4 = null;
for (let i = 0; i < 40; i += 1) {
  sleep(1500);
  poolCet4 = ev(poolExpr);
  if (Number(poolCet4) > Number(pool)) break;
}
ok(chose4 === 'chose' && /四级/.test(String(triggerLabel())), '③ 正对照：能切到真词库「四级」（触发器文案跟着变）', `${JSON.stringify(chose4)} / ${JSON.stringify(triggerLabel())}`);
ok(Number(poolCet4) > Number(pool), '③ 正对照：四级题池远大于纠偏桶（证明纠偏桶是真过滤，不是页面永远报同一个数）', `四级 ${JSON.stringify(poolCet4)} 句 vs 纠偏 ${JSON.stringify(pool)} 句`);

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
/* 5b-0 结果层的"门"：一题没答的时候不许有弧、也不许有判定色点（拿成功色去蒙一个没判的 = 说谎） */
const 答前 = ev(`(()=>({弧:[...document.querySelectorAll('svg.fx-arc')].filter((e)=>e.getBoundingClientRect().width>0).length,点:document.querySelectorAll('.fx-dot').length}))()`);
ok(same(答前.弧, 0) && same(答前.点, 0), '⑤ 一题没答：正确率弧和判定色点都不出现', JSON.stringify(答前));
const pick = ev(`(()=>{const n=(s)=>(s||'').replace(/\\s+/g,' ');const bs=[...document.querySelectorAll('button')].filter(b=>/italic/.test(b.className)&&b.offsetParent);const t=bs.find(b=>n(b.innerText)==='turn on the light');if(!t)return 'NOOPT';t.click();return 'answered';})()`);
sleep(1200);
ok(pick === 'answered', '② 答对那一句', pick);
/* 5b-1 答完：弧与色点必须**画在界面上**（静态守卫只证明接线在源码里，图形件会不会渲染是另一件事） */
const 答后 = ev(`(()=>{const dots=[...document.querySelectorAll('.fx-dot')].filter(e=>e.offsetParent);
  /* SVG 元素的 offsetParent 在 Chrome 里恒为 null —— 用它判"看得见"会冤枉产品，一律看 rect */
  const arc=[...document.querySelectorAll('svg.fx-arc')].find(e=>e.getBoundingClientRect().width>0);
  const fg=arc&&arc.querySelector('.fx-arc-fg');const cs=fg&&getComputedStyle(fg);
  /* computed 的 dash 值带单位（"94.25px"）—— Number() 得到 NaN、比较恒假，第一版就在这条上冤枉了产品一次 */
  const num=(v)=>parseFloat(String(v));
  return {点:dots.length,色:dots.map(e=>getComputedStyle(e).backgroundColor),弧:!!arc,
    弧宽:arc?+arc.getBoundingClientRect().width.toFixed(1):0,描边:cs&&cs.stroke,
    周长:num(cs&&cs.strokeDasharray),偏移:num(cs&&cs.strokeDashoffset)};})()`);
const 绿 = (答后.色 || []).filter((c) => /0, 184, 148/.test(c)).length;
const 未判 = (答后.色 || []).filter((c) => /100, 116, 139/.test(c)).length;
ok(答后.弧 === true && 答后.弧宽 >= 12 && !!答后.描边 && Number.isFinite(答后.周长)
  && Number.isFinite(答后.偏移) && 答后.偏移 < 答后.周长,
  '⑤ 答完之后正确率弧真的画出来了（有尺寸、描边上色、弧已从满圈收口）', JSON.stringify(答后));
ok(绿 === 1 && 未判 === 3, '⑤ 判定色点：答对那颗是成功绿 rgb(0,184,148)，其余三颗是"未判定"中性灰（不许冒绿也不许判错）',
  JSON.stringify(答后.色));
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

/* ── 7. 默认可点层的覆盖（批 2）：装机界面上"没写 data-press 的裸可点元素"也要有手感 ── */
nav('/favorites');
const 覆盖 = ev(`(()=>{const P='button, a[href], [role="button"], [data-press]';
  const els=[...document.querySelectorAll(P)].filter(e=>e.getAttribute('data-press')!=='off');
  const 看得到=(e)=>{const r=e.getBoundingClientRect();return r.width>=28&&r.height>=20&&r.top>=0&&r.bottom<=innerHeight;};
  const t=(()=>{const v=els.filter(看得到);const el=v.find(e=>e.getAttribute('data-press')===null);
    if(!el)return 'NO_DEFAULT_TARGET';
    el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:20,clientY:20,pointerType:'touch'}));
    const out={挂:el.hasAttribute('data-pressing'),涟漪:document.querySelectorAll('.fx-ripple').length};
    el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch'}));
    return out;})();
  return {总数:els.length,默认:els.filter(e=>!e.hasAttribute('data-press')).length,按下:t};})()`);
ok(覆盖.默认 >= 10 && 覆盖.按下 && 覆盖.按下.挂 === true && 覆盖.按下.涟漪 >= 1,
  '⑥ 收藏页上裸按钮走同一套词汇（按下挂态 + 涟漪），默认参与者数量 ≥10', JSON.stringify(覆盖));

/* ── 汇总 ── */
const fail = results.filter((r) => !r.pass);
console.log('');
console.log(fail.length === 0
  ? `APK 走查：${results.length}/${results.length} 全部通过 ✓`
  : `APK 走查：${results.length - fail.length}/${results.length} 通过，${fail.length} 条红：\n  - ${fail.map((f) => f.name).join('\n  - ')}`);
process.exit(fail.length ? 1 : 0);
