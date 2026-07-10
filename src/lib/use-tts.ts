/**
 * Shared TTS (Text-to-Speech) hook — single source of truth for all speech synthesis.
 *
 * Features:
 * - Auto-selects best English voice (respects user preference from settings)
 * - Applies cleanText() automatically
 * - Pause / resume / cancel control
 * - Chrome 15-second speech cutoff workaround
 * - Ref-based callbacks to avoid stale closures
 * - Rate/pitch/volume from persistent settings, overridable per speak() call
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

  // Keep options ref in sync
  useEffect(() => {
    optionsRef.current = options;
  });

  // Load voices (Chrome loads them asynchronously)
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    const loadVoices = () => {
      const all = window.speechSynthesis.getVoices();
      setVoices(all.filter((v) => v.lang.startsWith('en-')));
    };

    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopKeepAlive();
      window.speechSynthesis?.cancel();
    };
  }, [stopKeepAlive]);

  const cancel = useCallback(() => {
    stopKeepAlive();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentWordIndex(-1);
  }, [stopKeepAlive]);

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
      if (!('speechSynthesis' in window)) return;

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      stopKeepAlive();

      const cleaned = cleanText(text);
      if (!cleaned) return;

      currentTextRef.current = cleaned;

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.lang = opts?.lang ?? 'en-US';
      utterance.rate = opts?.rate ?? settings.rate;
      utterance.pitch = opts?.pitch ?? settings.pitch;
      utterance.volume = opts?.volume ?? settings.volume;

      // Voice selection
      const voice = getBestVoice(settings.selectedVoiceURI);
      if (voice) utterance.voice = voice;

      // Event handlers
      utterance.onstart = () => {
        setIsSpeaking(true);
        setIsPaused(false);
        setCurrentWordIndex(0);
        startKeepAlive();
        optionsRef.current?.onStart?.();
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        setCurrentWordIndex(-1);
        stopKeepAlive();
        currentTextRef.current = '';
        optionsRef.current?.onEnd?.();
      };

      utterance.onerror = (event) => {
        // 'canceled' is expected after our own cancel() calls — don't treat as error
        if (event.error === 'canceled' || event.error === 'interrupted') {
          setIsSpeaking(false);
          setIsPaused(false);
          setCurrentWordIndex(-1);
          stopKeepAlive();
          return;
        }
        setIsSpeaking(false);
        setIsPaused(false);
        setCurrentWordIndex(-1);
        stopKeepAlive();
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
          // Count words before charIndex to determine word index
          const textBefore = currentTextRef.current.slice(0, event.charIndex);
          const wordIdx = textBefore.trim() === '' ? 0 : textBefore.trim().split(/\s+/).length;
          setCurrentWordIndex(wordIdx);
          if (optionsRef.current?.onBoundary) {
            optionsRef.current.onBoundary(event, wordIdx);
          }
        }
      };

      window.speechSynthesis.speak(utterance);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.rate, settings.pitch, settings.volume, settings.selectedVoiceURI, startKeepAlive, stopKeepAlive],
  );

  return { speak, pause, resume, cancel, isSpeaking, isPaused, currentWordIndex, voices };
}
