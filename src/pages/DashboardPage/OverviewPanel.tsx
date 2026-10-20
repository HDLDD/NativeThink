import { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface OverviewPanelProps {
  streakDays: number;
  totalDays: number;
  todayMinutes: number;
  dailyGoalMinutes: number;
  expressionCount: number;
  wordCount: number;
  onOpenProgress: () => void;
}

/**
 * 首页右侧「学习档案」：把原来四张统计卡 + 一张墨色进度卡收成一块。
 * 大数字是连续天数，环是今日目标；下面四项用内部分隔线排成表，不再各自套卡。
 */
function OverviewPanelInner({
  streakDays,
  totalDays,
  todayMinutes,
  dailyGoalMinutes,
  expressionCount,
  wordCount,
  onOpenProgress,
}: OverviewPanelProps) {
  const goal = dailyGoalMinutes > 0 ? dailyGoalMinutes : 30;
  const pct = Math.min(100, Math.round((todayMinutes / goal) * 100));
  const r = 30;
  const circumference = 2 * Math.PI * r;

  return (
    <Card className="col-span-12 lg:col-span-5 rounded-[26px] border-border bg-card">
      <CardContent className="flex h-full min-h-[280px] flex-col p-6 sm:p-7 lg:min-h-[324px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Overview</p>
            <h3 className="mt-1 text-[15px] font-bold text-foreground">学习档案</h3>
          </div>
          <button
            type="button"
            onClick={onOpenProgress}
            className="rounded-full px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            全部记录 →
          </button>
        </div>

        <div className="mt-7 flex items-center justify-between gap-5">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[52px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
                {streakDays}
              </span>
              <span className="text-[13px] font-semibold text-muted-foreground">天连续</span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
              累计 {totalDays} 天 · 今日 {Math.round(todayMinutes)}/{goal} 分钟
            </p>
          </div>

          <div className="relative size-[76px] shrink-0">
            <svg className="size-full -rotate-90" viewBox="0 0 76 76" aria-hidden>
              <circle cx="38" cy="38" r={r} stroke="var(--border)" strokeWidth="5" fill="none" />
              <circle
                cx="38"
                cy="38"
                r={r}
                stroke="var(--brand)"
                strokeWidth="5"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - pct / 100)}
                className="transition-[stroke-dashoffset] duration-700"
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <span className="text-[15px] font-extrabold tabular-nums text-foreground">{pct}%</span>
            </div>
          </div>
        </div>

        <div className="mt-auto grid grid-cols-2 pt-5">
          {[
            { label: '今日已学', value: `${Math.round(todayMinutes)} 分` },
            { label: '每日目标', value: `${goal} 分` },
            { label: '收藏表达', value: `${expressionCount} 条` },
            { label: '收藏单词', value: `${wordCount} 条` },
          ].map((item, i) => (
            <button
              key={item.label}
              type="button"
              onClick={onOpenProgress}
              className={cn(
                'flex items-baseline justify-between gap-2 py-3 text-left transition-colors hover:text-ink-teal',
                i % 2 === 1 && 'border-l border-border pl-5',
                i >= 2 && 'border-t border-border',
              )}
            >
              <span className="text-[11px] text-muted-foreground">{item.label}</span>
              <span className="text-[13px] font-bold tabular-nums text-foreground">{item.value}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export const OverviewPanel = memo(OverviewPanelInner);
