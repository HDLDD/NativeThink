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
 * 第 4 条（2026-11-01）：续学条从"只说模块名"升级成**真实断点**（`resume-overview.ts`）。
 * 这条最容易坏在两个地方，所以两头都钉：
 *  ① **键名漂移** —— 断点是各模块自己写的，首页只是读；写入方改键名，首页会静默退回
 *     只写模块名（守卫把六个键的字面量在写入方与读取方各查一遍）。
 *  ② **读出口径与续学口径不一致** —— 位置解析一律复用模块自己的
 *     parseOrderedSession / parseDailySession / loadPatternResume，所以真跑用它们的
 *     真实形状灌数据，并验「下标越界 / 老断点缺 queue / 快照过期」三类都不许谎报。
 *
 * 变异测试在内存里做（不落盘、跑完不写回），每条变异必须让至少一条断言变红。
 * 用法：node scripts/verify-dashboard-glance.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FILES = {
  dashboard: 'src/pages/DashboardPage/DashboardPage.tsx',
  review: 'src/pages/DashboardPage/ReviewDueCard.tsx',
  week: 'src/pages/DashboardPage/WeekGlanceCard.tsx',
  notedrill: 'src/pages/DashboardPage/NoteDrillCard.tsx',
  vocab: 'src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx',
  resume: 'src/lib/resume-overview.ts',
  // 断点键的**写入方**：首页只是读，键名漂了必须在这里红，而不是静默失去断点
  wFlashcard: 'src/lib/use-word-learning.ts',
  wDaily: 'src/pages/DeepVocabularyPage/components/DailyLearningMode.tsx',
  wC2e: 'src/pages/DeepVocabularyPage/components/ChineseToEnglishMode.tsx',
  wQuickcard: 'src/lib/quickcard-history.ts',
  wPhrase: 'src/lib/use-phrase-learning.ts',
  wChunk: 'src/pages/ChunkTrainingPage/ChunkTrainingPage.tsx',
};

/** [写入方文件, 键名, 说明] —— 两侧都必须出现同一个字面量 */
const RESUME_KEYS = [
  ['wFlashcard', '__nativethink_vocab_session_', '复习检测'],
  ['wDaily', '__nativethink_daily_session_', '每日学习'],
  ['wC2e', '__nativethink_vocab_c2e_session_', '中译英'],
  ['wQuickcard', '__nativethink_quickcard_session', '快速闪卡'],
  ['wPhrase', '__nativethink_phrase_session_', '短语闪卡'],
  ['wChunk', '__nativethink_chunk_review_session', '语块复习'],
];

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

  /* 5. 续学条的真实断点（2026-11-01）：键名两侧对齐 + 页面接线 */
  const resume = srcs.resume;
  for (const [writerFile, literal, what] of RESUME_KEYS) {
    ok(srcs[writerFile].includes(literal) && resume.includes(literal),
      `断点键「${what}」写入方与首页读的是同一个字面量（${literal}）`,
      `写入方缺=${!srcs[writerFile].includes(literal)} 首页缺=${!resume.includes(literal)}`);
  }
  ok(srcs.vocab.includes("const MEMORY_KEY = 'vocab-page'") && resume.includes("VOCAB_MEMORY_KEY = 'vocab-page'"),
    '词汇页的页面记忆键（level + 模式）两侧同源');
  ok(srcs.vocab.includes("safeStorage.getItem('phrase-card-bank')") && resume.includes("PHRASE_BANK_KEY = 'phrase-card-bank'"),
    '短语题库记忆键两侧同源（读不到就不写位置）');
  ok(!/from '@\/data\//.test(resume),
    'resume-overview 零数据依赖（标签表由页面注入，首页不为一行文案拖进词库数据）');
  ok(/import \{ findResumeSpot \} from '@\/lib\/resume-overview'/.test(dash) &&
    /findResumeSpot\(parsed\.path, \{ getItem: \(key\) => safeStorage\.getItem\(key\) \}, RESUME_LABELS\)/.test(dash),
    '首页把断点读取接到 safeStorage（不是另开一条裸 localStorage 通道）');
  ok(/const RESUME_LABELS = \{[\s\S]*level: LEVEL_LABELS,[\s\S]*SPELLING_POOLS\.map/.test(dash),
    '词书 / 题池中文名从单点标签表注入（纠偏、精听两个桶不在词书表里）');
  ok(/onClick=\{\(\) => navigate\(lastVisit\.href\)\}/.test(dash) &&
    !/onClick=\{\(\) => navigate\(lastVisit\.path\)\}/.test(dash),
    '续学条点的是带 ?tab= 深链的 href（只跳模块 = 进去还要自己找回那个模式）');
  ok(/\{lastVisit\.detail && \(/.test(dash) && /data-dashboard-resume-detail/.test(dash),
    '没有断点时不渲染位置行（界面退回只写模块名，不拿空串占位）');
  ok((resume.match(/detail: null/g) ?? []).length >= 6,
    '读不到断点一律 detail: null（不许造 0 / 「上次」）', String((resume.match(/detail: null/g) ?? []).length));

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
  { name: '断点键漂移：写入方改了键名而首页还在读旧的（复习检测）', file: 'wFlashcard',
    from: '`__nativethink_vocab_session_${level}`', to: '`__nativethink_vocab_breakpoint_${level}`' },
  { name: '断点键漂移：语块复习写入方改键', file: 'wChunk',
    from: "'__nativethink_chunk_review_session'", to: "'__nativethink_chunk_review_breakpoint'" },
  { name: '续学条丢深链（点进去还要自己找回那个模式）', file: 'dashboard',
    from: 'onClick={() => navigate(lastVisit.href)}', to: 'onClick={() => navigate(lastVisit.path)}' },
  { name: '没有断点也渲染位置行（拿空串占位）', file: 'dashboard',
    from: '{lastVisit.detail && (', to: '{true && (' },
  { name: '页面记忆键漂移（词汇页改了键，首页读不到 level/tab）', file: 'resume',
    from: "VOCAB_MEMORY_KEY = 'vocab-page'", to: "VOCAB_MEMORY_KEY = 'vocab-memory'" },
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

/* ───────────── 真跑：把 resume-overview 连同它的三个依赖编译进临时目录后 import ─────────────
   断点位置是"读别人的键 + 按别人的口径解析"，静态正则证明不了读出来是第几张 ——
   只能真跑。依赖图刻意收小：safe-storage 用替身（真跑一律注入 store），
   think-session-resume 走裸 localStorage，所以给它一个假 window。 */
const TMP = mkdtempSync(path.join(tmpdir(), 'nt-resume-spot-'));
fs.writeFileSync(path.join(TMP, 'safe-storage-shim.mjs'),
  'export const safeStorage = { getItem: () => null, setItem: () => false, removeItem: () => false };\n');

const compileInto = (rel, outName, rewrites = []) => {
  let src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const [from, to] of rewrites) src = src.split(from).join(to);
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  fs.writeFileSync(path.join(TMP, outName), js);
  return outName;
};

compileInto('src/lib/vocab-mode-hall.ts', 'vocab-mode-hall.mjs');
compileInto('src/lib/spelling-resume.ts', 'spelling-resume.mjs',
  [["from './safe-storage'", "from './safe-storage-shim.mjs'"]]);
compileInto('src/lib/think-session-resume.ts', 'think-session-resume.mjs');
const RESUME_REWRITES = [
  ["from '@/lib/vocab-mode-hall'", "from './vocab-mode-hall.mjs'"],
  ["from '@/lib/spelling-resume'", "from './spelling-resume.mjs'"],
  ["from '@/lib/think-session-resume'", "from './think-session-resume.mjs'"],
];
let loadSeq = 0;
const loadSpot = async (sourceRewrites = []) => {
  let src = fs.readFileSync(path.join(ROOT, 'src/lib/resume-overview.ts'), 'utf8');
  for (const [from, to] of sourceRewrites) {
    if (!src.includes(from)) throw new Error(`真跑变异未命中锚点：${from}`);
    src = src.split(from).join(to);
  }
  for (const [from, to] of RESUME_REWRITES) src = src.split(from).join(to);
  const out = compileIntoTmp(src, `resume-${++loadSeq}.mjs`);
  return import(pathToFileURL(path.join(TMP, out)).href);
};
const compileIntoTmp = (src, outName) => {
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  fs.writeFileSync(path.join(TMP, outName), js);
  return outName;
};

const LABELS = { level: { cet4: '四级', cet6: '六级' }, spellingPool: { correction: '纠偏表达', video: '视频精听' } };
const makeStore = (entries) => ({ getItem: (key) => (Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : null) });
const orderedSession = (total, index) => JSON.stringify({ order: Array.from({ length: total }, (_, i) => `w${i}`), index });
const dailySession = (total, index) => JSON.stringify({ words: Array.from({ length: total }, (_, i) => `w${i}`), index });

// 三稿会话走裸 localStorage：给一个只读替身
const rawStore = { map: new Map(), getItem(key) { return this.map.has(key) ? this.map.get(key) : null; } };
globalThis.window = { localStorage: rawStore };
const THINK_KEY = '__nativethink_think_session_resume';
const thinkSnapshot = (overrides = {}) => JSON.stringify({
  v: 1, patternId: 'subject-first', delayed: false,
  session: { queue: ['subject-first', 'verb-driven'], index: 0, retries: {}, results: {} },
  stage: 'writing', round: 1, selected: null, answer: 'He said that...', confidence: null,
  results: [null, null, null], rewriteAttempts: 0, recognitionIndex: 0, transferIndex: 0,
  updatedAt: Date.now(), ...overrides,
});

const spot = await loadSpot();
if (typeof spot.findResumeSpot !== 'function') { console.error('脚手架错误：findResumeSpot 没导出'); process.exit(2); }
const realRun = [];
const okr = (cond, name, detail) => realRun.push({ pass: !!cond, name, detail: detail === undefined ? '' : JSON.stringify(detail) });

/* 没有断点概念的模块 */
okr(spot.findResumeSpot('/articles', makeStore({}), LABELS) === null, '未登记的路由 → null（首页保持只写模块名）');

/* 词汇：五个模式的断点 + 深链 */
const vocabStore = (tab, extra = {}) => makeStore({
  'vocab-page': JSON.stringify({ level: 'cet4', tab }), ...extra,
});
okr(spot.findResumeSpot('/vocabulary',
  vocabStore('flashcard', { '__nativethink_vocab_session_cet4': orderedSession(20, 11) }), LABELS)
    ?.detail === '复习检测 · 四级 · 第 12/20 张' &&
  spot.findResumeSpot('/vocabulary', vocabStore('flashcard', { '__nativethink_vocab_session_cet4': orderedSession(20, 11) }), LABELS)?.href === '/vocabulary?tab=flashcard',
  '复习检测：位置 + ?tab= 深链都对（下标 11 报成第 12 张）',
  spot.findResumeSpot('/vocabulary', vocabStore('flashcard', { '__nativethink_vocab_session_cet4': orderedSession(20, 11) }), LABELS));
okr(spot.findResumeSpot('/vocabulary',
  vocabStore('daily', { '__nativethink_daily_session_cet4': dailySession(5, 2) }), LABELS)?.detail === '每日学习 · 四级 · 第 3/5 张',
  '每日学习按 words 计数（不是 order）');
okr(spot.findResumeSpot('/vocabulary',
  vocabStore('c2e', { '__nativethink_vocab_c2e_session_cet4': orderedSession(10, 0) }), LABELS)?.detail === '中译英 · 四级 · 第 1/10 题',
  '中译英的量词是「题」不是「张」');
okr(spot.findResumeSpot('/vocabulary',
  makeStore({ 'vocab-page': JSON.stringify({ level: '', tab: 'quickcard' }), '__nativethink_quickcard_session_all': orderedSession(30, 7) }), LABELS)?.detail === '快速闪卡 · 第 8/30 张',
  'level 为空落到 all 键，且不硬塞一个词书名');
const phraseOk = spot.findResumeSpot('/vocabulary',
  vocabStore('phrasecard', { 'phrase-card-bank': JSON.stringify('cet4'), '__nativethink_phrase_session_cet4': orderedSession(12, 3) }), LABELS);
okr(phraseOk?.detail === '短语闪卡 · 第 4/12 张' && phraseOk?.href === '/vocabulary?tab=phrasecard',
  '短语闪卡吃独立的题库记忆（不是当前词书）', phraseOk);
const phraseNoBank = spot.findResumeSpot('/vocabulary', vocabStore('phrasecard'), LABELS);
okr(phraseNoBank?.detail === null && phraseNoBank?.href === '/vocabulary?tab=phrasecard',
  '题库记忆缺失 → 宁可不写位置，也不猜一本', phraseNoBank);
const noSession = spot.findResumeSpot('/vocabulary', vocabStore('flashcard'), LABELS);
okr(noSession?.detail === null && noSession?.href === '/vocabulary?tab=flashcard',
  '该模式没有断点（从没练过）→ detail null，深链仍在', noSession);
okr(spot.findResumeSpot('/vocabulary',
  vocabStore('flashcard', { '__nativethink_vocab_session_cet4': orderedSession(20, 25) }), LABELS)?.detail === null,
  '正对照：下标越界的坏数据不谎报位置');
okr(spot.findResumeSpot('/vocabulary', vocabStore('browse', { '__nativethink_vocab_session_cet4': orderedSession(20, 3) }), LABELS)?.detail === null,
  '词库浏览没有会话断点概念 → 不去读别的模式的键');

/* 拼写 */
okr(spot.findResumeSpot('/spelling', makeStore({
  '__nativethink_spelling_resume_last': 'cet4',
  '__nativethink_spelling_resume_cet4': JSON.stringify({ currentIndex: 2, queue: ['a', 'b', 'c', 'd'] }),
}), LABELS)?.detail === '四级 · 第 3/4 句', '拼写按存下来的队列报总数');
okr(spot.findResumeSpot('/spelling', makeStore({
  '__nativethink_spelling_resume_last': 'cet4',
  '__nativethink_spelling_resume_cet4': JSON.stringify({ currentIndex: 4 }),
}), LABELS)?.detail === '四级 · 第 5 句', '老断点没有 queue → 只报第 N 句，不编一个总数');
okr(spot.findResumeSpot('/spelling', makeStore({
  '__nativethink_spelling_resume_last': 'correction',
  '__nativethink_spelling_resume_correction': JSON.stringify({ currentIndex: 0, queue: ['x'] }),
}), LABELS)?.detail === '纠偏表达 · 第 1/1 句', '纠偏 / 精听两个桶走注入的题池标签表');
okr(spot.findResumeSpot('/spelling', makeStore({}), LABELS)?.detail === null, '没选过题池 → null');

/* 语块复习 */
const chunkIds = Array.from({ length: 12 }, (_, i) => `c${i}`);
okr(spot.findResumeSpot('/chunks', makeStore({
  '__nativethink_chunk_review_session': JSON.stringify({ ids: chunkIds, index: 3 }),
}), LABELS)?.detail === '语块复习 · 第 4/12 个', '语块复习位置（ids + index）');
okr(spot.findResumeSpot('/chunks', makeStore({
  '__nativethink_chunk_review_session': JSON.stringify({ ids: chunkIds, index: 12 }),
}), LABELS)?.detail === null, '语块断点下标越界（本轮已走完）→ null');

/* 三稿会话 */
rawStore.map.set(THINK_KEY, thinkSnapshot());
okr(spot.findResumeSpot('/think', makeStore({}), LABELS)?.detail === '第 4/5 步 · 改写',
  '思维断点复用 resumeStepLabel（writing + round 1 = 第 4/5 步 · 改写）');
rawStore.map.set(THINK_KEY, thinkSnapshot({
  delayed: true, stage: 'feedback', round: 2,
  // feedback 阶段必须带着已出的反馈，否则整份快照按坏数据丢掉（sanitizePatternResume 的口径）
  results: [null, null, {
    pass: true, feedback: '更地道了', source: 'ai', answer: 'He said that...',
    transfer: {
      id: 't1', situation: '向同事说明进展', rubricFocus: '主语先行', why: '先给人再给事',
      modelAnswer: 'He said the report is done.', thinkingSteps: ['先定主语', '再挑动词', '句尾落重点'],
    },
  }],
}));
okr(spot.findResumeSpot('/think', makeStore({}), LABELS)?.detail === '延迟探测 · 第 5/5 步 · 最终反馈',
  '延迟探测与最终反馈一并带出');
rawStore.map.set(THINK_KEY, thinkSnapshot({ updatedAt: Date.now() - 3 * 24 * 3600 * 1000 }));
okr(spot.findResumeSpot('/think', makeStore({}), LABELS)?.detail === null,
  '超过两天的旧快照作废（与练习页同一口径，不各判一次）');
rawStore.map.delete(THINK_KEY);
okr(spot.findResumeSpot('/think', makeStore({}), LABELS)?.detail === null, '没练过 → null');

/* 坏数据一律不抛 */
const garbage = makeStore({
  'vocab-page': '{bad', 'phrase-card-bank': 'not json',
  '__nativethink_spelling_resume_last': 'cet4', '__nativethink_spelling_resume_cet4': '[1,2,3]',
  '__nativethink_chunk_review_session': 'null', '__nativethink_vocab_session_cet4': '""',
});
let threw = null;
try {
  for (const route of ['/vocabulary', '/spelling', '/chunks', '/think', '/writing']) {
    spot.findResumeSpot(route, garbage, LABELS);
  }
} catch (e) { threw = String(e); }
okr(threw === null, '满仓坏 JSON 也不抛错（首页不能为一行文案白屏）', threw);

/* 真跑变异：改坏实现，上面的期望必须落空 */
const realMutations = [
  { name: '位置漏掉 +1（0 基下标直接给用户看）', from: 'return `第 ${index + 1}/${total} ${unit}`;', to: 'return `第 ${index}/${total} ${unit}`;' },
  { name: '老断点也硬编一个总数（queue.length 为 0 时报「第 5/0 句」）',
    from: 'queue.length ? positionText(index, queue.length, \'句\')', to: 'true ? positionText(index, queue.length, \'句\')' },
  { name: '语块断点不校验下标（走完本轮还催着续学）',
    from: 'if (!ids.length || !Number.isFinite(index) || index < 0 || index >= ids.length) return plain;', to: 'if (!ids.length) return plain;' },
];
let realMutationOk = 0;
for (const m of realMutations) {
  const mutated = await loadSpot([[m.from, m.to]]);
  const brokeFlashcard = mutated.findResumeSpot('/vocabulary',
    vocabStore('flashcard', { '__nativethink_vocab_session_cet4': orderedSession(20, 11) }), LABELS)?.detail !== '复习检测 · 四级 · 第 12/20 张';
  const brokeSpelling = mutated.findResumeSpot('/spelling', makeStore({
    '__nativethink_spelling_resume_last': 'cet4', '__nativethink_spelling_resume_cet4': JSON.stringify({ currentIndex: 4 }),
  }), LABELS)?.detail !== '四级 · 第 5 句';
  const brokeChunk = mutated.findResumeSpot('/chunks', makeStore({
    '__nativethink_chunk_review_session': JSON.stringify({ ids: chunkIds, index: 12 }),
  }), LABELS)?.detail !== null;
  const hit = m.name.includes('漏掉 +1') ? brokeFlashcard : m.name.includes('老断点') ? brokeSpelling : brokeChunk;
  if (hit) realMutationOk += 1;
  else console.log(`  ✗ 真跑变异后行为未变（断言没在管事）：${m.name}`);
}
realRun.push({
  pass: realMutationOk === realMutations.length,
  name: `真跑变异 ${realMutationOk}/${realMutations.length} 全部验红`,
  detail: '',
});
results.push(...realRun);

/* ───────────── 汇总 ───────────── */
const failedFinal = results.filter((r) => !r.pass);
for (const r of failedFinal) console.log(`  ✗ ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
for (const r of results.filter((x) => x.pass && x.name.startsWith('变异测试'))) {
  console.log(`  · ${r.name}`);
}
console.log(`\n断言 ${results.length - failedFinal.length}/${results.length} 通过`);
if (failedFinal.length) { console.log('✗ 有失败'); process.exit(1); }
console.log('✓ 首页四条契约成立（续学标签表与真实断点 / 待复习横幅口径 / 本周柱状日期与高度 / ?tab= 深链）');
