/**
 * vocab-swipe — 背单词卡片的滑动手势判定（纯函数，便于单测）。
 *
 * 从 FlashcardMode 的 onTouchEnd 里抽出来：手势分支多（未翻面 / 已翻面未评分 /
 * 已评分 / 位移不足），写在组件里只能靠真机手点，抽成纯函数就能把**整张决策表**测掉。
 *
 * 约定（对齐主流背单词 App）：
 *  - 位移不足阈值 → 视为点击，不处理；
 *  - 未翻面 → 滑动只翻面（必须先看到释义再自评，避免盲滑刷进度）；
 *  - 已翻面未评分 → 左滑=不认识(2) / 右滑=认识(4)；
 *  - 已评分 → 左滑回上一张方向 / 右滑下一张。
 */
export type SwipeAction = 'none' | 'flip' | 'rate-unknown' | 'rate-known' | 'next' | 'prev';

export const SWIPE_THRESHOLD = 80;
/** 左滑 = 不认识 → SM-2 quality 2；右滑 = 认识 → quality 4 */
export const SWIPE_QUALITY_UNKNOWN = 2;
export const SWIPE_QUALITY_KNOWN = 4;

export function decideSwipe(opts: {
  dx: number;
  isFlipped: boolean;
  rated: boolean;
  threshold?: number;
}): SwipeAction {
  const threshold = opts.threshold ?? SWIPE_THRESHOLD;
  if (Math.abs(opts.dx) < threshold) return 'none';
  const left = opts.dx < 0;
  if (!opts.isFlipped) return 'flip';
  if (opts.rated) return left ? 'prev' : 'next';
  return left ? 'rate-unknown' : 'rate-known';
}
