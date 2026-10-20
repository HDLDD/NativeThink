import { memo } from 'react';
import { ArrowRight } from 'lucide-react';
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
    <Card className="col-span-12 lg:col-span-7 overflow-hidden rounded-[26px] border-0 bg-[var(--ink)] text-[#F2F6F2]">
      <CardContent className="flex min-h-[280px] flex-col justify-between gap-7 p-6 sm:p-8 lg:min-h-[324px] lg:p-10">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">
            <span className="size-1.5 rounded-full bg-[var(--lime)]" />
            Today · 今日学习
          </span>
          <span className="text-[11px] font-semibold tabular-nums tracking-wide text-white/40">
            {todayMinutes} / {goal} MIN
          </span>
        </div>

        <div>
          <h2 className="max-w-[15em] text-[28px] font-extrabold leading-[1.18] tracking-tight sm:text-[38px] lg:text-[46px]">
            {dueCount > 0 ? (
              <>
                还有 <span className="text-[var(--lime)] tabular-nums">{dueCount}</span> 个词到期，
                <br />
                先复习，再学新的。
              </>
            ) : (
              <>
                今天没有到期词，
                <br />
                直接学 20 个新词。
              </>
            )}
          </h2>

          <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] font-medium text-white/45">
            <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-white/70">复习</span>
            <span className="text-white/20">→</span>
            <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-white/70">新词</span>
            <span className="text-white/20">→</span>
            <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-white/70">短文</span>
            <span className="text-white/20">→</span>
            <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-white/70">纠偏</span>
            <span className="ml-1 hidden text-white/30 sm:inline">断点自动保存</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              size="lg"
              onClick={onStartLearning}
              className="h-12 w-full gap-2 rounded-full bg-[var(--lime)] px-7 text-[13px] font-bold text-[#0C1712] hover:bg-[#D8FA93] sm:w-auto"
            >
              开始今日学习
              <ArrowRight className="size-4" />
            </Button>
            <span className="text-[11px] text-white/35">按当前复习队列与每日目标安排</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
              <div
                className="h-full rounded-full bg-[var(--lime)] transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] font-bold tabular-nums text-white/35">{pct}%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export const HeroCard = memo(HeroCardInner);
