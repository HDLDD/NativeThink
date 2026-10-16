import { useState, useEffect, useCallback } from 'react';
import { safeStorage } from './safe-storage';
import { useSyncDown } from './sync-down';
import { warnStorageFull } from './capped-cache';

const FAVORITES_KEY = '__nativethink_favorites';
/** Legacy unprefixed backup key — read once for migration, then removed */
const FAVORITES_LEGACY_KEY = '__nativethink_favorites_v2';

export interface IFavoriteItem {
  id: string;
  type: 'chunk' | 'expression' | 'vocabulary' | 'think' | 'shadowing' | 'word' | 'article' | 'writing_prompt' | 'spelling';
  content: string;
  meaning: string;
  example?: string;
  category: string;
  createdAt: number;
}

/** One-time migration: move legacy unprefixed favorites into user-scoped safeStorage */
function migrateLegacyFavorites(): void {
  try {
    const legacy = localStorage.getItem(FAVORITES_LEGACY_KEY);
    if (!legacy) return;
    if (!safeStorage.getItem(FAVORITES_KEY)) {
      safeStorage.setItem(FAVORITES_KEY, legacy);
    }
    localStorage.removeItem(FAVORITES_LEGACY_KEY);
  } catch { /* ignore */ }
}

/**
 * 词族：同一个单词的两种收藏来源 —— 词库浏览存 'vocabulary'、学习卡存 'word'。
 * 判重与删除必须同时看两个 type（vocabulary.md 收藏一节的既定口径）。
 */
export function isWordFavType(t: IFavoriteItem['type']): boolean {
  return t === 'word' || t === 'vocabulary';
}

/**
 * 同词去重：2026-10-15 前的旧版判重只看单一 type，同一单词可能存了 'vocabulary' + 'word'
 * 两条 —— 两 type 判重下 isFav 恒真，点一下只删掉一条，星标看起来"点了没反应"。
 * 保留 createdAt 较新的一条（其他条目顺序不变）。载入时跑一遍并回写，存量脏数据自愈。
 */
export function dedupeWordFavs(items: IFavoriteItem[]): IFavoriteItem[] {
  const kept = new Map<string, IFavoriteItem>();
  const out: IFavoriteItem[] = [];
  for (const f of items) {
    if (isWordFavType(f.type)) {
      const prev = kept.get(f.content);
      if (prev) {
        if (f.createdAt > prev.createdAt) out[out.indexOf(prev)] = f;
        continue;
      }
      kept.set(f.content, f);
    }
    out.push(f);
  }
  return out;
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<IFavoriteItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadFromStorage = useCallback(() => {
    try {
      const saved = safeStorage.getItem(FAVORITES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as IFavoriteItem[];
        // 同词双条目去重（词族口径）—— 存在脏数据就回写，不派事件（防 reload 循环）
        const cleaned = dedupeWordFavs(parsed);
        if (cleaned.length !== parsed.length) {
          try { safeStorage.setItem(FAVORITES_KEY, JSON.stringify(cleaned)); } catch { /* ignore */ }
        }
        setFavorites(cleaned);
      }
    } catch {
      // storage unavailable — use defaults
    }
  }, []);

  // Load on mount
  useEffect(() => {
    migrateLegacyFavorites();
    loadFromStorage();
    setLoaded(true);
  }, [loadFromStorage]);

  // Re-load when cloud sync completes (syncDown populates localStorage)
  useSyncDown(loadFromStorage);

  // Re-load when another tab/component updates favorites
  useEffect(() => {
    const onFavoritesChanged = () => loadFromStorage();
    window.addEventListener('nativethink-favorites-changed', onFavoritesChanged);
    return () => window.removeEventListener('nativethink-favorites-changed', onFavoritesChanged);
  }, [loadFromStorage]);

  const persist = useCallback((items: IFavoriteItem[]) => {
    setFavorites(items);
    /**
     * safeStorage.setItem 配额满时**返回 false 而不抛错** —— 只写 try/catch 看不见失败，
     * 表现就是"星标点了会亮（内存已改）、退出回来又没了"（2026-10-16 用户报"无法收藏仍存在"）。
     * 收藏是用户清单、不可重算：写失败必须像 persistJson 一样喊出来，不许静默。
     */
    if (!safeStorage.setItem(FAVORITES_KEY, JSON.stringify(items))) {
      warnStorageFull();
    }
    // Notify other mounted favorites consumers (e.g. CollocationsTab / page heart icons)
    try { window.dispatchEvent(new Event('nativethink-favorites-changed')); } catch { /* ignore */ }
  }, []);

  const addFavorite = useCallback(
    (item: Omit<IFavoriteItem, 'id' | 'createdAt'>) => {
      // 词族判重：同词的 'word'/'vocabulary' 视为同一条（跨来源收藏不再同词存两条）
      const exists = favorites.some(
        (f) => f.content === item.content && (f.type === item.type || (isWordFavType(item.type) && isWordFavType(f.type))),
      );
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
      const target = favorites.find((f) => f.id === id);
      if (!target) { persist(favorites); return; }
      // 词族删除：删掉的若是单词条目，它的同词异 type 孪生条目一并清掉 ——
      // 否则存量双条目下点一下只删一条，星标看起来"点了没反应"
      persist(favorites.filter(
        (f) => f.id !== id && !(isWordFavType(target.type) && isWordFavType(f.type) && f.content === target.content),
      ));
    },
    [favorites, persist],
  );

  /** 一键清空 —— 循环调 removeFavorite 会因陈旧闭包只删掉最后一条（ProgressPage 重置踩过） */
  const clearAll = useCallback(() => {
    persist([]);
  }, [persist]);

  const isFavorited = useCallback(
    (content: string, type: IFavoriteItem['type']) => {
      return favorites.some((f) => f.content === content && f.type === type);
    },
    [favorites],
  );

  /** 词族判重版「是否已收藏」：同词的 'word'/'vocabulary' 两条来源视为同一条 ——
   *  学习卡（'word'）与词库浏览（'vocabulary'）的星标/心形都必须用这个，
   *  否则跨来源收藏过的词显示未收藏、再点就同词存两条（2026-10-15 用户报告）。 */
  const isWordFavorited = useCallback(
    (content: string) => favorites.some((f) => isWordFavType(f.type) && f.content === content),
    [favorites],
  );

  return {
    favorites,
    isWordFavorited,
    loaded,
    addFavorite,
    removeFavorite,
    clearAll,
    isFavorited,
  };
}
