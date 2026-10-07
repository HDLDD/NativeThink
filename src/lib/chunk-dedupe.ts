/**
 * chunk-dedupe — 把"同一短语在库里登记了两次"收敛在读取层。
 *
 * 为什么不去删数据：主库有 12 组 content 相同、只有 category / 例句 / 措辞不同的条目
 * （如 `call the shots` 同时挂在 daily 与 workplace）。删掉一条会 ① 让用户已记的 id 凭空失效
 * ② 丢掉另一条不同的例句 ③ 抹掉"这条也属于职场"这个事实（分类筛选会少一条）。
 * 所以照词库那套惯例走**读取层去重**（见 docs/modules/wordbank-data.md 的两层去重）。
 *
 * 口径：**筛选之后、分页/洗牌之前**按归一化 content 保留第一条。
 * 于是分类视图各自仍看得到自己那条，只有「全部」把它们并成一条；
 * 洗牌/接龙用去重后的池子，同一短语不会再一轮出两张卡。
 */

/** 归一化：小写、压空白、统一撇号（’ 与 ' 视为同一个字符） */
export function chunkKey(content: string): string {
  return (content || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[’']/g, "'");
}

/** 同一列表内按 content 去重，保留首次出现的那条 */
export function dedupeChunks<T extends { content: string }>(list: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of list) {
    const k = chunkKey(c.content);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/** content 归一化键 → 该短语在库里的全部 id */
export function chunkSiblings<T extends { id: string; content: string }>(
  list: readonly T[],
): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const c of list) {
    const k = chunkKey(c.content);
    const arr = m.get(k);
    if (arr) arr.push(c.id);
    else m.set(k, [c.id]);
  }
  return m;
}

/**
 * 「已记」按 id 存，同一短语有两条 id 就会出现"标记了一条、另一条看着没记"。
 * 两个动作消掉这个裂缝：读入时把历史数据补齐成兄弟 id，切换时一次写全组。
 */
export function expandMemorized<T extends { id: string; content: string }>(
  stored: Iterable<string>,
  list: readonly T[],
): Set<string> {
  const groups = chunkSiblings(list);
  const keyById = new Map(list.map((c) => [c.id, chunkKey(c.content)]));
  const out = new Set<string>();
  for (const id of stored) {
    out.add(id);
    const key = keyById.get(id);
    if (key) for (const sib of groups.get(key) || []) out.add(sib);
  }
  return out;
}

/** 切换某个语块的已记状态 —— 同 content 的兄弟 id 一起改，保证两条视图一致 */
export function toggleMemorizedGroup<T extends { id: string; content: string }>(
  current: ReadonlySet<string>,
  chunk: T,
  list: readonly T[],
): Set<string> {
  const next = new Set(current);
  const ids = chunkSiblings(list).get(chunkKey(chunk.content)) || [chunk.id];
  const on = !next.has(chunk.id);
  for (const id of ids) { if (on) next.add(id); else next.delete(id); }
  return next;
}
