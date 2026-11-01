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
 *    未来月份判断、成就解锁优先排序、迁移趋势汇总（无尝试→null 而不是 0%）。
 * B 段守接线与变异：图表 tooltip/空态/主题网格线、收藏总览与 /favorites 链接、
 *    日历禁用未来与回到本月、成就排序、迁移趋势卡（走 think store / 14 天窗 / 空态）。
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

for (const fn of ['buildModuleShares', 'isCurrentMonth', 'canGoToNextMonth', 'sortAchievements',
  'summarizeTransferTrend', 'formatTransferTrendLabel']) {
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

/* ───────────── E. 思维迁移趋势汇总 ───────────── */
const emptyTrend = m.summarizeTransferTrend([]);
ok(emptyTrend.attempts === 0 && emptyTrend.activeDays === 0 &&
  emptyTrend.passRate === null && emptyTrend.calibrationRate === null,
  '没有迁移记录 → 通过率是 null（不把「没练过」画成 0%）', JSON.stringify(emptyTrend));
const zeroTrend = m.summarizeTransferTrend([
  { attempts: 0, passes: 0, calibrationAttempts: 0, calibrationHits: 0 },
  { attempts: 0, passes: 0, calibrationAttempts: 0, calibrationHits: 0 },
]);
ok(zeroTrend.attempts === 0 && zeroTrend.activeDays === 0 && zeroTrend.passRate === null,
  '补零的 14 天全为 0 时同样不造假通过率', JSON.stringify(zeroTrend));

const trendFixture = [
  { attempts: 2, passes: 1, calibrationAttempts: 1, calibrationHits: 1 },
  { attempts: 0, passes: 0, calibrationAttempts: 0, calibrationHits: 0 },
  { attempts: 3, passes: 2, calibrationAttempts: 2, calibrationHits: 1 },
];
const trend = m.summarizeTransferTrend(trendFixture);
ok(trend.attempts === 5 && trend.passes === 3 && trend.passRate === 60,
  '尝试/通过按天累加，通过率四舍五入（2+3、1+2 → 60%）', JSON.stringify(trend));
ok(trend.activeDays === 2, 'activeDays 只数有尝试的天（补零那天不算）', String(trend.activeDays));
ok(trend.calibrationAttempts === 3 && trend.calibrationHits === 2 && trend.calibrationRate === 67,
  '校准命中独立汇总（2/3 → 67%）', JSON.stringify(trend));
ok(trendFixture[0].attempts === 2 && trendFixture.every((p) => Object.keys(p).length === 4),
  'summarizeTransferTrend 不修改输入的每日行');

const overTrend = m.summarizeTransferTrend([
  { attempts: 2, passes: 5, calibrationAttempts: 1, calibrationHits: 9 },
]);
ok(overTrend.passRate === 100 && overTrend.calibrationRate === 100,
  '坏数据（通过数 > 尝试数）被按尝试数封顶，不出现 250%', JSON.stringify(overTrend));
const dirtyTrend = m.summarizeTransferTrend([
  { attempts: -3, passes: Number.NaN, calibrationAttempts: Number.POSITIVE_INFINITY, calibrationHits: -1 },
]);
ok(dirtyTrend.attempts === 0 && dirtyTrend.passes === 0 &&
  dirtyTrend.calibrationAttempts === 0 && dirtyTrend.calibrationHits === 0 &&
  dirtyTrend.passRate === null,
  '负数 / NaN / Infinity 记 0，且不因此伪造通过率', JSON.stringify(dirtyTrend));

ok(m.formatTransferTrendLabel('2026-11-01') === '11/1' &&
  m.formatTransferTrendLabel('2026-01-09') === '1/9',
  '趋势 x 轴标签是「月/日」且不补零');
ok(m.formatTransferTrendLabel('bad-date') === 'bad-date',
  '坏日期原样返回，不抛错');

/* ───────────── F. 接线 ───────────── */
const page = fs.readFileSync(path.join(ROOT, 'src/pages/ProgressPage/ProgressPage.tsx'), 'utf8');
const charts = fs.readFileSync(path.join(ROOT, 'src/pages/ProgressPage/components/ProgressCharts.tsx'), 'utf8');
const transfer = fs.readFileSync(path.join(ROOT, 'src/pages/ProgressPage/components/TransferTrendCard.tsx'), 'utf8');
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

const transferIssues = (src) => {
  const issues = [];
  if (!/useThinkPatterns\(\)/.test(src)) issues.push('迁移趋势没走 think store');
  if (!/state\.dailyStats/.test(src)) issues.push('没用 store 已清洗的 dailyStats');
  if (!/buildTransferTrend\(state\.dailyStats, today, TREND_DAYS\)/.test(src)) issues.push('趋势不是由纯函数按 14 天窗生成');
  if (!/const TREND_DAYS = 14;/.test(src)) issues.push('窗口不是 14 天');
  if (!/data-chart-empty="transfer"/.test(src)) issues.push('缺迁移趋势空态');
  if (!/data-transfer-trend/.test(src)) issues.push('缺稳定 data 标记');
  if (!/dataKey="attempts"/.test(src) || !/dataKey="passes"/.test(src)) issues.push('折线没区分尝试/通过');
  if (/safeStorage\.|localStorage\./.test(src)) issues.push('卡片自己读了存储（绕开 store 清洗）');
  if (!/to="\/think"/.test(src)) issues.push('没有去模式训练的入口');
  return issues;
};
const realTransferIssues = transferIssues(transfer);
ok(realTransferIssues.length === 0, '迁移趋势卡检查器自检：零问题', realTransferIssues.join('；'));
ok(transferIssues(transfer.replace('data-chart-empty="transfer"', '')).includes('缺迁移趋势空态'),
  '变异 M8：删掉迁移趋势空态 → 检查器变红');
ok(transferIssues(transfer.replace('state.dailyStats', '{}')).length > 0,
  '变异 M9：绕开 store 的 dailyStats → 检查器变红');
ok(transferIssues(transfer.replace('const TREND_DAYS = 14;', 'const TREND_DAYS = 7;')).length > 0,
  '变异 M10：窗口退回 7 天 → 检查器变红');
ok(transferIssues(transfer.replace('dataKey="passes"', 'dataKey="nope"')).length > 0,
  '变异 M11：通过折线接错字段 → 检查器变红');
ok(transferIssues(`${transfer}\nconst x = localStorage.getItem('y');`).length > 0,
  '变异 M12：卡片私自读存储 → 检查器变红');

ok(/import TransferTrendCard from '\.\/TransferTrendCard'/.test(charts) &&
  /<TransferTrendCard \/>/.test(charts),
  '统计 tab 挂载迁移趋势卡（不在页面里另铺一套）');
ok(/data-transfer-summary/.test(transfer) && /迁移通过率/.test(transfer) &&
  /校准命中/.test(transfer) && /练了/.test(transfer),
  '有数据时展示真实通过率 / 练习天数 / 校准命中');
ok(/from '@\/lib\/progress-page'/.test(transfer) &&
  /summarizeTransferTrend/.test(transfer) && /formatTransferTrendLabel/.test(transfer),
  '汇总与标签走单点纯函数模块');

/* ───────────── G. 成就：真实进度与计数口径（2026-11-01） ─────────────
   成就卡要说「还差几天」，就不能让阈值抄两遍：`achieved` 与 `progressOf` 必须同源。
   真跑做法：转译 `achievements-data.ts`（零 import）后，拿同一组夹具逐个成就比对
   「进度到没到」⟺「判没判解锁」，任一处改口径立刻对不上。 */
const shimDir = TMP;
fs.writeFileSync(path.join(shimDir, 'safe-storage-shim.mjs'),
  'export const safeStorage = { getItem: () => null, setItem: () => false, removeItem: () => false };\n');
const compileInto = (rel, outName, rewrites = []) => {
  let src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const [from, to] of rewrites) src = src.split(from).join(to);
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  fs.writeFileSync(path.join(shimDir, outName), js);
  return outName;
};
compileInto('src/lib/achievement-sources.ts', 'achievement-sources.mjs', [
  ["from '@/lib/safe-storage'", "from './safe-storage-shim.mjs'"],
  ["from '@/lib/achievements-data'", "from './achievements-data.mjs'"],
]);

let achSeq = 0;
const loadAchievements = async (rewrites = []) => {
  let src = fs.readFileSync(path.join(ROOT, 'src/lib/achievements-data.ts'), 'utf8');
  for (const [from, to] of rewrites) {
    if (!src.includes(from)) throw new Error(`成就真跑变异未命中锚点：${from}`);
    src = src.split(from).join(to);
  }
  const out = `achievements-data-${++achSeq}.mjs`;
  fs.writeFileSync(path.join(TMP, out), ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText);
  return import(pathToFileURL(path.join(TMP, out)).href);
};

const ach = await loadAchievements();
for (const fn of ['ACHIEVEMENT_DEFINITIONS', 'achievementProgress', 'achievementRatio',
  'formatAchievementGap', 'buildAchievementStats']) {
  if (ach[fn] === undefined) { console.error(`脚手架错误：achievements-data 没导出 ${fn}`); process.exit(2); }
}
const sources = await import(pathToFileURL(path.join(TMP, 'achievement-sources.mjs')).href);
const achDefs = ach.ACHIEVEMENT_DEFINITIONS;

const EXPECTED_ACHIEVEMENT_IDS = 'first_day,streak_3,streak_7,streak_14,streak_30,first_conversation,' +
  'ten_conversations,first_shadowing,goal_hit,heavy_learner,total_10_days,total_30_days';
ok(achDefs.map((d) => d.id).join(',') === EXPECTED_ACHIEVEMENT_IDS,
  '成就清单 12 条且顺序稳定（新增/删改要显式登记进守卫）', achDefs.map((d) => d.id).join(','));
ok(achDefs.every((d) => typeof d.achieved === 'function' && typeof d.progressOf === 'function'),
  '每个成就都同时给 achieved 与 progressOf（界面要显示进度就不能只有一个布尔）');

/** 量词必须出现在描述里 —— 否则卡上写「还差 3 天」而描述讲的是别的东西 */
const unitIssues = achDefs.filter((d) => {
  const probe = d.progressOf({ streakDays: 1, totalDays: 1, todayMinutes: 1, dailyGoalMinutes: 30, conversationCount: 1, shadowingCount: 1 });
  return probe && !d.description.includes(probe.unit);
}).map((d) => d.id);
ok(unitIssues.length === 0, '进度量词与成就描述用词一致', unitIssues.join(','));

/** 一致性扫描：进度到没到 ⟺ 判没判解锁（含"目标为 0 不算达成"） */
const VECTORS = [
  { streakDays: 0, totalDays: 0, todayMinutes: 0, dailyGoalMinutes: 30, conversationCount: 0, shadowingCount: 0 },
  { streakDays: 3, totalDays: 3, todayMinutes: 12, dailyGoalMinutes: 30, conversationCount: 1, shadowingCount: 0 },
  { streakDays: 7, totalDays: 10, todayMinutes: 30, dailyGoalMinutes: 30, conversationCount: 10, shadowingCount: 1 },
  { streakDays: 14, totalDays: 30, todayMinutes: 60, dailyGoalMinutes: 30, conversationCount: 25, shadowingCount: 40 },
  { streakDays: 30, totalDays: 90, todayMinutes: 200, dailyGoalMinutes: 45, conversationCount: 60, shadowingCount: 200 },
  { streakDays: 0, totalDays: 5, todayMinutes: 0, dailyGoalMinutes: 0, conversationCount: 0, shadowingCount: 0 },
  { streakDays: 2, totalDays: 2, todayMinutes: 29.4, dailyGoalMinutes: 30, conversationCount: 9, shadowingCount: 0 },
];
const drift = [];
for (const stats of VECTORS) {
  for (const d of achDefs) {
    const progress = ach.achievementProgress(d, stats);
    const reached = progress ? progress.current >= progress.target : false;
    if (reached !== !!d.achieved(stats)) drift.push(`${d.id}@${JSON.stringify(stats)}`);
  }
}
ok(drift.length === 0, `${achDefs.length * VECTORS.length} 组「判定 ⟺ 进度」全部同源`, drift.slice(0, 3).join(' | '));

const streak7 = achDefs.find((d) => d.id === 'streak_7');
const p3 = ach.achievementProgress(streak7, { ...VECTORS[1], streakDays: 3 });
ok(ach.formatAchievementGap(p3) === '还差 4 天' && ach.achievementRatio(p3) === 43,
  '连续 3/7 天 → 「还差 4 天」+ 43% 细条', JSON.stringify({ p3, gap: ach.formatAchievementGap(p3) }));
ok(ach.formatAchievementGap(ach.achievementProgress(streak7, { ...VECTORS[1], streakDays: 7 })) === null,
  '已到目标不写「还差 0 天」（界面该显示解锁日期）');

const goalHit = achDefs.find((d) => d.id === 'goal_hit');
ok(ach.achievementProgress(goalHit, { ...VECTORS[5], dailyGoalMinutes: 0 }) === null &&
  goalHit.achieved({ ...VECTORS[5], dailyGoalMinutes: 0 }) === false,
  '每日目标关掉（0 分钟）时「目标达成」既不给进度也不算达成（旧写法 0>=0 会白送）');
ok(ach.formatAchievementGap(ach.achievementProgress(goalHit,
  { ...VECTORS[1], todayMinutes: 12, dailyGoalMinutes: 30 })) === '还差 18 分钟',
  '目标达成按当天分钟数报差值');

const statsFixture = { streakDays: 3, totalDays: 4, todayMinutes: 12, dailyGoalMinutes: 30 };
const assembled = ach.buildAchievementStats(statsFixture, { conversationCount: 12, shadowingCount: 7 });
ok(assembled.conversationCount === 12 && assembled.shadowingCount === 7 &&
  !('totalStudyMinutes' in assembled),
  '装配函数只带真实字段（旧的 totalStudyMinutes 近似值已删）', JSON.stringify(assembled));
ok(JSON.stringify(ach.buildAchievementStats(statsFixture, { conversationCount: Number.NaN, shadowingCount: -5 })) ===
  JSON.stringify({ ...statsFixture, conversationCount: 0, shadowingCount: 0 }),
  '坏计数（NaN / 负数）收成 0，不带着脏值进判定');

ok(sources.countJsonEntries(null) === 0 && sources.countJsonEntries('{bad') === 0 &&
  sources.countJsonEntries('{"a":1}') === 0 && sources.countJsonEntries('[1,2,3]') === 3,
  '计数只认 JSON 数组：坏数据 → 0（不猜一个数）');
const counts = sources.readAchievementCounts({
  getItem: (key) => ({
    [sources.CONVERSATION_HISTORY_KEY]: JSON.stringify([{ id: 'c1' }, { id: 'c2' }]),
    [sources.SHADOWING_COMPLETED_KEY]: JSON.stringify(['a-1', 'a-2', 'b-3']),
  })[key] ?? null,
});
ok(counts.conversationCount === 2 && counts.shadowingCount === 3,
  '两个真实计数各读各的键', JSON.stringify(counts));
ok(JSON.stringify(sources.readAchievementCounts({ getItem: () => { throw new Error('boom'); } })) ===
  '{"conversationCount":0,"shadowingCount":0}', '存储抛错也不炸（收成 0）');

/* 真跑变异：改坏同源的一侧，一致性扫描必须红 */
const achMutations = [
  { name: 'M13 目标为 0 也判达成（新用户白送成就）', from: 'achieved: (s) => count(s.dailyGoalMinutes) > 0 && count(s.todayMinutes) >= count(s.dailyGoalMinutes),', to: 'achieved: (s) => count(s.todayMinutes) >= count(s.dailyGoalMinutes),' },
  { name: 'M14 已到目标还写「还差 0 天」', from: 'if (remaining <= 0) return null;', to: 'if (remaining < 0) return null;' },
  { name: 'M15 阈值只改判定不改进度显示（一周达人 8 天）', from: "    achieved: (s) => count(s.streakDays) >= 7,\n    progressOf: days(7),", to: "    achieved: (s) => count(s.streakDays) >= 8,\n    progressOf: days(7)," },
];
let achMutationOk = 0;
for (const m of achMutations) {
  const mutated = await loadAchievements([[m.from, m.to]]);
  let bad = false;
  for (const stats of VECTORS) {
    for (const d of mutated.ACHIEVEMENT_DEFINITIONS) {
      const progress = mutated.achievementProgress(d, stats);
      const reached = progress ? progress.current >= progress.target : false;
      if (reached !== !!d.achieved(stats)) bad = true;
    }
  }
  if (m.name.includes('还差 0 天')) {
    const gap = mutated.formatAchievementGap(mutated.achievementProgress(
      mutated.ACHIEVEMENT_DEFINITIONS.find((d) => d.id === 'streak_7'), { ...VECTORS[1], streakDays: 7 }));
    bad = gap !== null;
  }
  if (bad) achMutationOk += 1;
  else console.log(`  ✗ 变异后仍全绿（断言没在管事）：${m.name}`);
}
ok(achMutationOk === achMutations.length, `成就真跑变异 ${achMutationOk}/${achMutations.length} 全部验红`);

/* 静态：键名两侧同源 + hook / 页面接线 */
const convPage = fs.readFileSync(path.join(ROOT, 'src/pages/ConversationPage/ConversationPage.tsx'), 'utf8');
const shadowPage = fs.readFileSync(path.join(ROOT, 'src/pages/ShadowingPage/ShadowingPage.tsx'), 'utf8');
const achHook = fs.readFileSync(path.join(ROOT, 'src/lib/use-achievements.ts'), 'utf8');
const layout = fs.readFileSync(path.join(ROOT, 'src/components/Layout.tsx'), 'utf8');
const sourcesSrc = fs.readFileSync(path.join(ROOT, 'src/lib/achievement-sources.ts'), 'utf8');
const achData = fs.readFileSync(path.join(ROOT, 'src/lib/achievements-data.ts'), 'utf8');

const achievementWiringIssues = ({ sourcesSrc: s2, convPage: c2, shadowPage: sh2, achHook: h2, layout: l2, page }) => {
  const issues = [];
  if (!s2.includes("'__nativethink_conversation_history'") || !c2.includes("'__nativethink_conversation_history'")) issues.push('对话历史键漂移');
  if (!s2.includes("'__nativethink_shadowing_completed'") || !sh2.includes("'__nativethink_shadowing_completed'")) issues.push('跟读完成键漂移');
  if (!/achievement\.achieved\(stats\)/.test(h2)) issues.push('解锁判定没走 achieved');
  if (/condition:\s*\(s\)/.test(h2) || /ACHIEVEMENT_DEFINITIONS\s*:\s*IAchievement\[\]/.test(h2)) issues.push('定义表还留在 hook 里（应只在 achievements-data）');
  if (!/readAchievementCounts\(\)/.test(h2)) issues.push('判定装配没读真实计数');
  if (/moduleProgress\.conversation|moduleProgress\.shadowing/.test(h2)) issues.push('还在拿进度分当次数');
  if (/totalStudyMinutes/.test(h2)) issues.push('旧的 totalStudyMinutes 近似值复活');
  if (!/if \(!statsLoaded \|\| !achievementsLoaded\) return;/.test(h2)) issues.push('判定没等两个 loaded（首屏会拿空值判一轮）');
  if (!/useAchievementCheck\(\);/.test(l2)) issues.push('外壳没挂成就判定（checkAndUnlock 无调用点 = 成就永远是一排 🔒）');
  if (!/data-achievement-progress=\{achievement\.id\}/.test(page)) issues.push('页面没渲染真实进度');
  if (!/\{!unlocked_ && \(!progress \|\| !gap\) && \(/.test(page)) issues.push('🔒 分支没让位给进度（两条同时出现或进度被吃掉）');
  return issues;
};
const realAchIssues2 = achievementWiringIssues({ sourcesSrc, convPage, shadowPage, achHook, layout, page });
ok(realAchIssues2.length === 0, '成就接线检查器自检：零问题', realAchIssues2.join('；'));
ok(achievementWiringIssues({ sourcesSrc: sourcesSrc.replace("'__nativethink_shadowing_completed'", "'__nativethink_shadowing_done'"), convPage, shadowPage, achHook, layout, page }).length > 0,
  '变异 M16：计数键漂移（写入方改了键，读的一侧还在旧键）→ 检查器变红');
ok(achievementWiringIssues({ sourcesSrc, convPage, shadowPage, achHook: achHook.replace('readAchievementCounts()', 'stats.moduleProgress'), layout, page }).length > 0,
  '变异 M17：装配退回拿进度分当次数 → 检查器变红');
ok(achievementWiringIssues({ sourcesSrc, convPage, shadowPage, achHook: achHook.replace('achievement.achieved(stats)', 'achievement.condition(stats)'), layout, page }).length > 0,
  '变异 M18：判定退回旧 condition → 检查器变红');
ok(achievementWiringIssues({ sourcesSrc, convPage, shadowPage, achHook, layout, page: page.replace('data-achievement-progress={achievement.id}', '') }).length > 0,
  '变异 M19：页面丢掉进度标记 → 检查器变红');
ok(achievementWiringIssues({ sourcesSrc, convPage, shadowPage, achHook, layout: layout.replace('useAchievementCheck();', ''), page }).length > 0,
  '变异 M20：外壳不再挂判定（解锁逻辑又变成没人调的死代码）→ 检查器变红');
ok(!/condition:/.test(achData),
  '成就定义里不再出现旧字段 condition（判据只认字段写法 —— 文件头注释里提旧实现的那个词不算数）');
ok(!fs.existsSync(path.join(ROOT, 'src/lib/use-learning-with-achievements.ts')),
  '没人调用的旧装配 hook 已删除（同一件事只留 useAchievementCheck 一处）');

/* ───────────────────────── 汇总 ───────────────────────── */
const failed = results.filter((r) => !r.pass);
for (const r of failed) console.log(`  ✗ ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
console.log(`\n断言 ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) { console.log('✗ 有失败'); process.exit(1); }
console.log('✓ 学习记录页：占比归一、日历未来闸门、成就排序与收藏去重都对得上');