import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Mic, Play, RotateCcw, Square, Timer, Waves, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTTS } from '@/lib/use-tts';
import { cn } from '@/lib/utils';
import type { ISentenceLabItem } from '@/data/sentence-lab';
import { standardBreaks } from '@/lib/sentence-parse';

/** 一处停顿检测结果 */
interface IPause {
  /** 停顿中点占整段录音的比例 0–1 */
  at: number;
  ms: number;
}

interface IAnalysis {
  durationMs: number;
  /** 参考时长（按词数估算，与朗读语速同源） */
  expectedMs: number;
  /** 时长偏差（正=偏慢） */
  paceDelta: number;
  pauses: IPause[];
  /** 期望的意群停顿比例（含 0 与 1 端点之外的分界） */
  expectedBoundaries: number[];
  /** 命中的边界数 / 应有边界数 */
  hit: number;
  total: number;
}

/**
 * 跟读评价。
 *
 * 关键设计：**不做发音识别**（离线不可行、联网又要等），而是评两件可离线客观测量的事：
 *   1) 语速贴合 —— 用户读完的总时长 vs 参考时长
 *   2) 停顿位置 —— 从录音的能量包络里检出停顿，看是否落在意群边界上
 * 第 2 点正是「读得断不断」的核心：母语者按意群换气，中式朗读常一口气读完或断在错处。
 * 另外提供 A/B 回放（原声 vs 自己的），发音本身让人耳自己判断。
 */
export function SpeakBack({ item }: { item: ISentenceLabItem }) {
  const { speak } = useTTS();
  const [recording, setRecording] = useState(false);
  const [userUrl, setUserUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<IAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startAtRef = useRef(0);

  const wordCount = useMemo(() => item.en.split(/\s+/).filter(Boolean).length, [item]);
  // 与 use-tts 的估算口径一致：约 260ms/词
  const expectedMs = useMemo(() => Math.max(800, wordCount * 260), [wordCount]);

  // 期望的意群边界（按词序号 → 占全句的比例）
  const expectedBoundaries = useMemo(() => {
    const breaks = standardBreaks(item);
    const total = Math.max(1, wordCount - 1);
    return [...breaks].map((w) => w / total).sort((a, b) => a - b);
  }, [item, wordCount]);

  useEffect(() => () => { if (userUrl) URL.revokeObjectURL(userUrl); }, [userUrl]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setUserUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
        setBusy(true);
        try {
          const a = await analyze(blob, expectedMs, expectedBoundaries);
          setAnalysis(a);
        } catch {
          toast.info('录音已保存，但音频分析失败（可先自听对比）');
          setAnalysis(null);
        } finally {
          setBusy(false);
        }
      };
      recorderRef.current = rec;
      startAtRef.current = Date.now();
      rec.start();
      setRecording(true);
      setAnalysis(null);
    } catch (e) {
      toast.error('无法访问麦克风 —— 请在系统设置里允许录音权限');
    }
  }, [expectedMs, expectedBoundaries]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }, []);

  return (
    <div className="space-y-3 rounded-3xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Waves className="size-3.5 text-ink-teal" /> 跟读评价
        </p>
        <p className="text-[10px] font-bold text-muted-foreground">
          评的是「语速 + 停顿」，不评发音（发音请用下面 A/B 回放自己听）
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="rounded-xl text-[10px] font-black"
          onClick={() => speak(item.en)}>
          <Play className="size-3.5" /> 听原声
        </Button>
        {!recording ? (
          <Button size="sm" className={cn('rounded-xl text-[10px] font-black', 'bg-[#00B894] hover:bg-[#00A383]')}
            onClick={start}>
            <Mic className="size-3.5" /> 开始跟读
          </Button>
        ) : (
          <Button size="sm" variant="destructive" className="rounded-xl text-[10px] font-black" onClick={stop}>
            <Square className="size-3.5" /> 停止
          </Button>
        )}
        {userUrl && (
          <Button size="sm" variant="outline" className="rounded-xl text-[10px] font-black"
            onClick={() => { const a = new Audio(userUrl); a.play(); }}>
            <ArrowLeftRight className="size-3.5" /> 听我的
          </Button>
        )}
        {userUrl && (
          <Button size="sm" variant="ghost" className="rounded-xl text-[10px] font-black"
            onClick={() => { setUserUrl((o) => { if (o) URL.revokeObjectURL(o); return null; }); setAnalysis(null); }}>
            <RotateCcw className="size-3.5" /> 重录
          </Button>
        )}
      </div>

      {busy && <p className="text-[11px] font-bold text-muted-foreground">正在分析录音…</p>}

      {analysis && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/60 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                <Timer className="size-3" /> 语速贴合
              </p>
              <p className="text-[13px] font-black text-foreground">
                {(analysis.durationMs / 1000).toFixed(1)}s
                <span className="text-[11px] font-bold text-muted-foreground"> / 参考 {(analysis.expectedMs / 1000).toFixed(1)}s</span>
              </p>
              <p className={cn(
                'text-[10px] font-black mt-0.5',
                Math.abs(analysis.paceDelta) <= 0.2 ? 'text-ink-teal' : 'text-amber-600 dark:text-amber-400',
              )}>
                {analysis.paceDelta > 0.2 ? `偏慢 ${Math.round(analysis.paceDelta * 100)}%`
                  : analysis.paceDelta < -0.2 ? `偏快 ${Math.round(-analysis.paceDelta * 100)}%`
                    : '节奏贴合 ✓'}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                <Waves className="size-3" /> 停顿落点
              </p>
              <p className="text-[13px] font-black text-foreground">
                {analysis.hit}/{analysis.total} 处意群边界
              </p>
              <p className={cn(
                'text-[10px] font-black mt-0.5',
                analysis.total > 0 && analysis.hit / analysis.total >= 0.6 ? 'text-ink-teal' : 'text-amber-600 dark:text-amber-400',
              )}>
                {analysis.pauses.length === 0
                  ? '一口气读完 —— 母语者会在意群间换气'
                  : analysis.hit / Math.max(1, analysis.total) >= 0.6 ? '断句位置正确 ✓' : '有停顿，但没落在意群边界上'}
              </p>
            </div>
          </div>

          {/* 停顿可视化：绿色竖线=应停顿的意群边界，灰色=你实际停的地方 */}
          <div className="rounded-2xl bg-muted/40 p-3">
            <div className="relative h-8">
              {expectedBoundaries.map((b, i) => (
                <span key={'e' + i} className="absolute top-1 w-0.5 h-3 rounded-full bg-[#00B894]"
                  style={{ left: `${b * 100}%` }} />
              ))}
              {analysis.pauses.map((p, i) => (
                <span key={'p' + i} className="absolute bottom-1 w-1 rounded-full bg-muted-foreground/60"
                  style={{ left: `calc(${p.at * 100}% - 2px)`, height: `${Math.min(16, 4 + p.ms / 120)}px` }} />
              ))}
            </div>
            <p className="text-[9px] font-bold text-muted-foreground">
              上排绿线＝应有停顿；下排灰柱＝你实际的停顿（越高越长）
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** 解码录音 → 能量包络 → 检出停顿 → 与意群边界比对 */
async function analyze(
  blob: Blob,
  expectedMs: number,
  expectedBoundaries: number[],
): Promise<IAnalysis> {
  const buf = await blob.arrayBuffer();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const audio = await ctx.decodeAudioData(buf.slice(0));
  const data = audio.getChannelData(0);
  const rate = audio.sampleRate;
  const durationMs = (data.length / rate) * 1000;

  // 20ms 一帧算 RMS
  const frame = Math.max(1, Math.round(rate * 0.02));
  const frames: number[] = [];
  for (let i = 0; i < data.length; i += frame) {
    let sum = 0;
    const end = Math.min(data.length, i + frame);
    for (let j = i; j < end; j++) sum += data[j] * data[j];
    frames.push(Math.sqrt(sum / Math.max(1, end - i)));
  }
  const peak = Math.max(...frames, 0.0001);
  const silenceThreshold = Math.max(0.012, peak * 0.08);   // 相对峰值取阈，抗环境噪声
  const minPauseFrames = Math.round(180 / 20);             // 停顿至少 180ms 才算意群停顿

  const pauses: IPause[] = [];
  let run = 0;
  let runStart = 0;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i] < silenceThreshold) {
      if (run === 0) runStart = i;
      run++;
    } else {
      if (run >= minPauseFrames) {
        const mid = (runStart + run / 2) * 20;             // ms
        pauses.push({ at: mid / durationMs, ms: run * 20 });
      }
      run = 0;
    }
  }
  if (run >= minPauseFrames) {
    const mid = (runStart + run / 2) * 20;
    pauses.push({ at: mid / durationMs, ms: run * 20 });
  }

  // 句首/句尾的静音不算「意群停顿」
  const inner = pauses.filter((p) => p.at > 0.08 && p.at < 0.95);

  const tol = 0.12;   // ±12% 时长容差
  let hit = 0;
  for (const b of expectedBoundaries) {
    if (b < 0.08 || b > 0.95) continue;
    if (inner.some((p) => Math.abs(p.at - b) <= tol)) hit++;
  }
  const total = expectedBoundaries.filter((b) => b >= 0.08 && b <= 0.95).length;

  await ctx.close();
  return {
    durationMs,
    expectedMs,
    paceDelta: (durationMs - expectedMs) / expectedMs,
    pauses: inner,
    expectedBoundaries,
    hit,
    total,
  };
}
