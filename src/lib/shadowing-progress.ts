/**
 * shadowing-progress — 跟读完成标记的键构造与索引维护（纯函数）。
 *
 * 为什么单独抽出来：完成键 `${corpusId}-${句序}` 里的「句序」是**合并数组索引**
 * —— 页面上的 `allSentences = corpus.sentences + extraSentences[id]`（AI 追加句接在后面）。
 * 而 extras 本身是一份独立数组，用它自己的**本地索引**。删掉一条 AI 追加句要同时做两件事：
 *
 *   ① 按**合并索引**位移完成键（删掉被删句的标记，其后全部 −1）；
 *   ② 按**本地索引**过滤 extras 数组。
 *
 * 此前页面把同一个数字当两件事用（删除按钮传本地索引进只做位移的函数），真机表现是：
 * 原 8 句 + 追加 3 句时删掉第一条追加句 → `id-0`（第 1 句的标记）被删、`id-1…id-10`
 * 集体下移一位 → 完成数少 1、绿勾指到错误的句子、`totalCompleted >= totalSentences` 不再成立，
 * **100% 成就横幅与「再来一遍」按钮永久消失**。
 *
 * 索引换算因此只允许发生在这一处，并由 `scripts/verify-shadowing-completion.mjs` 真跑单测。
 */

/** 完成标记的存储键 —— 合并索引（含 AI 追加句） */
export const shadowingCompletionKey = (corpusId: string, mergedIdx: number): string =>
  `${corpusId}-${mergedIdx}`;

/** 从键里解析出合并索引；不属于该语料或格式非法时返回 null */
export function parseCompletionIndex(key: string, corpusId: string): number | null {
  const prefix = `${corpusId}-`;
  if (!key.startsWith(prefix)) return null;
  const rest = key.slice(prefix.length);
  // 只接受纯数字，避免语料 id 之间互为前缀时串味（"1" 与 "1-2" 这类历史 id）
  if (!/^\d+$/.test(rest)) return null;
  return Number(rest);
}

/** 某语料已完成的句数 —— 只按该语料的键计数，跨语料不串 */
export function countCompletedForCorpus(keys: Iterable<string>, corpusId: string): number {
  let n = 0;
  for (const k of keys) if (parseCompletionIndex(k, corpusId) !== null) n++;
  return n;
}

/** 该句是否已完成 */
export function isSentenceCompleted(
  keys: Iterable<string>,
  corpusId: string,
  mergedIdx: number,
): boolean {
  const target = shadowingCompletionKey(corpusId, mergedIdx);
  for (const k of keys) if (k === target) return true;
  return false;
}

/**
 * 删除一句后重排完成键：被删句的标记消失，其后每句 −1，其余语料原样保留。
 * `deletedMergedIdx` 必须是**合并索引**。
 */
export function shiftCompletionAfterDelete(
  keys: Iterable<string>,
  corpusId: string,
  deletedMergedIdx: number,
): Set<string> {
  const next = new Set<string>();
  for (const k of keys) {
    const i = parseCompletionIndex(k, corpusId);
    if (i === null) { next.add(k); continue; }
    if (i < deletedMergedIdx) next.add(k);
    else if (i > deletedMergedIdx) next.add(shadowingCompletionKey(corpusId, i - 1));
    // i === deletedMergedIdx：随句子一起删除
  }
  return next;
}

/** 清掉某语料的全部完成标记（「再来一遍」） */
export function clearCompletionForCorpus(keys: Iterable<string>, corpusId: string): Set<string> {
  const next = new Set<string>();
  for (const k of keys) if (parseCompletionIndex(k, corpusId) === null) next.add(k);
  return next;
}

/**
 * 合并索引 → extras 本地索引。
 * 守卫：只有 `mergedIdx >= baseLen`（即落在 AI 追加段）才是合法删除目标，
 * 否则返回 −1，调用方必须放弃删除 —— 内置原句不可删。
 */
export function extrasLocalIndex(mergedIdx: number, baseLen: number): number {
  return mergedIdx >= baseLen ? mergedIdx - baseLen : -1;
}
