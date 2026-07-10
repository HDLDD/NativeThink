/**
 * Shared TTS (Text-to-Speech) hook — single source of truth for all speech synthesis.
 *
 * Mobile-first design:
 * - Primes speech synthesis with an *audible* short utterance on first user gesture.
 *   (Silent utterances don't count for permission unlock on some mobile browsers.)
 * - Falls back to browser-default voice when no English voice has loaded yet.
 * - iOS Safari workaround: `onend` often never fires, so we run a safety timeout
 *   that auto-clears state after estimated speech duration.
 * - Pause / resume / cancel control.
 * - Chrome 15-second speech cutoff workaround via keep-alive pausing.
 * - Ref-based callbacks to avoid stale closures.
 * - Rate/pitch/volume from persistent settings, overridable per speak() call.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTTSSettings, getBestVoice } from './tts-settings';
import { cleanText } from './utils';

export interface UseTTSOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (event: SpeechSynthesisErrorEvent) => void;
  onBoundary?: (event: SpeechSynthesisEvent, wordIndex: number) => void;
}

export interface SpeakOptions {
  /** Language tag: 'en-US', 'en-GB', etc. Default: 'en-US' */
  lang?: string;
  /** Override the global rate setting */
  rate?: number;
  /** Override the global pitch setting */
  pitch?: number;
  /** Override the global volume setting */
  volume?: number;
}

export interface TTSHandle {
  speak: (text: string, opts?: SpeakOptions) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  isSpeaking: boolean;
  isPaused: boolean;
  /** Current word index during speech (from onboundary events). -1 when not speaking. */
  currentWordIndex: number;
  /** Available English voices (may be empty before voices load) */
  voices: SpeechSynthesisVoice[];
}

/** Rough estimate: average English speech is ~150 words per minute at rate 1.0 */
function estimateDurationMs(text: string, rate: number): number {
  const words = text.split(/\s+/).length;
  const wpm = 150 * rate;
  return Math.max(1500, (words / wpm) * 60_000 + 800);
}

/** Detect iOS (including iPadOS 13+) */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function useTTS(options?: UseTTSOptions): TTSHandle {
  const { settings, loaded } = useTTSSettings();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Refs for values accessed inside event handlers (avoid stale closures)
  const optionsRef = useRef<UseTTSOptions | undefined>(options);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentTextRef = useRef<string>('');
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primedRef = useRef(false);
  const speakingUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Keep options ref in sync
  useEffect(() => {
    optionsRef.current = options;
  });

  // TTS support detection
  const ttsSupported = 'speechSynthesis' in window;

  // Load voices (Chrome loads them asynchronously; mobile especially needs post-load retry)
  useEffect(() => {
    if (!ttsSupported) return;

    const loadVoices = () => {
      const all = window.speechSynthesis.getVoices();
      const enVoices = all.filter((v) => v.lang.startsWith('en-'));
      if (enVoices.length > 0) {
        setVoices(enVoices);
      }
    };

    // Mobile browsers may need multiple attempts — voices load lazily
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    // Some mobile browsers fire 'voiceschanged' late or not at all — retry on first user interaction
    const retryOnInteraction = () => {
      loadVoices();
      document.removeEventListener('touchstart', retryOnInteraction);
      document.removeEventListener('click', retryOnInteraction);
    };
    document.addEventListener('touchstart', retryOnInteraction, { once: true });
    document.addEventListener('click', retryOnInteraction, { once: true });

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      document.removeEventListener('touchstart', retryOnInteraction);
      document.removeEventListener('click', retryOnInteraction);
    };
  }, [ttsSupported]);

  // Prime speech synthesis on first user gesture.
  // KEY: use a short *audible* word — silent utterances (volume=0) don't count as
  // "speech" for permission purposes on some mobile browsers (especially iOS 16+).
  const primeForMobile = useCallback(() => {
    if (primedRef.current || !ttsSupported) return;
    try {
      // Cancel any pending speech first (iOS requires clean state)
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance('a');
      u.volume = 0.01; // nearly silent but technically audible — unlocks permission
      u.rate = 2;      // speak it as fast as possible
      window.speechSynthesis.speak(u);
      primedRef.current = true;
    } catch { /* ignore */ }
  }, [ttsSupported]);

  // Attach prime to first user interaction
  useEffect(() => {
    if (!ttsSupported || primedRef.current) return;
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
  }, [ttsSupported, primeForMobile]);

  // Chrome keep-alive: prevent speech from stopping after ~15 seconds
  const startKeepAlive = useCallback(() => {
    stopKeepAlive();
    keepAliveRef.current = setInterval(() => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000);
  }, []);

  const stopKeepAlive = useCallback(() => {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }, []);

  const clearSafetyTimer = useCallback(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopKeepAlive();
      clearSafetyTimer();
      window.speechSynthesis?.cancel();
    };
  }, [stopKeepAlive, clearSafetyTimer]);

  const resetState = useCallback(() => {
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentWordIndex(-1);
    stopKeepAlive();
    clearSafetyTimer();
    currentTextRef.current = '';
    speakingUtteranceRef.current = null;
  }, [stopKeepAlive, clearSafetyTimer]);

  const cancel = useCallback(() => {
    resetState();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [resetState]);

  const pause = useCallback(() => {
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, []);

  const speak = useCallback(
    (text: string, opts?: SpeakOptions) => {
      if (!ttsSupported) return;

      // Ensure voices are loaded (mobile may have loaded them lazily)
      const allVoices = window.speechSynthesis.getVoices();
      const enVoices = allVoices.filter((v) => v.lang.startsWith('en-'));
      if (enVoices.length > 0) setVoices(enVoices);

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      resetState();

      const cleaned = cleanText(text);
      if (!cleaned) return;

      currentTextRef.current = cleaned;

      const rate = opts?.rate ?? settings.rate;
      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.lang = opts?.lang ?? 'en-US';
      utterance.rate = rate;
      utterance.pitch = opts?.pitch ?? settings.pitch;
      utterance.volume = opts?.volume ?? settings.volume;

      // Voice selection — if no English voice found, leave unset so the browser
      // picks its default. On mobile, the default OS voice is better than silence.
      const voice = getBestVoice(settings.selectedVoiceURI);
      if (voice) utterance.voice = voice;

      speakingUtteranceRef.current = utterance;

      // ── iOS safety timer ──
      // iOS Safari notoriously fails to fire `onend`. Set a timer that
      // auto-clears speaking state after estimated duration + generous buffer.
      const estimatedMs = estimateDurationMs(cleaned, rate);
      safetyTimerRef.current = setTimeout(() => {
        if (speakingUtteranceRef.current === utterance) {
          // Speech *should* be done by now — clean up if iOS didn't fire onend
          resetState();
        }
      }, estimatedMs + 3000);

      // Event handlers
      utterance.onstart = () => {
        setIsSpeaking(true);
        setIsPaused(false);
        setCurrentWordIndex(0);
        startKeepAlive();
        optionsRef.current?.onStart?.();
      };

      utterance.onend = () => {
        clearSafetyTimer();
        setIsSpeaking(false);
        setIsPaused(false);
        setCurrentWordIndex(-1);
        stopKeepAlive();
        currentTextRef.current = '';
        speakingUtteranceRef.current = null;
        optionsRef.current?.onEnd?.();
      };

      utterance.onerror = (event) => {
        clearSafetyTimer();
        // 'canceled' / 'interrupted' → expected after our own cancel() calls
        if (event.error === 'canceled' || event.error === 'interrupted') {
          resetState();
          return;
        }
        // 'not-allowed' on mobile → user hasn't interacted yet; prime and retry once
        if (event.error === 'not-allowed') {
          primeForMobile();
          resetState();
          // Retry after a short delay to let the priming take effect
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
              retry.onstart = utterance.onstart;
              retry.onend = utterance.onend;
              retry.onerror = () => resetState();
              retry.onboundary = utterance.onboundary;
              retry.onpause = utterance.onpause;
              retry.onresume = utterance.onresume;
              speakingUtteranceRef.current = retry;
              // Re-arm safety timer for retry
              safetyTimerRef.current = setTimeout(() => {
                if (speakingUtteranceRef.current === retry) resetState();
              }, estimatedMs + 3000);
              window.speechSynthesis.speak(retry);
            } catch {
              resetState();
            }
          }, 150);
          return;
        }
        // Other errors: just reset
        resetState();
        optionsRef.current?.onError?.(event);
      };

      utterance.onpause = () => {
        setIsPaused(true);
      };

      utterance.onresume = () => {
        setIsPaused(false);
      };

      utterance.onboundary = (event) => {
        if (event.charIndex !== undefined && currentTextRef.current) {
          const textBefore = currentTextRef.current.slice(0, event.charIndex);
          const wordIdx = textBefore.trim() === '' ? 0 : textBefore.trim().split(/\s+/).length;
          setCurrentWordIndex(wordIdx);
          if (optionsRef.current?.onBoundary) {
            optionsRef.current.onBoundary(event, wordIdx);
          }
        }
      };

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        // Fallback: some mobile browsers throw synchronously on speak()
        resetState();
        optionsRef.current?.onError?.(new Event('speak-failed') as any);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ttsSupported, settings.rate, settings.pitch, settings.volume, settings.selectedVoiceURI, startKeepAlive, stopKeepAlive, primeForMobile, resetState, clearSafetyTimer],
  );

  return { speak, pause, resume, cancel, isSpeaking, isPaused, currentWordIndex, voices };
}
