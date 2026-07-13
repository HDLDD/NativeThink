import { memo } from 'react';
import { TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface ProgressCardProps {
  todayMinutes: number;
  dailyGoalMinutes: number;
  progressPercent: number;
}

function ProgressCardInner({ todayMinutes, dailyGoalMinutes, progressPercent }: ProgressCardProps) {
  return (
    <Card className="col-span-2 rounded-[32px] bg-[#1F2937] border-none shadow-xl relative overflow-hidden group">
      <CardContent className="p-6 relative z-10">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            Today's Progress
          </span>
          <div className="flex gap-3 text-[9px] font-black uppercase text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#00B894]"></span>
              Done
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-white/40"></span>
              Goal
            </span>
          </div>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-4xl font-black italic text-white tracking-tight mb-1">
              {Math.round(todayMinutes)}
              <span className="text-lg font-black text-[#00B894] ml-1">min</span>
            </p>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              / {dailyGoalMinutes} min 目标
            </p>
          </div>
          <div className="w-20 h-20 relative">
            <svg className="size-full -rotate-90" viewBox="0 0 80 80">
              <circle
                cx="40"
                cy="40"
                r="32"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="6"
                fill="none"
              />
              <circle
                cx="40"
                cy="40"
                r="32"
                stroke="#00B894"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 32}
                strokeDashoffset={2 * Math.PI * 32 * (1 - progressPercent / 100)}
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-black text-white">
                {Math.round(progressPercent)}%
              </span>
            </div>
          </div>
        </div>
      </CardContent>
      {/* 背景装饰 */}
      <TrendingUp className="absolute top-0 right-0 p-6 size-32 text-white opacity-5 group-hover:scale-110 transition-transform duration-700" />
    </Card>
  );
}

export const ProgressCard = memo(ProgressCardInner);
