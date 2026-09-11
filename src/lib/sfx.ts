/**
 * SFX — 学习提示音（Web Audio 合成，零音频资源）。
 *
 * 用途：答对/答错、拼写完成、整轮完成等即时反馈。借鉴 Duolingo：
 * 轻快上扬 = 正确，低沉短促 = 错误，三连音 = 完成。
 * 默认开启，可在 TTS 设置里关闭（__nativethink_sfx_enabled）。
 */

import { safeStorage } from './safe-storage';

const ENABLE_KEY = '__nativethink_sfx_enabled';

export function isSfxEnabled(): boolean {
  try { return safeStorage.getItem(ENABLE_KEY) !== '0'; } catch { return true; }
}

export function setSfxEnabled(on: boolean): void {
  try { safeStorage.setItem(ENABLE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => { /* ignore */ });
    return ctx;
  } catch { return null; }
}

interface ToneSpec {
  freq: number;
  /** 相对开始的秒数 */
  start: number;
  /** 持续秒数 */
  dur: number;
  type?: OscillatorType;
  gain?: number;
}

function playTones(tones: ToneSpec[]) {
  if (!isSfxEnabled()) return;
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  for (const t of tones) {
    try {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = t.type || 'sine';
      osc.frequency.value = t.freq;
      const t0 = now + t.start;
      const vol = t.gain ?? 0.1;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + t.dur);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + t.dur + 0.05);
    } catch { /* ignore single-tone failure */ }
  }
}

/** 答对：C5 → G5 上行双音 */
export const sfxCorrect = () => playTones([
  { freq: 523.25, start: 0, dur: 0.12 },
  { freq: 783.99, start: 0.09, dur: 0.2 },
]);

/** 答错：低频短促两声（克制，不刺耳） */
export const sfxWrong = () => playTones([
  { freq: 233.08, start: 0, dur: 0.13, type: 'triangle', gain: 0.07 },
  { freq: 185, start: 0.11, dur: 0.18, type: 'triangle', gain: 0.07 },
]);

/** 单格填写/配对成功：轻微 tick */
export const sfxTick = () => playTones([
  { freq: 1046.5, start: 0, dur: 0.05, gain: 0.05 },
]);

/** 拼写/会话完成：C5-E5-G5 三连上行 */
export const sfxComplete = () => playTones([
  { freq: 523.25, start: 0, dur: 0.12 },
  { freq: 659.25, start: 0.1, dur: 0.12 },
  { freq: 783.99, start: 0.2, dur: 0.28 },
]);
