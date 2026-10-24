/**
 * 改写快练：把“中文默认英文”改写成更自然的版本。
 *
 * 10 题一组，题目由识别题派生（非最佳选项 → 最佳选项）。
 * 不写 SM-2、不调 AI：用户改写后看参考，自评“改对了/还差一点”，保持快节奏。
 */
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  THINK_PATTERN_LAYERS,
  type IThinkPattern,
  type IThinkPatternRewrite,
} from '@/data/think-patterns';

const GROUP_SIZE = 10;

type Stage = 'intro' | 'drill' | 'done';

export interface PatternRewriteDrillProps {
  patterns: IThinkPattern[];
  items: IThinkPatternRewrite[];
  onExit: () => void;
}

export function PatternRewriteDrill({ patterns, items, onExit }: PatternRewriteDrillProps) {
  const [stage, setStage] = useState<Stage>('intro');
  const [offset, setOffset] = useState(0);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  const group = useMemo(() => items.slice(offset, offset + GROUP_SIZE), [items, offset]);
  const item = group[index];
  const pattern = item ? patterns.find((candidate) => candidate.id === item.patternId) : undefined;
  const layer = pattern ? THINK_PATTERN_LAYERS.find((candidate) => candidate.id === pattern.layer) : undefined;

  const startGroup = (nextOffset: number) => {
    setOffset(nextOffset);
    setIndex(0);
    setAnswer('');
    setRevealed(false);
    setCorrectCount(0);
    setStage('drill');
  };

  const nextItem = () => {
    if (index + 1 >= group.length) {
      setStage('done');
      return;
    }
    setIndex((prev) => prev + 1);
    setAnswer('');
    setRevealed(false);
  };

  if (items.length === 0) {
    return (
      <Card className="rounded-3xl border-border shadow-sm">
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm font-medium text-muted-foreground">改写题还没准备好，先返回概览。</p>
          <Button variant="outline" className="rounded-full" onClick={onExit}>返回概览</Button>
        </CardContent>
      </Card>
    );
  }

  if (stage === 'intro') {
    return (
      <Card className="rounded-3xl border-border shadow-sm">
        <CardHeader className="pb-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            Rewrite Drill
          </p>
          <CardTitle className="text-2xl font-black italic tracking-tight">改写快练</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground break-words">
            10 题一组：给你一句可以更直接的英文，把它改写成更自然的版本。不记 SM-2，做完看参考自评。
          </p>
          <div className="rounded-2xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            共 {items.length} 题，覆盖 12 个模式；每组不重复，做完可以换一组。
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button className="rounded-full sm:flex-1" onClick={() => startGroup(0)}>开始快练</Button>
            <Button variant="outline" className="rounded-full sm:flex-1" onClick={onExit}>返回概览</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (stage === 'done') {
    return (
      <Card className="rounded-3xl border-border shadow-sm">
        <CardHeader className="pb-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            Rewrite Drill
          </p>
          <CardTitle className="text-2xl font-black italic tracking-tight">本组完成</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border bg-muted/25 p-4">
            <p className="text-sm font-black text-foreground">改对 {correctCount} / {group.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              自评只记录本组；改写快练不写 SM-2，也不影响模式排期。
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              className="rounded-full sm:flex-1"
              onClick={() => startGroup((offset + GROUP_SIZE) % items.length)}
            >
              再来一组
            </Button>
            <Button variant="outline" className="rounded-full sm:flex-1" onClick={onExit}>
              返回概览
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!item) {
    return (
      <Card className="rounded-3xl border-border shadow-sm">
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm font-medium text-muted-foreground">这组题目不完整，先返回概览。</p>
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
            Rewrite Drill · {index + 1} / {group.length}
          </p>
          <h2 className="text-2xl font-black italic tracking-tight text-foreground">改写快练</h2>
          <p className="text-sm font-medium text-muted-foreground mt-1">把原句改成更直接、更自然的版本。</p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 rounded-full" onClick={onExit}>
          退出
        </Button>
      </div>

      <Card className="rounded-3xl border-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              第 {index + 1} 题
            </CardTitle>
            <Badge variant="outline">{pattern?.name ?? item.patternId}</Badge>
            <Badge variant="outline" className="text-muted-foreground">{layer?.name ?? '模式'}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm font-semibold text-foreground break-words">{item.prompt}</p>
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
              原句（可以更直接）
            </p>
            <p className="text-sm text-foreground break-words">{item.source}</p>
          </div>
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={revealed}
            rows={3}
            placeholder="把它改写成更自然的英文……"
            aria-label="改写后的英文"
            className="min-h-24 resize-y"
          />
          {!revealed ? (
            <Button
              className="w-full sm:w-auto rounded-full"
              disabled={!answer.trim()}
              onClick={() => setRevealed(true)}
            >
              查看参考
            </Button>
          ) : (
            <>
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                  参考改写
                </p>
                <p className="text-sm font-semibold text-ink-teal break-words">{item.target}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                  为什么这样更自然
                </p>
                <p className="text-sm text-foreground/80 break-words">{item.explanation}</p>
              </div>
              <p className="text-xs text-muted-foreground">对照参考，你这次改对了吗？</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  className="rounded-full sm:flex-1"
                  onClick={() => {
                    setCorrectCount((prev) => prev + 1);
                    nextItem();
                  }}
                >
                  改对了
                </Button>
                <Button variant="outline" className="rounded-full sm:flex-1" onClick={nextItem}>
                  还差一点
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
