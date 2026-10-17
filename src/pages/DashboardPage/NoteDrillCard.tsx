import { memo } from 'react';
import { Lightbulb, ChevronRight } from 'lucide-react';

/**
 * 首页「表达纠偏待重考」横幅 —— 纠偏本（`correction-notes`）的到达率入口。
 *
 * 为什么需要：纠偏本三处自动收集 + 收藏页回看 + 词汇页第 9 模式重考 + 句子拼写，
 * 是一条完整的"认错句"链路，但**入口藏在词汇页九个模式的最后一屏** —— 用户不会每天
 * 去翻。与「今日待复习」同理：**0 条整卡不渲染**（横幅要配得上它的面积，没有义务就不占行）。
 *
 * 点击带 `?tab=correction` 深链，由词汇页一步落进「纠偏重考」（不用再点一次模式卡）。
 *
 * 计数口径 = **还没重认过的条数**（`review` 为空的那些）—— 与「今日待复习」同一种语义：
 * 重考过就从横幅退场，不把用户已经处理过的东西常驻催他。要看全部条目去收藏页。
 */
interface NoteDrillCardProps {
  pendingCount: number;
  onNavigate: (path: string) => void;
}

function NoteDrillCardInner({ pendingCount, onNavigate }: NoteDrillCardProps) {
  if (pendingCount <= 0) return null;
  return (
    <button
      onClick={() => onNavigate('/vocabulary?tab=correction')}
      className="w-full flex items-center gap-3 rounded-2xl border border-orange-200/60 dark:border-orange-500/20 bg-card px-5 py-3 text-left hover:border-orange-400/50 hover:shadow-md transition-all group"
    >
      <span className="size-8 rounded-xl bg-orange-50 dark:bg-orange-500/15 text-orange-500 flex items-center justify-center shrink-0">
        <Lightbulb className="size-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground">表达纠偏</span>
        <span className="block text-sm font-black text-foreground group-hover:text-orange-600 transition-colors truncate">
          <span className="text-orange-500">{pendingCount}</span> 条中式表达还没重认过 · 认完可送进拼写
        </span>
      </span>
      <span className="flex items-center gap-0.5 text-[10px] font-black uppercase tracking-wider text-orange-500 shrink-0">
        去重考
        <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

export const NoteDrillCard = memo(NoteDrillCardInner);
