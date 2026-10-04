#!/usr/bin/env node
/**
 * verify-cloud-sync-hygiene.mjs — 云同步三条不变量的行为守卫。
 *
 * 覆盖本轮修掉的三件事（原先都是"静默"的，静态检查看不见）：
 *   ① **下行回声**：`syncDown` 用 `safeStorage.setItem` 落地云端数据，而 safeStorage 每次写入
 *      都会同步调用注册过的双写处理器（`safe-storage.ts:170-177`）→ 刚下载的键进 pendingRef
 *      → 3 秒后再 POST 回云端。登录后什么都没做，也会每 5 分钟把全量数据来回搬一遍。
 *   ② **失败全静默**：三个空 `catch`，且 `syncing`/`lastSync` 没有任何组件消费。
 *   ③ **周期任务无条件全量 syncUp**：`syncDown().then(() => syncUp())` 每 5 分钟整份重推。
 *
 * 后续扩容（2026-10-05，task #36）又盖上两件"订阅了等于没订阅"的事：
 *   ④ **模块级缓存的库**：`custom-words` / `word-notes` / `quickcard-history` 有 `let _cache`，
 *      `useSyncDown(() => setWords(read()))` 里 read() 命中陈旧缓存 —— 下行重读变摆设，
 *      且本机旧内存会在下次写入时把云端新值盖回去。现在要求重读前先作废缓存：④b 静态断言形态，
 *   ⑤ **编译三个库真跑**"不作废拿旧值（正对照）→ 作废拿新值"，把缓存本体的失效语义也钉住。
 *   另：④ 的订阅者清单扩到 13 个（新增句子复习/成就/自定义场景/TTS 设置/拼写句子库/闪卡留档），
 *   其中 `use-spelling-learning` 有两个无条件回写 effect，必须配完整回声守卫（引用比对 + 序列化比对）。
 *
 * 做法：把真实的 `use-cloud-sync.ts` + `safe-storage.ts` 转译后在 Node 里驱动，
 * 只替换外部边界（react hooks / apiFetch / auth / sonner / localStorage），
 * 因此测的是产品里那份逻辑本身，不是抄一份。
 * 每一步都带脚手架自检：如果本地写入连一次 POST 都触发不了，说明替身接错了，直接 exit 2，
 * 绝不把"没有 POST"当成"回声已被抑制"的绿灯。
 *
 * 用法：node scripts/verify-cloud-sync-hygiene.mjs   （约 10 秒，含两次 3s 防抖等待）
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(process.env.TEMP || '/tmp', 'cloud-sync-hygiene');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────── 外部边界替身 ───────────────────────── */
// localStorage：Map 支撑，键序与 API 都对齐真实实现
const store = new Map();
globalThis.localStorage = {
  get length() { return store.size; },
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(String(k), String(v)); },
  removeItem: (k) => { store.delete(k); },
  key: (i) => [...store.keys()][i] ?? null,
};
const dispatched = [];
// 订阅者要真跑（onSyncDown 收 cb → dispatch 后必须被叫到），所以这里做一份**带注册表**的 window，
// 而不是空的 addEventListener —— 空替身会让"订阅了但从来收不到"这类缺陷测不出来。
const listeners = new Map();
globalThis.window = {
  dispatchEvent: (e) => {
    dispatched.push(e?.type);
    const arr = listeners.get(e?.type) || [];
    // 复制一份再遍历：订阅者在回调里退订不该跳过别人
    for (const fn of [...arr]) { try { fn(e); } catch { /* 页面自己吞，这里也别让守卫崩 */ } }
    return true;
  },
  addEventListener: (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  },
  removeEventListener: (type, fn) => {
    const arr = listeners.get(type) || [];
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  },
};

const posts = [];
// 注意必须走 globalThis：apiFetch 替身每次读的是 globalThis.__getNext，
// 用局部变量重新赋值不会反映到替身里（第一轮就因此把"下行没写入"误判成守卫失效）
globalThis.__getNext = { ok: true, json: async () => ({ data: {} }) };
const getCallCount = { n: 0 };

const REACT_SHIM = `
let __slot = 0;
const __refs = new Map();
export function useRef(init) {
  const key = __slot++;
  if (!__refs.has(key)) __refs.set(key, { current: init });
  return __refs.get(key);
}
export function useCallback(fn) { return fn; }
export function useState(init) { return [typeof init === 'function' ? init() : init, () => {}]; }
export function useEffect() {}
export function useMemo(fn) { return fn(); }
export function resetSlots() { __slot = 0; }
`;
fs.writeFileSync(path.join(TMP, 'react-shim.mjs'), REACT_SHIM);

fs.writeFileSync(path.join(TMP, 'auth-shim.mjs'), `
export function useAuth() { return { isAuthenticated: true }; }
`);

fs.writeFileSync(path.join(TMP, 'api-client-shim.mjs'), `
export async function apiFetch(url, opts) {
  if (opts && opts.method === 'POST') {
    globalThis.__posts.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({ ok: true }) };
  }
  globalThis.__getCalls.n++;
  return globalThis.__getNext;
}
`);

fs.writeFileSync(path.join(TMP, 'sonner-shim.mjs'), `
export const toast = {
  warning: (msg) => { globalThis.__warns.push(msg); },
  error: (msg) => { globalThis.__warns.push(msg); },
  success: (msg) => { globalThis.__warns.push(msg); },
};
`);
globalThis.__posts = posts;
globalThis.__warns = [];
globalThis.__getCalls = getCallCount;

/* ───────────────────────── 转译真实模块 ───────────────────────── */
const compile = (rel, outName, rewrites = []) => {
  let src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const [from, to] of rewrites) src = src.split(from).join(to);
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  fs.writeFileSync(path.join(TMP, outName), js);
  return path.join(TMP, outName);
};

compile('src/lib/safe-storage.ts', 'safe-storage.mjs');
const SYNC_DOWN_MJS = compile('src/lib/sync-down.ts', 'sync-down.mjs', [
  ["from 'react'", "from './react-shim.mjs'"],
]);
compile('src/lib/use-cloud-sync.ts', 'use-cloud-sync.mjs', [
  ["from 'react'", "from './react-shim.mjs'"],
  ["from 'sonner'", "from './sonner-shim.mjs'"],
  ["from './auth-provider'", "from './auth-shim.mjs'"],
  ["from './api-client'", "from './api-client-shim.mjs'"],
  ["from './safe-storage'", "from './safe-storage.mjs'"],
  ["from './sync-down'", "from './sync-down.mjs'"],
]);

// 三个"模块级缓存 + 下行重读"的库：⑤ 段真跑"不先作废缓存就读不到新数据"
for (const [rel, out] of [
  ['src/lib/custom-words.ts', 'custom-words.mjs'],
  ['src/lib/word-notes.ts', 'word-notes.mjs'],
  ['src/lib/quickcard-history.ts', 'quickcard-history.mjs'],
]) {
  compile(rel, out, [
    ["from 'react'", "from './react-shim.mjs'"],
    ["from './sync-down'", "from './sync-down.mjs'"],
    ["from './safe-storage'", "from './safe-storage.mjs'"],
  ]);
}

// 脚手架自检：不允许有未替换成相对路径的 import（否则加载会失败，或拿到 node_modules 里的真 react）
for (const f of ['safe-storage.mjs', 'use-cloud-sync.mjs', 'sync-down.mjs', 'custom-words.mjs', 'word-notes.mjs', 'quickcard-history.mjs']) {
  const bare = [...fs.readFileSync(path.join(TMP, f), 'utf8')
    .matchAll(/^\s*import\s[^;]*?from\s+'([^']*)'/gm)]
    .map((m) => m[1])
    .filter((spec) => !spec.startsWith('.'));
  if (bare.length) {
    console.error(`脚手架错误：${f} 仍有未替换的模块引用 -> ${bare.join(', ')}`);
    process.exit(2);
  }
}

const ss = await import(pathToFileURL(path.join(TMP, 'safe-storage.mjs')).href);
const cs = await import(pathToFileURL(path.join(TMP, 'use-cloud-sync.mjs')).href);
if (typeof cs.useCloudSync !== 'function') {
  console.error('脚手架错误：useCloudSync 没拿到');
  process.exit(2);
}

const reactShim = await import(pathToFileURL(path.join(TMP, 'react-shim.mjs')).href);
reactShim.resetSlots();
const { syncUp, syncDown, registerCloudWrite, needsResync } = cs.useCloudSync();

/* ───────── 自检 S1：本地写入必须能触发一次 POST（否则后面的"没有 POST"毫无意义） ───────── */
registerCloudWrite();
ss.safeStorage.setItem('__nativethink_probe_local', 'v1');
const prefixedProbe = [...store.keys()].find((k) => k.includes('__nativethink_probe_local'));
ok(!!prefixedProbe && store.get(prefixedProbe) === 'v1',
  '脚手架自检：safeStorage 写入真的落到带前缀的 localStorage');
await wait(3400);
ok(posts.length === 1 && posts[0].upserts?.__nativethink_probe_local === 'v1',
  '脚手架自检：本地写入经防抖双写真的 POST 出去了（替身链路是活的）',
  `posts=${JSON.stringify(posts).slice(0, 120)}`);

/* ───────── ① 下行回声：下载后不应产生任何 POST，但数据必须真的落地 ───────── */
posts.length = 0;
dispatched.length = 0;
globalThis.__getNext = { ok: true, json: async () => ({ data: { '__nativethink_learning_stats': '{"from":"cloud"}', '__nativethink_favorites': '[]' } }) };
await syncDown();

const gotStats = [...store.entries()].find(([k]) => k.includes('__nativethink_learning_stats'));
ok(!!gotStats && gotStats[1] === '{"from":"cloud"}',
  '下行数据确实写进了 localStorage（若这一步失败，"没有 POST"只是因为压根没写）',
  gotStats ? String(gotStats[1]) : 'missing');
ok(dispatched.includes('nativethink-sync-down'),
  '下行结束仍广播 nativethink-sync-down（订阅者的刷新机制不能被守卫顺手砍掉）');

await wait(3400);
ok(posts.length === 0,
  '① 下行回声已抑制：syncDown 之后没有任何"把刚下载的数据推回云端"的 POST',
  `posts=${posts.length}`);

/* 正对照（灵敏度）：同一个键、同一个值，在下行之外写一次就必须产生 POST。
   若这条为假，说明上面的绿灯来自替身失效而不是守卫生效。 */
posts.length = 0;
ss.safeStorage.setItem('__nativethink_learning_stats', '{"from":"cloud"}');
await wait(3400);
ok(posts.length === 1 && posts[0].upserts?.__nativethink_learning_stats === '{"from":"cloud"}',
  '正对照：同键同值在本地写一次确实会 POST —— 证明①的"没有 POST"来自回声抑制',
  `posts=${posts.length}`);

/* ───────── ②③ 静态接线 ───────── */
const SYNC = fs.readFileSync(path.join(ROOT, 'src/lib/use-cloud-sync.ts'), 'utf8');
const PROVIDER = fs.readFileSync(path.join(ROOT, 'src/components/CloudSyncProvider.tsx'), 'utf8');
const emptyCatch = [...SYNC.matchAll(/catch\s*\{\s*(?:\/\*[^*]*\*\/\s*)?\}/g)].length;
ok(emptyCatch === 0,
  '② use-cloud-sync 里不再有空 catch（原先三个空 catch 让失败完全静默）',
  `空 catch=${emptyCatch}`);
ok(/warnThrottled\('up'/.test(SYNC) && /warnThrottled\('down'/.test(SYNC),
  '② 上行与下行失败各自有诚实提示（60 秒去抖，不当闹钟）');
ok(/if \(now - lastWarnRef\.current\[which\] < 60_000\) return;/.test(SYNC),
  '② 提示带去抖，离线时不会每 3 秒弹一次');
ok(/if \(applyingRemoteRef\.current\) return;/.test(SYNC),
  '① 双写处理器里显式跳过来自下行的写入（守卫点在唯一的写入路径上）');
ok(/applyingRemoteRef\.current = true;[\s\S]{0,220}finally\s*\{[\s\S]{0,80}applyingRemoteRef\.current = false;/.test(SYNC),
  '① 守卫用 try/finally 包住，异常也不会把守卫永久留在 true');
ok(/if \(needsResync\(\)\) syncUp\(\);/.test(PROVIDER),
  '③ 周期任务不再无条件全量 syncUp，只在有过失败/未落云写入时补推');
ok(/syncDown\(\)\.then\(\(\) => \{\s*syncUp\(\);/.test(PROVIDER),
  '正对照配对：登录那一次仍然全量补推（首启把本地既有数据填满云端，不能被砍）');

/* 前缀过滤的真实作用范围（本轮文档核实的口径，别被改回"只有 __nativethink_ 才同步"的误解） */
ok(/if \(!appKey\.startsWith\(DATA_PREFIX\)\) continue;/.test(SYNC),
  'DATA_PREFIX 过滤仍在 syncUp 全量扫描里（它不是唯一的同步入口）');
const subs = [...fs.readdirSync(path.join(ROOT, 'src/lib'))].filter((f) => f.endsWith('.ts'));
// （旧断言"addEventListener('nativethink-sync-down') 的订阅者 ≥3"已由 ④ 的清单取代：
//   订阅改成 onSyncDown 单点归属后，按字面量数字符串只会数出 0，是假红不是假绿。）

/* needsResync 的行为：成功一次全量补推后应清标记 */
posts.length = 0;
reactShim.resetSlots();
needsResync(); // 仅确认导出存在且可调用
ok(typeof needsResync === 'function', 'needsResync 作为函数导出（provider 每轮读取最新值）');
// 引用稳定性守的是"轮询被反复重建"：provider 把它放进 setInterval 的依赖数组，
// 内联箭头函数会每次 render 换身份，而 setSyncing 本身就会 render → 5 分钟永远走不满
ok(!/needsResync:\s*\(\)\s*=>\s*needsResyncRef\.current/.test(SYNC),
  'needsResync 不在 return 里内联新建（必须 useCallback 稳定，否则周期轮询会被反复重建）');
ok(/const needsResyncProbe = useCallback\(\(\) => needsResyncRef\.current/.test(SYNC),
  'needsResync 走 useCallback 定义的稳定引用');

/* ───────── ④ 下行广播本身真跑（sync-down.ts）+ 订阅者清单 ─────────
 * 历史缺陷：`syncDown` 落地后只有 3 个 hook 重读，其余持陈旧内存态 ——
 * 别的设备改了要重开页面才看见，而且这台一写入就把刚拉下来的新值盖回去。
 * 现在订阅收进 `onSyncDown/useSyncDown` 一个出口，事件名只有一处定义，
 * "谁订阅了"从"文档里的一句话"变成可数的断言。
 */
const sd = await import(pathToFileURL(SYNC_DOWN_MJS).href);
ok(typeof sd.onSyncDown === 'function' && typeof sd.emitSyncDown === 'function' && typeof sd.useSyncDown === 'function',
  '④ sync-down 导出 onSyncDown / emitSyncDown / useSyncDown');
ok(sd.SYNC_DOWN_EVENT === 'nativethink-sync-down',
  '④ 事件名与历史一致（老订阅者不会因为我们改名而收不到）', sd.SYNC_DOWN_EVENT);

// 注入一个私有 target 真跑订阅语义
const mkTarget = () => {
  const map = new Map();
  return {
    calls: 0,
    addEventListener: (t, fn) => { if (!map.has(t)) map.set(t, []); map.get(t).push(fn); },
    removeEventListener: (t, fn) => { const a = map.get(t) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    fire: (t) => { for (const fn of [...(map.get(t) || [])]) fn({ type: t }); },
    size: (t) => (map.get(t) || []).length,
  };
};
{
  const tgt = mkTarget();
  let hits = 0;
  const off = sd.onSyncDown(() => { hits++; }, tgt);
  tgt.fire(sd.SYNC_DOWN_EVENT);
  ok(hits === 1, '④ 下行事件一到，订阅者真的被叫到（不是只 add 了个没人调的函数）', `hits=${hits}`);
  tgt.fire(sd.SYNC_DOWN_EVENT);
  ok(hits === 2, '④ 每次都通知（不是 once 语义）');
  off();
  tgt.fire(sd.SYNC_DOWN_EVENT);
  ok(hits === 2, '④ 退订后不再收到（组件卸载不留悬挂订阅）');
  ok(tgt.size(sd.SYNC_DOWN_EVENT) === 0, '④ 退订把监听器从注册表里摘干净', `left=${tgt.size(sd.SYNC_DOWN_EVENT)}`);

  // 一个坏订阅者不该拖垮其他人。注：真实 EventTarget 本来就会隔离各监听器的异常，
  // 这里的 try/catch 是因为 onSyncDown 也允许被直接函数调用/替身 target 驱动（本段就是这么跑的）——
  // 断言的是"cb 抛错不会外溢到调用方"，不是"浏览器不隔离"。
  const t2 = mkTarget();
  let good = 0;
  sd.onSyncDown(() => { throw new Error('订阅者炸了'); }, t2);
  sd.onSyncDown(() => { good++; }, t2);
  try { t2.fire(sd.SYNC_DOWN_EVENT); } catch { /* 外溢了 —— 下一条断言会变红 */ }
  ok(good === 1, '④ 前一个订阅者抛错不影响后一个（下行要通知全部 hook）', `good=${good}`);
}

// emitSyncDown 走的是同一个事件名，且用得到真 window（页面里靠它唤醒所有订阅者）
{
  let viaWindow = 0;
  const off = sd.onSyncDown(() => { viaWindow++; });   // 默认 target = globalThis.window（本脚本的注册表替身）
  sd.emitSyncDown();
  ok(viaWindow === 1, '④ emitSyncDown() 能让默认 window 上的订阅者收到', `viaWindow=${viaWindow}`);
  ok(dispatched.includes(sd.SYNC_DOWN_EVENT), '④ emitSyncDown 派发的事件名正确');
  off();
}

const SYNC_SRC = fs.readFileSync(path.join(ROOT, 'src/lib/use-cloud-sync.ts'), 'utf8');
ok(/emitSyncDown\(\);/.test(SYNC_SRC) && !/new Event\('nativethink-sync-down'\)/.test(SYNC_SRC),
  '④ syncDown 通过唯一出口发通知（事件名不再在四处散落拼字符串）');

const SUBSCRIBERS = [
  'use-favorites.ts', 'use-learning-stats.ts', 'use-spelling-sentences.ts',
  'use-word-learning.ts', 'use-phrase-learning.ts', 'custom-words.ts', 'word-notes.ts',
  'quickcard-history.ts', 'use-sentence-review.ts', 'use-achievements.ts',
  'use-custom-scenarios.ts', 'tts-settings.ts', 'use-spelling-learning.ts',
];
for (const f of SUBSCRIBERS) {
  const t = fs.readFileSync(path.join(ROOT, 'src/lib', f), 'utf8');
  ok(/useSyncDown\(/.test(t) || /onSyncDown\(/.test(t),
    `④ ${f} 订阅下行后重读（陈旧内存态与"写回盖掉远端"的源头）`);
}
let legacy = 0;
for (const f of subs) {
  const t = fs.readFileSync(path.join(ROOT, 'src/lib', f), 'utf8');
  if (/addEventListener\('nativethink-sync-down'/.test(t)) legacy++;
}
ok(legacy === 0,
  '④ 没有任何 hook 再自己拼事件名（订阅单点归属，正对照：拼回来立刻红）', `legacy=${legacy}`);

/* ④b 模块级缓存的库：重读前必须先作废 _cache —— 否则 useSyncDown 是个摆设（2026-10-05 实修的坑）。
 * 静态只验"接线形态"，缓存本体的失效语义由 ⑤ 段真跑。 */
const CACHE_READERS = [
  { file: 'custom-words.ts', invalidate: 'invalidateCustomWordsCache', reread: 'setWords(getCustomWords())' },
  { file: 'word-notes.ts', invalidate: 'invalidateWordNotesCache', reread: 'setNote(getWordNote(word))' },
  { file: 'quickcard-history.ts', invalidate: 'invalidateQuickCardRunsCache', reread: 'setRuns(listQuickCardRuns(level))' },
];
for (const { file, invalidate, reread } of CACHE_READERS) {
  const t = fs.readFileSync(path.join(ROOT, 'src/lib', file), 'utf8');
  ok(new RegExp(`export function ${invalidate}\\(\\): void \\{\\s*_cache = null;\\s*\\}`).test(t),
    `④b ${file} 导出 ${invalidate}()（把模块级 _cache 置空）`);
  const cb = t.match(/useSyncDown\(\(\) => \{[\s\S]{0,280}?\}\);/);
  ok(!!cb && cb[0].includes(`${invalidate}();`) && cb[0].includes(reread),
    `④b ${file} 的下行重读先 ${invalidate}() 再重读（直接 read() 命中陈旧缓存，重读变摆设）`,
    cb ? `cb=${cb[0].replace(/\s+/g, ' ').slice(0, 140)}` : '没有 useSyncDown(() => { ... }) 形态的回调');
}

// SM-2 / 语块进度有"回写"effect：重读后原样再写一遍会变成一次真实的上行 POST。
// 两道判据都要在：① 对象引用一致（刚从 storage 读进来的那份）就不写；② 序列化后与存储一字不差也不写。
// 真跑量出来的教训（2026-09-30）：只有②的时候浏览器里仍会发生一次回写 ——
// loadState 会补齐缺省字段，重串出来的字节与存储里那份不同。
for (const [f, label] of [['use-word-learning.ts', 'SM-2 词学习'], ['use-phrase-learning.ts', '语块学习']]) {
  const t = fs.readFileSync(path.join(ROOT, 'src/lib', f), 'utf8');
  ok(/if \(safeStorage\.getItem\([^\n]*\) === json\) return;/.test(t),
    `④ ${label} 的 saveState 内容与存储一致时不写`);
  ok(/useSyncDown\(\(\) => \{[\s\S]{0,200}loadedFromStorageRef\.current = next;/.test(t),
    `④ ${label} 的**下行回调里**记下"这份来自 storage"（不是只在换书时记一次）`);
  ok(/if \(loadedFromStorageRef\.current === state\) \{[\s\S]{0,120}return;/.test(t),
    `④ ${label} 的回写 effect 对"刚读进来的那份"直接跳过（回声的真正来源）`);
  ok(/useSyncDown\(\(\) => \{[\s\S]{0,200}setState\(next\)/.test(t),
    `④ ${label} 的下行重读走 useSyncDown 且真的 setState`);
}

// 拼写句子库（use-spelling-learning）有**两个无条件回写 effect**（挂载即写），
// 新增下行订阅必须配完整回声守卫：引用比对是主力（loadState 走 JSON.parse，
// 重串字节可能与存储不完全一致），saveX 里的序列化比对防"挂载时的同值写"。
{
  const t = fs.readFileSync(path.join(ROOT, 'src/lib/use-spelling-learning.ts'), 'utf8');
  ok(/if \(safeStorage\.getItem\(COMPLETED_KEY\) === json\) return;/.test(t),
    '④ 拼写：saveCompletedIds 与存储一致时不写（挂载同值回写也不会上云）');
  ok(/if \(safeStorage\.getItem\(STORAGE_KEY\) === json\) return;/.test(t),
    '④ 拼写：saveState 与存储一致时不写（下行回声的第二道判据）');
  ok(/useSyncDown\(\(\) => \{[\s\S]{0,320}loadedStateRef\.current = nextState;/.test(t),
    '④ 拼写的下行回调里记下"这份来自 storage"（state）');
  ok(/useSyncDown\(\(\) => \{[\s\S]{0,320}loadedCompletedRef\.current = nextCompleted;/.test(t),
    '④ 拼写的下行回调里记下"这份来自 storage"（完成标记）');
  ok(/if \(loadedStateRef\.current === state\) \{[\s\S]{0,160}return;/.test(t),
    '④ 拼写的回写 effect 对"刚读进来的那份"直接跳过（state 回声的真正来源）');
  ok(/if \(loadedCompletedRef\.current === completedSentenceIds\) \{[\s\S]{0,160}return;/.test(t),
    '④ 拼写的回写 effect 对"刚读进来的那份"直接跳过（完成标记回声）');
}

/* ───────── ⑤ 模块级缓存：下行重读真能拿到新数据（行为，不只是接线） ─────────
 * 为什么必须真跑：④b 只证明"回调里调用了 invalidate"，证明不了缓存本体被正确作废。
 * 这里把三个库编译后驱动：本地写 → 走 safeStorage（syncDown 落地用的同一条通道）
 * 模拟云端改存储 → **正对照**不作废时读到旧内存（说明 _cache 真在挡）→ 作废后读到新值。
 * 正对照是灵敏度：没有它，缓存压根没生效时最后一条会假绿。
 * 本段先摘掉双写处理器：这里测缓存语义，不制造会被 POST 的测试数据（也省掉收尾的 3s 防抖等待）。
 */
ss.setCloudSyncHandler(null);
{
  const cw = await import(pathToFileURL(path.join(TMP, 'custom-words.mjs')).href);
  cw.addCustomWord({ word: 'serendipity', phonetic: '', partOfSpeech: 'n.', meaning: '意外之喜' });
  ok(cw.getCustomWords().some((w) => w.word === 'serendipity'), '⑤ 生词本：模块自身写入可见');
  ss.safeStorage.setItem('__nativethink_custom_words', JSON.stringify([
    { word: 'cloudword', phonetic: '', partOfSpeech: 'n.', meaning: '云端词', addedAt: 1 },
  ]));
  const stale = cw.getCustomWords();
  ok(stale.length === 1 && stale[0].word === 'serendipity',
    '⑤ 正对照：不作废缓存时重读拿到的是本机旧内存（证明 _cache 真的在挡）',
    `got=${stale.map((w) => w.word).join(',')}`);
  cw.invalidateCustomWordsCache();
  ok(cw.getCustomWords().some((w) => w.word === 'cloudword'),
    '⑤ 生词本：作废缓存后重读拿到云端新值（下行重读不是摆设）');
}
{
  const wn = await import(pathToFileURL(path.join(TMP, 'word-notes.mjs')).href);
  wn.setWordNote('ephemeral', '本机旧助记');
  ok(wn.getWordNote('ephemeral') === '本机旧助记', '⑤ 词助记：模块自身写入可见');
  ss.safeStorage.setItem('__nativethink_word_notes', JSON.stringify({ ephemeral: '云端新助记' }));
  const staleNote = wn.getWordNote('ephemeral');
  ok(staleNote === '本机旧助记',
    '⑤ 正对照：不作废缓存时助记重读仍是旧值', `got=${staleNote}`);
  wn.invalidateWordNotesCache();
  ok(wn.getWordNote('ephemeral') === '云端新助记',
    '⑤ 词助记：作废缓存后重读拿到云端新值');
}
{
  const qc = await import(pathToFileURL(path.join(TMP, 'quickcard-history.mjs')).href);
  qc.saveQuickCardRun({ level: 'cet4', known: 1, unknown: 0, words: [{ word: 'local', known: true }] });
  ok(qc.listQuickCardRuns('cet4').length === 1, '⑤ 闪卡留档：模块自身写入可见');
  ss.safeStorage.setItem('__nativethink_quickcard_runs', JSON.stringify([
    { id: 'cloud_run', level: 'cet4', at: 2, known: 0, unknown: 1, words: [{ word: 'cloud', known: false }] },
  ]));
  const staleRuns = qc.listQuickCardRuns('cet4');
  ok(staleRuns.length === 1 && staleRuns[0].id !== 'cloud_run',
    '⑤ 正对照：不作废缓存时留档重读仍是本机旧内存', `ids=${staleRuns.map((r) => r.id).join(',')}`);
  qc.invalidateQuickCardRunsCache();
  const freshRuns = qc.listQuickCardRuns('cet4');
  ok(freshRuns.length === 1 && freshRuns[0].id === 'cloud_run',
    '⑤ 闪卡留档：作废缓存后重读拿到云端新值');
}

/* ───────────────────────── 汇总 ───────────────────────── */
const failed = results.filter((r) => !r.pass);
for (const r of failed) console.log(`  ✗ ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
console.log(`\n断言 ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) { console.log('✗ 有失败'); process.exit(1); }
console.log('✓ 云同步：回声已抑制、失败有提示、周期补推按需、13 个订阅者重读、三处缓存作废真跑');
