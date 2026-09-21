/**
 * reader-highlight — 复习词高亮：颜色可选 + 跨阅读器组件共享的"当前待高亮词表"。
 *
 * 为什么用模块级状态而不是层层传 props：ReaderParagraph 同时被 PageReader（翻页模式）
 * 和 NovelReader（小说模式）渲染，逐层透传要改三个文件的签名；而这两份信息都是
 * "当前正在读的这篇内容"的全局属性，放模块级更贴合语义（本仓库已有同类做法，
 * 如 local-llm.ts 的下载进度）。
 */
import { useEffect, useState, useCallback } from 'react';
import { safeStorage } from './safe-storage';

export interface IHighlightColor {
  id: string;
  label: string;
  /** 框线色（Tailwind 任意值，直接写进 style 更稳，避免 JIT 扫不到动态类名） */
  border: string;
  /** 底色 */
  background: string;
}

/** 可选颜色 —— 都用柔和色，符合本项目"不引入考试焦虑视觉"的约定 */
export const HIGHLIGHT_COLORS: IHighlightColor[] = [
  { id: 'teal', label: '青绿', border: '#00B894', background: 'rgba(0,184,148,0.10)' },
  { id: 'amber', label: '琥珀', border: '#F59E0B', background: 'rgba(245,158,11,0.12)' },
  { id: 'rose', label: '玫红', border: '#F43F5E', background: 'rgba(244,63,94,0.10)' },
  { id: 'violet', label: '紫罗兰', border: '#8B5CF6', background: 'rgba(139,92,246,0.12)' },
  { id: 'sky', label: '天蓝', border: '#0EA5E9', background: 'rgba(14,165,233,0.12)' },
  { id: 'lime', label: '草绿', border: '#65A30D', background: 'rgba(101,163,13,0.14)' },
];

export const DEFAULT_HIGHLIGHT_COLOR_ID = 'teal';

const COLOR_KEY = '__nativethink_review_highlight_color';
const COLOR_EVENT = 'nativethink-highlight-color-changed';

function readColor(): string {
  try {
    const v = safeStorage.getItem(COLOR_KEY);
    if (v && HIGHLIGHT_COLORS.some((c) => c.id === v)) return v;
  } catch { /* 读不到就用默认 */ }
  return DEFAULT_HIGHLIGHT_COLOR_ID;
}

export function getHighlightColor(): IHighlightColor {
  const id = readColor();
  return HIGHLIGHT_COLORS.find((c) => c.id === id) ?? HIGHLIGHT_COLORS[0];
}

/** 设置并广播（多个阅读器组件同时存在时保持一致） */
export function setHighlightColor(id: string): void {
  if (!HIGHLIGHT_COLORS.some((c) => c.id === id)) return;
  try { safeStorage.setItem(COLOR_KEY, id); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(COLOR_EVENT, { detail: id })); } catch { /* ignore */ }
}

/** 高亮颜色（订阅广播，改色后已打开的文章立刻跟着变） */
export function useHighlightColor(): [string, (id: string) => void] {
  const [id, setId] = useState<string>(() => readColor());
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setId(typeof detail === 'string' ? detail : readColor());
    };
    window.addEventListener(COLOR_EVENT, onChange);
    return () => window.removeEventListener(COLOR_EVENT, onChange);
  }, []);
  const update = useCallback((next: string) => setHighlightColor(next), []);
  return [id, update];
}

// ── 当前待高亮的复习词表（模块级 + 订阅）──
let _words: string[] = [];
const WORDS_EVENT = 'nativethink-highlight-words-changed';

/**
 * 归一化：只留小写字母（去掉复数/时态的常见后缀差异由 matchesHighlight 负责）。
 */
function norm(w: string): string {
  return w.toLowerCase().replace(/[^a-z'-]/g, '');
}

/** 由阅读器在打开内容时设置；空数组表示不高亮 */
export function setHighlightWords(words?: string[] | null): void {
  const next = (words ?? []).map((w) => w.toLowerCase()).filter(Boolean);
  if (next.length === _words.length && next.every((w, i) => w === _words[i])) return;
  _words = next;
  try { window.dispatchEvent(new CustomEvent(WORDS_EVENT)); } catch { /* ignore */ }
}

export function useHighlightWords(): string[] {
  const [, force] = useState(0);
  useEffect(() => {
    const onChange = () => force((n) => n + 1);
    window.addEventListener(WORDS_EVENT, onChange);
    return () => window.removeEventListener(WORDS_EVENT, onChange);
  }, []);
  return _words;
}

/**
 * 判断某个词是否命中复习词表。
 *
 * 只做保守的形态归并（复数 s/es、过去式 ed、进行式 ing、比较级 er/est），
 * 不做词干化 —— AI 生成时被要求"自然地用上这些词"，实际常出现变形；
 * 过度归并会把无关词也框起来，宁少不错。
 */
export function matchesHighlight(word: string, words: string[]): boolean {
  if (!words.length) return false;
  const w = norm(word);
  if (!w) return false;
  if (words.includes(w)) return true;
  for (const raw of words) {
    const t = norm(raw);
    if (!t) continue;
    if (w === t) return true;
    for (const suf of ['s', 'es', 'ed', 'd', 'ing', 'er', 'est']) {
      if (w === t + suf) return true;      // 目标词 + 后缀 → 变形
      if (t === w + suf) return true;      // 文中是原形、目标是变形
    }
    // 辅音重复 + ed/ing（stop → stopped / stopping）
    if (t.length > 2 && /[bdglmnprt]$/.test(t)) {
      const last = t[t.length - 1];
      if (w === t + last + 'ed' || w === t + last + 'ing') return true;
      if (/[bdglmnprt]$/.test(w) && t === w + w[w.length - 1] + 'ed') return true;
    }
  }
  return false;
}
