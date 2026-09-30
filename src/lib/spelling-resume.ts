/**
 * spelling-resume — 句子拼写的断点续学（按词书 level 分键）。
 *
 * 为什么单独成模块：断点键的读写与迁移是**纯逻辑**，抽出来才能被
 * `scripts/verify-spelling-resume.mjs` 注入替身真跑（本仓库的做法：
 * 能抽成纯函数的直接单测，见 `vocab-swipe.ts` / `shadowing-progress.ts`）。
 *
 * 历史缺陷：原先是单个全局键 `__nativethink_spelling_resume`，值
 * `{ activeLevel, currentIndex }` —— 只能记住**一本**：A 书练到第 20 句、切去 B 书练 3 句，
 * 回到 A 书位置已经没了。AGENTS.md 的约定是按（模式, level）分键，背单词侧
 * `__nativethink_vocab_session_<level>` 早就是这么做的，这里补齐同一口径。
 */
import { safeStorage } from './safe-storage';

/** 兼容用的旧全局键（读一次即搬走并删除） */
export const RESUME_LEGACY_KEY = '__nativethink_spelling_resume';
/** 「上次在哪一本」—— 只存 level id，供刷新后自动进书 */
export const RESUME_LAST_KEY = '__nativethink_spelling_resume_last';
/** 断点前缀：重置时要按前缀枚举清理，写死列表清不干净 */
export const RESUME_PREFIX = '__nativethink_spelling_resume';

/** 可注入的存储接口：产品里用 safeStorage，守卫里用忠实替身 */
export interface IResumeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** 枚举当前所有应用键（未加前缀的名字）。safeStorage 版由实现方提供。 */
  keys?(): string[];
}

export const resumeKeyFor = (level: string): string => `${RESUME_PREFIX}_${level}`;

/** 读某本词书的断点位置；没有记录返回 null（绝不返回 0 冒充"有断点"） */
export function readResumeIndex(level: string, st: IResumeStorage = safeStorage): number | null {
  try {
    const raw = st.getItem(resumeKeyFor(level));
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as { currentIndex?: unknown };
    const n = Number(parsed?.currentIndex);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  } catch {
    return null;
  }
}

/** 上次在哪一本；没有记录返回 null → 页面应显示词书选择页 */
export function readLastResumeLevel(st: IResumeStorage = safeStorage): string | null {
  try { return st.getItem(RESUME_LAST_KEY) || null; } catch { return null; }
}

/** 写断点：分键存位置，另存一本指针。**只有这一处**写这两个键 */
export function persistResume(level: string, currentIndex: number, st: IResumeStorage = safeStorage): void {
  const idx = Number.isFinite(currentIndex) && currentIndex >= 0 ? Math.floor(currentIndex) : 0;
  try {
    st.setItem(resumeKeyFor(level), JSON.stringify({ currentIndex: idx }));
    st.setItem(RESUME_LAST_KEY, level);
  } catch { /* 配额满：断点丢一次可接受，不能让页面炸 */ }
}

/**
 * 一次性迁移旧的全局键。
 *
 * 三条硬要求（守卫逐条真跑过）：
 *  - 旧键存在且带 activeLevel → 搬到 `..._resume_<level>` + 记 `_last`，然后**删掉旧键**；
 *  - 目标键已有数据时**不覆盖**（新数据优先于旧全局值）；
 *  - 旧键不存在时什么都不做，也不能误删任何东西。
 */
export function migrateLegacyResume(st: IResumeStorage = safeStorage): { migrated: boolean; level?: string } {
  let raw: string | null = null;
  try { raw = st.getItem(RESUME_LEGACY_KEY); } catch { return { migrated: false }; }
  if (!raw) return { migrated: false };
  try {
    const saved = JSON.parse(raw) as { activeLevel?: string; currentIndex?: number };
    if (saved?.activeLevel) {
      const target = resumeKeyFor(saved.activeLevel);
      if (st.getItem(target) == null) {
        st.setItem(target, JSON.stringify({ currentIndex: saved.currentIndex ?? 0 }));
      }
      if (st.getItem(RESUME_LAST_KEY) == null) st.setItem(RESUME_LAST_KEY, saved.activeLevel);
      try { st.removeItem(RESUME_LEGACY_KEY); } catch { /* ignore */ }
      return { migrated: true, level: saved.activeLevel };
    }
  } catch { /* 坏 JSON：直接丢弃旧键，免得每次都重试 */ }
  try { st.removeItem(RESUME_LEGACY_KEY); } catch { /* ignore */ }
  return { migrated: false };
}

/**
 * 清掉全部拼写断点（「重置句子拼写」用）。
 * 必须按前缀枚举：写死清单会漏掉 `..._resume_<level>`，
 * 表现是"重置完刷新又自动跳回上次那本书"。
 */
export function clearAllResume(st: IResumeStorage = safeStorage): number {
  let cleared = 0;
  const keys = st.keys?.() ?? [];
  for (const k of keys) {
    if (!k.startsWith(RESUME_PREFIX)) continue;
    try { st.removeItem(k); cleared++; } catch { /* ignore */ }
  }
  return cleared;
}

/**
 * 带枚举能力的 safeStorage 适配器。
 *
 * `safeStorage` 本身没有"列出所有键"的 API，而断点键是按 level 动态生成的，
 * 重置时必须能枚举 —— 所以这里在适配层补齐 `keys()`：按当前用户前缀扫 localStorage，
 * 再把前缀剥掉返回应用键名（与 `removeItem(appKey)` 的口径一致）。
 */
export function resumeStorageWithKeys(): IResumeStorage {
  const prefix = safeStorage.getPrefixedKey('');
  return {
    getItem: (k) => safeStorage.getItem(k),
    setItem: (k, v) => safeStorage.setItem(k, v),
    removeItem: (k) => safeStorage.removeItem(k),
    keys: () => {
      const out: string[] = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const raw = localStorage.key(i);
          if (raw && raw.startsWith(prefix)) out.push(raw.slice(prefix.length));
        }
      } catch { /* ignore */ }
      return out;
    },
  };
}

