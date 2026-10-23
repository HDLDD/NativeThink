import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Activity, ArrowLeftRight, Mic, Play, RotateCcw, Square, Timer, Volume2, Waves } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTTS } from '@/lib/use-tts';
import { cn } from '@/lib/utils';
import type { ISentenceLabItem } from '@/data/sentence-lab';
import { standardBreaks } from '@/lib/sentence-parse';
import { analyzeBlob, type ISpeechAnalysis } from '@/lib/speech-analysis';

/**
 * 跟读评价（路线 1：共享离线分析）。
 *
 * **不做发音识别/音素评分**，只评能从波形客观测量的东西：
 *   1) 语速贴合 —— 录音总时长 vs 词数参考；
 *   2) 停顿位置 —— 能量包络检出停顿，看是否落在意群边界；
 *   3) 音量/爆音；
 *   4) 音高趋势（只看整体与句尾，不评音素）。
 * A/B 回放仍然保留，发音本身让人耳自己判断。
 */
export function SpeakBack({ item }: { item: ISentenceLabItem }) {
  const { speak } = useTTS();
  const [recording, setRecording] = useState(false);
  const [userUrl, setUserUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ISpeechAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startAtRef = useRef(0);

  const wordCount = useMemo(() => item.en.split(/\s+/).filter(Boolean).length, [item]);

  // 期望的意群边界（按词序号 → 占全句的比例）
  const expectedBoundaries = useMemo(() => {
    const breaks = standardBreaks(item);
    const total = Math.max(1, wordCount - 1);
    return [...breaks].map((w) => w / total).sort((a, b) => a - b);
  }, [item, wordCount]);

  useEffect(() => () => { if (userUrl) URL.revokeObjectURL(userUrl); }, [userUrl]);

  // 卸载兜底：录音中途导航离开（Layout key=pathname 每次导航都重挂载）时
  // 停掉录制器并释放 MediaStream —— 否则麦克风指示灯常亮、采集管线持续占用
  useEffect(() => () => {
    const rec = recorderRef.current;
    if (rec && rec.state === 'recording') {
      rec.onstop = null;          // 摘掉 onstop，避免卸载后再 setState
      try { rec.stop(); } catch { /* ignore */ }
      rec.stream?.getTracks().forEach((t) => t.stop());
    }
    recorderRef.current = null;
  }, []);

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
          const a = await analyzeBlob(blob, { targetText: item.en, expectedBoundaries });
          setAnalysis(a);
          if (!a) toast.info('录音已保存，但音频分析失败（可先自听对比）');
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
  }, [item.en, expectedBoundaries]);

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
          评的是「语速 + 停顿 + 音量 + 音高趋势」，不评音素发音（发音请用 A/B 回放自己听）
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="rounded-xl text-[10px] font-black"
          onClick={() => speak(item.en)}>
          <Play className="size-3.5" /> 听原声
        </Button>
        {!recording ? (
          <Button size="sm" className={cn('rounded-xl text-[10px] font-black', 'bg-[var(--brand)] hover:bg-[#00A383]')}
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
                <span className="text-[11px] font-bold text-muted-foreground">
                  {' '}/ 参考 {analysis.pace ? (analysis.pace.expectedMs / 1000).toFixed(1) : '—'}s
                </span>
              </p>
              <p className={cn(
                'text-[10px] font-black mt-0.5',
                analysis.pace && Math.abs(analysis.pace.delta) <= 0.2 ? 'text-ink-teal' : 'text-amber-600 dark:text-amber-400',
              )}>
                {!analysis.pace ? '没有可比的参考时长'
                  : analysis.pace.label === 'slow' ? `偏慢 ${Math.round(analysis.pace.delta * 100)}%`
                    : analysis.pace.label === 'fast' ? `偏快 ${Math.round(-analysis.pace.delta * 100)}%`
                      : '节奏贴合 ✓'}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                <Waves className="size-3" /> 停顿落点
              </p>
              {analysis.total > 0 ? (
                <>
                  <p className="text-[13px] font-black text-foreground">
                    {analysis.hit}/{analysis.total} 处意群边界
                  </p>
                  <p className={cn(
                    'text-[10px] font-black mt-0.5',
                    analysis.pauses.length > 0 && analysis.hit / analysis.total >= 0.6
                      ? 'text-ink-teal' : 'text-amber-600 dark:text-amber-400',
                  )}>
                    {analysis.pauses.length === 0
                      ? '一口气读完 —— 母语者会在意群间换气'
                      : analysis.hit / analysis.total >= 0.6 ? '断句位置正确 ✓' : '有停顿，但没落在意群边界上'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[13px] font-black text-foreground">检测到 {analysis.pauses.length} 处停顿</p>
                  <p className="text-[10px] font-black mt-0.5 text-muted-foreground">本句没有可比的标点意群边界</p>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/60 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                <Volume2 className="size-3" /> 音量
              </p>
              <p className={cn(
                'text-[13px] font-black',
                analysis.volume.tooQuiet || analysis.volume.clipped ? 'text-amber-600 dark:text-amber-400' : 'text-ink-teal',
              )}>
                {analysis.volume.tooQuiet ? '偏低' : analysis.volume.clipped ? '有爆音' : '正常'}
              </p>
              <p className="text-[10px] font-bold text-muted-foreground">
                RMS {analysis.volume.rmsDbfs} dBFS · 峰值 {analysis.volume.peakDbfs} dBFS
              </p>
              {analysis.volume.tooQuiet && (
                <p className="text-[10px] font-black mt-0.5 text-amber-600 dark:text-amber-400">靠近麦克风一点</p>
              )}
              {analysis.volume.clipped && (
                <p className="text-[10px] font-black mt-0.5 text-amber-600 dark:text-amber-400">离麦克风远一点 / 降低音量</p>
              )}
            </div>
            <div className="rounded-2xl border border-border/60 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                <Activity className="size-3" /> 音高趋势
              </p>
              <p className="text-[13px] font-black text-foreground">
                {analysis.pitch ? `${analysis.pitch.p10Hz}–${analysis.pitch.p90Hz} Hz` : '未检测到稳定音高'}
              </p>
              <p className="text-[10px] font-bold text-muted-foreground">
                {analysis.pitch
                  ? `中位 ${analysis.pitch.medianHz} Hz · ${analysis.pitch.trend === 'rising' ? '整体上扬' : analysis.pitch.trend === 'falling' ? '整体下降' : '基本平稳'}`
                  : '声音太轻或环境噪声大时可能测不到'}
              </p>
              {item.en.trim().endsWith('?') && analysis.pitch && (
                <p className={cn(
                  'text-[10px] font-black mt-0.5',
                  analysis.pitch.endsRising ? 'text-ink-teal' : 'text-amber-600 dark:text-amber-400',
                )}>
                  {analysis.pitch.endsRising ? '疑问句句尾有上扬 ✓' : '疑问句句尾可以再上扬一点'}
                </p>
              )}
            </div>
          </div>

          {/* 停顿可视化：绿色竖线=应停顿的意群边界，灰色=你实际停的地方 */}
          <div className="rounded-2xl bg-muted/40 p-3">
            <div className="relative h-8">
              {analysis.expectedBoundaries.map((b, i) => (
                <span key={'e' + i} className="absolute top-1 w-0.5 h-3 rounded-full bg-[var(--brand)]"
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
