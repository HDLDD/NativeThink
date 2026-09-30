import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useFramerMotion } from '@/lib/lazy-framer-motion';
import { Search, Lightbulb, Target, CheckCircle2, RotateCw, Sparkles, Volume2, BookOpen, ArrowRight, ArrowLeft, XCircle, Edit3, Shuffle, Headphones, Link2, PenLine, ChevronDown, ChevronLeft, Eye, Flame } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import type { IWordEntry } from '@/data/wordbank/schema';
import { findWord, getRandomWords, queryWords, preloadDetail, isDetailReady } from '@/data/wordbank';
import { useFavorites } from '@/lib/use-favorites';
import { mergeCollocAiCache, persistCollocAiCache, readCollocAiCache } from '@/lib/colloc-ai-cache';
import { WordInfoDialog } from './QuickCardMode';
import { useWordLearning } from '@/lib/use-word-learning';
import { useTTS } from '@/lib/use-tts';
import { useImmersive } from '@/lib/focus-mode';
import { useLearningStats } from '@/lib/use-learning-stats';
import { sfxCorrect, sfxWrong, sfxTick, sfxComplete } from '@/lib/sfx';
import STATIC_COLLOC_TRANSLATIONS from '@/data/wordbank/collocation-translations';
import { translateWithLocalMt, isLocalMtReady } from '@/lib/local-mt';
import { useAI } from '@/hooks/use-ai';
import { FitWord } from '@/components/FitWord';
import { safeStorage } from '@/lib/safe-storage';
import { cn, cleanText, extractJson } from '@/lib/utils';
import { toast } from 'sonner';

type ReviewMode = 'flashcard' | 'choice' | 'spelling' | 'listening' | 'matching' | 'fillblank';

/** 答错的词隔几张再出现（与复习检测 / 快速闪卡同参：vocab-session.ts） */
const RELEARN_GAP = 4;
/** 同一个词在一轮里最多重排几次 */
const MAX_RELEARN = 2;
/** 自动发音的持久化键 —— 与复习检测/快速闪卡共用：一处关闭，处处安静 */
const AUTO_SPEAK_KEY = '__nativethink_vocab_autospeak';

// Level color map
const LEVEL_COLORS: Record<string, { accent: string; bg: string; border: string; light: string; gradient: string; label: string }> = {
  all:          { accent: '#00B894', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', light: 'bg-emerald-50 dark:bg-emerald-500/15', gradient: 'from-emerald-500 to-[#00B894]', label: '全部' },
  zhongkao:     { accent: '#EF4444', bg: 'bg-red-500/10', border: 'border-red-500/20', light: 'bg-red-50 dark:bg-red-500/15', gradient: 'from-red-500 to-rose-500', label: '中考' },
  gaokao:       { accent: '#F97316', bg: 'bg-orange-500/10', border: 'border-orange-500/20', light: 'bg-orange-50 dark:bg-orange-500/15', gradient: 'from-orange-500 to-amber-500', label: '高考' },
  cet4:         { accent: '#0EA5E9', bg: 'bg-sky-500/10', border: 'border-sky-500/20', light: 'bg-sky-50 dark:bg-sky-500/15', gradient: 'from-sky-500 to-cyan-500', label: '四级' },
  cet6:         { accent: '#6C5CE7', bg: 'bg-violet-500/10', border: 'border-violet-500/20', light: 'bg-violet-50 dark:bg-violet-500/15', gradient: 'from-violet-500 to-purple-500', label: '六级' },
  ielts:        { accent: '#F59E0B', bg: 'bg-amber-500/10', border: 'border-amber-500/20', light: 'bg-amber-50 dark:bg-amber-500/15', gradient: 'from-amber-500 to-orange-500', label: '雅思' },
  toefl:        { accent: '#EC4899', bg: 'bg-rose-500/10', border: 'border-rose-500/20', light: 'bg-rose-50 dark:bg-rose-500/15', gradient: 'from-rose-500 to-pink-500', label: '托福' },
  postgraduate: { accent: '#8B5CF6', bg: 'bg-purple-500/10', border: 'border-purple-500/20', light: 'bg-purple-50 dark:bg-purple-500/15', gradient: 'from-purple-500 to-violet-500', label: '考研' },
  professional: { accent: '#14B8A6', bg: 'bg-teal-500/10', border: 'border-teal-500/20', light: 'bg-teal-50 dark:bg-teal-500/15', gradient: 'from-teal-500 to-cyan-500', label: '专业' },
  advanced:     { accent: '#64748B', bg: 'bg-slate-500/10', border: 'border-slate-500/20', light: 'bg-slate-50 dark:bg-slate-500/15', gradient: 'from-slate-500 to-gray-500', label: '高阶' },
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
  const { LazyMotionDiv: MotionDiv, LazyAnimatePresence: AnimatePresence } = useFramerMotion();
  const { state, dailyQuota, setDailyQuota, todayRemaining, dueForReview, getNewWords, recordReview, resetProgress, setSuspended } = useWordLearning(level);
  const tts = useTTS();
  // 学习时长统计（供仪表盘/学习记录的连续打卡与时长展示）
  const { addStudyMinutes } = useLearningStats();
  const { chat: aiChat } = useAI();

  const [reviewMode, setReviewMode] = useState<ReviewMode>('flashcard');
  const [setupOpen, setSetupOpen] = useState(false); // 学习设置默认折叠

  // ── 本书进度：当前词书已学/总数（词库为静态数据，可安全 memo；展示于概览 Hero 底部） ──
  // 评分只改 progress 的值（ease/interval），只有"学到新词/重置"才增删键 ——
  // 用键数做 memo 失效依据，避免每张卡都对 'all' 档 7.5 万词全量扫一遍
  const progressKeyCount = Object.keys(state.progress).length;
  const bookProgress = useMemo(() => {
    const words = queryWords({ level: level === 'all' ? undefined : level });
    const total = words.length;
    if (total === 0) return null;
    let learned = 0;
    for (const w of words) if (state.progress[w.word.toLowerCase()]) learned++;
    return { total, learned };
  // 依赖键数而非 progress 对象本身：值变化（ease/interval）不影响已学计数，闭包读到旧对象也无妨
  }, [level, progressKeyCount]);

  const [sessionWords, setSessionWords] = useState<IWordEntry[]>([]);
  const [levelToast, setLevelToast] = useState<string | null>(null);
  /** 重置进度的两段确认（'全部'档位一键清空 9 本词书且不可恢复） */
  const [confirmResetProgress, setConfirmResetProgress] = useState(false);

  const levelColor = LEVEL_COLORS[level] || LEVEL_COLORS.all;
  const modeColor = MODE_COLORS[reviewMode];

  const handleLevelChange = (key: string) => {
    onLevelChange?.(key);
    const label = LEVEL_COLORS[key]?.label || key;
    setLevelToast(label);
    setTimeout(() => setLevelToast(null), 1200);
  };

  const handleModeChange = (mode: ReviewMode) => {
    if (mode !== reviewMode) {
      setReviewMode(mode);
      setSessionWords([]);
    }
  };
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setFlipped] = useState(false);
  const [rated, setRated] = useState(false);

  // 闪卡背面的搭配短语：中文翻译复用搭配学习页的静态表 + 同一份 AI 缓存
  // （键名/迁移/上限统一在 colloc-ai-cache.ts —— 曾用键有拼写错误，首次读取自动迁移）
  const [collocCache, setCollocCache] = useState<Record<string, string>>(() => readCollocAiCache());
  useEffect(() => { persistCollocAiCache(collocCache); }, [collocCache]);
  const [collocTranslating, setCollocTranslating] = useState<string | null>(null);
  const collocZh = (phrase: string): string | null =>
    STATIC_COLLOC_TRANSLATIONS[phrase.toLowerCase()] || collocCache[phrase.toLowerCase()] || null;
  /**
   * 批量翻译本词所有缺中文的搭配：
   * 1) 本地离线模型（就绪时瞬时完成、不消耗额度）
   * 2) 剩余的一次 AI 请求搞定（而不是每条约一次，3 条 15s → 1 次 ~3s）
   */
  const translateCollocBatch = async (phrases: string[]) => {
    const missing = phrases.filter((p) => {
      const k = p.toLowerCase();
      return !STATIC_COLLOC_TRANSLATIONS[k] && !collocCache[k];
    });
    if (missing.length === 0 || collocTranslating) return;
    setCollocTranslating('__batch__');
    const got: Record<string, string> = {};

    // 1) 本地模型
    if (isLocalMtReady()) {
      try {
        const out = await translateWithLocalMt(missing);
        missing.forEach((p, i) => { const t = (out[i] || '').trim(); if (t) got[p.toLowerCase()] = t; });
      } catch { /* 继续走 AI */ }
    }

    // 2) 剩余的一次 AI 批量请求
    const still = missing.filter((p) => !got[p.toLowerCase()]);
    if (still.length > 0) {
      try {
        const res = await aiChat(
          [
            {
              role: 'system',
              content: 'Translate each numbered English collocation/phrase into concise natural Chinese (max 12 chars each). Output STRICT JSON only: {"t":[{"i":1,"zh":"..."}]}. No markdown, no explanation.',
            },
            { role: 'user', content: still.map((p, i) => `[${i + 1}] ${p}`).join(String.fromCharCode(10)) },
          ],
          { temperature: 0.2, maxTokens: 400 },
        );
        // 括号配平取 JSON，替代贪婪的 /\{[\s\S]*\}/；解析不了就保持未翻译（用户可再点）
        let parsed: { t?: { i: number; zh: string }[] } | null = null;
        try {
          parsed = extractJson<{ t?: { i: number; zh: string }[] }>(res);
        } catch {
          parsed = null;
        }
        if (parsed) {
          for (const item of parsed.t || []) {
            const idx = Number(item.i) - 1;
            const src = still[idx];
            if (src && item.zh) got[src.toLowerCase()] = String(item.zh).trim();
          }
        }
      } catch { /* 保持未翻译，用户可再点 */ }
    }

    if (Object.keys(got).length > 0) {
      // 合并 + 封顶是纯函数；落盘由上面的 persist effect 统一做
      setCollocCache((prev) => mergeCollocAiCache(prev, got));
    } else {
      toast.error('搭配翻译失败，请稍后重试');
    }
    setCollocTranslating(null);
  };

  // 会话完成庆祝（借鉴 Duolingo 完课页）
  const [sessionDone, setSessionDone] = useState(false);
  const sessionStatsRef = useRef({ review: 0, fresh: 0, startedAt: 0 });

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
  const [selectedMatchMeaning, setSelectedMatchMeaning] = useState<string | null>(null);
  const [matchedWordSet, setMatchedWordSet] = useState<Set<string>>(new Set());
  const [matchFlashError, setMatchFlashError] = useState<string | null>(null);
  // 本轮配对的错配次数与参与的词条 —— 决定完成时的 SM-2 质量与"配错的词"的重排
  const [matchErrorCount, setMatchErrorCount] = useState(0);
  const [matchPairEntries, setMatchPairEntries] = useState<IWordEntry[]>([]);

  // Fill-blank mode state
  const [fillblankInput, setFillblankInput] = useState('');
  const [fillblankChecked, setFillblankChecked] = useState(false);
  const [fillblankCorrect, setFillblankCorrect] = useState(false);
  const [fillblankHint, setFillblankHint] = useState(false);

  // ── 跨模式一致的会话体验 ──
  /** 自动发音（默认开，只有显式关过才关 —— 与复习检测/快速闪卡共用同一个键） */
  const [autoSpeak, setAutoSpeak] = useState(() => {
    try { return safeStorage.getItem(AUTO_SPEAK_KEY) !== '0'; } catch { return true; }
  });
  const toggleAutoSpeak = () => {
    // 持久化/提示必须放在更新函数**外** —— StrictMode 下更新函数会被调用两次，会双弹提示
    const next = !autoSpeak;
    setAutoSpeak(next);
    try { safeStorage.setItem(AUTO_SPEAK_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  };
  /** 连击：连续答对（quality>=3）计数，答错清零 —— 与复习检测同款即时正反馈 */
  const [combo, setCombo] = useState(0);
  /** 答错重排：每个词本轮已重排次数（隔 RELEARN_GAP 张再出现，最多 MAX_RELEARN 次） */
  const [relearnCounts, setRelearnCounts] = useState<Record<string, number>>({});
  /** 词条详情弹窗（顶部「上一个单词」点开）—— 复用快速闪卡的 WordInfoDialog */
  const [detailWord, setDetailWord] = useState<IWordEntry | null>(null);
  /** detail（例句/搭配）懒加载完成后 +1，强制重渲染把例句画出来 */
  const [detailTick, setDetailTick] = useState(0);
  /** 闪卡「本次刚评分」的词 —— 驱动评分后自动进入下一张（答对 550ms / 答错 900ms） */
  const [ratedNow, setRatedNow] = useState<string | null>(null);
  const lastQualityRef = useRef(4);

  const allWordsForLevel = useMemo(() => {
    return queryWords({ level: level === 'all' ? undefined : level });
  }, [level]);

  /** 按词性分桶（每级只算一次）—— 选择题干扰项"同词性优先"不再每张卡全池 filter 一遍 */
  const posPoolByPos = useMemo(() => {
    const byPos = new Map<string, IWordEntry[]>();
    for (const w of allWordsForLevel) {
      const arr = byPos.get(w.partOfSpeech);
      if (arr) arr.push(w);
      else byPos.set(w.partOfSpeech, [w]);
    }
    return byPos;
  }, [allWordsForLevel]);

  // ===== 自动朗读 =====
  // 用 ref 存 tts，避免 tts 对象变化导致 effect 反复触发、中断朗读
  const ttsRef = useRef(tts);
  ttsRef.current = tts;
  /**
   * 已经自动朗读过的 `${模式}-${下标}-${面}`。
   * **每开一轮必须清空**（见 startSession / exitSession）—— ref 不随组件重挂载归零，
   * 而每轮都从下标 0 开始，不清空则第二轮起第一张卡命中旧 key 被静默跳过：
   * 用户看到的现象就是"新会话第一张卡不读单词"（复习检测/快速闪卡踩过同一个坑）。
   */
  const lastSpokenKey = useRef('');

  // 闪卡：正面读单词（预热下一张），背面「单词+例句」一次读完（与复习检测听感一致）
  useEffect(() => {
    if (!autoSpeak || reviewMode !== 'flashcard') return;
    const word = sessionWords[currentIdx];
    if (!word) return;
    const side = isFlipped ? 'back' : 'front';
    const key = `fc-${currentIdx}-${side}`;
    if (lastSpokenKey.current === key) return;
    lastSpokenKey.current = key;
    if (!isFlipped) {
      ttsRef.current.speak(word.word, { rate: 0.85 });
      const next = sessionWords[currentIdx + 1];
      if (next) ttsRef.current.prewarm(next.word, { rate: 0.85 });
    } else if (word.examples[0]) {
      // 先读单词再读例句，拼成一次 speak —— 两次 speak 会互相掐断（复习检测同款修法）
      const timer = setTimeout(() => {
        ttsRef.current.speak(`${word.word}. ${cleanText(word.examples[0].en)}`, { rate: 0.85 });
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [autoSpeak, reviewMode, currentIdx, isFlipped, sessionWords]);

  // 选择题：读题面单词（看词选义需要发音）。
  // 配对模式**不自动朗读** —— 配对本身就是视觉任务，出声反而干扰（真机反馈）
  useEffect(() => {
    if (!autoSpeak || reviewMode !== 'choice') return;
    const word = sessionWords[currentIdx];
    if (!word) return;
    const key = `${reviewMode}-${currentIdx}-${word.word}`;
    if (lastSpokenKey.current === key) return;
    lastSpokenKey.current = key;
    const timer = setTimeout(() => ttsRef.current.speak(word.word, { rate: 0.85 }), 400);
    return () => clearTimeout(timer);
  }, [autoSpeak, reviewMode, currentIdx, sessionWords]);

  // 听写：只读单词（这就是题目）；拼写/填空**绝不自动读** —— 那等于把答案念出来
  useEffect(() => {
    if (!autoSpeak || reviewMode !== 'listening') return;
    const word = sessionWords[currentIdx];
    if (!word || listeningChecked) return;
    const key = `listening-${currentIdx}-${word.word}`;
    if (lastSpokenKey.current === key) return;
    lastSpokenKey.current = key;
    const timer = setTimeout(() => ttsRef.current.speak(word.word, { rate: 0.85 }), 500);
    return () => clearTimeout(timer);
  }, [autoSpeak, reviewMode, currentIdx, sessionWords, listeningChecked]);

  // Reset session when level changes
  const resetAllState = () => {
    setSessionWords([]);
    setCurrentIdx(0);
    setFlipped(false);
    setRated(false);
    setRatedNow(null);
    setChoiceSelected(null);
    setChoiceCorrect(null);
    setSpellingInput('');
    setSpellingChecked(false);
    setSpellingHint(false);
    setListeningInput('');
    setListeningChecked(false);
    setListeningCorrect(false);
    setListeningHint(false);
    setSelectedMatchWord(null);
    setSelectedMatchMeaning(null);
    setMatchedWordSet(new Set());
    setMatchFlashError(null);
    setMatchErrorCount(0);
    setMatchPairEntries([]);
    setFillblankInput('');
    setFillblankChecked(false);
    setFillblankCorrect(false);
    setFillblankHint(false);
    setRelearnCounts({});
    setCombo(0);
    setRatedNow(null);
    setDetailWord(null);
    lastSpokenKey.current = '';
  };

  useEffect(() => { resetAllState(); }, [level]);
  useEffect(() => { resetAllState(); }, [reviewMode]);

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
      // 不许静默空转：明确告诉用户为什么没开始、出口在哪
      if (dueForReview.length === 0 && todayRemaining <= 0) {
        setSetupOpen(true);
      } else {
        toast.info('暂时没有可学的单词，请稍后再试', { duration: 2500 });
      }
      return;
    }
    setSessionWords(all);
    sessionStatsRef.current = { review: reviewWords.length, fresh: newOnes.length, startedAt: Date.now() };
    // 会话预热：预合成前 5 个词，首词朗读零等待
    all.slice(0, 5).forEach((w, i) => {
      setTimeout(() => ttsRef.current.prewarm(w.word, { rate: 0.85 }), 120 * i);
    });
    setCurrentIdx(0);
    setFlipped(false);
    setRated(false);
    setRatedNow(null);
    setChoiceSelected(null);
    setChoiceCorrect(null);
    setSpellingInput('');
    setSpellingChecked(false);
    setSpellingHint(false);
    setListeningInput('');
    setListeningChecked(false);
    setListeningHint(false);
    setListeningCorrect(false);
    setSelectedMatchWord(null);
    setSelectedMatchMeaning(null);
    setMatchedWordSet(new Set());
    setMatchFlashError(null);
    setMatchErrorCount(0);
    setMatchPairEntries([]);
    setFillblankInput('');
    setFillblankChecked(false);
    setFillblankHint(false);
    setFillblankCorrect(false);
    setRelearnCounts({});
    setCombo(0);
    setRatedNow(null);
    setDetailWord(null);
    lastSpokenKey.current = '';  // 新一轮必须忘掉上一轮的朗读记录，否则第一张卡不出声
    // Pre-generate options for choice / matching modes
    if (reviewMode === 'choice') {
      generateChoiceOptions(all[0]);
    }
    if (reviewMode === 'matching') {
      generateMatchPairs(all[0], all);
    }
  };

  const currentWord = sessionWords[currentIdx];
  /** 上一个单词（顶部常驻、点开看词条详情）—— 与快速闪卡同款 */
  const prevWord = currentIdx > 0 ? sessionWords[currentIdx - 1] : undefined;

  // ── 收藏（type='word'，与收藏页同源）—— 词条详情弹窗里用 ──
  const { favorites, addFavorite, removeFavorite, isFavorited } = useFavorites();
  const isFav = useCallback((word: string) => isFavorited(word, 'word'), [isFavorited]);
  const toggleFav = (w: IWordEntry) => {
    const existing = favorites.find((f) => f.type === 'word' && f.content === w.word);
    if (existing) {
      removeFavorite(existing.id);
    } else {
      addFavorite({
        type: 'word',
        content: w.word,
        meaning: w.meaning,
        example: w.examples[0]?.en,
        category: `每日学习 · ${level === 'all' ? '全部词库' : level}`,
      });
    }
  };

  /**
   * 弹窗里的词条：detail（例句/搭配/深度解释）是**懒加载并按原对象就地补齐**的，
   * 所以到位后重新 findWord 就能拿到完整内容（与快速闪卡同款）。
   */
  const detailShown = useMemo(
    () => (detailWord ? (findWord(detailWord.word) ?? detailWord) : null),
    [detailWord, detailTick],
  );

  useEffect(() => {
    if (!detailShown) return;
    if (detailShown.examples.length > 0) return;
    if (isDetailReady(detailShown.level)) return;   // 已就绪且确实没有例句 → 不再重试（否则 tick 死循环）
    let alive = true;
    preloadDetail([detailShown.level])
      .then(() => { if (alive) setDetailTick((t) => t + 1); })
      .catch(() => { /* 降级：只显示核心字段 */ });
    return () => { alive = false; };
  }, [detailShown, detailTick]);

  /** 词条详情弹窗抽成节点复用（进行中/完成庆祝页都能挂） */
  const detailDialog = (
    <WordInfoDialog
      entry={detailShown}
      onClose={() => setDetailWord(null)}
      onSpeak={(t) => { try { tts.speak(cleanText(t), { rate: 0.9 }); } catch { /* ignore */ } }}
      fav={!!detailShown && isFav(detailShown.word)}
      onToggleFav={() => { if (detailShown) toggleFav(detailShown); }}
    />
  );

  /**
   * 从池中随机抽 n 个：释义互不重复、排除指定词。
   * 用随机下标抽样而不是全池 sort —— 'all' 档位词库 7 万+，每张卡排一次会明显掉帧。
   */
  const sampleFrom = (pool: IWordEntry[], n: number, excludeWords: Set<string>, excludeMeanings: Set<string>): IWordEntry[] => {
    const picked: IWordEntry[] = [];
    let guard = 0;
    while (picked.length < n && guard < 500) {
      guard++;
      const w = pool[Math.floor(Math.random() * pool.length)];
      if (!w || excludeWords.has(w.word) || excludeMeanings.has(w.meaning)) continue;
      excludeWords.add(w.word);
      excludeMeanings.add(w.meaning);
      picked.push(w);
    }
    return picked;
  };

  // Generate 4 options for choice mode
  const generateChoiceOptions = (word: IWordEntry) => {
    // 干扰项优先同词性（更迷惑、更公平），且释义不得与正确项重复 ——
    // 否则会出现两个"正确"的选项，用户选哪个都算对/都算错
    const excludeWords = new Set([word.word]);
    const excludeMeanings = new Set([word.meaning]);
    const posPool = posPoolByPos.get(word.partOfSpeech) ?? [];
    const base = posPool.length >= 10 ? posPool : allWordsForLevel;
    let wrongs = sampleFrom(base, 3, excludeWords, excludeMeanings);
    if (wrongs.length < 3) wrongs = sampleFrom(allWordsForLevel, 3, excludeWords, excludeMeanings);
    const opts = [word, ...wrongs].sort(() => Math.random() - 0.5);
    setChoiceOptions(opts);
    setChoiceSelected(null);
    setChoiceCorrect(null);
  };

  // Generate matching pairs
  const generateMatchPairs = (word: IWordEntry, pool: IWordEntry[]) => {
    // 4 个词的释义必须互不相同，否则配对存在多解
    const excludeWords = new Set([word.word]);
    const excludeMeanings = new Set([word.meaning]);
    const others = sampleFrom(pool, 3, excludeWords, excludeMeanings);
    const selected = [word, ...others];
    setMatchPairEntries(selected);
    const pairs = selected.map((w) => ({ word: w.word, meaning: w.meaning }));
    setMatchPairs(pairs);
    setMatchShuffledWords(pairs.map((p) => p.word).sort(() => Math.random() - 0.5));
    setMatchShuffledMeanings(pairs.map((p) => p.meaning).sort(() => Math.random() - 0.5));
    setSelectedMatchWord(null);
    setSelectedMatchMeaning(null);
    setMatchedWordSet(new Set());
    setMatchFlashError(null);
    setMatchErrorCount(0);
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

  /**
   * 重排**不弹提示**（2026-09-30 用户要求，与复习检测/快速闪卡同一条口径）：
   * 每答错一次就被播报一次很吵，而它真的会再出现 —— 反馈交给卡片本身。
   */
  const scheduleRelearnWord = (word: IWordEntry) => {
    const key = word.word.toLowerCase();
    if ((relearnCounts[key] ?? 0) >= MAX_RELEARN) return;
    setRelearnCounts((c) => ({ ...c, [key]: (c[key] ?? 0) + 1 }));
    setSessionWords((prev) => {
      const at = Math.min(prev.length, currentIdx + 1 + RELEARN_GAP);
      const next = [...prev];
      next.splice(at, 0, word);
      return next;
    });
  };

  /** 连击：连续答对累加，答错清零。每 10 连给一次反馈（toast 不能放进 setState 更新函数 —— StrictMode 会双弹） */
  const bumpCombo = (quality: number) => {
    if (quality >= 3) {
      const n = combo + 1;
      setCombo(n);
    } else {
      setCombo(0);
    }
  };

  const handleRate = (q: number) => {
    if (!currentWord || rated) return;
    recordReview(currentWord, q);
    lastQualityRef.current = q;
    bumpCombo(q);
    if (q <= 2) scheduleRelearnWord(currentWord);
    setRatedNow(currentWord.word.toLowerCase());
    setRated(true);
  };

  const handleChoiceSelect = (word: string) => {
    if (choiceSelected) return;
    setChoiceSelected(word);
    const correct = word === currentWord.word;
    setChoiceCorrect(correct);
    const q = correct ? 5 : 2;
    if (correct) sfxCorrect(); else sfxWrong();
    recordReview(currentWord, q);
    lastQualityRef.current = q;
    bumpCombo(q);
    if (!correct) scheduleRelearnWord(currentWord);
    setRated(true);
  };

  const handleSpellingCheck = () => {
    if (spellingChecked) return;
    setSpellingChecked(true);
    const correct = spellingInput.trim().toLowerCase() === currentWord.word.toLowerCase();
    setSpellingCorrect(correct);
    const q = correct ? 5 : 2;
    if (correct) sfxCorrect(); else sfxWrong();
    recordReview(currentWord, q);
    lastQualityRef.current = q;
    bumpCombo(q);
    if (!correct) scheduleRelearnWord(currentWord);
    setRated(true);
  };

  const handleListeningCheck = () => {
    if (listeningChecked) return;
    setListeningChecked(true);
    const correct = listeningInput.trim().toLowerCase() === currentWord.word.toLowerCase();
    setListeningCorrect(correct);
    const q = correct ? 5 : 2;
    if (correct) sfxCorrect(); else sfxWrong();
    recordReview(currentWord, q);
    lastQualityRef.current = q;
    bumpCombo(q);
    if (!correct) scheduleRelearnWord(currentWord);
    setRated(true);
  };


  /** 配对：单词/释义两侧都能先点（先点释义再点单词同样成立） */
  const judgeMatch = (word: string, meaning: string) => {
    const pair = matchPairs.find((p) => p.meaning === meaning);
    if (pair && pair.word === word) {
      sfxTick();
      const newMatched = new Set(matchedWordSet);
      newMatched.add(word);
      setMatchedWordSet(newMatched);
    } else {
      sfxWrong();
      setMatchErrorCount((c) => c + 1);
      setMatchFlashError(meaning);
      setTimeout(() => setMatchFlashError(null), 600);
    }
    setSelectedMatchWord(null);
    setSelectedMatchMeaning(null);
  };

  const handleMatchSelectWord = (word: string) => {
    if (matchedWordSet.has(word)) return; // already matched
    setMatchFlashError(null);
    if (selectedMatchMeaning) { judgeMatch(word, selectedMatchMeaning); return; }
    setSelectedMatchWord(word === selectedMatchWord ? null : word);
  };

  const handleMatchSelectMeaning = (meaning: string) => {
    const pair = matchPairs.find((p) => p.meaning === meaning);
    if (!pair || matchedWordSet.has(pair.word)) return;
    if (selectedMatchWord) { judgeMatch(selectedMatchWord, meaning); return; }
    setSelectedMatchMeaning(meaning === selectedMatchMeaning ? null : meaning);
  };

  // Check if all matching pairs are matched
  const allMatched = matchPairs.length > 0 && matchedWordSet.size >= matchPairs.length;

  useEffect(() => {
    if (!allMatched || rated || !currentWord) return;
    sfxCorrect();
    // 配错过就别给满分：0 错=5，1-2 错=3，更多=1 —— 否则乱点也能全对，SM-2 会把没记住的词排得太远
    const q = matchErrorCount === 0 ? 5 : matchErrorCount <= 2 ? 3 : 1;
    lastQualityRef.current = q;
    // 一轮配对实际练到的是全部 4 个词（不只是"当前词"）—— 都记进度
    for (const entry of matchPairEntries) {
      recordReview(entry, q);
      if (q <= 2 && entry.word === currentWord.word) scheduleRelearnWord(entry);
    }
    bumpCombo(q);
    setRated(true);
  }, [allMatched, rated, currentWord, matchPairEntries, matchErrorCount, recordReview]);

  const handleFillBlankCheck = () => {
    if (fillblankChecked) return;
    setFillblankChecked(true);
    const correct = fillblankInput.trim().toLowerCase() === currentWord.word.toLowerCase();
    setFillblankCorrect(correct);
    const q = correct ? 5 : 2;
    if (correct) sfxCorrect(); else sfxWrong();
    recordReview(currentWord, q);
    lastQualityRef.current = q;
    bumpCombo(q);
    if (!correct) scheduleRelearnWord(currentWord);
    setRated(true);
  };

  // Skip handlers: reveal answer, record as "forgot", show next
  const handleSpellingSkip = () => {
    if (spellingChecked) return;
    setSpellingChecked(true);
    setSpellingCorrect(false);
    setSpellingHint(true);
    sfxWrong();
    recordReview(currentWord, 1); // quality 1 = forgot
    lastQualityRef.current = 1;
    bumpCombo(1);
    scheduleRelearnWord(currentWord);
    setRated(true);
  };
  const handleListeningSkip = () => {
    if (listeningChecked) return;
    setListeningChecked(true);
    setListeningCorrect(false);
    setListeningHint(true);
    sfxWrong();
    recordReview(currentWord, 1);
    lastQualityRef.current = 1;
    bumpCombo(1);
    scheduleRelearnWord(currentWord);
    setRated(true);
  };
  const handleFillBlankSkip = () => {
    if (fillblankChecked) return;
    setFillblankChecked(true);
    setFillblankCorrect(false);
    setFillblankHint(true);
    sfxWrong();
    recordReview(currentWord, 1);
    lastQualityRef.current = 1;
    bumpCombo(1);
    scheduleRelearnWord(currentWord);
    setRated(true);
  };

  const handleNext = () => {
    // 每完成一张卡记 24 秒学习时长（仪表盘/学习记录的时长与打卡数据源）
    addStudyMinutes(0.4, 'vocabulary');
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
      setSelectedMatchWord(null);
      setSelectedMatchMeaning(null);
      setMatchedWordSet(new Set());
      setMatchFlashError(null);
      setMatchErrorCount(0);
      setMatchPairEntries([]);
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
      // 本轮完成 → 庆祝页（而非无感循环开始下一轮）
      setSessionDone(true);
    }
  };

  /** handleNext 的 ref 镜像：自动跳页 effect 用它，避免回调每次重建导致定时器反复重置 */
  const handleNextRef = useRef(handleNext);
  handleNextRef.current = handleNext;

  // 换卡时清掉"刚评分"标记。只依赖 currentIdx —— 答错重排会改 sessionWords，
  // 不能让它顺带清标记（否则答错的自动跳页会被取消）
  useEffect(() => { setRatedNow(null); }, [currentIdx]);

  // 闪卡：评分后自动进入下一张（答对 120ms / 答错 300ms —— 与复习检测同一节奏）。
  // 2026-09-30 与复习检测一起缩短：旧值 550/900 让"翻下一张"有明显停顿（用户反馈）。
  useEffect(() => {
    if (reviewMode !== 'flashcard' || sessionDone || !ratedNow) return;
    const delay = lastQualityRef.current >= 3 ? 120 : 300;
    const t = setTimeout(() => handleNextRef.current(), delay);
    return () => clearTimeout(t);
  }, [reviewMode, ratedNow, sessionDone]);

  // 其余方式：答对自动进入下一张（即时正反馈，不让人多点一下）；答错停在看反馈，手动「下一个」
  useEffect(() => {
    if (reviewMode === 'flashcard' || sessionDone) return;
    const correctNow =
      (reviewMode === 'choice' && !!choiceSelected && choiceCorrect === true) ||
      (reviewMode === 'spelling' && spellingChecked && spellingCorrect) ||
      (reviewMode === 'listening' && listeningChecked && listeningCorrect) ||
      (reviewMode === 'fillblank' && fillblankChecked && fillblankCorrect) ||
      (reviewMode === 'matching' && allMatched && rated);
    if (!correctNow) return;
    const t = setTimeout(() => handleNextRef.current(), 900);
    return () => clearTimeout(t);
  }, [reviewMode, sessionDone, choiceSelected, choiceCorrect, spellingChecked, spellingCorrect, listeningChecked, listeningCorrect, fillblankChecked, fillblankCorrect, allMatched, rated]);

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
  // 学习中 → 隐藏概览（标题/KPI/进度/设置），只保留学习卡片 + 左上返回
  const inSession = sessionWords.length > 0 && !!currentWord;

  // ===== 断点续学：每日学习此前是唯一不能续的主模式（复习检测/快速闪卡/语块复习都能）=====
  const dailyBreakpointKey = `__nativethink_daily_session_${level}`;
  const [dailyResumed, setDailyResumed] = useState(false);
  useEffect(() => { setDailyResumed(false); }, [level]);   // 切词书允许对新断点恢复一次
  useEffect(() => {
    if (dailyResumed || inSession) return;
    try {
      const raw = safeStorage.getItem(dailyBreakpointKey);
      if (!raw) { setDailyResumed(true); return; }
      const saved = JSON.parse(raw) as { words: string[]; index: number; mode: ReviewMode };
      if (!Array.isArray(saved?.words) || saved.words.length === 0) { setDailyResumed(true); return; }
      const entries = saved.words.map((k) => findWord(k)).filter((w): w is IWordEntry => !!w);
      const idx = Math.max(0, Math.min(saved.index ?? 0, entries.length - 1));
      if (entries.length === 0 || saved.index >= entries.length) {
        safeStorage.removeItem(dailyBreakpointKey);
        setDailyResumed(true);
        return;
      }
      setReviewMode(saved.mode || 'flashcard');
      setSessionWords(entries);
      setCurrentIdx(idx);
      setFlipped(false);
      setRated(false);
      lastSpokenKey.current = '';
      setDailyResumed(true);
    } catch { setDailyResumed(true); }
  }, [dailyResumed, inSession, dailyBreakpointKey]);
  useEffect(() => {
    try {
      if (sessionDone) { safeStorage.removeItem(dailyBreakpointKey); return; }   // 走完本轮 → 断点作废
      if (inSession && currentWord) {
        safeStorage.setItem(dailyBreakpointKey, JSON.stringify({
          words: sessionWords.map((w) => w.word.toLowerCase()),
          index: currentIdx,
          mode: reviewMode,
          savedAt: Date.now(),
        }));
      }
    } catch { /* ignore */ }
  }, [inSession, sessionDone, sessionWords, currentIdx, currentWord, reviewMode, dailyBreakpointKey]);

  /** 屏蔽当前词（不再出现）—— 与复习检测对齐的出口；带撤销 */
  const suspendCurrent = () => {
    if (!currentWord) return;
    const word = currentWord;
    setSuspended(word, true);
    toast.success(`已把「${word.word}」移出学习队列`, {
      duration: 5000,
      action: { label: '撤销', onClick: () => setSuspended(word, false) },
    });
  };

  /** 搭配区出现时自动补译（本地就绪则瞬时；否则一次批量请求） */
  const collocAutoRef = useRef<string>('');
  useEffect(() => {
    if (!inSession || !isFlipped || !currentWord) return;
    const list = currentWord.collocations.slice(0, 3);
    if (list.length === 0) return;
    if (collocAutoRef.current === currentWord.word) return;
    const need = list.some((c) => !STATIC_COLLOC_TRANSLATIONS[c.toLowerCase()] && !collocCache[c.toLowerCase()]);
    if (!need) return;
    collocAutoRef.current = currentWord.word;
    void translateCollocBatch(list);
  }, [inSession, isFlipped, currentWord, collocCache]);

  useImmersive(inSession);
  const exitSession = () => {
    setSessionWords([]);
    setCurrentIdx(0);
    setFlipped(false);
    setSessionDone(false);
    setRatedNow(null);
    setCombo(0);
    setDetailWord(null);   // 不清的话下次开会话会立刻弹出上一轮残留的详情弹窗
    lastSpokenKey.current = '';  // 下一轮的第一张卡要正常出声
  };

  // 专注模式下 ESC 直接退出会话。
  // 必须**捕获阶段**监听：词条详情弹窗（Radix）在 document 冒泡阶段同步 flush 关闭，
  // 等冒泡到 window 时弹窗已从 DOM 移除，守卫永远看不到它 ——
  // 表现就是"按 Esc 关弹窗，会话也被一起退出"（AGENTS.md 坑表同款，快速闪卡同修法）。
  useEffect(() => {
    if (!inSession) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) exitSession();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [inSession]);

  // 本轮完成 → 播放完成提示音
  useEffect(() => {
    if (sessionDone) sfxComplete();
  }, [sessionDone]);

  // 闪卡键盘操作：空格翻面 → 默认「比较熟悉」→ 下一个；1-5 评分；→ 下一个
  useEffect(() => {
    if (!inSession || sessionDone || reviewMode !== 'flashcard') return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // 词条详情弹窗打开时不抢键盘 —— 否则空格/1-5 会在弹窗后面偷偷翻卡、评分
      if (document.querySelector('[role="dialog"]')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!isFlipped) setFlipped(true);
        else if (!rated) handleRate(4);
        else handleNext();
      } else if (isFlipped && !rated && ['1', '2', '3', '4', '5'].includes(e.key)) {
        handleRate([0, 2, 3, 4, 5][parseInt(e.key, 10) - 1]);
      } else if (e.key === 'ArrowRight' && rated) {
        handleNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // handleRate 每次渲染重建（闭包含 relearnCounts/combo）—— 必须进依赖，否则按 1-5 时用到旧闭包
  }, [inSession, sessionDone, reviewMode, isFlipped, rated, currentIdx, sessionWords, handleRate]);

  // 键盘（非闪卡）：选择题 1-4 选选项；判完且答错时 Enter/→ 下一张（答对会自动走）
  useEffect(() => {
    if (!inSession || sessionDone || reviewMode === 'flashcard') return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // 弹窗打开时不抢键盘（同上）
      if (document.querySelector('[role="dialog"]')) return;
      if (reviewMode === 'choice' && !choiceSelected && ['1', '2', '3', '4'].includes(e.key)) {
        const opt = choiceOptions[parseInt(e.key, 10) - 1];
        if (opt) { e.preventDefault(); handleChoiceSelect(opt.word); }
        return;
      }
      const wrongPending =
        (reviewMode === 'choice' && !!choiceSelected && choiceCorrect === false) ||
        (reviewMode === 'spelling' && spellingChecked && !spellingCorrect) ||
        (reviewMode === 'listening' && listeningChecked && !listeningCorrect) ||
        (reviewMode === 'fillblank' && fillblankChecked && !fillblankCorrect);
      if (wrongPending && (e.key === 'Enter' || e.key === 'ArrowRight')) { e.preventDefault(); handleNext(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [inSession, sessionDone, reviewMode, choiceSelected, choiceCorrect, choiceOptions, spellingChecked, spellingCorrect, listeningChecked, listeningCorrect, fillblankChecked, fillblankCorrect]);

  return (
    <div className="space-y-4">
      {/* Level switch toast */}
      {!inSession && (
      <div className="relative">
        {levelToast && (
          <div
            className="absolute -top-8 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-black text-white shadow-lg whitespace-nowrap"
            style={{ backgroundColor: levelColor.accent, animation: 'toast-in 1.2s ease forwards' }}
          >
            已切换至 {levelToast}
          </div>
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
      )}

      {/* Top stats（仅概览显示） */}
      {!inSession && (
      <>
      <div className="grid grid-cols-4 gap-2">
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-100 text-center">
          <p className="text-lg font-black text-ink-teal">{learnedToday}</p>
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
      </>
      )}

      {/* Learning mode selector + quota — 默认折叠；学习中隐藏 */}
      {!simple && !inSession && (
      <Card className="rounded-2xl border-border shadow-sm">
        <CardContent className="p-3 space-y-3">
          {/* 摘要行（始终显示） */}
          <button
            className="w-full flex items-center justify-between gap-2 group"
            onClick={() => setSetupOpen((v) => !v)}
          >
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground shrink-0">学习设置</span>
            <span className="flex items-center gap-2 text-xs font-bold text-foreground group-hover:text-ink-teal transition-colors">
              {modeLabels.find((m) => m.key === reviewMode)?.label || '闪卡'} · 每日 {dailyQuota} 词
              <ChevronDown className={cn('size-4 text-muted-foreground transition-transform duration-200', setupOpen && 'rotate-180')} />
            </span>
          </button>

          {/* 展开的完整设置 */}
          {setupOpen && (
          <>
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
          </>
          )}
        </CardContent>
      </Card>
      )}

      {/* Learning session */}
      {sessionWords.length > 0 && currentWord ? (
        <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={exitSession}
            className="rounded-xl size-9 shrink-0 text-muted-foreground hover:text-ink-teal"
            title="返回概览 (Esc)"
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Badge className="rounded-full px-3 py-1 text-[10px] font-black text-white border-0" style={{ backgroundColor: levelColor.accent }}>
              {currentLevelLabel}
            </Badge>
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-[10px] font-black bg-muted text-muted-foreground border-0">
              {currentModeLabel}
            </Badge>
            {combo >= 3 && (
              <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-black tabular-nums animate-pulse" title="连续答对">
                <Flame className="size-3" />连对 {combo}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleAutoSpeak}
            className={cn('rounded-xl size-9 shrink-0', autoSpeak ? 'text-ink-teal' : 'text-muted-foreground/50')}
            title={`自动发音${autoSpeak ? '（已开）' : '（已关）'} —— 与复习检测/快速闪卡共用此设置`}
          >
            <Volume2 className="size-4.5" />
          </Button>
        </div>

        {/*
          上一个单词 —— 常驻顶部、**显示词面**（"刚刚那个词到底是什么"是最高频的回头需求）。
          点它打开完整词条详情弹窗（复用快速闪卡的 WordInfoDialog，两个模式长得一样）。
        */}
        {prevWord && (
          <div className="flex items-center gap-2 -mt-1">
            <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-muted-foreground/70">
              上一个单词
            </span>
            <button
              onClick={() => setDetailWord(prevWord)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-border bg-card max-w-[62%] transition-colors hover:border-[#00B894]/40 hover:bg-[#00B894]/5 active:scale-[0.98]"
              title={`查看「${prevWord.word}」详情`}
            >
              <ChevronLeft className="size-3 shrink-0 text-muted-foreground" />
              <span className="text-[11px] font-black italic text-foreground truncate">{prevWord.word}</span>
              <Eye className="size-3 shrink-0 text-muted-foreground" />
            </button>
            <span className="shrink-0 text-[9px] font-bold text-muted-foreground/50">点开看详情</span>
          </div>
        )}

      <AnimatePresence mode="wait">
          <MotionDiv
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
                style={{ width: `${((currentIdx + (rated ? 1 : 0)) / sessionWords.length) * 100}%` }}
              />
            </div>
            <span className="text-xs font-black text-muted-foreground tabular-nums">
              {currentIdx + 1}/{sessionWords.length}
            </span>
          </div>

          {/* ===== FLASHCARD MODE ===== */}
          {reviewMode === 'flashcard' && (
            <>
              {/* 换卡动画用定长 tween 而不是 spring：mode="wait" 下新卡要等旧卡退场
                  **完全结束**才挂载，而 spring 要衰减到亚像素才算结束（长尾 ~400ms）——
                  这正是"闪卡切换下一张等待时间长"的一半来源（另一半是评分后的停留）。 */}
              <div className="flex justify-center">
                <AnimatePresence mode="wait">
                  <MotionDiv
                    key={currentWord.word + (isFlipped ? '-back' : '-front')}
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -60 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    onClick={() => setFlipped(!isFlipped)}
                  >
                    <Card className={cn(
                      'rounded-[40px] border-2 shadow-xl transition-all min-h-[300px] flex flex-col justify-center',
                      isFlipped
                        ? 'border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 dark:border-indigo-500/30 dark:from-indigo-500/10 dark:to-violet-500/10'
                        : 'border-border bg-card',
                    )}>
                      <CardContent className="p-10 text-center">
                        {!isFlipped ? (
                          <>
                            <Badge className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-muted text-muted-foreground mb-4">
                              {state.progress[currentWord.word.toLowerCase()] ? '复习' : '新学'}
                            </Badge>
                            <div data-fit-box className="flex items-center justify-center gap-3 mb-3 max-w-full">
                              <h2 className="text-foreground min-w-0 max-w-full">
                                <FitWord text={currentWord.word} maxPx={48} minPx={20} reservePx={56} />
                              </h2>
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); tts.speak(currentWord.word, { rate: 0.9 }); }} className="rounded-2xl bg-muted text-muted-foreground hover:text-ink-teal">
                                <Volume2 className="size-5" />
                              </Button>
                            </div>
                            <p className="text-sm font-bold text-ink-violet mb-1">{currentWord.partOfSpeech}</p>
                            <p className="text-base text-muted-foreground font-medium">{currentWord.phonetic}</p>
                            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-6">
                              <Sparkles className="size-3.5 inline mr-1 text-ink-teal" />点击翻转查看释义
                            </p>
                          </>
                        ) : (
                          <>
                            <Badge className="rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wider bg-indigo-100 dark:bg-indigo-500/20 text-indigo-500 dark:text-ink-violet mb-4">
                              释义 · {currentWord.partOfSpeech}
                            </Badge>
                            <p className="text-2xl font-black text-foreground mb-2">{currentWord.meaning}</p>
                            <div className="flex items-center justify-center gap-2 mb-4">
                              <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-muted">{currentWord.register === 'formal' ? '正式' : currentWord.register === 'informal' ? '非正式' : '中性'}</Badge>
                              <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-muted">#{currentWord.frequencyRank}</Badge>
                            </div>
                            {currentWord.examples[0] && (
                              <div className="p-4 rounded-2xl bg-white/60 dark:bg-foreground/[0.07] border border-indigo-100 dark:border-indigo-500/20 mb-4">
                                <p className="text-sm text-foreground/80 italic font-medium">"{currentWord.examples[0].en}"</p>
                                <p className="text-xs text-muted-foreground mt-2">{currentWord.examples[0].zh}</p>
                              </div>
                            )}
                            {/* 搭配 / 短语 — 点按可朗读，缺中文可 AI 补译 */}
                            {currentWord.collocations.length > 0 && (
                              <div className="pt-3 border-t border-indigo-100 dark:border-indigo-500/20">
                                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2 flex items-center justify-center gap-1">
                                  <Link2 className="size-3 text-ink-violet" />常用搭配
                                </p>
                                <div className="space-y-1.5">
                                  {currentWord.collocations.slice(0, 3).map((c) => {
                                    const zh = collocZh(c);
                                    return (
                                      <div key={c} className="flex items-center justify-center gap-2 text-center">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); tts.speak(c, { rate: 0.85 }); }}
                                          className="text-sm font-bold text-ink-violet hover:underline underline-offset-2 transition-colors"
                                          title="朗读搭配"
                                        >
                                          {c}
                                        </button>
                                        {zh ? (
                                          <span className="text-xs text-muted-foreground">{zh}</span>
                                        ) : (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); translateCollocBatch(currentWord.collocations.slice(0, 3)); }}
                                            className="text-[9px] font-bold text-muted-foreground/60 hover:text-ink-teal transition-colors shrink-0"
                                            title="AI 翻译该搭配"
                                          >
                                            {collocTranslating ? '翻译中…' : '译'}
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* 不再出现出口 —— 与复习检测对齐：熟练用户被简单词反复占时间的出口 */}
                            <div className="pt-3 border-t border-indigo-100 dark:border-indigo-500/20">
                              <button
                                onClick={(e) => { e.stopPropagation(); suspendCurrent(); }}
                                className="text-[9px] font-black uppercase tracking-wider text-muted-foreground hover:text-rose-500 transition-colors"
                                title="已会 / 不感兴趣 —— 移出学习队列（可撤销）"
                              >
                                不再出现
                              </button>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </MotionDiv>
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
                  ].map(({ q, label, color }, i) => (
                    <button key={q} onClick={() => handleRate(q)}
                      className={cn('relative px-3 py-2 rounded-2xl text-white text-[10px] font-black uppercase tracking-wider shadow-lg transition-all hover:scale-105', color)}>
                      {label}
                      <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-black/25 text-[8px] font-black flex items-center justify-center">{i + 1}</span>
                    </button>
                  ))}
                  <span className="w-full text-center text-[9px] text-muted-foreground font-bold mt-1">键盘：空格 翻面 / 1-5 评分 · 评完自动翻页</span>
                </div>
              )}
              {rated && (
                <div className="flex justify-center">
                  <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-muted/60 text-muted-foreground text-[10px] font-black uppercase tracking-wider">
                    <RotateCw className="size-3.5 animate-spin [animation-duration:1.6s]" />
                    即将进入下一张…
                  </span>
                </div>
              )}
              {!isFlipped && (
                <p className="text-center text-[9px] text-muted-foreground/60 font-bold">键盘：空格 翻面 / 1-5 评分 · 评完自动翻页 · → 手动下一张</p>
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
                    <Button variant="ghost" size="icon" onClick={() => tts.speak(currentWord.word, { rate: 0.9 })} className="rounded-2xl bg-muted text-muted-foreground hover:text-ink-teal">
                      <Volume2 className="size-5" />
                    </Button>
                  </div>
                  <p className="text-sm font-bold text-ink-violet mb-3">{currentWord.partOfSpeech} · {currentWord.phonetic}</p>
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

              {/* 答对自动进入下一张；答错停住让人看清正确答案（Enter/→ 也能走） */}
              {choiceSelected && !choiceCorrect && (
                <div className="flex justify-center">
                  <Button onClick={handleNext} className="bg-[#00B894] hover:bg-[#00A080] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg">
                    {currentIdx < sessionWords.length - 1 ? '下一个' : '完成本轮'}
                    <ArrowRight className="size-4 ml-2" />
                  </Button>
                </div>
              )}
              {choiceSelected && choiceCorrect && (
                <div className="flex justify-center">
                  <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-muted/60 text-muted-foreground text-[10px] font-black uppercase tracking-wider">
                    <RotateCw className="size-3.5 animate-spin [animation-duration:1.6s]" />
                    即将进入下一张…
                  </span>
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
                  <p className="text-sm font-bold text-ink-violet mb-2">{currentWord.partOfSpeech}</p>
                  <p className="text-2xl font-black text-foreground mb-3">{currentWord.meaning}</p>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-8">
                    根据释义拼写单词
                  </p>

                  {/* Hint: first letter + word length */}
                  {spellingHint && !spellingChecked && (
                    <div className="mb-4 p-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 max-w-xs mx-auto">
                      <p className="text-xs font-black uppercase tracking-wider text-amber-600 mb-1 flex items-center gap-1"><Lightbulb className="size-3.5" />提示</p>
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
                    <Button variant="ghost" size="icon" onClick={() => tts.speak(currentWord.word, { rate: 0.9 })} className="rounded-2xl bg-muted text-muted-foreground hover:text-ink-teal">
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
                        <>
                          <div className="flex items-center justify-center gap-2 text-emerald-500">
                            <CheckCircle2 className="size-5" />
                            <span className="text-sm font-black uppercase tracking-wider">正确！</span>
                          </div>
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-sm font-black text-foreground">{currentWord.word}</span>
                            <span className="text-xs text-muted-foreground">· {currentWord.meaning}</span>
                            <Button variant="ghost" size="icon" onClick={() => tts.speak(currentWord.word, { rate: 0.85 })} className="rounded-xl size-7 bg-muted text-muted-foreground hover:text-ink-teal">
                              <Volume2 className="size-3.5" />
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-center gap-2 text-rose-500">
                            <XCircle className="size-5" />
                            <span className="text-sm font-black uppercase tracking-wider">不正确</span>
                          </div>
                          <p className="text-lg font-black text-foreground">
                            正确答案：<span className="text-ink-teal italic">{currentWord.word}</span>
                          </p>
                          <div className="flex items-center justify-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => tts.speak(currentWord.word, { rate: 0.8 })} className="rounded-xl bg-muted text-muted-foreground hover:text-ink-teal">
                              <Volume2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 答对自动进入下一张；答错停留看答案（Enter/→ 也能走） */}
              {spellingChecked && !spellingCorrect && (
                <div className="flex justify-center">
                  <Button onClick={handleNext} className="bg-[#00B894] hover:bg-[#00A080] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg">
                    {currentIdx < sessionWords.length - 1 ? '下一个' : '完成本轮'}
                    <ArrowRight className="size-4 ml-2" />
                  </Button>
                </div>
              )}
              {spellingChecked && spellingCorrect && (
                <div className="flex justify-center">
                  <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-muted/60 text-muted-foreground text-[10px] font-black uppercase tracking-wider">
                    <RotateCw className="size-3.5 animate-spin [animation-duration:1.6s]" />
                    即将进入下一张…
                  </span>
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
                      <p className="text-xs font-black uppercase tracking-wider text-amber-600 mb-1 flex items-center gap-1"><Lightbulb className="size-3.5" />提示</p>
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
                        <>
                          <div className="flex items-center justify-center gap-2 text-emerald-500">
                            <CheckCircle2 className="size-5" />
                            <span className="text-sm font-black uppercase tracking-wider">正确！</span>
                          </div>
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-sm font-black text-foreground">{currentWord.word}</span>
                            <span className="text-xs text-muted-foreground">· {currentWord.meaning}</span>
                            <Button variant="ghost" size="icon" onClick={() => tts.speak(currentWord.word, { rate: 0.85 })} className="rounded-xl size-7 bg-muted text-muted-foreground hover:text-ink-teal">
                              <Volume2 className="size-3.5" />
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-center gap-2 text-rose-500">
                            <XCircle className="size-5" />
                            <span className="text-sm font-black uppercase tracking-wider">不正确</span>
                          </div>
                          <p className="text-lg font-black text-foreground">
                            正确答案：<span className="text-ink-teal italic">{currentWord.word}</span>
                          </p>
                          <p className="text-sm text-muted-foreground">{currentWord.phonetic} · {currentWord.meaning}</p>
                          <div className="flex items-center justify-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => tts.speak(currentWord.word, { rate: 0.8 })} className="rounded-xl bg-muted text-muted-foreground hover:text-ink-teal">
                              <Volume2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 答对自动进入下一张；答错停留看答案（Enter/→ 也能走） */}
              {listeningChecked && !listeningCorrect && (
                <div className="flex justify-center">
                  <Button onClick={handleNext} className="bg-[#00B894] hover:bg-[#00A080] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg">
                    {currentIdx < sessionWords.length - 1 ? '下一个' : '完成本轮'}
                    <ArrowRight className="size-4 ml-2" />
                  </Button>
                </div>
              )}
              {listeningChecked && listeningCorrect && (
                <div className="flex justify-center">
                  <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-muted/60 text-muted-foreground text-[10px] font-black uppercase tracking-wider">
                    <RotateCw className="size-3.5 animate-spin [animation-duration:1.6s]" />
                    即将进入下一张…
                  </span>
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
                    点击单词与对应释义配对（先点释义再点单词也可以）
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
                              isSelected && 'border-[#6C5CE7] bg-violet-50 dark:bg-violet-500/15 text-ink-violet',
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
                        const isSelected = selectedMatchMeaning === meaning;
                        return (
                          <button
                            key={meaning}
                            onClick={() => handleMatchSelectMeaning(meaning)}
                            disabled={isMatched}
                            className={cn(
                              'w-full p-3 rounded-2xl border-2 text-center font-bold text-xs transition-all',
                              isMatched && 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 cursor-default',
                              isError && 'border-rose-400 bg-rose-50 dark:bg-rose-500/15 text-rose-500 animate-pulse',
                              isSelected && !isError && 'border-[#6C5CE7] bg-violet-50 dark:bg-violet-500/15 text-ink-violet',
                              !isMatched && !isError && !isSelected && 'border-border bg-card hover:border-[#6C5CE7]/40 text-foreground',
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
                  <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-muted/60 text-muted-foreground text-[10px] font-black uppercase tracking-wider">
                    <RotateCw className="size-3.5 animate-spin [animation-duration:1.6s]" />
                    即将进入下一组…
                  </span>
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

                    {/* Hint: meaning（不放朗读按钮 —— 填空的答案就是这个词，读了等于泄题） */}
                    <div className="flex items-center justify-center gap-2 mb-6">
                      <span className="text-xs font-bold text-muted-foreground">提示：</span>
                      <span className="text-sm font-bold text-ink-violet">{currentWord.partOfSpeech} · {currentWord.meaning}</span>
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
                      <Button variant="ghost" size="sm" onClick={() => { setFillblankHint(true); if (!fillblankInput) setFillblankInput(currentWord.word[0]); }}
                        className="rounded-xl text-[10px] font-black uppercase tracking-wider bg-amber-50 dark:bg-amber-500/10 text-amber-600 hover:bg-amber-100">
                        <Lightbulb className="size-3 inline" /> 首字母
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
                            <Button variant="ghost" size="icon" onClick={() => tts.speak(currentWord.word, { rate: 0.85 })} className="rounded-xl size-7 bg-muted text-muted-foreground hover:text-ink-teal">
                              <Volume2 className="size-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-center gap-2 text-rose-500">
                              <XCircle className="size-5" />
                              <span className="text-sm font-black uppercase tracking-wider">不正确</span>
                            </div>
                            <p className="text-lg font-black text-foreground">
                              正确答案：<span className="text-ink-teal italic">{currentWord.word}</span>
                            </p>
                            <div className="flex items-center justify-center gap-2">
                              <p className="text-sm text-muted-foreground">{currentWord.phonetic}</p>
                              <Button variant="ghost" size="icon" onClick={() => tts.speak(currentWord.word, { rate: 0.8 })} className="rounded-xl size-7 bg-muted text-muted-foreground hover:text-ink-teal">
                                <Volume2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 答对自动进入下一张；答错停留看答案（Enter/→ 也能走） */}
                {fillblankChecked && !fillblankCorrect && (
                  <div className="flex justify-center">
                    <Button onClick={handleNext} className="bg-[#00B894] hover:bg-[#00A080] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg">
                      {currentIdx < sessionWords.length - 1 ? '下一个' : '完成本轮'}
                      <ArrowRight className="size-4 ml-2" />
                    </Button>
                  </div>
                )}
                {fillblankChecked && fillblankCorrect && (
                  <div className="flex justify-center">
                    <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-muted/60 text-muted-foreground text-[10px] font-black uppercase tracking-wider">
                      <RotateCw className="size-3.5 animate-spin [animation-duration:1.6s]" />
                      即将进入下一张…
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
          </MotionDiv>
        </AnimatePresence>

        {/* ── 本轮完成庆祝（Duolingo 式完课页） ── */}
        {sessionDone && (
          <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
            <MotionDiv
              initial={{ scale: 0.9, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 20 }}
              className="w-full max-w-sm rounded-[32px] border-2 border-[#00B894]/20 bg-card shadow-2xl p-8 text-center space-y-5"
            >
              <div className="text-6xl select-none" style={{ animation: 'session-cheer 600ms ease both' }}>🎉</div>
              <div className="space-y-1">
                <p className="text-2xl font-black italic text-foreground">本轮完成！</p>
                <p className="text-xs font-bold text-muted-foreground">进步 +{sessionStatsRef.current.review + sessionStatsRef.current.fresh} 词，继续保持</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-100 dark:border-emerald-500/20">
                  <p className="text-xl font-black text-ink-teal">{sessionStatsRef.current.fresh}</p>
                  <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">新学</p>
                </div>
                <div className="p-3 rounded-2xl bg-violet-50 dark:bg-violet-500/15 border border-violet-100 dark:border-violet-500/20">
                  <p className="text-xl font-black text-ink-violet">{sessionStatsRef.current.review}</p>
                  <p className="text-[9px] font-black uppercase tracking-wider text-violet-600">复习</p>
                </div>
                <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-100 dark:border-amber-500/20">
                  <p className="text-xl font-black text-amber-500">{Math.max(1, Math.round((Date.now() - sessionStatsRef.current.startedAt) / 60000))}</p>
                  <p className="text-[9px] font-black uppercase tracking-wider text-amber-600">分钟</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={exitSession} className="flex-1 rounded-2xl text-xs font-black">
                  返回概览
                </Button>
                <Button
                  onClick={() => { setSessionDone(false); startSession(); }}
                  className="flex-1 rounded-2xl bg-[#00B894] hover:bg-[#00A080] text-white text-xs font-black shadow-lg shadow-emerald-200/50"
                >
                  <BookOpen className="size-4 mr-1.5" />再来一组
                </Button>
              </div>
            </MotionDiv>
          </div>
        )}

        {/* 词条详情 —— 顶部「上一个单词」/ 各处词表点开都用它 */}
        {detailDialog}
        </div>
      ) : (
        <div
          className="relative overflow-hidden rounded-[32px] text-white shadow-xl"
          style={{ background: `linear-gradient(120deg, ${modeColor.accent} 0%, ${levelColor.accent} 100%)` }}
        >
          {/* 装饰光斑 */}
          <div className="absolute -right-12 -top-14 size-56 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute -left-8 bottom-[-60px] size-40 rounded-full bg-white/10 pointer-events-none" />

          <div className="relative p-8 sm:p-10">
            {/* 徽章行 */}
            <div className="flex items-center gap-2 mb-4">
              <span className="px-3 py-1 rounded-full bg-white/20 text-[10px] font-black">{currentLevelLabel}</span>
              <span className="px-3 py-1 rounded-full bg-white/20 text-[10px] font-black">{currentModeLabel}</span>
            </div>

            {dueForReview.length > 0 || todayRemaining > 0 ? (
              <>
                <h3 className="text-3xl font-black italic mb-2">准备好了吗？</h3>
                <p className="text-sm text-white/85 font-medium mb-7">
                  {dueForReview.length > 0 && `${dueForReview.length} 个单词待复习 · `}今日还可新学 <span className="font-black text-white">{todayRemaining}</span> 个单词
                </p>
                <Button
                  onClick={startSession}
                  className="bg-white px-9 py-5 rounded-2xl text-xs font-black uppercase tracking-wider shadow-xl hover:scale-[1.02] transition-transform"
                  style={{ color: modeColor.accent }}
                >
                  <BookOpen className="size-4 mr-2" />
                  开始学习
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-3xl font-black italic mb-2">今日任务完成 🎉</h3>
                <p className="text-sm text-white/85 font-medium mb-7">
                  已学习 <span className="font-black text-white">{learnedToday}</span> 个新单词 · 复习了 <span className="font-black text-white">{reviewedToday}</span> 个
                </p>
                <div className="flex gap-3">
                  <Button onClick={startSession} className="bg-white px-7 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-xl" style={{ color: modeColor.accent }}>
                    继续加练
                  </Button>
                  <Button
                    onClick={() => {
                      // 两段确认：'全部'档位一键清空 9 本词书进度且不可恢复
                      if (!confirmResetProgress) {
                        setConfirmResetProgress(true);
                        setTimeout(() => setConfirmResetProgress(false), 3000);
                        return;
                      }
                      setConfirmResetProgress(false);
                      resetProgress();
                    }}
                    variant="ghost"
                    className={cn('rounded-2xl text-[10px] font-black uppercase tracking-wider text-white/80 hover:text-white hover:bg-white/10',
                      confirmResetProgress && 'bg-rose-500/30 text-white')}
                  >
                    <RotateCw className="size-3.5 mr-1" />{confirmResetProgress ? '再点一次确认' : '重置进度'}
                  </Button>
                </div>
              </>
            )}

            {/* 本书进度 · 合入 Hero 底部 */}
            {bookProgress && !simple && (
              <div className="mt-8 pt-5 border-t border-white/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-white/70">本书进度</span>
                  <span className="text-[10px] font-black tabular-nums text-white/90">
                    {bookProgress.learned}/{bookProgress.total} · {Math.round((bookProgress.learned / bookProgress.total) * 100)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/25 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-500"
                    style={{ width: `${(bookProgress.learned / bookProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
