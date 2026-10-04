/**
 * 运行环境标识 —— 单一来源。
 *
 * 历史上这里有 APP_VERSION / envSummary（反馈上报随诊断信息带版本用）；
 * 反馈功能 2026-10-05 整体下架后已无消费方，随之删除。版本号只在构建期
 * 盖进 index.html 的 <meta name="app-version">（vite.config.ts 从
 * android/version.properties 的 versionName 读，保证与 aapt dump badging 同口径），
 * 供 scripts/ensure-web-build.mjs 拦「打进上次产物」—— 见该脚本注释。
 */
import { Capacitor } from '@capacitor/core';

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
