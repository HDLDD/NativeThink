#!/usr/bin/env node
/**
 * walk-quickcard-tts.mjs —— 快速闪卡「部分单词/句子朗读没声音」的运行时取证。
 *
 * 只观测不改行为：把四条出口（Audio.play / fetch / speechSynthesis / Capacitor 原生桥）
 * 全部记下来，然后逐张卡点「喇叭」与「例句」，看哪一次点击**什么都没发生**。
 * 用法：node scripts/walk-quickcard-tts.mjs [--port 9226] [--cards 18] [--level cet4]
 */
import fs from 'node:fs';
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const PORT = flag('port', '9226');
const CARDS = Number(flag('cards', '18'));
const LEVEL = flag('level', 'cet4');
/** 受控夹具：把这些词面写成快速闪卡的断点队列，让"可疑形状"（>180 字的例句、多句、含斜杠、
 *  24 字上下、无句末标点）逐条被量到，而不是靠随机轮次撞 —— 随机 14 张里长句只占 0.26%。 */
const FIXTURE = flag('fixture', '');
/** 例句窗要能装下"两片的长句"整段放完（每片 ~5s） */
const 例句窗 = Number(flag('ex-window', '2400'));
/** 进这一张之后、点喇叭之前等多久。自动朗读的窗就是这段 ——
 *  进第一轮时词书要从 IndexedDB 现读，等太短会把"晚到的朗读"算到喇叭头上，误判成第一张不读。 */
const 落定 = Number(flag('settle', '2000'));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
/** 别把 target 锁死在 https://localhost（那是 APK 的形态）—— 本机 serve.cjs 上是 127.0.0.1:8001，
 *  同一份取证脚本要在两种形态上跑，才能分清"APK 专属"与"两边都有的缺陷"。 */
const page = list.find((t) => t.type === 'page' && /vocabulary|localhost|127\.0\.0\.1/.test(t.url)) || list.find((t) => t.type === 'page');
if (!page) { console.error('✗ 没有 App 的 WebView target'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('CDP 连不上')); });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.error || r.result?.exceptionDetails) throw new Error(JSON.stringify(r.error || r.result.exceptionDetails));
  return r.result.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => { try { return JSON.parse(String(x)); } catch { return { err: String(x).slice(0, 80) }; } };
await send('Runtime.enable');

/* ── 装探针（幂等：重复注入只包一次） ── */
const PROBE = `(()=>{
  if(window.__T) return '已在';
  window.__T=[]; window.__N=0;
  const log=(k,d)=>{const o={n:++window.__N,k:k,t:Math.round(performance.now())};
    for(const key in d){o[key]=d[key]} window.__T.push(o); return o};
  const proto=HTMLAudioElement.prototype; const origPlay=proto.play;
  const kindOf=(src)=>{
    if(src.startsWith('blob:')) return 'blob';
    if(src.startsWith('file:')) return 'file';
    if(src.indexOf('/api/tts')>=0) return '云端';
    if(!src) return '空 src';
    return src.slice(0,16);
  };
  proto.play=function(){
    const kind=kindOf(String(this.src||''));
    log('play尝试',{kind:kind});
    return origPlay.call(this).then(
      function(){ log('play-ok',{kind:kind}); },
      function(e){ log('play-拒',{kind:kind,name:e&&e.name,msg:String(e&&e.message||'').slice(0,60)}); });
  };
  const origFetch=window.fetch;
  window.fetch=function(u){
    const url=String((u&&u.url)||u||'');
    log('fetch发',{url:url.slice(0,80)});
    return origFetch.apply(this,arguments).then(function(r){ log('fetch'+r.status,{url:url.slice(0,60)}); return r; },
      function(e){ log('fetch失败',{url:url.slice(0,60),msg:String(e&&e.message||'').slice(0,50)}); throw e; });
  };
  if(window.speechSynthesis){
    const origSpeak=window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak=function(utt){ log('系统语音',{text:String(utt&&utt.text||'').slice(0,26)}); return origSpeak(utt); };
  }
  if(window.Capacitor && window.Capacitor.nativeCallback){
    const origCb=window.Capacitor.nativeCallback;
    window.Capacitor.nativeCallback=function(plugin,method){
      if(/sherpa|tts/i.test(String(plugin)+String(method))) log('原生桥',{call:String(plugin)+'.'+String(method)});
      return origCb.apply(this,arguments);
    };
  }
  /* 再加两条：朗读链一旦被调用，必然先 cancel 系统语音、必然 new Audio —— 这两条用来区分
     "effect 根本没跑"与"跑了但没走到播放"。 */
  if(window.speechSynthesis){
    const oc=window.speechSynthesis.cancel.bind(window.speechSynthesis);
    window.speechSynthesis.cancel=function(){ log('ss-cancel',{}); return oc(); };
  }
  const OAudio=window.Audio;
  window.Audio=function(src){ log('建Audio',{src:String(src||'').slice(0,26)}); return new OAudio(src); };
  window.Audio.prototype=OAudio.prototype;
  return '已装';
})()`;
/** 探针装在页面里，**一次导航就没了** —— 每次导航后与每轮循环前都要补装（幂等） */
const ensureProbe = async () => String(await ev(PROBE));
/* ── 走到 /vocabulary 的快速闪卡 ── */
const click = async (pred) => J(await ev(`(()=>{const els=[...document.querySelectorAll('button,[role="tab"],a,[data-press],div')];
  const b=els.find(${pred}); if(!b) return JSON.stringify({err:'没找到'});
  b.click(); return JSON.stringify({ok:1,标签:(b.innerText||b.getAttribute('title')||b.tagName).replace(/\\s+/g,' ').trim().slice(0,18)})})()`));
const state = async () => J(await ev(`JSON.stringify({url:location.pathname,词:(document.querySelector('h2')||{}).innerText||'',
  自动开:!!document.querySelector('[aria-label^="关闭自动发音"]'),
  有例句:!![...document.querySelectorAll('div')].find(d=>/例句（点句子朗读）/.test(d.innerText||'')&&d.children.length<5),
  卡面:(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,40)})`));

console.log('\n· 导航到 /vocabulary');
await ev(`location.assign('/vocabulary')`); await sleep(2600);
console.log('   探针:', await ensureProbe(), JSON.stringify(await state()));
/* 关掉可能挡路的弹窗 */
for (const t of ['Close', '知道了', '开始学习']) { const r = await click(`(e=>/^${t}$/.test((e.innerText||'').trim()))`); if (r.ok) console.log('   关弹窗:', t); await sleep(400); }
/* 选词书 → 快速闪卡 */
console.log('   选词书:', JSON.stringify(await click(`(e=>/^${LEVEL === 'cet4' ? '四级词汇' : LEVEL}/.test((e.innerText||'').trim()))`)));
await sleep(700);
/** 把夹具写成快速闪卡的断点队列（键 = `__nativethink_quickcard_session_<level>`，带 safeStorage 前缀）。
 *  前缀从页面上现成的键反查，不硬编码 —— 前缀随登录态变，写错前缀等于写进没人读的键。 */
if (FIXTURE) {
  const raw = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const order = Array.isArray(raw) ? raw : raw.order;
  if (!Array.isArray(order) || !order.length) { console.error(`✗ 夹具里没有 order 数组：${FIXTURE}`); process.exit(1); }
  const wr = J(await ev(`(()=>{const k=Object.keys(localStorage).find(x=>x.endsWith('__nativethink_vocab_autospeak'));
    const pfx=k?k.slice(0,k.length-'__nativethink_vocab_autospeak'.length):'';
    const key=pfx+'__nativethink_quickcard_session_${LEVEL}';
    localStorage.setItem(pfx+'__nativethink_vocab_autospeak','1');
    localStorage.setItem(key,JSON.stringify({level:'${LEVEL}',order:${JSON.stringify(order)},index:0,
      results:${JSON.stringify(order.map(() => null))},revealed:false,paused:false,at:Date.now()}));
    return JSON.stringify({写到了:key.replace(pfx,''),词数:${order.length},前缀:pfx?'有':'裸键'})})()`));
  console.log('   夹具:', JSON.stringify(wr));
}
await sleep(1600);
console.log('   现在:', JSON.stringify(await state()));

/** 进轮那一刻就是首张自动朗读的起点 —— 夹具与非夹具都要记（否则第一张永远没有归属窗，会把"没跑"和"没测"混为一谈） */
await ev('window.__mark=performance.now()');
console.log('   选方式:', JSON.stringify(await click(`(e=>/快速闪卡/.test((e.innerText||'').trim())&&(e.innerText||'').trim().length<30)`)));

/** 自动发音默认是开的，但设备可能被上一轮走查关过 —— 关了当然"每次都不响"，那不是缺陷。
 *  先按真实路径（概览/会话头部那个开关）把它打开，再谈"自动朗读没声"。 */
const 开关 = J(await ev(`(()=>{const b=document.querySelector('[aria-label^="开启自动发音"]');
  if(b){b.click();return JSON.stringify({点了:1})}
  return JSON.stringify({已在:1,值:localStorage.getItem('__nativethink_vocab_autospeak')})})()`));
console.log('   自动发音开关:', JSON.stringify(开关));
await sleep(600);
console.log('   开关实际落盘:', String(await ev(`(()=>{const k=Object.keys(localStorage).find(x=>x.endsWith('__nativethink_vocab_autospeak'));return (k?'值='+localStorage.getItem(k):'没写过这个键（默认开）')})()`)));

/** 读数前先补装探针，并把缓冲清空 */
const reset = async () => { await ensureProbe(); await ev('window.__T.length=0;window.__N=0'); };
const take = async () => { const v = J(await ev('window.__T?JSON.stringify(window.__T):[]')); return Array.isArray(v) ? v : []; };
/** 按时间窗取事件：自动朗读的那次 play() 常常在"点认识"当帧就发生，
 *  先清缓冲再读会把整对事件抹掉 → 假"没声"。改成记下点击时刻，只收点击之后的。 */
const markNow = async () => Number(await ev('Math.round(performance.now())'));
const takeSince = async (mark) => (await take()).filter((e) => Number(e.t) > mark);
/** 有界的窗：自动朗读那段。等别的步骤跑完再回看这个窗 ——
 *  进第一轮时词书要从 IndexedDB 现读，朗读可能比我预想的 1.6s 晚到，先读会误判成"没发起"。 */
const takeWindow = async (from, to) => (await take()).filter((e) => Number(e.t) > from && Number(e.t) <= to);
/** 一组事件 → 人话：真出声几次、有没有被拒、走了哪条通道 */
const sum = (arr) => {
  const ks = (arr || []).map((e) => e.k);
  const has = (re) => ks.filter((k) => re.test(k));
  return {
    出声: has(/^play-ok$/).length,
    尝试: has(/^play尝试$/).length,
    被拒: has(/^play-拒$/).length,
    桥: has(/^原生桥$/).map(() => '桥').join('+'),
    net: has(/^fetch/).join(','),
    明细: (arr || []).slice(0, 12).map((e) => e.k === 'play-拒' ? `play-拒:${e.kind}/${e.name}`
      : e.k === 'play尝试' ? `play尝试:${e.kind}` : e.k === '原生桥' ? e.call : e.k === 'fetch发' ? 'fetch…'
        : /^fetch\d\d\d$/.test(e.k) ? e.k : e.k).join(' '),
  };
};

/* ── 逐张卡取证（全程不清缓冲，用时间窗归属，避免把"点了之后立刻发生的事"抹掉） ── */
const rows = [];
/** ⚠️ 这里**不许** reset()：第一张的自动朗读就在进轮那几百毫秒里发起，清缓冲等于把它抹掉，
 *  读数就变成"每轮第一张都不读"（2026-10-20 差点据此又去"修"一个不存在的缺陷）。
 *  真要定性第一张读没读：读 QC 组件的 lastSpokenRef（fiber 里形如 "0-mankind"）＋ 看事件缓冲。 */
let 自动窗 = Number(await ev('Math.round(window.__mark)'));   // 上一轮点「认识」（夹具下：进轮）的时刻
for (let i = 0; i < CARDS; i++) {
  await ensureProbe();
  const s0 = await state();
  const word = (s0.词 || '').trim();
  if (!word) { console.log(`第 ${i + 1} 张：读不到词面，停`); break; }
  if (s0.自动开 === false) { console.log(`第 ${i + 1} 张：自动发音开关是关的 → 这张不结论（测法无效，先开开关）`); }

  // A 自动朗读的窗先留着不读：等本张其它步骤跑完再回看 [进这张, 点喇叭] 之间发生了什么。
  //   （进第一轮时词书要从 IndexedDB 现读，朗读可能晚 1~2s 才发起；但也不能不等就点喇叭，
  //    否则两次 speak 叠在一起，窗里的读数就分不清是谁的。）
  await sleep(落定);

  /* B 点喇叭（读单词）—— 必须打在最里层那个 button 上：外层容器也"含有"这个图标，
       早先按 contains 找元素时点到的是整块卡片，等于根本没按下按钮（假"全部没出声"） */
  /* B 点喇叭（读单词）。⚠️ 页面上有**两个** volume2 图标：概览/会话头部的「自动发音」开关也用它，
       早先取第一个图标把开关当喇叭点，等于一边测一边把自动朗读关掉（假"自动永远没声"）。
       喇叭按钮没有 aria-label，开关有 —— 用它区分，并且只认词面 h2 同一行的那个。 */
  const markW = await markNow();
  const tw = J(await ev(`(()=>{const h2=document.querySelector('h2');
    const 候选=[...document.querySelectorAll('button')].filter(b=>b.querySelector('.lucide-volume2')&&!b.hasAttribute('aria-label')&&b.offsetParent!==null);
    let btn=h2?h2.closest('div').parentElement.querySelector('button:not([aria-label])'):null;
    if(!btn||!btn.querySelector('.lucide-volume2')) btn=候选[0];
    if(!btn)return JSON.stringify({err:'找不到词面喇叭（可见的无 aria-label 音量按钮 ' + 候选.length + ' 个）'});
    btn.click(); return JSON.stringify({ok:1,喇叭总数:候选.length})})()`));
  await sleep(2000);
  const evW = await takeSince(markW);

  /* C 翻开卡片 → 点例句（例句只有释义面才有） */
  await ev(`(()=>{const el=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&/点卡片看释义/.test(x.textContent||''));
    if(!el)return 1; const t=el.closest('[class*="cursor-pointer"]')||el.parentElement; t.click(); return 1})()`);
  await sleep(1200);
  const markX = await markNow();
  const exInfo = J(await ev(`(()=>{const ds=[...document.querySelectorAll('div')].filter(x=>/例句（点句子朗读）/.test((x.innerText||'').slice(0,12)));
    if(!ds.length)return JSON.stringify({有:0,文案:(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,50)});
    const d=ds[ds.length-1]; const ps=[...d.querySelectorAll('p')]; const en=ps.find(p=>/[A-Za-z]/.test(p.innerText||''))||ps[0];
    d.click();
    const t=(en&&en.innerText||'').trim();
    return JSON.stringify({有:1,长度:t.length,含斜杠:/\\//.test(t),头:t.slice(0,24)})})()`));
  await sleep(例句窗);
  const evX = await takeSince(markX);

  const auto = sum(自动窗 === null || markW === undefined ? [] : await takeWindow(自动窗, markW));
  const w = sum(evW), x = sum(evX);
  rows.push({ 词: word.slice(0, 14), 例句长: exInfo.长度 || 0, 含斜杠: !!exInfo.含斜杠, 自动: auto, 单词: w, 例句: x });
  console.log(`#${i + 1} 「${word.slice(0, 12)}」 自动→${auto.出声 ? `出声${auto.出声}` : (auto.明细 || '没声')} | 喇叭(${tw.err || '已点'})→${w.出声 ? `出声${w.出声}` : (w.明细 || '没声')}`
    + ` | 例句(${exInfo.长度 || 0}字${exInfo.含斜杠 ? ' 含/' : ''})→${x.出声 ? `出声${x.出声}` : (x.明细 || '没声')}`
    + `\n     喇叭: ${w.明细 || '（毫无动静）'}\n     例句: ${x.明细 || '（毫无动静）'}`);

  /* 下一张：点「认识」，并记下时刻归属下一轮的自动朗读 */
  const nx = J(await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^认识/.test((x.innerText||'').trim())&&x.offsetHeight>16);
    if(!b)return JSON.stringify({err:'没有认识按钮'}); window.__mark=performance.now(); b.click(); return JSON.stringify({ok:1})})()`));
  if (!nx.ok) { console.log('   ' + (nx.err || '点不到认识') + '，停'); break; }
  /** 记点就打在 click 之前那几行（同一个 evaluate 里），否则会漏掉点击当帧发起的那次 play */
  自动窗 = Number(await ev('Math.round(window.__mark)'));
}

/* ── 汇总 ── */
const 分类 = (r) => r.单词.出声 > 0 ? '有声' : (r.单词.尝试 > 0 ? '发起了但没播成' : (r.单词.明细 ? '有动静但没出声' : '连 play() 都没发起'));
const 组 = {};
for (const r of rows) { const k = 分类(r); (组[k] = 组[k] || []).push(r); }
console.log(`\n===== 汇总（${rows.length} 张卡，四级词书）=====`);
for (const [k, v] of Object.entries(组)) console.log(`  点喇叭→${k}：${v.length} 张  ${v.map((r) => r.词).join(' / ')}`);
const 自动没声 = rows.filter((r) => r.自动.出声 === 0);
console.log(`自动朗读没出声：${自动没声.length}/${rows.length} 张` + (自动没声.length ? `  → ${自动没声.map((r) => `${r.词}[${r.自动.明细 || '无证据'}]`).join(' ; ')}` : ''));
const 例句死 = rows.filter((r) => r.例句长 > 0 && r.例句.出声 === 0);
console.log(`点例句没出声：${例句死.length} 张` + (例句死.length ? `  → ${例句死.map((r) => `${r.词}(例句 ${r.例句长} 字)[${r.例句.明细 || '无证据'}]`).join(' ; ')}` : ''));
console.log('\n逐条形状：');
for (const r of rows) console.log(`  ${r.词.padEnd(15)} 例句 ${String(r.例句长).padStart(4)} ${r.含斜杠 ? '含/ ' : '   '} 自动:${r.自动.出声 || '-'} 喇叭:${r.单词.出声 || '-'} 例句:${r.例句.出声 || '-'}`);
ws.close();
