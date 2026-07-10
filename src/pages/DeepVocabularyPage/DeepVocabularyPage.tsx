import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { BookOpen, Heart, Search, Volume2, Sparkles, ChevronLeft, ChevronRight, Bot, Wand2, Loader2, X, Brain, RotateCw, Play, Pause, SkipForward, Link2, ExternalLink, ArrowUpRight, Settings } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFavorites } from '@/lib/use-favorites';
import { useAI } from '@/hooks/use-ai';
import { safeStorage } from '@/lib/safe-storage';
import { cn, cleanText, extractJson } from '@/lib/utils';
import { useTTS } from '@/lib/use-tts';
import { toast } from 'sonner';
import type { IWordEntry } from '@/data/wordbank/schema';
import { queryWords, preloadLevels, isLevelReady, WORD_COUNTS, ALL_PARTS_OF_SPEECH } from '@/data/wordbank';
import { usePageMemory, usePageMemoryDebounced } from '@/lib/use-page-memory';
import FlashcardMode from './components/FlashcardMode';
import DailyLearningMode from './components/DailyLearningMode';
import CollocationsTab from './components/CollocationsTab';

interface IWordAiData { sentences: { en: string; zh: string }[]; explanation: string; }

const MEMORY_KEY = 'vocab-page';

const LEVELS = [
  { key: 'all', label: '全部' },
  { key: 'cet4', label: '四级' },
  { key: 'cet6', label: '六级' },
  { key: 'ielts', label: '雅思' },
  { key: 'toefl', label: '托福' },
  { key: 'advanced', label: '高阶' },
];

interface SetupStepProps {
  counts: Record<string, number>;
  onComplete: (level: string, tab: string, dailyCount: number, reviewMode?: string) => void;
  onContinue: () => void;
}

const BOOKS = [
  { key: 'cet4', label: '四级词汇', icon: '📗', color: '#00B894', desc: '大学英语四级考试核心词汇', gradient: 'from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10' },
  { key: 'cet6', label: '六级词汇', icon: '📘', color: '#0984E3', desc: '大学英语六级考试核心词汇', gradient: 'from-blue-50 to-sky-50 dark:from-blue-500/10 dark:to-sky-500/10' },
  { key: 'ielts', label: '雅思词汇', icon: '📙', color: '#E17055', desc: 'IELTS 雅思考试核心词汇', gradient: 'from-orange-50 to-amber-50 dark:from-orange-500/10 dark:to-amber-500/10' },
  { key: 'toefl', label: '托福词汇', icon: '📕', color: '#6C5CE7', desc: 'TOEFL 托福考试核心词汇', gradient: 'from-violet-50 to-purple-50 dark:from-violet-500/10 dark:to-purple-500/10' },
  { key: 'advanced', label: '高阶词汇', icon: '📓', color: '#2D3436', desc: 'GRE/SAT/考研高阶词汇', gradient: 'from-slate-50 to-gray-50 dark:from-slate-500/10 dark:to-gray-500/10' },
];

const MODES = [
  { key: 'daily', label: '每日学习', icon: '🧠', desc: '按计划每天学新词' },
  { key: 'flashcard', label: '复习检测', icon: '🔄', desc: 'SM-2 间隔记忆复习' },
  { key: 'browse', label: '词库浏览', icon: '📖', desc: '自由浏览全部词汇' },
  { key: 'collocations', label: '搭配学习', icon: '🔗', desc: '常用搭配与短语' },
] as const;

const REVIEW_MODES = [
  { key: 'sm2', label: '已学单词 (SM-2)', icon: '🧠', desc: '按间隔记忆算法复习需要巩固的单词' },
  { key: 'full', label: '整本随机', icon: '📚', desc: '随机抽取书内单词进行自测' },
] as const;

const DAILY_COUNTS = [5, 10, 20, 30, 50, 100];

function VocabSetupWizard({ counts, onComplete, onContinue }: SetupStepProps) {
  const [step, setStep] = useState(0);
  const [chosenLevel, setChosenLevel] = useState('');
  const [chosenMode, setChosenMode] = useState('daily');
  const [dailyCount, setDailyCount] = useState(10);
  const [reviewMode, setReviewMode] = useState('sm2');

  const handleBookSelect = (level: string) => {
    setChosenLevel(level);
    setStep(1);
  };

  const handleModeSelect = (mode: string) => {
    setChosenMode(mode);
    if (mode === 'daily') setStep(2);
    else if (mode === 'flashcard') setStep(2);
    else onComplete(chosenLevel, mode, 10);
  };

  const handleComplete = () => {
    onComplete(chosenLevel, chosenMode, dailyCount, chosenMode === 'flashcard' ? reviewMode : undefined);
  };

  const selectedBook = BOOKS.find((b) => b.key === chosenLevel);

  return (
    <div className="min-h-[60vh] flex flex-col justify-center py-6 px-2">
      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {['词书', '方式', '开始'].map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={cn(
              'size-8 rounded-full flex items-center justify-center text-xs font-black transition-all',
              i <= step ? 'bg-[#00B894] text-white shadow-lg shadow-emerald-200/50' : 'bg-muted text-muted-foreground',
            )}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={cn('text-xs font-bold', i <= step ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
            {i < 2 && <div className={cn('w-8 h-0.5 rounded', i < step ? 'bg-[#00B894]' : 'bg-muted')} />}
          </div>
        ))}
      </div>

      {/* Step 0: Choose Wordbook */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="text-center mb-6 space-y-1">
            <h2 className="text-xl font-black italic text-foreground">选择你的词书 📚</h2>
            <p className="text-xs text-muted-foreground">选择一本词书开始学习</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
            {BOOKS.map(({ key, label, icon, desc, gradient }) => (
              <button key={key} onClick={() => handleBookSelect(key)}
                className={cn('group rounded-[24px] p-4 text-left transition-all duration-300 bg-gradient-to-br border border-border/50 shadow-sm hover:shadow-lg hover:-translate-y-1 active:scale-[0.98]', gradient)}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{icon}</span>
                  <div>
                    <p className="text-sm font-black text-foreground">{label}</p>
                    <p className="text-[10px] text-muted-foreground">{desc}</p>
                    <p className="text-[10px] font-bold mt-1 opacity-50">{counts[key]?.toLocaleString() || '—'} 词</p>
                  </div>
                </div>
              </button>
            ))}
            <button onClick={() => handleBookSelect('all')}
              className="col-span-full rounded-[24px] p-4 text-center transition-all border-2 border-dashed border-border/50 hover:border-[#00B894] hover:bg-emerald-50/30 dark:hover:bg-emerald-500/5">
              <p className="text-sm font-black text-muted-foreground">📖 全部词库 · {Object.values(counts).reduce((a, b) => a + b, 0).toLocaleString()} 词</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">加载较慢，建议选择单本词书</p>
            </button>
          </div>
          <div className="text-center mt-4">
            <button onClick={onContinue} className="text-xs font-bold text-muted-foreground hover:text-[#00B894]">继续上次的选择 →</button>
          </div>
        </div>
      )}

      {/* Step 1: Choose Mode + Daily Count */}
      {step === 1 && (
        <div className="max-w-sm mx-auto space-y-6">
          <div className="text-center space-y-1">
            <p className="text-xs font-bold text-muted-foreground">已选词书</p>
            <p className="text-sm font-black text-foreground">{selectedBook?.icon} {selectedBook?.label} · {counts[chosenLevel]?.toLocaleString() || Object.values(counts).reduce((a, b) => a + b, 0).toLocaleString()} 词</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">学习方式</p>
            <div className="space-y-2">
              {MODES.map(({ key, label, icon, desc }) => (
                <button key={key} onClick={() => handleModeSelect(key)}
                  className={cn('w-full rounded-[20px] p-4 text-left transition-all border-2',
                    chosenMode === key ? 'border-[#00B894] bg-emerald-50/50 dark:bg-emerald-500/10' : 'border-border hover:border-muted-foreground/30')}>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{icon}</span>
                    <div>
                      <p className="text-sm font-black text-foreground">{label}</p>
                      <p className="text-[10px] text-muted-foreground">{desc}</p>
                    </div>
                    {chosenMode === key && <div className="ml-auto size-5 rounded-full bg-[#00B894] text-white flex items-center justify-center text-[10px]">✓</div>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(0)} className="rounded-2xl text-xs">← 返回</Button>
          </div>
        </div>
      )}

      {/* Step 2a: Daily learning — choose daily count */}
      {step === 2 && chosenMode === 'daily' && (
        <div className="max-w-sm mx-auto space-y-6">
          <div className="text-center space-y-1">
            <p className="text-xs font-bold text-muted-foreground">已选：{selectedBook?.icon} {selectedBook?.label}</p>
            <p className="text-xl font-black text-foreground">每日学习量</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {DAILY_COUNTS.map((n) => (
              <button key={n} onClick={() => setDailyCount(n)}
                className={cn('flex-1 py-3 rounded-2xl text-sm font-black transition-all',
                  dailyCount === n ? 'bg-[#00B894] text-white shadow-lg shadow-emerald-200/50' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>{n}词</button>
            ))}
          </div>
          {/* Custom input for no-limit daily count */}
          <div className="flex items-center justify-center gap-2">
            <span className="text-[10px] font-bold text-muted-foreground">自定义：</span>
            <input
              type="number"
              min={1}
              max={9999}
              value={dailyCount}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (v > 0 && v <= 9999) setDailyCount(v);
              }}
              className="w-20 px-3 py-2.5 rounded-xl bg-muted border-2 border-transparent focus:border-[#00B894] focus:bg-white text-sm font-black text-center outline-none transition-all"
            />
            <span className="text-[10px] font-bold text-muted-foreground">词/天</span>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="rounded-2xl text-xs">← 返回</Button>
            <Button onClick={handleComplete} className="flex-1 rounded-2xl bg-[#00B894] hover:bg-[#00a882] text-white font-black text-sm shadow-lg shadow-emerald-200/50">
              🚀 开始学习
            </Button>
          </div>
        </div>
      )}

      {/* Step 2b: Review — choose sub-mode */}
      {step === 2 && chosenMode === 'flashcard' && (
        <div className="max-w-sm mx-auto space-y-6">
          <div className="text-center space-y-1">
            <p className="text-xs font-bold text-muted-foreground">已选：{selectedBook?.icon} {selectedBook?.label}</p>
            <p className="text-xl font-black text-foreground">复习方式</p>
          </div>
          <div className="space-y-2">
            {REVIEW_MODES.map(({ key, label, icon, desc }) => (
              <button key={key} onClick={() => setReviewMode(key)}
                className={cn('w-full rounded-[20px] p-4 text-left transition-all border-2',
                  reviewMode === key ? 'border-[#6C5CE7] bg-violet-50/50 dark:bg-violet-500/10' : 'border-border hover:border-muted-foreground/30')}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">{icon}</span>
                  <div>
                    <p className="text-sm font-black text-foreground">{label}</p>
                    <p className="text-[10px] text-muted-foreground">{desc}</p>
                  </div>
                  {reviewMode === key && <div className="ml-auto size-5 rounded-full bg-[#6C5CE7] text-white flex items-center justify-center text-[10px]">✓</div>}
                </div>
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="rounded-2xl text-xs">← 返回</Button>
            <Button onClick={handleComplete} className="flex-1 rounded-2xl bg-[#6C5CE7] hover:bg-[#5a4bd1] text-white font-black text-sm shadow-lg shadow-violet-200/50">
              🚀 开始复习
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DeepVocabularyPage() {
  const { addFavorite, removeFavorite, isFavorited, favorites } = useFavorites();
  const { isConfigured, chat: aiChat } = useAI();
  const [memory, setMemory] = usePageMemory(MEMORY_KEY, {
    level: 'all', tab: 'daily', word: '',
    sortMode: 'az' as 'az' | 'frequency' | 'random',
    posFilter: 'all',
    registerFilter: 'all',
    collocOnly: false,
  });
  const [searchQuery, setSearchQuery] = usePageMemoryDebounced('vocab-search', '');
  const [selectedLevel, setSelectedLevel] = useState(memory.level);
  const [selectedWord, setSelectedWord] = useState<IWordEntry | null>(null);
  const [tab, setTab] = useState(memory.tab);
  const [sortMode, setSortMode] = useState<'az' | 'frequency' | 'random'>(memory.sortMode);
  const [posFilter, setPosFilter] = useState<string>(memory.posFilter);
  const [registerFilter, setRegisterFilter] = useState<string>(memory.registerFilter);
  const [collocOnly, setCollocOnly] = useState(memory.collocOnly);
  const [emotionFilter, setEmotionFilter] = useState<string>('all');
  const [noChineseEquivOnly, setNoChineseEquivOnly] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wordListRef = useRef<HTMLDivElement>(null);
  const counts = WORD_COUNTS;
  const totalWordCount = useMemo(() => Object.values(WORD_COUNTS).reduce((a, b) => a + b, 0), []);

  // Per-level memory: remember selected word & scroll position for each level
  const [levelMemory, setLevelMemory] = useState<Record<string, { word: string; scrollTop: number }>>(() => {
    try {
      const saved = safeStorage.getItem('__nativethink_level_memory');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const persistLevelMemory = (lm: Record<string, { word: string; scrollTop: number }>) => {
    setLevelMemory(lm);
    try { safeStorage.setItem('__nativethink_level_memory', JSON.stringify(lm)); } catch { /* ignore */ }
  };

  // Restore last selected word for initial level from level memory
  useEffect(() => {
    const saved = levelMemory[selectedLevel];
    if (saved?.word && !selectedWord) {
      const found = queryWords({ level: selectedLevel === 'all' ? undefined : selectedLevel, search: saved.word })[0] || null;
      if (found) {
        setSelectedWord(found);
        setMemory((p) => ({ ...p, word: found.word }));
        setTimeout(() => {
          if (wordListRef.current) wordListRef.current.scrollTop = saved.scrollTop || 0;
        }, 100);
      }
    }
  }, []); // run once on mount

  // Auto-play state for browse tab
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [autoPlayIdx, setAutoPlayIdx] = useState(0);
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Browse tab: level filter, memory, page size
  const SUB_LEVELS = ['cet4', 'cet6', 'ielts', 'toefl', 'advanced'] as const;
  const [browseMemoryFilter, setBrowseMemoryFilter] = useState<'all' | 'memorized' | 'unmemorized'>('all');
  const [browsePageSize, setBrowsePageSize] = useState(20);
  const [memorizedWords, setMemorizedWords] = useState<Set<string>>(() => {
    try { const s = safeStorage.getItem('__nativethink_browse_memorized'); return s ? new Set(JSON.parse(s)) : new Set(); }
    catch { return new Set(); }
  });
  const toggleMemorizedWord = (word: string) => {
    setMemorizedWords((prev) => {
      const next = new Set(prev);
      const key = word.toLowerCase();
      if (next.has(key)) next.delete(key); else next.add(key);
      safeStorage.setItem('__nativethink_browse_memorized', JSON.stringify([...next]));
      return next;
    });
  };

  // Use pre-computed constants (avoids loading all word data just for metadata)
  const allPartsOfSpeech = ALL_PARTS_OF_SPEECH;

  // ── Setup completion guard ──
  const SETUP_DONE_KEY = '__nativethink_vocab_setup_done';
  const [setupDone, setSetupDone] = useState(() => {
    try { return safeStorage.getItem(SETUP_DONE_KEY) === '1'; } catch { return false; }
  });
  // Separate from setupDone: controls whether the wizard overlay is visible.
  // First-time visitors see it automatically; returning users can reopen via "切换" button.
  const [showWizard, setShowWizard] = useState(!setupDone);
  const [reviewMode, setReviewMode] = useState(() => {
    try { return safeStorage.getItem('__nativethink_review_mode') || 'sm2'; } catch { return 'sm2'; }
  });

  // ── Lazy data loading ──
  const levelReady = (lv: string) => {
    if (lv === 'all') {
      return ['cet4', 'cet6', 'ielts', 'toefl', 'advanced'].every((l) => isLevelReady(l));
    }
    return isLevelReady(lv);
  };
  const [dataReady, setDataReady] = useState(() => setupDone || levelReady(selectedLevel));
  const [dataVersion, setDataVersion] = useState(0);
  useEffect(() => {
    if (setupDone || levelReady(selectedLevel)) { setDataReady(true); setDataVersion((v) => v + 1); return; }
    const levels = selectedLevel === 'all' ? ['cet4', 'cet6', 'ielts', 'toefl', 'advanced'] : [selectedLevel];
    preloadLevels(levels).then(() => { setDataReady(true); setDataVersion((v) => v + 1); });
  }, [selectedLevel, setupDone]);

  const markSetupDone = () => {
    try { safeStorage.setItem(SETUP_DONE_KEY, '1'); } catch { /* ignore */ }
    setSetupDone(true);
  };

  /** Re-open the wizard to switch word book / learning mode */
  const handleOpenWizard = () => setShowWizard(true);

  const handleWizardComplete = (level: string, mode: string, dailyCount: number, revMode?: string) => {
    setSelectedLevel(level);
    setTab(mode);
    setMemory((p) => ({ ...p, level, tab: mode }));
    try { safeStorage.setItem('__nativethink_daily_vocab_count', String(dailyCount)); } catch { /* ignore */ }
    if (revMode) { setReviewMode(revMode); try { safeStorage.setItem('__nativethink_review_mode', revMode); } catch { /* ignore */ } }
    markSetupDone();
    setShowWizard(false);
    const levels = level === 'all' ? ['cet4', 'cet6', 'ielts', 'toefl', 'advanced'] : [level];
    preloadLevels(levels).then(() => setDataReady(true));
  };

  const handleWizardContinue = () => {
    const lastLevel = memory.level || 'cet4';
    const lastTab = memory.tab || 'daily';
    setSelectedLevel(lastLevel);
    setTab(lastTab);
    markSetupDone();
    setShowWizard(false);
    const levels = lastLevel === 'all' ? ['cet4', 'cet6', 'ielts', 'toefl', 'advanced'] : [lastLevel];
    preloadLevels(levels).then(() => setDataReady(true));
  };

  // Active filter count + reset
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (posFilter !== 'all') n++;
    if (registerFilter !== 'all') n++;
    if (emotionFilter !== 'all') n++;
    if (collocOnly) n++;
    if (noChineseEquivOnly) n++;
    return n;
  }, [posFilter, registerFilter, emotionFilter, collocOnly, noChineseEquivOnly]);

  const resetFilters = () => {
    setPosFilter('all');
    setRegisterFilter('all');
    setEmotionFilter('all');
    setCollocOnly(false);
    setNoChineseEquivOnly(false);
  };

  // Browse level colors
  const LEVEL_COLORS: Record<string, string> = {
    cet4: '#00B894', cet6: '#0984E3', ielts: '#F59E0B', toefl: '#6C5CE7', advanced: '#64748B',
  };
  const LEVEL_LABELS: Record<string, string> = {
    cet4: '四级', cet6: '六级', ielts: '雅思', toefl: '托福', advanced: '高阶',
  };

  // filteredWords must be declared BEFORE it's used in startAutoPlay & useEffect
  const filteredWords = useMemo(() => {
    let words = queryWords({
      level: selectedLevel === 'all' ? undefined : selectedLevel,
      search: searchQuery || undefined,
      sortBy: sortMode === 'az' ? 'alphabetical' : sortMode === 'frequency' ? 'frequency' : undefined,
      pos: posFilter !== 'all' ? posFilter : undefined,
      register: registerFilter !== 'all' ? registerFilter : undefined,
    });
    // Client-side filters
    if (collocOnly) words = words.filter((w) => w.collocations.length > 0);
    if (emotionFilter !== 'all') words = words.filter((w) => w.emotion === emotionFilter);
    if (noChineseEquivOnly) words = words.filter((w) => w.hasNoChineseEquivalent);
    // Memory filter
    if (browseMemoryFilter === 'memorized') words = words.filter((w) => memorizedWords.has(w.word.toLowerCase()));
    else if (browseMemoryFilter === 'unmemorized') words = words.filter((w) => !memorizedWords.has(w.word.toLowerCase()));
    if (sortMode === 'random') {
      const arr = [...words];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    return words;
  }, [selectedLevel, searchQuery, sortMode, collocOnly, posFilter, registerFilter, emotionFilter, noChineseEquivOnly, browseMemoryFilter, memorizedWords, dataReady, dataVersion]);

  // tts must be declared BEFORE it's used in the auto-play effect
  const tts = useTTS();

  const stopAutoPlay = useCallback(() => {
    setAutoPlaying(false);
    if (autoPlayTimerRef.current) { clearTimeout(autoPlayTimerRef.current); autoPlayTimerRef.current = null; }
  }, []);

  const startAutoPlay = useCallback(() => {
    if (filteredWords.length === 0) return;
    setAutoPlaying(true);
    setAutoPlayIdx(0);
  }, [filteredWords.length]);

  // Auto-play effect: speak each word sequentially
  useEffect(() => {
    if (!autoPlaying) return;
    if (autoPlayIdx >= filteredWords.length) { stopAutoPlay(); return; }
    const word = filteredWords[autoPlayIdx];
    tts.speak(word.word, { rate: 0.85 });
    autoPlayTimerRef.current = setTimeout(() => {
      setAutoPlayIdx((p) => p + 1);
    }, 2000);
    return () => { if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current); };
  }, [autoPlaying, autoPlayIdx, filteredWords, tts, stopAutoPlay]);

  // AI-generated word content (sentences + deep explanation)
  const [aiWordData, setAiWordData] = useState<Record<string, IWordAiData>>(() => {
    try {
      const saved = safeStorage.getItem('__nativethink_word_ai_data');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [genSentencesFor, setGenSentencesFor] = useState<string | null>(null);
  const [genExplanationFor, setGenExplanationFor] = useState<string | null>(null);

  // Collocation lookup
  const [collocDetail, setCollocDetail] = useState<{ phrase: string; meaning: string; examples: { en: string; zh: string }[] } | null>(null);
  const [collocLoading, setCollocLoading] = useState(false);
  const [collocOpen, setCollocOpen] = useState(false);

  // Cache for collocation lookups (phrase → { meaning, examples })
  const [collocCache, setCollocCache] = useState<Record<string, { meaning: string; examples: { en: string; zh: string }[] }>>(() => {
    try {
      const saved = safeStorage.getItem('__nativethink_colloc_cache');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const handleLookupCollocation = async (phrase: string) => {
    const key = phrase.toLowerCase();
    const cached = collocCache[key];

    // Instant: show cached result
    if (cached) {
      setCollocDetail({ phrase, meaning: cached.meaning, examples: cached.examples });
      setCollocOpen(true);
      return;
    }

    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    setCollocLoading(true);
    setCollocDetail(null);
    setCollocOpen(true);
    try {
      const result = await aiChat(
        [
          { role: 'system', content: `You are an English teacher. Analyze the given English phrase/collocation. Return ONLY valid JSON (no markdown): {"phrase": "the phrase", "meaning": "Chinese meaning and usage explanation", "examples": [{"en": "example sentence", "zh": "Chinese translation"}, ...]} Generate 3 diverse example sentences with translations.` },
          { role: 'user', content: `Look up: "${phrase}"` },
        ],
        { temperature: 0.5, maxTokens: 1024 },
      );
      const parsed = extractJson<{ phrase?: string; meaning?: string; examples?: { en: string; zh: string }[] }>(result);
      const detail = {
        phrase: parsed.phrase || phrase,
        meaning: parsed.meaning || '暂无释义',
        examples: (parsed.examples || []).filter((e) => e.en && e.zh),
      };
      setCollocDetail(detail);
      // Save to cache
      const cacheEntry = { meaning: detail.meaning, examples: detail.examples };
      setCollocCache((prev) => {
        const next = { ...prev, [key]: cacheEntry };
        safeStorage.setItem('__nativethink_colloc_cache', JSON.stringify(next));
        return next;
      });
      if (!parsed.phrase && !parsed.meaning) toast.error('AI 返回内容不完整');
    } catch (e: any) { toast.error(e?.message || '查询失败'); }
    finally { setCollocLoading(false); }
  };

  /** Quick inline translation — returns Chinese meaning only (no dialog) */
  const handleTranslateCollocQuick = async (phrase: string): Promise<string> => {
    if (!isConfigured) throw new Error('请先配置 AI API Key');
    const result = await aiChat(
      [
        { role: 'system', content: 'You are a translator. Translate the given English collocation/phrase into concise Chinese. Return ONLY the Chinese translation, no explanation, no markdown, no extra text. Maximum 15 Chinese characters.' },
        { role: 'user', content: `Translate: "${phrase}"` },
      ],
      { temperature: 0.3, maxTokens: 64 },
    );
    const cleaned = result.trim().replace(/^["']|["']$/g, '');
    if (!cleaned || cleaned.length > 50) throw new Error('翻译结果异常');
    return cleaned;
  };

  useEffect(() => {
    safeStorage.setItem('__nativethink_word_ai_data', JSON.stringify(aiWordData));
  }, [aiWordData]);

  const wordKey = (w: IWordEntry) => w.word.toLowerCase();

  const handleGenerateWordSentences = async (word: IWordEntry) => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    const key = wordKey(word);
    setGenSentencesFor(key);
    try {
      const result = await aiChat(
        [
          { role: 'system', content: `You are an English teacher. Generate 3 diverse, natural example sentences using the given word, each with a Chinese translation. Use different contexts — casual, formal, and academic. Return ONLY valid JSON array of objects, no markdown: [{"en": "sentence", "zh": "中文翻译"}, ...]` },
          { role: 'user', content: `Generate 3 example sentences using: "${word.word}" (${word.partOfSpeech}, meaning: ${word.meaning}). Each must have a Chinese translation.` },
        ],
        { temperature: 0.8, maxTokens: 1024 },
      );
      const parsed = extractJson<{ en: string; zh: string }[]>(result);
      if (!Array.isArray(parsed) || parsed.length === 0) { toast.error('AI 未生成有效例句'); return; }
      const items = parsed
        .map((item) => ({ en: item.en || '', zh: item.zh || '' }))
        .filter((item) => item.en && item.zh);
      if (items.length === 0) { toast.error('AI 未生成有效例句'); return; }
      setAiWordData((prev) => ({
        ...prev,
        [key]: { ...prev[key], sentences: [...(prev[key]?.sentences || []), ...items].slice(0, 10) },
      }));
      toast.success(`AI 已生成 ${items.length} 条例句！`);
    } catch (e: any) { toast.error(e?.message || 'AI 生成失败'); }
    finally { setGenSentencesFor(null); }
  };

  const handleGenerateDeepExplanation = async (word: IWordEntry) => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    const key = wordKey(word);
    setGenExplanationFor(key);
    try {
      const result = await aiChat(
        [
          { role: 'system', content: `You are an English vocabulary teacher for Chinese learners. Provide a deep analysis in Chinese. Cover: 1) Nuanced meaning and connotations, 2) Common usage patterns and collocations, 3) Differences from similar words, 4) Cultural or contextual notes. Format with ## headers and bullet points. Keep to 200-400 Chinese characters.` },
          { role: 'user', content: `Word: "${word.word}" (${word.partOfSpeech}). Meaning: ${word.meaning}. Level: ${word.level}. Please analyze.` },
        ],
        { temperature: 0.6, maxTokens: 1024 },
      );
      if (!result || result.trim().length < 20) { toast.error('AI 返回内容过短，请重试'); return; }
      setAiWordData((prev) => ({
        ...prev,
        [key]: { ...prev[key], explanation: result.trim() },
      }));
      toast.success('AI 深度解析已生成！');
    } catch { toast.error('AI 生成失败'); }
    finally { setGenExplanationFor(null); }
  };

  const handleDeleteVocabSentence = (wKey: string, idx: number) => {
    setAiWordData((prev) => {
      const updated = { ...prev };
      if (!updated[wKey]) return prev;
      updated[wKey] = { ...updated[wKey], sentences: updated[wKey].sentences.filter((_, i) => i !== idx) };
      if (updated[wKey].sentences.length === 0 && !updated[wKey].explanation) delete updated[wKey];
      return updated;
    });
  };

  const handleDeleteVocabExplanation = (wKey: string) => {
    setAiWordData((prev) => {
      const updated = { ...prev };
      if (!updated[wKey]) return prev;
      updated[wKey] = { ...updated[wKey], explanation: '' };
      if (updated[wKey].sentences.length === 0 && !updated[wKey].explanation) delete updated[wKey];
      return updated;
    });
  };

  // Restore previously selected word after words load
  useEffect(() => {
    if (memory.word && !selectedWord && filteredWords.length > 0) {
      const found = filteredWords.find((w) => w.word === memory.word);
      if (found) setSelectedWord(found);
    }
  }, [filteredWords, memory.word, selectedWord]);

  // Auto-speak word when selected in browse tab — 每次切换都朗读
  const browseTtsRef = useRef(tts);
  browseTtsRef.current = tts;

  useEffect(() => {
    if (!selectedWord || tab !== 'browse') return;
    browseTtsRef.current.speak(selectedWord.word, { rate: 0.85 });
  }, [selectedWord, tab]);

  const switchLevel = (level: string) => {
    // Save current level state
    const curScroll = wordListRef.current?.scrollTop || 0;
    const curWord = selectedWord?.word || '';
    const updated = { ...levelMemory, [selectedLevel]: { word: curWord, scrollTop: curScroll } };

    // Restore target level state
    const target = updated[level];
    const targetWord = target?.word ? queryWords({ level: level === 'all' ? undefined : level, search: target.word })[0] || null : null;

    setSelectedLevel(level);
    setSelectedWord(targetWord);
    setPosFilter('all');
    setRegisterFilter('all');
    setEmotionFilter('all');
    setCollocOnly(false);
    setNoChineseEquivOnly(false);
    setMemory((p) => ({ ...p, level, word: targetWord?.word || '' }));
    persistLevelMemory(updated);

    // Scroll to remembered position after re-render
    setTimeout(() => {
      if (wordListRef.current && target?.scrollTop) {
        wordListRef.current.scrollTop = target.scrollTop;
      }
    }, 80);
  };
  const scrollSelector = (dir: 'left' | 'right') => { if (scrollRef.current) scrollRef.current.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' }); };

  const handleSelectWord = (w: IWordEntry) => {
    setSelectedWord(w);
    setMemory((p) => ({ ...p, word: w.word }));
    // Remember this selection for the current level
    const curScroll = wordListRef.current?.scrollTop || 0;
    persistLevelMemory({ ...levelMemory, [selectedLevel]: { word: w.word, scrollTop: curScroll } });
  };
  const handleTabChange = (v: string) => { setTab(v); setMemory((p) => ({ ...p, tab: v })); };

  /** Open word detail in a small popup from collocations tab */
  const [collocWordPopup, setCollocWordPopup] = useState<IWordEntry | null>(null);

  const handleSelectWordFromColloc = (word: IWordEntry) => {
    setCollocWordPopup(word);
  };

  // Sync browse filters back to persistent memory
  useEffect(() => { setMemory((p) => ({ ...p, sortMode })); }, [sortMode, setMemory]);
  useEffect(() => { setMemory((p) => ({ ...p, posFilter })); }, [posFilter, setMemory]);
  useEffect(() => { setMemory((p) => ({ ...p, registerFilter })); }, [registerFilter, setMemory]);
  useEffect(() => { setMemory((p) => ({ ...p, collocOnly })); }, [collocOnly, setMemory]);

  const toggleFavorite = (word: IWordEntry) => {
    if (isFavorited(word.word, 'vocabulary')) {
      const fav = favorites.find((f) => f.content === word.word && f.type === 'vocabulary');
      if (fav) removeFavorite(fav.id);
    } else {
      addFavorite({ type: 'vocabulary', content: word.word, meaning: word.meaning, example: word.examples[0]?.en || '', category: word.level });
    }
  };

  // Word list pagination with configurable page size
  const [wordPage, setWordPage] = useState(0);
  const totalWordPages = Math.max(1, Math.ceil(filteredWords.length / browsePageSize));
  const pagedWords = useMemo(
    () => filteredWords.slice(wordPage * browsePageSize, (wordPage + 1) * browsePageSize),
    [filteredWords, wordPage, browsePageSize],
  );
  // Reset page when filters/search change
  useEffect(() => { setWordPage(0); }, [filteredWords.length]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black italic text-foreground tracking-tight">词汇深度</h1>
          <p className="text-muted-foreground text-xs font-medium">
            {LEVELS.find((l) => l.key === selectedLevel)?.label || '全部'} · {MODES.find((m) => m.key === tab)?.label || '学习'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleOpenWizard}
          className="rounded-2xl text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-[#00B894] hover:bg-emerald-50 dark:hover:bg-emerald-500/10 gap-1.5"
        >
          <Settings className="size-3.5" />
          切换词书
        </Button>
      </div>

      {showWizard && (
        <VocabSetupWizard
          counts={counts}
          onComplete={handleWizardComplete}
          onContinue={handleWizardContinue}
        />
      )}

      <Tabs value={tab} onValueChange={handleTabChange} className={cn('w-full', showWizard && 'hidden')}>
        {/* Sticky header: browse level scroller + filter chips + tab buttons */}
        <div className="sticky top-20 z-30 bg-background/95 backdrop-blur-md pb-3 -mx-1 px-1">
          {/* 等级筛选滚轮 — only in browse mode */}
          {tab === 'browse' && (
            <>
            {/* Filter bar: compact chip-style */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* 词性 */}
              <select value={posFilter} onChange={(e) => setPosFilter(e.target.value)}
                className={cn('px-2.5 py-1.5 rounded-xl text-[10px] font-bold border-none outline-none focus:ring-2 focus:ring-[#00B894]/30 transition-colors',
                  posFilter !== 'all' ? 'bg-[#00B894]/10 text-[#00B894]' : 'bg-muted text-muted-foreground')}>
                <option value="all">词性</option>
                {allPartsOfSpeech.map((pos) => (<option key={pos} value={pos}>{pos}</option>))}
              </select>
              {/* 语域 */}
              <select value={registerFilter} onChange={(e) => setRegisterFilter(e.target.value)}
                className={cn('px-2.5 py-1.5 rounded-xl text-[10px] font-bold border-none outline-none focus:ring-2 focus:ring-[#00B894]/30 transition-colors',
                  registerFilter !== 'all' ? 'bg-[#00B894]/10 text-[#00B894]' : 'bg-muted text-muted-foreground')}>
                <option value="all">语域</option>
                <option value="formal">正式</option>
                <option value="neutral">中性</option>
                <option value="informal">非正式</option>
              </select>
              {/* 情感色彩 */}
              <select value={emotionFilter} onChange={(e) => setEmotionFilter(e.target.value)}
                className={cn('px-2.5 py-1.5 rounded-xl text-[10px] font-bold border-none outline-none focus:ring-2 focus:ring-[#00B894]/30 transition-colors',
                  emotionFilter !== 'all' ? 'bg-[#00B894]/10 text-[#00B894]' : 'bg-muted text-muted-foreground')}>
                <option value="all">情感</option>
                <option value="positive">积极</option>
                <option value="neutral">中性</option>
                <option value="negative">消极</option>
              </select>
              {/* 有搭配词 */}
              <button onClick={() => setCollocOnly(!collocOnly)}
                className={cn('px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all border-2',
                  collocOnly ? 'border-[#00B894] bg-[#00B894]/10 text-[#00B894]' : 'border-border bg-muted text-muted-foreground hover:border-muted-foreground/30')}>
                有搭配词
              </button>
              {/* 中文无对应 */}
              <button onClick={() => setNoChineseEquivOnly(!noChineseEquivOnly)}
                className={cn('px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all border-2',
                  noChineseEquivOnly ? 'border-[#00B894] bg-[#00B894]/10 text-[#00B894]' : 'border-border bg-muted text-muted-foreground hover:border-muted-foreground/30')}>
                中文无对应
              </button>
              {/* 排序：A-Z → 序号 → 乱序 */}
              <button
                onClick={() => setSortMode((p) => p === 'az' ? 'frequency' : p === 'frequency' ? 'random' : 'az')}
                className={cn('px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all border-2',
                  sortMode === 'az' ? 'border-[#00B894] bg-[#00B894]/10 text-[#00B894]' :
                  sortMode === 'frequency' ? 'border-[#6C5CE7] bg-[#6C5CE7]/10 text-[#6C5CE7]' :
                  'border-amber-400 bg-amber-50 text-amber-500')}>
                {sortMode === 'az' ? 'A-Z' : sortMode === 'frequency' ? '序号' : '乱序'}
              </button>
              {/* 重置 */}
              {activeFilterCount > 0 && (
                <button onClick={resetFilters}
                  className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all border-2 border-rose-200 dark:border-rose-500/20 flex items-center gap-1">
                  <X className="size-3" />{activeFilterCount}
                </button>
              )}
              {/* 自动朗读 */}
              <div className="flex items-center gap-1 ml-auto">
                {autoPlaying ? (
                  <>
                    <span className="text-[10px] font-bold text-[#00B894] tabular-nums">{autoPlayIdx + 1}/{filteredWords.length}</span>
                    <Button variant="ghost" size="icon" onClick={stopAutoPlay} className="rounded-xl size-7 bg-rose-50 dark:bg-rose-500/15 text-rose-500 hover:bg-rose-100">
                      <Pause className="size-3.5" />
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" onClick={startAutoPlay} disabled={filteredWords.length === 0} className="rounded-xl text-[10px] font-black uppercase tracking-wider bg-[#00B894]/10 text-[#00B894] hover:bg-[#00B894]/20 gap-1">
                    <Play className="size-3.5" />自动朗读
                  </Button>
                )}
              </div>
            </div>
            </>
          )}
          <TabsList className="bg-muted p-1.5 rounded-3xl h-auto">
          <TabsTrigger value="daily" className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-emerald-500 data-[state=active]:shadow-sm"><Brain className="size-4 mr-2" />学习</TabsTrigger>
          <TabsTrigger value="flashcard" className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#6C5CE7] data-[state=active]:shadow-sm"><RotateCw className="size-4 mr-2" />复习</TabsTrigger>
          <TabsTrigger value="browse" className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-sky-500 data-[state=active]:shadow-sm"><BookOpen className="size-4 mr-2" />词库浏览</TabsTrigger>
          <TabsTrigger value="collocations" className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-amber-500 data-[state=active]:shadow-sm"><Link2 className="size-4 mr-2" />搭配学习</TabsTrigger>
        </TabsList>
        </div>{/* end sticky header */}

        <TabsContent value="daily" className="mt-0">
          <DailyLearningMode level={selectedLevel} counts={counts} simple />
        </TabsContent>

        <TabsContent value="flashcard" className="mt-0">
          <FlashcardMode level={selectedLevel} counts={counts} reviewMode={reviewMode} />
        </TabsContent>

        <TabsContent value="browse" className="mt-0">
          <div className="grid grid-cols-12 gap-6">
            {/* Left: word list */}
            <div className="col-span-12 lg:col-span-5 lg:sticky lg:top-56 self-start">
              <Card className="rounded-[32px] border-border shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="size-10 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 text-[#00B894] flex items-center justify-center">
                      <BookOpen className="size-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-[900] italic text-foreground">词库浏览</CardTitle>
                      <CardDescription className="text-xs font-medium mt-0.5">
                        {filteredWords.length} 个单词 · {memorizedWords.size} 已记
                      </CardDescription>
                    </div>
                  </div>

                  {/* Word count summary */}
                  <div className="flex items-center gap-1 flex-wrap mb-3 text-[9px] font-bold text-muted-foreground">
                    <span className="text-[#00B894] font-black">全部{totalWordCount.toLocaleString()}</span>
                    {SUB_LEVELS.map((key) => (
                      <span key={key} className="ml-1" style={{ color: LEVEL_COLORS[key] }}>
                        {LEVEL_LABELS[key]}{(WORD_COUNTS as Record<string, number>)[key]?.toLocaleString()}
                      </span>
                    ))}
                  </div>

                  {/* Filter chips: 词性 语域 情感 有搭配词 中文无对应 乱序 */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <Select value={posFilter} onValueChange={(v) => { setPosFilter(v); setMemory((p) => ({ ...p, posFilter: v })); }}>
                      <SelectTrigger className={cn('h-7 rounded-xl text-[9px] font-bold border-0', posFilter !== 'all' ? 'bg-[#00B894]/10 text-[#00B894]' : 'bg-muted text-muted-foreground')}>
                        <SelectValue placeholder="词性" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">{allPartsOfSpeech.map((p) => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={registerFilter} onValueChange={(v) => { setRegisterFilter(v); setMemory((p) => ({ ...p, registerFilter: v })); }}>
                      <SelectTrigger className={cn('h-7 rounded-xl text-[9px] font-bold border-0', registerFilter !== 'all' ? 'bg-[#00B894]/10 text-[#00B894]' : 'bg-muted text-muted-foreground')}>
                        <SelectValue placeholder="语域" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="all" className="text-xs">全部语域</SelectItem>
                        <SelectItem value="formal" className="text-xs">正式</SelectItem>
                        <SelectItem value="neutral" className="text-xs">中性</SelectItem>
                        <SelectItem value="informal" className="text-xs">非正式</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={emotionFilter} onValueChange={setEmotionFilter}>
                      <SelectTrigger className={cn('h-7 rounded-xl text-[9px] font-bold border-0', emotionFilter !== 'all' ? 'bg-[#00B894]/10 text-[#00B894]' : 'bg-muted text-muted-foreground')}>
                        <SelectValue placeholder="情感" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="all" className="text-xs">全部情感</SelectItem>
                        <SelectItem value="positive" className="text-xs">积极</SelectItem>
                        <SelectItem value="neutral" className="text-xs">中性</SelectItem>
                        <SelectItem value="negative" className="text-xs">消极</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => setCollocOnly(!collocOnly)}
                      className={cn('px-2 h-7 rounded-xl text-[9px] font-bold transition-colors', collocOnly ? 'bg-[#00B894]/10 text-[#00B894]' : 'bg-muted text-muted-foreground hover:text-foreground')}
                    >
                      有搭配词
                    </button>
                    <button
                      onClick={() => setNoChineseEquivOnly(!noChineseEquivOnly)}
                      className={cn('px-2 h-7 rounded-xl text-[9px] font-bold transition-colors', noChineseEquivOnly ? 'bg-[#00B894]/10 text-[#00B894]' : 'bg-muted text-muted-foreground hover:text-foreground')}
                    >
                      中文无对应
                    </button>
                    <button
                      onClick={() => setSortMode(sortMode === 'random' ? 'az' : 'random')}
                      className={cn('px-2 h-7 rounded-xl text-[9px] font-bold transition-colors', sortMode === 'random' ? 'bg-[#00B894]/10 text-[#00B894]' : 'bg-muted text-muted-foreground hover:text-foreground')}
                    >
                      乱序
                    </button>
                    {activeFilterCount > 0 && (
                      <button onClick={resetFilters} className="px-2 h-7 rounded-xl text-[9px] font-bold bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors">
                        重置
                      </button>
                    )}
                  </div>

                  {/* Memory filter + search */}
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex items-center gap-0.5 bg-muted rounded-xl p-0.5">
                      {([
                        { key: 'all', label: '全部' },
                        { key: 'memorized', label: '已记' },
                        { key: 'unmemorized', label: '未记' },
                      ] as const).map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => setBrowseMemoryFilter(key)}
                          className={cn(
                            'px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all',
                            browseMemoryFilter === key
                              ? 'bg-white dark:bg-card text-[#00B894] shadow-sm'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Search */}
                  <div className="relative mt-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setWordPage(0); }}
                      placeholder="搜索单词（英文/中文/音标）…"
                      className="pl-9 pr-8 py-2 rounded-xl bg-white dark:bg-card border-border text-xs font-bold focus-visible:ring-2 focus-visible:ring-emerald-200"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  {filteredWords.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Search className="size-10 mx-auto mb-2 opacity-20" />
                      <p className="text-sm font-medium">没有匹配的单词</p>
                    </div>
                  ) : (
                    <>
                      {/* Word list */}
                      <div className="space-y-1 max-h-[480px] overflow-y-auto pr-1">
                        {pagedWords.map((w) => {
                          const isSelected = selectedWord?.word === w.word;
                          const lc = LEVEL_COLORS[w.level] || '#00B894';
                          const memorized = memorizedWords.has(w.word.toLowerCase());
                          return (
                            <button
                              key={w.word}
                              onClick={() => handleSelectWord(w)}
                              className={cn(
                                'w-full text-left p-3 rounded-2xl transition-all duration-200 border-2',
                                isSelected
                                  ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-500/10 shadow-sm'
                                  : 'border-transparent bg-muted/30 hover:bg-muted hover:border-border',
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); tts.speak(w.word, { rate: 0.85 }); }}
                                      className="shrink-0 text-muted-foreground/40 hover:text-[#00B894] transition-colors"
                                      title={`朗读 "${w.word}"`}
                                    >
                                      <Volume2 className="size-3.5" />
                                    </button>
                                    <span className="text-sm font-black text-foreground">{w.word}</span>
                                    <span className="text-[10px] font-bold text-[#6C5CE7]">{w.partOfSpeech}</span>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground font-medium mt-0.5 line-clamp-1">{w.meaning}</p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleMemorizedWord(w.word); }}
                                    title={memorized ? '取消记忆' : '标记为已记'}
                                    className={cn(
                                      'p-0.5 rounded-lg transition-colors',
                                      memorized ? 'text-[#00B894] hover:text-[#00B894]/70' : 'text-muted-foreground/30 hover:text-[#00B894]',
                                    )}
                                  >
                                    <Brain className={cn('size-3.5', memorized && 'fill-[#00B894]/20')} />
                                  </button>
                                  <span
                                    className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0"
                                    style={{ backgroundColor: lc + '18', color: lc }}
                                  >
                                    {LEVEL_LABELS[w.level]}
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Pagination: page size + auto-play + page nav */}
                      <div className="flex items-center justify-between pt-3 mt-3 border-t border-border/50 gap-2">
                        {/* Page size selector */}
                        <div className="flex items-center gap-0.5">
                          {[15, 30, 50].map((size) => (
                            <button
                              key={size}
                              onClick={() => { setBrowsePageSize(size); setWordPage(0); }}
                              className={cn(
                                'px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors',
                                browsePageSize === size
                                  ? 'bg-emerald-100 dark:bg-emerald-500/20 text-[#00B894]'
                                  : 'text-muted-foreground hover:text-foreground',
                              )}
                              title={`每页显示 ${size} 条`}
                            >
                              {size}
                            </button>
                          ))}
                        </div>

                        {/* Auto-play + Page navigation */}
                        <div className="flex items-center gap-1">
                          {autoPlaying ? (
                            <Button variant="ghost" size="icon" onClick={stopAutoPlay}
                              className="rounded-xl size-7 bg-rose-50 dark:bg-rose-500/15 text-rose-500 hover:bg-rose-100">
                              <Pause className="size-3.5" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={startAutoPlay} disabled={filteredWords.length === 0}
                              className="rounded-xl text-[9px] font-black uppercase tracking-wider bg-[#00B894]/10 text-[#00B894] hover:bg-[#00B894]/20 gap-1 h-7">
                              <Play className="size-3" />自动朗读
                            </Button>
                          )}
                        </div>

                        {/* Page navigation */}
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => setWordPage((p) => Math.max(0, p - 1))}
                            disabled={wordPage === 0}
                            className="rounded-xl text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-[#00B894] h-7 px-2"
                          >
                            <ChevronLeft className="size-3.5" />
                          </Button>
                          <PageJumpInput current={wordPage + 1} total={totalWordPages} onJump={(pg) => setWordPage(pg - 1)} />
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => setWordPage((p) => Math.min(totalWordPages - 1, p + 1))}
                            disabled={wordPage >= totalWordPages - 1}
                            className="rounded-xl text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-[#00B894] h-7 px-2"
                          >
                            <ChevronRight className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: word detail */}
            <div className="col-span-12 lg:col-span-7">
              {selectedWord ? (
                <div className="space-y-4">
                  <Card className="rounded-[40px] border-2 border-emerald-200/50 shadow-sm overflow-hidden">
                    <CardContent className="p-8">
                      <div className="flex items-start justify-between gap-4 mb-6">
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            {/* Prev/Next word navigation */}
                            <Button variant="ghost" size="icon"
                              onClick={() => {
                                const idx = filteredWords.findIndex((w) => w.word === selectedWord.word);
                                if (idx > 0) {
                                  const newPage = Math.floor((idx - 1) / browsePageSize);
                                  if (newPage !== wordPage) setWordPage(newPage);
                                  setSelectedWord(filteredWords[idx - 1]);
                                }
                              }}
                              disabled={filteredWords.findIndex((w) => w.word === selectedWord.word) <= 0}
                              className="rounded-xl size-7 text-muted-foreground hover:text-[#00B894] shrink-0"
                              title="上一个单词"
                            >
                              <ChevronLeft className="size-4" />
                            </Button>
                            <h2 className="text-4xl font-black italic text-foreground tracking-tight">{selectedWord.word}</h2>
                            <Button variant="ghost" size="icon" onClick={() => tts.speak(selectedWord.word, { rate: 0.9 })} className="rounded-2xl bg-muted text-muted-foreground hover:text-[#00B894]"><Volume2 className="size-5" /></Button>
                            <Button variant="ghost" size="icon"
                              onClick={() => {
                                const idx = filteredWords.findIndex((w) => w.word === selectedWord.word);
                                if (idx < filteredWords.length - 1) {
                                  const newPage = Math.floor((idx + 1) / browsePageSize);
                                  if (newPage !== wordPage) setWordPage(newPage);
                                  setSelectedWord(filteredWords[idx + 1]);
                                }
                              }}
                              disabled={filteredWords.findIndex((w) => w.word === selectedWord.word) >= filteredWords.length - 1}
                              className="rounded-xl size-7 text-muted-foreground hover:text-[#00B894] shrink-0"
                              title="下一个单词"
                            >
                              <ChevronRight className="size-4" />
                            </Button>
                          </div>
                          <p className="text-sm text-muted-foreground font-medium mb-1">{selectedWord.phonetic} · <span className="text-[#6C5CE7] font-bold text-sm">{selectedWord.partOfSpeech}</span></p>
                          <p className="text-lg text-foreground/80 font-medium">{selectedWord.meaning}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon"
                            onClick={() => toggleMemorizedWord(selectedWord.word)}
                            title={memorizedWords.has(selectedWord.word.toLowerCase()) ? '取消记忆' : '标记为已记'}
                            className={cn('rounded-2xl',
                              memorizedWords.has(selectedWord.word.toLowerCase())
                                ? 'text-[#00B894] hover:text-[#00B894]/70'
                                : 'text-muted-foreground hover:text-[#00B894]')}>
                            <Brain className={cn('size-5', memorizedWords.has(selectedWord.word.toLowerCase()) && 'fill-[#00B894]/20')} />
                          </Button>
                          <Badge className="rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider bg-emerald-50 dark:bg-emerald-500/15 text-[#00B894] border-none">{selectedWord.level.toUpperCase()}</Badge>
                          <Button variant="ghost" size="icon" onClick={() => toggleFavorite(selectedWord)}
                            className={cn('rounded-2xl', isFavorited(selectedWord.word, 'vocabulary') ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500')}>
                            <Heart className={cn('size-5', isFavorited(selectedWord.word, 'vocabulary') && 'fill-current')} />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mb-6">
                        <div className="p-4 rounded-2xl bg-muted/50"><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">语域</p><p className="text-sm font-black text-foreground">{selectedWord.register === 'formal' ? '正式' : selectedWord.register === 'informal' ? '非正式' : '中性'}</p></div>
                        <div className="p-4 rounded-2xl bg-muted/50"><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">单词序号</p><p className="text-sm font-black text-foreground">#{selectedWord.frequencyRank}</p></div>
                        <div className="p-4 rounded-2xl bg-muted/50"><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">情感色彩</p><p className="text-sm font-black text-foreground">{selectedWord.emotion === 'positive' ? '积极' : selectedWord.emotion === 'negative' ? '消极' : '中性'}</p></div>
                      </div>
                      {selectedWord.collocations.length > 0 && (
                        <div className="mb-4">
                          <span className="text-xs font-black uppercase tracking-wider text-foreground">常用搭配 · 点击查看详情</span>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {selectedWord.collocations.map((c, i) => (
                              <Badge
                                key={i}
                                onClick={(e) => { e.stopPropagation(); handleLookupCollocation(c); }}
                                className="rounded-full px-3 py-1.5 text-xs font-medium bg-[#00B894]/10 text-[#00B894] border-none cursor-pointer hover:bg-[#00B894]/20 transition-colors"
                              >
                                {c}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  {selectedWord.examples.map((ex, i) => (
                    <Card key={i} className="rounded-[32px] border-2 border-emerald-100 dark:border-emerald-500/20 shadow-sm">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="text-base font-medium text-foreground italic">"{ex.en}"</p>
                            <p className="text-sm text-muted-foreground font-medium mt-2">{ex.zh}</p>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => tts.speak(ex.en)}
                              className="rounded-xl size-8 text-muted-foreground hover:text-[#00B894]"
                            >
                              <Volume2 className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (isFavorited(ex.en, 'expression')) {
                                  const fav = favorites.find((f) => f.content === ex.en && f.type === 'expression');
                                  if (fav) removeFavorite(fav.id);
                                } else {
                                  addFavorite({ type: 'expression', content: ex.en, meaning: ex.zh, category: selectedWord.level });
                                }
                              }}
                              className={cn(
                                'rounded-xl size-8 shrink-0',
                                isFavorited(ex.en, 'expression') ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500',
                              )}
                            >
                              <Heart className={cn('size-4', isFavorited(ex.en, 'expression') && 'fill-current')} />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {/* ===== AI 生成例句 ===== */}
                  <Card className="rounded-[32px] border-violet-200/50 bg-violet-50/30 shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Bot className="size-4 text-violet-500" />
                          <span className="text-xs font-black uppercase tracking-wider text-violet-500">AI 生成例句</span>
                          {(aiWordData[wordKey(selectedWord)]?.sentences?.length ?? 0) > 0 && (
                            <Badge className="text-[9px] font-black rounded-full px-2 py-0.5 bg-gradient-to-r from-violet-500 to-purple-500 text-white border-0">
                              {aiWordData[wordKey(selectedWord)].sentences.length}
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="outline" size="sm"
                          onClick={() => handleGenerateWordSentences(selectedWord)}
                          disabled={genSentencesFor === wordKey(selectedWord)}
                          className="rounded-xl border-dashed border-violet-300 text-violet-500 hover:bg-violet-100 text-[10px] font-black uppercase tracking-wider"
                        >
                          {genSentencesFor === wordKey(selectedWord) ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Wand2 className="size-3 mr-1" />}
                          生成
                        </Button>
                      </div>
                      {genSentencesFor === wordKey(selectedWord) && (
                        <div className="flex items-center gap-2 p-3 rounded-2xl bg-violet-50/30 text-sm text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin text-violet-400" /> AI 正在生成例句...
                        </div>
                      )}
                      {aiWordData[wordKey(selectedWord)]?.sentences?.map((item, idx) => (
                        <div key={idx} className="group p-3 rounded-2xl bg-white/60 border border-violet-100 flex items-start gap-2 mt-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground/80 italic">「{item.en}」</p>
                            <p className="text-xs text-muted-foreground mt-1">{item.zh}</p>
                          </div>
                          <button onClick={() => tts.speak(item.en, { rate: 0.9 })}
                            className="shrink-0 p-0.5 rounded-lg text-muted-foreground/50 hover:text-[#00B894] hover:bg-emerald-50 opacity-0 group-hover:opacity-100 transition-all"
                            title="朗读">
                            <Volume2 className="size-3.5" />
                          </button>
                          <button onClick={(e) => {
                            e.stopPropagation();
                            const faved = isFavorited(item.en, 'expression');
                            if (faved) {
                              const fav = favorites.find((f) => f.content === item.en && f.type === 'expression');
                              if (fav) removeFavorite(fav.id);
                            } else {
                              addFavorite({ type: 'expression', content: item.en, meaning: item.zh, category: selectedWord.level });
                            }
                          }}
                            className={cn('shrink-0 p-0.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all',
                              isFavorited(item.en, 'expression') ? 'text-rose-500' : 'text-muted-foreground/50 hover:text-rose-500 hover:bg-rose-50')}
                            title="收藏">
                            <Heart className={cn('size-3.5', isFavorited(item.en, 'expression') && 'fill-current')} />
                          </button>
                          <button onClick={() => handleDeleteVocabSentence(wordKey(selectedWord), idx)}
                            className="shrink-0 p-0.5 rounded-lg text-muted-foreground/50 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ))}
                      {!aiWordData[wordKey(selectedWord)]?.sentences?.length && genSentencesFor !== wordKey(selectedWord) && (
                        <p className="text-xs text-muted-foreground/60 font-medium py-2">点击"生成"让 AI 为这个单词创建更多例句</p>
                      )}
                    </CardContent>
                  </Card>
                  {/* ===== AI 深度解析 ===== */}
                  <Card className="rounded-[32px] border-violet-200/50 bg-violet-50/30 shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Bot className="size-4 text-violet-500" />
                          <span className="text-xs font-black uppercase tracking-wider text-violet-500">AI 深度解析</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {aiWordData[wordKey(selectedWord)]?.explanation && (
                            <Button variant="ghost" size="icon"
                              onClick={() => handleDeleteVocabExplanation(wordKey(selectedWord))}
                              className="rounded-lg size-7 text-muted-foreground hover:text-rose-500">
                              <X className="size-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="outline" size="sm"
                            onClick={() => handleGenerateDeepExplanation(selectedWord)}
                            disabled={genExplanationFor === wordKey(selectedWord)}
                            className="rounded-xl border-dashed border-violet-300 text-violet-500 hover:bg-violet-100 text-[10px] font-black uppercase tracking-wider"
                          >
                            {genExplanationFor === wordKey(selectedWord) ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Wand2 className="size-3 mr-1" />}
                            {aiWordData[wordKey(selectedWord)]?.explanation ? '重新生成' : '生成'}
                          </Button>
                        </div>
                      </div>
                      {genExplanationFor === wordKey(selectedWord) && (
                        <div className="flex items-center gap-2 p-3 rounded-2xl bg-violet-50/30 text-sm text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin text-violet-400" /> AI 正在生成深度解析...
                        </div>
                      )}
                      {aiWordData[wordKey(selectedWord)]?.explanation && (
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiWordData[wordKey(selectedWord)].explanation}</ReactMarkdown>
                        </div>
                      )}
                      {!aiWordData[wordKey(selectedWord)]?.explanation && genExplanationFor !== wordKey(selectedWord) && (
                        <p className="text-xs text-muted-foreground/60 font-medium py-2">点击"生成"获取 AI 深度解析（词源、语义、搭配、易错点等）</p>
                      )}
                    </CardContent>
                  </Card>
                  {/* ===== 词库解析 ===== */}
                  <Card className="rounded-[32px] border-2 border-emerald-100 dark:border-emerald-500/20 shadow-sm">
                    <CardContent className="p-5">
                      <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-2">词库解析</p>
                      <p className="text-sm text-foreground/80 font-medium leading-relaxed">{selectedWord.deepExplanation || `${selectedWord.word}意为${selectedWord.meaning}。该词属于${selectedWord.level.toUpperCase()}级别词汇。`}</p>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card className="rounded-[40px] border-border shadow-sm">
                  <CardContent className="p-16 text-center">
                    <div className="size-20 rounded-3xl bg-muted mx-auto mb-4 flex items-center justify-center text-muted-foreground"><BookOpen className="size-9" /></div>
                    <h3 className="text-xl font-black text-foreground mb-2">选择一个单词</h3>
                    <p className="text-sm text-muted-foreground font-medium">从左侧列表中选择单词查看详细解析</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* 搭配学习 */}
        <TabsContent value="collocations" className="mt-0">
          <CollocationsTab
            selectedLevel={selectedLevel}
            tts={tts}
            handleLookupCollocation={handleLookupCollocation}
            onTranslateColloc={handleTranslateCollocQuick}
            addFavorite={addFavorite}
            removeFavorite={removeFavorite}
            isFavorited={isFavorited}
            favorites={favorites}
            selectedWord={selectedWord}
            onSelectWord={handleSelectWordFromColloc}
          />
        </TabsContent>

      </Tabs>

      {/* Collocation Detail Dialog */}
      <Dialog open={collocOpen} onOpenChange={setCollocOpen}>
        <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden">
          <div className="p-6 border-b border-border bg-gradient-to-r from-[#00B894]/10 to-emerald-50 dark:from-[#00B894]/20 dark:to-emerald-500/10">
            <DialogHeader>
              <DialogTitle className="text-xl font-black italic text-foreground flex items-center gap-2">
                <BookOpen className="size-5 text-[#00B894]" />
                搭配短语
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="p-5 max-h-[450px] overflow-y-auto space-y-4">
            {collocLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="size-6 animate-spin mr-2" />
                正在查询...
              </div>
            ) : collocDetail ? (
              <>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <h3 className="text-2xl font-black italic text-foreground">{collocDetail.phrase}</h3>
                    <Button variant="ghost" size="icon" onClick={() => tts.speak(collocDetail.phrase)} className="rounded-xl size-8 text-muted-foreground hover:text-[#00B894]">
                      <Volume2 className="size-4.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => {
                        if (isFavorited(collocDetail.phrase, 'chunk')) {
                          const fav = favorites.find((f) => f.content === collocDetail.phrase && f.type === 'chunk');
                          if (fav) removeFavorite(fav.id);
                        } else {
                          addFavorite({ type: 'chunk', content: collocDetail.phrase, meaning: collocDetail.meaning, category: selectedWord?.level || 'unknown' });
                        }
                      }}
                      className={cn('rounded-xl size-8', isFavorited(collocDetail.phrase, 'chunk') ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500')}
                    >
                      <Heart className={cn('size-4.5', isFavorited(collocDetail.phrase, 'chunk') && 'fill-current')} />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">{collocDetail.meaning}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">例句</p>
                  <div className="space-y-2">
                    {collocDetail.examples.map((ex, i) => (
                      <div key={i} className="p-3 rounded-2xl bg-muted/30">
                        <p className="text-sm text-foreground italic">「{cleanText(ex.en)}」</p>
                        <p className="text-xs text-muted-foreground mt-1">{ex.zh}</p>
                        <div className="flex items-center gap-1 mt-1.5">
                          <Button variant="ghost" size="icon" onClick={() => tts.speak(ex.en, { rate: 0.9 })} className="rounded-lg size-6 text-muted-foreground hover:text-[#00B894]">
                            <Volume2 className="size-3" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => {
                              if (isFavorited(ex.en, 'expression')) {
                                const fav = favorites.find((f) => f.content === ex.en && f.type === 'expression');
                                if (fav) removeFavorite(fav.id);
                              } else {
                                addFavorite({ type: 'expression', content: ex.en, meaning: ex.zh, category: selectedWord?.level || 'unknown' });
                              }
                            }}
                            className={cn('rounded-lg size-6', isFavorited(ex.en, 'expression') ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500')}
                          >
                            <Heart className={cn('size-3', isFavorited(ex.en, 'expression') && 'fill-current')} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Word quick-view popup (from collocations tab) */}
      <Dialog open={!!collocWordPopup} onOpenChange={() => setCollocWordPopup(null)}>
        <DialogContent className="max-w-lg rounded-[28px] p-0 overflow-hidden">
          {collocWordPopup && (
            <>
              <div className="p-5 border-b border-border bg-gradient-to-r from-sky-50 to-cyan-50 dark:from-sky-500/10 dark:to-cyan-500/10">
                <DialogHeader>
                  <DialogTitle className="text-xl font-black italic text-foreground flex items-center gap-2">
                    <BookOpen className="size-5 text-[#00B894]" />
                    {collocWordPopup.word}
                  </DialogTitle>
                </DialogHeader>
                <div className="flex items-center gap-2 mt-2 ml-7">
                  <Badge className="text-[9px] font-black rounded-full px-2 py-0.5 bg-sky-100 dark:bg-sky-500/15 text-sky-600 border-none">
                    {collocWordPopup.partOfSpeech}
                  </Badge>
                  <Badge variant="secondary" className="text-[9px] font-black rounded-full px-2 py-0.5">
                    {collocWordPopup.level.toUpperCase()}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{collocWordPopup.phonetic}</span>
                </div>
              </div>
              <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">释义</p>
                  <p className="text-sm font-bold text-foreground">{collocWordPopup.meaning}</p>
                </div>
                {collocWordPopup.collocations.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                      常用搭配 ({collocWordPopup.collocations.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {collocWordPopup.collocations.slice(0, 12).map((c, i) => (
                        <span key={i} className="text-[10px] bg-muted px-2 py-0.5 rounded-lg font-medium">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
                {collocWordPopup.examples.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">例句</p>
                    {collocWordPopup.examples.slice(0, 3).map((ex, i) => (
                      <div key={i} className="p-2.5 rounded-xl bg-muted/30 mb-1.5">
                        <p className="text-xs text-foreground/80 italic">「{cleanText(ex.en)}」</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{ex.zh}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => tts.speak(collocWordPopup.word, { rate: 0.85 })}
                    className="rounded-xl text-[10px] font-black uppercase tracking-wider gap-1 flex-1">
                    <Volume2 className="size-3" />朗读
                  </Button>
                  <Button variant="outline" size="sm"
                    onClick={() => {
                      const w = collocWordPopup;
                      setCollocWordPopup(null);
                      setTab('browse');
                      setMemory((p) => ({ ...p, tab: 'browse' }));
                      // Use switchLevel for proper per-level memory
                      if (w.level !== selectedLevel) {
                        switchLevel(w.level);
                        setTimeout(() => setSelectedWord(w), 100);
                      } else {
                        setSelectedWord(w);
                      }
                    }}
                    className="rounded-xl text-[10px] font-black uppercase tracking-wider gap-1 flex-1 border-[#00B894]/30 text-[#00B894] hover:bg-[#00B894]/5">
                    <ExternalLink className="size-3" />查看详情
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}

/** Clickable page number that turns into an input for direct jumping */
function PageJumpInput({ current, total, onJump }: { current: number; total: number; onJump: (pg: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(current));

  const commit = () => {
    const n = parseInt(val, 10);
    if (n >= 1 && n <= total) onJump(n);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => { setEditing(true); setVal(String(current)); }}
        className="text-[10px] font-black text-muted-foreground tabular-nums px-1.5 py-0.5 rounded hover:bg-muted min-w-[3em] text-center"
        title="点击跳转页面"
      >
        {current} / {total}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(String(current)); setEditing(false); } }}
      onBlur={commit}
      className="w-12 text-center rounded-lg bg-muted border border-emerald-200 text-[10px] font-black tabular-nums py-1 outline-none focus:ring-1 focus:ring-emerald-300"
    />
  );
}
