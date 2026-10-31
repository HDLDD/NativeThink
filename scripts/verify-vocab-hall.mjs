#!/usr/bin/env node
/**
 * verify-vocab-hall.mjs — 背单词 9 个模式大厅的回归守卫。
 *
 * 背景：首页除「每日学习 / 复习检测」外，其余 7 个模式只有一行说明；
 * 用户不知道哪个模式有断点、多少到期、多少待重考。现在每个模式最多给一行
 * 真实状态（到期 / 断点 / 待重考 / 已记 / 最好成绩），没有状态就退回说明。
 *
 * A 段：真转译 `src/lib/vocab-mode-hall.ts`，跑 9 模式覆盖、分组、状态优先级、
 *        空状态不造假 0、断点/每日/词汇量解析器。
 * B 段：接线（大厅挂载、稳定 data 属性、9 个图标、所有状态源、向导/深链闸门、
 *        大厅不加载词库）。
 * C 段：四条检查器变异（拔大厅 / 去行 key / 大厅里 queryWords / 旧排除名单复活）
 *        + 图标缺失变异 + 模式表漏项变异。
 *
 * 用法：node scripts/verify-vocab-hall.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(process.env.TEMP || '/tmp', 'vocab-hall-check');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });

const js = ts.transpileModule(
  fs.readFileSync(path.join(ROOT, 'src/lib/vocab-mode-hall.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const outFile = path.join(TMP, 'vocab-mode-hall-under-test.mjs');
fs.writeFileSync(outFile, js);
const m = await import(pathToFileURL(outFile).href);

for (const fn of ['buildVocabModeHall', 'parseOrderedSession', 'parseDailySession', 'parseVocabTestBest', 'formatHallCount']) {
  if (typeof m[fn] !== 'function') { console.error(`脚手架错误：没导出 ${fn}`); process.exit(2); }
}
for (const data of ['VOCAB_MODES', 'VOCAB_MODE_GROUPS']) {
  if (!Array.isArray(m[data])) { console.error(`脚手架错误：没导出 ${data}`); process.exit(2); }
}

const KEYS = ['daily', 'quickcard', 'flashcard', 'phrasecard', 'c2e', 'correction', 'browse', 'collocations', 'vocabtest'];

/* ───────────── A. 数据与分组 ───────────── */
ok(m.VOCAB_MODES.length === 9, '模式表 9 个模式一个不少', `实际 ${m.VOCAB_MODES.length}`);
ok(new Set(m.VOCAB_MODES.map((x) => x.key)).size === 9, '模式 key 不重复');
ok(KEYS.every((k) => m.VOCAB_MODES.some((x) => x.key === k)), '9 个预期 key 全部登记');
ok(m.VOCAB_MODES[0]?.key === 'daily', '每日学习是模式表第一项（向导/首页的主线）');
ok(new Set(m.VOCAB_MODES.map((x) => x.label)).size === 9, '模式标签不重复，首页不会出现两张同名卡');
ok(m.VOCAB_MODE_GROUPS.length === 4 &&
  m.VOCAB_MODE_GROUPS.map((g) => g.key).join(',') === 'main,review,output,tool',
  '分组固定为 主线 / 复习与巩固 / 主动输出 / 工具');
ok(m.VOCAB_MODES.every((x) => m.VOCAB_MODE_GROUPS.some((g) => g.key === x.group)), '每个模式都有分组归属');
ok(m.VOCAB_MODES.filter((x) => x.group === 'main').map((x) => x.key).join(',') === 'daily',
  '主线组只放每日学习（其余 8 个模式不许混进 hero）');

const coverageIssues = (modes) => {
  const issues = [];
  for (const k of KEYS) if (!modes.some((x) => x.key === k)) issues.push(`缺 ${k}`);
  return issues;
};
ok(coverageIssues(m.VOCAB_MODES).length === 0, '覆盖检查器自检：真实模式表无缺口');
ok(coverageIssues(m.VOCAB_MODES.filter((x) => x.key !== 'correction')).length === 1,
  '变异 M5：模式表漏掉纠偏重考 → 覆盖检查器变红');

const EMPTY = {
  todayLearned: 0,
  dailyQuota: 20,
  dueCurrent: 0,
  dueGlobal: 0,
  dailyResume: null,
  quickcardResume: null,
  quickcardPending: 0,
  flashcardResume: null,
  phraseResume: null,
  phraseBankLabel: '四级',
  c2eResume: null,
  correctionPending: 0,
  correctionTotal: 0,
  browseMemorized: 0,
  vocabTestBest: null,
};
const build = (patch = {}) => m.buildVocabModeHall({ ...EMPTY, ...patch });
const find = (hall, key) => [hall.daily, ...hall.groups.flatMap((g) => g.items)].find((x) => x.key === key)
  ?? { key, status: '__MISSING__', badge: null, tone: 'neutral', resumable: false };

const emptyHall = build();
ok(emptyHall.daily.key === 'daily', '空状态也有每日学习 hero');
ok(emptyHall.daily.status === '今日已学 0/20 词 · 还可新学 20',
  '每日 hero 显示今日已学/目标，而不是只显示一个累计数', emptyHall.daily.status);
ok(emptyHall.dailyProgress.learned === 0 && emptyHall.dailyProgress.quota === 20,
  'hero 进度条数据与状态文案同源');
ok(emptyHall.groups.length === 3 && emptyHall.groups.map((g) => g.key).join(',') === 'review,output,tool',
  '大厅只渲染三个非主线分组');
const emptyItems = emptyHall.groups.flatMap((g) => g.items);
ok(emptyItems.length === 8, '三个分组共 8 个模式（不含 daily）', `实际 ${emptyItems.length}`);
const allKeys = [emptyHall.daily.key, ...emptyItems.map((x) => x.key)];
ok(new Set(allKeys).size === 9 && KEYS.every((k) => allKeys.includes(k)),
  '大厅一次性覆盖全部 9 个模式且不重复');
ok(emptyItems.every((x) => x.group !== 'main'), 'hero 不在分组里重复出现');

/* ───────────── B. 状态：不造假 0、优先级正确 ───────────── */
ok(find(emptyHall, 'flashcard').status === '当前书暂无到期',
  '无到期时说「暂无到期」，不写「0 个到期」', find(emptyHall, 'flashcard').status);
ok(find(emptyHall, 'quickcard').status === null, '快速闪卡没有状态时退回模式说明');
ok(find(emptyHall, 'phrasecard').status === null, '短语闪卡没有状态时退回模式说明');
ok(find(emptyHall, 'c2e').status === null, '中译英没有状态时退回模式说明');
ok(find(emptyHall, 'correction').status === '纠偏本还没有内容',
  '空纠偏本给真实空态，不是假待重考数', find(emptyHall, 'correction').status);
ok(find(emptyHall, 'browse').status === null, '词库浏览没有已记词时退回模式说明');
ok(find(emptyHall, 'vocabtest').status === null, '词汇量测试没有成绩时退回模式说明');
ok(emptyItems.every((x) => !/^\s*0\s*(个|张|条|词|题)/.test(x.status || '')),
  '空状态里没有任何裸 0 当状态');

const dueWins = find(build({ dueCurrent: 3, dueGlobal: 7, flashcardResume: { index: 2, total: 10 } }), 'flashcard');
ok(dueWins.status === '当前书 3 个到期' && dueWins.badge === '到期' && dueWins.tone === 'due' && !dueWins.resumable,
  '复习检测：当前书到期优先于断点（状态/角标/语气一致）', JSON.stringify(dueWins));

const resumeWins = find(build({ flashcardResume: { index: 2, total: 10 } }), 'flashcard');
ok(resumeWins.status === '可续学 第 3/10 张' && resumeWins.badge === '继续' && resumeWins.tone === 'resume' && resumeWins.resumable,
  '复习检测：无到期但有断点时显示可续学（下标 2 → 第 3 张）', JSON.stringify(resumeWins));

const globalWins = find(build({ dueGlobal: 7 }), 'flashcard');
ok(globalWins.status === '其他词书 7 个到期' && globalWins.badge === '到期',
  '复习检测：当前书无到期、全站有到期时明说别的书有', JSON.stringify(globalWins));
const resumeOverGlobal = find(build({ dueGlobal: 7, flashcardResume: { index: 2, total: 10 } }), 'flashcard');
ok(resumeOverGlobal.status === '可续学 第 3/10 张' && resumeOverGlobal.resumable,
  '复习检测：当前书有断点时先续学（其他书到期只是提示，不抢一行状态）', JSON.stringify(resumeOverGlobal));

const dailyResume = build({ todayLearned: 3, dailyQuota: 20, dailyResume: { index: 4, total: 10 } });
ok(dailyResume.daily.status === '今日已学 3/20 词 · 还可新学 17' &&
  dailyResume.daily.badge === '继续 5/10' && dailyResume.daily.resumable,
  '每日 hero：今日进度 + 断点角标（393px 下不把状态行挤成两行）', JSON.stringify(dailyResume.daily));
const dailyDone = build({ todayLearned: 20, dailyQuota: 20 });
ok(dailyDone.daily.status.includes('今日目标已完成') && dailyDone.daily.badge === '今日完成' && !dailyDone.daily.resumable,
  '每日 hero：达到目标后给完成态，不留假「继续」', JSON.stringify(dailyDone.daily));
const noQuota = build({ todayLearned: 3, dailyQuota: 0 });
ok(noQuota.daily.status === '今日已学 3 词' && noQuota.daily.badge === null,
  '每日 hero：没有配额时只报已学，不显示 3/0', noQuota.daily.status);

const quickResume = find(build({ quickcardResume: { index: 3, total: 12 } }), 'quickcard');
ok(quickResume.status === '可续学 第 4/12 张' && quickResume.badge === '继续' && quickResume.resumable,
  '快速闪卡：断点显示为第 x/y 张');
const quickPending = find(build({ quickcardPending: 4 }), 'quickcard');
ok(quickPending.status === '当前累积 4 张' && quickPending.badge === null,
  '快速闪卡：没有断点但有余数时显示当前累积');
const quickBad = find(build({ quickcardResume: { index: 12, total: 12 } }), 'quickcard');
ok(quickBad.status === null, '坏断点（index 越界）当作没有断点，不显示第 13/12 张');

const phrase = find(build({ phraseResume: { index: 2, total: 10 }, phraseBankLabel: '雅思' }), 'phrasecard');
ok(phrase.status === '可续学 第 3/10 张 · 雅思' && phrase.badge === '继续',
  '短语闪卡：断点带题库名，用户知道续的是哪一库', phrase.status);
const c2e = find(build({ c2eResume: { index: 1, total: 6 } }), 'c2e');
ok(c2e.status === '可续学 第 2/6 题' && c2e.badge === '继续',
  '中译英：断点显示第 x/y 题');
const corr = find(build({ correctionPending: 2, correctionTotal: 5 }), 'correction');
ok(corr.status === '待重考 2 条 · 共 5 条' && corr.badge === '待重考' && corr.tone === 'pending',
  '纠偏重考：未考过的数量走 pending 语气，并把总数一起说清楚（模式会连考过的一起重考）');
const corrAll = find(build({ correctionPending: 3, correctionTotal: 3 }), 'correction');
ok(corrAll.status === '待重考 3 条', '纠偏重考：全部都没考过时不重复「共 3 条」');
const corrDone = find(build({ correctionPending: 0, correctionTotal: 5 }), 'correction');
ok(corrDone.status === '已重考完 5 条' && corrDone.badge === null,
  '纠偏重考：全考完时给完成态，不显示 0 条待重考');
const browse = find(build({ browseMemorized: 12 }), 'browse');
ok(browse.status === '已记 12 词', '词库浏览：显示用户已记词数');
const test = find(build({ vocabTestBest: 8200 }), 'vocabtest');
ok(test.status === '最好成绩约 8,200 词', '词汇量测试：显示最好成绩并带千分位', test.status);
ok(m.formatHallCount(8200) === '8,200', '大厅千分位固定 en-US，守卫读数稳定');

/* ───────────── C. 断点解析器 ───────────── */
const ordered = m.parseOrderedSession(JSON.stringify({ order: ['a', 'b', 'c'], index: 1 }));
ok(ordered?.index === 1 && ordered?.total === 3, 'order 断点：index=1/total=3 正确');
ok(m.parseOrderedSession(JSON.stringify({ order: ['a', 'b'], index: 2 })) === null,
  'order 断点：index 越界按无效（不能显示第 3/2 张）');
ok(m.parseOrderedSession(JSON.stringify({ order: [], index: 0 })) === null,
  'order 断点：空队列按无效');
ok(m.parseOrderedSession('{坏 JSON') === null, 'order 断点：坏 JSON 不抛错');
const daily = m.parseDailySession(JSON.stringify({ words: ['a', 'b', 'c'], index: 2 }));
ok(daily?.index === 2 && daily?.total === 3, 'daily 断点：words/index 正确');
ok(m.parseDailySession(JSON.stringify({ order: ['a'], index: 0 })) === null,
  'daily 断点：字段形状不对（order）不误读');
const best = m.parseVocabTestBest(JSON.stringify({ estimate: 8200.9 }));
ok(best === 8200, '词汇量最好成绩取整');
ok(m.parseVocabTestBest(JSON.stringify({ estimate: 0 })) === null, '词汇量最好成绩 0 按无成绩');
ok(m.parseVocabTestBest('坏 JSON') === null, '词汇量最好成绩坏 JSON 不抛错');

/* ───────────── D. 接线 ───────────── */
const page = fs.readFileSync(path.join(ROOT, 'src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx'), 'utf8');
const hallSrc = fs.readFileSync(path.join(ROOT, 'src/pages/DeepVocabularyPage/components/VocabModeHall.tsx'), 'utf8');
const libSrc = fs.readFileSync(path.join(ROOT, 'src/lib/vocab-mode-hall.ts'), 'utf8');

const hallWiringIssues = (pageSrc, hallCode) => {
  const issues = [];
  if (!/<VocabModeHall\s+hall=\{hall\}/.test(pageSrc)) issues.push('大厅未挂载');
  if (!/MODE_ICONS/.test(pageSrc)) issues.push('无图标表');
  if (!/data-vocab-mode=\{mode\.key\}/.test(hallCode)) issues.push('行模板无稳定 key');
  if (!/data-vocab-group=\{group\.key\}/.test(hallCode)) issues.push('分组无稳定 key');
  if (!/items\.map\(\(mode\) =>/.test(hallCode)) issues.push('没有展开全部模式');
  if (/queryWords|preloadLevels|loadPhrases/.test(hallCode)) issues.push('大厅里加载了词库');
  if (/MODES\.filter\(\(m\) => m\.key !== 'daily'/.test(pageSrc)) issues.push('旧排除名单仍在');
  return issues;
};
const realIssues = hallWiringIssues(page, hallSrc);
ok(realIssues.length === 0, '接线检查器自检：真实源码零问题', realIssues.join('；'));
ok(hallWiringIssues(page.replace(/<VocabModeHall[\s\S]*?\/>/g, ''), hallSrc).length > 0,
  '变异 M1：拔掉大厅挂载 → 接线检查器变红');
ok(hallWiringIssues(page, hallSrc.replace(/data-vocab-mode=\{mode\.key\}/g, '')).length > 0,
  '变异 M2：行模板去掉稳定 key → 接线检查器变红');
ok(hallWiringIssues(page, hallSrc + '\n// queryWords').length > 0,
  '变异 M3：大厅里出现 queryWords → 接线检查器变红');
ok(hallWiringIssues(page + "\n{MODES.filter((m) => m.key !== 'daily' && m.key !== 'flashcard').map(x => x)}", hallSrc).length > 0,
  '变异 M4：旧首页排除名单复活 → 接线检查器变红');

const iconBlock = page.match(/const MODE_ICONS[^{]*\{([\s\S]*?)\n\};/);
const missingIconKeys = (pageSrc) => {
  const block = pageSrc.match(/const MODE_ICONS[^{]*\{([\s\S]*?)\n\};/)?.[1] ?? '';
  return KEYS.filter((k) => !new RegExp(`\\b${k}\\s*:`).test(block));
};
ok(!!iconBlock && missingIconKeys(page).length === 0,
  'MODE_ICONS 覆盖全部 9 个模式', missingIconKeys(page).join(','));
ok(missingIconKeys(page.replace(/\n\s*quickcard:\s*Zap,/, '\n')).length === 1,
  '变异 M2b：图标表删掉 quickcard → 缺图标检查器变红');

ok(/const MODES = VOCAB_MODES\.map/.test(page) &&
  /from '@\/lib\/vocab-mode-hall'/.test(page),
  '页面 MODES 从 VOCAB_MODES 派生（标签/分组/颜色不在页面重复一份）');
ok(!/MODES\.filter\(\(m\) => m\.key !== 'daily' && m\.key !== 'flashcard'\)/.test(page),
  '正对照：旧首页「其余模式」排除名单已移除');
ok(/<VocabModeHall hall=\{hall\} icons=\{MODE_ICONS\} onEnter=\{enterMode\} \/>/.test(page),
  '大厅接的是同一份 hall / 图标表 / enterMode');
ok(/data-vocab-mode="daily"/.test(hallSrc) && /data-vocab-group="main"/.test(hallSrc),
  '每日学习 hero 有稳定的 data 属性和独立主线组');
ok(/hall\.dailyProgress/.test(hallSrc) && /hall\.daily\.status/.test(hallSrc),
  'hero 同时消费进度数据与状态文案（同源）');
ok(/VOCAB_MODE_GROUPS\.filter\(\(g\) => g\.key !== 'main'\)/.test(hallSrc) &&
  /hall\.groups\.find/.test(hallSrc),
  '大厅按 VOCAB_MODE_GROUPS 渲染，并只取 main 之外的三个分组');
ok(!/queryWords|preloadLevels|loadPhrases|@\/data\/wordbank/.test(hallSrc),
  '大厅组件不加载词库（角标只读廉价会话/进度）');

for (const [label, re] of [
  ['每日断点', /__nativethink_daily_session_\$\{selectedLevel\}/],
  ['快速闪卡断点', /loadQuickCardSession\(selectedLevel\)/],
  ['快速闪卡累积', /getQuickCardPending\(selectedLevel\)/],
  ['复习断点', /loadSession\(selectedLevel\)/],
  ['短语断点', /loadPhraseSession\(phraseBank\)/],
  ['中译英断点', /__nativethink_vocab_c2e_session_\$\{selectedLevel\}/],
  ['纠偏本', /useCorrectionNotes\(\)/],
  ['浏览已记', /memorizedWords\.size/],
  ['词汇量成绩', /parseVocabTestBest\(/],
  ['短语库名', /PHRASE_LEVEL_LABELS\[phraseBank\]/],
]) {
  ok(re.test(page), `状态源接线：${label}`);
}
ok(/if \(!setupDone\) \{ handleOpenWizard\(\); return; \}/.test(page),
  '进入模式仍受 setupDone 闸门保护（没选书先回向导）');
ok(/MODES\.some\(\(m\) => m\.key === want\)/.test(page) && /enterMode\(want\)/.test(page),
  '?tab= 深链仍只认模式表里的 key 并直达');
ok(/!immersed && !showWizard/.test(page) && /<VocabModeHall/.test(page),
  '大厅只在非沉浸、非向导时渲染');

/* ───────────────────────── 汇总 ───────────────────────── */
const failed = results.filter((r) => !r.pass);
for (const r of failed) console.log(`  ✗ ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
console.log(`\n断言 ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) { console.log('✗ 有失败'); process.exit(1); }
console.log('✓ 背单词模式大厅：9 模式覆盖、状态优先级、断点解析与接线都对得上');