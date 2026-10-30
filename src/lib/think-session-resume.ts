/**
 * 三稿会话的本地断点：队列、阶段、当前草稿、已出的反馈都存一份。
 *
 * 故意走裸 localStorage 而不是 safeStorage：
 *  - 这是「这台设备上没写完的一次练习」，不是学习进度，**不参与云同步**；
 *  - 前缀随登录态变化时丢掉也无所谓，丢了最多从头练这一轮。
 *
 * 读盘一律过 sanitize：会话快照是 UI 状态，坏形状（缺 stage / 队列为空 / index 越界 /
 * 两天的旧快照）必须整份丢掉，不能让一个坏字段把练习页打崩。
 */
import type { IThinkPatternTransfer } from '@/data/think-patterns';
import type {
  PatternConfidence,
  PatternSessionResult,
  PatternSessionState,
} from '@/lib/think-patterns';

export const THINK_SESSION_RESUME_KEY = '__nativethink_think_session_resume';
export const RESUME_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

export const PATTERN_STAGES = ['contrast', 'recognition', 'writing', 'feedback'] as const;
export type PatternStage = (typeof PATTERN_STAGES)[number];
export type PatternDraftRound = 0 | 1 | 2;

export interface PatternDraftSnapshot {
  pass: boolean;
  feedback: string;
  evidence?: string;
  source: 'ai' | 'self';
  answer: string;
  transfer: IThinkPatternTransfer;
}

export interface PatternResumeSnapshot {
  v: 1;
  patternId: string;
  session: PatternSessionState;
  delayed: boolean;
  stage: PatternStage;
  round: PatternDraftRound;
  selected: number | null;
  answer: string;
  confidence: PatternConfidence | null;
  results: Array<PatternDraftSnapshot | null>;
  rewriteAttempts: number;
  recognitionIndex: number;
  transferIndex: number;
  updatedAt: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isText = (value: unknown): value is string => typeof value === 'string';
const isFiniteInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

function sanitizeTransfer(raw: unknown): IThinkPatternTransfer | null {
  if (!isRecord(raw)) return null;
  if (!isText(raw.id) || !raw.id) return null;
  if (!isText(raw.situation) || !raw.situation) return null;
  if (!isText(raw.rubricFocus) || !raw.rubricFocus) return null;
  if (!isText(raw.why) || !raw.why) return null;
  if (!isText(raw.modelAnswer) || !raw.modelAnswer) return null;
  if (!Array.isArray(raw.thinkingSteps) || raw.thinkingSteps.length !== 3 ||
    !raw.thinkingSteps.every((step) => isText(step) && step.length > 0)) return null;
  return {
    id: raw.id,
    ...(raw.kind === 'scenario' || raw.kind === 'wording' ? { kind: raw.kind } : {}),
    situation: raw.situation,
    rubricFocus: raw.rubricFocus,
    thinkingSteps: raw.thinkingSteps as [string, string, string],
    why: raw.why,
    modelAnswer: raw.modelAnswer,
  };
}

function sanitizeDraft(raw: unknown): PatternDraftSnapshot | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.pass !== 'boolean') return null;
  if (!isText(raw.feedback) || !raw.feedback.trim()) return null;
  if (raw.source !== 'ai' && raw.source !== 'self') return null;
  if (!isText(raw.answer)) return null;
  const transfer = sanitizeTransfer(raw.transfer);
  if (!transfer) return null;
  if (raw.evidence !== undefined && !isText(raw.evidence)) return null;
  return {
    pass: raw.pass,
    feedback: raw.feedback,
    ...(raw.evidence ? { evidence: raw.evidence as string } : {}),
    source: raw.source,
    answer: raw.answer.slice(0, 5000),
    transfer,
  };
}

function sanitizeSession(raw: unknown): PatternSessionState | null {
  if (!isRecord(raw)) return null;
  if (!Array.isArray(raw.queue) || raw.queue.length === 0 || raw.queue.length > 20) return null;
  const queue = raw.queue.filter((id): id is string => isText(id) && id.length > 0);
  if (queue.length !== raw.queue.length) return null;
  if (!isFiniteInt(raw.index, 0, queue.length - 1)) return null;
  if (!isRecord(raw.retries)) return null;
  const retries: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw.retries)) {
    if (!isFiniteInt(value, 0, 10)) return null;
    if (!queue.includes(key)) return null;
    retries[key] = value;
  }
  if (!isRecord(raw.results)) return null;
  const results: Record<string, PatternSessionResult> = {};
  for (const [key, value] of Object.entries(raw.results)) {
    if (value !== 'pass' && value !== 'fail') return null;
    if (!queue.includes(key)) return null;
    results[key] = value;
  }
  return { queue, index: raw.index, retries, results };
}

export function sanitizePatternResume(raw: unknown, now = Date.now()): PatternResumeSnapshot | null {
  if (!isRecord(raw) || raw.v !== 1) return null;
  if (!isText(raw.patternId) || !raw.patternId) return null;
  if (!isFiniteInt(raw.updatedAt, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (now - raw.updatedAt > RESUME_MAX_AGE_MS || raw.updatedAt - now > 60_000) return null;
  const session = sanitizeSession(raw.session);
  if (!session) return null;
  if (session.queue[session.index] !== raw.patternId) return null;
  if (typeof raw.delayed !== 'boolean') return null;
  if (!PATTERN_STAGES.includes(raw.stage as PatternStage)) return null;
  if (!isFiniteInt(raw.round, 0, 2)) return null;
  if (raw.selected !== null && !isFiniteInt(raw.selected, 0, 2)) return null;
  if (!isText(raw.answer)) return null;
  if (raw.confidence !== null && raw.confidence !== 1 && raw.confidence !== 2 && raw.confidence !== 3) {
    return null;
  }
  if (!Array.isArray(raw.results) || raw.results.length > 3) return null;
  const results = raw.results.map((entry) => (entry === null ? null : sanitizeDraft(entry)));
  const round = raw.round as PatternDraftRound;
  if (raw.stage === 'feedback' && !results[round]) return null;
  if (!isFiniteInt(raw.rewriteAttempts, 0, 2)) return null;
  if (!isFiniteInt(raw.recognitionIndex, 0, 10_000)) return null;
  if (!isFiniteInt(raw.transferIndex, 0, 10_000)) return null;
  return {
    v: 1,
    patternId: raw.patternId,
    session,
    delayed: raw.delayed,
    stage: raw.stage as PatternStage,
    round: raw.round as PatternDraftRound,
    selected: raw.selected as number | null,
    answer: raw.answer.slice(0, 5000),
    confidence: raw.confidence as PatternConfidence | null,
    results,
    rewriteAttempts: raw.rewriteAttempts,
    recognitionIndex: raw.recognitionIndex,
    transferIndex: raw.transferIndex,
    updatedAt: raw.updatedAt,
  };
}

/** 队列里的模式 id 必须都还在当前模式库里（内容库删过模式时旧快照要作废）。 */
export function isResumeUsable(
  snapshot: PatternResumeSnapshot,
  knownPatternIds: ReadonlySet<string>,
): boolean {
  return knownPatternIds.has(snapshot.patternId) &&
    snapshot.session.queue.every((id) => knownPatternIds.has(id));
}

/** 概览入口的一句话：延迟探测 + 第 x/5 步 + 阶段名。 */
export function resumeStepLabel(snapshot: PatternResumeSnapshot): string {
  const stageIndex = snapshot.stage === 'contrast'
    ? 0
    : snapshot.stage === 'recognition'
      ? 1
      : snapshot.round === 0
        ? 2
        : snapshot.round === 1
          ? 3
          : 4;
  const stageName = snapshot.stage === 'contrast'
    ? '对比'
    : snapshot.stage === 'recognition'
      ? '识别'
      : snapshot.stage === 'writing'
        ? ['首稿', '改写', '新场景'][snapshot.round]
        : ['首稿反馈', '改写反馈', '最终反馈'][snapshot.round];
  return `${snapshot.delayed ? '延迟探测 · ' : ''}第 ${stageIndex + 1}/5 步 · ${stageName}`;
}

const storage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** 写失败返回 false 并提示（去抖）：断点虽然是临时状态，但丢了意味着重做。 */
export function savePatternResume(snapshot: PatternResumeSnapshot): boolean {
  const target = storage();
  if (!target) return false;
  try {
    target.setItem(THINK_SESSION_RESUME_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    import('./capped-cache').then(({ warnStorageFull }) => warnStorageFull());
    return false;
  }
}

export function loadPatternResume(now = Date.now()): PatternResumeSnapshot | null {
  const target = storage();
  if (!target) return null;
  try {
    const raw = target.getItem(THINK_SESSION_RESUME_KEY);
    if (!raw) return null;
    return sanitizePatternResume(JSON.parse(raw), now);
  } catch {
    return null;
  }
}

export function clearPatternResume(): void {
  const target = storage();
  if (!target) return;
  try {
    target.removeItem(THINK_SESSION_RESUME_KEY);
  } catch {
    // 清不掉旧快照不影响新会话：新会话写盘时会覆盖同一键
  }
}
