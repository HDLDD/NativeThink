/**
 * 句子拼写页面 — SpellingPage
 * 提供句子拼写 & 单词拼写两种拼写模式
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Volume2,
  Check,
  Star,
  StarOff,
  SkipForward,
  RefreshCw,
  Sparkles,
  BookOpen,
  PanelRightOpen,
  PanelRightClose,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { safeStorage } from '@/lib/safe-storage';
import { useTTS } from '@/lib/use-tts';
import { useFavorites } from '@/lib/use-favorites';
import { useAI } from '@/hooks/use-ai';
import { useSpellingSentences } from '@/lib/use-spelling-sentences';
import { useSpellingLearning } from '@/lib/use-spelling-learning';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { queryWords, preloadLevels, isLevelReady } from '@/data/wordbank';
import type {
  ISpellingSentence,
  SpellingMode,
  SpellingAudioMode,
  SpellingDifficulty,
} from '@/types/spelling';

// ── Helpers ──

/** Get clean word list from sentence (strip punctuation for comparison) */
function getWords(en: string): string[] {
  return en.split(/\s+/).filter(Boolean).map((w) => w.replace(/[^a-zA-Z'-]/g, ''));
}

/** Select blank indices for fill mode — prefer longer (content) words */
function selectBlanks(words: string[]): number[] {
  const candidates = words
    .map((w, i) => ({ word: w.replace(/[^a-zA-Z]/g, ''), index: i }))
    .filter(({ word }) => word.length > 2);
  if (candidates.length === 0) return [Math.floor(words.length / 2)];
  const count = Math.max(1, Math.min(candidates.length, Math.floor(words.length * 0.35)));
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((c) => c.index).sort((a, b) => a - b);
}

/** Split sentence into parts (text segments + blank slots) for fill mode */
function splitForFill(
  en: string,
  blankIndices: number[],
): Array<{ type: 'text' | 'blank'; content: string; wordIndex: number }> {
  const words = en.split(/\s+/).filter(Boolean);
  const blankSet = new Set(blankIndices);
  const parts: Array<{ type: 'text' | 'blank'; content: string; wordIndex: number }> = [];

  for (let i = 0; i < words.length; i++) {
    if (blankSet.has(i)) {
      parts.push({ type: 'blank', content: words[i], wordIndex: i });
    } else {
      parts.push({ type: 'text', content: words[i], wordIndex: i });
    }
  }
  return parts;
}

// ── Sub-components ──

/** 句子拼写: 每个下划线即隐形输入载体 — 点击区域唤起键盘, 文字显示在线上面 */
function DictationInput({
  words,
  userInputs,
  setUserInput,
  submitted,
  correctWords,
  inputRefs,
}: {
  words: string[];
  userInputs: string[];
  setUserInput: (index: number, value: string) => void;
  submitted: boolean;
  correctWords: Record<number, boolean>;
  inputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
}) {
  return (
    <>
      {/* One sentence window — no word windows */}
      <div className="flex flex-wrap justify-center gap-x-[0.5em] gap-y-4">
        {words.map((clean, i) => {
          const isCorrect = submitted ? correctWords[i] : undefined;
          const hasValue = !!userInputs[i];
          return (
            <div
              key={i}
              className="relative inline-flex flex-col items-center min-w-[28px] cursor-text group focus-within:z-10"
              onClick={() => inputRefs.current[i]?.focus()}
            >
              {/* Text above underline — with focus indicator vertical bar */}
              <span className="relative flex items-center">
                {/* Vertical bar — shows on focus */}
                <span className="absolute -left-[3px] text-[#00B894] font-black text-base leading-none select-none opacity-0 group-focus-within:opacity-100 transition-opacity duration-150">
                  |
                </span>
                <span
                  className={cn(
                    'text-sm font-mono leading-tight min-h-[1.3em] text-center transition-colors duration-150',
                    submitted
                      ? isCorrect
                        ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                        : 'text-rose-600 dark:text-rose-400 font-bold'
                      : 'text-foreground/90',
                  )}
                >
                  {submitted && !userInputs[i] ? (
                    <span className="tracking-[0.2em] text-muted-foreground/40">——</span>
                  ) : (
                    userInputs[i] || ' '
                  )}
                </span>
              </span>

              {/* Underline — thicker brand color on focus */}
              <div
                className={cn(
                  'h-[2px] w-full mt-0.5 rounded-full transition-all duration-200',
                  submitted
                    ? isCorrect
                      ? 'bg-emerald-400'
                      : 'bg-rose-400'
                    : hasValue
                      ? 'bg-[#00B894]/60'
                      : 'bg-muted-foreground/25 group-hover:bg-muted-foreground/50',
                  'group-focus-within:h-[3px] group-focus-within:bg-[#00B894]',
                )}
              />

              {/* Invisible input — the actual input carrier */}
              <input
                ref={(el) => { inputRefs.current[i] = el; }}
                value={userInputs[i] || ''}
                onChange={(e) => setUserInput(i, e.target.value)}
                disabled={submitted}
                maxLength={80}
                tabIndex={0}
                className="absolute inset-0 w-full h-full opacity-0 cursor-text"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    const next = i + 1;
                    if (next < words.length) inputRefs.current[next]?.focus();
                  }
                  if (e.key === 'Backspace' && !userInputs[i] && i > 0) {
                    inputRefs.current[i - 1]?.focus();
                  }
                }}
                onFocus={() => {
                  // Scroll the word into view if needed
                  inputRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Hint text */}
      {!submitted && (
        <p className="text-[11px] text-muted-foreground/40 text-center mt-2 font-medium">
          点击下划线输入 · Tab 切换
        </p>
      )}
    </>
  );
}

/** Sentence display with inline blanks for fill mode */
function FillDisplay({
  parts,
  userInputs,
  setUserInput,
  submitted,
  correctWords,
  inputRefs,
}: {
  parts: ReturnType<typeof splitForFill>;
  userInputs: string[];
  setUserInput: (index: number, value: string) => void;
  submitted: boolean;
  correctWords: Record<number, boolean>;
  inputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
}) {
  let inputFieldIndex = -1;
  return (
    <div className="flex flex-wrap gap-1.5 justify-center items-center text-base leading-relaxed">
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return (
            <span key={i} className="text-foreground/80 px-0.5">
              {part.content}
            </span>
          );
        }
        inputFieldIndex++;
        const fi = inputFieldIndex;
        const isCorrect = submitted ? correctWords[part.wordIndex] : undefined;
        return (
          <span key={i} className="inline-flex items-center">
            <input
              ref={(el) => { inputRefs.current[fi] = el; }}
              value={userInputs[fi] || ''}
              onChange={(e) => setUserInput(fi, e.target.value)}
              disabled={submitted}
              tabIndex={0}
              className={cn(
                'h-9 w-[calc(1ch*' + Math.max(part.content.replace(/[^a-zA-Z]/g, '').length + 2, 6) + '+ 12px)] min-w-[60px]',
                'text-center text-sm font-mono rounded-xl border-2 outline-none transition-all duration-200',
                'bg-background focus:border-[#00B894] focus:ring-2 focus:ring-[#00B894]/20',
                submitted
                  ? isCorrect
                    ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                    : 'border-rose-400 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
                  : 'border-muted-foreground/20 hover:border-muted-foreground/40',
              )}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  const next = fi + 1;
                  if (next < inputRefs.current.length) {
                    inputRefs.current[next]?.focus();
                  }
                }
              }}
            />
          </span>
        );
      })}
    </div>
  );
}

// ── Main Page ──

export default function SpellingPage() {
  // Hooks
  const {
    sentences,
    addSentences,
    upsertSentences,
    aiBatchAdd,
  } = useSpellingSentences();
  const {
    getProgress,
    recordAttempt,
    calculateQuality,
    buildSessionQueue,
    stats: learningStats,
    markCompleted,
    resetAllProgress,
    resetCompletedAll,
  } = useSpellingLearning();
  const tts = useTTS();
  const { favorites, addFavorite, removeFavorite, isFavorited } = useFavorites();
  const ai = useAI();

  // Mode state
  const [mode, setMode] = useState<SpellingMode>('dictation');
  const [audioMode, setAudioMode] = useState<SpellingAudioMode>('sentence');

  // Session state
  const [sessionQueue, setSessionQueue] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentSentence = useMemo(
    () => (sessionQueue.length > 0 ? sentences.find((s) => s.id === sessionQueue[currentIndex]) : undefined),
    [sessionQueue, currentIndex, sentences],
  );

  // Input state
  const [dictationInputs, setDictationInputs] = useState<string[]>([]);  // per-word inputs for 句子拼写
  const [fillInputs, setFillInputs] = useState<string[]>([]);           // per-blank inputs for 单词拼写
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<{ wordResults: Record<number, boolean>; score: number; total: number } | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [fillParts, setFillParts] = useState<ReturnType<typeof splitForFill> | null>(null);

  // UI state
  const [showFavorites, setShowFavorites] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [showManageDialog, setShowManageDialog] = useState(false);
  const [completionShown, setCompletionShown] = useState(false);
  const [autoRead, setAutoRead] = useState(true);         // 自动朗读
  const [importDirty, setImportDirty] = useState(0);       // import → rebuild trigger
  const [building, setBuilding] = useState(false);          // building sentence database (full rebuild)
  const [levelLoading, setLevelLoading] = useState(false);  // loading word bank data for level switch
  const [activeLevel, setActiveLevel] = useState('all');     // filter by level ('all' or level code)

  // AI dialog state
  const [aiTopic, setAiTopic] = useState('');
  const [aiDifficulty, setAiDifficulty] = useState<SpellingDifficulty>('intermediate');
  const [aiCount, setAiCount] = useState(10);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ success: boolean; count: number; error?: string } | null>(null);

  // Import dialog state
/** Build/rebuild session — accepts optional override params to avoid stale-closure issues */
  const rebuildSession = useCallback(
    (overrides?: { sentences?: ISpellingSentence[]; level?: string }) => {
      const allSentences = overrides?.sentences ?? sentences;
      const level = overrides?.level ?? activeLevel;
      if (allSentences.length === 0) {
        setSessionQueue([]);
        setCurrentIndex(0);
        return;
      }
      const filtered = level === 'all' ? allSentences : allSentences.filter((s) => s.level === level);
      const queue = buildSessionQueue(filtered);
      setSessionQueue(queue);

      // Restore resume index if pending, else start at 0
      if (pendingResumeIndex.current !== null && pendingResumeIndex.current < queue.length) {
        setCurrentIndex(pendingResumeIndex.current);
        pendingResumeIndex.current = null;
      } else {
        setCurrentIndex(0);
      }
      setSubmitted(false);
      setResults(null);
      setCompletionShown(false);
    },
    [sentences, buildSessionQueue, activeLevel],
  );

  // Initialize session on sentences load — auto-reset completed if all done
  useEffect(() => {
    if (sentences.length > 0 && sessionQueue.length === 0) {
      if (learningStats.completedCount >= sentences.length) {
        // All sentences are marked completed — auto-reset for fresh session
        resetCompletedAll();
        setImportDirty((c) => c + 1);
      } else {
        rebuildSession();
      }
    }
  }, [sentences.length, rebuildSession, sessionQueue.length]);

  // Rebuild session when import completes (importDirty incremented)
  useEffect(() => {
    if (importDirty > 0) {
      rebuildSession();
    }
  }, [importDirty, rebuildSession]);

  // Reset inputs when sentence changes — never clear submitted/results (controlled by handlers only)
  useEffect(() => {
    if (!currentSentence) return;
    const words = getWords(currentSentence.en);
      if (mode === 'dictation') {
        setDictationInputs(new Array(words.length).fill(''));
        inputRefs.current = new Array(words.length).fill(null);
      } else {
        const blanks = selectBlanks(words);
        const parts = splitForFill(currentSentence.en, blanks);
        setFillParts(parts);
        const blankCount = parts.filter((p) => p.type === 'blank').length;
        setFillInputs(new Array(blankCount).fill(''));
        inputRefs.current = new Array(blankCount).fill(null);
      }

      // Auto-focus first input
      setTimeout(() => inputRefs.current[0]?.focus(), 150);

      // Cancel any lingering TTS, then auto-play
      tts.cancel();
      const timer = setTimeout(() => {
        if (mode === 'dictation' && autoRead) tts.speak(currentSentence.en);
      }, 500);
      return () => { clearTimeout(timer); tts.cancel(); };
  }, [currentSentence?.id, mode]);

  /** Check answers */
  const handleSubmit = useCallback(() => {
    if (!currentSentence) return;

    const words = getWords(currentSentence.en);
    let correctCount = 0;
    const wordResults: Record<number, boolean> = {};
    const wrongWords: Record<string, number> = {};
    let totalWords = 0;

    if (mode === 'dictation') {
      totalWords = words.length;
      for (let i = 0; i < words.length; i++) {
        const user = (dictationInputs[i] || '').trim().toLowerCase();
        const correct = words[i].toLowerCase();
        const isCorrect = user === correct;
        wordResults[i] = isCorrect;
        if (isCorrect) correctCount++;
        else {
          wrongWords[correct] = (wrongWords[correct] || 0) + 1;
        }
      }
    } else {
      // Fill mode: only check blanked words
      if (!fillParts) return;
      const blanks = fillParts.filter((p) => p.type === 'blank');
      totalWords = blanks.length;
      let inputIdx = 0;
      for (const part of fillParts) {
        if (part.type === 'blank') {
          const user = (fillInputs[inputIdx] || '').trim().toLowerCase();
          const correct = part.content.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
          const isCorrect = user === correct;
          wordResults[part.wordIndex] = isCorrect;
          if (isCorrect) correctCount++;
          else {
            wrongWords[correct] = (wrongWords[correct] || 0) + 1;
          }
          inputIdx++;
        }
      }
    }

    const quality = calculateQuality(correctCount, totalWords);
    recordAttempt(currentSentence.id, quality, wrongWords, mode);

    setResults({ wordResults, score: correctCount, total: totalWords });
    setSubmitted(true);
  }, [currentSentence, mode, dictationInputs, fillInputs, fillParts, calculateQuality, recordAttempt]);

  /** Navigate to next sentence — mark completed */
  const handleNext = useCallback(() => {
    const currentId = sessionQueue[currentIndex];
    if (currentId) markCompleted(currentId);
    if (currentIndex < sessionQueue.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setCompletionShown(true);
    }
    setSubmitted(false);
    setResults(null);
  }, [currentIndex, sessionQueue.length, markCompleted]);

  /** Navigate to previous sentence */
  const handlePrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
    setSubmitted(false);
    setResults(null);
  }, []);

  /** Skip current sentence — mark completed */
  const handleSkip = useCallback(() => {
    const currentId = sessionQueue[currentIndex];
    if (currentId) markCompleted(currentId);
    if (currentIndex < sessionQueue.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setCompletionShown(true);
    }
    setSubmitted(false);
    setResults(null);
  }, [currentIndex, sessionQueue.length, markCompleted]);

  /** Retry current sentence (reset input state) */
  const handleRetry = useCallback(() => {
    setSubmitted(false);
    setResults(null);
    if (mode === 'dictation') {
      const words = currentSentence ? getWords(currentSentence.en) : [];
      setDictationInputs(new Array(words.length).fill(''));
    } else {
      setFillInputs(new Array(fillInputs.length).fill(''));
    }
  }, [mode, fillInputs.length, currentSentence]);

  /** Retry only wrong words (clear wrong inputs, keep results visible so user knows which words to fix) */
  const handleRetryWrong = useCallback(() => {
    if (!currentSentence || !results) return;
    if (mode === 'dictation') {
      const newInputs = [...dictationInputs];
      for (const [wordIdxStr, isCorrect] of Object.entries(results.wordResults)) {
        if (!isCorrect) newInputs[Number(wordIdxStr)] = '';
      }
      setDictationInputs(newInputs);
    } else {
      const newInputs = [...fillInputs];
      for (const [wordIdxStr, isCorrect] of Object.entries(results.wordResults)) {
        if (!isCorrect && fillParts) {
          const blankIndex = fillParts.findIndex((p) => p.type === 'blank' && p.wordIndex === Number(wordIdxStr));
          if (blankIndex !== -1) newInputs[blankIndex] = '';
        }
      }
      setFillInputs(newInputs);
    }
    // Keep results visible so user sees which words were wrong; just allow re-submit
    setSubmitted(false);
  }, [currentSentence, results, mode, fillInputs, fillParts]);

  /** Toggle favorite for current sentence */
  const handleToggleFavorite = useCallback(() => {
    if (!currentSentence) return;
    if (isFavorited(currentSentence.en, 'spelling')) {
      const fav = favorites.find((f) => f.content === currentSentence.en && f.type === 'spelling');
      if (fav) removeFavorite(fav.id);
    } else {
      addFavorite({
        type: 'spelling',
        content: currentSentence.en,
        meaning: currentSentence.zh,
        category: 'spelling',
      });
    }
  }, [currentSentence, isFavorited, favorites, removeFavorite, addFavorite]);

  /** Load a specific sentence from favorites */
  const handleLoadFavorite = useCallback(
    (sentence: ISpellingSentence) => {
      const idx = sessionQueue.indexOf(sentence.id);
      if (idx !== -1) {
        setCurrentIndex(idx);
      } else {
        // Sentence not in current queue; insert it
        const newQueue = [sentence.id, ...sessionQueue.filter((id) => id !== sentence.id)];
        setSessionQueue(newQueue);
        setCurrentIndex(0);
      }
      setSubmitted(false);
      setResults(null);
      setShowFavorites(false);
    },
    [sessionQueue],
  );

  /** AI batch add */
  const handleAIGenerate = useCallback(async () => {
    if (!aiTopic.trim() || !ai.isConfigured) return;
    setAiLoading(true);
    setAiResult(null);

    const result = await aiBatchAdd(
      ai.chat,
      ai.buildMessages,
      aiTopic.trim(),
      aiDifficulty,
      aiCount,
    );

    setAiResult(result);
    if (result.success && result.count > 0) {
      // Reload to get preview of newly added sentences
      // (We can't easily get the new sentences back from the hook,
      //  so just show the result count)
    }
    setAiLoading(false);
  }, [aiTopic, aiDifficulty, aiCount, ai.isConfigured, ai.chat, ai.buildMessages, aiBatchAdd]);

  /** Map wordbank level to difficulty */
  const getDifficulty = useCallback((level: string): SpellingDifficulty => {
    if (['zhongkao', 'gaokao', 'cet4'].includes(level)) return 'beginner';
    if (['advanced'].includes(level)) return 'advanced';
    return 'intermediate';
  }, []);

  const ALL_LEVELS = ['zhongkao','gaokao','cet4','cet6','ielts','toefl','postgraduate','professional','advanced'];

  /** Cache extracted sentences per level to avoid redundant work */
  const levelSentencesCache = useRef<Record<string, Omit<ISpellingSentence, 'id' | 'createdAt'>[]>>({});

  const extractLevelSentences = useCallback((level: string): Omit<ISpellingSentence, 'id' | 'createdAt'>[] => {
    if (levelSentencesCache.current[level]) return levelSentencesCache.current[level];
    const words = queryWords({ level });
    const difficulty = getDifficulty(level);
    const items: Omit<ISpellingSentence, 'id' | 'createdAt'>[] = [];
    for (const w of words) {
      if (w.examples) {
        for (const ex of w.examples) {
          if (ex.en && ex.zh) {
            items.push({
              en: ex.en.trim(),
              zh: ex.zh.trim(),
              source: 'word_example',
              sourceWord: w.word,
              level,
              difficulty,
            });
          }
        }
      }
    }
    levelSentencesCache.current[level] = items;
    return items;
  }, [getDifficulty]);

  /** Guard against concurrent level switches */
  const switchingRef = useRef(false);

  /** Switch level — lazy-load once, cache, then instant subsequent switches */
  const handleLevelChange = useCallback(
    async (lvl: string) => {
      if (lvl === activeLevel || switchingRef.current) return;
      switchingRef.current = true;

      // Set loading BEFORE activeLevel to prevent intermediate empty-state flash
      setLevelLoading(true);
      setSubmitted(false);
      setResults(null);
      setCompletionShown(false);

      // Already have sentences tagged with this level → instant rebuild
      if (lvl === 'all' || sentences.some((s) => s.level === lvl)) {
        setActiveLevel(lvl);
        setLevelLoading(false);
        rebuildSession({ level: lvl });
        switchingRef.current = false;
        return;
      }

      // First visit: preload → extract → persist via hook (consistent IDs) → rebuild via importDirty
      try {
        setActiveLevel(lvl);
        if (!isLevelReady(lvl)) {
          await preloadLevels([lvl]);
        }
        const items = extractLevelSentences(lvl);
        if (items.length > 0) {
          const count = upsertSentences(items);
          setImportDirty((c) => c + 1);
          toast.success(`已加载 ${({zhongkao:'中考',gaokao:'高考',cet4:'四级',cet6:'六级',ielts:'雅思',toefl:'托福',postgraduate:'考研',professional:'专业',advanced:'高级'})[lvl] || lvl} 词库 ${count} 条例句`);
        } else {
          toast.info('该词库没有例句');
          rebuildSession({ level: lvl });
        }
      } catch {
        toast.error('加载词库失败');
      }
      setLevelLoading(false);
      switchingRef.current = false;
    },
    [activeLevel, sentences, extractLevelSentences, upsertSentences, rebuildSession],
  );

  /** Build sentence database from ALL word bank levels */
  const handleBuildDatabase = useCallback(async () => {
    setBuilding(true);
    try {
      let totalImported = 0;
      for (const level of ALL_LEVELS) {
        await preloadLevels([level]);
        const items = extractLevelSentences(level);
        if (items.length > 0) {
          const count = upsertSentences(items);
          totalImported += count;
        }
        await new Promise(r => setTimeout(r, 50)); // yield between levels
      }
      toast.success(`数据库建立完成：共导入 ${totalImported} 条例句`);
      setImportDirty((c) => c + 1);
    } catch {
      toast.error('建库失败，请重试');
    }
    setBuilding(false);
  }, [extractLevelSentences, upsertSentences, rebuildSession]);

  // ── Position memory (resume last position) ──
  const RESUME_KEY = '__nativethink_spelling_resume';
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const pendingResumeIndex = useRef<number | null>(null);
  const resumeDoneRef = useRef(false);
  const persistPosition = useCallback((level: string, idx: number) => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      try { safeStorage.setItem(RESUME_KEY, JSON.stringify({ activeLevel: level, currentIndex: idx })); } catch { /* ignore */ }
    }, 200);
  }, []);

  // Save position when index or level changes
  const prevIndexRef = useRef(0);
  const prevLevelRef = useRef('all');
  useEffect(() => {
    if (prevIndexRef.current !== currentIndex || prevLevelRef.current !== activeLevel) {
      prevIndexRef.current = currentIndex;
      prevLevelRef.current = activeLevel;
      persistPosition(activeLevel, currentIndex);
    }
  }, [currentIndex, activeLevel, persistPosition]);

  // Restore saved position on mount (after sentences are loaded)
  useEffect(() => {
    if (sentences.length === 0 || resumeDoneRef.current) return;
    resumeDoneRef.current = true;
    try {
      const raw = safeStorage.getItem(RESUME_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.activeLevel && saved.activeLevel !== 'all' && saved.activeLevel !== activeLevel) {
        pendingResumeIndex.current = saved.currentIndex ?? 0;
        handleLevelChange(saved.activeLevel);
      }
    } catch { /* ignore */ }
  }, [sentences.length]);

  // Progress  // Progress
  const isFav = currentSentence ? isFavorited(currentSentence.en, 'spelling') : false;
  const currentProgress = currentSentence ? getProgress(currentSentence.id) : null;

  // Welcome screen — no sentences yet, build database or use AI
  if (sentences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-4">
        <div className="size-20 rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 flex items-center justify-center mb-6">
          <Sparkles className="size-10 text-[#00B894]" />
        </div>
        <h2 className="text-2xl font-black italic mb-2">句子拼写</h2>
        <p className="text-muted-foreground mb-8 text-center max-w-md">
          首次使用需要建立句子数据库<br />将自动导入全部词库（9 级）的所有例句
        </p>

        <Button
          onClick={handleBuildDatabase}
          disabled={building}
          className="rounded-2xl bg-[#00B894] hover:bg-[#00a882] text-white font-bold gap-2 px-8 mb-4"
        >
          {building ? (
            <><RefreshCw className="size-4 animate-spin" /> 建库中...</>
          ) : (
            <><BookOpen className="size-4" /> 建立句子库</>
          )}
        </Button>

        <p className="text-xs text-muted-foreground/60 text-center max-w-md">
          也可以先通过 AI 添加自定义句子
        </p>
        <Button
          onClick={() => setShowAIDialog(true)}
          variant="outline"
          className="rounded-xl font-bold gap-2 mt-2"
        >
          <Sparkles className="size-4" />
          AI 添加句子
        </Button>

        <AIBatchAddDialog
          open={showAIDialog}
          onOpenChange={setShowAIDialog}
          topic={aiTopic}
          onTopicChange={setAiTopic}
          difficulty={aiDifficulty}
          onDifficultyChange={setAiDifficulty}
          count={aiCount}
          onCountChange={setAiCount}
          loading={aiLoading}
          result={aiResult}
          onGenerate={async () => { await handleAIGenerate(); rebuildSession(); }}
          isConfigured={ai.isConfigured}
        />
      </div>
    );
  }

  // ── Main Content ──
  const scorePercent = results ? Math.round((results.score / results.total) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* ── Inline completion banner ── */}
      {completionShown && (
        <Card className="p-6 rounded-2xl border-[#00B894]/20 shadow-sm bg-gradient-to-br from-emerald-50/50 to-teal-50/50 dark:from-emerald-500/5 dark:to-teal-500/5">
          <div className="flex flex-col items-center justify-center text-center">
            <Check className="size-8 text-[#00B894] mb-2" />
            <h2 className="text-lg font-black italic mb-1">本轮完成！</h2>
            <p className="text-xs text-muted-foreground mb-4">
              今日已练习 {learningStats.todayPracticed} 句
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  resetCompletedAll();
                  setImportDirty(c => c + 1);
                  setCompletionShown(false);
                }}
                className="rounded-xl bg-[#00B894] hover:bg-[#00a882] text-white font-bold gap-1.5"
              >
                <RefreshCw className="size-3.5" />
                再来一轮
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowManageDialog(true)}
                className="rounded-xl font-bold gap-1.5"
              >
                <BookOpen className="size-3.5" />
                学习记录
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Header Controls ── */}
      <Card className="p-4 rounded-2xl border-border/50 shadow-sm space-y-4">
        {/* Row 1: Mode toggles */}
        {/* Level filter + Mode toggles */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-border p-0.5 bg-muted/50">
              <button
                onClick={() => handleLevelChange('all')}
                className={cn(
                  'px-2.5 py-1.5 rounded-[10px] text-[10px] font-bold transition-all whitespace-nowrap',
                  activeLevel === 'all'
                    ? 'bg-[#00B894] text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                全部
              </button>
              {['zhongkao','gaokao','cet4','cet6','ielts','toefl','postgraduate','professional','advanced'].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => handleLevelChange(lvl)}
                  className={cn(
                    'px-2.5 py-1.5 rounded-[10px] text-[10px] font-bold transition-all whitespace-nowrap',
                    activeLevel === lvl
                      ? 'bg-[#00B894] text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {({zhongkao:'中考',gaokao:'高考',cet4:'四级',cet6:'六级',ielts:'雅思',toefl:'托福',postgraduate:'考研',professional:'专业',advanced:'高级'})[lvl]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-2">
              拼写模式
            </span>
            <div className="flex rounded-xl border border-border p-0.5 bg-muted/50">
              <button
                onClick={() => setMode('dictation')}
                className={cn(
                  'px-4 py-1.5 rounded-[10px] text-xs font-bold transition-all duration-200',
                  mode === 'dictation'
                    ? 'bg-[#00B894] text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                句子拼写
              </button>
              <button
                onClick={() => setMode('fill')}
                className={cn(
                  'px-4 py-1.5 rounded-[10px] text-xs font-bold transition-all duration-200',
                  mode === 'fill'
                    ? 'bg-[#00B894] text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                单词拼写
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-1">
              音频
            </span>
            <div className="flex rounded-xl border border-border p-0.5 bg-muted/50">
              <button
                onClick={() => setAudioMode('sentence')}
                className={cn(
                  'px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all duration-200',
                  audioMode === 'sentence'
                    ? 'bg-[#00B894] text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                整句
              </button>
              <button
                onClick={() => setAudioMode('word')}
                className={cn(
                  'px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all duration-200',
                  audioMode === 'word'
                    ? 'bg-[#00B894] text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                逐词
              </button>
            </div>
          </div>

          {/* Auto-read toggle */}
          <button
            onClick={() => setAutoRead(!autoRead)}
            className={cn(
              'px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all duration-200 border',
              autoRead
                ? 'bg-[#00B894]/10 border-[#00B894]/30 text-[#00B894]'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
            title={autoRead ? '点击关闭自动朗读' : '点击开启自动朗读'}
          >
            {autoRead ? '🔊 自动' : '🔇 静音'}
          </button>
        </div>

        {/* Loading indicator — like DeepVocabularyPage */}
        {levelLoading && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#00B894]/5 border border-[#00B894]/20">
            <Loader2 className="size-4 text-[#00B894] animate-spin shrink-0" />
            <span className="text-xs font-bold text-[#00B894]">正在加载词库...</span>
          </div>
        )}

        {/* Row 2: Progress + Action buttons */}
        <div className="flex items-center justify-between">
          {/* Progress */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-foreground/80">
              {sessionQueue.length > 0 ? `${currentIndex + 1}/${sessionQueue.length}` : '0/0'}
            </span>
            <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-[#00B894] rounded-full transition-all duration-300"
                style={{ width: `${sessionQueue.length > 0 ? ((currentIndex + 1) / sessionQueue.length) * 100 : 0}%` }}
              />
            </div>
            {(() => {
              const totalInLevel = activeLevel === 'all' ? sentences.length : sentences.filter(s => s.level === activeLevel).length;
              return (
                <Badge variant="secondary" className="rounded-lg text-[10px] font-bold whitespace-nowrap">
                  共 {totalInLevel} 句
                </Badge>
              );
            })()}
            <Badge variant="secondary" className="rounded-lg text-[10px] font-bold">
              今日 {learningStats.todayPracticed} 句
            </Badge>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAIDialog(true)}
              className="rounded-xl h-8 text-xs font-bold gap-1.5"
            >
              <Sparkles className="size-3.5" />
              <span className="hidden sm:inline">AI 添加</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFavorites(!showFavorites)}
              className="rounded-xl h-8 text-xs font-bold gap-1.5"
            >
              {showFavorites ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
              <span className="hidden sm:inline">收藏 ({favorites.filter((f) => f.type === 'spelling').length})</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Sentence Card ── */}
      <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
        {/* Chinese translation — centered */}
        <div className="bg-gradient-to-r from-emerald-50/50 to-teal-50/50 dark:from-emerald-500/5 dark:to-teal-500/5 px-6 py-5 border-b border-border/50 text-center">
          <p className="text-lg font-bold text-foreground/90">{currentSentence?.zh}</p>
          {(currentSentence?.source === 'word_example' && currentSentence.sourceWord) && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <Badge variant="outline" className="rounded-md text-[10px] h-5 font-bold text-[#00B894] border-[#00B894]/30">
                单词: {currentSentence.sourceWord}
              </Badge>
              {currentProgress && currentProgress.status !== 'new' && (
                <Badge variant="secondary" className="rounded-md text-[10px] h-5 font-bold">
                  {currentProgress.status === 'mastered' ? '已掌握' : currentProgress.status === 'reviewing' ? '复习中' : '学习中'}
                </Badge>
              )}
            </div>
          )}
          {(!(currentSentence?.source === 'word_example' && currentSentence.sourceWord) && currentProgress && currentProgress.status !== 'new') && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <Badge variant="secondary" className="rounded-md text-[10px] h-5 font-bold">
                {currentProgress.status === 'mastered' ? '已掌握' : currentProgress.status === 'reviewing' ? '复习中' : '学习中'}
              </Badge>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="px-6 py-6 space-y-6">
          {mode === 'dictation' ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3 justify-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  句子拼写
                </span>
                <span className="text-[11px] text-muted-foreground/60">
                  ({currentSentence ? getWords(currentSentence.en).length : 0} 个单词)
                </span>
              </div>
              {currentSentence && (
                <DictationInput
                  words={getWords(currentSentence.en)}
                  userInputs={dictationInputs}
                  setUserInput={(i, v) => setDictationInputs((prev) => {
                    const next = [...prev];
                    next[i] = v;
                    return next;
                  })}
                  submitted={submitted}
                  correctWords={results?.wordResults || {}}
                  inputRefs={inputRefs}
                />
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3 justify-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  单词拼写
                </span>
                <span className="text-[11px] text-muted-foreground/60">
                  ({fillParts?.filter((p) => p.type === 'blank').length || 0} 个空)
                </span>
              </div>
              {currentSentence && fillParts && (
                <FillDisplay
                  parts={fillParts}
                  userInputs={fillInputs}
                  setUserInput={(i, v) => setFillInputs((prev) => {
                    const next = [...prev];
                    next[i] = v;
                    return next;
                  })}
                  submitted={submitted}
                  correctWords={results?.wordResults || {}}
                  inputRefs={inputRefs}
                />
              )}
            </div>
          )}

          <Separator />

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => tts.speak(currentSentence?.en || '')}
              className="rounded-xl font-bold gap-2"
            >
              <Volume2 className="size-4" />
              {audioMode === 'sentence' ? '播放句子' : '逐词播放'}
            </Button>

            {!submitted ? (
              <Button
                onClick={handleSubmit}
                className="rounded-xl bg-[#00B894] hover:bg-[#00a882] text-white font-bold gap-2"
              >
                <Check className="size-4" />
                提交答案
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleRetry}
                  variant="outline"
                  size="sm"
                  className="rounded-xl font-bold gap-2"
                >
                  <RotateCcw className="size-4" />
                  重来
                </Button>
                {mode === 'dictation' && results && results.score < results.total && (
                  <Button
                    onClick={handleRetryWrong}
                    variant="outline"
                    size="sm"
                    className="rounded-xl font-bold gap-2 text-amber-600 border-amber-200 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/30"
                  >
                    <RefreshCw className="size-4" />
                    重试错词
                  </Button>
                )}
                <Button
                  onClick={handleNext}
                  className="rounded-xl bg-[#00B894] hover:bg-[#00a882] text-white font-bold gap-2"
                >
                  {currentIndex < sessionQueue.length - 1 ? (
                    <>下一句 <ChevronRight className="size-4" /></>
                  ) : (
                    <>完成 <Check className="size-4" /></>
                  )}
                </Button>
              </>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              disabled={submitted}
              className="rounded-xl font-bold gap-2 text-muted-foreground"
            >
              <SkipForward className="size-4" />
              跳过
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleFavorite}
              className={cn(
                'rounded-xl font-bold gap-2',
                isFav ? 'text-amber-500' : 'text-muted-foreground',
              )}
            >
              {isFav ? <Star className="size-4 fill-amber-500" /> : <StarOff className="size-4" />}
            </Button>
          </div>

          {/* Results feedback */}
          {submitted && results && (
            <div className="rounded-2xl bg-muted/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">
                    {results.score === results.total ? '🎉 全部正确！' : results.score >= results.total * 0.7 ? '👍 不错！' : '💪 继续加油！'}
                  </span>
                  <Badge
                    className={cn(
                      'rounded-lg text-xs font-bold',
                      scorePercent >= 80 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                      scorePercent >= 50 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                      'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
                    )}
                  >
                    {results.score}/{results.total}
                  </Badge>
                </div>

                {/* Mini word results */}
                <div className="flex gap-1.5">
                  {Array.from({ length: results.total }, (_, i) => {
                    const wordResult = results.wordResults[Object.keys(results.wordResults)[i] as any] ?? true;
                    return (
                      <span
                        key={i}
                        className={cn(
                          'size-5 rounded-md flex items-center justify-center text-[10px] font-bold',
                          wordResult
                            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
                        )}
                      >
                        {wordResult ? '✓' : '✗'}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Show correct answers for wrong words */}
              {results.score < results.total && (
                <div className="text-xs text-muted-foreground space-y-1">
                  {(() => {
                    const words = getWords(currentSentence?.en || '');
                    const wrongList: { index: number; correct: string }[] = [];
                    for (const [wordIdxStr, isCorrect] of Object.entries(results.wordResults)) {
                      if (!isCorrect) {
                        wrongList.push({ index: Number(wordIdxStr), correct: words[Number(wordIdxStr)] });
                      }
                    }
                    if (wrongList.length === 0) return null;
                    return (
                      <div>
                        <span className="font-bold">正确答案：</span>
                        {wrongList.map((w) => {
                          // fill mode: inputs indexed by blank number, not word index
                          const userVal = mode === 'dictation'
                            ? dictationInputs[w.index]
                            : (() => {
                                if (!fillParts) return undefined;
                                const blankIdx = fillParts.findIndex(p => p.type === 'blank' && p.wordIndex === w.index);
                                return blankIdx === -1 ? undefined : fillInputs[blankIdx];
                              })();
                          return (
                            <span key={w.index} className="inline-block mr-3">
                              <span className="text-rose-500 line-through">{userVal || '___'}</span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-1">→ {w.correct}</span>
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Full sentence display */}
              {currentSentence && (
                <div className="pt-2 border-t border-border/40">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1.5">
                    完整句子
                  </div>
                  <p className="text-sm font-mono leading-relaxed text-foreground/90">
                    {(() => {
                      const words = getWords(currentSentence.en);
                      // In fill mode, non-blank words were visible — show as correct
                      const blankSet = mode === 'fill' && fillParts
                        ? new Set(fillParts.filter(p => p.type === 'blank').map(p => p.wordIndex))
                        : null;
                      return words.map((word, i) => {
                        const isCorrect = blankSet
                          ? !blankSet.has(i) || !!results.wordResults[i]
                          : !!results.wordResults[i];
                        return (
                          <span
                            key={i}
                            className={cn(
                              'inline-block mr-[0.3em] rounded px-0.5',
                              isCorrect
                                ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                                : 'text-rose-600 dark:text-rose-400 font-bold',
                            )}
                          >
                            {word}
                          </span>
                        );
                      });
                    })()}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* ── Navigation buttons ── */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="rounded-xl gap-1"
        >
          <ChevronLeft className="size-4" /> 上一句
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetCompletedAll();
              setImportDirty(c => c + 1);
            }}
            className="rounded-xl gap-1 text-muted-foreground"
          >
            <RefreshCw className="size-3.5" /> 重新排队
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowManageDialog(true)}
            className="rounded-xl gap-1 text-muted-foreground"
          >
            <BookOpen className="size-3.5" /> 学习记录
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNext}
          className="rounded-xl gap-1"
        >
          {currentIndex >= sessionQueue.length - 1 ? '完成' : '下一句'} <ChevronRightIcon className="size-4" />
        </Button>
      </div>

      {/* ── Dialogs ── */}

      {/* AI Batch Add Dialog */}
      <AIBatchAddDialog
        open={showAIDialog}
        onOpenChange={(open) => {
          setShowAIDialog(open);
          if (!open) { setAiResult(null); }
        }}
        topic={aiTopic}
        onTopicChange={setAiTopic}
        difficulty={aiDifficulty}
        onDifficultyChange={setAiDifficulty}
        count={aiCount}
        onCountChange={setAiCount}
        loading={aiLoading}
        result={aiResult}
        onGenerate={async () => {
          await handleAIGenerate();
          rebuildSession();
        }}
        isConfigured={ai.isConfigured}
      />

      {/* Manage learning records dialog */}
      <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
        <DialogContent className="rounded-2xl sm:max-w-sm" aria-describedby="manage-dialog-desc-main">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-black">
              <BookOpen className="size-5 text-[#00B894]" />
              管理学习记录
            </DialogTitle>
            <p id="manage-dialog-desc-main" className="text-xs text-muted-foreground">
              查看学习进度或重置所有记录
            </p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-muted/50 p-3 text-center">
                <p className="text-lg font-black text-[#00B894]">{learningStats.mastered}</p>
                <p className="text-[10px] font-bold text-muted-foreground">已掌握</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3 text-center">
                <p className="text-lg font-black text-amber-500">{learningStats.learning}</p>
                <p className="text-[10px] font-bold text-muted-foreground">学习中</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3 text-center">
                <p className="text-lg font-black text-blue-500">{learningStats.reviewing}</p>
                <p className="text-[10px] font-bold text-muted-foreground">待复习</p>
              </div>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                今日已练习 <span className="font-bold">{learningStats.todayPracticed}</span> 句
              </p>
            </div>
            <Separator />
            <div className="text-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  resetAllProgress();
                  resetCompletedAll();
                  setShowManageDialog(false);
                  setImportDirty(c => c + 1);
                  toast.success('学习记录已重置');
                }}
                className="rounded-xl font-bold gap-2 text-rose-500 border-rose-200 hover:bg-rose-50 dark:border-rose-800 dark:hover:bg-rose-950/30"
              >
                <RotateCcw className="size-4" />
                重置所有学习记录
              </Button>
              <p className="text-[10px] text-muted-foreground/60 mt-2">
                清除所有进度和完成记录，句子库不受影响
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Favorites Sidebar (Sheet) ── */}
      <Sheet open={showFavorites} onOpenChange={setShowFavorites}>
        <SheetContent side="right" className="w-80 p-0">
          <SheetHeader className="p-4 border-b border-border">
            <SheetTitle className="flex items-center gap-2 text-sm font-black">
              <Star className="size-4 fill-amber-500 text-amber-500" />
              收藏的拼写句子
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-8rem)] p-4">
            {favorites.filter((f) => f.type === 'spelling').length === 0 ? (
              <div className="text-center py-12">
                <StarOff className="size-8 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground/60">还没有收藏的句子</p>
                <p className="text-[10px] text-muted-foreground/40 mt-1">拼写时点击 ⭐ 收藏</p>
              </div>
            ) : (
              <div className="space-y-2">
                {favorites
                  .filter((f) => f.type === 'spelling')
                  .map((fav) => {
                    const sentence = sentences.find((s) => s.en === fav.content);
                    return (
                      <button
                        key={fav.id}
                        onClick={() => sentence && handleLoadFavorite(sentence)}
                        className="w-full text-left p-3 rounded-xl hover:bg-muted/70 transition-colors border border-transparent hover:border-border group"
                      >
                        <p className="text-xs font-bold text-foreground/80 leading-relaxed line-clamp-2">
                          {fav.content}
                        </p>
                        <p className="text-[11px] text-muted-foreground/60 mt-1 line-clamp-1">
                          {fav.meaning}
                        </p>
                        <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[10px] font-bold text-[#00B894]">
                            点击练习 →
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Dialog Components ──

function AIBatchAddDialog({
  open, onOpenChange, topic, onTopicChange,
  difficulty, onDifficultyChange, count, onCountChange,
  loading, result, onGenerate, isConfigured,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topic: string;
  onTopicChange: (t: string) => void;
  difficulty: SpellingDifficulty;
  onDifficultyChange: (d: SpellingDifficulty) => void;
  count: number;
  onCountChange: (c: number) => void;
  loading: boolean;
  result: { success: boolean; count: number; error?: string } | null;
  onGenerate: () => Promise<void>;
  isConfigured: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md" aria-describedby="ai-dialog-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-black">
            <Sparkles className="size-5 text-[#00B894]" />
            AI 批量添加句子
          </DialogTitle>
          <p id="ai-dialog-desc" className="text-xs text-muted-foreground">
            输入主题或关键词，AI 将生成英文句子并添加到你的拼写练习库
          </p>
        </DialogHeader>

        {!isConfigured ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">请先在右上角设置 AI 密钥</p>
            <p className="text-xs text-muted-foreground/60">
              支持 DeepSeek、通义千问、豆包等
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                主题/关键词
              </label>
              <Input
                value={topic}
                onChange={(e) => onTopicChange(e.target.value)}
                placeholder="例如：日常生活、科技、旅行、工作..."
                className="rounded-xl"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                  难度
                </label>
                <Select value={difficulty} onValueChange={(v: SpellingDifficulty) => onDifficultyChange(v)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">初级</SelectItem>
                    <SelectItem value="intermediate">中级</SelectItem>
                    <SelectItem value="advanced">高级</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                  数量
                </label>
                <Select value={String(count)} onValueChange={(v) => onCountChange(Number(v))}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 8, 10, 15, 20].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n} 条</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {result && (
              <div className={cn(
                'rounded-xl p-3 text-xs font-bold',
                result.success
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300',
              )}>
                {result.success
                  ? `✅ 成功添加 ${result.count} 条句子`
                  : `❌ ${result.error || '生成失败'}`}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl font-bold"
          >
            取消
          </Button>
          {isConfigured && (
            <Button
              onClick={onGenerate}
              disabled={loading || !topic.trim()}
              className="rounded-xl bg-[#00B894] hover:bg-[#00a882] text-white font-bold gap-2"
            >
              {loading ? (
                <>生成中...</>
              ) : (
                <><Sparkles className="size-4" /> 生成句子</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

