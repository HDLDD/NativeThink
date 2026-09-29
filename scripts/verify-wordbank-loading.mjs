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
// meta.ts 是纯常量（无数据依赖），照样桩成 .mjs 再导入
fs.writeFileSync(path.join(OUT, 'meta.mjs'),
  tr(fs.readFileSync(path.join(ROOT, 'meta.ts'), 'utf8')));
wb = wb.replace(/from '\.\/meta'/g, "from './meta.mjs'");
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

// ⑥ detail 加载失败必须不污染状态 —— 这是 GlobalWordSearch「重试」按钮的前提
const ieltsDetailPath = path.join(OUT, 'data', 'ielts.detail.mjs');
fs.writeFileSync(ieltsDetailPath, 'throw new Error("simulated detail load failure");\n');
let threw = false;
try { await wbmod.preloadDetail(['ielts']); } catch { threw = true; }
ok(threw === false, 'preloadDetail 失败时不向上抛错（调用方按空 detail 降级）');
ok(wbmod.isDetailReady('ielts') === false,
  '失败后 isDetailReady 仍为 false（未被错误标记成“已加载”，否则重试会永久失效）');
ok(wbmod.queryWords({ level: 'ielts', limit: 5 }).every((w) => w.examples.length === 0),
  '失败后该等级 detail 为空，但核心查询仍可用');

// ⑦ 实测结论（锁进断言，防止把 UI 改回“原地重试”这个无效方案）：
//    失败的模块加载会被 JS 模块表缓存，再次 import 同一 specifier 不会重新求值。
//    因此 GlobalWordSearch 失败时给的是「刷新页面」——只有新的 JS realm 才会重新拉取 chunk。
fs.writeFileSync(ieltsDetailPath, tr(fs.readFileSync(path.join(ROOT, 'data', 'ielts.detail.ts'), 'utf8')));
await wbmod.preloadDetail(['ielts']);
const retriedOk = wbmod.isDetailReady('ielts');
ok(retriedOk === false,
  '失败模块被模块表缓存：原地重试不会重新求值（故 UI 用「刷新页面」而非原地重试）',
  `isDetailReady(ielts)=${retriedOk}`);

// ⑧ 池子与词书数字同源 —— 锁住「词书写 7,404、快速闪卡只有 2,127」这个 bug 的修法。
//    旧算法只用一个 `seen` 贯穿所有等级，谁先遍历到谁独占该词：
//    九本全载时 考研池子=0、六级只剩 2,127，而且数字随"哪几本被加载"变化。
{
  const meta = await import(pathToFileURL(path.join(OUT, 'meta.mjs')).href);
  // 从数据文件独立算出"书内唯一词数"与"跨书唯一词数"，作为不依赖被测代码的参照
  const own = {};
  const globalWords = new Set();
  for (const lv of LEVELS) {
    const m = await import(pathToFileURL(path.join(OUT, 'data', `${lv}.mjs`)).href);
    const arr = m[Object.keys(m).find((k) => /WORDS/.test(k))];
    const set = new Set(arr.map((w) => String(w.word).toLowerCase()));
    own[lv] = set.size;
    for (const w of set) globalWords.add(w);
  }

  // 只加载一本时的池子
  await wbmod.preloadCoreOnly(['professional']);
  const alone = wbmod.queryWords({ level: 'professional', limit: 99999 }).length;
  ok(alone === own.professional, `只加载「专业」时池子 = 书内唯一词数 ${own.professional}`, `实际 ${alone}`);

  // 再把九本全加载：新逻辑下每本都不许被别人抢走
  await wbmod.preloadCoreOnly(LEVELS);
  const pools = {};
  for (const lv of LEVELS) pools[lv] = wbmod.queryWords({ level: lv, limit: 99999 }).length;

  for (const lv of LEVELS) {
    ok(pools[lv] === own[lv], `${lv} 池子 = 书内唯一词数`, `池 ${pools[lv]} / 唯一 ${own[lv]}`);
    ok(meta.WORD_COUNTS[lv] === own[lv], `${lv} 词书卡显示数 WORD_COUNTS = 唯一词数`, `表 ${meta.WORD_COUNTS[lv]} / 实际 ${own[lv]}`);
  }
  ok(pools.professional === alone,
    '九本全载后「专业」池子不缩水（跨书去重已改为书内去重）', `${alone} → ${pools.professional}`);
  ok(pools.postgraduate > 0,
    '正对照：考研池子不再是 0（旧算法九本全载时它是 0）', `实际 ${pools.postgraduate}`);
  ok(pools.cet6 === 7404,
    '用户报的具体症状：六级闪卡池子 = 词书显示的 7,404', `实际 ${pools.cet6}`);

  // 「全部」= 跨书一词一卡，不能是各本相加
  const total = wbmod.getTotalLearnableCount();
  const allArr = wbmod.getAllWords();
  const allSet = new Set(allArr.map((w) => String(w.word).toLowerCase()));
  const sum = LEVELS.reduce((a, lv) => a + pools[lv], 0);
  ok(total === globalWords.size, `全部模式池子 = 数据算出的跨书唯一词数 ${globalWords.size}`, `实际 ${total}`);
  ok(allArr.length === total, 'getTotalLearnableCount ≡ getAllWords().length', `${total} vs ${allArr.length}`);
  ok(allSet.size === allArr.length, '全部模式内不含重复词卡', `唯一 ${allSet.size} / 总 ${allArr.length}`);
  ok(total < sum, '全部 ≠ 各本相加（词书是累积式的，相加会重复计数）', `全部 ${total} / 相加 ${sum}`);
  ok(total === meta.TOTAL_UNIQUE_WORDS, `全部 = 表列唯一词数 ${meta.TOTAL_UNIQUE_WORDS}`, `实际 ${total}`);

  // 反证：旧算法确实会产生这些错值（证明本脚本的判据有鉴别力，不是恒真）
  const legacySeen = new Set(); const legacy = {};
  for (const lv of LEVELS) {
    legacy[lv] = 0;
    const arr = wbmod.getWordsByLevel()[lv] || [];
    for (const w of arr) { const k = String(w.word).toLowerCase(); if (!legacySeen.has(k)) { legacySeen.add(k); legacy[lv]++; } }
  }
  ok(legacy.postgraduate === 0 && legacy.cet6 < 3000,
    '正对照可复现：旧口径下考研=0、六级<3000（说明新断言真的在区分两种行为）',
    `旧 考研=${legacy.postgraduate} 六级=${legacy.cet6}`);
}

// ── ⑦ 缓存写入：IDB 成功就不再镜像 localStorage；IDB 挂了才兜底 ──
{
  // 上面已经把 9 个等级都加载过一遍（idb 桩是"写成功"），此刻 localStorage 里不该有任何词库键。
  // 旧实现是无条件双写：单本级 JSON 3~12MB，而 localStorage 配额只有 5MB ——
  // 每次加载词书都要先付一次几 MB 的**同步 stringify**，再吃一发注定失败的 QuotaExceeded。
  const mirrored = [...store.keys()].filter((k) => /__nativethink_wb/.test(k));
  ok(mirrored.length === 0, 'IDB 写成功时不往 localStorage 镜像词库（省掉每次几 MB 的同步 stringify）',
    mirrored.join(','));

  // 反面对照：IDB 用不了（隐私模式 / 老 WebView）时，兜底必须还在
  const noIdbDir = path.join(OUT, 'noidb');
  fs.mkdirSync(noIdbDir, { recursive: true });
  fs.copyFileSync(path.join(OUT, 'meta.mjs'), path.join(noIdbDir, 'meta.mjs'));
  fs.cpSync(path.join(OUT, 'data'), path.join(noIdbDir, 'data'), { recursive: true });
  const srcNoIdb = fs.readFileSync(path.join(OUT, 'wordbank.mjs'), 'utf8')
    .replace(/const idbGet = async \(\) =>[^;]*;\s*const idbSet = async \(\) =>[^;]*;/,
      'const idbGet = async () => { throw new Error("no idb"); }; const idbSet = async () => { throw new Error("no idb"); };');
  ok(/throw new Error\("no idb"\)/.test(srcNoIdb),
    '脚手架自检：IDB 桩确实换成了"抛错"版（没换就等于没测兜底）');
  fs.writeFileSync(path.join(noIdbDir, 'wordbank-noidb.mjs'), srcNoIdb);
  const before = store.size;
  const m2 = await import(pathToFileURL(path.join(noIdbDir, 'wordbank-noidb.mjs')).href);
  await m2.preloadCoreOnly(['ielts']);
  const fallbackKeys = [...store.keys()].filter((k) => /__nativethink_wb_/.test(k));
  ok(fallbackKeys.length > 0 && store.size > before,
    '正对照：IDB 不可用时仍回写 localStorage（兜底没被顺手删掉）', fallbackKeys.join(','));
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log((r.pass ? 'PASS  ' : 'FAIL  ') + r.name + (r.detail ? '  [' + r.detail + ']' : ''));
}
console.log('---');
console.log(failed === 0 ? `全部 ${results.length} 项通过` : `${failed} 项失败`);
fs.rmSync(OUT, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
