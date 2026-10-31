#!/usr/bin/env node
/**
 * verify-progress-page.mjs — 学习记录页的图表/日历/成就/收藏去重契约。
 *
 * 本轮修的三件真事：
 *  ① 模块占比图把 `moduleProgress` 原始分直接塞给 Recharts，tooltip 却按 `${value}%`
 *     显示 —— 三个模块各 50 分时看起来是三个 50%，实际份额各 33%。
 *  ② 日历能一直翻到未来月份，且离开本月后没有「回到本月」。
 *  ③ 收藏本 tab 与 /favorites 是两套完整列表（前者没有搜索/增量），现在收成总览。
 *
 * A 段真转译 `src/lib/progress-page.ts`：份额归一（最大余数补差到 100）、
 *    未来月份判断、成就解锁优先排序。
 * B 段守接线与变异：图表 tooltip/空态/主题网格线、收藏总览与 /favorites 链接、
 *    日历禁用未来与回到本月、成就排序。
 *
 * 用法：node scripts/verify-progress-page.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(process.env.TEMP || '/tmp', 'progress-page-check');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });

const js = ts.transpileModule(
  fs.readFileSync(path.join(ROOT, 'src/lib/progress-page.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const outFile = path.join(TMP, 'progress-page-under-test.mjs');
fs.writeFileSync(outFile, js);
const m = await import(pathToFileURL(outFile).href);

for (const fn of ['buildModuleShares', 'isCurrentMonth', 'canGoToNextMonth', 'sortAchievements']) {
  if (typeof m[fn] !== 'function') { console.error(`脚手架错误：没导出 ${fn}`); process.exit(2); }
}

const sum = (shares) => shares.reduce((n, x) => n + x.percent, 0);

/* ───────────── A. 模块占比 ───────────── */
ok(m.buildModuleShares({}).length === 0, '空进度 → 空数组（交给图表空态）');
ok(m.buildModuleShares({ a: 0, b: -1, c: Number.NaN }).length === 0,
  '0 / 负数 / NaN 不进入饼图，也不造假份额');

const half = m.buildModuleShares({ think: 50, chunks: 50 });
ok(half.length === 2 && sum(half) === 100 && half.every((x) => x.percent === 50),
  '两个模块各 50 分 → 各 50%，和恰好 100', JSON.stringify(half));
const think = half.find((x) => x.key === 'think');
const chunks = half.find((x) => x.key === 'chunks');
ok(think?.name === '思维训练' && chunks?.name === '语块训练',
  '模块名从单一 MODULE_NAMES 表取，不由页面自己拼');
ok(think?.color === 'var(--brand)' && chunks?.color === '#1F2937',
  '模块颜色按 key 取（不是按下标错位）');

const thirds = m.buildModuleShares({ a: 1, b: 1, c: 1 });
ok(sum(thirds) === 100 && thirds.map((x) => x.percent).join(',') === '34,33,33',
  '1/1/1：最大余数法把 99 补成 34/33/33，和为 100', JSON.stringify(thirds));

const weighted = m.buildModuleShares(
  { a: 1, b: 2, c: 3 },
  { a: 'A', b: 'B', c: 'C' },
  { a: 'red', b: 'green', c: 'blue' },
);
ok(sum(weighted) === 100 && weighted.map((x) => `${x.key}:${x.percent}`).join(',') === 'c:50,b:33,a:17',
  '1/2/3：按份额降序且和为 100（tooltip 不再把原始分当百分比）', JSON.stringify(weighted));
ok(weighted.every((x) => x.name === x.key.toUpperCase() && ['red', 'green', 'blue'].includes(x.color)),
  '自定义 names/colors 生效（守卫可注入夹具）');

const seven = m.buildModuleShares(Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`m${i}`, 10])));
ok(seven.length === 7 && sum(seven) === 100 &&
  seven.filter((x) => x.percent === 15).length === 2 && seven.filter((x) => x.percent === 14).length === 5,
  '7 个等分模块：余数只补到前两项，仍恰好 100', seven.map((x) => x.percent).join(','));

const unknown = m.buildModuleShares({ mystery: 8 });
ok(unknown[0]?.name === 'mystery' && unknown[0]?.color === '#94A3B8' && unknown[0]?.percent === 100,
  '未登记的模块回退到 key + 中性色，不丢数据');
const input = { a: 1, b: 2, c: 3 };
const before = JSON.stringify(input);
m.buildModuleShares(input);
ok(JSON.stringify(input) === before, 'buildModuleShares 不修改输入对象');

/* ───────────── B. 日历 ───────────── */
const now = new Date(2026, 9, 31); // 2026-10-31 本地时间
ok(m.isCurrentMonth(2026, 9, now) === true, 'isCurrentMonth：2026-10 是当前月');
ok(m.isCurrentMonth(2026, 8, now) === false, 'isCurrentMonth：2026-09 不是当前月');
ok(m.canGoToNextMonth(2026, 8, now) === true, '上个月可以往后翻到本月');
ok(m.canGoToNextMonth(2026, 9, now) === false, '本月不能再往后翻（未来月份没有数据）');
ok(m.canGoToNextMonth(2026, 10, now) === false, '未来月份不可达');
ok(m.canGoToNextMonth(2025, 11, now) === true, '去年 12 月可以翻到今年 1 月');
const jan = new Date(2026, 0, 15);
ok(m.canGoToNextMonth(2025, 11, jan) === true && m.canGoToNextMonth(2026, 0, jan) === false,
  '跨年边界：去年 12 月可翻、今年 1 月不可翻');

/* ───────────── C. 成就排序 ───────────── */
const defs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
const sorted = m.sortAchievements(defs, ['c', 'a']);
ok(sorted.map((x) => x.id).join(',') === 'a,c,b,d',
  '已解锁优先且组内保持定义表原顺序（a、c 解锁 → a,c,b,d）', sorted.map((x) => x.id).join(','));
ok(defs.map((x) => x.id).join(',') === 'a,b,c,d', 'sortAchievements 不修改原 definitions');
ok(m.sortAchievements(defs, ['missing', 'b']).map((x) => x.id).join(',') === 'b,a,c,d',
  '未知解锁 id 被忽略，不影响排序');
ok(m.sortAchievements(defs, []).map((x) => x.id).join(',') === 'a,b,c,d',
  '全部未解锁时保持原顺序');

/* ───────────── D. 接线 ───────────── */
const page = fs.readFileSync(path.join(ROOT, 'src/pages/ProgressPage/ProgressPage.tsx'), 'utf8');
const charts = fs.readFileSync(path.join(ROOT, 'src/pages/ProgressPage/components/ProgressCharts.tsx'), 'utf8');
const lib = fs.readFileSync(path.join(ROOT, 'src/lib/progress-page.ts'), 'utf8');

const chartsIssues = (src) => {
  const issues = [];
  if (!/buildModuleShares\(stats\.moduleProgress\)/.test(src)) issues.push('饼图未走归一函数');
  if (!src.includes('`${value}%`')) issues.push('tooltip 不是百分比');
  if (!/dataKey="value"/.test(src)) issues.push('饼图 dataKey 不是 value');
  if (!/data-chart-empty="pie"/.test(src)) issues.push('缺饼图空态');
  if ((src.match(/stroke="var\(--border\)"/g) || []).length < 2) issues.push('网格线不是主题 token');
  if (/hsl\(215 28% 20%\)/.test(src)) issues.push('旧深色网格线复活');
  if (/const MODULE_(COLORS|NAMES)/.test(src)) issues.push('图表里重复定义了模块表');
  return issues;
};
const realChartIssues = chartsIssues(charts);
ok(realChartIssues.length === 0, '图表接线检查器自检：零问题', realChartIssues.join('；'));
ok(chartsIssues(charts.replaceAll('stroke="var(--border)"', 'stroke="hsl(215 28% 20%)"')).length > 0,
  '变异 M1：网格线退回硬编码深色 → 检查器变红');
ok(chartsIssues(charts.replace('data-chart-empty="pie"', '')).length > 0,
  '变异 M2：删掉饼图空态 → 检查器变红');

const favoritesIssues = (src) => {
  const issues = [];
  if (!/data-favorites-summary/.test(src)) issues.push('收藏总览标记缺失');
  if (!/data-favorites-entry="manage"/.test(src)) issues.push('没有去收藏页的显式入口');
  if (!/navigate\('\/favorites'\)/.test(src)) issues.push('没有跳转收藏页');
  if (/FavoriteReviewMode/.test(src)) issues.push('收藏回顾仍重复挂在本页');
  if (/data-favorite-id=/.test(src)) issues.push('本页仍在渲染完整收藏卡列表');
  if (/filteredFavorites\.map/.test(src)) issues.push('本页仍在 map 完整收藏列表');
  return issues;
};
const realFavIssues = favoritesIssues(page);
ok(realFavIssues.length === 0, '收藏本检查器自检：零问题', realFavIssues.join('；'));
ok(favoritesIssues(page.replace('data-favorites-summary', '')).length > 0,
  '变异 M3：去掉收藏总览标记 → 检查器变红');
ok(favoritesIssues(page + '\n<div data-favorite-id="x" />').length > 0,
  '变异 M4：本页重新渲染完整收藏卡 → 检查器变红');

const calendarIssues = (src) => {
  const issues = [];
  if (!/disabled=\{!canNextMonth\}/.test(src)) issues.push('下个月按钮没有禁用未来');
  if (!/回到本月/.test(src)) issues.push('没有回到本月出口');
  if (!/goToCurrentMonth/.test(src)) issues.push('没有回到本月处理函数');
  if (!/if \(!canNextMonth\) return;/.test(src)) issues.push('nextMonth 本身没有闸门');
  return issues;
};
const realCalIssues = calendarIssues(page);
ok(realCalIssues.length === 0, '日历检查器自检：零问题', realCalIssues.join('；'));
ok(calendarIssues(page.replace('disabled={!canNextMonth}', '')).length > 0,
  '变异 M5：下个月按钮不禁用未来 → 检查器变红');
ok(calendarIssues(page.replace('回到本月', '')).length > 0,
  '变异 M6：删掉回到本月 → 检查器变红');

const achievementIssues = (src) => {
  const issues = [];
  if (!/sortedAchievements\.map/.test(src)) issues.push('成就没按排序结果渲染');
  if (!/sortAchievements\(definitions, unlocked\.map/.test(src)) issues.push('没有调用排序纯函数');
  return issues;
};
const realAchIssues = achievementIssues(page);
ok(realAchIssues.length === 0, '成就检查器自检：零问题', realAchIssues.join('；'));
ok(achievementIssues(page.replace('sortedAchievements.map', 'definitions.map')).length > 0,
  '变异 M7：成就退回定义表原顺序 → 检查器变红');

ok(/from '@\/lib\/progress-page'/.test(page) &&
  /canGoToNextMonth/.test(page) && /isCurrentMonth/.test(page) && /sortAchievements/.test(page),
  '页面从单点模块取日历/成就纯函数');
ok(/from '@\/lib\/progress-page'/.test(charts) && /buildModuleShares/.test(charts),
  '图表从单点模块取份额归一');
ok(/各模块进度分占比（不是学习时长）/.test(charts),
  '饼图说明写清楚是进度分占比，不是学习时长');
ok(/data-chart-empty="pie"/.test(charts) && /回首页开始学习/.test(charts),
  '饼图空态给出下一步（回首页开始学习）');
ok(/Legend/.test(charts) && /RechartsTooltip/.test(charts),
  '饼图仍保留图例与 tooltip');
ok(/recentFavorites/.test(page) && /favoriteTypeSummary/.test(page),
  '收藏总览消费分类计数与最近 3 条');
ok(/搜索、按类型筛选、12 条增量加载与「开始回顾」都在收藏页/.test(page),
  '总览明确指出去收藏页做搜索/筛选/回顾');

/* ───────────────────────── 汇总 ───────────────────────── */
const failed = results.filter((r) => !r.pass);
for (const r of failed) console.log(`  ✗ ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
console.log(`\n断言 ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) { console.log('✗ 有失败'); process.exit(1); }
console.log('✓ 学习记录页：占比归一、日历未来闸门、成就排序与收藏去重都对得上');