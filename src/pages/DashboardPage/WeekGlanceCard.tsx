import { memo, useMemo } from 'react';
import { CalendarCheck } from 'lucide-react';
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
      className="w-full rounded-[32px] border border-border bg-card p-6 text-left hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1 flex items-center gap-1.5">
            <CalendarCheck className="size-3.5 text-ink-teal" />
            Week Glance
          </p>
          <h3 className="text-lg font-black italic text-foreground">
            本周 <span className="text-ink-teal">{Math.round(weekTotal)}</span> 分钟
            <span className="ml-3 text-xs font-medium text-muted-foreground not-italic">
              打卡 {checkedDays}/7 天{goalDays > 0 && ` · 达标 ${goalDays} 天`}
            </span>
          </h3>
        </div>
        <span className="text-[10px] font-black uppercase tracking-wider text-ink-teal opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          详情 →
        </span>
      </div>
      <div className="h-28 flex items-end gap-2" aria-hidden="true">
        {days.map((d) => {
          const h = d.minutes > 0 ? Math.max(8, Math.round((d.minutes / maxMinutes) * 96)) : 4;
          const hitGoal = d.minutes >= dailyGoalMinutes && d.minutes > 0;
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
              <div
                className={
                  'w-full max-w-8 rounded-t-lg transition-all duration-500 ' +
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
              'flex-1 text-center text-[10px] font-black min-w-0 ' +
              (d.isToday ? 'text-ink-teal' : 'text-muted-foreground')
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
