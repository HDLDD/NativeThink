/**
 * 口头任务：60–90 秒真实场景口头表达。
 *
 * MVP 只做“能开口 + 能回听 + 自评”：本地 MediaRecorder 录音、播放、自评，
 * 不上传、不接 ASR、不生成发音分 —— 没有识别通道时不假造分数。
 */
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  THINK_PATTERNS,
  type IThinkSpeakingPrompt,
} from '@/data/think-patterns';

const MIN_SECONDS = 60;
const MAX_SECONDS = 90;

export interface SpeakingPracticeProps {
  prompts: IThinkSpeakingPrompt[];
  onExit: () => void;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export function SpeakingPractice({ prompts, onExit }: SpeakingPracticeProps) {
  const [promptIndex, setPromptIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [selfCheck, setSelfCheck] = useState<'pass' | 'fail' | null>(null);
  const mountedRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);
  const secondsRef = useRef(0);
  const stopRecordingRef = useRef<() => void>(() => {});

  const prompt = prompts[promptIndex];
  const targetPatterns = prompt
    ? THINK_PATTERNS.filter((pattern) => prompt.targetPatternIds.includes(pattern.id))
    : [];

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const revokeUrl = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
      stopTracks();
      revokeUrl();
    };
  }, []);

  const stopRecording = () => {
    clearTimer();
    setRecording(false);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stopTracks();
  };
  stopRecordingRef.current = stopRecording;

  /** 丢弃这一轮的录音器和它的回调：换题/重录时旧 onstop 不许把上一段音频塞回来。 */
  const discardRecorder = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
      mediaRecorderRef.current = null;
    }
    clearTimer();
    setRecording(false);
    stopTracks();
  };

  const startRecording = async () => {
    discardRecorder();
    setError('');
    setSelfCheck(null);
    setSeconds(0);
    secondsRef.current = 0;
    setAudioUrl(null);
    revokeUrl();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('这台设备的浏览器不支持录音，可以先开口练，不录音。');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (!mountedRef.current) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setAudioUrl(url);
      };
      recorder.start();
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        secondsRef.current = Math.min(MAX_SECONDS, secondsRef.current + 1);
        setSeconds(secondsRef.current);
        if (secondsRef.current >= MAX_SECONDS) stopRecordingRef.current();
      }, 1000);
    } catch {
      stopTracks();
      setError('麦克风不可用；可以先开口练，不录音。');
    }
  };

  const nextPrompt = () => {
    discardRecorder();
    setPromptIndex((prev) => (prev + 1) % prompts.length);
    setSeconds(0);
    secondsRef.current = 0;
    setAudioUrl(null);
    setSelfCheck(null);
    setError('');
    revokeUrl();
  };

  if (!prompt) {
    return (
      <Card className="rounded-3xl border-border shadow-sm">
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm text-muted-foreground">口头任务还没准备好。</p>
          <Button variant="outline" className="rounded-full" onClick={onExit}>返回概览</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
            Speaking
          </p>
          <h2 className="text-2xl font-black italic tracking-tight text-foreground">口头任务</h2>
          <p className="text-sm font-medium text-muted-foreground mt-1">60–90 秒，把话说完整。</p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 rounded-full" onClick={onExit}>
          退出
        </Button>
      </div>

      <Card className="rounded-3xl border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
            {prompt.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm font-semibold text-foreground break-words">{prompt.prompt}</p>
          <div className="flex flex-wrap gap-1.5">
            {targetPatterns.map((pattern) => (
              <Badge key={pattern.id} variant="outline">{pattern.name}</Badge>
            ))}
          </div>

          <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-2xl font-black tabular-nums text-foreground">{formatTime(seconds)}</p>
              <p className="text-xs text-muted-foreground">
                建议 {MIN_SECONDS}–{MAX_SECONDS} 秒
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {!recording ? (
                <Button className="rounded-full sm:flex-1" onClick={() => { void startRecording(); }}>
                  {audioUrl ? '重新录音' : '开始录音'}
                </Button>
              ) : (
                <Button className="rounded-full sm:flex-1" onClick={stopRecording}>
                  停止录音
                </Button>
              )}
              <Button variant="outline" className="rounded-full sm:flex-1" onClick={nextPrompt}>
                换一个题目
              </Button>
            </div>
            {recording && (
              <p className="flex items-center gap-2 text-xs text-amber-700">
                <span className="size-2 animate-pulse rounded-full bg-amber-500" aria-hidden />
                正在录音；说完点“停止录音”。
              </p>
            )}
            {error && <p className="text-xs text-amber-700 break-words">{error}</p>}
          </div>

          {audioUrl && (
            <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="text-xs font-black text-foreground">回听你的表达</p>
              <audio controls src={audioUrl} className="w-full" />
              <p className="text-xs text-muted-foreground">
                对照上面的模式听：主语清不清楚？重点有没有落到句尾？请求有没有给台阶？
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button className="rounded-full sm:flex-1" onClick={() => setSelfCheck('pass')}>
                  说顺了
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full sm:flex-1"
                  onClick={() => setSelfCheck('fail')}
                >
                  还差一点
                </Button>
              </div>
              {selfCheck && (
                <p className="text-xs font-bold text-muted-foreground">
                  {selfCheck === 'pass' ? '已记录：这次说顺了。' : '已记录：下次再录一遍。'}
                </p>
              )}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            本地录音，不上传；不做发音评分。没有录音权限也可以直接开口练。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
