#!/usr/bin/env node
/**
 * wordbank detail 拆分的验证工具（V4）。
 *
 * 两种模式：
 *   node scripts/verify-wordbank-split.mjs --baseline <out.json>   拆分前采集基线
 *   node scripts/verify-wordbank-split.mjs --check    <in.json>    拆分后逐项断言
 *
 * 用 tsc 转译加载数据、不用正则：数据文件是 TS 对象字面量且存在两种引号风格
 * （zhongkao/gaokao/postgraduate/professional 用单引号），正则方案会静默漏掉这 4 个等级。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../src/data/wordbank/data');
const LEVELS = ['zhongkao', 'gaokao', 'cet4', 'cet6', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'];
const TMP = path.join(process.env.TEMP || '/tmp', 'wb-verify-load');
fs.mkdirSync(TMP, { recursive: true });

/** 转译一个 TS 数据模块并返回其导出的数组（导出名含 WORDS 或 DETAIL） */
export async function loadModule(file, kind) {
  const src = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const tmp = path.join(TMP, `${path.basename(file, '.ts')}.mjs`);
  fs.writeFileSync(tmp, js);
  const mod = await import(pathToFileURL(tmp).href);
  const key = Object.keys(mod).find((k) => k.toUpperCase().includes(kind));
  if (!key) throw new Error(`${file}: 未找到含 ${kind} 的导出（实际导出：${Object.keys(mod).join(',')}）`);
  return mod[key];
}

const fail = [];
const ok = (cond, msg) => { if (!cond) fail.push(msg); };

async function collect() {
  const out = {};
  for (const lv of LEVELS) {
    const core = await loadModule(path.join(DATA_DIR, `${lv}.ts`), 'WORDS');
    const detailFile = path.join(DATA_DIR, `${lv}.detail.ts`);
    const detail = fs.existsSync(detailFile) ? await loadModule(detailFile, 'DETAIL') : null;
    out[lv] = { core, detail };
  }
  return out;
}

/** 与 wordbank.ts 的 ensureIndexes() 一致：同等级内**首次出现者胜**（索引与界面展示的都是第一条） */
function firstWins(core) {
  const seen = new Set();
  const out = [];
  for (const e of core) {
    const k = e.word.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

async function baseline(outFile) {
  const data = await collect();
  const snap = { levels: {} };
  for (const lv of LEVELS) {
    const { core } = data[lv];
    // 按位置记录：同等级内存在重复词条（如 professional 的 "facet"），
    // 用 word→bool 的映射会互相覆盖，无法表达"第一条"与"第二条"的差异。
    const words = core.map((e) => e.word);
    const hasCollocationsByIndex = core.map((e) => Array.isArray(e.collocations) && e.collocations.length > 0);
    // collocOnly 的真实作用对象是去重后的条目（queryWords 返回 _levelIndex）
    const collocOnlyIds = firstWins(core)
      .filter((e) => e.collocations.length > 0)
      .map((e) => e.word.toLowerCase())
      .sort();
    snap.levels[lv] = { count: core.length, words, hasCollocationsByIndex, collocOnlyIds };
  }
  fs.writeFileSync(outFile, JSON.stringify(snap));
  console.log(`基线已写入 ${outFile}`);
  for (const lv of LEVELS) {
    const s = snap.levels[lv];
    console.log(`  ${lv.padEnd(13)} ${String(s.count).padStart(6)} 条  去重后 ${String(firstWins(data[lv].core).length).padStart(6)}  collocOnly=${s.collocOnlyIds.length}`);
  }
}

async function check(baselineFile) {
  const snap = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  const data = await collect();

  for (const lv of LEVELS) {
    const base = snap.levels[lv];
    const { core, detail } = data[lv];

    // ① 条目数与 hasCollocations 按位置逐条一致（按位置才能区分重复词条）
    ok(core.length === base.count, `${lv}: 条目数 ${core.length} ≠ 基线 ${base.count}`);
    for (let i = 0; i < core.length; i++) {
      if (core[i].word !== base.words[i]) {
        fail.push(`${lv}[${i}]: 词条顺序与基线不同（${core[i].word} ≠ ${base.words[i]}）`);
        continue;
      }
      const expect = base.hasCollocationsByIndex[i];
      if (core[i].hasCollocations !== expect) {
        fail.push(`${lv}[${i}] ${core[i].word}: hasCollocations=${core[i].hasCollocations} ≠ 基线 ${expect}`);
      }
    }

    // ② detail 源文件存在，且核心占位必须为空（证明拆分干净）
    if (!detail) {
      fail.push(`${lv}: 缺少 ${lv}.detail.ts`);
    } else {
      for (const e of core) {
        if (e.collocations.length || e.examples.length || e.deepExplanation) {
          fail.push(`${lv}/${e.word}: 核心文件仍含真实 detail（未拆分干净）`);
          break;
        }
      }
    }

    // ③ collocOnly 结果集（用 hasCollocations，作用在去重后的条目上）与基线完全相同
    const nowIds = firstWins(core).filter((e) => e.hasCollocations).map((e) => e.word.toLowerCase()).sort();
    ok(JSON.stringify(nowIds) === JSON.stringify(base.collocOnlyIds),
      `${lv}: collocOnly 结果集与基线不同（基线 ${base.collocOnlyIds.length} / 现在 ${nowIds.length}）`);
  }

  // ④ applyDetail 必须就地修改：验证共享引用
  await checkApplyDetail(data);

  if (fail.length) {
    console.log(`FAIL：${fail.length} 项`);
    for (const m of fail.slice(0, 20)) console.log('  - ' + m);
    process.exit(1);
  }
  console.log(`全部断言通过（9 个等级，共 ${LEVELS.reduce((s, l) => s + snap.levels[l].count, 0)} 条词条）`);
}

/**
 * ④ 把真实 wordbank.ts 转译后调用其真实的 applyDetail，
 *    并断言「索引里持有的同一批对象」也被更新（防 applyDetail 被写成重建对象）。
 */
async function checkApplyDetail(data) {
  const wbFile = path.resolve(__dirname, '../src/data/wordbank/wordbank.ts');
  let src = fs.readFileSync(wbFile, 'utf8');
  // 替换运行时依赖为桩，其余源码不改
  src = src.replace(/^import \{ idbGet, idbSet \} from '@\/lib\/idb';$/m,
    'const idbGet = async () => null; const idbSet = async () => {};');
  src = src.replace(/^import type \{[^}]*\} from '\.\/schema';$/m, '');
  // 若 applyDetail 尚不存在（例如在 Task 2 之前误跑 --check），给出明确提示而不是 ReferenceError
  if (!/function applyDetail/.test(src)) {
    fail.push('wordbank.ts 中尚无 applyDetail —— --check 只能在 Task 2 完成后运行（Task 1 阶段只跑 --baseline）');
    return;
  }
  // 静态守卫：levels.map(loadLevel) 会把 map 传的索引当成 withDetail，
  // 导致第一个等级（索引 0，falsy）永远不加载 detail —— 不报错，界面只是空着。
  ok(!/levels\.map\(loadLevel\)/.test(src),
    'preloadLevels 用了 levels.map(loadLevel) —— map 的索引会被当作 withDetail，第一个等级不会加载 detail');
  src += '\nexport { applyDetail, _levelCache };\n';
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const tmp = path.join(TMP, 'wordbank-under-test.mjs');
  fs.writeFileSync(tmp, js);
  const wb = await import(pathToFileURL(tmp).href);

  const lv = 'advanced';
  const core = data[lv].core;
  const detail = data[lv].detail;
  if (!detail) { fail.push('advanced: 无 detail，跳过 ④'); return; }

  wb._levelCache[lv] = core;
  // 模拟 ensureIndexes 的行为：把同一批对象引用放进"索引"
  const indexRefs = core.slice(0, 50);
  const sample = indexRefs.find((e) => detail[e.word.toLowerCase()]);
  if (!sample) { fail.push('advanced: 前 50 条中没有带 detail 的词，无法验证 ④'); return; }

  const beforeLen = sample.collocations.length + sample.examples.length;
  wb.applyDetail(lv, detail);
  const afterLen = sample.collocations.length + sample.examples.length;
  ok(afterLen > beforeLen, `④ applyDetail 未生效（${beforeLen} → ${afterLen}）`);

  const fromIndex = indexRefs.find((e) => e.word === sample.word);
  ok(fromIndex && (fromIndex.collocations.length + fromIndex.examples.length) > beforeLen,
    '④ 索引中持有的对象未被更新 —— applyDetail 很可能被写成重建对象（共享引用已断）');
}

const argv = process.argv.slice(2);
const bi = argv.indexOf('--baseline');
const ci = argv.indexOf('--check');
if (bi >= 0) await baseline(argv[bi + 1]);
else if (ci >= 0) await check(argv[ci + 1]);
else { console.error('用法: --baseline <out.json> | --check <in.json>'); process.exit(2); }
