import { memo } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { QUICK_ENTRIES } from './constants';

interface QuickStartGridProps {
  onNavigate: (path: string) => void;
}

function QuickStartGridInner({ onNavigate }: QuickStartGridProps) {
  return (
    <div className="col-span-12 lg:col-span-7">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
            Quick Start
          </p>
          <h3 className="text-xl font-black italic text-foreground">快速开始</h3>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {QUICK_ENTRIES.map((entry) => {
          const Icon = entry.icon;
          return (
            <Card
              key={entry.path}
              className="cursor-pointer hover:shadow-md transition-all duration-300 hover:-translate-y-1 group rounded-[32px] border-border"
              onClick={() => onNavigate(entry.path)}
            >
              <CardContent className="p-6">
                <div
                  className={cn(
                    'size-14 rounded-2xl flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform shadow-lg',
                    `bg-gradient-to-br ${entry.color}`,
                  )}
                  style={{ boxShadow: `0 10px 25px -5px ${entry.color.includes('emerald') ? 'rgba(0,184,148,0.3)' : entry.color.includes('gray') ? 'rgba(31,41,55,0.2)' : entry.color.includes('indigo') ? 'rgba(99,102,241,0.3)' : 'rgba(249,115,22,0.3)'}` }}
                >
                  <Icon className="size-6" />
                </div>
                <h4 className="text-base font-black text-foreground mb-1">{entry.label}</h4>
                <p className="text-xs text-muted-foreground font-medium mb-3">{entry.desc}</p>
                <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[#00B894]">
                  开始学习
                  <ArrowUpRight className="size-3.5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export const QuickStartGrid = memo(QuickStartGridInner);
