import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCw, Volume2, Sparkles } from 'lucide-react';
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
export default function FlashcardMode({ level, onLevelChange, levels, counts }: { level?: string; onLevelChange?: (key: string) => void; levels?: LevelInfo[]; counts?: Record<string, number> }) {
  const currentLevel = level || 'all';
  const { addStudyMinutes } = useLearningStats();
  const { state, dueForReview, getNewWords, recordReview } = useWordLearning(currentLevel);
  const tts = useTTS();

  const [currentIdx, setIdx] = useState(0);
  const [isFlipped, setFlipped] = useState(false);
  const [dir, setDir] = useState(0);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [sessionReviewCount, setSessionReviewCount] = useState(0);
  const [rated, setRated] = useState(false);

  const allCounts = useMemo(() => getWordCounts(), []);
  const totalForLevel = currentLevel === 'all'
    ? Object.values(allCounts).reduce((a, b) => a + b, 0)
    : (allCounts[currentLevel] || 0);

  const queue = useMemo(() => {
    const seen = new Set<string>();
    const dueWords: IWordEntry[] = [];
    for (const p of dueForReview) {
      const w = findWord(p.wordKey);
      if (w && !seen.has(w.word.toLowerCase())) {
        seen.add(w.word.toLowerCase());
        dueWords.push(w);
      }
    }
    const otherWords: IWordEntry[] = [];
    for (const key of Object.keys(state.progress)) {
      if (!seen.has(key)) {
        const w = findWord(key);
        if (w) { seen.add(key); otherWords.push(w); }
      }
    }
    const fillCount = Math.max(0, 20 - dueWords.length - otherWords.length);
    const newWords = fillCount > 0 ? getNewWords(fillCount).filter((w) => !seen.has(w.word.toLowerCase())) : [];
    return [...dueWords, ...otherWords, ...newWords];
  }, [dueForReview, state.progress, getNewWords]);

  const ttsRef = useRef(tts);
  ttsRef.current = tts;
  const lastSpokenKey = useRef('');
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
    } else if (word.examples[0]) {
      const timer = setTimeout(() => { ttsRef.current.speak(cleanText(word.examples[0].en), { rate: 0.85 }); }, 400);
      return () => clearTimeout(timer);
    }
  }, [autoSpeak, currentIdx, isFlipped, queue]);

  useEffect(() => {
    setIdx(0); setFlipped(false); setDir(0); setRated(false);
  }, [currentLevel]);

  const cw = queue[currentIdx];

  const stats = useMemo(() => {
    let mastered = 0, learning = 0;
    for (const p of Object.values(state.progress)) {
      if (p.status === 'mastered') mastered++;
      else if (p.status === 'reviewing' || p.status === 'learning') learning++;
    }
    const unstarted = Math.max(0, totalForLevel - Object.keys(state.progress).length);
    return { mastered, learning, new: unstarted, total: totalForLevel, due: dueForReview.length };
  }, [state.progress, totalForLevel, dueForReview.length]);

  const flip = () => { setFlipped(!isFlipped); if (!isFlipped) addStudyMinutes(0.2, 'vocabulary'); };

  const markWithQuality = useCallback((quality: number) => {
    if (!cw) return;
    recordReview(cw, quality);
    setSessionReviewCount((p) => p + 1);
    setRated(true);
    const labels = ['完全忘了', '有点印象', '基本记得', '比较熟悉', '完全掌握'];
    toast(labels[quality] || '已记录', { duration: 800 });
  }, [cw, recordReview]);

  const advance = () => {
    setDir(1); setFlipped(false); setRated(false);
    setTimeout(() => setIdx((p) => (p + 1) % queue.length), 150);
  };

  if (!cw) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-xl bg-[#6C5CE7]/10 flex items-center justify-center text-[#6C5CE7]">
            <RotateCw className="size-4" />
          </div>
          <h2 className="text-sm font-black italic text-foreground">复习检测</h2>
        </div>
        <div className="text-center py-16 space-y-4">
          <div className="size-16 rounded-full bg-[#6C5CE7]/10 flex items-center justify-center mx-auto">
            <RotateCw className="size-8 text-[#6C5CE7]" />
          </div>
          <p className="text-muted-foreground text-sm font-medium">
            {stats.due > 0
              ? `还有 ${stats.due} 个单词待复习，开始巩固记忆吧！`
              : '当前没有需要复习的单词，先去学习模式学习吧！'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-xl bg-[#6C5CE7]/10 flex items-center justify-center text-[#6C5CE7]">
            <RotateCw className="size-4.5" />
          </div>
          <div>
            <h2 className="text-sm font-black italic text-foreground">复习检测</h2>
            <p className="text-[9px] font-bold text-muted-foreground">SM-2 间隔记忆 · 巩固已学单词</p>
          </div>
        </div>
      </div>

      {/* SM-2 Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-100 text-center">
          <p className="text-lg font-black text-rose-500">{stats.due}</p>
          <p className="text-[8px] font-black uppercase tracking-wider text-rose-600">待复习</p>
        </div>
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-100 text-center">
          <p className="text-lg font-black text-[#00B894]">{stats.mastered}</p>
          <p className="text-[8px] font-black uppercase tracking-wider text-emerald-600">已掌握</p>
        </div>
        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-100 text-center">
          <p className="text-lg font-black text-amber-500">{stats.learning}</p>
          <p className="text-[8px] font-black uppercase tracking-wider text-amber-600">学习中</p>
        </div>
        <div className="p-2.5 rounded-xl bg-[#6C5CE7]/5 border border-[#6C5CE7]/10 text-center">
          <p className="text-lg font-black text-[#6C5CE7]">{sessionReviewCount}</p>
          <p className="text-[8px] font-black uppercase tracking-wider text-[#6C5CE7]/70">本次复习</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#6C5CE7] to-violet-400 rounded-full transition-all duration-300"
            style={{ width: `${((currentIdx + 1) / queue.length) * 100}%` }} />
        </div>
        <span className="text-xs font-black text-muted-foreground tabular-nums">{currentIdx + 1}/{queue.length}</span>
      </div>

      {/* Flashcard */}
      <div className="flex justify-center">
        <AnimatePresence mode="wait">
          <motion.div key={cw.word + (isFlipped ? '-back' : '-front')}
            initial={{ opacity: 0, x: dir * 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 100 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="w-full max-w-sm cursor-pointer" onClick={() => flip()}>
            <Card className={cn('rounded-[32px] border-2 shadow-xl transition-all min-h-[260px] flex flex-col justify-center',
              isFlipped ? 'border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-500/10 dark:to-purple-500/10' : 'border-border bg-card')}>
              <CardContent className="p-8 text-center">
                {!isFlipped ? (
                  <>
                    <Badge className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-muted text-muted-foreground mb-6">
                      {currentIdx + 1} / {queue.length}
                      {state.progress[cw.word.toLowerCase()] && (
                        <span className="ml-1.5 text-[#6C5CE7]">
                          · {state.progress[cw.word.toLowerCase()].status === 'mastered' ? '已掌握' : '复习中'}
                        </span>
                      )}
                    </Badge>
                    <div className="flex items-center justify-center gap-3 mb-2">
                      <h2 className="text-4xl font-black italic text-foreground tracking-tight">{cw.word}</h2>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); tts.speak(cw.word, { rate: 0.9 }); }}
                        className="rounded-2xl bg-muted text-muted-foreground hover:text-[#6C5CE7]"><Volume2 className="size-5" /></Button>
                    </div>
                    <p className="text-sm font-bold text-[#6C5CE7] mb-1">{cw.partOfSpeech}</p>
                    <p className="text-sm text-muted-foreground font-medium">{cw.phonetic}</p>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-4">
                      <Sparkles className="size-3.5 inline mr-1 text-[#6C5CE7]" />点击翻转查看释义
                    </p>
                  </>
                ) : (
                  <>
                    <Badge className="rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wider bg-violet-100 dark:bg-violet-500/20 text-[#6C5CE7] mb-3">
                      释义 · {cw.partOfSpeech}
                    </Badge>
                    <p className="text-xl font-black text-foreground mb-2">{cw.meaning}</p>
                    {cw.examples[0] && (
                      <div className="p-3 rounded-2xl bg-white/60 dark:bg-foreground/10 border border-violet-100 mb-3">
                        <p className="text-sm text-foreground/80 italic font-medium">"{cleanText(cw.examples[0].en)}"</p>
                        <p className="text-xs text-muted-foreground mt-1">{cleanText(cw.examples[0].zh)}</p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
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
          ].map(({ q, label, color }) => (
            <button key={q} onClick={() => markWithQuality(q)}
              className={cn('px-3 py-2 rounded-2xl text-white text-[10px] font-black uppercase tracking-wider shadow-lg transition-all hover:scale-105', color)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {rated && (
        <div className="flex justify-center">
          <Button onClick={advance} className="bg-[#6C5CE7] hover:bg-[#5A4BD1] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-violet-200/50">
            {currentIdx < queue.length - 1 ? '下一个' : '再来一组'}<RotateCw className="size-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}
