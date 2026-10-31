#!/usr/bin/env node
/**
 * verify-spelling-hall.mjs — 句子拼写「词书与题池」大厅的回归守卫。
 *
 * 背景：题池选择原先只在首次使用时出现，进入练习后换词书藏在右上角下拉里；
 * 「纠偏表达」「视频精听」「收藏单词」三个最有价值的池子几乎发现不了。
 * 现在首屏与练习页共用 SpellingPoolPicker，每张卡都有词数/已完成/断点。
 *
 * A 段：真转译 `src/lib/spelling-pools.ts`（导入换成 meta 的实测值），
 *        跑分组覆盖、搜索、状态描述（0 基断点、空池指引、total=0 不算已加载）。
 * B 段：守接线（两处挂载、显式入口、稳定 data 属性、搜索空态、玩法/本轮持久化）。
 * C 段：四条变异检查器自证（拔挂载 / 去稳定 key / 删空态 / 漏纠偏池）。
 *
 * 用法：node scripts/verify-spelling-hall.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(process.env.TEMP || '/tmp', 'spelling-hall-check');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });

const transpile = (src) => ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

/* ───────────── 先转译 meta（无 import） ───────────── */
const metaPath = path.join(ROOT, 'src/data/wordbank/meta.ts');
const metaFile = path.join(TMP, 'meta.mjs');
fs.writeFileSync(metaFile, transpile(fs.readFileSync(metaPath, 'utf8')));
const meta = await import(pathToFileURL(metaFile).href);

/* ───────────── 转译 spelling-pools（导入换成 meta 实测值） ───────────── */
let src = fs.readFileSync(path.join(ROOT, 'src/lib/spelling-pools.ts'), 'utf8');
src = src.replace(/^import \{[\s\S]*?\} from '@\/data\/wordbank\/meta';\n/m, '');
src = src.replace(/^import \{[\s\S]*?\} from '@\/lib\/use-spelling-sentences';\n/m, '');
if (/^\s*import\s/m.test(src)) {
  console.error('脚手架错误：仍有未剥离的 import');
  process.exit(2);
}
const preamble = [
  `const ALL_LEVELS = ${JSON.stringify(meta.ALL_LEVELS)};`,
  `const LEVEL_COLORS = ${JSON.stringify(meta.LEVEL_COLORS)};`,
  `const LEVEL_LABELS = ${JSON.stringify(meta.LEVEL_LABELS)};`,
  `const TOTAL_UNIQUE_WORDS = ${meta.TOTAL_UNIQUE_WORDS};`,
  `const WORD_COUNTS = ${JSON.stringify(meta.WORD_COUNTS)};`,
  "const CORRECTION_LEVEL = 'correction';",
  "const VIDEO_LEVEL = 'video';",
  '',
].join('\n');
const outFile = path.join(TMP, 'spelling-pools-under-test.mjs');
fs.writeFileSync(outFile, transpile(preamble + src));
const m = await import(pathToFileURL(outFile).href);

for (const fn of ['filterSpellingPools', 'describeSpellingPool', 'formatPoolCount']) {
  if (typeof m[fn] !== 'function') { console.error(`脚手架错误：没导出 ${fn}`); process.exit(2); }
}
for (const data of ['SPELLING_POOLS', 'SPELLING_POOL_GROUPS']) {
  if (!Array.isArray(m[data])) { console.error(`脚手架错误：没导出 ${data}`); process.exit(2); }
}

/* ───────────── A. 数据与分组 ───────────── */
ok(meta.ALL_LEVELS.length === 11, '词库元数据仍是 11 本 —— 题池表按它展开');
ok(meta.WORD_COUNTS.cet4 === 4542 && meta.TOTAL_UNIQUE_WORDS === 21736,
  '脚手架自检：词数与唯一词数确实来自 meta', `cet4=${meta.WORD_COUNTS.cet4} total=${meta.TOTAL_UNIQUE_WORDS}`);
ok(m.SPELLING_POOLS.length === 14,
  '题池表 = 2 个专属池 + 11 本词书 + 全部词库（共 14）', `实际 ${m.SPELLING_POOLS.length}`);

const keys = m.SPELLING_POOLS.map((p) => p.key);
ok(new Set(keys).size === keys.length, '题池 key 不重复（重复会让 React key 和进度映射串池）');
ok(keys.includes('correction') && keys.includes('video') && keys.includes('all'),
  '纠偏表达 / 视频精听 / 全部词库都在题池表里');
ok(meta.ALL_LEVELS.every((k) => keys.includes(k)), '11 本词书一本不少');
ok(m.SPELLING_POOLS.filter((p) => p.kind === 'wordbook')
  .every((p) => p.wordCount === meta.WORD_COUNTS[p.key]),
  '每本词书的词数取自 WORD_COUNTS，不在页面里写死');
ok(m.SPELLING_POOL_GROUPS.length === 3 &&
  new Set(m.SPELLING_POOL_GROUPS.map((g) => g.key)).size === 3,
  '三个分组（专属题池 / 考试词书 / 全部词库）互不重复');
ok(m.SPELLING_POOLS.every((p) => m.SPELLING_POOL_GROUPS.some((g) => g.key === p.group)),
  '每个题池都有分组归属，不会渲染到空白里');

/* ───────────── B. 搜索 ───────────── */
const all = m.SPELLING_POOLS;
ok(m.filterSpellingPools(all, '') === all, '空搜索原样返回（不能返回新数组导致引用抖动）');
ok(m.filterSpellingPools(all, '   ').length === all.length, '纯空白搜索也按空搜索处理');
ok(m.filterSpellingPools(all, '四级').map((p) => p.key).join(',') === 'cet4',
  '搜「四级」只命中四级，不会把「四六级高频/高分」一起带出');
ok(m.filterSpellingPools(all, 'TOEFL').some((p) => p.key === 'toefl'),
  '搜索大小写不敏感');
ok(m.filterSpellingPools(all, '不存在的词').length === 0,
  '无匹配返回空数组，交给界面的「没有匹配的题池」空态');
ok(m.filterSpellingPools(all, '纠偏').some((p) => p.kind === 'correction'),
  '搜「纠偏」能直接找到专属题池');

/* ───────────── C. 状态描述 ───────────── */
const cet4 = all.find((p) => p.key === 'cet4');
const correction = all.find((p) => p.kind === 'correction');
const video = all.find((p) => p.kind === 'video');
const allPool = all.find((p) => p.kind === 'all');

ok(m.formatPoolCount(21736) === '21,736', '千分位固定 en-US，守卫读数不随运行环境漂移');
ok(m.formatPoolCount(-3) === '0' && m.formatPoolCount(Number.NaN) === '0',
  '负数/NaN 不把题池卡打成 NaN 词');

const unloaded = m.describeSpellingPool(cet4);
ok(unloaded.primary === '4,542 词' && unloaded.secondary === '未开始' && !unloaded.resumable,
  '未加载、无断点的词书：显示词数 + 未开始', JSON.stringify(unloaded));

const resumed = m.describeSpellingPool(cet4, { loaded: false, total: 0, completed: 0, resumeIndex: 36 });
ok(resumed.primary === '上次第 37 句' && resumed.secondary.includes('4,542 词') && resumed.resumable,
  '断点存 0 基、显示 1 基：36 → 第 37 句', JSON.stringify(resumed));

const loaded = m.describeSpellingPool(cet4, { loaded: true, total: 120, completed: 12, resumeIndex: 36 });
ok(loaded.primary === '已完成 12/120 句' && loaded.secondary === '上次第 37 句',
  '已加载：已完成 x/y 句 + 上次位置', JSON.stringify(loaded));

const loadedNoResume = m.describeSpellingPool(cet4, { loaded: true, total: 120, completed: 12, resumeIndex: null });
ok(loadedNoResume.secondary === '继续这本',
  '有进度但没断点时给「继续这本」，不说从头开始', JSON.stringify(loadedNoResume));

const zeroTotal = m.describeSpellingPool(cet4, { loaded: true, total: 0, completed: 0, resumeIndex: null });
ok(zeroTotal.primary === '4,542 词',
  'total=0 不能当成已加载（空池不应显示「已完成 0/0 句」）', JSON.stringify(zeroTotal));

const emptyCorrection = m.describeSpellingPool(correction);
ok(emptyCorrection.primary === '还没有句子' && emptyCorrection.secondary.includes('拼写这句'),
  '空纠偏池给出「在收藏页纠偏本点拼写这句」的可执行指引', JSON.stringify(emptyCorrection));
const emptyVideo = m.describeSpellingPool(video);
ok(emptyVideo.primary === '还没有句子' && emptyVideo.secondary.includes('听写这句'),
  '空精听池给出「在精听字幕卡点听写这句」的可执行指引', JSON.stringify(emptyVideo));

const correctionLoaded = m.describeSpellingPool(correction, { loaded: true, total: 3, completed: 1, resumeIndex: 0 });
ok(correctionLoaded.primary === '已完成 1/3 句' && correctionLoaded.secondary === '上次第 1 句',
  '0 号断点显示为第 1 句，不能当成「没有断点」', JSON.stringify(correctionLoaded));
ok(m.formatPoolCount(allPool.wordCount) === '21,736',
  '全部词库卡显示跨书唯一词数 21,736');

/* 覆盖检查器与变异 M4：数据表漏掉纠偏池时必须报出来 */
const coverageIssues = (pools, levels) => {
  const issues = [];
  if (!pools.some((p) => p.kind === 'correction')) issues.push('缺纠偏池');
  if (!pools.some((p) => p.kind === 'video')) issues.push('缺精听池');
  for (const lv of levels) if (!pools.some((p) => p.key === lv)) issues.push(`缺 ${lv}`);
  return issues;
};
ok(coverageIssues(all, meta.ALL_LEVELS).length === 0, '覆盖检查器自检：真实题池表无缺口');
ok(coverageIssues(all.filter((p) => p.kind !== 'correction'), meta.ALL_LEVELS).length === 1,
  '变异 M4：数据表漏掉纠偏池 → 覆盖检查器变红');

/* ───────────── D. 接线 ───────────── */
const page = fs.readFileSync(path.join(ROOT, 'src/pages/SpellingPage/SpellingPage.tsx'), 'utf8');
const picker = fs.readFileSync(path.join(ROOT, 'src/pages/SpellingPage/components/SpellingPoolPicker.tsx'), 'utf8');

const wiringIssues = (pageSrc, pickerSrc) => {
  const issues = [];
  const mounts = (pageSrc.match(/<SpellingPoolPicker/g) || []).length;
  if (mounts < 2) issues.push('首屏/练习页缺一处挂载');
  if (!/setShowPoolPicker\(true\)/.test(pageSrc)) issues.push('练习页没有显式打开按钮');
  if (!/data-spelling-pool=\{pool\.key\}/.test(pickerSrc)) issues.push('卡片没有稳定 data-spelling-pool');
  if (!/没有匹配的题池/.test(pickerSrc)) issues.push('搜索无结果没有空态');
  return issues;
};
const realIssues = wiringIssues(page, picker);
ok(realIssues.length === 0, '接线检查器自检：真实源码零问题', realIssues.join('；'));
ok(wiringIssues(page.replace(/<SpellingPoolPicker[\s\S]*?\/>/g, ''), picker).length > 0,
  '变异 M1：拔掉两处题池选择器 → 接线检查器变红');
ok(wiringIssues(page, picker.replace(/data-spelling-pool=\{pool\.key\}/g, '')).length > 0,
  '变异 M2：卡片去掉稳定 key → 接线检查器变红');
ok(wiringIssues(page, picker.replace(/没有匹配的题池/g, '')).length > 0,
  '变异 M3：删掉搜索空态 → 接线检查器变红');

ok(/from '@\/lib\/spelling-pools'/.test(page), '页面从单点模块取题池数据');
ok(!/DropdownMenu/.test(page), '正对照：旧的隐藏下拉已经移除');
ok(/data-spelling-pool=\{FAVORITES_POOL_KEY\}/.test(picker), '收藏单词作为单独动作卡存在');
ok(/FAVORITES_SEARCH_TEXT/.test(picker) && /showFavorites/.test(picker),
  '收藏卡也参与搜索（搜「收藏」能命中）');
ok(/filterSpellingPools\(SPELLING_POOLS, query\)/.test(picker), '搜索走纯函数过滤');
ok(/describeSpellingPool\(pool, progress\)/.test(picker), '卡片状态走纯函数描述');
ok(/readResumeIndex/.test(page) && /poolProgress/.test(page), '题池进度用 readResumeIndex 读断点');
ok(/SPELLING_MODE_KEY/.test(page) && /safeStorage\.setItem\(SPELLING_MODE_KEY/.test(page),
  '玩法选择持久化（首屏与练习页共用）');
ok(/persistRoundSize/.test(page) && /SPELLING_ROUND_KEY/.test(page),
  '首屏本轮句数与练习页共用持久化键');
ok(/setHallEntered\(true\)/.test(page) && /!hallEntered/.test(page),
  '首屏选池后即使空池也离开大厅，去看空态指引');
ok(/activeLevel=""\s+progressByKey/.test(page),
  '首屏不把默认 all 标成「当前」');
ok(/<Dialog open=\{showPoolPicker\}/.test(page), '练习页用 Dialog 承载题池切换');
ok(/building \? 'all' : levelLoading \? activeLevel : null/.test(page),
  '加载中的题池有独立 loading 标记');

/* ───────────────────────── 汇总 ───────────────────────── */
const failed = results.filter((r) => !r.pass);
for (const r of failed) console.log(`  ✗ ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
console.log(`\n断言 ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) { console.log('✗ 有失败'); process.exit(1); }
console.log('✓ 拼写题池大厅：分组、搜索、断点、空态与两处接线都对得上');