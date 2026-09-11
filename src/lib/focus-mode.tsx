/**
 * Focus mode — 沉浸式学习模式。
 *
 * 学习会话（闪卡、复习、阅读器）进行中时隐藏全局导航（侧边栏 / 顶栏 / 移动端底栏），
 * 让整个视口只呈现当前学习内容。借鉴 Duolingo 课堂模式：会话自带返回 + 进度，
 * 全局导航是干扰源。
 *
 * 用法（声明式）：
 *   const inSession = ...;
 *   useImmersive(inSession);   // 挂载期间自动开关，卸载自动恢复
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface FocusModeValue {
  focused: boolean;
  setFocused: (v: boolean) => void;
}

const FocusModeContext = createContext<FocusModeValue>({ focused: false, setFocused: () => {} });

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [focused, setFocused] = useState(false);

  // body class 供 CSS 钩子使用（背景氛围、过滚动条等）
  useEffect(() => {
    document.body.classList.toggle('app-focus-mode', focused);
    return () => document.body.classList.remove('app-focus-mode');
  }, [focused]);

  return <FocusModeContext.Provider value={{ focused, setFocused }}>{children}</FocusModeContext.Provider>;
}

export function useFocusMode() {
  return useContext(FocusModeContext);
}

/**
 * 声明式：active 为 true 期间开启专注模式，变 false 或卸载时自动恢复。
 * 多个会话同时声明时按计数管理，避免提前退出。
 */
export function useImmersive(active: boolean) {
  const { setFocused } = useFocusMode();
  useEffect(() => {
    if (!active) return;
    setFocused(true);
    return () => setFocused(false);
  }, [active, setFocused]);
}
