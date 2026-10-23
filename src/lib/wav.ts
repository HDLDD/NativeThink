/**
 * 录音转 16kHz 单声道 16-bit WAV。
 *
 * 为什么需要：Chrome 的 MediaRecorder 产出 WebM/Opus，GLM-ASR-2512 实测回
 * `1214 transcriptions不支持当前文件格式`；WAV 是三个 provider 都稳的容器。
 * 解码与重采样只在浏览器做（AudioContext），编码本身是纯函数，守卫可真跑。
 */

const TARGET_RATE = 16000;

/** 多声道 Float32 → mono 16k Float32（线性插值重采样；音量分析/音高检测复用） */
export function resampleMono16k(
  channels: Float32Array[],
  sourceRate: number,
  targetRate = TARGET_RATE,
): Float32Array | null {
  const length = channels[0]?.length ?? 0;
  if (!length || !sourceRate || !targetRate || channels.length === 0) return null;

  const ratio = sourceRate / targetRate;
  const outLength = Math.max(1, Math.floor(length / ratio));
  const out = new Float32Array(outLength);
  const channelCount = channels.length;
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const i0 = Math.min(length - 1, Math.floor(srcPos));
    const i1 = Math.min(length - 1, i0 + 1);
    const frac = srcPos - i0;
    let sample = 0;
    for (let c = 0; c < channelCount; c++) {
      const ch = channels[c];
      const a = ch[i0] ?? 0;
      const b = ch[i1] ?? a;
      sample += a + (b - a) * frac;
    }
    out[i] = sample / channelCount;
  }
  return out;
}

/** mono 16k Float32 → 16-bit PCM WAV */
export function encodeWavMono16k(
  channels: Float32Array[],
  sourceRate: number,
  targetRate = TARGET_RATE,
): ArrayBuffer | null {
  const mono = resampleMono16k(channels, sourceRate, targetRate);
  if (!mono) return null;

  const dataSize = mono.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);          // PCM fmt chunk size
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);           // block align
  view.setUint16(34, 16, true);          // bits per sample
  writeText(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < mono.length; i++) {
    const clamped = Math.max(-1, Math.min(1, mono[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return buffer;
}

/** 浏览器侧：Blob → WAV Blob + 精确时长；解码失败返回 null（调用方退回原 Blob） */
export async function blobToWav16k(
  blob: Blob,
): Promise<{ blob: Blob; durationMs: number } | null> {
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
      const wav = encodeWavMono16k(channels, audio.sampleRate);
      if (!wav) return null;
      return { blob: new Blob([wav], { type: 'audio/wav' }), durationMs: audio.duration * 1000 };
    } finally {
      try { void ctx.close(); } catch { /* ignore */ }
    }
  } catch {
    return null;
  }
}
