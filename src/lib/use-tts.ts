/**
 * TTS (Text-to-Speech) hook — Cloudflare Edge-TTS audio engine.
 *
 * All audio goes through the /api/tts Cloudflare Pages Function, which calls
 * Microsoft Edge TTS and returns MP3. Played via HTML5 <audio> — works on
 * EVERY browser: iOS Safari, Xiaomi, Huawei, vivo, desktop Chrome, etc.
 *
 * CDN caching: repeated words are served from Cloudflare edge cache (~10ms).
 * No more browser SpeechSynthesis bugs, permission issues, or missing voices.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTTSSettings } from './tts-settings';
import { cleanText } from './utils';

export interface UseTTSOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: Error) => void;
  /** Not supported with audio engine — kept for API compatibility */
  onBoundary?: (event: any, wordIndex: number) => void;
}

export interface SpeakOptions {
  lang?: string;
  rate?: number;
  pitch?: number;   // ignored (Edge-TTS doesn't support pitch)
  volume?: number;  // 0-1, controls audio element volume
}

export interface TTSHandle {
  speak: (text: string, opts?: SpeakOptions) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  isSpeaking: boolean;
  isPaused: boolean;
  currentWordIndex: number;   // always -1 with audio engine
  voices: SpeechSynthesisVoice[]; // empty with audio engine (kept for API compat)
}

// ── Chunking for long text ──
// Edge-TTS can handle up to ~1000 chars, but we chunk at 500 for faster first byte

const MAX_CHUNK_LEN = 500;

function chunkText(text: string, maxLen = MAX_CHUNK_LEN): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
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

// ── TTS API URL builder ──

function ttsUrl(text: string, rate = 1.0): string {
  const params = new URLSearchParams();
  params.set('text', text);
  params.set('rate', rate.toFixed(2));
  return `/api/tts?${params.toString()}`;
}

// ── Hook ──

export function useTTS(options?: UseTTSOptions): TTSHandle {
  const { settings } = useTTSSettings();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<string[]>([]);
  const chunkIdxRef = useRef(0);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSafetyTimer = useCallback(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSafetyTimer();
      stopAudio();
    };
  }, [clearSafetyTimer, stopAudio]);

  // ── Chunked playback ──

  const playChunk = useCallback((chunks: string[], idx: number, rate: number) => {
    if (idx >= chunks.length) {
      resetState();
      stopAudio();
      optionsRef.current?.onEnd?.();
      return;
    }
    chunkIdxRef.current = idx;

    const audio = new Audio(ttsUrl(chunks[idx], rate));
    audioRef.current = audio;
    audio.preload = 'auto';
    const volume = settings.volume;
    if (volume !== 1.0) audio.volume = volume;

    let started = false;

    const onPlay = () => {
      if (!started && idx === 0) {
        setIsSpeaking(true);
        setIsPaused(false);
        optionsRef.current?.onStart?.();
      }
      started = true;
    };

    const onEnded = () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      if (audioRef.current === audio) audioRef.current = null;
      playChunk(chunks, idx + 1, rate);
    };

    const onError = () => {
      clearSafetyTimer();
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      if (audioRef.current === audio) audioRef.current = null;
      // Skip failed chunk, try next
      playChunk(chunks, idx + 1, rate);
    };

    audio.addEventListener('play', onPlay, { once: true });
    audio.addEventListener('ended', onEnded, { once: true });
    audio.addEventListener('error', onError, { once: true });

    // Safety timer: if audio stalls (network issue), skip to next chunk
    const estimatedMs = Math.max(3000, chunks[idx].length * 60);
    safetyTimerRef.current = setTimeout(() => {
      if (audioRef.current === audio) {
        audio.removeEventListener('play', onPlay);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        audio.pause();
        audio.src = '';
        audioRef.current = null;
        playChunk(chunks, idx + 1, rate);
      }
    }, estimatedMs + 8000);

    audio.play().catch(() => {
      // play() blocked — skip
      clearSafetyTimer();
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      if (audioRef.current === audio) audioRef.current = null;
      playChunk(chunks, idx + 1, rate);
    });
  }, [settings.volume, resetState, stopAudio, clearSafetyTimer]);

  // ── Public API ──

  const speak = useCallback((text: string, opts?: SpeakOptions) => {
    // Cancel any ongoing playback
    stopAudio();
    resetState();

    const cleaned = cleanText(text);
    if (!cleaned) return;

    const rate = opts?.rate ?? settings.rate;
    const chunks = chunkText(cleaned);
    chunksRef.current = chunks;
    chunkIdxRef.current = 0;

    playChunk(chunks, 0, rate);
  }, [settings.rate, stopAudio, resetState, playChunk]);

  const cancel = useCallback(() => {
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

  return {
    speak,
    pause,
    resume,
    cancel,
    isSpeaking,
    isPaused,
    currentWordIndex: -1,
    voices: [],
  };
}
