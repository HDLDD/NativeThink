/**
 * 运行环境与版本标识 —— 单一来源，供反馈上报、诊断信息、设置页展示复用。
 *
 * 版本号在构建时由 `vite.config.ts` 从 `android/version.properties` 的 `versionName` 注入
 * （读不到时退回 `package.json` 的 version）。这样 APK 与网页版报上来的版本，
 * 和 `aapt dump badging` 看到的安装包版本始终是同一个口径。
 *
 * 注意：`__APP_VERSION__` 是 define 替换，产物里会被换成字符串字面量；
 * 但类型检查时它不存在，所以一律先 `typeof` 再取（与 ai-config 处理出厂 Key 同法）。
 */
import { Capacitor } from '@capacitor/core';

declare const __APP_VERSION__: string;

/** 构建时注入的版本名；未注入时为空串（不谎报） */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';

export type PlatformTag = 'android' | 'ios' | 'desktop' | 'web';

/**
 * 运行平台：原生壳（Capacitor）→ android/ios；Electron → desktop；其余 → web。
 * 判定顺序有讲究 —— Capacitor 的 UA 里也带 Chrome，所以先问原生桥。
 */
export function platformTag(): PlatformTag {
  try {
    if (Capacitor.isNativePlatform?.() === true) {
      const p = Capacitor.getPlatform?.();
      if (p === 'android' || p === 'ios') return p;
      return 'android'; // 有原生桥但拿不到平台名：按手机处理
    }
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    if (/Electron|NativeThink\//i.test(ua)) return 'desktop';
  } catch { /* 环境异常一律按网页版 */ }
  return 'web';
}

/** 反馈/诊断用的一行环境串，例如 `web · 2.0.25 · zh-CN` */
export function envSummary(): string {
  const locale = typeof navigator !== 'undefined' ? (navigator.language || '') : '';
  return [platformTag(), APP_VERSION || 'dev', locale || 'unknown'].join(' · ');
}
