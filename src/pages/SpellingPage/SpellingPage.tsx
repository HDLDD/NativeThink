/**
 * 句子拼写页面 — SpellingPage
 * 提供句子拼写 & 单词拼写两种拼写模式
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Volume2,
  Check,
  ChevronRight,
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
  ChevronRight as ChevronRightIcon,
  List,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useTTS } from '@/lib/use-tts';
import { useFavorites } from '@/lib/use-favorites';
import { useAI } from '@/hooks/use-ai';
import { useSpellingSentences } from '@/lib/use-spelling-sentences';
import { useSpellingLearning } from '@/lib/use-spelling-learning';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { queryWords, preloadLevels } from '@/data/wordbank';
import type { IWordEntry } from '@/data/wordbank/schema';
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

/** Get word detail for dictation hints */
function getWordDetails(en: string) {
  return en.split(/\s+/).filter(Boolean).map((w) => ({
    clean: w.replace(/[^a-zA-Z'-]/g, ''),
    original: w,
  }));
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

/** 句子拼写: 下划线即输入区 — 无边框盒, 一行排列, 间距一个字母 */
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
    <div className="flex flex-wrap justify-center gap-x-[0.6em] gap-y-3">
      {words.map((clean, i) => {
        const isCorrect = submitted ? correctWords[i] : undefined;
        return (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            value={userInputs[i] || ''}
            onChange={(e) => setUserInput(i, e.target.value)}
            disabled={submitted}
            maxLength={clean.length + 2}
            placeholder={'_'.repeat(clean.length)}
            className={cn(
              'h-7 w-[calc(1ch*' + Math.max(clean.length, 3) + '+ 4px)] min-w-[28px]',
              'text-center text-sm font-mono outline-none transition-all duration-200',
              'bg-transparent border-0 border-b-2 border-dotted border-muted-foreground/30',
              'placeholder:text-muted-foreground/30 placeholder:tracking-[0.2em] placeholder:select-none',
              'focus:border-[#00B894] focus:border-solid',
              submitted
                ? isCorrect
                  ? 'border-emerald-400 text-emerald-600 dark:text-emerald-400'
                  : 'border-rose-400 text-rose-600 dark:text-rose-400'
                : 'hover:border-muted-foreground/60',
            )}
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
          />
        );
      })}
    </div>
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
    addSentence,
    addSentences,
    importFromWordExamples,
    aiBatchAdd,
  } = useSpellingSentences();
  const {
    getProgress,
    recordAttempt,
    calculateQuality,
    buildSessionQueue,
    stats: learningStats,
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

  // Fill mode state
  const [fillParts, setFillParts] = useState<ReturnType<typeof splitForFill> | null>(null);

  // UI state
  const [showFavorites, setShowFavorites] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [completionShown, setCompletionShown] = useState(false);
  const [autoRead, setAutoRead] = useState(true);         // 自动朗读

  // AI dialog state
  const [aiTopic, setAiTopic] = useState('');
  const [aiDifficulty, setAiDifficulty] = useState<SpellingDifficulty>('intermediate');
  const [aiCount, setAiCount] = useState(10);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ success: boolean; count: number; error?: string } | null>(null);
  const [aiPreview, setAiPreview] = useState<{ en: string; zh: string }[]>([]);

  // Import dialog state
  const [importLevel, setImportLevel] = useState('cet4');

  /** Build/rebuild session */
  const rebuildSession = useCallback(() => {
    const allSentences = sentences;
    if (allSentences.length === 0) {
      setSessionQueue([]);
      setCurrentIndex(0);
      return;
    }
    const queue = buildSessionQueue(allSentences, 15);
    setSessionQueue(queue);
    setCurrentIndex(0);
    setSubmitted(false);
    setResults(null);
    setCompletionShown(false);
  }, [sentences, buildSessionQueue]);

  // Initialize session on sentences load
  useEffect(() => {
    if (sentences.length > 0 && sessionQueue.length === 0) {
      rebuildSession();
    }
  }, [sentences.length, rebuildSession, sessionQueue.length]);

  // Reset inputs when sentence changes
  useEffect(() => {
    setSubmitted(false);
    setResults(null);
    if (currentSentence) {
      const words = getWords(currentSentence.en);
      if (mode === 'dictation') {
        setDictationInputs(new Array(words.length).fill(''));
        inputRefs.current = new Array(words.length).fill(null);
      } else {
        // Fill mode: compute blanks
        const blanks = selectBlanks(words);
        const parts = splitForFill(currentSentence.en, blanks);
        setFillParts(parts);
        const blankCount = parts.filter((p) => p.type === 'blank').length;
        setFillInputs(new Array(blankCount).fill(''));
        inputRefs.current = new Array(blankCount).fill(null);
      }

      // Auto-play audio (only in 句子拼写 mode + autoRead enabled)
      const timer = setTimeout(() => {
        if (mode === 'dictation' && autoRead) tts.speak(currentSentence.en);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [currentSentence?.id, mode, autoRead]);

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

  /** Navigate to next sentence */
  const handleNext = useCallback(() => {
    if (currentIndex < sessionQueue.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setCompletionShown(true);
    }
  }, [currentIndex, sessionQueue.length]);

  /** Navigate to previous sentence */
  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  /** Skip current sentence */
  const handleSkip = useCallback(() => {
    handleNext();
  }, [handleNext]);

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

  /** Retry only wrong words (句子拼写: clear wrong word inputs; 单词拼写: clear wrong blanks) */
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
    setSubmitted(false);
    setResults(null);
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
    setAiPreview([]);

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

  // Progress
  const isFav = currentSentence ? isFavorited(currentSentence.en, 'spelling') : false;
  const currentProgress = currentSentence ? getProgress(currentSentence.id) : null;

  // ── Empty State ──
  if (sentences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-4">
        <div className="size-20 rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 flex items-center justify-center mb-6">
          <Sparkles className="size-10 text-[#00B894]" />
        </div>
        <h2 className="text-2xl font-black italic mb-2">句子拼写</h2>
        <p className="text-muted-foreground mb-8 text-center max-w-md">
          还没有拼写句子。<br />
          通过 AI 批量生成，或从单词库导入例句开始练习。
        </p>
        <div className="flex gap-3">
          <Button
            onClick={() => setShowAIDialog(true)}
            className="rounded-2xl bg-[#00B894] hover:bg-[#00a882] text-white font-bold gap-2"
          >
            <Sparkles className="size-4" />
            AI 批量添加
          </Button>
          <Button
            onClick={() => setShowImportDialog(true)}
            variant="outline"
            className="rounded-2xl font-bold gap-2"
          >
            <BookOpen className="size-4" />
            从单词库导入
          </Button>
        </div>

        {/* Dialogs for empty state */}
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
          onGenerate={handleAIGenerate}
          isConfigured={ai.isConfigured}
        />
        <ImportDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          level={importLevel}
          onLevelChange={setImportLevel}
          addSentences={addSentences}
          getDifficulty={getDifficulty}
          onImported={rebuildSession}
        />
      </div>
    );
  }

  // ── Completion State ──
  if (completionShown || sessionQueue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-4">
        <div className="size-20 rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 flex items-center justify-center mb-6">
          <Check className="size-10 text-[#00B894]" />
        </div>
        <h2 className="text-2xl font-black italic mb-2">全部完成！</h2>
        <p className="text-muted-foreground mb-2">
          今日已练习 {learningStats.todayPracticed} 句
        </p>
        <p className="text-xs text-muted-foreground/60 mb-8">
          掌握 {learningStats.mastered} 句 · 学习中 {learningStats.learning} 句 · 待复习 {learningStats.reviewing} 句
        </p>
        <div className="flex gap-3">
          <Button
            onClick={rebuildSession}
            className="rounded-2xl bg-[#00B894] hover:bg-[#00a882] text-white font-bold gap-2"
          >
            <RefreshCw className="size-4" />
            再来一轮
          </Button>
          <Button
            onClick={() => setShowAIDialog(true)}
            variant="outline"
            className="rounded-2xl font-bold gap-2"
          >
            <Sparkles className="size-4" />
            添加新句子
          </Button>
        </div>

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
          onGenerate={handleAIGenerate}
          isConfigured={ai.isConfigured}
        />
      </div>
    );
  }

  // ── Main Content ──
  const scorePercent = results ? Math.round((results.score / results.total) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* ── Header Controls ── */}
      <Card className="p-4 rounded-2xl border-border/50 shadow-sm space-y-4">
        {/* Row 1: Mode toggles */}
        <div className="flex items-center justify-between">
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

        {/* Row 2: Progress + Action buttons */}
        <div className="flex items-center justify-between">
          {/* Progress */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-foreground/80">
              {currentIndex + 1} / {sessionQueue.length}
            </span>
            <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-[#00B894] rounded-full transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / sessionQueue.length) * 100}%` }}
              />
            </div>
            <Badge variant="secondary" className="rounded-lg text-[10px] font-bold">
              今日 {learningStats.todayPracticed} 句
            </Badge>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowImportDialog(true)}
              className="rounded-xl h-8 text-xs font-bold gap-1.5"
            >
              <BookOpen className="size-3.5" />
              <span className="hidden sm:inline">导入例句</span>
            </Button>
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
                    const inputs = mode === 'dictation' ? dictationInputs : fillInputs;
                    return (
                      <div>
                        <span className="font-bold">正确答案：</span>
                        {wrongList.map((w) => (
                          <span key={w.index} className="inline-block mr-3">
                            <span className="text-rose-500 line-through">{inputs[w.index] || '___'}</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-1">→ {w.correct}</span>
                          </span>
                        ))}
                      </div>
                    );
                  })()}
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
        <Button
          variant="ghost"
          size="sm"
          onClick={rebuildSession}
          className="rounded-xl gap-1 text-muted-foreground"
        >
          <RefreshCw className="size-3.5" /> 重新排队
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNext}
          disabled={currentIndex >= sessionQueue.length - 1}
          className="rounded-xl gap-1"
        >
          下一句 <ChevronRightIcon className="size-4" />
        </Button>
      </div>

      {/* ── Dialogs ── */}

      {/* AI Batch Add Dialog */}
      <AIBatchAddDialog
        open={showAIDialog}
        onOpenChange={(open) => {
          setShowAIDialog(open);
          if (!open) { setAiResult(null); setAiPreview([]); }
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

      {/* Import Dialog */}
      <ImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        level={importLevel}
        onLevelChange={setImportLevel}
        addSentences={addSentences}
        getDifficulty={getDifficulty}
        onImported={rebuildSession}
      />

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

function ImportDialog({
  open, onOpenChange, level, onLevelChange, addSentences, getDifficulty, onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  level: string;
  onLevelChange: (l: string) => void;
  addSentences: (items: Omit<ISpellingSentence, 'id' | 'createdAt'>[]) => number;
  getDifficulty: (level: string) => SpellingDifficulty;
  onImported: () => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [importingSegments, setImportingSegments] = useState<Set<number>>(new Set());
  const [segments, setSegments] = useState<
    Array<{ index: number; from: number; to: number; examples: { en: string; zh: string; word: string }[] }>
  >([]);
  const [importedSet, setImportedSet] = useState<Set<number>>(new Set());
  const [totalFound, setTotalFound] = useState(0);
  const [totalImported, setTotalImported] = useState(0);
  const [scanned, setScanned] = useState(false);

  const SEGMENT_SIZE = 200;

  // Reset when dialog opens/closes or level changes
  useEffect(() => {
    if (!open) {
      setScanned(false);
      setSegments([]);
      setImportedSet(new Set());
      setTotalFound(0);
      setTotalImported(0);
      setScanning(false);
      setImportingSegments(new Set());
    }
  }, [open]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setScanned(false);
    try {
      // Preload the level
      await preloadLevels([level]);
      const words = queryWords({ level });
      if (!words || words.length === 0) {
        toast('该词库暂无数据');
        setScanning(false);
        return;
      }

      // Collect all examples from all words
      const allExamples: { en: string; zh: string; word: string }[] = [];
      for (const w of words) {
        if (w.examples && w.examples.length > 0) {
          for (const ex of w.examples) {
            if (ex.en && ex.zh) {
              allExamples.push({ en: ex.en.trim(), zh: ex.zh.trim(), word: w.word });
            }
          }
        }
      }

      setTotalFound(allExamples.length);

      // Build segments of SEGMENT_SIZE
      const segs: Array<{ index: number; from: number; to: number; examples: { en: string; zh: string; word: string }[] }> = [];
      for (let i = 0; i < allExamples.length; i += SEGMENT_SIZE) {
        const chunk = allExamples.slice(i, i + SEGMENT_SIZE);
        segs.push({
          index: segs.length,
          from: i + 1,
          to: Math.min(i + SEGMENT_SIZE, allExamples.length),
          examples: chunk,
        });
      }
      setSegments(segs);
      setScanned(true);
    } catch (e) {
      toast('扫描词库失败，请重试');
    }
    setScanning(false);
  }, [level]);

  const handleImportSegment = useCallback(async (segIndex: number) => {
    const seg = segments[segIndex];
    if (!seg) return;

    setImportingSegments((prev) => new Set(prev).add(segIndex));
    try {
      const difficulty = getDifficulty(level);
      // Batch all examples into a single addSentences call
      const items: Omit<ISpellingSentence, 'id' | 'createdAt'>[] = seg.examples.map((ex) => ({
        en: ex.en,
        zh: ex.zh,
        source: 'word_example' as const,
        sourceWord: ex.word,
        difficulty,
      }));
      const count = addSentences(items);
      setImportedSet((prev) => new Set(prev).add(segIndex));
      setTotalImported((prev) => prev + count);
      toast.success(`第 ${segIndex + 1} 段导入完成：新增 ${count} 条`);
    } catch {
      toast.error(`第 ${segIndex + 1} 段导入失败`);
    }
    setImportingSegments((prev) => {
      const next = new Set(prev);
      next.delete(segIndex);
      return next;
    });
  }, [segments, level, addSentences, getDifficulty]);

  const handleImportAll = useCallback(async () => {
    // Collect ALL remaining items into one batch to avoid stale closure overwrites
    const allItems: Omit<ISpellingSentence, 'id' | 'createdAt'>[] = [];
    const difficulty = getDifficulty(level);
    for (let i = 0; i < segments.length; i++) {
      if (!importedSet.has(i)) {
        const seg = segments[i];
        for (const ex of seg.examples) {
          allItems.push({
            en: ex.en,
            zh: ex.zh,
            source: 'word_example' as const,
            sourceWord: ex.word,
            difficulty,
          });
        }
      }
    }
    if (allItems.length === 0) return;
    const count = addSentences(allItems);
    // Mark all segments as imported
    const newSet = new Set(importedSet);
    for (let i = 0; i < segments.length; i++) {
      if (!importedSet.has(i)) newSet.add(i);
    }
    setImportedSet(newSet);
    setTotalImported((prev) => prev + count);
    toast.success(`全部导入完成：新增 ${count} 条`);
    onImported();
  }, [segments, importedSet, addSentences, level, getDifficulty, onImported]);

  const allImported = scanned && segments.length > 0 && importedSet.size === segments.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md" aria-describedby="import-dialog-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-black">
            <BookOpen className="size-5 text-[#00B894]" />
            从单词库导入例句
          </DialogTitle>
          <p id="import-dialog-desc" className="text-xs text-muted-foreground">
            分段导入词库中所有单词的例句，每段至少 {SEGMENT_SIZE} 条
          </p>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {/* Level selector */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              选择词库级别
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Select value={level} onValueChange={(v) => { onLevelChange(v); setScanned(false); setSegments([]); }}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zhongkao">中考 · 3,223 词</SelectItem>
                    <SelectItem value="gaokao">高考 · 6,008 词</SelectItem>
                    <SelectItem value="cet4">大学四级 · 4,542 词</SelectItem>
                    <SelectItem value="cet6">大学六级 · 7,404 词</SelectItem>
                    <SelectItem value="ielts">雅思 · 6,609 词</SelectItem>
                    <SelectItem value="toefl">托福 · 10,367 词</SelectItem>
                    <SelectItem value="postgraduate">考研 · 9,602 词</SelectItem>
                    <SelectItem value="professional">专业英语 · 8,887 词</SelectItem>
                    <SelectItem value="advanced">高级 · 18,471 词</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleScan}
                disabled={scanning}
                className="rounded-xl bg-[#00B894] hover:bg-[#00a882] text-white font-bold shrink-0"
              >
                {scanning ? '扫描中...' : '扫描词库'}
              </Button>
            </div>
          </div>

          {/* Scan result */}
          {scanned && (
            <div className="rounded-xl bg-muted/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">共扫描到 {totalFound} 条例句</span>
                <span className="text-xs text-muted-foreground">
                  分为 {segments.length} 段
                </span>
              </div>

              {/* Progress bar */}
              {segments.length > 0 && (
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#00B894] rounded-full transition-all duration-300"
                    style={{ width: `${(importedSet.size / segments.length) * 100}%` }}
                  />
                </div>
              )}

              {/* Segment list */}
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {segments.map((seg) => {
                  const done = importedSet.has(seg.index);
                  const importing = importingSegments.has(seg.index);
                  return (
                    <div
                      key={seg.index}
                      className={cn(
                        'flex items-center justify-between p-2 rounded-lg text-xs transition-all',
                        done
                          ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400'
                          : 'bg-background border border-border/50',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold">第 {seg.index + 1} 段</span>
                        <span className="text-muted-foreground">
                          第 {seg.from}-{seg.to} 条 ({seg.examples.length} 句)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {done ? (
                          <span className="text-emerald-500 font-bold text-[10px]">✓ 已导入</span>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleImportSegment(seg.index)}
                            disabled={importing}
                            className="h-7 rounded-lg text-[10px] font-bold px-3 bg-[#00B894] hover:bg-[#00a882] text-white"
                          >
                            {importing ? '导入中...' : '导入此段'}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total imported */}
              {totalImported > 0 && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                  已累计导入 {totalImported} 条例句
                </p>
              )}

              {/* All done */}
              {allImported && (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    ✅ 全部导入完成！共 {totalImported} 条
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl font-bold"
          >
            {allImported ? '完成' : '取消'}
          </Button>
          {scanned && !allImported && (
            <Button
              onClick={handleImportAll}
              disabled={importingSegments.size > 0}
              className="rounded-xl bg-[#00B894] hover:bg-[#00a882] text-white font-bold gap-2"
            >
              <BookOpen className="size-4" />
              逐段导入全部
            </Button>
          )}
          {allImported && (
            <Button
              onClick={() => { onOpenChange(false); onImported(); }}
              className="rounded-xl bg-[#00B894] hover:bg-[#00a882] text-white font-bold"
            >
              开始练习
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

