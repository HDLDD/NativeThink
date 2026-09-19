#!/usr/bin/env node
/**
 * wordbank 加载层的集成验证（运行时级）。
 *
 * 与 verify-wordbank-split.mjs（数据层断言）互补：本脚本把**真实的模块图**整体
 * 转译到临时目录后在 Node 里驱动真实的 loadCore / loadLevel / loadDetail / applyDetail，
 * 因此能验证数据层断言覆盖不到的两条关键链路：
 *   1. preloadLevels 是否对**第一个等级**也加载 detail
 *      （若写成 `levels.map(loadLevel)`，map 会把索引当作第二参数 withDetail，
 *        索引 0 为 falsy → 第一个等级永远不加载 detail，且不报错）
 *   2. applyDetail 的就地补齐是否**穿透到 queryWords**
 *      （queryWords 返回的是 _levelIndex 里持有的对象；若 applyDetail 重建对象，
 *        索引仍指向旧对象，detail 永远不可见且不报错）
 *
 * 用法: node scripts/verify-wordbank-loading.mjs
 *
 * 说明：转译产物放在 %TEMP%，脚本结束即清理。仅做两处机械处理，不改业务逻辑：
 *   - 把 `@/lib/idb` 换成本地桩（Node 无 IndexedDB）
 *   - 给无扩展名的动态导入补 `.mjs`（Node ESM 要求显式扩展名；Vite 不需要）
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/data/wordbank');
const OUT = path.join(process.env.TEMP || '/tmp', 'wb-loading-check');
const LEVELS = ['zhongkao', 'gaokao', 'cet4', 'cet6', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });

const tr = (src) => ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;

// ── wordbank.ts：桩掉 idb，补齐动态导入扩展名，逻辑不改 ──
let wb = fs.readFileSync(path.join(ROOT, 'wordbank.ts'), 'utf8');
wb = wb.replace(/^import \{ idbGet, idbSet \} from '@\/lib\/idb';$/m,
  'const idbGet = async () => null; const idbSet = async () => {};');
for (const lv of LEVELS) wb = wb.split(`'./data/${lv}'`).join(`'./data/${lv}.mjs'`);
// 注意等级名含数字（cet4/cet6），字符类必须包含 0-9
wb = wb.replace(/'(\.\/data\/[a-z0-9]+)\.detail'/g, "'$1.detail.mjs'");

// 脚手架自检：仍有未补扩展名的动态导入就立刻报错，避免把脚手架问题误判成产品缺陷
const leftover = [...wb.matchAll(/import\('(\.\/data\/[^']+)'\)/g)]
  .map((m) => m[1]).filter((s) => !s.endsWith('.mjs'));
if (leftover.length) {
  console.error('脚手架错误：仍有未补扩展名的动态导入 -> ' + leftover.join(', '));
  process.exit(2);
}
fs.writeFileSync(path.join(OUT, 'wordbank.mjs'), tr(wb));

for (const lv of LEVELS) {
  fs.writeFileSync(path.join(OUT, 'data', `${lv}.mjs`),
    tr(fs.readFileSync(path.join(ROOT, 'data', `${lv}.ts`), 'utf8')));
  fs.writeFileSync(path.join(OUT, 'data', `${lv}.detail.mjs`),
    tr(fs.readFileSync(path.join(ROOT, 'data', `${lv}.detail.ts`), 'utf8')));
}

// ── 浏览器 API 桩 ──
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  get length() { return store.size; },
  key: (i) => [...store.keys()][i] ?? null,
};

const wbmod = await import(pathToFileURL(path.join(OUT, 'wordbank.mjs')).href);

const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });

// ① preloadCoreOnly 不加载 detail，查询结果的 detail 字段为空占位
await wbmod.preloadCoreOnly(['advanced']);
ok(wbmod.isDetailReady('advanced') === false, 'preloadCoreOnly 不加载 detail');
const coreOnly = wbmod.queryWords({ level: 'advanced', limit: 20 });
ok(coreOnly.length === 20 && coreOnly.every((w) => w.examples.length === 0 && w.collocations.length === 0),
  '仅核心时 queryWords 返回的词条 detail 为空', `n=${coreOnly.length}`);

// ② preloadLevels 必须对第一个等级（索引 0）也加载 detail —— 直测 map 传参陷阱
await wbmod.preloadLevels(['cet4', 'cet6']);
ok(wbmod.isDetailReady('cet4') === true && wbmod.isDetailReady('cet6') === true,
  'preloadLevels 对第一个等级（索引 0）也加载 detail（map 陷阱已避开）',
  `cet4=${wbmod.isDetailReady('cet4')} cet6=${wbmod.isDetailReady('cet6')}`);

// ③ preloadDetail 后的就地补齐必须穿透到 queryWords（共享引用链路）
await wbmod.preloadDetail(['advanced']);
ok(wbmod.isDetailReady('advanced') === true, 'preloadDetail 后 isDetailReady=true');
const after = wbmod.queryWords({ level: 'advanced', limit: 99999 });
const faucet = after.find((w) => w.word.toLowerCase() === 'faucet');
ok(!!faucet, '能在高级词库中找到 faucet');
ok(faucet && faucet.collocations.includes('water faucet'),
  'queryWords 返回的词条已带上 detail（collocations 含 water faucet）',
  faucet ? JSON.stringify(faucet.collocations) : 'n/a');
ok(faucet && faucet.examples.length >= 1, 'faucet 已带例句', faucet ? `examples=${faucet.examples.length}` : 'n/a');

// ④ hasCollocations 必须恒等于 collocations.length > 0（detail 加载后）
const mismatch = after.filter((w) => w.hasCollocations !== (w.collocations.length > 0));
ok(mismatch.length === 0, 'hasCollocations ≡ collocations.length>0（detail 加载后）',
  `检查 ${after.length} 条，不一致 ${mismatch.length} 条`);

// ⑤ 未加载 detail 的等级，detail 仍为空
await wbmod.preloadCoreOnly(['toefl']);
ok(wbmod.isDetailReady('toefl') === false, 'preloadCoreOnly 对第二个等级同样不加载 detail');
ok(wbmod.queryWords({ level: 'toefl', limit: 10 }).every((w) => w.examples.length === 0), 'toefl 仅核心时无例句');

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log((r.pass ? 'PASS  ' : 'FAIL  ') + r.name + (r.detail ? '  [' + r.detail + ']' : ''));
}
console.log('---');
console.log(failed === 0 ? `全部 ${results.length} 项通过` : `${failed} 项失败`);
fs.rmSync(OUT, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
