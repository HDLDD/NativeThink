import { useState, useEffect, useCallback } from 'react';
import { safeStorage } from './safe-storage';

const FAVORITES_KEY = '__nativethink_favorites';

export interface IFavoriteItem {
  id: string;
  type: 'chunk' | 'expression' | 'vocabulary' | 'think' | 'shadowing' | 'word' | 'article' | 'writing_prompt';
  content: string;
  meaning: string;
  example?: string;
  category: string;
  createdAt: number;
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<IFavoriteItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = safeStorage.getItem(FAVORITES_KEY);
      if (saved) {
        setFavorites(JSON.parse(saved));
      }
    } catch {
      // storage unavailable — use defaults
    } finally {
      setLoaded(true);
    }
  }, []);

  const persist = useCallback((items: IFavoriteItem[]) => {
    setFavorites(items);
    try {
      safeStorage.setItem(FAVORITES_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  }, []);

  const addFavorite = useCallback(
    (item: Omit<IFavoriteItem, 'id' | 'createdAt'>) => {
      const exists = favorites.some((f) => f.content === item.content && f.type === item.type);
      if (exists) return false;
      const newItem: IFavoriteItem = {
        ...item,
        id: `fav_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
      };
      persist([newItem, ...favorites]);
      return true;
    },
    [favorites, persist],
  );

  const removeFavorite = useCallback(
    (id: string) => {
      persist(favorites.filter((f) => f.id !== id));
    },
    [favorites, persist],
  );

  const isFavorited = useCallback(
    (content: string, type: IFavoriteItem['type']) => {
      return favorites.some((f) => f.content === content && f.type === type);
    },
    [favorites],
  );

  return {
    favorites,
    loaded,
    addFavorite,
    removeFavorite,
    isFavorited,
  };
}
