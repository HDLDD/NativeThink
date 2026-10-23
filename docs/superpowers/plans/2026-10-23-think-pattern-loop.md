# /think 模式复习闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/think` 增加「模式复习」第五个 tab，把 8 个思维模式做成可对比、可识别、可迁移、可 SM-2 复习的闭环。

**Architecture:** 内容与调度分离：`src/data/think-patterns.ts` 只放 8 个模式与题目；`src/lib/think-patterns.ts` 是无依赖纯函数（SM-2、队列、薄弱排序）；`src/lib/use-think-patterns.ts` 负责 safeStorage + useSyncDown；`PatternReviewMode.tsx` 只做 UI 和 AI 接线。新增 `verify-think-patterns.mjs` 守住数据、纯函数、接线和降级路径。

**Tech Stack:** React 19、TypeScript、Vite、Tailwind、lucide-react、现有 `useAI`/`safeStorage`/`useSyncDown`/`useStudyCredit`；不新增依赖。

## Global Constraints

- 模块 key 仍是 `think`；不新增路由、不改 `MODULES` / `MODULE_PROGRESS_KEYS`。
- 进度键：`__nativethink_think_pattern_progress`，必须走 `safeStorage` 并接 `useSyncDown`。
- 日期一律 `formatDate()`；纯函数由调用方传 `today`，内部不取当前日期。
- 练习界面不弹评分/判定 toast；唯一例外是存储写失败的 `warnStorageFull()`。
- 迁移提交先 `creditOnce('think', creditKey('pattern', patternId, answer))`，再发 AI 请求。
- AI 只走非流式 `aiChat`；空串先判空，再 `extractJson`；解析失败/空串一律降级自评。
- 新守卫必须带正/反对照与变异，收尾 `npm run verify:all` 全绿。
- 仓库约定：未明确要求不 commit/push；每个任务末尾的 commit 步骤只在用户授权后执行。
- `verify-imports-tracked` 只看被 git 跟踪的 import：新增文件先 `git add` 进索引（不必 commit）再跑全量；否则会因未跟踪文件报红。

## File Structure

- Create: `src/data/think-patterns.ts` — 8 个模式、对比、识别题、迁移题、参考表达。
- Create: `src/lib/think-patterns.ts` — 纯函数：初始进度、SM-2、队列、重试、薄弱排序、daily 裁剪。
- Create: `src/lib/think-pattern-ai.ts` — prompt 构造、AI JSON 校验/解析。
- Create: `src/lib/use-think-patterns.ts` — 进度 store + safeStorage + useSyncDown。
- Create: `src/pages/ThinkInEnglishPage/PatternReviewMode.tsx` — 顶层状态机。
- Create: `src/pages/ThinkInEnglishPage/PatternOverview.tsx` — 概览、薄弱报告、模式卡。
- Create: `src/pages/ThinkInEnglishPage/PatternReviewSession.tsx` — 对比/识别/迁移/反馈。
- Create: `scripts/verify-think-patterns.mjs` — 数据、纯函数、接线、降级、变异。
- Modify: `src/pages/ThinkInEnglishPage/ThinkInEnglishPage.tsx` — 第五个 tab + 默认值。
- Modify: `scripts/verify-cloud-sync-hygiene.mjs`、`scripts/verify-study-credit.mjs`、`scripts/verify-ai-parse.mjs`。
- Modify: `docs/modules/think-in-english.md`、`docs/modules/cloud-sync.md`、`docs/modules/verification.md`、`AGENTS.md`、`CHANGELOG.md`。

---

### Task 1: 模式内容与数据守卫

**Files:**
- Create: `src/data/think-patterns.ts`
- Create: `scripts/verify-think-patterns.mjs`
- Read: `docs/superpowers/specs/2026-10-23-think-pattern-loop-design.md` §4

**Interfaces:**
- Consumes: 无。
- Produces: `THINK_PATTERNS: IThinkPattern[]`、`IThinkPattern`、`IThinkPatternChoice`、`IThinkPatternTransfer`。

- [ ] **Step 1: 写数据守卫**

创建 `scripts/verify-think-patterns.mjs`，先只做数据检查：

```js
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'src/data/think-patterns.ts';

let pass = 0, fail = 0;
const failures = [];
const check = (cond, label, detail) => {
  if (cond) pass++;
  else { fail++; failures.push(label + (detail ? ` — ${detail}` : '')); }
};

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

check(Array.isArray(patterns) && patterns.length === 8, '数据：恰好 8 个模式', `实际 ${patterns?.length}`);
const ids = new Set(patterns.map((p) => p.id));
check(ids.size === 8, '数据：模式 id 唯一', [...ids].join(','));

for (const p of patterns) {
  check(!!p.name && !!p.oneLiner, `数据：${p.id} 有名称与一句话原则`);
  check(!!p.contrast?.chineseThinking && !!p.contrast?.native && !!p.contrast?.note,
    `数据：${p.id} 对比三字段完整`);
  check(Array.isArray(p.cues) && p.cues.length >= 2, `数据：${p.id} 至少 2 条线索`);
  check(Array.isArray(p.recognition) && p.recognition.length === 3, `数据：${p.id} 恰好 3 道识别题`);
  check(Array.isArray(p.transfer) && p.transfer.length === 2, `数据：${p.id} 恰好 2 道迁移题`);
  for (const q of p.recognition) {
    check(Array.isArray(q.options) && q.options.length === 3, `数据：${q.id} 三个选项`);
    check(q.answer === 0 || q.answer === 1 || q.answer === 2, `数据：${q.id} answer 合法`);
    check(q.options.every((o) => typeof o === 'string' && o.trim()), `数据：${q.id} 选项非空`);
    check(new Set(q.options).size === 3, `数据：${q.id} 选项不重复`);
    check(!!q.explanation, `数据：${q.id} 有解释`);
  }
  for (const t of p.transfer) {
    check(!!t.situation && !!t.rubricFocus && !!t.modelAnswer, `数据：${t.id} 迁移三字段完整`);
  }
}

console.log('');
console.log(`verify-think-patterns: ${pass} 通过, ${fail} 失败`);
failures.forEach((f) => console.log(`  ✗ ${f}`));
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: 运行守卫确认先红**

Run: `node scripts/verify-think-patterns.mjs`
Expected: FAIL，`ENOENT` 或 `THINK_PATTERNS` 不存在。

- [ ] **Step 3: 写数据文件**

把 **Appendix A** 的完整内容写入 `src/data/think-patterns.ts`。不要改 id、题目数量或 answer 下标；这些都被守卫钉住。

- [ ] **Step 4: 运行守卫确认全绿**

Run: `node scripts/verify-think-patterns.mjs`
Expected: `0 失败`（通过数按实际输出计）。

- [ ] **Step 5: 类型检查**

Run: `npm run typecheck`
Expected: 无输出错误，退出码 0。

- [ ] **Step 6: Commit（仅用户授权后）**

```bash
git add src/data/think-patterns.ts scripts/verify-think-patterns.mjs
git commit -m "feat(think): add pattern library data and guard"
```

---

### Task 2: 纯调度模块（SM-2 / 队列 / 薄弱排序）

**Files:**
- Create: `src/lib/think-patterns.ts`
- Modify: `scripts/verify-think-patterns.mjs`
- Read: `src/lib/use-sentence-review.ts`（SM-2 口径参考）

**Interfaces:**
- Consumes: `IThinkPattern` from `src/data/think-patterns.ts`。
- Produces:
  - `THINK_PATTERN_STORAGE_KEY`
  - `initialPatternProgress(patternId: string, now?: number): IThinkPatternProgress`
  - `applyPatternResult(prev: IThinkPatternProgress | undefined, input: PatternResultInput, now?: number): IThinkPatternProgress`
  - `buildReviewQueue(input: BuildReviewQueueInput): string[]`
  - `pushRetry(...)`
  - `dropQueuedRetries(queue, currentIndex, patternId): string[]`
  - `getWeakPatterns(patterns, progress, limit?): PatternWeakItem[]`
  - `pruneDaily(daily, today, days?)`

- [ ] **Step 1: 加纯函数断言（先红）**

在 `verify-think-patterns.mjs` 的数据检查之后追加：

```js
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
```

Run: `node scripts/verify-think-patterns.mjs`
Expected: FAIL，`src/lib/think-patterns.ts` 不存在。

- [ ] **Step 2: 实现纯函数**

创建 `src/lib/think-patterns.ts`：

```ts
import type { IThinkPattern } from '@/data/think-patterns';

const DAY_MS = 24 * 60 * 60 * 1000;
export const THINK_PATTERN_STORAGE_KEY = '__nativethink_think_pattern_progress';

export interface IThinkPatternProgress {
  patternId: string;
  status: 'learning' | 'reviewing' | 'mastered';
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: number;
  lastReview: number;
  lapses: number;
  firstReviewedAt: number;
  firstReviewedOn: string;
  recognitionCorrect: number;
  recognitionTotal: number;
  transferPasses: number;
  transferAttempts: number;
  aiTransferPasses: number;
  lastAttempt?: {
    at: number;
    on: string;
    pass: boolean;
    recognitionCorrect: boolean;
    answer: string;
    feedback: string;
    evidence?: string;
    source: 'ai' | 'self';
  };
}

export interface IThinkPatternState {
  progress: Record<string, IThinkPatternProgress>;
  daily: Record<string, string[]>;
}

export interface PatternResultInput {
  patternId: string;
  recognitionCorrect: boolean;
  transferPassed: boolean;
  source: 'ai' | 'self';
  answer: string;
  feedback: string;
  evidence?: string;
  today: string;
}

/** hook.grade 的入参：patternId 由调用方给，today 由 hook 补 */
export type PatternGradeInput = Omit<PatternResultInput, 'today'>;
/** 会话组件的 onGrade 入参：patternId 由顶层补 */
export type PatternSessionGradeInput = Omit<PatternResultInput, 'patternId' | 'today'>;

export interface BuildReviewQueueInput {
  patterns: IThinkPattern[];
  progress: Record<string, IThinkPatternProgress>;
  now?: number;
  today: string;
  maxPatterns?: number;
  maxNewPerDay?: number;
}

export interface PatternWeakItem {
  pattern: IThinkPattern;
  progress: IThinkPatternProgress;
  failureRate: number;
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

export function initialPatternProgress(patternId: string, now = Date.now()): IThinkPatternProgress {
  return {
    patternId,
    status: 'learning',
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    nextReview: now,
    lastReview: 0,
    lapses: 0,
    firstReviewedAt: now,
    firstReviewedOn: '',
    recognitionCorrect: 0,
    recognitionTotal: 0,
    transferPasses: 0,
    transferAttempts: 0,
    aiTransferPasses: 0,
  };
}

export function applyPatternResult(
  prev: IThinkPatternProgress | undefined,
  input: PatternResultInput,
  now = Date.now(),
): IThinkPatternProgress {
  const base = prev ?? initialPatternProgress(input.patternId, now);
  let { easeFactor, interval, repetitions, lapses, aiTransferPasses } = base;

  let quality: 2 | 3 | 4 | 5;
  if (!input.transferPassed) quality = 2;
  else if (input.source === 'self') quality = 3;
  else quality = input.recognitionCorrect ? 5 : 4;

  if (quality < 3) {
    repetitions = 0;
    interval = 0;
    lapses += 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 3;
    else interval = Math.round(Math.max(1, interval) * easeFactor);
    if (input.source === 'ai' && input.transferPassed) aiTransferPasses += 1;
  }

  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  const mastered = repetitions >= 4 && interval >= 21 && aiTransferPasses >= 2;
  const status = quality < 3 ? 'learning' : mastered ? 'mastered' : 'reviewing';

  return {
    ...base,
    status,
    easeFactor,
    interval,
    repetitions,
    lapses,
    aiTransferPasses,
    nextReview: interval === 0 ? now : now + interval * DAY_MS,
    lastReview: now,
    firstReviewedOn: base.firstReviewedOn || input.today,
    recognitionTotal: base.recognitionTotal + 1,
    recognitionCorrect: base.recognitionCorrect + (input.recognitionCorrect ? 1 : 0),
    transferAttempts: base.transferAttempts + 1,
    transferPasses: base.transferPasses + (input.transferPassed ? 1 : 0),
    lastAttempt: {
      at: now,
      on: input.today,
      pass: input.transferPassed,
      recognitionCorrect: input.recognitionCorrect,
      answer: truncate(input.answer, 300),
      feedback: truncate(input.feedback, 400),
      evidence: input.evidence ? truncate(input.evidence, 200) : undefined,
      source: input.source,
    },
  };
}

export function isDue(p: IThinkPatternProgress, now: number, today: string): boolean {
  return p.status !== 'mastered' && p.nextReview <= now &&
    !(p.lastAttempt?.pass === true && p.lastAttempt.on === today);
}

export function pickRecognitionIndex(total: number, length: number): number {
  return length > 0 ? total % length : 0;
}

export function pickTransferIndex(total: number, length: number): number {
  return length > 0 ? total % length : 0;
}

export function buildReviewQueue({
  patterns, progress, now = Date.now(), today, maxPatterns = 10, maxNewPerDay = 2,
}: BuildReviewQueueInput): string[] {
  const knownIds = new Set(patterns.map((p) => p.id));
  const newIntroducedToday = Object.values(progress)
    .filter((p) => knownIds.has(p.patternId) && p.firstReviewedOn === today).length;
  const newBudget = Math.max(0, maxNewPerDay - newIntroducedToday);
  const due = Object.values(progress)
    .filter((p) => knownIds.has(p.patternId) && isDue(p, now, today))
    .sort((a, b) => a.nextReview - b.nextReview)
    .map((p) => p.patternId);
  const known = new Set(Object.keys(progress));
  const fresh = patterns.filter((p) => !known.has(p.id)).slice(0, newBudget).map((p) => p.id);
  return [...due, ...fresh].slice(0, maxPatterns);
}

export function pushRetry(
  queue: string[],
  patternId: string,
  retries: Record<string, number>,
  maxRetries = 2,
): { queue: string[]; retries: Record<string, number>; retried: boolean } {
  const count = retries[patternId] ?? 0;
  if (count >= maxRetries) return { queue, retries, retried: false };
  return {
    queue: [...queue, patternId],
    retries: { ...retries, [patternId]: count + 1 },
    retried: true,
  };
}

export function dropQueuedRetries(queue: string[], currentIndex: number, patternId: string): string[] {
  return queue.filter((id, i) => i <= currentIndex || id !== patternId);
}

export function getWeakPatterns(
  patterns: IThinkPattern[],
  progress: Record<string, IThinkPatternProgress>,
  limit = 3,
): PatternWeakItem[] {
  return patterns
    .map((pattern) => {
      const p = progress[pattern.id];
      if (!p) return null;
      const failureRate = p.transferAttempts === 0 ? 0 : (p.transferAttempts - p.transferPasses) / p.transferAttempts;
      return { pattern, progress: p, failureRate };
    })
    .filter((row): row is PatternWeakItem => !!row && (row.progress.lapses > 0 || row.failureRate > 0))
    .sort((a, b) =>
      b.progress.lapses - a.progress.lapses ||
      b.failureRate - a.failureRate ||
      a.progress.nextReview - b.progress.nextReview)
    .slice(0, limit);
}

export function pruneDaily(
  daily: Record<string, string[]>,
  today: string,
  days = 31,
): Record<string, string[]> {
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() - (days - 1));
  const pad = (n: number) => String(n).padStart(2, '0');
  const cutoff = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return Object.fromEntries(
    Object.entries(daily)
      .filter(([key]) => key >= cutoff)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}
```

- [ ] **Step 3: 运行守卫与类型检查**

Run: `node scripts/verify-think-patterns.mjs`
Expected: 0 失败。

Run: `npm run typecheck`
Expected: 退出码 0。

- [ ] **Step 4: Commit（仅用户授权后）**

```bash
git add src/lib/think-patterns.ts scripts/verify-think-patterns.mjs
git commit -m "feat(think): add pattern scheduling and queue"
```

---

### Task 3: AI 判定 helper

**Files:**
- Create: `src/lib/think-pattern-ai.ts`
- Modify: `scripts/verify-think-patterns.mjs`

**Interfaces:**
- Consumes: `IThinkPattern`、`IThinkPatternTransfer`。
- Produces:
  - `buildPatternJudgePrompt(pattern, transfer, answer): ChatMessage[]`
  - `validatePatternJudgeResult(value: unknown): PatternJudgeResult | null`
- 解析入口放在组件里：先 `if (!raw.trim()) return null;`，再 `extractJson(raw)`，最后 `validatePatternJudgeResult(...)`；helper 不引入 `@/` 运行时依赖，守卫才能直接转译导入。

- [ ] **Step 1: 加 AI helper 断言（先红）**

追加到守卫：

```js
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
check(prompt[0].content.includes(sample.name) && prompt[0].content.includes(sample.oneLiner), 'AI：prompt 带模式名与原则');
check(prompt[0].content.includes('pass') && prompt[0].content.includes('feedback'), 'AI：prompt 要求 JSON 字段');
check(prompt[1].content.includes('I have seen it.'), 'AI：prompt 带用户答案');

check(ai.validatePatternJudgeResult(null) === null, 'AI：null 返回 null');
check(ai.validatePatternJudgeResult({ pass: 'yes', feedback: 'x' }) === null, 'AI：pass 非布尔返回 null');
check(ai.validatePatternJudgeResult({ pass: true, feedback: '' }) === null, 'AI：feedback 空返回 null');
const validated = ai.validatePatternJudgeResult({ pass: true, feedback: '用上了', evidence: 'I have seen' });
check(validated?.pass === true && validated.feedback === '用上了' && validated.evidence === 'I have seen', 'AI：合法对象正常归一化');
```

Run: `node scripts/verify-think-patterns.mjs`
Expected: FAIL，`src/lib/think-pattern-ai.ts` 不存在。

- [ ] **Step 2: 实现 helper**

创建 `src/lib/think-pattern-ai.ts`：

```ts
import type { ChatMessage } from '@/services/ai-service';
import type { IThinkPattern, IThinkPatternTransfer } from '@/data/think-patterns';

export interface PatternJudgeResult {
  pass: boolean;
  feedback: string;
  evidence: string;
}

export function buildPatternJudgePrompt(
  pattern: IThinkPattern,
  transfer: IThinkPatternTransfer,
  answer: string,
): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You are an English thinking coach. Judge whether the learner used the target thinking pattern in a new scenario.
Target pattern: ${pattern.name}
Principle: ${pattern.oneLiner}
Cues: ${pattern.cues.join('; ')}
Chinese-influenced version: ${pattern.contrast.chineseThinking}
Native version: ${pattern.contrast.native}
Why: ${pattern.contrast.note}
Scenario: ${transfer.situation}
Focus: ${transfer.rubricFocus}

Rules:
- pass=true only if the target pattern is clearly used and the sentence is natural enough.
- A grammatically correct sentence that ignores the target pattern is pass=false.
- Do not rewrite the whole sentence. Give one short Chinese feedback sentence and one evidence phrase.
- Return ONLY JSON with exactly these fields:
{"pass":true|false,"feedback":"中文 1-2 句","evidence":"用户句中的证据短语；没有就空字符串"}`,
    },
    { role: 'user', content: `My English answer: ${answer}` },
  ];
}

export function validatePatternJudgeResult(value: unknown): PatternJudgeResult | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.pass !== 'boolean') return null;
  if (typeof v.feedback !== 'string' || !v.feedback.trim()) return null;
  const evidence = typeof v.evidence === 'string' ? v.evidence.trim() : '';
  return { pass: v.pass, feedback: v.feedback.trim(), evidence };
}
```

- [ ] **Step 3: 运行守卫与类型检查**

Run: `node scripts/verify-think-patterns.mjs`
Expected: 0 失败。

Run: `npm run typecheck`
Expected: 退出码 0。

- [ ] **Step 4: Commit（仅用户授权后）**

```bash
git add src/lib/think-pattern-ai.ts scripts/verify-think-patterns.mjs
git commit -m "feat(think): add pattern AI judge helper"
```

---

### Task 4: 进度 store（safeStorage + sync-down）

**Files:**
- Create: `src/lib/use-think-patterns.ts`
- Modify: `scripts/verify-think-patterns.mjs`
- Read: `src/lib/use-phrase-learning.ts`（下行重读 + 纯 updater 口径参考）

**Interfaces:**
- Consumes: `THINK_PATTERN_STORAGE_KEY`、`applyPatternResult`、`buildReviewQueue`、`pruneDaily`、`isDue`。
- Produces: `useThinkPatterns()`，返回：

```ts
{
  loaded: boolean;
  state: IThinkPatternState;
  progress: Record<string, IThinkPatternProgress>;
  stats: { tracked: number; mastered: number; due: number; reviewedToday: number };
  dueQueue: string[];
  grade: (input: PatternGradeInput) => void;
  getProgress: (patternId: string) => IThinkPatternProgress | null;
  resetAll: () => void;
}
```

- [ ] **Step 1: 加静态接线断言（先红）**

追加到守卫：

```js
const hookSrc = readFileSync(join(ROOT, 'src/lib/use-think-patterns.ts'), 'utf8');
check(hookSrc.includes('__nativethink_think_pattern_progress'), 'store：使用约定的键名');
check(/useSyncDown\(/.test(hookSrc), 'store：接 useSyncDown');
check(/safeStorage\.setItem/.test(hookSrc), 'store：走 safeStorage');
check(/warnStorageFull/.test(hookSrc), 'store：写失败可见');
check(/applyPatternResult\(/.test(hookSrc) && /setState\(/.test(hookSrc), 'store：grade 走纯函数');
check(!/setState\(\(prev\)[^;]*safeStorage\.setItem/s.test(hookSrc), 'store：setState updater 不许直接写盘');
check(/JSON\.stringify\(state\)/.test(hookSrc) && /safeStorage\.getItem/.test(hookSrc), 'store：落盘前比对同一份 JSON，防下行回声');
```

Run: `node scripts/verify-think-patterns.mjs`
Expected: FAIL，文件不存在。

- [ ] **Step 2: 实现 hook**

创建 `src/lib/use-think-patterns.ts`：

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { safeStorage } from '@/lib/safe-storage';
import { useSyncDown } from '@/lib/sync-down';
import { formatDate } from '@/lib/utils';
import { warnStorageFull } from '@/lib/capped-cache';
import { THINK_PATTERNS } from '@/data/think-patterns';
import {
  THINK_PATTERN_STORAGE_KEY,
  applyPatternResult,
  buildReviewQueue,
  isDue,
  pruneDaily,
  type IThinkPatternProgress,
  type IThinkPatternState,
  type PatternGradeInput,
} from '@/lib/think-patterns';

const DEFAULTS: IThinkPatternState = { progress: {}, daily: {} };

function load(): IThinkPatternState {
  try {
    const raw = safeStorage.getItem(THINK_PATTERN_STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      progress: parsed?.progress && typeof parsed.progress === 'object' ? parsed.progress : {},
      daily: pruneDaily(
        parsed?.daily && typeof parsed.daily === 'object' ? parsed.daily : {},
        formatDate(new Date()),
      ),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function useThinkPatterns() {
  const [state, setState] = useState<IThinkPatternState>({ ...DEFAULTS });
  const [loaded, setLoaded] = useState(false);
  const loadedFromStorageRef = useRef<IThinkPatternState | null>(null);

  useEffect(() => {
    const next = load();
    setState(next);
    setLoaded(true);
  }, []);

  useSyncDown(() => {
    const next = load();
    loadedFromStorageRef.current = next;
    setState(next);
  });

  useEffect(() => {
    if (!loaded) return;
    if (loadedFromStorageRef.current === state) {
      loadedFromStorageRef.current = null;
      return;
    }
    const json = JSON.stringify(state);
    if (safeStorage.getItem(THINK_PATTERN_STORAGE_KEY) === json) return;
    if (!safeStorage.setItem(THINK_PATTERN_STORAGE_KEY, json)) {
      warnStorageFull();
    }
  }, [loaded, state]);

  const grade = useCallback((input: PatternGradeInput) => {
    const now = Date.now();
    const today = formatDate(new Date(now));
    setState((prev) => {
      const nextProgress = applyPatternResult(prev.progress[input.patternId], { ...input, today }, now);
      const todayList = prev.daily[today] ?? [];
      return {
        progress: { ...prev.progress, [input.patternId]: nextProgress },
        daily: {
          ...pruneDaily(prev.daily, today),
          [today]: todayList.includes(input.patternId) ? todayList : [...todayList, input.patternId],
        },
      };
    });
  }, []);

  const dueQueue = useMemo(() => {
    const now = Date.now();
    return buildReviewQueue({
      patterns: THINK_PATTERNS,
      progress: state.progress,
      now,
      today: formatDate(new Date(now)),
    });
  }, [state.progress]);

  const stats = useMemo(() => {
    const now = Date.now();
    const today = formatDate(new Date(now));
    const all = Object.values(state.progress);
    return {
      tracked: all.length,
      mastered: all.filter((p) => p.status === 'mastered').length,
      due: all.filter((p) => isDue(p, now, today)).length,
      reviewedToday: (state.daily[today] ?? []).length,
    };
  }, [state.progress, state.daily]);

  const getProgress = useCallback(
    (patternId: string) => state.progress[patternId] ?? null,
    [state.progress],
  );

  const resetAll = useCallback(() => setState({ progress: {}, daily: {} }), []);

  return {
    loaded, state, progress: state.progress, stats, dueQueue, grade, getProgress, resetAll,
  };
}
```

- [ ] **Step 3: 运行守卫与类型检查**

Run: `node scripts/verify-think-patterns.mjs`
Expected: 0 失败。

Run: `npm run typecheck`
Expected: 退出码 0。

- [ ] **Step 4: Commit（仅用户授权后）**

```bash
git add src/lib/use-think-patterns.ts scripts/verify-think-patterns.mjs
git commit -m "feat(think): persist pattern review progress"
```

---

### Task 5: 概览 + 复习 UI（先走自评降级）

**Files:**
- Create: `src/pages/ThinkInEnglishPage/PatternReviewMode.tsx`
- Create: `src/pages/ThinkInEnglishPage/PatternOverview.tsx`
- Create: `src/pages/ThinkInEnglishPage/PatternReviewSession.tsx`
- Modify: `scripts/verify-think-patterns.mjs`

**Interfaces:**
- Consumes:
  - `THINK_PATTERNS`
  - `useThinkPatterns()`
  - `getWeakPatterns`, `pushRetry`, `dropQueuedRetries`, `pickRecognitionIndex`, `pickTransferIndex`
  - `type PatternSessionGradeInput`
- Produces: `<PatternReviewMode />`（无 props）。

- [ ] **Step 1: 加 UI 静态断言（先红）**

追加到守卫：

```js
const modeSrc = readFileSync(join(ROOT, 'src/pages/ThinkInEnglishPage/PatternReviewMode.tsx'), 'utf8');
const overviewSrc = readFileSync(join(ROOT, 'src/pages/ThinkInEnglishPage/PatternOverview.tsx'), 'utf8');
const sessionSrc = readFileSync(join(ROOT, 'src/pages/ThinkInEnglishPage/PatternReviewSession.tsx'), 'utf8');
check(/useThinkPatterns\(/.test(modeSrc), 'UI：顶层使用 useThinkPatterns');
check(/PatternOverview/.test(modeSrc) && /PatternReviewSession/.test(modeSrc), 'UI：概览与复习会话分离');
check(/'overview' \| 'review' \| 'complete'/.test(modeSrc), 'UI：三态状态机');
check(modeSrc.includes('key={`${pattern.id}-${index}`}'), 'UI：换卡用 key 重挂载（否则重试会带着上一题阶段）');
check(/pushRetry/.test(modeSrc), 'UI：失败回队');
check(/modelAnswer/.test(sessionSrc), 'UI：自评路径展示参考表达');
check(!/toast\./.test(modeSrc + overviewSrc + sessionSrc), 'UI：练习界面不弹 toast');
```

Run: `node scripts/verify-think-patterns.mjs`
Expected: FAIL，文件不存在。

- [ ] **Step 2: 实现概览**

`PatternOverview.tsx`：

- props：`stats`、`weak`、`dueQueue`、`progress`、`mode`、`passed`、`failed`、`onStart`、`onBack`。
- 顶部统计三格：到期 / 今日已练 / 已掌握。
- 主按钮：`开始今日复习（{dueQueue.length}）`；`dueQueue.length === 0` 时禁用：`stats.mastered === 8` 显示“8 个模式都已掌握”，否则显示“今天已完成，下次到期后再来”。
- 薄弱模式区：`weak.length === 0` 显示“还没有薄弱模式”；否则列 3 行，每行模式名、lapses、`transferPasses/transferAttempts`、上次反馈（截断 80 字）。
- 模式卡网格：8 张卡，显示名称、oneLiner、状态（未开始/学习中/复习中/已掌握）、下次到期（未开始显示“未开始”），点击只展开对比，不改进度。
- 移动端用 `grid-cols-1 sm:grid-cols-2`；不新增浮层。

- [ ] **Step 3: 实现复习会话（自评）**

`PatternReviewSession.tsx`：

- props：`pattern: IThinkPattern`、`progress?: IThinkPatternProgress`、`onGrade(input: PatternSessionGradeInput): void`、`onNext(): void`、`onExit(): void`。
- 内部阶段：`'contrast' | 'recognition' | 'transfer' | 'feedback'`。
- 识别题用 `pickRecognitionIndex(progress?.recognitionTotal ?? 0, pattern.recognition.length)`；选项点击后显示解释，允许带着错继续。
- 迁移题用 `pickTransferIndex(progress?.transferAttempts ?? 0, pattern.transfer.length)`；textarea + 提交。
- 本任务先走自评：提交后立即显示 `modelAnswer`，两个按钮“我用上了这个模式”/“还没做到”，分别调用：
  - `onGrade({ recognitionCorrect, transferPassed: true, answer: answer.trim(), feedback: '自评：已对照参考表达', source: 'self' })`
  - `onGrade({ recognitionCorrect, transferPassed: false, answer: answer.trim(), feedback: '自评：还没用上这个模式', source: 'self' })`
  然后进入 `feedback` 阶段。会话里维护 `feedbackText`，自评按钮点击时先写入对应文案。
- 反馈卡显示通过/未通过、`feedbackText`、参考表达、`继续` 按钮；失败文案“下次复习会再遇到它”。
- 所有 className 沿用页面现有 `Button`/`Card` 风格；不引入新依赖。

- [ ] **Step 4: 实现顶层状态机**

`PatternReviewMode.tsx`：

```tsx
import { useState } from 'react';
import { THINK_PATTERNS } from '@/data/think-patterns';
import {
  dropQueuedRetries,
  getWeakPatterns,
  pushRetry,
  type PatternSessionGradeInput,
} from '@/lib/think-patterns';
import { useThinkPatterns } from '@/lib/use-think-patterns';
import { PatternOverview } from './PatternOverview';
import { PatternReviewSession } from './PatternReviewSession';

type Mode = 'overview' | 'review' | 'complete';
type Result = 'pass' | 'fail';

export function PatternReviewMode() {
  const { progress, stats, dueQueue, grade } = useThinkPatterns();
  const [mode, setMode] = useState<Mode>('overview');
  const [queue, setQueue] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [retries, setRetries] = useState<Record<string, number>>({});
  const [results, setResults] = useState<Record<string, Result>>({});

  const weak = getWeakPatterns(THINK_PATTERNS, progress);
  const passed = Object.values(results).filter((r) => r === 'pass').length;
  const failed = Object.values(results).filter((r) => r === 'fail').length;

  const start = () => {
    setQueue(dueQueue);
    setIndex(0);
    setRetries({});
    setResults({});
    setMode(dueQueue.length ? 'review' : 'overview');
  };

  const current = queue[index];
  const pattern = THINK_PATTERNS.find((p) => p.id === current);

  const handleGrade = (input: PatternSessionGradeInput) => {
    if (!pattern) return;
    grade({ ...input, patternId: pattern.id });
    setResults((prev) => ({ ...prev, [pattern.id]: input.transferPassed ? 'pass' : 'fail' }));
    if (input.transferPassed) {
      setQueue((prev) => dropQueuedRetries(prev, index, pattern.id));
    } else {
      const next = pushRetry(queue, pattern.id, retries);
      setQueue(next.queue);
      setRetries(next.retries);
    }
  };

  const handleNext = () => {
    if (index + 1 >= queue.length) {
      setMode('complete');
    } else {
      setIndex((i) => i + 1);
    }
  };

  if (mode === 'review' && pattern) {
    return (
      <PatternReviewSession
        key={`${pattern.id}-${index}`}
        pattern={pattern}
        progress={progress[pattern.id]}
        onGrade={handleGrade}
        onNext={handleNext}
        onExit={() => setMode('overview')}
      />
    );
  }

  return (
    <PatternOverview
      stats={stats}
      weak={weak}
      dueQueue={dueQueue}
      progress={progress}
      mode={mode}
      passed={passed}
      failed={failed}
      onStart={start}
      onBack={() => setMode('overview')}
    />
  );
}
```

注意：`handleGrade` 在失败回队后，`handleNext` 的 `index+1` 会走到新队尾之前的下一个；若当前是队尾，`queue` 已追加当前模式，`index+1 < queue.length` 会进入重试卡。若达到 2 次重试，`pushRetry` 返回原队列，`handleNext` 走到完成页。

- [ ] **Step 5: 类型检查**

Run: `npm run typecheck`
Expected: 退出码 0。

本任务不临时改路由；完整浏览器冒烟放到 Task 7（页面接入后）统一做。

- [ ] **Step 6: Commit（仅用户授权后）**

```bash
git add src/pages/ThinkInEnglishPage/PatternReviewMode.tsx src/pages/ThinkInEnglishPage/PatternOverview.tsx src/pages/ThinkInEnglishPage/PatternReviewSession.tsx scripts/verify-think-patterns.mjs
git commit -m "feat(think): add pattern review UI with self-check fallback"
```

---

### Task 6: AI 判定接线与自评降级

**Files:**
- Modify: `src/pages/ThinkInEnglishPage/PatternReviewMode.tsx`
- Modify: `src/pages/ThinkInEnglishPage/PatternReviewSession.tsx`
- Modify: `scripts/verify-think-patterns.mjs`
- Read: `src/hooks/use-ai.ts`、`src/lib/study-credit.ts`

**Interfaces:**
- Consumes: `useAI()` 的 `isConfigured`/`chat`、`buildPatternJudgePrompt`、`validatePatternJudgeResult`、`extractJson`、`creditOnce`/`creditKey`。
- Produces: 迁移提交的 AI 判定路径，失败/空串/坏 JSON 时回落到 Task 5 的自评路径。

- 会话组件新增 props：`onJudge(pattern: IThinkPattern, transfer: IThinkPatternTransfer, answer: string): Promise<PatternJudgeResult | null>`。
- `judgeSeq` 放在会话组件里：离开/卸载时递增，旧 Promise 回来直接丢弃，不能把结果写进下一个模式。
- mode 顶部补 import：`useAI`、`useStudyCredit`、`creditKey`、`buildPatternJudgePrompt`、`validatePatternJudgeResult`、`extractJson`；session 顶部补 `useEffect`/`useRef`。
- 在 mode 的 `<PatternReviewSession ... />` 上补 `onJudge={judge}`。
- 把 Task 5 的“提交后立即自评”改成：先走 `submitTransfer()`；AI 成功直接 `onGrade(source: 'ai')`，失败才 `setFallback(true)` 显示参考表达 + 自评按钮。
- 反馈卡统一展示 `feedbackText`：自评为 `'自评：已对照参考表达'`，AI 为 `result.feedback`。

- [ ] **Step 1: 加 AI 接线断言（先红）**

追加到守卫：

```js
check(/useAI\(/.test(modeSrc), 'AI：组件使用 useAI');
check(/creditOnce\('think'/.test(modeSrc), 'AI：迁移提交走 creditOnce');
check(/creditKey\('pattern'/.test(modeSrc), 'AI：计时键含 pattern 与题目/答案');
check(/judgeSeq/.test(sessionSrc), 'AI：会话用请求序号防旧结果');
check(/validatePatternJudgeResult/.test(modeSrc), 'AI：走 validatePatternJudgeResult');
check(/extractJson\(raw\)/.test(modeSrc) && /if \(!raw\.trim\(\)\)/.test(modeSrc), 'AI：空串先判空再 extractJson');
check(/source: 'self'/.test(modeSrc) || /source: 'self'/.test(sessionSrc), 'AI：解析失败回落自评');
```

Run: `node scripts/verify-think-patterns.mjs`
Expected: FAIL，缺少对应字符串。

- [ ] **Step 2: 在会话组件提交迁移**

`PatternReviewSession.tsx` 沿用 Task 5 的 `feedbackText` 状态，把提交改成异步 AI（`judgeSeq` 防旧结果）：

```tsx
const [judging, setJudging] = useState(false);
const [fallback, setFallback] = useState(false);
const judgeSeqRef = useRef(0);
useEffect(() => () => { judgeSeqRef.current += 1; }, []);

const submitTransfer = async () => {
  if (!answer.trim() || judging) return;
  setJudging(true);
  const seq = judgeSeqRef.current + 1;
  judgeSeqRef.current = seq;
  const result = await onJudge(pattern, transfer, answer.trim());
  if (judgeSeqRef.current !== seq) return;
  setJudging(false);
  if (result) {
    setFeedbackText(result.feedback);
    onGrade({
      recognitionCorrect,
      transferPassed: result.pass,
      answer: answer.trim(),
      feedback: result.feedback,
      evidence: result.evidence,
      source: 'ai',
    });
  } else {
    setFallback(true); // 显示参考表达 + 自评按钮
  }
};
```

`onJudge` 由 `PatternReviewMode` 提供：

```tsx
const { isConfigured, chat: aiChat } = useAI();
const { creditOnce } = useStudyCredit();

const judge = async (pattern, transfer, answer) => {
  creditOnce('think', creditKey('pattern', pattern.id, answer));
  if (!isConfigured) return null;
  try {
    const raw = await aiChat(buildPatternJudgePrompt(pattern, transfer, answer), {
      temperature: 0.2,
      maxTokens: 512,
    });
    if (!raw.trim()) return null;
    try {
      return validatePatternJudgeResult(extractJson(raw));
    } catch {
      return null;
    }
  } catch {
    return null;
  }
};
```

- [ ] **Step 3: 处理离页/换题**

- 组件卸载或 `onExit` 时 `judgeSeqRef.current += 1`，旧 Promise 回来直接丢弃。
- 提交按钮在 `judging` 时禁用；判定期间不允许点继续。
- AI 失败只内联显示“AI 判定不可用，先对照参考表达自评”，不弹 toast。

- [ ] **Step 4: 守卫与类型检查**

Run: `node scripts/verify-think-patterns.mjs`
Expected: 0 失败。

Run: `npm run typecheck`
Expected: 退出码 0。

AI/自评的完整浏览器冒烟放到 Task 7（页面接入后）统一做。

- [ ] **Step 5: Commit（仅用户授权后）**

```bash
git add src/pages/ThinkInEnglishPage/PatternReviewMode.tsx src/pages/ThinkInEnglishPage/PatternReviewSession.tsx scripts/verify-think-patterns.mjs
git commit -m "feat(think): judge pattern transfers with AI fallback"
```

---

### Task 7: 页面接入（第五个 tab + 默认值）

**Files:**
- Modify: `src/pages/ThinkInEnglishPage/ThinkInEnglishPage.tsx`
- Modify: `scripts/verify-think-patterns.mjs`
- Modify: `docs/modules/think-in-english.md`

**Interfaces:**
- Consumes: `<PatternReviewMode />`。
- Produces: `/think` 第五个 tab `patterns`，默认 `patterns`，现有四 tab 不变。

- [ ] **Step 1: 加页面接线断言（先红）**

追加到守卫：

```js
const pageSrc = readFileSync(join(ROOT, 'src/pages/ThinkInEnglishPage/ThinkInEnglishPage.tsx'), 'utf8');
check(/PatternReviewMode/.test(pageSrc), '页面：渲染 PatternReviewMode');
check(/usePageMemory\('think-tab', 'patterns'\)/.test(pageSrc), '页面：默认 tab 是 patterns');
check(/value="patterns"/.test(pageSrc), '页面：有 patterns TabsTrigger/TabsContent');
check(/<TabsContent value="patterns"[\s\S]{0,200}<PatternReviewMode/.test(pageSrc), '页面：patterns 面板挂载组件');
```

Run: `node scripts/verify-think-patterns.mjs`
Expected: FAIL，页面尚未接线。

- [ ] **Step 2: 修改页面**

- 顶部 import：`import { PatternReviewMode } from './PatternReviewMode';`
- `usePageMemory('think-tab', 'detector')` → `usePageMemory('think-tab', 'patterns')`。
- `TabsList` 第一位加：

```tsx
<TabsTrigger
  value="patterns"
  className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-ink-teal data-[state=active]:shadow-sm"
>
  <Repeat className="size-4 mr-2" />
  模式复习
</TabsTrigger>
```

- `TabsContent` 第一位加：

```tsx
<TabsContent value="patterns" className="space-y-6 mt-6">
  <PatternReviewMode />
</TabsContent>
```

- `Repeat` 从 `lucide-react` 引入；现有四个 tab 的代码、默认逻辑、AI/TTS/收藏不改。

- [ ] **Step 3: 更新模块文档**

`docs/modules/think-in-english.md`：

- 标题下改为“五个 tab”。
- 功能表加一行：「模式复习 | 8 个模式：对比 → 识别 → 迁移 → SM-2 复习」；实现后用 `grep -n 'value="patterns"' src/pages/ThinkInEnglishPage/ThinkInEnglishPage.tsx` 取 TabsTrigger/TabsContent 真实行号回填。
- 加一节「模式复习闭环」：数据文件、store 键、SM-2 口径、每日 10、AI 判定 + 自评降级、薄弱报告、无首页入口。
- 注意事项加：新守卫 `verify-think-stream-abort` 之外，模式复习由 `verify-think-patterns` 守；`useSyncDown` 订阅者 14；模式进度不进单词/句子复习 store。

- [ ] **Step 4: 运行守卫、类型检查、页面冒烟**

Run: `node scripts/verify-think-patterns.mjs`
Expected: 0 失败。

Run: `npm run typecheck`
Expected: 退出码 0。

Run: `npm run dev`，打开 `/think`：
- 默认落在「模式复习」；
- 四张旧 tab 仍可切换；
- AI 关闭时：迁移提交走参考表达 + 自评；
- AI 开启时：迁移提交显示 AI 反馈与通过/未通过；
- 失败后回队，刷新后进度/到期时间仍在；
- 快速退出再进入，旧 AI 判定不会写到新模式。

- [ ] **Step 5: Commit（仅用户授权后）**

```bash
git add src/pages/ThinkInEnglishPage/ThinkInEnglishPage.tsx docs/modules/think-in-english.md scripts/verify-think-patterns.mjs
git commit -m "feat(think): add pattern review tab"
```

---

### Task 8: 守卫补全、现有守卫与全量验证

**Files:**
- Modify: `scripts/verify-think-patterns.mjs`
- Modify: `scripts/verify-cloud-sync-hygiene.mjs`
- Modify: `scripts/verify-study-credit.mjs`
- Modify: `scripts/verify-ai-parse.mjs`
- Modify: `docs/modules/verification.md`、`docs/modules/cloud-sync.md`、`AGENTS.md`、`CHANGELOG.md`

**Interfaces:**
- Consumes: 前 7 个任务的全部接口。
- Produces: 全量守卫通过、文档与基线同步。

- [ ] **Step 1: 补 10 条变异**

在 `verify-think-patterns.mjs` 末尾加：

```js
const pureSrc = readFileSync(join(ROOT, 'src/lib/think-patterns.ts'), 'utf8');
const aiSrc = readFileSync(join(ROOT, 'src/lib/think-pattern-ai.ts'), 'utf8');
const hookText = readFileSync(join(ROOT, 'src/lib/use-think-patterns.ts'), 'utf8');
const modeText = readFileSync(join(ROOT, 'src/pages/ThinkInEnglishPage/PatternReviewMode.tsx'), 'utf8');

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
  const { hits, out } = replaceOnce(pureSrc, before, after);
  check(hits === 1, `${label}：变异串恰好命中一次`, `hits=${hits}`);
  if (hits !== 1) return;
  const m = await loadMutant(out);
  check(expectFn(m), `${label}：变异后行为必须变红`);
};

// M1：每日 10 上限（用 12 个合成模式，避免受真实 8 个模式限制）
const synthetic = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}` }));
const manyProgress = Object.fromEntries(synthetic.map((p) => [
  p.id,
  p(p.id, { firstReviewedOn: '2026-10-22', nextReview: 0 }),
]));
await runPureMutation(
  'M1 每日 10 上限',
  'slice(0, maxPatterns)',
  'slice(0, 999)',
  (m) => m.buildReviewQueue({ patterns: synthetic, progress: manyProgress, now, today, maxPatterns: 10, maxNewPerDay: 0 }).length > 10,
);

// M2：失败不回队
await runPureMutation(
  'M2 失败不回队',
  'queue: [...queue, patternId]',
  'queue',
  (m) => m.pushRetry(['a'], 'a', {}, 2).queue.length === 1,
);

// M3：每天 2 个新模式上限
await runPureMutation(
  'M3 新模式上限',
  'slice(0, newBudget)',
  'slice(0, 99)',
  (m) => m.buildReviewQueue({ patterns, progress: {}, now, today, maxPatterns: 10, maxNewPerDay: 2 }).length > 2,
);

// M4：失败不重置 repetitions
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

// M5：mastered 不看 AI 通过次数
await runPureMutation(
  'M5 mastered 不看 AI 通过',
  'aiTransferPasses >= 2',
  'aiTransferPasses >= 0',
  (m) => m.applyPatternResult(
    p('subject-first', { repetitions: 3, interval: 10, status: 'reviewing', firstReviewedOn: '2026-10-22' }),
    { patternId: 'subject-first', recognitionCorrect: true, transferPassed: true, source: 'self', answer: 'x', feedback: 'x', today },
    now,
  ).status === 'mastered',
);

// M6：去掉 useSyncDown（静态）
{
  const hasSync = (src) => /useSyncDown\(/.test(src);
  check(hasSync(hookText), 'M6 基线：hook 有 useSyncDown');
  const m6 = replaceOnce(hookText, 'useSyncDown(', 'noop(');
  check(m6.hits === 1 && !hasSync(m6.out), 'M6 去掉 useSyncDown：重读接线必须消失');
}

// M7：去掉 creditOnce（静态）
{
  const hasCredit = (src) => /creditOnce\('think'/.test(src);
  check(hasCredit(modeText), 'M7 基线：迁移提交走 creditOnce');
  const m7 = replaceOnce(modeText, "creditOnce('think'", "noop('think'");
  check(m7.hits === 1 && !hasCredit(m7.out), 'M7 去掉 creditOnce：计时接线必须消失');
}

// M8：坏形状不再判 null（AI 校验）
{
  const { hits, out } = replaceOnce(aiSrc, "if (typeof v.pass !== 'boolean') return null;", 'if (false) return null;');
  check(hits === 1, 'M8：校验变异串恰好命中一次', `hits=${hits}`);
  if (hits === 1) {
    const m8 = await loadMutant(out);
    const bad = m8.validatePatternJudgeResult({ pass: 'yes', feedback: 'x' });
    check(bad !== null, 'M8 坏 pass 不再返回 null：必须被校验挡住');
  }
}

// M9：薄弱排序丢掉 lapses 优先
await runPureMutation(
  'M9 薄弱排序丢 lapses',
  'b.progress.lapses - a.progress.lapses ||',
  '0 ||',
  (m) => m.getWeakPatterns(patterns, {
    'subject-first': p('subject-first', { lapses: 3, transferAttempts: 4, transferPasses: 1 }),
    'verb-driven': p('verb-driven', { lapses: 1, transferAttempts: 2, transferPasses: 0 }),
  }, 3)[0]?.pattern.id === 'verb-driven',
);

// M10：识别题轮换不再按次数取模
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
```

Step 1 结束时必须保证：10 条变异各自的 `check` 都命中；如果某条第一次全绿，说明断言没管事，必须改断言而不是删变异。

- [ ] **Step 2: 更新现有守卫**

- `verify-cloud-sync-hygiene.mjs`：订阅者清单 13 → 14，加入 `use-think-patterns.ts`；更新输出文案。
- `verify-study-credit.mjs`：新增模式迁移计时点，断言 `creditOnce('think', creditKey('pattern', ...))` 在 AI 调用之前；同一答案只放行一次。
- `verify-ai-parse.mjs`：确认新 `extractJson` 点有 `.trim()` 判空；解析点计数按实际更新（当前 27 → 28）。
- `verify-imports-tracked.mjs`：新增文件都被 git 跟踪（提交后跑；未提交时它只检查已跟踪 import）。

- [ ] **Step 3: 更新文档与基线**

- `docs/modules/verification.md`：新增 `verify-think-patterns.mjs` 行（数据/纯函数/AI/UI/变异）；跑 `node scripts/verify-think-patterns.mjs`，把输出里的 `N 通过` 填进表；更新 `verify-cloud-sync-hygiene` 订阅者 14、`verify-study-credit` 新站点、`verify-ai-parse` 解析点。
- `docs/modules/cloud-sync.md`：订阅者 13 → 14，列出 `use-think-patterns.ts`。
- `AGENTS.md`：验证命令表加 `node scripts/verify-think-patterns.mjs`，基线合计与模块索引的守卫数同步。**改前重读当前文件**：AGENTS 可能正被其他会话修改，只加本守卫行并按当前总断言数加上实际新增数。
- `CHANGELOG.md`：补一条“/think 模式复习闭环”。

- [ ] **Step 4: 全量验证**

Run: `node scripts/verify-think-patterns.mjs`
Expected: 0 失败。

Run: `node scripts/verify-cloud-sync-hygiene.mjs`
Expected: 0 失败。

Run: `node scripts/verify-study-credit.mjs`
Expected: 0 失败。

Run: `npm run typecheck`
Expected: 退出码 0。

Run: `npm run verify:all`
Expected: 全部通过（`verify-wordbank-split` 按约定跳过）。

- [ ] **Step 5: 最终页面冒烟**

Run: `npm run dev`，打开 `/think`：
- 默认「模式复习」；
- 完成一轮（含至少一次失败回队）；
- AI 关闭时走自评，AI 开启时走 rubric；
- 刷新后进度、到期时间、薄弱报告都在；
- 移动端 393px 无横向溢出。

- [ ] **Step 6: Commit（仅用户授权后）**

```bash
git add scripts/verify-think-patterns.mjs scripts/verify-cloud-sync-hygiene.mjs scripts/verify-study-credit.mjs scripts/verify-ai-parse.mjs docs/modules/verification.md docs/modules/cloud-sync.md AGENTS.md CHANGELOG.md
git commit -m "test(think): guard pattern review loop"
```

---

## Appendix A: `src/data/think-patterns.ts` 完整内容

```ts
export interface IThinkPatternChoice {
  id: string;
  prompt: string;
  options: [string, string, string];
  answer: 0 | 1 | 2;
  explanation: string;
}

export interface IThinkPatternTransfer {
  id: string;
  situation: string;
  rubricFocus: string;
  modelAnswer: string;
}

export interface IThinkPattern {
  id: string;
  name: string;
  oneLiner: string;
  contrast: {
    chineseThinking: string;
    native: string;
    note: string;
  };
  cues: string[];
  recognition: IThinkPatternChoice[];
  transfer: IThinkPatternTransfer[];
}

export const THINK_PATTERNS: IThinkPattern[] = [
  {
    id: 'subject-first',
    name: '让主语站出来',
    oneLiner: '中文先给话题，英文先给主语和动作。',
    contrast: {
      chineseThinking: '这个电影我看过。',
      native: "I've seen this movie.",
      note: '中文把“这个电影”当话题放句首；英文先立主语 I，再给动作。',
    },
    cues: ['先找“谁做了动作”', '句首尽量给出主语+谓语', '中文的“这个/那个+名词”常是话题，不是主语'],
    recognition: [
      {
        id: 'subject-first-r1',
        prompt: '你想说“这个问题我们明天再讨论”。',
        options: [
          "This problem we'll discuss tomorrow.",
          "We'll discuss this problem tomorrow.",
          'Tomorrow this problem we discuss.',
        ],
        answer: 1,
        explanation: '英文先给主语 we 和动作 discuss；另外两句是中文话题句的直译。',
      },
      {
        id: 'subject-first-r2',
        prompt: '你想说“那家餐厅我去年去过一次”。',
        options: [
          'That restaurant I went to once last year.',
          'I went to that restaurant once last year.',
          'Last year that restaurant I visited once.',
        ],
        answer: 1,
        explanation: '先立主语 I，再把地点和时间放后面，句子才不头重脚轻。',
      },
      {
        id: 'subject-first-r3',
        prompt: '你想说“这种书孩子们很喜欢”。',
        options: [
          'This kind of book children like very much.',
          'Children really like this kind of book.',
          'This kind of book is very liked by children.',
        ],
        answer: 1,
        explanation: 'Children 是动作的发出者；把它放句首，比被动句更自然。',
      },
    ],
    transfer: [
      {
        id: 'subject-first-t1',
        situation: '你想告诉同事“这份报告我周五之前能交”。',
        rubricFocus: '是否用 I 作主语、把 report 放宾语，而不是“This report I can...”',
        modelAnswer: 'I can hand in the report by Friday.',
      },
      {
        id: 'subject-first-t2',
        situation: '你想说“那部剧我看了三遍还是觉得好看”。',
        rubricFocus: '是否先给主语 I / 动作，而不是“That show I...”',
        modelAnswer: "I've watched that show three times and still love it.",
      },
    ],
  },
  {
    id: 'verb-driven',
    name: '把动作还给动词',
    oneLiner: '少用“进行/处理/做…的…”这类名词化，直接用动词。',
    contrast: {
      chineseThinking: '对这个问题进行处理。',
      native: 'Handle the issue.',
      note: '中文常用“对…进行处理”把动作名词化；英文更常让动词直接承担动作。',
    },
    cues: ['看到“进行/作出/加以”先找真正的动词', '少用“名词化 + make/conduct”', '一个动词能说清的，不用三个词'],
    recognition: [
      {
        id: 'verb-driven-r1',
        prompt: '你想说“我们需要对数据进行一次分析”。',
        options: [
          'We need to conduct an analysis of the data.',
          'We need to analyze the data.',
          'We need to make an analysis on the data.',
        ],
        answer: 1,
        explanation: 'analyze 本身就是动作；conduct/make an analysis 是名词化绕路。',
      },
      {
        id: 'verb-driven-r2',
        prompt: '你想说“他对这个计划提出了反对”。',
        options: [
          'He raised an objection to the plan.',
          'He objected to the plan.',
          'He made an objection against the plan.',
        ],
        answer: 1,
        explanation: 'object 直接作动词，比 raise/make an objection 更干净。',
      },
      {
        id: 'verb-driven-r3',
        prompt: '你想说“我们正在对系统进行优化”。',
        options: [
          'We are carrying out an optimization of the system.',
          'We are optimizing the system.',
          'We are making an optimization on the system.',
        ],
        answer: 1,
        explanation: 'optimize 是动词；carry out/make an optimization 是典型的名词化。',
      },
    ],
    transfer: [
      {
        id: 'verb-driven-t1',
        situation: '你负责的项目需要“对用户反馈进行整理”。',
        rubricFocus: '是否用 sort through / organize 这类动词，而不是“do an organization of...”',
        modelAnswer: 'I need to sort through the user feedback.',
      },
      {
        id: 'verb-driven-t2',
        situation: '你想说“我们明天对方案做一次讨论”。',
        rubricFocus: '是否用 talk through / discuss 这类动词，而不是“make a discussion”',
        modelAnswer: "We'll talk through the plan tomorrow.",
      },
    ],
  },
  {
    id: 'end-focus',
    name: '把重点放到句尾',
    oneLiner: '英文倾向把新信息、长成分放在句尾，避免头重脚轻。',
    contrast: {
      chineseThinking: '一个在银行工作、会说法语、还写过小说的朋友告诉我这个消息。',
      native: 'I heard the news from a friend who works at a bank and has written a novel.',
      note: '中文把长修饰全堆在“朋友”前面；英文常把长描述放到句尾。',
    },
    cues: ['主语太长就换成 I heard... from...', '新信息/长从句放句尾', '避免“一个…的…的…朋友”式头重脚轻'],
    recognition: [
      {
        id: 'end-focus-r1',
        prompt: '你想说“一个在银行工作、会说法语、还写过小说的朋友告诉我这个消息”。',
        options: [
          'A friend who works at a bank, speaks French, and has written a novel told me the news.',
          'I heard the news from a friend who works at a bank, speaks French, and has written a novel.',
          'The news was told to me by a friend who works at a bank, speaks French, and has written a novel.',
        ],
        answer: 1,
        explanation: 'B 避免超长主语，把长描述放句尾；A 头重脚轻，C 被动且绕。',
      },
      {
        id: 'end-focus-r2',
        prompt: '你想说“最让我担心的是售后”。',
        options: [
          'The after-sales service is what worries me most.',
          'What worries me most is the after-sales service.',
          'I worry most about the after-sales service.',
        ],
        answer: 1,
        explanation: 'B 把新信息 after-sales service 留在句尾；A 把它提前了。',
      },
      {
        id: 'end-focus-r3',
        prompt: '你想说“他昨天在会上提了一个我们都没想过的方案”。',
        options: [
          'He proposed a plan that none of us had thought of at the meeting yesterday.',
          'He proposed at the meeting yesterday a plan that none of us had thought of.',
          'At the meeting yesterday, he proposed a plan that none of us had thought of.',
        ],
        answer: 2,
        explanation: 'C 把时间/地点前置，把长的新信息留在句尾；B 的语序很别扭。',
      },
    ],
    transfer: [
      {
        id: 'end-focus-t1',
        situation: '你想说“一个从硅谷回来、在我们公司工作了十年的工程师提出了这个想法”。',
        rubricFocus: '是否避免超长主语，把长描述放到句尾',
        modelAnswer: 'The idea came from an engineer who spent ten years at our company after coming back from Silicon Valley.',
      },
      {
        id: 'end-focus-t2',
        situation: '你想说“最让我生气的是他连一句解释都没给”。',
        rubricFocus: '是否用 what/what 从句或 it 结构把焦点留在句尾',
        modelAnswer: "What made me angry was that he didn't even offer an explanation.",
      },
    ],
  },
  {
    id: 'soften-disagreement',
    name: '先铺缓冲再否定',
    oneLiner: '先承认/缓冲，再给不同意见。',
    contrast: {
      chineseThinking: '我不太喜欢这个主意。',
      native: "To be honest, I'm not a huge fan of this idea.",
      note: '英文常先用 to be honest / I see your point 缓冲，再用 not a huge fan 软否定。',
    },
    cues: ['先给缓冲语', '否定用 not a huge fan / not sure', '给出原因或替代方案'],
    recognition: [
      {
        id: 'soften-r1',
        prompt: '同事提出一个你觉得不太可行的方案。',
        options: [
          "That won't work.",
          "I'm not sure that would work — can we talk through the risks?",
          'Your plan is wrong.',
        ],
        answer: 1,
        explanation: 'B 先软化“not sure”，再给讨论出口；A/C 太直接。',
      },
      {
        id: 'soften-r2',
        prompt: '朋友问你喜不喜欢他新买的衣服，你不想直接说难看。',
        options: [
          "I don't like it.",
          "It's not really my style, but it looks good on you.",
          "That's ugly.",
        ],
        answer: 1,
        explanation: 'B 用 not really my style 软否定，同时保留对朋友的正面反馈。',
      },
      {
        id: 'soften-r3',
        prompt: '你想拒绝一个不合理的请求。',
        options: [
          'No.',
          "I'd love to help, but I'm swamped right now — can we find another time?",
          "You're asking too much.",
        ],
        answer: 1,
        explanation: 'B 先表达愿意，再给原因和替代时间；这是英语拒绝的三步法。',
      },
    ],
    transfer: [
      {
        id: 'soften-t1',
        situation: '同事的方案你觉得风险很大，但不想直接否定。',
        rubricFocus: '是否有缓冲 + 软否定 + 讨论出口',
        modelAnswer: "I see what you're going for, but I'm a bit worried about the risks — can we talk through them?",
      },
      {
        id: 'soften-t2',
        situation: '朋友约你周末帮忙搬家，你没空。',
        rubricFocus: '是否先表达愿意，再说明没空并给替代方案',
        modelAnswer: "I'd love to help, but I've already got plans this weekend — can I take a rain check?",
      },
    ],
  },
  {
    id: 'be-concrete',
    name: '少说大词，多说具体',
    oneLiner: '用具体动作、数字和结果替代空泛形容词。',
    contrast: {
      chineseThinking: '这个方案很好，能带来很多好处。',
      native: 'This plan cuts our turnaround time in half.',
      note: 'good / many benefits 信息量很低；具体到时间和结果，评价才可信。',
    },
    cues: ['把“好/很多/有效”换成数字或动作', '少堆形容词', '用一个细节证明你的评价'],
    recognition: [
      {
        id: 'concrete-r1',
        prompt: '你想夸一个工具好用。',
        options: [
          'This tool is very useful and has many advantages.',
          'This tool cuts my editing time from two hours to twenty minutes.',
          'This tool is good and convenient.',
        ],
        answer: 1,
        explanation: 'B 用具体时间对比证明“好用”；A/C 只有空泛评价。',
      },
      {
        id: 'concrete-r2',
        prompt: '你想说同事帮了很大忙。',
        options: [
          'You helped me a lot.',
          'You stayed late to fix the slides, which saved my presentation.',
          'You are very helpful.',
        ],
        answer: 1,
        explanation: 'B 用具体动作和结果说明帮助；A/C 是空泛感谢。',
      },
      {
        id: 'concrete-r3',
        prompt: '你想说这家店服务好。',
        options: [
          'The service here is very good.',
          'The waiter remembered our order and checked on us without hovering.',
          'This store has excellent service quality.',
        ],
        answer: 1,
        explanation: 'B 用两个具体行为证明服务好；A/C 是抽象评价。',
      },
    ],
    transfer: [
      {
        id: 'concrete-t1',
        situation: '你想说“这个新流程让沟通快了很多”。',
        rubricFocus: '是否给出具体时间/步骤对比，而不是只说 faster',
        modelAnswer: 'The new process cuts our back-and-forth from a week to a day.',
      },
      {
        id: 'concrete-t2',
        situation: '你想说“这本书对我影响很大”。',
        rubricFocus: '是否用具体改变/行为说明影响，而不是只说 very influential',
        modelAnswer: 'This book changed how I handle disagreements — I now ask questions before arguing.',
      },
    ],
  },
  {
    id: 'make-logic-explicit',
    name: '把逻辑说清楚',
    oneLiner: '中文靠意合，英文常把因果、转折、条件说出来。',
    contrast: {
      chineseThinking: '天气不好，我们没去。',
      native: "We didn't go because the weather was terrible.",
      note: '中文两个短句靠语序暗示因果；英文用 because 把关系说清楚。',
    },
    cues: ['先给主句，再补 because/so/although/if', '不要把两个短句只并列', '关系词要具体：因果、转折、条件不要混'],
    recognition: [
      {
        id: 'logic-r1',
        prompt: '你想说“预算不够，我们砍掉了两个功能”。',
        options: [
          "The budget wasn't enough. We cut two features.",
          "We cut two features because the budget wasn't enough.",
          "We cut two features. The budget wasn't enough.",
        ],
        answer: 1,
        explanation: 'B 用 because 明确因果；A/C 只是并列，关系靠猜。',
      },
      {
        id: 'logic-r2',
        prompt: '你想说“他很累，但还是把报告写完了”。',
        options: [
          'He was tired. He finished the report.',
          'He finished the report even though he was exhausted.',
          'He was tired, and he finished the report.',
        ],
        answer: 1,
        explanation: 'B 用 even though 明确转折；C 的 and 没有转折意味。',
      },
      {
        id: 'logic-r3',
        prompt: '你想说“你早点告诉我，我就能改”。',
        options: [
          'You tell me earlier. I can change it.',
          "If you'd told me earlier, I could have changed it.",
          "You didn't tell me earlier, and I couldn't change it.",
        ],
        answer: 1,
        explanation: 'B 用虚拟条件句把假设关系说清楚；A/C 的时态和关系都不准。',
      },
    ],
    transfer: [
      {
        id: 'logic-t1',
        situation: '你想说“路上堵车，所以我迟到了”。',
        rubricFocus: '是否用 because/so 明确因果，而不是两个短句并列',
        modelAnswer: "I'm late because traffic was a nightmare.",
      },
      {
        id: 'logic-t2',
        situation: '你想说“这个功能很简单，但用户就是找不到”。',
        rubricFocus: '是否用 but/although 明确转折，并补出原因',
        modelAnswer: "The feature is simple, but users still can't find it — probably because it's buried in the settings menu.",
      },
    ],
  },
  {
    id: 'polite-request',
    name: '请求要有台阶',
    oneLiner: '直接命令改成带缓冲的请求。',
    contrast: {
      chineseThinking: '把门关上。',
      native: 'Could you close the door?',
      note: '英文请求常用 could/would you、I was wondering if，给对方留拒绝空间。',
    },
    cues: ['用 could/would you 开头', '加 just / maybe / when you get a chance', '请求越长越礼貌，但别绕'],
    recognition: [
      {
        id: 'polite-r1',
        prompt: '你想让同事发你一份文件。',
        options: [
          'Send me the file.',
          'Could you send me the file when you get a chance?',
          'You need to send me the file.',
        ],
        answer: 1,
        explanation: 'B 用 could you + when you get a chance，给对方台阶。',
      },
      {
        id: 'polite-r2',
        prompt: '你想让朋友把音乐关小。',
        options: [
          'Turn the music down.',
          'Would you mind turning the music down a bit?',
          'The music is too loud.',
        ],
        answer: 1,
        explanation: 'B 用 would you mind + a bit，礼貌且明确。',
      },
      {
        id: 'polite-r3',
        prompt: '你想请老师晚一点截止。',
        options: [
          'Give me more time.',
          'I was wondering if I could have a short extension on the deadline.',
          'You should give me more time.',
        ],
        answer: 1,
        explanation: 'B 用 I was wondering if 缓冲，适合对老师/上级。',
      },
    ],
    transfer: [
      {
        id: 'polite-t1',
        situation: '你想请邻居把车挪一下，方便你出去。',
        rubricFocus: '是否用 could/would + 缓冲 + 原因',
        modelAnswer: "Excuse me, would you mind moving your car a little? I'm blocked in.",
      },
      {
        id: 'polite-t2',
        situation: '你想请同事帮你看看一段英文。',
        rubricFocus: '是否用 could + when you have a minute + 感谢',
        modelAnswer: "Could you take a quick look at this paragraph when you have a minute? I'd really appreciate it.",
      },
    ],
  },
  {
    id: 'fill-references',
    name: '该说的代词别省',
    oneLiner: '中文常省主语/宾语，英文要补出明确的指代。',
    contrast: {
      chineseThinking: '找到了吗？',
      native: 'Did you find it?',
      note: '中文可以省略“你”和“它”；英文要把主语和宾语补出来。',
    },
    cues: ['先问“谁对谁做了什么”', '补出 I/you/it/them/this/that', '一句里不要连续省略指代'],
    recognition: [
      {
        id: 'ref-r1',
        prompt: '你让朋友去找那把钥匙，想问结果。',
        options: [
          'Did you find it?',
          'Did you find them?',
          'Did you find us?',
        ],
        answer: 0,
        explanation: '钥匙是单数，用 it；them 指复数，us 指人。',
      },
      {
        id: 'ref-r2',
        prompt: '你想说“我跟我妈说了，她同意了”。',
        options: [
          'I told my mom, and she agreed.',
          'I told my mom, and he agreed.',
          'I told my mom, and they agreed.',
        ],
        answer: 0,
        explanation: '妈妈是 she；he/they 都把指代弄错了。',
      },
      {
        id: 'ref-r3',
        prompt: '你想说“我看完了，但没看懂”。',
        options: [
          "I finished reading it, but I didn't understand it.",
          "I finished reading, but I didn't understand it.",
          "I finished reading it, but I didn't understand them.",
        ],
        answer: 0,
        explanation: 'A 把“看”和“懂”的对象都用 it 补全；B 少了宾语，C 代词单复数错。',
      },
    ],
    transfer: [
      {
        id: 'ref-t1',
        situation: '朋友问你有没有把钥匙还给房东。',
        rubricFocus: '是否补出 you / the keys / the landlord 的指代',
        modelAnswer: 'Did you return the keys to the landlord?',
      },
      {
        id: 'ref-t2',
        situation: '你想说“我看完了，但没看懂”。',
        rubricFocus: '是否补出 I / it，并保持单复数一致',
        modelAnswer: "I finished reading it, but I didn't understand it.",
      },
    ],
  },
];
```

## Appendix B: 验收清单

- [ ] `node scripts/verify-think-patterns.mjs` 0 失败。
- [ ] `npm run typecheck` 0 错误。
- [ ] `npm run verify:all` 全绿（`verify-wordbank-split` 按约定跳过）。
- [ ] `/think` 默认落在「模式复习」。
- [ ] 完成一轮：对比 → 识别 → 迁移 → 反馈。
- [ ] 失败回队最多 2 次；刷新后进度/到期不丢。
- [ ] AI 关闭时自评可用；AI 开启时 rubric 返回结构化判定。
- [ ] 薄弱报告显示真实 lapses/失败率/上次反馈。
- [ ] 393px 无横向溢出。
