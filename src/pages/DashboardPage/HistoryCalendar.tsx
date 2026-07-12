import { memo, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn, cleanText } from '@/lib/utils';
import { WEEK_DAYS } from './constants';

interface HistoryEntry {
  date: string;
  content: string;
  meaning: string;
  example: string;
}

interface HistoryCalendarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: HistoryEntry[];
  historyMonth: number;
  historyYear: number;
  historyByDate: Record<string, HistoryEntry[]>;
  monthDays: { date: string; day: number; isCurrentMonth: boolean }[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onGoToToday: () => void;
  monthLabel: string;
}

function HistoryCalendarInner({
  open,
  onOpenChange,
  history,
  historyMonth,
  historyYear,
  historyByDate,
  monthDays,
  onPrevMonth,
  onNextMonth,
  onGoToToday,
  monthLabel,
}: HistoryCalendarProps) {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const monthStats = useMemo(() => {
    const prefix = `${historyYear}-${String(historyMonth + 1).padStart(2, '0')}`;
    const daysWithRecords = Object.keys(historyByDate).filter((d) => d.startsWith(prefix)).length;
    const totalEntries = history.filter((h) => h.date.startsWith(prefix)).length;
    return { daysWithRecords, totalEntries };
  }, [historyByDate, history, historyYear, historyMonth]);

  const filteredEntries = useMemo(() => {
    const prefix = `${historyYear}-${String(historyMonth + 1).padStart(2, '0')}`;
    return Object.entries(historyByDate)
      .filter(([date]) => date.startsWith(prefix))
      .sort(([a], [b]) => b.localeCompare(a));
  }, [historyByDate, historyYear, historyMonth]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-[32px] p-0 overflow-hidden">
        <div className="p-6 border-b border-border bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10">
          <DialogHeader>
            <DialogTitle className="text-xl font-black italic text-foreground flex items-center gap-2">
              <Clock className="size-5 text-amber-500" />
              每日一句历史记录
            </DialogTitle>
          </DialogHeader>
        </div>
        <div className="p-4">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={onPrevMonth} className="rounded-xl size-8 text-muted-foreground hover:text-[#00B894]">
              <ChevronLeft className="size-4" />
            </Button>
            <button
              onClick={onGoToToday}
              className="text-sm font-black text-foreground hover:text-[#00B894] transition-colors"
              title="回到今天"
            >
              {monthLabel}
            </button>
            <Button variant="ghost" size="icon" onClick={onNextMonth} className="rounded-xl size-8 text-muted-foreground hover:text-[#00B894]">
              <ChevronRight className="size-4" />
            </Button>
          </div>
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEK_DAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground py-1">{d}</div>
            ))}
          </div>
          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((d, i) => {
              const entry = historyByDate[d.date];
              const isToday = d.date === todayStr;
              return (
                <div
                  key={i}
                  className={cn(
                    'aspect-square rounded-xl flex flex-col items-center justify-center text-xs transition-all relative',
                    !d.isCurrentMonth && 'opacity-30',
                    isToday && 'ring-1 ring-[#00B894]',
                  )}
                >
                  <span className={cn('font-black', entry ? 'text-foreground' : 'text-muted-foreground')}>{d.day}</span>
                  {entry && (
                    <div className="absolute bottom-1 flex gap-0.5">
                      {entry.slice(0, 2).map((_, j) => (
                        <span key={j} className="size-1 rounded-full bg-[#00B894]" />
                      ))}
                      {entry.length > 2 && <span className="text-[7px] font-black text-[#00B894]">+{entry.length - 2}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Selected day's entries */}
          <div className="mt-4 max-h-[200px] overflow-y-auto space-y-2 border-t border-border pt-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              本月共 {monthStats.daysWithRecords} 天有记录 · 共 {monthStats.totalEntries} 条
            </p>
            {filteredEntries.map(([date, entries]) => (
              <div key={date} className="p-3 rounded-2xl bg-muted/30">
                <p className="text-[10px] font-black text-muted-foreground mb-2">{date} · {entries.length} 句</p>
                {entries.map((h, j) => (
                  <div key={j} className="flex items-start gap-2 mb-2 last:mb-0 pl-2 border-l-2 border-amber-200 dark:border-amber-500/20">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-foreground">{h.content}</p>
                      <p className="text-xs text-muted-foreground">{h.meaning}</p>
                      <p className="text-xs text-foreground/50 italic mt-0.5">「{cleanText(h.example)}」</p>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const HistoryCalendar = memo(HistoryCalendarInner);
