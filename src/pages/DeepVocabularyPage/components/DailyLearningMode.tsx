import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Target, CheckCircle2, RotateCw, Sparkles, Volume2, BookOpen, ArrowRight, XCircle, Edit3, Shuffle, Headphones, Link2, PenLine } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import type { IWordEntry } from '@/data/wordbank/schema';
import { findWord, getRandomWords, queryWords } from '@/data/wordbank';
import { useWordLearning } from '@/lib/use-word-learning';
import { useTTS } from '@/lib/use-tts';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type ReviewMode = 'flashcard' | 'choice' | 'spelling' | 'listening' | 'matching' | 'fillblank';

// Level color map
const LEVEL_COLORS: Record<string, { accent: string; bg: string; border: string; light: string; gradient: string; label: string }> = {
  all:     { accent: '#00B894', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', light: 'bg-emerald-50 dark:bg-emerald-500/15', gradient: 'from-emerald-500 to-[#00B894]', label: '全部' },
  cet4:    { accent: '#0EA5E9', bg: 'bg-sky-500/10', border: 'border-sky-500/20', light: 'bg-sky-50 dark:bg-sky-500/15', gradient: 'from-sky-500 to-cyan-500', label: '四级' },
  cet6:    { accent: '#6C5CE7', bg: 'bg-violet-500/10', border: 'border-violet-500/20', light: 'bg-violet-50 dark:bg-violet-500/15', gradient: 'from-violet-500 to-purple-500', label: '六级' },
  ielts:   { accent: '#F59E0B', bg: 'bg-amber-500/10', border: 'border-amber-500/20', light: 'bg-amber-50 dark:bg-amber-500/15', gradient: 'from-amber-500 to-orange-500', label: '雅思' },
  toefl:   { accent: '#EC4899', bg: 'bg-rose-500/10', border: 'border-rose-500/20', light: 'bg-rose-50 dark:bg-rose-500/15', gradient: 'from-rose-500 to-pink-500', label: '托福' },
  advanced:{ accent: '#64748B', bg: 'bg-slate-500/10', border: 'border-slate-500/20', light: 'bg-slate-50 dark:bg-slate-500/15', gradient: 'from-slate-500 to-gray-500', label: '高阶' },
};

// Mode color map
const MODE_COLORS: Record<ReviewMode, { accent: string; bg: string; gradient: string; icon: string }> = {
  flashcard: { accent: '#00B894', bg: 'bg-emerald-500/10', gradient: 'from-emerald-500/20 to-[#00B894]/10', icon: 'text-emerald-500' },
  choice:    { accent: '#6C5CE7', bg: 'bg-violet-500/10', gradient: 'from-violet-500/20 to-purple-500/10', icon: 'text-violet-500' },
  spelling:  { accent: '#F59E0B', bg: 'bg-amber-500/10', gradient: 'from-amber-500/20 to-orange-500/10', icon: 'text-amber-500' },
  listening: { accent: '#0EA5E9', bg: 'bg-sky-500/10', gradient: 'from-sky-500/20 to-cyan-500/10', icon: 'text-sky-500' },
  matching:  { accent: '#EC4899', bg: 'bg-rose-500/10', gradient: 'from-rose-500/20 to-pink-500/10', icon: 'text-rose-500' },
  fillblank: { accent: '#6366F1', bg: 'bg-indigo-500/10', gradient: 'from-indigo-500/20 to-blue-500/10', icon: 'text-indigo-500' },
};

interface LevelInfo { key: string; label: string; }
export default function DailyLearningMode({ level, onLevelChange, levels, counts, simple }: { level: string; onLevelChange?: (key: string) => void; levels?: LevelInfo[]; counts?: Record<string, number>; simple?: boolean }) {
  const { state, dailyQuota, setDailyQuota, todayRemaining, dueForReview, getNewWords, recordReview, resetProgress } = useWordLearning(level);
  const tts = useTTS();

  const [reviewMode, setReviewMode] = useState<ReviewMode>('flashcard');
  const [sessionWords, setSessionWords] = useState<IWordEntry[]>([]);
  const [levelToast, setLevelToast] = useState<string | null>(null);

  const levelColor = LEVEL_COLORS[level] || LEVEL_COLORS.all;
  const modeColor = MODE_COLORS[reviewMode];

  const handleLevelChange = (key: string) => {
    onLevelChange?.(key);
    const label = LEVEL_COLORS[key]?.label || key;
    setLevelToast(label);
    setTimeout(() => setLevelToast(null), 1200);
  };

  const MODE_LABEL_MAP: Record<ReviewMode, string> = { flashcard: '闪卡', choice: '选择题', spelling: '拼写', listening: '听写', matching: '配对', fillblank: '填空' };

  const handleModeChange = (mode: ReviewMode) => {
    if (mode !== reviewMode) {
      setReviewMode(mode);
      setSessionWords([]);
      toast.success(`切换至 ${MODE_LABEL_MAP[mode]}`, { duration: 1000 });
    }
  };
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setFlipped] = useState(false);
  const [rated, setRated] = useState(false);

  // Choice mode state
  const [choiceOptions, setChoiceOptions] = useState<IWordEntry[]>([]);
  const [choiceSelected, setChoiceSelected] = useState<string | null>(null);
  const [choiceCorrect, setChoiceCorrect] = useState<boolean | null>(null);

  // Spelling mode state
  const [spellingInput, setSpellingInput] = useState('');
  const [spellingChecked, setSpellingChecked] = useState(false);
  const [spellingCorrect, setSpellingCorrect] = useState(false);
  const [spellingHint, setSpellingHint] = useState(false);

  // Listening mode state
  const [listeningInput, setListeningInput] = useState('');
  const [listeningChecked, setListeningChecked] = useState(false);
  const [listeningCorrect, setListeningCorrect] = useState(false);
  const [listeningHint, setListeningHint] = useState(false);

  // Matching mode state
  const [matchPairs, setMatchPairs] = useState<{ word: string; meaning: string }[]>([]);
  const [matchShuffledWords, setMatchShuffledWords] = useState<string[]>([]);
  const [matchShuffledMeanings, setMatchShuffledMeanings] = useState<string[]>([]);
  const [selectedMatchWord, setSelectedMatchWord] = useState<string | null>(null);
  const [matchedWordSet, setMatchedWordSet] = useState<Set<string>>(new Set());
  const [matchFlashError, setMatchFlashError] = useState<string | null>(null);

  // Fill-blank mode state
  const [fillblankInput, setFillblankInput] = useState('');
  const [fillblankChecked, setFillblankChecked] = useState(false);
  const [fillblankCorrect, setFillblankCorrect] = useState(false);
  const [fillblankHint, setFillblankHint] = useState(false);

  const allWordsForLevel = useMemo(() => {
    return queryWords({ level: level === 'all' ? undefined : level });
  }, [level]);

  // Ref to track if TTS should auto-play on listening mode
  const ttsPlayedRef = useRef(false);

  // Reset session when level changes
  const resetAllState = () => {
    setSessionWords([]);
    setCurrentIdx(0);
    setFlipped(false);
    setRated(false);
    setChoiceSelected(null);
    setChoiceCorrect(null);
    setSpellingInput('');
    setSpellingChecked(false);
    setListeningInput('');
    setListeningChecked(false);
    setListeningCorrect(false);
    ttsPlayedRef.current = false;
    setSelectedMatchWord(null);
    setMatchedWordSet(new Set());
    setMatchFlashError(null);
    setFillblankInput('');
    setFillblankChecked(false);
    setFillblankCorrect(false);
  };

  useEffect(() => { resetAllState(); }, [level]);
  useEffect(() => { resetAllState(); }, [reviewMode]);

  // ===== 自动朗读效果 =====
  // 用 ref 存 tts，避免 tts 对象变化导致 effect 反复触发、中断朗读
  const ttsRef = useRef(tts);
  ttsRef.current = tts;
  // 记录上一次朗读的内容 key，防止同一内容重复朗读导致中断
  const lastSpokenKey = useRef('');

  // 闪卡模式：切换界面就停止上一次，读当前界面内容（正面读单词，反面读例句）
  useEffect(() => {
    if (reviewMode !== 'flashcard') return;
    const word = sessionWords[currentIdx];
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
        ttsRef.current.speak(word.examples[0].en, { rate: 0.85 });
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [reviewMode, currentIdx, isFlipped, sessionWords]);

  // 听写模式：只在换单词时朗读一次，拼写过程中不中断
  useEffect(() => {
    if (reviewMode !== 'listening') return;
    const word = sessionWords[currentIdx];
    if (!word || listeningChecked) return;
    const timer = setTimeout(() => {
      ttsRef.current.speak(word.word, { rate: 0.85 });
    }, 500);
    return () => clearTimeout(timer);
  }, [reviewMode, currentIdx, sessionWords, listeningChecked]);

  // Start a new learning session
  const startSession = () => {
    const reviewWords: IWordEntry[] = [];
    for (const p of dueForReview.slice(0, dailyQuota)) {
      const w = findWord(p.wordKey);
      if (w) reviewWords.push(w);
    }
    const remaining = Math.max(0, dailyQuota - reviewWords.length);
    const newOnes = remaining > 0 ? getNewWords(remaining) : [];
    const all = [...reviewWords, ...newOnes];
    if (all.length === 0) {
      setSessionWords([]);
      return;
    }
    setSessionWords(all);
    setCurrentIdx(0);
    setFlipped(false);
    setRated(false);
    setChoiceSelected(null);
    setChoiceCorrect(null);
    setSpellingInput('');
    setSpellingChecked(false);
    setListeningInput('');
    setListeningChecked(false);
    setListeningCorrect(false);
    ttsPlayedRef.current = false;
    setSelectedMatchWord(null);
    setMatchedWordSet(new Set());
    setMatchFlashError(null);
    setFillblankInput('');
    setFillblankChecked(false);
    setFillblankCorrect(false);
    // Pre-generate options for choice / matching modes
    if (reviewMode === 'choice') {
      generateChoiceOptions(all[0]);
    }
    if (reviewMode === 'matching') {
      generateMatchPairs(all[0], all);
    }
  };

  const currentWord = sessionWords[currentIdx];

  // Generate 4 options for choice mode
  const generateChoiceOptions = (word: IWordEntry) => {
    const others = allWordsForLevel.filter((w) => w.word !== word.word);
    const shuffled = [...others].sort(() => Math.random() - 0.5);
    const wrongs = shuffled.slice(0, 3);
    const opts = [word, ...wrongs].sort(() => Math.random() - 0.5);
    setChoiceOptions(opts);
    setChoiceSelected(null);
    setChoiceCorrect(null);
  };

  // Generate matching pairs
  const generateMatchPairs = (word: IWordEntry, pool: IWordEntry[]) => {
    const others = pool.filter((w) => w.word !== word.word);
    const shuffledOthers = [...others].sort(() => Math.random() - 0.5);
    const selected = [word, ...shuffledOthers.slice(0, 3)];
    const pairs = selected.map((w) => ({ word: w.word, meaning: w.meaning }));
    setMatchPairs(pairs);
    setMatchShuffledWords(pairs.map((p) => p.word).sort(() => Math.random() - 0.5));
    setMatchShuffledMeanings(pairs.map((p) => p.meaning).sort(() => Math.random() - 0.5));
    setSelectedMatchWord(null);
    setMatchedWordSet(new Set());
    setMatchFlashError(null);
  };

  // Get fill-blank sentence (replace word with ______)
  const getFillBlankSentence = (word: IWordEntry) => {
    if (word.examples[0]) {
      const sentence = word.examples[0].en;
      // Replace the word (case-insensitive) with blank
      const regex = new RegExp(word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      if (regex.test(sentence)) {
        return {
          sentence: sentence.replace(regex, '______'),
          zh: word.examples[0].zh,
        };
      }
    }
    // Fallback: use the meaning as a hint
    return { sentence: `______ (${word.meaning})`, zh: '' };
  };

  const handleRate = (q: number) => {
    if (!currentWord || rated) return;
    recordReview(currentWord, q);
    setRated(true);
  };

  const handleChoiceSelect = (word: string) => {
    if (choiceSelected) return;
    setChoiceSelected(word);
    const correct = word === currentWord.word;
    setChoiceCorrect(correct);
    recordReview(currentWord, correct ? 5 : 2);
    setRated(true);
  };

  const handleSpellingCheck = () => {
    if (spellingChecked) return;
    setSpellingChecked(true);
    const correct = spellingInput.trim().toLowerCase() === currentWord.word.toLowerCase();
    setSpellingCorrect(correct);
    recordReview(currentWord, correct ? 5 : 2);
    setRated(true);
  };

  const handleListeningCheck = () => {
    if (listeningChecked) return;
    setListeningChecked(true);
    const correct = listeningInput.trim().toLowerCase() === currentWord.word.toLowerCase();
    setListeningCorrect(correct);
    recordReview(currentWord, correct ? 5 : 2);
    setRated(true);
  };


  const handleMatchSelectWord = (word: string) => {
    if (matchedWordSet.has(word)) return; // already matched
    setMatchFlashError(null);
    setSelectedMatchWord(word);
  };

  const handleMatchSelectMeaning = (meaning: string) => {
    if (!selectedMatchWord) return;
    // Find which word this meaning belongs to
    const pair = matchPairs.find((p) => p.meaning === meaning);
    if (!pair) return;

    if (pair.word === selectedMatchWord) {
      // Correct match!
      const newMatched = new Set(matchedWordSet);
      newMatched.add(selectedMatchWord);
      setMatchedWordSet(newMatched);
      setSelectedMatchWord(null);
      setMatchFlashError(null);
    } else {
      // Wrong match — flash error
      setMatchFlashError(meaning);
      setTimeout(() => setMatchFlashError(null), 600);
      setSelectedMatchWord(null);
    }
  };

  // Check if all matching pairs are matched
  const allMatched = matchPairs.length > 0 && matchedWordSet.size >= matchPairs.length;

  useEffect(() => {
    if (allMatched && !rated) {
      recordReview(currentWord, 5);
      setRated(true);
    }
  }, [allMatched, rated, currentWord, recordReview]);

  const handleFillBlankCheck = () => {
    if (fillblankChecked) return;
    setFillblankChecked(true);
    const correct = fillblankInput.trim().toLowerCase() === currentWord.word.toLowerCase();
    setFillblankCorrect(correct);
    recordReview(currentWord, correct ? 5 : 2);
    setRated(true);
  };

  // Skip handlers: reveal answer, record as "forgot", show next
  const handleSpellingSkip = () => {
    if (spellingChecked) return;
    setSpellingChecked(true);
    setSpellingCorrect(false);
    setSpellingHint(true);
    recordReview(currentWord, 1); // quality 1 = forgot
    setRated(true);
  };
  const handleListeningSkip = () => {
    if (listeningChecked) return;
    setListeningChecked(true);
    setListeningCorrect(false);
    setListeningHint(true);
    recordReview(currentWord, 1);
    setRated(true);
  };
  const handleFillBlankSkip = () => {
    if (fillblankChecked) return;
    setFillblankChecked(true);
    setFillblankCorrect(false);
    setFillblankHint(true);
    recordReview(currentWord, 1);
    setRated(true);
  };

  const handleNext = () => {
    if (currentIdx < sessionWords.length - 1) {
      const nextIdx = currentIdx + 1;
      setCurrentIdx(nextIdx);
      setFlipped(false);
      setRated(false);
      setChoiceSelected(null);
      setChoiceCorrect(null);
      setSpellingInput('');
      setSpellingChecked(false);
      setListeningInput('');
      setListeningChecked(false);
      setListeningCorrect(false);
      ttsPlayedRef.current = false;
      setSelectedMatchWord(null);
      setMatchedWordSet(new Set());
      setMatchFlashError(null);
      setFillblankInput('');
      setFillblankChecked(false);
      setSpellingHint(false);
      setListeningHint(false);
      setFillblankHint(false);
      setFillblankCorrect(false);
      if (reviewMode === 'choice') {
        generateChoiceOptions(sessionWords[nextIdx]);
      }
      if (reviewMode === 'matching') {
        generateMatchPairs(sessionWords[nextIdx], sessionWords);
      }
    } else {
      startSession();
    }
  };

  const learnedToday = state.todayLearned.length;
  const reviewedToday = state.todayReviewed.length;

  const modeLabels: { key: ReviewMode; label: string; icon: typeof BookOpen }[] = [
    { key: 'flashcard', label: '闪卡', icon: BookOpen },
    { key: 'choice', label: '选择题', icon: Shuffle },
    { key: 'spelling', label: '拼写', icon: Edit3 },
    { key: 'listening', label: '听写', icon: Headphones },
    { key: 'matching', label: '配对', icon: Link2 },
    { key: 'fillblank', label: '填空', icon: PenLine },
  ];

  const currentLevelLabel = levels?.find((l) => l.key === level)?.label || '全部';
  const currentModeLabel = modeLabels.find((m) => m.key === reviewMode)?.label || '闪卡';

  return (
    <div className="space-y-4">
      {/* Learning header + level selector */}
      <div className="flex items-center justify-between gap-2 flex-wrap relative">
        <div className="flex items-center gap-2">
          <div
            className="size-8 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${levelColor.accent}15`, color: levelColor.accent }}
          >
            <Brain className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-black italic text-foreground">学习模式</h2>
          </div>
        </div>
        {/* Level switch toast */}
        {levelToast && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute -top-8 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-black text-white shadow-lg whitespace-nowrap"
            style={{ backgroundColor: levelColor.accent }}
          >
            已切换至 {levelToast}
          </motion.div>
        )}
        {onLevelChange && levels && (
          <div className="flex gap-1 flex-wrap">
            {levels.map((l) => {
              const lc = LEVEL_COLORS[l.key] || LEVEL_COLORS.all;
              const active = level === l.key;
              return (
                <button
                  key={l.key}
                  onClick={() => handleLevelChange(l.key)}
                  className={cn(
                    'px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-200',
                    active
                      ? 'text-white shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                  style={active ? { backgroundColor: lc.accent } : undefined}
                >
                  {l.label}<span className="ml-0.5 text-[8px] opacity-70 font-bold">{counts?.[l.key] ?? 0}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-100 text-center">
          <p className="text-lg font-black text-[#00B894]">{learnedToday}</p>
          <p className="text-[8px] font-black uppercase tracking-wider text-emerald-600">今日新学</p>
        </div>
        <div className="p-2.5 rounded-xl bg-violet-50 dark:bg-violet-500/15 border border-violet-100 text-center">
          <p className="text-lg font-black text-violet-500">{reviewedToday}</p>
          <p className="text-[8px] font-black uppercase tracking-wider text-violet-600">今日复习</p>
        </div>
        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-100 text-center">
          <p className="text-lg font-black text-amber-500">{dailyQuota}</p>
          <p className="text-[8px] font-black uppercase tracking-wider text-amber-600">每日目标</p>
        </div>
        <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-500/15 border border-sky-100 text-center">
          <p className="text-lg font-black text-sky-500">{Object.keys(state.progress).length}</p>
          <p className="text-[8px] font-black uppercase tracking-wider text-sky-600">已学单词</p>
        </div>
      </div>

      {/* Learning mode selector + quota — hidden in simple mode */}
      {!simple && (
      <Card className="rounded-2xl border-border shadow-sm">
        <CardContent className="p-3 space-y-3">
          {/* Mode selector */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground shrink-0">学习方式</span>
            <div className="flex gap-1 flex-wrap justify-end">
              {modeLabels.map(({ key, label, icon: Icon }) => {
                const mc = MODE_COLORS[key];
                const active = reviewMode === key;
                return (
                  <button
                    key={key}
                    onClick={() => handleModeChange(key)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all duration-200',
                      active
                        ? 'text-white shadow-sm'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80',
                    )}
                    style={active ? { backgroundColor: mc.accent } : undefined}
                  >
                    <Icon className="size-3" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quota */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Target className="size-3.5 text-amber-500" />
                每日学习量
              </span>
              <div className="flex items-center gap-1">
                {[10, 20, 50, 100, 200].map((n) => (
                  <button
                    key={n}
                    onClick={() => setDailyQuota(n)}
                    className={cn(
                      'px-2 py-0.5 rounded-lg text-[9px] font-bold transition-all',
                      dailyQuota === n ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Slider
                value={[Math.min(dailyQuota, 500)]}
                onValueChange={(v) => setDailyQuota(v[0])}
                min={5}
                max={500}
                step={5}
                className="flex-1"
              />
              <input
                type="number"
                min={1}
                max={9999}
                value={dailyQuota}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v > 0 && v <= 9999) setDailyQuota(v);
                }}
                className="w-16 px-2 py-1.5 rounded-lg bg-muted border-2 border-transparent focus:border-amber-300 focus:bg-white text-xs font-black text-center outline-none transition-all"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Learning session */}
      {sessionWords.length > 0 && currentWord ? (
        <AnimatePresence mode="wait">
          <motion.div
            key={level + reviewMode}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#00B894] to-emerald-400 rounded-full transition-all duration-300"
                style={{ width: `${((currentIdx + 1) / sessionWords.length) * 100}%` }}
              />
            </div>
            <span className="text-xs font-black text-muted-foreground tabular-nums">
              {currentIdx + 1}/{sessionWords.length}
            </span>
          </div>
          {/* Current level badge */}
          <div className="flex items-center justify-center gap-2">
            <Badge className="rounded-full px-2.5 py-0.5 text-[9px] font-black bg-emerald-500/10 text-emerald-600 border-emerald-200">{currentLevelLabel}</Badge>
            <Badge className="rounded-full px-2.5 py-0.5 text-[9px] font-black bg-[#6C5CE7]/10 text-[#6C5CE7] border-violet-200">{currentModeLabel}</Badge>
          </div>

          {/* ===== FLASHCARD MODE ===== */}
          {reviewMode === 'flashcard' && (
            <>
              <div className="flex justify-center">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentWord.word + (isFlipped ? '-back' : '-front')}
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -60 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                    className="w-full max-w-md cursor-pointer"
                    onClick={() => setFlipped(!isFlipped)}
                  >
                    <Card className={cn(
                      'rounded-[40px] border-2 shadow-xl transition-all min-h-[300px] flex flex-col justify-center',
                      isFlipped ? 'border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50' : 'border-border bg-card',
                    )}>
                      <CardContent className="p-10 text-center">
                        {!isFlipped ? (
                          <>
                            <Badge className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-muted text-muted-foreground mb-6">
                              {state.progress[currentWord.word.toLowerCase()] ? '复习' : '新学'}
                            </Badge>
                            <div className="flex items-center justify-center gap-3 mb-3">
                              <h2 className="text-5xl font-black italic text-foreground tracking-tight">{currentWord.word}</h2>
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); tts.speak(currentWord.word, { rate: 0.9 }); }} className="rounded-2xl bg-muted text-muted-foreground hover:text-[#00B894]">
                                <Volume2 className="size-5" />
                              </Button>
                            </div>
                            <p className="text-sm font-bold text-[#6C5CE7] mb-1">{currentWord.partOfSpeech}</p>
                            <p className="text-base text-muted-foreground font-medium">{currentWord.phonetic}</p>
                            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-6">
                              <Sparkles className="size-3.5 inline mr-1 text-[#00B894]" />点击翻转查看释义
                            </p>
                          </>
                        ) : (
                          <>
                            <Badge className="rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wider bg-indigo-100 dark:bg-indigo-500/20 text-indigo-500 mb-4">
                              释义 · {currentWord.partOfSpeech}
                            </Badge>
                            <p className="text-2xl font-black text-foreground mb-2">{currentWord.meaning}</p>
                            <div className="flex items-center justify-center gap-2 mb-4">
                              <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-muted">{currentWord.register === 'formal' ? '正式' : currentWord.register === 'informal' ? '非正式' : '中性'}</Badge>
                              <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-muted">#{currentWord.frequencyRank}</Badge>
                            </div>
                            {currentWord.examples[0] && (
                              <div className="p-4 rounded-2xl bg-white/60 border border-indigo-100 mb-4">
                                <p className="text-sm text-foreground/80 italic font-medium">"{currentWord.examples[0].en}"</p>
                                <p className="text-xs text-muted-foreground mt-2">{currentWord.examples[0].zh}</p>
                              </div>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Rating + Next — user manually rates and advances */}
              {isFlipped && !rated && (
                <div className="flex justify-center gap-3 flex-wrap">
                  {[
                    { q: 0, label: '完全忘了', color: 'bg-rose-500 hover:bg-rose-600' },
                    { q: 2, label: '有点印象', color: 'bg-orange-500 hover:bg-orange-600' },
                    { q: 3, label: '基本记得', color: 'bg-amber-500 hover:bg-amber-600' },
                    { q: 4, label: '比较熟悉', color: 'bg-emerald-500 hover:bg-emerald-600' },
                    { q: 5, label: '完全掌握', color: 'bg-[#00B894] hover:bg-[#00A080]' },
                  ].map(({ q, label, color }) => (
                    <button key={q} onClick={() => handleRate(q)}
                      className={cn('px-3 py-2 rounded-2xl text-white text-[10px] font-black uppercase tracking-wider shadow-lg transition-all hover:scale-105', color)}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {rated && (
                <div className="flex justify-center">
                  <Button onClick={handleNext} className="bg-[#00B894] hover:bg-[#00A080] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg">
                    {currentIdx < sessionWords.length - 1 ? '下一个' : '再来一组'}
                    <ArrowRight className="size-4 ml-2" />
                  </Button>
                </div>
              )}
            </>
          )}

          {/* ===== CHOICE MODE ===== */}
          {reviewMode === 'choice' && (
            <div className="space-y-4">
              <Card className="rounded-[40px] border-border shadow-sm">
                <CardContent className="p-10 text-center">
                  <Badge className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-muted text-muted-foreground mb-6">
                    {state.progress[currentWord.word.toLowerCase()] ? '复习' : '新学'}
                  </Badge>
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <h2 className="text-4xl font-black italic text-foreground tracking-tight">{currentWord.word}</h2>
                    <Button variant="ghost" size="icon" onClick={() => tts.speak(currentWord.word, { rate: 0.9 })} className="rounded-2xl bg-muted text-muted-foreground hover:text-[#00B894]">
                      <Volume2 className="size-5" />
                    </Button>
                  </div>
                  <p className="text-sm font-bold text-[#6C5CE7] mb-3">{currentWord.partOfSpeech} · {currentWord.phonetic}</p>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-8">
                    选择正确的中文释义
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {choiceOptions.map((opt) => {
                      const isSelected = choiceSelected === opt.word;
                      const isCorrect = opt.word === currentWord.word;
                      let borderClass = 'border-border hover:border-[#00B894]/40 bg-card';
                      if (choiceSelected) {
                        if (isCorrect) borderClass = 'border-emerald-500 bg-emerald-50';
                        else if (isSelected) borderClass = 'border-rose-400 bg-rose-50';
                      } else if (isSelected) {
                        borderClass = 'border-[#00B894] bg-[#00B894]/5';
                      }
                      return (
                        <button
                          key={opt.word}
                          onClick={() => handleChoiceSelect(opt.word)}
                          disabled={!!choiceSelected}
                          className={cn('p-4 rounded-2xl border-2 text-left transition-all', borderClass)}
                        >
                          <p className="text-sm font-bold text-foreground">{opt.meaning}</p>
                          {choiceSelected && isCorrect && <CheckCircle2 className="size-4 text-emerald-500 mt-1 inline" />}
                          {choiceSelected && isSelected && !isCorrect && <XCircle className="size-4 text-rose-500 mt-1 inline" />}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {choiceSelected && (
                <div className="flex justify-center">
                  <Button onClick={handleNext} className="bg-[#00B894] hover:bg-[#00A080] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg">
                    {currentIdx < sessionWords.length - 1 ? '下一个' : '再来一组'}
                    <ArrowRight className="size-4 ml-2" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ===== SPELLING MODE ===== */}
          {reviewMode === 'spelling' && (
            <div className="space-y-4">
              <Card className="rounded-[40px] border-border shadow-sm">
                <CardContent className="p-10 text-center">
                  <Badge className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-muted text-muted-foreground mb-6">
                    {state.progress[currentWord.word.toLowerCase()] ? '复习' : '新学'}
                  </Badge>
                  <p className="text-sm font-bold text-[#6C5CE7] mb-2">{currentWord.partOfSpeech}</p>
                  <p className="text-2xl font-black text-foreground mb-3">{currentWord.meaning}</p>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-8">
                    根据释义拼写单词
                  </p>

                  {/* Hint: first letter + word length */}
                  {spellingHint && !spellingChecked && (
                    <div className="mb-4 p-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 max-w-xs mx-auto">
                      <p className="text-xs font-black uppercase tracking-wider text-amber-600 mb-1">💡 提示</p>
                      <p className="text-lg font-mono font-black text-foreground tracking-[0.3em]">
                        {currentWord.word[0]}{' '}{'_ '.repeat(Math.max(0, currentWord.word.length - 1)).trim()}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">{currentWord.word.length} 个字母</p>
                    </div>
                  )}

                  <div className="flex gap-2 max-w-xs mx-auto">
                    <Input
                      value={spellingInput}
                      onChange={(e) => setSpellingInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSpellingCheck(); }}
                      placeholder="输入单词..."
                      disabled={spellingChecked}
                      className={cn(
                        'rounded-2xl text-lg font-bold text-center',
                        spellingChecked && (spellingCorrect ? 'border-emerald-500 bg-emerald-50' : 'border-rose-400 bg-rose-50'),
                      )}
                    />
                    {!spellingChecked && (
                      <Button onClick={handleSpellingCheck} disabled={!spellingInput.trim()} className="rounded-2xl bg-[#00B894] hover:bg-[#00A080] text-white">
                        确认
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-2 mt-3">
                    <Button variant="ghost" size="icon" onClick={() => tts.speak(currentWord.word, { rate: 0.9 })} className="rounded-2xl bg-muted text-muted-foreground hover:text-[#00B894]">
                      <Volume2 className="size-5" />
                    </Button>
                    <span className="text-xs text-muted-foreground font-medium">点击听发音</span>
                  </div>

                  {/* Hint + Skip buttons */}
                  {!spellingChecked && (
                    <div className="flex items-center justify-center gap-2 mt-3">
                      <Button variant="ghost" size="sm" onClick={() => setSpellingHint(true)}
                        className="rounded-xl text-[10px] font-black uppercase tracking-wider bg-amber-50 dark:bg-amber-500/10 text-amber-600 hover:bg-amber-100">
                        提示
                      </Button>
                      <Button variant="ghost" size="sm" onClick={handleSpellingSkip}
                        className="rounded-xl text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-rose-500">
                        不会，看答案
                      </Button>
                    </div>
                  )}

                  {spellingChecked && (
                    <div className="mt-4 space-y-2">
                      {spellingCorrect ? (
                        <div className="flex items-center justify-center gap-2 text-emerald-500">
                          <CheckCircle2 className="size-5" />
                          <span className="text-sm font-black uppercase tracking-wider">正确！</span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-center gap-2 text-rose-500">
                            <XCircle className="size-5" />
                            <span className="text-sm font-black uppercase tracking-wider">不正确</span>
                          </div>
                          <p className="text-lg font-black text-foreground">
                            正确答案：<span className="text-[#00B894] italic">{currentWord.word}</span>
                          </p>
                          <div className="flex items-center justify-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => tts.speak(currentWord.word, { rate: 0.8 })} className="rounded-xl bg-muted text-muted-foreground hover:text-[#00B894]">
                              <Volume2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {spellingChecked && (
                <div className="flex justify-center">
                  <Button onClick={handleNext} className="bg-[#00B894] hover:bg-[#00A080] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg">
                    {currentIdx < sessionWords.length - 1 ? '下一个' : '再来一组'}
                    <ArrowRight className="size-4 ml-2" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ===== LISTENING MODE ===== */}
          {reviewMode === 'listening' && (
            <div className="space-y-4">
              <Card className="rounded-[40px] border-border shadow-sm">
                <CardContent className="p-10 text-center">
                  <Badge className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-muted text-muted-foreground mb-6">
                    {state.progress[currentWord.word.toLowerCase()] ? '复习' : '新学'}
                  </Badge>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
                    听发音，写出单词
                  </p>

                  <div className="flex flex-col items-center gap-4 mb-6">
                    <button
                      onClick={() => tts.speak(currentWord.word, { rate: 0.85 })}
                      className="size-20 rounded-3xl bg-gradient-to-br from-[#6C5CE7] to-violet-400 text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform active:scale-95"
                    >
                      <Headphones className="size-9" />
                    </button>
                    <span className="text-xs text-muted-foreground font-medium">点击播放发音（可重复播放）</span>
                  </div>

                  {/* Hint: first letter + word length */}
                  {listeningHint && !listeningChecked && (
                    <div className="mb-4 p-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 max-w-xs mx-auto">
                      <p className="text-xs font-black uppercase tracking-wider text-amber-600 mb-1">💡 提示</p>
                      <p className="text-lg font-mono font-black text-foreground tracking-[0.3em]">
                        {currentWord.word[0]}{' '}{'_ '.repeat(Math.max(0, currentWord.word.length - 1)).trim()}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">{currentWord.word.length} 个字母</p>
                    </div>
                  )}

                  <div className="flex gap-2 max-w-xs mx-auto">
                    <Input
                      value={listeningInput}
                      onChange={(e) => setListeningInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleListeningCheck(); }}
                      placeholder="输入你听到的单词..."
                      disabled={listeningChecked}
                      className={cn(
                        'rounded-2xl text-lg font-bold text-center',
                        listeningChecked && (listeningCorrect ? 'border-emerald-500 bg-emerald-50' : 'border-rose-400 bg-rose-50'),
                      )}
                    />
                    {!listeningChecked && (
                      <Button onClick={handleListeningCheck} disabled={!listeningInput.trim()} className="rounded-2xl bg-[#00B894] hover:bg-[#00A080] text-white">
                        确认
                      </Button>
                    )}
                  </div>

                  {/* Hint + Skip buttons */}
                  {!listeningChecked && (
                    <div className="flex items-center justify-center gap-2 mt-3">
                      <Button variant="ghost" size="sm" onClick={() => setListeningHint(true)}
                        className="rounded-xl text-[10px] font-black uppercase tracking-wider bg-amber-50 dark:bg-amber-500/10 text-amber-600 hover:bg-amber-100">
                        提示
                      </Button>
                      <Button variant="ghost" size="sm" onClick={handleListeningSkip}
                        className="rounded-xl text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-rose-500">
                        不会，看答案
                      </Button>
                    </div>
                  )}

                  {listeningChecked && (
                    <div className="mt-4 space-y-2">
                      {listeningCorrect ? (
                        <div className="flex items-center justify-center gap-2 text-emerald-500">
                          <CheckCircle2 className="size-5" />
                          <span className="text-sm font-black uppercase tracking-wider">正确！</span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-center gap-2 text-rose-500">
                            <XCircle className="size-5" />
                            <span className="text-sm font-black uppercase tracking-wider">不正确</span>
                          </div>
                          <p className="text-lg font-black text-foreground">
                            正确答案：<span className="text-[#00B894] italic">{currentWord.word}</span>
                          </p>
                          <p className="text-sm text-muted-foreground">{currentWord.phonetic} · {currentWord.meaning}</p>
                          <div className="flex items-center justify-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => tts.speak(currentWord.word, { rate: 0.8 })} className="rounded-xl bg-muted text-muted-foreground hover:text-[#00B894]">
                              <Volume2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {listeningChecked && (
                <div className="flex justify-center">
                  <Button onClick={handleNext} className="bg-[#00B894] hover:bg-[#00A080] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg">
                    {currentIdx < sessionWords.length - 1 ? '下一个' : '再来一组'}
                    <ArrowRight className="size-4 ml-2" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ===== MATCHING MODE ===== */}
          {reviewMode === 'matching' && (
            <div className="space-y-4">
              <Card className="rounded-[40px] border-border shadow-sm">
                <CardContent className="p-6 sm:p-8">
                  <Badge className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-muted text-muted-foreground mb-4 mx-auto block w-fit">
                    {state.progress[currentWord.word.toLowerCase()] ? '复习' : '新学'}
                  </Badge>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-6 text-center">
                    点击单词，再点击对应释义进行配对
                  </p>

                  {allMatched && (
                    <div className="flex items-center justify-center gap-2 mb-4 text-emerald-500">
                      <CheckCircle2 className="size-5" />
                      <span className="text-sm font-black uppercase tracking-wider">全部配对成功！</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    {/* Left: words */}
                    <div className="space-y-2">
                      <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground text-center mb-2">单词</p>
                      {matchShuffledWords.map((word) => {
                        const isMatched = matchedWordSet.has(word);
                        const isSelected = selectedMatchWord === word;
                        return (
                          <button
                            key={word}
                            onClick={() => handleMatchSelectWord(word)}
                            disabled={isMatched}
                            className={cn(
                              'w-full p-3 rounded-2xl border-2 text-center font-bold text-sm transition-all',
                              isMatched && 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 cursor-default',
                              isSelected && 'border-[#6C5CE7] bg-violet-50 dark:bg-violet-500/15 text-[#6C5CE7]',
                              !isMatched && !isSelected && 'border-border bg-card hover:border-[#6C5CE7]/40 text-foreground',
                            )}
                          >
                            {word}
                          </button>
                        );
                      })}
                    </div>

                    {/* Right: meanings */}
                    <div className="space-y-2">
                      <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground text-center mb-2">释义</p>
                      {matchShuffledMeanings.map((meaning) => {
                        const pair = matchPairs.find((p) => p.meaning === meaning);
                        const isMatched = pair && matchedWordSet.has(pair.word);
                        const isError = matchFlashError === meaning;
                        return (
                          <button
                            key={meaning}
                            onClick={() => handleMatchSelectMeaning(meaning)}
                            disabled={isMatched}
                            className={cn(
                              'w-full p-3 rounded-2xl border-2 text-center font-bold text-xs transition-all',
                              isMatched && 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 cursor-default',
                              isError && 'border-rose-400 bg-rose-50 dark:bg-rose-500/15 text-rose-500 animate-pulse',
                              !isMatched && !isError && 'border-border bg-card hover:border-[#6C5CE7]/40 text-foreground',
                            )}
                          >
                            {isMatched ? `${meaning} ✓` : meaning}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {allMatched && rated && (
                <div className="flex justify-center">
                  <Button onClick={handleNext} className="bg-[#00B894] hover:bg-[#00A080] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg">
                    {currentIdx < sessionWords.length - 1 ? '下一个' : '再来一组'}
                    <ArrowRight className="size-4 ml-2" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ===== FILL-BLANK MODE ===== */}
          {reviewMode === 'fillblank' && (() => {
            const fb = getFillBlankSentence(currentWord);
            return (
              <div className="space-y-4">
                <Card className="rounded-[40px] border-border shadow-sm">
                  <CardContent className="p-10 text-center">
                    <Badge className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-muted text-muted-foreground mb-6">
                      {state.progress[currentWord.word.toLowerCase()] ? '复习' : '新学'}
                    </Badge>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-8">
                      根据句子和释义填入正确的单词
                    </p>

                    {/* Sentence with blank */}
                    <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10 border border-amber-200 dark:border-amber-500/20 mb-6">
                      <p className="text-lg font-bold text-foreground leading-relaxed italic">
                        {fb.sentence}
                      </p>
                      {fb.zh && (
                        <p className="text-sm text-muted-foreground mt-3 font-medium">{fb.zh}</p>
                      )}
                    </div>

                    {/* Hint: meaning */}
                    <div className="flex items-center justify-center gap-2 mb-6">
                      <span className="text-xs font-bold text-muted-foreground">提示：</span>
                      <span className="text-sm font-bold text-[#6C5CE7]">{currentWord.partOfSpeech} · {currentWord.meaning}</span>
                      <Button variant="ghost" size="icon" onClick={() => tts.speak(currentWord.word, { rate: 0.85 })} className="rounded-xl bg-muted text-muted-foreground hover:text-[#00B894]">
                        <Volume2 className="size-4" />
                      </Button>
                    </div>

                    <div className="flex gap-2 max-w-xs mx-auto">
                      <Input
                        value={fillblankInput}
                        onChange={(e) => setFillblankInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleFillBlankCheck(); }}
                        placeholder="填入单词..."
                        disabled={fillblankChecked}
                        className={cn(
                          'rounded-2xl text-lg font-bold text-center',
                          fillblankChecked && (fillblankCorrect ? 'border-emerald-500 bg-emerald-50' : 'border-rose-400 bg-rose-50'),
                        )}
                      />
                      {!fillblankChecked && (
                      <Button onClick={handleFillBlankCheck} disabled={!fillblankInput.trim()} className="rounded-2xl bg-[#00B894] hover:bg-[#00A080] text-white">
                        确认
                      </Button>
                    )}
                  </div>

                  {/* Hint + Skip buttons */}
                  {!fillblankChecked && (
                    <div className="flex items-center justify-center gap-2 mt-3">
                      <Button variant="ghost" size="sm" onClick={() => { setFillblankHint(true); setFillblankInput(currentWord.word[0]); }}
                        className="rounded-xl text-[10px] font-black uppercase tracking-wider bg-amber-50 dark:bg-amber-500/10 text-amber-600 hover:bg-amber-100">
                        💡 首字母
                      </Button>
                      <Button variant="ghost" size="sm" onClick={handleFillBlankSkip}
                        className="rounded-xl text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-rose-500">
                        不会，看答案
                      </Button>
                    </div>
                  )}

                    {fillblankChecked && (
                      <div className="mt-4 space-y-2">
                        {fillblankCorrect ? (
                          <div className="flex items-center justify-center gap-2 text-emerald-500">
                            <CheckCircle2 className="size-5" />
                            <span className="text-sm font-black uppercase tracking-wider">正确！</span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-center gap-2 text-rose-500">
                              <XCircle className="size-5" />
                              <span className="text-sm font-black uppercase tracking-wider">不正确</span>
                            </div>
                            <p className="text-lg font-black text-foreground">
                              正确答案：<span className="text-[#00B894] italic">{currentWord.word}</span>
                            </p>
                            <p className="text-sm text-muted-foreground">{currentWord.phonetic}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {fillblankChecked && (
                  <div className="flex justify-center">
                    <Button onClick={handleNext} className="bg-[#00B894] hover:bg-[#00A080] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg">
                      {currentIdx < sessionWords.length - 1 ? '下一个' : '再来一组'}
                      <ArrowRight className="size-4 ml-2" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
          </motion.div>
        </AnimatePresence>
      ) : (
        <Card className={cn('rounded-[40px] border-border shadow-sm overflow-hidden')}>
          {/* Colored top strip based on level */}
          <div className="h-2" style={{ backgroundColor: levelColor.accent }} />
          <CardContent className="p-16 text-center" style={{
            background: `linear-gradient(135deg, ${levelColor.accent}08 0%, ${modeColor.accent}08 100%)`
          }}>
            <div
              className="size-20 rounded-3xl mx-auto mb-4 flex items-center justify-center shadow-lg"
              style={{
                background: `linear-gradient(135deg, ${modeColor.accent}20, ${levelColor.accent}20)`,
                color: modeColor.accent
              }}
            >
              <BookOpen className="size-9" />
            </div>
            {/* Level + mode indicator with colors */}
            <div className="flex items-center justify-center gap-2 mb-3">
              <Badge
                className="rounded-full px-3 py-1 text-[10px] font-black text-white border-0"
                style={{ backgroundColor: levelColor.accent }}
              >
                {currentLevelLabel}
              </Badge>
              <span className="text-[10px] text-muted-foreground font-bold">·</span>
              <Badge
                className="rounded-full px-3 py-1 text-[10px] font-black text-white border-0"
                style={{ backgroundColor: modeColor.accent }}
              >
                {currentModeLabel}
              </Badge>
            </div>
            {dueForReview.length > 0 || todayRemaining > 0 ? (
              <>
                <h3 className="text-xl font-black text-foreground mb-2">准备好了吗？</h3>
                <p className="text-sm text-muted-foreground font-medium mb-6">
                  {dueForReview.length > 0 && `${dueForReview.length} 个单词待复习 · `}
                  今日还可新学 {todayRemaining} 个单词
                </p>
                <Button
                  onClick={startSession}
                  className="text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg"
                  style={{ background: `linear-gradient(135deg, ${modeColor.accent}, ${levelColor.accent})` }}
                >
                  <BookOpen className="size-4 mr-2" />
                  开始学习
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-xl font-black text-foreground mb-2">今日任务完成 🎉</h3>
                <p className="text-sm text-muted-foreground font-medium mb-6">
                  已学习 {learnedToday} 个新单词 · 复习了 {reviewedToday} 个
                </p>
                <div className="flex justify-center gap-3">
                  <Button onClick={startSession} variant="outline" className="rounded-2xl text-[10px] font-black uppercase tracking-wider">
                    继续加练
                  </Button>
                  <Button onClick={resetProgress} variant="ghost" className="rounded-2xl text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    <RotateCw className="size-3.5 mr-1" />重置进度
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
