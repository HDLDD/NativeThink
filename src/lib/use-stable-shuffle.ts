import { useEffect, useMemo, useState } from 'react';

/**
 * useStableShuffle — 洗牌一次、之后只增删的稳定题目顺序。
 *
 * 解决的模式级 bug：`useMemo(() => items.sort(() => Math.random() - 0.5), [items])`
 * 的依赖是数组身份，AI 出题/删除条目都会触发**整体重新洗牌** —— currentIdx 不变
 * 但指向的题变了，正作答的题面悄悄换掉，已输入的内容按错误题面送评
 * （思维训练 / 语块训练两页都踩过）。
 *
 * 语义：
 *  - 首次有数据时随机洗牌（每次进页面保持随机起点的多样性）；
 *  - 之后集合变化只做**增量同步**：旧条目保持相对顺序，新条目**追加到末尾**
 *    （当前题永不漂移），被删条目移除；
 *  - 集合未变时返回稳定引用。
 */
export function useStableShuffle<T extends { id: string }>(items: T[]): T[] {
  const byId = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  // 顺序信号：只跟"有哪些 id"挂钩，与数组身份/内容细节无关
  const sig = useMemo(() => items.map((it) => it.id).join('\n'), [items]);
  // 首渲染**同步**初始化顺序 —— 此前初始为 []，首帧恒返回空数组：
  // 经 usePageMemory 恢复到「接龙/翻译练习」等 tab 的用户，挂载首渲染就访问
  // items[currentIdx].xxx → TypeError 白屏（ErrorBoundary 都救不回来，重试还是首帧空）
  const [order, setOrder] = useState<string[]>(() => {
    const ids = items.map((it) => it.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  });

  useEffect(() => {
    setOrder((prev) => {
      if (byId.size === 0) return prev.length === 0 ? prev : [];
      const prevSet = new Set(prev);
      // 1) 仍存在的旧条目保持原相对顺序
      const kept = prev.filter((id) => byId.has(id));
      // 2) 新条目追加到末尾（不打乱当前题的位置）
      const added = [...byId.keys()].filter((id) => !prevSet.has(id));
      const next = [...kept, ...added];
      if (next.length === prev.length && next.every((id, i) => prev[i] === id)) return prev;
      return next;
    });
    // sig 才是真正的触发源；byId 随 items 身份每渲染变化，但 sig 不变就不该重排
  }, [sig]);

  return useMemo(() => {
    const out: T[] = [];
    for (const id of order) {
      const it = byId.get(id);
      if (it) out.push(it);
    }
    return out;
  }, [order, byId]);
}
