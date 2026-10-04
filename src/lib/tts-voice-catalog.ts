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

// ── 本地离线音色（sherpa-onnx + Kokoro int8）──
//
// 与上面 Edge 在线目录的区别：这些音色在设备内合成，不联网。
// speakerId 是 voices.bin 里的数组下标，**写错不会报错、只会读成别人的声音**。
// 名字↔下标已静态锁定：11 个条目与包内 model.int8.onnx 内嵌 speaker2id 元数据逐条吻合
// （v1.0 / 54 音色），check-tts-voices.cjs 打包前做同款核对，越界也拦。

export interface ILocalVoice {
  /** 传给 sherpaSpeak 的 voiceId，形如 kokoro:af_sarah */
  id: string;
  name: string;
  gender: 'female' | 'male';
  accent: '美音' | '英音';
  /** 原生侧模型注册表的 key —— 必须与 SherpaTtsPlugin.java 的 MODEL_* 常量一致 */
  modelId: 'kokoro' | 'piper-lessac';
  /** voices.bin 里的数组下标 */
  speakerId: number;
  /** 一句定位描述，设置页显示 */
  note: string;
}

/**
 * Kokoro int8 多语模型的 11 个英文音色。
 *
 * speakerId 已与包内 model.int8.onnx 内嵌的 speaker2id 元数据逐条核对吻合
 * （v1.0 / 54 音色；2026-10-05 直读核实，同款核对固化在 check-tts-voices.cjs）。
 * 真机试听只用于标定 note 听感描述；改数字前先跑 npm run check:tts-voices。
 */
export const KOKORO_VOICES: ILocalVoice[] = [
  { id: 'kokoro:af_bella', name: 'Bella', gender: 'female', accent: '美音', modelId: 'kokoro', speakerId: 2, note: '温暖亲切' },
  { id: 'kokoro:af_heart', name: 'Heart', gender: 'female', accent: '美音', modelId: 'kokoro', speakerId: 3, note: '柔和自然' },
  { id: 'kokoro:af_nicole', name: 'Nicole', gender: 'female', accent: '美音', modelId: 'kokoro', speakerId: 6, note: '轻柔低语' },
  { id: 'kokoro:af_sarah', name: 'Sarah', gender: 'female', accent: '美音', modelId: 'kokoro', speakerId: 9, note: '清晰标准' },
  { id: 'kokoro:af_sky', name: 'Sky', gender: 'female', accent: '美音', modelId: 'kokoro', speakerId: 10, note: '年轻活泼' },
  { id: 'kokoro:am_adam', name: 'Adam', gender: 'male', accent: '美音', modelId: 'kokoro', speakerId: 11, note: '沉稳' },
  { id: 'kokoro:am_michael', name: 'Michael', gender: 'male', accent: '美音', modelId: 'kokoro', speakerId: 16, note: '自然' },
  { id: 'kokoro:am_puck', name: 'Puck', gender: 'male', accent: '美音', modelId: 'kokoro', speakerId: 18, note: '活泼' },
  { id: 'kokoro:am_santa', name: 'Santa', gender: 'male', accent: '美音', modelId: 'kokoro', speakerId: 19, note: '低沉厚重' },
  { id: 'kokoro:bf_emma', name: 'Emma', gender: 'female', accent: '英音', modelId: 'kokoro', speakerId: 21, note: '标准英音' },
  { id: 'kokoro:bm_george', name: 'George', gender: 'male', accent: '英音', modelId: 'kokoro', speakerId: 26, note: '沉稳英音' },
];

/** 兜底音色 —— Kokoro 不可用时自动回退（22050Hz，真机已验证可跑） */
export const FALLBACK_VOICE: ILocalVoice = {
  id: 'piper:lessac', name: 'Lessac', gender: 'female', accent: '美音',
  modelId: 'piper-lessac', speakerId: 0, note: '最流畅 · 离线',
};

/**
 * 未选择音色时的默认音色。
 *
 * 为什么默认 lessac 而不是 Kokoro —— 真机实测（同一段 122 字符、模型已加载的稳态）：
 *   lessac(VITS) : 音频 5789ms / 合成 428ms → **RTF 0.076**（约 13 倍实时）
 *   Kokoro(int8) : 音频 6819ms / 合成 6867ms → **RTF 1.008**（≈ 实时）
 *
 * RTF > 1 意味着合成永远追不上播放：长文朗读必然段落断续，**加大预取深度也无法解决**
 * （只会让队列无限积压）。因此默认走流畅的 lessac；Kokoro 的 11 个音色仍可显式选择，
 * 音质更好，代价是长文朗读可能断续。
 */
export const DEFAULT_LOCAL_VOICE_ID = 'piper:lessac';

/**
 * 本地音色全集。**最流畅的 lessac 排在首位**（它也是默认音色）：
 * 真机实测 lessac RTF 0.076、Kokoro RTF≈1.008，长文朗读只有前者能跟上播放。
 * 顺序仅影响设置页展示，查找用的是 find()，不依赖下标。
 */
export function listLocalVoices(): ILocalVoice[] {
  return [FALLBACK_VOICE, ...KOKORO_VOICES];
}

/** 是否为本地离线音色 id */
export function isLocalVoiceId(uri: string | null | undefined): boolean {
  return !!uri && (uri.startsWith('kokoro:') || uri.startsWith('piper:'));
}

/** 按 id 取本地音色；找不到返回 null（调用方自行决定是否回退） */
export function findLocalVoice(uri: string | null | undefined): ILocalVoice | null {
  if (!uri) return null;
  return listLocalVoices().find((v) => v.id === uri) ?? null;
}
