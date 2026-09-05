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
  try { toast.error('朗读暂时不可用，请点击重试'); } catch { /* ignore */ }
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
    const ws = new WebSocket(EDGE_WSS);
    ws.binaryType = 'arraybuffer';
    const parts: Uint8Array[] = [];
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* */ }
      if (err) reject(err);
      else if (parts.length === 0) reject(new Error('empty'));
      else resolve(new Blob(parts as BlobPart[], { type: 'audio/mpeg' }));
    };

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

function googleTTSUrl(text: string): string {
  return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=${encodeURIComponent(text)}`;
}

// ── Tier 2b: Local server TTS (Edge neural voices + Windows SAPI) ──

function cfTtsUrl(text: string, rate: number, voice?: string | null): string {
  const v = voice ? `&voice=${encodeURIComponent(voice)}` : '';
  return `/api/tts?text=${encodeURIComponent(text)}&rate=${rate.toFixed(2)}${v}`;
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

  const ttsSupported = 'speechSynthesis' in window;

  const clearSafety = () => {
    if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null; }
  };
  const stopKeepAlive = () => {
    if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
  };
  const stopAudio = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
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
      // Desktop build: /api/tts is served by the local Windows SAPI engine
      // (offline, cached) — fastest first; edge/google as fallbacks
      const engines: Array<'cf' | 'edge' | 'google'> = ['cf', 'edge', 'google'];
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

      const playUrl = (url: string, opts?: { applyRate?: boolean }) => {
        if (abortedRef.current) { onDone(); return; }
        stopAudio();
        const a = new Audio(url);
        audioRef.current = a;
        a.preload = 'auto';
        a.volume = settings.volume;
        // cf/google engines have no server-side rate control — compensate via
        // playbackRate (preserves pitch). Edge engine already encodes rate in SSML.
        if (opts?.applyRate) a.playbackRate = Math.min(2, Math.max(0.5, rate));
        a.onplay = () => { if (!abortedRef.current) { setIsSpeaking(true); setIsPaused(false); } };
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

      if (engine === 'cf') {
        // Prefetch the NEXT chunk while this one plays — the local server
        // synthesizes into cache, so the next segment starts instantly.
        // Playback request goes first, prefetch second → FIFO order holds.
        const next = chunks[idx + 1];
        if (next) {
          fetch(cfTtsUrl(next, rate, settings.selectedVoiceURI), { priority: 'low' }).catch(() => {});
        }
        playUrl(cfTtsUrl(chunks[idx], rate, settings.selectedVoiceURI), { applyRate: !isServerVoice(settings.selectedVoiceURI) });
      } else if (engine === 'edge') {
        edgeTTSBlob(chunks[idx], rate, edgeVoiceFor(settings.selectedVoiceURI))
          .then((blob) => playUrl(URL.createObjectURL(blob)))
          .catch(onFail);
      } else {
        // google
        playUrl(googleTTSUrl(chunks[idx]), { applyRate: true });
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
    // Fill the local server synth cache with the SAME rate/voice the actual
    // speak() will request — a mismatched cache key makes prewarm useless.
    const rate = opts?.rate ?? settings.rate;
    try {
      const url = cfTtsUrl(cleaned, rate, settings.selectedVoiceURI);
      // Use fetch with low priority so it doesn't compete with current playback
      fetch(url, { priority: 'low' }).catch(() => {});
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
      if (isIOS() || isElectron() || isServerVoice(settings.selectedVoiceURI)) {
        // iOS: SpeechSynthesis broken. Electron: voices often missing/silent.
        // Server voice: synthesized by /api/tts. All → network engines.
        // Pipeline warm-up: stagger-prefetch upcoming chunks in parallel —
        // the server synthesizes each independently, so by the time chunk 0
        // finishes playing, later chunks are already cached (no gaps)
        chunks.slice(1, 9).forEach((c, i) => {
          setTimeout(() => {
            fetch(cfTtsUrl(c, rate, settings.selectedVoiceURI), { priority: 'low' }).catch(() => {});
          }, 60 * (i + 1));
        });
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
