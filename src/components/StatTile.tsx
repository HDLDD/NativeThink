import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatTileProps {
  label: string;
  value: ReactNode;
  /** 右侧/下方的补充信息（趋势、累计、占比），保持弱化 */
  hint?: ReactNode;
  onClick?: () => void;
  className?: string;
}

/**
 * 紧凑统计格：没有图标、没有大留白。
 * 之前每个 KPI 是一张 32px 圆角大卡（图标块 + 两块文字），四张要占掉半屏；
 * 这里只保留「标签 + 数字 + 一句补充」，高度约 1/3，信息量不变。
 */
export function StatTile({ label, value, hint, onClick, className }: StatTileProps) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col items-start rounded-2xl border border-border bg-card px-4 py-3 text-left',
        onClick && 'transition-colors hover:bg-muted/50',
        className,
      )}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <span className="mt-1 flex items-baseline gap-1 text-[19px] font-black leading-none tabular-nums text-foreground">
        {value}
      </span>
      {hint && <span className="mt-1 text-[10px] text-muted-foreground tabular-nums">{hint}</span>}
    </Comp>
  );
}
