/**
 * QuickCardMode — 快速闪卡（纯单词自测）。
 *
 * 与复习检测（SM-2 五档评分）不同，这里只有两个选项：
 *   - 认识   → 直接下一张（可选轻微提示音）
 *   - 不认识 → 显示中文释义 + 音标 + 词性，再点「下一个」继续
 *
 * 卡片只显示单词（无插图/例句/选择题），适合快速过词、自测词汇量印象。
 * 认识/不认识 依然写入 SM-2 进度（5 / 1），与复习系统联动。
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useFramerMotion } from '@/lib/lazy-framer-motion';
import { Zap, Check, X, RefreshCw, ArrowRight, ArrowLeft, Volume2, Shuffle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { IWordEntry } from '@/data/wordbank/schema';
import { queryWords } from '@/data/wordbank';
import { useWordLearning } from '@/lib/use-word-learning';
import { useTTS } from '@/lib/use-tts';
import { useImmersive } from '@/lib/focus-mode';
import { useLearningStats } from '@/lib/use-learning-stats';
import { sfxTick, sfxComplete } from '@/lib/sfx';
import { safeStorage } from '@/lib/safe-storage';
import { cn } from '@/lib/utils';

const ROUND_SIZES = [10, 20, 50, 100] as const;
const ROUND_KEY = '__nativethink_quickcard_round';
const POS_KEY = '__nativethink_quickcard_pos';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function QuickCardMode({ level }: { level: string }) {
  const { LazyMotionDiv: MotionDiv, LazyAnimatePresence: AnimatePresence } = useFramerMotion();
  const { recordReview } = useWordLearning(level);
  const { addStudyMinutes } = useLearningStats();
  const tts = useTTS();

  const [roundSize, setRoundSize] = useState<number>(() => {
    try {
      const v = parseInt(safeStorage.getItem(ROUND_KEY) || '', 10);
      return (ROUND_SIZES as readonly number[]).includes(v) ? v : 20;
    } catch { return 20; }
  });
  // 每轮起始位置（继续上次进度用）
  const [pos, setPos] = useState<number>(() => {
    try {
      const saved = JSON.parse(safeStorage.getItem(POS_KEY) || '{}');
      return saved?.level === level ? (saved.pos || 0) : 0;
    } catch { return 0; }
  });
  const [queue, setQueue] = useState<IWordEntry[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [known, setKnown] = useState(0);
  const [unknown, setUnknown] = useState(0);
  const [done, setDone] = useState(false);

  const allWords = useMemo(() => queryWords({ level: level === 'all' ? undefined : level }), [level]);

  /** 构建一轮队列：从当前词书随机抽取 roundSize 个（不重复） */
  const buildQueue = useCallback(() => {
    if (allWords.length === 0) { setQueue([]); return; }
    const pool = allWords.length > roundSize * 3 ? shuffle(allWords).slice(0, roundSize) : shuffle(allWords);
    setQueue(pool);
    setIdx(0);
    setRevealed(false);
    setKnown(0);
    setUnknown(0);
    setDone(false);
  }, [allWords, roundSize]);

  // 词书/数量变化 → 重建队列
  useEffect(() => { buildQueue(); }, [buildQueue]);
  // 队列为空（数据懒加载完成后）→ 补建
  useEffect(() => {
    if (queue.length === 0 && allWords.length > 0) buildQueue();
  }, [allWords.length, queue.length, buildQueue]);

  const cw = queue[idx];
  const inSession = !!cw && !done;
  useImmersive(inSession);

  // 进度持久化
  useEffect(() => {
    try { safeStorage.setItem(POS_KEY, JSON.stringify({ level, pos })); } catch { /* ignore */ }
  }, [level, pos]);

  // 自动朗读当前单词（与其它模式一致）
  const lastSpokenRef = useRef('');
  useEffect(() => {
    if (!inSession || !cw) return;
    const key = `${idx}-${cw.word}`;
    if (lastSpokenRef.current === key) return;
    lastSpokenRef.current = key;
    try { tts.speak(cw.word, { rate: 0.9 }); } catch { /* ignore */ }
  }, [inSession, cw, idx, tts]);

  const next = useCallback(() => {
    setRevealed(false);
    if (idx + 1 >= queue.length) {
      setDone(true);
      sfxComplete();
    } else {
      setIdx((i) => i + 1);
      setPos((p) => p + 1);
    }
  }, [idx, queue.length]);

  const markKnown = useCallback(() => {
    if (!cw) return;
    recordReview(cw, 5);
    addStudyMinutes(0.15, 'vocabulary');
    setKnown((k) => k + 1);
    sfxTick();
    next();
  }, [cw, recordReview, addStudyMinutes, next]);

  const markUnknown = useCallback(() => {
    if (!cw || revealed) return;
    recordReview(cw, 1);
    addStudyMinutes(0.15, 'vocabulary');
    setUnknown((u) => u + 1);
    setRevealed(true);
  }, [cw, revealed, recordReview, addStudyMinutes]);

  // 键盘：1/← 不认识，2/→ 认识，空格 下一个
  useEffect(() => {
    if (!inSession) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') { setDone(false); setQueue([]); return; }
      if (revealed) {
        if (e.code === 'Space' || e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
        return;
      }
      if (e.key === '1' || e.key === 'ArrowLeft') { e.preventDefault(); markUnknown(); }
      else if (e.key === '2' || e.key === 'ArrowRight') { e.preventDefault(); markKnown(); }
      else if (e.code === 'Space') { e.preventDefault(); setRevealed(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inSession, revealed, markKnown, markUnknown, next]);

  const changeRoundSize = (n: number) => {
    setRoundSize(n);
    try { safeStorage.setItem(ROUND_KEY, String(n)); } catch { /* ignore */ }
  };

  // ── 完成页 ──
  if (done) {
    const total = known + unknown;
    const rate = total > 0 ? Math.round((known / total) * 100) : 0;
    return (
      <div className="space-y-4">
        <MotionDiv
          initial={{ scale: 0.94, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
          className="rounded-[32px] border-2 border-[#00B894]/20 bg-card shadow-sm p-8 text-center space-y-5"
        >
          <div className="text-5xl select-none">🎯</div>
          <div className="space-y-1">
            <p className="text-2xl font-black italic text-foreground">本轮完成！</p>
            <p className="text-xs font-bold text-muted-foreground">
              共 {total} 张 · 认识率 {rate}%
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-100 dark:border-emerald-500/20">
              <p className="text-xl font-black text-[#00B894]">{known}</p>
              <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">认识</p>
            </div>
            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-100 dark:border-amber-500/20">
              <p className="text-xl font-black text-amber-500">{unknown}</p>
              <p className="text-[9px] font-black uppercase tracking-wider text-amber-600">不认识</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setQueue([]); setDone(false); }} className="flex-1 rounded-2xl text-xs font-black">
              返回
            </Button>
            <Button onClick={buildQueue} className="flex-1 rounded-2xl bg-[#00B894] hover:bg-[#00a882] text-white text-xs font-black">
              <RefreshCw className="size-3.5 mr-1.5" />再来一组
            </Button>
          </div>
        </MotionDiv>
      </div>
    );
  }

  if (!cw) {
    return (
      <div className="text-center py-16 space-y-3">
        <Zap className="size-10 mx-auto text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">词书加载中…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 顶栏：返回 + 本轮设置 + 进度 */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost" size="icon"
          onClick={() => { setQueue([]); setDone(false); }}
          className="rounded-xl size-9 shrink-0 text-muted-foreground hover:text-[#00B894]"
          title="返回概览 (Esc)"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex items-center gap-1.5">
          <Zap className="size-4 text-[#00B894]" />
          <span className="text-xs font-black italic text-foreground">快速闪卡</span>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <Shuffle className="size-3 text-muted-foreground shrink-0" />
          {ROUND_SIZES.map((n) => (
            <button
              key={n}
              onClick={() => changeRoundSize(n)}
              className={cn(
                'px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all',
                roundSize === n ? 'bg-[#00B894] text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* 进度条 */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#00B894] to-emerald-400 rounded-full transition-all duration-300"
            style={{ width: `${((idx + (revealed ? 1 : 0)) / queue.length) * 100}%` }}
          />
        </div>
        <span className="text-xs font-black text-muted-foreground tabular-nums">{idx + 1}/{queue.length}</span>
        <span className="text-[10px] font-bold text-emerald-600 tabular-nums">✓{known}</span>
        <span className="text-[10px] font-bold text-amber-500 tabular-nums">✗{unknown}</span>
      </div>

      {/* 卡片：只有单词 */}
      <div className="flex justify-center">
        <AnimatePresence mode="wait">
          <MotionDiv
            key={cw.word + (revealed ? '-r' : '')}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-lg"
          >
            <Card className={cn(
              'rounded-[32px] border-2 shadow-lg transition-all min-h-[220px] flex flex-col justify-center',
              revealed ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10' : 'border-border bg-card',
            )}>
              <CardContent className="p-8 text-center space-y-3">
                <div className="flex items-center justify-center gap-2 max-w-full">
                  <h2 className={cn(
                    'font-black italic text-foreground tracking-tight break-words min-w-0',
                    cw.word.length > 14 ? 'text-3xl' : cw.word.length > 10 ? 'text-4xl' : 'text-5xl',
                  )}>{cw.word}</h2>
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => tts.speak(cw.word, { rate: 0.9 })}
                    className="rounded-2xl bg-muted text-muted-foreground hover:text-[#00B894] shrink-0"
                  >
                    <Volume2 className="size-4.5" />
                  </Button>
                </div>

                {revealed ? (
                  <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 pt-1">
                    <p className="text-sm font-bold text-[#6C5CE7]">
                      {cw.partOfSpeech}{cw.phonetic ? ` · ${cw.phonetic}` : ''}
                    </p>
                    <p className="text-xl font-black text-foreground">{cw.meaning}</p>
                  </MotionDiv>
                ) : (
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                    认识就直接下一张 · 不认识看释义
                  </p>
                )}
              </CardContent>
            </Card>
          </MotionDiv>
        </AnimatePresence>
      </div>

      {/* 两个选项 */}
      {!revealed ? (
        <div className="flex justify-center gap-3">
          <button
            onClick={markUnknown}
            className="flex-1 max-w-[160px] py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-sm shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <X className="size-4" />不认识 <span className="text-[9px] opacity-70">1</span>
          </button>
          <button
            onClick={markKnown}
            className="flex-1 max-w-[160px] py-4 rounded-2xl bg-[#00B894] hover:bg-[#00a882] text-white font-black text-sm shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Check className="size-4" />认识 <span className="text-[9px] opacity-70">2</span>
          </button>
        </div>
      ) : (
        <div className="flex justify-center">
          <Button
            onClick={next}
            className="bg-[#6C5CE7] hover:bg-[#5A4BD1] text-white px-10 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg gap-2"
          >
            下一个<ArrowRight className="size-4" />
          </Button>
        </div>
      )}

      <p className="text-center text-[9px] text-muted-foreground/60 font-bold">
        键盘：1 不认识 · 2 认识 · 空格 显示释义/下一个 · Esc 返回
      </p>
      <p className="text-center text-[9px] text-muted-foreground/50">
        <Badge variant="secondary" className="rounded-full px-2 py-0 text-[9px] font-bold bg-muted mr-1">
          认识/不认识会同步到复习进度
        </Badge>
      </p>
    </div>
  );
}
