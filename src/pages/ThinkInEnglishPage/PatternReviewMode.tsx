/**
 * 模式复习的顶层状态机：概览 ↔ 复习 → 完成页。
 *
 * 本组件只做三件事：
 *  ① 从 useThinkPatterns 取进度/统计/到期队列；
 *  ② 维护**本轮会话**的队列、下标、回队次数与每个模式的结果（不落盘 —— 落盘由 store 的 grade 负责；
 *     编排本身是纯函数，见 `src/lib/think-patterns.ts` 的 createPatternSession / applySessionResult /
 *     advanceSession / sessionCounts）；
 *  ③ 把 PatternOverview 与 PatternReviewSession 接起来。
 *
 * 四条容易改坏的约定：
 *  - 换卡必须用「pattern.id-index」组成的 key 重挂载会话组件（见下方 JSX）：重试卡要从对比阶段
 *    重新开始，否则会带着上一轮的已选项/已提交答案/自评结果。
 *  - `loaded` 为 false 时不渲染统计与模式卡：首屏 progress 还是空的，先渲染会闪一下 0 值。
 *  - 迁移判定先 `creditOnce`（按动作计，AI 失败不撤销这次作答），再请求；没配 Key / 空串 /
 *    坏 JSON / 15 秒超时一律返回 null，交给会话回落自评 —— 不在这里弹「格式异常」。
 *  - 判定请求带 `silent: true`：练习界面不弹全局 AI 错误 toast（useAI / ai-service 已支持）。
 *
 * 练习界面零 toast（store 的 warnStorageFull 除外）。
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAI } from '@/hooks/use-ai';
import { Card, CardContent } from '@/components/ui/card';
import {
  THINK_LONG_TASKS,
  THINK_PATTERN_DIAGNOSTIC,
  THINK_PATTERN_REWRITES,
  THINK_PATTERNS,
  THINK_REAL_TASKS,
  THINK_SPEAKING_PROMPTS,
  type IThinkLongTask,
  type IThinkPattern,
  type IThinkPatternTransfer,
  type IThinkRealTaskPrompt,
} from '@/data/think-patterns';
import { creditKey, useStudyCredit } from '@/lib/study-credit';
import {
  buildGeneratedPracticePrompt,
  buildPatternJudgePrompt,
  buildRealTaskPrompt,
  validateGeneratedPracticeTask,
  validatePatternJudgeResult,
  validateRealTaskJudgeResult,
  type GeneratedPracticeTask,
  type PatternJudgeResult,
  type RealTaskJudgeResult,
  type TaskPromptShape,
} from '@/lib/think-pattern-ai';
import {
  advanceSession,
  applySessionResult,
  buildDiagnosticQueue,
  createPatternSession,
  getWeakPatterns,
  sessionCounts,
  type PatternSessionGradeInput,
  type PatternSessionState,
} from '@/lib/think-patterns';
import {
  clearPatternResume,
  isResumeUsable,
  loadPatternResume,
  type PatternResumeSnapshot,
} from '@/lib/think-session-resume';
import { useThinkPatterns } from '@/lib/use-think-patterns';
import { extractJson, formatDate } from '@/lib/utils';
import { PatternDetail } from './PatternDetail';
import { LongTaskPractice } from './LongTaskPractice';
import { PatternDiagnostic } from './PatternDiagnostic';
import { PatternOverview } from './PatternOverview';
import { PatternReviewSession } from './PatternReviewSession';
import { PatternRewriteDrill } from './PatternRewriteDrill';
import { RealTaskAssessment } from './RealTaskAssessment';
import { SpeakingPractice } from './SpeakingPractice';

type Mode = 'overview' | 'detail' | 'diagnostic' | 'review' | 'rewrite' | 'realTask' | 'speaking' | 'longTask' | 'complete';

/** 判定最长等 15 秒：超时按「AI 不可用」处理，练习界面不永久停在「正在判定」 */
const JUDGE_TIMEOUT_MS = 15_000;
const REAL_TASK_TIMEOUT_MS = 20_000;
const KNOWN_PATTERN_IDS: ReadonlySet<string> = new Set(THINK_PATTERNS.map((pattern) => pattern.id));

export function PatternReviewMode() {
  const {
    loaded, progress, stats, dueQueue, delayedQueue, diagnostic, diagnosticHistory, trend,
    realTask, grade, saveDiagnostic, saveRealTask,
  } = useThinkPatterns();
  const { isConfigured, chat: aiChat } = useAI();
  const { creditOnce } = useStudyCredit();
  const [mode, setMode] = useState<Mode>('overview');
  const [session, setSession] = useState<PatternSessionState>(() => createPatternSession([]));
  const [delayedSession, setDelayedSession] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [resumeSnapshot, setResumeSnapshot] = useState<PatternResumeSnapshot | null>(null);
  const [resumeInfo, setResumeInfo] = useState<PatternResumeSnapshot | null>(null);

  // 概览才读断点；练习中不读（否则会把正在写的这一轮又当成“上次”）。
  useEffect(() => {
    if (!loaded || mode !== 'overview') return;
    const snapshot = loadPatternResume();
    if (snapshot && isResumeUsable(snapshot, KNOWN_PATTERN_IDS)) {
      setResumeInfo(snapshot);
    } else {
      if (snapshot) clearPatternResume();
      setResumeInfo(null);
    }
  }, [loaded, mode]);

  const dropOldResume = () => {
    clearPatternResume();
    setResumeSnapshot(null);
    setResumeInfo(null);
  };

  const weak = getWeakPatterns(THINK_PATTERNS, progress);
  // 完成页按不同模式计数：重试通过后 results 只剩一条 pass，不会把同一模式数两次
  const { passed, failed } = sessionCounts(session);

  const startWith = (ids: string[]) => {
    dropOldResume();
    const queue = ids.length ? ids : dueQueue;
    setDelayedSession(false);
    setSession(createPatternSession(queue));
    setMode(queue.length ? 'review' : 'overview');
  };

  const start = (firstPatternId?: string) => {
    const queue = firstPatternId
      ? [firstPatternId, ...dueQueue.filter((id) => id !== firstPatternId)]
      : dueQueue;
    startWith(queue);
  };

  /** 自由训练：用户明确指定模式，不受到期队列与每日新名额限制 */
  const startPractice = (patternIds: string[]) => {
    if (!patternIds.length) return;
    dropOldResume();
    setDelayedSession(false);
    setSession(createPatternSession(patternIds.slice(0, 10)));
    setMode('review');
  };

  /** 独立的 7/21/60 天延迟探测，不混进普通到期队列 */
  const startDelayed = () => {
    if (!delayedQueue.length) return;
    dropOldResume();
    setDelayedSession(true);
    setSession(createPatternSession(delayedQueue.slice(0, 5)));
    setMode('review');
  };

  /** 从概览「继续上次训练」进来：队列与草稿都从快照恢复，不在中途重新组队。 */
  const resumeSession = () => {
    const snapshot = loadPatternResume();
    if (!snapshot || !isResumeUsable(snapshot, KNOWN_PATTERN_IDS)) {
      setResumeInfo(null);
      return;
    }
    setResumeSnapshot(snapshot);
    setDelayedSession(snapshot.delayed);
    setSession(snapshot.session);
    setMode('review');
  };

  const discardResume = () => dropOldResume();

  /** 体检建议先练的模式：去掉已掌握/今天已通过；全被过滤就回落到正常到期队列 */
  const startFromDiagnostic = (recommendedPatternIds: string[]) => {
    const now = Date.now();
    startWith(buildDiagnosticQueue(
      recommendedPatternIds,
      progress,
      formatDate(new Date(now)),
    ));
  };

  const current = session.queue[session.index];
  const pattern = THINK_PATTERNS.find((p) => p.id === current);

  const handleGrade = (input: PatternSessionGradeInput) => {
    if (!pattern) return;
    grade({ ...input, patternId: pattern.id });
    const patternId = pattern.id;
    setSession((prev) => applySessionResult(prev, patternId, input.transferPassed));
  };

  const handleNext = () => {
    // 这一卡已经完成：清掉断点；下一卡由新挂载的会话重新写一份。
    clearPatternResume();
    setResumeSnapshot(null);
    setResumeInfo(null);
    const next = advanceSession(session);
    if (next.done) {
      setDelayedSession(false);
      setMode('complete');
      return;
    }
    setSession(next.state);
  };

  /**
   * 迁移判定的 AI 路径。返回 null 表示「这一轮不用 AI 结果」—— 会话据此回落自评：
   *  - 没配 Key（`isConfigured` 假）→ 不发请求；
   *  - 15 秒没回来 → abort，按不可用处理（`use-ai.ts` 把 AbortError 映射成空串）；
   *  - `aiChat` 失败返回空串（`use-ai.ts` 的约定）→ 先判空，绝不喂给 extractJson；
   *  - `extractJson` 抛错或形状不合规（`validatePatternJudgeResult` 返回 null）→ 同样回落。
   * 时长在请求之前记：那次作答是真实的学习投入，服务不可用不撤销。
   */
  const judge = async (
    target: IThinkPattern,
    transfer: IThinkPatternTransfer,
    answer: string,
  ): Promise<PatternJudgeResult | null> => {
    creditOnce('think', creditKey('pattern', target.id, answer));
    if (!isConfigured) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
    try {
      const raw = await aiChat(buildPatternJudgePrompt(target, transfer, answer), {
        temperature: 0.2,
        maxTokens: 512,
        // 练习界面不弹全局 AI 错误 toast（失败由会话内联降级）
        silent: true,
        signal: controller.signal,
      });
      if (!raw.trim()) return null;
      try {
        return validatePatternJudgeResult(extractJson(raw));
      } catch {
        return null;
      }
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  /** 真实任务/长文分析共用一条链路：只返回模式使用/缺失与反馈；失败一律 null。 */
  const analyzeTask = async (
    creditKind: 'real-task' | 'long-task',
    task: TaskPromptShape & { id: string },
    answer: string,
  ): Promise<RealTaskJudgeResult | null> => {
    creditOnce('think', creditKey(creditKind, task.id, answer));
    if (!isConfigured) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REAL_TASK_TIMEOUT_MS);
    try {
      const raw = await aiChat(buildRealTaskPrompt(task, answer, THINK_PATTERNS), {
        temperature: 0.2,
        maxTokens: 700,
        silent: true,
        signal: controller.signal,
      });
      if (!raw.trim()) return null;
      try {
        return validateRealTaskJudgeResult(extractJson(raw), task.targetPatternIds);
      } catch {
        return null;
      }
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const analyzeRealTask = (task: IThinkRealTaskPrompt, answer: string) =>
    analyzeTask('real-task', task, answer);

  const analyzeLongTask = (task: IThinkLongTask, answer: string) =>
    analyzeTask('long-task', task, answer);

  /** 额外练习出题：不进入掌握判定；无 Key / 坏 JSON / 超时一律返回 null。 */
  const generateLongTask = async (): Promise<GeneratedPracticeTask | null> => {
    if (!isConfigured) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
    try {
      const raw = await aiChat(buildGeneratedPracticePrompt(THINK_PATTERNS), {
        temperature: 0.7,
        maxTokens: 600,
        silent: true,
        signal: controller.signal,
      });
      if (!raw.trim()) return null;
      try {
        return validateGeneratedPracticeTask(
          extractJson(raw),
          THINK_PATTERNS.map((pattern) => pattern.id),
        );
      } catch {
        return null;
      }
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  // 首屏：progress 还没从 storage 读出来，先给一个小加载态，避免统计闪 0。
  if (!loaded) {
    return (
      <Card className="rounded-3xl border-border shadow-sm">
        <CardContent className="flex items-center justify-center gap-2 py-16 text-sm font-medium text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          正在读取复习进度…
        </CardContent>
      </Card>
    );
  }

  if (mode === 'detail') {
    const detailPattern = THINK_PATTERNS.find((candidate) => candidate.id === detailId);
    if (detailPattern) {
      return (
        <PatternDetail
          pattern={detailPattern}
          progress={progress[detailPattern.id]}
          onPractice={(patternId) => startPractice([patternId])}
          onBack={() => setMode('overview')}
        />
      );
    }
  }

  if (mode === 'diagnostic') {
    return (
      <PatternDiagnostic
        patterns={THINK_PATTERNS}
        items={THINK_PATTERN_DIAGNOSTIC}
        onComplete={saveDiagnostic}
        onStart={startFromDiagnostic}
        onExit={() => setMode('overview')}
      />
    );
  }

  if (mode === 'rewrite') {
    return (
      <PatternRewriteDrill
        patterns={THINK_PATTERNS}
        items={THINK_PATTERN_REWRITES}
        onExit={() => setMode('overview')}
      />
    );
  }

  if (mode === 'realTask') {
    return (
      <RealTaskAssessment
        realTask={realTask}
        onAnalyze={analyzeRealTask}
        onSave={saveRealTask}
        onExit={() => setMode('overview')}
      />
    );
  }

  if (mode === 'speaking') {
    return (
      <SpeakingPractice
        prompts={THINK_SPEAKING_PROMPTS}
        onExit={() => setMode('overview')}
      />
    );
  }

  if (mode === 'longTask') {
    return (
      <LongTaskPractice
        tasks={THINK_LONG_TASKS}
        onAnalyze={analyzeLongTask}
        onGenerate={generateLongTask}
        onExit={() => setMode('overview')}
      />
    );
  }

  if (mode === 'review' && pattern) {
    return (
      <PatternReviewSession
        key={`${pattern.id}-${session.index}`}
        pattern={pattern}
        progress={progress[pattern.id]}
        onJudge={judge}
        onGrade={handleGrade}
        onNext={handleNext}
        delayedProbe={delayedSession}
        sessionState={session}
        resume={resumeSnapshot}
        onExit={() => {
          setDelayedSession(false);
          setResumeSnapshot(null);
          setMode('overview');
        }}
      />
    );
  }

  return (
    <PatternOverview
      stats={stats}
      weak={weak}
      dueQueue={dueQueue}
      delayedQueue={delayedQueue}
      progress={progress}
      mode={mode === 'complete' ? 'complete' : 'overview'}
      passed={passed}
      failed={failed}
      diagnostic={diagnostic}
      diagnosticHistory={diagnosticHistory}
      trend={trend}
      resume={resumeInfo}
      onResume={resumeSession}
      onDiscardResume={discardResume}
      onStart={start}
      onDiagnostic={() => setMode('diagnostic')}
      onDelayed={startDelayed}
      onPractice={startPractice}
      onRewrite={() => setMode('rewrite')}
      onRealTask={() => setMode('realTask')}
      onSpeaking={() => setMode('speaking')}
      onLongTask={() => setMode('longTask')}
      onDetail={(patternId) => {
        setDetailId(patternId);
        setMode('detail');
      }}
      onBack={() => setMode('overview')}
    />
  );
}
