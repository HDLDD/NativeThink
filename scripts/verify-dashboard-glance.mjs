#!/usr/bin/env node
/**
 * verify-dashboard-glance.mjs — 首页 2026-10-10 内容扩展的三条契约守卫。
 *
 * 本轮首页新增：①「继续上次学习」标签表补 /sentences（句子学习上线后访问它，
 * 回首页续学条此前静默不出现 —— labels 查表 miss 直接不渲染）；②「今日待复习」
 * 横幅（useGlobalDueCount 直扫 SM-2 存储，与侧边栏角标同源同口径）；③「本周学习
 * 概览」柱状（useLearningStats 的 calendar，近 7 个自然日）。
 *
 * 三条容易复发/改坏的契约：
 *  1. lastVisit labels 表是"路径 → 文案"的穷举映射，新增页面六件套并不包含它
 *     —— 每上一个新路由这里就要补一行，漏了静默丢续学条（/sentences 已真实漏过）。
 *  2. 待复习横幅必须「到期 0 → 整卡不渲染」。横幅要配得上它的面积：没有复习
 *     义务还渲染一张"已清零"的卡就是把横幅当摆设，且会挤压下方三段内容。
 *  3. 本周柱状的日期一律 formatDate 循环生成、按字符串查 calendar —— 不许
 *     slice(-7) 取数组尾（calendar 只在跨出 31 天窗口后才 push 新条目，跨天当天
 *     没学习时尾部是昨天，柱状图整体错位一天）；更不许 toISOString（东八区凌晨
 *     错天，全站禁用）。
 *
 * 变异测试在内存里做（不落盘、跑完不写回），每条变异必须让至少一条断言变红。
 * 用法：node scripts/verify-dashboard-glance.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FILES = {
  dashboard: 'src/pages/DashboardPage/DashboardPage.tsx',
  review: 'src/pages/DashboardPage/ReviewDueCard.tsx',
  week: 'src/pages/DashboardPage/WeekGlanceCard.tsx',
  notedrill: 'src/pages/DashboardPage/NoteDrillCard.tsx',
  vocab: 'src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx',
};

const originals = {};
for (const [k, p] of Object.entries(FILES)) originals[k] = fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ───────────── 断言本体（对给定源码集合跑，供原始与变异两用） ───────────── */
function runChecks(srcs) {
  const results = [];
  const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });
  const dash = srcs.dashboard, review = srcs.review, week = srcs.week;

  /* 1. 继续上次学习：labels 表补齐已上线路由 */
  ok(/'\/sentences': '句子学习'/.test(dash),
    '「继续上次学习」labels 表含 /sentences（句子学习）',
    '漏一行 = 该页访问后回首页续学条静默不出现');
  ok(/__nativethink_last_visit/.test(dash),
    '正对照：守卫盯的是真的 last_visit 读取块');

  /* 2. 今日待复习：同源数据 + 到期 0 整卡不渲染 */
  ok(/import \{ useGlobalDueCount \} from '@\/lib\/use-word-learning'/.test(dash),
    '首页从 use-word-learning 引 useGlobalDueCount（与侧边栏角标同一数据源，不许另算一套到期口径）');
  ok(/<ReviewDueCard dueCount=\{dueCount\}/.test(dash),
    '待复习卡接收的是全局到期数变量（不许写死字面量）');
  ok(/if \(dueCount <= 0\) return null;/.test(review),
    '待复习卡：到期 0 → 整卡 return null（不渲染"已清零"占位）');
  ok(/onNavigate\('\/vocabulary'\)/.test(review),
    '待复习卡点击去 /vocabulary（复习入口）');
  // 门控按新增的第三张卡**重新推导**（不是放宽）：三卡都空才不占行，两卡版式必须消失。
  ok(/\{\(lastVisit \|\| dueCount > 0 \|\| pendingCorrections > 0\) && \(/.test(dash),
    '续学/复习/纠偏行整体门控：三卡都空时该行不占位');
  ok(!/\{\(lastVisit \|\| dueCount > 0\) && \(/.test(dash),
    '正对照：旧的两卡门控必须消失（漏掉第三张 = 只有纠偏待办时整行不出现）');

  /* 3. 本周概览：本地日期 + 查表 + 图表三层不互压 */
  ok(/import \{ formatDate \} from '@\/lib\/utils'/.test(week),
    '本周概览日期走 formatDate（本地日期）');
  ok(!/toISOString/.test(week),
    '本周概览零 toISOString（东八区凌晨错天，全站禁用）');
  ok(/for \(let i = 6; i >= 0; i--\)/.test(week),
    '近 7 天由日期循环生成（不许 slice(-7) 取 calendar 数组尾 —— 跨天未学习时尾部是昨天，柱状错位一天）');
  ok(/byDate\.get\(date\)/.test(week),
    'calendar 按日期字符串查表取分钟');
  ok(/h-\d+/.test(week) && /items-end/.test(week),
    '柱状容器有固定高度 h-*（标题/柱/星期三层不互压；值可随版式调整，但不能省）');
  ok(/<WeekGlanceCard calendar=\{calendar\}/.test(dash),
    '首页把 calendar 真实传进本周概览');
  ok(/onNavigate\('\/progress'\)/.test(week),
    '本周概览点击去 /progress 看详情');
  ok(/d\.minutes > 0 \? Math\.max\(8, /.test(week),
    '0 分钟的日子有 4px 存根柱（不是整列消失）');

  /* 4. 首页「表达纠偏待重考」横幅 + ?tab= 深链（2026-10-17 新增） */
  const note = srcs.notedrill, vpage = srcs.vocab;
  ok(/if \(pendingCount <= 0\) return null;/.test(note),
    '纠偏横幅：0 条待重考 → 整卡 return null（与待复习卡同一条口径，不许常驻占行）');
  ok(/onNavigate\('\/vocabulary\?tab=correction'\)/.test(note),
    '纠偏横幅点击带 ?tab=correction 深链（只跳 /vocabulary 等于还要再点一次模式卡）');
  ok(/<NoteDrillCard pendingCount=\{pendingCorrections\} onNavigate=\{navigate\} \/>/.test(dash),
    '首页真的挂上纠偏横幅并把计数传进去（写了组件没挂载 = 用户永远看不见）');
  ok(/corrNotes\.filter\(\(n\) => !n\.review\)\.length/.test(dash),
    '横幅计数 = **还没重考过**的条数（拿全部条数会把已处理的常驻催用户）');
  ok(/\(lastVisit \|\| dueCount > 0 \|\| pendingCorrections > 0\) && \(/.test(dash),
    '续学/复习/纠偏三卡都空时整行不占位');
  ok(/const want = searchParams\.get\('tab'\);\s*\n\s*if \(!want \|\| !MODES\.some\(\(m\) => m\.key === want\)\) return;/.test(vpage),
    '深链只认 MODES 里的 key（拼错或外来参数一律无视，不硬切 tab）');
  ok(/setSearchParams\(\{\}, \{ replace: true \}\);\s*\n\s*enterMode\(want\);/.test(vpage),
    '深链：抹掉参数 + 走 enterMode（只 setTab 会停在模式列表；留参数则刷新再抢一次焦点）');
  ok(/if \(!setupDone \|\| showWizard\) return;/.test(vpage),
    '首设向导没走完不强进模式（那时该让用户先选书）');

  return results;
}

/* ───────────── 原始跑：必须全绿 ───────────── */
const results = runChecks(originals);
const failed = results.filter((r) => !r.pass);
for (const r of failed) console.log(`  ✗ ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);

/* ───────────── 变异测试：每条必须至少红一条 ───────────── */
const MUTATIONS = [
  { name: 'labels 表删掉 /sentences 行（复发旧漏）', file: 'dashboard',
    from: "\n        '/sentences': '句子学习',", to: '' },
  { name: '待复习卡 0 到期改为照常渲染（谎报横幅）', file: 'review',
    from: 'if (dueCount <= 0) return null;', to: 'if (dueCount < 0) return null;' },
  { name: '本周概览改用 toISOString（错天复发）', file: 'week',
    from: 'const date = formatDate(d);', to: 'const date = d.toISOString().slice(0, 10);' },
  { name: '柱状容器丢固定高度（三层互压复发）', file: 'week',
    from: 'flex h-20 items-end gap-1.5', to: 'flex h-auto items-end gap-1.5' },
  { name: '首页传给待复习卡的到期数写死 0（断线伪装）', file: 'dashboard',
    from: '<ReviewDueCard dueCount={dueCount}', to: '<ReviewDueCard dueCount={0}' },
  { name: '纠偏横幅 0 条也照常渲染（谎报待重考）', file: 'notedrill',
    from: 'if (pendingCount <= 0) return null;', to: 'if (pendingCount < 0) return null;' },
  { name: '纠偏横幅丢掉深链参数（进去还得再点一次模式卡）', file: 'notedrill',
    from: "onNavigate('/vocabulary?tab=correction')", to: "onNavigate('/vocabulary')" },
  { name: '首页把横幅计数换成全部条数', file: 'dashboard',
    from: 'corrNotes.filter((n) => !n.review).length', to: 'corrNotes.length' },
  { name: '续学/复习/纠偏三卡的行门控漏掉第三张', file: 'dashboard',
    from: ' || pendingCorrections > 0', to: '' },
  { name: '深链只 setTab 不进沉浸态（用户仍停在模式列表）', file: 'vocab',
    from: '    enterMode(want);', to: '    setTab(want);' },
  { name: '深链不校验 key（任意 tab 参数都硬切）', file: 'vocab',
    from: "if (!want || !MODES.some((m) => m.key === want)) return;", to: 'if (!want) return;' },
];

let mutationOk = 0;
for (const m of MUTATIONS) {
  const mutated = { ...originals, [m.file]: originals[m.file].replace(m.from, m.to) };
  if (mutated[m.file] === originals[m.file]) {
    console.log(`  ✗ 变异未生效（锚点没匹配上）：${m.name}`);
    continue;
  }
  const red = runChecks(mutated).filter((r) => !r.pass);
  if (red.length >= 1) mutationOk++;
  else console.log(`  ✗ 变异后断言仍全绿（守卫无效）：${m.name}`);
}
ok_mutation: {
  if (mutationOk !== MUTATIONS.length) {
    results.push({ pass: false, name: `变异测试 ${mutationOk}/${MUTATIONS.length} 命中（守卫必须每条变异步都验红）` });
  } else {
    results.push({ pass: true, name: `变异测试 ${mutationOk}/${MUTATIONS.length} 全部验红` });
  }
}

/* ───────────── 汇总 ───────────── */
const failedFinal = results.filter((r) => !r.pass);
for (const r of results.filter((x) => x.pass && x.name.startsWith('变异测试'))) {
  console.log(`  · ${r.name}`);
}
console.log(`\n断言 ${results.length - failedFinal.length}/${results.length} 通过`);
if (failedFinal.length) { console.log('✗ 有失败'); process.exit(1); }
console.log('✓ 首页内容扩展三条契约成立（续学标签表 / 待复习横幅口径 / 本周柱状日期与高度）');
