// localStorage-backed page state memory — remembers tab, filters, scroll position
import { useState, useEffect } from 'react';
import { safeStorage } from './safe-storage';

function restoreValue<T>(raw: string | null, defaults: T): T {
  if (!raw) return defaults;
  try {
    const saved = JSON.parse(raw);
    // Only spread for plain objects; primitives (string, number) are used as-is
    if (typeof defaults === 'object' && defaults !== null && !Array.isArray(defaults)) {
      // Guard: if saved is not an object, fall back to defaults
      if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) {
        return defaults;
      }
      return { ...defaults, ...saved };
    }
    // Guard: if saved type doesn't match defaults type, fall back to defaults
    // (handles corrupted data from previous buggy versions)
    if (typeof saved !== typeof defaults) {
      return defaults;
    }
    return saved;
  } catch {
    return defaults;
  }
}

export function usePageMemory<T>(key: string, defaults: T): [T, (val: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    const raw = safeStorage.getItem(key);
    return restoreValue(raw, defaults);
  });

  useEffect(() => {
    try {
      safeStorage.setItem(key, JSON.stringify(state));
    } catch { /* ignore */ }
  }, [key, state]);

  return [state, setState];
}

/** Debounced version for rapidly-changing values like search queries */
export function usePageMemoryDebounced<T>(key: string, defaults: T, delay = 400): [T, (val: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    const raw = safeStorage.getItem(key);
    return restoreValue(raw, defaults);
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        safeStorage.setItem(key, JSON.stringify(state));
      } catch { /* ignore */ }
    }, delay);
    return () => clearTimeout(timer);
  }, [key, state, delay]);

  return [state, setState];
}
