import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Search,
  ArrowRight,
  Lightbulb,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  RefreshCw,
  Brain,
  Heart,
  Bot,
  Wand2,
  Volume2,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { capabilityClient } from '@lark-apaas/client-toolkit-lite';
import { toast } from 'sonner';
import { PLUGIN_IDS } from '@/lib/plugin-ids';
import { MOCK_THINK_EXERCISES, type IThinkExercise } from '@/data/thinkexercises';
import { MOCK_BACK_TRANSLATIONS, type IBackTranslation } from '@/data/backtranslation';
import { MOCK_NATIVE_TRANSLATES, type INativeTranslate } from '@/data/nativetranslate';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useLearningStats } from '@/lib/use-learning-stats';
import { useFavorites } from '@/lib/use-favorites';
import { useAI } from '@/hooks/use-ai';
import { useTTS } from '@/lib/use-tts';
import { usePageMemory } from '@/lib/use-page-memory';
import { safeStorage } from '@/lib/safe-storage';
import { cn } from '@/lib/utils';

const EXAMPLE_SENTENCES = [
  'i very like this book.',
  'my work is very busy recently.',
  'i have a question want to ask you.',
];

export default function ThinkInEnglishPage() {
  const { addStudyMinutes } = useLearningStats();
  const { isConfigured, streamChat: aiStream, chat: aiChat } = useAI();
  const { addFavorite, removeFavorite, isFavorited, favorites } = useFavorites();
  const tts = useTTS();
  const [activeTab, setActiveTab] = usePageMemory('think-tab', 'detector');

  // Detector
  const [detectorInput, setDetectorInput] = useState('');
  const [detectorResult, setDetectorResult] = useState('');
  const [detectorLoading, setDetectorLoading] = useState(false);
  const detectorAbortRef = useRef<AbortController | null>(null);

  // Translation exercise
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState(0);
  const [translationInput, setTranslationInput] = useState('');
  const [translationResult, setTranslationResult] = useState('');
  const [translationLoading, setTranslationLoading] = useState(false);
  const [showNativeRef, setShowNativeRef] = useState(false);
  const translationAbortRef = useRef<AbortController | null>(null);

  // Back translation
  const [currentBackIdx, setCurrentBackIdx] = useState(0);
  const [backInput, setBackInput] = useState('');
  const [backResult, setBackResult] = useState('');
  const [backLoading, setBackLoading] = useState(false);
  const [showBackRef, setShowBackRef] = useState(false);
  const backAbortRef = useRef<AbortController | null>(null);

  // Native thinking translation
  const [currentNativeIdx, setCurrentNativeIdx] = useState(0);
  const [nativeInput, setNativeInput] = useState('');
  const [nativeResult, setNativeResult] = useState('');
  const [nativeLoading, setNativeLoading] = useState(false);
  const [showNativeThinkRef, setShowNativeThinkRef] = useState(false);
  const nativeAbortRef = useRef<AbortController | null>(null);

  // AI custom exercises (must be before useMemo blocks that reference them)
  const [customTranslations, setCustomTranslations] = useState<IThinkExercise[]>(() => {
    try { const saved = safeStorage.getItem('__nativethink_custom_translations'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [customBacks, setCustomBacks] = useState<IBackTranslation[]>(() => {
    try { const saved = safeStorage.getItem('__nativethink_custom_backs'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [customNatives, setCustomNatives] = useState<INativeTranslate[]>(() => {
    try { const saved = safeStorage.getItem('__nativethink_custom_natives'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });

  // Persist custom exercises to localStorage
  useEffect(() => { safeStorage.setItem('__nativethink_custom_translations', JSON.stringify(customTranslations)); }, [customTranslations]);
  useEffect(() => { safeStorage.setItem('__nativethink_custom_backs', JSON.stringify(customBacks)); }, [customBacks]);
  useEffect(() => { safeStorage.setItem('__nativethink_custom_natives', JSON.stringify(customNatives)); }, [customNatives]);

  // AI generation state
  const [genLoading, setGenLoading] = useState<'translation' | 'back' | 'native' | null>(null);
  const [showGenDialog, setShowGenDialog] = useState<'translation' | 'back' | 'native' | null>(null);

  const translationExercises = useMemo(
    () => [...customTranslations, ...MOCK_THINK_EXERCISES.filter((e) => e.type === 'translation')].sort(() => Math.random() - 0.5),
    [customTranslations],
  );
  const backExercises = useMemo(
    () => [...customBacks, ...MOCK_BACK_TRANSLATIONS].sort(() => Math.random() - 0.5),
    [customBacks],
  );
  const nativeExercises = useMemo(
    () => [...customNatives, ...MOCK_NATIVE_TRANSLATES].sort(() => Math.random() - 0.5),
    [customNatives],
  );

  useEffect(() => {
    return () => {
      detectorAbortRef.current?.abort();
      translationAbortRef.current?.abort();
      backAbortRef.current?.abort();
      nativeAbortRef.current?.abort();
    };
  }, []);

  const handleDetectorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = detectorInput.trim();
    if (!input) return;

    setDetectorLoading(true);
    setDetectorResult('');
    addStudyMinutes(1, 'think');

    const controller = new AbortController();
    detectorAbortRef.current = controller;

    try {
      let full = '';

      if (isConfigured) {
        const stream = aiStream(
          [
            {
              role: 'system',
              content: `You are an expert English teacher specializing in helping Chinese speakers eliminate "Chinglish" (Chinese-influenced English). Analyze the user's English sentence and provide a structured report:

## 🔍 Chinglish Detection Result

**Original:** \`<user's sentence>\`

**Chinglish Score:** X/10 (higher = more Chinese-influenced)

### ❌ Problems Found
1. **Issue:** [specific problem] → **Why it sounds Chinese:** [explanation of the Chinese thinking pattern]
2. ...

### ✅ Natural Alternatives
| Chinglish Expression | Natural English | Notes |
|---------------------|-----------------|-------|

### 🧠 Thinking Pattern Analysis
Explain the difference between the Chinese thinking pattern and the English thinking pattern behind this sentence.

### 💡 Key Takeaway
One actionable tip to avoid this pattern in the future.

Reply in Chinese (Simplified) so the learner can fully understand the analysis.`,
            },
            { role: 'user', content: `Please analyze this sentence: "${input}"` },
          ],
          { temperature: 0.3, signal: controller.signal },
        );

        for await (const chunk of stream) {
          if (chunk.content) {
            full += chunk.content;
            setDetectorResult(full);
          }
        }
      } else {
        const stream = capabilityClient
          .load(PLUGIN_IDS.CHINGLISH_DETECTION)
          .callStream('textGenerate', { english_sentence: input });

        for await (const chunk of stream as AsyncIterable<{ content?: string }>) {
          if (chunk.content) {
            full += chunk.content;
            setDetectorResult(full);
          }
        }
      }
    } catch (err) {
      toast.error('AI 服务暂不可用，请稍后重试');
      setDetectorResult('> ⚠️ AI 服务连接失败，请检查网络后重试。');
    } finally {
      setDetectorLoading(false);
      detectorAbortRef.current = null;
    }
  };

  const handleTranslationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = translationInput.trim();
    if (!input) return;

    const exercise = translationExercises[currentExerciseIdx];
    setTranslationLoading(true);
    setTranslationResult('');
    setShowNativeRef(true);
    addStudyMinutes(1, 'think');

    const controller = new AbortController();
    translationAbortRef.current = controller;

    try {
      let full = '';

      if (isConfigured) {
        const stream = aiStream(
          [
            {
              role: 'system',
              content: `You are an English thinking coach. The user has been given a scenario in Chinese and must describe it in English directly (without translating word-by-word). Compare their expression with the native reference and provide feedback.

Reply in Chinese for better understanding:

## 🎯 思维转译分析

**你的表达：** \`<user's English>\`
**母语者参考：** \`<native reference>\`

### 对比分析
- 你的表达中的亮点
- 与母语者表达的差异在哪里
- 是否存在"中式思维"痕迹

### 🧠 思维差异解读
解释中文母语者和英语母语者在描述这个场景时的思维方式差异。

### 📝 改进建议
具体的改进口语表达的建议。`,
            },
            {
              role: 'user',
              content: `Scenario: ${exercise.prompt}\n\nMy English expression: "${input}"\n\nNative speaker reference: "${exercise.nativeExpression}"\n\nPlease compare and provide feedback.`,
            },
          ],
          { temperature: 0.5, signal: controller.signal },
        );

        for await (const chunk of stream) {
          if (chunk.content) {
            full += chunk.content;
            setTranslationResult(full);
          }
        }
      } else {
        const stream = capabilityClient
          .load(PLUGIN_IDS.THOUGHT_TRANSLATION)
          .callStream('textGenerate', {
            user_english_expression: input,
            native_expression: exercise.nativeExpression,
          });

        for await (const chunk of stream as AsyncIterable<{ content?: string }>) {
          if (chunk.content) {
            full += chunk.content;
            setTranslationResult(full);
          }
        }
      }
    } catch (err) {
      toast.error('AI 服务暂不可用，请稍后重试');
      setTranslationResult('> ⚠️ AI 服务连接失败，请检查网络后重试。');
    } finally {
      setTranslationLoading(false);
      translationAbortRef.current = null;
    }
  };

  const handleBackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = backInput.trim();
    if (!input) return;

    const exercise = backExercises[currentBackIdx];
    setBackLoading(true);
    setBackResult('');
    setShowBackRef(true);
    addStudyMinutes(1, 'think');

    const controller = new AbortController();
    backAbortRef.current = controller;

    try {
      let full = '';

      if (isConfigured) {
        const stream = aiStream(
          [
            {
              role: 'system',
              content: `You are an English vocabulary coach. The user is given a keyword/phrase and must create a natural English sentence using it. Evaluate their sentence and provide feedback.

Reply in Chinese:

## 📝 造句评估

**关键词：** \`<keyword>\`
**你的句子：** \`<user's sentence>\`

### ✅ 评估结果
- 是否正确使用了关键词？
- 句子是否地道自然？
- 语法是否正确？

### 💡 改进建议
- 如何让句子更地道
- 其他使用这个词的场景举例`,
            },
            {
              role: 'user',
              content: `Keyword: "${exercise.keyword}"\nMeaning: ${exercise.meaning}\nScenario hint: ${exercise.scenarioHint}\n\nMy sentence: "${input}"\n\nPlease evaluate.`,
            },
          ],
          { temperature: 0.5, signal: controller.signal },
        );

        for await (const chunk of stream) {
          if (chunk.content) {
            full += chunk.content;
            setBackResult(full);
          }
        }
      } else {
        const stream = capabilityClient.load(PLUGIN_IDS.BACK_TRANSLATION).callStream('textGenerate', {
          original_sentence: input,
          target_meaning: exercise.scenarioHint,
        });

        for await (const chunk of stream as AsyncIterable<{ content?: string }>) {
          if (chunk.content) {
            full += chunk.content;
            setBackResult(full);
          }
        }
      }
    } catch (err) {
      toast.error('AI 服务暂不可用，请稍后重试');
      setBackResult('> ⚠️ AI 服务连接失败，请检查网络后重试。');
    } finally {
      setBackLoading(false);
      backAbortRef.current = null;
    }
  };

  const nextExercise = () => {
    setCurrentExerciseIdx((prev) => (prev + 1) % translationExercises.length);
    setTranslationInput('');
    setTranslationResult('');
    setShowNativeRef(false);
  };

  const toggleTranslationFavorite = () => {
    const exercise = translationExercises[currentExerciseIdx];
    const favorited = isFavorited(exercise.prompt, 'think');
    if (favorited) {
      const fav = favorites.find((f) => f.content === exercise.prompt && f.type === 'think');
      if (fav) removeFavorite(fav.id);
    } else {
      addFavorite({
        type: 'think',
        content: exercise.prompt,
        meaning: exercise.nativeExpression,
        example: exercise.explanation,
        category: exercise.category,
      });
    }
  };

  const nextBackExercise = () => {
    setCurrentBackIdx((prev) => (prev + 1) % backExercises.length);
    setBackInput('');
    setBackResult('');
    setShowBackRef(false);
  };

  const toggleBackFavorite = () => {
    const exercise = backExercises[currentBackIdx];
    const favorited = isFavorited(exercise.keyword, 'think');
    if (favorited) {
      const fav = favorites.find((f) => f.content === exercise.keyword && f.type === 'think');
      if (fav) removeFavorite(fav.id);
    } else {
      addFavorite({
        type: 'think',
        content: exercise.keyword,
        meaning: exercise.meaning,
        example: exercise.referenceSentence,
        category: 'backTranslation',
      });
    }
  };

  // Native thinking translation handlers
  const handleNativeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = nativeInput.trim();
    if (!input) return;

    const exercise = nativeExercises[currentNativeIdx];
    setNativeLoading(true);
    setNativeResult('');
    setShowNativeThinkRef(true);
    addStudyMinutes(1, 'think');

    const controller = new AbortController();
    nativeAbortRef.current = controller;

    try {
      let full = '';

      if (isConfigured) {
        const stream = aiStream(
          [
            {
              role: 'system',
              content: `You are an expert English thinking coach. The user is shown a Chinese sentence written from a native English speaker's thinking perspective. They must translate it to English and you will analyze the gap between their translation and natural native English.

Reply in Chinese:

## 🧠 思维还原分析

**你的翻译：** \`<user's English>\`
**母语者参考：** \`<native reference>\`

### 🔄 思维对比
- 你的表达和母语者的表达有什么不同？
- 你的表达中是否存在中式思维痕迹？
- 母语者为什么选择这样的表达方式？

### 💡 思维模式解读
分析这句中文背后反映的英语母语者思维习惯，以及中文母语者可能产生的理解偏差。

### 📝 关键要点
总结从这个练习中可以学到的母语思维技巧。`,
            },
            {
              role: 'user',
              content: `Chinese text (from English-thinking perspective): "${exercise.chineseText}"\n\nMy English translation: "${input}"\n\nNative reference: "${exercise.nativeEnglish}"\n\nThinking pattern explanation: ${exercise.thinkingPattern}\n\nPlease analyze the gap between my translation and the native expression, and explain the underlying thinking pattern difference.`,
            },
          ],
          { temperature: 0.5, signal: controller.signal },
        );

        for await (const chunk of stream) {
          if (chunk.content) {
            full += chunk.content;
            setNativeResult(full);
          }
        }
      } else {
        const stream = capabilityClient
          .load(PLUGIN_IDS.CHINGLISH_DETECTION)
          .callStream('textGenerate', {
            english_sentence: input,
          });

        for await (const chunk of stream as AsyncIterable<{ content?: string }>) {
          if (chunk.content) {
            full += chunk.content;
            setNativeResult(full);
          }
        }
      }
    } catch (err) {
      toast.error('AI 服务暂不可用，请稍后重试');
      setNativeResult('> ⚠️ AI 服务连接失败，请检查网络后重试。');
    } finally {
      setNativeLoading(false);
      nativeAbortRef.current = null;
    }
  };

  const nextNativeExercise = () => {
    setCurrentNativeIdx((prev) => (prev + 1) % nativeExercises.length);
    setNativeInput('');
    setNativeResult('');
    setShowNativeRef(false);
  };

  const toggleNativeFavorite = () => {
    const exercise = nativeExercises[currentNativeIdx];
    const favorited = isFavorited(exercise.chineseText, 'think');
    if (favorited) {
      const fav = favorites.find((f) => f.content === exercise.chineseText && f.type === 'think');
      if (fav) removeFavorite(fav.id);
    } else {
      addFavorite({
        type: 'think',
        content: exercise.chineseText,
        meaning: exercise.nativeEnglish,
        example: exercise.thinkingPattern,
        category: exercise.category,
      });
    }
  };

  const handleGenerateTranslation = async () => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    setGenLoading('translation');
    try {
      const result = await aiChat(
        [
          {
            role: 'system',
            content: `You are an English thinking coach for Chinese learners. Generate ONE scenario-based translation exercise. The user sees a Chinese scenario and must express it in natural English. Return ONLY valid JSON (no markdown):

{
  "prompt": "Chinese scenario description (e.g. 你想告诉朋友你最近工作很忙)",
  "nativeExpression": "Natural native English expression",
  "explanation": "Brief Chinese explanation of why this expression is natural",
  "category": "日常表达/职场沟通/社交互动"
}

Make the scenario practical and common in daily life. The nativeExpression should use authentic colloquial English.`,
          },
          { role: 'user', content: 'Generate a new Chinese-to-English thinking translation exercise.' },
        ],
        { temperature: 0.9, maxTokens: 1024 },
      );
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { toast.error('AI 返回格式异常'); return; }
      const parsed = JSON.parse(jsonMatch[0]);
      const newExercise: IThinkExercise = {
        id: `ai_t_${Date.now()}`,
        type: 'translation',
        prompt: parsed.prompt || '用英文表达这个场景',
        nativeExpression: parsed.nativeExpression || 'No expression generated.',
        explanation: parsed.explanation || '',
        difficulty: 'intermediate',
        category: parsed.category || '日常表达',
      };
      setCustomTranslations((prev) => [newExercise, ...prev]);
      setShowGenDialog(null);
      toast.success('AI 已生成新题目！');
    } catch {
      toast.error('AI 生成失败');
    } finally {
      setGenLoading(null);
    }
  };

  const handleGenerateBack = async () => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    setGenLoading('back');
    try {
      const result = await aiChat(
        [
          {
            role: 'system',
            content: `You are an English vocabulary coach. Generate ONE keyword-based sentence exercise for Chinese learners. The user gets a keyword/phrase and must create a natural English sentence. Return ONLY valid JSON (no markdown):

{
  "keyword": "English chunk/phrase",
  "meaning": "Chinese meaning",
  "referenceSentence": "A natural example sentence using the keyword",
  "referenceTranslation": "Chinese translation of the reference sentence",
  "scenarioHint": "Chinese hint about when to use this phrase"
}

The keyword should be a practical English chunk, idiom, or phrasal verb.`,
          },
          { role: 'user', content: 'Generate a new English chunk sentence-making exercise.' },
        ],
        { temperature: 0.9, maxTokens: 1024 },
      );
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { toast.error('AI 返回格式异常'); return; }
      const parsed = JSON.parse(jsonMatch[0]);
      const newExercise: IBackTranslation = {
        id: `ai_b_${Date.now()}`,
        keyword: parsed.keyword || 'look into',
        meaning: parsed.meaning || '调查',
        difficulty: 'intermediate',
        referenceSentence: parsed.referenceSentence || '',
        referenceTranslation: parsed.referenceTranslation || '',
        scenarioHint: parsed.scenarioHint || '日常使用',
      };
      setCustomBacks((prev) => [newExercise, ...prev]);
      setShowGenDialog(null);
      toast.success('AI 已生成新题目！');
    } catch {
      toast.error('AI 生成失败');
    } finally {
      setGenLoading(null);
    }
  };

  const handleGenerateNative = async () => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    setGenLoading('native');
    try {
      const result = await aiChat(
        [
          {
            role: 'system',
            content: `You are an English thinking coach. Generate ONE "native thinking" exercise. The user sees a Chinese text written from an English-native-thinker's perspective and must translate it to English to discover the thinking gap. Return ONLY valid JSON (no markdown):

{
  "chineseText": "Chinese sentence that reflects English-native thinking structure",
  "nativeEnglish": "How a native English speaker would naturally express this",
  "thinkingPattern": "Chinese explanation of the thinking pattern difference",
  "category": "思维差异/表达习惯/句式对比"
}

The chineseText should subtly embed English thinking patterns so learners discover the difference.`,
          },
          { role: 'user', content: 'Generate a new native-thinking translation exercise.' },
        ],
        { temperature: 0.9, maxTokens: 1024 },
      );
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { toast.error('AI 返回格式异常'); return; }
      const parsed = JSON.parse(jsonMatch[0]);
      const newExercise: INativeTranslate = {
        id: `ai_n_${Date.now()}`,
        chineseText: parsed.chineseText || '',
        nativeEnglish: parsed.nativeEnglish || '',
        thinkingPattern: parsed.thinkingPattern || '',
        difficulty: 'intermediate',
        category: parsed.category || '思维差异',
      };
      setCustomNatives((prev) => [newExercise, ...prev]);
      setShowGenDialog(null);
      toast.success('AI 已生成新题目！');
    } catch {
      toast.error('AI 生成失败');
    } finally {
      setGenLoading(null);
    }
  };

  const handleDeleteTranslation = () => {
    const ex = translationExercises[currentExerciseIdx];
    if (ex.id.startsWith('ai_')) {
      setCustomTranslations((prev) => prev.filter((e) => e.id !== ex.id));
      if (currentExerciseIdx >= translationExercises.length - 1) setCurrentExerciseIdx(Math.max(0, currentExerciseIdx - 1));
    }
  };
  const handleDeleteBack = () => {
    const ex = backExercises[currentBackIdx];
    if (ex.id.startsWith('ai_')) {
      setCustomBacks((prev) => prev.filter((e) => e.id !== ex.id));
      if (currentBackIdx >= backExercises.length - 1) setCurrentBackIdx(Math.max(0, currentBackIdx - 1));
    }
  };
  const handleDeleteNative = () => {
    const ex = nativeExercises[currentNativeIdx];
    if (ex.id.startsWith('ai_')) {
      setCustomNatives((prev) => prev.filter((e) => e.id !== ex.id));
      if (currentNativeIdx >= nativeExercises.length - 1) setCurrentNativeIdx(Math.max(0, currentNativeIdx - 1));
    }
  };

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">
            Think in English
          </p>
          <h1 className="text-3xl font-black italic text-foreground tracking-tight">
            母语思维训练
          </h1>
          <p className="text-muted-foreground mt-2 text-sm font-medium">
            摆脱中式英语，建立像 native speaker 一样的英语思维
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted p-1.5 rounded-3xl h-auto flex-wrap">
          <TabsTrigger
            value="detector"
            className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm"
          >
            <Search className="size-4 mr-2" />
            中式英语检测
          </TabsTrigger>
          <TabsTrigger
            value="translation"
            className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm"
          >
            <ArrowRight className="size-4 mr-2" />
            思维转译
          </TabsTrigger>
          <TabsTrigger
            value="backTranslation"
            className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm"
          >
            <Brain className="size-4 mr-2" />
            反翻译训练
          </TabsTrigger>
          <TabsTrigger
            value="nativeTranslate"
            className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm"
          >
            <Sparkles className="size-4 mr-2" />
            思维还原
          </TabsTrigger>
        </TabsList>

        {/* Detector Tab */}
        <TabsContent value="detector" className="space-y-6 mt-6">
          <Card className="rounded-[40px] border-border shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 text-[#00B894] flex items-center justify-center">
                  <Search className="size-5.5" />
                </div>
                <div>
                  <CardTitle className="text-xl font-[900] italic text-foreground">
                    中式英语检测器
                  </CardTitle>
                  <CardDescription className="text-sm font-medium mt-1">
                    输入你的英文句子，AI 会帮你找出中式思维表达，给出地道说法并解释思维差异
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleDetectorSubmit}>
                <Textarea
                  value={detectorInput}
                  onChange={(e) => setDetectorInput(e.target.value)}
                  placeholder="输入你想检测的英文句子，例如：I very like this book."
                  className="min-h-[140px] resize-y rounded-3xl border-border bg-muted/30 focus-visible:ring-2 focus-visible:ring-emerald-200 text-base"
                />
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-4">
                  <div className="flex gap-2 flex-wrap border-[#ec83e1]">
                    {EXAMPLE_SENTENCES.map((s) => (
                      <div key={s} className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setDetectorInput(s)}
                          className="rounded-xl text-sm font-normal normal-case tracking-normal"
                        >
                          {s.length > 28 ? s.slice(0, 28) + '...' : s}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => tts.speak(s)}
                          className="rounded-xl size-7 text-muted-foreground hover:text-[#00B894] shrink-0"
                        >
                          <Volume2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="submit"
                    disabled={detectorLoading || !detectorInput.trim()}
                    className="bg-[#00B894] hover:bg-[#00A080] text-white px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30"
                  >
                    {detectorLoading ? (
                      <>
                        <Loader2 className="size-4 mr-2 animate-spin" />
                        分析中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-4 mr-2" />
                        开始检测
                      </>
                    )}
                  </Button>
                </div>
              </form>

              {detectorResult && (
                <Card className="rounded-[32px] border-emerald-200/50 bg-emerald-50/30 dark:bg-emerald-500/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-black uppercase tracking-wider flex items-center gap-2 text-[#00B894]">
                      <Lightbulb className="size-4.5" />
                      分析结果
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{detectorResult}</ReactMarkdown>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Translation Tab */}
        <TabsContent value="translation" className="space-y-6 mt-0">
          <Card className="rounded-[40px] border-border shadow-sm">
            <CardHeader className="pb-4 flex flex-row items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-500 flex items-center justify-center">
                  <ArrowRight className="size-5.5" />
                </div>
                <div>
                  <CardTitle className="text-xl font-[900] italic text-foreground">
                    思维转译练习
                  </CardTitle>
                  <CardDescription className="text-sm font-medium mt-1">
                    看到中文场景，直接用英语描述画面，不要逐字翻译
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTranslationFavorite}
                  className={cn(
                    'rounded-xl size-8',
                    isFavorited(translationExercises[currentExerciseIdx]?.prompt || '', 'think')
                      ? 'text-rose-500'
                      : 'text-muted-foreground hover:text-rose-500',
                  )}
                >
                  <Heart className={cn('size-4', isFavorited(translationExercises[currentExerciseIdx]?.prompt || '', 'think') && 'fill-current')} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={nextExercise}
                  className="shrink-0 gap-1.5 rounded-2xl text-[10px] font-black uppercase tracking-wider border-border hover:border-[#00B894] hover:text-[#00B894]"
                >
                  <RefreshCw className="size-3.5" />
                  换一题
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateTranslation}
                  disabled={genLoading === 'translation'}
                  className="shrink-0 gap-1.5 rounded-2xl text-[10px] font-black uppercase tracking-wider border-violet-300 text-violet-500 hover:bg-violet-50 dark:bg-violet-500/15"
                >
                  {genLoading === 'translation' ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                  AI 出题
                </Button>
                {translationExercises[currentExerciseIdx]?.id.startsWith('ai_') && (
                  <Button variant="ghost" size="icon" onClick={handleDeleteTranslation}
                    className="shrink-0 rounded-xl size-8 text-muted-foreground/50 hover:text-rose-500" title="删除此题">
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-6 rounded-[32px] bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2 mb-4">
                  <Badge
                    variant="outline"
                    className="text-[10px] font-black uppercase tracking-wider rounded-full px-3 py-1 border-border"
                  >
                    {translationExercises[currentExerciseIdx].category}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-black uppercase tracking-wider rounded-full px-3 py-1 bg-muted"
                  >
                    {translationExercises[currentExerciseIdx].difficulty === 'beginner'
                      ? '初级'
                      : translationExercises[currentExerciseIdx].difficulty === 'intermediate'
                        ? '中级'
                        : '高级'}
                  </Badge>
                </div>
                <p className="text-xl font-black text-foreground leading-relaxed">
                  {translationExercises[currentExerciseIdx].prompt}
                </p>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-4 flex items-center gap-2">
                  <Sparkles className="size-3.5 text-[#00B894]" />
                  提示：闭上眼睛想象画面，用英语直接描述你看到的场景
                </p>
              </div>

              <form onSubmit={handleTranslationSubmit}>
                <Textarea
                  value={translationInput}
                  onChange={(e) => setTranslationInput(e.target.value)}
                  placeholder="用英语描述这个场景..."
                  className="min-h-[120px] resize-y rounded-3xl border-border bg-muted/30 focus-visible:ring-2 focus-visible:ring-emerald-200 text-base"
                />
                <div className="flex justify-end gap-3 mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowNativeRef(!showNativeRef)}
                    className="rounded-2xl text-[10px] font-black uppercase tracking-wider border-border hover:border-[#00B894] hover:text-[#00B894]"
                  >
                    {showNativeRef ? '隐藏参考' : '查看母语者表达'}
                  </Button>
                  <Button
                    type="submit"
                    disabled={translationLoading || !translationInput.trim()}
                    className="bg-[#00B894] hover:bg-[#00A080] text-white px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30"
                  >
                    {translationLoading ? (
                      <>
                        <Loader2 className="size-4 mr-2 animate-spin" />
                        分析中...
                      </>
                    ) : (
                      '提交并获取反馈'
                    )}
                  </Button>
                </div>
              </form>

              {showNativeRef && (
                <Card className="rounded-[32px] border-emerald-200/50 bg-emerald-50/30 dark:bg-emerald-500/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-black uppercase tracking-wider flex items-center gap-2 text-emerald-600">
                      <CheckCircle2 className="size-4.5" />
                      母语者参考表达
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-lg font-black text-foreground">
                      {translationExercises[currentExerciseIdx].nativeExpression}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => tts.speak(translationExercises[currentExerciseIdx].nativeExpression)}
                      className="rounded-xl size-7 text-muted-foreground hover:text-[#00B894] -mt-1"
                    >
                      <Volume2 className="size-4" />
                    </Button>
                    <p className="text-sm text-muted-foreground font-medium">
                      {translationExercises[currentExerciseIdx].explanation}
                    </p>
                  </CardContent>
                </Card>
              )}

              {translationResult && (
                <Card className="rounded-[32px] border-[#00B894]/20 bg-[#00B894]/5 dark:border-[#00B894]/30 dark:bg-[#00B894]/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-black uppercase tracking-wider flex items-center gap-2 text-[#00B894]">
                      <Lightbulb className="size-4.5" />
                      AI 思维转译指导
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{translationResult}</ReactMarkdown>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Back Translation Tab */}
        <TabsContent value="backTranslation" className="space-y-6 mt-0">
          <Card className="rounded-[40px] border-border shadow-sm">
            <CardHeader className="pb-4 flex flex-row items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-2xl bg-orange-50 dark:bg-orange-500/15 text-orange-500 flex items-center justify-center">
                  <XCircle className="size-5.5" />
                </div>
                <div>
                  <CardTitle className="text-xl font-[900] italic text-foreground">
                    反翻译训练
                  </CardTitle>
                  <CardDescription className="text-sm font-medium mt-1">
                    看到英文关键词，直接扩展成完整的情境句子，培养英语思维
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleBackFavorite}
                  className={cn(
                    'rounded-xl size-8',
                    isFavorited(backExercises[currentBackIdx]?.keyword || '', 'think')
                      ? 'text-rose-500'
                      : 'text-muted-foreground hover:text-rose-500',
                  )}
                >
                  <Heart className={cn('size-4', isFavorited(backExercises[currentBackIdx]?.keyword || '', 'think') && 'fill-current')} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={nextBackExercise}
                  className="shrink-0 gap-1.5 rounded-2xl text-[10px] font-black uppercase tracking-wider border-border hover:border-[#00B894] hover:text-[#00B894]"
                >
                  <RefreshCw className="size-3.5" />
                  换一题
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateBack}
                  disabled={genLoading === 'back'}
                  className="shrink-0 gap-1.5 rounded-2xl text-[10px] font-black uppercase tracking-wider border-violet-300 text-violet-500 hover:bg-violet-50 dark:bg-violet-500/15"
                >
                  {genLoading === 'back' ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                  AI 出题
                </Button>
                {backExercises[currentBackIdx]?.id.startsWith('ai_') && (
                  <Button variant="ghost" size="icon" onClick={handleDeleteBack}
                    className="shrink-0 rounded-xl size-8 text-muted-foreground/50 hover:text-rose-500" title="删除此题">
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-6 rounded-[32px] bg-gradient-to-br from-[#00B894]/5 to-emerald-50 dark:from-[#00B894]/10 dark:to-emerald-500/10 border border-[#00B894]/10">
                <div className="flex items-center gap-2 mb-4">
                  <Badge className="text-[10px] font-black uppercase tracking-wider rounded-full px-3 py-1 bg-[#00B894]/15 dark:bg-[#00B894]/25 text-[#00B894] border-none">
                    关键词
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-black uppercase tracking-wider rounded-full px-3 py-1 bg-muted"
                  >
                    {backExercises[currentBackIdx].difficulty === 'beginner'
                      ? '初级'
                      : backExercises[currentBackIdx].difficulty === 'intermediate'
                        ? '中级'
                        : '高级'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-3xl font-black italic text-foreground tracking-tight">
                    {backExercises[currentBackIdx].keyword}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => tts.speak(backExercises[currentBackIdx].keyword)}
                    className="rounded-xl size-7 text-muted-foreground hover:text-[#00B894] shrink-0"
                  >
                    <Volume2 className="size-4" />
                  </Button>
                </div>
                <p className="text-base text-muted-foreground font-medium">
                  {backExercises[currentBackIdx].meaning}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-4">
                  💡 场景提示：{backExercises[currentBackIdx].scenarioHint}
                </p>
              </div>

              <form onSubmit={handleBackSubmit}>
                <Textarea
                  value={backInput}
                  onChange={(e) => setBackInput(e.target.value)}
                  placeholder="用这个关键词造一个完整的情境句子..."
                  className="min-h-[120px] resize-y rounded-3xl border-border bg-muted/30 focus-visible:ring-2 focus-visible:ring-emerald-200 text-base"
                />
                <div className="flex justify-end gap-3 mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowBackRef(!showBackRef)}
                    className="rounded-2xl text-[10px] font-black uppercase tracking-wider border-border hover:border-[#00B894] hover:text-[#00B894]"
                  >
                    {showBackRef ? '隐藏参考' : '查看参考句子'}
                  </Button>
                  <Button
                    type="submit"
                    disabled={backLoading || !backInput.trim()}
                    className="bg-[#00B894] hover:bg-[#00A080] text-white px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30"
                  >
                    {backLoading ? (
                      <>
                        <Loader2 className="size-4 mr-2 animate-spin" />
                        分析中...
                      </>
                    ) : (
                      '提交并获取反馈'
                    )}
                  </Button>
                </div>
              </form>

              {showBackRef && (
                <Card className="rounded-[32px] border-emerald-200/50 bg-emerald-50/30 dark:bg-emerald-500/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-black uppercase tracking-wider flex items-center gap-2 text-emerald-600">
                      <CheckCircle2 className="size-4.5" />
                      参考地道句子
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-black text-foreground">
                        {backExercises[currentBackIdx].referenceSentence}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => tts.speak(backExercises[currentBackIdx].referenceSentence)}
                        className="rounded-xl size-7 text-muted-foreground hover:text-[#00B894] shrink-0"
                      >
                        <Volume2 className="size-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">
                      {backExercises[currentBackIdx].referenceTranslation}
                    </p>
                  </CardContent>
                </Card>
              )}

              {backResult && (
                <Card className="rounded-[32px] border-[#00B894]/20 bg-[#00B894]/5 dark:border-[#00B894]/30 dark:bg-[#00B894]/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-black uppercase tracking-wider flex items-center gap-2 text-[#00B894]">
                      <Lightbulb className="size-4.5" />
                      AI 评价与建议
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{backResult}</ReactMarkdown>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Native Thinking Translation Tab */}
        <TabsContent value="nativeTranslate" className="space-y-6 mt-0">
          <Card className="rounded-[40px] border-border shadow-sm">
            <CardHeader className="pb-4 flex flex-row items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-2xl bg-violet-50 dark:bg-violet-500/15 text-violet-500 flex items-center justify-center">
                  <Sparkles className="size-5.5" />
                </div>
                <div>
                  <CardTitle className="text-xl font-[900] italic text-foreground">
                    思维还原
                  </CardTitle>
                  <CardDescription className="text-sm font-medium mt-1">
                    看到用英语思维写出的中文，还原成地道的英语表达，体会母语者的思维逻辑
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleNativeFavorite}
                  className={cn(
                    'rounded-xl size-8',
                    isFavorited(nativeExercises[currentNativeIdx]?.chineseText || '', 'think')
                      ? 'text-rose-500'
                      : 'text-muted-foreground hover:text-rose-500',
                  )}
                >
                  <Heart className={cn('size-4', isFavorited(nativeExercises[currentNativeIdx]?.chineseText || '', 'think') && 'fill-current')} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={nextNativeExercise}
                  className="shrink-0 gap-1.5 rounded-2xl text-[10px] font-black uppercase tracking-wider border-border hover:border-[#00B894] hover:text-[#00B894]"
                >
                  <RefreshCw className="size-3.5" />
                  换一题
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateNative}
                  disabled={genLoading === 'native'}
                  className="shrink-0 gap-1.5 rounded-2xl text-[10px] font-black uppercase tracking-wider border-violet-300 text-violet-500 hover:bg-violet-50 dark:bg-violet-500/15"
                >
                  {genLoading === 'native' ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                  AI 出题
                </Button>
                {nativeExercises[currentNativeIdx]?.id.startsWith('ai_') && (
                  <Button variant="ghost" size="icon" onClick={handleDeleteNative}
                    className="shrink-0 rounded-xl size-8 text-muted-foreground/50 hover:text-rose-500" title="删除此题">
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-6 rounded-[32px] bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 dark:from-violet-500/10 dark:to-purple-500/10 dark:border-violet-500/20">
                <div className="flex items-center gap-2 mb-4">
                  <Badge className="text-[10px] font-black uppercase tracking-wider rounded-full px-3 py-1 bg-violet-100 text-violet-600 border-none">
                    {nativeExercises[currentNativeIdx].category}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-black uppercase tracking-wider rounded-full px-3 py-1 bg-muted"
                  >
                    {nativeExercises[currentNativeIdx].difficulty === 'beginner'
                      ? '初级'
                      : nativeExercises[currentNativeIdx].difficulty === 'intermediate'
                        ? '中级'
                        : '高级'}
                  </Badge>
                </div>
                <p className="text-xl font-black text-foreground leading-relaxed">
                  {nativeExercises[currentNativeIdx].chineseText}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-4 flex items-center gap-2">
                  <Sparkles className="size-3.5 text-violet-500" />
                  提示：这句中文是用英语母语者的思维方式写的，试着还原成地道的英语
                </p>
              </div>

              <form onSubmit={handleNativeSubmit}>
                <Textarea
                  value={nativeInput}
                  onChange={(e) => setNativeInput(e.target.value)}
                  placeholder="用英语还原这句话..."
                  className="min-h-[120px] resize-y rounded-3xl border-border bg-muted/30 focus-visible:ring-2 focus-visible:ring-violet-200 text-base"
                />
                <div className="flex justify-end gap-3 mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowNativeThinkRef(!showNativeThinkRef)}
                    className="rounded-2xl text-[10px] font-black uppercase tracking-wider border-border hover:border-[#00B894] hover:text-[#00B894]"
                  >
                    {showNativeThinkRef ? '隐藏参考' : '查看母语者表达'}
                  </Button>
                  <Button
                    type="submit"
                    disabled={nativeLoading || !nativeInput.trim()}
                    className="bg-violet-500 hover:bg-violet-600 text-white px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-violet-200/50"
                  >
                    {nativeLoading ? (
                      <>
                        <Loader2 className="size-4 mr-2 animate-spin" />
                        分析中...
                      </>
                    ) : (
                      '提交并获取反馈'
                    )}
                  </Button>
                </div>
              </form>

              {showNativeThinkRef && (
                <Card className="rounded-[32px] border-violet-200/50 bg-violet-50/30 dark:bg-violet-500/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-black uppercase tracking-wider flex items-center gap-2 text-violet-600">
                      <CheckCircle2 className="size-4.5" />
                      母语者表达 & 思维解析
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-black text-foreground">
                        {nativeExercises[currentNativeIdx].nativeEnglish}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => tts.speak(nativeExercises[currentNativeIdx].nativeEnglish)}
                        className="rounded-xl size-7 text-muted-foreground hover:text-[#00B894] shrink-0"
                      >
                        <Volume2 className="size-4" />
                      </Button>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/60 border border-violet-100 dark:bg-foreground/10 dark:border-violet-500/20">
                      <p className="text-[10px] font-black uppercase tracking-wider text-violet-500 mb-1">
                        思维模式解读
                      </p>
                      <p className="text-sm text-foreground/80 font-medium leading-relaxed">
                        {nativeExercises[currentNativeIdx].thinkingPattern}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {nativeResult && (
                <Card className="rounded-[32px] border-violet-200/50 bg-violet-50/30 dark:bg-violet-500/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-black uppercase tracking-wider flex items-center gap-2 text-violet-600">
                      <Lightbulb className="size-4.5" />
                      AI 思维还原分析
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{nativeResult}</ReactMarkdown>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
}
