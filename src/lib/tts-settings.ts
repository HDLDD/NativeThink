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
  /** Playback rate: 0.5 – 1.5 */
  rate: number;
  /** Pitch: 0.5 – 2.0 */
  pitch: number;
  /** Volume: 0.0 – 1.0 */
  volume: number;
}

const DEFAULTS: TTSSettings = {
  selectedVoiceURI: null,
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
