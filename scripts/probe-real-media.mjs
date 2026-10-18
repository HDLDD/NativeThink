/**
 * 一次性探针：把**真实媒体**灌进 /video，验"带原声"这条路径（walk-video 只测过「仅字幕」）。
 * 两遍对照：
 *   A 遍用修好的 m4a（容器时长 344s）→ 不该出现"时长元数据不可靠"；
 *   B 遍用原始的截断 m4a（头声明 6024s、真语音 343s）→ 必须出现那句实话。
 * 前置：npm run build:web && node scripts/serve.cjs 8001 &&
 *       mkdir -p dist/client/__probe__ 后把两媒体一字幕拷进去（构建产物目录，不进 git），例如
 *       cp "B:/nt-materials/video-lab/01-B1听力-购物闲聊/b1-shopping-chat.m4a" dist/client/__probe__/
 *       cp /b/dshzmd/data/web/BV1ppah66EaW*.m4a dist/client/__probe__/truncated.m4a
 *       chrome --headless=new --remote-debugging-port=9222 --user-data-dir=B:/tmp/nt-walk-chrome
 *       --autoplay-policy=no-user-gesture-required
 * 用法：node scripts/probe-real-media.mjs [--good 名字] [--broken 名字] [--subs 名字]
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
const GOOD = arg('good', 'b1-shopping-chat.m4a');      // dist/client/__probe__/ 里修好的媒体
const BROKEN = arg('broken', 'truncated.m4a');          // 同目录里那份截断媒体（头写 6024s）
const SUBS = arg('subs', 'b1-shopping-chat.json');      // 词级转录 JSON

const results = [];
const ok = (c, n, d = '') => { results.push({ c, n }); console.log(`${c ? '✓' : '✗'} ${n}${d ? '  — ' + String(d).slice(0, 140) : ''}`); };
const truthy = (v) => v === true || v === 'true';
const has = (t) => truthy(ev(`(()=>{const n=(s)=>(s||'').replace(/\\s+/g,'');return n(document.body.innerText).includes(n(${JSON.stringify(t)}));})()`));
const nav = (p) => { ev(`(()=>{location.href='${BASE}${p}';return 'go';})()`); sleep(2800); };

const readKeys = () => ev(`(async()=>{
  const db = await new Promise((res, rej) => { const r = indexedDB.open('nativethink-wordbank'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = db.transaction('media', 'readonly');
  const store = tx.objectStore('media');
  const all = await new Promise((res) => { const c = store.getAllKeys(); c.onsuccess = () => res(c.result); });
  return JSON.stringify(all);
})()`);

/** 一遍完整导入 + 播放 + 换页重开 */
function runOnce(tag, mediaFile, expectDurRange, wantWarn) {
  console.log('\n── ' + tag + '（媒体 ' + mediaFile + '）──');
  nav('/video');
  ev(`(()=>{localStorage.clear();indexedDB.deleteDatabase('nativethink-wordbank');return 1;})()`);
  sleep(1500);
  nav('/video');
  sleep(1500);

  const s1 = ev(`(async()=>{
    const b = await (await fetch('${BASE}/__probe__/${mediaFile}')).blob();
    const dt = new DataTransfer(); dt.items.add(new File([b], '${mediaFile}', { type: 'audio/mp4' }));
    const inp = document.querySelector('input[accept^="video/"]');
    if (!inp) return 'NO_MEDIA_INPUT';
    inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    return 'media-set:' + b.size;
  })()`);
  ok(String(s1).startsWith('media-set'), `${tag} ① 真音频灌进「选视频（含音频）」`, String(s1));
  sleep(2500);

  const s2 = ev(`(async()=>{
    const t = await (await fetch('${BASE}/__probe__/${SUBS}')).text();
    const dt = new DataTransfer(); dt.items.add(new File([t], '${SUBS}', { type: 'application/json' }));
    const inp = document.querySelector('input[accept^=".srt"]');
    if (!inp) return 'NO_SUB_INPUT';
    inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    return 'sub-set:' + t.length;
  })()`);
  ok(String(s2).startsWith('sub-set'), `${tag} ② 词级转录 JSON 灌进字幕输入（媒体在 pendingMedia 里等着）`, String(s2));
  sleep(9000);

  ok(!has('页面出错'), `${tag} ③ 带原声导入不崩`, '');
  ok(!has('仅字幕课程'), `${tag} ④ 有媒体时不许显示「仅字幕课程」`, '');
  ok(has('1/69'), `${tag} ⑤ 69 句全部进来`, String(ev(`(()=>{const m=document.body.innerText.match(/\\d+\\/69/);return m?m[0]:'NOMATCH';})()`)));

  const vid = ev(`(()=>{const v=document.querySelector('video');
    return v?JSON.stringify({dur:Math.round(v.duration||0),rs:v.readyState,src:(v.currentSrc||'').slice(0,20),err:v.error?String(v.error.code):null}):'NO_VIDEO';})()`);
  const dur = Number(String(vid).match(/"dur":(-?[\d.]+)/)?.[1] ?? -1);
  ok(dur >= expectDurRange[0] && dur <= expectDurRange[1], `${tag} ⑥ <video> 报出的时长落在预期区间 ${expectDurRange.join('-')}`, String(vid));
  ok(String(vid).includes('"rs":4') || String(vid).includes('"rs":3'), `${tag} ⑦ 元数据/数据已就绪（readyState ≥ 3）`, String(vid));
  ok(wantWarn === has('时长元数据不可靠'),
    `${tag} ⑧ ${wantWarn ? '截断媒体必须说破假时长' : '正常媒体不许乱报"时长元数据不可靠"'}（正/负对照）`,
    '界面上有这句=' + has('时长元数据不可靠'));

  /* 播放 → 逐词高亮：先点一次页面上的播放键（给足用户激活），再轮询几秒，别把竞态当成缺陷 */
  ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>(e.title||'')==='播放'||(e.title||'')==='暂停');if(b)b.click();return 1;})()`);
  sleep(600);
  ev(`(()=>{const v=document.querySelector('video'); if(v){v.currentTime=12.0;}return 1;})()`);
  let hl = '';
  for (let k = 0; k < 8; k++) {
    sleep(1200);
    hl = String(ev(`(()=>{const v=document.querySelector('video');
      const a=[...document.querySelectorAll('p span')].filter(e=>/decoration-2/.test(e.className||''));
      return JSON.stringify({lit:a.length,words:a.map(x=>x.innerText.trim()).slice(0,4),t:v?Math.round(v.currentTime):-1,paused:v?v.paused:null});})()`));
    if (/"lit":[1-9]/.test(hl)) break;
  }
  ok(/"lit":[1-9]/.test(hl), `${tag} ⑨ 播放中真有词被点亮（词级时间戳生效，不只是解析出来）`, hl);

  /* 换页再回来：blob 从 IDB 读回 */
  nav('/spelling'); sleep(1500);
  nav('/video'); sleep(7000);
  const vid2 = ev(`(()=>{const v=document.querySelector('video');
    return v?JSON.stringify({dur:Math.round(v.duration||0),blob:/^blob:/.test(v.currentSrc||'')}):'NO_VIDEO';})()`);
  ok(/"blob":true/.test(String(vid2)), `${tag} ⑩ 切走再回来，原声从 IndexedDB 的 blob 读回（不是内存残留）`, String(vid2));

  /* 存储实况：media 表里应当只有 index + 这一课的 m: / s: */
  const keys = String(readKeys());
  ok(/"m:/.test(keys) && /"s:/.test(keys), `${tag} ⑪ media 表里确有这一课的 m: 与 s: 两条键`, keys.slice(0, 130));

  /* 删除连媒体一起清 */
  ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&e.querySelector('svg[class*="chevron-left"]'));if(b)b.click();return 1;})()`);
  sleep(1800);
  const del = ev(`(()=>{const s=[...document.querySelectorAll('span')].find(e=>e.offsetParent&&e.querySelector('svg[class*="trash"]'));if(s){s.click();return 'ok';}return 'NOTRASH';})()`);
  sleep(2500);
  ok(String(del) === 'ok' && has('还没有导入的课程'), `${tag} ⑫ 删除后回到空态`, String(del));
  const keys2 = String(readKeys());
  const clean2 = keys2.replace(/["\\\s\[\]]/g, '');
  ok(/video-index/.test(clean2) && !/m:/.test(clean2) && !/s:/.test(clean2) && !/z:/.test(clean2),
    `${tag} ⑬ 删除把 m:/s:/z: 一起收掉，media 表只剩索引那一条`, 'raw=' + JSON.stringify(keys2).slice(0, 140));
}

const broken = fs.existsSync(path.join(ROOT, 'dist/client/__probe__/truncated.m4a'));
runOnce('A 修好的媒体', 'b1-shopping-chat.m4a', [330, 360], false);
if (broken) runOnce('B 截断的媒体', 'truncated.m4a', [5500, 6500], true);
else console.log('\n（跳过 B 遍：dist/client/__probe__/truncated.m4a 不在）');

console.log('');
const fails = results.filter((r) => !r.c).map((r) => r.n);
console.log(`探针 ${results.length - fails.length}/${results.length} 通过${fails.length ? '' : ' ✓'}`);
fails.forEach((f) => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);
