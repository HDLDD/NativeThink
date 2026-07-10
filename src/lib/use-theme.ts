import { useState, useEffect, useCallback } from 'react';
import { safeStorage } from './safe-storage';

const THEME_KEY = '__nativethink_theme';

export type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    try {
      const saved = safeStorage.getItem(THEME_KEY) as Theme | null;
      if (saved === 'light' || saved === 'dark') {
        setThemeState(saved);
      }
    } catch {
      // scopedStorage unavailable — non-critical
    }
  }, []);

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
