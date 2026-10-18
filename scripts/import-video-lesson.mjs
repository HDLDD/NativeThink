/**
 * import-video-lesson.mjs —— 在**真机 APK** 里把一课素材走 App 自己的导入流程灌进去。
 *
 * 为什么不用 DOM.setFileInputFiles：实测这台 ROM 的 WebView 直接拒（files.length 恒 0，
 * /sdcard/Android/data/<pkg>/files 与 chmod 644 都一样）；而系统文件选择器（SAF）又打不动 ——
 * 该 ROM 对 adb shell 拒 INJECT_EVENTS。剩下的唯一真路径是：
 *   把文件字节分块注入页面 → 在页面里拼成 File → 走 input 的原生 change 事件
 * 这样 React 的 onChange、parseSubtitle、videoStore.save、配额回退全都真跑一遍，
 * 不是往 IndexedDB 里塞假记录。
 *
 * 顺序有讲究：媒体的 change 处理器会记下 pendingMedia 并**自动点开字幕选择器**（SAF 会弹出来，
 * 需要人在手机上点一下「取消」，不影响导入结果），所以必须"先媒体、立刻字幕"。
 *
 * 用法：node scripts/import-video-lesson.mjs --port 9223 \
 *         --media B:/tmp/pack01/b1-shopping-chat.m4a --subs B:/tmp/pack01/b1-shopping-chat.json
 *      （只给 --subs 就是"只导字幕"那一形态）
 */
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = arg('port', '9223');
const HOST = arg('host', 'localhost');
const MEDIA = arg('media', '');
const SUBS = arg('subs', '');
const CHUNK = Number(arg('chunk', 24000));
if (!SUBS) { console.log('至少要给 --subs（字幕是导入的必需项）'); process.exit(1); }

const pages = await (await fetch(`http://${HOST}:${PORT}/json`)).json();
const page = pages.find((p) => (p.title || '').includes('NativeThink')) || pages.find((p) => p.type === 'page');
if (!page) { console.log('没有可用的 page target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) rej(new Error(m.error.message + ' ' + JSON.stringify(m.error.data || {}))); else res(m.result);
  }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws 连不上')); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('页面抛错：' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200));
  return r.result?.value;
};

/** 分块把 base64 灌进页面（一次 CDP 调用装不下几 MB 的表达式） */
async function pushB64(varName, file) {
  const b64 = fs.readFileSync(file).toString('base64');
  await ev(`window.${varName}='';1`);
  for (let i = 0; i < b64.length; i += CHUNK) {
    await ev(`window.${varName}+=${JSON.stringify(b64.slice(i, i + CHUNK))};${i + CHUNK >= b64.length ? 1 : 0}`);
    if (i % (CHUNK * 10) === 0) process.stdout.write(`  ${varName} ${Math.round((i / b64.length) * 100)}%\n`);
  }
  const len = await ev(`window.${varName}.length`);
  if (len !== b64.length) throw new Error(`${varName} 注入不完整：${len} ≠ ${b64.length}`);
  return path.basename(file);
}

console.log('目标页面：', page.url);
const subsName = await pushB64('__subsB64', SUBS);
const mediaName = MEDIA ? await pushB64('__mediaB64', MEDIA) : '';

/** base64 → Uint8Array 都在页面里做，结果留在 window 上（把几 MB 字节数组回传到 Node 没意义） */
const prep = async (fromVar, toVar) => {
  const n = await ev(`(()=>{const b=atob(window.${fromVar});const u=new Uint8Array(b.length);
    for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);window.${toVar}=u;window.${fromVar}='';return u.length;})()`);
  console.log(`  ${toVar}: ${n} 字节已就绪`);
};

const setFiles = async (selector, name, type, bytesVar) => ev(`(()=>{
  const bytes = window.${bytesVar};
  if (!bytes) return 'NO_BYTES';
  const inp = document.querySelector(${JSON.stringify(selector)});
  if (!inp) return 'NO_INPUT';
  const file = new File([bytes], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} });
  /* 桌面 Chrome 认 DataTransfer；安卓 WebView 里 dt.items.add(File) 是**静默空操作**
     （实测 dt.files 仍为空），所以退一步用 defineProperty 把 files 遮成数组 ——
     页面读的是 e.target.files?.[0]，两种形态都吃得下。 */
  let how = 'datatransfer';
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    if (dt.files && dt.files.length) inp.files = dt.files; else throw new Error('empty');
  } catch {
    Object.defineProperty(inp, 'files', { value: [file], configurable: true, writable: true });
    how = 'defineProperty';
  }
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  window.${bytesVar} = '';
  return 'dispatched(' + how + '):' + file.size;
})()`);

await prep('__subsB64', '__subsBytes');
if (MEDIA) {
  console.log('① 先走媒体（App 的处理器会顺带弹出系统选择器 —— 之后在手机上点一下取消，不影响导入）');
  await prep('__mediaB64', '__mediaBytes');
  console.log('  ', await setFiles('input[accept^="video/"]', mediaName, 'audio/mp4', '__mediaBytes'));
}
console.log('② 再走字幕（onChange 会读 pendingMedia，两者一起存进 IndexedDB）');
console.log('  ', await setFiles('input[accept^=".srt"]', subsName, 'application/json', '__subsBytes'));

const state = await ev(`(()=>{const n=(s)=>(s||'').replace(/\\s+/g,'');const t=n(document.body.innerText);
  const v=document.querySelector('video');
  return JSON.stringify({path:location.pathname,计数:(t.match(/\\d+\\/\\d+/)||['无'])[0],
    有播放器:!!v,时长:v?Math.round(v.duration||0):0,仅字幕:t.includes('仅字幕课程'),
    提示:(t.match(/(保存失败[^]{0,30}|装不下[^]{0,30}|没解析出[^]{0,40})/)||[''])[0],崩:t.includes('页面出错')});})()`);
console.log('③ 界面实况：', state);
ws.close();
