/**
 * TTS (Text-to-Speech) hook — platform-aware, multi-engine.
 *
 * Desktop (Chrome/Edge/Firefox):
 *   Primary: Browser SpeechSynthesis — offline, instant, works everywhere.
 *   Fallback: 1.5s start-timeout → Cloudflare Function → direct WebSocket.
 *
 * Mobile / iOS:
 *   Primary: Cloudflare Pages Function (/api/tts) proxies Edge-TTS via
 *     Cloudflare's global network (not blocked by GFW). CDN-cached, ~10ms replay.
 *   Fallback: Direct Edge-TTS WebSocket → Google TTS URL.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { getNativeTts as getNativeTtsPlugin, pickPreferredEnglishVoice } from './native-tts';
import { isSherpaAvailable, sherpaPrewarm, sherpaSpeak, warmSherpa } from './sherpa-tts';
import { edgeVoiceNameOf, googleLangOf, isEdgeCatalogVoice } from './tts-voice-catalog';
import { useTTSSettings } from './tts-settings';
import { cleanText } from './utils';

// ── Types ──

export interface UseTTSOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: Error) => void;
  onBoundary?: (event: SpeechSynthesisEvent, wordIndex: number) => void;
}

export interface SpeakOptions {
  lang?: string;   // e.g. 'en-US'
  rate?: number;   // 0.5 – 1.5
  pitch?: number;  // 0.5 – 2.0
  volume?: number; // 0.0 – 1.0
}

export interface TTSHandle {
  speak: (text: string, opts?: SpeakOptions) => void;
  prewarm: (text: string, opts?: { rate?: number }) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  isSpeaking: boolean;
  isPaused: boolean;
  currentWordIndex: number;
  voices: SpeechSynthesisVoice[];
}

// ── Constants ──

const EDGE_WSS =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4';

/** Detect iOS (SpeechSynthesis is broken there) */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** 全部引擎失败时的用户提示 — 5 秒内只提示一次，避免刷屏 */
let _lastTtsFailNotice = 0;
function notifyTtsFailure(): void {
  const now = Date.now();
  if (now - _lastTtsFailNotice < 5000) return;
  _lastTtsFailNotice = now;
  try { toast.error('朗读暂时不可用（可在设置里点「朗读自检」定位原因）', { duration: 5000 }); } catch { /* ignore */ }
}

/**
 * Detect Electron (desktop build). Chromium inside Electron often has no
 * SAPI voices wired up — SpeechSynthesis may "speak" silently without ever
 * firing onstart, so network engines (Edge-TTS) are more reliable there.
 */
function isElectron(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Electron/.test(navigator.userAgent);
}

function uid(): string {
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function rateToEdge(rate: number): string {
  const pct = Math.round((rate - 1.0) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

/** Map a selected system voice to the closest Edge-TTS neural voice */
function edgeVoiceFor(selectedURI: string | null | undefined): string {
  if (!selectedURI) return 'en-US-AriaNeural';
  // 内置在线神经语音（目录选择）→ 直接用其语音名，不做模糊映射
  const explicit = edgeVoiceNameOf(selectedURI);
  if (explicit) return explicit;
  const n = selectedURI.toLowerCase();
  if (n.includes('zira')) return 'en-US-ZiraNeural';
  if (n.includes('david')) return 'en-US-DavidNeural';
  if (n.includes('jenny')) return 'en-US-JennyNeural';
  if (n.includes('guy')) return 'en-US-GuyNeural';
  if (n.includes('emma')) return 'en-US-EmmaNeural';
  if (n.includes('aria')) return 'en-US-AriaNeural';
  if (n.includes('ana')) return 'en-US-AnaNeural';
  return 'en-US-AriaNeural';
}

// ── Tier 2: Edge-TTS via WebSocket → Blob ──

function edgeTTSBlob(text: string, rate: number, voiceName = 'en-US-AriaNeural'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const parts: Uint8Array[] = [];
    let settled = false;
    let ws: WebSocket;
    // 连接看门狗：Edge 通道在部分网络被墙，浏览器默认要等十几秒才报错 ——
    // 这里 1.5s 内没连上就直接放弃，让调用方立刻降级到云端通道，避免朗读"卡住不动"
    const connectTimer = setTimeout(() => finish(new Error('edge-connect-timeout')), 1500);
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      try { ws?.close(); } catch { /* */ }
      if (err) reject(err);
      else if (parts.length === 0) reject(new Error('empty'));
      else resolve(new Blob(parts as BlobPart[], { type: 'audio/mpeg' }));
    };

    try {
      ws = new WebSocket(EDGE_WSS);
    } catch {
      finish(new Error('edge-unavailable'));
      return;
    }
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      ws.send(
        `X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":false,"wordBoundaryEnabled":false},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`,
      );
      const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
      ws.send(
        `X-RequestId:${uid()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toISOString()}Z\r\nPath:ssml\r\n\r\n` +
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'><voice name='${voiceName}'><prosody rate='${rateToEdge(rate)}' pitch='+0Hz'>${safe}</prosody></voice></speak>`,
      );
    };

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        const buf = new Uint8Array(e.data);
        if (buf.length >= 2) {
          const hl = ((buf[0] << 8) | buf[1]);
          const body = buf.subarray(hl);
          if (body.length > 0) parts.push(body);
        }
      } else if (typeof e.data === 'string' && e.data.includes('Path:turn.end')) {
        finish();
      }
    };

    ws.onerror = () => finish(new Error('ws-error'));
    ws.onclose = () => !settled && parts.length > 0 ? finish() : finish(new Error('ws-closed'));
    setTimeout(() => finish(new Error('timeout')), 8000);
  });
}

// ── Tier 3: Google Translate TTS URL ──

function googleTTSUrl(text: string, lang = 'en'): string {
  return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`;
}

// ── Tier 0: 原生 TTS（Android APK 内置插件 — 系统语音引擎，离线零延迟不断流） ──
const IS_ANDROID_NATIVE = Capacitor.isNativePlatform?.() && Capacitor.getPlatform?.() === 'android';

const getNativeTts = getNativeTtsPlugin;

/**
 * 上一次朗读的实测报告 —— 设置页直接回显，用来判断「慢」到底慢在哪一段：
 * 系统引擎（离线，与网速无关）还是云端（每次都要联网合成）。
 * 手机上没法开控制台，这个回显就是唯一的现场证据。
 */
export interface ITtsPlaybackReport {
  engine: 'piper' | 'native' | 'cf' | 'edge' | 'google';
  /** 从发起合成到实际起播的毫秒数 */
  firstAudioMs: number;
  /** 是否降级来的（前一个引擎失败） */
  fellBack: boolean;
  at: number;
}

let lastPlaybackReport: ITtsPlaybackReport | null = null;

function reportPlayback(r: Omit<ITtsPlaybackReport, 'at'>): void {
  lastPlaybackReport = { ...r, at: Date.now() };
}

/** 读取上次朗读报告（无则 null）—— 供设置页回显 */
export function getLastTtsReport(): ITtsPlaybackReport | null {
  return lastPlaybackReport;
}

// ── Tier 2b: Local server TTS (Edge neural voices + Windows SAPI) ──

function cfTtsUrl(text: string, rate: number, voice?: string | null, lang?: string): string {
  const base = (typeof window !== 'undefined' && (window as any).__API_BASE__) || '';
  const v = voice ? `&voice=${encodeURIComponent(voice)}` : '';
  // lang 用于口音兜底：Edge 不可达时，云端用 Google 的语言变体发音
  const l = lang ? `&lang=${encodeURIComponent(lang)}` : '';
  return `${base}/api/tts?text=${encodeURIComponent(text)}&rate=${rate.toFixed(2)}${v}${l}`;
}

// ── Cache API 层：合成过的语音本地永久缓存 — 手机端重复朗读零等待 ──
const TTS_CACHE_NAME = 'nativethink-tts-v1';

/** 静默拉取并写入 Cache API（幂等；已缓存则跳过） */
async function warmTtsCache(url: string): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(TTS_CACHE_NAME);
    if (await cache.match(url)) return;
    const resp = await fetch(url, { priority: 'low' } as RequestInit);
    if (resp.ok) await cache.put(url, resp.clone());
  } catch { /* ignore */ }
}

/** 命中缓存时返回 blob URL（即时起播），否则原样返回网络 URL */
async function getCachedOrUrl(url: string): Promise<string> {
  try {
    if (typeof caches === 'undefined') return url;
    const cache = await caches.open(TTS_CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) return URL.createObjectURL(await hit.blob());
  } catch { /* ignore */ }
  return url;
}

/** True when the selected voice is served by the local desktop server */
function isServerVoice(voiceURI: string | null | undefined): boolean {
  return !!voiceURI && voiceURI.startsWith('srv:');
}

// ── Chunk long texts ──

function chunkText(text: string, maxLen = 400): string[] {
  const out: string[] = [];
  let r = text.trim();
  while (r.length > 0) {
    if (r.length <= maxLen) { out.push(r); break; }
    let cut = r.lastIndexOf('. ', maxLen);
    if (cut < maxLen / 2) cut = r.lastIndexOf('? ', maxLen);
    if (cut < maxLen / 2) cut = r.lastIndexOf('! ', maxLen);
    if (cut < maxLen / 2) cut = r.lastIndexOf(' ', maxLen);
    if (cut < maxLen / 2) cut = maxLen;
    if (r[cut] === '.' || r[cut] === '?' || r[cut] === '!') cut += 1;
    out.push(r.slice(0, cut + 1).trim());
    r = r.slice(cut + 1).trim();
  }
  return out.filter(Boolean);
}

// ── Hook ──

export function useTTS(options?: UseTTSOptions): TTSHandle {
  const { settings } = useTTSSettings();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; });

  // ── Refs ──
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ssUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const genRef = useRef(0);
  const abortedRef = useRef(false);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primedRef = useRef(false);
  const audioUnlockedRef = useRef(false);
  // 原生 TTS 状态
  const nativeActiveRef = useRef(false);
  const nativePausedRef = useRef(false);
  const nativeReplayRef = useRef<(() => void) | null>(null);

  const ttsSupported = 'speechSynthesis' in window;

  const clearSafety = () => {
    if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null; }
  };
  const stopKeepAlive = () => {
    if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
  };
  const stopAudio = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    // 原生引擎正在播 → 同步原生停止（仅原生激活时，避免与刚启动的 speak 竞态）
    if (nativeActiveRef.current) {
      nativeActiveRef.current = false;
      void getNativeTts().then((t) => t?.stop().catch(() => {}));
    }
  };

  // ── Load voices ──
  useEffect(() => {
    if (!ttsSupported) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () => {
      const en = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en-'));
      if (en.length > 0) {
        setVoices(en);
      } else if (tries++ < 6) {
        // Chrome/Electron populate voices asynchronously — voiceschanged may
        // never fire in Electron, so poll a few times before giving up
        timer = setTimeout(load, 400);
      } else {
        // No English voices at all — expose every voice so the settings
        // dialog still offers a choice (non-en voices can read English text)
        const all = window.speechSynthesis.getVoices();
        if (all.length > 0) setVoices(all);
      }
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      if (timer) clearTimeout(timer);
      window.speechSynthesis.removeEventListener('voiceschanged', load);
    };
  }, [ttsSupported]);

  // ── Prime SpeechSynthesis + Audio on first tap (mobile requirement) ──
  const prime = useCallback(() => {
    if (!primedRef.current && ttsSupported) {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      } catch { /* */ }
      primedRef.current = true;
    }
    // Unlock HTMLAudioElement: create silent audio and play() during user gesture.
    // This tells the browser "user has interacted" — all future Audio.play() calls work.
    if (!audioUnlockedRef.current) {
      try {
        const a = new Audio();
        a.volume = 0;
        a.play().then(() => { a.pause(); a.src = ''; }).catch(() => {});
        audioUnlockedRef.current = true;
      } catch { /* */ }
    }
  }, [ttsSupported]);

  useEffect(() => {
    if (primedRef.current && audioUnlockedRef.current) return;
    const cb = () => { prime(); document.removeEventListener('touchstart', cb); document.removeEventListener('click', cb); };
    document.addEventListener('touchstart', cb, { once: true });
    document.addEventListener('click', cb, { once: true });
    return () => { document.removeEventListener('touchstart', cb); document.removeEventListener('click', cb); };
  }, [prime]);

  // ── Chunked audio playback (for network engines) ──
  // Cascade fallback: cf → edge → google — each level only degrades on actual failure

  const playChunkWithFallback = useCallback(
    (chunks: string[], idx: number, rate: number, engineIdx: number) => {
      // Android APK：原生系统 TTS 引擎优先 — 离线、即时、不断流；
      // 失败（无语音引擎等）再走网络引擎链。桌面构建 /api/tts 走本地 SAPI。
      // 引擎顺序（实测：Edge 直连在国内网络不可达，故不作为首选；
      // 云端通道经 Cloudflare 边缘访问 Google，是网络环境下的可靠通道）。
      // Android：原生引擎优先（离线、零延迟、不断流）→ 云端 → 其余
      // 其他平台：云端 → Edge → Google
      // 用户显式选了在线语音 → 直接走云端（原生引擎发不出该音色，先试只会白等）
      const wantsOnlineVoice = isEdgeCatalogVoice(settings.selectedVoiceURI);
      // 安卓：内置离线引擎（Piper）优先 —— 设备内合成、起播几十毫秒、与网速无关。
      // 用户显式选了在线音色则尊重其选择（clound 优先），但把内置引擎排在第二位，
      // 网络不可用时仍能出声。开着「只用系统引擎」时只走离线通道。
      const engines: Array<'piper' | 'native' | 'cf' | 'edge' | 'google'> = IS_ANDROID_NATIVE
        ? (settings.preferNative
          ? ['piper', 'native']
          : (wantsOnlineVoice ? ['cf', 'piper', 'native', 'edge', 'google'] : ['piper', 'native', 'cf', 'edge', 'google']))
        : ['cf', 'edge', 'google'];
      const engine = engines[engineIdx];
      if (!engine || abortedRef.current || idx >= chunks.length) {
        stopAudio();
        setIsSpeaking(false);
        setIsPaused(false);
        if (idx >= chunks.length && !abortedRef.current) optionsRef.current?.onEnd?.();
        return;
      }

      const onDone = () => playChunkWithFallback(chunks, idx + 1, rate, 0); // next chunk, reset to best engine
      const onFail = () => {
        // Current engine failed — try next one for the SAME chunk
        if (engineIdx + 1 < engines.length) {
          playChunkWithFallback(chunks, idx, rate, engineIdx + 1);
        } else {
          // 所有在线引擎失败 — 最后兜底：系统 SpeechSynthesis 直读
          // （桌面端部分环境可用；浏览器端通常可用）。仍失败才提示。
          try {
            if ('speechSynthesis' in window && !abortedRef.current) {
              const u = new SpeechSynthesisUtterance(chunks[idx]);
              u.lang = 'en-US';
              u.rate = rate;
              const en = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en-'));
              if (en[0]) u.voice = en[0];
              u.onend = () => onDone();
              u.onerror = () => { notifyTtsFailure(); onDone(); };
              window.speechSynthesis.speak(u);
              setIsSpeaking(true);
              return;
            }
          } catch { /* ignore */ }
          notifyTtsFailure();
          onDone();
        }
      };

      const playUrl = (url: string, opts?: { applyRate?: boolean; engine?: 'piper' | 'cf' | 'edge' | 'google'; t0?: number }) => {
        if (abortedRef.current) { onDone(); return; }
        stopAudio();
        const a = new Audio(url);
        audioRef.current = a;
        a.preload = 'auto';
        a.volume = settings.volume;
        // cf/google engines have no server-side rate control — compensate via
        // playbackRate (preserves pitch). Edge engine already encodes rate in SSML.
        if (opts?.applyRate) a.playbackRate = Math.min(2, Math.max(0.5, rate));
        a.onplay = () => {
          if (!abortedRef.current) { setIsSpeaking(true); setIsPaused(false); }
          if (opts?.engine && opts.t0) {
            reportPlayback({ engine: opts.engine, firstAudioMs: Date.now() - opts.t0, fellBack: engineIdx > 0 });
          }
        };
        a.onended = () => { if (audioRef.current === a) audioRef.current = null; onDone(); };
        a.onerror = () => { if (audioRef.current === a) audioRef.current = null; onFail(); };
        safetyRef.current = setTimeout(() => {
          // Don't kill a chunk the user deliberately paused
          if (a.paused) return;
          if (audioRef.current === a) { a.pause(); a.src = ''; audioRef.current = null; onFail(); }
        }, 25000);
        // After first-touch prime(), mobile browsers allow play() — but if it
        // still fails (e.g. no prior user gesture), cascade to next engine
        a.play().catch(() => { if (audioRef.current === a) audioRef.current = null; onFail(); });
      };

      if (engine === 'native') {
        getNativeTts()
          .then(async (plugin) => {
            if (!plugin) { onFail(); return; }
            // 语音选择：用户选过就用用户的；没选过则自动挑一个「本地」音色 ——
            // 网络音色每次朗读都要把文本发到服务器合成（500~2000ms），
            // 而系统默认很可能就是网络音色，这正是「朗读要等两秒」的主因。
            let voiceIdx: number | null = null;
            if (typeof settings.nativeVoiceIndex === 'number' && settings.nativeVoiceIndex >= 0) {
              voiceIdx = settings.nativeVoiceIndex;
            } else {
              const preferred = await pickPreferredEnglishVoice();
              voiceIdx = preferred ? preferred.index : null;
            }
            if (abortedRef.current) return;
            stopAudio();
            nativeActiveRef.current = true;
            nativeReplayRef.current = () => playChunkWithFallback(chunks, idx, rate, 0);
            setIsSpeaking(true); setIsPaused(false);

            const text = chunks[idx];
            let settled = false;
            let spokeAtLeastOnce = false;
            let listenerHandle: any = null;

            const clearWatchdog = () => { if (nativeWatchdog) { clearTimeout(nativeWatchdog); nativeWatchdog = null; } };
            const teardown = () => {
              clearWatchdog();
              try { listenerHandle?.remove?.(); } catch { /* ignore */ }
              listenerHandle = null;
            };
            // 关键看门狗：系统引擎缺英语语音包时 speak() 既不成功也不失败，
            // 会无声地挂住整个降级链（用户感知＝"点了不朗读"）。
            // 因此只要 2.5s 内没有任何"开始发声"的证据，就放弃原生、降级到网络引擎。
            let nativeWatchdog: ReturnType<typeof setTimeout> | null = setTimeout(() => {
              if (settled || spokeAtLeastOnce) return;
              settled = true;
              teardown();
              try { plugin.stop?.(); } catch { /* ignore */ }
              nativeActiveRef.current = false;
              console.info('[tts] native engine silent → falling back to network engines');
              if (!abortedRef.current) onFail();
            }, 2500);

            const startedAt = Date.now();

            // onRangeStart = 引擎真的开始读了（不同 Android 版本触发时机略有差异）
            try {
              Promise.resolve(plugin.addListener?.('onRangeStart', () => {
                // 每读一个词都会触发一次，只取第一次 —— 那就是起播时刻，
                // 也是判断「慢在离线引擎还是慢在联网合成」的直接证据
                if (!spokeAtLeastOnce) {
                  reportPlayback({ engine: 'native', firstAudioMs: Date.now() - startedAt, fellBack: engineIdx > 0 });
                }
                spokeAtLeastOnce = true;
                clearWatchdog();
              })).then((h: any) => { listenerHandle = h; }).catch(() => {});
            } catch { /* ignore */ }

            // 预期朗读时长（粗略）：按词数估算，用于识别"瞬间返回但没出声"的假成功
            const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
            const expectedMs = Math.max(500, (wordCount * 260) / Math.max(0.5, rate));

            plugin.speak({
              text,
              lang: 'en-US',
              rate: Math.min(1.5, Math.max(0.5, rate)),
              pitch: 1,
              volume: typeof settings.volume === 'number' ? settings.volume : 1,
              // 用户在设置里选定的系统语音（null = 系统默认）
              ...(voiceIdx !== null && voiceIdx >= 0 ? { voice: voiceIdx } : {}),
            })
              .then(() => {
                clearWatchdog();
                if (settled) return; // 看门狗已降级，忽略迟到回调
                settled = true;
                teardown();
                nativeActiveRef.current = false;
                const elapsed = Date.now() - startedAt;
                // 假成功识别：引擎立即 resolve、且从未触发 onRangeStart（真的没出声）
                // → 不能当成播放完成，必须降级到网络引擎，否则就是"点了没声"
                if (!spokeAtLeastOnce && elapsed < Math.min(expectedMs * 0.4, 1500)) {
                  console.info('[tts] native resolved silently (' + elapsed + 'ms) → fallback');
                  if (!abortedRef.current) onFail();
                  return;
                }
                if (!abortedRef.current) onDone();
              })
              .catch(() => {
                clearWatchdog();
                if (settled) return;
                settled = true;
                teardown();
                nativeActiveRef.current = false;
                if (!abortedRef.current) onFail();
              });
          })
          .catch(() => onFail());
        return;
      }

      if (engine === 'piper') {
        // 内置离线引擎：设备内合成（不联网），起播几十毫秒；下一段顺手预合成
        const t0 = Date.now();
        const next = chunks[idx + 1];
        if (next) sherpaPrewarm(next, rate);
        sherpaSpeak(chunks[idx], rate)
          .then(({ url }) => playUrl(url, { engine: 'piper', t0 }))
          .catch(onFail);
        return;
      }

      if (engine === 'cf') {
        // 预取下一句到 Cache API；当前句优先走本地缓存（二次朗读零等待）
        const next = chunks[idx + 1];
        if (next) warmTtsCache(cfTtsUrl(next, rate, settings.selectedVoiceURI, googleLangOf(settings.selectedVoiceURI))).catch(() => {});
        const url = cfTtsUrl(chunks[idx], rate, settings.selectedVoiceURI, googleLangOf(settings.selectedVoiceURI));
        const t0 = Date.now();
        getCachedOrUrl(url)
          .then((u) => playUrl(u, { applyRate: !isServerVoice(settings.selectedVoiceURI), engine: 'cf', t0 }))
          .catch(onFail);
      } else if (engine === 'edge') {
        const t0 = Date.now();
        edgeTTSBlob(chunks[idx], rate, edgeVoiceFor(settings.selectedVoiceURI))
          .then((blob) => playUrl(URL.createObjectURL(blob), { engine: 'edge', t0 }))
          .catch(onFail);
      } else {
        // google
        const t0 = Date.now();
        playUrl(googleTTSUrl(chunks[idx], googleLangOf(settings.selectedVoiceURI)), { applyRate: true, engine: 'google', t0 });
      }
    },
    [settings.volume, settings.selectedVoiceURI],
  );

  // ── SpeechSynthesis engine (Tier 1) ──

  const ssCancel = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentWordIndex(-1);
    stopKeepAlive();
    clearSafety();
    ssUtteranceRef.current = null;
  }, []);

  const speakSS = useCallback(
    (text: string, rate: number, pitch: number, volume: number, lang: string, fallbackTimer?: ReturnType<typeof setTimeout>) => {
      if (!ttsSupported) return;
      // 安卓 APK 上 WebView 的语音合成无声却会回报成功 → 绝不使用，直接交给降级定时器
      if (IS_ANDROID_NATIVE) {
        if (fallbackTimer) { /* 让它自然触发 → 走原生/网络引擎 */ }
        return;
      }

      genRef.current++;
      const gen = genRef.current;

      // NOTE: cancel is handled by ssCancel() in speak() — don't cancel here.
      // Double cancel causes Chrome race condition where the new utterance
      // gets dropped, especially when switching words quickly.

      const cleaned = cleanText(text);
      if (!cleaned) { clearTimeout(fallbackTimer); return; }

      const u = new SpeechSynthesisUtterance(cleaned);
      u.lang = lang;
      u.rate = rate;
      u.pitch = pitch;
      u.volume = volume;
      ssUtteranceRef.current = u;

      // Voice
      const all = window.speechSynthesis.getVoices();
      const enVoices = all.filter((v) => v.lang.startsWith('en-'));
      if (enVoices.length > 0) {
        // Prefer a Google or Microsoft voice
        const best = enVoices.find((v) => v.name.includes('Google')) ||
          enVoices.find((v) => v.name.includes('Microsoft')) ||
          enVoices.find((v) => v.localService) ||
          enVoices[0];
        if (best) u.voice = best;
      }

      let started = false;

      u.onstart = () => {
        if (genRef.current !== gen) return;
        clearTimeout(fallbackTimer);
        started = true;
        setIsSpeaking(true);
        setIsPaused(false);
        setCurrentWordIndex(0);
        optionsRef.current?.onStart?.();
        // Keep-alive for long speech (Chrome 15s cutoff)
        stopKeepAlive();
        keepAliveRef.current = setInterval(() => {
          if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
          }
        }, 10000);
      };

      u.onend = () => {
        if (genRef.current !== gen) return;
        stopKeepAlive();
        setIsSpeaking(false);
        setIsPaused(false);
        setCurrentWordIndex(-1);
        ssUtteranceRef.current = null;
        optionsRef.current?.onEnd?.();
      };

      u.onerror = (e) => {
        clearTimeout(fallbackTimer);
        if (genRef.current !== gen) return;
        stopKeepAlive();
        if (e.error === 'canceled' || e.error === 'interrupted') {
          setIsSpeaking(false);
          setIsPaused(false);
          setCurrentWordIndex(-1);
          ssUtteranceRef.current = null;
          return;
        }
        // All other errors: reset and report
        setIsSpeaking(false);
        setIsPaused(false);
        setCurrentWordIndex(-1);
        ssUtteranceRef.current = null;
        optionsRef.current?.onError?.(e as any);
      };

      u.onpause = () => setIsPaused(true);
      u.onresume = () => setIsPaused(false);

      u.onboundary = (e) => {
        if (e.charIndex !== undefined) {
          const before = cleaned.slice(0, e.charIndex).trim();
          const idx = before === '' ? 0 : before.split(/\s+/).length;
          setCurrentWordIndex(idx);
          optionsRef.current?.onBoundary?.(e, idx);
        }
      };

      try {
        window.speechSynthesis.speak(u);
      } catch {
        setIsSpeaking(false);
        optionsRef.current?.onError?.(new Error('speak-failed') as any);
      }
    },
    [ttsSupported],
  );

  // ── Public API ──

  // Prewarm: silently fetch audio URL so browser caches it.
  // Call with the NEXT word while current word is displayed.
  const prewarm = useCallback((text: string, opts?: { rate?: number }) => {
    const cleaned = cleanText(text);
    if (!cleaned) return;
    const rate = opts?.rate ?? settings.rate;
    // 安卓未选在线音色时朗读走内置离线引擎 —— 预热它才有意义，
    // 此时再往云端拉合成纯属浪费流量，直接跳过。
    if (IS_ANDROID_NATIVE && isSherpaAvailable() && !isEdgeCatalogVoice(settings.selectedVoiceURI)) {
      warmSherpa(); // 首次触发即开始加载模型（1~2 秒），别等用户点了才加载
      sherpaPrewarm(cleaned, rate);
      return;
    }
    // Fill the local server synth cache with the SAME rate/voice the actual
    // speak() will request — a mismatched cache key makes prewarm useless.
    try {
      const url = cfTtsUrl(cleaned, rate, settings.selectedVoiceURI, googleLangOf(settings.selectedVoiceURI));
      // 写入 Cache API（比单纯 HTTP 缓存可靠）— speak() 命中后即时起播
      warmTtsCache(url).catch(() => {});
    } catch { /* */ }
  }, [settings.rate, settings.selectedVoiceURI]);

  const speak = useCallback(
    (text: string, opts?: SpeakOptions) => {
      // Cancel whatever is playing
      abortedRef.current = true;
      ssCancel();
      stopAudio();
      clearSafety();
      abortedRef.current = false;

      const cleaned = cleanText(text);
      if (!cleaned) return;

      const rate = opts?.rate ?? settings.rate;
      const pitch = opts?.pitch ?? settings.pitch;
      const volume = opts?.volume ?? settings.volume;
      const lang = opts?.lang ?? 'en-US';

      const chunks = chunkText(cleaned);

      // A server-provided voice (Edge neural / Windows SAPI) can only be
      // synthesized by the local server — skip SpeechSynthesis entirely
      if (isIOS() || isElectron() || IS_ANDROID_NATIVE || isServerVoice(settings.selectedVoiceURI)) {
        // iOS: SpeechSynthesis broken.
        // Android WebView（APK）：speechSynthesis 是个"假 API"——会触发 onstart
        //   让调用方以为播放成功（从而取消降级定时器），但完全不出声。
        //   这就是"手机点了不朗读"的根因，必须完全绕开它。
        // Electron: voices often missing/silent.
        // Server voice: synthesized by /api/tts. All → native/network engines.
        // Pipeline warm-up: stagger-prefetch upcoming chunks in parallel —
        // the server synthesizes each independently, so by the time chunk 0
        // finishes playing, later chunks are already cached (no gaps)
        // 安卓走内置离线引擎时改为在 piper 分支里预合成，不必再拉云端音频。
        const usingBundledEngine = IS_ANDROID_NATIVE && isSherpaAvailable() && !isEdgeCatalogVoice(settings.selectedVoiceURI);
        if (!usingBundledEngine) {
          chunks.slice(1, 9).forEach((c, i) => {
            setTimeout(() => {
              warmTtsCache(cfTtsUrl(c, rate, settings.selectedVoiceURI, googleLangOf(settings.selectedVoiceURI))).catch(() => {});
            }, 60 * (i + 1));
          });
        } else {
          warmSherpa();
        }
        playChunkWithFallback(chunks, 0, rate, 0);
        return;
      }

      // Desktop / Android: try SpeechSynthesis first (offline, instant)
      // Defer one tick to let ssCancel's cancel() fully resolve in the browser
      // Reduced to 300ms — SS onstart typically fires in <50ms on desktop;
      // 300ms is enough to detect silent failure without excessive user-perceived delay
      const fallbackTimer = setTimeout(() => {
        if (abortedRef.current) return;
        ssCancel();
        playChunkWithFallback(chunks, 0, rate, 0);
      }, 300);
      setTimeout(() => {
        if (abortedRef.current) return;
        speakSS(cleaned, rate, pitch, volume, lang, fallbackTimer);
      }, 0);
    },
    [settings.rate, settings.pitch, settings.volume, ssCancel, speakSS, playChunkWithFallback],
  );

  const cancel = useCallback(() => {
    abortedRef.current = true;
    ssCancel();
    stopAudio();
    clearSafety();
  }, [ssCancel]);

  const pause = useCallback(() => {
    if (nativeActiveRef.current) {
      // 原生引擎不支持暂停 — 停止并在恢复时重播当前段
      void getNativeTts().then((t) => t?.stop().catch(() => {}));
      nativeActiveRef.current = false;
      nativePausedRef.current = true;
      setIsPaused(true);
      return;
    }
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      clearSafety(); // paused chunk must not be killed by the 25s safety timer
      setIsPaused(true);
    } else if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, [clearSafety]);

  const resume = useCallback(() => {
    if (nativePausedRef.current) {
      nativePausedRef.current = false;
      setIsPaused(false);
      nativeReplayRef.current?.();
      return;
    }
    if (audioRef.current && audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
      setIsPaused(false);
    } else if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, []);

  // Cleanup
  useEffect(() => () => { stopKeepAlive(); clearSafety(); stopAudio(); }, []);

  return { speak, prewarm, pause, resume, cancel, isSpeaking, isPaused, currentWordIndex, voices };
}

/**
 * 试听某个语音 —— 走与真实朗读相同的链路：
 * Edge 通道（能给出具体音色）→ 失败则云端 Google 通道（保留口音差异）。
 * 试听结果能真实反映之后的朗读效果，不会出现"试听和实际不一致"。
 */
export async function previewTtsVoice(
  voiceURI: string | null,
  rate: number,
  volume: number,
): Promise<'edge' | 'accent' | 'failed'> {
  const text = 'Hello, this is a quick voice test.';
  // 1) Edge：可给出具体音色（男女声/自然音）
  if (voiceURI) {
    const t0 = Date.now();
    try {
      const blob = await edgeTTSBlob(text, rate, edgeVoiceFor(voiceURI));
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      a.volume = volume;
      a.onplay = () => reportPlayback({ engine: 'edge', firstAudioMs: Date.now() - t0, fellBack: false });
      await a.play();
      a.onended = () => URL.revokeObjectURL(url);
      return 'edge';
    } catch { /* Edge 不可达 → 口音兜底 */ }
  }
  // 2) 云端 Google 通道（口音变体）
  const t1 = Date.now();
  try {
    const url = cfTtsUrl(text, rate, voiceURI, googleLangOf(voiceURI));
    const a = new Audio(url);
    a.volume = volume;
    a.onplay = () => reportPlayback({ engine: 'cf', firstAudioMs: Date.now() - t1, fellBack: false });
    await a.play();
    return 'accent';
  } catch {
    return 'failed';
  }
}

export interface ITtsEngineProbe {
  engine: 'native' | 'cloud' | 'edge' | 'google' | 'webspeech';
  ok: boolean;
  ms: number;
  note?: string;
}

/**
 * 朗读自检 —— 依次探测各通道能否真正发声，返回每个通道的结果与耗时。
 * 用途：手机上"点了不朗读"时，一眼看出是哪条链路的问题。
 */
export async function probeTtsEngines(rate = 0.9): Promise<ITtsEngineProbe[]> {
  const text = 'Hello';
  const out: ITtsEngineProbe[] = [];

  // 1) 原生系统引擎
  const t0 = Date.now();
  const plugin = await getNativeTts();
  if (plugin) {
    const ok = await new Promise<boolean>((resolve) => {
      let done = false;
      let alive = false;
      const timer = setTimeout(() => { if (!done) { done = true; try { plugin.stop?.(); } catch { /* */ } resolve(alive); } }, 2500);
      try {
        Promise.resolve(plugin.addListener?.('onRangeStart', () => { alive = true; })).catch(() => {});
      } catch { /* ignore */ }
      plugin.speak({ text, lang: 'en-US', rate, pitch: 1, volume: 1 })
        .then(() => { if (!done) { done = true; clearTimeout(timer); resolve(true); } })
        .catch(() => { if (!done) { done = true; clearTimeout(timer); resolve(false); } });
    });
    out.push({ engine: 'native', ok, ms: Date.now() - t0, note: ok ? undefined : '系统无英语语音包或无引擎' });
  } else {
    out.push({ engine: 'native', ok: false, ms: 0, note: '非手机端 / 插件不可用' });
  }

  // 2) 云端通道（Cloudflare → Google）
  {
    const t1 = Date.now();
    try {
      const url = cfTtsUrl(text, rate, null, 'en');
      const r = await fetch(url, { method: 'GET' });
      const blob = r.ok ? await r.blob() : null;
      out.push({ engine: 'cloud', ok: !!(blob && blob.size > 500), ms: Date.now() - t1, note: blob ? `${blob.size} B` : `HTTP ${r.status}` });
    } catch (e) {
      out.push({ engine: 'cloud', ok: false, ms: Date.now() - t1, note: String(e).slice(0, 40) });
    }
  }

  // 3) Edge 直连通道
  {
    const t2 = Date.now();
    try {
      const blob = await edgeTTSBlob(text, rate, 'en-US-AriaNeural');
      out.push({ engine: 'edge', ok: blob.size > 500, ms: Date.now() - t2, note: `${blob.size} B` });
    } catch (e) {
      out.push({ engine: 'edge', ok: false, ms: Date.now() - t2, note: String(e).slice(0, 40) });
    }
  }

  // 4) 浏览器语音合成
  {
    const t3 = Date.now();
    const has = 'speechSynthesis' in window && window.speechSynthesis.getVoices().length > 0;
    out.push({ engine: 'webspeech', ok: has, ms: Date.now() - t3, note: has ? `${window.speechSynthesis.getVoices().length} 个语音` : '无可用语音' });
  }

  return out;
}
