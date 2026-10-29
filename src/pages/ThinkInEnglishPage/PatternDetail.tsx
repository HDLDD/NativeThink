/**
 * 单个模式的详情页：中文默认 / 英语默认 / 线索 / 识别题里的反例与改法 / 当前进度。
 *
 * 只读：本组件不调 grade、不写 SM-2；「练这个模式」把用户送回会话。
 * 反例取该模式第一道识别题里标为 off 的选项，正例取同一题的 answer —— 两者都来自
 * 题库本身的逐项说明，不在这里另写一份解释。
 */
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  THINK_PATTERN_LAYERS,
  THINK_PATTERN_OPTION_NOTES,
  type IThinkPattern,
} from '@/data/think-patterns';
import type { IThinkPatternProgress } from '@/lib/think-patterns';
import { cn, formatDate } from '@/lib/utils';

export interface PatternDetailProps {
  pattern: IThinkPattern;
  progress?: IThinkPatternProgress;
  onPractice: (patternId: string) => void;
  onBack: () => void;
}

const STATUS_LABEL: Record<IThinkPatternProgress['status'], string> = {
  learning: '学习中',
  reviewing: '复习中',
  mastered: '已掌握',
};

export function PatternDetail({ pattern, progress, onPractice, onBack }: PatternDetailProps) {
  const layer = THINK_PATTERN_LAYERS.find((item) => item.id === pattern.layer);
  // 优先找带「不地道」项的识别题；没有就退回第一题，用非最佳项当反例。
  const sample = pattern.recognition.find((item) =>
    THINK_PATTERN_OPTION_NOTES[item.id]?.some((note) => note.tone === 'off')) ?? pattern.recognition[0];
  const notes = sample ? THINK_PATTERN_OPTION_NOTES[sample.id] : null;
  const offIndex = notes?.findIndex((note) => note.tone === 'off') ?? -1;
  const fallbackIndex = sample
    ? sample.options.findIndex((_, index) => index !== sample.answer)
    : -1;
  const exampleIndex = offIndex >= 0 ? offIndex : fallbackIndex;
  const offOption = sample && exampleIndex >= 0 ? sample.options[exampleIndex] : null;
  const offNote = exampleIndex >= 0 ? notes?.[exampleIndex]?.text : null;
  const offTone = exampleIndex >= 0 ? notes?.[exampleIndex]?.tone : null;
  const bestOption = sample ? sample.options[sample.answer] : null;
  const bestNote = sample ? notes?.[sample.answer]?.text : null;
  const transferRate = progress && progress.transferAttempts > 0
    ? Math.round((progress.transferPasses / progress.transferAttempts) * 100)
    : null;
  const calibration = progress && (progress.calibrationAttempts ?? 0) > 0
    ? `${progress.calibrationHits ?? 0}/${progress.calibrationAttempts ?? 0}`
    : '—';
  const delayedText = progress?.delayedProbeAt
    ? `${formatDate(new Date(progress.delayedProbeAt))}（第 ${(progress.delayedProbeCount ?? 0) + 1} 次）`
    : (progress?.delayedProbeCount ?? 0) >= 3
      ? '已完成 3 次'
      : '尚未安排';

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 shrink-0 rounded-full" onClick={onBack}>
          <ArrowLeft className="mr-1 size-4" aria-hidden />
          返回
        </Button>
        <Badge variant="outline" className="shrink-0">{layer?.name ?? pattern.layer}</Badge>
      </div>

      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
          Pattern Detail
        </p>
        <h2 className="text-2xl font-black italic tracking-tight text-foreground break-words">
          {pattern.name}
        </h2>
        <p className="mt-1 text-sm font-medium text-muted-foreground break-words">{pattern.oneLiner}</p>
      </div>

      <Card className="rounded-3xl border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
            中文默认 → 英语默认
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl border border-border bg-muted/25 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
              中文思路
            </p>
            <p className="text-sm text-muted-foreground break-words">{pattern.contrast.chineseThinking}</p>
          </div>
          <div className="rounded-2xl border border-[var(--brand)]/30 bg-[var(--brand)]/5 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-ink-teal mb-1">
              母语者说法
            </p>
            <p className="text-sm font-semibold text-ink-teal break-words">{pattern.contrast.native}</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">{pattern.contrast.note}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
            线索
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5">
            {pattern.cues.map((cue) => (
              <li key={cue} className="flex gap-2 text-sm text-foreground/80">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-[var(--brand)]" aria-hidden />
                <span className="break-words">{cue}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {sample && offOption && bestOption && (
        <Card className="rounded-3xl border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              反例与改法
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm font-semibold text-foreground break-words">{sample.prompt}</p>
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 mb-1">
                {offTone === 'off' ? '别这样说' : '还能更直接'}
              </p>
              <p className="text-sm font-semibold text-foreground break-words">{offOption}</p>
              {offNote && <p className="mt-1 text-xs text-muted-foreground break-words">{offNote}</p>}
            </div>
            <div className="flex justify-center text-muted-foreground" aria-hidden>
              <ChevronRight className="size-4 rotate-90" />
            </div>
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 mb-1">这样说</p>
              <p className="text-sm font-semibold text-ink-teal break-words">{bestOption}</p>
              {bestNote && <p className="mt-1 text-xs text-muted-foreground break-words">{bestNote}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-3xl border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
            你的进度
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {progress ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn(
                  progress.status === 'mastered'
                    ? 'border-emerald-500/40 text-emerald-600'
                    : progress.status === 'reviewing'
                      ? 'border-[var(--brand)]/40 text-ink-teal'
                      : 'border-amber-500/40 text-amber-600',
                )}>
                  {STATUS_LABEL[progress.status]}
                </Badge>
                <span className="text-xs font-bold text-muted-foreground">
                  迁移 {progress.transferPasses}/{progress.transferAttempts}
                  {transferRate !== null ? ` · ${transferRate}%` : ''}
                </span>
                <span className="text-xs font-bold text-muted-foreground">lapses {progress.lapses}</span>
                <span className="text-xs font-bold text-muted-foreground">校准 {calibration}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                下次到期：{progress.status === 'mastered' ? '—' : formatDate(new Date(progress.nextReview))}
                {' · '}延迟探测：{delayedText}
              </p>
              {progress.lastAttempt?.feedback && (
                <div className="rounded-2xl border border-border bg-muted/20 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                    最近反馈
                  </p>
                  <p className="text-xs text-foreground/75 break-words whitespace-pre-wrap">
                    {progress.lastAttempt.feedback}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">还没开始；练一轮后会在这里显示排期与反馈。</p>
          )}
          <Button className="w-full rounded-full" onClick={() => onPractice(pattern.id)}>
            练这个模式
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
