import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCw, CheckCircle2, XCircle, Volume2, Shuffle, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { IWordEntry } from '@/data/wordbank/schema';
import { findWord, getWordCounts } from '@/data/wordbank';
import { useWordLearning } from '@/lib/use-word-learning';
import { useLearningStats } from '@/lib/use-learning-stats';
import { cn, cleanText } from '@/lib/utils';
import { toast } from 'sonner';
import { useTTS } from '@/lib/use-tts';

const FL_LEVEL_COLORS: Record<string, string> = {
  all: '#00B894', cet4: '#0EA5E9', cet6: '#6C5CE7', ielts: '#F59E0B', toefl: '#EC4899', advanced: '#64748B',
};

interface LevelInfo { key: string; label: string; }
export default function FlashcardMode({ level, onLevelChange, levels, counts, reviewMode }: { level?: string; onLevelChange?: (key: string) => void; levels?: LevelInfo[]; counts?: Record<string, number>; reviewMode?: string }) {
  const currentLevel = level || 'all';
  const isFullBook = reviewMode === 'full';
  const { addStudyMinutes } = useLearningStats();
  const { state, dueForReview, getNewWords, recordReview } = useWordLearning(currentLevel);
  const tts = useTTS();

  const [currentIdx, setIdx] = useState(0);
  const [isFlipped, setFlipped] = useState(false);
  const [dir, setDir] = useState(0);
  // Auto-speak: read the current word aloud when switching to it
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [sessionReviewCount, setSessionReviewCount] = useState(0);

  // Build word queue from SM-2 data:
  //   Priority 1: words due for review (SM-2 scheduled)
  //   Priority 2: words in progress but not yet due
  //   Priority 3: new words as fallback
  const allCounts = useMemo(() => getWordCounts(), []);
  const totalForLevel = currentLevel === 'all'
    ? Object.values(allCounts).reduce((a, b) => a + b, 0)
    : (allCounts[currentLevel] || 0);

  const queue = useMemo(() => {
    // Full book mode: random words from the entire level (ignores SM-2)
    if (isFullBook) {
      const words = getNewWords(50);
      return words.length > 0 ? words : [];
    }

    const seen = new Set<string>();

    // Priority 1: due for review
    const dueWords: IWordEntry[] = [];
    for (const p of dueForReview) {
      const w = findWord(p.wordKey);
      if (w && !seen.has(w.word.toLowerCase())) {
        seen.add(w.word.toLowerCase());
        dueWords.push(w);
      }
    }

    // Priority 2: other words in progress (not due yet)
    const otherWords: IWordEntry[] = [];
    for (const key of Object.keys(state.progress)) {
      if (!seen.has(key)) {
        const w = findWord(key);
        if (w) {
          seen.add(key);
          otherWords.push(w);
        }
      }
    }

    // Priority 3: fill with new words if queue is small
    const fillCount = Math.max(0, 20 - dueWords.length - otherWords.length);
    const newWords = fillCount > 0 ? getNewWords(fillCount).filter((w) => !seen.has(w.word.toLowerCase())) : [];

    return [...dueWords, ...otherWords, ...newWords];
  }, [dueForReview, state.progress, getNewWords, isFullBook]);

  // Auto-speak: 切换界面就停止上一次，读当前界面内容（正面读单词，反面读例句）
  // 用 ref 存 tts，避免 tts 对象变化导致 effect 反复触发、中断朗读
  const ttsRef = useRef(tts);
  ttsRef.current = tts;
  // 记录上一次朗读的内容 key，防止同一内容重复朗读导致中断
  const lastSpokenKey = useRef('');

  useEffect(() => {
    if (!autoSpeak) return;
    const word = queue[currentIdx];
    if (!word) return;

    const side = isFlipped ? 'back' : 'front';
    const key = `${currentIdx}-${side}`;
    if (lastSpokenKey.current === key) return; // 同一内容不再重复朗读
    lastSpokenKey.current = key;

    if (!isFlipped) {
      // 正面：朗读单词
      ttsRef.current.speak(word.word, { rate: 0.85 });
    } else if (word.examples[0]) {
      // 反面：朗读例句（等翻面动画完成）
      const timer = setTimeout(() => {
        ttsRef.current.speak(cleanText(word.examples[0].en), { rate: 0.85 });
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [autoSpeak, currentIdx, isFlipped, queue]);

  // Reset index + flip state when level changes
  useEffect(() => {
    setIdx(0);
    setFlipped(false);
    setDir(0);
    setAutoSpeak(false);
  }, [currentLevel]);

  const cw = queue[currentIdx];

  // Stats from SM-2 data
  const stats = useMemo(() => {
    let mastered = 0, learning = 0, newCount = 0;
    for (const p of Object.values(state.progress)) {
      if (p.status === 'mastered') mastered++;
      else if (p.status === 'reviewing' || p.status === 'learning') learning++;
      else newCount++;
    }
    const unstarted = Math.max(0, totalForLevel - Object.keys(state.progress).length);
    return { mastered, learning, new: unstarted, total: totalForLevel };
  }, [state.progress, totalForLevel]);

  const flip = () => { setFlipped(!isFlipped); if (!isFlipped) addStudyMinutes(0.2, 'vocabulary'); };

  const mark = useCallback((k: boolean) => {
    if (!cw) return;
    const quality = k ? 5 : 2;
    recordReview(cw, quality);
    setSessionReviewCount((p) => p + 1);
    toast(k ? '已掌握' : '下次再复习', { duration: 1000 });
    setDir(k ? 1 : -1);
    setFlipped(false);
    setTimeout(() => setIdx((p) => (p + 1) % queue.length), 200);
  }, [cw, recordReview, queue.length]);

  if (!cw) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-xl bg-[#6C5CE7]/10 flex items-center justify-center text-[#6C5CE7]">
              <RotateCw className="size-4" />
            </div>
            <h2 className="text-sm font-black italic text-foreground">复习模式</h2>
          </div>
          {onLevelChange && levels && (
            <div className="flex gap-1 flex-wrap">
              {levels.map((l) => {
                const lc = FL_LEVEL_COLORS[l.key] || FL_LEVEL_COLORS.all;
                const active = currentLevel === l.key;
                return (
                  <button
                    key={l.key}
                    onClick={() => { onLevelChange(l.key); toast.success(`已切换至 ${l.label}`, { duration: 1000 }); }}
                    className={cn(
                      'px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-200',
                      active ? 'text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80',
                    )}
                    style={active ? { backgroundColor: lc } : undefined}
                  >
                    {l.label}<span className="ml-0.5 text-[8px] opacity-70 font-bold">{counts?.[l.key] ?? 0}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {stats.total > 0 ? (
          <div className="text-center py-16 space-y-4">
            <p className="text-muted-foreground text-sm font-medium">
              {dueForReview.length > 0
                ? `还有 ${dueForReview.length} 个单词待复习`
                : '当前等级还没有学习记录，先去学习模式开始学习吧！'}
            </p>
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">当前等级暂无单词，请先选择有数据的等级。</div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Review header + level selector */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-xl bg-[#6C5CE7]/10 flex items-center justify-center text-[#6C5CE7]">
            <RotateCw className="size-4" />
          </div>
          <h2 className="text-sm font-black italic text-foreground">复习模式</h2>
          {/* Auto-speak toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAutoSpeak(!autoSpeak)}
            className={cn(
              'rounded-xl text-[9px] font-black uppercase tracking-wider gap-1',
              autoSpeak
                ? 'bg-[#00B894]/10 text-[#00B894]'
                : 'bg-muted text-muted-foreground hover:text-[#00B894]',
            )}
          >
            <Volume2 className="size-3" />
            {autoSpeak ? '静音' : '朗读'}
          </Button>
        </div>
        {onLevelChange && levels && (
          <div className="flex gap-1 flex-wrap">
            {levels.map((l) => {
              const lc = FL_LEVEL_COLORS[l.key] || FL_LEVEL_COLORS.all;
              const active = currentLevel === l.key;
              return (
                <button
                  key={l.key}
                  onClick={() => {
                    onLevelChange(l.key);
                    toast.success(`已切换至 ${l.label}`, { duration: 1000 });
                  }}
                  className={cn(
                    'px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-200',
                    active
                      ? 'text-white shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                  style={active ? { backgroundColor: lc } : undefined}
                >
                  {l.label}<span className="ml-0.5 text-[8px] opacity-70 font-bold">{counts?.[l.key] ?? 0}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-100 text-center">
          <p className="text-lg font-black text-[#00B894]">{stats.mastered}</p>
          <p className="text-[8px] font-black uppercase tracking-wider text-emerald-600">已掌握</p>
        </div>
        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-100 text-center">
          <p className="text-lg font-black text-amber-500">{stats.learning}</p>
          <p className="text-[8px] font-black uppercase tracking-wider text-amber-600">学习中</p>
        </div>
        <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-center">
          <p className="text-lg font-black text-gray-500 dark:text-gray-400">{stats.new}</p>
          <p className="text-[8px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">未开始</p>
        </div>
        <div className="p-2.5 rounded-xl bg-[#00B894]/5 border border-[#00B894]/10 text-center">
          <p className="text-lg font-black text-foreground">{sessionReviewCount}</p>
          <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">本次复习</p>
        </div>
      </div>

      <div className="flex justify-center">
        <AnimatePresence mode="wait">
          <motion.div key={cw.word + (isFlipped ? '-back' : '-front')} initial={{ opacity: 0, x: dir * 120 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 120 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }} className="w-full max-w-sm cursor-pointer" onClick={() => flip()}>
            <Card className={cn('rounded-[32px] border-2 shadow-xl transition-all min-h-[260px] flex flex-col justify-center', isFlipped ? 'border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50' : 'border-border bg-card')}>
              <CardContent className="p-8 text-center">
                {!isFlipped ? (
                  <>
                    <Badge className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-muted text-muted-foreground mb-6">
                      {currentIdx + 1} / {queue.length}
                      {state.progress[cw.word.toLowerCase()] && (
                        <span className="ml-1.5 text-[#6C5CE7]">
                          · {state.progress[cw.word.toLowerCase()].status === 'mastered' ? '已掌握' : state.progress[cw.word.toLowerCase()].status === 'reviewing' ? '复习中' : '学习中'}
                        </span>
                      )}
                    </Badge>
                    <div className="flex items-center justify-center gap-3 mb-2">
                      <h2 className="text-4xl font-black italic text-foreground tracking-tight">{cw.word}</h2>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); tts.speak(cw.word, { rate: 0.9 }); }} className="rounded-2xl bg-muted text-muted-foreground hover:text-[#00B894]"><Volume2 className="size-5" /></Button>
                    </div>
                    <p className="text-sm font-bold text-[#6C5CE7] mb-1">{cw.partOfSpeech}</p>
                    <p className="text-sm text-muted-foreground font-medium">{cw.phonetic}</p>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-4"><Sparkles className="size-3.5 inline mr-1 text-[#00B894]" />点击翻转查看释义</p>
                  </>
                ) : (
                  <>
                    <Badge className="rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wider bg-indigo-100 dark:bg-indigo-500/20 text-indigo-500 mb-4">释义 · {cw.partOfSpeech}</Badge>
                    <p className="text-xl font-black text-foreground mb-2">{cw.meaning}</p>
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-muted">{cw.register === 'formal' ? '正式' : cw.register === 'informal' ? '非正式' : '中性'}</Badge>
                      <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-muted">#{cw.frequencyRank}</Badge>
                      <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-muted">{cw.level.toUpperCase()}</Badge>
                    </div>
                    {cw.examples[0] && (
                      <div className="p-3 rounded-2xl bg-white/60 dark:bg-foreground/10 border border-indigo-100 mb-3">
                        <div className="flex items-start gap-2">
                          <p className="text-sm text-foreground/80 italic font-medium flex-1">"{cleanText(cw.examples[0].en)}"</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); tts.speak(cleanText(cw.examples[0].en)); }}
                            className="rounded-lg size-6 text-muted-foreground hover:text-[#00B894] shrink-0"
                          >
                            <Volume2 className="size-3.5" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{cleanText(cw.examples[0].zh)}</p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5 justify-center mb-3">
                      {cw.collocations.slice(0, 4).map((c, i) => <Badge key={i} className="rounded-full px-2 py-0.5 text-[9px] font-medium bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 border-none">{c}</Badge>)}
                    </div>
                    <p className="text-xs text-muted-foreground font-medium line-clamp-2">{cw.deepExplanation || `${cw.word}意为${cw.meaning}。`}</p>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-center gap-4">
        <Button size="lg" variant="outline" onClick={(e) => { e.stopPropagation(); mark(false); }} className="rounded-2xl px-8 py-6 border-rose-200 text-rose-500 hover:bg-rose-50 text-sm font-black uppercase tracking-wider"><XCircle className="size-5 mr-2" />不认识</Button>
        <Button size="lg" onClick={(e) => { e.stopPropagation(); mark(true); }} className="rounded-2xl px-8 py-6 bg-gradient-to-r from-emerald-500 to-[#00B894] text-white shadow-lg shadow-emerald-200/50 hover:scale-105 transition-all text-sm font-black uppercase tracking-wider"><CheckCircle2 className="size-5 mr-2" />认识</Button>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setIdx(Math.max(0, currentIdx - 1))} disabled={currentIdx === 0} className="rounded-2xl text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-[#00B894]"><ArrowLeft className="size-3.5 mr-1" />上一张</Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setIdx(0); setFlipped(false); setSessionReviewCount(0); toast.success('进度已重置'); }} className="rounded-2xl text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-[#00B894]"><RotateCw className="size-3.5 mr-1" />重置</Button>
          <Button variant="ghost" size="sm" onClick={() => setIdx(Math.floor(Math.random() * queue.length))} className="rounded-2xl text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-[#00B894]"><Shuffle className="size-3.5 mr-1" />随机</Button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setIdx((currentIdx + 1) % queue.length)} className="rounded-2xl text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-[#00B894]">下一张<ArrowRight className="size-3.5 ml-1" /></Button>
      </div>
    </div>
  );
}
