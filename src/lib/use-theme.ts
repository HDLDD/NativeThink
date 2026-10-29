import { useState, useEffect, useCallback } from 'react';
import { safeStorage } from './safe-storage';

const THEME_KEY = '__nativethink_theme';

export type Theme = 'light' | 'dark';

/** 读已保存的明暗；读不到就按亮色。挂载前与 hook 初始状态共用同一口径。 */
export function readThemeMode(): Theme {
  try {
    const saved = safeStorage.getItem(THEME_KEY) as Theme | null;
    return saved === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** 在 createRoot 之前调用：避免深色用户刷新时先闪一帧亮色再被 effect 切暗。 */
export function initThemeMode(): void {
  document.documentElement.classList.toggle('dark', readThemeMode() === 'dark');
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => readThemeMode());

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      safeStorage.setItem(THEME_KEY, t);
    } catch {
      // scopedStorage unavailable — non-critical
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
