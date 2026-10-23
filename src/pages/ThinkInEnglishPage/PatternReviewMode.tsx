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
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAI } from '@/hooks/use-ai';
import { Card, CardContent } from '@/components/ui/card';
import { THINK_PATTERNS, type IThinkPattern, type IThinkPatternTransfer } from '@/data/think-patterns';
import { creditKey, useStudyCredit } from '@/lib/study-credit';
import {
  buildPatternJudgePrompt,
  validatePatternJudgeResult,
  type PatternJudgeResult,
} from '@/lib/think-pattern-ai';
import {
  advanceSession,
  applySessionResult,
  createPatternSession,
  getWeakPatterns,
  sessionCounts,
  type PatternSessionGradeInput,
  type PatternSessionState,
} from '@/lib/think-patterns';
import { useThinkPatterns } from '@/lib/use-think-patterns';
import { extractJson } from '@/lib/utils';
import { PatternOverview } from './PatternOverview';
import { PatternReviewSession } from './PatternReviewSession';

type Mode = 'overview' | 'review' | 'complete';

/** 判定最长等 15 秒：超时按「AI 不可用」处理，练习界面不永久停在「正在判定」 */
const JUDGE_TIMEOUT_MS = 15_000;

export function PatternReviewMode() {
  const { loaded, progress, stats, dueQueue, grade } = useThinkPatterns();
  const { isConfigured, chat: aiChat } = useAI();
  const { creditOnce } = useStudyCredit();
  const [mode, setMode] = useState<Mode>('overview');
  const [session, setSession] = useState<PatternSessionState>(() => createPatternSession([]));

  const weak = getWeakPatterns(THINK_PATTERNS, progress);
  // 完成页按不同模式计数：重试通过后 results 只剩一条 pass，不会把同一模式数两次
  const { passed, failed } = sessionCounts(session);

  const start = () => {
    setSession(createPatternSession(dueQueue));
    setMode(dueQueue.length ? 'review' : 'overview');
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
    const next = advanceSession(session);
    if (next.done) {
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

  if (mode === 'review' && pattern) {
    return (
      <PatternReviewSession
        key={`${pattern.id}-${session.index}`}
        pattern={pattern}
        progress={progress[pattern.id]}
        onJudge={judge}
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
