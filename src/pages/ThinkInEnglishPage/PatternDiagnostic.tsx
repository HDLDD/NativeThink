/**
 * 思维体检：每个模式一道识别题（15 个模式 → 15 题）→ 四层概况 → 按结果选复习模式。
 *
 * 三条约定的：
 *  ① 不写进度、不调 grade：体检只产出 profile 与建议，SM-2 仍由真正的迁移复习推进。
 *  ② 答题过程中不显示对错：避免把体检变成即时刷题，最后只看四层概况。
 *  ③ 结果只在最后一题落一次（finishedRef）；连点「看结果」不会重复保存。
 */
import { useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  THINK_PATTERN_LAYERS,
  type IThinkPattern,
  type IThinkPatternChoice,
  type IThinkPatternDiagnosticItem,
} from '@/data/think-patterns';
import { scoreDiagnostic, type DiagnosticResult } from '@/lib/think-patterns';
import { cn } from '@/lib/utils';

const LAYER_IDS = THINK_PATTERN_LAYERS.map((layer) => layer.id);

type Stage = 'intro' | 'quiz' | 'result';

export interface PatternDiagnosticProps {
  patterns: IThinkPattern[];
  items: IThinkPatternDiagnosticItem[];
  onComplete: (result: DiagnosticResult) => void;
  onStart: (recommendedPatternIds: string[]) => void;
  onExit: () => void;
}

export function PatternDiagnostic({
  patterns,
  items,
  onComplete,
  onStart,
  onExit,
}: PatternDiagnosticProps) {
  const questions = useMemo(
    () => items
      .map((item) => {
        const pattern = patterns.find((candidate) => candidate.id === item.patternId);
        const choice = pattern?.recognition.find((candidate) => candidate.id === item.choiceId);
        return pattern && choice ? { pattern, choice } : null;
      })
      .filter((question): question is { pattern: IThinkPattern; choice: IThinkPatternChoice } => !!question),
    [items, patterns],
  );

  const [stage, setStage] = useState<Stage>('intro');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const finishedRef = useRef(false);

  const current = questions[index];
  const selected = current ? answers[current.choice.id] : undefined;

  if (questions.length === 0) {
    return (
      <Card className="rounded-3xl border-border shadow-sm">
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm font-medium text-muted-foreground">
            体检题目还没准备好，先返回概览。
          </p>
          <Button variant="outline" className="rounded-full" onClick={onExit}>返回概览</Button>
        </CardContent>
      </Card>
    );
  }

  const handleNext = () => {
    if (selected === undefined) return;
    if (index + 1 < questions.length) {
      setIndex((prev) => prev + 1);
      return;
    }
    if (finishedRef.current) return;
    finishedRef.current = true;
    const next = scoreDiagnostic(patterns, items, answers, LAYER_IDS);
    setResult(next);
    onComplete(next);
    setStage('result');
  };

  const handleStart = () => {
    onStart(result?.recommendedPatternIds ?? []);
  };

  if (stage === 'intro') {
    return (
      <Card className="rounded-3xl border-border shadow-sm">
        <CardHeader className="pb-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            Pattern Check
          </p>
          <CardTitle className="text-2xl font-black italic tracking-tight">思维体检</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground break-words">
            {questions.length} 道跨模式识别题，约 3 分钟。不计分、不排名；只用来决定接下来先练哪些模式。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {THINK_PATTERN_LAYERS.map((layer) => (
              <div key={layer.id} className="rounded-2xl border border-border bg-muted/25 p-3 min-w-0">
                <p className="text-sm font-black text-foreground">{layer.name}</p>
                <p className="mt-1 text-xs text-muted-foreground break-words">{layer.description}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">
              答题时不会告诉你对错；做完只看“哪一层还没抓住”，不会生成思维分数。
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button className="rounded-full sm:flex-1" onClick={() => setStage('quiz')}>
              开始体检
            </Button>
            <Button variant="outline" className="rounded-full sm:flex-1" onClick={onExit}>
              返回概览
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (stage === 'result' && result) {
    const recommended = result.recommendedPatternIds
      .map((id) => patterns.find((pattern) => pattern.id === id))
      .filter((pattern): pattern is IThinkPattern => !!pattern);
    return (
      <Card className="rounded-3xl border-border shadow-sm">
        <CardHeader className="pb-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            Pattern Check
          </p>
          <CardTitle className="text-2xl font-black italic tracking-tight">体检结果</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border bg-muted/25 p-4">
            <p className="text-sm font-black text-foreground">
              这次识别抓住 {result.correct} / {result.total}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              这不是分数，只说明哪些模式这次还没抓住；建议按下面的顺序练。
            </p>
          </div>

          <div className="space-y-2">
            {result.layers.map((layer) => {
              const meta = THINK_PATTERN_LAYERS.find((candidate) => candidate.id === layer.layerId);
              const percent = layer.total > 0 ? Math.round((layer.correct / layer.total) * 100) : 0;
              return (
                <div key={layer.layerId} className="rounded-2xl border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-foreground">{meta?.name ?? layer.layerId}</span>
                    <span className="text-xs font-bold text-muted-foreground">
                      {layer.correct} / {layer.total}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden>
                    <div
                      className="h-full rounded-full bg-[var(--brand)] transition-[width]"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              建议先练
            </p>
            {recommended.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                这次都答对了，直接按到期复习即可。
              </p>
            ) : (
              recommended.map((pattern) => {
                const meta = THINK_PATTERN_LAYERS.find((layer) => layer.id === pattern.layer);
                return (
                  <div key={pattern.id} className="rounded-2xl border border-border p-3 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-foreground break-words">{pattern.name}</p>
                      <Badge variant="outline" className="shrink-0">{meta?.name ?? pattern.layer}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground break-words">{pattern.oneLiner}</p>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button className="rounded-full sm:flex-1" onClick={handleStart}>
              {recommended.length > 0
                ? `按建议开始训练（${recommended.length}）`
                : '开始今日训练'}
            </Button>
            <Button variant="outline" className="rounded-full sm:flex-1" onClick={onExit}>
              返回概览
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!current) {
    return (
      <Card className="rounded-3xl border-border shadow-sm">
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm font-medium text-muted-foreground">这一题的内容不完整，先返回概览。</p>
          <Button variant="outline" className="rounded-full" onClick={onExit}>返回概览</Button>
        </CardContent>
      </Card>
    );
  }

  const layer = THINK_PATTERN_LAYERS.find((candidate) => candidate.id === current.pattern.layer);
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
            Pattern Check · {index + 1} / {questions.length}
          </p>
          <h2 className="text-2xl font-black italic tracking-tight text-foreground">思维体检</h2>
          <p className="text-sm font-medium text-muted-foreground mt-1">选完不立刻判对错，最后看四层概况。</p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 rounded-full" onClick={onExit}>
          退出
        </Button>
      </div>

      <Card className="rounded-3xl border-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              第 {index + 1} 题
            </CardTitle>
            <Badge variant="outline">{layer?.name ?? current.pattern.layer}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm font-semibold text-foreground break-words">{current.choice.prompt}</p>
          <div className="space-y-2">
            {current.choice.options.map((option, optionIndex) => {
              const isSelected = selected === optionIndex;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setAnswers((prev) => ({ ...prev, [current.choice.id]: optionIndex }))}
                  aria-pressed={isSelected}
                  className={cn(
                    'w-full rounded-2xl border p-3 text-left text-sm transition-colors break-words',
                    isSelected
                      ? 'border-[var(--brand)]/60 bg-[var(--brand)]/10 text-foreground'
                      : 'border-border bg-card hover:border-[var(--brand)]/50',
                  )}
                >
                  {option}
                </button>
              );
            })}
          </div>
          <Button
            className="w-full sm:w-auto rounded-full"
            disabled={selected === undefined}
            onClick={handleNext}
          >
            {index + 1 === questions.length ? '看结果' : '下一题'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
