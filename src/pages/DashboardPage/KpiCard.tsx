import { memo } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  color?: string;
  onClick?: () => void;
}

function KpiCardInner({
  icon: Icon,
  label,
  value,
  trend,
  trendUp = true,
  color = '#00B894',
  onClick,
}: KpiCardProps) {
  return (
    <Card
      className="border-border shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group cursor-pointer rounded-[32px]"
      onClick={onClick}
    >
      <CardContent className="p-6 h-full flex flex-col justify-between">
        <div className="flex items-center justify-between mb-6">
          <div
            className="size-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110"
            style={{ backgroundColor: `${color}10`, color }}
          >
            <Icon className="size-5.5" />
          </div>
          {trend && (
            <div
              className={cn(
                'flex items-center gap-1 text-[11px] font-black',
                trendUp ? 'text-emerald-500' : 'text-rose-500',
              )}
            >
              <ArrowUpRight className={cn('size-3.5', !trendUp && 'rotate-180')} />
              {trend}
            </div>
          )}
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
            {label}
          </p>
          <p
            className="text-2xl font-black text-foreground transition-colors group-hover:text-[#00B894]"
            style={{ fontFeatureSettings: "'cv11'" }}
          >
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export const KpiCard = memo(KpiCardInner);
