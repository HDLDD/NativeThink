import { memo } from 'react';
import { ArrowRight, Brain } from 'lucide-react';
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
 * 首页主行动卡：墨面上的"母语思维"主视觉（大脑水印 + 标语），
 * 右上角是今天的时间目标；到期数作为一条真实状态挂在路径链前面。
 */
function HeroCardInner({ onStartLearning, dueCount, todayMinutes, dailyGoalMinutes }: HeroCardProps) {
  const goal = dailyGoalMinutes > 0 ? dailyGoalMinutes : 30;
  const pct = Math.min(100, Math.round((todayMinutes / goal) * 100));

  return (
    <Card className="relative col-span-12 overflow-hidden rounded-[26px] border-0 bg-[var(--ink)] text-[#F2F6F2] lg:col-span-7">
      {/* 母语思维主视觉：大脑水印（纯装饰） */}
      <Brain
        aria-hidden
        className="pointer-events-none absolute -right-8 top-1/2 size-44 -translate-y-1/2 rotate-[-12deg] text-[var(--lime)] opacity-[0.07] sm:size-52 lg:-right-10 lg:size-64"
        strokeWidth={1.2}
      />
      <CardContent className="relative z-10 flex min-h-[300px] flex-col justify-between gap-7 p-6 sm:p-8 lg:min-h-[340px] lg:p-10">
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
          <h2 className="max-w-[14em] text-[30px] font-extrabold leading-[1.16] tracking-tight sm:text-[40px] lg:text-[46px]">
            用母语思维，
            <br />
            <span className="text-[var(--lime)]">说地道英语。</span>
          </h2>
          <p className="mt-3 max-w-[26em] text-[12px] leading-relaxed text-white/50 sm:text-[13px]">
            摆脱中式英语，建立像 native speaker 一样的英语思维。每天 {goal} 分钟，让英语成为你的本能。
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] font-medium text-white/45">
            <span
              className={
                dueCount > 0
                  ? 'rounded-full bg-[var(--lime)] px-2.5 py-1 font-bold text-[#0C1712]'
                  : 'rounded-full bg-white/[0.07] px-2.5 py-1 text-white/70'
              }
            >
              {dueCount > 0 ? `${dueCount} 个词到期` : '今天没有到期词'}
            </span>
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
              className="h-12 w-full gap-2 rounded-full bg-[var(--lime)] px-7 text-[13px] font-bold text-[var(--on-lime)] hover:brightness-105 sm:w-auto"
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
