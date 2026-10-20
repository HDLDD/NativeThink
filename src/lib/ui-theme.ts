import { useCallback, useEffect, useState } from 'react';

/**
 * 可切换的外观主题（与明暗是两个正交维度）。
 *
 * classic 是默认值，**不覆盖任何 token** —— 选它就是现在的界面，一个像素都不变。
 * 其余三套只改 shadcn 的设计变量（背景/卡片/描边/主色/品牌文字色），
 * 不动布局、不动组件结构；暗色模式只换强调色，背景沿用现有深色。
 */
const UI_THEME_KEY = '__nativethink_ui_theme';
const UI_THEME_EVENT = 'nativethink:ui-theme-change';

export type UiThemeId = 'classic' | 'porcelain' | 'graphite' | 'lime';

export interface IUiThemeDef {
  id: UiThemeId;
  name: string;
  desc: string;
  /** 预览用的三个色点：主色 / 卡片 / 背景 */
  swatch: [string, string, string];
}

export const UI_THEMES: IUiThemeDef[] = [
  { id: 'classic', name: '原生青绿', desc: '当前主题（默认）', swatch: ['#00B894', '#FFFFFF', '#F6F8F9'] },
  { id: 'porcelain', name: '白 · 电蓝', desc: '冷静、精确，像专业工具', swatch: ['#2F6BFF', '#FFFFFF', '#F4F7FC'] },
  { id: 'graphite', name: '白 · 石墨', desc: '近乎黑白，一点热色催行动', swatch: ['#0A0A0A', '#FFFFFF', '#F6F6F7'] },
  { id: 'lime', name: '白 · 青柠', desc: '有能量，进度感强', swatch: ['#0FA968', '#D9F86A', '#F5F7F3'] },
];

function isThemeId(v: unknown): v is UiThemeId {
  return typeof v === 'string' && UI_THEMES.some((t) => t.id === v);
}

export function readUiTheme(): UiThemeId {
  try {
    const v = localStorage.getItem(UI_THEME_KEY);
    return isThemeId(v) ? v : 'classic';
  } catch {
    return 'classic';
  }
}

/** 把主题写到 <html data-ui-theme>；classic 直接摘属性（等价于"没有任何覆盖"） */
export function applyUiTheme(id: UiThemeId) {
  const root = document.documentElement;
  if (id === 'classic') root.removeAttribute('data-ui-theme');
  else root.setAttribute('data-ui-theme', id);
}

/** 在应用挂载前调一次，避免首帧闪回默认主题 */
export function initUiTheme() {
  applyUiTheme(readUiTheme());
}

export function useUiTheme() {
  const [uiTheme, setState] = useState<UiThemeId>(() => readUiTheme());

  useEffect(() => {
    applyUiTheme(uiTheme);
    try {
      localStorage.setItem(UI_THEME_KEY, uiTheme);
    } catch {
      // 存不了就只在本次会话生效
    }
  }, [uiTheme]);

  useEffect(() => {
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<UiThemeId>).detail;
      if (isThemeId(next) && next !== uiTheme) setState(next);
    };
    window.addEventListener(UI_THEME_EVENT, onChange);
    return () => window.removeEventListener(UI_THEME_EVENT, onChange);
  }, [uiTheme]);

  const setUiTheme = useCallback((id: UiThemeId) => {
    setState(id);
    window.dispatchEvent(new CustomEvent<UiThemeId>(UI_THEME_EVENT, { detail: id }));
  }, []);

  return { uiTheme, setUiTheme };
}
