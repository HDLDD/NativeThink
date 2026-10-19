#!/usr/bin/env node
/**
 * check-tts-latency.mjs —— 离线朗读的**实测台账**：每个音色合成一段要多久、首包要等多久、预取排在前面会多付多少。
 *
 * 为什么要它：用户要"保证音质前提下快速输出、长文不断"。这不是能靠读代码定的 ——
 *   ① 播放侧的成本已经量过了（浏览器里逐片新建 Audio 元素起播 ~32ms，预加载后 ~1ms），
 *      所以"断"不可能是音频元素重启造成的，只能是**合成没跟上播放**；
 *   ② 合成跟不跟得上 = RTF（合成耗时 ÷ 音频时长），而 RTF 只有真机/模拟器给得出数；
 *   ③ 首包延迟还取决于**入队顺序**（原生 synthLock 串行），这条只能 A/B 打靶。
 *
 * 全程直连原生插件（`window.Capacitor.Plugins.SherpaTts`），绕开 App 的 JS 缓存层，
 * 这样每一项都是冷合成 —— 缓存命中的快由 ④ 单独测。device-eval 的 CDP 调用有 6 秒上限，
 * 所以长任务一律"点火 → 轮询 window.__out"，别把 eval 的超时当成插件挂了。
 *
 * 前置：App 在前台（任意页面即可，插件是全局的）+ CDP 转发已建
 *   模拟器：node scripts/phone-emu.mjs launch && node scripts/phone-emu.mjs cdp
 *   真机：  adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>
 * 用法：node scripts/check-tts-latency.mjs [--port 9226] [--speed 0.9] [--quick]
 */
import { execFileSync } from 'node:child_process';
import path from 'path';

const ROOT = 'B:/NativeThink';
const DEV = path.join(ROOT, 'scripts', 'device-eval.mjs');
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = flag('port', '9226');
const SPEED = Number(flag('speed', '0.9'));
const QUICK = argv.includes('--quick');

const ev = (expr) => {
  const out = execFileSync(process.execPath, [DEV, 'eval', expr], {
    cwd: ROOT, encoding: 'utf-8', env: { ...process.env, CDP_PORT: PORT }, timeout: 60000,
  }).trim();
  try { return JSON.parse(out); } catch { return out; }
};
const sleep = (ms) => execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`], { cwd: ROOT });

/** 点火一段异步 JS（结果写进 window.__out），轮询到它自己交卷。
 *  整段要包成 IIFE：device-eval 是"表达式求值"，裸 `return` 会当场 SyntaxError。 */
function run(js, budgetMs) {
  ev(`(()=>{window.__out='PENDING';window.__prog='start';(async()=>{try{window.__out=JSON.stringify(await (${js}));}catch(e){window.__out='ERR:'+(e&&e.message||e);}})();return 'kicked';})()`);
  const t0 = Date.now();
  while (Date.now() - t0 < budgetMs) {
    sleep(2000);
    const r = ev('window.__out');
    if (r !== 'PENDING') return r;
    const p = ev('window.__prog');
    if (p && p !== 'start') process.stdout.write('  … ' + String(p) + '\n');
  }
  return 'TIMEOUT';
}

/** 每条文本都带一个只出现一次的序号词 —— 否则第二次跑全程命中原生文件缓存，测的就不是合成了 */
const say = (n) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] || ('number ' + n);
const mk = (n, sentences) => `${say(n)}. ` + sentences.join(' ');
const SHORT = ['The deadline will not move.'];
const MID = ['We had better get the report out by Friday.', 'I think we should talk it over before deciding.'];
const LONG = ['We had better get the report out by Friday.', 'I think we should talk it over before deciding.',
  'The numbers do not line up with what the client promised us last month.', 'Fine, but the deadline will not move at all.'];

const VOICES = QUICK
  ? [{ 名: 'lessac（默认）', modelId: 'piper-lessac', speakerId: 0 }, { 名: 'Kokoro Bella', modelId: 'kokoro', speakerId: 2 }]
  : [{ 名: 'lessac（默认）', modelId: 'piper-lessac', speakerId: 0 },
    { 名: 'Kokoro Bella', modelId: 'kokoro', speakerId: 2 },
    { 名: 'Kokoro Emma', modelId: 'kokoro', speakerId: 21 },
    { 名: 'Kokoro George', modelId: 'kokoro', speakerId: 26 }];

console.log('① 引擎状态');
const statusRaw = String(run(`await window.Capacitor.Plugins.SherpaTts.status()`, 40000));
console.log(statusRaw.length > 400 ? statusRaw.slice(0, 400) + '…' : statusRaw);

console.log('\n② 每个音色：冷合成耗时 vs 音频时长（RTF>1 就是合成追不上播放，长文必断）');
const LENS = [['短', mk(1, SHORT)], ['中', mk(2, MID)], ['长', mk(3, LONG)]];
/** 每次运行带一个独有 tag：否则第二次跑全命中原生文件缓存（sha1(model|speaker|speed|text)），测的就不是合成了 */
const RUN_TAG = Date.now().toString(36);
const rtfJs = `(async()=>{
  const P=window.Capacitor.Plugins.SherpaTts;
  const V=${JSON.stringify(VOICES)};
  const LENS=${JSON.stringify(LENS)};
  const out=[];let n=300;
  for(const v of V){
    for(const [tag,text] of LENS){
      const t=(''+(n++)+' ')+text+' ${RUN_TAG}';
      window.__prog=v.名+' '+tag;
      const t0=Date.now();
      const r=await P.speak({text:t,modelId:v.modelId,speakerId:v.speakerId,speed:${SPEED}});
      out.push({音色:v.名,档:tag,字:t.length,插件ms:r.ms,墙钟ms:Date.now()-t0,音频ms:Math.round(r.durationMs),
        RTF:+(r.ms/Math.max(1,r.durationMs)).toFixed(2),cached:r.cached,bytes:r.bytes});
    }
  }
  return out;
})()`;
const rtf = String(run(rtfJs, 560000));
let rows;
try { rows = JSON.parse(rtf.replace(/^"|"$/g, '').replace(/\\"/g, '"')); } catch { rows = null; }
if (!rows) console.log('  没拿到表：' + rtf.slice(0, 300));
else {
  console.log('  音色 / 档   字数  插件ms  音频ms  RTF   cached');
  for (const r of rows) console.log(`  ${r.音色} ${r.档}  ${r.字}  ${r.插件ms}  ${r.音频ms}  ${r.RTF}  ${r.cached}`);
  const bad = rows.filter((r) => r.RTF > 0.9);
  console.log(`  → RTF>0.9 的有 ${bad.length}/${rows.length} 项` +
    (bad.length ? '：这些音色长文朗读会在切片边界处饿住（音频比合成短）' : '：稳态下合成能追上播放，边界应当不饿'));
}

console.log('\n③ 入队顺序 A/B（原生串行队列：预取排在本片前面 = 首包等两次合成）');
/** 四条各不相同的冷文本：旧序/新序各用一对，谁也不借谁的缓存 */
const N = Date.now().toString(36);
const T = (k) => `${say(100 + k)} ${MID.join(' ')} nonce${N}${k}`;
const abJs = `(async()=>{
  const P=window.Capacitor.Plugins.SherpaTts;
  const V=${JSON.stringify(VOICES.slice(0, 2))};
  const T=${JSON.stringify([T(1), T(2), T(3), T(4)])};
  const out=[];
  for(const v of V){
    // 旧序（改之前的写法）：先把下一片塞进队列，再送本片
    let t=Date.now();
    let q2=P.speak({text:T[1],modelId:v.modelId,speakerId:v.speakerId,speed:${SPEED}});
    let q1=P.speak({text:T[0],modelId:v.modelId,speakerId:v.speakerId,speed:${SPEED}});
    await q1; const 旧首包=Date.now()-t; await q2; const 旧两轮=Date.now()-t;
    // 新序（改之后）：本片先入队，预取排在它后面
    t=Date.now();
    q1=P.speak({text:T[2],modelId:v.modelId,speakerId:v.speakerId,speed:${SPEED}});
    q2=P.speak({text:T[3],modelId:v.modelId,speakerId:v.speakerId,speed:${SPEED}});
    await q1; const 新首包=Date.now()-t; await q2; const 新两轮=Date.now()-t;
    window.__prog='AB '+v.名;
    out.push({音色:v.名,旧序首包ms:旧首包,新序首包ms:新首包,两轮都完旧ms:旧两轮,两轮都完新ms:新两轮});
  }
  return out;
})()`;
const ab = String(run(abJs, 560000));
let abRows;
try { abRows = JSON.parse(ab.replace(/^"|"$/g, '').replace(/\\"/g, '"')); } catch { abRows = null; }
if (!abRows) console.log('  没拿到表：' + ab.slice(0, 300));
else for (const r of abRows) {
  console.log(`  ${r.音色}：旧序首包 ${r.旧序首包ms}ms → 新序首包 ${r.新序首包ms}ms（两轮全完 ${r.两轮都完旧ms} / ${r.两轮都完新ms}ms）`);
  console.log(`     判据：新序首包应≈旧序的一半，而两轮总时长两者应当相等（否则测的是抖动不是顺序）`);
}

console.log('\n④ 缓存层有多值钱（同一句第二次读）');
const cacheJs = `(async()=>{
  const P=window.Capacitor.Plugins.SherpaTts;
  const text=${JSON.stringify(mk(200, MID))}+' ${RUN_TAG}cache';
  const v=${JSON.stringify(VOICES[0])};
  const t1=Date.now(); const a=await P.speak({text,modelId:v.modelId,speakerId:v.speakerId,speed:${SPEED}}); const cold=Date.now()-t1;
  const t2=Date.now(); const b=await P.speak({text,modelId:v.modelId,speakerId:v.speakerId,speed:${SPEED}}); const warm=Date.now()-t2;
  return {冷ms:cold,cached第一次:a.cached,热ms:warm,cached第二次:b.cached};
})()`;
console.log('  ' + String(run(cacheJs, 120000)));
