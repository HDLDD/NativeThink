import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useFramerMotion } from '@/lib/lazy-framer-motion';
import {
  RotateCw, Volume2, Sparkles, XCircle, ArrowLeft, ChevronDown, ChevronUp,
  Link2, BookOpen, Gauge,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { IWordEntry } from '@/data/wordbank/schema';
import { findWord, getWordCounts, preloadDetail } from '@/data/wordbank';
import { useWordLearning } from '@/lib/use-word-learning';
import { useLearningStats } from '@/lib/use-learning-stats';
import { useImmersive } from '@/lib/focus-mode';
import { FitWord } from '@/components/FitWord';
import { safeStorage } from '@/lib/safe-storage';
import { cn, cleanText } from '@/lib/utils';
import { toast } from 'sonner';
import { useTTS } from '@/lib/use-tts';
import { sfxComplete } from '@/lib/sfx';
import { decideSwipe, SWIPE_THRESHOLD, SWIPE_QUALITY_UNKNOWN, SWIPE_QUALITY_KNOWN } from '@/lib/vocab-swipe';

const FL_LEVEL_COLORS: Record<string, string> = {
  all: '#00B894', zhongkao: '#EF4444', gaokao: '#F97316', cet4: '#0EA5E9', cet6: '#6C5CE7', ielts: '#F59E0B', toefl: '#EC4899', postgraduate: '#8B5CF6', professional: '#14B8A6', advanced: '#64748B',
};

/** 自动发音开关（持久化；此前 autoSpeak 恒为 false，预合成/自动朗读整段是死代码） */
const AUTO_SPEAK_KEY = '__nativethink_vocab_autospeak';

interface LevelInfo { key: string; label: string; }

/** 背面信息分区标题（模仿主流背单词 App 的信息层次） */
function SectionTitle({ icon: Icon, children }: { icon?: typeof BookOpen; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">
      {Icon && <Icon className="size-3" />}{children}
    </p>
  );
}

export default function FlashcardMode({ level, onLevelChange, levels, counts }: { level?: string; onLevelChange?: (key: string) => void; levels?: LevelInfo[]; counts?: Record<string, number> }) {
  const { LazyMotionDiv: MotionDiv, LazyAnimatePresence: AnimatePresence } = useFramerMotion();
  const currentLevel = level || 'all';
  const { addStudyMinutes } = useLearningStats();
  const { state, dueForReview, getNewWords, recordReview } = useWordLearning(currentLevel);
  const tts = useTTS();

  const [currentIdx, setIdx] = useState(0);
  const [isFlipped, setFlipped] = useState(false);
  const [dir, setDir] = useState(0);
  const [autoSpeak, setAutoSpeak] = useState(() => {
    try { return safeStorage.getItem(AUTO_SPEAK_KEY) === '1'; } catch { return false; }
  });
  const [sessionReviewCount, setSessionReviewCount] = useState(0);
  const [rated, setRated] = useState(false);
  // 本轮统计：已评分张数 / 其中记得的（quality>=3）—— 用于顶部进度条与正确率
  const [sessionRated, setSessionRated] = useState(0);
  const [sessionGood, setSessionGood] = useState(0);
  const [showDeep, setShowDeep] = useState(false);
  // 滑动位移（跟随手指）；>0 右滑=认识，<0 左滑=不认识
  const [dragX, setDragX] = useState(0);
  const dragStart = useRef<number | null>(null);
  const [detailTick, setDetailTick] = useState(0);

  const toggleAutoSpeak = useCallback(() => {
    setAutoSpeak((v) => {
      const next = !v;
      try { safeStorage.setItem(AUTO_SPEAK_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      toast(next ? '已开启自动发音' : '已关闭自动发音', { duration: 1200 });
      return next;
    });
  }, []);

  const allCounts = useMemo(() => getWordCounts(), []);
  const totalForLevel = currentLevel === 'all'
    ? Object.values(allCounts).reduce((a, b) => a + b, 0)
    : (allCounts[currentLevel] || 0);

  // ── 错词重练队列 ──
  const [wrongDrill, setWrongDrill] = useState(false);
  const [started, setStarted] = useState(false); // 概览 vs 学习中
  const wrongEntries = useMemo(() => {
    const out: IWordEntry[] = [];
    for (const [key, p] of Object.entries(state.progress)) {
      if ((p.wrongCount || 0) > 0) {
        const w = findWord(key);
        if (w) out.push(w);
      }
    }
    // 随机排序，避免每次重练顺序相同
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }, [state.progress]);

  const queue = useMemo(() => {
    const seen = new Set<string>();
    if (wrongDrill) return wrongEntries;
    const dueWords: IWordEntry[] = [];
    for (const p of dueForReview) {
      const w = findWord(p.wordKey);
      if (w && !seen.has(w.word.toLowerCase())) {
        seen.add(w.word.toLowerCase());
        dueWords.push(w);
      }
    }
    // 复习减负：到期堆积过多时本轮只取前 30 个，避免心理压力
    const MAX_DUE = 30;
    const cappedDue = dueWords.slice(0, MAX_DUE);
    const otherWords: IWordEntry[] = [];
    for (const key of Object.keys(state.progress)) {
      if (!seen.has(key)) {
        const w = findWord(key);
        if (w) { seen.add(key); otherWords.push(w); }
      }
    }
    // Only add new words if there are no due or learning words
    // This prevents random word switching when user hasn't learned anything yet
    if (dueWords.length === 0 && otherWords.length === 0) {
      return []; // Return empty queue - show "no words to review" message
    }
    // Otherwise, fill with new words to reach 20 cards
    const fillCount = Math.max(0, 20 - cappedDue.length - otherWords.length);
    const newWords = fillCount > 0 ? getNewWords(fillCount).filter((w) => !seen.has(w.word.toLowerCase())) : [];
    return [...cappedDue, ...otherWords, ...newWords];
  }, [wrongDrill, wrongEntries, dueForReview, state.progress, getNewWords]);

  // 到期堆积提示（只在本轮挂载时提示一次）
  const dueOverCap = dueForReview.length > 30;
  useEffect(() => {
    if (dueOverCap) toast.info(`到期复习 ${dueForReview.length} 个 — 本轮先复习 30 个，别有压力`, { duration: 4000 });
  }, []);

  const ttsRef = useRef(tts);
  ttsRef.current = tts;
  const lastSpokenKey = useRef('');
  // 会话预热：进入队列时预合成前 3 个词，首词朗读零等待
  useEffect(() => {
    if (!autoSpeak) return;
    queue.slice(0, 5).forEach((w, i) => {
      setTimeout(() => ttsRef.current.prewarm(w.word, { rate: 0.85 }), 120 * i);
    });
  }, [queue, autoSpeak]);
  useEffect(() => {
    if (!autoSpeak) return;
    const word = queue[currentIdx];
    if (!word) return;
    const side = isFlipped ? 'back' : 'front';
    const key = `${currentIdx}-${side}`;
    if (lastSpokenKey.current === key) return;
    lastSpokenKey.current = key;
    if (!isFlipped) {
      ttsRef.current.speak(word.word, { rate: 0.85 });
      const next = queue[currentIdx + 1];
      if (next) ttsRef.current.prewarm(next.word, { rate: 0.85 });
    } else if (word.examples[0]) {
      const timer = setTimeout(() => { ttsRef.current.speak(cleanText(word.examples[0].en), { rate: 0.85 }); }, 400);
      return () => clearTimeout(timer);
    }
  }, [autoSpeak, currentIdx, isFlipped, queue]);

  useEffect(() => {
    setIdx(0); setFlipped(false); setDir(0); setRated(false); setShowDeep(false);
  }, [currentLevel]);

  const cw = queue[currentIdx];
  useImmersive(started && !!cw);

  /**
   * 展示用的词条：detail（搭配/例句/深度解释）是**懒加载并按原对象就地补齐**的
   * （见 wordbank.applyDetail），所以 detail 到位后重新 findWord 就能拿到完整内容。
   */
  const shown = useMemo(() => (cw ? (findWord(cw.word) ?? cw) : cw), [cw, detailTick]);

  // 进入一张卡时确保该词的等级 detail 已加载 —— 否则背面只有释义，没有搭配/例句
  useEffect(() => {
    if (!started || !cw) return;
    let alive = true;
    Promise.resolve(preloadDetail([cw.level])).then(() => { if (alive) setDetailTick((t) => t + 1); }).catch(() => { /* 降级：只显示核心字段 */ });
    return () => { alive = false; };
  }, [started, cw?.word, cw?.level]);

  // 专注模式下 ESC 退出到概览
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
        setStarted(false); setWrongDrill(false); setIdx(0); setFlipped(false); setRated(false); setShowDeep(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started]);

  const stats = useMemo(() => {
    let mastered = 0, learning = 0;
    for (const p of Object.values(state.progress)) {
      if (p.status === 'mastered') mastered++;
      else if (p.status === 'reviewing' || p.status === 'learning') learning++;
    }
    const unstarted = Math.max(0, totalForLevel - Object.keys(state.progress).length);
    return { mastered, learning, new: unstarted, total: totalForLevel, due: dueForReview.length };
  }, [state.progress, totalForLevel, dueForReview.length]);

  const flip = useCallback(() => { setFlipped((f) => { if (!f) addStudyMinutes(0.2, 'vocabulary'); return !f; }); }, [addStudyMinutes]);

  const markWithQuality = useCallback((quality: number) => {
    if (!cw || rated) return;
    recordReview(cw, quality);
    setSessionReviewCount((p) => p + 1);
    setSessionRated((p) => p + 1);
    if (quality >= 3) setSessionGood((p) => p + 1);
    setRated(true);
    const labels = ['完全忘了', '有点印象', '基本记得', '比较熟悉', '完全掌握'];
    toast(labels[quality] || '已记录', { duration: 800 });
  }, [cw, rated, recordReview]);

  const advance = useCallback((direction = 1) => {
    setDir(direction); setFlipped(false); setRated(false); setShowDeep(false);
    setTimeout(() => setIdx((p) => {
      const next = (p + 1) % queue.length;
      // 走完最后一循环回第一张 = 完成一整轮，给个里程碑反馈
      if (next === 0 && p === queue.length - 1) {
        sfxComplete();
        toast.success(`🎉 完成一整轮 ${queue.length} 张卡片 · 累计评分 ${sessionReviewCount + 1} 次，巩固完成`, { duration: 4000 });
      }
      return next;
    }), 150);
  }, [queue.length, sessionReviewCount]);

  // ── 全键盘操作：空格翻面/默认好评，1-5 评分，→ 下一个，S 开关自动发音 ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || !cw) return;
      if (!started) { if (e.code === 'Space') { e.preventDefault(); setStarted(true); } return; }
      if (e.code === 'Space') {
        e.preventDefault();
        if (!isFlipped) flip();
        else if (rated) advance();
        else markWithQuality(4);
      } else if (isFlipped && !rated && ['1', '2', '3', '4', '5'].includes(e.key)) {
        markWithQuality([0, 2, 3, 4, 5][parseInt(e.key, 10) - 1]);
      } else if (e.key === 'ArrowRight' && rated) {
        advance();
      } else if (e.key.toLowerCase() === 's' && !isFlipped) {
        toggleAutoSpeak();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cw, isFlipped, rated, started, flip, advance, markWithQuality, toggleAutoSpeak]);

  // ── 滑动手势：未翻面→翻面；已翻面未评分→左滑不认识 / 右滑认识；已评分→切换下一张 ──
  const onTouchStart = (e: React.TouchEvent) => { dragStart.current = e.touches[0].clientX; };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStart.current == null) return;
    setDragX(e.touches[0].clientX - dragStart.current);
  };
  const onTouchEnd = () => {
    const dx = dragX;
    dragStart.current = null;
    setDragX(0);
    const action = decideSwipe({ dx, isFlipped, rated });
    if (action === 'none') return;
    if (action === 'flip') { flip(); return; }
    if (action === 'next') { advance(dx < 0 ? -1 : 1); return; }
    if (action === 'prev') { advance(-1); return; }
    markWithQuality(action === 'rate-unknown' ? SWIPE_QUALITY_UNKNOWN : SWIPE_QUALITY_KNOWN);
  };

  if (!cw) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-xl bg-[#6C5CE7]/10 flex items-center justify-center text-ink-violet">
            <RotateCw className="size-4" />
          </div>
          <h2 className="text-sm font-black italic text-foreground">复习检测</h2>
        </div>
        <div className="text-center py-16 space-y-4">
          <div className="size-16 rounded-full bg-[#6C5CE7]/10 flex items-center justify-center mx-auto">
            <RotateCw className="size-8 text-ink-violet" />
          </div>
          <p className="text-muted-foreground text-sm font-medium">
            {stats.due > 0
              ? `还有 ${stats.due} 个单词待复习，开始巩固记忆吧！`
              : stats.learning > 0
                ? `有 ${stats.learning} 个单词正在学习中，继续加油！`
                : '当前没有已学习的单词，请先到「每日学习」模式学习新单词后再来复习。'}
          </p>
          {stats.due === 0 && stats.learning === 0 && (
            <p className="text-xs text-muted-foreground/70 mt-2">
              复习模式需要先有已学习的单词才能使用
            </p>
          )}
        </div>
      </div>
    );
  }
  // ── 概览：标题 + 统计 + 开始按钮（进入学习后隐藏，<- 返回） ──
  if (!started) {
    const masteredPct = stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;
    const learningPct = stats.total > 0 ? Math.round((stats.learning / stats.total) * 100) : 0;
    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-[#6C5CE7]/10 flex items-center justify-center text-ink-violet">
              <RotateCw className="size-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-black italic text-foreground">复习检测</h2>
              <p className="text-[9px] font-bold text-muted-foreground">SM-2 间隔记忆 · 巩固已学单词</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm" onClick={toggleAutoSpeak}
              className={cn('rounded-xl text-[10px] font-black uppercase tracking-wider gap-1.5',
                autoSpeak ? 'border-[#6C5CE7]/40 text-ink-violet bg-[#6C5CE7]/5' : 'border-border text-muted-foreground')}
              title="自动发音（快捷键 S）"
            >
              <Volume2 className="size-3.5" />自动发音{autoSpeak ? '·开' : '·关'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setWrongDrill(true); setStarted(true); setIdx(0); setFlipped(false); setRated(false); }}
              disabled={wrongEntries.length === 0}
              className="rounded-xl text-[10px] font-black uppercase tracking-wider gap-1.5 border-border hover:border-rose-300 hover:text-rose-500"
            >
              <XCircle className="size-3.5" />
              错词重练 ({wrongEntries.length})
            </Button>
          </div>
        </div>

        {/* SM-2 Stats */}
        <div className="grid grid-cols-4 gap-2">
          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-100 text-center">
            <p className="text-lg font-black text-rose-500">{stats.due}</p>
            <p className="text-[8px] font-black uppercase tracking-wider text-rose-600">待复习</p>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-100 text-center">
            <p className="text-lg font-black text-ink-teal">{stats.mastered}</p>
            <p className="text-[8px] font-black uppercase tracking-wider text-emerald-600">已掌握</p>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-100 text-center">
            <p className="text-lg font-black text-amber-500">{stats.learning}</p>
            <p className="text-[8px] font-black uppercase tracking-wider text-amber-600">学习中</p>
          </div>
          <div className="p-2.5 rounded-xl bg-[#6C5CE7]/5 border border-[#6C5CE7]/10 text-center">
            <p className="text-lg font-black text-ink-violet">{sessionReviewCount}</p>
            <p className="text-[8px] font-black uppercase tracking-wider text-ink-violet/70">本次复习</p>
          </div>
        </div>

        {/* 词书掌握度分布 —— 主流背单词 App 的"今日任务"式总览 */}
        <div className="rounded-2xl border border-border/60 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
            <span className="text-muted-foreground flex items-center gap-1"><Gauge className="size-3" />词书掌握度</span>
            <span className="text-ink-teal tabular-nums">{masteredPct}%</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden bg-muted flex">
            <div className="h-full bg-[#00B894] transition-all" style={{ width: `${masteredPct}%` }} />
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${learningPct}%` }} />
          </div>
          <div className="flex items-center gap-3 text-[9px] font-bold text-muted-foreground">
            <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-[#00B894] inline-block" />已掌握 {stats.mastered}</span>
            <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-amber-400 inline-block" />学习中 {stats.learning}</span>
            <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-muted-foreground/30 inline-block" />未学 {stats.new}</span>
            <span className="ml-auto">共 {stats.total.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex justify-center pt-2">
          <Button
            onClick={() => { setSessionRated(0); setSessionGood(0); setStarted(true); }}
            disabled={queue.length === 0}
            className="bg-[#6C5CE7] hover:bg-[#5A4BD1] text-white px-10 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-violet-200/50 gap-2"
          >
            <RotateCw className="size-4" />开始复习（{queue.length} 张卡片）
          </Button>
        </div>
      </div>
  );
  }
  const accuracy = sessionRated > 0 ? Math.round((sessionGood / sessionRated) * 100) : 0;
  const progressPct = queue.length > 0 ? Math.round((sessionRated / queue.length) * 100) : 0;
  const swipeHint = Math.abs(dragX) < SWIPE_THRESHOLD ? null : (dragX < 0 ? 'left' : 'right');
  return (
    <div className="space-y-4">
        {/* 学习中头部：返回 + 本轮进度条 + 正确率 */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { setStarted(false); setWrongDrill(false); setIdx(0); setFlipped(false); setRated(false); setShowDeep(false); }}
            className="rounded-xl size-9 shrink-0 text-muted-foreground hover:text-ink-violet"
            title="返回概览"
          >
            <ArrowLeft className="size-5" />
          </Button>
          {wrongDrill && (
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-[10px] font-black bg-rose-500/10 text-rose-500 border-0">
              错词重练中
            </Badge>
          )}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-[#6C5CE7] transition-all duration-300" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
              <span className="tabular-nums">{currentIdx + 1}/{queue.length}</span>
              <span className="tabular-nums">已评 {sessionRated}</span>
              {sessionRated > 0 && <span className={cn('tabular-nums', accuracy >= 70 ? 'text-emerald-600' : 'text-amber-600')}>记得 {accuracy}%</span>}
            </div>
          </div>
          <Button
            variant="ghost" size="icon" onClick={toggleAutoSpeak}
            className={cn('rounded-xl size-9 shrink-0', autoSpeak ? 'text-ink-violet' : 'text-muted-foreground/60')}
            title={`自动发音${autoSpeak ? '（已开）' : '（已关）'} · 快捷键 S`}
          >
            <Volume2 className="size-4.5" />
          </Button>
        </div>
      {/* Flashcard */}
      <div className="flex justify-center">
        <AnimatePresence mode="wait">
          <MotionDiv key={shown?.word + (isFlipped ? '-back' : '-front')}
            initial={{ opacity: 0, x: dir * 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 100 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="w-full max-w-sm"
          >
            <div
              className="relative touch-pan-y"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              style={{ transform: `translateX(${dragX}px) rotate(${dragX / 40}deg)`, transition: dragStart.current == null ? 'transform 200ms ease' : 'none' }}
            >
              {/* 滑动方向提示（模仿主流卡片：左=不认识，右=认识） */}
              {swipeHint && (
                <div className={cn('absolute inset-0 z-10 rounded-[32px] border-2 flex items-center justify-center pointer-events-none',
                  swipeHint === 'left' ? 'border-rose-400 bg-rose-500/10' : 'border-emerald-400 bg-emerald-500/10')}>
                  <span className={cn('text-lg font-black uppercase tracking-wider', swipeHint === 'left' ? 'text-rose-500' : 'text-emerald-600')}>
                    {swipeHint === 'left' ? '不认识' : '认识'}
                  </span>
                </div>
              )}
            <Card
              className={cn('rounded-[32px] border-2 shadow-xl transition-all cursor-pointer',
                isFlipped
                  ? 'border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-500/10 dark:to-purple-500/10 max-h-[62vh] overflow-y-auto'
                  : 'border-border bg-card min-h-[260px] flex flex-col justify-center')}
              onClick={() => { if (Math.abs(dragX) < SWIPE_THRESHOLD) flip(); }}
            >
              <CardContent className={cn('p-7 text-center', isFlipped && 'text-left')}>
                {!isFlipped ? (
                  <>
                    <Badge className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-muted text-muted-foreground mb-4">
                      {currentIdx + 1} / {queue.length}
                      {state.progress[shown!.word.toLowerCase()] && (
                        <span className="ml-1.5 text-ink-violet">
                          · {state.progress[shown!.word.toLowerCase()].status === 'mastered' ? '已掌握' : '复习中'}
                        </span>
                      )}
                    </Badge>
                    <div data-fit-box className="flex items-center justify-center gap-2 mb-4 max-w-full">
                      <h2 className="text-foreground min-w-0 max-w-full">
                        <FitWord text={shown!.word} maxPx={40} minPx={18} reservePx={52} />
                      </h2>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); tts.speak(shown!.word, { rate: 0.9 }); }}
                        className="rounded-2xl bg-muted text-muted-foreground hover:text-ink-violet"><Volume2 className="size-5" /></Button>
                    </div>
                    <p className="text-sm font-bold text-ink-violet mb-1">{shown!.partOfSpeech}</p>
                    <p className="text-sm text-muted-foreground font-medium">{shown!.phonetic}</p>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-4">
                      <Sparkles className="size-3.5 inline mr-1 text-ink-violet" />点击翻转查看释义
                    </p>
                    <p className="text-[9px] text-muted-foreground/70 font-bold mt-1.5">手机：左右滑动 · 键盘：空格 / 1-5 / S</p>
                  </>
                ) : (
                  <div className="space-y-3.5">
                    {/* 词头：词 + 音标 + 发音 */}
                    <div className="text-center">
                      <Badge className="rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wider bg-violet-100 dark:bg-violet-500/20 text-ink-violet">
                        {shown!.partOfSpeech}
                      </Badge>
                      <div className="flex items-center justify-center gap-2 mt-2">
                        <p className="text-lg font-black text-foreground">{shown!.word}</p>
                        <button onClick={(e) => { e.stopPropagation(); tts.speak(shown!.word, { rate: 0.9 }); }}
                          className="text-muted-foreground hover:text-ink-violet"><Volume2 className="size-4" /></button>
                      </div>
                      {shown!.phonetic && <p className="text-xs text-muted-foreground font-medium">{shown!.phonetic}</p>}
                      <p className="text-lg font-black text-foreground mt-2">{shown!.meaning}</p>
                      {/* 语域 / 情感 / 词频：主流 App 常见的"难度标签" */}
                      <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
                        <Badge className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-muted text-muted-foreground border-0">
                          词频 #{shown!.frequencyRank}
                        </Badge>
                        <Badge className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-muted text-muted-foreground border-0">
                          {shown!.register === 'formal' ? '正式' : shown!.register === 'informal' ? '口语' : '中性'}
                        </Badge>
                        {shown!.emotion !== 'neutral' && (
                          <Badge className={cn('rounded-full px-2 py-0.5 text-[9px] font-bold border-0',
                            shown!.emotion === 'positive' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-500')}>
                            {shown!.emotion === 'positive' ? '褒义' : '贬义'}
                          </Badge>
                        )}
                        {shown!.hasNoChineseEquivalent && (
                          <Badge className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-amber-500/10 text-amber-600 border-0">中文无对应</Badge>
                        )}
                      </div>
                    </div>

                    {/* 例句 —— 点英文可再听一遍 */}
                    {shown!.examples.length > 0 && (
                      <div className="rounded-2xl bg-white/60 dark:bg-foreground/10 border border-violet-100 p-3 space-y-2">
                        <SectionTitle icon={BookOpen}>例句 · {shown!.examples.length} 条（点句子可朗读）</SectionTitle>
                        {shown!.examples.slice(0, 3).map((ex, i) => (
                          <div key={i}
                            className="cursor-pointer group/ex"
                            onClick={(e) => { e.stopPropagation(); tts.speak(cleanText(ex.en), { rate: 0.85 }); }}>
                            <p className="text-sm text-foreground/85 italic font-medium group-hover/ex:text-ink-violet transition-colors">
                              {cleanText(ex.en)}
                            </p>
                            {ex.zh && <p className="text-xs text-muted-foreground mt-0.5">{cleanText(ex.zh)}</p>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 常用搭配 */}
                    {shown!.collocations.length > 0 && (
                      <div>
                        <SectionTitle icon={Link2}>常用搭配</SectionTitle>
                        <div className="flex flex-wrap gap-1.5">
                          {shown!.collocations.slice(0, 8).map((c) => (
                            <span key={c} className="px-2 py-1 rounded-lg bg-[#6C5CE7]/8 text-[11px] font-bold text-foreground/80">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 近义 / 反义 / 词族 */}
                    {(shown!.synonyms.length > 0 || shown!.antonyms.length > 0 || shown!.wordFamily.length > 0) && (
                      <div className="space-y-2">
                        {shown!.synonyms.length > 0 && (
                          <div>
                            <SectionTitle>近义 ≈</SectionTitle>
                            <div className="flex flex-wrap gap-1.5">
                              {shown!.synonyms.slice(0, 8).map((s) => (
                                <span key={s} className="px-2 py-1 rounded-lg bg-emerald-500/10 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {shown!.antonyms.length > 0 && (
                          <div>
                            <SectionTitle>反义 ≠</SectionTitle>
                            <div className="flex flex-wrap gap-1.5">
                              {shown!.antonyms.slice(0, 8).map((s) => (
                                <span key={s} className="px-2 py-1 rounded-lg bg-rose-500/10 text-[11px] font-bold text-rose-600 dark:text-rose-400">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {shown!.wordFamily.length > 0 && (
                          <div>
                            <SectionTitle>词族</SectionTitle>
                            <div className="flex flex-wrap gap-1.5">
                              {shown!.wordFamily.slice(0, 10).map((s) => (
                                <span key={s} className="px-2 py-1 rounded-lg bg-muted text-[11px] font-bold text-muted-foreground">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 深度解释（可折叠，避免背面过长） */}
                    {shown!.deepExplanation && (
                      <div className="rounded-2xl border border-violet-100 bg-white/50 dark:bg-foreground/5">
                        <button
                          className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-black uppercase tracking-wider text-ink-violet"
                          onClick={(e) => { e.stopPropagation(); setShowDeep((v) => !v); }}
                        >
                          <span>深度解释</span>
                          {showDeep ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                        </button>
                        {showDeep && (
                          <p className="px-3 pb-3 text-xs text-foreground/80 leading-relaxed">{shown!.deepExplanation}</p>
                        )}
                      </div>
                    )}

                    {/* 主题标签 */}
                    {shown!.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {shown!.topics.slice(0, 6).map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded-full bg-muted text-[9px] font-bold text-muted-foreground">#{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            </div>
          </MotionDiv>
        </AnimatePresence>
      </div>

      {/* SM-2 Quality rating */}
      {isFlipped && !rated && (
        <div className="flex justify-center gap-2 flex-wrap">
          {[
            { q: 0, label: '完全忘了', color: 'bg-rose-500 hover:bg-rose-600' },
            { q: 2, label: '有点印象', color: 'bg-orange-500 hover:bg-orange-600' },
            { q: 3, label: '基本记得', color: 'bg-amber-500 hover:bg-amber-600' },
            { q: 4, label: '比较熟悉', color: 'bg-emerald-500 hover:bg-emerald-600' },
            { q: 5, label: '完全掌握', color: 'bg-[#6C5CE7] hover:bg-[#5A4BD1]' },
          ].map(({ q, label, color }, i) => (
            <button key={q} onClick={() => markWithQuality(q)}
              className={cn('relative px-3 py-2 rounded-2xl text-white text-[10px] font-black uppercase tracking-wider shadow-lg transition-all hover:scale-105', color)}>
              {label}
              <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-black/25 text-[8px] font-black flex items-center justify-center">{i + 1}</span>
            </button>
          ))}
          <span className="w-full text-center text-[9px] text-muted-foreground font-bold mt-1">
            手机：左滑不认识 / 右滑认识 · 键盘：空格 翻面 / 1-5 评分 / → 下一个
          </span>
        </div>
      )}
      {rated && (
        <div className="flex justify-center">
          <Button onClick={() => advance()} className="bg-[#6C5CE7] hover:bg-[#5A4BD1] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-violet-200/50">
            {currentIdx < queue.length - 1 ? '下一个' : '再来一组'}<RotateCw className="size-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}
