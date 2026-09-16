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
  /** 引擎内部的真实音色名（插件把它放在 voiceURI），形如 en-us-x-sfg#female_1-local */
  uri: string;
  lang: string;
  localService: boolean;
  isDefault: boolean;
  /** 用于界面的可区分标签（由 listNativeEnglishVoices 统一生成，保证不重名） */
  label?: string;
}

/**
 * 可区分的音色标签。
 *
 * 插件把显示名按「语言+地区」拼（`locale.getDisplayLanguage() + locale.getDisplayCountry()`），
 * 于是所有 en-US 音色在界面上都叫同一个「English United States」—— 用户看到的就是
 * 「前 10 个声音都是同一个」。真实音色名在 voiceURI 里，用它区分。
 */
export function nativeVoiceLabel(v: Pick<INativeVoice, 'uri' | 'lang' | 'localService'>): string {
  const tail = v.uri.includes('#') ? v.uri.split('#').pop() || v.uri : v.uri;
  const cleaned = tail
    .replace(/-(local|network)$/i, '')
    .replace(/_(\d)/g, ' $1')
    .replace(/_/g, ' ')
    .trim();
  const region = (v.lang || '').replace('-', ' ').toUpperCase();
  return `${cleaned || v.uri} · ${region} · ${v.localService ? '本地' : '网络'}`;
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
      uri: String(v?.voiceURI || v?.name || ''),
      lang: String(v?.lang || ''),
      localService: !!v?.localService,
      isDefault: !!v?.default,
    }));
  } catch { return []; }
}

/** 仅英语语音（本地音色靠前；插件把 default 恒置为 false，故不作为排序依据） */
export async function listNativeEnglishVoices(): Promise<INativeVoice[]> {
  const all = await listNativeVoices();
  const seen = new Set<string>();
  const labelCount = new Map<string, number>();
  return all
    .filter((v) => v.lang.toLowerCase().startsWith('en'))
    // 同一音色可能被引擎登记多次（不同 locale 变体）—— 按真实音色名去重，避免列表里一堆重复项。
    // 保留首次出现的那条，index 仍是引擎里的原始下标，setVoice 才不会选错。
    .filter((v) => {
      const key = v.uri || `${v.name}|${v.lang}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const sa = (a.isDefault ? 4 : 0) + (a.localService ? 2 : 0) + (a.lang.toLowerCase() === 'en-us' ? 1 : 0);
      const sb = (b.isDefault ? 4 : 0) + (b.localService ? 2 : 0) + (b.lang.toLowerCase() === 'en-us' ? 1 : 0);
      return sb - sa;
    })
    // 兜底保证可区分：个别引擎给多个音色返回同一个名字，此时补上引擎内编号，
    // 免得用户又看到一排看起来一模一样的声音。
    .map((v) => {
      const base = nativeVoiceLabel(v);
      const n = (labelCount.get(base) || 0) + 1;
      labelCount.set(base, n);
      return n > 1 ? { ...v, label: `${base} · #${v.index}` } : { ...v, label: base };
    });
}

let preferredVoicePromise: Promise<INativeVoice | null> | null = null;

/**
 * 挑一个「本地」英语音色 —— 结果缓存。
 *
 * 为什么必须挑：本地音色离线合成、起播几十毫秒；网络音色每次朗读都要把文本发到
 * 服务器合成（500~2000ms），这正是「手机朗读要等两秒」的主因。而用户没在设置里
 * 手动选语音时，我们此前不传 voice，交给系统默认 —— 那个默认很可能是网络音色。
 * 系统里没有任何本地英语音色时返回 null，仍交由系统默认，不硬塞。
 */
export function pickPreferredEnglishVoice(): Promise<INativeVoice | null> {
  if (!preferredVoicePromise) {
    preferredVoicePromise = listNativeEnglishVoices()
      .then((list) => list.find((v) => v.localService) ?? null)
      .catch(() => null);
  }
  return preferredVoicePromise;
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
