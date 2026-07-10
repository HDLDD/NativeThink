import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCw, CheckCircle2, XCircle, Volume2, Shuffle, ArrowRight, ArrowLeft, Sparkles, BookOpen, Edit3, Headphones, Link2, PenLine } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { IWordEntry } from '@/data/wordbank/schema';
import { findWord, getWordCounts, getRandomWords } from '@/data/wordbank';
import { useWordLearning } from '@/lib/use-word-learning';
import { useLearningStats } from '@/lib/use-learning-stats';
import { cn, cleanText } from '@/lib/utils';
import { toast } from 'sonner';
import { useTTS } from '@/lib/use-tts';

type ReviewMode = 'flashcard' | 'choice' | 'spelling' | 'listening';

const MODE_META: Record<ReviewMode, { label: string; accent: string; icon: typeof BookOpen }> = {
  flashcard: { label: '闪卡', accent: '#6C5CE7', icon: BookOpen },
  choice:    { label: '选择', accent: '#F59E0B', icon: Shuffle },
  spelling:  { label: '拼写', accent: '#0EA5E9', icon: Edit3 },
  listening: { label: '听写', accent: '#EC4899', icon: Headphones },
};

const FL_LEVEL_COLORS: Record<string, string> = {
  all: '#00B894', cet4: '#0EA5E9', cet6: '#6C5CE7', ielts: '#F59E0B', toefl: '#EC4899', advanced: '#64748B',
};

interface LevelInfo { key: string; label: string; }
export default function FlashcardMode({ level, onLevelChange, levels, counts }: { level?: string; onLevelChange?: (key: string) => void; levels?: LevelInfo[]; counts?: Record<string, number> }) {
  const currentLevel = level || 'all';
  const { addStudyMinutes } = useLearningStats();
  const { state, dueForReview, getNewWords, recordReview } = useWordLearning(currentLevel);
  const tts = useTTS();

  const [reviewMode, setReviewMode] = useState<ReviewMode>('flashcard');
  const [currentIdx, setIdx] = useState(0);
  const [isFlipped, setFlipped] = useState(false);
  const [dir, setDir] = useState(0);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [sessionReviewCount, setSessionReviewCount] = useState(0);
  const [rated, setRated] = useState(false);

  // Choice mode state
  const [choiceOptions, setChoiceOptions] = useState<IWordEntry[]>([]);
  const [choiceSelected, setChoiceSelected] = useState<string | null>(null);
  const [choiceCorrect, setChoiceCorrect] = useState<boolean | null>(null);

  // Spelling mode state
  const [spellingInput, setSpellingInput] = useState('');
  const [spellingChecked, setSpellingChecked] = useState(false);
  const [spellingCorrect, setSpellingCorrect] = useState(false);

  // Listening mode state
  const [listeningInput, setListeningInput] = useState('');
  const [listeningChecked, setListeningChecked] = useState(false);
  const [listeningCorrect, setListeningCorrect] = useState(false);
  const ttsPlayedRef = useRef(false);

  // Build word queue from SM-2 data: due reviews → in-progress → new words
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

  // Generate choice options for current word
  useEffect(() => {
    if (reviewMode === 'choice' && cw) {
      const others = getRandomWords(3, currentLevel === 'all' ? undefined : currentLevel)
        .filter((w) => w.word !== cw.word);
      setChoiceOptions([...others, cw].sort(() => Math.random() - 0.5));
    }
  }, [reviewMode, currentIdx, cw?.word]);

  // Auto-speak for listening mode
  useEffect(() => {
    if (reviewMode === 'listening' && cw && !ttsPlayedRef.current) {
      ttsPlayedRef.current = true;
      tts.speak(cw.word, { rate: 0.85 });
    }
  }, [reviewMode, currentIdx, cw?.word]);

  // Auto-speak for flashcard mode
  const ttsRef = useRef(tts);
  ttsRef.current = tts;
  const lastSpokenKey = useRef('');
  useEffect(() => {
    if (!autoSpeak || reviewMode !== 'flashcard') return;
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
  }, [autoSpeak, currentIdx, isFlipped, queue, reviewMode]);

  // Reset state when level or mode changes
  useEffect(() => {
    setIdx(0); setFlipped(false); setDir(0); setRated(false);
    setChoiceSelected(null); setChoiceCorrect(null);
    setSpellingInput(''); setSpellingChecked(false);
    setListeningInput(''); setListeningChecked(false);
    ttsPlayedRef.current = false;
  }, [currentLevel, reviewMode]);

  const handleModeChange = (mode: ReviewMode) => {
    if (mode !== reviewMode) {
      setReviewMode(mode);
      toast.success(`切换至 ${MODE_META[mode].label}`, { duration: 1000 });
    }
  };

  const cw = queue[currentIdx];
  const modeMeta = MODE_META[reviewMode];

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
    toast(labels[quality] || (quality >= 4 ? '已掌握' : '下次再复习'), { duration: 800 });
  }, [cw, recordReview]);

  const advance = () => {
    setDir(1); setFlipped(false); setRated(false);
    setChoiceSelected(null); setChoiceCorrect(null);
    setSpellingInput(''); setSpellingChecked(false);
    setListeningInput(''); setListeningChecked(false);
    ttsPlayedRef.current = false;
    setTimeout(() => setIdx((p) => (p + 1) % queue.length), 150);
  };

  // Choice: check answer
  const handleChoice = (word: string) => {
    if (choiceSelected) return;
    setChoiceSelected(word);
    const correct = word === cw?.word;
    setChoiceCorrect(correct);
    markWithQuality(correct ? 4 : 2);
    if (!correct) toast.error(`正确答案: ${cw?.word}`, { duration: 2000 });
  };

  // Spelling: check answer
  const handleSpellingCheck = () => {
    if (spellingChecked || !cw) return;
    setSpellingChecked(true);
    const correct = spellingInput.trim().toLowerCase() === cw.word.toLowerCase();
    setSpellingCorrect(correct);
    markWithQuality(correct ? 4 : 2);
    if (!correct) toast.error(`正确答案: ${cw.word}`, { duration: 2000 });
  };

  // Listening: check answer
  const handleListeningCheck = () => {
    if (listeningChecked || !cw) return;
    setListeningChecked(true);
    const correct = listeningInput.trim().toLowerCase() === cw.word.toLowerCase();
    setListeningCorrect(correct);
    markWithQuality(correct ? 4 : 2);
    if (!correct) toast.error(`正确答案: ${cw.word} (${cw.meaning})`, { duration: 2000 });
  };

  // Empty state
  if (!cw) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-xl bg-[#6C5CE7]/10 flex items-center justify-center text-[#6C5CE7]">
              <RotateCw className="size-4" />
            </div>
            <h2 className="text-sm font-black italic text-foreground">复习检测</h2>
          </div>
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
      {/* Header: mode + level selector */}
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
        {onLevelChange && levels && (
          <div className="flex gap-1 flex-wrap">
            {levels.map((l) => {
              const lc = FL_LEVEL_COLORS[l.key] || FL_LEVEL_COLORS.all;
              const active = currentLevel === l.key;
              return (
                <button key={l.key} onClick={() => { onLevelChange(l.key); toast.success(`已切换至 ${l.label}`, { duration: 1000 }); }}
                  className={cn('px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-200',
                    active ? 'text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80')}
                  style={active ? { backgroundColor: lc } : undefined}>
                  {l.label}<span className="ml-0.5 text-[8px] opacity-70 font-bold">{counts?.[l.key] ?? 0}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Review mode selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground shrink-0">复习方式</span>
        {Object.entries(MODE_META).map(([key, { label, accent, icon: Icon }]) => {
          const active = reviewMode === key;
          return (
            <button key={key} onClick={() => handleModeChange(key as ReviewMode)}
              className={cn('flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all duration-200',
                active ? 'text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80')}
              style={active ? { backgroundColor: accent } : undefined}>
              <Icon className="size-3" />{label}
            </button>
          );
        })}
        {/* Auto-speak toggle (flashcard only) */}
        {reviewMode === 'flashcard' && (
          <Button variant="ghost" size="sm" onClick={() => setAutoSpeak(!autoSpeak)}
            className={cn('ml-auto rounded-xl text-[9px] font-black uppercase tracking-wider gap-1',
              autoSpeak ? 'bg-[#00B894]/10 text-[#00B894]' : 'bg-muted text-muted-foreground hover:text-[#00B894]')}>
            <Volume2 className="size-3" />{autoSpeak ? '静音' : '朗读'}
          </Button>
        )}
      </div>

      {/* SM-2 Progress stats */}
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

      {/* SM-2 status badge */}
      <div className="flex justify-center">
        <Badge className="rounded-full px-3 py-1 text-[10px] font-black bg-[#6C5CE7]/10 text-[#6C5CE7] border-violet-200">
          {reviewMode === 'flashcard' ? '闪卡复习' : reviewMode === 'choice' ? '选择检测' : reviewMode === 'spelling' ? '拼写检测' : '听写检测'}
          {state.progress[cw.word.toLowerCase()] && (
            <span className="ml-1.5 opacity-70">
              · {state.progress[cw.word.toLowerCase()].status === 'mastered' ? '已掌握' : '复习中'}
            </span>
          )}
        </Badge>
      </div>

      {/* ===== FLASHCARD MODE ===== */}
      {reviewMode === 'flashcard' && (
        <>
          <div className="flex justify-center">
            <AnimatePresence mode="wait">
              <motion.div key={cw.word + (isFlipped ? '-back' : '-front')} initial={{ opacity: 0, x: dir * 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 100 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }} className="w-full max-w-sm cursor-pointer" onClick={() => flip()}>
                <Card className={cn('rounded-[32px] border-2 shadow-xl transition-all min-h-[260px] flex flex-col justify-center',
                  isFlipped ? 'border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-500/10 dark:to-purple-500/10' : 'border-border bg-card')}>
                  <CardContent className="p-8 text-center">
                    {!isFlipped ? (
                      <>
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
                        <div className="flex items-center justify-center gap-2 mb-3">
                          <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-muted">{cw.register === 'formal' ? '正式' : cw.register === 'informal' ? '非正式' : '中性'}</Badge>
                          <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-muted">#{cw.frequencyRank}</Badge>
                        </div>
                        {cw.examples[0] && (
                          <div className="p-3 rounded-2xl bg-white/60 dark:bg-foreground/10 border border-violet-100 mb-3">
                            <div className="flex items-start gap-2">
                              <p className="text-sm text-foreground/80 italic font-medium flex-1">"{cleanText(cw.examples[0].en)}"</p>
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); tts.speak(cleanText(cw.examples[0].en)); }}
                                className="rounded-lg size-6 text-muted-foreground hover:text-[#6C5CE7] shrink-0"><Volume2 className="size-3.5" /></Button>
                            </div>
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

          {/* SM-2 Quality rating — shown after flip */}
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
                {currentIdx < queue.length - 1 ? '下一个' : '再来一组'}<ArrowRight className="size-4 ml-2" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* ===== CHOICE MODE ===== */}
      {reviewMode === 'choice' && cw && (
        <div className="max-w-md mx-auto space-y-4">
          <Card className="rounded-[28px] border-2 border-violet-100 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-500/10 dark:to-purple-500/10 shadow-lg">
            <CardContent className="p-6 text-center">
              <p className="text-sm font-bold text-muted-foreground mb-4">选择 "{cw.word}" 的正确释义</p>
              <div className="flex items-center justify-center gap-2 mb-3">
                <h2 className="text-3xl font-black italic text-foreground">{cw.word}</h2>
                <Button variant="ghost" size="icon" onClick={() => tts.speak(cw.word, { rate: 0.9 })}
                  className="rounded-xl size-8 text-muted-foreground hover:text-[#6C5CE7]"><Volume2 className="size-4" /></Button>
              </div>
              <p className="text-xs text-muted-foreground">{cw.phonetic}</p>
            </CardContent>
          </Card>
          <div className="space-y-2">
            {choiceOptions.map((opt) => {
              const isSelected = choiceSelected === opt.word;
              const isCorrect = opt.word === cw.word;
              let borderClass = 'border-border hover:border-[#6C5CE7]/50';
              if (isSelected) borderClass = isCorrect ? 'border-[#00B894] bg-[#00B894]/5' : 'border-rose-400 bg-rose-50';
              else if (choiceSelected && isCorrect) borderClass = 'border-[#00B894] bg-[#00B894]/5';
              return (
                <button key={opt.word} onClick={() => handleChoice(opt.word)}
                  className={cn('w-full p-3 rounded-2xl border-2 text-left text-sm font-medium transition-all', borderClass)}>
                  {opt.word} — {opt.meaning}
                </button>
              );
            })}
          </div>
          {choiceSelected && (
            <div className="flex justify-center">
              <Button onClick={advance} className="bg-[#6C5CE7] hover:bg-[#5A4BD1] text-white px-8 py-4 rounded-2xl text-xs font-black shadow-lg">
                {currentIdx < queue.length - 1 ? '下一个' : '再来一组'}<ArrowRight className="size-4 ml-2" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ===== SPELLING MODE ===== */}
      {reviewMode === 'spelling' && cw && (
        <div className="max-w-md mx-auto space-y-4">
          <Card className="rounded-[28px] border-2 border-sky-100 bg-gradient-to-br from-sky-50 to-blue-50 dark:from-sky-500/10 dark:to-blue-500/10 shadow-lg">
            <CardContent className="p-6 text-center">
              <p className="text-sm font-bold text-muted-foreground mb-4">根据释义拼写单词</p>
              <p className="text-xl font-black text-foreground mb-3">{cw.meaning}</p>
              <p className="text-xs text-muted-foreground">{cw.partOfSpeech} · {cw.phonetic}</p>
            </CardContent>
          </Card>
          <input type="text" value={spellingInput} onChange={(e) => setSpellingInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSpellingCheck(); }}
            disabled={spellingChecked}
            placeholder="输入单词..."
            className="w-full px-4 py-3 rounded-2xl bg-muted border-2 border-transparent focus:border-[#6C5CE7] text-center text-lg font-bold outline-none" />
          {!spellingChecked ? (
            <Button onClick={handleSpellingCheck} disabled={!spellingInput.trim()}
              className="w-full bg-[#6C5CE7] hover:bg-[#5A4BD1] text-white rounded-2xl text-xs font-black py-3 shadow-lg">检查</Button>
          ) : (
            <div className="space-y-3">
              <p className={cn('text-center text-sm font-black', spellingCorrect ? 'text-[#00B894]' : 'text-rose-500')}>
                {spellingCorrect ? '✓ 正确！' : `✗ 错误 · 正确: ${cw.word}`}
              </p>
              <Button onClick={advance} className="w-full bg-[#6C5CE7] hover:bg-[#5A4BD1] text-white rounded-2xl text-xs font-black py-3 shadow-lg">
                {currentIdx < queue.length - 1 ? '下一个' : '再来一组'}<ArrowRight className="size-4 ml-2" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ===== LISTENING MODE ===== */}
      {reviewMode === 'listening' && cw && (
        <div className="max-w-md mx-auto space-y-4">
          <Card className="rounded-[28px] border-2 border-rose-100 bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-500/10 dark:to-pink-500/10 shadow-lg">
            <CardContent className="p-6 text-center space-y-3">
              <p className="text-sm font-bold text-muted-foreground">听发音，拼写单词</p>
              <Button onClick={() => tts.speak(cw.word, { rate: 0.85 })}
                className="rounded-full size-16 bg-rose-100 hover:bg-rose-200 dark:bg-rose-500/20 text-rose-500 mx-auto flex items-center justify-center shadow-lg">
                <Volume2 className="size-7" />
              </Button>
              <p className="text-[10px] font-bold text-muted-foreground">点击播放发音</p>
            </CardContent>
          </Card>
          <input type="text" value={listeningInput} onChange={(e) => setListeningInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleListeningCheck(); }}
            disabled={listeningChecked}
            placeholder="输入听到的单词..."
            className="w-full px-4 py-3 rounded-2xl bg-muted border-2 border-transparent focus:border-[#6C5CE7] text-center text-lg font-bold outline-none" />
          {!listeningChecked ? (
            <Button onClick={handleListeningCheck} disabled={!listeningInput.trim()}
              className="w-full bg-[#6C5CE7] hover:bg-[#5A4BD1] text-white rounded-2xl text-xs font-black py-3 shadow-lg">检查</Button>
          ) : (
            <div className="space-y-3">
              <p className={cn('text-center text-sm font-black', listeningCorrect ? 'text-[#00B894]' : 'text-rose-500')}>
                {listeningCorrect ? '✓ 正确！' : `✗ 正确: ${cw.word} (${cw.meaning})`}
              </p>
              <Button onClick={advance} className="w-full bg-[#6C5CE7] hover:bg-[#5A4BD1] text-white rounded-2xl text-xs font-black py-3 shadow-lg">
                {currentIdx < queue.length - 1 ? '下一个' : '再来一组'}<ArrowRight className="size-4 ml-2" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Bottom navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={() => setIdx(Math.max(0, currentIdx - 1))} disabled={currentIdx === 0}
          className="rounded-2xl text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-[#6C5CE7]">
          <ArrowLeft className="size-3.5 mr-1" />上一张</Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setIdx(0); setFlipped(false); setRated(false); setSessionReviewCount(0); }}
            className="rounded-2xl text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-[#6C5CE7]">
            <RotateCw className="size-3.5 mr-1" />重置</Button>
          <Button variant="ghost" size="sm" onClick={() => setIdx(Math.floor(Math.random() * queue.length))}
            className="rounded-2xl text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-[#6C5CE7]">
            <Shuffle className="size-3.5 mr-1" />随机</Button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => advance()}
          className="rounded-2xl text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-[#6C5CE7]">
          下一张<ArrowRight className="size-3.5 ml-1" /></Button>
      </div>
    </div>
  );
}
