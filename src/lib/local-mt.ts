/**
 * local-mt — 内置离线翻译模型（opus-mt-en-zh，英→中）。
 *
 * 与聊天用的 Qwen2.5-0.5B（750MB、慢）不同，这是**专用翻译模型**：
 * 量化后仅 ~110MB，加载快、单段翻译通常 1 秒内，完全离线、无额度限制。
 * 打包版（桌面 / APK）从同源 /models/ 加载；网页版回落 hf-mirror 下载。
 *
 * 质量定位：日常叙述/说明性文字可用；文学性长句不如云端大模型。
 * 因此阅读器默认「本地优先 + AI 兜底」，并允许在设置里切换为「只用 AI」。
 */

import { Capacitor } from '@capacitor/core';

const MODEL_ID = 'Xenova/opus-mt-en-zh';
const STATE_KEY = '__nativethink_local_mt_state';
/** 翻译引擎偏好：auto = 本地优先（快），ai = 只用云端（更准） */
export const ENGINE_KEY = '__nativethink_translate_engine';

export type TranslateEngine = 'auto' | 'ai' | 'local';

let translatorPromise: Promise<any> | null = null;
let loadProgress = -1;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => { try { l(); } catch { /* ignore */ } }); }

export function subscribeLocalMt(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getLocalMtProgress(): number { return loadProgress; }

export function isLocalMtReady(): boolean {
  try { return localStorage.getItem(STATE_KEY) === 'ready'; } catch { return false; }
}

export function getTranslateEngine(): TranslateEngine {
  try {
    const v = localStorage.getItem(ENGINE_KEY);
    return v === 'ai' || v === 'local' ? v : 'auto';
  } catch { return 'auto'; }
}

export function setTranslateEngine(e: TranslateEngine): void {
  try { localStorage.setItem(ENGINE_KEY, e); } catch { /* ignore */ }
}

/** 安装包是否内置了翻译模型（同源 /models/<id>/config.json 可达） */
export async function hasBundledMt(): Promise<boolean> {
  try {
    const res = await fetch(`/models/${MODEL_ID}/config.json`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return false;
    return (await res.text()).trimStart().startsWith('{');
  } catch { return false; }
}

/** 加载模型（幂等）。打包版走本地 /models/，网页版走 hf-mirror。 */
export async function loadLocalMt(): Promise<any> {
  if (translatorPromise) return translatorPromise;
  loadProgress = 0;
  emit();
  translatorPromise = (async () => {
    const tf = await import('@huggingface/transformers');
    tf.env.allowLocalModels = true;
    tf.env.localModelPath = '/models/';
    tf.env.allowRemoteModels = true;
    const device = (navigator as any).gpu ? 'webgpu' : 'wasm';
    const progress_callback = (p: { status?: string; progress?: number }) => {
      if (p?.status === 'progress' && typeof p.progress === 'number') {
        const v = Math.max(loadProgress, Math.min(99, Math.round(p.progress)));
        if (v !== loadProgress) { loadProgress = v; emit(); }
      }
    };
    const build = () => tf.pipeline('translation', MODEL_ID, { dtype: 'q8', device, progress_callback });
    // 中文环境（手机）优先镜像
    const zh = (navigator.language || '').toLowerCase().startsWith('zh') || /android/i.test(navigator.userAgent);
    const hosts = zh ? ['https://hf-mirror.com', 'https://huggingface.co'] : ['https://huggingface.co', 'https://hf-mirror.com'];
    let lastErr: unknown = null;
    for (const host of hosts) {
      (tf.env as any).remoteHost = host;
      (tf.env as any).remotePathTemplate = '{model}/resolve/{revision}/';
      try { return await build(); } catch (e) { lastErr = e; }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  })();
  try {
    const t = await translatorPromise;
    try { localStorage.setItem(STATE_KEY, 'ready'); } catch { /* ignore */ }
    loadProgress = 100;
    emit();
    return t;
  } catch (e) {
    translatorPromise = null;
    loadProgress = -1;
    emit();
    throw e;
  }
}

function extract(item: any): string {
  if (!item) return '';
  if (Array.isArray(item)) return extract(item[0]);
  return String(item.translation_text ?? item.generated_text ?? '').trim();
}

/**
 * 批量翻译（本地模型）。逐段调用以免超长截断；返回与输入等长的数组。
 * 单段失败留空字符串，由调用方决定是否用 AI 补。
 */
export async function translateWithLocalMt(
  texts: string[],
  opts: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<string[]> {
  const translator = await loadLocalMt();
  const out: string[] = [];
  for (let i = 0; i < texts.length; i++) {
    if (opts.signal?.aborted) break;
    const raw = texts[i];
    if (!raw || !raw.trim()) { out.push(''); continue; }
    try {
      // 超长段落截断到 900 字符（模型上限 512 token 左右）
      const res = await translator(raw.slice(0, 900));
      out.push(extract(res));
    } catch {
      out.push('');
    }
    opts.onProgress?.(i + 1, texts.length);
  }
  while (out.length < texts.length) out.push('');
  return out;
}

/** 打包版（Android/Electron）是否适合默认优先本地 MT */
export function preferLocalMtByDefault(): boolean {
  return Capacitor.isNativePlatform?.() === true;
}
