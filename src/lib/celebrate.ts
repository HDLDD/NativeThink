/**
 * celebrate.ts —— 「奖励时刻」的唯一入口。
 *
 * 为什么是 sink 而不是组件：奖励层全站只能有一个出口（和 <Toaster /> 同一口径，
 * 出现第二个挂载点 verify-overlay-fit ⑤ 那类扫描就该断言失败）。页面只调 celebrate()，
 * 不各自引一个 canvas —— 那会长出 N 份动画与 N 份 rAF。
 *
 * 拿不到 sink（层没挂上）或拿不到 2d context 时**静默 no-op**：
 * 绝不允许回退成 toast —— 那正好破掉「结果不靠文字」这条判据。
 */
export type CelebrateKind = 'perfect-round' | 'streak-7';

type Sink = (kind: CelebrateKind, anchor: Element | null) => void;
let sink: Sink | null = null;

/** 由 CelebrateLayer 在挂载时注册、卸载时注销 */
export function attachCelebrationSink(next: Sink | null): void {
  sink = next;
}

export function celebrate(kind: CelebrateKind, anchor?: Element | null): void {
  if (!sink) return;
  sink(kind, anchor ?? null);
}

/** 一个时刻只走一个色系：全对=品牌青绿一族，连击=琥珀一族。混色会显得廉价。 */
export function celebrationPalette(kind: CelebrateKind): string[] {
  return kind === 'streak-7' ? ['#F59E0B', '#FBBF24', '#FDE68A'] : ['#00B894', '#4DD0B0', '#99F6E4'];
}
