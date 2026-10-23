/**
 * 离线跟读分析：语速 / 音量与爆音 / 停顿与意群边界 / 音高趋势。
 *
 * 这条链路**不评音素发音**（那需要专门的口语评测服务，见 shadowing.md §4.4）；
 * 它只做能从波形客观量出来的事，且全部在本地完成 —— ASR 不可用时仍然能给反馈。
 *
 * 纯计算（analyzePcm/summarize*）与浏览器解码（analyzeBlob）分开，守卫可真跑前者。
 */

import { resampleMono16k } from './wav';
import { speechPace, type IPace } from './asr';

export interface IPause {
  /** 停顿中点占整段录音的比例 0–1 */
  at: number;
  ms: number;
}

export interface IVolumeSummary {
  rmsDbfs: number;
  peakDbfs: number;
  clippingRatio: number;
  tooQuiet: boolean;
  clipped: boolean;
}

export interface IPitchSummary {
  medianHz: number;
  /** p10 / p90，抗单帧倍频误判 */
  p10Hz: number;
  p90Hz: number;
  trend: 'rising' | 'falling' | 'stable';
  /** 尾段是否比中段更高（疑问句参考） */
  endsRising: boolean;
  voicedFrames: number;
}

export interface ISpeechAnalysis {
  durationMs: number;
  volume: IVolumeSummary;
  pauses: IPause[];
  expectedBoundaries: number[];
  hit: number;
  total: number;
  pitch: IPitchSummary | null;
  pace: IPace | null;
}

export interface IAnalyzeOptions {
  /** 目标句；有它才计算语速与标点意群边界 */
  targetText?: string;
  /** 外部给定的意群边界比例（SpeakBack 用 standardBreaks 时传） */
  expectedBoundaries?: number[];
  msPerWord?: number;
}

const FRAME_MS = 20;
const MIN_PAUSE_MS = 180;
const PITCH_RATE = 16000;
const PITCH_FRAME_MS = 40;
const PITCH_HOP_MS = 30;
const MIN_PITCH_HZ = 70;
const MAX_PITCH_HZ = 400;
const BOUNDARY_TOL = 0.12;

function mixMono(channels: Float32Array[]): Float32Array {
  const length = channels[0]?.length ?? 0;
  if (!length) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const ch of channels) sum += ch[i] ?? 0;
    out[i] = sum / channels.length;
  }
  return out;
}

/**
 * 从标点推意群边界（影子跟读没有 sentence-lab 的 segments）。
 * 有标点就只认标点；没有标点时才找第一个句中连词，避免一场句子里加太多假边界。
 * 返回比例口径与 standardBreaks 一致：下一个意群首词的下标 / (词数 - 1)。
 */
export function expectedBreakRatios(text: string): number[] {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [];
  const total = Math.max(1, words.length - 1);
  const ratios = new Set<number>();

  for (let i = 0; i < words.length - 1; i++) {
    const clean = words[i].replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
    if (/[,;:]|[—–]/.test(clean)) ratios.add((i + 1) / total);
  }

  let valid = [...ratios].filter((r) => r > 0.05 && r < 0.95).sort((a, b) => a - b);
  if (valid.length === 0 && words.length >= 4) {
    const conj = /^(and|but|because|so|which|that|when|if|although|though|while|or|then)$/i;
    for (let i = 1; i < words.length - 1; i++) {
      const clean = words[i].replace(/[^a-z]/gi, '');
      if (conj.test(clean)) { ratios.add(i / total); break; }
    }
    valid = [...ratios].filter((r) => r > 0.05 && r < 0.95).sort((a, b) => a - b);
  }
  return valid;
}

export function summarizeVolume(samples: Float32Array): IVolumeSummary {
  let sum = 0;
  let peak = 0;
  let clippedSamples = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    const a = Math.abs(v);
    sum += v * v;
    if (a > peak) peak = a;
    if (a >= 0.999) clippedSamples++;
  }
  const n = samples.length;
  const rms = n > 0 ? Math.sqrt(sum / n) : 0;
  const rmsDbfs = rms > 0 ? 20 * Math.log10(rms) : -100;
  const peakDbfs = peak > 0 ? 20 * Math.log10(peak) : -100;
  const clippingRatio = n > 0 ? clippedSamples / n : 0;
  return {
    rmsDbfs: Math.round(rmsDbfs * 10) / 10,
    peakDbfs: Math.round(peakDbfs * 10) / 10,
    clippingRatio,
    tooQuiet: peakDbfs < -24 || rmsDbfs < -36,
    // 只看接近满幅的样本占比：单帧峰值到 0 dBFS 不等于可听爆音
    clipped: clippingRatio > 0.003,
  };
}

/** 20ms RMS 能量包络 → 停顿（首尾静音不算意群停顿） */
export function detectPauses(samples: Float32Array, sampleRate: number): IPause[] {
  if (!samples.length || !sampleRate) return [];
  const frame = Math.max(1, Math.round(sampleRate * (FRAME_MS / 1000)));
  const frames: number[] = [];
  for (let i = 0; i < samples.length; i += frame) {
    let sum = 0;
    const end = Math.min(samples.length, i + frame);
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    frames.push(Math.sqrt(sum / Math.max(1, end - i)));
  }

  let peak = 0;
  for (const v of frames) if (v > peak) peak = v;
  if (peak < 0.002) return [];   // 整段几乎无声：不是"停顿",是没有语音

  const threshold = Math.max(0.012, peak * 0.08);
  const minPauseFrames = Math.round(MIN_PAUSE_MS / FRAME_MS);
  const durationMs = (samples.length / sampleRate) * 1000;
  const pauses: IPause[] = [];
  let run = 0;
  let runStart = 0;

  const push = (start: number, len: number) => {
    const midMs = (start + len / 2) * FRAME_MS;
    pauses.push({ at: midMs / durationMs, ms: len * FRAME_MS });
  };

  for (let i = 0; i < frames.length; i++) {
    if (frames[i] < threshold) {
      if (run === 0) runStart = i;
      run++;
    } else {
      if (run >= minPauseFrames) push(runStart, run);
      run = 0;
    }
  }
  if (run >= minPauseFrames) push(runStart, run);

  return pauses.filter((p) => p.at > 0.08 && p.at < 0.95);
}

/** 自相关基频检测：只给中位/范围/趋势，不下"发音对不对"的结论 */
export function summarizePitch(samples: Float32Array, sampleRate: number): IPitchSummary | null {
  if (!samples.length || !sampleRate) return null;
  const frame = Math.max(1, Math.round(sampleRate * (PITCH_FRAME_MS / 1000)));
  const hop = Math.max(1, Math.round(sampleRate * (PITCH_HOP_MS / 1000)));
  const minLag = Math.max(2, Math.floor(sampleRate / MAX_PITCH_HZ));
  const maxLag = Math.min(frame - 2, Math.ceil(sampleRate / MIN_PITCH_HZ));
  if (maxLag <= minLag) return null;

  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak < 0.005) return null;

  const pitches: number[] = [];
  const energyFloor = Math.max(0.006, peak * 0.08);

  for (let start = 0; start + frame <= samples.length; start += hop) {
    let mean = 0;
    for (let i = start; i < start + frame; i++) mean += samples[i];
    mean /= frame;

    let energy = 0;
    for (let i = start; i < start + frame; i++) {
      const v = samples[i] - mean;
      energy += v * v;
    }
    if (Math.sqrt(energy / frame) < energyFloor) continue;

    const corrs = new Float32Array(maxLag + 1);
    let bestLag = 0;
    let bestCorr = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      let e1 = 0;
      let e2 = 0;
      const end = start + frame - lag;
      for (let i = start; i < end; i++) {
        const a = samples[i] - mean;
        const b = samples[i + lag] - mean;
        corr += a * b;
        e1 += a * a;
        e2 += b * b;
      }
      if (e1 <= 0 || e2 <= 0) continue;
      const r = corr / Math.sqrt(e1 * e2);
      corrs[lag] = r;
      if (r > bestCorr) { bestCorr = r; bestLag = lag; }
    }
    if (bestLag > 0 && bestCorr >= 0.45) {
      // 自相关在周期的整数倍处都高；优先取更短的强峰，避免 220Hz 被读成 73Hz
      let chosen = bestLag;
      for (let k = 2; k <= 6; k++) {
        const lag = Math.round(bestLag / k);
        if (lag >= minLag && corrs[lag] >= bestCorr * 0.9) chosen = lag;
      }
      pitches.push(sampleRate / chosen);
    }
  }

  if (pitches.length < 3) return null;
  const sorted = [...pitches].sort((a, b) => a - b);
  const medianOf = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] || 0;
  };
  const median = medianOf(pitches);
  const p10 = sorted[Math.max(0, Math.floor(sorted.length * 0.1))];
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
  const n = pitches.length;
  const first = medianOf(pitches.slice(0, Math.max(1, Math.floor(n / 3))));
  const last = medianOf(pitches.slice(Math.floor((n * 2) / 3)));
  const trend = last > first * 1.12 ? 'rising' : last < first * 0.88 ? 'falling' : 'stable';

  const tailStart = Math.max(0, Math.floor(n * 0.75));
  const tail = medianOf(pitches.slice(tailStart));
  const before = medianOf(pitches.slice(0, Math.max(1, Math.floor(n * 0.5))));
  const endsRising = before > 0 && tail > before * 1.08;

  return {
    medianHz: Math.round(median),
    p10Hz: Math.round(p10),
    p90Hz: Math.round(p90),
    trend,
    endsRising,
    voicedFrames: n,
  };
}

export function analyzePcm(
  channels: Float32Array[],
  sampleRate: number,
  opts: IAnalyzeOptions = {},
): ISpeechAnalysis | null {
  const length = channels[0]?.length ?? 0;
  if (!length || !sampleRate) return null;

  const mono = mixMono(channels);
  const resampled = resampleMono16k(channels, sampleRate);
  if (!resampled) return null;

  const durationMs = (length / sampleRate) * 1000;
  const volume = summarizeVolume(mono);
  // 几乎无声的录音不做停顿判定：否则整段会被当成一处超长"停顿"
  const pauses = volume.peakDbfs < -40 ? [] : detectPauses(resampled, PITCH_RATE);
  const pitch = summarizePitch(resampled, PITCH_RATE);
  const expected = (opts.expectedBoundaries ?? expectedBreakRatios(opts.targetText || ''))
    .slice()
    .sort((a, b) => a - b);
  const inner = expected.filter((b) => b > 0.08 && b < 0.95);
  const hit = inner.filter((b) => pauses.some((p) => Math.abs(p.at - b) <= BOUNDARY_TOL)).length;
  const pace = opts.targetText ? speechPace(opts.targetText, durationMs, opts.msPerWord) : null;

  return {
    durationMs,
    volume,
    pauses,
    expectedBoundaries: expected,
    hit,
    total: inner.length,
    pitch,
    pace,
  };
}

/** 浏览器侧：任意录音 Blob → 离线分析；解码失败返回 null（调用方保留回放） */
export async function analyzeBlob(
  blob: Blob,
  opts: IAnalyzeOptions = {},
): Promise<ISpeechAnalysis | null> {
  try {
    const buf = await blob.arrayBuffer();
    const Ctx = window.AudioContext
      || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    try {
      const audio = await ctx.decodeAudioData(buf.slice(0));
      const channels = Array.from(
        { length: audio.numberOfChannels },
        (_, i) => audio.getChannelData(i),
      );
      return analyzePcm(channels, audio.sampleRate, opts);
    } finally {
      try { void ctx.close(); } catch { /* ignore */ }
    }
  } catch {
    return null;
  }
}
