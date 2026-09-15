/**
 * Persistent TTS settings — voice selection, rate, pitch, volume.
 *
 * Uses safeStorage for cross-platform persistence (miaoda platform + local).
 * Follows the same pattern as use-theme.ts.
 */

import { useState, useEffect, useCallback } from 'react';
import { safeStorage } from './safe-storage';

const TTS_SETTINGS_KEY = '__nativethink_tts_settings';

export interface TTSSettings {
  /** SpeechSynthesisVoice.voiceURI — null means auto-select best voice */
  selectedVoiceURI: string | null;
  /**
   * 系统原生 TTS 引擎的语音索引（Android 用）— null = 系统默认语音。
   * Android WebView 没有 speechSynthesis 语音列表，只能通过原生插件选择。
   */
  nativeVoiceIndex: number | null;
  /** 原生语音的可读名（仅用于设置页回显，不参与合成） */
  nativeVoiceName: string | null;
  /**
   * 优先使用系统语音引擎（离线、几十毫秒）。
   * 开启后不再尝试云端/Edge 通道 —— 只有系统引擎能满足"零延迟"要求，
   * 若系统引擎不可用会明确提示而不是静默改走网络。
   */
  preferNative: boolean;
  /** Playback rate: 0.5 – 1.5 */
  rate: number;
  /** Pitch: 0.5 – 2.0 */
  pitch: number;
  /** Volume: 0.0 – 1.0 */
  volume: number;
}

const DEFAULTS: TTSSettings = {
  selectedVoiceURI: null,
  nativeVoiceIndex: null,
  nativeVoiceName: null,
  preferNative: false,
  rate: 0.9,
  pitch: 1.0,
  volume: 1.0,
};

function loadSettings(): TTSSettings {
  try {
    const raw = safeStorage.getItem(TTS_SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      selectedVoiceURI: parsed.selectedVoiceURI ?? DEFAULTS.selectedVoiceURI,
      nativeVoiceIndex: typeof parsed.nativeVoiceIndex === 'number' ? parsed.nativeVoiceIndex : DEFAULTS.nativeVoiceIndex,
      nativeVoiceName: typeof parsed.nativeVoiceName === 'string' ? parsed.nativeVoiceName : DEFAULTS.nativeVoiceName,
      preferNative: parsed.preferNative === true,
      rate: clamp(parsed.rate ?? DEFAULTS.rate, 0.5, 1.5),
      pitch: clamp(parsed.pitch ?? DEFAULTS.pitch, 0.5, 2.0),
      volume: clamp(parsed.volume ?? DEFAULTS.volume, 0.0, 1.0),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s: TTSSettings): void {
  safeStorage.setItem(TTS_SETTINGS_KEY, JSON.stringify(s));
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Get all available English voices, sorted by quality.
 * Chrome loads voices asynchronously — call this after 'voiceschanged' event.
 */
export function getEnglishVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  const voices = window.speechSynthesis.getVoices();
  return voices
    .filter((v) => v.lang.startsWith('en-'))
    .sort((a, b) => {
      // Preferred: native + localService first
      const scoreA = (a.localService ? 2 : 0) + (a.name.includes('Google') ? 3 : 0) +
        (a.name.includes('Microsoft') ? 2 : 0) + (a.name.includes('Samantha') ? 2 : 0) +
        (a.name.includes('Daniel') ? 2 : 0) + (a.name.includes('Karen') ? 2 : 0) +
        (a.name.includes('Alex') ? 1 : 0) + (a.name.includes('David') ? 1 : 0) +
        (a.name.includes('Zira') ? 1 : 0) + (a.name.includes('Mark') ? 1 : 0);
      const scoreB = (b.localService ? 2 : 0) + (b.name.includes('Google') ? 3 : 0) +
        (b.name.includes('Microsoft') ? 2 : 0) + (b.name.includes('Samantha') ? 2 : 0) +
        (b.name.includes('Daniel') ? 2 : 0) + (b.name.includes('Karen') ? 2 : 0) +
        (b.name.includes('Alex') ? 1 : 0) + (b.name.includes('David') ? 1 : 0) +
        (b.name.includes('Zira') ? 1 : 0) + (b.name.includes('Mark') ? 1 : 0);
      return scoreB - scoreA;
    });
}

/** Pick the best available English voice, respecting user preference. */
export function getBestVoice(preferredURI?: string | null): SpeechSynthesisVoice | null {
  const voices = getEnglishVoices();
  if (voices.length === 0) return null;

  if (preferredURI) {
    const found = voices.find((v) => v.voiceURI === preferredURI);
    if (found) return found;
  }

  // Return highest-scored voice (already sorted by quality)
  return voices[0];
}

export function useTTSSettings() {
  const [settings, setSettings] = useState<TTSSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setLoaded(true);
  }, []);

  const updateSettings = useCallback((partial: Partial<TTSSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      // Clamp numeric values
      if (partial.rate !== undefined) next.rate = clamp(next.rate, 0.5, 1.5);
      if (partial.pitch !== undefined) next.pitch = clamp(next.pitch, 0.5, 2.0);
      if (partial.volume !== undefined) next.volume = clamp(next.volume, 0.0, 1.0);
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, updateSettings, loaded } as const;
}
