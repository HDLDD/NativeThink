import { memo } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { QUICK_ENTRIES, COMING_SOON } from './constants';

/** 品牌色 → 柔和投影色 */
function shadowFor(color: string): string {
  const v = color.includes('emerald') ? 'rgba(0,184,148,0.3)'
    : color.includes('pink') ? 'rgba(236,72,153,0.28)'
    : color.includes('cyan') ? 'rgba(14,165,233,0.28)'
    : color.includes('indigo') ? 'rgba(99,102,241,0.3)'
    : color.includes('amber') ? 'rgba(245,158,11,0.3)'
    : color.includes('violet') ? 'rgba(139,92,246,0.3)'
    : color.includes('teal') ? 'rgba(20,184,166,0.3)'
    : color.includes('gray') ? 'rgba(31,41,55,0.2)'
    : 'rgba(249,115,22,0.3)';
  return v;
}

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
      <div className="stagger grid grid-cols-2 lg:grid-cols-3 gap-4">
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
                  style={{ boxShadow: `0 10px 25px -5px ${shadowFor(entry.color)}` }}
                >
                  <Icon className="size-6" />
                </div>
                <h4 className="text-base font-black text-foreground mb-1">{entry.label}</h4>
                <p className="text-xs text-muted-foreground font-medium mb-3">{entry.desc}</p>
                <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-ink-teal">
                  开始学习
                  <ArrowUpRight className="size-3.5" />
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* 即将上线：句子学习（功能开发中，暂不可点） */}
        {COMING_SOON.map((it) => {
          const Icon = it.icon;
          return (
            <div
              key={it.label}
              className="rounded-[32px] border-2 border-dashed border-border bg-muted/20 p-6 select-none"
              aria-disabled="true"
            >
              <div
                className="size-14 rounded-2xl flex items-center justify-center text-white mb-4 opacity-60"
                style={{ backgroundColor: it.color }}
              >
                <Icon className="size-6" />
              </div>
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-base font-black text-foreground">{it.label}</h4>
                <span className="text-[9px] font-black uppercase tracking-wider text-amber-600 bg-amber-100 dark:bg-amber-500/20 px-2 py-0.5 rounded-full">
                  即将上线
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-medium">{it.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const QuickStartGrid = memo(QuickStartGridInner);
