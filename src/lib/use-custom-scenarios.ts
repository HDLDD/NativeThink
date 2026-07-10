import { useState, useEffect, useCallback } from 'react';
import { safeStorage } from './safe-storage';

const CUSTOM_SCENARIOS_KEY = '__nativethink_custom_scenarios';

export type IconName =
  | 'Coffee'
  | 'Briefcase'
  | 'MessageCircle'
  | 'Swords'
  | 'Plane'
  | 'ShoppingBag'
  | 'Stethoscope'
  | 'GraduationCap';

export interface ICustomScenario {
  id: string;
  name: string;
  description: string;
  role: string;
  icon: IconName;
  color: string;
  bg: string;
  createdAt: number;
}

const ICON_OPTIONS: { name: IconName; label: string }[] = [
  { name: 'Coffee', label: '咖啡' },
  { name: 'Briefcase', label: '工作' },
  { name: 'MessageCircle', label: '聊天' },
  { name: 'Swords', label: '辩论' },
  { name: 'Plane', label: '旅行' },
  { name: 'ShoppingBag', label: '购物' },
  { name: 'Stethoscope', label: '医疗' },
  { name: 'GraduationCap', label: '学术' },
];

const COLOR_OPTIONS = [
  { color: '#F97316', bg: 'from-orange-50 to-amber-50 dark:from-orange-500/10 dark:to-amber-500/10', label: '活力橙' },
  { color: '#6366F1', bg: 'from-indigo-50 to-violet-50 dark:from-indigo-500/10 dark:to-violet-500/10', label: '沉静紫' },
  { color: '#00B894', bg: 'from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10', label: '清新绿' },
  { color: '#EC4899', bg: 'from-pink-50 to-rose-50 dark:from-pink-500/10 dark:to-rose-500/10', label: '浪漫粉' },
  { color: '#3B82F6', bg: 'from-blue-50 to-cyan-50 dark:from-blue-500/10 dark:to-cyan-500/10', label: '天空蓝' },
  { color: '#EF4444', bg: 'from-red-50 to-orange-50 dark:from-red-500/10 dark:to-orange-500/10', label: '热情红' },
];

export { ICON_OPTIONS, COLOR_OPTIONS };

export function useCustomScenarios() {
  const [scenarios, setScenarios] = useState<ICustomScenario[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = safeStorage.getItem(CUSTOM_SCENARIOS_KEY);
      if (saved) {
        setScenarios(JSON.parse(saved));
      }
    } catch {
      // storage unavailable — use defaults
    } finally {
      setLoaded(true);
    }
  }, []);

  const persist = useCallback((items: ICustomScenario[]) => {
    setScenarios(items);
    try {
      safeStorage.setItem(CUSTOM_SCENARIOS_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  }, []);

  const addScenario = useCallback(
    (item: Omit<ICustomScenario, 'id' | 'createdAt'>) => {
      const newItem: ICustomScenario = {
        ...item,
        id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
      };
      persist([...scenarios, newItem]);
      return newItem;
    },
    [scenarios, persist],
  );

  const removeScenario = useCallback(
    (id: string) => {
      persist(scenarios.filter((s) => s.id !== id));
    },
    [scenarios, persist],
  );

  return {
    scenarios,
    loaded,
    addScenario,
    removeScenario,
  };
}
