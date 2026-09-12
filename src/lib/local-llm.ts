/**
 * local-llm — 离线备用小模型（transformers.js + Qwen2.5-0.5B-Instruct ONNX）。
 *
 * 用途：出厂 API 限流（1305/429）或断网时的手机端兜底。
 * - 模型约 400MB（q4 量化），首次下载后由浏览器 Cache API 持久化，之后完全离线
 * - 加载是惰性的：只有用户在 AI 设置里点下载、或自动回落首次触发时才 import
 * - 中英双语；质量当然不如云端大模型 — 定位是"可用"而非"好用"
 */

const MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct';
const STATE_KEY = '__nativethink_local_llm_state';
export const LOCAL_LLM_AUTO_KEY = '__nativethink_local_llm_auto';

export type LocalLlmStatus = 'none' | 'downloading' | 'ready';

let pipePromise: Promise<any> | null = null;
let downloadProgress = -1; // 0-100；-1 = 未在下载
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => { try { l(); } catch { /* ignore */ } });
}

export function getLocalLlmStatus(): LocalLlmStatus {
  if (pipePromise) return 'downloading';
  try { return localStorage.getItem(STATE_KEY) === 'ready' ? 'ready' : 'none'; } catch { return 'none'; }
}

export function getDownloadProgress(): number {
  return downloadProgress;
}

export function subscribeLocalLlm(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function isAutoFallbackEnabled(): boolean {
  try { return localStorage.getItem(LOCAL_LLM_AUTO_KEY) === '1'; } catch { return false; }
}

export function setAutoFallbackEnabled(on: boolean): void {
  try { localStorage.setItem(LOCAL_LLM_AUTO_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

export function isLocalLlmReady(): boolean {
  return getLocalLlmStatus() === 'ready';
}

/** 清除已下载的模型（浏览器 Cache API）并重置状态 */
export async function clearLocalLlmCache(): Promise<void> {
  try { await caches.delete('transformers-cache'); } catch { /* ignore */ }
  try { localStorage.removeItem(STATE_KEY); } catch { /* ignore */ }
  pipePromise = null;
  downloadProgress = -1;
  emit();
}

/** 下载并加载模型（幂等；重复调用复用进行中的加载） */
export async function downloadLocalLlm(): Promise<void> {
  if (pipePromise) return pipePromise;
  downloadProgress = 0;
  emit();
  pipePromise = (async () => {
    const tf = await import('@huggingface/transformers');
    const device = (navigator as any).gpu ? 'webgpu' : 'wasm';
    return tf.pipeline('text-generation', MODEL_ID, {
      dtype: 'q4',
      device,
      progress_callback: (p: { status?: string; progress?: number }) => {
        if (p?.status === 'progress' && typeof p.progress === 'number') {
          const v = Math.max(downloadProgress, Math.min(99, Math.round(p.progress)));
          if (v !== downloadProgress) { downloadProgress = v; emit(); }
        }
      },
    });
  })();
  try {
    await pipePromise;
    try { localStorage.setItem(STATE_KEY, 'ready'); } catch { /* ignore */ }
    downloadProgress = 100;
    emit();
  } catch (e) {
    pipePromise = null;
    downloadProgress = -1;
    emit();
    throw e;
  }
}

/** 就绪时取 pipeline；未下载返回 null（不会意外触发 400MB 下载） */
async function getPipe(): Promise<any | null> {
  if (pipePromise) return pipePromise;
  try {
    if (localStorage.getItem(STATE_KEY) !== 'ready') return null;
  } catch { return null; }
  // 标记 ready 但内存里没有 → 从浏览器缓存快速加载
  await downloadLocalLlm();
  return pipePromise;
}

/**
 * 流式生成（离线兜底路径）。
 * TextStreamer 逐 token 推入队列，以 async generator 形式吐出。
 */
export async function* localStreamChat(
  messages: { role: string; content: string }[],
  opts: { maxTokens?: number; temperature?: number; signal?: AbortSignal } = {},
): AsyncGenerator<{ content: string; done: boolean }> {
  const pipe = await getPipe();
  if (!pipe) throw new Error('离线小模型未下载');
  if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');

  const tf = await import('@huggingface/transformers');
  const queue: string[] = [];
  let finished = false;
  let failed: Error | null = null;
  let outResult: any = null;
  let notify: (() => void) | null = null;
  const wake = () => { const n = notify; notify = null; n?.(); };

  let streamedAny = false;
  const streamer = new tf.TextStreamer(pipe.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (t: string) => {
      if (t) { streamedAny = true; queue.push(t); wake(); }
    },
  });

  pipe(messages, {
    max_new_tokens: opts.maxTokens ?? 400,
    do_sample: true,
    temperature: opts.temperature ?? 0.7,
    streamer,
  }).then((out: any) => { outResult = out; finished = true; wake(); })
    .catch((e: any) => { failed = e instanceof Error ? e : new Error(String(e)); finished = true; wake(); });

  try {
    while (!finished || queue.length) {
      if (opts.signal?.aborted) { queue.length = 0; throw new DOMException('aborted', 'AbortError'); }
      if (queue.length) {
        yield { content: queue.shift()!, done: false };
        continue;
      }
      await new Promise<void>((r) => { notify = r; setTimeout(r, 60); });
    }
    if (failed) throw failed;
    // 流式回调一次都没触发（API 版本差异兜底）→ 用完整结果
    if (!streamedAny && outResult) {
      const text = outResult?.[0]?.generated_text;
      const last = Array.isArray(text) ? (text.at(-1)?.content ?? '') : String(text ?? '');
      if (last) yield { content: last, done: false };
    }
    yield { content: '', done: true };
  } finally {
    /* generation may still flush in background — harmless */
  }
}
