import { memo } from 'react';
import { Play } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface HeroCardProps {
  onStartLearning: () => void;
  /** 今天到期的复习词数（真实队列，不是文案） */
  dueCount: number;
  todayMinutes: number;
  dailyGoalMinutes: number;
}

/**
 * 首页主行动卡：标题直接说"今天要做什么"，不再放营销标语。
 * 数据来自 SM-2 队列与今日统计；进度条是今天的时间目标，不是假进度。
 */
function HeroCardInner({ onStartLearning, dueCount, todayMinutes, dailyGoalMinutes }: HeroCardProps) {
  const goal = dailyGoalMinutes > 0 ? dailyGoalMinutes : 30;
  const pct = Math.min(100, Math.round((todayMinutes / goal) * 100));

  return (
    <Card className="col-span-12 lg:col-span-7 rounded-[32px] lg:rounded-[40px] border-border shadow-sm overflow-hidden">
      <CardContent className="p-5 sm:p-8 lg:p-10 min-h-[220px] lg:min-h-[300px] flex flex-col justify-between gap-5">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-ink-teal">
            今日学习
          </span>
          <span className="text-xs font-bold text-muted-foreground tabular-nums">
            今日 {todayMinutes}/{goal} 分
          </span>
        </div>

        <div>
          <h2 className="text-[26px] sm:text-4xl lg:text-[42px] font-black leading-[1.22] tracking-tight text-foreground">
            {dueCount > 0 ? (
              <>
                还有 <span className="text-ink-teal tabular-nums">{dueCount}</span> 个词到期，
                <br className="hidden sm:block" />
                先复习，再学新的。
              </>
            ) : (
              <>
                今天没有到期词，
                <br className="hidden sm:block" />
                直接学 20 个新词。
              </>
            )}
          </h2>
          <p className="mt-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            复习 · 新词 · 复习词短文 · 纠偏，一条线走完。断点自动保存，可随时停下。
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Button
            size="lg"
            onClick={onStartLearning}
            className="h-11 sm:h-12 w-full sm:w-auto rounded-2xl bg-[var(--brand)] hover:bg-[var(--brand-strong)] px-6 text-xs font-black uppercase tracking-wider text-white shadow-sm gap-2"
          >
            <Play className="size-4" />
            开始今日学习
          </Button>
          <span className="text-[11px] text-muted-foreground">按当前复习队列与每日目标安排</span>
        </div>

        <div className="h-1 w-full rounded-full bg-muted overflow-hidden" aria-hidden>
          <div
            className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export const HeroCard = memo(HeroCardInner);
