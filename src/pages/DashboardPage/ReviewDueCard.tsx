import { memo } from 'react';
import { RefreshCcw, ChevronRight } from 'lucide-react';

/**
 * 首页「今日待复习」横幅 —— 与侧边栏角标同一数据源（useGlobalDueCount，
 * 直扫 SM-2 存储，不挂完整学习状态实例）。
 *
 * 口径：dueCount > 0 才渲染。到期为 0 时整卡隐藏而不是渲染一张"已清零"的卡
 * ——横幅要配得上它的面积，没有复习义务就不该占一行（侧边栏角标负责常驻信号）。
 */
interface ReviewDueCardProps {
  dueCount: number;
  onNavigate: (path: string) => void;
}

function ReviewDueCardInner({ dueCount, onNavigate }: ReviewDueCardProps) {
  if (dueCount <= 0) return null;
  return (
    <button
      onClick={() => onNavigate('/vocabulary')}
      className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-3 text-left hover:border-[#00B894]/40 hover:shadow-md transition-all group"
    >
      <span className="size-8 rounded-xl bg-amber-50 dark:bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
        <RefreshCcw className="size-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground">间隔重复复习</span>
        <span className="block text-sm font-black text-foreground group-hover:text-ink-teal transition-colors truncate">
          今日待复习 <span className="text-ink-teal">{dueCount}</span> 个词条
        </span>
      </span>
      <span className="flex items-center gap-0.5 text-[10px] font-black uppercase tracking-wider text-ink-teal shrink-0">
        去复习
        <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

export const ReviewDueCard = memo(ReviewDueCardInner);
