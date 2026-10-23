/**
 * 语音转写（ASR）的纯逻辑：provider 选择、录音文件名、响应归一、语速。
 * 网络请求在 services/asr-service.ts；这里不碰 fetch / window，守卫可真跑。
 */

import { tokenizeSpeech } from './speech-score';

export const ASR_PROVIDERS = ['glm', 'groq', 'siliconflow'] as const;
export type AsrProvider = (typeof ASR_PROVIDERS)[number];

export const ASR_MODELS: Record<AsrProvider, string> = {
  glm: 'GLM-ASR-2512',
  groq: 'whisper-large-v3-turbo',
  siliconflow: 'FunAudioLLM/SenseVoiceSmall',
};

export interface IAsrCandidate {
  provider: AsrProvider;
  apiKey: string;
  model: string;
}

export interface IAsrSegment {
  start: number;
  end: number;
  en: string;
}

export interface IAsrResult {
  text: string;
  segments: IAsrSegment[];
  provider: AsrProvider;
  model: string;
}

/** 按固定优先级挑出有 Key 的 provider：出厂 GLM 优先，其次 Groq、硅基流动 */
export function pickAsrCandidates(
  keys: Partial<Record<AsrProvider, string | null | undefined>>,
): IAsrCandidate[] {
  const out: IAsrCandidate[] = [];
  for (const provider of ASR_PROVIDERS) {
    const apiKey = String(keys[provider] || '').trim();
    if (apiKey) out.push({ provider, apiKey, model: ASR_MODELS[provider] });
  }
  return out;
}

/** 录音 Blob 的 MIME → 上传文件名（上游按扩展名判容器） */
export function filenameForAudio(type: string | undefined): string {
  const m = String(type || '').toLowerCase();
  if (m.includes('wav')) return 'take.wav';
  if (m.includes('mp4') || m.includes('m4a')) return 'take.m4a';
  if (m.includes('ogg')) return 'take.ogg';
  if (m.includes('mpeg') || m.includes('mp3')) return 'take.mp3';
  return 'take.webm';
}

/** 服务端响应归一：GLM 只回 text，Groq/SiliconFlow 可能同时回 segments */
export function normalizeAsrResponse(data: unknown): { text: string; segments: IAsrSegment[] } {
  const d = data as {
    text?: unknown;
    transcript?: unknown;
    segments?: Array<{ start?: unknown; end?: unknown; en?: unknown; text?: unknown }>;
    results?: Array<{ text?: unknown }>;
  } | null;

  const segments = Array.isArray(d?.segments)
    ? d.segments
      .map((s) => ({
        start: Number(s?.start) || 0,
        end: Number(s?.end) || 0,
        en: String(s?.en ?? s?.text ?? '').trim(),
      }))
      .filter((s) => s.en)
    : [];

  let text = typeof d?.text === 'string' ? d.text.trim() : '';
  if (!text && typeof d?.transcript === 'string') text = d.transcript.trim();
  if (!text && Array.isArray(d?.results)) {
    text = d.results.map((r) => (typeof r?.text === 'string' ? r.text : '')).join(' ').trim();
  }
  if (!text && segments.length) text = segments.map((s) => s.en).join(' ').trim();
  return { text, segments };
}

export interface IPace {
  wordCount: number;
  expectedMs: number;
  /** 正 = 偏慢，负 = 偏快 */
  delta: number;
  label: 'slow' | 'fast' | 'ok';
}

/** 录音总时长与「按词数估算的参考时长」对比（与 SpeakBack 的 260ms/词同口径） */
export function speechPace(target: string, recordingMs: number, msPerWord = 260): IPace {
  const wordCount = tokenizeSpeech(target).length;
  const expectedMs = Math.max(800, wordCount * msPerWord);
  const delta = expectedMs > 0 ? (recordingMs - expectedMs) / expectedMs : 0;
  const label = delta > 0.2 ? 'slow' : delta < -0.2 ? 'fast' : 'ok';
  return { wordCount, expectedMs, delta, label };
}
