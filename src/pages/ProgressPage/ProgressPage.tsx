import { useState, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Calendar,
  Heart,
  TrendingUp,
  Flame,
  Target,
  Clock,
  BookOpen,
  Trash2,
  Filter,
  Sparkles,
  Brain,
  Puzzle,
  MessageSquare,
  Mic,
  Volume2,
  RotateCw,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  X,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLearningStats } from '@/lib/use-learning-stats';
import { useFavorites } from '@/lib/use-favorites';
import { useAchievements } from '@/lib/use-achievements';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTTS } from '@/lib/use-tts';
import { usePageMemory } from '@/lib/use-page-memory';
import { safeStorage } from '@/lib/safe-storage';
import { WORD_COUNTS } from '@/data/wordbank/meta';
import { cn, cleanText } from '@/lib/utils';
import { toast } from 'sonner';
import FavoriteReviewMode from './components/FavoriteReviewMode';
import { LazyFramerProvider } from '@/lib/lazy-framer-motion';

// Lazy-load charts (recharts ~400KB) — only needed when "学习统计" tab is active
const LazyProgressCharts = lazy(() => import('./components/ProgressCharts'));

// 从真实日历数据生成日历视图
function buildCalendarDays(calendar: { date: string; checkedIn: boolean; minutes: number }[], year: number, month: number) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const days: { date: Date; checkedIn: boolean; minutes: number }[] = [];

  // Fill in empty days before the first of the month
  for (let i = 0; i < firstDay; i++) {
    days.push({ date: new Date(year, month, -firstDay + i + 1), checkedIn: false, minutes: 0 });
  }
  // Fill in actual month days
  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(year, month, i);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const record = calendar.find((r) => r.date === dateStr);
    days.push({
      date,
      checkedIn: record ? record.checkedIn : false,
      minutes: record ? record.minutes : 0,
    });
  }
  return days;
}

const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];

const VOCAB_LEVELS: { key: string; label: string; icon: typeof BookOpen; color: string }[] = [
  { key: 'zhongkao', label: '中考词库', icon: BookOpen, color: 'text-red-500' },
  { key: 'gaokao', label: '高考词库', icon: BookOpen, color: 'text-orange-500' },
  { key: 'cet4', label: '四级词库', icon: BookOpen, color: 'text-sky-500' },
  { key: 'cet6', label: '六级词库', icon: BookOpen, color: 'text-violet-500' },
  { key: 'ielts', label: '雅思词库', icon: BookOpen, color: 'text-amber-500' },
  { key: 'toefl', label: '托福词库', icon: BookOpen, color: 'text-rose-500' },
  { key: 'postgraduate', label: '考研词库', icon: BookOpen, color: 'text-purple-500' },
  { key: 'professional', label: '专业词库', icon: BookOpen, color: 'text-teal-500' },
  { key: 'advanced', label: '高级词库', icon: BookOpen, color: 'text-slate-500' },
];

export default function ProgressPage() {
  const { stats, calendar, loaded, resetAll } = useLearningStats();
  const { favorites, removeFavorite } = useFavorites();
  const { unlocked, definitions, isUnlocked, resetAchievements } = useAchievements();
  const tts = useTTS();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filterType, setFilterType] = usePageMemory('progress-filter', 'all');
  const [favReviewMode, setFavReviewMode] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetConfirm, setResetConfirm] = useState<string | null>(null);

  // Reset handlers
  const handleResetStats = () => {
    resetAll();
    resetAchievements();
    toast.success('学习统计已重置');
    setShowResetDialog(false); setResetConfirm(null);
  };
  const handleResetWordLearning = () => {
    // Clear all per-level word learning storage
    const LEVELS = ['all', 'zhongkao', 'gaokao', 'cet4', 'cet6', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'];
    LEVELS.forEach((l) => {
      safeStorage.removeItem(`__nativethink_word_learning_${l}`);
      safeStorage.removeItem(`__nativethink_daily_quota_${l}`);
    });
    // Also clear legacy global key
    safeStorage.removeItem('__nativethink_word_learning');
    safeStorage.removeItem('__nativethink_daily_quota');
    toast.success('词汇学习进度已重置（刷新页面后生效）');
    setShowResetDialog(false); setResetConfirm(null);
  };
  const handleResetWordLevel = async (level: string) => {
    safeStorage.removeItem(`__nativethink_word_learning_${level}`);
    safeStorage.removeItem(`__nativethink_daily_quota_${level}`);
    // Also clean up legacy global key if it still has data for this level
    try {
      const saved = safeStorage.getItem('__nativethink_word_learning');
      if (saved) {
        const { getWordsByLevel } = await import('@/data/wordbank');
        const state = JSON.parse(saved);
        const allByLevel = getWordsByLevel();
        const levelWords = allByLevel[level] || [];
        const levelWordKeys = new Set(levelWords.map((w: { word: string }) => w.word.toLowerCase()));
        const newProgress: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(state.progress || {})) {
          if (!levelWordKeys.has(key)) newProgress[key] = val;
        }
        state.progress = newProgress;
        state.todayLearned = (state.todayLearned || []).filter((k: string) => !levelWordKeys.has(k));
        state.todayReviewed = (state.todayReviewed || []).filter((k: string) => !levelWordKeys.has(k));
        safeStorage.setItem('__nativethink_word_learning', JSON.stringify(state));
      }
    } catch { /* legacy key not present or corrupted, ignore */ }
    const levelLabel = VOCAB_LEVELS.find((v) => v.key === level)?.label || level;
    toast.success(`${levelLabel} 已重置（刷新后生效）`);
    setShowResetDialog(false); setResetConfirm(null);
  };
  const handleResetPhraseLearning = () => {
    safeStorage.removeItem('__nativethink_phrase_learning');
    safeStorage.removeItem('__nativethink_phrase_daily_quota');
    // Also clear old phrase review key
    safeStorage.removeItem('__nativethink_phrase_review');
    toast.success('短语库记忆进度已重置（刷新后生效）');
    setShowResetDialog(false); setResetConfirm(null);
  };
  const handleResetAIContent = () => {
    const keys = [
      '__nativethink_custom_chunks', '__nativethink_chunk_ai_sentences',
      '__nativethink_ai_replacements', '__nativethink_phrase_examples',
      '__nativethink_phrase_review', '__nativethink_phrase_learning',
      '__nativethink_phrase_daily_quota', '__nativethink_custom_prompts',
      '__nativethink_custom_translations', '__nativethink_custom_backs',
      '__nativethink_custom_natives', '__nativethink_custom_shadowing',
      '__nativethink_shadowing_extra', '__nativethink_word_ai_data',
      '__nativethink_colloc_cache', '__nativethink_colloc_ai_tranlations',
      '__nativethink_example_trans',
    ];
    keys.forEach((k) => safeStorage.removeItem(k));
    toast.success('AI 生成内容已清除（刷新页面后生效）');
    setShowResetDialog(false); setResetConfirm(null);
  };
  const handleResetFavorites = () => {
    favorites.forEach((f) => removeFavorite(f.id));
    toast.success('收藏数据已清除');
    setShowResetDialog(false); setResetConfirm(null);
  };
  const handleResetScenarios = () => {
    safeStorage.removeItem('__nativethink_custom_scenarios');
    toast.success('自定义场景已清除（刷新页面后生效）');
    setShowResetDialog(false); setResetConfirm(null);
  };
  const handleResetDailyHistory = () => {
    safeStorage.removeItem('__nativethink_daily_history');
    toast.success('每日一句历史已清除');
    setShowResetDialog(false); setResetConfirm(null);
  };
  const handleResetAll = () => {
    resetAll();
    resetAchievements();
    // Clear all per-level word learning storage
    const LEVELS = ['all', 'zhongkao', 'gaokao', 'cet4', 'cet6', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'];
    LEVELS.forEach((l) => {
      safeStorage.removeItem(`__nativethink_word_learning_${l}`);
      safeStorage.removeItem(`__nativethink_daily_quota_${l}`);
    });
    // Legacy global keys
    safeStorage.removeItem('__nativethink_word_learning');
    safeStorage.removeItem('__nativethink_daily_quota');
    favorites.forEach((f) => removeFavorite(f.id));
    const allKeys = [
      '__nativethink_custom_chunks', '__nativethink_chunk_ai_sentences',
      '__nativethink_ai_replacements', '__nativethink_phrase_examples',
      '__nativethink_phrase_review', '__nativethink_phrase_learning',
      '__nativethink_phrase_daily_quota', '__nativethink_custom_prompts',
      '__nativethink_custom_translations', '__nativethink_custom_backs',
      '__nativethink_custom_natives', '__nativethink_custom_shadowing',
      '__nativethink_shadowing_extra', '__nativethink_word_ai_data',
      '__nativethink_custom_scenarios', '__nativethink_daily_history',
      '__nativethink_achievements',
      '__nativethink_colloc_cache', '__nativethink_colloc_ai_tranlations',
      '__nativethink_colloc_state', '__nativethink_colloc_memorized',
      '__nativethink_level_memory', '__nativethink_feedback_list',
      'vocab-page', 'vocab-search', 'chunk-page', 'chunk-search',
      'shadowing-rate', 'shadowing-filter',
      '__nativethink_example_trans',
    ];
    allKeys.forEach((k) => safeStorage.removeItem(k));
    toast.success('所有学习记录已重置（部分数据刷新后生效）');
    setShowResetDialog(false); setResetConfirm(null);
  };

  const calendarDays = useMemo(() => {
    return buildCalendarDays(calendar, currentMonth.getFullYear(), currentMonth.getMonth());
  }, [currentMonth, calendar]);

  const filteredFavorites = useMemo(() => {
    if (filterType === 'all') return favorites;
    return favorites.filter((f) => f.type === filterType);
  }, [favorites, filterType]);

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const monthLabel = `${currentMonth.getFullYear()}年 ${currentMonth.getMonth() + 1}月`;

  const getIntensityClass = (minutes: number) => {
    if (minutes === 0) return 'bg-muted/50';
    if (minutes < 20) return 'bg-[#00B894]/30';
    if (minutes < 40) return 'bg-[#00B894]/60';
    return 'bg-[#00B894]';
  };

  const typeLabelMap: Record<string, string> = {
    chunk: '语块',
    expression: '表达',
    vocabulary: '词汇',
    think: '思维训练',
    shadowing: '影子跟读',
  };

  const getFavPortal = (type: string): string | null => {
    const portals: Record<string, string> = {
      shadowing: '/shadowing',
      think: '/think',
      chunk: '/chunks',
      vocabulary: '/vocabulary',
      expression: '/vocabulary',
    };
    return portals[type] || null;
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">加载中...</div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">
            Learning Progress
          </p>
          <h1 className="text-3xl font-black italic text-foreground tracking-tight">学习记录</h1>
          <p className="text-muted-foreground mt-2 text-sm font-medium">
            追踪你的学习进度，回顾收藏的地道表达
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowResetDialog(true)}
            className="mt-4 rounded-2xl text-[10px] font-black uppercase tracking-wider border-border hover:border-[#00B894] hover:text-[#00B894]"
          >
            <RotateCw className="size-3.5 mr-1.5" />
            管理学习记录
          </Button>
        </div>
      </div>

      {/* Reset Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
          <DialogContent className="max-w-lg rounded-[32px] p-0 overflow-hidden">
            <div className="p-6 border-b border-border bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10">
              <DialogHeader>
                <DialogTitle className="text-xl font-black italic text-foreground flex items-center gap-2">
                  <RotateCw className="size-5 text-amber-500" />
                  管理学习记录
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground font-medium mt-1">
                  选择要重置的数据类型，重置操作不可撤销
                </DialogDescription>
              </DialogHeader>
            </div>
            <ScrollArea className="max-h-[55vh]">
              <div className="p-6 space-y-4">
                {/* 学习数据 */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">学习数据</p>
                  {[
                    { key: 'stats', label: '学习统计', desc: '连续天数、学习时长、各模块进度百分比', icon: BarChart3, color: 'text-emerald-500', action: handleResetStats },
                    { key: 'history', label: '每日一句历史', desc: '首页每日一句的30天历史记录', icon: Calendar, color: 'text-amber-500', action: handleResetDailyHistory },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between p-3 rounded-2xl bg-muted/30">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-xl bg-muted flex items-center justify-center">
                          <item.icon className={cn('size-4', item.color)} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">{item.label}</p>
                          <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => setResetConfirm(resetConfirm === item.key ? null : item.key)}
                        className="rounded-xl text-[10px] font-bold text-muted-foreground hover:text-rose-500"
                      >
                        {resetConfirm === item.key ? '取消' : '重置'}
                      </Button>
                    </div>
                  ))}
                </div>

                {/* 词库分级重置 */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">词库分级</p>
                  <p className="text-[10px] text-muted-foreground -mt-1 mb-1">按等级分别重置词汇学习进度（SM-2间隔记忆数据）</p>
                  {VOCAB_LEVELS.map((lvl) => {
                    const count = WORD_COUNTS[lvl.key] || 0;
                    return (
                      <div key={lvl.key} className="flex items-center justify-between p-3 rounded-2xl bg-muted/30">
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-xl bg-muted flex items-center justify-center">
                            <lvl.icon className={cn('size-4', lvl.color)} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-foreground">{lvl.label}</p>
                            <p className="text-[10px] text-muted-foreground">共 {count} 词，仅清除该等级的学习进度</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => setResetConfirm(resetConfirm === lvl.key ? null : lvl.key)}
                          className="rounded-xl text-[10px] font-bold text-muted-foreground hover:text-rose-500"
                        >
                          {resetConfirm === lvl.key ? '取消' : '重置'}
                        </Button>
                      </div>
                    );
                  })}
                  {/* 全部词汇 */}
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-border">
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-xl bg-muted flex items-center justify-center">
                        <BookOpen className="size-4 text-sky-500" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">全部词汇进度</p>
                        <p className="text-[10px] text-muted-foreground">清除所有等级的SM-2间隔记忆数据及每日配额</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setResetConfirm(resetConfirm === 'words' ? null : 'words')}
                      className="rounded-xl text-[10px] font-bold text-muted-foreground hover:text-rose-500"
                    >
                      {resetConfirm === 'words' ? '取消' : '重置'}
                    </Button>
                  </div>
                </div>

                {/* AI 生成内容 */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">AI 生成内容</p>
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-xl bg-muted flex items-center justify-center">
                        <Sparkles className="size-4 text-violet-500" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">所有AI生成内容</p>
                        <p className="text-[10px] text-muted-foreground">AI例句、短语库、影子跟读、写作提示等</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setResetConfirm(resetConfirm === 'ai' ? null : 'ai')}
                      className="rounded-xl text-[10px] font-bold text-muted-foreground hover:text-rose-500"
                    >
                      {resetConfirm === 'ai' ? '取消' : '重置'}
                    </Button>
                  </div>
                </div>

                {/* 收藏与其他 */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">收藏与配置</p>
                  {[
                    { key: 'phrases', label: '短语库记忆进度', desc: 'SM-2间隔记忆数据、每日学习配额', icon: Puzzle, color: 'text-rose-500', action: handleResetPhraseLearning },
                    { key: 'favs', label: '收藏数据', desc: '所有收藏的单词、表达、语块', icon: Heart, color: 'text-rose-500', action: handleResetFavorites },
                    { key: 'scenarios', label: '自定义场景', desc: 'AI对话练习的自定义角色场景', icon: MessageSquare, color: 'text-indigo-500', action: handleResetScenarios },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between p-3 rounded-2xl bg-muted/30">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-xl bg-muted flex items-center justify-center">
                          <item.icon className={cn('size-4', item.color)} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">{item.label}</p>
                          <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => setResetConfirm(resetConfirm === item.key ? null : item.key)}
                        className="rounded-xl text-[10px] font-bold text-muted-foreground hover:text-rose-500"
                      >
                        {resetConfirm === item.key ? '取消' : '重置'}
                      </Button>
                    </div>
                  ))}
                </div>

                {/* 全部重置 */}
                <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-xl bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center">
                        <AlertTriangle className="size-4 text-rose-500" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">重置所有学习记录</p>
                        <p className="text-[10px] text-muted-foreground">清除以上全部数据，主题和TTS设置不受影响</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setResetConfirm(resetConfirm === 'all' ? null : 'all')}
                      className="rounded-xl text-[10px] font-bold text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/20"
                    >
                      {resetConfirm === 'all' ? '取消' : '全部重置'}
                    </Button>
                  </div>
                </div>
              </div>
            </ScrollArea>

            {/* Confirmation footer */}
            {resetConfirm && (
              <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-rose-500 font-bold">
                  <AlertTriangle className="size-4" />
                  确认重置？此操作不可撤销
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setResetConfirm(null)} className="rounded-2xl text-xs font-bold">取消</Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      switch (resetConfirm) {
                        case 'stats': handleResetStats(); break;
                        case 'words': handleResetWordLearning(); break;
                        case 'history': handleResetDailyHistory(); break;
                        case 'zhongkao': case 'gaokao': case 'cet4': case 'cet6': case 'ielts': case 'toefl': case 'postgraduate': case 'professional': case 'advanced': handleResetWordLevel(resetConfirm); break;
                        case 'phrases': handleResetPhraseLearning(); break;
                        case 'ai': handleResetAIContent(); break;
                        case 'favs': handleResetFavorites(); break;
                        case 'scenarios': handleResetScenarios(); break;
                        case 'all': handleResetAll(); break;
                      }
                    }}
                    className="rounded-2xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white"
                  >
                    <Trash2 className="size-3.5 mr-1" />
                    确认重置
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

      {/* 顶部统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="rounded-[32px] border-border shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="size-12 rounded-2xl bg-orange-50 dark:bg-orange-500/15 text-orange-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Flame className="size-5.5" />
              </div>
              <div className="flex items-center gap-1 text-[11px] font-black text-emerald-500">
                <TrendingUp className="size-3.5" />
                +12%
              </div>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
              连续天数
            </p>
            <p className="text-2xl font-black text-foreground group-hover:text-[#00B894] transition-colors">
              {stats.streakDays} 天
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-[32px] border-border shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="size-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 text-[#00B894] flex items-center justify-center group-hover:scale-110 transition-transform">
                <Target className="size-5.5" />
              </div>
              <div className="text-[11px] font-black text-emerald-500">
                {Math.round((stats.todayMinutes / stats.dailyGoalMinutes) * 100)}%
              </div>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
              今日目标
            </p>
            <p className="text-2xl font-black text-foreground group-hover:text-[#00B894] transition-colors">
              {Math.round(stats.todayMinutes)}/{stats.dailyGoalMinutes}m
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-[32px] border-border shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="size-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Clock className="size-5.5" />
              </div>
              <div className="text-[11px] font-black text-emerald-500">总时长</div>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
              累计学习
            </p>
            <p className="text-2xl font-black text-foreground group-hover:text-[#00B894] transition-colors">
              {Math.round(calendar.reduce((sum, r) => sum + r.minutes, 0))} 分钟
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-[32px] border-border shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="size-12 rounded-2xl bg-pink-50 dark:bg-pink-500/15 text-pink-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Heart className="size-5.5" />
              </div>
              <div className="text-[11px] font-black text-emerald-500">收藏</div>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
              地道表达
            </p>
            <p className="text-2xl font-black text-foreground group-hover:text-[#00B894] transition-colors">
              {favorites.length} 条
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="calendar" className="w-full">
        <TabsList className="bg-muted p-1.5 rounded-3xl h-auto">
          <TabsTrigger
            value="calendar"
            className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm"
          >
            <Calendar className="size-4 mr-2" />
            日历打卡
          </TabsTrigger>
          <TabsTrigger
            value="stats"
            className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm"
          >
            <BarChart3 className="size-4 mr-2" />
            学习统计
          </TabsTrigger>
          <TabsTrigger
            value="favorites"
            className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm"
          >
            <Heart className="size-4 mr-2" />
            收藏本
          </TabsTrigger>
          <TabsTrigger
            value="achievements"
            className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm"
          >
            <Sparkles className="size-4 mr-2" />
            成就徽章
          </TabsTrigger>
        </TabsList>

        {/* 日历 */}
        <TabsContent value="calendar" className="mt-6">
          <Card className="rounded-[40px] border-border shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 text-[#00B894] flex items-center justify-center">
                    <Calendar className="size-5.5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-[900] italic text-foreground">
                      {monthLabel}
                    </CardTitle>
                    <CardDescription className="text-sm font-medium mt-1">
                      本月已打卡 {calendarDays.filter((d) => d.checkedIn).length} 天
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={prevMonth}
                    className="rounded-2xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-[#00B894]"
                  >
                    <TrendingUp className="size-4 rotate-180" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={nextMonth}
                    className="rounded-2xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-[#00B894]"
                  >
                    <TrendingUp className="size-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* 星期标题 */}
              <div className="grid grid-cols-7 gap-2 mb-3">
                {WEEK_DAYS.map((day) => (
                  <div
                    key={day}
                    className="text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground py-2"
                  >
                    {day}
                  </div>
                ))}
              </div>
              {/* 日期格子 */}
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((day, idx) => {
                  const isCurrentMonth = day.date.getMonth() === currentMonth.getMonth();
                  const isToday =
                    day.date.toDateString() === new Date().toDateString();
                  return (
                    <div
                      key={idx}
                      className={cn(
                        'aspect-square rounded-2xl flex flex-col items-center justify-center text-xs transition-all',
                        isCurrentMonth ? '' : 'opacity-30',
                        isToday && 'ring-1 ring-inset ring-[#00B894]',
                      )}
                    >
                      <div
                        className={cn(
                          'w-full h-full rounded-2xl flex flex-col items-center justify-center',
                          getIntensityClass(day.minutes),
                          day.minutes > 0 && 'text-white',
                          day.minutes === 0 && 'text-muted-foreground',
                        )}
                      >
                        <span className="font-black">{day.date.getDate()}</span>
                        {day.minutes > 0 && (
                          <span className="text-[9px] font-bold opacity-80">{Math.round(day.minutes)}m</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 图例 */}
              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  学习强度
                </span>
                <div className="flex items-center gap-1">
                  <div className="size-6 rounded-lg bg-muted/50" />
                  <div className="size-6 rounded-lg bg-[#00B894]/30" />
                  <div className="size-6 rounded-lg bg-[#00B894]/60" />
                  <div className="size-6 rounded-lg bg-[#00B894]" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  少 → 多
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 学习统计 */}
        <TabsContent value="stats" className="mt-6">
          <Suspense fallback={
            <div className="flex items-center justify-center py-24">
              <div className="text-center space-y-4">
                <div className="size-16 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center mx-auto animate-pulse">
                  <BarChart3 className="size-8 text-indigo-500" />
                </div>
                <p className="text-sm text-muted-foreground">加载图表中...</p>
              </div>
            </div>
          }>
            <LazyProgressCharts calendar={calendar} stats={stats} />
          </Suspense>
        </TabsContent>

        {/* 收藏本 */}
        <TabsContent value="favorites" className="mt-6">
          <Card className="rounded-[40px] border-border shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-2xl bg-pink-50 dark:bg-pink-500/15 text-pink-500 flex items-center justify-center">
                    <Heart className="size-5.5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-[900] italic text-foreground">
                      收藏的地道表达
                    </CardTitle>
                    <CardDescription className="text-sm font-medium mt-1">
                      共 {favorites.length} 条收藏
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Filter className="size-4 text-muted-foreground" />
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="w-[120px] rounded-2xl border-border bg-muted text-xs font-bold uppercase tracking-wider">
                        <SelectValue placeholder="分类" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl">
                        <SelectItem value="all" className="text-xs font-bold">
                          全部
                        </SelectItem>
                        <SelectItem value="chunk" className="text-xs font-bold">
                          语块
                        </SelectItem>
                        <SelectItem value="expression" className="text-xs font-bold">
                          表达
                        </SelectItem>
                        <SelectItem value="vocabulary" className="text-xs font-bold">
                          词汇
                        </SelectItem>
                        <SelectItem value="think" className="text-xs font-bold">
                          思维训练
                        </SelectItem>
                        <SelectItem value="shadowing" className="text-xs font-bold">
                          影子跟读
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant={favReviewMode ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setFavReviewMode((v) => !v); }}
                    className={cn(
                      'rounded-xl text-[10px] font-black uppercase tracking-wider',
                      favReviewMode
                        ? 'bg-[#00B894] text-white shadow-lg shadow-emerald-200/50'
                        : 'border-border hover:border-[#00B894] hover:text-[#00B894]',
                    )}
                  >
                    {favReviewMode ? '浏览模式' : '开始回顾'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {favReviewMode ? (
                <LazyFramerProvider>
                  <FavoriteReviewMode favorites={filteredFavorites} onExit={() => setFavReviewMode(false)} />
                </LazyFramerProvider>
              ) : filteredFavorites.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredFavorites.map((item) => (
                    <Card
                      key={item.id}
                      className="rounded-[28px] border-border hover:border-[#00B894]/30 hover:shadow-md transition-all duration-300 group"
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <Badge className="text-[10px] font-black uppercase tracking-wider rounded-full px-3 py-1 bg-emerald-50 dark:bg-emerald-500/15 text-[#00B894] border-none">
                            {typeLabelMap[item.type] || item.type}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFavorite(item.id)}
                            className="rounded-xl size-8 text-muted-foreground hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/15"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="text-lg font-black text-foreground group-hover:text-[#00B894] transition-colors">
                            {item.content}
                          </h4>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => tts.speak(item.content)}
                            className="rounded-xl size-7 text-muted-foreground hover:text-[#00B894] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Volume2 className="size-3.5" />
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground font-medium mb-3">
                          {item.meaning}
                        </p>
                        {item.example && (
                          <div className="p-3 rounded-xl bg-muted/50 flex items-start gap-2 group/example">
                            <p className="text-xs text-foreground/80 italic flex-1">「{cleanText(item.example)}」</p>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => tts.speak(cleanText(item.example))}
                              className="rounded-lg size-6 text-muted-foreground hover:text-[#00B894] shrink-0 opacity-0 group-hover/example:opacity-100 transition-opacity"
                            >
                              <Volume2 className="size-3" />
                            </Button>
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className="text-[9px] font-black uppercase tracking-wider rounded-full px-2 py-0.5 bg-muted"
                            >
                              {item.category}
                            </Badge>
                            {/* Portal link to source module */}
                            {getFavPortal(item.type) && (
                              <button
                                onClick={() => navigate(getFavPortal(item.type)!)}
                                className="shrink-0 text-[10px] font-bold text-[#00B894] hover:underline flex items-center gap-0.5"
                                title={`前往${typeLabelMap[item.type] || item.type}`}
                              >
                                <ExternalLink className="size-3" />传送
                              </button>
                            )}
                          </div>
                          <span className="text-[10px] font-bold text-muted-foreground">
                            {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="size-20 rounded-3xl bg-muted mx-auto mb-4 flex items-center justify-center text-muted-foreground">
                    <Heart className="size-9" />
                  </div>
                  <h3 className="text-xl font-black text-foreground mb-2">还没有收藏</h3>
                  <p className="text-sm text-muted-foreground font-medium">
                    在学习过程中点击心形图标收藏你喜欢的表达
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 成就徽章 */}
        <TabsContent value="achievements" className="mt-6">
          <Card className="rounded-[40px] border-border shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-2xl bg-amber-50 dark:bg-amber-500/15 text-amber-500 flex items-center justify-center">
                  <Sparkles className="size-5.5" />
                </div>
                <div>
                  <CardTitle className="text-xl font-[900] italic text-foreground">
                    成就徽章
                  </CardTitle>
                  <CardDescription className="text-sm font-medium mt-1">
                    已解锁 {unlocked.length} / {definitions.length} 个成就
                  </CardDescription>
                </div>
              </div>
              {/* 总进度 */}
              <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-700"
                  style={{ width: `${(unlocked.length / definitions.length) * 100}%` }}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {definitions.map((achievement) => {
                  const unlocked_ = isUnlocked(achievement.id);
                  const found = unlocked.find((u) => u.id === achievement.id);
                  return (
                    <div
                      key={achievement.id}
                      className={cn(
                        'p-5 rounded-3xl border text-center transition-all duration-300',
                        unlocked_
                          ? 'bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-500/10 dark:to-yellow-500/10 border-amber-200 shadow-sm hover:shadow-md'
                          : 'bg-muted/30 border-border opacity-50 grayscale',
                      )}
                    >
                      <div className="text-4xl mb-3">{achievement.icon}</div>
                      <h4 className="text-sm font-black text-foreground mb-1">
                        {achievement.name}
                      </h4>
                      <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                        {achievement.description}
                      </p>
                      {unlocked_ && found && (
                        <p className="text-[10px] font-bold text-amber-500 mt-3 uppercase tracking-wider">
                          {new Date(found.unlockedAt).toLocaleDateString('zh-CN')} 解锁
                        </p>
                      )}
                      {!unlocked_ && (
                        <div className="mt-3">
                          <div className="size-6 mx-auto rounded-full bg-muted flex items-center justify-center">
                            <span className="text-[10px] text-muted-foreground">🔒</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
}
