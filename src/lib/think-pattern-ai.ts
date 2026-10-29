/**
 * /think 模式复习的 AI 判定 helper。
 *
 * 只做两件事：拼「判断这次迁移有没有用上目标思维模式」的 prompt、校验并归一化 AI 的返回。
 * 刻意不引任何运行时依赖（ChatMessage / IThinkPattern / IThinkPatternTransfer 都是 `import type`），
 * 这样守卫可以用 ts.transpileModule 真转译后直接 import 跑。
 *
 * 解析入口在组件里：先 `if (!raw.trim()) return null;`（空串 = AI 服务不可用），
 * 再 `extractJson(raw)`，最后 `validatePatternJudgeResult(...)` —— 本模块不碰 JSON 解析。
 */
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
- Ignore capitalization: a lowercase "i" at the start still counts as the pronoun I.
- Judge the thinking pattern, not exact vocabulary or the reference wording. Different verbs/objects that fit the scenario are fine (submit vs hand in, record vs report). The native reference is an example, not the only acceptable answer.
- If the target structural cue is clearly present, pass even if the wording differs from the reference.
- Do not rewrite the whole sentence. Give one short Chinese feedback sentence and one evidence phrase.
- Return ONLY JSON with exactly these fields:
{"pass":true|false,"feedback":"中文 1-2 句","evidence":"用户句中的证据短语；没有就空字符串"}`,
    },
    { role: 'user', content: `My English answer: ${answer}` },
  ];
}

export interface RealTaskJudgeResult {
  patternsUsed: string[];
  patternsMissing: string[];
  feedback: string;
  strengths: string[];
  issues: string[];
}

export interface TaskPromptShape {
  title: string;
  prompt: string;
  targetPatternIds: string[];
}

export function buildRealTaskPrompt(
  task: TaskPromptShape,
  answer: string,
  patterns: IThinkPattern[],
): ChatMessage[] {
  const targets = patterns.filter((pattern) => task.targetPatternIds.includes(pattern.id));
  const patternBlock = targets
    .map((pattern) => `- ${pattern.id}｜${pattern.name}：${pattern.oneLiner}；线索：${pattern.cues.join('；')}`)
    .join('\n');
  return [
    {
      role: 'system',
      content: `You are an English writing coach. Analyse a learner's real-world email for target thinking patterns.
Task: ${task.prompt}
Target patterns:
${patternBlock}

Rules:
- Count a pattern only when its structural cue is clearly present, not merely because the idea is mentioned.
- patternsUsed and patternsMissing must use the ids above and must not overlap.
- feedback: 2-3 short Chinese sentences, concrete and actionable.
- strengths and issues: 1-3 short Chinese phrases each; no generic praise.
- Do not rewrite the whole email.
- Return ONLY JSON with exactly these fields:
{"patternsUsed":["id"],"patternsMissing":["id"],"feedback":"中文 2-3 句","strengths":["中文短句"],"issues":["中文短句"]}`,
    },
    { role: 'user', content: `My email:\n${answer}` },
  ];
}

export function validateRealTaskJudgeResult(
  value: unknown,
  allowedPatternIds: readonly string[],
): RealTaskJudgeResult | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.feedback !== 'string' || !v.feedback.trim()) return null;
  const allowed = new Set(allowedPatternIds);
  const toIds = (raw: unknown): string[] => (Array.isArray(raw) ? raw : [])
    .filter((id): id is string => typeof id === 'string' && allowed.has(id))
    .filter((id, index, list) => list.indexOf(id) === index);
  const used = toIds(v.patternsUsed);
  const usedSet = new Set(used);
  const missing = toIds(v.patternsMissing).filter((id) => !usedSet.has(id));
  const toPhrases = (raw: unknown): string[] => (Array.isArray(raw) ? raw : [])
    .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
    .map((text) => text.trim())
    .slice(0, 3);
  return {
    patternsUsed: used,
    patternsMissing: missing,
    feedback: v.feedback.trim(),
    strengths: toPhrases(v.strengths),
    issues: toPhrases(v.issues),
  };
}

export interface GeneratedPracticeTask {
  title: string;
  prompt: string;
  targetPatternIds: string[];
}

/** AI 额外出题：只用于防背诵，不进入掌握判定；仍限定在现有模式库里。 */
export function buildGeneratedPracticePrompt(patterns: IThinkPattern[]): ChatMessage[] {
  const block = patterns
    .map((pattern) => `- ${pattern.id}｜${pattern.name}：${pattern.oneLiner}`)
    .join('\n');
  return [
    {
      role: 'system',
      content: `You design extra English thinking-practice tasks for a Chinese learner.
Available patterns:
${block}

Rules:
- Create ONE realistic workplace or daily-life writing task in Chinese, 120-180 Chinese characters.
- Pick 2-3 target patterns from the list above and use their exact ids.
- The task must require the learner to write 120-180 English words; do not include a model answer.
- Do not reuse the same scenario as a weekly report, a delayed delivery, or a quality complaint.
- Return ONLY JSON with exactly these fields:
{"title":"中文短标题","prompt":"中文任务描述","targetPatternIds":["id"]}`,
    },
    { role: 'user', content: 'Generate one new practice task.' },
  ];
}

export function validateGeneratedPracticeTask(
  value: unknown,
  allowedPatternIds: readonly string[],
): GeneratedPracticeTask | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== 'string' || !v.title.trim()) return null;
  if (typeof v.prompt !== 'string' || !v.prompt.trim()) return null;
  const allowed = new Set(allowedPatternIds);
  const ids = (Array.isArray(v.targetPatternIds) ? v.targetPatternIds : [])
    .filter((id): id is string => typeof id === 'string' && allowed.has(id))
    .filter((id, index, list) => list.indexOf(id) === index)
    .slice(0, 3);
  if (ids.length < 2) return null;
  return {
    title: v.title.trim().slice(0, 60),
    prompt: v.prompt.trim().slice(0, 1200),
    targetPatternIds: ids,
  };
}

export function validatePatternJudgeResult(value: unknown): PatternJudgeResult | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const pass = typeof v.pass === 'boolean'
    ? v.pass
    : v.pass === 'true'
      ? true
      : v.pass === 'false'
        ? false
        : null;
  if (pass === null) return null;
  if (typeof v.feedback !== 'string' || !v.feedback.trim()) return null;
  const evidence = typeof v.evidence === 'string' ? v.evidence.trim() : '';
  return { pass, feedback: v.feedback.trim(), evidence };
}
