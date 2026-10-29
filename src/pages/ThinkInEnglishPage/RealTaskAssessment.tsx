/**
 * 真实任务前后测：写一封真实邮件，AI 只做两件事：
 *  ① 标出 5 个目标模式里哪些用上了、哪些还缺；
 *  ② 给 2–3 句可执行反馈。
 *
 * 前测和后测用同题型、不同内容的邮件；页面只对比“模式使用数量/缺失项”，
 * 不生成总分，也不写 SM-2。AI 不可用时退化为手动勾选“用上了哪些模式”。
 */
import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  THINK_PATTERNS,
  THINK_REAL_TASKS,
  type IThinkRealTaskPrompt,
} from '@/data/think-patterns';
import type { IRealTaskRecord } from '@/lib/think-patterns';
import type { RealTaskJudgeResult } from '@/lib/think-pattern-ai';
import { formatDate } from '@/lib/utils';

const MIN_WORDS = 50;
const MAX_WORDS = 220;

type Stage = 'intro' | 'write' | 'result';

export interface RealTaskAssessmentProps {
  realTask: { baseline?: IRealTaskRecord; followUp?: IRealTaskRecord } | null;
  onAnalyze: (task: IThinkRealTaskPrompt, answer: string) => Promise<RealTaskJudgeResult | null>;
  onSave: (stage: 'baseline' | 'followUp', record: IRealTaskRecord) => void;
  onExit: () => void;
}

const patternName = (id: string) => THINK_PATTERNS.find((pattern) => pattern.id === id)?.name ?? id;

function RecordSummary({ label, record }: { label: string; record: IRealTaskRecord }) {
  const total = record.patternsUsed.length + record.patternsMissing.length;
  return (
    <div className="rounded-2xl border border-border p-3 space-y-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-black text-foreground">{label}</p>
        <Badge variant="outline">{record.completedOn}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <span>词数 {record.wordCount}</span>
        <span>用到 {record.patternsUsed.length}/{total}</span>
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">用上的模式</p>
        <div className="flex flex-wrap gap-1.5">
          {record.patternsUsed.length > 0
            ? record.patternsUsed.map((id) => (
              <Badge key={id} variant="outline" className="border-emerald-500/40 text-emerald-600">
                {patternName(id)}
              </Badge>
            ))
            : <span className="text-xs text-muted-foreground">这次没有明显用上目标模式</span>}
        </div>
      </div>
      {record.patternsMissing.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">还缺</p>
          <div className="flex flex-wrap gap-1.5">
            {record.patternsMissing.map((id) => (
              <Badge key={id} variant="outline" className="border-amber-500/40 text-amber-700">
                {patternName(id)}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <div className="rounded-xl border border-border bg-muted/20 p-3">
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
          {record.source === 'ai' ? 'AI 反馈' : '自评'}
        </p>
        <p className="text-sm text-foreground/80 break-words">{record.feedback}</p>
        {record.strengths.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground break-words">做到：{record.strengths.join('；')}</p>
        )}
        {record.issues.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground break-words">待改：{record.issues.join('；')}</p>
        )}
      </div>
    </div>
  );
}

export function RealTaskAssessment({ realTask, onAnalyze, onSave, onExit }: RealTaskAssessmentProps) {
  const [stage, setStage] = useState<Stage>('intro');
  const [task, setTask] = useState<IThinkRealTaskPrompt | null>(null);
  const [answer, setAnswer] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [selfUsed, setSelfUsed] = useState<string[]>([]);

  const baseline = realTask?.baseline;
  const followUp = realTask?.followUp;
  const wordCount = answer.trim() ? answer.trim().split(/\s+/).filter(Boolean).length : 0;
  const targetPatterns = useMemo(
    () => (task ? THINK_PATTERNS.filter((pattern) => task.targetPatternIds.includes(pattern.id)) : []),
    [task],
  );

  const startWrite = (nextTask: IThinkRealTaskPrompt) => {
    setTask(nextTask);
    setAnswer('');
    setFallback(false);
    setSelfUsed([]);
    setStage('write');
  };

  const saveRecord = (result: RealTaskJudgeResult | null) => {
    if (!task) return;
    const used = result
      ? result.patternsUsed
      : selfUsed;
    const missing = result
      ? (result.patternsMissing.length > 0
        ? result.patternsMissing
        : task.targetPatternIds.filter((id) => !used.includes(id)))
      : task.targetPatternIds.filter((id) => !selfUsed.includes(id));
    const record: IRealTaskRecord = {
      promptId: task.id,
      prompt: task.prompt,
      answer: answer.trim(),
      completedOn: formatDate(new Date()),
      at: Date.now(),
      patternsUsed: used.filter((id) => task.targetPatternIds.includes(id)),
      patternsMissing: missing.filter((id) => task.targetPatternIds.includes(id)),
      feedback: result?.feedback ?? '自评：标记了这次用上的模式',
      strengths: result?.strengths ?? [],
      issues: result?.issues ?? [],
      wordCount,
      source: result ? 'ai' : 'self',
    };
    onSave(task.stage, record);
    setStage('result');
  };

  const analyze = async () => {
    if (!task || wordCount < MIN_WORDS || wordCount > MAX_WORDS || analyzing) return;
    setAnalyzing(true);
    let result: RealTaskJudgeResult | null = null;
    try {
      result = await onAnalyze(task, answer.trim());
    } catch {
      result = null;
    }
    setAnalyzing(false);
    if (result) {
      saveRecord(result);
    } else {
      setFallback(true);
    }
  };

  if (stage === 'intro') {
    if (baseline && followUp) {
      const before = new Set(baseline.patternsUsed);
      const newlyUsed = followUp.patternsUsed.filter((id) => !before.has(id));
      const stillMissing = followUp.patternsMissing;
      return (
        <Card className="rounded-3xl border-border shadow-sm">
          <CardHeader className="pb-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Real Task
            </p>
            <CardTitle className="text-2xl font-black italic tracking-tight">真实任务前后测</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground break-words">
              不是分数：只看同一题型下，5 个目标模式的自发使用有没有变化。
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <RecordSummary label="前测" record={baseline} />
              <RecordSummary label="后测" record={followUp} />
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-bold text-foreground">
                变化：{baseline.patternsUsed.length} → {followUp.patternsUsed.length} 个目标模式
              </p>
              {newlyUsed.length > 0 && (
                <p className="text-xs text-emerald-600 break-words">新用上：{newlyUsed.map(patternName).join('、')}</p>
              )}
              {stillMissing.length > 0 && (
                <p className="text-xs text-amber-700 break-words">仍缺：{stillMissing.map(patternName).join('、')}</p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button className="rounded-full sm:flex-1" onClick={() => startWrite(THINK_REAL_TASKS[1])}>
                重做后测
              </Button>
              <Button variant="outline" className="rounded-full sm:flex-1" onClick={() => startWrite(THINK_REAL_TASKS[0])}>
                重做前测
              </Button>
              <Button variant="ghost" className="rounded-full" onClick={onExit}>返回概览</Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    const nextTask = baseline ? THINK_REAL_TASKS[1] : THINK_REAL_TASKS[0];
    return (
      <Card className="rounded-3xl border-border shadow-sm">
        <CardHeader className="pb-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            Real Task
          </p>
          <CardTitle className="text-2xl font-black italic tracking-tight">真实任务前后测</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground break-words">
            写一封真实邮件，测 5 个目标模式能不能自发用出来。前测一次，训练两周后再做后测；不看总分，只看模式和缺失项的变化。
          </p>
          {baseline && <RecordSummary label="前测已完成" record={baseline} />}
          <div className="rounded-2xl border border-border bg-muted/20 p-3">
            <p className="text-xs font-bold text-foreground">{nextTask.title}</p>
            <p className="mt-1 text-xs text-muted-foreground break-words">{nextTask.prompt}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {nextTask.targetPatternIds.map((id) => (
                <Badge key={id} variant="outline">{patternName(id)}</Badge>
              ))}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button className="rounded-full sm:flex-1" onClick={() => startWrite(nextTask)}>
              {baseline ? '开始后测' : '开始前测'}
            </Button>
            <Button variant="outline" className="rounded-full sm:flex-1" onClick={onExit}>返回概览</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (stage === 'result' && task) {
    const record = task.stage === 'baseline' ? baseline : followUp;
    return (
      <Card className="rounded-3xl border-border shadow-sm">
        <CardHeader className="pb-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            Real Task
          </p>
          <CardTitle className="text-2xl font-black italic tracking-tight">已保存</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {record && <RecordSummary label={task.stage === 'baseline' ? '前测' : '后测'} record={record} />}
          <p className="text-xs text-muted-foreground">
            {task.stage === 'baseline'
              ? '前测已保存。训练一段时间后再回来做后测。'
              : '后测已保存。回到概览可以看到前后测对比。'}
          </p>
          <Button className="rounded-full" onClick={() => setStage('intro')}>返回前后测概览</Button>
        </CardContent>
      </Card>
    );
  }

  if (!task) {
    return (
      <Card className="rounded-3xl border-border shadow-sm">
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm text-muted-foreground">真实任务还没准备好。</p>
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
            Real Task · {task.stage === 'baseline' ? '前测' : '后测'}
          </p>
          <h2 className="text-2xl font-black italic tracking-tight text-foreground">{task.title}</h2>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 rounded-full" onClick={onExit}>退出</Button>
      </div>

      <Card className="rounded-3xl border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
            任务
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm font-semibold text-foreground break-words">{task.prompt}</p>
          <div className="flex flex-wrap gap-1.5">
            {targetPatterns.map((pattern) => (
              <Badge key={pattern.id} variant="outline">{pattern.name}</Badge>
            ))}
          </div>
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={analyzing || fallback}
            rows={10}
            placeholder="用英文写这封邮件……"
            aria-label="真实任务邮件"
            className="min-h-56 resize-y"
          />
          <p className={wordCount < MIN_WORDS || wordCount > MAX_WORDS ? 'text-xs text-amber-700' : 'text-xs text-muted-foreground'}>
            {wordCount} 词 · 建议 80–120 词（至少 {MIN_WORDS}，最多 {MAX_WORDS}）
          </p>

          {!fallback && (
            <Button
              className="w-full sm:w-auto rounded-full"
              disabled={wordCount < MIN_WORDS || wordCount > MAX_WORDS || analyzing}
              onClick={() => { void analyze(); }}
            >
              {analyzing ? '正在分析…' : '分析并保存'}
            </Button>
          )}
          {analyzing && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              正在看这封邮件用了哪些模式…
            </p>
          )}

          {fallback && (
            <div className="space-y-3 rounded-2xl border border-border bg-muted/25 p-4">
              <p className="text-xs font-black text-amber-700">AI 分析暂不可用，先手动标记这次用上的模式</p>
              <div className="flex flex-wrap gap-2">
                {targetPatterns.map((pattern) => {
                  const active = selfUsed.includes(pattern.id);
                  return (
                    <button
                      key={pattern.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelfUsed((prev) => (
                        prev.includes(pattern.id)
                          ? prev.filter((id) => id !== pattern.id)
                          : [...prev, pattern.id]
                      ))}
                      className={active
                        ? 'rounded-full border border-[var(--brand)]/60 bg-[var(--brand)]/10 px-3 py-1.5 text-xs font-bold text-ink-teal'
                        : 'rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground'}
                    >
                      {pattern.name}
                    </button>
                  );
                })}
              </div>
              <Button className="rounded-full" onClick={() => saveRecord(null)}>保存自评</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
