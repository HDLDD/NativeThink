import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Flame,
  Target,
  Brain,
  Puzzle,
  MessageSquare,
  Mic,
  BookOpen,
  BarChart3,
  Play,
  Heart,
  Quote,
  ArrowUpRight,
  Sparkles,
  Clock,
  TrendingUp,
  Calendar,
  Volume2,
  Languages,
  PenLine,
  RefreshCw,
  Wand2,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLearningStats } from '@/lib/use-learning-stats';
import { useFavorites } from '@/lib/use-favorites';
import { MOCK_CHUNKS } from '@/data/chunks';
import { cn, cleanText } from '@/lib/utils';
import { useTTS } from '@/lib/use-tts';
import { toast } from 'sonner';
import { useAI } from '@/hooks/use-ai';
import { safeStorage } from '@/lib/safe-storage';

const QUICK_ENTRIES = [
  {
    path: '/think',
    label: '母语思维训练',
    icon: Brain,
    color: 'from-[#00B894] to-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-500/15',
    desc: '摆脱中式英语',
  },
  {
    path: '/chunks',
    label: '语块训练',
    icon: Puzzle,
    color: 'from-[#1F2937] to-gray-600',
    bg: 'bg-gray-50 dark:bg-gray-800',
    desc: '积累地道表达',
  },
  {
    path: '/conversation',
    label: 'AI 对话练习',
    icon: MessageSquare,
    color: 'from-[#6366F1] to-indigo-400',
    bg: 'bg-indigo-50 dark:bg-indigo-500/15',
    desc: '角色扮演对话',
  },
  {
    path: '/shadowing',
    label: '影子跟读',
    icon: Mic,
    color: 'from-[#F97316] to-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-500/15',
    desc: '训练语音语调',
  },
  {
    path: '/vocabulary',
    label: '词汇深度',
    icon: BookOpen,
    color: 'from-[#EC4899] to-pink-400',
    bg: 'bg-pink-50 dark:bg-pink-500/15',
    desc: '四级/六级/雅思/托福',
  },
  {
    path: '/writing',
    label: 'AI 写作练习',
    icon: PenLine,
    color: 'from-violet-500 to-purple-500',
    bg: 'bg-violet-50 dark:bg-violet-500/15',
    desc: 'AI 批改提升写作',
  },
];

const MODULES = [
  { key: 'think', label: '思维训练', icon: Brain, color: '#00B894' },
  { key: 'chunks', label: '语块训练', icon: Puzzle, color: '#1F2937' },
  { key: 'conversation', label: '对话练习', icon: MessageSquare, color: '#6366F1' },
  { key: 'shadowing', label: '影子跟读', icon: Mic, color: '#F97316' },
  { key: 'vocabulary', label: '词汇深度', icon: BookOpen, color: '#EC4899' },
  { key: 'writing', label: '写作练习', icon: PenLine, color: '#8B5CF6' },
] as const;

function RingProgress({
  value,
  label,
  icon: Icon,
  color,
}: {
  value: number;
  label: string;
  icon: typeof Brain;
  color: string;
}) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-3 group">
      <div className="relative size-24">
        <svg className="size-full -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40"
            cy="40"
            r={radius}
            stroke="currentColor"
            strokeWidth="6"
            fill="none"
            className="text-gray-100 dark:text-gray-800"
          />
          <circle
            cx="40"
            cy="40"
            r={radius}
            stroke={color}
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            className="size-8 rounded-xl flex items-center justify-center mb-1 transition-all group-hover:scale-110"
            style={{ backgroundColor: `${color}15`, color }}
          >
            <Icon className="size-4" />
          </div>
          <span className="text-lg font-black italic text-foreground tabular-nums tracking-tight">
            {Math.round(value)}%
          </span>
        </div>
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">
        {label}
      </span>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  trend,
  trendUp = true,
  color = '#00B894',
  onClick,
}: {
  icon: typeof Flame;
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  color?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className="border-border shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group cursor-pointer rounded-[32px]"
      onClick={onClick}
    >
      <CardContent className="p-6 h-full flex flex-col justify-between">
        <div className="flex items-center justify-between mb-6">
          <div
            className="size-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110"
            style={{ backgroundColor: `${color}10`, color }}
          >
            <Icon className="size-5.5" />
          </div>
          {trend && (
            <div
              className={cn(
                'flex items-center gap-1 text-[11px] font-black',
                trendUp ? 'text-emerald-500' : 'text-rose-500',
              )}
            >
              <ArrowUpRight className={cn('size-3.5', !trendUp && 'rotate-180')} />
              {trend}
            </div>
          )}
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
            {label}
          </p>
          <p
            className="text-2xl font-black text-foreground transition-colors group-hover:text-[#00B894]"
            style={{ fontFeatureSettings: "'cv11'" }}
          >
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { stats, loaded } = useLearningStats();
  const { addFavorite, isFavorited, favorites, removeFavorite } = useFavorites();
  const tts = useTTS();
  const { isConfigured, chat: aiChat } = useAI();

  const pickRandomChunk = () => MOCK_CHUNKS[Math.floor(Math.random() * MOCK_CHUNKS.length)];
  const [dailyChunk, setDailyChunk] = useState(pickRandomChunk);
  const [chunkLoading, setChunkLoading] = useState(false);
  const [exampleZh, setExampleZh] = useState('');

  // Save initial chunk to history on mount (only once)
  const didSaveRef = useRef(false);
  useEffect(() => {
    if (didSaveRef.current) return;
    const today = new Date().toISOString().slice(0, 10);
    setHistory((prev) => {
      const alreadySaved = prev.some((h) => h.date === today && h.content === dailyChunk.content);
      if (alreadySaved) return prev;
      const updated = [{ date: today, content: dailyChunk.content, meaning: dailyChunk.meaning, example: dailyChunk.example }, ...prev].slice(0, 1000);
      safeStorage.setItem('__nativethink_daily_history', JSON.stringify(updated));
      return updated;
    });
    didSaveRef.current = true;
  }, [dailyChunk]);

  // History: store daily chunks for cross-month calendar access
  const todayDate = new Date();
  const [history, setHistory] = useState<{ date: string; content: string; meaning: string; example: string }[]>(() => {
    try { const s = safeStorage.getItem('__nativethink_daily_history'); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [historyMonth, setHistoryMonth] = useState(() => todayDate.getMonth());
  const [historyYear, setHistoryYear] = useState(() => todayDate.getFullYear());

  const historyByDate = useMemo(() => {
    const map: Record<string, typeof history> = {};
    history.forEach((h) => { map[h.date] = [...(map[h.date] || []), h]; });
    return map;
  }, [history]);

  const monthDays = useMemo(() => {
    const daysInMonth = new Date(historyYear, historyMonth + 1, 0).getDate();
    const firstDay = new Date(historyYear, historyMonth, 1).getDay();
    const days: { date: string; day: number; isCurrentMonth: boolean }[] = [];
    // Fill in previous month tail
    const prevDays = new Date(historyYear, historyMonth, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = new Date(historyYear, historyMonth - 1, prevDays - i);
      days.push({ date: d.toISOString().slice(0, 10), day: prevDays - i, isCurrentMonth: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(historyYear, historyMonth, i);
      days.push({ date: d.toISOString().slice(0, 10), day: i, isCurrentMonth: true });
    }
    return days;
  }, [historyYear, historyMonth]);

  const monthLabel = `${historyYear}年 ${historyMonth + 1}月`;
  const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];

  const saveToHistory = (chunk: typeof dailyChunk) => {
    const today = new Date().toISOString().slice(0, 10);
    setHistory((prev) => {
      // 去重：同一天不重复保存相同内容的句子
      const alreadySaved = prev.some((h) => h.date === today && h.content === chunk.content);
      if (alreadySaved) return prev;
      const updated = [{ date: today, content: chunk.content, meaning: chunk.meaning, example: chunk.example }, ...prev].slice(0, 1000);
      safeStorage.setItem('__nativethink_daily_history', JSON.stringify(updated));
      return updated;
    });
  };

  const handleShuffleChunk = () => {
    const c = pickRandomChunk();
    setDailyChunk(c);
    setExampleZh('');
    saveToHistory(c);
  };

  const handleAiGenerateChunk = async () => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    setChunkLoading(true);
    try {
      const result = await aiChat(
        [
          { role: 'system', content: `You are an English teacher. Create ONE English chunk/idiom/phrasal verb that native speakers commonly use. Return ONLY valid JSON (no markdown): {"content": "the chunk", "meaning": "Chinese meaning", "example": "a natural example sentence using the chunk", "exampleZh": "Chinese translation of the example sentence", "category": "daily/workplace/social/emotion", "difficulty": "beginner/intermediate/advanced"}` },
          { role: 'user', content: 'Generate a new English chunk/expression for daily learning. Make it practical and commonly used.' },
        ],
        { temperature: 0.9, maxTokens: 512 },
      );
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { toast.error('AI 返回格式异常'); return; }
      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.content || !parsed.meaning) { toast.error('AI 生成内容不完整'); return; }
      const c = {
        id: `ai_${Date.now()}`,
        content: parsed.content,
        meaning: parsed.meaning,
        example: parsed.example || `Here's an example with "${parsed.content}".`,
        category: parsed.category || 'daily',
        difficulty: parsed.difficulty || 'intermediate',
        usage: 'AI 生成的日常表达',
      };
      setDailyChunk(c);
      setExampleZh(parsed.exampleZh || '');
      saveToHistory(c);
      toast.success('AI 已生成新的每日一句！');
    } catch (e) { console.error('AI daily chunk generation failed:', e); toast.error('AI 生成失败，请重试'); }
    finally { setChunkLoading(false); }
  };

  const handleTranslateExample = async () => {
    if (exampleZh) return;
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    try {
      const result = await aiChat(
        [
          { role: 'system', content: 'Translate the following English sentence to natural Chinese. Return ONLY the Chinese text, nothing else.' },
          { role: 'user', content: dailyChunk.example },
        ],
        { temperature: 0.3, maxTokens: 256 },
      );
      if (result) setExampleZh(result.trim());
    } catch (e) { console.error('Example translation failed:', e); toast.error('翻译失败'); }
  };

  const favorited = isFavorited(dailyChunk.content, 'chunk');
  const [showLearnDialog, setShowLearnDialog] = useState(false);

  const learningOptions = [
    { path: '/think', label: '母语思维训练', icon: Brain, color: 'from-[#00B894] to-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/15', desc: '摆脱中式英语，建立英语思维' },
    { path: '/chunks', label: '语块训练', icon: Puzzle, color: 'from-[#1F2937] to-gray-600', bg: 'bg-gray-50 dark:bg-gray-800', desc: '积累高频母语语块' },
    { path: '/conversation', label: 'AI 对话练习', icon: MessageSquare, color: 'from-[#6366F1] to-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-500/15', desc: '角色扮演自由对话' },
    { path: '/shadowing', label: '影子跟读', icon: Mic, color: 'from-[#F97316] to-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/15', desc: '训练语音语调' },
    { path: '/vocabulary', label: '每日背单词', icon: Target, color: 'from-amber-500 to-orange-500', bg: 'bg-amber-50 dark:bg-amber-500/15', desc: '间隔重复科学记忆' },
    { path: '/writing', label: 'AI 写作练习', icon: PenLine, color: 'from-violet-500 to-purple-500', bg: 'bg-violet-50 dark:bg-violet-500/15', desc: 'AI 批改提升写作' },
  ];

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">加载中...</div>
    );
  }

  const progressPercent = Math.min(100, (stats.todayMinutes / stats.dailyGoalMinutes) * 100);

  return (
    <div className="space-y-10">
      {/* Hero + KPI 区域 */}
      <div className="grid grid-cols-12 gap-8">
        {/* Hero 大卡片 - 7/12 */}
        <Card className="col-span-12 lg:col-span-7 rounded-[48px] border-border shadow-sm overflow-hidden relative">
          <CardContent className="p-12 min-h-[400px] flex items-center relative overflow-hidden">
            {/* 背景装饰大字 */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[180px] font-black text-muted/30 italic tracking-tighter leading-none opacity-50 pointer-events-none select-none">
              THINK
            </div>

            {/* 右侧装饰图标 */}
            <div className="absolute right-[-30px] top-1/2 -translate-y-1/2 w-2/5 opacity-95">
              <Brain
                className="w-full h-auto text-[#00B894] -rotate-[12deg] drop-shadow-[0_35px_35px_rgba(0_184_148_0.15)]"
                strokeWidth={1.5}
              />
            </div>

            <div className="relative z-10 w-3/5">
              <div className="flex items-center justify-between mb-8">
                <div className="inline-flex items-center gap-2 bg-emerald-50 text-[#00B894] px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                  <Sparkles className="size-3.5" />
                  Daily Learning
                </div>
              </div>
              <h2 className="text-5xl font-black text-foreground mb-4 leading-[1.1] tracking-tight">
                用母语思维
                <br />
                <span className="text-[#00B894] italic">说地道英语</span>
              </h2>
              <p className="text-muted-foreground text-sm font-medium mb-10 max-w-sm leading-relaxed">
                摆脱中式英语，建立像 native speaker 一样的英语思维。每天 30 分钟，让英语成为你的本能。
              </p>
              <Button
                size="lg"
                onClick={() => setShowLearnDialog(true)}
                className="bg-[#00B894] hover:bg-[#00A080] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-xl shadow-emerald-200/50 dark:shadow-emerald-900/30 hover:scale-105 transition-all gap-2"
              >
                <Play className="size-4" />
                开始今日学习
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* KPI 四宫格 - 5/12 */}
        <div className="col-span-12 lg:col-span-5 grid grid-cols-2 gap-4">
          <KpiCard
            icon={Flame}
            label="连续天数"
            value={`${stats.streakDays} 天`}
            trend="+12%"
            color="#F97316"
            onClick={() => navigate('/progress')}
          />
          <KpiCard
            icon={Target}
            label="今日目标"
            value={`${Math.round(stats.todayMinutes)}/${stats.dailyGoalMinutes}m`}
            trend="50%"
            color="#00B894"
            onClick={() => navigate('/progress')}
          />
          <KpiCard
            icon={MessageSquare}
            label="收藏表达"
            value={`${favorites.filter(f => f.type === 'chunk' || f.type === 'expression').length} 条`}
            color="#EC4899"
            onClick={() => navigate('/progress')}
          />
          <KpiCard
            icon={BookOpen}
            label="收藏单词"
            value={`${favorites.filter(f => f.type === 'vocabulary').length} 条`}
            color="#6366F1"
            onClick={() => navigate('/progress')}
          />

          {/* 暗色迷你进度卡 */}
          <Card className="col-span-2 rounded-[32px] bg-[#1F2937] border-none shadow-xl relative overflow-hidden group">
            <CardContent className="p-6 relative z-10">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Today's Progress
                </span>
                <div className="flex gap-3 text-[9px] font-black uppercase text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#00B894]"></span>
                    Goal
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-white/40"></span>
                    Done
                  </span>
                </div>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-4xl font-black italic text-white tracking-tight mb-1">
                    {Math.round(stats.todayMinutes)}
                    <span className="text-lg font-black text-[#00B894] ml-1">min</span>
                  </p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    / {stats.dailyGoalMinutes} min 目标
                  </p>
                </div>
                <div className="w-20 h-20 relative">
                  <svg className="size-full -rotate-90" viewBox="0 0 80 80">
                    <circle
                      cx="40"
                      cy="40"
                      r="32"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth="6"
                      fill="none"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="32"
                      stroke="#00B894"
                      strokeWidth="6"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 32}
                      strokeDashoffset={2 * Math.PI * 32 * (1 - progressPercent / 100)}
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-black text-white">
                      {Math.round(progressPercent)}%
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
            {/* 背景装饰 */}
            <TrendingUp className="absolute top-0 right-0 p-6 size-32 text-white opacity-5 group-hover:scale-110 transition-transform duration-700" />
          </Card>
        </div>
      </div>

      {/* 每日一句 + 快速开始 */}
      <div className="grid grid-cols-12 gap-8">
        {/* 每日一句 - 5/12 */}
        <Card className="col-span-12 lg:col-span-5 rounded-[40px] border-border shadow-sm">
          <CardContent className="p-8">
            <div className="flex items-center gap-2 mb-6">
              <div className="size-10 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 text-[#00B894] flex items-center justify-center">
                <Quote className="size-5" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                  Daily Expression
                </p>
                <h3 className="text-lg font-black italic text-foreground">每日一句</h3>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowHistory(true)}
                  className="rounded-xl size-8 text-muted-foreground hover:text-[#00B894]"
                  title="历史记录"
                >
                  <Clock className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleShuffleChunk}
                  className="rounded-xl size-8 text-muted-foreground hover:text-[#00B894]"
                  title="换一句"
                >
                  <RefreshCw className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleAiGenerateChunk}
                  disabled={chunkLoading}
                  className="rounded-xl size-8 text-muted-foreground hover:text-violet-500"
                  title="AI 生成"
                >
                  {chunkLoading ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                </Button>
              </div>
            </div>

            <div className="bg-muted/30 rounded-[28px] p-6 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-2xl font-black text-foreground leading-relaxed">
                  {dailyChunk.content}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => tts.speak(dailyChunk.content)}
                  className="rounded-xl size-8 text-muted-foreground hover:text-[#00B894] shrink-0"
                >
                  <Volume2 className="size-4.5" />
                </Button>
              </div>
              <p className="text-sm font-medium text-muted-foreground">{dailyChunk.meaning}</p>
            </div>

            <div className="space-y-2 mb-5">
              <div className="flex items-center gap-2">
                <p className="text-sm text-foreground/80 italic">
                  「{cleanText(dailyChunk.example)}」
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => tts.speak(dailyChunk.example, { rate: 0.9 })}
                  aria-label="朗读例句"
                  className="rounded-xl size-7 text-muted-foreground hover:text-[#00B894] shrink-0"
                >
                  <Volume2 className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleTranslateExample}
                  aria-label="翻译例句"
                  className="rounded-xl size-7 text-muted-foreground hover:text-violet-500 shrink-0"
                >
                  <Languages className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (isFavorited(dailyChunk.example, 'expression')) {
                      const fav = favorites.find((f) => f.content === dailyChunk.example && f.type === 'expression');
                      if (fav) removeFavorite(fav.id);
                    } else {
                      addFavorite({ type: 'expression', content: dailyChunk.example, meaning: dailyChunk.meaning, category: dailyChunk.category });
                    }
                  }}
                  aria-label="收藏例句"
                  className={cn(
                    'rounded-xl size-7 shrink-0',
                    isFavorited(dailyChunk.example, 'expression') ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500',
                  )}
                >
                  <Heart className={cn('size-3.5', isFavorited(dailyChunk.example, 'expression') && 'fill-current')} />
                </Button>
              </div>
              {exampleZh && (
                <p className="text-xs text-muted-foreground font-medium pl-1 border-l-2 border-violet-300">
                  {exampleZh}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-[#00B894] text-[10px] font-black uppercase tracking-wider">
                  {dailyChunk.category === 'daily'
                    ? '日常'
                    : dailyChunk.category === 'workplace'
                      ? '职场'
                      : dailyChunk.category === 'social'
                        ? '社交'
                        : '情绪'}
                </span>
                <span className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-muted-foreground text-[10px] font-black uppercase tracking-wider">
                  {dailyChunk.difficulty === 'beginner'
                    ? '初级'
                    : dailyChunk.difficulty === 'intermediate'
                      ? '中级'
                      : '高级'}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const existing = favorites.find((f) => f.content === dailyChunk.content && f.type === 'chunk');
                  if (existing) {
                    removeFavorite(existing.id);
                    toast.success('已取消收藏');
                  } else {
                    const ok = addFavorite({
                      type: 'chunk',
                      content: dailyChunk.content,
                      meaning: dailyChunk.meaning,
                      example: dailyChunk.example,
                      category: dailyChunk.category,
                    });
                    if (ok) {
                      toast.success('已收藏');
                    } else {
                      toast.error('收藏失败，可能已存在');
                    }
                  }
                }}
                className={cn(
                  'rounded-2xl gap-1.5 text-[10px] font-black uppercase tracking-wider',
                  favorited ? 'text-rose-500' : 'text-muted-foreground',
                )}
              >
                <Heart className={cn('size-4', favorited && 'fill-current')} />
                {favorited ? '已收藏' : '收藏'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 快速开始 - 7/12 */}
        <div className="col-span-12 lg:col-span-7">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
                Quick Start
              </p>
              <h3 className="text-xl font-black italic text-foreground">快速开始</h3>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {QUICK_ENTRIES.map((entry) => {
              const Icon = entry.icon;
              return (
                <Card
                  key={entry.path}
                  className="cursor-pointer hover:shadow-md transition-all duration-300 hover:-translate-y-1 group rounded-[32px] border-border"
                  onClick={() => navigate(entry.path)}
                >
                  <CardContent className="p-6">
                    <div
                      className={cn(
                        'size-14 rounded-2xl flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform shadow-lg',
                        `bg-gradient-to-br ${entry.color}`,
                      )}
                      style={{ boxShadow: `0 10px 25px -5px ${entry.color.includes('emerald') ? 'rgba(0,184,148,0.3)' : entry.color.includes('gray') ? 'rgba(31,41,55,0.2)' : entry.color.includes('indigo') ? 'rgba(99,102,241,0.3)' : 'rgba(249,115,22,0.3)'}` }}
                    >
                      <Icon className="size-6" />
                    </div>
                    <h4 className="text-base font-black text-foreground mb-1">{entry.label}</h4>
                    <p className="text-xs text-muted-foreground font-medium mb-3">{entry.desc}</p>
                    <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[#00B894]">
                      开始学习
                      <ArrowUpRight className="size-3.5" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* 模块进度 */}
      <Card className="rounded-[48px] border-border shadow-sm">
        <CardContent className="p-10">
          <div className="flex items-center justify-between mb-10">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
                Learning Progress
              </p>
              <h3 className="text-2xl font-[900] italic text-foreground">各模块学习进度</h3>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="bg-muted hover:bg-muted/80 rounded-2xl text-muted-foreground hover:text-[#00B894]"
                onClick={() => navigate('/progress')}
              >
                <BarChart3 className="size-4 mr-2" />
                查看详情
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-8 py-4">
            {MODULES.map((m) => (
              <RingProgress
                key={m.key}
                value={stats.moduleProgress[m.key as keyof typeof stats.moduleProgress]}
                label={m.label}
                icon={m.icon}
                color={m.color}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 开始今日学习 - 选项弹窗 */}
      <Dialog open={showLearnDialog} onOpenChange={setShowLearnDialog}>
        <DialogContent className="max-w-lg rounded-[32px] p-0 overflow-hidden">
          <div className="p-6 border-b border-border bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10">
            <DialogHeader>
              <DialogTitle className="text-xl font-black italic text-foreground flex items-center gap-2">
                <Play className="size-5 text-[#00B894]" />
                选择今日学习内容
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="p-6 grid grid-cols-2 gap-3">
            {learningOptions.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.path}
                  onClick={() => { navigate(opt.path); setShowLearnDialog(false); }}
                  className={cn(
                    'group p-4 rounded-2xl border-2 border-border hover:border-[#00B894]/30 text-left transition-all duration-200',
                    'hover:shadow-md hover:-translate-y-0.5',
                    opt.bg,
                  )}
                >
                  <div className={cn('size-10 rounded-xl flex items-center justify-center text-white mb-3 group-hover:scale-110 transition-transform shadow-lg bg-gradient-to-br', opt.color)}>
                    <Icon className="size-5" />
                  </div>
                  <h4 className="text-sm font-black text-foreground mb-0.5">{opt.label}</h4>
                  <p className="text-[11px] text-muted-foreground font-medium">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-xl rounded-[32px] p-0 overflow-hidden">
          <div className="p-6 border-b border-border bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10">
            <DialogHeader>
              <DialogTitle className="text-xl font-black italic text-foreground flex items-center gap-2">
                <Clock className="size-5 text-amber-500" />
                每日一句历史记录
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="p-4">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={() => { if (historyMonth === 0) { setHistoryMonth(11); setHistoryYear(historyYear - 1); } else setHistoryMonth(historyMonth - 1); }} className="rounded-xl size-8 text-muted-foreground hover:text-[#00B894]">
                <ChevronLeft className="size-4" />
              </Button>
              <button
                onClick={() => { setHistoryMonth(todayDate.getMonth()); setHistoryYear(todayDate.getFullYear()); }}
                className="text-sm font-black text-foreground hover:text-[#00B894] transition-colors"
                title="回到今天"
              >
                {monthLabel}
              </button>
              <Button variant="ghost" size="icon" onClick={() => { if (historyMonth === 11) { setHistoryMonth(0); setHistoryYear(historyYear + 1); } else setHistoryMonth(historyMonth + 1); }} className="rounded-xl size-8 text-muted-foreground hover:text-[#00B894]">
                <ChevronRight className="size-4" />
              </Button>
            </div>
            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEK_DAYS.map((d) => (
                <div key={d} className="text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground py-1">{d}</div>
              ))}
            </div>
            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {monthDays.map((d, i) => {
                const entry = historyByDate[d.date];
                const isToday = d.date === new Date().toISOString().slice(0, 10);
                return (
                  <div
                    key={i}
                    className={cn(
                      'aspect-square rounded-xl flex flex-col items-center justify-center text-xs transition-all relative',
                      !d.isCurrentMonth && 'opacity-30',
                      isToday && 'ring-1 ring-[#00B894]',
                    )}
                  >
                    <span className={cn('font-black', entry ? 'text-foreground' : 'text-muted-foreground')}>{d.day}</span>
                    {entry && (
                      <div className="absolute bottom-1 flex gap-0.5">
                        {entry.slice(0, 2).map((_, j) => (
                          <span key={j} className="size-1 rounded-full bg-[#00B894]" />
                        ))}
                        {entry.length > 2 && <span className="text-[7px] font-black text-[#00B894]">+{entry.length - 2}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Selected day's entries */}
            <div className="mt-4 max-h-[200px] overflow-y-auto space-y-2 border-t border-border pt-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                本月共 {Object.keys(historyByDate).filter((d) => d.startsWith(`${historyYear}-${String(historyMonth + 1).padStart(2, '0')}`)).length} 天有记录 · 共 {history.filter((h) => h.date.startsWith(`${historyYear}-${String(historyMonth + 1).padStart(2, '0')}`)).length} 条
              </p>
              {Object.entries(historyByDate)
                .filter(([date]) => date.startsWith(`${historyYear}-${String(historyMonth + 1).padStart(2, '0')}`))
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([date, entries]) => (
                  <div key={date} className="p-3 rounded-2xl bg-muted/30">
                    <p className="text-[10px] font-black text-muted-foreground mb-2">{date} · {entries.length} 句</p>
                    {entries.map((h, j) => (
                      <div key={j} className="flex items-start gap-2 mb-2 last:mb-0 pl-2 border-l-2 border-amber-200 dark:border-amber-500/20">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-foreground">{h.content}</p>
                          <p className="text-xs text-muted-foreground">{h.meaning}</p>
                          <p className="text-xs text-foreground/50 italic mt-0.5">「{cleanText(h.example)}」</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
