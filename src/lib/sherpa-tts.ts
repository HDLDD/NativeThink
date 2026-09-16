/**
 * 内置离线朗读引擎（sherpa-onnx + Piper 音色）—— 仅安卓 APK。
 *
 * 为什么需要：安卓系统 TTS 在很多机器上没有本地音色，只能联网合成 ——
 * 起播慢、随网速波动、偶尔读不出来或只读一半，且「刚开始慢、读过的变快」
 * 正是缓存造成的假象。内置引擎把合成放在设备内完成（同类方案实测 RTF≈0.08，
 * 3 秒语音约 250ms 合成完），与网速彻底无关。
 *
 * 分工：插件只负责合成并把音频落成 WAV 文件，播放仍走 WebView 的 <audio>，
 * 这样暂停/续读/队列/语速微调都复用现有逻辑。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface ISherpaStatus {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  sampleRate: number;
  cached: number;
}

export interface ISherpaSpeakResult {
  path: string;
  bytes: number;
  durationMs: number;
  cached: boolean;
  /** 插件侧耗时（合成+落盘） */
  ms: number;
}

interface ISherpaTtsPlugin {
  status(): Promise<ISherpaStatus>;
  init(): Promise<ISherpaStatus>;
  speak(options: { text: string; speed?: number }): Promise<ISherpaSpeakResult>;
  purge(): Promise<{ removed: number }>;
}

const SherpaTts = registerPlugin<ISherpaTtsPlugin>('SherpaTts');

export function isSherpaAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform?.() === true && Capacitor.getPlatform?.() === 'android';
  } catch { return false; }
}

let initPromise: Promise<ISherpaStatus | null> | null = null;

/** 预热引擎（幂等）。模型 60MB，首次加载约 1~2 秒，宜在进入阅读/学习页时提前调用。 */
export function warmSherpa(): Promise<ISherpaStatus | null> {
  if (!isSherpaAvailable()) return Promise.resolve(null);
  if (!initPromise) {
    initPromise = SherpaTts.init().catch(() => {
      initPromise = null; // 失败允许下次重试
      return null;
    });
  }
  return initPromise;
}

export async function getSherpaStatus(): Promise<ISherpaStatus | null> {
  if (!isSherpaAvailable()) return null;
  try { return await SherpaTts.status(); } catch { return null; }
}

export async function purgeSherpaCache(): Promise<number> {
  if (!isSherpaAvailable()) return 0;
  try { return (await SherpaTts.purge()).removed; } catch { return 0; }
}

/** 文本+语速 → 可播放 URL 的缓存，省掉重复的跨端调用（插件侧另有一层文件缓存） */
const urlCache = new Map<string, { url: string; durationMs: number }>();
const MAX_CACHE = 120;

function keyOf(text: string, speed: number): string {
  return `${speed.toFixed(2)}|${text}`;
}

/**
 * 合成并返回可播放 URL（设备内合成，不联网）。
 * speed：1.0 原速，越大越快（与全站 rate 语义一致）。
 */
export async function sherpaSpeak(text: string, speed = 1): Promise<{ url: string; durationMs: number; cached: boolean; ms: number }> {
  const clean = text.trim();
  if (!clean) throw new Error('empty_text');
  const key = keyOf(clean, speed);
  const hit = urlCache.get(key);
  if (hit) return { ...hit, cached: true, ms: 0 };

  await warmSherpa();
  const res = await SherpaTts.speak({ text: clean, speed });
  const url = Capacitor.convertFileSrc(res.path);
  if (urlCache.size >= MAX_CACHE) {
    const oldest = urlCache.keys().next().value;
    if (oldest !== undefined) urlCache.delete(oldest);
  }
  urlCache.set(key, { url, durationMs: res.durationMs });
  return { url, durationMs: res.durationMs, cached: res.cached, ms: res.ms };
}

/** 只预热不播放（供阅读器/学习页提前合成下一段） */
export function sherpaPrewarm(text: string, speed = 1): void {
  if (!isSherpaAvailable() || !text.trim()) return;
  const key = keyOf(text.trim(), speed);
  if (urlCache.has(key)) return;
  void sherpaSpeak(text, speed).catch(() => {});
}
