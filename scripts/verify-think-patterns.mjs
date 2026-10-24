/**
 * verify-think-patterns.mjs — /think 模式库的数据契约（第一批）。
 *
 * 模式库是「思维模式复习」的内容底座（docs/superpowers/specs/2026-10-24-think-pattern-core-v1-design.md）：
 * 12 个模式（四层），每个模式 5 道识别题 + 5 个迁移场景（3 新情境 + 2 换措辞），共 120 个内容项。
 * 识别题的三个选项都必须**语法成立**，差在思维模式 —— 所以这里钉结构（数量 / 下标 / 唯一性 /
 * 非空 / 答案分布），不钉「哪个选项更像母语者」的语义判断（那由内容评审负责）。
 *
 * 数据模块用 ts.transpileModule 真转译后 import 真跑（不是正则读源码）：
 * 这样 `options` 拼错、`THINK_PATTERNS` 没导出、少写一个字段都会真炸。
 * 转译必须显式写 target: ES2022 —— 降到 ES5 会把展开/迭代换成静默返回空的替身（见 AGENTS.md 通用坑）。
 *
 * 形状不合规时**记失败并继续**，不从 for...of / .map 里抛出去 —— 守卫的价值是给出完整清单，
 * 而不是在第一处坏数据上崩掉。
 *
 * 用法：node scripts/verify-think-patterns.mjs（verify:all 自动发现）
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'src/data/think-patterns.ts';

/** 12 个 id，顺序也钉住（新模式按数据顺序引入；概览另按 layer 分组渲染）。 */
const EXPECTED_PATTERN_IDS = [
  'subject-first',
  'verb-driven',
  'end-focus',
  'soften-disagreement',
  'be-concrete',
  'make-logic-explicit',
  'polite-request',
  'fill-references',
  'hedge-stance',
  'register-shift',
  'compliment-response',
  'result-state',
];
const EXPECTED_LAYER_IDS = ['structure', 'verb', 'clarity', 'pragmatics'];
const ANSWER_INDICES = [0, 1, 2];

let pass = 0, fail = 0;
const failures = [];
const check = (cond, label, detail) => {
  if (cond) pass++;
  else { fail++; failures.push(label + (detail ? ` — ${detail}` : '')); }
};

const asArray = (value) => (Array.isArray(value) ? value : []);
const filled = (value) => typeof value === 'string' && value.trim().length > 0;

function loadPatterns() {
  const src = readFileSync(join(ROOT, FILE), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const file = join(mkdtempSync(join(tmpdir(), 'nt-patterns-')), 'patterns.mjs');
  writeFileSync(file, js, 'utf8');
  return import(pathToFileURL(file).href);
}

const mod = await loadPatterns();
const patterns = mod.THINK_PATTERNS;

check(Array.isArray(patterns), '数据：THINK_PATTERNS 是数组', typeof patterns);
const list = asArray(patterns);

check(list.length === 12, '数据：恰好 12 个模式', `实际 ${list.length}`);

const patternIds = list.map((p) => p?.id);
check(patternIds.every(filled), '数据：每个模式都有非空 id', patternIds.filter((id) => !filled(id)).join(','));
check(patternIds.join(',') === EXPECTED_PATTERN_IDS.join(','),
  '数据：模式 id 与 12 个预期 id 逐一对应（含顺序）', patternIds.join(','));
check(new Set(patternIds).size === patternIds.length, '数据：模式 id 唯一', patternIds.join(','));

/* 四层元数据：每层有名字/描述，每个模式落在合法层里，四层各至少 2 个模式。 */
const layerMeta = mod.THINK_PATTERN_LAYERS;
check(Array.isArray(layerMeta) && layerMeta.length === 4,
  '数据：THINK_PATTERN_LAYERS 恰好 4 层', `实际 ${asArray(layerMeta).length}`);
check(asArray(layerMeta).map((layer) => layer?.id).join(',') === EXPECTED_LAYER_IDS.join(','),
  '数据：四层 id 与预期逐一对应（含顺序）', asArray(layerMeta).map((layer) => layer?.id).join(','));
check(asArray(layerMeta).every((layer) => filled(layer?.name) && filled(layer?.description)),
  '数据：每层都有名称与描述');
const layerIds = asArray(layerMeta).map((layer) => layer?.id);
check(list.every((pattern) => layerIds.includes(pattern?.layer)),
  '数据：每个模式的 layer 都是合法层', list.filter((pattern) => !layerIds.includes(pattern?.layer)).map((pattern) => pattern?.id).join(','));
const perLayerCounts = layerIds.map((layerId) => list.filter((pattern) => pattern?.layer === layerId).length);
check(perLayerCounts.every((count) => count >= 2),
  '数据：四层各至少 2 个模式', perLayerCounts.join('/'));

/* 内容项 id 会被当作 React key，必须全局唯一且非空。 */
const contentIds = list.flatMap((p) => [
  ...asArray(p?.recognition).map((q) => q?.id),
  ...asArray(p?.transfer).map((t) => t?.id),
]);
check(contentIds.length === 120, '数据：内容项共 120 个（60 识别 + 60 迁移）', `实际 ${contentIds.length}`);
check(contentIds.every(filled), '数据：识别题/迁移题 id 全部非空',
  contentIds.filter((id) => !filled(id)).join(','));
check(new Set(contentIds).size === contentIds.length, '数据：内容项 id 全局唯一',
  `重复 ${contentIds.filter((id, i) => contentIds.indexOf(id) !== i).join(',')}`);

for (const p of list) {
  const pid = filled(p?.id) ? p.id : '(缺 id)';

  check(filled(p?.name), `数据：${pid} 有名称`);
  check(filled(p?.oneLiner), `数据：${pid} 有一句话原则`);
  check(filled(p?.contrast?.chineseThinking) && filled(p?.contrast?.native) && filled(p?.contrast?.note),
    `数据：${pid} 对比三字段完整`);
  check(Array.isArray(p?.cues) && p.cues.length >= 2 && p.cues.every(filled),
    `数据：${pid} 至少 2 条非空线索`, `实际 ${asArray(p?.cues).length}`);

  const recognition = asArray(p?.recognition);
  check(Array.isArray(p?.recognition), `数据：${pid} recognition 是数组`, typeof p?.recognition);
  check(recognition.length === 5, `数据：${pid} 恰好 5 道识别题`, `实际 ${recognition.length}`);
  for (const q of recognition) {
    const qid = filled(q?.id) ? q.id : `${pid}/(缺 id)`;
    const options = asArray(q?.options);

    check(filled(q?.prompt), `数据：${qid} 有题干`);
    check(Array.isArray(q?.options), `数据：${qid} options 是数组`, typeof q?.options);
    check(options.length === 3, `数据：${qid} 三个选项`, `实际 ${options.length}`);
    check(options.every(filled), `数据：${qid} 选项非空`,
      options.filter((o) => !filled(o)).join(','));
    check(new Set(options).size === options.length, `数据：${qid} 选项不重复`);
    check(q?.answer === 0 || q?.answer === 1 || q?.answer === 2,
      `数据：${qid} answer 合法`, String(q?.answer));
    check(filled(q?.explanation), `数据：${qid} 有解释`);
    check(!/[ABC]\s*(?:[/／、]\s*[ABC]\s*)?[\u4e00-\u9fff]/.test(q?.explanation ?? ''),
      `数据：${qid} 解释不按 A/B/C 字母指代选项`, q?.explanation);
  }

  const transfer = asArray(p?.transfer);
  check(Array.isArray(p?.transfer), `数据：${pid} transfer 是数组`, typeof p?.transfer);
  check(transfer.length === 5, `数据：${pid} 恰好 5 道迁移题`, `实际 ${transfer.length}`);
  const transferKinds = transfer.map((t) => t?.kind ?? 'scenario');
  check(transferKinds.every((kind) => kind === 'scenario' || kind === 'wording'),
    `数据：${pid} 迁移 kind 合法`, transferKinds.join(','));
  check(transferKinds.filter((kind) => kind === 'wording').length === 2,
    `数据：${pid} 恰好 2 条换措辞迁移`, transferKinds.join(','));
  check(transferKinds.filter((kind) => kind === 'scenario').length === 3,
    `数据：${pid} 恰好 3 条新情境迁移`, transferKinds.join(','));
  for (const t of transfer) {
    const tid = filled(t?.id) ? t.id : `${pid}/(缺 id)`;
    check(filled(t?.situation) && filled(t?.rubricFocus) && filled(t?.why) && filled(t?.modelAnswer),
      `数据：${tid} 迁移字段完整（含 why）`);
    check(Array.isArray(t?.thinkingSteps) && t.thinkingSteps.length === 3 && t.thinkingSteps.every(filled),
      `数据：${tid} 先想三步完整`);
  }
}

/* 思维体检：每模式一道识别题，题面引用必须真实存在且不重复。 */
const diagnosticItems = mod.THINK_PATTERN_DIAGNOSTIC;
check(Array.isArray(diagnosticItems) && diagnosticItems.length === 12,
  '诊断：恰好 12 道体检题', `实际 ${asArray(diagnosticItems).length}`);
const diagnosticPatternIds = asArray(diagnosticItems).map((item) => item?.patternId);
const diagnosticChoiceIds = asArray(diagnosticItems).map((item) => item?.choiceId);
check(new Set(diagnosticPatternIds).size === 12 && EXPECTED_PATTERN_IDS.every((id) => diagnosticPatternIds.includes(id)),
  '诊断：12 个模式各被抽到一次', diagnosticPatternIds.join(','));
check(new Set(diagnosticChoiceIds).size === diagnosticChoiceIds.length,
  '诊断：识别题 id 不重复', diagnosticChoiceIds.join(','));
for (const item of asArray(diagnosticItems)) {
  const pattern = list.find((candidate) => candidate?.id === item?.patternId);
  const choice = asArray(pattern?.recognition).find((candidate) => candidate?.id === item?.choiceId);
  check(!!choice, `诊断：${item?.patternId} 的题目 ${item?.choiceId} 存在`);
}

/* 改写快练：每道识别题派生一条，source 与 target 必须不同。 */
const rewrites = mod.THINK_PATTERN_REWRITES;
check(Array.isArray(rewrites) && rewrites.length === 60,
  '改写：60 道派生题', `实际 ${asArray(rewrites).length}`);
const rewriteIds = asArray(rewrites).map((item) => item?.id);
check(rewriteIds.every(filled) && new Set(rewriteIds).size === rewriteIds.length,
  '改写：id 非空且唯一', rewriteIds.join(','));
check(asArray(rewrites).every((item) => filled(item?.prompt) && filled(item?.source) &&
  filled(item?.target) && filled(item?.explanation) && item.source !== item.target),
  '改写：题面/原句/目标/解释完整且 source≠target');
check(asArray(rewrites).every((item) => /原句：/.test(item?.explanation) && /参考：/.test(item?.explanation)),
  '改写：解释只讲当前原句与参考（不复用整段识别题解释）');
check(new Set(asArray(rewrites).map((item) => item?.patternId)).size === 12,
  '改写：覆盖 12 个模式');
check(new Set(asArray(rewrites).slice(0, 10).map((item) => item?.patternId)).size === 10,
  '改写：前 10 题覆盖 10 个不同模式（按题号轮转，不是整块按模式）');

/* 固定顺序展示时，答案不能全压在一个下标上，否则用户能靠位置蒙对。 */
const allChoices = list.flatMap((p) => asArray(p?.recognition));
const answerCounts = ANSWER_INDICES.map((index) => allChoices.filter((q) => q?.answer === index).length);
check(allChoices.length === 60 && answerCounts.every((count) => count === 20),
  '数据：60 道识别题的答案下标均衡分布（0/1/2 各 20 道）', answerCounts.join('/'));

/* 逐项说明：每个选项都要说清“这句英文怎么样”，不能只给一个整体解释。 */
const optionNotes = mod.THINK_PATTERN_OPTION_NOTES;
const noteIssues = [];
if (!optionNotes || typeof optionNotes !== 'object' || Array.isArray(optionNotes)) {
  noteIssues.push('missing THINK_PATTERN_OPTION_NOTES');
}
const noteKeys = Object.keys(optionNotes ?? {});
for (const q of allChoices) {
  const notes = optionNotes?.[q?.id];
  if (!Array.isArray(notes) || notes.length !== 3) {
    noteIssues.push(`${q?.id}: 不是 3 条`);
    continue;
  }
  notes.forEach((note, i) => {
    if (!note || !['best', 'ok', 'off'].includes(note.tone)) {
      noteIssues.push(`${q.id}[${i}]: tone`);
    }
    if (!filled(note?.text)) {
      noteIssues.push(`${q.id}[${i}]: empty`);
    }
    if ((i === q.answer) !== (note?.tone === 'best')) {
      noteIssues.push(`${q.id}[${i}]: best 必须只落在 answer`);
    }
  });
}
check(noteKeys.length === allChoices.length && allChoices.every((q) => noteKeys.includes(q.id)),
  '数据：逐项说明覆盖全部 60 道识别题', `keys=${noteKeys.length}`);
check(noteIssues.length === 0, '数据：每个选项都有逐项说明且 best 落在正确项',
  noteIssues.slice(0, 10).join(' | '));

/* ── 纯调度模块（src/lib/think-patterns.ts）───────────────────────────────
 * 纯函数模块只允许 `import type`，没有运行时依赖 —— 所以可以真转译后直接 import 跑，
 * 而不是正则读源码。SM-2 口径与句子复习（use-sentence-review.ts）一致。
 */
const pure = await import(pathToFileURL(
  (() => {
    const src = readFileSync(join(ROOT, 'src/lib/think-patterns.ts'), 'utf8');
    const js = ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const file = join(mkdtempSync(join(tmpdir(), 'nt-pattern-pure-')), 'pure.mjs');
    writeFileSync(file, js, 'utf8');
    return file;
  })(),
).href);

const now = Date.UTC(2026, 9, 23, 4, 0, 0);
const today = '2026-10-23';

const first = pure.applyPatternResult(undefined, {
  patternId: 'subject-first', recognitionCorrect: true, transferPassed: true,
  source: 'ai', answer: 'I have seen it.', feedback: '好', today,
}, now);
check(first.repetitions === 1 && first.interval === 1, 'SM-2：第一次通过 → 1 天');
check(first.aiTransferPasses === 1 && first.status === 'reviewing', 'SM-2：AI 通过计数与 reviewing');

const second = pure.applyPatternResult(first, {
  patternId: 'subject-first', recognitionCorrect: false, transferPassed: true,
  source: 'ai', answer: 'I saw it.', feedback: '好', today,
}, now + 86400000);
check(second.repetitions === 2 && second.interval === 3, 'SM-2：第二次通过 → 3 天');
check(second.lastAttempt.recognitionCorrect === false, 'SM-2：记录识别错');

const failed = pure.applyPatternResult(second, {
  patternId: 'subject-first', recognitionCorrect: true, transferPassed: false,
  source: 'ai', answer: 'wrong', feedback: '再试', today,
}, now + 2 * 86400000);
check(failed.repetitions === 0 && failed.interval === 0 && failed.lapses === 1, 'SM-2：失败重置并记 lapse');
check(failed.nextReview === now + 2 * 86400000, 'SM-2：失败立即到期');

let self = pure.applyPatternResult(undefined, {
  patternId: 'subject-first', recognitionCorrect: true, transferPassed: true,
  source: 'self', answer: 'ok', feedback: '自评', today,
}, now);
for (let i = 0; i < 3; i++) {
  self = pure.applyPatternResult(self, {
    patternId: 'subject-first', recognitionCorrect: true, transferPassed: true,
    source: 'self', answer: 'ok', feedback: '自评', today,
  }, now + (i + 1) * 86400000);
}
check(self.status !== 'mastered', 'SM-2：只有自评不能 mastered');
check(self.aiTransferPasses === 0, 'SM-2：自评不计入 AI 通过次数');

const p = (id, over = {}) => ({
  patternId: id, status: 'learning', easeFactor: 2.5, interval: 0, repetitions: 0,
  nextReview: 0, lastReview: 0, lapses: 0, firstReviewedAt: now, firstReviewedOn: today,
  recognitionCorrect: 0, recognitionTotal: 1, transferPasses: 0, transferAttempts: 0,
  aiTransferPasses: 0, ...over,
});
const progress = {
  'subject-first': p('subject-first', { lastAttempt: { at: now, on: today, pass: false, recognitionCorrect: false, answer: '', feedback: '', source: 'ai' } }),
  'verb-driven': p('verb-driven', { status: 'mastered', firstReviewedOn: '2026-10-22' }),
  'soften-disagreement': p('soften-disagreement', { firstReviewedOn: '2026-10-22', lastAttempt: { at: now, on: today, pass: true, recognitionCorrect: true, answer: '', feedback: '', source: 'ai' } }),
};
const queue = pure.buildReviewQueue({ patterns, progress, now, today, maxPatterns: 10, maxNewPerDay: 2 });
check(queue.includes('subject-first'), '队列：今天失败的模式可回队');
check(!queue.includes('soften-disagreement'), '队列：今天已通过的模式不再进本轮');
check(!queue.includes('verb-driven'), '队列：mastered 不进队列');
check(queue.filter((id) => !progress[id]).length <= 2, '队列：每天最多 2 个新模式');
check(queue.length <= 10, '队列：总上限 10');

const retry1 = pure.pushRetry(['a', 'b'], 'a', {}, 2);
check(retry1.retried && retry1.queue.at(-1) === 'a', '重试：失败推到队尾');
const retry2 = pure.pushRetry(retry1.queue, 'a', retry1.retries, 2);
const retry3 = pure.pushRetry(retry2.queue, 'a', retry2.retries, 2);
check(retry3.retried === false, '重试：超过 2 次不再回队');
check(JSON.stringify(pure.dropQueuedRetries(['a', 'b', 'a'], 0, 'a')) === JSON.stringify(['a', 'b']),
  '重试：通过后清掉未来重复副本');

const weak = pure.getWeakPatterns(patterns, {
  'subject-first': p('subject-first', { lapses: 3, transferAttempts: 4, transferPasses: 1 }),
  'verb-driven': p('verb-driven', { lapses: 1, transferAttempts: 2, transferPasses: 1 }),
}, 3);
check(weak[0]?.pattern.id === 'subject-first', '薄弱：lapses 优先');

check(pure.pickRecognitionIndex(4, 3) === 1, '轮换：识别题按总次数取模');
check(pure.pickTransferIndex(3, 2) === 1, '轮换：迁移题按尝试次数取模');
check(pure.isDue(p('subject-first', { nextReview: 0 }), now, today), '队列：isDue 认到期项');
check(!pure.isDue(p('subject-first', { lastAttempt: { at: now, on: today, pass: true, recognitionCorrect: true, answer: '', feedback: '', source: 'ai' } }), now, today),
  '队列：今天已通过的 isDue=false');

const pruned = pure.pruneDaily({ '2026-09-01': ['a'], '2026-10-23': ['b'] }, today, 31);
check(!pruned['2026-09-01'] && pruned['2026-10-23'], 'daily：只保留最近 31 天');

/* 闭卷迁移：第 3 次及以后复习收起“先想三步”；失败会重置 repetitions，重试自动开卷。 */
check(!pure.isClosedBook(undefined) && !pure.isClosedBook(null) &&
  !pure.isClosedBook({ repetitions: 0 }) && !pure.isClosedBook({ repetitions: 1 }),
  '闭卷：第 1-2 次复习保持开卷');
check(pure.isClosedBook({ repetitions: 2 }) && pure.isClosedBook({ repetitions: 5 }),
  '闭卷：第 3 次及以后复习进入闭卷');

/* 四层地图：total / mastered / due 口径。 */
const layerProgress = {
  'subject-first': p('subject-first', { status: 'mastered' }),
  'verb-driven': p('verb-driven', { nextReview: now - 1 }),
  'hedge-stance': p('hedge-stance', {
    lastAttempt: { at: now, on: today, pass: true, recognitionCorrect: true, answer: '', feedback: '', source: 'ai' },
  }),
};
const layerSnapshot = JSON.stringify(layerProgress);
const layerSummary = pure.summarizeLayers(patterns, layerProgress, EXPECTED_LAYER_IDS, now, today);
const layerById = Object.fromEntries(layerSummary.map((row) => [row.layerId, row]));
check(layerSummary.length === 4 && layerSummary.map((row) => row.layerId).join(',') === EXPECTED_LAYER_IDS.join(','),
  '层统计：四层各返回一行且顺序稳定', JSON.stringify(layerSummary));
check(layerById.structure?.total === 3 && layerById.structure?.mastered === 1 && layerById.structure?.due === 0,
  '层统计：信息结构 3 个、已掌握 1、到期 0', JSON.stringify(layerById.structure));
check(layerById.verb?.total === 2 && layerById.verb?.due === 1,
  '层统计：动词与焦点 2 个、到期 1', JSON.stringify(layerById.verb));
check(layerById.clarity?.total === 3 && layerById.clarity?.due === 0,
  '层统计：今天已通过的模式不算到期', JSON.stringify(layerById.clarity));
check(layerById.pragmatics?.total === 4 && layerById.pragmatics?.due === 0,
  '层统计：语域与语用 4 个、未开始不算到期', JSON.stringify(layerById.pragmatics));
check(JSON.stringify(layerProgress) === layerSnapshot, '层统计：不修改入参（纯函数）');

/* 思维体检计分：全对 → 无建议；错一题 → 只建议那一个模式；层分按真实模式数。 */
const diagItems = mod.THINK_PATTERN_DIAGNOSTIC;
const diagCorrectAnswers = {};
for (const item of diagItems) {
  const pattern = patterns.find((candidate) => candidate.id === item.patternId);
  const choice = pattern?.recognition.find((candidate) => candidate.id === item.choiceId);
  if (choice) diagCorrectAnswers[item.choiceId] = choice.answer;
}
const allCorrect = pure.scoreDiagnostic(patterns, diagItems, diagCorrectAnswers, EXPECTED_LAYER_IDS);
check(allCorrect.correct === 12 && allCorrect.total === 12,
  '诊断：全对 12/12', JSON.stringify(allCorrect));
check(allCorrect.recommendedPatternIds.length === 0 && allCorrect.missedPatternIds.length === 0,
  '诊断：全对时没有建议模式', JSON.stringify(allCorrect.recommendedPatternIds));
check(allCorrect.layers.map((layer) => layer.total).join('/') === '3/2/3/4',
  '诊断：四层题量按真实模式数（3/2/3/4）', allCorrect.layers.map((layer) => layer.total).join('/'));

const firstDiag = diagItems[0];
const wrongAnswers = {
  ...diagCorrectAnswers,
  [firstDiag.choiceId]: (diagCorrectAnswers[firstDiag.choiceId] + 1) % 3,
};
const oneWrong = pure.scoreDiagnostic(patterns, diagItems, wrongAnswers, EXPECTED_LAYER_IDS);
check(oneWrong.correct === 11 && oneWrong.recommendedPatternIds.join(',') === firstDiag.patternId,
  '诊断：错一题只建议对应模式', JSON.stringify(oneWrong.recommendedPatternIds));
check(oneWrong.layers.find((layer) => layer.layerId === 'structure')?.correct === 2,
  '诊断：结构层错一题 → 2/3', JSON.stringify(oneWrong.layers));
check(pure.scoreDiagnostic(patterns, diagItems, {}, EXPECTED_LAYER_IDS).correct === 0,
  '诊断：没作答不猜对（空答案 → 0/12）');

/* 按体检结果组队：去重、跳过已掌握/今天已通过、封顶 10。 */
const diagnosticProgress = {
  'verb-driven': p('verb-driven', { status: 'mastered' }),
  'end-focus': p('end-focus', {
    lastAttempt: { at: now, on: today, pass: true, recognitionCorrect: true, answer: '', feedback: '', source: 'ai' },
  }),
};
const diagnosticQueue = pure.buildDiagnosticQueue(
  ['subject-first', 'subject-first', 'verb-driven', 'end-focus'],
  diagnosticProgress,
  today,
  10,
);
check(JSON.stringify(diagnosticQueue) === JSON.stringify(['subject-first']),
  '诊断队列：去重并跳过已掌握/今天已通过', JSON.stringify(diagnosticQueue));
check(pure.buildDiagnosticQueue(EXPECTED_PATTERN_IDS, {}, today, 10).length === 10,
  '诊断队列：最多 10 个模式');

/* 自由训练：挑练得最少的模式，平手按数据顺序；不受到期限制。 */
const practiceProgress = {
  'subject-first': p('subject-first', { transferAttempts: 3 }),
  'verb-driven': p('verb-driven', { transferAttempts: 0 }),
  'end-focus': p('end-focus', { transferAttempts: 1 }),
};
const practiceOrder = pure.pickPracticePatternIds(patterns.slice(0, 3), practiceProgress, 3);
check(practiceOrder[0] === 'verb-driven' && practiceOrder[1] === 'end-focus',
  '自由训练：练得最少的排前面', JSON.stringify(practiceOrder));
check(pure.pickPracticePatternIds(patterns, {}, 5).length === 5,
  '自由训练：混合队列默认取 5 个');
check(pure.pickPracticePatternIds(patterns, {}, 0).length === 0,
  '自由训练：limit=0 返回空队列');

/* 延迟探测：7/21/60 天阈值；没有迁移通过记录时不标延迟。 */
const probeBase = { firstReviewedAt: now, transferPasses: 1 };
check(pure.delayedProbeDay({ ...probeBase, firstReviewedAt: now - 6 * 86400000 }, now) === null,
  '延迟：第 6 天还不算延迟');
check(pure.delayedProbeDay({ ...probeBase, firstReviewedAt: now - 7 * 86400000 }, now) === 7,
  '延迟：第 7 天 → 7');
check(pure.delayedProbeDay({ ...probeBase, firstReviewedAt: now - 20 * 86400000 }, now) === 7,
  '延迟：第 20 天仍是 7 天档');
check(pure.delayedProbeDay({ ...probeBase, firstReviewedAt: now - 21 * 86400000 }, now) === 21,
  '延迟：第 21 天 → 21');
check(pure.delayedProbeDay({ ...probeBase, firstReviewedAt: now - 60 * 86400000 }, now) === 60,
  '延迟：第 60 天 → 60');
check(pure.delayedProbeDay({ ...probeBase, transferPasses: 0, firstReviewedAt: now - 60 * 86400000 }, now) === null,
  '延迟：没有迁移通过记录 → 不标延迟');

/* ── 补充断言 ────────────────────────────────────────────────────────────
 * 上面那批用例有几条「实现改坏也仍然绿」：自评只练 4 次时间隔还没到 21 天、
 * 队列上限在只有 2 项的夹具上永远成立、薄弱排序的期望值恰好等于数据顺序。
 * 这里把真正要守的语义钉住，并逐条跑过变异（改坏实现 → 必须红）。
 */

// quality：识别对 + 迁移过 = 5（ease 升）；识别错 + 迁移过 = 4（ease 不升）。
check(Math.abs(first.easeFactor - 2.6) < 1e-9,
  'SM-2：识别对 + 迁移过 → quality 5（ease 2.6）', String(first.easeFactor));
check(Math.abs(second.easeFactor - first.easeFactor) < 1e-9,
  'SM-2：识别错 + 迁移过 → quality 4（ease 保持不变）', `${first.easeFactor} → ${second.easeFactor}`);

// 纯函数：applyPatternResult 不修改入参。
const failedSnapshot = JSON.stringify(failed);
pure.applyPatternResult(failed, {
  patternId: 'subject-first', recognitionCorrect: true, transferPassed: true,
  source: 'ai', answer: 'ok', feedback: '好', today,
}, now + 3 * 86400000);
check(JSON.stringify(failed) === failedSnapshot, 'SM-2：不修改入参（纯函数）');

const initProgress = pure.initialPatternProgress('subject-first', now);
check(initProgress.status === 'learning' && initProgress.repetitions === 0 &&
  initProgress.interval === 0 && initProgress.nextReview === now,
  'SM-2：初始进度从 learning、0 天、立即到期开始');
check(initProgress.calibrationAttempts === 0 && initProgress.calibrationHits === 0,
  '校准：初始进度从 0/0 开始');

/* 自评校准：有把握/没把握与最终结果对照；一般(2)不计入。 */
const gradeWithConfidence = (transferPassed, confidence) => pure.applyPatternResult(undefined, {
  patternId: 'subject-first', recognitionCorrect: true, transferPassed,
  source: 'ai', answer: 'ok', feedback: 'x', confidence, today,
}, now);
const confidentPass = gradeWithConfidence(true, 3);
check(confidentPass.calibrationAttempts === 1 && confidentPass.calibrationHits === 1 &&
  confidentPass.lastAttempt?.confidence === 3,
  '校准：有把握 + 通过 → 1/1 且记录 confidence');
const confidentFail = gradeWithConfidence(false, 3);
check(confidentFail.calibrationAttempts === 1 && confidentFail.calibrationHits === 0,
  '校准：有把握 + 未通过 → 0/1（高估）');
const unsureFail = gradeWithConfidence(false, 1);
check(unsureFail.calibrationAttempts === 1 && unsureFail.calibrationHits === 1,
  '校准：没把握 + 未通过 → 1/1');
const neutral = gradeWithConfidence(true, 2);
check(neutral.calibrationAttempts === 0 && neutral.calibrationHits === 0,
  '校准：一般(2) 不计入');
const noConfidence = gradeWithConfidence(true, undefined);
check(noConfidence.calibrationAttempts === 0 && noConfidence.calibrationHits === 0,
  '校准：未选自评不计入（旧版本兼容）');
const legacyCalibrationBase = { ...pure.initialPatternProgress('subject-first', now) };
delete legacyCalibrationBase.calibrationAttempts;
delete legacyCalibrationBase.calibrationHits;
const legacyCalibrated = pure.applyPatternResult(legacyCalibrationBase, {
  patternId: 'subject-first', recognitionCorrect: true, transferPassed: false,
  source: 'ai', answer: 'ok', feedback: 'x', confidence: 1, today,
}, now);
check(legacyCalibrated.calibrationAttempts === 1 && legacyCalibrated.calibrationHits === 1,
  '校准：老记录缺字段按 0 起算，不因新字段丢进度');

// 自评连过足够多次（间隔已 ≥21 天）也不能 mastered —— aiTransferPasses 必须 ≥2。
let selfLong = self;
for (let i = 0; i < 4; i++) {
  selfLong = pure.applyPatternResult(selfLong, {
    patternId: 'subject-first', recognitionCorrect: true, transferPassed: true,
    source: 'self', answer: 'ok', feedback: '自评', today,
  }, now + (i + 5) * 86400000);
}
check(selfLong.repetitions >= 4 && selfLong.interval >= 21,
  'SM-2：自评连过 8 次后间隔离散值确实达标（下一条才有意义）',
  `reps=${selfLong.repetitions} interval=${selfLong.interval}`);
check(selfLong.status !== 'mastered' && selfLong.aiTransferPasses === 0,
  'SM-2：间隔达标但全是自评 → 仍然不能 mastered');

// 队列每日新名额：今天已引入 1 个新模式，所以只剩 1 个新名额（不是「无上限」）。
check(queue.filter((id) => !progress[id]).length === 1,
  '队列：今天已引入 1 个新模式后只剩 1 个新名额',
  `实际 ${queue.filter((id) => !progress[id]).length}`);
const dueFive = Object.fromEntries(
  patterns.slice(0, 5).map((pat) => [pat.id, p(pat.id, { firstReviewedOn: '2026-10-22' })]),
);
check(pure.buildReviewQueue({ patterns, progress: dueFive, now, today, maxPatterns: 3, maxNewPerDay: 2 }).length === 3,
  '队列：合并后真的截断到 maxPatterns');
check(pure.buildReviewQueue({ patterns, progress: dueFive, now, today, maxPatterns: 10, maxNewPerDay: 0 }).length === 5,
  '队列：maxNewPerDay=0 时一个新模式也不引入');

// 薄弱排序：期望值与数据顺序相反时也要按 lapses / 失败率排。
const weakByLapses = pure.getWeakPatterns(patterns, {
  'subject-first': p('subject-first', { lapses: 1, transferAttempts: 2, transferPasses: 1 }),
  'verb-driven': p('verb-driven', { lapses: 3, transferAttempts: 2, transferPasses: 1 }),
}, 3);
check(weakByLapses[0]?.pattern.id === 'verb-driven', '薄弱：lapses 多的排前（即使它在数据里靠后）');
const weakByFailure = pure.getWeakPatterns(patterns, {
  'subject-first': p('subject-first', { lapses: 1, transferAttempts: 4, transferPasses: 1 }),
  'verb-driven': p('verb-driven', { lapses: 1, transferAttempts: 1, transferPasses: 0 }),
}, 3);
check(weakByFailure[0]?.pattern.id === 'verb-driven', '薄弱：lapses 相同时按迁移失败率排');

// daily：按日期范围裁剪，不是「数最后 N 个键」—— 旧日期不能因为键数少就被留下。
const prunedRange = pure.pruneDaily(
  { '2026-09-01': ['a'], '2026-09-02': ['b'], '2026-10-23': ['c'] }, today, 2,
);
check(!prunedRange['2026-09-02'] && prunedRange['2026-10-23'],
  'daily：按日期范围裁剪（不是最后 N 个键）', JSON.stringify(prunedRange));

// 重试：不修改入参，队列/计数都是新对象。
const baseQueue = ['a'];
const baseRetries = {};
const retryPure = pure.pushRetry(baseQueue, 'a', baseRetries, 2);
check(baseQueue.length === 1 && Object.keys(baseRetries).length === 0 && retryPure.queue !== baseQueue,
  '重试：不修改入参（纯函数）');

/* ── 会话状态机（createPatternSession / applySessionResult / advanceSession / sessionCounts）
 * 队列/下标/重试/计数的编排已经抽成纯函数，组件里只剩 setSession(applySessionResult(...))。
 * 这一批钉的是「改坏后界面看起来照常、只在不该发生的时候悄悄发生」的语义：
 * 第一次失败回队尾、同一模式轮内最多回队 2 次、第三次失败后收摊、重试通过不留重复且最终结果
 * 是 pass、两种模式交错时下标不串、完成页按不同模式计数、入参不被修改。
 */
const startQueue = ['a', 'b'];
const sessionA = pure.createPatternSession(startQueue);
check(sessionA.queue.join(',') === 'a,b' && sessionA.index === 0 &&
  Object.keys(sessionA.retries).length === 0 && Object.keys(sessionA.results).length === 0,
  '会话：createPatternSession 拷贝队列、下标 0、无重试无结果', JSON.stringify(sessionA));
check(startQueue.length === 2 && sessionA.queue !== startQueue,
  '会话：createPatternSession 不持有调用方数组引用');

const failOnce = pure.applySessionResult(sessionA, 'a', false);
check(failOnce.queue.join(',') === 'a,b,a' && failOnce.retries.a === 1 && failOnce.results.a === 'fail',
  '会话：第一次失败 → 记 fail 并回队尾一次', JSON.stringify(failOnce));
check(sessionA.queue.join(',') === 'a,b' && Object.keys(sessionA.retries).length === 0 &&
  Object.keys(sessionA.results).length === 0,
  '会话：applySessionResult 不修改入参（纯函数）',
  JSON.stringify(sessionA));

const advanceOnce = pure.advanceSession(failOnce);
check(advanceOnce.done === false && advanceOnce.state.index === 1 &&
  advanceOnce.state.queue.join(',') === 'a,b,a',
  '会话：advanceSession 推进下标、保留回队后的队列', JSON.stringify(advanceOnce.state));

// 同一模式连失败三次：前两次回队，第三次不再追加；advance 在队尾 done。
let threeFails = pure.createPatternSession(['a']);
const threeFailSteps = [];
for (let i = 0; i < 3; i++) {
  threeFails = pure.applySessionResult(threeFails, 'a', false);
  const step = pure.advanceSession(threeFails);
  threeFailSteps.push({ done: step.done, index: step.state.index, queue: step.state.queue.join(',') });
  threeFails = step.state;
}
check(threeFailSteps[0].queue === 'a,a' && threeFailSteps[1].queue === 'a,a,a' &&
  threeFailSteps[2].queue === 'a,a,a',
  '会话：同一模式轮内最多回队 2 次（第 3 次失败不再追加）', JSON.stringify(threeFailSteps));
check(threeFailSteps[0].done === false && threeFailSteps[1].done === false &&
  threeFailSteps[2].done === true && threeFailSteps[2].index === 2,
  '会话：第三次失败后 advanceSession 收摊（done=true，下标不越界）', JSON.stringify(threeFailSteps));
const threeFailCounts = pure.sessionCounts(threeFails);
check(threeFailCounts.total === 1 && threeFailCounts.passed === 0 && threeFailCounts.failed === 1,
  '会话：同一模式失败三次在完成页只算 1 个未通过', JSON.stringify(threeFailCounts));

// 失败一次 → advance 到重试卡 → 通过：队列不再追加，结果最终为 pass，完成页只算 1 个。
const retryLoop = pure.advanceSession(pure.createPatternSession(['a']));
const failedFirst = pure.applySessionResult(retryLoop.state, 'a', false);
const retryCard = pure.advanceSession(failedFirst).state;
const retryPassed = pure.applySessionResult(retryCard, 'a', true);
check(retryCard.index === 1 && retryPassed.queue.join(',') === 'a,a' &&
  retryPassed.results.a === 'pass',
  '会话：重试通过 → 最终结果改为 pass、队列不再追加副本', JSON.stringify(retryPassed));
const retryCounts = pure.sessionCounts(retryPassed);
check(retryCounts.total === 1 && retryCounts.passed === 1 && retryCounts.failed === 0,
  '会话：先失败后重试通过只按一个模式计入完成页', JSON.stringify(retryCounts));

// 通过后清掉排在后面的重复副本（重试卡通过后不会在队尾再练一遍）。
const dedupState = { queue: ['a', 'b', 'a'], index: 0, retries: {}, results: {} };
const deduped = pure.applySessionResult(dedupState, 'a', true);
check(deduped.queue.join(',') === 'a,b' &&
  JSON.stringify(dedupState) === '{"queue":["a","b","a"],"index":0,"retries":{},"results":{}}',
  '会话：通过清掉未来重复副本，且不修改入参', JSON.stringify(deduped));

// 两种模式交错：a 失败回队 → b 通过 → a 重试通过 → 收尾。
let mixed = pure.createPatternSession(['a', 'b']);
mixed = pure.applySessionResult(mixed, 'a', false);
let mixedStep = pure.advanceSession(mixed);
check(!mixedStep.done && mixedStep.state.index === 1,
  '会话：失败回队后先推进到下一个模式（不是立刻重练）', JSON.stringify(mixedStep.state));
mixed = mixedStep.state;
mixed = pure.applySessionResult(mixed, 'b', true);
mixedStep = pure.advanceSession(mixed);
check(!mixedStep.done && mixedStep.state.index === 2 && mixedStep.state.queue.join(',') === 'a,b,a',
  '会话：b 通过后轮到 a 的重试卡（下标按队列走）', JSON.stringify(mixedStep.state));
mixed = mixedStep.state;
mixed = pure.applySessionResult(mixed, 'a', true);
mixedStep = pure.advanceSession(mixed);
check(mixedStep.done === true, '会话：最后一张答完 → done');
const mixedCounts = pure.sessionCounts(mixed);
check(mixedCounts.total === 2 && mixedCounts.passed === 2 && mixedCounts.failed === 0,
  '会话：交错完成后按不同模式计数（2 个模式各一次通过）', JSON.stringify(mixedCounts));

// advanceSession / sessionCounts 的入参也不许被改。
const preAdvance = pure.createPatternSession(['a', 'b']);
const preAdvanceSnapshot = JSON.stringify(preAdvance);
pure.advanceSession(preAdvance);
pure.sessionCounts(preAdvance);
check(JSON.stringify(preAdvance) === preAdvanceSnapshot,
  '会话：advanceSession / sessionCounts 不修改入参（纯函数）');

/* ── 审查修复轮（task-2-review.md 的六条 blocking）────────────────────────
 * ① pruneDaily 缺上界（未来键会被留下）；② grade → queue 的端到端契约没测
 * （firstReviewedOn 不写、通过却把 nextReview 设成 now 都能全绿）；③ 各 helper 的
 * 默认值没钉；④ 到期顺序没测（删掉 sort 仍绿）；⑤ 未知 id 的 progress 没测；
 * ⑥ 31 天窗口只在远离边界处测过（off-by-one 抓不到）。
 * 每条都跑过变异（改坏实现 → 必须红），见 task-2-report.md 的 Fix round。
 */

// ① daily 上界：today=2026-10-23、days=31 → cutoff=2026-09-23（today-30）。
const pruneWithFuture = pure.pruneDaily({
  '2026-09-22': ['cutoff-1'],
  '2026-09-23': ['cutoff'],
  '2026-10-23': ['today'],
  '2026-10-24': ['future'],
}, today, 31);
check(pruneWithFuture['2026-09-23'] !== undefined,
  'daily：cutoff 当天（today-30）保留', JSON.stringify(pruneWithFuture));
check(pruneWithFuture['2026-09-22'] === undefined,
  'daily：cutoff 前一天（today-31）裁掉', JSON.stringify(pruneWithFuture));
check(pruneWithFuture['2026-10-24'] === undefined,
  'daily：未来日期键（today+1）裁掉', JSON.stringify(pruneWithFuture));

// ② grade → queue：通过写盘字段真的能让模式退出当天队列，失败又能让它回队。
const passNow = now + 5 * 60 * 1000;
const passed = pure.applyPatternResult(undefined, {
  patternId: 'make-logic-explicit', recognitionCorrect: true, transferPassed: true,
  source: 'ai', answer: 'The launch slipped because QA found a blocker.', feedback: '好', today,
}, passNow);
check(passed.interval > 0 && passed.nextReview === passNow + passed.interval * 86400000,
  '契约：新模式 AI 通过写下 nextReview = now + interval 天（不是 now）',
  `interval=${passed.interval} nextReview=${passed.nextReview}`);
check(passed.firstReviewedOn === today,
  '契约：新模式通过后 firstReviewedOn 写成 today', JSON.stringify(passed.firstReviewedOn));
check(passed.lastAttempt?.on === today && passed.lastAttempt?.pass === true &&
  passed.lastAttempt?.source === 'ai',
  '契约：lastAttempt 记下今天、pass=true 与来源', JSON.stringify(passed.lastAttempt));
check(passed.recognitionTotal === 1 && passed.transferAttempts === 1 &&
  passed.transferPasses === 1 && passed.aiTransferPasses === 1,
  '契约：新模式通过后四项计数各置 1',
  `recognitionTotal=${passed.recognitionTotal} transferAttempts=${passed.transferAttempts} transferPasses=${passed.transferPasses} aiTransferPasses=${passed.aiTransferPasses}`);

const passedQueue = pure.buildReviewQueue({
  patterns, progress: { [passed.patternId]: passed }, now: passNow, today,
});
check(!passedQueue.includes(passed.patternId),
  '契约：今天已通过的模式不再进今天的队列', JSON.stringify(passedQueue));

const failLater = passNow + 60 * 1000;
const failedAgain = pure.applyPatternResult(passed, {
  patternId: passed.patternId, recognitionCorrect: true, transferPassed: false,
  source: 'ai', answer: 'wrong', feedback: '再试', today,
}, failLater);
check(failedAgain.nextReview === failLater,
  '契约：失败把 nextReview 拉回本次 now（当轮可再练）', String(failedAgain.nextReview));
const failedQueue = pure.buildReviewQueue({
  patterns, progress: { [failedAgain.patternId]: failedAgain }, now: failLater, today,
});
check(failedQueue.includes(failedAgain.patternId),
  '契约：今天失败的模式重新进当天的到期队列', JSON.stringify(failedQueue));

// ③ 默认值：每个 helper 都省略参数真跑一次，不靠读源码猜。
const syntheticPatterns = Array.from({ length: 15 }, (_, i) => ({ id: `synthetic-${i}` }));
const syntheticDue = Object.fromEntries(
  syntheticPatterns.map((pat) => [pat.id, p(pat.id, {
    nextReview: now - 86400000, firstReviewedOn: '2026-10-22',
  })]),
);
const defaultCappedQueue = pure.buildReviewQueue({
  patterns: syntheticPatterns, progress: syntheticDue, now, today,
});
check(defaultCappedQueue.length === 10,
  '默认值：buildReviewQueue 省略 maxPatterns 时截到 10', `实际 ${defaultCappedQueue.length}`);

const freshOnly = pure.buildReviewQueue({ patterns, progress: {}, now, today });
check(freshOnly.length === 2,
  '默认值：buildReviewQueue 省略 maxNewPerDay 时只引入 2 个新模式', JSON.stringify(freshOnly));

const retryDefaultOnce = pure.pushRetry([], 'a', {});
const retryDefaultTwice = pure.pushRetry(retryDefaultOnce.queue, 'a', retryDefaultOnce.retries);
const retryDefaultThrice = pure.pushRetry(retryDefaultTwice.queue, 'a', retryDefaultTwice.retries);
check(retryDefaultOnce.retried && retryDefaultTwice.retried && retryDefaultThrice.retried === false,
  '默认值：pushRetry 省略 maxRetries 时第 3 次不再回队',
  JSON.stringify(retryDefaultThrice));

const fourWeak = {
  'subject-first': p('subject-first', { lapses: 4, transferAttempts: 0 }),
  'verb-driven': p('verb-driven', { lapses: 3, transferAttempts: 0 }),
  'end-focus': p('end-focus', { lapses: 2, transferAttempts: 0 }),
  'soften-disagreement': p('soften-disagreement', { lapses: 1, transferAttempts: 0 }),
};
const defaultWeak = pure.getWeakPatterns(patterns, fourWeak);
check(defaultWeak.length === 3,
  '默认值：getWeakPatterns 省略 limit 时返回 3 个', `实际 ${defaultWeak.length}`);

// ④ 到期顺序：插入顺序故意打乱（now-1、now-3、now-2），必须按 nextReview 升序输出。
const orderProgress = {
  'end-focus': p('end-focus', { nextReview: now - 86400000, firstReviewedOn: '2026-10-22' }),
  'subject-first': p('subject-first', { nextReview: now - 3 * 86400000, firstReviewedOn: '2026-10-22' }),
  'verb-driven': p('verb-driven', { nextReview: now - 2 * 86400000, firstReviewedOn: '2026-10-22' }),
};
const orderQueue = pure.buildReviewQueue({ patterns, progress: orderProgress, now, today });
check(JSON.stringify(orderQueue.slice(0, 3)) === JSON.stringify(['subject-first', 'verb-driven', 'end-focus']),
  '队列：到期项按 nextReview 升序（now-3 → now-2 → now-1）', JSON.stringify(orderQueue));
const orderedDue = orderQueue.slice(0, 3);
const orderedFresh = orderQueue.slice(3);
check(orderedDue.every((id) => Object.hasOwn(orderProgress, id)) &&
  orderedFresh.length === 2 && orderedFresh.every((id) => !Object.hasOwn(orderProgress, id)),
  '队列：到期项全部排在新增项之前', JSON.stringify(orderQueue));

// ⑤ 幽灵记录：progress 里有、THINK_PATTERNS 里没有的 id 既不进队列，也不占新名额。
check(!patternIds.includes('ghost-not-in-data'),
  '队列夹具自证：ghost id 确实不在 THINK_PATTERNS 里');
const ghostProgress = {
  'ghost-not-in-data': p('ghost-not-in-data', { firstReviewedOn: today, nextReview: 0 }),
};
const ghostQueue = pure.buildReviewQueue({ patterns, progress: ghostProgress, now, today });
check(!ghostQueue.includes('ghost-not-in-data'),
  '队列：progress 里的未知 id 被忽略', JSON.stringify(ghostQueue));
check(ghostQueue.length === 2 && ghostQueue.every((id) => patternIds.includes(id)),
  '队列：幽灵记录不占用每日新名额（仍引入 2 个新模式）', JSON.stringify(ghostQueue));

// ⑥ 31 天窗口边界：today-30 保留、today-31 裁掉；默认 days 必须与显式 31 一致。
const boundaryDaily = {
  '2026-09-22': ['day-31'],
  '2026-09-23': ['day-30'],
  '2026-10-23': ['today'],
};
const boundaryExplicit = pure.pruneDaily(boundaryDaily, today, 31);
check(boundaryExplicit['2026-09-23'] !== undefined && boundaryExplicit['2026-09-22'] === undefined,
  'daily：days=31 时 today-30 保留、today-31 裁掉', JSON.stringify(boundaryExplicit));
const boundaryDefault = pure.pruneDaily(boundaryDaily, today);
check(JSON.stringify(Object.keys(boundaryDefault)) === JSON.stringify(Object.keys(boundaryExplicit)),
  '默认值：pruneDaily 省略 days 时窗口与显式 31 一致', JSON.stringify(boundaryDefault));

/* ── AI 判定 helper（src/lib/think-pattern-ai.ts）─────────────────────────────
 * helper 只导出两个纯函数（拼 prompt / 校验 AI 返回），**没有运行时 `@/` import**
 * （ChatMessage / IThinkPattern / IThinkPatternTransfer 都是 `import type`，转译后整条消失），
 * 所以这里可以像纯调度模块一样真转译后直接 import 跑。
 * 解析入口（空串判空 → extractJson → validatePatternJudgeResult）在组件里，不在本模块。
 */
const ai = await import(pathToFileURL(
  (() => {
    const src = readFileSync(join(ROOT, 'src/lib/think-pattern-ai.ts'), 'utf8');
    const js = ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const file = join(mkdtempSync(join(tmpdir(), 'nt-pattern-ai-')), 'ai.mjs');
    writeFileSync(file, js, 'utf8');
    return file;
  })(),
).href);

const sample = patterns[0];
const prompt = ai.buildPatternJudgePrompt(sample, sample.transfer[0], 'I have seen it.');
check(prompt.length === 2 && prompt[0].role === 'system', 'AI：一个 system + 一个 user');
check(prompt[1].role === 'user', 'AI：第二条消息角色是 user', String(prompt[1]?.role));
check(prompt[0].content.includes(sample.name) && prompt[0].content.includes(sample.oneLiner), 'AI：prompt 带模式名与原则');
check(/"pass"\s*:/.test(prompt[0].content) && /"feedback"\s*:/.test(prompt[0].content) &&
  /"evidence"\s*:/.test(prompt[0].content),
  'AI：prompt 的 JSON 模板含 pass / feedback / evidence 三个键');
// 反馈要求说中文：必须钉到 **JSON 模板里的 feedback 示例**（`"feedback":"中文…`）。
// ⚠️ 不能只写 /中文/：prompt 里本来就嵌着模式的中文线索/对比/一句话原则（都含中文），
// 实测删掉「中文 1-2 句」后 /中文/ 仍然命中数据 → 断言恒真（变异 P2 抓到的）。
check(/"feedback"\s*:\s*"中文/.test(prompt[0].content),
  'AI：prompt 的 JSON 模板要求中文反馈（feedback 示例以「中文」开头）', prompt[0].content.slice(-160));
check(prompt[1].content.includes('I have seen it.'), 'AI：prompt 带用户答案');

// 全局约束：模式线索 / 中式对比 / 迁移场景与评分焦点也必须进 prompt —— 只给名字的 prompt 判不准。
check(sample.cues.every((cue) => prompt[0].content.includes(cue)),
  'AI：prompt 带全部思维线索（cues）', prompt[0].content);
check(prompt[0].content.includes(sample.contrast.chineseThinking) &&
  prompt[0].content.includes(sample.contrast.native),
  'AI：prompt 带中式说法与母语说法（contrast）');
check(prompt[0].content.includes(sample.transfer[0].situation) &&
  prompt[0].content.includes(sample.transfer[0].rubricFocus),
  'AI：prompt 带迁移场景与评分焦点');
check(/ONLY JSON/i.test(prompt[0].content),
  'AI：prompt 要求只返回 JSON', prompt[0].content.slice(-200));
check(/Ignore capitalization/i.test(prompt[0].content) && /pronoun I/i.test(prompt[0].content),
  'AI：prompt 明确小写 i 也算主语代词 I');
check(/exact vocabulary/i.test(prompt[0].content) && /reference is an example/i.test(prompt[0].content),
  'AI：prompt 不要求逐字复述参考表达');

check(ai.validatePatternJudgeResult(null) === null, 'AI：null 返回 null');
check(ai.validatePatternJudgeResult('not an object') === null, 'AI：字符串（非对象）返回 null');
check(ai.validatePatternJudgeResult({ pass: 'yes', feedback: 'x' }) === null, 'AI：pass 非布尔返回 null');
check(ai.validatePatternJudgeResult({ pass: 'true', feedback: 'x' })?.pass === true, 'AI：pass "true" 归一化为 true');
check(ai.validatePatternJudgeResult({ pass: 'false', feedback: 'x' })?.pass === false, 'AI：pass "false" 归一化为 false');
check(ai.validatePatternJudgeResult({ pass: true, feedback: '' }) === null, 'AI：feedback 空返回 null');
check(ai.validatePatternJudgeResult({ pass: true, feedback: '   ' }) === null,
  'AI：feedback 纯空白返回 null');
const validated = ai.validatePatternJudgeResult({ pass: true, feedback: '用上了', evidence: 'I have seen' });
check(validated?.pass === true && validated.feedback === '用上了' && validated.evidence === 'I have seen', 'AI：合法对象正常归一化');
const trimmed = ai.validatePatternJudgeResult({ pass: false, feedback: '  再试  ', evidence: '  ' });
check(trimmed?.pass === false && trimmed.feedback === '再试' && trimmed.evidence === '',
  'AI：feedback/evidence 归一化 trim，缺证据收成空串', JSON.stringify(trimmed));
const noEvidence = ai.validatePatternJudgeResult({ pass: true, feedback: '好' });
check(noEvidence?.pass === true && noEvidence.evidence === '',
  'AI：evidence 缺失时补空串（不整条作废）', JSON.stringify(noEvidence));

/* ── 进度 store 接线（src/lib/use-think-patterns.ts）────────────────────────
 * hook 依赖 React 与 `@/` 别名，不能像纯模块那样整份转译 import，所以「存哪、怎么读、
 * 写失败说不说、grade 是不是纯 updater、下行有没有回声抑制」走静态检查。
 * 唯一有独立语义的是读盘清洗 sanitizeProgress（只吃入参、不碰模块外状态），
 * 抽出来真转译执行 —— 清洗逻辑改坏必须真红，不能靠源码里有这几个字就放行。
 */
const hookSrc = (() => {
  try { return readFileSync(join(ROOT, 'src/lib/use-think-patterns.ts'), 'utf8'); } catch { return ''; }
})();

check(hookSrc.length > 0, 'store：src/lib/use-think-patterns.ts 存在');

/* ⚠️ 静态检查一律跑在**剥注释后的转译产物**上：注释里出现 `patternId !== key` 之类的同形文字
 * 不许替实现答话（本轮变异 M1 第一次就是这么绿掉的，剥注释后才红）。 */
const hookCode = ts.transpileModule(hookSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, removeComments: true },
}).outputText;

// 键名单一来源在纯模块：hook 必须引用常量，不许手抄（手抄迟早与 THINK_PATTERN_STORAGE_KEY 分叉 → 老进度"消失"）。
check(pure.THINK_PATTERN_STORAGE_KEY === '__nativethink_think_pattern_progress',
  'store：纯模块的存储键就是约定字面量', String(pure.THINK_PATTERN_STORAGE_KEY));
check(/THINK_PATTERN_STORAGE_KEY/.test(hookCode) && !/['"]__nativethink_/.test(hookCode),
  'store：hook 用共享常量取键，不手抄存储键字面量');

check(/useSyncDown\(/.test(hookCode), 'store：接 useSyncDown');
check(/loadedFromStorageRef\.current\s*=\s*next/.test(hookCode) &&
  /loadedFromStorageRef\.current === state/.test(hookCode),
  'store：下行重读标记与回写跳过成对（缺任一半都会把远端值推回声）');
check(/safeStorage\.setItem/.test(hookCode) && /safeStorage\.getItem/.test(hookCode) &&
  !/localStorage\.(get|set|remove)Item/.test(hookCode),
  'store：读写都走 safeStorage，不直接碰 localStorage');
check(/warnStorageFull/.test(hookCode) && /if \(!safeStorage\.setItem/.test(hookCode),
  'store：写失败可见（setItem 返回 false → warnStorageFull）');
check(/applyPatternResult\(/.test(hookCode) && /setState\(/.test(hookCode), 'store：grade 走纯函数');
check(!/setState\(\(prev\)[^;]*safeStorage\.setItem/s.test(hookCode), 'store：setState updater 不许直接写盘');
check(/JSON\.stringify\(state\)/.test(hookCode) && /safeStorage\.getItem/.test(hookCode),
  'store：落盘前比对同一份 JSON，防下行回声');
check(/formatDate\(new Date\(/.test(hookCode) && !/toISOString\(\)\.slice/.test(hookCode),
  'store：日期走 formatDate（本地日，不用 toISOString().slice(0,10)）');
check(/due: all\.filter\(\(p\) => isDue\(p, now, today\)\)\.length/.test(hookCode),
  'store：stats.due 只数 isDue（新引入项由 dueQueue 负责，不能算进 due）');
check(/buildReviewQueue\(/.test(hookCode), 'store：dueQueue 走 buildReviewQueue（新引入项可以进队）');
check(/diagnostic:\s*sanitizeDiagnostic\(/.test(hookCode), 'store：load 时清洗 diagnostic（不把坏体检记录带进界面）');
check(/saveDiagnostic\s*=\s*useCallback/.test(hookCode) && /diagnostic:\s*\{/.test(hookCode) &&
  /recommendedPatternIds/.test(hookCode) && /completedOn/.test(hookCode),
  'store：saveDiagnostic 只写汇总（completedOn / 分数 / 层 / 建议）');

// 读盘清洗（task-2 审查追加）：幽灵/错配记录会让同一个模式既算到期又被当新模式，还可能在界面上崩。
check(/function sanitizeProgress\(/.test(hookCode) && (hookCode.match(/sanitizeProgress\(/g) ?? []).length >= 2,
  'store：读盘经过 sanitizeProgress（定义了且被调用，不是死代码）');
check(/patternId\s*!==\s*key/.test(hookCode), 'store：键与记录 patternId 不一致的条目丢弃');
check(/new Set\(THINK_PATTERNS\.map\(\(p\)\s*=>\s*p\.id\)\)/.test(hookCode),
  'store：已知 id 集合取自 THINK_PATTERNS（不在内容库里的 id 不算数）');
check(/knownIds\.has\(key\)/.test(hookCode), 'store：不在 THINK_PATTERNS 里的 id 丢弃');

/* 抽 sanitizeProgress 真跑：只留下键=patternId 且 id 已知的对象条目，其余一律丢。
 * hookCode 已剥注释/类型，抽出的段就是可执行 JS。 */
const sanitizeSrc = (hookCode.match(/function sanitizeProgress\([\s\S]*?\n\}/) ?? [''])[0];
check(sanitizeSrc.length > 0, 'store 读盘：能抽出 sanitizeProgress 纯函数段（供真跑）');
let sanitizeProgress = null;
if (sanitizeSrc) {
  const js = ts.transpileModule(`${sanitizeSrc}\nexport { sanitizeProgress };`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const file = join(mkdtempSync(join(tmpdir(), 'nt-pattern-store-')), 'sanitize.mjs');
  writeFileSync(file, js, 'utf8');
  sanitizeProgress = (await import(pathToFileURL(file).href)).sanitizeProgress;
}

const knownIds = new Set(EXPECTED_PATTERN_IDS);
const healthyRecord = pure.initialPatternProgress('subject-first', now);
const secondHealthyRecord = pure.initialPatternProgress('fill-references', now);
const sanitizeFixture = {
  // 健康：键、patternId、id 三者一致（两条，证明不是只放行第一条）
  'subject-first': healthyRecord,
  'fill-references': secondHealthyRecord,
  // 错配：键是 verb-driven，记录却自称 subject-first（两条都是已知 id，只有「别错配」这一条能拦住）
  'verb-driven': { ...pure.initialPatternProgress('subject-first', now) },
  // 未知 id：键与 patternId 一致，但内容库里没有这个模式
  'ghost-not-in-data': pure.initialPatternProgress('ghost-not-in-data', now),
  // 残缺：只有 patternId，缺 status / firstReviewedOn / 全部排期数值
  'polite-request': { patternId: 'polite-request' },
  // 数值坏：字段齐全但 nextReview 是 NaN（JSON 里常见 null/字符串的变体）
  'soften-disagreement': { ...pure.initialPatternProgress('soften-disagreement', now), nextReview: Number.NaN },
  // 形状坏：字符串 / null / 数组
  'end-focus': 'not-an-object',
  'be-concrete': null,
  'make-logic-explicit': [1, 2, 3],
};
const sanitized = typeof sanitizeProgress === 'function' ? sanitizeProgress(sanitizeFixture, knownIds) : {};
check(Object.keys(sanitized).join(',') === 'subject-first,fill-references',
  'store 读盘真跑：只留下键=patternId、id 已知且字段完整的健康条目', JSON.stringify(Object.keys(sanitized)));
check(sanitized['subject-first'] === healthyRecord && sanitized['fill-references'] === secondHealthyRecord,
  'store 读盘真跑：健康条目原样保留（引用不变，不在读盘时重写用户数据）');
const legacyHealthy = { ...pure.initialPatternProgress('subject-first', now) };
delete legacyHealthy.calibrationAttempts;
delete legacyHealthy.calibrationHits;
const sanitizedLegacy = typeof sanitizeProgress === 'function'
  ? sanitizeProgress({ 'subject-first': legacyHealthy }, knownIds)
  : {};
check(sanitizedLegacy['subject-first'] === legacyHealthy,
  'store 读盘真跑：老记录缺 calibration 字段仍保留（不因新字段丢进度）');
check(!('polite-request' in sanitized),
  'store 读盘真跑：残缺记录（只有 patternId）→ 丢弃（否则永不到期、日期 Invalid）');
check(!('soften-disagreement' in sanitized),
  'store 读盘真跑：排期数值不是有限数字（nextReview=NaN）→ 丢弃');
check(!('verb-driven' in sanitized),
  'store 读盘真跑：键与 patternId 不一致 → 丢弃（否则同一模式既到期又当新模式）');
check(!('ghost-not-in-data' in sanitized),
  'store 读盘真跑：不在 THINK_PATTERNS 里的 id → 丢弃');
check(typeof sanitizeProgress === 'function' &&
  JSON.stringify(sanitizeProgress(null, knownIds)) === '{}' &&
  JSON.stringify(sanitizeProgress('nope', knownIds)) === '{}' &&
  JSON.stringify(sanitizeProgress([1, 2], knownIds)) === '{}',
  'store 读盘真跑：整份不是对象（null/字符串/数组）→ 空 progress，不抛错');

/* 体检记录清洗：只留已知层/已知模式，坏形状整份丢弃。 */
const sanitizeDiagSrc = (hookCode.match(/function sanitizeDiagnostic\([\s\S]*?\n\}/) ?? [''])[0];
check(sanitizeDiagSrc.length > 0, 'store 读盘：能抽出 sanitizeDiagnostic 纯函数段（供真跑）');
let sanitizeDiagnostic = null;
if (sanitizeDiagSrc) {
  const js = ts.transpileModule(`${sanitizeDiagSrc}\nexport { sanitizeDiagnostic };`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const file = join(mkdtempSync(join(tmpdir(), 'nt-pattern-diag-')), 'sanitize-diag.mjs');
  writeFileSync(file, js, 'utf8');
  sanitizeDiagnostic = (await import(pathToFileURL(file).href)).sanitizeDiagnostic;
}
const validDiagnostic = {
  completedOn: today,
  correct: 10,
  total: 12,
  layers: [
    { layerId: 'structure', correct: 2, total: 3 },
    { layerId: 'verb', correct: 1, total: 2 },
    { layerId: 'clarity', correct: 3, total: 3 },
    { layerId: 'pragmatics', correct: 4, total: 4 },
  ],
  recommendedPatternIds: ['subject-first', 'ghost-not-in-data'],
};
const cleanDiagnostic = sanitizeDiagnostic?.(validDiagnostic, knownIds, EXPECTED_LAYER_IDS);
check(cleanDiagnostic?.correct === 10 && cleanDiagnostic?.layers.length === 4 &&
  cleanDiagnostic?.recommendedPatternIds.join(',') === 'subject-first',
  'store 体检清洗：保留汇总，过滤未知模式建议', JSON.stringify(cleanDiagnostic));
check(sanitizeDiagnostic?.({ ...validDiagnostic, correct: 13 }, knownIds, EXPECTED_LAYER_IDS) === undefined,
  'store 体检清洗：correct > total → 整份丢弃');
check(sanitizeDiagnostic?.({
  ...validDiagnostic,
  layers: [{ layerId: 'unknown', correct: 1, total: 1 }],
}, knownIds, EXPECTED_LAYER_IDS) === undefined,
  'store 体检清洗：层全坏 → 整份丢弃');
check(sanitizeDiagnostic?.(null, knownIds, EXPECTED_LAYER_IDS) === undefined &&
  sanitizeDiagnostic?.('nope', knownIds, EXPECTED_LAYER_IDS) === undefined,
  'store 体检清洗：非对象 → undefined');

/* ── 首次读盘也要打「来自 storage」标记（task-4-review.md 的 Important fix）────
 * 只在 useSyncDown 回调里打标记不够：fresh device 首次挂载读到空 state 时，落盘 effect
 * 会在第一次下行到达前把它写盘（safeStorage 双写把它排进上行队列）→ 远端进度被空对象盖掉。
 * 把**首次读盘的 effect 回调**抽出来真跑：load / setState / setLoaded 全用替身并记录调用顺序，
 * 只认「load → 标记 ref → setState」。sync-down 回调里有一模一样的一行，不能替它答话，
 * 所以按 effect 段切片，并另用 sync-down 段自己的断言钉住那条路径（变异 M6 回归）。
 */
const initialLoadCallback = (hookCode.match(/useEffect\((\(\)\s*=>\s*\{[\s\S]*?\n\s*\}),\s*\[\]\);/) ?? [])[1] ?? '';
check(initialLoadCallback.length > 0 && /load\(\)/.test(initialLoadCallback),
  'store 首次读盘：能抽出挂载时 load → setState 的 effect 回调（供真跑）');

const runInitialLoad = (callbackSrc) => {
  const calls = [];
  const sentinel = { progress: { 'subject-first': p('subject-first') }, daily: { [today]: ['subject-first'] } };
  const ref = {
    value: null,
    get current() { return this.value; },
    set current(next) { calls.push('ref'); this.value = next; },
  };
  let stateArg;
  const run = new Function(
    'load', 'setState', 'setLoaded', 'loadedFromStorageRef',
    `return (${callbackSrc})();`,
  );
  run(
    () => { calls.push('load'); return sentinel; },
    (next) => { calls.push('setState'); stateArg = next; },
    () => { calls.push('setLoaded'); },
    ref,
  );
  return { calls, ref, sentinel, stateArg };
};

const initialLoadRun = initialLoadCallback ? runInitialLoad(initialLoadCallback) : null;
check(initialLoadRun !== null &&
  initialLoadRun.ref.current === initialLoadRun.sentinel &&
  initialLoadRun.stateArg === initialLoadRun.sentinel,
  'store 首次读盘真跑：load 的结果既标记进 loadedFromStorageRef、又送进 setState（同一引用）');
check(initialLoadRun !== null && initialLoadRun.calls.join(',') === 'load,ref,setState,setLoaded',
  'store 首次读盘真跑：先标记再 setState（顺序反了落盘 effect 仍可能抢跑）',
  initialLoadRun?.calls.join(','));

// 正对照：同一夹具删掉标记行后 ref 必须读不到 —— 证明上面那条真跑断言不是恒真。
const withoutMarker = initialLoadCallback.replace(/^\s*loadedFromStorageRef\.current\s*=\s*next;\s*$/m, '');
const controlRun = withoutMarker !== initialLoadCallback ? runInitialLoad(withoutMarker) : null;
check(controlRun !== null && controlRun.ref.current === null && !controlRun.calls.includes('ref'),
  'store 首次读盘真跑：正对照 —— 删掉标记行后同一夹具读不到 ref（断言在管事）');

const syncDownSlice = (hookCode.match(/useSyncDown\(\(\)\s*=>\s*\{[\s\S]*?\n\s*\}\);/) ?? [''])[0];
check(/loadedFromStorageRef\.current\s*=\s*next/.test(syncDownSlice),
  'store：下行重读回调自己打标记（不是靠首次读盘那行顶替）');

/* ── 概览 / 复习会话 UI（Task 5）────────────────────────────────────────────
 * 组件依赖 React / `@/` 别名，无法像纯模块那样整份转译 import，所以接线走静态检查。
 * 读文件用容错读法：文件缺失时让下面每条断言各自报红（给出清单），
 * 而不是在 readFileSync 上直接抛 ENOENT 把守卫打断。
 */
const readUi = (rel) => {
  try { return readFileSync(join(ROOT, rel), 'utf8'); } catch { return ''; }
};
const modeSrc = readUi('src/pages/ThinkInEnglishPage/PatternReviewMode.tsx');
const overviewSrc = readUi('src/pages/ThinkInEnglishPage/PatternOverview.tsx');
const sessionSrc = readUi('src/pages/ThinkInEnglishPage/PatternReviewSession.tsx');
const diagnosticSrc = readUi('src/pages/ThinkInEnglishPage/PatternDiagnostic.tsx');
const rewriteSrc = readUi('src/pages/ThinkInEnglishPage/PatternRewriteDrill.tsx');

/* 静态接线一律跑在**剥注释源码**上：注释里出现 `silent: true` / `applySessionResult` 之类的同形
 * 文字不许替实现答话（AI 判定那批变异实验抓过一次）。 */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const modeCode = stripComments(modeSrc);
const sessionCode = stripComments(sessionSrc);
const diagnosticCode = stripComments(diagnosticSrc);
const rewriteCode = stripComments(rewriteSrc);

check(modeSrc.length > 0 && overviewSrc.length > 0 && sessionSrc.length > 0 &&
  diagnosticSrc.length > 0 && rewriteSrc.length > 0,
  'UI：概览/会话/状态机/体检/改写五个组件文件都存在');
check(/useThinkPatterns\(/.test(modeSrc), 'UI：顶层使用 useThinkPatterns');
check(/<PatternOverview\b/.test(modeSrc) && /<PatternReviewSession\b/.test(modeSrc) &&
  /<PatternDiagnostic\b/.test(modeSrc) && /<PatternRewriteDrill\b/.test(modeSrc),
  'UI：概览、复习会话、体检、改写快练分离（四个组件都被渲染，不是只 import）');
check(/'overview' \| 'diagnostic' \| 'review' \| 'rewrite' \| 'complete'/.test(modeSrc),
  'UI：五态状态机');
check(modeSrc.includes('key={`${pattern.id}-${session.index}`}'),
  'UI：换卡用「pattern.id + 会话下标」的 key 重挂载（否则重试会带着上一题阶段）');
check(/applySessionResult\(/.test(modeCode) && /advanceSession\(/.test(modeCode) &&
  /sessionCounts\(/.test(modeCode) && /createPatternSession\(/.test(modeCode),
  'UI：会话编排走纯 reducer（create / apply / advance / counts），不在组件里另算一套');
check(!/setQueue\(|setIndex\(|setRetries\(|setResults\(/.test(modeCode) &&
  /setSession\(/.test(modeCode),
  'UI：组件只维护一个 session 状态（队列/下标/重试/结果不再四份分立）');
check(/pushRetry\(/.test(modeCode) === false && /dropQueuedRetries\(/.test(modeCode) === false,
  'UI：回队/清副本只在 reducer 里发生（组件不许再手写一遍）');
check(!/mastered === 8\b/.test(overviewSrc) && !/['"]8 个模式都已掌握['"]/.test(overviewSrc) &&
  /stats\.mastered === THINK_PATTERNS\.length/.test(overviewSrc),
  'UI：概览的「全部掌握」按 THINK_PATTERNS.length 判断，不硬编码 8');
check(/getWeakPatterns\(/.test(modeSrc), 'UI：薄弱模式走 getWeakPatterns（不在组件里另算一套排序）');
check(/!\s*loaded/.test(modeSrc), 'UI：等 loaded 后再渲染统计（防首屏 0 值闪屏）');
check(/modelAnswer/.test(sessionSrc), 'UI：自评路径展示参考表达');
check(/THINK_PATTERN_OPTION_NOTES/.test(sessionSrc) && /也能说，但更绕/.test(sessionSrc) && /这里不地道/.test(sessionSrc),
  'UI：识别卡逐项说明三种语气（最直接/更绕/不地道）');
check(/thinkingSteps\.map/.test(sessionSrc) && /transfer\.why/.test(sessionSrc) &&
  /你的表达/.test(sessionSrc) && /参考表达/.test(sessionSrc),
  'UI：迁移/反馈扩展（先想三步、why、并排对照）');
check(/pickRecognitionIndex\(/.test(sessionSrc) && /pickTransferIndex\(/.test(sessionSrc),
  'UI：识别/迁移题按累计次数轮换（pickRecognitionIndex / pickTransferIndex）');
check(/ReactMarkdown/.test(sessionSrc) && /remarkGfm/.test(sessionSrc),
  'UI：解释含反引号，必须走 Markdown 渲染');
check((overviewSrc.match(/formatDate\(new Date\(/g) ?? []).length >= 2,
  'UI：到期日期走 formatDate（模式卡 + 完成页两处，不是裸日期字符串）');
check(/THINK_PATTERN_LAYERS/.test(overviewSrc) && /summarizeLayers\(/.test(overviewSrc) &&
  /模式地图/.test(overviewSrc) && /layerSummaries\.map/.test(overviewSrc),
  'UI：概览渲染四层模式地图与层统计');
check(/THINK_PATTERN_LAYERS\.map/.test(overviewSrc) && /pattern\.layer === layer\.id/.test(overviewSrc),
  'UI：展开全部时模式库按 layer 分组，不是平铺');
check(/今日先练/.test(overviewSrc) && /hero\.name/.test(overviewSrc) &&
  /showMap/.test(overviewSrc) && /全部 \$\{THINK_PATTERNS\.length\} 个模式/.test(overviewSrc),
  'UI：概览只有一个「今日先练」焦点卡；体检/地图/模式库降为文字入口');
check(/到期 \{stats\.due\} · 今日已练 \{stats\.reviewedToday\}/.test(overviewSrc),
  'UI：概览统计收成一行，不再占三张卡');
check(/自由训练/.test(overviewSrc) && /onPractice/.test(overviewSrc) && /混合训练/.test(overviewSrc),
  'UI：概览有自由训练入口与混合训练按钮');
check(/onPractice\(\[pattern\.id\]\)/.test(overviewSrc),
  'UI：自由训练可任选单个模式');
check(/再练一组（5 个）/.test(overviewSrc) && /onPractice\(practiceIds\)/.test(overviewSrc),
  'UI：完成页可直接再练一组');
check(/startPractice/.test(modeCode) && /onPractice=\{startPractice\}/.test(modeCode),
  'UI：自由训练接到独立队列（不经过 dueQueue 过滤）');
check(/改写快练/.test(overviewSrc) && /onRewrite/.test(overviewSrc) &&
  /onRewrite=\{\(\) => setMode\('rewrite'\)\}/.test(modeSrc),
  'UI：概览有改写快练入口并接到状态机');
check(/mode === 'rewrite'/.test(modeCode) && /<PatternRewriteDrill/.test(modeSrc) &&
  /items=\{THINK_PATTERN_REWRITES\}/.test(modeSrc),
  'UI：rewrite 模式渲染 60 道派生题');
check(/10 题一组/.test(rewriteSrc) && /查看参考/.test(rewriteSrc) &&
  /改对了/.test(rewriteSrc) && /还差一点/.test(rewriteSrc),
  'UI：改写快练 10 题一组、看参考后自评');
check(!/onGrade|grade\(|applyPatternResult|toast\./.test(rewriteCode),
  'UI：改写快练不写 SM-2、不弹 toast');
check(/offset \+ GROUP_SIZE/.test(rewriteCode),
  'UI：再来一组按 10 题轮换');
check(/isClosedBook\(progress\)/.test(sessionSrc) && /closedBook \?/.test(sessionCode) &&
  /这次闭卷/.test(sessionSrc),
  'UI：迁移卡按 isClosedBook 切换闭卷提示');
check(/delayedProbeDay\(progress/.test(sessionSrc) && /延迟 \$\{probeDay\} 天/.test(sessionSrc) &&
  /probeDay \? '延迟迁移' : '闭卷'/.test(sessionSrc),
  'UI：迁移卡标出 7/21/60 天延迟探测');
check(/transferKind === 'wording' \? '换措辞' : '新情境'/.test(sessionSrc),
  'UI：迁移卡标出新情境/换措辞');
check(/closedBook && \(/.test(sessionCode) && /回看：这次/.test(sessionSrc),
  'UI：闭卷/延迟反馈卡回看三步');
check(/提交前先猜一下/.test(sessionSrc) && /没把握/.test(sessionSrc) &&
  /有把握/.test(sessionSrc) && /一般/.test(sessionSrc),
  'UI：迁移前提供三级自评');
check(/round === 0 && confidence === null/.test(sessionCode) &&
  /disabled=\{!answer\.trim\(\) \|\| \(round === 0 && confidence === null\)\}/.test(sessionCode),
  'UI：首稿未选自评不能提交（改写/新场景不再要求 confidence）');
check(/confidence: confidence \?\? undefined/.test(sessionCode) &&
  /const finalize = \(/.test(sessionCode) &&
  (sessionCode.match(/onGrade\(\{/g) ?? []).length === 1,
  'UI：三稿只在 finalize 落一次分与 confidence');
check(/首稿/.test(sessionSrc) && /改写/.test(sessionSrc) && /新场景/.test(sessionSrc) &&
  /按反馈改写/.test(sessionSrc) && /换一个新场景/.test(sessionSrc) && /再改一版/.test(sessionSrc),
  'UI：三稿阶段与反馈 CTA 齐全');
check(/rewriteAttempts \+ 1 >= 2/.test(sessionCode) && /gradedRef\.current/.test(sessionCode) &&
  /pass = Boolean\(rewrite\?\.pass && all\[2\]\?\.pass\)/.test(sessionCode),
  'UI：改写与新场景都过才 pass，且只记一次 SM-2');
check(/judgeUnavailableRef\.current/.test(sessionCode),
  'AI：首次 AI 失败后跳过后续等待（三稿不重复等 15 秒）');
check(/你的判断/.test(sessionSrc) && /判断准确/.test(sessionSrc) && /判断偏了/.test(sessionSrc),
  'UI：反馈显示自评与实际是否一致');
check(/校准 \{calibrationHits\}\/\{calibrationAttempts\}/.test(overviewSrc),
  'UI：焦点卡显示校准命中/次数');
check(/mode === 'diagnostic'/.test(modeCode) && /items=\{THINK_PATTERN_DIAGNOSTIC\}/.test(modeSrc),
  'UI：diagnostic 模式渲染体检题表');
check(/思维体检/.test(overviewSrc) && /onDiagnostic/.test(overviewSrc) && /diagnostic=/.test(modeSrc),
  'UI：概览有思维体检入口且接到状态机');
check(/scoreDiagnostic\(/.test(diagnosticCode) && /onComplete\(next\)/.test(diagnosticCode),
  'UI：体检完成时只算 profile 并保存一次');
check(!/grade\(|onGrade|applyPatternResult|setState\(\(prev\)[^)]*progress/.test(diagnosticCode),
  'UI：体检不写 SM-2 进度（不调 grade / applyPatternResult）');
check(!/toast\./.test(modeSrc + overviewSrc + sessionSrc + diagnosticSrc), 'UI：练习界面不弹 toast');

/* ── AI 判定接线（Task 6）───────────────────────────────────────────────────
 * 迁移提交先走非流式 aiChat，成功直接落 source='ai'；空串/解析失败/没配 Key 才
 * 回落 Task 5 的自评。会话用 judgeSeq 防旧 Promise 把结果写进下一张卡。
 *
 * 静态接线一律看**剥注释源码**（stripComments 已在 UI 段定义）：注释里的 ``source: 'ai'`` /
 * extractJson 不该替实现答话（变异实验抓过：改坏代码后注释仍在，检查照样绿）。
 */

check(/useAI\(/.test(modeCode), 'AI：组件使用 useAI');
check(/creditOnce\('think'/.test(modeCode), 'AI：迁移提交走 creditOnce');
check(/creditKey\('pattern'/.test(modeCode), 'AI：计时键含 pattern 与题目/答案');
check(/judgeSeq/.test(sessionCode), 'AI：会话用请求序号防旧结果');
check(/validatePatternJudgeResult/.test(modeCode), 'AI：走 validatePatternJudgeResult');
check(/extractJson\(raw\)/.test(modeCode) && /if \(!raw\.trim\(\)\)/.test(modeCode), 'AI：空串先判空再 extractJson');
check(/source: 'self'/.test(modeCode) || /source: 'self'/.test(sessionCode), 'AI：解析失败回落自评');

/* 上面 7 条是 brief 的接线判据；下面几条钉住「改坏了会静默变坏」的语义：
 * 只看 import / 只看函数名会被定义替它答话，所以逐条钉到调用与顺序。 */
check(/validatePatternJudgeResult\(\s*extractJson\(raw\)\s*\)/.test(modeCode),
  'AI：validatePatternJudgeResult 真的包住 extractJson（不是只有 import）');
check(/creditKey\('pattern', target\.id, answer\)/.test(modeCode),
  'AI：计时键同时带 pattern id 与用户原文（只有 pattern 会换题不再计）');
check(/onJudge=\{judge\}/.test(modeCode), 'AI：会话真的接到 onJudge（不是只定义 judge）');
const iCredit = modeCode.indexOf("creditOnce('think'");
const iChat = modeCode.indexOf('await aiChat(');
check(iCredit >= 0 && iChat >= 0 && iCredit < iChat,
  'AI：计时在 AI 请求之前（服务不可用不撤销这次作答）', `credit=${iCredit} chat=${iChat}`);
check(/temperature: 0\.2/.test(modeCode) && /maxTokens: 512/.test(modeCode),
  'AI：非流式判定参数 temperature 0.2 / maxTokens 512');
check(/if \(!raw\.trim\(\)\) return null;/.test(modeCode),
  'AI：空串（useAI 失败）直接降级，不喂 extractJson');

/* 判定不能永远挂着 / 不能从练习界面弹全局 toast（final-review I1 + I2）：
 *  - AbortController + 15 秒定时器 + signal 传给 aiChat，定时器在 finally 里清；
 *  - silent: true 让 use-ai / ai-service 在失败时只返回空串，不弹提示。
 * 顺序也钉住：先建 controller、再设定时器、再发请求、最后清定时器。 */
check(/new AbortController\(\)/.test(modeCode) && /signal: controller\.signal/.test(modeCode),
  'AI：判定请求带 AbortController 的 signal');
check(/const JUDGE_TIMEOUT_MS = 15_000;/.test(modeCode) &&
  /setTimeout\(\(\) => controller\.abort\(\), JUDGE_TIMEOUT_MS\)/.test(modeCode),
  'AI：判定 15 秒超时后 abort（不永久停在「正在判定」）');
check(/finally \{\s*clearTimeout\(timer\);\s*\}/.test(modeCode),
  'AI：定时器在 finally 里清掉（成功/失败/超时三条路都不漏）');
const iAbort = modeCode.indexOf('new AbortController');
const iTimer = modeCode.indexOf('setTimeout');
const iChatAwait = modeCode.indexOf('await aiChat(');
const iClear = modeCode.indexOf('clearTimeout(timer)');
check(iAbort >= 0 && iTimer > iAbort && iChatAwait > iTimer && iClear > iChatAwait,
  'AI：顺序为 建 controller → 设定时器 → 发请求 → 清定时器',
  `abort=${iAbort} timer=${iTimer} chat=${iChatAwait} clear=${iClear}`);
check(/silent: true/.test(modeCode), 'AI：判定请求 silent:true（练习界面不弹全局提示）');

const serviceSrc = readUi('src/services/ai-service.ts');
const serviceCode = stripComments(serviceSrc);
const useAiSrc = readUi('src/hooks/use-ai.ts');
const useAiCode = stripComments(useAiSrc);
check(/silent\?: boolean/.test(serviceCode), 'AI：StreamCallOptions 提供 silent 开关');
check((serviceCode.match(/if \(!options\.silent\) hintOfflineFallback\(\);/g) ?? []).length === 2,
  'AI：ai-service 的 chat 与 streamChat 都在 silent 时跳过离线回落提示',
  `实际 ${(serviceCode.match(/if \(!options\.silent\) hintOfflineFallback\(\);/g) ?? []).length} 处`);
check((useAiCode.match(/if \(!options\?\.silent\) toast\.error\(message\);/g) ?? []).length === 2,
  'AI：useAI 的 handleChat 与 handleStreamChat 都在 silent 时跳过 toast.error',
  `实际 ${(useAiCode.match(/if \(!options\?\.silent\) toast\.error\(message\);/g) ?? []).length} 处`);

check(/if \(selfEvalRoundRef\.current === round\) return;/.test(sessionCode),
  'UI：自评「我用上了 / 还没做到」每轮只能落一次（连点不重复记分）');
check(/if \(nextRef\.current\) return;/.test(sessionCode) && /disabled=\{advancing\}/.test(sessionCode),
  'UI：反馈卡「继续」只能推进一次（nextRef + 禁用，双击不跳模式）');

/* 「全部重置」必须能清掉新键：hook 的 resetAll 目前没有调用点，只能靠这个列表。 */
const progressPageSrc = readUi('src/pages/ProgressPage/ProgressPage.tsx');
const resetAllBody = (progressPageSrc.match(/const handleResetAll = \(\) => \{[\s\S]*?\n {2}\};/) ?? [''])[0];
check(resetAllBody.includes("'__nativethink_think_pattern_progress'"),
  'store：ProgressPage 的「全部重置」清掉模式复习进度', `切片 ${resetAllBody.length} 字`);
check(/await onJudge\(/.test(sessionCode), 'AI：会话真的 await onJudge');
check(/!trimmed \|\| judgingRef\.current \|\| \(round === 0 && confidence === null\)/.test(sessionCode),
  'AI：空答案/首稿未选自评/判定中不重复提交（按钮 disabled 挡不住回车与连点）');
check(/judgeSeqRef\.current !== seq/.test(sessionCode),
  'AI：旧 Promise 先比 judgeSeq 再写状态（否则写进下一张卡）');
const cleanupEffect = (sessionCode.match(/useEffect\(\(\) => \(\) => \{[\s\S]*?\}, \[\]\);/) ?? [''])[0];
check(/judgeSeqRef\.current \+= 1/.test(cleanupEffect),
  'AI：卸载 cleanup 作废在飞的判定');
const exitBody = (sessionCode.match(/const handleExit = \(\) => \{[\s\S]*?\n {2}\};/) ?? [''])[0];
check(exitBody.includes('judgeSeqRef.current += 1') &&
  exitBody.indexOf('judgeSeqRef.current += 1') < exitBody.indexOf('onExit()'),
  'AI：退出时先作废在飞的判定再离开（onExit 会卸载组件）');
check(/setFallback\(true\)/.test(sessionCode), 'AI：失败路径置 fallback（参考表达 + 自评按钮）');
check(/重试 AI 判定/.test(sessionCode) && /submitDraft\(true\)/.test(sessionCode),
  'UI：AI 失败后可重试');
check(/pass: result\.pass/.test(sessionCode) && /source: 'ai'/.test(sessionCode) &&
  /transferPassed: pass/.test(sessionCode),
  'AI：AI 结果进三稿，最终按改写+新场景计算 transferPassed');
check(/answer: trimmed/.test(sessionCode), 'AI：落分写的是 trim 后的答案');
check(/evidence: result\.evidence/.test(sessionCode), 'AI：证据短语随结果落分（薄弱报告要用）');
check(/\{fallback && \(/.test(sessionCode) && /我用上了这个模式/.test(sessionCode) && /还没做到/.test(sessionCode),
  'AI：降级卡保留两个自评按钮（不是只有文案）');

/* ── 页面接入（Task 7）───────────────────────────────────────────────────────
 * 「组件写好了但没人挂」是 AGENTS.md 记过的通用坑（功能两端都写了却点不到），静态检查看不出断线。
 * 这里不只钉「这几个字出现过」：
 *  - 默认值必须是 patterns —— 但旧的 `think-tab` 存值不改写（usePageMemory 读回原值即可，
 *    旧用户的 detector/translation… 继续落在原 tab）；
 *  - patterns 必须是 TabsList / TabsContent 的**第一项**（拍位置而不是拍存在，否则顺手挪走也绿）；
 *  - patterns 面板里真的挂 `<PatternReviewMode />`（只 import 不渲染、或挂到别的 tab 里都不算）；
 *  - 现有四个 tab 的 trigger / content 一个都不许少（改这里最容易顺手删掉旧面板）。
 * 静态检查跑在剥注释源码上：注释里写 `value="patterns"` 不该替实现答话。
 */
const pageSrc = readUi('src/pages/ThinkInEnglishPage/ThinkInEnglishPage.tsx');
const pageCode = stripComments(pageSrc);

check(pageSrc.length > 0, '页面：ThinkInEnglishPage.tsx 存在');
check(/import\s*\{\s*PatternReviewMode\s*\}\s*from\s*'\.\/PatternReviewMode'/.test(pageCode),
  '页面：从 ./PatternReviewMode 导入组件');
check(/<PatternReviewMode\s*\/>/.test(pageCode), '页面：渲染 PatternReviewMode');
check(/usePageMemory\('think-tab', 'patterns'\)/.test(pageCode),
  '页面：默认 tab 是 patterns（usePageMemory 第二参）');
check(!/usePageMemory\('think-tab', 'detector'\)/.test(pageCode),
  '页面：旧默认 detector 已移除（两处默认值不许打架）');
check(/<Tabs value=\{activeTab\}/.test(pageCode),
  '页面：Tabs 仍受 activeTab 控制（默认值不是死代码）');

const lucideBlock = (pageCode.match(/import\s*\{([\s\S]*?)\}\s*from\s*'lucide-react'/) ?? [])[1] ?? '';
check(/\bRepeat\b/.test(lucideBlock), '页面：Repeat 图标取自 lucide-react（不新增依赖）');

// 顺序按 JSX 出现次序逐个点名：patterns 在第一位，旧四个的相对顺序原样保留。
const triggerOrder = [...pageCode.matchAll(/<TabsTrigger\s+value="([A-Za-z]+)"/g)].map((m) => m[1]);
check(triggerOrder.join(',') === 'patterns,detector,translation,backTranslation,nativeTranslate',
  '页面：五个 TabsTrigger 顺序（patterns 第一，旧四个不变）', triggerOrder.join(','));

const contentOrder = [...pageCode.matchAll(/<TabsContent\s+value="([A-Za-z]+)"/g)].map((m) => m[1]);
check(contentOrder.join(',') === 'patterns,detector,translation,backTranslation,nativeTranslate',
  '页面：五个 TabsContent 顺序（patterns 第一，旧四个不变）', contentOrder.join(','));

// 面板体按自己的闭合标签切（非贪婪遇到第一个 </TabsContent> 就停）：
// 不用「从这里往后 240 字里有没有组件」—— 窗口会跨过面板边界，把挂错 tab 的实现判绿（变异 M4 抓到的）。
const contentBody = (value) =>
  (pageCode.match(new RegExp(`<TabsContent value="${value}"[\\s\\S]*?</TabsContent>`)) ?? [''])[0];
check(/<PatternReviewMode\s*\/>/.test(contentBody('patterns')),
  '页面：patterns 面板里挂载组件（不是挂到别的 tab 里）');
check((pageCode.match(/<PatternReviewMode\s*\/>/g) ?? []).length === 1,
  '页面：PatternReviewMode 只挂一处（重复挂载会让两个面板同时跑状态机）');
check(!/setActiveTab\(\s*['"]patterns['"]\s*\)/.test(pageCode),
  '页面：没有挂载时强制回 patterns 的语句（旧存值仍然生效）');

// 旧四个面板不只留了空壳：各自还接在自己的提交/题库状态上。
check(contentBody('detector').includes('handleDetectorSubmit'),
  '页面：detector 面板仍接 handleDetectorSubmit（旧面板不是空壳）');
check(contentBody('translation').includes('handleTranslationSubmit'),
  '页面：translation 面板仍接 handleTranslationSubmit');
check(contentBody('backTranslation').includes('handleBackSubmit'),
  '页面：backTranslation 面板仍接 handleBackSubmit');
check(contentBody('nativeTranslate').includes('handleNativeSubmit'),
  '页面：nativeTranslate 面板仍接 handleNativeSubmit');

/* ── 变异实验（Task 8）──────────────────────────────────────────────────────
 * 上面 400+ 条断言全绿，但「实现被故意改坏时它们会不会红」只有变异实验能证明。
 * 每条都走同一条路：把真实源码里的一个**唯一串**替换掉 → 真转译 → 真 import →
 * 用同一夹具问「坏行为出现了吗」。期望函数返回 true 表示**变异体的坏行为被观察到**，
 * 所以基线（未变异）跑同一条断言必须返回 false；若是 true，说明夹具本身没区分力，
 * 同样算失败（不能靠"反正变异了就红"糊弄过去）。
 *
 * 覆盖的都是"改坏后界面看起来照常、只在不该发生的时候悄悄发生"的语义：
 *   M1 每日总上限 / M2 失败回队 / M3 每日新模式上限 / M4 失败不重置 repetitions /
 *   M5 mastered 不看 AI 通过次数 / M6 下行重读接线 / M7 计时接线 /
 *   M8 AI 返回校验（坏 pass 不再拒绝）/ M9 薄弱排序 lapses 优先 / M10 识别题轮换取模 /
 *   M11 会话推进越界 / M12 通过不清重复副本 / M13 完成页按结果计数。
 * M6 / M7 是静态接线（hook 与组件依赖 React，不能整份 import），其余走真跑。
 */
const pureSrc = readFileSync(join(ROOT, 'src/lib/think-patterns.ts'), 'utf8');
const aiSrc = readFileSync(join(ROOT, 'src/lib/think-pattern-ai.ts'), 'utf8');
const hookText = hookSrc;
const modeText = modeSrc;

const replaceOnce = (src, before, after) => {
  const hits = src.split(before).length - 1;
  return { hits, out: hits === 1 ? src.replace(before, after) : src };
};

const loadMutant = async (src) => {
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const file = join(mkdtempSync(join(tmpdir(), 'nt-pattern-mut-')), 'mut.mjs');
  writeFileSync(file, js, 'utf8');
  return import(pathToFileURL(file).href);
};

const runPureMutation = async (label, before, after, expectFn) => {
  // 负对照：同一条「坏行为」在未变异的真实实现上必须观察不到。
  // 少了这条，一个恒真的期望函数会让变异实验永远绿 —— 等于没在管事。
  let baselineBroken = false;
  let baselineDetail = '';
  try { baselineBroken = expectFn(pure) === true; } catch (e) { baselineDetail = String(e?.message ?? e); }
  check(!baselineBroken && !baselineDetail, `${label}：基线（未变异）不出现坏行为`, baselineDetail);
  const { hits, out } = replaceOnce(pureSrc, before, after);
  check(hits === 1, `${label}：变异串恰好命中一次`, `hits=${hits}`);
  if (hits !== 1) return;
  const m = await loadMutant(out);
  let broken = false;
  let detail = '';
  try { broken = expectFn(m) === true; } catch (e) { detail = String(e?.message ?? e); }
  check(broken, `${label}：变异后行为必须变红`, detail || '基线行为在变异体上仍然成立 —— 断言没在管事');
};

// M1：每日 10 上限（用 12 个合成模式，避免受真实 12 个模式限制）。
// 注意 map 参数不能叫 p —— 会遮住上面那个「建进度」的工厂函数 p()。
const synthetic = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}` }));
const manyProgress = Object.fromEntries(synthetic.map((pat) => [
  pat.id,
  p(pat.id, { firstReviewedOn: '2026-10-22', nextReview: 0 }),
]));
await runPureMutation(
  'M1 每日 10 上限',
  'slice(0, maxPatterns)',
  'slice(0, 999)',
  (m) => m.buildReviewQueue({
    patterns: synthetic, progress: manyProgress, now, today, maxPatterns: 10, maxNewPerDay: 0,
  }).length > 10,
);

// M2：失败不回队（pushRetry 返回的队列里必须多出这张卡）。
await runPureMutation(
  'M2 失败不回队',
  'queue: [...queue, patternId]',
  'queue',
  (m) => m.pushRetry(['a'], 'a', {}, 2).queue.length === 1,
);

// M3：每天 2 个新模式上限（12 个全新模式只许引入 2 个）。
await runPureMutation(
  'M3 新模式上限',
  'slice(0, newBudget)',
  'slice(0, 99)',
  (m) => m.buildReviewQueue({
    patterns, progress: {}, now, today, maxPatterns: 10, maxNewPerDay: 2,
  }).length > 2,
);

// M4：失败必须重置 repetitions（否则 lapse 之后仍按旧连对次数算间隔）。
await runPureMutation(
  'M4 失败不重置 repetitions',
  'repetitions = 0;',
  'repetitions = repetitions;',
  (m) => m.applyPatternResult(
    p('subject-first', { repetitions: 2, interval: 3, status: 'reviewing', firstReviewedOn: '2026-10-22' }),
    { patternId: 'subject-first', recognitionCorrect: true, transferPassed: false, source: 'ai', answer: 'x', feedback: 'x', today },
    now,
  ).repetitions === 2,
);

// M5：mastered 必须看 AI 通过次数（纯自评 + 间隔达标也不许掌握）。
// 变异串要连 interval 条件一起写：文件头注释里也有一句「aiTransferPasses >= 2」，
// 只写后半段会命中两次（变异串必须恰好一次才敢说改的就是这一行）。
await runPureMutation(
  'M5 mastered 不看 AI 通过',
  'interval >= 21 && aiTransferPasses >= 2',
  'interval >= 21 && aiTransferPasses >= 0',
  (m) => m.applyPatternResult(
    p('subject-first', { repetitions: 3, interval: 10, status: 'reviewing', firstReviewedOn: '2026-10-22' }),
    { patternId: 'subject-first', recognitionCorrect: true, transferPassed: true, source: 'self', answer: 'x', feedback: 'x', today },
    now,
  ).status === 'mastered',
);

// M6：去掉下行重读接线（静态）—— 重复挂载/切设备后进度不再重读，界面看起来照常。
{
  const hasSync = (src) => /useSyncDown\(/.test(src);
  check(hasSync(hookText), 'M6 基线：hook 有 useSyncDown');
  const m6 = replaceOnce(hookText, 'useSyncDown(', 'noop(');
  check(m6.hits === 1 && !hasSync(m6.out), 'M6 去掉 useSyncDown：重读接线必须消失');
}

// M7：去掉迁移判定前的计时接线（静态）—— AI 不可用时那次真实作答会被静默吞掉。
{
  const hasCredit = (src) => /creditOnce\('think'/.test(src);
  check(hasCredit(modeText), 'M7 基线：迁移提交走 creditOnce');
  const m7 = replaceOnce(modeText, "creditOnce('think'", "noop('think'");
  check(m7.hits === 1 && !hasCredit(m7.out), 'M7 去掉 creditOnce：计时接线必须消失');
}

// M8：坏形状不再判 null（AI 返回校验）—— 坏 pass 会被放行落分。
// 这里有两件事：① 基线断言（当前实现必须拒绝坏 pass）是源码被改坏时**真正会红**的那条；
// ② 加载变异体确认「改坏之后确实会出现坏行为」——它要的是坏行为**出现**（bad !== null），
// 不是要求它返回 null。两者合起来才证明这条校验有区分力。
{
  // 基线负对照：当前实现必须拒绝坏 pass。源码被改成 `if (false)` 时这条先红
  // （M8 的变异实验才有"命中 M8 这条断言"的证据，而不是只靠前面那条通用断言）。
  check(ai.validatePatternJudgeResult({ pass: 'yes', feedback: 'x' }) === null,
    'M8 基线：当前实现拒绝非布尔 pass');
  const { hits, out } = replaceOnce(aiSrc, 'if (pass === null) return null;', 'if (false) return null;');
  check(hits === 1, 'M8：校验变异串恰好命中一次', `hits=${hits}`);
  const m8 = await loadMutant(out);
  const bad = m8.validatePatternJudgeResult({ pass: 'yes', feedback: 'x' });
  check(bad !== null, 'M8 变异体上坏 pass 不再被判 null（坏行为出现，证明这条校验在管事）');
}

// M9：薄弱排序丢掉 lapses 优先（只剩失败率时，lapses 3 但失败率低的那条会被挤下去）。
await runPureMutation(
  'M9 薄弱排序丢 lapses',
  'b.progress.lapses - a.progress.lapses ||',
  '0 ||',
  (m) => m.getWeakPatterns(patterns, {
    'subject-first': p('subject-first', { lapses: 3, transferAttempts: 4, transferPasses: 1 }),
    'verb-driven': p('verb-driven', { lapses: 1, transferAttempts: 2, transferPasses: 0 }),
  }, 3)[0]?.pattern.id === 'verb-driven',
);

// M10：识别题轮换不再按次数取模（每张卡都问第一道，练三轮仍在同一题）。
await runPureMutation(
  'M10 识别轮换',
  `export function pickRecognitionIndex(total: number, length: number): number {
  return length > 0 ? total % length : 0;
}`,
  `export function pickRecognitionIndex(total: number, length: number): number {
  return 0;
}`,
  (m) => m.pickRecognitionIndex(4, 3) === 0,
);

// M11：会话推进越界（单张队列 advance 之后下标 1、done=false → 下一帧是一张空卡）。
await runPureMutation(
  'M11 会话推进越界',
  'if (state.index + 1 >= state.queue.length) return { state, done: true };',
  'if (state.index >= state.queue.length) return { state, done: true };',
  (m) => {
    const step = m.advanceSession(m.createPatternSession(['a']));
    return step.done === false && step.state.index === 1;
  },
);

// M12：通过后不清未来重复副本（重试卡通过后队尾还会再练一遍同一个模式）。
await runPureMutation(
  'M12 通过不清重复副本',
  'return { ...state, results, queue: dropQueuedRetries(state.queue, state.index, patternId) };',
  'return { ...state, results };',
  (m) => m.applySessionResult(
    { queue: ['a', 'b', 'a'], index: 0, retries: {}, results: {} }, 'a', true,
  ).queue.length === 3,
);

// M13：完成页把「通过」也算成未通过（只数结果个数，不按 pass/fail 分）。
await runPureMutation(
  'M13 完成页按结果计数',
  "const failed = values.filter((r) => r === 'fail').length;",
  'const failed = values.length;',
  (m) => m.sessionCounts({
    queue: [], index: 0, retries: {}, results: { a: 'pass', b: 'fail' },
  }).failed === 2,
);

// M14：闭卷阈值被改成不可能触发 —— 第 3 次复习仍然展示“先想三步”。
await runPureMutation(
  'M14 闭卷阈值',
  'return (progress?.repetitions ?? 0) >= 2;',
  'return (progress?.repetitions ?? 0) >= 99;',
  (m) => m.isClosedBook({ repetitions: 3 }) === false,
);

// M15：体检计分恒真 —— 没作答也显示全对。
await runPureMutation(
  'M15 诊断计分恒真',
  'const isCorrect = answers[item.choiceId] === choice.answer;',
  'const isCorrect = true;',
  (m) => m.scoreDiagnostic(patterns, diagItems, {}, EXPECTED_LAYER_IDS).correct > 0,
);

// M16：诊断队列不再跳过已掌握 —— 已掌握的模式又被建议重练。
await runPureMutation(
  'M16 诊断队列跳过已掌握',
  "record.status === 'mastered' ||",
  'false ||',
  (m) => m.buildDiagnosticQueue(
    ['verb-driven'],
    { 'verb-driven': p('verb-driven', { status: 'mastered' }) },
    today,
    10,
  ).length === 1,
);

// M17：延迟 7 天阈值失效 —— 第 7 天不再标延迟。
await runPureMutation(
  'M17 延迟 7 天阈值',
  'if (days >= 7) return 7;',
  'if (days >= 99) return 7;',
  (m) => m.delayedProbeDay({ firstReviewedAt: now - 7 * 86400000, transferPasses: 1 }, now) === null,
);

// M18：自评校准不再计入 —— 有把握/没把握的预测永远不累计。
await runPureMutation(
  'M18 自评校准不计入',
  'const calibrated = confidence === 1 || confidence === 3;',
  'const calibrated = false;',
  (m) => m.applyPatternResult(undefined, {
    patternId: 'subject-first', recognitionCorrect: true, transferPassed: true,
    source: 'ai', answer: 'ok', feedback: 'x', confidence: 3, today,
  }, now).calibrationAttempts === 0,
);

// M19：自由训练不挑练得最少的 —— 永远从数据第一条开始。
await runPureMutation(
  'M19 自由训练不挑最少练的',
  '(progress[a.id]?.transferAttempts ?? 0) - (progress[b.id]?.transferAttempts ?? 0)',
  '(progress[b.id]?.transferAttempts ?? 0) - (progress[a.id]?.transferAttempts ?? 0)',
  (m) => m.pickPracticePatternIds(patterns, {
    'subject-first': p('subject-first', { transferAttempts: 5 }),
    'verb-driven': p('verb-driven', { transferAttempts: 0 }),
  }, 2)[0] === 'subject-first',
);

console.log('');
console.log(`verify-think-patterns: ${pass} 通过, ${fail} 失败`);
failures.forEach((f) => console.log(`  ✗ ${f}`));
process.exit(fail ? 1 : 0);
