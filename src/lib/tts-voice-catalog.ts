/**
 * tts-voice-catalog — 内置在线神经语音目录（Edge TTS）。
 *
 * 为什么需要：浏览器/WebView 的 speechSynthesis 语音列表常常为空（Android WebView
 * 几乎没有，部分桌面浏览器只有中文语音），导致"没有朗读声音可选"。
 * 这份目录提供一批高质量英语神经语音，走 Edge-TTS 通道即可朗读，
 * 不依赖系统语音是否安装 —— 手机、桌面、网页都能选。
 *
 * id 形如 srv:edge:en-US-AvaNeural —— 与 use-tts 的 Edge 通道、
 * 本地服务器（Electron）返回的语音 id 完全一致，可无缝混用。
 */

export interface ICatalogVoice {
  /** 传给 edgeVoiceFor / /api/tts 的语音名 */
  id: string;
  name: string;
  lang: string;
  gender: 'female' | 'male';
  /** 口音标签，便于用户选择 */
  accent: '美音' | '英音' | '澳音';
  /**
   * 口音兜底：当 Edge 通道不可达（如国内网络）时，用 Google TTS 的
   * 语言变体保留口音差异（tl=en / en-GB / en-AU），避免"所有声音都一样"。
   */
  googleLang: string;
}

interface IVoiceSeed {
  /** Edge 语音名 */
  n: string;
  /** 显示名 */
  label: string;
  lang: string;
  gender: 'female' | 'male';
  accent: '美音' | '英音' | '澳音';
  /** 口音兜底（Google TTS 语言变体） */
  googleLang: string;
}

const SEED: IVoiceSeed[] = [
  { n: 'en-US-AvaNeural', label: 'Ava · 自然', lang: 'en-US', gender: 'female', accent: '美音', googleLang: 'en' },
  { n: 'en-US-AndrewNeural', label: 'Andrew · 自然', lang: 'en-US', gender: 'male', accent: '美音', googleLang: 'en' },
  { n: 'en-US-EmmaNeural', label: 'Emma · 自然', lang: 'en-US', gender: 'female', accent: '美音', googleLang: 'en' },
  { n: 'en-US-BrianNeural', label: 'Brian · 自然', lang: 'en-US', gender: 'male', accent: '美音', googleLang: 'en' },
  { n: 'en-US-AriaNeural', label: 'Aria', lang: 'en-US', gender: 'female', accent: '美音', googleLang: 'en' },
  { n: 'en-US-JennyNeural', label: 'Jenny', lang: 'en-US', gender: 'female', accent: '美音', googleLang: 'en' },
  { n: 'en-US-GuyNeural', label: 'Guy', lang: 'en-US', gender: 'male', accent: '美音', googleLang: 'en' },
  { n: 'en-US-AnaNeural', label: 'Ana · 童声', lang: 'en-US', gender: 'female', accent: '美音', googleLang: 'en' },
  { n: 'en-GB-SoniaNeural', label: 'Sonia', lang: 'en-GB', gender: 'female', accent: '英音', googleLang: 'en-GB' },
  { n: 'en-GB-RyanNeural', label: 'Ryan', lang: 'en-GB', gender: 'male', accent: '英音', googleLang: 'en-GB' },
  { n: 'en-GB-LibbyNeural', label: 'Libby', lang: 'en-GB', gender: 'female', accent: '英音', googleLang: 'en-GB' },
  { n: 'en-AU-NatashaNeural', label: 'Natasha', lang: 'en-AU', gender: 'female', accent: '澳音', googleLang: 'en-AU' },
];

export const EDGE_VOICE_CATALOG: ICatalogVoice[] = SEED.map((v) => ({
  id: `srv:edge:${v.n}`,
  name: v.label,
  lang: v.lang,
  gender: v.gender,
  accent: v.accent,
  googleLang: v.googleLang,
}));

/** 是否为内置在线神经语音 id */
export function isEdgeCatalogVoice(uri: string | null | undefined): boolean {
  return !!uri && uri.startsWith('srv:edge:');
}

/** 取该语音的 Google 口音兜底语言（非目录语音返回 'en'） */
export function googleLangOf(uri: string | null | undefined): string {
  const hit = EDGE_VOICE_CATALOG.find((v) => v.id === uri);
  return hit?.googleLang || 'en';
}

/** 从 id 取出 Edge 语音名（如 srv:edge:en-US-AvaNeural → en-US-AvaNeural） */
export function edgeVoiceNameOf(uri: string | null | undefined): string | null {
  if (!isEdgeCatalogVoice(uri)) return null;
  return uri.slice('srv:edge:'.length);
}
