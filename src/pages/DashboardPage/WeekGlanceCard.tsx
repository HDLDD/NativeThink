import { memo, useMemo } from 'react';
import type { ICalendarRecord } from '@/lib/use-learning-stats';
import { formatDate } from '@/lib/utils';
import { WEEK_DAYS } from './constants';

/**
 * 首页「本周学习概览」—— 最近 7 个自然日的学习分钟柱状。
 *
 * 数据源是 useLearningStats 暴露的 calendar（__nativethink_calendar，本地日期字符串键）。
 * 日期一律 formatDate 循环生成再按字符串查表 —— 不能直接 slice(-7) 取数组尾部：
 * calendar 只在跨出 31 天窗口后才 push 新条目，跨天当天没学习时尾部是昨天，
 * slice 会把"今天"画丢、柱状图整体错位一天。
 */
interface WeekGlanceCardProps {
  calendar: ICalendarRecord[];
  dailyGoalMinutes: number;
  onNavigate: (path: string) => void;
}

function WeekGlanceCardInner({ calendar, dailyGoalMinutes, onNavigate }: WeekGlanceCardProps) {
  const days = useMemo(() => {
    const byDate = new Map<string, ICalendarRecord>();
    for (const r of calendar) byDate.set(r.date, r);
    const out: { date: string; weekday: string; minutes: number; checkedIn: boolean; isToday: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = formatDate(d);
      const rec = byDate.get(date);
      out.push({
        date,
        weekday: i === 0 ? '今天' : WEEK_DAYS[d.getDay()],
        minutes: rec?.minutes ?? 0,
        checkedIn: rec?.checkedIn ?? false,
        isToday: i === 0,
      });
    }
    return out;
  }, [calendar]);

  const maxMinutes = Math.max(...days.map((d) => d.minutes), 1);
  const weekTotal = days.reduce((s, d) => s + d.minutes, 0);
  const checkedDays = days.filter((d) => d.checkedIn).length;
  const goalDays = days.filter((d) => d.minutes >= dailyGoalMinutes && d.minutes > 0).length;

  return (
    <button
      onClick={() => onNavigate('/progress')}
      className="group w-full rounded-[24px] border border-border bg-card p-5 text-left transition-colors hover:border-foreground/20"
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Week glance</p>
          <h3 className="mt-1 text-[15px] font-bold text-foreground">
            本周 <span className="tabular-nums">{Math.round(weekTotal)}</span> 分钟
            <span className="ml-2 text-[11px] font-medium text-muted-foreground">
              打卡 {checkedDays}/7 天{goalDays > 0 && ` · 达标 ${goalDays} 天`}
            </span>
          </h3>
        </div>
        <span className="shrink-0 text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          详情 →
        </span>
      </div>
      <div className="flex h-20 items-end gap-1.5" aria-hidden="true">
        {days.map((d) => {
          const h = d.minutes > 0 ? Math.max(8, Math.round((d.minutes / maxMinutes) * 96)) : 4;
          const hitGoal = d.minutes >= dailyGoalMinutes && d.minutes > 0;
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
              <div
                className={
                  'w-full max-w-7 rounded-t-[4px] transition-all duration-500 ' +
                  (hitGoal
                    ? 'bg-[var(--brand)]'
                    : d.minutes > 0
                      ? 'bg-[var(--brand)]/35'
                      : 'bg-muted')
                }
                style={{ height: `${h}px` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-2" aria-hidden="true">
        {days.map((d) => (
          <div
            key={d.date}
            className={
              'flex-1 text-center text-[10px] font-medium min-w-0 ' +
              (d.isToday ? 'text-foreground font-semibold' : 'text-muted-foreground')
            }
          >
            {d.weekday}
          </div>
        ))}
      </div>
    </button>
  );
}

export const WeekGlanceCard = memo(WeekGlanceCardInner);
