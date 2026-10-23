/**
 * 语音转写网络层：录音 Blob → /api/ai/transcribe → 文本。
 *
 * Provider 优先级由 lib/asr.ts 决定（出厂 GLM 优先）；某个通道失败时依次尝试
 * 下一个已配置的 Key，避免一个限流/模型不可用把整次跟读卡死。
 */

import { getAPIKey } from './ai-config';
import {
  ASR_PROVIDERS,
  filenameForAudio,
  normalizeAsrResponse,
  pickAsrCandidates,
  type AsrProvider,
  type IAsrResult,
} from '@/lib/asr';

export const ASR_NOT_CONFIGURED = 'ASR_NOT_CONFIGURED';
const ASR_TIMEOUT_MS = 30_000;

export function getAsrCandidates() {
  const keys: Partial<Record<AsrProvider, string | null>> = {};
  for (const provider of ASR_PROVIDERS) keys[provider] = getAPIKey(provider);
  return pickAsrCandidates(keys);
}

export function hasAsrChannel(): boolean {
  return getAsrCandidates().length > 0;
}

export interface ITranscribeOptions {
  signal?: AbortSignal;
  language?: string;
  timeoutMs?: number;
}

async function postToAsr(
  candidate: ReturnType<typeof getAsrCandidates>[number],
  blob: Blob,
  opts: ITranscribeOptions,
): Promise<IAsrResult> {
  const form = new FormData();
  form.append('audio', blob, filenameForAudio(blob.type));
  form.append('provider', candidate.provider);
  form.append('apiKey', candidate.apiKey);
  form.append('language', opts.language || 'en');

  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, opts.timeoutMs ?? ASR_TIMEOUT_MS);
  const onExternalAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const res = await fetch('/api/ai/transcribe', {
      method: 'POST',
      body: form,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null) as { error?: string } | null;
    if (!res.ok) {
      throw new Error(data?.error || `转写失败（HTTP ${res.status}）`);
    }
    const { text, segments } = normalizeAsrResponse(data);
    if (!text) throw new Error('没有识别到英文内容，请靠近麦克风再试一次');
    return { text, segments, provider: candidate.provider, model: candidate.model };
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      if (opts.signal?.aborted) throw err;
      throw new Error(timedOut ? '转写超时，请重试' : '转写已取消');
    }
    throw err;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onExternalAbort);
  }
}

export async function transcribeRecording(
  blob: Blob,
  opts: ITranscribeOptions = {},
): Promise<IAsrResult> {
  const candidates = getAsrCandidates();
  if (!candidates.length) throw new Error(ASR_NOT_CONFIGURED);

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await postToAsr(candidate, blob, opts);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') throw err;
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('转写失败');
}
