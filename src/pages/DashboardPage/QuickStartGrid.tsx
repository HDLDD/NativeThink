import { memo } from 'react';
import type { CSSProperties } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { QUICK_ENTRIES, COMING_SOON } from './constants';

interface QuickStartGridProps {
  onNavigate: (path: string) => void;
}

function QuickStartGridInner({ onNavigate }: QuickStartGridProps) {
  return (
    <div className="col-span-12 lg:col-span-7">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            All modules
          </p>
          <h3 className="mt-1 text-[15px] font-bold text-foreground">
            全部功能
            <span className="ml-2 text-[11px] font-medium text-muted-foreground tabular-nums">
              {QUICK_ENTRIES.length}
            </span>
          </h3>
        </div>
        <span className="text-[10px] text-muted-foreground">按学习路径排序</span>
      </div>

      <div className="stagger grid grid-cols-2 gap-2.5 lg:grid-cols-3">
        {QUICK_ENTRIES.map((entry, index) => (
          <button
            key={entry.path}
            type="button"
            onClick={() => onNavigate(entry.path)}
            style={{ '--tint': entry.tint } as CSSProperties}
            className="group flex min-h-[124px] flex-col justify-between rounded-[20px] border border-border bg-card p-5 text-left transition-colors hover:border-transparent hover:bg-[var(--ink)]"
          >
            <div className="flex items-start justify-between">
              <span className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.14em] text-[var(--tint)] tabular-nums transition-colors group-hover:text-[var(--lime)]">
                <span className="size-1.5 rounded-full bg-current" aria-hidden />
                {String(index + 1).padStart(2, '0')}
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground/30 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--lime)]" />
            </div>
            <div className="mt-5">
              <h4 className="text-[16px] font-bold tracking-tight text-foreground group-hover:text-white">
                {entry.label}
              </h4>
              <p className="mt-1 text-[11px] text-muted-foreground group-hover:text-white/45">
                {entry.desc}
              </p>
            </div>
          </button>
        ))}

        {COMING_SOON.map((it) => (
          <div
            key={it.label}
            className="rounded-[20px] border border-dashed border-border bg-muted/20 p-5 select-none"
            aria-disabled="true"
          >
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-[16px] font-bold text-foreground">{it.label}</h4>
              <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--warm)] bg-[var(--warm)]/10 px-2 py-0.5 rounded-full">
                即将上线
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">{it.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export const QuickStartGrid = memo(QuickStartGridInner);
