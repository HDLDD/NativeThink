/**
 * TTS (Text-to-Speech) hook — dual-engine, zero-server architecture.
 *
 * Primary: Microsoft Edge TTS via WebSocket (wss://) — no CORS, neural voices,
 *   works on ALL browsers including iOS Safari, Xiaomi, Huawei, vivo.
 * Fallback: Google Translate TTS URL (direct <audio> src) — if WebSocket blocked.
 *
 * Both engines return MP3 audio played via HTML5 <audio>.
 * Long texts (>450 chars) are chunked at sentence boundaries and played sequentially.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTTSSettings } from './tts-settings';
import { cleanText } from './utils';

// ── Types ──

export interface UseTTSOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: Error) => void;
  onBoundary?: (event: any, wordIndex: number) => void; // no-op, kept for API compat
}

export interface SpeakOptions {
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
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

const MAX_CHUNK_LEN = 450;

const EDGE_WSS_URL =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4';

const EDGE_VOICE = 'en-US-AriaNeural';

// ── Chunking ──

function chunkText(text: string, maxLen = MAX_CHUNK_LEN): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    let cut = remaining.lastIndexOf('. ', maxLen);
    if (cut === -1 || cut < maxLen / 2) cut = remaining.lastIndexOf('? ', maxLen);
    if (cut === -1 || cut < maxLen / 2) cut = remaining.lastIndexOf('! ', maxLen);
    if (cut === -1 || cut < maxLen / 2) cut = remaining.lastIndexOf(' ', maxLen);
    if (cut === -1 || cut < maxLen / 2) cut = maxLen;
    if (remaining[cut] === '.' || remaining[cut] === '?' || remaining[cut] === '!') cut += 1;
    chunks.push(remaining.slice(0, cut + 1).trim());
    remaining = remaining.slice(cut + 1).trim();
  }
  return chunks.filter(Boolean);
}

// ── Rate mapping ──

function rateToPercent(rate: number): string {
  const pct = Math.round((rate - 1.0) * 100);
  if (pct >= 0) return `+${pct}%`;
  return `${pct}%`;
}

// ── UUID generator (minimal, no crypto dependency) ──

function uid(): string {
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── Edge TTS via WebSocket ──

function edgeTTSWebSocket(text: string, rate = 1.0, voice = EDGE_VOICE): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(EDGE_WSS_URL);
    ws.binaryType = 'arraybuffer';
    const chunks: Uint8Array[] = [];
    let done = false;

    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      try { ws.close(); } catch { /* */ }
      if (err) reject(err);
      else if (chunks.length === 0) reject(new Error('Empty audio'));
      else resolve(new Blob(chunks, { type: 'audio/mpeg' }));
    };

    ws.onopen = () => {
      // Send config message
      const config = `X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":false,"wordBoundaryEnabled":false},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(config);

      // Send SSML
      const escaped = text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
      const ssml = `X-RequestId:${uid()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toISOString()}Z\r\nPath:ssml\r\n\r\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'><voice name='${voice}'><prosody rate='${rateToPercent(rate)}' pitch='+0Hz'>${escaped}</prosody></voice></speak>`;
      ws.send(ssml);
    };

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        const buf = new Uint8Array(e.data);
        if (buf.length >= 2) {
          // Parse Edge TTS binary header
          const headerLen = ((buf[0] << 8) | buf[1]);
          const body = buf.subarray(headerLen);
          if (body.length > 0) chunks.push(body);
        }
      } else if (typeof e.data === 'string') {
        // Text message — could be turn.end or error
        if (e.data.includes('Path:turn.end')) {
          finish();
        }
      }
    };

    ws.onerror = () => finish(new Error('WebSocket error'));
    ws.onclose = () => {
      if (!done && chunks.length > 0) {
        // Connection closed with audio data — success
        finish();
      } else if (!done) {
        finish(new Error('WebSocket closed without audio'));
      }
    };

    // Timeout after 15 seconds
    setTimeout(() => finish(new Error('TTS timeout')), 15000);
  });
}

// ── Google Translate TTS (fallback) ──

function googleTTSUrl(text: string, lang = 'en'): string {
  return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(text)}`;
}

// ── Hook ──

export function useTTS(options?: UseTTSOptions): TTSHandle {
  const { settings } = useTTSSettings();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortedRef = useRef(false);
  const chunksRef = useRef<string[]>([]);
  const chunkIdxRef = useRef(0);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track if Edge TTS WebSocket works — if it fails once, switch to Google fallback
  const edgeWorksRef = useRef(true);

  const clearSafetyTimer = useCallback(() => {
    if (safetyTimerRef.current) { clearTimeout(safetyTimerRef.current); safetyTimerRef.current = null; }
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
  }, []);

  const resetState = useCallback(() => {
    setIsSpeaking(false);
    setIsPaused(false);
    clearSafetyTimer();
    chunksRef.current = [];
    chunkIdxRef.current = 0;
  }, [clearSafetyTimer]);

  useEffect(() => () => { clearSafetyTimer(); stopAudio(); }, [clearSafetyTimer, stopAudio]);

  // ── Play a single audio blob/URL ──

  const playAudioSource = useCallback((src: string, onDone: () => void, vol: number) => {
    if (abortedRef.current) { onDone(); return; }

    const audio = new Audio(src);
    audioRef.current = audio;
    audio.preload = 'auto';
    if (vol !== 1.0) audio.volume = vol;

    audio.onplay = () => {
      if (!abortedRef.current) {
        setIsSpeaking(true);
        setIsPaused(false);
        optionsRef.current?.onStart?.();
      }
    };

    audio.onended = () => {
      if (audioRef.current === audio) audioRef.current = null;
      onDone();
    };

    audio.onerror = () => {
      if (audioRef.current === audio) audioRef.current = null;
      onDone(); // Skip failed chunk
    };

    // Safety timer: skip if audio stalls
    safetyTimerRef.current = setTimeout(() => {
      if (audioRef.current === audio) {
        audio.pause();
        audio.src = '';
        audioRef.current = null;
        onDone();
      }
    }, 30000);

    audio.play().catch(() => onDone());
  }, []);

  // ── Play all chunks sequentially ──

  const playChunks = useCallback((chunks: string[], idx: number, rate: number) => {
    if (abortedRef.current || idx >= chunks.length) {
      resetState();
      stopAudio();
      if (idx >= chunks.length) optionsRef.current?.onEnd?.();
      return;
    }
    chunkIdxRef.current = idx;

    const playBlob = (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      playAudioSource(url, () => {
        URL.revokeObjectURL(url);
        playChunks(chunks, idx + 1, rate);
      }, settings.volume);
    };

    const playGoogleFallback = () => {
      const url = googleTTSUrl(chunks[idx]);
      playAudioSource(url, () => {
        playChunks(chunks, idx + 1, rate);
      }, settings.volume);
    };

    if (edgeWorksRef.current) {
      edgeTTSWebSocket(chunks[idx], rate, EDGE_VOICE)
        .then(playBlob)
        .catch(() => {
          // Edge TTS failed — switch to Google fallback permanently
          edgeWorksRef.current = false;
          playGoogleFallback();
        });
    } else {
      playGoogleFallback();
    }
  }, [settings.volume, resetState, stopAudio, playAudioSource]);

  // ── Public API ──

  const speak = useCallback((text: string, opts?: SpeakOptions) => {
    // Cancel ongoing playback
    abortedRef.current = true;
    stopAudio();
    resetState();
    abortedRef.current = false;

    const cleaned = cleanText(text);
    if (!cleaned) return;

    const rate = opts?.rate ?? settings.rate;
    const chunks = chunkText(cleaned);

    playChunks(chunks, 0, rate);
  }, [settings.rate, stopAudio, resetState, playChunks]);

  const cancel = useCallback(() => {
    abortedRef.current = true;
    stopAudio();
    resetState();
  }, [stopAudio, resetState]);

  const pause = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setIsPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if (audioRef.current && audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
      setIsPaused(false);
    }
  }, []);

  return { speak, pause, resume, cancel, isSpeaking, isPaused, currentWordIndex: -1, voices: [] };
}
