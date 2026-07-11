import { useState, useRef, useCallback, useEffect } from 'react';
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
  Sparkles,
  Heart,
  Bot,
  Wand2,
  Loader2,
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
import { usePageMemory } from '@/lib/use-page-memory';
import { cn } from '@/lib/utils';
import { useTTS } from '@/lib/use-tts';
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

export default function ShadowingPage() {
  const { addStudyMinutes } = useLearningStats();
  const { addFavorite, removeFavorite, isFavorited, favorites } = useFavorites();
  const { isConfigured, chat: aiChat } = useAI();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_SHADOWING_MATERIALS[0]?.id || null);
  const [currentSentenceIdx, setCurrentSentenceIdx] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  const [playbackRate, setPlaybackRate] = usePageMemory('shadowing-rate', 1);
  const [completedSentences, setCompletedSentences] = useState<Set<string>>(new Set());

  // AI generation state
  const [customMaterials, setCustomMaterials] = useState<IShadowingMaterial[]>(() => {
    try {
      const saved = safeStorage.getItem('__nativethink_custom_shadowing');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Persist custom materials to localStorage
  useEffect(() => {
    safeStorage.setItem('__nativethink_custom_shadowing', JSON.stringify(customMaterials));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [showGenDialog, setShowGenDialog] = useState(false);
  const [filterCategory, setFilterCategory] = usePageMemory('shadowing-filter', 'all');
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
    safeStorage.setItem('__nativethink_shadowing_extra', JSON.stringify(extraSentences));
  }, [extraSentences]);

  const handleDeleteSentence = (corpusId: string, sentenceIdx: number) => {
    setExtraSentences((prev) => {
      const updated = { ...prev };
      if (!updated[corpusId]) return prev;
      updated[corpusId] = updated[corpusId].filter((_, i) => i !== sentenceIdx);
      if (updated[corpusId].length === 0) delete updated[corpusId];
      return updated;
    });
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
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (!jsonMatch) { toast.error('AI 返回格式异常，请重试'); return; }
      const parsed = JSON.parse(jsonMatch[0]);
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
  const totalCompleted = completedSentences.size;
  const progressPercent = totalSentences > 0 ? (totalCompleted / totalSentences) * 100 : 0;

  const currentSentence = allSentences[currentSentenceIdx];

  // Shared TTS hook with auto-advance on sentence end
  const tts = useTTS({
    onEnd: () => {
      if (!isLoopingRef.current) {
        const idx = currentIdxRef.current;
        if (idx < allSentences.length - 1) {
          setCurrentSentenceIdx(idx + 1);
        }
      }
    },
  });

  const togglePlay = useCallback(() => {
    if (tts.isSpeaking) {
      tts.cancel();
    } else if (currentSentence) {
      tts.speak(currentSentence.text, {
        lang: selectedCorpus?.accent === 'UK' ? 'en-GB' : 'en-US',
        rate: playbackRate,
      });
      addStudyMinutes(1, 'shadowing');
    }
  }, [tts.isSpeaking, tts.cancel, tts.speak, currentSentence, selectedCorpus?.accent, playbackRate, addStudyMinutes]);

  const playCurrentSentence = useCallback(() => {
    if (currentSentence) {
      tts.speak(currentSentence.text, {
        lang: selectedCorpus?.accent === 'UK' ? 'en-GB' : 'en-US',
        rate: playbackRate,
      });
    }
  }, [currentSentence, selectedCorpus?.accent, playbackRate, tts.speak]);

  // Auto-speak when sentence index changes while in "playing" mode
  const [autoPlay, setAutoPlay] = usePageMemory('shadowing-autoplay', false);
  useEffect(() => {
    if (autoPlay && currentSentence) {
      tts.speak(currentSentence.text, {
        lang: selectedCorpus?.accent === 'UK' ? 'en-GB' : 'en-US',
        rate: playbackRate,
      });
    }
  }, [currentSentenceIdx]);  

  const prevSentence = useCallback(() => {
    tts.cancel();
    setAutoPlay(false);
    if (currentSentenceIdx > 0) {
      setCurrentSentenceIdx(currentSentenceIdx - 1);
    }
  }, [currentSentenceIdx, tts.cancel]);

  const nextSentence = useCallback(() => {
    tts.cancel();
    setAutoPlay(false);
    if (currentSentenceIdx < allSentences.length - 1) {
      setCurrentSentenceIdx(currentSentenceIdx + 1);
    }
  }, [currentSentenceIdx, tts.cancel, allSentences.length]);

  const toggleLoop = useCallback(() => {
    setIsLooping((prev) => {
      toast.success(prev ? '已关闭单句循环' : '已开启单句循环');
      return !prev;
    });
  }, []);

  const markCompleted = useCallback(() => {
    if (!selectedCorpus) return;
    const key = `${selectedCorpus.id}-${currentSentenceIdx}`;
    setCompletedSentences((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    addStudyMinutes(0.5, 'shadowing');
    toast.success('这句已完成！');
    if (currentSentenceIdx < allSentences.length - 1) {
      setTimeout(() => {
        setCurrentSentenceIdx((prev) => prev + 1);
        setAutoPlay(true);
      }, 400);
    }
  }, [selectedCorpus, currentSentenceIdx, addStudyMinutes, allSentences.length]);

  const selectCorpus = useCallback((id: string) => {
    tts.cancel();
    setAutoPlay(false);
    setSelectedId(id);
    setCurrentSentenceIdx(0);
  }, [tts.cancel]);

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

      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { toast.error('AI 返回格式异常，请重试'); return; }

      const parsed = JSON.parse(jsonMatch[0]);
      const newMaterial: IShadowingMaterial = {
        id: `ai_${Date.now()}`,
        title: parsed.title || `AI 语料 - ${genTopic || catLabel}`,
        category: parsed.category || genCategory,
        difficulty: parsed.difficulty || genDifficulty,
        accent: parsed.accent || 'US',
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
      setCompletedSentences(new Set());

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
      setAiAnalysis(result);
    } catch {
      toast.error('AI 分析失败，请稍后重试');
      setShowAnalysis(false);
    } finally {
      setAnalyzing(false);
    }
  };

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
                    共 {allMaterials.length} 篇语料
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 flex-1 overflow-hidden flex flex-col min-h-0">
              <div className="flex flex-col flex-1 min-h-0">
                {/* Category filter + AI Generate */}
                <div className="mb-3 shrink-0 space-y-2">
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
                  {allMaterials.filter(
                    (c) => filterCategory === 'all' || c.category === filterCategory,
                  ).map((corpus) => (
                      <button
                        key={corpus.id}
                        onClick={() => selectCorpus(corpus.id)}
                        className={cn(
                          'w-full text-left p-4 rounded-2xl transition-all duration-200',
                          selectedId === corpus.id
                            ? 'bg-[#00B894]/10 border border-[#00B894]/30'
                            : 'bg-muted/30 border border-transparent hover:bg-muted hover:border-border',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {corpus.id.startsWith('ai_') && (
                              <Badge className="shrink-0 text-[8px] font-black rounded-full px-1.5 py-0 bg-gradient-to-r from-violet-500 to-purple-500 text-white border-0">AI</Badge>
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
                              onKeyDown={(e) => { if (e.key === 'Enter') toggleMaterialFavorite(e, corpus); }}
                              className={cn(
                                'p-1 rounded-lg transition-colors cursor-pointer',
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
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="size-3" />{corpus.sentences.length} 句</span>
                          <span>{corpus.accent === 'US' ? '美音' : '英音'}</span>
                          <span>{CATEGORY_LABEL_MAP[corpus.category] || corpus.category}</span>
                        </div>
                      </button>
                    ))}
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
                      <Badge className="rounded-full px-3 py-1 text-[10px] font-black bg-emerald-50 dark:bg-emerald-500/15 text-[#00B894] border-none">
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
                      className="h-full bg-gradient-to-r from-[#00B894] to-emerald-400 rounded-full transition-all duration-500"
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
                        ? 'text-[#00B894] bg-[#00B894]/5 border border-[#00B894]/20'
                        : 'text-foreground',
                    )}
                  >
                    {currentSentence.text}
                  </div>

                  {/* Pronunciation hints */}
                  {currentSentence.annotatedText && (
                    <div className="p-4 rounded-[24px] bg-gradient-to-br from-[#00B894]/5 to-emerald-50 dark:from-[#00B894]/10 dark:to-emerald-500/10 border border-[#00B894]/10 mb-6">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="size-4 text-[#00B894]" />
                        <span className="text-xs font-black uppercase tracking-wider text-[#00B894]">语音标注</span>
                      </div>
                      <p className="text-sm text-foreground/80 italic">
                        {currentSentence.annotatedText.replace(/<u>/g, '').replace(/<\/u>/g, '')}
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
                        className="size-12 rounded-2xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-[#00B894] disabled:opacity-40"
                      >
                        <SkipBack className="size-5" />
                      </Button>

                      <Button
                        onClick={togglePlay}
                        className={cn(
                          'size-16 rounded-full text-white shadow-xl hover:scale-105 transition-all',
                          tts.isSpeaking
                            ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200/50'
                            : 'bg-[#00B894] hover:bg-[#00A080] shadow-emerald-200/50 dark:shadow-emerald-900/30',
                        )}
                      >
                        {tts.isSpeaking ? <Pause className="size-7" /> : <Play className="size-7 ml-1" />}
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={nextSentence}
                        disabled={currentSentenceIdx === totalSentences - 1}
                        className="size-12 rounded-2xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-[#00B894] disabled:opacity-40"
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
                          isLooping ? 'bg-[#00B894]/10 text-[#00B894]' : 'bg-muted text-muted-foreground hover:text-[#00B894]',
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
                        className="rounded-2xl gap-2 text-[10px] font-black uppercase tracking-wider border-border hover:border-[#00B894] hover:text-[#00B894]"
                      >
                        <Volume2 className="size-4" />再听一遍
                      </Button>
                      <Button
                        onClick={markCompleted}
                        disabled={completedSentences.has(`${selectedCorpus.id}-${currentSentenceIdx}`)}
                        className="bg-gradient-to-r from-emerald-500 to-[#00B894] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30 hover:scale-105 transition-all gap-2 disabled:opacity-50 disabled:hover:scale-100"
                      >
                        <CheckCircle2 className="size-4" />
                        {completedSentences.has(`${selectedCorpus.id}-${currentSentenceIdx}`) ? '已完成' : '我读完了'}
                      </Button>
                    </div>

                    {/* AI 发音分析 */}
                    <div className="flex gap-3 pt-4 border-t border-border">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAnalyzePronunciation}
                        disabled={analyzing}
                        className="rounded-2xl gap-2 text-[10px] font-black uppercase tracking-wider border-violet-300 text-violet-500 hover:bg-violet-50 w-full"
                      >
                        {analyzing ? (
                          <><Loader2 className="size-3.5 animate-spin" /> 分析中...</>
                        ) : (
                          <><Bot className="size-3.5" /> AI 分析发音难点</>
                        )}
                      </Button>
                    </div>

                    {showAnalysis && aiAnalysis && (
                      <div className="p-4 rounded-2xl bg-violet-50/50 border border-violet-100 text-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-black uppercase tracking-wider text-violet-500">AI 发音指导</span>
                          <button onClick={() => setShowAnalysis(false)} className="text-muted-foreground hover:text-foreground">
                            <X className="size-4" />
                          </button>
                        </div>
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
                          className="h-full bg-[#00B894] rounded-full transition-all duration-500"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-black text-muted-foreground">{Math.round(progressPercent)}%</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                    {allSentences.map((s, idx) => {
                      const key = `${selectedCorpus.id}-${idx}`;
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
                              ? 'bg-[#00B894]/10 border border-[#00B894]/30'
                              : 'bg-muted/20 border border-transparent hover:bg-muted/50',
                          )}
                        >
                          <div
                            className={cn(
                              'size-6 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                              done ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-[#00B894] text-white' : 'bg-muted text-muted-foreground',
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
                                <Badge className="shrink-0 text-[8px] font-black rounded-full px-1.5 py-0 bg-gradient-to-r from-violet-500 to-purple-500 text-white border-0">AI</Badge>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSentence(selectedCorpus.id, idx - selectedCorpus.sentences.length);
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
