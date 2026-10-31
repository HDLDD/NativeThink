import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Mic,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Volume2,
  Gauge,
  CheckCircle2,
  Clock,
  BookOpen,
  Search,
  Heart,
  Bot,
  Wand2,
  Loader2,
  Square,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';

import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MOCK_SHADOWING_MATERIALS, type IShadowingMaterial, type IShadowingSentence } from '@/data/shadowing';
import { useLearningStats } from '@/lib/use-learning-stats';
import { useFavorites } from '@/lib/use-favorites';
import { useAI } from '@/hooks/use-ai';
import { safeStorage } from '@/lib/safe-storage';
import { persistJson, warnStorageFull, trimOldest } from '@/lib/capped-cache';
import { usePageMemory } from '@/lib/use-page-memory';
import { cn, extractJson } from '@/lib/utils';
import { useTTS } from '@/lib/use-tts';
import { scoreSpeech, type ISpeechScore } from '@/lib/speech-score';
import { speechPace } from '@/lib/asr';
import { analyzeBlob, type ISpeechAnalysis } from '@/lib/speech-analysis';
import { blobToWav16k } from '@/lib/wav';
import { transcribeRecording, hasAsrChannel, ASR_NOT_CONFIGURED } from '@/services/asr-service';
import {
  shadowingCompletionKey,
  countCompletedForCorpus,
  clearCompletionForCorpus,
  shiftCompletionAfterDelete,
  extrasLocalIndex,
} from '@/lib/shadowing-progress';
import { toast } from 'sonner';

const SHADOWING_CATEGORIES = [
  { value: 'daily', label: '日常对话' },
  { value: 'business', label: '商务职场' },
  { value: 'travel', label: '旅游出行' },
  { value: 'tech', label: '科技数码' },
  { value: 'speech', label: '演讲发言' },
  { value: 'story', label: '故事叙述' },
  { value: 'food', label: '美食烹饪' },
  { value: 'sports', label: '运动健身' },
  { value: 'health', label: '医疗健康' },
  { value: 'education', label: '教育学习' },
  { value: 'entertainment', label: '影视娱乐' },
  { value: 'news', label: '新闻时事' },
] as const;

const CATEGORY_LABEL_MAP: Record<string, string> = Object.fromEntries(
  SHADOWING_CATEGORIES.map((c) => [c.value, c.label]),
);

const MAX_RECORD_MS = 20_000;
const MAX_RECORD_BYTES = 8 * 1024 * 1024;

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}

export default function ShadowingPage() {
  const { addStudyMinutes } = useLearningStats();
  const { addFavorite, removeFavorite, isFavorited, favorites } = useFavorites();
  const { isConfigured, chat: aiChat } = useAI();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_SHADOWING_MATERIALS[0]?.id || null);
  const [currentSentenceIdx, setCurrentSentenceIdx] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  const [playbackRate, setPlaybackRate] = usePageMemory('shadowing-rate', 1);
  /** 已完成句子（键 = 语料id-句序）—— 持久化（此前切 tab/刷新即丢） */
  const COMPLETED_KEY = '__nativethink_shadowing_completed';
  /** 条数 + 字节双封顶：语料越多标记越多，而整份 JSON 每次变更都要重写，封顶才让写入成本有界 */
  const SHADOWING_COMPLETED_LIMIT = 2000;
  const SHADOWING_COMPLETED_MAX_BYTES = 64 * 1024;
  const [completedSentences, setCompletedSentences] = useState<Set<string>>(() => {
    try {
      const s = safeStorage.getItem(COMPLETED_KEY);
      return s ? new Set(JSON.parse(s) as string[]) : new Set();
    } catch { return new Set(); }
  });
  useEffect(() => {
    // 保留最新，从最旧的标记丢（丢的只是老材料的"已完成"进度）；写失败要可见
    if (!persistJson(COMPLETED_KEY, trimOldest([...completedSentences], SHADOWING_COMPLETED_LIMIT, SHADOWING_COMPLETED_MAX_BYTES))) {
      warnStorageFull();
    }
  }, [completedSentences]);

  // AI generation state
  const [customMaterials, setCustomMaterials] = useState<IShadowingMaterial[]>(() => {
    try {
      const saved = safeStorage.getItem('__nativethink_custom_shadowing');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Persist custom materials to localStorage
  useEffect(() => {
    // AI 生成的跟读材料不可重算：写失败要说出来，不能只表现为"刷新后材料没了"
    if (!persistJson('__nativethink_custom_shadowing', customMaterials)) warnStorageFull();
  }, [customMaterials]);

  // Navigate to a specific material via ?material=<title> query param
  useEffect(() => {
    const materialTitle = searchParams.get('material');
    if (!materialTitle) return;
    const all = [...customMaterials, ...MOCK_SHADOWING_MATERIALS];
    const match = all.find((m) => m.title === decodeURIComponent(materialTitle));
    if (match) {
      setSelectedId(match.id);
      setCurrentSentenceIdx(0);
    }
  }, [searchParams]);

  const [showGenDialog, setShowGenDialog] = useState(false);
  const [filterCategory, setFilterCategory] = usePageMemory('shadowing-filter', 'all');
  const [filterQuery, setFilterQuery] = usePageMemory('shadowing-search', '');
  const [filterProgress, setFilterProgress] = usePageMemory<'all' | 'unstarted' | 'active' | 'completed'>(
    'shadowing-progress-filter',
    'all',
  );
  const [visibleMaterialCount, setVisibleMaterialCount] = useState(12);
  const [genCategory, setGenCategory] = useState<string>('daily');
  const [genDifficulty, setGenDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');
  const [genTopic, setGenTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genValidation, setGenValidation] = useState<{ errors: string[]; warnings: string[] } | null>(null);

  // AI extra sentences state (keyed by material ID)
  const [extraSentences, setExtraSentences] = useState<Record<string, IShadowingSentence[]>>(() => {
    try {
      const saved = safeStorage.getItem('__nativethink_shadowing_extra');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [addingSentences, setAddingSentences] = useState<string | null>(null);

  useEffect(() => {
    if (!persistJson('__nativethink_shadowing_extra', extraSentences)) warnStorageFull();
  }, [extraSentences]);

  /**
   * 删除一句 AI 追加的话。
   * `mergedIdx` **必须是合并数组索引**（`allSentences` 里的下标 = 原句数 + 追加句序号），
   * 因为完成键就是按合并索引存的；extras 的本地索引由 `extrasLocalIndex` 在这里换算，
   * 两套索引不允许在调用方各算各的（历史缺陷见 `shadowing-progress.ts` 文件头）。
   */
  const handleDeleteSentence = (corpusId: string, mergedIdx: number) => {
    const baseLen = selectedCorpus && selectedCorpus.id === corpusId
      ? selectedCorpus.sentences.length
      : undefined;
    if (baseLen === undefined) return;
    const localIdx = extrasLocalIndex(mergedIdx, baseLen);
    if (localIdx < 0) return; // 内置原句不可删

    // ① 完成键按合并索引整体前移一位
    setCompletedSentences((prev) => shiftCompletionAfterDelete(prev, corpusId, mergedIdx));
    // ② extras 按本地索引过滤
    setExtraSentences((prev) => {
      const bucket = prev[corpusId];
      if (!bucket) return prev;
      const updated = { ...prev };
      updated[corpusId] = bucket.filter((_, i) => i !== localIdx);
      if (updated[corpusId].length === 0) delete updated[corpusId];
      return updated;
    });
    // ③ 当前指针跟着走：被删句之后的左移一格，正好删在当前句上则夹到新的末尾
    //    （否则"下一句"会跳过一句，或指针落到不存在的下标上）
    setCurrentSentenceIdx((prev) => (
      prev > mergedIdx ? prev - 1 : Math.min(prev, Math.max(0, totalSentences - 2))
    ));
    toast.success('已删除句子');
  };

  const handleAddSentences = async (corpus: IShadowingMaterial) => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    setAddingSentences(corpus.id);
    const catLabel = CATEGORY_LABEL_MAP[corpus.category] || corpus.category;
    const diffLabel = corpus.difficulty === 'beginner' ? '初级' : corpus.difficulty === 'intermediate' ? '中级' : '高级';
    try {
      const result = await aiChat(
        [
          {
            role: 'system',
            content: `You are an English shadowing coach. Generate 3-5 additional natural English sentences for an existing shadowing material. Return ONLY valid JSON array (no markdown):
[
  { "text": "English sentence", "annotatedText": "Same sentence with <u>word</u> tags around stressed syllables", "translation": "Natural Chinese translation" }
]
Match the topic and difficulty. Each sentence 5-20 words. Mark 1-2 stressed words with <u> tags.`,
          },
          {
            role: 'user',
            content: `Add 4 more sentences to this shadowing material:\nTitle: ${corpus.title}\nCategory: ${catLabel}\nDifficulty: ${diffLabel}\nExisting sentences: ${corpus.sentences.map(s => s.text).join(' | ')}`,
          },
        ],
        { temperature: 0.9, maxTokens: 1536 },
      );
      if (!result.trim()) { toast.error('AI 服务暂不可用，请稍后重试'); return; }
      const parsed = extractJson<any[]>(result);
      if (!Array.isArray(parsed) || parsed.length === 0) { toast.error('AI 未生成有效句子'); return; }
      const newSentences: IShadowingSentence[] = parsed.map((s: { text: string; annotatedText: string; translation: string }, i: number) => ({
        id: `ext_${Date.now()}_${i}`,
        text: s.text || '',
        annotatedText: s.annotatedText || s.text || '',
        translation: s.translation || '',
        duration: 3,
      })).filter((s: IShadowingSentence) => s.text.trim());
      if (newSentences.length === 0) { toast.error('AI 未生成有效句子'); return; }
      setExtraSentences((prev) => ({
        ...prev,
        [corpus.id]: [...(prev[corpus.id] || []), ...newSentences],
      }));
      toast.success(`已新增 ${newSentences.length} 句跟读语料！`);
    } catch { toast.error('AI 生成失败，请检查网络后重试'); }
    finally { setAddingSentences(null); }
  };

  // AI feedback state
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisKind, setAnalysisKind] = useState<'recording' | 'sentence' | null>(null);

  // Voice recording + ASR state
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [userTranscript, setUserTranscript] = useState('');
  const [recordingNote, setRecordingNote] = useState('');
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordingMs, setRecordingMs] = useState(0);
  const [speechScore, setSpeechScore] = useState<ISpeechScore | null>(null);
  const [localAnalysis, setLocalAnalysis] = useState<ISpeechAnalysis | null>(null);
  const [asrLabel, setAsrLabel] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordStartedAtRef = useRef(0);
  const recordTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordMaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordedUrlRef = useRef<string | null>(null);
  const recordRequestRef = useRef(0);
  const recordAbortRef = useRef<AbortController | null>(null);

  const allMaterials = [...customMaterials, ...MOCK_SHADOWING_MATERIALS];

  const isLoopingRef = useRef(false);
  const currentIdxRef = useRef(0);
  const selectedCorpusRef = useRef(allMaterials.find((c) => c.id === selectedId));

  // Keep refs in sync
  useEffect(() => { isLoopingRef.current = isLooping; }, [isLooping]);
  useEffect(() => { currentIdxRef.current = currentSentenceIdx; }, [currentSentenceIdx]);
  useEffect(() => {
    selectedCorpusRef.current = allMaterials.find((c) => c.id === selectedId);
  }, [selectedId, allMaterials]);
  const selectedCorpus = allMaterials.find((c) => c.id === selectedId);

  // Merge original sentences with extra AI sentences
  const allSentences = selectedCorpus
    ? [...selectedCorpus.sentences, ...(extraSentences[selectedCorpus.id] || [])]
    : [];
  const totalSentences = allSentences.length;
  // 只统计**当前语料**的完成数 —— 此前用全局 Set 的 size 除以当前语料句数，
  // 在 A 语料完成几句后切到 B，进度条直接虚高甚至超过 100%
  const totalCompleted = useMemo(
    () => (selectedCorpus ? countCompletedForCorpus(completedSentences, selectedCorpus.id) : 0),
    [completedSentences, selectedCorpus],
  );
  const progressPercent = totalSentences > 0 ? Math.min(100, (totalCompleted / totalSentences) * 100) : 0;

  /* ── 语料库列表：搜索 + 主题 + 跟读进度 + 12 条增量 ── */
  const materialRows = useMemo(() => [...customMaterials, ...MOCK_SHADOWING_MATERIALS].map((corpus) => {
    const total = corpus.sentences.length + (extraSentences[corpus.id]?.length ?? 0);
    const done = countCompletedForCorpus(completedSentences, corpus.id);
    return {
      corpus,
      done,
      total,
      started: done > 0,
      finished: total > 0 && done >= total,
    };
  }), [customMaterials, completedSentences, extraSentences]);
  const materialProgressFilter = (['all', 'unstarted', 'active', 'completed'] as const)
    .includes(filterProgress) ? filterProgress : 'all';
  const materialQuery = filterQuery.trim().toLowerCase();
  const materialCounts = {
    all: materialRows.length,
    unstarted: materialRows.filter((row) => !row.started).length,
    active: materialRows.filter((row) => row.started && !row.finished).length,
    completed: materialRows.filter((row) => row.finished).length,
  };
  const filteredMaterialRows = materialRows.filter((row) => {
    if (filterCategory !== 'all' && row.corpus.category !== filterCategory) return false;
    if (materialProgressFilter === 'unstarted' && row.started) return false;
    if (materialProgressFilter === 'active' && !(row.started && !row.finished)) return false;
    if (materialProgressFilter === 'completed' && !row.finished) return false;
    if (materialQuery) {
      const haystack = `${row.corpus.title} ${row.corpus.description} ${CATEGORY_LABEL_MAP[row.corpus.category] || ''}`.toLowerCase();
      if (!haystack.includes(materialQuery)) return false;
    }
    return true;
  });
  const visibleMaterialRows = filteredMaterialRows.slice(0, visibleMaterialCount);
  const remainingMaterials = filteredMaterialRows.length - visibleMaterialCount;

  useEffect(() => {
    setVisibleMaterialCount(12);
  }, [filterCategory, filterQuery, filterProgress]);

  const currentSentence = allSentences[currentSentenceIdx];
  /** 当前句的完成标记键 —— 按**合并索引**构造，与 markCompleted / 句行绿勾同源 */
  const currentDoneKey = selectedCorpus
    ? shadowingCompletionKey(selectedCorpus.id, currentSentenceIdx)
    : '';

  const skipAdvanceRef = useRef(false);
  const allSentencesRef = useRef(allSentences);
  allSentencesRef.current = allSentences;
  const rateRef = useRef(playbackRate);
  rateRef.current = playbackRate;
  /** 单句循环的重播入口 —— onEnd 闭包创建时 tts 还不存在，经 ref 桥接（advanceRef 同款模式） */
  const loopSpeakRef = useRef<() => void>(() => {});
  /** 「我读完了」的 400ms 自动前进定时器 —— 手动切句/切语料时必须取消 */
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingAdvance = useCallback(() => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  const clearRecordedAudio = useCallback(() => {
    if (recordedUrlRef.current) {
      URL.revokeObjectURL(recordedUrlRef.current);
      recordedUrlRef.current = null;
    }
    setRecordedUrl(null);
  }, []);

  /** 取消录音/转写：停采集、撤计时器、断请求（卸载、切句、切语料共用） */
  const cancelRecording = useCallback(() => {
    recordRequestRef.current++;
    recordAbortRef.current?.abort();
    recordAbortRef.current = null;
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null;
      rec.onerror = null;
      try { rec.stop(); } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null;
    recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    recordStreamRef.current = null;
    recordChunksRef.current = [];
    if (recordTickRef.current) { clearInterval(recordTickRef.current); recordTickRef.current = null; }
    if (recordMaxTimerRef.current) { clearTimeout(recordMaxTimerRef.current); recordMaxTimerRef.current = null; }
    setRecordingVoice(false);
    setTranscribing(false);
    setAnalyzing(false);
    setRecordingMs(0);
  }, []);

  // 卸载清理：停录音/转写与待执行的自动前进
  useEffect(() => {
    return () => {
      cancelRecording();
      clearRecordedAudio();
      cancelPendingAdvance();
    };
  }, [cancelRecording, clearRecordedAudio, cancelPendingAdvance]);

  // 换句/换语料：录音与评分属于当前句，不能跟到下一句
  useEffect(() => {
    cancelRecording();
    clearRecordedAudio();
    setUserTranscript('');
    setRecordingNote('');
    setSpeechScore(null);
    setLocalAnalysis(null);
    setAsrLabel('');
    setShowAnalysis(false);
    setAiAnalysis('');
    setAnalysisKind(null);
  }, [selectedCorpus?.id, currentSentenceIdx, cancelRecording, clearRecordedAudio]);

  // Shared TTS hook with auto-advance on sentence end
  const tts = useTTS({
    onEnd: () => {
      if (skipAdvanceRef.current) { skipAdvanceRef.current = false; return; }
      if (isLoopingRef.current) {
        // 单句循环：重新朗读当前句 —— 此前 onEnd 直接 return，"循环"实际只是播完停住
        loopSpeakRef.current();
        return;
      }
      const idx = currentIdxRef.current;
      if (idx < allSentencesRef.current.length - 1) {
        setCurrentSentenceIdx(idx + 1);
      }
    },
  });

  const isSpeakingRef = useRef(false);
  isSpeakingRef.current = tts.isSpeaking;

  // 单句循环重播：经 ref 桥接拿到最新的 tts 与语料
  loopSpeakRef.current = () => {
    const s = allSentencesRef.current[currentIdxRef.current];
    const corpus = selectedCorpusRef.current;
    if (s) {
      tts.speak(s.text, { lang: corpus?.accent === 'UK' ? 'en-GB' : 'en-US', rate: rateRef.current });
    }
  };

  // 预热当前与下一句 —— 跟读是逐句连续播放场景，离线引擎冷启动后首播延迟明显
  useEffect(() => {
    if (!currentSentence) return;
    const t1 = setTimeout(() => { try { tts.prewarm(currentSentence.text, { rate: playbackRate }); } catch { /* ignore */ } }, 80);
    const nxt = allSentences[currentSentenceIdx + 1];
    const t2 = nxt
      ? setTimeout(() => { try { tts.prewarm(nxt.text, { rate: playbackRate }); } catch { /* ignore */ } }, 240)
      : null;
    return () => { clearTimeout(t1); if (t2) clearTimeout(t2); };
    // 只跟句面/序/速率挂钩，避免 allSentences 引用每渲染变化反复触发
  }, [currentSentence?.text, currentSentenceIdx, playbackRate]);

  const togglePlay = useCallback(() => {
    if (isSpeakingRef.current) {
      tts.cancel();
    } else if (currentSentence) {
      tts.speak(currentSentence.text, {
        lang: selectedCorpus?.accent === 'UK' ? 'en-GB' : 'en-US',
        rate: playbackRate,
      });
      addStudyMinutes(1, 'shadowing');
    }
  }, [tts.cancel, tts.speak, currentSentence, selectedCorpus?.accent, playbackRate, addStudyMinutes]);

  const playCurrentSentence = useCallback(() => {
    if (currentSentence) {
      skipAdvanceRef.current = true;
      tts.speak(currentSentence.text, {
        lang: selectedCorpus?.accent === 'UK' ? 'en-GB' : 'en-US',
        rate: playbackRate,
      });
    }
  }, [currentSentence, selectedCorpus?.accent, playbackRate, tts.speak]);

  // Auto-speak when sentence index changes while in "playing" mode
  const [autoPlay, setAutoPlay] = usePageMemory('shadowing-autoplay', false);
  /**
   * 依赖数组按「句子身份 + 开关」触发，不是原先的 `[currentSentenceIdx]`：
   *  - 只用下标时，**换语料后下标相同 → 内容变了也不会重读**（用户看到新句子却没有声音，
   *    或反过来旧语料的朗读进度条停在不存在的句子上）；改依赖为 `currentSentence` 即可覆盖。
   *  - `playbackRate` / `accent` **刻意不进依赖**：它们是"下一句起生效"的参数 ——
   *    拖语速滑杆时若重新触发，每动一格就把当前句从头再读一遍，比原来更糟。
   *    `tts.speak` 是稳定引用（`use-tts.ts:827` 的 useCallback，deps 只有 ssCancel），
   *    带着它是为了满足 exhaustive-deps，不会引起额外触发。
   */
  useEffect(() => {
    if (autoPlay && currentSentence) {
      tts.speak(currentSentence.text, {
        lang: selectedCorpus?.accent === 'UK' ? 'en-GB' : 'en-US',
        rate: playbackRate,
      });
    }
  }, [autoPlay, currentSentence, tts.speak]);

  const prevSentence = useCallback(() => {
    tts.cancel();
    cancelPendingAdvance();
    setAutoPlay(false);
    if (currentSentenceIdx > 0) {
      setCurrentSentenceIdx(currentSentenceIdx - 1);
    }
  }, [currentSentenceIdx, tts.cancel, cancelPendingAdvance]);

  const nextSentence = useCallback(() => {
    tts.cancel();
    cancelPendingAdvance();
    setAutoPlay(false);
    if (currentSentenceIdx < allSentences.length - 1) {
      setCurrentSentenceIdx(currentSentenceIdx + 1);
    }
  }, [currentSentenceIdx, tts.cancel, allSentences.length, cancelPendingAdvance]);

  const toggleLoop = useCallback(() => {
    setIsLooping((prev) => !prev);
    toast.success(isLooping ? '已关闭单句循环' : '已开启单句循环');
  }, [isLooping]);

  const markCompleted = useCallback(() => {
    if (!selectedCorpus) return;
    const key = shadowingCompletionKey(selectedCorpus.id, currentSentenceIdx);
    setCompletedSentences((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    addStudyMinutes(0.5, 'shadowing');
    toast.success('这句已完成！');
    cancelPendingAdvance();
    if (currentSentenceIdx < allSentences.length - 1) {
      advanceTimerRef.current = setTimeout(() => {
        advanceTimerRef.current = null;
        setCurrentSentenceIdx((prev) => prev + 1);
        setAutoPlay(true);
      }, 400);
    }
  }, [selectedCorpus, currentSentenceIdx, addStudyMinutes, allSentences.length, cancelPendingAdvance]);

  const selectCorpus = useCallback((id: string) => {
    tts.cancel();
    cancelPendingAdvance();
    setAutoPlay(false);
    setSelectedId(id);
    setCurrentSentenceIdx(0);
  }, [tts.cancel, cancelPendingAdvance]);

  const validateMaterial = (material: { sentences: { text: string; annotatedText: string; translation: string }[] }): { errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];
    material.sentences.forEach((s, i) => {
      const n = i + 1;
      // Check for empty fields
      if (!s.text.trim()) errors.push(`第 ${n} 句英文文本为空`);
      if (!s.translation.trim()) errors.push(`第 ${n} 句中文翻译为空`);
      // Check for unbalanced HTML tags in annotatedText
      const openU = (s.annotatedText.match(/<u>/g) || []).length;
      const closeU = (s.annotatedText.match(/<\/u>/g) || []).length;
      if (openU !== closeU) errors.push(`第 ${n} 句 annotatedText 中 <u> 标签不匹配（${openU} 开，${closeU} 闭）`);
      // Check for stray markdown/code artifacts
      if (/```|`{1,2}[^`]+`{1,2}/.test(s.text)) errors.push(`第 ${n} 句包含 markdown 代码标记`);
      if (/\\[ntr]/.test(s.text)) warnings.push(`第 ${n} 句包含转义字符 \\n/\\t/\\r`);
      // Check for common AI hallucination patterns
      if (/[�]/.test(s.text) || /[�]/.test(s.translation)) errors.push(`第 ${n} 句包含乱码字符`);
      if (/https?:\/\//.test(s.text)) warnings.push(`第 ${n} 句包含 URL 链接`);
      if (/^(Note|Here|Sure|Let me|I hope|This is)/.test(s.text.trim())) warnings.push(`第 ${n} 句可能包含 AI 元文本："${s.text.slice(0, 40)}..."`);
      // Check translation exists but is too short
      if (s.translation.trim() && s.translation.trim().length < 2) errors.push(`第 ${n} 句中文翻译过短`);
      // Check English text has basic sentence structure
      if (s.text.trim() && !/[a-zA-Z]/.test(s.text)) errors.push(`第 ${n} 句英文文本不含英文字母`);
      // Check for broken HTML entities
      if (/&[a-z]{1,8};/.test(s.text) && !/&(amp|lt|gt|quot|apos);/.test(s.text)) warnings.push(`第 ${n} 句包含未知 HTML 实体`);
    });
    return { errors, warnings };
  };

  const handleDeleteMaterial = (id: string) => {
    setCustomMaterials((prev) => prev.filter((m) => m.id !== id));
    if (selectedId === id) {
      const remaining = customMaterials.filter((m) => m.id !== id);
      setSelectedId(remaining[0]?.id || MOCK_SHADOWING_MATERIALS[0]?.id || null);
      setCurrentSentenceIdx(0);
    }
    toast.success('已删除 AI 语料');
  };

  const handleGenerateMaterial = async () => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    setGenerating(true);
    try {
      const catLabel = CATEGORY_LABEL_MAP[genCategory] || genCategory;
      const diffLabel = genDifficulty === 'beginner' ? '初级' : genDifficulty === 'intermediate' ? '中级' : '高级';
      const result = await aiChat(
        [
          {
            role: 'system',
            content: `You are an English shadowing coach. Generate 6-8 natural English sentences for shadowing practice. Return ONLY valid JSON (no markdown, no code fences):

{
  "title": "A descriptive Chinese title for this material",
  "category": "${genCategory}",
  "difficulty": "${genDifficulty}",
  "accent": "US",
  "description": "One-line Chinese description",
  "sentences": [
    { "text": "English sentence", "annotatedText": "Same sentence with <u>word</u> tags around stressed syllables", "translation": "Natural Chinese translation" }
  ]
}

Make sentences realistic and conversational. Mark 1-2 stressed words per sentence with <u> tags in annotatedText. Each sentence should be 5-20 words.`,
          },
          {
            role: 'user',
            content: `Generate ${catLabel} shadowing material at ${diffLabel} level${genTopic ? `. Topic: ${genTopic}` : ''}. Make sentences practical for English learners.`,
          },
        ],
        { temperature: 0.9, maxTokens: 2048 },
      );

      if (!result.trim()) { toast.error('AI 服务暂不可用，请稍后重试'); return; }
      const parsed = extractJson<{ title?: string; category?: string; difficulty?: string; accent?: string; description?: string; sentences?: { text: string; annotatedText: string; translation: string }[] }>(result);
      const newMaterial: IShadowingMaterial = {
        id: `ai_${Date.now()}`,
        title: parsed.title || `AI 语料 - ${genTopic || catLabel}`,
        category: (parsed.category || genCategory) as IShadowingMaterial['category'],
        difficulty: (parsed.difficulty || genDifficulty) as IShadowingMaterial['difficulty'],
        accent: (parsed.accent || 'US') as IShadowingMaterial['accent'],
        totalDuration: (parsed.sentences || []).length * 3,
        description: parsed.description || `AI 生成的${catLabel}跟读语料`,
        sentences: (parsed.sentences || []).map((s: { text: string; annotatedText: string; translation: string }, i: number) => ({
          id: `ai_s_${Date.now()}_${i}`,
          text: s.text,
          annotatedText: s.annotatedText || s.text,
          translation: s.translation || '',
          duration: 3,
        })),
      };

      if (newMaterial.sentences.length === 0) { toast.error('AI 未生成有效句子，请重试'); return; }

      // Run validation
      const validation = validateMaterial(newMaterial);
      setGenValidation(validation);

      setCustomMaterials((prev) => [newMaterial, ...prev]);
      setSelectedId(newMaterial.id);
      setCurrentSentenceIdx(0);
      // 不清 completedSentences —— 完成记录按语料 id 键控，新语料天然从 0 开始，
      // 此前整表清空会把用户在其它语料的进度一并抹掉

      if (validation.errors.length > 0) {
        // Keep dialog open to show errors
        toast.error(`发现 ${validation.errors.length} 个问题，请检查`, { duration: 6000 });
      } else {
        setShowGenDialog(false);
        setGenTopic('');
        if (validation.warnings.length > 0) {
          toast.warning(`已生成 ${newMaterial.sentences.length} 句，有 ${validation.warnings.length} 个提醒`, { duration: 4000 });
        } else {
          toast.success(`AI 已生成 ${newMaterial.sentences.length} 句跟读语料！`);
        }
      }
    } catch {
      toast.error('AI 生成失败，请检查网络后重试');
    } finally {
      setGenerating(false);
    }
  };

  const handleAnalyzePronunciation = async () => {
    if (!currentSentence || !isConfigured) {
      if (!isConfigured) toast.error('请先配置 AI API Key');
      return;
    }
    setAnalyzing(true);
    setShowAnalysis(true);
    setAiAnalysis('');
    setAnalysisKind('sentence');
    try {
      const result = await aiChat(
        [
          {
            role: 'system',
            content: `You are an English pronunciation coach. Analyze the given English sentence for pronunciation challenges for Chinese learners. Provide ALL responses in BOTH English and Chinese (bilingual). For each section, show the **English version first**, followed by the **中文版本**. Format:

## 🔤 发音难点分析

### 连读 (Linking)
- Point out where words connect

### 弱读 (Reduction)
- Point out reduced sounds

### 重音 (Stress)
- Which words to stress and why

### 📝 跟读技巧
- 2-3 actionable shadowing tips for this specific sentence

Keep it concise and practical.`,
          },
          {
            role: 'user',
            content: `Analyze this sentence for pronunciation: "${currentSentence.text}"`,
          },
        ],
        { temperature: 0.3, maxTokens: 1024 },
      );
      // useAI 在失败/中止时返回空串并自己 toast（`use-ai.ts:82-86`），本页的 catch 永远不会触发。
      // 不判空就会把"分析中"直接切成**一片空白且没有任何提示** —— 空串必须先当作"服务不可用"。
      if (!result.trim()) {
        toast.error('AI 服务暂不可用，请稍后重试');
        setShowAnalysis(false);
        return;
      }
      setAiAnalysis(result);
    } catch {
      toast.error('AI 分析失败，请稍后重试');
      setShowAnalysis(false);
    } finally {
      setAnalyzing(false);
    }
  };

  /** 转写文本 → AI 反馈（AI 听不到原始音频，提示词和界面都按「基于转写」口径） */
  const analyzeTranscript = useCallback(async (transcript: string, signal: AbortSignal, reqId: number) => {
    if (!currentSentence) return;
    if (!isConfigured) {
      setRecordingNote('未配置对话 AI，只显示词级评分。');
      return;
    }
    setAnalyzing(true);
    try {
      const result = await aiChat(
        [
          {
            role: 'system',
            content: `You are an expert English pronunciation coach. Compare the original sentence with the user's shadowing attempt and give detailed feedback.

Important: the user's attempt is a **speech-to-text transcript**, not the raw audio. You cannot judge phoneme-level pronunciation from it; focus on word choice, omissions, word order, and rhythm/pace evidence visible in the text. Do not claim certainty about individual sounds.

Respond in this bilingual format (English first, then 中文):

## 🎯 准确度
Overall accuracy: X/10

## 📊 逐词对比
| Original | You said | Correct? |
|----------|----------|----------|
| word | spoken | ✅/❌ |

## 🗣 需要修正的地方
For each missing or different word, explain what likely happened and how to practise it:
- **word**: the likely issue and a concrete tip
- Focus on: word endings, contractions, linking, and stress

## 📝 语调和节奏
- What the transcript suggests about pacing
- Which words should be stressed

## ✅ 做得好的地方
- What the user got right, to encourage them

Be encouraging but precise. Focus on the most impactful improvements for a Chinese learner.`,
          },
          {
            role: 'user',
            content: `Original sentence: "${currentSentence.text}"\n\nUser's shadowing attempt (speech-to-text): "${transcript}"`,
          },
        ],
        { temperature: 0.3, maxTokens: 1536, signal },
      );
      if (signal.aborted || reqId !== recordRequestRef.current) return;
      if (!result.trim()) {
        setRecordingNote('AI 服务暂不可用，词级评分已保留');
        return;
      }
      setAiAnalysis(result);
    } catch {
      if (signal.aborted || reqId !== recordRequestRef.current) return;
      setRecordingNote('AI 分析失败，词级评分已保留');
    } finally {
      if (reqId === recordRequestRef.current) setAnalyzing(false);
    }
  }, [currentSentence, isConfigured, aiChat]);

  /** 录音结束：先留 Blob 供回听，再转写 + 词级评分；失败不假装有分 */
  const handleRecordingStop = useCallback(async (mimeType: string) => {
    const elapsed = recordStartedAtRef.current ? performance.now() - recordStartedAtRef.current : 0;
    if (recordTickRef.current) { clearInterval(recordTickRef.current); recordTickRef.current = null; }
    if (recordMaxTimerRef.current) { clearTimeout(recordMaxTimerRef.current); recordMaxTimerRef.current = null; }
    recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    recordStreamRef.current = null;
    mediaRecorderRef.current = null;
    setRecordingVoice(false);

    const blob = new Blob(recordChunksRef.current, { type: mimeType || 'audio/webm' });
    recordChunksRef.current = [];
    if (!blob.size) { setRecordingNote('没有录到声音，请再试一次'); return; }
    if (blob.size > MAX_RECORD_BYTES) { setRecordingNote('录音太大，请控制在 20 秒内'); return; }

    const url = URL.createObjectURL(blob);
    if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
    recordedUrlRef.current = url;
    setRecordedUrl(url);
    setRecordingMs(elapsed);
    setTranscribing(true);
    setShowAnalysis(true);
    setRecordingNote('');
    setUserTranscript('');
    setSpeechScore(null);
    setLocalAnalysis(null);
    setAsrLabel('');
    setAiAnalysis('');
    setAnalysisKind('recording');

    const reqId = ++recordRequestRef.current;
    recordAbortRef.current?.abort();
    const abort = new AbortController();
    recordAbortRef.current = abort;

    try {
      // GLM 不收 WebM/Opus：先转 16kHz 单声道 WAV；解码失败就退回原 Blob 让其它 provider 试
      const wav = await blobToWav16k(blob).catch(() => null);
      if (reqId !== recordRequestRef.current) return;
      const uploadBlob = wav?.blob ?? blob;
      if (uploadBlob.size > MAX_RECORD_BYTES) {
        setRecordingNote('录音太大，请控制在 20 秒内');
        return;
      }
      setRecordingMs(wav?.durationMs ?? elapsed);
      // 离线分析并行跑：ASR 失败/没 Key 时仍能给节奏、音量、停顿、音高
      void analyzeBlob(uploadBlob, { targetText: currentSentence?.text || '' })
        .then((local) => {
          if (reqId !== recordRequestRef.current) return;
          setLocalAnalysis(local);
          if (local) setRecordingMs(local.durationMs);
        })
        .catch(() => null);
      const result = await transcribeRecording(uploadBlob, { signal: abort.signal });
      if (reqId !== recordRequestRef.current) return;
      setUserTranscript(result.text);
      setAsrLabel(`${result.provider.toUpperCase()} · ${result.model}`);
      setSpeechScore(scoreSpeech(currentSentence?.text || '', result.text));
      setTranscribing(false);
      await analyzeTranscript(result.text, abort.signal, reqId);
    } catch (err) {
      if (reqId !== recordRequestRef.current) return;
      if ((err as { name?: string })?.name === 'AbortError') return;
      const message = (err as Error)?.message || '转写失败';
      setRecordingNote(message === ASR_NOT_CONFIGURED
        ? '没有可用的语音转写 Key —— 可在设置里配置 GLM / Groq / 硅基流动；录音已保留，可先回听。'
        : /1214|文件格式/.test(message)
          ? '语音服务不接受这段录音的格式 —— 请再录一次；若持续出现，可在设置里配置 Groq / 硅基流动。'
          : /401|403|未配置|\bKey\b/i.test(message)
            ? '语音转写 Key 不可用 —— 请在设置里检查 GLM / Groq / 硅基流动 Key；录音已保留，可先回听。'
            : `转写失败：${message}`);
    } finally {
      if (recordAbortRef.current === abort) recordAbortRef.current = null;
      if (reqId === recordRequestRef.current) setTranscribing(false);
    }
  }, [currentSentence, analyzeTranscript]);

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === 'recording') {
      try { rec.stop(); } catch { /* ignore */ }
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!currentSentence || recordingVoice || transcribing) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('这台设备不支持录音');
      return;
    }
    if (!hasAsrChannel()) {
      toast.error('未配置语音转写 Key —— 请在设置里配置 GLM / Groq / 硅基流动');
      return;
    }

    const startId = ++recordRequestRef.current;
    recordAbortRef.current?.abort();
    recordAbortRef.current = null;
    setAnalyzing(false);
    clearRecordedAudio();
    setUserTranscript('');
    setRecordingNote('');
    setSpeechScore(null);
    setLocalAnalysis(null);
    setAsrLabel('');
    setAiAnalysis('');
    setAnalysisKind(null);
    setShowAnalysis(false);
    setRecordingMs(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (startId !== recordRequestRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      recordStreamRef.current = stream;
      const mime = pickRecorderMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recordChunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) recordChunksRef.current.push(e.data); };
      rec.onerror = () => {
        setRecordingNote('录音出错了，请再试一次');
        cancelRecording();
      };
      rec.onstop = () => { void handleRecordingStop(rec.mimeType || mime || 'audio/webm'); };
      mediaRecorderRef.current = rec;
      recordStartedAtRef.current = performance.now();
      setRecordingVoice(true);
      rec.start();
      recordTickRef.current = setInterval(() => {
        setRecordingMs(performance.now() - recordStartedAtRef.current);
      }, 200);
      recordMaxTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current === rec && rec.state !== 'inactive') {
          try { rec.stop(); } catch { /* ignore */ }
        }
      }, MAX_RECORD_MS);
    } catch {
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
      recordStreamRef.current = null;
      setRecordingVoice(false);
      toast.error('无法访问麦克风 —— 请在系统设置里允许录音权限');
    }
  }, [currentSentence, recordingVoice, transcribing, clearRecordedAudio, cancelRecording, handleRecordingStop]);

  const playRecorded = useCallback(() => {
    if (!recordedUrl) return;
    tts.cancel();
    const audio = new Audio(recordedUrl);
    audio.play().catch(() => toast.error('播放录音失败'));
  }, [recordedUrl, tts.cancel]);

  const pace = useMemo(
    () => localAnalysis?.pace
      ?? (currentSentence && speechScore ? speechPace(currentSentence.text, recordingMs) : null),
    [localAnalysis, currentSentence, speechScore, recordingMs],
  );
  const matchedWords = speechScore
    ? Math.round(speechScore.accuracy * speechScore.targetWords.length)
    : 0;

  const toggleMaterialFavorite = (e: React.MouseEvent, material: typeof MOCK_SHADOWING_MATERIALS[0]) => {
    e.stopPropagation();
    const favorited = isFavorited(material.title, 'shadowing');
    if (favorited) {
      const fav = favorites.find((f) => f.content === material.title && f.type === 'shadowing');
      if (fav) removeFavorite(fav.id);
    } else {
      addFavorite({
        type: 'shadowing',
        content: material.title,
        meaning: material.description,
        category: material.category,
      });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">
            Shadowing Practice
          </p>
          <h1 className="text-3xl font-black italic text-foreground tracking-tight">影子跟读</h1>
          <p className="text-muted-foreground mt-2 text-sm font-medium">
            通过跟读训练语音语调，让你的口语更地道
          </p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 items-start">
        {/* Left: Corpus list */}
        <div className="col-span-12 lg:col-span-4">
          <Card className="rounded-[32px] border-border shadow-sm max-h-[calc(100vh-220px)] flex flex-col">
            <CardHeader className="pb-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-2xl bg-orange-50 dark:bg-orange-500/15 text-orange-500 flex items-center justify-center">
                  <BookOpen className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-lg font-black italic text-foreground">语料库</CardTitle>
                  <CardDescription className="text-xs font-medium">
                    共 {allMaterials.length} 篇 · 显示 {visibleMaterialRows.length}/{filteredMaterialRows.length}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 flex-1 overflow-hidden flex flex-col min-h-0">
              <div className="flex flex-col flex-1 min-h-0">
                {/* Category filter + AI Generate */}
                <div className="mb-3 shrink-0 space-y-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      value={filterQuery}
                      onChange={(event) => setFilterQuery(event.target.value)}
                      placeholder="搜索语料标题或描述…"
                      className="rounded-2xl pl-9"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="按跟读进度筛选">
                    {([
                      { key: 'all', label: '全部', count: materialCounts.all },
                      { key: 'unstarted', label: '未开始', count: materialCounts.unstarted },
                      { key: 'active', label: '进行中', count: materialCounts.active },
                      { key: 'completed', label: '已完成', count: materialCounts.completed },
                    ] as const).map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        aria-pressed={materialProgressFilter === option.key}
                        onClick={() => setFilterProgress(option.key)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors',
                          materialProgressFilter === option.key
                            ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-ink-teal'
                            : 'border-border bg-card text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {option.label} {option.count}
                      </button>
                    ))}
                  </div>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="w-full rounded-2xl bg-muted border-none text-xs font-bold h-9">
                      <SelectValue placeholder="筛选主题" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl max-h-60">
                      <SelectItem value="all" className="text-xs font-bold">全部主题</SelectItem>
                      {SHADOWING_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value} className="text-xs font-bold">{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                  {/* AI Generate button */}
                <Dialog open={showGenDialog} onOpenChange={setShowGenDialog}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full rounded-2xl border-dashed border-violet-300 text-violet-500 hover:bg-violet-50 hover:text-violet-600 text-[10px] font-black uppercase tracking-wider mb-3"
                    >
                      <Wand2 className="size-3.5 mr-1.5" />
                      AI 生成语料
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden">
                    <div className="p-6 border-b border-border">
                      <DialogHeader>
                        <DialogTitle className="text-xl font-black italic text-foreground flex items-center gap-2">
                          <Bot className="size-5 text-violet-500" />
                          AI 生成影子跟读语料
                        </DialogTitle>
                      </DialogHeader>
                    </div>
                    <div className="p-6 space-y-5">
                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">语料类型</label>
                        <Select value={genCategory} onValueChange={setGenCategory}>
                          <SelectTrigger className="w-full rounded-2xl border-border bg-muted text-xs font-bold">
                            <SelectValue placeholder="选择主题" />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl max-h-60">
                            {SHADOWING_CATEGORIES.map((c) => (
                              <SelectItem key={c.value} value={c.value} className="text-xs font-bold">
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">难度</label>
                        <div className="flex gap-2">
                          {[
                            { value: 'beginner' as const, label: '初级' },
                            { value: 'intermediate' as const, label: '中级' },
                            { value: 'advanced' as const, label: '高级' },
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
                        <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">话题关键词（可选）</label>
                        <Input
                          value={genTopic}
                          onChange={(e) => setGenTopic(e.target.value)}
                          placeholder="例如：咖啡店、商务会议..."
                          className="rounded-2xl"
                        />
                      </div>
                    </div>
                    {genValidation && (genValidation.errors.length > 0 || genValidation.warnings.length > 0) && (
                      <div className="px-6 pb-4 space-y-2">
                        {genValidation.errors.length > 0 && (
                          <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
                            <p className="text-xs font-black uppercase tracking-wider text-red-600 mb-2">
                              ⚠️ 发现 {genValidation.errors.length} 个错误
                            </p>
                            <ul className="space-y-1">
                              {genValidation.errors.map((e, i) => (
                                <li key={i} className="text-xs text-red-700 dark:text-red-400 font-medium">{e}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {genValidation.warnings.length > 0 && (
                          <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                            <p className="text-xs font-black uppercase tracking-wider text-amber-600 mb-1">
                              💡 {genValidation.warnings.length} 个提醒
                            </p>
                            <ul className="space-y-1">
                              {genValidation.warnings.map((w, i) => (
                                <li key={i} className="text-xs text-amber-700 dark:text-amber-400 font-medium">{w}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="p-6 border-t border-border flex gap-3 justify-end">
                      <Button
                        variant="outline"
                        onClick={() => { setShowGenDialog(false); setGenTopic(''); setGenValidation(null); }}
                        className="rounded-2xl"
                      >
                        关闭
                      </Button>
                      <Button
                        onClick={handleGenerateMaterial}
                        disabled={generating}
                        className="rounded-2xl bg-violet-500 hover:bg-violet-600 text-white shadow-lg shadow-violet-200/50"
                      >
                        {generating ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Wand2 className="size-4 mr-1.5" />}
                        {generating ? '生成中...' : '生成语料'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {filteredMaterialRows.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/20 p-4 text-center">
                      <p className="text-xs font-bold text-foreground">没有符合条件的语料</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">换个关键词，或清除进度/主题筛选。</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 rounded-full"
                        onClick={() => {
                          setFilterQuery('');
                          setFilterProgress('all');
                          setFilterCategory('all');
                        }}
                      >
                        清除筛选
                      </Button>
                    </div>
                  ) : visibleMaterialRows.map(({ corpus, done, total, finished }) => (
                      <button
                        key={corpus.id}
                        data-material-id={corpus.id}
                        onClick={() => selectCorpus(corpus.id)}
                        className={cn(
                          'w-full text-left p-4 rounded-2xl transition-all duration-200',
                          selectedId === corpus.id
                            ? 'bg-[var(--brand)]/10 border border-[var(--brand)]/30'
                            : 'bg-muted/30 border border-transparent hover:bg-muted hover:border-border',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {corpus.id.startsWith('ai_') && (
                              <Badge className="shrink-0 text-[8px] font-black rounded-full px-1.5 py-0 bg-[var(--brand)] hover:bg-[var(--brand-strong)] text-white border-0">AI</Badge>
                            )}
                            <h4 className="text-sm font-black text-foreground line-clamp-1">{corpus.title}</h4>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {corpus.id.startsWith('ai_') && (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteMaterial(corpus.id);
                                }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleDeleteMaterial(corpus.id); }}
                                className="p-1 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors cursor-pointer"
                              >
                                <X className="size-3.5" />
                              </span>
                            )}
                            <span
                              onClick={(e) => toggleMaterialFavorite(e, corpus)}
                              role="button"
                              tabIndex={0}
                              aria-label={isFavorited(corpus.title, 'shadowing') ? '取消收藏语料' : '收藏语料'}
                              title={isFavorited(corpus.title, 'shadowing') ? '取消收藏语料' : '收藏语料'}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); toggleMaterialFavorite(e as unknown as React.MouseEvent, corpus); } }}
                              className={cn(
                                'p-2.5 rounded-lg transition-colors cursor-pointer',
                                isFavorited(corpus.title, 'shadowing')
                                  ? 'text-rose-500'
                                  : 'text-muted-foreground hover:text-rose-500',
                              )}
                            >
                              <Heart className={cn('size-3.5', isFavorited(corpus.title, 'shadowing') && 'fill-current')} />
                            </span>
                            <Badge variant="secondary" className="text-[9px] font-black uppercase rounded-full px-2 py-0.5 bg-muted">
                              {corpus.difficulty === 'beginner' ? '初级' : corpus.difficulty === 'intermediate' ? '中级' : '高级'}
                            </Badge>
                            {finished && (
                              <Badge variant="outline" className="text-[9px] font-black rounded-full border-emerald-500/40 text-emerald-600">
                                已完成
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="size-3" />{total} 句</span>
                          <span>{corpus.accent === 'US' ? '美音' : '英音'}</span>
                          <span>{CATEGORY_LABEL_MAP[corpus.category] || corpus.category}</span>
                          <span className="ml-auto normal-case tracking-normal">{done}/{total}</span>
                        </div>
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <div
                            className="h-full rounded-full bg-[var(--brand)]"
                            style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%` }}
                          />
                        </div>
                      </button>
                    ))}
                  {remainingMaterials > 0 && (
                    <button
                      type="button"
                      onClick={() => setVisibleMaterialCount((count) => count + 12)}
                      className="w-full rounded-2xl border-2 border-dashed border-border py-2.5 text-[11px] font-black text-muted-foreground transition-colors hover:border-[var(--brand)]/50 hover:text-ink-teal"
                    >
                      再显示 {Math.min(12, remainingMaterials)} 篇（还剩 {remainingMaterials} 篇）
                    </button>
                  )}
                  {visibleMaterialCount > 12 && (
                    <button
                      type="button"
                      onClick={() => setVisibleMaterialCount(12)}
                      className="w-full py-2 text-[10px] font-bold text-muted-foreground hover:text-foreground"
                    >
                      收起，只看前 12 篇
                    </button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Practice area */}
        <div className="col-span-12 lg:col-span-8 space-y-4">
          {selectedCorpus && currentSentence ? (
            <>
              {/* Progress bar */}
              <Card className="rounded-[32px] border-border shadow-sm sticky top-20 z-10">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-base font-black italic text-foreground">{selectedCorpus.title}</h2>
                      <p className="text-xs text-muted-foreground font-medium">
                        第 {currentSentenceIdx + 1}/{totalSentences} 句 · {selectedCorpus.accent === 'US' ? '美音' : '英音'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {extraSentences[selectedCorpus.id] && extraSentences[selectedCorpus.id].length > 0 && (
                        <Badge className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-violet-50 dark:bg-violet-500/15 text-violet-500 border-none">
                          +{extraSentences[selectedCorpus.id].length} AI
                        </Badge>
                      )}
                      <Badge className="rounded-full px-3 py-1 text-[10px] font-black bg-emerald-50 dark:bg-emerald-500/15 text-ink-teal border-none">
                        {totalCompleted} 已完成
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={addingSentences === selectedCorpus.id}
                        onClick={() => handleAddSentences(selectedCorpus)}
                        className="rounded-xl text-[10px] font-bold text-violet-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/15 gap-1 h-7"
                      >
                        {addingSentences === selectedCorpus.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Wand2 className="size-3" />
                        )}
                        增加句子
                      </Button>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[var(--brand)] to-emerald-400 rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Current sentence card */}
              <Card className="rounded-[40px] border-border shadow-sm">
                <CardContent className="p-8">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-3">
                    Current Sentence
                  </p>
                  <div
                    className={cn(
                      'text-2xl font-black leading-relaxed mb-6 p-5 rounded-[24px] transition-all duration-300',
                      tts.isSpeaking
                        ? 'text-ink-teal bg-[var(--brand)]/5 border border-[var(--brand)]/20'
                        : 'text-foreground',
                    )}
                  >
                    {currentSentence.text}
                  </div>

                  {/* Pronunciation hints */}
                  {currentSentence.annotatedText && (
                    <div className="p-4 rounded-[24px] bg-gradient-to-br from-[var(--brand)]/5 to-emerald-50 dark:from-[var(--brand)]/10 dark:to-emerald-500/10 border border-[var(--brand)]/10 mb-6">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-black uppercase tracking-wider text-ink-teal">语音标注</span>
                      </div>
                      <p className="text-sm text-foreground/80 italic">
                        {renderAnnotated(currentSentence.annotatedText)}
                      </p>
                    </div>
                  )}

                  {/* Translation */}
                  <p className="text-sm text-muted-foreground font-medium mb-8 pb-8 border-b border-border">
                    {currentSentence.translation}
                  </p>

                  {/* Playback controls */}
                  <div className="flex flex-col items-center gap-5">
                    <div className="flex items-center gap-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={prevSentence}
                        disabled={currentSentenceIdx === 0}
                        className="size-12 rounded-2xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-ink-teal disabled:opacity-40"
                      >
                        <SkipBack className="size-5" />
                      </Button>

                      <Button
                        onClick={togglePlay}
                        className={cn(
                          'size-16 rounded-full text-white shadow-xl hover:scale-105 transition-all',
                          tts.isSpeaking
                            ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200/50'
                            : 'bg-[var(--brand)] hover:bg-[var(--brand-strong)] shadow-emerald-200/50 dark:shadow-emerald-900/30',
                        )}
                      >
                        {tts.isSpeaking ? <Pause className="size-7" /> : <Play className="size-7 ml-1" />}
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={nextSentence}
                        disabled={currentSentenceIdx === totalSentences - 1}
                        className="size-12 rounded-2xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-ink-teal disabled:opacity-40"
                      >
                        <SkipForward className="size-5" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-4 w-full max-w-md flex-wrap justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleLoop}
                        className={cn(
                          'rounded-2xl gap-1.5 text-[10px] font-black uppercase tracking-wider',
                          isLooping ? 'bg-[var(--brand)]/10 text-ink-teal' : 'bg-muted text-muted-foreground hover:text-ink-teal',
                        )}
                      >
                        <Repeat className="size-3.5" />
                        单句循环{isLooping ? ' ON' : ''}
                      </Button>

                      <div className="flex-1 flex items-center gap-3 min-w-[160px]">
                        <Gauge className="size-4 text-muted-foreground shrink-0" />
                        <Slider
                          value={[playbackRate]}
                          onValueChange={(v) => setPlaybackRate(v[0])}
                          min={0.5}
                          max={1.5}
                          step={0.1}
                          className="flex-1"
                        />
                        <span className="text-xs font-black text-foreground tabular-nums w-10 text-right">
                          {playbackRate.toFixed(1)}x
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={playCurrentSentence}
                        disabled={tts.isSpeaking}
                        className="rounded-2xl gap-2 text-[10px] font-black uppercase tracking-wider border-border hover:border-[var(--brand)] hover:text-ink-teal"
                      >
                        <Volume2 className="size-4" />再听一遍
                      </Button>
                      <Button
                        onClick={markCompleted}
                        disabled={completedSentences.has(currentDoneKey)}
                        className="bg-gradient-to-r from-emerald-500 to-[var(--brand)] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30 hover:scale-105 transition-all gap-2 disabled:opacity-50 disabled:hover:scale-100"
                      >
                        <CheckCircle2 className="size-4" />
                        {completedSentences.has(currentDoneKey) ? '已完成' : '我读完了'}
                      </Button>
                    </div>

                    {/* AI 发音分析 + 录音评分 */}
                    <div className="flex flex-col gap-3 pt-4 border-t border-border w-full">
                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAnalyzePronunciation}
                          disabled={analyzing || recordingVoice || transcribing}
                          className="rounded-2xl gap-2 text-[10px] font-black uppercase tracking-wider border-violet-300 text-violet-500 hover:bg-violet-50 flex-1"
                        >
                          {analyzing && analysisKind === 'sentence' ? (
                            <><Loader2 className="size-3.5 animate-spin" /> 分析中...</>
                          ) : (
                            <><Bot className="size-3.5" /> 发音难点分析</>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          onClick={recordingVoice ? stopRecording : startRecording}
                          disabled={transcribing || (analyzing && analysisKind === 'sentence')}
                          className={cn(
                            'rounded-2xl gap-2 text-[10px] font-black uppercase tracking-wider flex-1',
                            recordingVoice
                              ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse'
                              : transcribing
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-[var(--brand)] hover:bg-[var(--brand-strong)] text-white',
                          )}
                        >
                          {recordingVoice
                            ? <Square className="size-3.5" />
                            : transcribing
                              ? <Loader2 className="size-3.5 animate-spin" />
                              : <Mic className="size-3.5" />}
                          {recordingVoice
                            ? `停止录音 ${Math.floor(recordingMs / 1000)}s`
                            : transcribing ? '转写中...' : '录音并分析'}
                        </Button>
                      </div>

                      {recordedUrl && !recordingVoice && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={playRecorded}
                          className="self-start rounded-2xl gap-2 text-[10px] font-black uppercase tracking-wider border-border hover:border-[var(--brand)] hover:text-ink-teal"
                        >
                          <Volume2 className="size-3.5" /> 听我的录音
                        </Button>
                      )}

                      <p className="text-[9px] font-bold text-muted-foreground/80">
                        录音会上传到语音转写服务，只用于本次评分，不保存音频 · 评分基于转写文本，不评音素发音
                      </p>

                      {recordingVoice && (
                        <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                          <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 mb-1">正在录音</p>
                          <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                            {Math.floor(recordingMs / 1000)}s / {MAX_RECORD_MS / 1000}s · 读完点「停止录音」
                          </p>
                        </div>
                      )}

                      {(transcribing || recordingNote || speechScore || localAnalysis) && (
                        <div className="p-3 rounded-2xl bg-muted/30 border border-border/60 space-y-2">
                          {transcribing && (
                            <p className="text-[11px] font-bold text-muted-foreground">正在转写录音…</p>
                          )}
                          {recordingNote && (
                            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">{recordingNote}</p>
                          )}
                          {speechScore && (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">词级命中</span>
                                <span className={cn(
                                  'text-sm font-black',
                                  speechScore.accuracy >= 0.8 ? 'text-ink-teal' : 'text-amber-600 dark:text-amber-400',
                                )}>
                                  {Math.round(speechScore.accuracy * 100)}%
                                </span>
                              </div>
                              <p className="text-[10px] font-bold text-muted-foreground">
                                {matchedWords}/{speechScore.targetWords.length} 词
                                {speechScore.missed.length ? ` · 漏词：${speechScore.missed.join(', ')}` : ' · 无漏词'}
                              </p>
                              {pace && (
                                <p className="text-[10px] font-bold text-muted-foreground">
                                  {(recordingMs / 1000).toFixed(1)}s / 参考 {(pace.expectedMs / 1000).toFixed(1)}s ·{' '}
                                  <span className={cn(
                                    pace.label === 'ok' ? 'text-ink-teal' : 'text-amber-600 dark:text-amber-400',
                                  )}>
                                    {pace.label === 'slow'
                                      ? `偏慢 ${Math.round(pace.delta * 100)}%`
                                      : pace.label === 'fast'
                                        ? `偏快 ${Math.round(-pace.delta * 100)}%`
                                        : '节奏贴合'}
                                  </span>
                                </p>
                              )}
                              {asrLabel && (
                                <p className="text-[9px] font-bold text-muted-foreground/70">{asrLabel}</p>
                              )}
                              {analyzing && analysisKind === 'recording' && (
                                <p className="text-[10px] font-bold text-muted-foreground">AI 跟读反馈生成中…</p>
                              )}
                            </>
                          )}
                          {localAnalysis && (
                            <div className="pt-2 mt-1 border-t border-border/60 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">本地节奏分析</span>
                                <span className="text-[9px] font-bold text-muted-foreground/70">离线 · 不评音素</span>
                              </div>
                              {!speechScore && localAnalysis.pace && (
                                <p className="text-[10px] font-bold text-muted-foreground">
                                  语速：{(localAnalysis.durationMs / 1000).toFixed(1)}s / 参考 {(localAnalysis.pace.expectedMs / 1000).toFixed(1)}s ·{' '}
                                  <span className={cn(
                                    localAnalysis.pace.label === 'ok' ? 'text-ink-teal' : 'text-amber-600 dark:text-amber-400',
                                  )}>
                                    {localAnalysis.pace.label === 'slow'
                                      ? `偏慢 ${Math.round(localAnalysis.pace.delta * 100)}%`
                                      : localAnalysis.pace.label === 'fast'
                                        ? `偏快 ${Math.round(-localAnalysis.pace.delta * 100)}%`
                                        : '节奏贴合'}
                                  </span>
                                </p>
                              )}
                              <p className="text-[10px] font-bold text-muted-foreground">
                                停顿：{localAnalysis.total > 0
                                  ? `${localAnalysis.hit}/${localAnalysis.total} 处意群边界`
                                  : `检测到 ${localAnalysis.pauses.length} 处停顿`}
                                {localAnalysis.total > 0 && localAnalysis.pauses.length > 0
                                  ? ` · 共 ${localAnalysis.pauses.length} 处停顿`
                                  : ''}
                              </p>
                              {localAnalysis.total > 0 && localAnalysis.pauses.length === 0 && (
                                <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                  一口气读完 —— 母语者会在意群间换气
                                </p>
                              )}
                              <p className="text-[10px] font-bold text-muted-foreground">
                                音量：{localAnalysis.volume.tooQuiet ? '偏低' : localAnalysis.volume.clipped ? '有爆音' : '正常'}
                                <span className="text-muted-foreground/70">
                                  （RMS {localAnalysis.volume.rmsDbfs} dBFS / 峰值 {localAnalysis.volume.peakDbfs} dBFS）
                                </span>
                              </p>
                              {localAnalysis.volume.tooQuiet && (
                                <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">靠近麦克风一点</p>
                              )}
                              {localAnalysis.volume.clipped && (
                                <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">离麦克风远一点 / 降低音量</p>
                              )}
                              <p className="text-[10px] font-bold text-muted-foreground">
                                音高：{localAnalysis.pitch
                                  ? `${localAnalysis.pitch.p10Hz}–${localAnalysis.pitch.p90Hz} Hz（中位 ${localAnalysis.pitch.medianHz}）· ${localAnalysis.pitch.trend === 'rising' ? '整体上扬' : localAnalysis.pitch.trend === 'falling' ? '整体下降' : '基本平稳'}`
                                  : '未检测到稳定音高'}
                              </p>
                              {currentSentence?.text.trim().endsWith('?') && localAnalysis.pitch && (
                                <p className={cn(
                                  'text-[10px] font-bold',
                                  localAnalysis.pitch.endsRising ? 'text-ink-teal' : 'text-amber-600 dark:text-amber-400',
                                )}>
                                  {localAnalysis.pitch.endsRising ? '疑问句句尾有上扬 ✓' : '疑问句句尾可以再上扬一点'}
                                </p>
                              )}
                              <p className="text-[9px] font-bold text-muted-foreground/70">
                                A/B 回放：用「再听一遍」和「听我的录音」对比
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {showAnalysis && aiAnalysis && (
                      <div className="p-4 rounded-2xl bg-violet-50/50 border border-violet-100 text-sm w-full">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-black uppercase tracking-wider text-violet-500">
                            {analysisKind === 'sentence' ? 'AI 发音难点分析' : 'AI 跟读反馈（基于转写文本）'}
                          </span>
                          <button onClick={() => setShowAnalysis(false)} className="text-muted-foreground hover:text-foreground">
                            <X className="size-4" />
                          </button>
                        </div>
                        {analysisKind === 'recording' && userTranscript && (
                          <div className="mb-3 p-2 rounded-xl bg-amber-50 border border-amber-200 text-xs">
                            <span className="font-bold text-amber-700">你的跟读（转写）：</span>
                            <span className="text-amber-800">{userTranscript}</span>
                          </div>
                        )}
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiAnalysis}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* All sentences */}
              <Card className="rounded-[32px] border-border shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-black uppercase tracking-wider text-muted-foreground">
                      全部句子 · {totalCompleted}/{totalSentences}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={addingSentences === selectedCorpus.id}
                        onClick={() => handleAddSentences(selectedCorpus)}
                        className="rounded-xl text-[10px] font-bold text-violet-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/15 gap-1 h-7"
                      >
                        {addingSentences === selectedCorpus.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Wand2 className="size-3" />
                        )}
                        增加句子
                      </Button>
                      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--brand)] rounded-full transition-all duration-500"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-black text-muted-foreground">{Math.round(progressPercent)}%</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {/* 语料完成成就横幅 —— 100% 时给一次仪式感（与拼写页的完成横幅对齐） */}
                  {totalSentences > 0 && totalCompleted >= totalSentences && (
                    <div className="mb-3 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-teal-500/10 p-4 flex items-center gap-3">
                      <CheckCircle2 className="size-6 text-emerald-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-foreground">本语料已完成！</p>
                        <p className="text-[11px] text-muted-foreground">全部 {totalSentences} 句都跟读过了 — 换一段语料继续，或再来一遍巩固</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (!selectedCorpus) return;
                          setCompletedSentences((prev) => clearCompletionForCorpus(prev, selectedCorpus.id));
                          setCurrentSentenceIdx(0);
                          toast.info('本语料完成标记已重置，开始新的一遍吧', { duration: 2000 });
                        }}
                        className="rounded-xl text-[10px] font-black shrink-0"
                      >
                        再来一遍
                      </Button>
                    </div>
                  )}
                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                    {allSentences.map((s, idx) => {
                      const key = shadowingCompletionKey(selectedCorpus.id, idx);
                      const done = completedSentences.has(key);
                      const isCurrent = idx === currentSentenceIdx;
                      const isExtra = idx >= selectedCorpus.sentences.length;
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            setCurrentSentenceIdx(idx);
                            setAutoPlay(true);
                            tts.cancel();
                          }}
                          className={cn(
                            'w-full text-left p-3 rounded-2xl transition-all flex items-start gap-3 group/row',
                            isCurrent
                              ? 'bg-[var(--brand)]/10 border border-[var(--brand)]/30'
                              : 'bg-muted/20 border border-transparent hover:bg-muted/50',
                          )}
                        >
                          <div
                            className={cn(
                              'size-6 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                              done ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-[var(--brand)] text-white' : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {done ? (
                              <CheckCircle2 className="size-3.5" />
                            ) : (
                              <span className="text-[10px] font-black">{idx + 1}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 flex items-center gap-1.5">
                            <p className={cn('text-sm line-clamp-2', isCurrent ? 'text-foreground font-bold' : 'text-muted-foreground')}>
                              {s.text}
                            </p>
                            {isExtra && (
                              <>
                                <Badge className="shrink-0 text-[8px] font-black rounded-full px-1.5 py-0 bg-[var(--brand)] hover:bg-[var(--brand-strong)] text-white border-0">AI</Badge>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSentence(selectedCorpus.id, idx);
                                  }}
                                  className="shrink-0 size-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors opacity-0 group-hover/row:opacity-100"
                                >
                                  <X className="size-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="rounded-[40px] border-border shadow-sm">
              <CardContent className="p-16 text-center">
                <div className="size-20 rounded-3xl bg-muted mx-auto mb-4 flex items-center justify-center text-muted-foreground">
                  <Mic className="size-9" />
                </div>
                <h3 className="text-xl font-black text-foreground mb-2">选择一篇语料开始跟读</h3>
                <p className="text-sm text-muted-foreground font-medium">
                  从左侧语料库中选择内容，点击播放按钮开始跟读
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

    </div>
  );
}

/**
 * annotatedText 用 <u>…</u> 标出重读处。此前渲染时把标签整个删掉 ——
 * 「语音标注」面板显示的文字与原句一字不差，标注形同不存在。
 * 只识别 <u> 这一种标签，其余内容一律按纯文本渲染（annotatedText 可能来自 AI 生成，
 * 不能走 dangerouslySetInnerHTML）；不配对的残标签剥掉，不让尖括号漏进界面。
 * 放文件尾：函数声明有提升，且模块文档的 文件:行号 引用全部落在组件段内，避免整体位移。
 */
function renderAnnotated(text: string) {
  return text.split(/(<u>[\s\S]*?<\/u>)/g).filter(Boolean).map((seg, i) =>
    seg.startsWith('<u>') && seg.endsWith('</u>') ? (
      <u key={i} className="underline decoration-[var(--brand)] decoration-2 underline-offset-4 not-italic font-semibold">{seg.slice(3, -4)}</u>
    ) : (
      <span key={i}>{seg.replace(/<\/?u>/g, '')}</span>
    ),
  );
}
