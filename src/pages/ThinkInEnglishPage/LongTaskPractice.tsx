/**
 * 长文 / 对话 / 无中文源任务：把多个模式连着用出来。
 *
 * 三类任务共用一套写作框：长邮件、客户对话、图表描述（无中文源）。
 * 只做 AI 分析或手动勾选自评；本地草稿按任务存，**不写 SM-2、不弹 toast**。
 * 「AI 再出一道」只生成练习题，不进入掌握判定。
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  THINK_PATTERNS,
  type IThinkLongTask,
  type IThinkPattern,
} from '@/data/think-patterns';
import type { GeneratedPracticeTask, RealTaskJudgeResult } from '@/lib/think-pattern-ai';
import { cn } from '@/lib/utils';

const DRAFT_KEY = '__nativethink_think_long_task_drafts';

function loadDrafts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
}

function saveDrafts(drafts: Record<string, string>): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  } catch {
    import('@/lib/capped-cache').then(({ warnStorageFull }) => warnStorageFull());
  }
}

const countWords = (text: string): number => {
  const matches = text.trim().match(/[A-Za-z][A-Za-z'-]*/g);
  return matches?.length ?? 0;
};

const KIND_LABEL: Record<IThinkLongTask['kind'], string> = {
  'long-email': '长邮件',
  dialogue: '对话',
  'no-chinese-source': '无中文源',
};

function MiniTrendChart({ chart }: { chart: NonNullable<IThinkLongTask['chart']> }) {
  const width = 320;
  const height = 120;
  const padding = 12;
  const max = Math.max(...chart.values);
  const min = Math.min(...chart.values);
  const span = Math.max(1, max - min);
  const points = chart.values.map((value, index) => {
    const x = padding + (index / Math.max(1, chart.values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / span) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');
  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">
        {chart.label}
      </p>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={chart.label} className="w-full">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="currentColor" opacity="0.2" />
        <polyline points={points} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {chart.values.map((value, index) => {
          const [x, y] = points.split(' ')[index].split(',').map(Number);
          return <circle key={`${value}-${index}`} cx={x} cy={y} r="3" fill="var(--brand)" />;
        })}
      </svg>
      <div className="flex justify-between text-[10px] font-bold text-muted-foreground">
        <span>W1</span>
        <span>W6</span>
      </div>
    </div>
  );
}

export interface LongTaskPracticeProps {
  tasks: IThinkLongTask[];
  onAnalyze: (task: IThinkLongTask, answer: string) => Promise<RealTaskJudgeResult | null>;
  onGenerate: () => Promise<GeneratedPracticeTask | null>;
  onExit: () => void;
}

export function LongTaskPractice({
  tasks,
  onAnalyze,
  onGenerate,
  onExit,
}: LongTaskPracticeProps) {
  const [answers, setAnswers] = useState<Record<string, string>>(loadDrafts);
  const [generated, setGenerated] = useState<IThinkLongTask[]>([]);
  const [activeId, setActiveId] = useState(tasks[0]?.id ?? '');
  const [result, setResult] = useState<RealTaskJudgeResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState('');
  const [manualUsed, setManualUsed] = useState<string[]>([]);

  const allTasks = useMemo(() => [...tasks, ...generated], [tasks, generated]);
  const task = allTasks.find((item) => item.id === activeId) ?? allTasks[0];
  const answer = task ? answers[task.id] ?? '' : '';
  const words = countWords(answer);
  const targets = task
    ? THINK_PATTERNS.filter((pattern) => task.targetPatternIds.includes(pattern.id))
    : [];

  useEffect(() => {
    const timer = window.setTimeout(() => saveDrafts(answers), 350);
    return () => window.clearTimeout(timer);
  }, [answers]);

  useEffect(() => {
    setResult(null);
    setManualUsed([]);
    setNotice('');
  }, [activeId]);

  if (!task) {
    return (
      <Card className="rounded-3xl border-border shadow-sm">
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm text-muted-foreground">长文任务还没准备好。</p>
          <Button variant="outline" className="rounded-full" onClick={onExit}>返回概览</Button>
        </CardContent>
      </Card>
    );
  }

  const analyze = async () => {
    const text = answer.trim();
    if (!text || analyzing) return;
    setAnalyzing(true);
    setNotice('');
    try {
      const judged = await onAnalyze(task, text);
      if (judged) {
        setResult(judged);
      } else {
        setResult(null);
        setNotice('AI 不可用，先按下面的目标模式自查；这次作答仍算练习。');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    setNotice('');
    try {
      const next = await onGenerate();
      if (!next) {
        setNotice('AI 暂时不能出题；先练上面三道内置题。');
        return;
      }
      const generatedTask: IThinkLongTask = {
        id: `ai-${Date.now().toString(36)}`,
        kind: 'long-email',
        title: next.title,
        prompt: next.prompt,
        minWords: 120,
        maxWords: 180,
        targetPatternIds: next.targetPatternIds,
      };
      setGenerated((prev) => [...prev, generatedTask]);
      setActiveId(generatedTask.id);
      setNotice('已生成一道新题（只用于练习，不进入掌握判定）。');
    } finally {
      setGenerating(false);
    }
  };

  const toggleManual = (id: string) => {
    setManualUsed((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
            Long Task
          </p>
          <h2 className="text-2xl font-black italic tracking-tight text-foreground">长文 · 对话</h2>
          <p className="text-sm font-medium text-muted-foreground mt-1">把几个模式连着用出来。</p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 rounded-full" onClick={onExit}>
          退出
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {allTasks.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveId(item.id)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] font-bold',
              item.id === activeId
                ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-ink-teal'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {item.title}
          </button>
        ))}
      </div>

      <Card className="rounded-3xl border-border shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              {task.title}
            </CardTitle>
            <Badge variant="outline">{KIND_LABEL[task.kind]}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm font-semibold text-foreground break-words">{task.prompt}</p>
          <div className="flex flex-wrap gap-1.5">
            {targets.map((pattern: IThinkPattern) => (
              <Badge key={pattern.id} variant="outline">{pattern.name}</Badge>
            ))}
          </div>
          {task.image && (
            <figure className="overflow-hidden rounded-2xl border border-border">
              <img
                src={task.image}
                alt={task.imageAlt ?? task.title}
                loading="lazy"
                className="w-full object-cover"
              />
            </figure>
          )}
          {task.chart && <MiniTrendChart chart={task.chart} />}

          <Textarea
            value={answer}
            onChange={(event) => setAnswers((prev) => ({ ...prev, [task.id]: event.target.value }))}
            placeholder="直接用英文写；先不用管完美，把关系说清楚。"
            className="min-h-[180px]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={cn(
              'text-[11px] font-bold',
              words === 0
                ? 'text-muted-foreground'
                : words < task.minWords
                  ? 'text-amber-700'
                  : words > task.maxWords
                    ? 'text-amber-700'
                    : 'text-emerald-600',
            )}>
              {words} 词 · 目标 {task.minWords}–{task.maxWords}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => { void generate(); }}
                disabled={generating}
              >
                {generating ? <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden /> : <Sparkles className="mr-1 size-3.5" aria-hidden />}
                AI 再出一道
              </Button>
              <Button
                className="rounded-full"
                onClick={() => { void analyze(); }}
                disabled={!answer.trim() || analyzing}
              >
                {analyzing ? <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden /> : null}
                分析这次作答
              </Button>
            </div>
          </div>
          {notice && <p className="text-xs text-amber-700 break-words">{notice}</p>}
        </CardContent>
      </Card>

      {result && (
        <Card className="rounded-3xl border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              这次用上的模式
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {targets.map((pattern) => {
                const used = result.patternsUsed.includes(pattern.id);
                return (
                  <Badge
                    key={pattern.id}
                    variant="outline"
                    className={used ? 'border-emerald-500/40 text-emerald-600' : 'border-amber-500/40 text-amber-700'}
                  >
                    {pattern.name} · {used ? '用上了' : '还缺'}
                  </Badge>
                );
              })}
            </div>
            <p className="text-sm text-foreground break-words whitespace-pre-wrap">{result.feedback}</p>
            {result.strengths.length > 0 && (
              <p className="text-xs text-emerald-700 break-words">做到：{result.strengths.join('；')}</p>
            )}
            {result.issues.length > 0 && (
              <p className="text-xs text-amber-700 break-words">可改：{result.issues.join('；')}</p>
            )}
          </CardContent>
        </Card>
      )}

      {!result && notice.includes('AI 不可用') && (
        <Card className="rounded-3xl border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              自查：这次用上了哪些模式
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {targets.map((pattern) => (
                <button
                  key={pattern.id}
                  type="button"
                  onClick={() => toggleManual(pattern.id)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] font-bold',
                    manualUsed.includes(pattern.id)
                      ? 'border-emerald-500/40 text-emerald-600'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {pattern.name} {manualUsed.includes(pattern.id) ? '✓' : ''}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              自评只用于回看，不写 SM-2；草稿按任务保存在本机。
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
