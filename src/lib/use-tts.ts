/**
 * Shared TTS (Text-to-Speech) hook — single source of truth for all speech synthesis.
 *
 * Strategy:
 * - Desktop / Android: uses Web Speech API (SpeechSynthesis) — works well on Chrome/Edge.
 * - iOS Safari: SpeechSynthesis is fundamentally broken (WKWebView bug, silent failure),
 *   so we fall back to HTML5 <audio> with Google Translate TTS.
 * - The hook auto-detects the platform and picks the right engine.
 *
 * Audio fallback: Google Translate TTS endpoint. Splits long text (>180 chars) at
 * sentence boundaries and plays chunks sequentially.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTTSSettings, getBestVoice } from './tts-settings';
import { cleanText } from './utils';

export interface UseTTSOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (event: SpeechSynthesisErrorEvent | Error) => void;
  onBoundary?: (event: SpeechSynthesisEvent, wordIndex: number) => void;
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

// ── Platform detection ──

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// ── Audio-engine helpers (Google Translate TTS fallback) ──

const MAX_CHUNK_LEN = 180; // Google TTS URL length limit (~200 chars)

/** Split text into chunks at sentence boundaries, each ≤ maxLen chars. */
function chunkText(text: string, maxLen = MAX_CHUNK_LEN): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // Try to cut at a sentence boundary: . ! ? followed by space or end
    let cut = remaining.lastIndexOf('. ', maxLen);
    if (cut === -1 || cut < maxLen / 2) cut = remaining.lastIndexOf('? ', maxLen);
    if (cut === -1 || cut < maxLen / 2) cut = remaining.lastIndexOf('! ', maxLen);
    if (cut === -1 || cut < maxLen / 2) cut = remaining.lastIndexOf(' ', maxLen);
    if (cut === -1 || cut < maxLen / 2) cut = maxLen;
    // Include the punctuation
    if (remaining[cut] === '.' || remaining[cut] === '?' || remaining[cut] === '!') cut += 1;
    chunks.push(remaining.slice(0, cut + 1).trim());
    remaining = remaining.slice(cut + 1).trim();
  }
  return chunks.filter(Boolean);
}

function audioUrl(text: string, lang = 'en'): string {
  return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(text)}`;
}

// ── Rough duration estimate ──

function estimateDurationMs(text: string, rate: number): number {
  const words = text.split(/\s+/).length;
  const wpm = 150 * rate;
  return Math.max(1500, (words / wpm) * 60_000 + 800);
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

  // ── Engine selection ──
  // iOS Safari's SpeechSynthesis is fundamentally broken (WKWebView bug — speak()
  // silently does nothing, no audio, no error). Use HTML5 audio fallback for iOS only.
  // Android Chrome / desktop: SpeechSynthesis works well with proper priming.
  //
  // forceAudioRef: set to true when SpeechSynthesis is detected as broken at runtime
  // (e.g. Xiaomi browser where API exists but produces no sound).
  const ttsSupported = 'speechSynthesis' in window;
  const forceAudioRef = useRef(false);
  const useAudioEngine = isIOS() || !ttsSupported || forceAudioRef.current;

  // ── Refs shared by both engines ──
  const currentTextRef = useRef('');
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunkIdxRef = useRef(0);
  const chunksRef = useRef<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── SpeechSynthesis refs (unused on mobile) ──
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const primedRef = useRef(false);
  const speakingUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const ssGenerationRef = useRef(0); // increments each speak() call — stale onerror handlers bail out

  // ── Common helpers ──

  const clearSafetyTimer = useCallback(() => {
    if (safetyTimerRef.current) { clearTimeout(safetyTimerRef.current); safetyTimerRef.current = null; }
  }, []);

  const resetState = useCallback(() => {
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentWordIndex(-1);
    clearSafetyTimer();
    currentTextRef.current = '';
    chunksRef.current = [];
    chunkIdxRef.current = 0;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
  }, [clearSafetyTimer]);

  // ── Audio engine (mobile) ──

  const playChunk = useCallback((chunks: string[], idx: number, lang: string) => {
    if (idx >= chunks.length) {
      // All done
      resetState();
      optionsRef.current?.onEnd?.();
      return;
    }
    chunkIdxRef.current = idx;
    const audio = new Audio(audioUrl(chunks[idx], lang));
    audioRef.current = audio;
    audio.preload = 'auto';

    const onPlay = () => {
      if (idx === 0) {
        setIsSpeaking(true);
        setIsPaused(false);
        optionsRef.current?.onStart?.();
      }
    };

    const onEnded = () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audioRef.current = null;
      // Play next chunk
      playChunk(chunks, idx + 1, lang);
    };

    const onError = () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audioRef.current = null;
      // Skip failed chunk, try next
      playChunk(chunks, idx + 1, lang);
    };

    audio.addEventListener('play', onPlay, { once: true });
    audio.addEventListener('ended', onEnded, { once: true });
    audio.addEventListener('error', onError, { once: true });

    // Safety timer for stalled audio
    const estimatedMs = estimateDurationMs(chunks[idx], 1.0);
    safetyTimerRef.current = setTimeout(() => {
      if (audioRef.current === audio) {
        audio.removeEventListener('play', onPlay);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        audio.pause();
        audio.src = '';
        audioRef.current = null;
        playChunk(chunks, idx + 1, lang);
      }
    }, estimatedMs + 5000);

    audio.play().catch(() => {
      // play() failed — likely blocked by browser; skip this chunk
      clearSafetyTimer();
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audioRef.current = null;
      playChunk(chunks, idx + 1, lang);
    });
  }, [resetState, clearSafetyTimer]);

  const speakAudio = useCallback((text: string, opts?: SpeakOptions) => {
    // Cancel previous audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    resetState();

    const cleaned = cleanText(text);
    if (!cleaned) return;

    const lang = opts?.lang ?? 'en-US';
    const langCode = lang.split('-')[0]; // 'en-US' → 'en'

    currentTextRef.current = cleaned;
    const chunks = chunkText(cleaned);
    chunksRef.current = chunks;
    chunkIdxRef.current = 0;

    playChunk(chunks, 0, langCode);
  }, [resetState, playChunk]);

  const cancelAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    resetState();
  }, [resetState]);

  // ── SpeechSynthesis engine (desktop / Android) ──

  // Voice loading
  useEffect(() => {
    if (useAudioEngine || !ttsSupported) return;
    const loadVoices = () => {
      const enVoices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en-'));
      if (enVoices.length > 0) setVoices(enVoices);
    };
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => { window.speechSynthesis.removeEventListener('voiceschanged', loadVoices); };
  }, [ttsSupported, useAudioEngine]);

  // Prime
  const primeForMobile = useCallback(() => {
    if (primedRef.current || !ttsSupported) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance('a');
      u.volume = 0.01;
      u.rate = 2;
      window.speechSynthesis.speak(u);
      primedRef.current = true;
    } catch { /* ignore */ }
  }, [ttsSupported]);

  useEffect(() => {
    if (useAudioEngine || !ttsSupported || primedRef.current) return;
    const prime = () => {
      primeForMobile();
      document.removeEventListener('touchstart', prime);
      document.removeEventListener('click', prime);
    };
    document.addEventListener('touchstart', prime, { once: true });
    document.addEventListener('click', prime, { once: true });
    return () => {
      document.removeEventListener('touchstart', prime);
      document.removeEventListener('click', prime);
    };
  }, [ttsSupported, useAudioEngine, primeForMobile]);

  // Keep-alive
  const stopKeepAlive = useCallback(() => {
    if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
  }, []);
  const startKeepAlive = useCallback(() => {
    stopKeepAlive();
    keepAliveRef.current = setInterval(() => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000);
  }, [stopKeepAlive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopKeepAlive();
      clearSafetyTimer();
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
      if (!useAudioEngine) window.speechSynthesis?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ssCancel = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentWordIndex(-1);
    stopKeepAlive();
    clearSafetyTimer();
    currentTextRef.current = '';
    speakingUtteranceRef.current = null;
  }, [stopKeepAlive, clearSafetyTimer]);

  const ssPause = useCallback(() => {
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, []);

  const ssResume = useCallback(() => {
    if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, []);

  const speakSS = useCallback((text: string, opts?: SpeakOptions) => {
    if (!ttsSupported) return;

    // Bump generation so stale onerror/onend from previous utterances bail out
    ssGenerationRef.current++;
    const gen = ssGenerationRef.current;

    // Only cancel if actually speaking — calling cancel() when idle can put
    // Chrome's speech synthesis into a bad state that drops subsequent speak().
    const isActive = window.speechSynthesis.speaking || window.speechSynthesis.pending;
    if (isActive) {
      window.speechSynthesis.cancel();
    }

    // Reset local state (inline, not via ssCancel which calls cancel again)
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentWordIndex(-1);
    stopKeepAlive();
    clearSafetyTimer();
    currentTextRef.current = '';
    speakingUtteranceRef.current = null;

    const cleaned = cleanText(text);
    if (!cleaned) return;
    currentTextRef.current = cleaned;

    const rate = opts?.rate ?? settings.rate;
    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.lang = opts?.lang ?? 'en-US';
    utterance.rate = rate;
    utterance.pitch = opts?.pitch ?? settings.pitch;
    utterance.volume = opts?.volume ?? settings.volume;

    const voice = getBestVoice(settings.selectedVoiceURI);
    if (voice) utterance.voice = voice;
    speakingUtteranceRef.current = utterance;

    const estimatedMs = estimateDurationMs(cleaned, rate);

    // ── Start-timeout fallback ──
    // Some browsers (Xiaomi, OEMs) expose SpeechSynthesis but it silently fails:
    // onstart never fires, no audio, no error. Detect & permanently switch to
    // audio engine for this session.
    const startTimeout = setTimeout(() => {
      if (speakingUtteranceRef.current === utterance && !isSpeaking) {
        forceAudioRef.current = true;
        window.speechSynthesis.cancel();
        // Retry this utterance with audio engine
        speakAudio(text, opts);
      }
    }, 1000);

    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

    utterance.onstart = () => {
      clearTimeout(startTimeout);
      if (ssGenerationRef.current !== gen) return;
      setIsSpeaking(true);
      setIsPaused(false);
      setCurrentWordIndex(0);
      startKeepAlive();
      optionsRef.current?.onStart?.();
      // Arm safety timer once speech has started
      safetyTimer = setTimeout(() => {
        if (speakingUtteranceRef.current === utterance && ssGenerationRef.current === gen) {
          setIsSpeaking(false);
          setIsPaused(false);
          setCurrentWordIndex(-1);
          stopKeepAlive();
          currentTextRef.current = '';
          speakingUtteranceRef.current = null;
        }
      }, estimatedMs + 3000);
    };

    utterance.onend = () => {
      clearTimeout(startTimeout);
      if (safetyTimer) clearTimeout(safetyTimer);
      if (ssGenerationRef.current !== gen) return;
      setIsSpeaking(false);
      setIsPaused(false);
      setCurrentWordIndex(-1);
      stopKeepAlive();
      currentTextRef.current = '';
      speakingUtteranceRef.current = null;
      optionsRef.current?.onEnd?.();
    };

    utterance.onerror = (event) => {
      clearTimeout(startTimeout);
      if (safetyTimer) clearTimeout(safetyTimer);
      if (ssGenerationRef.current !== gen) return;
      if (event.error === 'canceled' || event.error === 'interrupted') {
        setIsSpeaking(false);
        setIsPaused(false);
        setCurrentWordIndex(-1);
        stopKeepAlive();
        currentTextRef.current = '';
        speakingUtteranceRef.current = null;
        return;
      }
      if (event.error === 'not-allowed') {
        primeForMobile();
        setIsSpeaking(false);
        setIsPaused(false);
        setCurrentWordIndex(-1);
        stopKeepAlive();
        currentTextRef.current = '';
        speakingUtteranceRef.current = null;
        setTimeout(() => {
          try {
            window.speechSynthesis.cancel();
            const retry = new SpeechSynthesisUtterance(cleaned);
            retry.lang = opts?.lang ?? 'en-US';
            retry.rate = rate;
            retry.pitch = opts?.pitch ?? settings.pitch;
            retry.volume = opts?.volume ?? settings.volume;
            const v = getBestVoice(settings.selectedVoiceURI);
            if (v) retry.voice = v;
            retry.onstart = () => {
              setIsSpeaking(true);
              setIsPaused(false);
              setCurrentWordIndex(0);
              startKeepAlive();
            };
            retry.onend = () => {
              setIsSpeaking(false);
              setIsPaused(false);
              setCurrentWordIndex(-1);
              stopKeepAlive();
            };
            retry.onerror = () => {
              setIsSpeaking(false);
              setIsPaused(false);
              setCurrentWordIndex(-1);
              stopKeepAlive();
            };
            speakingUtteranceRef.current = retry;
            window.speechSynthesis.speak(retry);
          } catch { /* ignore */ }
        }, 150);
        return;
      }
      setIsSpeaking(false);
      setIsPaused(false);
      setCurrentWordIndex(-1);
      stopKeepAlive();
      currentTextRef.current = '';
      speakingUtteranceRef.current = null;
      optionsRef.current?.onError?.(event);
    };

    utterance.onpause = () => setIsPaused(true);
    utterance.onresume = () => setIsPaused(false);

    utterance.onboundary = (event) => {
      if (event.charIndex !== undefined && currentTextRef.current) {
        const textBefore = currentTextRef.current.slice(0, event.charIndex);
        const wordIdx = textBefore.trim() === '' ? 0 : textBefore.trim().split(/\s+/).length;
        setCurrentWordIndex(wordIdx);
        optionsRef.current?.onBoundary?.(event, wordIdx);
      }
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      clearTimeout(startTimeout);
      setIsSpeaking(false);
      setIsPaused(false);
      setCurrentWordIndex(-1);
      stopKeepAlive();
      currentTextRef.current = '';
      speakingUtteranceRef.current = null;
      optionsRef.current?.onError?.(new Event('speak-failed') as any);
    }
  }, [ttsSupported, settings.rate, settings.pitch, settings.volume, settings.selectedVoiceURI, startKeepAlive, stopKeepAlive, primeForMobile, speakAudio, clearSafetyTimer]);

  // ── Public API — delegates to active engine ──

  const speak = useCallback((text: string, opts?: SpeakOptions) => {
    if (useAudioEngine || forceAudioRef.current) {
      speakAudio(text, opts);
    } else {
      speakSS(text, opts);
    }
  }, [useAudioEngine, speakAudio, speakSS]);

  const cancel = useCallback(() => {
    if (useAudioEngine) cancelAudio();
    else ssCancel();
  }, [useAudioEngine, cancelAudio, ssCancel]);

  const pause = useCallback(() => {
    if (useAudioEngine) {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPaused(true);
      }
    } else {
      ssPause();
    }
  }, [useAudioEngine, ssPause]);

  const resume = useCallback(() => {
    if (useAudioEngine) {
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.play().catch(() => {});
        setIsPaused(false);
      }
    } else {
      ssResume();
    }
  }, [useAudioEngine, ssResume]);

  return { speak, pause, resume, cancel, isSpeaking, isPaused, currentWordIndex, voices };
}
