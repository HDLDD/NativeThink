#!/usr/bin/env node
/**
 * verify-spelling-logic.mjs — 句子拼写的题面/判分/排队口径回归守卫。
 *
 * 历史缺陷（2026-10-23 实测）：
 *  1. 词库例句大量使用排版弯引号（U+2019，6,863 条）。旧 `getWords` 用
 *     `[^a-zA-Z'-]` 剥字符，把 `It’s` 变成 `Its` —— 界面显示错、用户按原句
 *     拼写反而判错；数字 token（2,764 个）被剥成空串，纯标点变成空格子。
 *  2. `importDirty` effect 的依赖里带着每次答题都会换身份的 rebuildSession，
 *     点过一次「重新排队」后，每答一题/下一句都会重建队列并跳回第 1 句。
 *  3. `buildSessionQueue` 先 markServed(整池) 再由页面 slice，一本 6,827 句的
 *     词书点一次排队就把整池标成"刚出过"，排序失效。
 *
 * 用法：node scripts/verify-spelling-logic.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(process.env.TEMP || '/tmp', 'spelling-logic-check');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });
const eq = (actual, expected, name) => ok(
  JSON.stringify(actual) === JSON.stringify(expected),
  name,
  `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`,
);

/* ───────────── 转译真跑脚手架（ES2022：不要降到 ES5，展开会静默失效） ───────────── */
async function loadTranspiled(relPath, stripImports) {
  let src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  if (stripImports) src = src.split('\n').filter((line) => !/^\s*import\s/.test(line)).join('\n');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const outFile = path.join(TMP, path.basename(relPath).replace(/\.ts$/, '.mjs'));
  fs.writeFileSync(outFile, js);
  return import(pathToFileURL(outFile).href);
}

/* ───────────── A. 词形归一（真跑 src/lib/spelling-words.ts） ───────────── */
const words = await loadTranspiled('src/lib/spelling-words.ts', false);
for (const fn of ['normalizeSpellingWord', 'spellingTokens', 'getSpellingWords', 'normalizeSpellingAnswer', 'shuffledCopy']) {
  if (typeof words[fn] !== 'function') { console.error(`脚手架错误：没导出 ${fn}`); process.exit(2); }
}

eq(words.getSpellingWords('It’s just an ordinary camera.'),
  ["It's", 'just', 'an', 'ordinary', 'camera'],
  '弯引号归一：It’s 显示/作答都应是 It\'s（旧实现剥成 Its）');

ok(words.normalizeSpellingAnswer('It’s') === words.normalizeSpellingAnswer("IT'S"),
  '判分大小写 + 弯/直引号等价');
ok(words.normalizeSpellingAnswer('Its') !== words.normalizeSpellingAnswer('It’s'),
  '正对照：Its 与 It\'s 是两个词，不能被归一成同一个答案');

eq(words.getSpellingWords('Wait — it’s 2024, isn’t it?'),
  ['Wait', "it's", '2024', "isn't", 'it'],
  '纯标点 token 不占格；数字 2024 保留；空串 token 不产生');

eq(words.getSpellingWords('Acaleph, coral, actinia , electric eel, seaweed, shark, whale, seal…').slice(-1),
  ['seal'],
  '省略号不会把最后一个词剥空');

ok(words.getSpellingWords('They are blasé about it.').includes('blasé'),
  '重音字母保留在题面上（旧实现会剥成 blas）');
ok(words.normalizeSpellingAnswer('blasé') === words.normalizeSpellingAnswer('blase'),
  '判分时折叠重音：用户输入 blase 也算对');

eq(words.getSpellingWords('‘Okay, so maybe I was a little bit scared,’ Jenny admitted.').slice(0, 1),
  ['Okay'],
  '句首单引号不进入词形（‘Okay → Okay）');
ok(words.getSpellingWords('‘Okay, so maybe I was a little bit scared,’ Jenny admitted.').includes('scared'),
  '句尾引号/逗号不进入词形（scared,’ → scared）');

eq(words.getSpellingWords('a well—known fact'), ['a', 'well-known', 'fact'],
  '长破折号在词内归一成连字符');
ok(words.normalizeSpellingAnswer('students’') === words.normalizeSpellingAnswer("students'")
  && words.normalizeSpellingAnswer('students’') === words.normalizeSpellingAnswer('students'),
  '所有格尾撇号在判分口径一致（students’ / students\' / students）');

const punctTokens = words.spellingTokens('It’s just an ordinary camera.');
ok(punctTokens[0].raw === 'It’s' && punctTokens[0].word === "It's",
  'spellingTokens 同时保留原词（阅读展示）与归一答案（判分）');

const shuffled = words.shuffledCopy([1, 2, 3, 4, 5]);
eq([...shuffled].sort((a, b) => a - b), [1, 2, 3, 4, 5], 'shuffledCopy 是排列，不丢/不重');
ok(JSON.stringify(shuffled) !== JSON.stringify([1, 2, 3]), 'shuffledCopy 不返回原数组（正对照）');

/* ───────────── B. 排队逻辑（真跑 use-spelling-learning.ts 的纯函数） ───────────── */
const learning = await loadTranspiled('src/lib/use-spelling-learning.ts', true);
if (typeof learning.planSessionQueue !== 'function') {
  console.error('脚手架错误：没导出 planSessionQueue'); process.exit(2);
}

const mk = (id) => ({ id, en: `sentence ${id}`, zh: '', source: 'word_example', level: 'cet4', difficulty: 'beginner' });
const all = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(mk);
const progress = {
  A: { status: 'learning', nextReview: 1 },
  B: { status: 'mastered', nextReview: 0 },
  C: { status: 'reviewing', nextReview: 100 },
  D: { status: 'learning', nextReview: 200 },
};
const queue = learning.planSessionQueue(all, progress, ['A'], { F: 1000, G: 2000 });
eq(queue, ['C', 'D', 'E', 'F', 'G'],
  '队列顺序：到期(最老优先) → 从未出过 → 出过(最久未出)，且排除 completed / mastered');
eq(learning.planSessionQueue(all, progress, ['A'], { F: 1000, G: 2000 }, 2), ['C', 'D'],
  '本轮句数截断发生在纯函数里，返回的就是即将 markServed 的那批');
ok(queue.length === new Set(queue).size, '队列无重复 id');
eq(learning.planSessionQueue(all, progress, all.map((s) => s.id), {}, 10), [],
  '整桶都完成时返回空队列（页面据此进入空态/自动重排）');

// 从未出过的两条顺序随机，但必须整段排在 due 之后、seen 之前
const mixed = learning.planSessionQueue(
  ['due1', 'due2', 'new1', 'new2', 'seen1'].map(mk),
  {
    due1: { status: 'reviewing', nextReview: 1 },
    due2: { status: 'reviewing', nextReview: 2 },
  },
  [],
  { seen1: 1 },
);
ok(mixed[0] === 'due1' && mixed[1] === 'due2' && mixed[4] === 'seen1',
  '三段顺序稳定：due1 → due2 → 两个新句 → 已出过的', mixed.join(','));
ok(new Set(mixed.slice(2, 4)).size === 2 && mixed.slice(2, 4).every((id) => id.startsWith('new')),
  '从未出过的两条是新句，且不重不漏');

/* ───────────── C. 页面接线（静态断言，防止又退回旧写法） ───────────── */
const page = fs.readFileSync(path.join(ROOT, 'src/pages/SpellingPage/SpellingPage.tsx'), 'utf8');
// 剥注释后再断言：注释里提到"直接 rebuildSession()"不该把接线断言糊过去
const pageCode = ts.transpileModule(page, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, removeComments: true, jsx: ts.JsxEmit.Preserve },
}).outputText;

ok(pageCode.includes("from '@/lib/spelling-words'"),
  '页面从 spelling-words 取统一词形口径（单点归属）');
ok(/normalizeSpellingAnswer\(dictationInputs\[i\]/.test(pageCode)
  && /normalizeSpellingAnswer\(fillInputs\[inputIdx\]/.test(pageCode),
  '两种玩法的用户输入都走同一个判分归一');
ok(!/\.replace\(\/\[\^a-zA-Z'-\]\/g/.test(pageCode),
  '正对照：题目/判分里不再有旧的 [^a-zA-Z\'-] 剥字符写法');
ok(/function splitForFill[\s\S]{0,600}spellingTokens\(en\)/.test(pageCode),
  '填空切分与 getSpellingWords 共用同一份 token 列表（下标不会错位）');
ok(!/currentSentenceRef/.test(pageCode),
  '当前句不再用 ref 兜底（否则切到空桶仍显示上一本书的句子）');
ok(pageCode.includes('纠偏本还没有可练的句子'),
  '空桶有明确空态，不再把上一句留在界面上');
ok(/handleModeChange\('dictation'\)/.test(pageCode) && /handleModeChange\('fill'\)/.test(pageCode),
  '切换玩法走 handleModeChange（清掉上一模式的判分态）');
ok(/cancelWordPlay\(\);\s*tts\.cancel\(\);/.test(pageCode),
  '切句/切模式先清逐词串播定时器，再掐 TTS（否则旧词的 speak 会掐掉新句）');
ok(/cancelAutoRead\(\);\s*cancelWordPlay\(\);\s*tts\.speak\(currentSentence\.en\)/.test(pageCode),
  '提交后的重读先撤掉自动朗读/逐词串播定时器（否则它们会在重读途中再 speak，只读开头一小段）');
ok(/autoReadTimerRef\.current = setTimeout/.test(pageCode)
  && /cancelAutoRead\(\)/.test(pageCode),
  '自动朗读用可撤销的 ref 定时器，而不是没人能取消的局部 timer');
ok(/useEffect\(\(\) => \{\s*if \(importDirty > 0\)\s*rebuildSessionRef\.current\(\);\s*\}, \[importDirty\]\)/.test(pageCode),
  'importDirty 只在自身变化时重建一次（旧依赖 rebuildSession 会导致每答一题跳回第一句）');
const importFavBlock = pageCode.slice(pageCode.indexOf('const importFavoriteWords'), pageCode.indexOf('const handleBuildDatabase'));
ok(importFavBlock.includes('setImportDirty') && !importFavBlock.includes('rebuildSession('),
  '导入收藏单词后用 importDirty 等新句子库渲染再排队（直接 rebuildSession 会用旧闭包，刚导入的句子不出现）');
ok(!/await handleAIGenerate\(\);\s*rebuildSession\(\)/.test(pageCode),
  '正对照：AI 加句后也不再直接 rebuildSession（同样会闭包过期）');
ok(!/已加载[\s\S]{0,80}词库|数据库建立完成|该词库没有例句/.test(pageCode),
  '词书加载成功不弹 toast（「已加载 … 条例句 / 数据库建立完成 / 该词库没有例句」都已移除；失败仍保留错误提示）');
ok(/\{!completionShown && \(/.test(pageCode),
  '本轮完成后整个练习界面退出，只保留「本轮完成」页（旧实现完成横幅和练习卡同时显示）');
ok(/roundSize=\{sessionQueue\.length\}/.test(pageCode),
  '完成页显示本轮实际句数（sessionQueue.length），不是只显示今日累计');
ok(/bg-foreground\/55[^\n]*group-hover:bg-foreground\/75/.test(pageCode),
  '空格下划线用前景色 55% / hover 75% —— 旧 bg-white/90 在浅色卡片上几乎看不见');
ok(/border-muted-foreground\/40 hover:border-muted-foreground\/60/.test(pageCode),
  '填空模式的空位边框同步加深（空位和听写下划线要一样看得见）');
ok(/buildSessionQueue\(filtered, Math\.max\(1, roundSizeRef\.current\)\)/.test(pageCode)
  && /canRestoreQueue/.test(pageCode)
  && /savedQueue\.every/.test(pageCode)
  && !/buildSessionQueue\(filtered\)\.slice/.test(pageCode),
  '新建队列时本轮句数传给 buildSessionQueue（先截断后 markServed）；恢复旧队列不重新截断');
ok(/completedInPool >= poolIds\.size/.test(pageCode),
  '自动重排按当前桶的完成比例判断，不再混用全站完成数 / hook 句子条数');
ok(/pendingResumeIndex\.current = readResumeIndex\(lvl\)/.test(pageCode),
  '切换词书时真的读回该书的断点（此前只存在 storage 里，切回来仍从第 1 句开始）');

/* ───────────────────────── 汇总 ───────────────────────── */
const failed = results.filter((r) => !r.pass);
for (const r of failed) console.log(`  ✗ ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
console.log(`\n断言 ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) { console.log('✗ 有失败'); process.exit(1); }
console.log('✓ 拼写词形/判分/排队/接线都对得上');
