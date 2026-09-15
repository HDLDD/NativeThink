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
}

export const EDGE_VOICE_CATALOG: ICatalogVoice[] = [
  { id: 'srv:edge:en-US-AvaNeural', name: 'Ava · 自然', lang: 'en-US', gender: 'female', accent: '美音' },
  { id: 'srv:edge:en-US-AndrewNeural', name: 'Andrew · 自然', lang: 'en-US', gender: 'male', accent: '美音' },
  { id: 'srv:edge:en-US-EmmaNeural', name: 'Emma · 自然', lang: 'en-US', gender: 'female', accent: '美音' },
  { id: 'srv:edge:en-US-BrianNeural', name: 'Brian · 自然', lang: 'en-US', gender: 'male', accent: '美音' },
  { id: 'srv:edge:en-US-AriaNeural', name: 'Aria', lang: 'en-US', gender: 'female', accent: '美音' },
  { id: 'srv:edge:en-US-JennyNeural', name: 'Jenny', lang: 'en-US', gender: 'female', accent: '美音' },
  { id: 'srv:edge:en-US-GuyNeural', name: 'Guy', lang: 'en-US', gender: 'male', accent: '美音' },
  { id: 'srv:edge:en-US-AnaNeural', name: 'Ana · 童声', lang: 'en-US', gender: 'female', accent: '美音' },
  { id: 'srv:edge:en-GB-SoniaNeural', name: 'Sonia', lang: 'en-GB', gender: 'female', accent: '英音' },
  { id: 'srv:edge:en-GB-RyanNeural', name: 'Ryan', lang: 'en-GB', gender: 'male', accent: '英音' },
  { id: 'srv:edge:en-GB-LibbyNeural', name: 'Libby', lang: 'en-GB', gender: 'female', accent: '英音' },
  { id: 'srv:edge:en-AU-NatashaNeural', name: 'Natasha', lang: 'en-AU', gender: 'female', accent: '澳音' },
];

/** 是否为内置在线神经语音 id */
export function isEdgeCatalogVoice(uri: string | null | undefined): boolean {
  return !!uri && uri.startsWith('srv:edge:');
}

/** 从 id 取出 Edge 语音名（如 srv:edge:en-US-AvaNeural → en-US-AvaNeural） */
export function edgeVoiceNameOf(uri: string | null | undefined): string | null {
  if (!isEdgeCatalogVoice(uri)) return null;
  return uri.slice('srv:edge:'.length);
}
