/**
 * VocabTestTab — 词汇量估算测试（基于当前词书采样，不额外加载词库）。
 *
 * 从词书的 4 个词频区间各抽 3 题（共 12 题）：看单词选中文释义。
 * 结果按答对率折算为词书词汇量估算，并持久化历史最佳。
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Target, RefreshCw, Volume2, Trophy, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTTS } from '@/lib/use-tts';
import { safeStorage } from '@/lib/safe-storage';
import { queryWords } from '@/data/wordbank';
import type { IWordEntry } from '@/data/wordbank/schema';
import { cn } from '@/lib/utils';

interface Props {
  level: string;
  levelLabel: string;
}

interface Question {
  word: IWordEntry;
  options: string[];
  answer: number;
}

const BUCKETS: [number, number][] = [
  [0, 1500],
  [1500, 3500],
  [3500, 7000],
  [7000, 999999],
];
const PER_BUCKET = 3;
const BEST_KEY = '__nativethink_vocab_test_best';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function truncate(s: string, n = 22): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export function VocabTestTab({ level, levelLabel }: Props) {
  const tts = useTTS();
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [best, setBest] = useState<{ correct: number; estimate: number } | null>(() => {
    try {
      const raw = safeStorage.getItem(BEST_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  /** Build 12 questions sampled across 4 frequency buckets of this wordbook */
  const buildQuestions = useCallback((): Question[] => {
    const qs: Question[] = [];
    for (const [min, max] of BUCKETS) {
      const pool = queryWords({ level: level === 'all' ? undefined : level, frequencyMin: min, frequencyMax: max })
        .filter((w) => w.meaning && w.meaning.length > 0);
      const picks = shuffle(pool).slice(0, PER_BUCKET);
      for (const w of picks) {
        // Distractors: meanings from other words in the same pool
        const distractors = shuffle(pool.filter((o) => o.word !== w.word))
          .slice(0, 3)
          .map((o) => truncate(o.meaning));
        if (distractors.length < 3) continue;
        const answer = Math.floor(Math.random() * 4);
        const options = [...distractors];
        options.splice(answer, 0, truncate(w.meaning));
        qs.push({ word: w, options, answer });
      }
    }
    return shuffle(qs);
  }, [level]);

  const start = useCallback(() => {
    const qs = buildQuestions();
    if (qs.length < 4) return;
    setQuestions(qs);
    setQIdx(0);
    setPicked(null);
    setCorrectCount(0);
    setPhase('running');
  }, [buildQuestions]);

  const current = questions[qIdx];

  // Auto-speak the word when a new question shows
  useEffect(() => {
    if (phase === 'running' && current) {
      try { tts.speak(current.word.word, { rate: 0.85 }); } catch { /* ignore */ }
    }
  }, [qIdx, phase]);

  const finish = useCallback((correct: number) => {
    const estimate = Math.round(600 + (correct / questions.length) * 14000);
    setCorrectCount(correct);
    setPhase('done');
    setBest((prev) => {
      if (prev && prev.estimate >= estimate) return prev;
      const next = { correct, estimate };
      try { safeStorage.setItem(BEST_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [questions.length]);

  const pick = (idx: number) => {
    if (picked !== null) return;
    setPicked(idx);
    const isCorrect = idx === current.answer;
    const nextCorrect = correctCount + (isCorrect ? 1 : 0);
    if (isCorrect) setCorrectCount(nextCorrect);
    setTimeout(() => {
      if (qIdx + 1 >= questions.length) finish(nextCorrect);
      else { setQIdx((i) => i + 1); setPicked(null); }
    }, 850);
  };

  const grade = (est: number) => {
    if (est < 2500) return { label: '入门阶段', desc: '打好高频词基础，配合每日学习稳步提升' };
    if (est < 5000) return { label: '进阶阶段', desc: '核心词汇已有底子，继续扩大阅读量' };
    if (est < 8000) return { label: '流利阶段', desc: '可以啃原版材料了，重点补低频词' };
    return { label: '大神阶段', desc: '词汇量已经非常可观，保持阅读习惯！' };
  };

  // ── Idle ──
  if (phase === 'idle') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="rounded-[32px] border-border shadow-sm overflow-hidden">
          <CardContent className="p-8 sm:p-12 text-center space-y-5">
            <div className="size-20 rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10 flex items-center justify-center mx-auto">
              <Target className="size-10 text-amber-500" />
            </div>
            <div>
              <h2 className="text-2xl font-black italic text-foreground mb-2">词汇量测试</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                从 <span className="font-black text-foreground">《{levelLabel}》</span>词书按词频分层抽取 12 题<br />
                看单词选释义，约 1 分钟估算你的词汇量
              </p>
            </div>
            {best && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-50 dark:bg-amber-500/10">
                <Trophy className="size-4 text-amber-500" />
                <span className="text-xs font-black text-foreground">历史最佳：约 {best.estimate.toLocaleString()} 词</span>
              </div>
            )}
            <div>
              <Button
                onClick={start}
                className="rounded-2xl bg-[#00B894] hover:bg-[#00a882] text-white font-black gap-2 px-10"
              >
                <Target className="size-4" />开始测试
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/60">测试结果仅基于当前词书采样，供参考</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Running ──
  if (phase === 'running' && current) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Progress */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-[#00B894] transition-all duration-300"
              style={{ width: `${((qIdx + (picked !== null ? 1 : 0)) / questions.length) * 100}%` }}
            />
          </div>
          <span className="text-xs font-black text-muted-foreground tabular-nums shrink-0">{qIdx + 1}/{questions.length}</span>
        </div>

        <Card className="rounded-[32px] border-border shadow-sm">
          <CardContent className="p-8 space-y-6">
            <div className="flex items-center justify-center gap-3">
              <h2 className="text-4xl font-black italic text-foreground text-center">{current.word.word}</h2>
              <Button
                variant="ghost" size="icon"
                onClick={() => { try { tts.speak(current.word.word, { rate: 0.85 }); } catch { /* ignore */ } }}
                className="rounded-xl text-muted-foreground hover:text-[#00B894]"
              >
                <Volume2 className="size-5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">{current.word.phonetic} · {current.word.partOfSpeech}</p>

            <div className="grid gap-2.5">
              {current.options.map((opt, idx) => {
                const isAnswer = idx === current.answer;
                const isPicked = picked === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => pick(idx)}
                    disabled={picked !== null}
                    className={cn(
                      'w-full text-left px-4 py-3 rounded-2xl border-2 text-sm font-medium transition-all',
                      picked === null && 'border-border hover:border-[#00B894]/50 hover:bg-[#00B894]/5',
                      picked !== null && isAnswer && 'border-[#00B894] bg-[#00B894]/10',
                      picked !== null && isPicked && !isAnswer && 'border-rose-400 bg-rose-50 dark:bg-rose-500/10',
                      picked !== null && !isAnswer && !isPicked && 'border-border opacity-50',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {picked !== null && isAnswer && <CheckCircle2 className="size-4 text-[#00B894] shrink-0" />}
                      {picked !== null && isPicked && !isAnswer && <XCircle className="size-4 text-rose-500 shrink-0" />}
                      {opt}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Done ──
  const est = Math.round(600 + (correctCount / Math.max(questions.length, 1)) * 14000);
  const g = grade(est);
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card className="rounded-[32px] border-border shadow-sm overflow-hidden">
        <CardContent className="p-8 sm:p-12 text-center space-y-5">
          <Trophy className="size-12 text-amber-500 mx-auto" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">估算词汇量</p>
            <p className="text-5xl font-black text-[#00B894] tabular-nums">≈ {est.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-2">答对 {correctCount}/{questions.length} · 基于《{levelLabel}》词书</p>
          </div>
          <div className="rounded-2xl bg-muted/50 p-4">
            <p className="text-sm font-black text-foreground mb-1">{g.label}</p>
            <p className="text-xs text-muted-foreground">{g.desc}</p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={start} className="rounded-2xl bg-[#00B894] hover:bg-[#00a882] text-white font-bold gap-2">
              <RefreshCw className="size-4" />再测一次
            </Button>
            {best && best.estimate >= est && (
              <span className="text-xs font-bold text-muted-foreground">历史最佳 ≈ {best.estimate.toLocaleString()}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
