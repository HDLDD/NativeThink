/**
 * 一次性探针：把**真实媒体**灌进 /video，验"带原声"这条路径（walk-video 只测过「仅字幕」）。
 * 两遍对照：
 *   A 遍用课包里裁好的媒体 + 它自己的字幕 → 解码真跑、逐词高亮真点亮、不该出现"时长元数据不可靠"；
 *   B 遍用同一段媒体配**只覆盖一小段的字幕** → 播放器报的时长与字幕区间差太多，必须出现那句实话。
 *   （负对照故意用"媒体与字幕不匹配"来做，而不是把媒体按字节砍断 —— 后者对 faststart 的 mp4 无效：
 *    moov 在文件头，砍掉尾巴后头部声明的时长仍然等于字幕末秒，触发不了那条判定。）
 * 前置：npm run build:web && node scripts/serve.cjs 8001 &&
 *       chrome --headless=new --remote-debugging-port=9222 --user-data-dir=B:/tmp/nt-probe-chrome
 *       --autoplay-policy=no-user-gesture-required
 * 用法（媒体/字幕会**自动拷进** dist/client/__probe__/，不用手工 staging）：
 *   node scripts/probe-real-media.mjs
 *   node scripts/probe-real-media.mjs --media "B:/nt-materials/video-lab/04-…/birthday-gift.mp4" \
 *       --subs "B:/nt-materials/video-lab/04-…/birthday-gift.json" --short-subs "B:/…/02-…/daily-listening-demo.json"
 * 期望时长与句数都从**传进来的文件本身**现算（ffprobe + 读 JSON），不再硬编码 344s / 69 句。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.env.NT_ROOT || process.cwd();
const PORT = '9222';
const BASE = 'http://127.0.0.1:8001';
const DEV = path.join(ROOT, 'scripts', 'device-eval.mjs');

const ev = (expr) => {
  const out = execFileSync(process.execPath, [DEV, 'eval', expr], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, CDP_PORT: PORT }, timeout: 120000,
  }).trim();
  try { return JSON.parse(out); } catch { return out; }
};
const sleep = (ms) => execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`], { cwd: ROOT });
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const MAT = 'B:/nt-materials/video-lab';
const MEDIA = arg('media', MAT + '/04-短文听写-初级-The-Birthday-Gift/birthday-gift.mp4');
const SUBS_SRC = arg('subs', MAT + '/04-短文听写-初级-The-Birthday-Gift/birthday-gift.json');
const SHORT_SRC = arg('short-subs', MAT + '/02-每日听力示范/daily-listening-demo.json');   // 只覆盖 30 秒，配长媒体就触发假时长实话
/** 把素材拷进构建产物目录（不进 git），返回页面里用的文件名 */
const STAGE = path.join(ROOT, 'dist', 'client', '__probe__');
fs.mkdirSync(STAGE, { recursive: true });
for (const f of [MEDIA, SUBS_SRC, SHORT_SRC]) {
  if (!fs.existsSync(f)) { console.log('素材不在：' + f + '（先跑 make-video-lab-packs.mjs）'); process.exit(1); }
  fs.copyFileSync(f, path.join(STAGE, path.basename(f)));
}
const MEDIA_NAME = path.basename(MEDIA);
const SUBS_NAME = path.basename(SUBS_SRC);
const SHORT_NAME = path.basename(SHORT_SRC);
/** 期望值现算：媒体时长用 ffprobe 读容器，句数/字幕末秒读那份 JSON */
const ffdur = Math.round(Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0',
  path.join(STAGE, MEDIA_NAME)], { encoding: 'utf8', timeout: 60000 }).trim()) || 0);
const subsInfo = (name) => {
  const j = JSON.parse(fs.readFileSync(path.join(STAGE, name), 'utf8'));
  const r = j.result || j;
  const list = r.sentences || [];
  /** 逐词高亮那一测要落在"真的有人在说话"的时刻：挑第一句有 ≥3 个词的，取第二个词的中点 */
  const rich = list.find((x) => (x.words || []).length >= 3);
  const w = rich ? rich.words[1] : null;
  return {
    句: list.length,
    末秒: Math.round(list.reduce((m, x) => Math.max(m, x.t1 || 0), 0)),
    点: w ? Number(((w.t0 + w.t1) / 2).toFixed(2)) : 12,
    表: list,
  };
};
const A = subsInfo(SUBS_NAME);
const B = subsInfo(SHORT_NAME);

const results = [];
const ok = (c, n, d = '') => { results.push({ c, n }); console.log(`${c ? '✓' : '✗'} ${n}${d ? '  — ' + String(d).slice(0, 140) : ''}`); };
const truthy = (v) => v === true || v === 'true';
const has = (t) => truthy(ev(`(()=>{const n=(s)=>(s||'').replace(/\\s+/g,'');return n(document.body.innerText).includes(n(${JSON.stringify(t)}));})()`));
const nav = (p) => { ev(`(()=>{location.href='${BASE}${p}';return 'go';})()`); sleep(2800); };
/** 图标/短文案按钮一律按 title 点（这一页大量动作是 title，按文案点不到 —— walk-video 同一条教训） */
const clickTitle = (t) => ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&(e.title||'').includes(${JSON.stringify(t)}));if(!b)return 'NOBTN';if(b.disabled)return 'DISABLED';b.click();return 'ok';})()`);
/** 激活态的口径：这一页的"开着"就是 teal 底色（单句循环 / A-B 复读共用） */
const btnOn = (t) => truthy(ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>(e.title||'').includes(${JSON.stringify(t)}));return /teal-500/.test(b?b.className:'');})()`));
/** 学习时长记账实况（safeStorage 前缀会变，按后缀找键） */
const videoMinutes = () => Number(ev(`(()=>{const k=Object.keys(localStorage).find(x=>x.endsWith('__nativethink_learning_stats'));if(!k)return 0;const j=JSON.parse(localStorage.getItem(k)||'{}');return (j.moduleProgress||{}).video||0;})()`));

const readKeys = () => ev(`(async()=>{
  const db = await new Promise((res, rej) => { const r = indexedDB.open('nativethink-wordbank'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = db.transaction('media', 'readonly');
  const store = tx.objectStore('media');
  const all = await new Promise((res) => { const c = store.getAllKeys(); c.onsuccess = () => res(c.result); });
  return JSON.stringify(all);
})()`);

/** 一遍完整导入 + 播放 + 换页重开 */
function runOnce(tag, subsName, expectDur, wantWarn) {
  console.log('\n── ' + tag + '（媒体 ' + MEDIA_NAME + ' · 字幕 ' + subsName + '）──');
  nav('/video');
  ev(`(()=>{localStorage.clear();indexedDB.deleteDatabase('nativethink-wordbank');return 1;})()`);
  sleep(1500);
  nav('/video');
  sleep(1500);

  const s1 = ev(`(async()=>{
    const b = await (await fetch('${BASE}/__probe__/${MEDIA_NAME}')).blob();
    const dt = new DataTransfer(); dt.items.add(new File([b], '${MEDIA_NAME}', { type: 'video/mp4' }));
    const inp = document.querySelector('input[accept^="video/"]');
    if (!inp) return 'NO_MEDIA_INPUT';
    inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    return 'media-set:' + b.size;
  })()`);
  ok(String(s1).startsWith('media-set'), `${tag} ① 真音频灌进「选视频（含音频）」`, String(s1));
  sleep(2500);

  const s2 = ev(`(async()=>{
    const t = await (await fetch('${BASE}/__probe__/${subsName}')).text();
    const dt = new DataTransfer(); dt.items.add(new File([t], '${subsName}', { type: 'application/json' }));
    const inp = document.querySelector('input[accept^=".srt"]');
    if (!inp) return 'NO_SUB_INPUT';
    inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    return 'sub-set:' + t.length;
  })()`);
  ok(String(s2).startsWith('sub-set'), `${tag} ② 词级转录 JSON 灌进字幕输入（媒体在 pendingMedia 里等着）`, String(s2));
  sleep(9000);

  ok(!has('页面出错'), `${tag} ③ 带原声导入不崩`, '');
  ok(!has('仅字幕课程'), `${tag} ④ 有媒体时不许显示「仅字幕课程」`, '');
  const N = subsInfo(subsName).句;
  ok(has('1/' + N), `${tag} ⑤ ${N} 句全部进来`, String(ev(`(()=>{const m=document.body.innerText.match(/(\\d+)\\s*\\/\\s*${N}/);return m?m[0]:'NOMATCH';})()`)));

  const vid = ev(`(()=>{const v=document.querySelector('video');
    return v?JSON.stringify({dur:Math.round(v.duration||0),rs:v.readyState,src:(v.currentSrc||'').slice(0,20),err:v.error?String(v.error.code):null}):'NO_VIDEO';})()`);
  const dur = Number(String(vid).match(/"dur":(-?[\d.]+)/)?.[1] ?? -1);
  ok(dur >= Math.round(expectDur * 0.85) && dur <= Math.round(expectDur * 1.15), `${tag} ⑥ <video> 报出的时长 ≈ 容器时长 ${expectDur}s（容差 ±15%）`, String(vid));
  ok(String(vid).includes('"rs":4') || String(vid).includes('"rs":3'), `${tag} ⑦ 元数据/数据已就绪（readyState ≥ 3）`, String(vid));
  ok(wantWarn === has('时长元数据不可靠'),
    `${tag} ⑧ ${wantWarn ? '截断媒体必须说破假时长' : '正常媒体不许乱报"时长元数据不可靠"'}（正/负对照）`,
    '界面上有这句=' + has('时长元数据不可靠'));

  /* 播放 → 逐词高亮：先点一次页面上的播放键（给足用户激活），再轮询几秒，别把竞态当成缺陷 */
  ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>(e.title||'')==='播放'||(e.title||'')==='暂停');if(b)b.click();return 1;})()`);
  sleep(600);
  ev(`(()=>{const v=document.querySelector('video'); if(v){v.currentTime=${subsInfo(subsName).点};}return 1;})()`);
  let hl = '';
  for (let k = 0; k < 8; k++) {
    sleep(1200);
    hl = String(ev(`(()=>{const v=document.querySelector('video');
      const a=[...document.querySelectorAll('p span')].filter(e=>/decoration-2/.test(e.className||''));
      return JSON.stringify({lit:a.length,words:a.map(x=>x.innerText.trim()).slice(0,4),t:v?Math.round(v.currentTime):-1,paused:v?v.paused:null});})()`));
    if (/"lit":[1-9]/.test(hl)) break;
  }
  ok(/"lit":[1-9]/.test(hl), `${tag} ⑨ 播放中真有词被点亮（词级时间戳生效，不只是解析出来）`, hl);

  /* ⑩ 当前句必须正是"这一时刻在说的那一句"：时长/时间换算一错，界面就一路钉在最后一句（先暂停再 seek，别让播放中读） */
  const info = subsInfo(subsName);
  const wantI = info.表.findIndex((x) => info.点 >= x.t0 && info.点 < x.t1) + 1;
  ev(`(()=>{const v=document.querySelector('video'); if(v){v.pause(); v.currentTime=${info.点};}return 1;})()`);
  sleep(1400);
  const counter = String(ev(`(()=>{const s=[...document.querySelectorAll('span')].find(e=>/^\\d+\\/\\d+$/.test((e.innerText||'').trim()));return s?s.innerText.trim():'NOCOUNTER';})()`));
  const shown = Number(String(counter).split('/')[0]);
  ok(wantI > 0 && shown === wantI,
    `${tag} ⑩ 停在 ${info.点}s 时当前句是第 ${wantI} 句（不是跳到最后一句）`, `计数 ${counter} · 该是 ${wantI} · 共 ${info.句}`);

  /** ⑪ A-B 复读：越过出点必须回跳到入点 —— 精听最核心的动作，光有静态断言不算 */
  const sAb = info.表[Math.max(0, wantI - 1)] || info.表[0];
  ok(String(clickTitle('A-B 复读')) === 'ok', `${tag} ⑪ A-B 复读按钮在真媒体上点得到`, '');
  sleep(900);
  ev(`(()=>{const v=document.querySelector('video'); if(v) v.currentTime=${(sAb.t1 + 0.4).toFixed(2)}; return 1;})()`);
  let abBack = -1;
  for (let k = 0; k < 10; k++) {
    sleep(600);
    abBack = Number(ev(`(()=>{const v=document.querySelector('video');return v?v.currentTime:-1;})()`));
    if (Math.abs(abBack - sAb.t0) <= 0.6) break;
  }
  ok(Math.abs(abBack - sAb.t0) <= 0.6,
    `${tag} ⑫ 越过出点(${Math.round(sAb.t1 * 10) / 10}s)自己回到入点(${Math.round(sAb.t0 * 10) / 10}s)`, 'currentTime=' + Math.round(abBack * 10) / 10);

  /* ⑬ 单句循环与 A-B 互斥：两个都开着时循环判定里 A-B 优先，界面上"单句"还亮着就是骗人 */
  clickTitle('单句循环'); sleep(900);
  const onlyLoop = btnOn('单句循环') && !btnOn('A-B 复读');
  clickTitle('A-B 复读'); sleep(900);
  const onlyAb = btnOn('A-B 复读') && !btnOn('单句循环');
  ok(onlyLoop && onlyAb, `${tag} ⑬ 单句循环与 A-B 互斥（开一个必须关另一个，正反两个方向都过一遍）`, `单句独亮=${onlyLoop} · A-B 独亮=${onlyAb}`);
  clickTitle('A-B 复读'); sleep(700);   // 收掉，别把复读状态带进下面几测

  /* ⑭ 学习时长按句去重：认新句加 0.2 分钟，同一句里来回拖不许刷时长 */
  const sNew = info.表[Math.max(1, Math.min(info.表.length - 1, 12))];
  const inSelf = (off) => (sNew.t0 + Math.min(off, (sNew.t1 - sNew.t0) * 0.4)).toFixed(2);
  const M0 = videoMinutes();
  ev(`(()=>{const v=document.querySelector('video'); if(v){v.pause(); v.currentTime=${inSelf(0.2)};}return 1;})()`);
  sleep(1600);
  const M1 = videoMinutes();
  ev(`(()=>{const v=document.querySelector('video'); if(v) v.currentTime=${inSelf(0.6)}; return 1;})()`);
  sleep(900);
  ev(`(()=>{const v=document.querySelector('video'); if(v) v.currentTime=${inSelf(0.2)}; return 1;})()`);
  sleep(1400);
  const M2 = videoMinutes();
  ok(M1 > M0 && M2 === M1,
    `${tag} ⑭ 学习时长：认到新句才计，同一句来回拖不刷（本地动作、按课分键）`, `${M0} → ${M1} → ${M2}`);

  /* 换页再回来：blob 从 IDB 读回 */
  nav('/spelling'); sleep(1500);
  nav('/video'); sleep(7000);
  const vid2 = ev(`(()=>{const v=document.querySelector('video');
    return v?JSON.stringify({dur:Math.round(v.duration||0),blob:/^blob:/.test(v.currentSrc||'')}):'NO_VIDEO';})()`);
  ok(/"blob":true/.test(String(vid2)), `${tag} ⑮ 切走再回来，原声从 IndexedDB 的 blob 读回（不是内存残留）`, String(vid2));

  /* 存储实况：media 表里应当只有 index + 这一课的 m: / s: */
  const keys = String(readKeys());
  ok(/"m:/.test(keys) && /"s:/.test(keys), `${tag} ⑯ media 表里确有这一课的 m: 与 s: 两条键`, keys.slice(0, 130));

  /* 删除连媒体一起清 —— 现在是两段式确认，一次点击只进确认态 */
  ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&e.querySelector('svg[class*="chevron-left"]'));if(b)b.click();return 1;})()`);
  sleep(1800);
  const trash = () => ev(`(()=>{const s=[...document.querySelectorAll('span')].find(e=>e.offsetParent&&e.querySelector('svg[class*="trash"]'));if(s){s.click();return 'ok';}return 'NOTRASH';})()`);
  const t1 = trash();
  sleep(600);
  const armed = has('再点一次删除');
  const t2 = trash();
  sleep(2500);
  ok(String(t1) === 'ok' && armed, `${tag} ⑰ 第一次点垃圾桶只进确认态（媒体+字幕+译文一起没太重了）`, String(t1));
  ok(String(t2) === 'ok' && has('还没有导入的课程'), `${tag} ⑱ 第二次点才真删，回到空态`, String(t2));
  const keys2 = String(readKeys());
  const clean2 = keys2.replace(/["\\\s\[\]]/g, '');
  ok(/video-index/.test(clean2) && !/m:/.test(clean2) && !/s:/.test(clean2) && !/z:/.test(clean2),
    `${tag} ⑲ 删除把 m:/s:/z: 一起收掉，media 表只剩索引那一条`, 'raw=' + JSON.stringify(keys2).slice(0, 140));
}

runOnce('A 匹配的媒体+字幕', SUBS_NAME, ffdur, false);
/* B 遍：同一段媒体配一份只覆盖一小段的字幕 → 播放器时长与字幕区间差 >1.6× 就必须说破 */
if (B.句 > 0 && ffdur / Math.max(1, B.末秒) > 1.6) runOnce('B 媒体比字幕长得多', SHORT_NAME, ffdur, true);
else console.log('\n（跳过 B 遍：换 --short-subs 指一份短得多的字幕才做得出负对照）');

console.log('');
const fails = results.filter((r) => !r.c).map((r) => r.n);
console.log(`探针 ${results.length - fails.length}/${results.length} 通过${fails.length ? '' : ' ✓'}`);
fails.forEach((f) => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);
