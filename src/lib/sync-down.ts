/**
 * sync-down — 云同步"下行落地"后的重读广播（单一出口）。
 *
 * 背景：`use-cloud-sync` 的 `syncDown` 把远端数据写进 storage 后，需要通知各数据 hook 重读。
 * 2026-09-30 之前只有 3 个 hook 订阅（收藏 / 学习统计 / 拼写句子库），其余持**陈旧内存态**：
 * A 设备改了，B 设备要重开页面才看到；更糟的是 B 上的陈旧实例下一次写入会把刚拉下来的新值**覆盖回去**。
 *
 * 所以把订阅收成一个函数，两个原因：
 *  1. 事件名只有一处定义，"谁订阅了"变成可断言的清单（`verify-cloud-sync` ④ 数得出来）；
 *  2. `onSyncDown` 是可注入 target 的**纯订阅**，能在 Node 里用假 window 真跑，
 *     不用为了测一行 addEventListener 去挂 React。
 */

import { useEffect, useRef } from 'react';

export const SYNC_DOWN_EVENT = 'nativethink-sync-down';

interface EventTargetLike {
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
}

/**
 * 订阅下行事件，返回退订函数。
 * 订阅者抛错不能影响其它订阅者（一次下行会通知全部 hook，一个坏订阅者不该让后面的都不重读）。
 */
export function onSyncDown(cb: () => void, target: EventTargetLike = window): () => void {
  const handler = () => {
    try { cb(); } catch { /* 单个订阅者出错不传染 */ }
  };
  target.addEventListener(SYNC_DOWN_EVENT, handler);
  return () => target.removeEventListener(SYNC_DOWN_EVENT, handler);
}

/** 下行落地后由 `use-cloud-sync` 调用（别处不要再自己拼事件名） */
export function emitSyncDown(): void {
  try { window.dispatchEvent(new Event(SYNC_DOWN_EVENT)); } catch { /* SSR / 无 window */ }
}

/**
 * Hook 版：cb 用 ref 存最新闭包，订阅只发生一次（挂载）。
 * 不写成 `useEffect(..., [cb])` —— 那样每次 render 都要退订再订阅，
 * 下行事件如果正好落在中间就被吞了。
 */
export function useSyncDown(cb: () => void): void {
  const ref = useRef(cb);
  useEffect(() => { ref.current = cb; });
  useEffect(() => onSyncDown(() => ref.current()), []);
}
