/**
 * 模式复习概览：统计三格 / 主按钮 / 薄弱模式 Top 3 / 8 张模式卡 / 本轮完成页。
 *
 * 全部数据来自 props（`stats` / `weak` / `dueQueue` / `progress`），本组件不读存储、
 * 不改进度 —— 点模式卡只展开对比卡，不写任何状态到 store。
 * 日期一律 formatDate（本地日），避免东八区凌晨错天（AGENTS.md 学习统计约定）。
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { THINK_PATTERNS } from '@/data/think-patterns';
import type { IThinkPatternStats } from '@/lib/use-think-patterns';
import type { IThinkPatternProgress, PatternWeakItem } from '@/lib/think-patterns';
import { cn, formatDate } from '@/lib/utils';

export interface PatternOverviewProps {
  stats: IThinkPatternStats;
  weak: PatternWeakItem[];
  dueQueue: string[];
  progress: Record<string, IThinkPatternProgress>;
  mode: 'overview' | 'review' | 'complete';
  passed: number;
  failed: number;
  onStart: () => void;
  onBack: () => void;
}

const shorten = (text: string, limit = 80) =>
  text.length > limit ? `${text.slice(0, limit)}…` : text;

function statusLabel(value?: IThinkPatternProgress): string {
  if (!value) return '未开始';
  if (value.status === 'mastered') return '已掌握';
  if (value.status === 'reviewing') return '复习中';
  return '学习中';
}

function statusTone(value?: IThinkPatternProgress): string {
  if (!value) return 'border-border text-muted-foreground';
  if (value.status === 'mastered') return 'border-emerald-500/40 text-emerald-600';
  if (value.status === 'reviewing') return 'border-[var(--brand)]/40 text-ink-teal';
  return 'border-amber-500/40 text-amber-600';
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/25 p-3 min-w-0">
      <p className="text-xl font-black text-foreground leading-none">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-1.5">{label}</p>
    </div>
  );
}

export function PatternOverview({
  stats,
  weak,
  dueQueue,
  progress,
  mode,
  passed,
  failed,
  onStart,
  onBack,
}: PatternOverviewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* ── 本轮完成页：通过/失败按**不同模式**计数（重试不重复，见顶层 results 的更新口径）── */
  if (mode === 'complete') {
    const upcoming = Object.values(progress)
      .filter((p) => p.status !== 'mastered')
      .sort((a, b) => a.nextReview - b.nextReview)[0];
    const nextDueText = upcoming
      ? formatDate(new Date(upcoming.nextReview))
      : stats.mastered === THINK_PATTERNS.length
        ? '全部模式都已掌握'
        : '暂无到期安排';
    return (
      <Card className="rounded-3xl border-border shadow-sm">
        <CardHeader className="pb-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            Session Complete
          </p>
          <CardTitle className="text-2xl font-black italic tracking-tight">本轮复习完成</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <StatCell label="本轮模式" value={passed + failed} />
            <StatCell label="通过" value={passed} />
            <StatCell label="未通过" value={failed} />
          </div>
          <p className="text-sm text-muted-foreground break-words">下次到期：{nextDueText}</p>
          <Button className="w-full sm:w-auto rounded-full" onClick={onBack}>返回概览</Button>
        </CardContent>
      </Card>
    );
  }

  const empty = dueQueue.length === 0;
  const mainLabel = empty
    ? stats.mastered === THINK_PATTERNS.length
      ? `${THINK_PATTERNS.length} 个模式都已掌握`
      : '今天已完成，下次到期后再来'
    : `开始今日复习（${dueQueue.length}）`;

  return (
    <div className="space-y-5">
      {/* 标题 + 主行动按钮（一屏只留一处饱和） */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
            Pattern Review
          </p>
          <h2 className="text-2xl font-black italic tracking-tight text-foreground">模式复习</h2>
          <p className="text-sm font-medium text-muted-foreground mt-1 break-words">
            对比 → 识别 → 迁移，按 SM-2 安排下一次。
          </p>
        </div>
        <Button
          size="lg"
          className="w-full sm:w-auto rounded-full shrink-0"
          disabled={empty}
          onClick={onStart}
        >
          {mainLabel}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatCell label="到期" value={stats.due} />
        <StatCell label="今日已练" value={stats.reviewedToday} />
        <StatCell label="已掌握" value={stats.mastered} />
      </div>

      {/* 薄弱模式 Top 3 */}
      <Card className="rounded-3xl border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
            薄弱模式 Top 3
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {weak.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有薄弱模式，继续复习即可。</p>
          ) : (
            weak.map((row) => {
              const feedback = row.progress.lastAttempt?.feedback ?? '';
              return (
                <div
                  key={row.pattern.id}
                  className="rounded-2xl border border-border p-3 space-y-1 min-w-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-foreground break-words">
                      {row.pattern.name}
                    </span>
                    <Badge variant="outline" className="shrink-0">lapses {row.progress.lapses}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    迁移通过 {row.progress.transferPasses}/{row.progress.transferAttempts}
                  </p>
                  {feedback && (
                    <p className="text-xs text-muted-foreground break-words">
                      上次反馈：{shorten(feedback)}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* 8 张模式卡：点击只展开对比，不改进度 */}
      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">模式库</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {THINK_PATTERNS.map((pattern) => {
            const p = progress[pattern.id];
            const status = statusLabel(p);
            const nextDue = !p ? '未开始' : p.status === 'mastered' ? '—' : formatDate(new Date(p.nextReview));
            const expanded = expandedId === pattern.id;
            return (
              <Card key={pattern.id} className="rounded-3xl border-border shadow-sm overflow-hidden min-w-0">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId((prev) => (prev === pattern.id ? null : pattern.id))}
                  className="w-full text-left p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-foreground break-words">{pattern.name}</p>
                      <p className="text-xs text-muted-foreground mt-1 break-words">{pattern.oneLiner}</p>
                    </div>
                    <Badge variant="outline" className={cn('shrink-0', statusTone(p))}>{status}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      下次到期：{nextDue}
                    </span>
                    <ChevronDown
                      className={cn(
                        'size-4 shrink-0 text-muted-foreground transition-transform',
                        expanded && 'rotate-180',
                      )}
                      aria-hidden
                    />
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-border px-4 py-3 space-y-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                        中文思路
                      </p>
                      <p className="text-sm text-muted-foreground break-words">
                        {pattern.contrast.chineseThinking}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                        母语者说法
                      </p>
                      <p className="text-sm font-semibold text-ink-teal break-words">{pattern.contrast.native}</p>
                    </div>
                    <p className="text-xs text-muted-foreground break-words">{pattern.contrast.note}</p>
                    <ul className="space-y-1">
                      {pattern.cues.map((cue) => (
                        <li key={cue} className="flex gap-2 text-xs text-foreground/75">
                          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--brand)]" aria-hidden />
                          <span className="break-words">{cue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
