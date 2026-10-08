/**
 * verify-study-credit.mjs — 「学习时长按动作计 + 同一作答去重」的回归防线。
 *
 * 背景（口径必须先说清，否则这条守卫会被后人当"过度约束"删掉）：
 * `addStudyMinutes` 一次改三处（今日分钟数 / 模块进度环 / 日历与连胜，use-learning-stats.ts:241-296）。
 * 思维训练、对话、语块接龙、写作批改的计时口径**刻意**选的是「按提交动作计」而不是「按 AI 是否回了计」，
 * 理由是"写了但 AI 挂了"那次是真实学习投入，不该因为服务不可用而彻底不计。
 * 该口径唯一的破口是**重复刷**：同一题同一句话连点五次提交就涨五格。
 * 所以修法是 `src/lib/study-credit.ts` 的去重闸门 —— 计时位置**不动**（仍在请求之前），
 * 只是同一（动作, 题目身份, 用户原文）只放行一次。
 *
 * 因此本守卫同时钉两件事，缺一条就退回旧缺陷：
 *   A. 闸门接上了（重复提交不再刷）；
 *   B. 计时仍在请求之前（不许偷偷改成"AI 回了才计"，那会让服务不可用时的真实作答归零）。
 * 另外钉住「本地动作（语块复习打分、选择题判定）不许被闸门吞掉」—— 那些没有重复刷的破口，
 * 一旦被改成 creditOnce，换题/换选项就再也不计时长。
 *
 * 用法：node scripts/verify-study-credit.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
const check = (cond, label, detail) => {
  if (cond) pass++;
  else { fail++; failures.push(label + (detail ? ` — ${detail}` : '')); }
};

/** 把 lib 的 TS 源转成可导入的 .mjs（剥掉 import 与 export 关键字，末尾统一导出） */
function transpile(relPath, extraExports) {
  const src = readFileSync(join(ROOT, relPath), 'utf8')
    .replace(/^import[^\n]*\n/gm, '')
    .replace(/^export (?=(const|function|let|class))/gm, '');
  const mod = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const file = join(mkdtempSync(join(tmpdir(), 'nt-credit-')), relPath.replaceAll('/', '_') + '.mjs');
  writeFileSync(file, mod + `\nexport { ${extraExports} };`, 'utf8');
  return file;
}

/** 取 handler 函数体：从 `const NAME = ` 到下一个行首 `};` */
function fnBody(src, name) {
  const start = src.indexOf(`const ${name} = `);
  if (start < 0) return '';
  const end = src.indexOf('\n  };', start);
  return end > start ? src.slice(start, end) : '';
}

// ── ① creditKey：同一作答归一，不同作答区分 ──
{
  const mod = await import(pathToFileURL(transpile('src/lib/study-credit.ts', 'creditKey, makeCreditGate, CREDIT_SEEN_LIMIT')).href);
  const { creditKey, makeCreditGate, CREDIT_SEEN_LIMIT } = mod;

  check(creditKey('detector', 'I very like this book.') === creditKey('detector', '  I   very like this book.  '),
    'creditKey：空白差异仍算同一次作答');
  check(creditKey('detector', 'a') !== creditKey('back', 'a'),
    'creditKey：动作类型不同则不同键（ detector 与 back 同一句话各自计一次）');
  check(creditKey('chain', 'take off', 'I took it off.') !== creditKey('chain', 'put off', 'I took it off.'),
    'creditKey：题目身份进键（换语块后同一句能再计）');
  check(creditKey('x', null, undefined, 'y') === creditKey('x', '', '', 'y'),
    'creditKey：null/undefined 与空串同形');
  const long = creditKey('essay', 'p1', '词'.repeat(5000));
  check(long.length <= 300, 'creditKey：长作文不把键撑爆', `实际长度 ${long.length}`);
}

// ── ② 闸门真跑：放行一次、FIFO 淘汰、淘汰后能再计 ──
{
  const mod = await import(pathToFileURL(transpile('src/lib/study-credit.ts', 'creditKey, makeCreditGate, CREDIT_SEEN_LIMIT')).href);
  const { makeCreditGate, CREDIT_SEEN_LIMIT } = mod;

  const gate = makeCreditGate();
  check(gate.credit('k1') === true, '闸门：首次放行');
  check(gate.credit('k1') === false, '闸门：同键重复被拦（这就是"连点不刷进度环"）');
  check(gate.credit('k2') === true && gate.size() === 2, '闸门：不同键各自放行且计数正确');

  const small = makeCreditGate(3);
  ['a', 'b', 'c', 'd'].forEach((k) => small.credit(k));
  check(small.size() === 3, '闸门：超上限按 FIFO 收缩', `实际 ${small.size()}`);
  check(small.credit('b') === false && small.credit('c') === false && small.credit('d') === false,
    '闸门：窗口内的三条仍被拦');
  check(small.credit('a') === true, '闸门：被淘汰的最早一条能重新计入（不是永久拉黑）');
  check(small.size() === 3, '闸门：重新计入后仍不超上限', `实际 ${small.size()}`);
  check(small.credit('b') === true, '闸门：再挤掉的是次早写入的 b（淘汰严格按写入序）');
  check(small.credit('d') === false && small.size() === 3, '闸门：窗口滚动时最后写入的 d 仍在');

  check(CREDIT_SEEN_LIMIT === 400, '闸门：默认上限 400 条');

  // 正对照：只 add 不删 order 的坏实现在上面两条会红 —— 这里自证检查器有效
  const broken = (() => {
    const seen = new Set();
    return { credit(k) { if (seen.has(k)) return false; seen.add(k); return true; }, size: () => seen.size };
  })();
  const b3 = broken; // 无上限版
  for (let i = 0; i < 10; i++) b3.credit('x' + i);
  check(b3.size() === 10, '正对照：无 FIFO 的闸门会无限增长（被 ②的上限断言抓住）');
}

// ── ③ 接线：六个 AI/提交类站点都走闸门，且计时位置仍在请求之前 ──
{
  const think = readFileSync(join(ROOT, 'src/pages/ThinkInEnglishPage/ThinkInEnglishPage.tsx'), 'utf8');
  const conv = readFileSync(join(ROOT, 'src/pages/ConversationPage/ConversationPage.tsx'), 'utf8');
  const chunks = readFileSync(join(ROOT, 'src/pages/ChunkTrainingPage/ChunkTrainingPage.tsx'), 'utf8');
  const writing = readFileSync(join(ROOT, 'src/pages/WritingPage/WritingPage.tsx'), 'utf8');

  check(/from '@\/lib\/study-credit'/.test(think) && /from '@\/lib\/study-credit'/.test(conv)
    && /from '@\/lib\/study-credit'/.test(chunks) && /from '@\/lib\/study-credit'/.test(writing),
    '四个页面都引入 study-credit');

  // 每个站点的键都必须同时含「题目身份」与「用户原文」—— 只有原文会让"换个场景说同一句"
  // 不再计（M9 变异就是这么溜过去的），只有题目身份会让"连点同一句"重复计。
  const handlers = [
    ['handleDetectorSubmit', think, 'detector', ['input']],
    ['handleTranslationSubmit', think, 'translation', ['exercise.prompt', 'input']],
    ['handleBackSubmit', think, 'back', ['exercise.keyword', 'input']],
    ['handleNativeSubmit', think, 'native', ['exercise.chineseText', 'input']],
    ['handleSend', conv, 'send', ['selectedScenario?.name', 'text']],
    ['handleChainSubmit', chunks, 'chain', ['chunkContent', 'input']],
    ['handleSubmit', writing, 'submit', ['selectedPrompt.id', 'text']],
  ];
  for (const [name, src, tag, parts] of handlers) {
    const body = fnBody(src, name);
    check(body.length > 0, `${name}：函数体可定位（正对照的前提）`);
    const iCredit = body.indexOf('creditOnce(');
    const iAbort = body.indexOf('new AbortController()');
    // 取整条 creditOnce 语句（到本行行尾），不用固定字符窗口 —— 窗口截断会把断言变成假绿
    const stmtEnd = body.indexOf('\n', iCredit);
    const stmt = iCredit >= 0 ? body.slice(iCredit, stmtEnd > iCredit ? stmtEnd : iCredit + 300) : '';
    check(iCredit >= 0, `${name}：计时走闸门`);
    check(iCredit >= 0 && iAbort >= 0 && iCredit < iAbort,
      `${name}：计时仍在发请求之前（不许改成"AI 回了才计"）`, `credit=${iCredit} abort=${iAbort}`);
    check(stmt.includes(`'${tag}'`), `${name}：键里带动作类型 ${tag}`);
    for (const idPart of parts) check(stmt.includes(idPart), `${name}：键里带 ${idPart}`);
  }

  // B 项口径：不许出现"拿到内容才计时"的写法（那会让 AI 不可用时的真实作答归零）
  check(!/if \(full\.trim\(\)\) (?:\{ )?addStudyMinutes/.test(think), '思维：不存在"AI 回了才计时"的写法');
  check(!/if \(full\.trim\(\)\) addStudyMinutes/.test(conv), '对话：不存在"AI 回了才计时"的写法');
  check(!/if \(feedback\.trim\(\)\) addStudyMinutes/.test(chunks), '语块：不存在"AI 回了才计时"的写法');

  // 历史留档仍按内容判（计时与留档是两件事，不许顺手把 recordDetectorHistory 也挪走）
  check(/if \(full\.trim\(\)\) recordDetectorHistory\(input\);/.test(think), '思维：检测历史仍只在真拿到内容时留档');
}

// ── ④ 本地动作不许被闸门吞掉（正对照：全页一刀切改 creditOnce 会红） ──
{
  const chunks = readFileSync(join(ROOT, 'src/pages/ChunkTrainingPage/ChunkTrainingPage.tsx'), 'utf8');
  const writing = readFileSync(join(ROOT, 'src/pages/WritingPage/WritingPage.tsx'), 'utf8');

  const mark = fnBody(chunks, 'handleReviewMark');
  const answer = fnBody(chunks, 'checkAnswer');
  check(/addStudyMinutes\(0\.2, 'chunks'\)/.test(mark) && !/creditOnce/.test(mark),
    '语块复习打分：直计时，不经闸门（每答一张都该涨）');
  check(/addStudyMinutes\(1, 'chunks'\)/.test(answer) && !/creditOnce/.test(answer),
    '语块选择题判定：直计时，不经闸门');
  check(/addStudyMinutes\(0\.5, 'writing'\)/.test(writing) && !/creditOnce\('writing', creditKey\('start/.test(writing),
    '写作开题：直计时（换题回来还能再计）');
  check(/creditOnce\('writing', creditKey\('submit', selectedPrompt\.id, text\), 3\)/.test(writing),
    '写作交卷：一次计 3 分钟（名义时长不许悄悄降成默认的 1）');

  // 短语闪卡（词汇深度页第 7 模式）与语块复习是同一类**本地动作**：翻一张就该涨，
  // 没有"重复刷"的破口（每张卡只翻一次即计），所以同样不许套闸门。
  const pfm = readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/PhraseFlashcardMode.tsx'), 'utf8');
  const pfmFlipStart = pfm.indexOf('const flip = useCallback(');
  const pfmFlipBody = pfmFlipStart >= 0 ? pfm.slice(pfmFlipStart, pfm.indexOf('\n\n', pfmFlipStart)) : '';
  check(pfmFlipBody.length > 40, `短语闪卡 flip：函数体可定位（实际 ${pfmFlipBody.length} 字符）`);
  check(/addStudyMinutes\(0\.2, 'chunks'\)/.test(pfmFlipBody),
    '短语闪卡翻面：直计时 0.2 分（内容域=短语，与语块复习打分同口径）');
  check(!/creditOnce/.test(pfm), '短语闪卡：全文件不走闸门（本地动作，套上就会"翻过再翻不计"）');

  // 句子学习的独立造句是**另一种口径**（拿到反馈才计，AI 反馈就是这次练习的产物），
  // 这里钉住"口径不同"本身 —— 谁把它顺手统一成按动作计，同样算回归。
  const build = readFileSync(join(ROOT, 'src/pages/SentenceLabPage/components/BuildPractice.tsx'), 'utf8');
  const sub = fnBody(build, 'submit');
  check(sub.length > 0, 'BuildPractice.submit：函数体可定位');
  check(/creditOnce\('sentences', creditKey\('build', item\.keyword, text\), 0\.5\)/.test(sub),
    '句子学习造句：走闸门 + 键含关键词与原文 + 0.5 分钟');
  check(sub.indexOf('creditOnce') > sub.indexOf('if (!out.trim())'),
    '句子学习造句：仍在判空之后才计（这一处刻意与思维/对话口径不同）');
  check(!/addStudyMinutes/.test(build), '句子学习造句：不再直调 addStudyMinutes');
}

// ── ⑤ 闸门实现约束：淘汰必须同时清 seen，否则键永久拉黑 ──
{
  const lib = readFileSync(join(ROOT, 'src/lib/study-credit.ts'), 'utf8');
  check(/while \(order\.length > limit\) seen\.delete\(order\.shift\(\) as string\)/.test(lib),
    '闸门：FIFO 淘汰同时从 seen 移除（只删 order 会让键永久拉黑）');
  check(/if \(seen\.has\(key\)\) return false;/.test(lib), '闸门：重复键在写入前就返回 false');
  check(/const gateRef = useRef<ICreditGate \| null>\(null\);\s*\n\s*if \(!gateRef\.current\) gateRef\.current = makeCreditGate\(\);/.test(lib),
    'Hook：闸门随挂载新建（离开页面再回来算新的一段学习）');
  check(/addStudyMinutes\(minutes, moduleKey\)/.test(lib), 'Hook：放行时只调一次 addStudyMinutes');
}

console.log('');
console.log(`verify-study-credit: ${pass} 通过, ${fail} 失败`);
if (fail) {
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
