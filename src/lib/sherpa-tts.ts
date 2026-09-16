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
import { safeStorage } from './safe-storage';

/** 加载中标记：成功才清除。若下次启动发现它还挂着，说明上次把 app 崩掉了。 */
const TRY_KEY = '__nativethink_sherpa_try';
/** 被护栏自动停用的标记 */
const OFF_KEY = '__nativethink_sherpa_off';

export function isBundledEngineDisabled(): boolean {
  try { return safeStorage.getItem(OFF_KEY) === '1'; } catch { return false; }
}

/** 用户手动重新启用（设置页按钮） */
export function reenableBundledEngine(): void {
  try {
    safeStorage.removeItem(OFF_KEY);
    safeStorage.removeItem(TRY_KEY);
  } catch { /* ignore */ }
}

/**
 * 启动时调用：内置引擎是原生代码，崩起来是直接杀进程（Java 接不住），
 * 所以用「加载前打标记、成功才清除」来判定上一次是否走完 —— 没走完就自动停用，
 * 保证 app 还能正常用（朗读回退到系统/云端），而不是反复闪退。
 *
 * 注意不能用「标记有多旧」来判断：每次加载都会重设标记时间，真崩了再打开时
 * 标记永远是新的，按时间判就永远不触发。这里只问「上次有没有走完」。
 * 代价是「用户在加载途中手动关掉 app」也会被当成异常而停用 —— 有手动重启用按钮兜底。
 */
export function checkBundledEngineHealth(): void {
  try {
    if (safeStorage.getItem(OFF_KEY) === '1') return;
    const t = Number(safeStorage.getItem(TRY_KEY) || 0);
    if (t > 0) {
      safeStorage.setItem(OFF_KEY, '1');
      safeStorage.removeItem(TRY_KEY);
    }
  } catch { /* ignore */ }
}

export interface ISherpaStatus {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  sampleRate: number;
  cached: number;
  /** 初始化走通的路线：assets（直读）或 files（摊到内部存储） */
  route?: string | null;
  /** 已摊出的模型字节数（诊断用） */
  modelBytes?: number;
  /** espeak 音素数据文件数（诊断用） */
  espeakFiles?: number;
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
  // 上次加载把 app 崩过 → 已被护栏停用，除非用户手动再启用
  if (isBundledEngineDisabled()) return Promise.resolve(null);
  if (!initPromise) {
    try { safeStorage.setItem(TRY_KEY, String(Date.now())); } catch { /* ignore */ }
    initPromise = SherpaTts.init()
      .then((s) => {
        // 到了 ready 才算这次加载真的走完，可以撤掉「加载中」标记
        if (s?.status === 'ready') {
          try { safeStorage.removeItem(TRY_KEY); } catch { /* ignore */ }
        }
        return s;
      })
      .catch(() => {
        initPromise = null; // 失败允许下次重试
        try { safeStorage.removeItem(TRY_KEY); } catch { /* ignore */ }
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
