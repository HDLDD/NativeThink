/**
 * 单个模式的三稿训练：对比 → 识别 → 首稿 → 反馈 → 改写 → 反馈 → 新场景 → 最终反馈。
 *
 * 三稿的用意：
 *  ① 首稿暴露当前默认；反馈后必须改写到通过，不能看完反馈就过；
 *  ② 改写通过后换一个新场景再写一次，验证是不是真的迁移；
 *  ③ 最终只记一次 SM-2：改写与新场景都通过才算过，避免一稿蒙对。
 *
 * 四条约定：
 *  - 题目下标在挂载时快照：评分后 progress 前进，不能在反馈页换题。
 *  - 换卡由顶层用 pattern.id + session.index 重挂载；重试卡从对比重新开始。
 *  - 练习界面零 toast；AI 不可用时只做内联自评降级。
 *  - judgeSeqRef 作废旧 Promise；judgeUnavailableRef 在首次 AI 失败后跳过后续 AI 等待。
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { THINK_PATTERN_OPTION_NOTES, type IThinkPattern, type IThinkPatternTransfer } from '@/data/think-patterns';
import {
  delayedProbeDay,
  isClosedBook,
  pickRecognitionIndex,
  pickTransferIndex,
  type IThinkPatternProgress,
  type PatternConfidence,
  type PatternSessionGradeInput,
} from '@/lib/think-patterns';
import type { PatternJudgeResult } from '@/lib/think-pattern-ai';
import { cn } from '@/lib/utils';

type Stage = 'contrast' | 'recognition' | 'writing' | 'feedback';
type DraftRound = 0 | 1 | 2;

interface DraftResult {
  pass: boolean;
  feedback: string;
  evidence?: string;
  source: 'ai' | 'self';
  answer: string;
  transfer: IThinkPatternTransfer;
}

const STAGES = [
  { key: 'contrast', label: '对比' },
  { key: 'recognition', label: '识别' },
  { key: 'draft1', label: '首稿' },
  { key: 'rewrite', label: '改写' },
  { key: 'transfer2', label: '新场景' },
];

const DRAFT_LABELS = ['首稿', '改写', '新场景'];
const SELF_PASS_FEEDBACK = '自评：已对照参考表达';
const SELF_FAIL_FEEDBACK = '自评：还没用上这个模式';

export interface PatternReviewSessionProps {
  pattern: IThinkPattern;
  progress?: IThinkPatternProgress;
  /** AI 判定：成功返回结果，失败/未配置/坏 JSON 返回 null（会话据此回落自评） */
  onJudge: (
    pattern: IThinkPattern,
    transfer: IThinkPatternTransfer,
    answer: string,
  ) => Promise<PatternJudgeResult | null>;
  onGrade: (input: PatternSessionGradeInput) => void;
  onNext: () => void;
  onExit: () => void;
}

export function PatternReviewSession({
  pattern,
  progress,
  onJudge,
  onGrade,
  onNext,
  onExit,
}: PatternReviewSessionProps) {
  // 挂载时快照：评分后 progress 会前进，重算会让反馈页的题目/解释与用户刚答的对不上。
  const [recognitionIndex] = useState(() =>
    pickRecognitionIndex(progress?.recognitionTotal ?? 0, pattern.recognition.length));
  const [transferIndex] = useState(() =>
    pickTransferIndex(progress?.transferAttempts ?? 0, pattern.transfer.length));

  const [stage, setStage] = useState<Stage>('contrast');
  const [round, setRound] = useState<DraftRound>(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answer, setAnswer] = useState('');
  const [confidence, setConfidence] = useState<PatternConfidence | null>(null);
  const [judging, setJudging] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [results, setResults] = useState<Array<DraftResult | undefined>>([]);
  const [rewriteAttempts, setRewriteAttempts] = useState(0);
  const [advancing, setAdvancing] = useState(false);
  const gradedRef = useRef(false);
  const nextRef = useRef(false);
  const judgingRef = useRef(false);
  const selfEvalRoundRef = useRef<DraftRound | null>(null);
  const judgeSeqRef = useRef(0);
  const judgeUnavailableRef = useRef(false);

  // 判定是异步的：卸载（含换卡重挂载、退出）时作废在飞的 Promise。
  useEffect(() => () => { judgeSeqRef.current += 1; }, []);

  const choice = pattern.recognition[recognitionIndex];
  const firstTransfer = pattern.transfer[transferIndex];
  const secondTransfer = pattern.transfer[(transferIndex + 1) % pattern.transfer.length];
  const currentTransfer = round === 2 ? secondTransfer : firstTransfer;
  const recognitionCorrect = selected !== null && selected === choice?.answer;
  /** 距首次练习 ≥7/21/60 天时标成延迟迁移；延迟探测同样闭卷。挂载时快照，避免最终落分后 progress 变化把它翻掉。 */
  const [probeDay] = useState(() => delayedProbeDay(progress, Date.now()));
  /** 第 3 次及以后复习闭卷；失败会重置 repetitions，重试卡自动回到开卷 */
  const [closedBook] = useState(() => isClosedBook(progress) || probeDay !== null);
  const transferKind = currentTransfer?.kind ?? 'scenario';
  const confidenceLabel = confidence === 1 ? '没把握' : confidence === 3 ? '有把握' : '一般';
  const calibrated = confidence === 1 || confidence === 3;
  const feedbackResult = results[round];

  const finalPassed: boolean | null = round === 2
    ? Boolean(results[1]?.pass && results[2]?.pass)
    : round === 1 && rewriteAttempts >= 2 && feedbackResult && !feedbackResult.pass
      ? false
      : null;
  const calibrationMatched = finalPassed !== null && calibrated && (
    (confidence === 3 && finalPassed) || (confidence === 1 && !finalPassed)
  );

  const stageIndex = stage === 'contrast'
    ? 0
    : stage === 'recognition'
      ? 1
      : round === 0
        ? 2
        : round === 1
          ? 3
          : 4;

  if (!choice || !firstTransfer || !secondTransfer) {
    return (
      <Card className="rounded-3xl border-border shadow-sm">
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm font-medium text-muted-foreground">
            这个模式的内容还不完整，先返回概览。
          </p>
          <Button variant="outline" className="rounded-full" onClick={onExit}>返回概览</Button>
        </CardContent>
      </Card>
    );
  }

  const optionNotes = THINK_PATTERN_OPTION_NOTES[choice.id] ?? null;
  const selectedNote = selected === null ? null : optionNotes?.[selected] ?? null;

  const startRound = (nextRound: DraftRound, text: string) => {
    setRound(nextRound);
    setAnswer(text);
    setFallback(false);
    selfEvalRoundRef.current = null;
    setStage('writing');
  };

  /** 三稿结束只落一次分：改写通过 + 新场景通过才算这个模式通过。 */
  const finalize = (all: Array<DraftResult | undefined>) => {
    if (gradedRef.current) return;
    gradedRef.current = true;
    const rewrite = all[1];
    const last = all[2] ?? all[1];
    const pass = Boolean(rewrite?.pass && all[2]?.pass);
    const summary = all
      .map((entry, index) => entry ? `${DRAFT_LABELS[index]}：${entry.feedback}` : '')
      .filter(Boolean)
      .join(' ｜ ');
    onGrade({
      recognitionCorrect,
      transferPassed: pass,
      answer: last?.answer ?? '',
      feedback: summary,
      evidence: last?.evidence,
      source: last?.source ?? 'self',
      confidence: confidence ?? undefined,
    });
  };

  const applyDraftResult = (entry: DraftResult) => {
    const nextResults = [...results];
    nextResults[round] = entry;
    setResults(nextResults);
    if (round === 1) setRewriteAttempts((prev) => prev + 1);
    const terminalRewrite = round === 1 && !entry.pass && rewriteAttempts + 1 >= 2;
    if (round === 2 || terminalRewrite) finalize(nextResults);
    setStage('feedback');
  };

  const finishSelf = (ok: boolean) => {
    if (selfEvalRoundRef.current === round) return;
    selfEvalRoundRef.current = round;
    applyDraftResult({
      pass: ok,
      feedback: ok ? SELF_PASS_FEEDBACK : SELF_FAIL_FEEDBACK,
      source: 'self',
      answer: answer.trim(),
      transfer: currentTransfer,
    });
  };

  const submitDraft = async (force = false) => {
    const trimmed = answer.trim();
    if (!trimmed || judgingRef.current || (round === 0 && confidence === null) || (fallback && !force)) return;
    if (force) {
      setFallback(false);
      judgeUnavailableRef.current = false;
    }
    judgingRef.current = true;
    setJudging(true);
    const seq = judgeSeqRef.current + 1;
    judgeSeqRef.current = seq;
    let result: PatternJudgeResult | null = null;
    if (!judgeUnavailableRef.current) {
      try {
        result = await onJudge(pattern, currentTransfer, trimmed);
      } catch {
        result = null; // onJudge 自己已兜底；这里再兜一层，保证判定态不会卡死
      }
    }
    // 卸载/退出后旧 Promise 回来：直接丢弃，不写状态、不落分
    if (judgeSeqRef.current !== seq) return;
    judgingRef.current = false;
    setJudging(false);
    if (result) {
      applyDraftResult({
        pass: result.pass,
        feedback: result.feedback,
        evidence: result.evidence,
        source: 'ai',
        answer: trimmed,
        transfer: currentTransfer,
      });
    } else {
      // AI 不可用：后续轮次直接走自评，避免每个模式都等一次 15 秒
      judgeUnavailableRef.current = true;
      setFallback(true);
    }
  };

  const finishSession = () => {
    if (nextRef.current) return;
    nextRef.current = true;
    setAdvancing(true);
    onNext();
  };

  const handleFeedbackNext = () => {
    if (!feedbackResult) return;
    if (round === 0) {
      startRound(1, feedbackResult.answer);
      return;
    }
    if (round === 1) {
      if (feedbackResult.pass) {
        startRound(2, '');
        return;
      }
      if (rewriteAttempts < 2) {
        startRound(1, feedbackResult.answer);
        return;
      }
      finishSession();
      return;
    }
    finishSession();
  };

  /** 退出也作废在飞的判定（卸载时 cleanup 还会再加一次，双保险） */
  const handleExit = () => {
    judgeSeqRef.current += 1;
    onExit();
  };

  const feedbackTitle = round === 2
    ? feedbackResult?.pass ? '新场景用上了' : '新场景还没做到'
    : round === 1
      ? feedbackResult?.pass ? '改写通过了' : '改写还没做到'
      : feedbackResult?.pass ? '首稿已经用上了' : '首稿还没做到';

  const feedbackLabel = round === 0
    ? '按反馈改写'
    : round === 1
      ? feedbackResult?.pass
        ? '换一个新场景'
        : rewriteAttempts < 2
          ? '再改一版'
          : '完成本模式'
      : '完成本模式';

  return (
    <div className="space-y-5">
      {/* 会话头：模式名 + 阶段进度 + 退出 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
            Pattern Training
          </p>
          <h2 className="text-2xl font-black italic tracking-tight text-foreground break-words">
            {pattern.name}
          </h2>
          <p className="text-sm font-medium text-muted-foreground mt-1 break-words">{pattern.oneLiner}</p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 rounded-full" onClick={handleExit}>
          退出
        </Button>
      </div>

      <ol className="flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
        {STAGES.map((s, i) => (
          <li
            key={s.key}
            className={cn(
              'rounded-full px-2 py-0.5',
              i === stageIndex
                ? 'bg-[var(--brand)]/10 text-ink-teal'
                : i < stageIndex
                  ? 'text-foreground'
                  : 'text-muted-foreground',
            )}
          >
            {i + 1} {s.label}
          </li>
        ))}
      </ol>

      {stage === 'contrast' && (
        <Card className="rounded-3xl border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              先看思维差异
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-muted/25 p-4 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                  中文思路
                </p>
                <p className="text-sm text-muted-foreground break-words">
                  {pattern.contrast.chineseThinking}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--brand)]/30 bg-[var(--brand)]/10 p-4 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                  母语者说法
                </p>
                <p className="text-sm font-semibold text-ink-teal break-words">{pattern.contrast.native}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground break-words">{pattern.contrast.note}</p>
            <ul className="space-y-1.5">
              {pattern.cues.map((cue) => (
                <li key={cue} className="flex gap-2 text-sm text-foreground/80">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-[var(--brand)]" aria-hidden />
                  <span className="break-words">{cue}</span>
                </li>
              ))}
            </ul>
            <Button className="w-full sm:w-auto rounded-full" onClick={() => setStage('recognition')}>
              开始识别
            </Button>
          </CardContent>
        </Card>
      )}

      {stage === 'recognition' && (
        <Card className="rounded-3xl border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              识别：哪种说法更像母语者
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm font-semibold text-foreground break-words">{choice.prompt}</p>
            <div className="space-y-2">
              {choice.options.map((option, i) => {
                const revealed = selected !== null;
                const isAnswer = choice.answer === i;
                const isSelected = selected === i;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSelected((prev) => (prev === null ? i : prev))}
                    disabled={revealed}
                    aria-pressed={isSelected}
                    className={cn(
                      'w-full rounded-2xl border p-3 text-left text-sm transition-colors break-words',
                      !revealed && 'border-border bg-card hover:border-[var(--brand)]/50',
                      revealed && isAnswer && 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                      revealed && isSelected && !isAnswer && 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400',
                      revealed && !isSelected && !isAnswer && 'border-border bg-muted/30 text-muted-foreground',
                    )}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            {selected !== null && (
              <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
                <p className={cn(
                  'text-sm font-black',
                  recognitionCorrect ? 'text-emerald-600' : selectedNote?.tone === 'ok' ? 'text-amber-700' : 'text-amber-600',
                )}>
                  {recognitionCorrect
                    ? '选对了'
                    : selectedNote?.tone === 'ok'
                      ? '这句也能说，但不是最直接的说法'
                      : '这次选偏了：看清每项的差别'}
                </p>
                <div className="space-y-2">
                  {choice.options.map((option, i) => {
                    const note = optionNotes?.[i];
                    const isBest = i === choice.answer;
                    const isPicked = i === selected;
                    const toneLabel = isBest
                      ? '最直接'
                      : note?.tone === 'ok'
                        ? '也能说，但更绕'
                        : '这里不地道';
                    const toneClass = isBest
                      ? 'text-emerald-600'
                      : note?.tone === 'ok'
                        ? 'text-muted-foreground'
                        : 'text-amber-600';
                    return (
                      <div
                        key={option}
                        className={cn(
                          'rounded-xl border p-2.5',
                          isBest && 'border-emerald-500/30 bg-emerald-500/5',
                          isPicked && !isBest && 'border-amber-500/30 bg-amber-500/5',
                          !isBest && !isPicked && 'border-border bg-card/50',
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn('text-[10px] font-black uppercase tracking-wider', toneClass)}>
                            {toneLabel}
                          </span>
                          {isPicked && (
                            <span className="text-[10px] font-bold text-muted-foreground">你选的</span>
                          )}
                        </div>
                        <p className="mt-1 text-sm font-semibold text-foreground break-words">{option}</p>
                        <p className="mt-1 text-xs text-muted-foreground break-words">
                          {note?.text ?? '暂无逐项说明'}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="prose prose-sm max-w-none dark:prose-invert break-words">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{choice.explanation}</ReactMarkdown>
                </div>
              </div>
            )}

            <Button
              className="w-full sm:w-auto rounded-full"
              disabled={selected === null}
              onClick={() => setStage('writing')}
            >
              继续
            </Button>
          </CardContent>
        </Card>
      )}

      {stage === 'writing' && (
        <Card className="rounded-3xl border-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                {round === 0
                  ? '首稿：轮到你说了'
                  : round === 1
                    ? '改写：按反馈再写一版'
                    : '新场景：换一个情境'}
              </CardTitle>
              {round === 0 && (
                <Badge variant="outline" className="border-border text-muted-foreground">
                  {transferKind === 'wording' ? '换措辞' : '新情境'}
                </Badge>
              )}
              {round === 1 && <Badge variant="outline">第 2 稿</Badge>}
              {round === 2 && <Badge variant="outline">第 3 稿</Badge>}
              {closedBook && (
                <Badge variant="outline" className="border-amber-500/40 text-amber-700">
                  {probeDay ? `延迟 ${probeDay} 天` : '闭卷'}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm font-semibold text-foreground break-words">{currentTransfer.situation}</p>

            {round === 0 && (
              closedBook ? (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <p className="text-xs font-black text-amber-700">
                    {probeDay ? `延迟迁移 · 第 ${probeDay} 天` : '这次闭卷：先自己组织'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {probeDay
                      ? `距首次练习已超过 ${probeDay} 天；这次不看三步提示，先自己组织，提交后再对照。`
                      : '你已经在前面复习过这个模式；这次不看三步提示，提交后再对照。'}
                  </p>
                </div>
              ) : (
                <details className="group rounded-2xl border border-border bg-muted/20">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-muted-foreground [&::-webkit-details-marker]:hidden">
                    <span>写之前先想三步（可展开）</span>
                    <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="space-y-2 px-4 pb-4">
                    <ol className="space-y-1.5">
                      {currentTransfer.thinkingSteps.map((step, i) => (
                        <li key={step} className="flex gap-2 text-sm text-foreground/80">
                          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-[10px] font-black text-ink-teal">
                            {i + 1}
                          </span>
                          <span className="break-words">{step}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="text-xs text-muted-foreground">不要逐字翻译；先把动作和对象想清楚，再写。</p>
                  </div>
                </details>
              )
            )}

            {round === 1 && results[0] && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                  上一稿反馈
                </p>
                <p className="text-sm text-foreground break-words">{results[0].feedback}</p>
                <p className="mt-1 text-xs text-muted-foreground">这次只改这一版：把反馈里的问题改掉。</p>
              </div>
            )}

            {round === 2 && (
              <div className="rounded-2xl border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  这次换一个新场景，不给三步提示；先自己组织，提交后再对照。
                </p>
              </div>
            )}

            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={judging || fallback}
              rows={4}
              placeholder={round === 1 ? '按反馈改写你会怎么说……' : '用英文写出你会怎么说……'}
              aria-label="你的英文表达"
              className="min-h-28 resize-y"
            />

            {round === 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  提交前先猜一下
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 1 as const, label: '没把握' },
                    { value: 2 as const, label: '一般' },
                    { value: 3 as const, label: '有把握' },
                  ]).map((option) => {
                    const active = confidence === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        disabled={judging || fallback}
                        onClick={() => setConfidence(option.value)}
                        className={cn(
                          'rounded-full border px-3 py-2 text-xs font-bold transition-colors',
                          active
                            ? 'border-[var(--brand)]/60 bg-[var(--brand)]/10 text-ink-teal'
                            : 'border-border bg-card text-muted-foreground hover:border-[var(--brand)]/40',
                          (judging || fallback) && 'opacity-60',
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  先判断自己有没有用上这个模式；“一般”不计入校准。
                </p>
              </div>
            )}

            {!judging && !fallback && (
              <>
                <Button
                  className="w-full sm:w-auto rounded-full"
                  disabled={!answer.trim() || (round === 0 && confidence === null)}
                  onClick={() => { void submitDraft(); }}
                >
                  {round === 0 ? '提交首稿' : round === 1 ? '提交改写' : '提交新场景'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {round === 2
                    ? '这次是最终迁移；AI 不可用时对照参考表达自评。'
                    : '提交后由 AI 判定你是否用上了这个模式；AI 不可用时对照参考表达自评。'}
                </p>
              </>
            )}

            {judging && (
              <p
                role="status"
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
              >
                <Loader2 className="size-4 animate-spin" aria-hidden />
                正在判定你的第 {round + 1} 稿…
              </p>
            )}

            {fallback && (
              <div className="space-y-3 rounded-2xl border border-border bg-muted/25 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-black text-amber-600">AI 判定暂不可用，可以重试或先自评</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full shrink-0"
                    onClick={() => { void submitDraft(true); }}
                  >
                    重试 AI 判定
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">反复失败可在设置中配置自己的 AI Key。</p>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                    参考表达
                  </p>
                  <p className="text-sm font-semibold text-foreground break-words">{currentTransfer.modelAnswer}</p>
                </div>
                <p className="text-xs text-muted-foreground break-words">检查点：{currentTransfer.rubricFocus}</p>
                <div className="rounded-xl border border-border bg-card/50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                    为什么这样更自然
                  </p>
                  <p className="text-sm text-foreground/80 break-words">{currentTransfer.why}</p>
                </div>
                <p className="text-sm font-bold text-foreground">你用上这个模式了吗？</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button className="rounded-full sm:flex-1" onClick={() => finishSelf(true)}>
                    我用上了这个模式
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full sm:flex-1"
                    onClick={() => finishSelf(false)}
                  >
                    还没做到
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {stage === 'feedback' && feedbackResult && (
        <Card className="rounded-3xl border-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  feedbackResult.pass
                    ? 'border-emerald-500/40 text-emerald-600'
                    : 'border-amber-500/40 text-amber-600',
                )}
              >
                {feedbackResult.pass ? '通过' : '未通过'}
              </Badge>
              <CardTitle className="text-lg font-black">{feedbackTitle}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {results.length > 1 && (
              <div className="flex flex-wrap gap-2 text-[11px] font-bold text-muted-foreground">
                {results.map((entry, index) => entry ? (
                  <span key={index} className={entry.pass ? 'text-emerald-600' : 'text-amber-600'}>
                    {DRAFT_LABELS[index]} {entry.pass ? '过' : '未过'}
                  </span>
                ) : null)}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-muted/25 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                  你的表达
                </p>
                <p className="text-sm font-semibold text-foreground break-words">
                  {feedbackResult.answer || '（未填写）'}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                  参考表达
                </p>
                <p className="text-sm font-semibold text-ink-teal break-words">{feedbackResult.transfer.modelAnswer}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                {feedbackResult.source === 'ai' ? 'AI 点评' : '自评'}
              </p>
              <p className="text-sm text-foreground break-words">{feedbackResult.feedback}</p>
              {feedbackResult.evidence && (
                <p className="mt-2 text-xs text-muted-foreground break-words">证据：{feedbackResult.evidence}</p>
              )}
            </div>
            {finalPassed !== null && confidence !== null && (
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                  你的判断
                </p>
                <p className="text-sm text-foreground break-words">
                  {confidenceLabel} · 实际{finalPassed ? '用上了' : '没做到'}
                  {calibrated
                    ? calibrationMatched ? ' · 判断准确' : ' · 这次判断偏了'
                    : ' · 一般不计入校准'}
                </p>
              </div>
            )}
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                为什么这样更自然
              </p>
              <p className="text-sm text-foreground/80 break-words">{feedbackResult.transfer.why}</p>
            </div>
            {closedBook && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                  回看：这次{probeDay ? '延迟迁移' : '闭卷'}，可以先想的三步
                </p>
                <ol className="space-y-1.5">
                  {feedbackResult.transfer.thinkingSteps.map((step, i) => (
                    <li key={step} className="flex gap-2 text-sm text-foreground/80">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-[10px] font-black text-ink-teal">
                        {i + 1}
                      </span>
                      <span className="break-words">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                本模式的判断线索
              </p>
              <ul className="space-y-1">
                {pattern.cues.map((cue) => (
                  <li key={cue} className="flex gap-2 text-xs text-foreground/75">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--brand)]" aria-hidden />
                    <span className="break-words">{cue}</span>
                  </li>
                ))}
              </ul>
            </div>
            {round === 1 && !feedbackResult.pass && rewriteAttempts >= 2 && (
              <p className="text-xs text-muted-foreground">
                改写两次仍未通过，这个模式会按失败排期；下次训练会再遇到它。
              </p>
            )}
            <Button
              className="w-full sm:w-auto rounded-full"
              disabled={advancing}
              onClick={handleFeedbackNext}
            >
              {feedbackLabel}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
