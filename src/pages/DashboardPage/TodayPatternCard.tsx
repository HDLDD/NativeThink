import { memo } from 'react';
import { Brain, ChevronRight } from 'lucide-react';
import { THINK_PATTERNS } from '@/data/think-patterns';
import { useThinkPatterns } from '@/lib/use-think-patterns';

/**
 * 首页「今日模式」卡：有模式进度才渲染（与三张 0 义务横幅同一条口径）。
 * 到期队列为空时退到最近一次排期，告诉用户下一次是什么，而不是整卡消失。
 */
interface TodayPatternCardProps {
  onNavigate: (path: string) => void;
}

function TodayPatternCardInner({ onNavigate }: TodayPatternCardProps) {
  const { loaded, stats, dueQueue, delayedQueue, progress, trend } = useThinkPatterns();
  if (!loaded || stats.tracked === 0) return null;

  const nextId = dueQueue[0]
    ?? Object.values(progress).sort((a, b) => a.nextReview - b.nextReview)[0]?.patternId;
  const pattern = THINK_PATTERNS.find((candidate) => candidate.id === nextId);
  const attempts = trend.reduce((sum, point) => sum + point.attempts, 0);
  const passes = trend.reduce((sum, point) => sum + point.passes, 0);
  const maxAttempts = Math.max(1, ...trend.map((point) => point.attempts));
  const dueText = stats.due > 0
    ? `到期 ${stats.due} 个模式`
    : '今天已完成，下次到期再来';
  const delayedText = delayedQueue.length > 0 ? ` · 延迟探测 ${delayedQueue.length}` : '';

  return (
    <button
      onClick={() => onNavigate('/think')}
      className="w-full rounded-2xl border border-border bg-card px-5 py-4 text-left transition-all hover:border-[var(--brand)]/40 hover:shadow-md group"
    >
      <div className="flex items-start gap-3">
        <span className="size-8 shrink-0 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-ink-teal flex items-center justify-center">
          <Brain className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              今日模式
            </span>
            <span className="text-[10px] font-bold text-muted-foreground">
              {dueText}{delayedText}
            </span>
          </div>
          <p className="mt-0.5 text-sm font-black text-foreground break-words group-hover:text-ink-teal transition-colors">
            {pattern ? pattern.name : '去挑一个模式'}
          </p>
          <div className="mt-2 flex items-end gap-1">
            {trend.map((point) => (
              <span
                key={point.date}
                className="flex h-6 w-2 items-end rounded-sm bg-[var(--brand)]/10"
                title={`${point.date} · 迁移 ${point.passes}/${point.attempts}`}
              >
                <span
                  className="w-full rounded-sm bg-[var(--brand)]"
                  style={{ height: `${point.attempts > 0 ? Math.max(12, (point.attempts / maxAttempts) * 100) : 0}%` }}
                />
              </span>
            ))}
            <span className="ml-2 text-[10px] font-bold text-muted-foreground">
              近 7 天迁移 {passes}/{attempts}
            </span>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-0.5 pt-1 text-[10px] font-black uppercase tracking-wider text-ink-teal">
          去训练
          <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  );
}

export const TodayPatternCard = memo(TodayPatternCardInner);
