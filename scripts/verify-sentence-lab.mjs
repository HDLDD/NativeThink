#!/usr/bin/env node
/**
 * verify-sentence-lab.mjs — 拆句训练「主干判定」的索引同源守卫。
 *
 * 起因（读代码逐行核实，见 docs/modules/sentence-lab.md §3.1/§3.2）：
 *   候选按钮来自 `stdParts = splitByBreaks(item.en, standardBreaks(item))`，
 *   而评分用 `item.segments[backbonePick]?.r === 'core'`。两者只在断点一个都没丢的时候等长。
 *   `standardBreaks` 有两处会丢断点（`sentence-parse.ts:88-90`）：
 *     · 意群起点找不到对应的词起点 → `findIndex` 返回 -1 → continue；
 *     · 两个意群起点落在同一个词 → `Set` 去重。
 *   一旦少一段，索引整体错位：用户点了真正的主干却被判选错，且不报错。
 *   另一个假成功：定位失败时 `breaks` 是空集，"什么都不切"会被算成
 *   「断句完全正确 · 0 处断点全中」。
 *
 * A 段用真转译的 `sentence-parse.ts` 把这两种分歧**跑出来**（不是引用注释里的说法），
 * B 段守 ChunkDrill 的接线：候选来自 resolved、评分与候选同源、定位失败时不判分也不计时长。
 *
 * 用法：node scripts/verify-sentence-lab.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(process.env.TEMP || '/tmp', 'sentence-lab-check');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });

/* ───────────── A. 真跑 sentence-parse ───────────── */
const SRC = path.join(ROOT, 'src/lib/sentence-parse.ts');
const raw = fs.readFileSync(SRC, 'utf8');
// 该模块只 import 类型（ISentenceLabItem 等），剥掉后就是纯函数
const stripped = raw.split(/\r?\n/).filter((ln) => !/^\s*import\s/.test(ln)).join('\n');
if (/^\s*import\s/m.test(stripped)) { console.error('脚手架错误：仍有未剥离的 import'); process.exit(2); }
const js = ts.transpileModule(stripped, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const outFile = path.join(TMP, 'sentence-parse-under-test.mjs');
fs.writeFileSync(outFile, js);
const m = await import(pathToFileURL(outFile).href);
for (const fn of ['resolveSegments', 'standardBreaks', 'splitByBreaks', 'tokenize']) {
  if (typeof m[fn] !== 'function') { console.error(`脚手架错误：没导出 ${fn}`); process.exit(2); }
}

// A1 脚手架自检：正常数据下三者长度一致
const good = {
  id: 'g1',
  en: 'The teacher handed out the papers before class started.',
  segments: [
    { t: 'The teacher', r: 'core' },
    { t: 'handed out', r: 'core' },
    { t: 'the papers', r: 'core' },
    { t: 'before class started', r: 'extra' },
  ],
};
const goodResolved = m.resolveSegments(good);
const goodBreaks = m.standardBreaks(good);
const goodParts = m.splitByBreaks(good.en, goodBreaks);
ok(!!goodResolved && goodResolved.length === good.segments.length,
  '脚手架自检：正常语料 resolveSegments 长度 === segments 长度');
ok(goodParts.length === good.segments.length,
  '脚手架自检：正常语料 stdParts 长度也等于 segments 长度（所以下面的分歧不是常态误报）',
  `stdParts=${goodParts.length} segments=${good.segments.length}`);
ok(goodBreaks.size === good.segments.length - 1,
  '脚手架自检：正常语料断点数 === 意群数 - 1');

// A2 真实分歧：缩约形式跨意群 —— 'm 的起点落在 "I’m" 这个词内部，与 going 映射到同一个词序号
const collide = {
  id: 'c1',
  en: 'I’m going home.',
  segments: [
    { t: 'I', r: 'extra' },
    { t: '’m', r: 'core' },
    { t: 'going home.', r: 'extra' },
  ],
};
const cResolved = m.resolveSegments(collide);
const cBreaks = m.standardBreaks(collide);
const cParts = m.splitByBreaks(collide.en, cBreaks);
ok(!!cResolved && cResolved.length === 3,
  'A2 前置：该语料定位成功（resolved 长度 = segments 长度 3）',
  cResolved ? String(cResolved.length) : 'null');
ok(cParts.length !== collide.segments.length,
  '实测分歧成立：stdParts 与 segments **不等长** —— 旧写法用 stdParts 的下标去查 segments 必然错位',
  `stdParts=${cParts.length} segments=${collide.segments.length} breaks=${[...cBreaks].join(',')}`);
// 用旧写法点"第 2 块"（用户看到的主干候选下标 1）会得到什么
const oldPickIsWrong = collide.segments[cParts.length - 1]?.r !== 'core' || cParts.length !== collide.segments.length;
ok(oldPickIsWrong,
  '正对照配对：按旧写法（候选来自 stdParts）索引语义已改变，无法保证点到 core 的那一块');

// A3 定位失败的数据：breaks 为空集 → 旧写法把"什么都不切"当全对
const broken = {
  id: 'b1',
  en: 'She left early because the meeting ended.',
  segments: [{ t: 'She vanished', r: 'core' }, { t: 'early', r: 'extra' }],
};
ok(m.resolveSegments(broken) === null, 'A3 前置：片段在原句里对不上时 resolveSegments 返回 null');
ok(m.standardBreaks(broken).size === 0,
  'A3：此时 standardBreaks 返回空集 —— "什么都不切"就会凑成 missed=0/wrong=0 的假成功',
  `breaks=${m.standardBreaks(broken).size}`);

/* ───────────── B. ChunkDrill 接线 ───────────── */
const drill = fs.readFileSync(path.join(ROOT, 'src/pages/SentenceLabPage/components/ChunkDrill.tsx'), 'utf8');

ok(/const backboneOptions = useMemo\(\s*\(\) => \(resolved \? resolved\.map\(\(r\) => r\.seg\.t\.trim\(\)\) : stdParts\)/.test(drill),
  '主干候选改为来自 resolved（与 item.segments 恒等长）');
ok(/backboneOptions\.map\(\(p, i\) => \(/.test(drill),
  '主干按钮渲染 backboneOptions');
ok(!/\{stdParts\.map\(\(p, i\) => \(\s*<button/.test(drill),
  '正对照：主干候选不再直接铺 stdParts（索引不再两套）');
ok(/item\.segments\[backbonePick\]\?\.r === 'core'/.test(drill),
  '评分仍按 item.segments 取 core —— 与候选同源后才成立');
const revealIdx = drill.indexOf('const reveal = ()');
const gateIdx = drill.indexOf('if (!resolved) return;', revealIdx);
const gradeIdx = drill.indexOf('grade(item.id, quality);', revealIdx);
ok(gateIdx > revealIdx && gradeIdx > gateIdx,
  '定位失败时 reveal 先 return，不会写复习队列', `gate=${gateIdx} grade=${gradeIdx}`);
const minuteIdx = drill.indexOf('addStudyMinutes(0.3', revealIdx);
ok(minuteIdx > gateIdx,
  '定位失败时也不加学习时长（坏数据不该让进度环涨）');
const checkIdx = drill.indexOf('const checkSplit');
const honestIdx = drill.indexOf("if (!resolved) {", checkIdx);
// 找真正的提示调用（不是解释性注释里提到的那四个字）
const perfectIdx = drill.indexOf('toast.success(`断句完全正确', checkIdx);
ok(honestIdx > checkIdx && perfectIdx > honestIdx,
  'checkSplit 先判定位失败，再谈"断句完全正确"（不再给 0 处断点发满分提示）',
  `honest=${honestIdx} perfect=${perfectIdx}`);
ok(!/if \(breaks\.size === 0\) \{/.test(drill),
  '判据用 !resolved 而不是 breaks.size === 0 —— 单意群句子断点本就是 0，属合法情形');

/* ───────────────────────── 汇总 ───────────────────────── */
const failed = results.filter((r) => !r.pass);
for (const r of failed) console.log(`  ✗ ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
console.log(`\n断言 ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) { console.log('✗ 有失败'); process.exit(1); }
console.log('✓ 拆句训练的主干判定索引同源，坏数据不再产生假成功');
