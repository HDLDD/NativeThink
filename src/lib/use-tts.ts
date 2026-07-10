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

// ── Tier 2: Edge-TTS via WebSocket → Blob ──

function edgeTTSBlob(text: string, rate: number): Promise<Blob> {
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
      else resolve(new Blob(parts, { type: 'audio/mpeg' }));
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
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'><voice name='en-US-AriaNeural'><prosody rate='${rateToEdge(rate)}' pitch='+0Hz'>${safe}</prosody></voice></speak>`,
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

// ── Tier 2b: Cloudflare Function (Edge-TTS proxy) ──

function cfTtsUrl(text: string, rate: number): string {
  return `/api/tts?text=${encodeURIComponent(text)}&rate=${rate.toFixed(2)}`;
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

  const ttsSupported = 'speechSynthesis' in window;

  const clearSafety = () => {
    if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null; }
  };
  const stopKeepAlive = () => {
    if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
  };
  const stopAudio = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; audioRef.current = null; }
  };

  // ── Load voices ──
  useEffect(() => {
    if (!ttsSupported) return;
    const load = () => {
      const en = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en-'));
      if (en.length > 0) setVoices(en);
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, [ttsSupported]);

  // ── Prime SpeechSynthesis on first tap (mobile requirement) ──
  const prime = useCallback(() => {
    if (primedRef.current || !ttsSupported) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      window.speechSynthesis.speak(u);
      primedRef.current = true;
    } catch { /* */ }
  }, [ttsSupported]);

  useEffect(() => {
    if (!ttsSupported || primedRef.current) return;
    const cb = () => { prime(); document.removeEventListener('touchstart', cb); document.removeEventListener('click', cb); };
    document.addEventListener('touchstart', cb, { once: true });
    document.addEventListener('click', cb, { once: true });
    return () => { document.removeEventListener('touchstart', cb); document.removeEventListener('click', cb); };
  }, [ttsSupported, prime]);

  // ── Chunked audio playback (for network engines) ──

  const playAudioChunks = useCallback(
    (chunks: string[], idx: number, rate: number, engine: 'cf' | 'edge' | 'google') => {
      if (abortedRef.current || idx >= chunks.length) {
        stopAudio();
        setIsSpeaking(false);
        setIsPaused(false);
        if (idx >= chunks.length) optionsRef.current?.onEnd?.();
        return;
      }

      const onDone = () => playAudioChunks(chunks, idx + 1, rate, engine);

      const playUrl = (url: string) => {
        if (abortedRef.current) { onDone(); return; }
        stopAudio();
        const a = new Audio(url);
        audioRef.current = a;
        a.preload = 'auto';
        a.volume = settings.volume;
        a.onplay = () => { if (!abortedRef.current) { setIsSpeaking(true); setIsPaused(false); } };
        a.onended = () => { if (audioRef.current === a) audioRef.current = null; onDone(); };
        a.onerror = () => { if (audioRef.current === a) audioRef.current = null; onDone(); };
        safetyRef.current = setTimeout(() => {
          if (audioRef.current === a) { a.pause(); a.src = ''; audioRef.current = null; onDone(); }
        }, 25000);
        a.play().catch(() => onDone());
      };

      if (engine === 'cf') {
        // Cloudflare Function — simplest, most reliable
        playUrl(cfTtsUrl(chunks[idx], rate));
      } else if (engine === 'edge') {
        edgeTTSBlob(chunks[idx], rate)
          .then((blob) => playUrl(URL.createObjectURL(blob)))
          .catch(() => playUrl(googleTTSUrl(chunks[idx])));
      } else {
        playUrl(googleTTSUrl(chunks[idx]));
      }
    },
    [settings.volume],
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

      if (isIOS()) {
        // iOS: SpeechSynthesis broken → Cloudflare Function (Edge-TTS via CDN proxy)
        const chunks = chunkText(cleaned);
        playAudioChunks(chunks, 0, rate, 'cf');
      } else {
        // Desktop / Android: try SpeechSynthesis first (offline, instant).
        // If onstart doesn't fire within 1.5s (Xiaomi/Huawei browsers where
        // SpeechSynthesis exists but doesn't actually produce sound), fall back
        // to Cloudflare Function → Edge-TTS via CDN proxy.
        const fallbackTimer = setTimeout(() => {
          if (abortedRef.current) return;
          ssCancel();
          const chunks = chunkText(cleaned);
          playAudioChunks(chunks, 0, rate, 'cf');
        }, 1500);
        speakSS(cleaned, rate, pitch, volume, lang, fallbackTimer);
      }
    },
    [settings.rate, settings.pitch, settings.volume, ssCancel, speakSS, playAudioChunks],
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
      setIsPaused(true);
    } else if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, []);

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

  return { speak, pause, resume, cancel, isSpeaking, isPaused, currentWordIndex, voices };
}
