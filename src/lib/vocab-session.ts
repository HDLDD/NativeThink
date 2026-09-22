/**
 * vocab-session — 复习会话的排卡逻辑（纯函数，便于单测）。
 *
 * 从 FlashcardMode 抽出来的原因有两个：
 *  ① **答错立即重排**（Anki 的 learning steps / relearn）需要维护一个会增长的顺序表，
 *     逻辑分支多，写在组件里只能靠真机手点；
 *  ② 原先组件直接用 `queue`（依赖 state.progress 的 memo）配 `currentIdx`，而每评一次分
 *     state 就变、queue 随之重算 —— 会话中途顺序会漂。会话一旦开始就应该**冻结**顺序。
 *
 * 因此这里把「本轮顺序」做成显式的 key 数组，所有增删都在这个数组上进行。
 */

/** 答错的词隔几张再出现（太小会立刻重复、太大会失去即时巩固的意义） */
export const RELEARN_GAP = 4;
/** 同一个词在一轮里最多重排几次，避免一直答错导致队列无限增长 */
export const MAX_RELEARN = 2;

export interface ISessionOrder {
  /** 本轮出卡顺序（word key） */
  order: string[];
  /** 每个词已重排次数 */
  relearnCounts: Record<string, number>;
}

export function createSessionOrder(keys: string[]): ISessionOrder {
  return { order: [...keys], relearnCounts: {} };
}

/**
 * 答错后把该词重新插入到当前位置之后 RELEARN_GAP 张的位置。
 *
 * 边界：
 *  - 已重排次数达到 MAX_RELEARN → 不再插入（原样返回，靠 SM-2 下次复习兜住）；
 *  - 先把该词的**所有**旧位置删掉再插入（否则会出现同一张卡在同一轮里存在两份）；
 *  - 插入点超出队尾时**放到队尾**（而不是回绕到开头 —— 回绕会让用户立刻又看到同一个词）。
 */
export function scheduleRelearn(
  session: ISessionOrder,
  currentIndex: number,
  key: string,
  opts: { gap?: number; maxRelearn?: number } = {},
): ISessionOrder {
  const gap = opts.gap ?? RELEARN_GAP;
  const maxRelearn = opts.maxRelearn ?? MAX_RELEARN;
  const used = session.relearnCounts[key] ?? 0;
  if (used >= maxRelearn) return session;

  const rest = session.order.filter((k) => k !== key);
  const insertAt = Math.min(currentIndex + gap, rest.length);
  const next = [...rest.slice(0, insertAt), key, ...rest.slice(insertAt)];

  return { order: next, relearnCounts: { ...session.relearnCounts, [key]: used + 1 } };
}

/** 下一张的下标；走到末尾返回 null（表示本轮结束，由调用方决定是否再开一轮） */
export function nextIndex(session: ISessionOrder, currentIndex: number): number | null {
  return currentIndex + 1 < session.order.length ? currentIndex + 1 : null;
}

/** 未来 N 天的到期预测：把 nextReview 按本地日期分桶（用于"明天 N 个"与负担条） */
export function forecastByDay(
  progresses: { nextReview: number }[],
  days = 7,
  now = Date.now(),
): number[] {
  const out = new Array(days).fill(0);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  for (const p of progresses) {
    if (!p.nextReview) continue;
    const diff = Math.floor((p.nextReview - start.getTime()) / dayMs);
    if (diff < 0) { out[0] += 1; continue; }   // 已逾期 → 记到今天
    if (diff < days) out[diff] += 1;
  }
  return out;
}
