import { cn } from '@/lib/utils';

/**
 * 结果层图形件 —— 答对/答错/连击/进度**不写一个字**（练习界面零提示口径的延伸）。
 *
 * 为什么是纯 CSS 而不是 framer-motion：`useFramerMotion()` 带 provider 前置条件，
 * 真机在收藏页整页崩过一次（缺 `<LazyFramerProvider>` 时它曾直接 throw），
 * `verify-overlay-fit` ⑦ 现在逐个宿主点名。结果层要是用 motion 组件，
 * 每个渲染点都得包一层 provider —— 风险面从 1 处涨到 N 处。CSS 没这个问题。
 *
 * 重播放动画的办法是换 `key` 让节点重挂载，不是手工删类再 void offsetWidth。
 */

const R = 15;
const C = 2 * Math.PI * R;   // 94.25

/** 收口弧：value 0..1。走 stroke-dashoffset（paint），不走 layout。 */
export function ScoreArc({ value, size = 34, color = '#00B894', track = 'rgba(100,116,139,0.18)', className }:
  { value: number; size?: number; color?: string; track?: string; className?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg key={v} viewBox="0 0 36 36" width={size} height={size} aria-hidden
      className={cn('fx-arc shrink-0', className)}
      style={{ ['--fx-arc-c' as string]: `${C}`, ['--fx-arc-to' as string]: `${C * (1 - v)}`, ['--fx-arc-color' as string]: color, ['--fx-arc-track' as string]: track }}>
      <circle className="fx-arc-bg" cx="18" cy="18" r={R} />
      <circle className="fx-arc-fg" cx="18" cy="18" r={R} />
    </svg>
  );
}

/** 连击环：套在已有计数外面的一圈扩散环（换 key 才重播） */
export function StreakRing({ n, color = '#F59E0B', className, children }:
  { n: number; color?: string; className?: string; children?: React.ReactNode }) {
  return (
    <span key={n} className={cn('relative inline-flex items-center justify-center', n > 0 && 'fx-ring', className)}
      style={{ ['--fx-ring-color' as string]: color }}>
      {children}
    </span>
  );
}

/** 卡角的判定色点：未判定=中性，绝不用"成功"那一套去蒙一个没判的 */
export function VerdictDot({ state, className }: { state: 'ok' | 'miss' | 'pending'; className?: string }) {
  const color = state === 'ok' ? '#00B894' : state === 'miss' ? 'hsl(0 45% 52%)' : 'rgba(100,116,139,0.35)';
  return <span aria-hidden className={cn('fx-dot shrink-0', className)} style={{ ['--fx-dot-color' as string]: color }} />;
}

/** 词面轻抖（评"完全忘了"时）：换 key 重播 */
export function shakeKey(prev: number): number { return prev + 1; }
export const SHAKE_CLASS = 'fx-shake';
