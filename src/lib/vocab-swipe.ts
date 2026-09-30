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
 *  - 已评分 → 左滑回上一张方向 / 右滑下一张，**不必先翻面**。
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
  /**
   * 已评分的卡（回看 / 答错重排再现的那张）**滑动即导航**，不再要求先翻面。
   *
   * 2026-09-30：答错重排现在真的会把词回插队列（见 FlashcardMode 的 pendingRelearnRef），
   * 它再现时是 front 朝上的回看态 —— 旧表在这个状态下返回 'flip'，手机上表现为"滑了
   * 没反应"，正好叠成用户体感里的"卡住"。已评过的卡不存在盲滑刷进度的问题，直接翻页。
   */
  if (opts.rated) return left ? 'prev' : 'next';
  if (!opts.isFlipped) return 'flip';
  return left ? 'rate-unknown' : 'rate-known';
}
