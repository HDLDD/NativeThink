import { memo } from 'react';
import type { LucideIcon } from 'lucide-react';

interface RingProgressProps {
  value: number;
  label: string;
  icon: LucideIcon;
  color: string;
}

function RingProgressInner({ value, label, icon: Icon, color }: RingProgressProps) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-3 group">
      <div className="relative size-24">
        <svg className="size-full -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40"
            cy="40"
            r={radius}
            stroke="currentColor"
            strokeWidth="6"
            fill="none"
            className="text-gray-100 dark:text-gray-800"
          />
          <circle
            cx="40"
            cy="40"
            r={radius}
            stroke={color}
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            className="size-8 rounded-xl flex items-center justify-center mb-1 transition-all group-hover:scale-110"
            style={{ backgroundColor: `${color}15`, color }}
          >
            <Icon className="size-4" />
          </div>
          <span className="text-lg font-black italic text-foreground tabular-nums tracking-tight">
            {Math.round(value)}%
          </span>
        </div>
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">
        {label}
      </span>
    </div>
  );
}

export const RingProgress = memo(RingProgressInner);
