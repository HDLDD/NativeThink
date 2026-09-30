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
globalThis.window = {
  dispatchEvent: (e) => { dispatched.push(e?.type); return true; },
  addEventListener: () => {},
  removeEventListener: () => {},
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
compile('src/lib/use-cloud-sync.ts', 'use-cloud-sync.mjs', [
  ["from 'react'", "from './react-shim.mjs'"],
  ["from 'sonner'", "from './sonner-shim.mjs'"],
  ["from './auth-provider'", "from './auth-shim.mjs'"],
  ["from './api-client'", "from './api-client-shim.mjs'"],
  ["from './safe-storage'", "from './safe-storage.mjs'"],
]);

// 脚手架自检：不允许有未替换成相对路径的 import（否则加载会失败，或拿到 node_modules 里的真 react）
for (const f of ['safe-storage.mjs', 'use-cloud-sync.mjs']) {
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
let subCount = 0;
for (const f of subs) {
  const t = fs.readFileSync(path.join(ROOT, 'src/lib', f), 'utf8');
  if (/addEventListener\('nativethink-sync-down'/.test(t)) subCount++;
}
ok(subCount >= 3,
  '下行事件的订阅者不少于 3 个（历史缺陷是"下行后多数 hook 仍持陈旧内存态"，只增不减）',
  `subscribers=${subCount}`);

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

/* ───────────────────────── 汇总 ───────────────────────── */
const failed = results.filter((r) => !r.pass);
for (const r of failed) console.log(`  ✗ ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
console.log(`\n断言 ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) { console.log('✗ 有失败'); process.exit(1); }
console.log('✓ 云同步：回声已抑制、失败有提示、周期补推按需');
