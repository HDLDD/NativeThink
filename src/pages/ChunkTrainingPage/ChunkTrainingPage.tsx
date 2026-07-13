import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Puzzle,
  Heart,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Trophy,
  ArrowRight,
  Lightbulb,
  Loader2,
  BookOpen,
  Sparkles,
  ExternalLink,
  Volume2,
  Bot,
  Wand2,
  X,
  RotateCw,
  Shuffle,
  ChevronLeft,
  ChevronRight,
  Brain,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MOCK_CHUNKS, type IChunk } from '@/data/chunks';
import { useFavorites } from '@/lib/use-favorites';
import { useLearningStats } from '@/lib/use-learning-stats';
import { usePhraseLearning } from '@/lib/use-phrase-learning';
import { usePageMemory, usePageMemoryDebounced } from '@/lib/use-page-memory';
import { PLUGIN_IDS } from '@/lib/plugin-ids';
import { cn, cleanText, extractJson } from '@/lib/utils';
import { toast } from 'sonner';
import { useTTS } from '@/lib/use-tts';
import { capabilityClient } from '@lark-apaas/client-toolkit-lite';
import { useAI } from '@/hooks/use-ai';
import { safeStorage } from '@/lib/safe-storage';

const CATEGORIES = [
  { value: 'all', label: '全部' },
  { value: 'daily', label: '日常' },
  { value: 'workplace', label: '职场' },
  { value: 'social', label: '社交' },
  { value: 'emotion', label: '情绪' },
  { value: 'travel', label: '旅行' },
  { value: 'study', label: '学习' },
  { value: 'tech', label: '科技' },
  { value: 'food', label: '美食' },
  { value: 'health', label: '健康' },
  { value: 'shopping', label: '购物' },
  { value: 'sports', label: '运动' },
];

const DIFFICULTIES = [
  { value: 'all', label: '全部难度' },
  { value: 'beginner', label: '初级' },
  { value: 'intermediate', label: '中级' },
  { value: 'advanced', label: '高级' },
];

const CATEGORY_LABELS: Record<string, string> = {
  daily: '日常', workplace: '职场', social: '社交', emotion: '情绪',
  travel: '旅行', study: '学习', tech: '科技', food: '美食',
  health: '健康', shopping: '购物', sports: '运动',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: '初级', intermediate: '中级', advanced: '高级',
};
const LIBRARY_PAGE_SIZE = 20;
function getDifficultyLabel(d: string) { return DIFFICULTY_LABELS[d] || d; }
function getDifficultyAbbr(d: string) { return d === 'beginner' ? '初' : d === 'intermediate' ? '中' : '高'; }

/** Shared helper: call AI, extract JSON, parse, validate */
async function fetchAIJSON(
  aiChat: (msgs: { role: string; content: string }[], opts?: Record<string, unknown>) => Promise<string>,
  systemPrompt: string,
  userPrompt: string,
  opts?: Record<string, unknown>,
): Promise<any> {
  const result = await aiChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    opts,
  );
  const match = result.match(/[[{][\s\S]*[}\]]/);
  if (!match) throw new Error('AI 返回格式异常，请重试');
  return JSON.parse(match[0]);
}

// 生成替换练习题目：基于语块例句，把正确语块替换成生硬表达作为题目
const AWKWARD_MAP: Record<string, string> = {
  'Long time no see': 'I haven\'t seen you for a long time',
  'get the ball rolling': 'start to do the project',
  'on cloud nine': 'very very happy',
  'break the ice': 'make people feel relaxed',
  'hit the hay': 'go to sleep',
  'piece of cake': 'very easy to do',
};

function generateReplacementExercises(chunks: IChunk[]) {
  // Randomly select chunks and shuffle
  const shuffled = [...chunks].sort(() => Math.random() - 0.5).slice(0, 20);
  return shuffled.map((chunk) => {
    const awkward = AWKWARD_MAP[chunk.content] || 'do it in a normal way';
    const sentence = chunk.example.replace(chunk.content, `[ ${awkward} ]`);
    // Generate 4 random option including correct one
    const wrongOpts = chunks.filter((c) => c.id !== chunk.id).sort(() => Math.random() - 0.5).slice(0, 3).map((c) => c.content);
    const options = [chunk.content, ...wrongOpts].sort(() => Math.random() - 0.5);
    return { id: chunk.id, sentence, awkwardPhrase: awkward, correctChunk: chunk.content, meaning: chunk.meaning, example: chunk.example, category: chunk.category, options };
  });
}
export default function ChunkTrainingPage() {
  const { addFavorite, removeFavorite, isFavorited, favorites } = useFavorites();
  const tts = useTTS();
  const { addStudyMinutes } = useLearningStats();
  const { isConfigured, streamChat: aiStream, chat: aiChat } = useAI();

  const [memory, setMemory] = usePageMemory('chunk-page', { tab: 'library', category: 'all', difficulty: 'all' });

  // ── Position memory: restore list state across page refreshes ──
  const CHUNK_POS_KEY = '__nativethink_chunk_position';
  const [chunkPosMemory, setChunkPosMemory] = useState<{ source?: string; page?: number; scrollTop?: number; tab?: string }>(() => {
    try { const s = localStorage.getItem(CHUNK_POS_KEY); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  const saveChunkPosition = (partial: Record<string, unknown>) => {
    setChunkPosMemory((prev) => {
      const next = { ...prev, ...partial };
      try { localStorage.setItem(CHUNK_POS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const libraryScrollRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = usePageMemoryDebounced('chunk-search', '');
  const [activeTab, setActiveTab] = useState(chunkPosMemory.tab || memory.tab);
  const [categoryFilter, setCategoryFilter] = useState(memory.category);
  const [difficultyFilter, setDifficultyFilter] = useState(memory.difficulty);
  const [detailChunk, setDetailChunk] = useState<(typeof MOCK_CHUNKS)[0] | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // 替换练习 state
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);

  // 接龙游戏 state
  const [chainScore, setChainScore] = useState(0);
  const [currentChainIdx, setCurrentChainIdx] = useState(0);
  const [chainInput, setChainInput] = useState('');
  const [chainFeedback, setChainFeedback] = useState<{ correct: boolean; message: string; detail?: string } | null>(null);
  const [chainLoading, setChainLoading] = useState(false);
  const chainAbortRef = useRef<AbortController | null>(null);

  // AI generation state
  const [customChunks, setCustomChunks] = useState<IChunk[]>(() => {
    try {
      const saved = safeStorage.getItem('__nativethink_custom_chunks');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showGenDialog, setShowGenDialog] = useState(false);
  const [genCategory, setGenCategory] = useState('daily');
  const [genDifficulty, setGenDifficulty] = useState('intermediate');
  const [genCount, setGenCount] = useState(3);
  const [generating, setGenerating] = useState(false);

  // Library sub-tab + pagination
  const [librarySource, setLibrarySource] = useState<'builtin' | 'aigenerated'>(
    (chunkPosMemory.source as 'builtin' | 'aigenerated') || 'builtin',
  );
  const [builtinPage, setBuiltinPage] = useState(chunkPosMemory.page || 0);
  const [aiPage, setAiPage] = useState(0);

  // Refresh key for useMemo random shuffles
  const [refreshKey, setRefreshKey] = useState(0);

  // Persist custom chunks to localStorage
  useEffect(() => {
    safeStorage.setItem('__nativethink_custom_chunks', JSON.stringify(customChunks));
  }, [customChunks]);

  // AI sentence generation state (keyed by chunk ID)
  const [aiSentences, setAiSentences] = useState<Record<string, { en: string; zh: string }[]>>(() => {
    try {
      const saved = safeStorage.getItem('__nativethink_chunk_ai_sentences');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [sentenceGenLoading, setSentenceGenLoading] = useState<string | null>(null);

  // Persist AI sentences to localStorage
  useEffect(() => {
    safeStorage.setItem('__nativethink_chunk_ai_sentences', JSON.stringify(aiSentences));
  }, [aiSentences]);

  // Example sentence translations cache — keyed by chunk ID
  const [exampleTranslations, setExampleTranslations] = useState<Record<string, string>>(() => {
    try { const s = safeStorage.getItem('__nativethink_example_trans'); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  const [exampleTransLoading, setExampleTransLoading] = useState<string | null>(null);
  useEffect(() => { safeStorage.setItem('__nativethink_example_trans', JSON.stringify(exampleTranslations)); }, [exampleTranslations]);

  const handleTranslateExample = async (chunk: IChunk) => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    if (exampleTranslations[chunk.id]) return;
    setExampleTransLoading(chunk.id);
    try {
      const result = await aiChat(
        [
          { role: 'system', content: 'Translate the following English sentence into natural Chinese. Return ONLY the Chinese translation, no extra text, no quotes.' },
          { role: 'user', content: chunk.example },
        ],
        { temperature: 0.3, maxTokens: 128 },
      );
      const zh = result.trim().replace(/^["']|["']$/g, '').slice(0, 80);
      if (zh) setExampleTranslations((p) => ({ ...p, [chunk.id]: zh }));
    } catch { /* ignore */ }
    finally { setExampleTransLoading(null); }
  };

  // Replacement AI feedback state
  const [replacementFeedback, setReplacementFeedback] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // AI-generated replacement exercises
  const [aiReplacements, setAiReplacements] = useState<typeof replacementExercises>(() => {
    try { const s = safeStorage.getItem('__nativethink_ai_replacements'); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [replaceGenLoading, setReplaceGenLoading] = useState(false);
  useEffect(() => { safeStorage.setItem('__nativethink_ai_replacements', JSON.stringify(aiReplacements)); }, [aiReplacements]);

  const allChunks = useMemo(() => {
    try { return [...customChunks, ...MOCK_CHUNKS]; } catch { return [...MOCK_CHUNKS]; }
  }, [customChunks]);

  // Phrase library: sorted alphabetically
  const sortedChunks = useMemo(() => {
    try {
      return [...allChunks].sort((a, b) => (a?.content || '').toLowerCase().localeCompare((b?.content || '').toLowerCase()));
    } catch { return [...allChunks]; }
  }, [allChunks]);
  const [phraseGenLoading, setPhraseGenLoading] = useState(false);
  const [selectedPhrase, setSelectedPhrase] = useState<IChunk | null>(null);
  const [phraseExamples, setPhraseExamples] = useState<Record<string, { en: string; zh: string }[]>>(() => {
    try { const s = safeStorage.getItem('__nativethink_phrase_examples'); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  useEffect(() => { safeStorage.setItem('__nativethink_phrase_examples', JSON.stringify(phraseExamples)); }, [phraseExamples]);

  // ===== 语块库点击朗读 =====
  const libraryTtsRef = useRef(tts);
  libraryTtsRef.current = tts;

  // 点击语块时朗读
  useEffect(() => {
    if (!detailChunk || activeTab !== 'library') return;
    libraryTtsRef.current.speak(detailChunk.content, { rate: 0.85 });
  }, [detailChunk, activeTab]);

  // ===== 短语库点击朗读 =====
  const phraseTtsRef = useRef(tts);
  phraseTtsRef.current = tts;

  // 点击短语时朗读
  useEffect(() => {
    if (!selectedPhrase || activeTab !== 'phrases') return;
    phraseTtsRef.current.speak(selectedPhrase.content, { rate: 0.85 });
  }, [selectedPhrase, activeTab]);

  const handleGeneratePhraseExamples = async (chunk: IChunk) => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    const key = chunk.id;
    try {
      const result = await aiChat(
        [
          { role: 'system', content: `You are an English teacher. Generate 5 diverse, natural example sentences using the given chunk/phrase, each in a different real-life context (casual, formal, workplace, social, etc.). Each must have a natural Chinese translation. Return ONLY valid JSON array (no markdown): [{"en": "sentence", "zh": "中文翻译"}]` },
          { role: 'user', content: `Generate 5 example sentences using: "${chunk.content}" (meaning: ${chunk.meaning}). Use different contexts — casual talk, workplace, social media, family, etc.` },
        ],
        { temperature: 0.9, maxTokens: 1536 },
      );
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (!jsonMatch) { toast.error('AI 返回格式异常'); return; }
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      setPhraseExamples((prev) => ({
        ...prev,
        [key]: [...(prev[key] || []), ...parsed.map((e: any) => ({ en: e.en || '', zh: e.zh || '' }))].filter((e) => e.en && e.zh).slice(0, 10),
      }));
      toast.success(`已生成 ${parsed.length} 条例句`);
    } catch (e) { console.error('AI phrase examples generation failed:', e); toast.error('AI 生成例句失败'); }
  };

  const handleGeneratePhrases = async () => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    setPhraseGenLoading(true);
    try {
      const result = await aiChat(
        [
          { role: 'system', content: `You are an English teacher. Generate 5 useful English chunks/phrasal verbs/idioms for Chinese learners. Each MUST include: Chinese meaning (meaning), English introduction explaining what it means and when to use it (introduction), natural example sentence (example), and Chinese translation of the example (exampleZh). Return ONLY valid JSON array (no markdown): [{"content": "chunk", "meaning": "中文释义", "introduction": "1-2 sentence English description of this chunk — what it means, when native speakers use it", "category": "daily/workplace/social/emotion/travel/study/tech/food/health/shopping/sports", "difficulty": "beginner/intermediate/advanced", "usage": "brief Chinese usage note", "example": "natural example sentence", "exampleZh": "例句中文翻译"}]` },
          { role: 'user', content: 'Generate 5 diverse English chunks for a phrase library. Cover different categories and difficulty levels.' },
        ],
        { temperature: 0.9, maxTokens: 1536 },
      );
      const parsed = extractJson<any[]>(result);
      if (!Array.isArray(parsed) || parsed.length === 0) { toast.error('AI 未生成有效内容'); return; }
      if (!Array.isArray(parsed) || parsed.length === 0) { toast.error('AI 未生成有效短语'); return; }
      const newChunks: IChunk[] = parsed.map((item: any, i: number) => ({
        id: `ai_phrase_${Date.now()}_${i}`,
        content: item.content || '',
        meaning: item.meaning || '',
        introduction: item.introduction || '',
        category: item.category || 'daily',
        difficulty: item.difficulty || 'intermediate',
        usage: item.usage || '',
        example: item.example || '',
        exampleZh: item.exampleZh || '',
      })).filter((c: IChunk) => c.content && c.meaning);
      if (newChunks.length === 0) { toast.error('AI 未生成有效短语'); return; }
      setCustomChunks((prev) => [...newChunks, ...prev]);
      toast.success(`AI 已生成 ${newChunks.length} 个短语！`);
    } catch (e) { console.error('AI phrase generation failed:', e); toast.error('AI 生成失败，请重试'); }
    finally { setPhraseGenLoading(false); }
  };

  // Phrase learning with SM-2 spaced repetition
  const phraseLearning = usePhraseLearning(allChunks);
  const {
    state: phraseState,
    dailyQuota: phraseQuota,
    setDailyQuota: setPhraseQuota,
    todayRemaining,
    dueForReview,
    getReviewQueue,
    recordReview,
    resetProgress: resetPhraseProgress,
    getStats: getPhraseStats,
  } = phraseLearning;

  const phraseStats = getPhraseStats();

  // Review queue (SM-2 based)
  const [reviewQueue, setReviewQueue] = useState<IChunk[]>([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [reviewFlipped, setReviewFlipped] = useState(false);
  const [reviewKnown, setReviewKnown] = useState(0);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [reviewQuality, setReviewQuality] = useState<number[]>([]); // track quality per card for summary
  const [reviewTtsMode, setReviewTtsMode] = useState<'chunk' | 'example'>('chunk');

  // Auto-speak: new card → always read chunk; flip → read chunk or example based on mode
  useEffect(() => {
    if (reviewIdx >= reviewQueue.length) return;
    const phrase = reviewQueue[reviewIdx];
    if (!phrase) return;
    if (!reviewFlipped) {
      // Front side — speak chunk
      tts.speak(phrase.content, { rate: 0.85 });
    } else {
      // Back side — speak based on mode
      if (reviewTtsMode === 'chunk') {
        tts.speak(phrase.content, { rate: 0.85 });
      } else if (phrase.example) {
        tts.speak(cleanText(phrase.example), { rate: 0.85 });
      }
    }
  }, [reviewFlipped, reviewIdx, reviewTtsMode]);

  const startReview = (count = 20) => {
    const queue = getReviewQueue(count);
    setReviewQueue(queue);
    setReviewIdx(0);
    setReviewFlipped(false);
    setReviewKnown(0);
    setReviewTotal(0);
    setReviewQuality([]);
  };

  // Review memorized (Brain-toggled) chunks specifically
  const startMemorizedReview = (count?: number) => {
    const memorized = allChunks.filter((c) => memorizedChunks.has(c.id));
    if (memorized.length === 0) {
      toast.info('还没有标记已记的语块，先去语块库标记吧');
      return;
    }
    // Shuffle and take requested count (or all)
    const shuffled = [...memorized].sort(() => Math.random() - 0.5);
    const queue = count ? shuffled.slice(0, count) : shuffled;
    setReviewQueue(queue);
    setReviewIdx(0);
    setReviewFlipped(false);
    setReviewKnown(0);
    setReviewTotal(0);
    setReviewQuality([]);
  };

  const handleReviewMark = (quality: number) => {
    const phrase = reviewQueue[reviewIdx];
    if (!phrase) return;
    recordReview(phrase, quality);
    const isCorrect = quality >= 3;
    setReviewKnown((p) => p + (isCorrect ? 1 : 0));
    setReviewTotal((p) => p + 1);
    setReviewQuality((p) => [...p, quality]);
    setReviewFlipped(false);
    addStudyMinutes(0.2, 'chunks');
    if (reviewIdx + 1 < reviewQueue.length) {
      setReviewIdx((p) => p + 1);
    } else {
      setReviewIdx((p) => p + 1); // trigger completion screen
    }
  };

  const staticExercises = useMemo(() => generateReplacementExercises(allChunks), [allChunks, refreshKey]);
  const replacementExercises = aiReplacements.length > 0 ? aiReplacements : staticExercises;

  // Split filtered chunks by source
  const filteredBuiltInChunks = useMemo(() => {
    return MOCK_CHUNKS.filter((chunk) => {
      const matchesSearch =
        chunk.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        chunk.meaning.includes(searchQuery);
      const matchesCategory = categoryFilter === 'all' || chunk.category === categoryFilter;
      const matchesDifficulty = difficultyFilter === 'all' || chunk.difficulty === difficultyFilter;
      return matchesSearch && matchesCategory && matchesDifficulty;
    });
  }, [searchQuery, categoryFilter, difficultyFilter]);

  const filteredAiChunks = useMemo(() => {
    return customChunks.filter((chunk) => {
      const matchesSearch =
        chunk.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        chunk.meaning.includes(searchQuery);
      const matchesCategory = categoryFilter === 'all' || chunk.category === categoryFilter;
      const matchesDifficulty = difficultyFilter === 'all' || chunk.difficulty === difficultyFilter;
      return matchesSearch && matchesCategory && matchesDifficulty;
    });
  }, [searchQuery, categoryFilter, difficultyFilter, customChunks]);

  // Memory / Brain toggle – simple memorized flag (independent of SM-2)
  const MEMORIZED_KEY = '__nativethink_chunk_memorized';
  const [memorizedChunks, setMemorizedChunks] = useState<Set<string>>(() => {
    try {
      const raw = safeStorage.getItem(MEMORIZED_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const [memoryFilter, setMemoryFilter] = useState<'all' | 'memorized' | 'unmemorized'>('all');
  const toggleMemorized = (chunkId: string) => {
    setMemorizedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(chunkId)) { next.delete(chunkId); } else { next.add(chunkId); }
      try { safeStorage.setItem(MEMORIZED_KEY, JSON.stringify([...next])); } catch { /* */ }
      return next;
    });
  };

  // Apply memory filter to built-in chunks
  const memorizedFilteredBuiltIn = useMemo(() => {
    if (memoryFilter === 'memorized') {
      return filteredBuiltInChunks.filter((c) => memorizedChunks.has(c.id));
    }
    if (memoryFilter === 'unmemorized') {
      return filteredBuiltInChunks.filter((c) => !memorizedChunks.has(c.id));
    }
    return filteredBuiltInChunks;
  }, [filteredBuiltInChunks, memoryFilter, memorizedChunks]);

  // Pagination: page counts + slices
  const builtinTotalPages = Math.max(1, Math.ceil(memorizedFilteredBuiltIn.length / LIBRARY_PAGE_SIZE));
  const aiTotalPages = Math.max(1, Math.ceil(filteredAiChunks.length / LIBRARY_PAGE_SIZE));
  const builtinPageChunks = useMemo(
    () => memorizedFilteredBuiltIn.slice(builtinPage * LIBRARY_PAGE_SIZE, (builtinPage + 1) * LIBRARY_PAGE_SIZE),
    [memorizedFilteredBuiltIn, builtinPage],
  );
  const aiPageChunks = useMemo(
    () => filteredAiChunks.slice(aiPage * LIBRARY_PAGE_SIZE, (aiPage + 1) * LIBRARY_PAGE_SIZE),
    [filteredAiChunks, aiPage],
  );

  // Clamp pages when filters reduce the result set
  useEffect(() => {
    if (builtinPage >= builtinTotalPages) setBuiltinPage(Math.max(0, builtinTotalPages - 1));
  }, [builtinTotalPages]);
  useEffect(() => {
    if (aiPage >= aiTotalPages) setAiPage(Math.max(0, aiTotalPages - 1));
  }, [aiTotalPages]);

  // Current page-dependent values
  const activePageChunks = librarySource === 'builtin' ? builtinPageChunks : aiPageChunks;
  const activeTotalPages = librarySource === 'builtin' ? builtinTotalPages : aiTotalPages;
  const activeFilteredCount = librarySource === 'builtin' ? memorizedFilteredBuiltIn.length : filteredAiChunks.length;
  const activePage = librarySource === 'builtin' ? builtinPage : aiPage;
  const setActivePage = librarySource === 'builtin' ? setBuiltinPage : setAiPage;

  // Restore library scroll position after page data loads
  useEffect(() => {
    const el = libraryScrollRef.current;
    if (!el || !chunkPosMemory.scrollTop) return;
    requestAnimationFrame(() => { el.scrollTop = chunkPosMemory.scrollTop!; });
  }, [activePageChunks.length > 0]);

  const openDetail = (chunk: typeof MOCK_CHUNKS[0]) => {
    setDetailChunk(chunk);
    setDetailOpen(true);
  };

  const currentQuestion = replacementExercises[currentQIdx];
  const chainChunks = useMemo(() => [...allChunks].sort(() => Math.random() - 0.5).slice(0, 10), [allChunks, refreshKey]);

  // AI-generated chain challenge
  const [aiChainChallenge, setAiChainChallenge] = useState<{ chunk: string; meaning: string; scenario: string } | null>(null);
  const [chainGenLoading, setChainGenLoading] = useState(false);

  const handleOptionSelect = (option: string) => {
    if (showAnswer) return;
    setSelectedOption(option);
  };

  const checkAnswer = () => {
    if (!selectedOption) return;
    setShowAnswer(true);
    setAnsweredCount((prev) => prev + 1);
    if (selectedOption === currentQuestion.correctChunk) {
      setScore((prev) => prev + 1);
      toast.success('回答正确！🎉');
    } else {
      toast.info('再想想哦～');
    }
    addStudyMinutes(1, 'chunks');
    // Trigger AI feedback
    fetchReplacementFeedback();
  };

  const nextQuestion = () => {
    setCurrentQIdx((prev) => (prev + 1) % replacementExercises.length);
    setSelectedOption(null);
    setShowAnswer(false);
  };

  const handleChainSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = chainInput.trim();
    if (!input || chainLoading) return;

    const chunkContent = aiChainChallenge ? aiChainChallenge.chunk : chainChunks[currentChainIdx].content;
    const chunkMeaning = aiChainChallenge ? aiChainChallenge.meaning : chainChunks[currentChainIdx].meaning;
    const containsChunk = input.toLowerCase().includes(chunkContent.toLowerCase());

    if (!containsChunk) {
      setChainFeedback({
        correct: false,
        message: `句子中需要包含 "${chunkContent}" 这个语块哦`,
      });
      return;
    }

    setChainLoading(true);
    setChainFeedback(null);
    addStudyMinutes(1, 'chunks');

    const controller = new AbortController();
    chainAbortRef.current = controller;

    try {
      let feedback = '';

      if (isConfigured) {
        const stream = aiStream(
          [
            {
              role: 'system',
              content: `You are an English chunk/phrase coach. The user must create a sentence using a specific English chunk/phrase. Evaluate their sentence.

Provide ALL responses in BOTH English and Chinese (bilingual). For each section, show the **English version first**, followed by the **中文版本**. Format:

## 评价
✅/⚠️ 简短评价

## 分析
- 是否正确使用了语块？
- 句子是否地道？
- 有什么改进建议？

Keep it brief — 2-3 bullet points max.`,
            },
            {
              role: 'user',
              content: `Required chunk: "${chunkContent}"\nMeaning: ${chunkMeaning}\n\nMy sentence: "${input}"\n\nDoes this sentence correctly and naturally use the chunk?`,
            },
          ],
          { temperature: 0.3, signal: controller.signal },
        );

        for await (const chunk of stream) {
          if (chunk.content) {
            feedback += chunk.content;
          }
        }
      } else {
        const result = await capabilityClient
          .load(PLUGIN_IDS.CHINGLISH_DETECTION)
          .call('textGenerate', { english_sentence: input });

        feedback = (result as { content?: string })?.content || '';
      }
      // 判断 AI 是否指出了问题：如果反馈中包含"地道""正确""自然"等正面评价且没有指出明显错误，算通过
      const hasIssues =
        feedback.includes('中式') ||
        feedback.includes('错误') ||
        feedback.includes('问题') ||
        feedback.includes('不地道') ||
        feedback.includes('建议') ||
        feedback.includes('应该') ||
        feedback.includes('❌') ||
        feedback.includes('⚠️');

      if (hasIssues) {
        setChainFeedback({
          correct: false,
          message: '句子还有可以改进的地方～',
          detail: feedback,
        });
      } else {
        setChainScore((prev) => prev + 10);
        setChainFeedback({
          correct: true,
          message: `太棒了！正确使用了 "${chunkContent}" +10分`,
          detail: feedback,
        });
        setTimeout(() => {
          setCurrentChainIdx((prev) => (prev + 1) % chainChunks.length);
          setChainInput('');
          setChainFeedback(null);
          setAiChainChallenge(null);
        }, 2000);
      }
    } catch (err) {
      toast.error('AI 服务暂不可用，请稍后重试');
      // 降级：仅做字符串包含判断
      setChainScore((prev) => prev + 10);
      setChainFeedback({
        correct: true,
        message: `正确使用了 "${chunkContent}" +10分（AI 服务暂不可用，已通过基础校验）`,
      });
      setTimeout(() => {
        setCurrentChainIdx((prev) => (prev + 1) % chainChunks.length);
        setChainInput('');
        setChainFeedback(null);
        setAiChainChallenge(null);
      }, 2000);
    } finally {
      setChainLoading(false);
      chainAbortRef.current = null;
    }
  };

  const toggleFavorite = useCallback((chunk: typeof MOCK_CHUNKS[0]) => {
    const favorited = isFavorited(chunk.content, 'chunk');
    if (favorited) {
      const fav = favorites.find((f) => f.content === chunk.content && f.type === 'chunk');
      if (fav) removeFavorite(fav.id);
    } else {
      addFavorite({
        type: 'chunk',
        content: chunk.content,
        meaning: chunk.meaning,
        example: chunk.example,
        category: chunk.category,
      });
    }
  }, [isFavorited, favorites, removeFavorite, addFavorite]);

  const handleGenerateChunks = async () => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    setGenerating(true);
    try {
      const catLabel = CATEGORY_LABELS[genCategory] || genCategory;
      const diffLabel = { beginner: '初级', intermediate: '中级', advanced: '高级' }[genDifficulty];
      const result = await aiChat(
        [
          {
            role: 'system',
            content: `You are an English chunk/phrase teacher. Generate ${genCount} English chunks (idioms, phrasal verbs, collocations) for Chinese English learners. Return ONLY valid JSON array (no markdown, no code fences):

[
  {
    "content": "the English chunk/phrase",
    "meaning": "Chinese meaning (中文释义)",
    "introduction": "1-2 sentence English description explaining what this chunk means, when native speakers use it, and any cultural context. Write naturally like a teacher explaining to a student.",
    "category": "${genCategory}",
    "difficulty": "${genDifficulty}",
    "usage": "brief usage note in Chinese (1 line, 中文使用说明)",
    "example": "a natural example sentence using the chunk",
    "exampleZh": "Chinese translation of the example sentence"
  }
]

Make chunks practical and commonly used by native speakers. Each chunk should be unique and useful. The introduction MUST be in English and the exampleZh MUST be in Chinese.`,
          },
          {
            role: 'user',
            content: `Generate ${genCount} "${catLabel}" category English chunks at "${diffLabel}" level. Make them practical for daily conversation.`,
          },
        ],
        { temperature: 0.9, maxTokens: 2048 },
      );

      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (!jsonMatch) { toast.error('AI 返回格式异常，请重试'); return; }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed) || parsed.length === 0) { toast.error('AI 未生成有效语块，请重试'); return; }

      const newChunks: IChunk[] = parsed.map((item: { content: string; meaning: string; introduction?: string; category: string; difficulty: string; usage: string; example: string; exampleZh?: string }, i: number) => ({
        id: `ai_c_${Date.now()}_${i}`,
        content: item.content,
        meaning: item.meaning,
        introduction: item.introduction || '',
        category: (item.category || genCategory) as IChunk['category'],
        difficulty: (item.difficulty || genDifficulty) as IChunk['difficulty'],
        usage: item.usage || '',
        example: item.example || `Here's an example with "${item.content}".`,
        exampleZh: item.exampleZh || '',
      }));

      setCustomChunks((prev) => [...newChunks, ...prev]);
      setShowGenDialog(false);
      toast.success(`AI 已生成 ${newChunks.length} 个语块！`);
    } catch (e) {
      console.error('AI chunk generation failed:', e);
      toast.error('AI 生成失败，请检查网络后重试');
    } finally {
      setGenerating(false);
    }
  };

  const fetchReplacementFeedback = async () => {
    if (!isConfigured || !currentQuestion || !selectedOption) return;
    setFeedbackLoading(true);
    setReplacementFeedback('');
    try {
      const isCorrect = selectedOption === currentQuestion.correctChunk;
      const result = await aiChat(
        [
          {
            role: 'system',
            content: `You are an English chunk teacher. A student made a choice about which chunk to use in a sentence. Explain in Chinese (1-2 sentences) why their answer was ${isCorrect ? 'correct' : 'wrong'}. Be encouraging and educational. Keep it very short.`,
          },
          {
            role: 'user',
            content: `Sentence with awkward phrase: "${currentQuestion.sentence}"
Correct chunk: "${currentQuestion.correctChunk}" (meaning: ${currentQuestion.meaning})
Student chose: "${selectedOption}"
Was the student correct? ${isCorrect ? 'Yes' : 'No'}

${isCorrect ? 'Explain why this chunk fits perfectly.' : 'Explain why the correct answer is better and what the student might have confused.'}`,
          },
        ],
        { temperature: 0.5, maxTokens: 256 },
      );
      setReplacementFeedback(result);
    } catch (e) {
      console.warn('Replacement feedback fetch failed:', e);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handleGenerateSentences = async (chunk: IChunk) => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    setSentenceGenLoading(chunk.id);
    try {
      const result = await aiChat(
        [
          {
            role: 'system',
            content: `You are an English teacher. Generate 3-5 diverse, natural example sentences using the English chunk/phrase, each with a Chinese translation. Vary the contexts and registers. Return ONLY valid JSON array of objects, no markdown: [{"en": "English sentence", "zh": "中文翻译"}, ...]`,
          },
          {
            role: 'user',
            content: `Generate 3-5 example sentences using: "${chunk.content}" (meaning: ${chunk.meaning}). Vary contexts — daily, workplace, casual, formal. Each sentence must have a Chinese translation.`,
          },
        ],
        { temperature: 0.9, maxTokens: 1024 },
      );
      const parsed = extractJson<any[]>(result);
      if (!Array.isArray(parsed) || parsed.length === 0) { toast.error('AI 未生成有效内容'); return; }
      if (!Array.isArray(parsed) || parsed.length === 0) { toast.error('AI 未生成有效例句，请重试'); return; }
      const items = parsed.map((item: { en?: string; zh?: string }) => ({
        en: item.en || '',
        zh: item.zh || '',
      })).filter((item: { en: string; zh: string }) => item.en && item.zh);
      if (items.length === 0) { toast.error('AI 未生成有效例句，请重试'); return; }
      setAiSentences((prev) => ({
        ...prev,
        [chunk.id]: [...(prev[chunk.id] || []), ...items],
      }));
      toast.success(`AI 已生成 ${items.length} 条例句！`);
    } catch (e) {
      console.error('AI sentence generation failed:', e);
      toast.error('AI 生成失败，请检查网络后重试');
    } finally {
      setSentenceGenLoading(null);
    }
  };

  const handleDeleteSentence = (chunkId: string, idx: number) => {
    setAiSentences((prev) => {
      const updated = { ...prev };
      updated[chunkId] = updated[chunkId].filter((_, i) => i !== idx);
      if (updated[chunkId].length === 0) delete updated[chunkId];
      return updated;
    });
  };

  const handleDeleteCustomChunk = (e: React.MouseEvent, chunkId: string) => {
    e.stopPropagation();
    setCustomChunks((prev) => prev.filter((c) => c.id !== chunkId));
    setDetailOpen(false);
  };

  const handleGenerateReplacements = async () => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    setReplaceGenLoading(true);
    try {
      const result = await aiChat(
        [
          { role: 'system', content: `You are an English teacher. Generate 5 replacement exercises for Chinese learners. Each exercise: take a natural English chunk/phrase, create a sentence where it's replaced by an awkward/literal expression, and provide 4 options (1 correct chunk + 3 similar but wrong chunks). Return ONLY valid JSON array:\n[{"sentence": "sentence with [awkward phrase] in brackets", "correctChunk": "the right chunk", "meaning": "Chinese meaning", "options": ["correct", "wrong1", "wrong2", "wrong3"]}]` },
          { role: 'user', content: 'Generate 5 fresh replacement exercises. Use common English chunks and idioms suitable for intermediate learners.' },
        ],
        { temperature: 0.9, maxTokens: 2048 },
      );
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (!jsonMatch) { toast.error('AI 返回格式异常'); return; }
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed) || parsed.length === 0) { toast.error('AI 未生成有效题目'); return; }
      const exercises = parsed.map((item: { sentence: string; correctChunk: string; meaning: string; options: string[] }, i: number) => ({
        id: `ai_rep_${Date.now()}_${i}`,
        sentence: item.sentence,
        awkwardPhrase: item.sentence.match(/\[(.*?)\]/)?.[1] || '',
        correctChunk: item.correctChunk,
        meaning: item.meaning || '',
        example: '',
        category: 'daily',
        options: (item.options || []).sort(() => Math.random() - 0.5),
      }));
      setAiReplacements(exercises);
      setCurrentQIdx(0);
      setSelectedOption(null);
      setShowAnswer(false);
      setScore(0);
      setAnsweredCount(0);
      toast.success(`AI 已生成 ${exercises.length} 道替换练习题！`);
    } catch (e) { console.error('AI replacement generation failed:', e); toast.error('AI 生成失败'); }
    finally { setReplaceGenLoading(false); }
  };

  const handleGenerateChainChallenge = async () => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    setChainGenLoading(true);
    try {
      const result = await aiChat(
        [
          { role: 'system', content: `You are an English teacher. Generate ONE chain-game challenge for Chinese learners. Provide an English chunk/phrase and a fun scenario/situation in Chinese where the learner must use this chunk to create a natural English sentence. Return ONLY valid JSON:\n{"chunk": "the English chunk", "meaning": "Chinese meaning", "scenario": "Chinese scenario description (1-2 sentences, engaging and practical)"}` },
          { role: 'user', content: 'Generate a fresh chain game challenge with a common English chunk and a fun scenario.' },
        ],
        { temperature: 0.9, maxTokens: 512 },
      );
      const parsed = extractJson<{ chunk?: string; meaning?: string; scenario?: string }>(result);
      if (!parsed.chunk || !parsed.meaning) { toast.error('AI 未生成有效题目'); return; }
      setAiChainChallenge({ chunk: parsed.chunk, meaning: parsed.meaning, scenario: parsed.scenario || '' });
      setChainInput('');
      setChainFeedback(null);
      toast.success('AI 已生成新挑战！');
    } catch (e) { console.error('AI chain challenge generation failed:', e); toast.error('AI 生成失败'); }
    finally { setChainGenLoading(false); }
  };

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">
            Chunk Training
          </p>
          <h1 className="text-3xl font-black italic text-foreground tracking-tight">语块训练</h1>
          <p className="text-muted-foreground mt-2 text-sm font-medium">
            积累高频母语语块，让你的表达更地道自然
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setMemory((p) => ({ ...p, tab: v })); }} className="w-full">
        <TabsList className="bg-muted p-1.5 rounded-3xl h-auto">
          <TabsTrigger
            value="library"
            className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm"
          >
            <Puzzle className="size-4 mr-2" />
            语块库
          </TabsTrigger>
          <TabsTrigger
            value="replace"
            className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm"
          >
            <CheckCircle2 className="size-4 mr-2" />
            替换练习
          </TabsTrigger>
          <TabsTrigger
            value="chain"
            className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm"
          >
            <Trophy className="size-4 mr-2" />
            接龙游戏
          </TabsTrigger>
          <TabsTrigger
            value="phrases"
            className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm"
          >
            <BookOpen className="size-4 mr-2" />
            短语库
          </TabsTrigger>
          <TabsTrigger
            value="review"
            className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm"
          >
            <RotateCw className="size-4 mr-2" />
            短语复习
          </TabsTrigger>
        </TabsList>

        {/* 语块库 */}
        <TabsContent value="library" className="space-y-6 mt-6">
          <Card className="rounded-[40px] border-border shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 text-[#00B894] flex items-center justify-center">
                    <Puzzle className="size-5.5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-[900] italic text-foreground">
                      高频母语语块库
                    </CardTitle>
                    <CardDescription className="text-sm font-medium mt-1">
                      共 {allChunks.length} 个语块，按场景分类
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索语块..."
                      className="bg-muted border-none pl-10 pr-4 py-2.5 rounded-2xl text-xs font-bold focus-visible:ring-2 focus-visible:ring-emerald-200"
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setMemory((p) => ({ ...p, category: v })); }}>
                    <SelectTrigger className="w-[100px] rounded-2xl border-border bg-muted text-xs font-bold uppercase tracking-wider">
                      <SelectValue placeholder="分类" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {CATEGORIES.map((cat) => (
                        <SelectItem
                          key={cat.value}
                          value={cat.value}
                          className="text-xs font-bold"
                        >
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={difficultyFilter} onValueChange={(v) => { setDifficultyFilter(v); setMemory((p) => ({ ...p, difficulty: v })); }}>
                    <SelectTrigger className="w-[120px] rounded-2xl border-border bg-muted text-xs font-bold uppercase tracking-wider">
                      <SelectValue placeholder="难度" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {DIFFICULTIES.map((d) => (
                        <SelectItem
                          key={d.value}
                          value={d.value}
                          className="text-xs font-bold"
                        >
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* 今日复习推荐 — SM-2 based due-for-review */}
              <div className="mb-6 p-5 rounded-[28px] bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10 border border-orange-100">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="size-4 text-orange-500" />
                  <span className="text-xs font-black uppercase tracking-wider text-orange-600">
                    今日待复习 · {phraseStats.dueNow} 个
                  </span>
                  {phraseStats.dueNow === 0 && phraseStats.learning > 0 && (
                    <span className="text-[10px] font-medium text-muted-foreground ml-1">（全部已掌握，继续保持！）</span>
                  )}
                </div>
                {phraseStats.dueNow > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const duePhrases = allChunks.filter((c) => {
                        const progress = phraseState.progress[c.content.toLowerCase()];
                        return progress && progress.nextReview <= Date.now() && progress.status !== 'new';
                      }).slice(0, 10);
                      return duePhrases.map((chunk) => (
                        <Badge
                          key={chunk.id}
                          className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium bg-white/70 dark:bg-foreground/10 text-foreground hover:bg-white hover:shadow-sm transition-all border border-orange-100"
                          onClick={() => openDetail(chunk)}
                        >
                          {chunk.content}
                        </Badge>
                      ));
                    })()}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      // No due reviews — show random new phrases as suggestions
                      const newPhrases = allChunks
                        .filter((c) => !phraseState.progress[c.content.toLowerCase()])
                        .sort(() => Math.random() - 0.5)
                        .slice(0, 5);
                      return newPhrases.map((chunk) => (
                        <Badge
                          key={chunk.id}
                          className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium bg-white/70 dark:bg-foreground/10 text-foreground hover:bg-white hover:shadow-sm transition-all border border-orange-100"
                          onClick={() => openDetail(chunk)}
                        >
                          {chunk.content}
                        </Badge>
                      ));
                    })()}
                    {phraseStats.totalStarted === 0 && (
                      <span className="text-[10px] text-muted-foreground">还没有开始学习，去复习页开始吧</span>
                    )}
                  </div>
                )}
              </div>

              {/* Source sub-pills */}
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setLibrarySource('builtin')}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-bold transition-all border-2',
                    librarySource === 'builtin'
                      ? 'border-[#00B894] bg-[#00B894]/10 text-[#00B894]'
                      : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                  )}
                >
                  <Puzzle className="size-3.5" />
                  内置语块
                  <Badge className="ml-0.5 text-[9px] font-black rounded-full px-1.5 py-0 bg-emerald-50 dark:bg-emerald-500/15 text-[#00B894] border-none">
                    {memorizedFilteredBuiltIn.length}
                  </Badge>
                </button>
                <button
                  type="button"
                  onClick={() => setLibrarySource('aigenerated')}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-bold transition-all border-2',
                    librarySource === 'aigenerated'
                      ? 'border-violet-400 bg-violet-50 text-violet-600'
                      : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                  )}
                >
                  <Bot className="size-3.5" />
                  AI 生成
                  <Badge className="ml-0.5 text-[9px] font-black rounded-full px-1.5 py-0 bg-violet-50 dark:bg-violet-500/15 text-violet-500 border-none">
                    {filteredAiChunks.length}
                  </Badge>
                </button>
              </div>

              {/* Page info + AI generate button (AI sub-page only) */}
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-muted-foreground">
                  {activeFilteredCount} 个结果 · 第 {activePage + 1}/{activeTotalPages} 页
                </p>
                {librarySource === 'aigenerated' && (
                  <Dialog open={showGenDialog} onOpenChange={setShowGenDialog}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-2xl border-dashed border-violet-300 text-violet-500 hover:bg-violet-50 text-[10px] font-black uppercase tracking-wider"
                      >
                        <Wand2 className="size-3.5 mr-1.5" />
                        AI 生成语块
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden">
                      <div className="p-6 border-b border-border">
                        <DialogHeader>
                          <DialogTitle className="text-xl font-black italic text-foreground flex items-center gap-2">
                            <Bot className="size-5 text-violet-500" />
                            AI 生成语块
                          </DialogTitle>
                        </DialogHeader>
                      </div>
                      <div className="p-6 space-y-5">
                        <div className="space-y-2">
                          <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">分类</label>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { value: 'daily', label: '日常' },
                              { value: 'workplace', label: '职场' },
                              { value: 'social', label: '社交' },
                              { value: 'emotion', label: '情绪' },
                              { value: 'travel', label: '旅行' },
                              { value: 'study', label: '学习' },
                              { value: 'tech', label: '科技' },
                              { value: 'food', label: '美食' },
                              { value: 'health', label: '健康' },
                              { value: 'shopping', label: '购物' },
                              { value: 'sports', label: '运动' },
                            ].map((c) => (
                              <button
                                key={c.value}
                                type="button"
                                onClick={() => setGenCategory(c.value)}
                                className={cn(
                                  'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border-2',
                                  genCategory === c.value
                                    ? 'border-violet-400 bg-violet-50 text-violet-600'
                                    : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                                )}
                              >
                                {c.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">难度</label>
                          <div className="flex gap-2">
                            {[
                              { value: 'beginner', label: '初级' },
                              { value: 'intermediate', label: '中级' },
                              { value: 'advanced', label: '高级' },
                            ].map((d) => (
                              <button
                                key={d.value}
                                type="button"
                                onClick={() => setGenDifficulty(d.value)}
                                className={cn(
                                  'px-4 py-1.5 rounded-xl text-xs font-bold transition-all border-2',
                                  genDifficulty === d.value
                                    ? 'border-violet-400 bg-violet-50 text-violet-600'
                                    : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                                )}
                              >
                                {d.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">生成数量</label>
                          <div className="flex flex-wrap gap-2">
                            {[1, 3, 5, 10, 15, 20].map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setGenCount(n)}
                                className={cn(
                                  'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border-2',
                                  genCount === n
                                    ? 'border-violet-400 bg-violet-50 text-violet-600'
                                    : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                                )}
                              >
                                {n} 个
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="p-6 border-t border-border flex gap-3 justify-end">
                        <Button variant="outline" onClick={() => setShowGenDialog(false)} className="rounded-2xl">取消</Button>
                        <Button
                          onClick={handleGenerateChunks}
                          disabled={generating}
                          className="rounded-2xl bg-violet-500 hover:bg-violet-600 text-white shadow-lg shadow-violet-200/50"
                        >
                          {generating ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Wand2 className="size-4 mr-1.5" />}
                          {generating ? '生成中...' : `生成 ${genCount} 个`}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              {/* Memory filter bar */}
              {librarySource === 'builtin' && (
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-0.5 bg-muted rounded-xl p-0.5">
                    {([
                      { key: 'all' as const, label: '全部' },
                      { key: 'memorized' as const, label: '已记' },
                      { key: 'unmemorized' as const, label: '未记' },
                    ]).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setMemoryFilter(key)}
                        className={cn(
                          'px-3 py-1 rounded-[10px] text-xs font-bold transition-all',
                          memoryFilter === key
                            ? 'bg-white dark:bg-card text-[#00B894] shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activePageChunks.length > 0 ? (
                <div className="grid grid-cols-12 gap-6">
                  {/* LEFT COLUMN — Compact list + pagination */}
                  <div className="col-span-12 lg:col-span-5 lg:sticky lg:top-40 self-start">
                    <div
                      ref={libraryScrollRef}
                      onScroll={() => {
                        if (libraryScrollRef.current) {
                          saveChunkPosition({ scrollTop: libraryScrollRef.current.scrollTop, source: librarySource, page: activePage, tab: activeTab });
                        }
                      }}
                      className="space-y-1 max-h-[480px] overflow-y-auto pr-1"
                    >
                      {activePageChunks.map((chunk) => {
                        const favorited = isFavorited(chunk.content, 'chunk');
                        return (
                          <button
                            key={chunk.id}
                            onClick={() => setDetailChunk(chunk)}
                            className={cn(
                              'w-full text-left p-3 rounded-2xl transition-all duration-200 border-2',
                              detailChunk?.id === chunk.id
                                ? 'border-[#00B894] bg-[#00B894]/5 shadow-sm'
                                : 'border-transparent bg-muted/30 hover:bg-muted hover:border-border',
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); tts.speak(chunk.content); }}
                                    className="shrink-0 text-muted-foreground/40 hover:text-[#00B894] transition-colors"
                                    title={`朗读 "${chunk.content}"`}
                                  >
                                    <Volume2 className="size-3.5" />
                                  </button>
                                  <span className="text-sm font-black text-foreground">{chunk.content}</span>
                                  {chunk.id.startsWith('ai_') && (
                                    <Badge className="text-[8px] font-black rounded-full px-1.5 py-0 bg-gradient-to-r from-violet-500 to-purple-500 text-white border-0">AI</Badge>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{chunk.meaning}</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleMemorized(chunk.id); }}
                                  title={memorizedChunks.has(chunk.id) ? '取消记忆' : '标记为已记'}
                                  className={cn(
                                    'p-0.5 rounded-lg transition-colors',
                                    memorizedChunks.has(chunk.id)
                                      ? 'text-[#00B894] hover:text-[#00B894]/70'
                                      : 'text-muted-foreground/30 hover:text-[#00B894]',
                                  )}
                                >
                                  <Brain className={cn('size-3.5', memorizedChunks.has(chunk.id) && 'fill-[#00B894]/20')} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleFavorite(chunk); }}
                                  className={cn(
                                    'p-0.5 rounded-lg transition-colors',
                                    favorited ? 'text-rose-500' : 'text-muted-foreground/30 hover:text-rose-500',
                                  )}
                                >
                                  <Heart className={cn('size-3.5', favorited && 'fill-current')} />
                                </button>
                                {chunk.id.startsWith('ai_') && (
                                  <button
                                    onClick={(e) => handleDeleteCustomChunk(e, chunk.id)}
                                    className="p-0.5 rounded-lg text-muted-foreground/30 hover:text-rose-500 transition-colors"
                                    title="删除"
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Auto-play + pagination */}
                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-border/50">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold text-muted-foreground/50">点击语块即可朗读</span>
                      </div>
                    {activeTotalPages > 1 && (
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setActivePage(Math.max(0, activePage - 1))}
                          disabled={activePage === 0}
                          className="rounded-xl h-7 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-[#00B894]"
                        >
                          <ChevronLeft className="size-3.5" />
                        </Button>
                        <PageJumpInput
                          current={activePage + 1}
                          total={activeTotalPages}
                          onJump={(pg) => setActivePage(pg - 1)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setActivePage(Math.min(activeTotalPages - 1, activePage + 1))}
                          disabled={activePage >= activeTotalPages - 1}
                          className="rounded-xl h-7 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-[#00B894]"
                        >
                          <ChevronRight className="size-3.5" />
                        </Button>
                      </div>
                    )}
                    </div>
                  </div>

                  {/* RIGHT COLUMN — Detail panel */}
                  <div className="col-span-12 lg:col-span-7">
                    {detailChunk ? (
                      <Card className="rounded-[32px] border-2 border-[#00B894]/20 shadow-sm overflow-hidden">
                        <CardContent className="p-6">
                          {/* Badges */}
                          <div className="flex items-center gap-2 mb-4 flex-wrap">
                            {detailChunk.id.startsWith('ai_') && (
                              <Badge className="text-[8px] font-black rounded-full px-1.5 py-0 bg-gradient-to-r from-violet-500 to-purple-500 text-white border-0">AI</Badge>
                            )}
                            <Badge className="text-[10px] font-black uppercase tracking-wider rounded-full px-3 py-1 bg-emerald-50 dark:bg-emerald-500/15 text-[#00B894] border-none">
                              {CATEGORY_LABELS[detailChunk.category] || detailChunk.category}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] font-black uppercase tracking-wider rounded-full px-3 py-1 bg-muted">
                              {getDifficultyLabel(detailChunk.difficulty)}
                            </Badge>
                          </div>

                          {/* Title + TTS + prev/next */}
                          <div className="flex items-center gap-2 mb-4">
                            <Button variant="ghost" size="icon"
                              onClick={() => {
                                const idx = activePageChunks.findIndex((c) => c.id === detailChunk.id);
                                if (idx > 0) setDetailChunk(activePageChunks[idx - 1]);
                              }}
                              disabled={activePageChunks.findIndex((c) => c.id === detailChunk.id) <= 0}
                              className="rounded-xl size-7 text-muted-foreground hover:text-[#00B894] shrink-0"
                              title="上一个语块">
                              <ChevronLeft className="size-4" />
                            </Button>
                            <h2 className="text-2xl font-black italic text-foreground tracking-tight">
                              {detailChunk.content}
                            </h2>
                            <Button variant="ghost" size="icon"
                              onClick={() => tts.speak(detailChunk.content)}
                              className="rounded-xl size-8 text-muted-foreground hover:text-[#00B894] shrink-0">
                              <Volume2 className="size-4.5" />
                            </Button>
                            <Button variant="ghost" size="icon"
                              onClick={() => {
                                const idx = activePageChunks.findIndex((c) => c.id === detailChunk.id);
                                if (idx < activePageChunks.length - 1) setDetailChunk(activePageChunks[idx + 1]);
                              }}
                              disabled={activePageChunks.findIndex((c) => c.id === detailChunk.id) >= activePageChunks.length - 1}
                              className="rounded-xl size-7 text-muted-foreground hover:text-[#00B894] shrink-0"
                              title="下一个语块">
                              <ChevronRight className="size-4" />
                            </Button>
                          </div>

                          {/* Meaning */}
                          {detailChunk.meaning && (
                            <div className="mb-4">
                              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">释义</p>
                              <p className="text-lg font-bold text-foreground">{detailChunk.meaning}</p>
                            </div>
                          )}

                          {/* Introduction */}
                          {detailChunk.introduction && (
                            <div className="mb-4 p-3 rounded-2xl bg-gradient-to-r from-emerald-50/50 to-teal-50/50 dark:from-emerald-500/8 dark:to-teal-500/8 border border-[#00B894]/10">
                              <p className="text-[10px] font-black uppercase tracking-wider text-[#00B894] mb-1">English Introduction</p>
                              <p className="text-sm text-foreground/80 leading-relaxed italic">{detailChunk.introduction}</p>
                            </div>
                          )}

                          {/* Usage */}
                          {detailChunk.usage && (
                            <div className="mb-4">
                              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">使用场景</p>
                              <p className="text-sm text-foreground/80 font-medium">{detailChunk.usage}</p>
                            </div>
                          )}

                          {/* Example */}
                          <div className="p-4 rounded-2xl bg-[#00B894]/5 border border-[#00B894]/10 mb-4">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-[10px] font-black uppercase tracking-wider text-[#00B894]">例句</p>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => tts.speak(detailChunk.example, { rate: 0.9 })}
                                className="rounded-lg size-7 text-muted-foreground hover:text-[#00B894]"
                              >
                                <Volume2 className="size-3.5" />
                              </Button>
                            </div>
                            <p className="text-base font-medium text-foreground italic">「{cleanText(detailChunk.example)}」</p>
                            {(detailChunk.exampleZh || exampleTranslations[detailChunk.id]) ? (
                              <p className="text-xs text-muted-foreground mt-1.5 font-medium">
                                {detailChunk.exampleZh || exampleTranslations[detailChunk.id]}
                              </p>
                            ) : (
                              <button
                                onClick={() => handleTranslateExample(detailChunk)}
                                disabled={exampleTransLoading === detailChunk.id}
                                className="text-xs text-violet-500 hover:text-violet-600 font-medium mt-1.5 transition-colors"
                              >
                                {exampleTransLoading === detailChunk.id ? '翻译中...' : '翻译例句'}
                              </button>
                            )}
                          </div>

                          {/* Action buttons */}
                          <div className="flex gap-2 pt-2">
                            <Button
                              variant="outline"
                              className="rounded-2xl flex-1 text-[10px] font-black uppercase tracking-wider border-border"
                              onClick={() => toggleMemorized(detailChunk.id)}
                              title={memorizedChunks.has(detailChunk.id) ? '取消记忆' : '标记为已记'}
                            >
                              <Brain
                                className={cn(
                                  'size-4 mr-2',
                                  memorizedChunks.has(detailChunk.id) && 'fill-[#00B894]/20 text-[#00B894]',
                                )}
                              />
                              {memorizedChunks.has(detailChunk.id) ? '已记忆' : '记忆'}
                            </Button>
                            <Button
                              variant="outline"
                              className="rounded-2xl flex-1 text-[10px] font-black uppercase tracking-wider border-border hover:border-[#00B894] hover:text-[#00B894]"
                              onClick={() => toggleFavorite(detailChunk)}
                            >
                              <Heart
                                className={cn(
                                  'size-4 mr-2',
                                  isFavorited(detailChunk.content, 'chunk') && 'fill-current text-rose-500',
                                )}
                              />
                              {isFavorited(detailChunk.content, 'chunk') ? '已收藏' : '收藏'}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <Card className="rounded-[40px] border-dashed border-2 border-border/50 shadow-sm">
                        <CardContent className="p-16 text-center">
                          <div className="size-20 rounded-3xl bg-muted mx-auto mb-4 flex items-center justify-center text-muted-foreground">
                            <Puzzle className="size-9" />
                          </div>
                          <h3 className="text-xl font-black text-foreground mb-2">选择一个语块</h3>
                          <p className="text-sm text-muted-foreground font-medium">← 选择一个语块查看详情</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  {librarySource === 'aigenerated' && customChunks.length === 0 ? (
                    <>
                      <Bot className="size-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-medium mb-1">还没有 AI 生成的语块</p>
                      <p className="text-xs">点击上方"AI 生成语块"按钮创建专属语块</p>
                    </>
                  ) : (
                    <>
                      <Search className="size-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-medium">没有找到匹配的语块</p>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chunk Detail Dialog */}
          <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
            <DialogContent className="max-w-lg rounded-[32px] p-0 overflow-hidden">
              {detailChunk && (
                <>
                  <div className="p-6 border-b border-border bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10">
                    <DialogHeader>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge className="text-[10px] font-black uppercase tracking-wider rounded-full px-3 py-1 bg-emerald-50 dark:bg-emerald-500/15 text-[#00B894] border-none">
                          {CATEGORY_LABELS[detailChunk.category] || detailChunk.category}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="text-[10px] font-black uppercase tracking-wider rounded-full px-3 py-1 bg-muted"
                        >
                          {getDifficultyLabel(detailChunk.difficulty)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <DialogTitle className="text-3xl font-black italic text-foreground tracking-tight">
                          {detailChunk.content}
                        </DialogTitle>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => tts.speak(detailChunk.content)}
                          className="rounded-xl size-8 text-muted-foreground hover:text-[#00B894] shrink-0"
                        >
                          <Volume2 className="size-4.5" />
                        </Button>
                      </div>
                    </DialogHeader>
                  </div>
                  <div className="p-6 space-y-5">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                        释义
                      </p>
                      <p className="text-lg font-bold text-foreground">{detailChunk.meaning}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                        使用场景
                      </p>
                      <p className="text-sm text-foreground/80 font-medium">{detailChunk.usage}</p>
                    </div>
                    <div className="p-5 rounded-2xl bg-[#00B894]/5 border border-[#00B894]/10">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black uppercase tracking-wider text-[#00B894]">
                          例句
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (isFavorited(detailChunk.example, 'expression')) {
                              const fav = favorites.find((f) => f.content === detailChunk.example && f.type === 'expression');
                              if (fav) removeFavorite(fav.id);
                            } else {
                              addFavorite({ type: 'expression', content: detailChunk.example, meaning: detailChunk.meaning, category: detailChunk.category });
                            }
                          }}
                          className={cn(
                            'rounded-lg size-7',
                            isFavorited(detailChunk.example, 'expression') ? 'text-rose-500' : 'text-muted-foreground/50 hover:text-rose-500',
                          )}
                        >
                          <Heart className={cn('size-4', isFavorited(detailChunk.example, 'expression') && 'fill-current')} />
                        </Button>
                      </div>
                      <p className="text-base font-medium text-foreground italic">
                        「{cleanText(detailChunk.example)}」
                      </p>
                    </div>

                    {/* AI 造句 section */}
                    <div className="p-5 rounded-2xl bg-violet-50/50 border border-violet-100">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Bot className="size-4 text-violet-500" />
                          <p className="text-[10px] font-black uppercase tracking-wider text-violet-500">AI 生成例句</p>
                          {aiSentences[detailChunk.id] && aiSentences[detailChunk.id].length > 0 && (
                            <Badge className="text-[8px] font-black rounded-full px-1.5 py-0 bg-gradient-to-r from-violet-500 to-purple-500 text-white border-0">
                              {aiSentences[detailChunk.id].length}
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleGenerateSentences(detailChunk)}
                          disabled={sentenceGenLoading === detailChunk.id}
                          className="rounded-xl border-dashed border-violet-300 text-violet-500 hover:bg-violet-100 text-[10px] font-black uppercase tracking-wider"
                        >
                          {sentenceGenLoading === detailChunk.id ? (
                            <Loader2 className="size-3.5 mr-1 animate-spin" />
                          ) : (
                            <Wand2 className="size-3.5 mr-1" />
                          )}
                          AI 造句
                        </Button>
                      </div>
                      {aiSentences[detailChunk.id] && aiSentences[detailChunk.id].length > 0 && (
                        <div className="space-y-2 max-h-[280px] overflow-y-auto">
                          {aiSentences[detailChunk.id].map((item, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2 p-3 rounded-xl bg-white/60 border border-violet-100 group"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground/80 italic">「{item.en}」</p>
                                <p className="text-xs text-muted-foreground mt-1">{item.zh}</p>
                              </div>
                              <button
                                onClick={() => tts.speak(item.en, { rate: 0.9 })}
                                className="shrink-0 p-0.5 rounded-lg text-muted-foreground/50 hover:text-[#00B894] hover:bg-emerald-50 opacity-0 group-hover:opacity-100 transition-all"
                                title="朗读"
                              >
                                <Volume2 className="size-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const faved = isFavorited(item.en, 'expression');
                                  if (faved) {
                                    const fav = favorites.find((f) => f.content === item.en && f.type === 'expression');
                                    if (fav) removeFavorite(fav.id);
                                  } else {
                                    addFavorite({ type: 'expression', content: item.en, meaning: item.zh, category: detailChunk.category });
                                  }
                                }}
                                className={cn(
                                  'shrink-0 p-0.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all',
                                  isFavorited(item.en, 'expression') ? 'text-rose-500' : 'text-muted-foreground/50 hover:text-rose-500 hover:bg-rose-50',
                                )}
                                title="收藏"
                              >
                                <Heart className={cn('size-3.5', isFavorited(item.en, 'expression') && 'fill-current')} />
                              </button>
                              <button
                                onClick={() => handleDeleteSentence(detailChunk.id, idx)}
                                className="shrink-0 p-0.5 rounded-lg text-muted-foreground/50 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all"
                                title="删除此例句"
                              >
                                <X className="size-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        className="rounded-2xl flex-1 text-[10px] font-black uppercase tracking-wider border-border hover:border-[#00B894] hover:text-[#00B894]"
                        onClick={() => tts.speak(detailChunk.example, { rate: 0.9 })}
                      >
                        <BookOpen className="size-4 mr-2" />
                        朗读例句
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-2xl flex-1 text-[10px] font-black uppercase tracking-wider border-border"
                        onClick={() => toggleMemorized(detailChunk.id)}
                        title={memorizedChunks.has(detailChunk.id) ? '取消记忆' : '标记为已记'}
                      >
                        <Brain
                          className={cn(
                            'size-4 mr-2',
                            memorizedChunks.has(detailChunk.id) && 'fill-[#00B894]/20 text-[#00B894]',
                          )}
                        />
                        {memorizedChunks.has(detailChunk.id) ? '已记忆' : '记忆'}
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-2xl flex-1 text-[10px] font-black uppercase tracking-wider border-border hover:border-[#00B894] hover:text-[#00B894]"
                        onClick={() => {
                          toggleFavorite(detailChunk);
                        }}
                      >
                        <Heart
                          className={cn(
                            'size-4 mr-2',
                            isFavorited(detailChunk.content, 'chunk') && 'fill-current text-rose-500',
                          )}
                        />
                        {isFavorited(detailChunk.content, 'chunk') ? '已收藏' : '收藏'}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* 替换练习 */}
        <TabsContent value="replace" className="space-y-6 mt-6">
          <Card className="rounded-[40px] border-border shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-500 flex items-center justify-center">
                    <CheckCircle2 className="size-5.5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-[900] italic text-foreground">
                      语块替换练习
                    </CardTitle>
                    <CardDescription className="text-sm font-medium mt-1">
                      选择最地道的语块替换句子中的生硬表达
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      得分
                    </p>
                    <p className="text-xl font-black italic text-[#00B894] tabular-nums">
                      {score}/{answeredCount}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateReplacements}
                    disabled={replaceGenLoading}
                    className="gap-1.5 rounded-2xl text-[10px] font-black uppercase tracking-wider border-violet-300 text-violet-500 hover:bg-violet-50"
                  >
                    {replaceGenLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                    AI 出新题
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={nextQuestion}
                    className="gap-1.5 rounded-2xl text-[10px] font-black uppercase tracking-wider border-border hover:border-[#00B894] hover:text-[#00B894]"
                  >
                    <RefreshCw className="size-3.5" />
                    下一题
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 进度条 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#00B894] to-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${((currentQIdx + 1) / replacementExercises.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-black text-muted-foreground tabular-nums">
                  {currentQIdx + 1}/{replacementExercises.length}
                </span>
              </div>

              {/* 题目 */}
              <div className="p-6 rounded-[32px] bg-muted/30 border border-border/50">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-3">
                  题目
                </p>
                <p className="text-lg font-medium text-foreground leading-relaxed">
                  {currentQuestion.sentence}
                </p>
              </div>

              {/* 选项 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentQuestion.options.map((option) => {
                  const isCorrect = option === currentQuestion.correctChunk;
                  const isSelected = option === selectedOption;
                  const showCorrect = showAnswer && isCorrect;
                  const showWrong = showAnswer && isSelected && !isCorrect;

                  return (
                    <button
                      key={option}
                      onClick={() => handleOptionSelect(option)}
                      disabled={showAnswer}
                      className={cn(
                        'p-5 rounded-2xl border-2 text-left transition-all duration-200',
                        showCorrect
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700'
                          : showWrong
                            ? 'border-rose-400 bg-rose-50 text-rose-700'
                            : isSelected
                              ? 'border-[#00B894] bg-[#00B894]/5 text-[#00B894]'
                              : 'border-border bg-card hover:border-[#00B894]/40 hover:bg-muted/30 text-foreground',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'size-6 rounded-full flex items-center justify-center shrink-0',
                            showCorrect
                              ? 'bg-emerald-500 text-white'
                              : showWrong
                                ? 'bg-rose-500 text-white'
                                : isSelected
                                  ? 'bg-[#00B894] text-white'
                                  : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {showCorrect ? (
                            <CheckCircle2 className="size-4" />
                          ) : showWrong ? (
                            <XCircle className="size-4" />
                          ) : (
                            <span className="text-[10px] font-black"></span>
                          )}
                        </div>
                        <span className="font-bold text-sm">{option}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 答案解析 */}
              {showAnswer && (
                <Card className="rounded-[28px] border-emerald-200/50 dark:border-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-500/10">
                  <CardContent className="p-5 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Lightbulb className="size-4.5 text-emerald-600" />
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-600">
                        答案解析
                      </span>
                    </div>
                    <p className="text-base font-black text-foreground">
                      正确答案：{currentQuestion.correctChunk}
                    </p>
                    <p className="text-sm text-muted-foreground font-medium">
                      {currentQuestion.meaning}
                    </p>
                    <p className="text-sm text-foreground/80 italic">
                      例句：{cleanText(currentQuestion.example)}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* AI 反馈 */}
              {showAnswer && (feedbackLoading || replacementFeedback) && (
                <Card className="rounded-[28px] border-violet-200/50 bg-violet-50/30">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Bot className="size-4 text-violet-500" />
                      <span className="text-xs font-black uppercase tracking-wider text-violet-500">
                        AI 讲解
                      </span>
                    </div>
                    {feedbackLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        AI 分析中...
                      </div>
                    ) : (
                      <p className="text-sm text-foreground/80 leading-relaxed">{replacementFeedback}</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* 操作按钮 */}
              <div className="flex justify-center gap-3">
                {!showAnswer ? (
                  <Button
                    onClick={checkAnswer}
                    disabled={!selectedOption}
                    className="bg-[#00B894] hover:bg-[#00A080] text-white px-10 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30"
                  >
                    确认答案
                    <ArrowRight className="size-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    onClick={nextQuestion}
                    className="bg-[#00B894] hover:bg-[#00A080] text-white px-10 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30"
                  >
                    下一题
                    <ArrowRight className="size-4 ml-2" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 接龙游戏 */}
        <TabsContent value="chain" className="space-y-6 mt-6">
          <Card className="rounded-[40px] border-border shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-200/50 dark:shadow-orange-900/30">
                    <Trophy className="size-5.5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-[900] italic text-foreground">
                      语块接龙游戏
                    </CardTitle>
                    <CardDescription className="text-sm font-medium mt-1">
                      用给定语块造一个完整句子，挑战你的语块运用能力
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateChainChallenge}
                    disabled={chainGenLoading}
                    className="gap-1.5 rounded-2xl text-[10px] font-black uppercase tracking-wider border-violet-300 text-violet-500 hover:bg-violet-50"
                  >
                    {chainGenLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                    AI 出新题
                  </Button>
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10 border border-orange-100 rounded-2xl px-5 py-3 text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">
                      当前得分
                    </p>
                    <p className="text-2xl font-black italic text-orange-500 tabular-nums">
                      {chainScore}
                    </p>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 当前语块 */}
              <div className="p-8 rounded-[32px] bg-gradient-to-br from-[#00B894]/10 via-emerald-50 dark:via-emerald-500/10 to-transparent border border-[#00B894]/10 text-center relative overflow-hidden">
                <div className="absolute top-4 right-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {aiChainChallenge ? (
                    <Badge className="text-[8px] font-black rounded-full px-1.5 py-0 bg-gradient-to-r from-violet-500 to-purple-500 text-white border-0">AI</Badge>
                  ) : (
                    `第 ${currentChainIdx + 1} 个`
                  )}
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#00B894] mb-3">
                  请使用这个语块造句
                </p>
                <div className="flex items-center justify-center gap-2 mb-3">
                  <p className="text-3xl font-black italic text-foreground tracking-tight">
                    {aiChainChallenge ? aiChainChallenge.chunk : chainChunks[currentChainIdx].content}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => tts.speak(aiChainChallenge ? aiChainChallenge.chunk : chainChunks[currentChainIdx].content)}
                    className="rounded-xl size-8 text-muted-foreground hover:text-[#00B894] shrink-0"
                  >
                    <Volume2 className="size-4.5" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground font-medium">
                  {aiChainChallenge ? aiChainChallenge.meaning : chainChunks[currentChainIdx].meaning}
                </p>
                {aiChainChallenge?.scenario && (
                  <div className="mt-3 p-3 rounded-2xl bg-violet-50/50 border border-violet-100 text-left">
                    <p className="text-[10px] font-black uppercase tracking-wider text-violet-500 mb-1">📋 场景</p>
                    <p className="text-sm text-foreground/80 font-medium">{aiChainChallenge.scenario}</p>
                  </div>
                )}
              </div>

              {/* 输入 */}
              <form onSubmit={handleChainSubmit} className="space-y-4">
                <Input
                  value={chainInput}
                  onChange={(e) => setChainInput(e.target.value)}
                  placeholder="输入包含上述语块的完整句子..."
                  className="py-6 px-5 rounded-3xl border-border bg-muted/30 text-base focus-visible:ring-2 focus-visible:ring-emerald-200"
                />
                {chainFeedback && (
                  <div
                    className={cn(
                      'p-5 rounded-2xl border',
                      chainFeedback.correct
                        ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 border-emerald-200'
                        : 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 border-orange-200 dark:border-orange-500/20',
                    )}
                  >
                    <p className="text-sm font-bold mb-2 flex items-center gap-2">
                      {chainFeedback.correct ? (
                        <CheckCircle2 className="size-4" />
                      ) : (
                        <Lightbulb className="size-4" />
                      )}
                      {chainFeedback.message}
                    </p>
                    {chainFeedback.detail && (
                      <div className="text-xs leading-relaxed opacity-90 pt-2 border-t border-current/20">
                        {chainFeedback.detail.slice(0, 300)}
                        {chainFeedback.detail.length > 300 && '...'}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex justify-center">
                  <Button
                    type="submit"
                    disabled={!chainInput.trim() || chainLoading || chainFeedback?.correct}
                    className="bg-[#00B894] hover:bg-[#00A080] text-white px-10 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30"
                  >
                    {chainLoading ? (
                      <>
                        <Loader2 className="size-4 mr-2 animate-spin" />
                        AI 校验中...
                      </>
                    ) : (
                      <>
                        提交句子
                        <ArrowRight className="size-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 短语库 */}
        <TabsContent value="phrases" className="space-y-6 mt-6">
          <Card className="rounded-[40px] border-border shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-2xl bg-sky-50 dark:bg-sky-500/15 text-sky-500 flex items-center justify-center">
                    <BookOpen className="size-5.5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-[900] italic text-foreground">短语库</CardTitle>
                    <CardDescription className="text-sm font-medium mt-1">
                      共 {allChunks.length} 个短语 · 按字母排列
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground/50">点击短语即可朗读</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGeneratePhrases}
                    disabled={phraseGenLoading}
                    className="rounded-2xl text-[10px] font-black uppercase tracking-wider border-sky-300 text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-500/15 gap-1.5"
                  >
                    {phraseGenLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                    AI 生成短语
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-12 gap-4" style={{ height: '520px' }}>
                {/* Left: Phrase list with meanings */}
                <div className="col-span-12 lg:col-span-5 flex flex-col min-h-0">
                  <div className="flex flex-wrap gap-0.5 mb-2 shrink-0">
                    {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => {
                      const has = sortedChunks.some((c) => c.content[0]?.toUpperCase() === letter);
                      return (
                        <button
                          key={letter}
                          onClick={() => {
                            const el = document.getElementById(`phrase-l-${letter}`);
                            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }}
                          disabled={!has}
                          className={cn(
                            'w-6 h-5 rounded text-[9px] font-black transition-all',
                            has ? 'bg-muted text-foreground hover:bg-[#00B894] hover:text-white' : 'text-muted-foreground/25 cursor-default',
                          )}
                        >
                          {letter}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => {
                      const chunks = sortedChunks.filter((c) => c.content[0]?.toUpperCase() === letter);
                      if (chunks.length === 0) return null;
                      return (
                        <div key={letter} id={`phrase-l-${letter}`}>
                          <div className="text-[10px] font-black text-[#00B894] mb-1 sticky top-0 bg-background/90 py-0.5">{letter} · {chunks.length}</div>
                          {chunks.map((chunk) => {
                            const exCount = (phraseExamples[chunk.id]?.length || 0) + 1;
                            return (
                              <button
                                key={chunk.id}
                                onClick={() => setSelectedPhrase(chunk)}
                                className={cn(
                                  'w-full text-left px-3 py-2.5 rounded-xl transition-all mb-1',
                                  selectedPhrase?.id === chunk.id
                                    ? 'bg-[#00B894]/10 border border-[#00B894]/30'
                                    : 'bg-muted/20 hover:bg-muted/50 border border-transparent',
                                )}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-black text-foreground truncate flex-1">{chunk.content}</span>
                                  <span className="text-[9px] font-bold text-muted-foreground shrink-0">{exCount}例</span>
                                  <Badge variant="secondary" className="shrink-0 text-[8px] font-black rounded-full px-1 py-0 bg-muted">{getDifficultyAbbr(chunk.difficulty)}</Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{chunk.meaning}</p>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Phrase detail */}
                <div className="col-span-12 lg:col-span-7 lg:border-l lg:border-border lg:pl-4 flex flex-col min-h-0">
                  {selectedPhrase ? (
                    <div className="flex-1 flex flex-col min-h-0">
                      {/* Phrase header */}
                      <div className="flex items-center justify-between mb-4 shrink-0">
                        <div>
                          <h3 className="text-2xl font-black italic text-foreground">{selectedPhrase.content}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className="text-[9px] font-black uppercase rounded-full px-2 py-0.5 bg-sky-100 dark:bg-sky-500/15 text-sky-600 border-none">
                              {CATEGORY_LABELS[selectedPhrase.category] || selectedPhrase.category}
                            </Badge>
                            <Badge variant="secondary" className="text-[9px] font-black uppercase rounded-full px-2 py-0.5 bg-muted">
                              {getDifficultyLabel(selectedPhrase.difficulty)}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => tts.speak(selectedPhrase.content)} className="rounded-xl size-9 text-muted-foreground hover:text-[#00B894]">
                            <Volume2 className="size-5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => toggleFavorite(selectedPhrase)}
                            className={cn('rounded-xl size-9', isFavorited(selectedPhrase.content, 'chunk') ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500')}
                          >
                            <Heart className={cn('size-5', isFavorited(selectedPhrase.content, 'chunk') && 'fill-current')} />
                          </Button>
                        </div>
                      </div>

                      {/* Meaning & Usage */}
                      <div className="space-y-3 mb-4 shrink-0">
                        <div className="p-4 rounded-2xl bg-muted/30">
                          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">释义</p>
                          <p className="text-base font-bold text-foreground">{selectedPhrase.meaning}</p>
                        </div>
                        {selectedPhrase.introduction && (
                          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50/50 to-teal-50/50 dark:from-emerald-500/8 dark:to-teal-500/8 border border-[#00B894]/10">
                            <p className="text-[10px] font-black uppercase tracking-wider text-[#00B894] mb-1">English Introduction</p>
                            <p className="text-sm text-foreground/80 leading-relaxed italic">{selectedPhrase.introduction}</p>
                          </div>
                        )}
                        <div className="p-3 rounded-2xl bg-muted/20">
                          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">使用说明</p>
                          <p className="text-sm text-foreground/80">{selectedPhrase.usage}</p>
                        </div>
                      </div>

                      {/* Examples with translations */}
                      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                        <div className="flex items-center justify-between sticky top-0 bg-background/90 py-1 z-10">
                          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                            例句 · {(phraseExamples[selectedPhrase.id]?.length || 0) + 1} 条
                          </p>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => handleGeneratePhraseExamples(selectedPhrase)}
                            className="rounded-xl text-[10px] font-bold text-violet-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/15 gap-1 h-7"
                          >
                            <Wand2 className="size-3" />
                            AI 生成更多
                          </Button>
                        </div>
                        {/* Built-in example */}
                        <div className="p-4 rounded-2xl bg-[#00B894]/5 dark:bg-[#00B894]/10 border border-[#00B894]/10">
                          <p className="text-xs font-black uppercase tracking-wider text-[#00B894] mb-1.5">内置例句</p>
                          <p className="text-sm text-foreground italic leading-relaxed">「{cleanText(selectedPhrase.example)}」</p>
                          {(selectedPhrase.exampleZh || exampleTranslations[selectedPhrase.id]) ? (
                            <p className="text-xs text-muted-foreground mt-1.5 font-medium">
                              {selectedPhrase.exampleZh || exampleTranslations[selectedPhrase.id]}
                            </p>
                          ) : (
                            <button
                              onClick={() => handleTranslateExample(selectedPhrase)}
                              disabled={exampleTransLoading === selectedPhrase.id}
                              className="text-xs text-violet-500 hover:text-violet-600 font-medium mt-1.5 transition-colors"
                            >
                              {exampleTransLoading === selectedPhrase.id ? '翻译中...' : '翻译例句'}
                            </button>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <Button variant="ghost" size="icon" onClick={() => tts.speak(selectedPhrase.example, { rate: 0.9 })} className="rounded-lg size-6 text-muted-foreground hover:text-[#00B894]">
                              <Volume2 className="size-3" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              onClick={() => {
                                if (isFavorited(selectedPhrase.example, 'expression')) {
                                  const fav = favorites.find((f) => f.content === selectedPhrase.example && f.type === 'expression');
                                  if (fav) removeFavorite(fav.id);
                                } else {
                                  addFavorite({ type: 'expression', content: selectedPhrase.example, meaning: selectedPhrase.meaning, category: selectedPhrase.category });
                                }
                              }}
                              className={cn('rounded-lg size-6', isFavorited(selectedPhrase.example, 'expression') ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500')}
                            >
                              <Heart className={cn('size-3', isFavorited(selectedPhrase.example, 'expression') && 'fill-current')} />
                            </Button>
                          </div>
                        </div>
                        {/* AI-generated examples */}
                        {(phraseExamples[selectedPhrase.id] || []).map((ex, i) => (
                          <div key={i} className="p-4 rounded-2xl bg-violet-50/30 dark:bg-violet-500/5 border border-violet-100 dark:border-violet-500/10 group/ex">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-[9px] font-black uppercase tracking-wider text-violet-500">AI 例句 {i + 1}</p>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" onClick={() => tts.speak(ex.en, { rate: 0.9 })} className="rounded-lg size-5 text-muted-foreground hover:text-violet-500 opacity-0 group-hover/ex:opacity-100 transition-opacity">
                                  <Volume2 className="size-2.5" />
                                </Button>
                                <Button
                                  variant="ghost" size="icon"
                                  onClick={() => {
                                    if (isFavorited(ex.en, 'expression')) {
                                      const fav = favorites.find((f) => f.content === ex.en && f.type === 'expression');
                                      if (fav) removeFavorite(fav.id);
                                    } else {
                                      addFavorite({ type: 'expression', content: ex.en, meaning: ex.zh, category: selectedPhrase.category });
                                    }
                                  }}
                                  className={cn('rounded-lg size-5', isFavorited(ex.en, 'expression') ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500 opacity-0 group-hover/ex:opacity-100 transition-opacity')}
                                >
                                  <Heart className={cn('size-2.5', isFavorited(ex.en, 'expression') && 'fill-current')} />
                                </Button>
                              </div>
                            </div>
                            <p className="text-sm text-foreground italic leading-relaxed">「{cleanText(ex.en)}」</p>
                            <p className="text-xs text-muted-foreground mt-1.5 pl-2 border-l-2 border-violet-300 dark:border-violet-500/30">{ex.zh}</p>
                          </div>
                        ))}
                        {(phraseExamples[selectedPhrase.id] || []).length === 0 && (
                          <div className="text-center py-6 text-muted-foreground">
                            <p className="text-xs">点击"AI 生成更多"为这个短语创建更多例句</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <BookOpen className="size-12 mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-medium">选择一个短语查看详情</p>
                        <p className="text-xs mt-1">左侧列表中选择短语，这里会显示释义、使用说明和例句</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 短语复习 */}
        <TabsContent value="review" className="space-y-6 mt-6">
          {/* Stats overview */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="rounded-[28px] border-border shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-black text-rose-500">{phraseStats.dueNow}</p>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">待复习</p>
              </CardContent>
            </Card>
            <Card className="rounded-[28px] border-border shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-black text-sky-500">{phraseStats.learning}</p>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">学习中</p>
              </CardContent>
            </Card>
            <Card className="rounded-[28px] border-border shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-black text-[#00B894]">{phraseStats.mastered}</p>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">已掌握</p>
              </CardContent>
            </Card>
            <Card className="rounded-[28px] border-border shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-black text-foreground">{phraseStats.total}</p>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">总短语</p>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-[40px] border-border shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-2xl bg-rose-50 dark:bg-rose-500/15 text-rose-500 flex items-center justify-center">
                    <RotateCw className="size-5.5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-[900] italic text-foreground">短语复习</CardTitle>
                    <CardDescription className="text-sm font-medium mt-1">
                      闪卡模式 · SM-2记忆算法 · 今日待复习 {phraseStats.dueNow} 个 · 日配额 {phraseQuota} 词
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {reviewQueue.length > 0 && reviewIdx < reviewQueue.length && (
                    <Badge className="rounded-full px-3 py-1 text-[10px] font-black bg-muted text-foreground">
                      {reviewIdx + 1}/{reviewQueue.length}
                    </Badge>
                  )}
                  {/* TTS mode toggle */}
                  <div className="flex items-center gap-0.5 bg-muted rounded-xl p-0.5">
                    {([
                      { key: 'chunk' as const, label: '朗读语块' },
                      { key: 'example' as const, label: '朗读例句' },
                    ]).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setReviewTtsMode(key)}
                        className={cn(
                          'px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all',
                          reviewTtsMode === key
                            ? 'bg-white dark:bg-card text-[#00B894] shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >{label}</button>
                    ))}
                  </div>
                  <Button onClick={() => startMemorizedReview()} variant="outline" size="sm" className="rounded-2xl text-[10px] font-black uppercase tracking-wider gap-1.5 border-[#00B894]/30 text-[#00B894] hover:bg-[#00B894]/10">
                    <Brain className="size-3.5" />已记 ({memorizedChunks.size})
                  </Button>
                  <Button onClick={() => startReview(20)} variant="outline" size="sm" className="rounded-2xl text-[10px] font-black uppercase tracking-wider gap-1.5">
                    <Shuffle className="size-3.5" />开始复习
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {reviewQueue.length === 0 ? (
                <div className="text-center py-16">
                  <div className="size-20 rounded-3xl bg-muted mx-auto mb-4 flex items-center justify-center">
                    <RotateCw className="size-9 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-black text-foreground mb-2">准备开始复习</h3>
                  <p className="text-sm text-muted-foreground font-medium mb-6">从 {allChunks.length} 个短语中随机抽取 20 个进行闪卡复习</p>
                  <div className="flex justify-center gap-3 flex-wrap">
                    <Button onClick={() => startReview(10)} variant="outline" size="sm" className="rounded-2xl text-xs font-bold">10 个</Button>
                    <Button onClick={() => startReview(20)} size="sm" className="rounded-2xl text-xs font-bold bg-[#00B894] hover:bg-[#00A080] text-white">20 个</Button>
                    <Button onClick={() => startReview(allChunks.length)} variant="outline" size="sm" className="rounded-2xl text-xs font-bold">全部 ({allChunks.length})</Button>
                    {memorizedChunks.size > 0 && (
                      <Button onClick={() => startMemorizedReview()} size="sm" className="rounded-2xl text-xs font-bold bg-[#00B894]/10 text-[#00B894] hover:bg-[#00B894]/20 border border-[#00B894]/30 gap-1.5">
                        <Brain className="size-3.5" />复习已记 ({memorizedChunks.size})
                      </Button>
                    )}
                  </div>
                </div>
              ) : reviewIdx >= reviewQueue.length ? (
                <div className="text-center py-8">
                  <div className="size-20 rounded-3xl bg-emerald-50 dark:bg-emerald-500/15 mx-auto mb-4 flex items-center justify-center">
                    <CheckCircle2 className="size-9 text-[#00B894]" />
                  </div>
                  <h3 className="text-xl font-black text-foreground mb-2">复习完成！</h3>
                  <p className="text-sm text-muted-foreground font-medium mb-1">
                    本轮 {reviewKnown}/{reviewTotal} 掌握
                    {reviewTotal > 0 && (
                      <span className="ml-1">· 正确率 {Math.round((reviewKnown / reviewTotal) * 100)}%</span>
                    )}
                  </p>
                  {reviewQuality.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mb-3">
                      平均评分: {(reviewQuality.reduce((a, b) => a + b, 0) / reviewQuality.length).toFixed(1)} / 5
                    </p>
                  )}
                  {/* Reviewed phrases summary */}
                  <div className="max-w-sm mx-auto mt-4 space-y-1.5 max-h-[200px] overflow-y-auto">
                    {reviewQueue.map((phrase, i) => {
                      const q = reviewQuality[i] ?? 0;
                      const label = q >= 5 ? '完美' : q >= 4 ? '掌握' : q >= 3 ? '勉强' : q >= 2 ? '模糊' : '忘了';
                      const color = q >= 5 ? 'text-emerald-500' : q >= 4 ? 'text-emerald-500' : q >= 3 ? 'text-amber-500' : q >= 2 ? 'text-orange-500' : 'text-rose-500';
                      return (
                        <div key={phrase.content} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/20 text-left">
                          <span className={cn('text-[10px] font-black', color)}>
                            {q}分
                          </span>
                          <span className="text-sm font-bold text-foreground flex-1">{phrase.content}</span>
                          <span className="text-[10px] text-muted-foreground">{phrase.meaning}</span>
                          <span className={cn('text-[10px] font-bold', color)}>{label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 justify-center mt-4">
                    <Button onClick={() => startReview(20)} variant="outline" size="sm" className="rounded-2xl text-xs font-bold gap-1.5"><Shuffle className="size-3.5" />再来一轮</Button>
                    <Button onClick={resetPhraseProgress} variant="outline" size="sm" className="rounded-2xl text-[10px] font-bold text-muted-foreground hover:text-rose-500 gap-1.5"><RotateCw className="size-3.5" />重置进度</Button>
                  </div>
                </div>
              ) : (
                <div className="max-w-md mx-auto">
                  {/* Progress bar */}
                  <div className="h-1.5 bg-muted rounded-full mb-6">
                    <div className="h-full bg-[#00B894] rounded-full transition-all" style={{ width: `${((reviewIdx + 1) / reviewQueue.length) * 100}%` }} />
                  </div>
                  {/* Flashcard */}
                  <div
                    onClick={() => setReviewFlipped(!reviewFlipped)}
                    className={cn(
                      'rounded-[32px] border-2 shadow-lg min-h-[260px] flex flex-col items-center justify-center p-8 cursor-pointer transition-all',
                      reviewFlipped ? 'border-rose-200 bg-rose-50/50 dark:bg-rose-500/10' : 'border-border bg-card',
                    )}
                  >
                    {!reviewFlipped ? (
                      <>
                        <Badge className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-muted text-muted-foreground mb-6">点击翻转</Badge>
                        <h2 className="text-4xl font-black italic text-foreground tracking-tight text-center">{reviewQueue[reviewIdx].content}</h2>
                        <div className="flex items-center gap-2 mt-4">
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); tts.speak(reviewQueue[reviewIdx].content); }} className="rounded-xl size-9 text-muted-foreground hover:text-[#00B894]">
                            <Volume2 className="size-5" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <Badge className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-rose-100 dark:bg-rose-500/20 text-rose-500 mb-6">释义</Badge>
                        <p className="text-2xl font-black text-foreground text-center mb-3">{reviewQueue[reviewIdx].meaning}</p>
                        <p className="text-sm text-muted-foreground text-center mb-4">{reviewQueue[reviewIdx].usage}</p>
                        <div className="p-3 rounded-2xl bg-muted/30 max-w-full">
                          <p className="text-sm text-foreground/80 italic text-center">「{cleanText(reviewQueue[reviewIdx].example)}」</p>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); tts.speak(reviewQueue[reviewIdx].example, { rate: 0.9 }); }} className="rounded-lg size-6 text-muted-foreground hover:text-[#00B894] mx-auto mt-1">
                            <Volume2 className="size-3" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                  {/* Navigation */}
                  <div className="flex items-center justify-between mt-6 mb-3">
                    <Button
                      variant="ghost" size="sm"
                      disabled={reviewIdx === 0}
                      onClick={() => { setReviewIdx((p) => p - 1); setReviewFlipped(false); }}
                      className="rounded-2xl text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-[#00B894]"
                    >
                      ← 上一张
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => handleReviewMark(0)}
                      className="rounded-2xl text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-rose-500"
                    >
                      跳过 (0分) →
                    </Button>
                  </div>
                  {/* SM-2 Quality Rating Buttons */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground text-center">选择掌握程度</p>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        onClick={() => handleReviewMark(1)}
                        variant="outline" size="sm"
                        className="rounded-2xl text-[10px] font-bold border-rose-200 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/15"
                      >
                        1 · 完全忘了
                      </Button>
                      <Button
                        onClick={() => handleReviewMark(2)}
                        variant="outline" size="sm"
                        className="rounded-2xl text-[10px] font-bold border-orange-200 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/15"
                      >
                        2 · 很模糊
                      </Button>
                      <Button
                        onClick={() => handleReviewMark(3)}
                        variant="outline" size="sm"
                        className="rounded-2xl text-[10px] font-bold border-amber-200 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/15"
                      >
                        3 · 勉强想起
                      </Button>
                      <Button
                        onClick={() => handleReviewMark(4)}
                        variant="outline" size="sm"
                        className="rounded-2xl text-[10px] font-bold border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/15"
                      >
                        4 · 基本掌握
                      </Button>
                      <Button
                        onClick={() => handleReviewMark(5)}
                        size="sm"
                        className="rounded-2xl text-[10px] font-bold bg-[#00B894] hover:bg-[#00A080] text-white col-span-2"
                      >
                        5 · 完全掌握 ✓
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
