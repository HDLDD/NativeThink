import type { LucideIcon } from 'lucide-react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  VOCAB_MODE_GROUPS,
  type IVocabHall,
  type IVocabModeDisplay,
  type VocabModeKey,
  type VocabStatusTone,
} from '@/lib/vocab-mode-hall';

interface VocabModeHallProps {
  hall: IVocabHall;
  icons: Record<VocabModeKey, LucideIcon>;
  onEnter: (key: VocabModeKey) => void;
}

const BADGE_CLASS: Record<VocabStatusTone, string> = {
  due: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  resume: 'bg-[var(--brand)]/10 text-ink-teal',
  pending: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  neutral: 'bg-muted text-muted-foreground',
};

const STATUS_CLASS: Record<VocabStatusTone, string> = {
  due: 'text-amber-700 dark:text-amber-300',
  resume: 'text-ink-teal',
  pending: 'text-orange-700 dark:text-orange-300',
  neutral: 'text-muted-foreground',
};

function ModeRow({
  mode,
  icon: Icon,
  onEnter,
}: {
  mode: IVocabModeDisplay;
  icon: LucideIcon;
  onEnter: (key: VocabModeKey) => void;
}) {
  const hasStatus = !!mode.status;
  return (
    <button
      type="button"
      data-vocab-mode={mode.key}
      data-press="soft"
      onClick={() => onEnter(mode.key)}
      className="group flex w-full items-center gap-3.5 rounded-[20px] border border-border bg-card p-3.5 text-left transition-colors hover:border-[var(--brand)]/35 hover:bg-muted/20"
    >
      <span
        className="grid size-10 shrink-0 place-items-center rounded-2xl"
        style={{ background: `${mode.color}1a`, color: mode.color }}
      >
        <Icon className="size-5" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-black text-foreground">{mode.label}</span>
          {mode.badge && (
            <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-black leading-none', BADGE_CLASS[mode.tone])}>
              {mode.badge}
            </span>
          )}
        </span>
        <span className={cn(
          'mt-0.5 block truncate text-[11px] font-bold',
          hasStatus ? STATUS_CLASS[mode.tone] : 'text-muted-foreground',
        )}>
          {mode.status ?? mode.desc}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-ink-teal" />
    </button>
  );
}

/**
 * 背单词模式大厅。
 *
 * 每日学习是唯一的主行动块（hero）；其余 8 个模式按「复习 / 主动输出 / 工具」
 * 分组。每个模式最多一行真实状态，没有状态就显示模式说明 —— 大厅不加载词库。
 */
export function VocabModeHall({ hall, icons, onEnter }: VocabModeHallProps) {
  const DailyIcon = icons.daily;
  const { learned, quota } = hall.dailyProgress;
  const percent = quota > 0 ? Math.min(100, Math.max(0, (learned / quota) * 100)) : 0;

  return (
    <div className="flex flex-col gap-5 stagger">
      {/* 主推：每日学习 */}
      <button
        type="button"
        data-vocab-mode="daily"
        data-vocab-group="main"
        data-press="soft"
        onClick={() => onEnter('daily')}
        className="group relative overflow-hidden rounded-[28px] border-2 border-transparent bg-gradient-to-br from-[var(--brand)] to-emerald-500 p-6 text-left shadow-lg shadow-emerald-200/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl dark:shadow-emerald-900/30"
      >
        <DailyIcon className="pointer-events-none absolute -right-6 -top-4 size-[120px] select-none text-white/10" aria-hidden />
        <span className="relative mb-1 block text-[10px] font-black uppercase tracking-[0.2em] text-white/70">
          Daily Learning · 主线
        </span>
        <span className="relative mb-1 flex flex-wrap items-center gap-2">
          <span className="text-xl font-black italic text-white">每日学习</span>
          {hall.daily.badge && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-black text-white">
              {hall.daily.badge}
            </span>
          )}
        </span>
        <span className="relative block text-xs font-medium text-white/85">
          {hall.daily.status ?? hall.daily.desc}
        </span>
        {quota > 0 && (
          <span className="relative mt-2.5 block h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-white/20" aria-hidden>
            <span className="block h-full rounded-full bg-white/80 transition-all duration-500" style={{ width: `${percent}%` }} />
          </span>
        )}
        <ArrowRight className="absolute right-6 top-1/2 size-5 -translate-y-1/2 text-white transition-transform group-hover:translate-x-1" />
      </button>

      {VOCAB_MODE_GROUPS.filter((g) => g.key !== 'main').map((group) => {
        const items = hall.groups.find((g) => g.key === group.key)?.items ?? [];
        return (
          <section key={group.key} data-vocab-group={group.key} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <h2 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{group.label}</h2>
              <span className="text-[10px] font-bold tabular-nums text-muted-foreground/50">{items.length}</span>
              <span className="h-px flex-1 bg-border/70" />
              <span className="hidden text-[10px] font-bold text-muted-foreground/60 sm:inline">{group.desc}</span>
            </div>
            <div className="space-y-2">
              {items.map((mode) => (
                <ModeRow key={mode.key} mode={mode} icon={icons[mode.key]} onEnter={onEnter} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}