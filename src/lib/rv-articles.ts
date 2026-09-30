/**
 * rv-articles — 「用复习词汇生成文章」（阅读页 AI 标签）的纯函数层。
 *
 * 这套功能有三条容易做坏的语义，全部收在这里以便单测：
 *  1. **词表 = 到期词 − 任何一篇现存文章用过的词**（`rvWords`）。
 *     「已经生成的复习单词从记录里删除、未被选中的保留」就是这条派生 ——
 *     不存在单独的"已用清单"：两份真相一定会漂移，而这里删掉文章就自动放回。
 *  2. **分篇**：按「每篇词数」把选中的词切批；一次最多生成 `limit` 篇，
 *     超出的批次**不消费**（对应词仍在词表与选中态里，下次可继续）。
 *  3. 一篇文章声明它用掉了哪些词（`rvWords`）是书面的、可回放的依据。
 */
export interface IRvArticleLike {
  /** 该文章用掉的待复习词（小写 wordKey）；非复习词汇文章没有此字段 */
  rvWords?: string[] | null;
}

/** 所有现存文章用过的词 key（并集；重复词、空串都安全） */
export function usedReviewWordKeys(articles: IRvArticleLike[]): Set<string> {
  const used = new Set<string>();
  for (const a of articles) {
    for (const k of a.rvWords ?? []) {
      if (k) used.add(k);
    }
  }
  return used;
}

/** 待复习词表：过期词里**去掉已被文章用掉的**，保持原顺序 */
export function reviewWordRecord<T extends { wordKey: string }>(due: T[], used: Set<string>): T[] {
  return due.filter((w) => !used.has(w.wordKey));
}

/**
 * 把选中的词按「每篇词数」切批；最多保留 `limit` 批。
 * `skippedBatches` = 因超限没有排进本次的批数（对应词不消费，留在列表）。
 */
export function planRvBatches<T>(
  selected: T[],
  perArticle: number,
  limit: number,
): { batches: T[][]; skippedBatches: number } {
  const per = Math.max(1, Math.floor(perArticle));
  const all: T[][] = [];
  for (let i = 0; i < selected.length; i += per) all.push(selected.slice(i, i + per));
  const keep = Math.max(0, Math.floor(limit));
  return { batches: all.slice(0, keep), skippedBatches: Math.max(0, all.length - keep) };
}
