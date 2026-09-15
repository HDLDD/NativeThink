/**
 * native-tts — Android/系统原生 TTS 引擎的封装。
 *
 * 背景：Android WebView 的 window.speechSynthesis 几乎不实现，
 * getVoices() 返回空数组 —— 所以手机设置里"没有任何朗读声音可选"。
 * 原生插件走的是系统 TextToSpeech，语音列表必须通过插件查询。
 */

import { Capacitor } from '@capacitor/core';

export interface INativeVoice {
  /** 传给插件 speak({ voice }) 的索引 */
  index: number;
  name: string;
  lang: string;
  localService: boolean;
  isDefault: boolean;
}

export function isNativePlatform(): boolean {
  try { return Capacitor.isNativePlatform?.() === true; } catch { return false; }
}

export function isAndroidNative(): boolean {
  try { return isNativePlatform() && Capacitor.getPlatform?.() === 'android'; } catch { return false; }
}

let pluginPromise: Promise<any | null> | null = null;

/** 取原生 TTS 插件实例（不可用返回 null；结果缓存） */
export function getNativeTts(): Promise<any | null> {
  if (!pluginPromise) {
    pluginPromise = (async () => {
      try {
        if (!Capacitor.isPluginAvailable?.('TextToSpeech')) return null;
        const mod = await import('@capacitor-community/text-to-speech');
        return (mod as any).TextToSpeech ?? null;
      } catch { return null; }
    })();
  }
  return pluginPromise;
}

/** 列出系统语音引擎的语音（Android 上这是唯一可用的语音来源） */
export async function listNativeVoices(): Promise<INativeVoice[]> {
  const plugin = await getNativeTts();
  if (!plugin?.getSupportedVoices) return [];
  try {
    const res = await plugin.getSupportedVoices();
    const raw: any[] = Array.isArray(res?.voices) ? res.voices : [];
    return raw.map((v, i) => ({
      index: i,
      name: String(v?.name || `语音 ${i + 1}`),
      lang: String(v?.lang || ''),
      localService: !!v?.localService,
      isDefault: !!v?.default,
    }));
  } catch { return []; }
}

/** 仅英语语音（优先本地引擎、默认语音靠前） */
export async function listNativeEnglishVoices(): Promise<INativeVoice[]> {
  const all = await listNativeVoices();
  return all
    .filter((v) => v.lang.toLowerCase().startsWith('en'))
    .sort((a, b) => {
      const sa = (a.isDefault ? 4 : 0) + (a.localService ? 2 : 0);
      const sb = (b.isDefault ? 4 : 0) + (b.localService ? 2 : 0);
      return sb - sa;
    });
}

/** 打开系统 TTS 安装/设置页（缺语音包时引导用户安装） */
export async function openNativeTtsInstall(): Promise<boolean> {
  const plugin = await getNativeTts();
  if (!plugin?.openInstall) return false;
  try { await plugin.openInstall(); return true; } catch { return false; }
}

/** 用原生引擎试听某个语音 */
export async function previewNativeVoice(index: number | null, rate: number, volume: number): Promise<void> {
  const plugin = await getNativeTts();
  if (!plugin?.speak) return;
  try {
    await plugin.stop?.();
    await plugin.speak({
      text: 'Hello, this is a quick voice test.',
      lang: 'en-US',
      rate,
      pitch: 1,
      volume,
      ...(typeof index === 'number' && index >= 0 ? { voice: index } : {}),
    });
  } catch { /* ignore */ }
}
