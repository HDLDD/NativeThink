/**
 * ChunkFlashcards — 语块/短语闪卡（QuickCardMode 风格，接入语块 SM-2）。
 *
 * 与词汇模块的快速闪卡同构：正面只显示语块/短语，认识就过、不认识翻面看释义。
 * 作答接入 use-phrase-learning 的 SM-2（与语块复习 tab 共享进度）；
 * 答错的语块隔 RELEARN_GAP 张重新插回本轮（与复习检测/快速闪卡同参）。
 *
 * 范围：全部 / 语块库（按分类）/ 短语库（按字母）—— 数据同源，按分类筛选。
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useFramerMotion } from '@/lib/lazy-framer-motion';
import {
  Layers, Check, X, RefreshCw, ArrowLeft, Volume2, Shuffle,
  Target, History, ChevronLeft, Zap,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { IChunk } from '@/data/chunks';
import { usePhraseLearning } from '@/lib/use-phrase-learning';
import { useTTS } from '@/lib/use-tts';
import { useLearningStats } from '@/lib/use-learning-stats';
import { sfxTick, sfxComplete } from '@/lib/sfx';
import { cleanText, cn } from '@/lib/utils';
import { usePageMemory } from '@/lib/use-page-memory';

const ROUND_SIZES = [10, 20, 50] as const;
const ROUND_KEY = '__nativethink_chunk_card_round';
const BREAKPOINT_KEY = '__nativethink_chunk_card_session';
const RELEARN_GAP = 4;
const MAX_RELEARN = 2;
/** 自动发音键 —— 与词汇模块共用：一处关闭，处处安静 */
const AUTO_SPEAK_KEY = '__nativethink_vocab_autospeak';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function ChunkFlashcards({ allChunks }: { allChunks: IChunk[] }) {
  const { LazyMotionDiv: MotionDiv, LazyAnimatePresence: AnimatePresence } = useFramerMotion();
  const { recordReview } = usePhraseLearning(allChunks);
  const { addStudyMinutes } = useLearningStats();
  const tts = useTTS();

  const [roundSize, setRoundSize] = usePageMemory(ROUND_KEY, 20);
  const [queue, setQueue] = useState<IWordEntry[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const [paused, setPaused] = useState(false);
  const [relearnCounts, setRelearnCounts] = useState<Record<string, number>>({});
  const [knownCount, setKnownCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [autoSpeak, setAutoSpeak] = useState(() => {
    try { return localStorage.getItem(AUTO_SPEAK_KEY) !== '0'; } catch { return true; }
  });

  /** 队列 ref 镜像 —— 完成判定/答错重排用最新长度 */
  const queueRef = useRef<IChunk[]>([]);
  queueRef.current = queue;
  const lastSpokenRef = useRef('');
  const restoreRef = useRef<'pending' | 'done'>('pending');
  const savedSeqRef = useRef(-1);
  const [runSeq, setRunSeq] = useState(0);

  // IWordEntry alias（复用 IChunk）
  type IWordEntry = IChunk;

  const toggleAutoSpeak = () => {
    const next = !autoSpeak;
    setAutoSpeak(next);
    try { localStorage.setItem(AUTO_SPEAK_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    toast(next ? '已开启自动发音' : '已关闭自动发音', { duration: 1200 });
  };

  const categories = useMemo(() => {
    const set = new Set(allChunks.map((c) => c.category));
    return ['all', ...[...set]];
  }, [allChunks]);

  const pool = useMemo(
    () => categoryFilter === 'all' ? allChunks : allChunks.filter((c) => c.category === categoryFilter),
    [allChunks, categoryFilter],
  );

  const startRun = useCallback((entries: IChunk[]) => {
    const blanks = new Array(entries.length).fill(null);
    setQueue(entries);
    setIdx(0);
    setRevealed(false);
    setDone(false);
    lastSpokenRef.current = '';
    setRelearnCounts({});
    setKnownCount(0);
    setTotalCount(0);
    setRunSeq((s) => s + 1);
  }, []);

  const buildQueue = useCallback(() => {
    if (pool.length === 0) { setQueue([]); return; }
    const n = Math.min(roundSize || pool.length, pool.length);
    startRun(shuffle(pool).slice(0, n));
  }, [pool, roundSize, startRun]);

  // ── 断点续学 ──
  useEffect(() => {
    if (restoreRef.current !== 'pending') return;
    if (pool.length === 0) return;
    restoreRef.current = 'done';
    try {
      const raw = localStorage.getItem(BREAKPOINT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { order: string[]; index: number; cat: string };
      if (!Array.isArray(saved?.order) || saved.order.length === 0) return;
      const entries = saved.order
        .map((content) => pool.find((c) => c.content === content))
        .filter((c): c is IChunk => !!c);
      if (entries.length === 0) return;
      const idx = Math.max(0, Math.min(saved.index ?? 0, entries.length - 1));
      setQueue(entries);
      setIdx(idx);
      setCategoryFilter(saved.cat || 'all');
      setRunSeq((s) => s + 1);
      toast.success(`接着上次继续 — 还剩 ${entries.length - idx} 张`, { duration: 2000 });
    } catch { /* ignore */ }
  }, [pool]);

  // ── 断点保存 ──
  useEffect(() => {
    try {
      if (done || queue.length === 0) return;
      localStorage.setItem(BREAKPOINT_KEY, JSON.stringify({
        order: queue.map((c) => c.content),
        index: idx,
        cat: categoryFilter,
      }));
    } catch { /* ignore */ }
  }, [done, queue, idx, categoryFilter]);

  // ── 完成时清除断点 ──
  useEffect(() => {
    if (done) {
      try { localStorage.removeItem(BREAKPOINT_KEY); } catch { /* ignore */ }
    }
  }, [done]);

  const cw = queue[idx];
  const inSession = !!cw && !done;

  // ── 自动朗读 ──
  const ttsRef = useRef(tts);
  ttsRef.current = tts;
  useEffect(() => {
    if (!autoSpeak || !inSession || !cw) return;
    const key = `cc-${idx}-${cw.content}`;
    if (lastSpokenRef.current === key) return;
    lastSpokenRef.current = key;
    const timer = setTimeout(() => { try { ttsRef.current.speak(cw.content, { rate: 0.85 }); } catch { /* ignore */ } }, 400);
    return () => clearTimeout(timer);
  }, [autoSpeak, inSession, cw, idx]);

  const setResultAndAdvance = useCallback((known: boolean, quality: number) => {
    if (!cw) return;
    const isNew = knownCount + totalCount === 0 || totalCount === 0;
    recordReview(cw, quality);
    addStudyMinutes(0.2, 'chunks');
    setTotalCount((p) => p + 1);
    if (known) setKnownCount((p) => p + 1);
    if (!known) {
      const key = cw.content.toLowerCase();
      const used = relearnCounts[key] ?? 0;
      if (used < MAX_RELEARN && idx + 1 < queueRef.current.length) {
        setRelearnCounts((c) => ({ ...c, [key]: used + 1 }));
        setQueue((q) => {
          const at = Math.min(q.length, idx + 1 + RELEARN_GAP);
          const nextQ = [...q];
          nextQ.splice(at, 0, cw);
          return nextQ;
        });
        toast.info('答错的语块稍后会再出现一次', { duration: 1200 });
      }
    }
    setRevealed(false);
    if (idx + 1 >= queueRef.current.length) {
      setDone(true);
      sfxComplete();
    } else {
      setIdx((i) => i + 1);
    }
  }, [cw, idx, relearnCounts, recordReview, addStudyMinutes, knownCount, totalCount]);

  const handleKnown = useCallback(() => {
    if (!cw) return;
    sfxTick();
    setResultAndAdvance(true, 5);
  }, [cw, setResultAndAdvance]);

  const handleUnknown = useCallback(() => {
    if (!cw) return;
    setResultAndAdvance(false, 1);
  }, [cw, setResultAndAdvance]);

  const handleFuzzy = useCallback(() => {
    if (!cw) return;
    setResultAndAdvance(true, 3);
  }, [cw, setResultAndAdvance]);

  const prev = useCallback(() => {
    if (idx === 0) return;
    setIdx((i) => i - 1);
    setRevealed(true);
  }, [idx]);

  const exitRun = useCallback(() => {
    setPaused(true);
    setQueue([]);
    setDone(false);
  }, []);

  // ── 键盘 ──
  useEffect(() => {
    if (!inSession) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === 'Escape') { exitRun(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); prev(); return; }
      if (revealed) {
        if (e.code === 'Space' || e.key === 'ArrowRight') { e.preventDefault(); handleKnown(); }
        else if (e.key === '1') { e.preventDefault(); handleUnknown(); }
        else if (e.key === '2') { e.preventDefault(); handleFuzzy(); }
        return;
      }
      if (e.code === 'Space') { e.preventDefault(); setRevealed(true); }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [inSession, revealed, handleKnown, handleUnknown, handleFuzzy, prev, exitRun]);

  const changeRoundSize = (n: number) => {
    setRoundSize(n);
  };

  // ── 完成页 ──
  if (done) {
    const total = totalCount;
    const rate = total > 0 ? Math.round((knownCount / total) * 100) : 0;
    return (
      <div className="space-y-4">
        <MotionDiv
          initial={{ scale: 0.94, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
          className="rounded-[32px] border-2 border-[#00B894]/20 bg-card shadow-sm p-6 sm:p-8 space-y-5 text-center"
        >
          <Target className="size-12 text-muted-foreground/40 mx-auto" />
          <div className="space-y-1">
            <p className="text-2xl font-black italic text-foreground">本轮完成！</p>
            <p className="text-xs font-bold text-muted-foreground">
              共 {total} 张 · 认识率 {rate}% · 进度已同步到复习
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-100 dark:border-emerald-500/20">
              <p className="text-xl font-black text-ink-teal">{knownCount}</p>
              <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">认识</p>
            </div>
            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-100 dark:border-amber-500/20">
              <p className="text-xl font-black text-amber-500">{total - knownCount}</p>
              <p className="text-[9px] font-black uppercase tracking-wider text-amber-600">不认识</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={exitRun} className="flex-1 rounded-2xl text-xs font-black">
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

  // ── 起跑页 ──
  if (paused || !cw) {
    return (
      <div className="space-y-4">
        <div className="rounded-[32px] border-2 border-[#F59E0B]/20 bg-card shadow-sm p-8 text-center space-y-5">
          <Zap className="size-12 text-amber-500/60 mx-auto" />
          <div className="space-y-1">
            <p className="text-xl font-black italic text-foreground">语块闪卡</p>
            <p className="text-xs font-bold text-muted-foreground">
              只显示语块/短语，认识就过、不认识看释义 · 进度同步到复习
            </p>
          </div>
          {/* 分类筛选 */}
          <div className="flex items-center justify-center gap-1 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => { setCategoryFilter(cat); }}
                className={cn(
                  'px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all',
                  categoryFilter === cat ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                {cat === 'all' ? '全部' : cat}
              </button>
            ))}
          </div>
          {/* 每轮数量 */}
          <div className="flex items-center justify-center gap-1 flex-wrap">
            <Shuffle className="size-3 text-muted-foreground" />
            {ROUND_SIZES.map((n) => (
              <button
                key={n}
                onClick={() => changeRoundSize(n)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all',
                  roundSize === n ? 'bg-[#00B894] text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {queue.length > 0 && idx < queue.length && (
              <Button
                onClick={() => setPaused(false)}
                className="rounded-2xl bg-[#F59E0B] hover:bg-amber-600 text-white text-xs font-black px-6 py-4"
              >
                <History className="size-4 mr-1.5" />继续本轮（第 {idx + 1}/{queue.length} 张）
              </Button>
            )}
            <Button
              onClick={buildQueue}
              disabled={pool.length === 0}
              className={cn(
                'rounded-2xl text-white text-xs font-black px-8 py-4',
                queue.length > 0 && idx < queue.length ? 'bg-muted-foreground/40' : 'bg-[#F59E0B] hover:bg-amber-600',
              )}
            >
              <Zap className="size-4 mr-1.5" />
              {pool.length === 0 ? '加载中…' : queue.length > 0 && idx < queue.length ? '重新开一轮' : '开始闪卡'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── 卡片页 ──
  const example = cw.example;
  return (
    <div className="space-y-4">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost" size="icon"
          onClick={exitRun}
          className="rounded-xl size-9 shrink-0 text-muted-foreground hover:text-amber-600"
          title="返回概览 (Esc)"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex items-center gap-1.5">
          <Layers className="size-4 text-amber-500" />
          <span className="text-xs font-black italic text-foreground">语块闪卡</span>
        </div>
        <div className="flex items-center gap-1 ml-auto flex-wrap">
          <button
            onClick={toggleAutoSpeak}
            className={cn(
              'px-2 py-1 rounded-lg text-[10px] font-bold transition-all',
              autoSpeak ? 'bg-[#00B894]/10 text-ink-teal' : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
            title="自动发音"
          >
            自动发音{autoSpeak ? '·开' : '·关'}
          </button>
          <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[10px] font-bold bg-muted">
            {cw.category}
          </Badge>
        </div>
      </div>

      {/* 进度条 */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, (idx / queue.length) * 100)}%` }}
          />
        </div>
        <span className="text-xs font-black text-muted-foreground tabular-nums">{idx + 1}/{queue.length}</span>
        <span className="text-[10px] font-bold text-emerald-600 tabular-nums">✓{knownCount}</span>
        <span className="text-[10px] font-bold text-amber-500 tabular-nums">✗{totalCount - knownCount}</span>
      </div>

      {/* 卡片 */}
      <div className="flex justify-center">
        <AnimatePresence mode="wait">
          <MotionDiv
            key={cw.content + (revealed ? '-r' : '')}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-lg"
          >
            <Card
              onClick={() => { if (!revealed) setRevealed(true); }}
              className={cn(
                'rounded-[32px] border-2 shadow-lg transition-all min-h-[220px] flex flex-col justify-center',
                !revealed && 'cursor-pointer active:scale-[0.995]',
                revealed
                  ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10'
                  : 'border-border bg-card',
              )}
            >
              <CardContent className="p-8 text-center space-y-3">
                <div className="flex items-center justify-center gap-2 max-w-full">
                  <h2 className="text-3xl font-black italic text-foreground text-center min-w-0 max-w-full break-words">
                    {cw.content}
                  </h2>
                  <Button
                    variant="ghost" size="icon"
                    onClick={(e) => { e.stopPropagation(); try { tts.speak(cw.content, { rate: 0.85 }); } catch { /* ignore */ } }}
                    className="rounded-2xl bg-muted text-muted-foreground hover:text-amber-600 shrink-0"
                  >
                    <Volume2 className="size-4.5" />
                  </Button>
                </div>
                {revealed ? (
                  <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 pt-1">
                    <p className="text-xl font-black text-foreground">{cw.meaning}</p>
                    {cw.usage && <p className="text-xs text-muted-foreground font-medium">{cw.usage}</p>}
                    {example && (
                      <div
                        onClick={(e) => { e.stopPropagation(); try { tts.speak(cleanText(example), { rate: 0.85 }); } catch { /* ignore */ } }}
                        className="cursor-pointer rounded-2xl bg-white/60 dark:bg-foreground/10 border border-amber-100 p-3 space-y-1 text-left group/ex"
                      >
                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                          例句（点句子朗读）
                        </div>
                        <p className="text-sm text-foreground/85 italic font-medium group-hover/ex:text-amber-600 transition-colors">
                          {cleanText(example)}
                        </p>
                      </div>
                    )}
                  </MotionDiv>
                ) : (
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                    点卡片看释义 · 认识就直接下一张
                  </p>
                )}
              </CardContent>
            </Card>
          </MotionDiv>
        </AnimatePresence>
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-center gap-3">
        <button
          onClick={prev}
          disabled={idx === 0}
          className={cn(
            'shrink-0 px-4 py-4 rounded-2xl border-2 border-border text-muted-foreground font-black text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-1.5',
            idx === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:border-amber-400/40 hover:text-amber-600',
          )}
          title="上一个 (Backspace)"
        >
          <ChevronLeft className="size-4" />上一个
        </button>
        <button
          onClick={handleUnknown}
          className="flex-1 max-w-[150px] py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-sm shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <X className="size-4" />不认识 <span className="text-[9px] opacity-70">1</span>
        </button>
        <button
          onClick={handleFuzzy}
          className="flex-1 max-w-[130px] py-4 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-black text-sm shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          模糊 <span className="text-[9px] opacity-70">2</span>
        </button>
        <button
          onClick={handleKnown}
          className="flex-1 max-w-[150px] py-4 rounded-2xl bg-[#00B894] hover:bg-[#00a882] text-white font-black text-sm shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <Check className="size-4" />认识 <span className="text-[9px] opacity-70">→</span>
        </button>
      </div>

      <p className="text-center text-[9px] text-muted-foreground/60 font-bold">
        点卡片翻面 · 键盘：空格 翻面 · 1 不认识 · 2 模糊 · →/空格 认识 · Backspace 上一个 · Esc 返回
      </p>
      <p className="text-center text-[9px] text-muted-foreground/50">
        <Badge variant="secondary" className="rounded-full px-2 py-0 text-[9px] font-bold bg-muted mr-1">
          认识/不认识会同步到复习进度
        </Badge>
      </p>
    </div>
  );
}
