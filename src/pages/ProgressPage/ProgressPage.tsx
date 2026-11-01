import { useState, useMemo, useRef, lazy, Suspense, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  Calendar,
  Heart,
  SpellCheck,
  BookMarked,
  TrendingUp,
  Flame,
  Target,
  Clock,
  BookOpen,
  Trash2,
  Puzzle,
  MessageSquare,
  RotateCw,
  Download,
  Upload,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/StatTile';
import { useLearningStats } from '@/lib/use-learning-stats';
import { useFavorites } from '@/lib/use-favorites';
import { useAchievements } from '@/lib/use-achievements';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePageMemory } from '@/lib/use-page-memory';
import { EmptyState } from '@/components/EmptyState';
import { safeStorage } from '@/lib/safe-storage';
import { persistText } from '@/lib/capped-cache';
import { clearAllResume, resumeStorageWithKeys } from '@/lib/spelling-resume';
import { WORD_COUNTS } from '@/data/wordbank/meta';
import { cn } from '@/lib/utils';
import { useBackupActions } from '@/lib/use-backup-actions';
import { BackupFileInput } from '@/components/BackupFileInput';
import { toast } from 'sonner';
import {
  canGoToNextMonth,
  isCurrentMonth,
  sortAchievements,
} from '@/lib/progress-page';
import {
  achievementProgress,
  achievementRatio,
  buildAchievementStats,
  formatAchievementGap,
} from '@/lib/achievements-data';
import { readAchievementCounts } from '@/lib/achievement-sources';

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

const TYPE_LABEL_MAP: Record<string, string> = {
  chunk: '语块',
  expression: '表达',
  vocabulary: '词汇',
  think: '思维训练',
  shadowing: '影子跟读',
  article: '文章',
  word: '单词',
  spelling: '句子拼写',
  writing_prompt: '写作提示',
};

const VOCAB_LEVELS: { key: string; label: string; icon: typeof BookOpen; color: string }[] = [
  { key: 'zhongkao', label: '中考词库', icon: BookOpen, color: 'text-red-500' },
  { key: 'gaokao', label: '高考词库', icon: BookOpen, color: 'text-orange-500' },
  { key: 'cet4', label: '四级词库', icon: BookOpen, color: 'text-sky-500' },
  { key: 'cet6', label: '六级词库', icon: BookOpen, color: 'text-violet-500' },
  { key: 'cet46freq', label: '四六级高频', icon: BookOpen, color: 'text-emerald-500' },
  { key: 'cet46elite', label: '四六级高分', icon: BookOpen, color: 'text-yellow-500' },
  { key: 'ielts', label: '雅思词库', icon: BookOpen, color: 'text-amber-500' },
  { key: 'toefl', label: '托福词库', icon: BookOpen, color: 'text-rose-500' },
  { key: 'postgraduate', label: '考研词库', icon: BookOpen, color: 'text-purple-500' },
  { key: 'professional', label: '专业词库', icon: BookOpen, color: 'text-teal-500' },
  { key: 'advanced', label: '高级词库', icon: BookOpen, color: 'text-slate-500' },
];

export default function ProgressPage() {
  const { stats, calendar, loaded, resetAll } = useLearningStats();
  const { favorites, clearAll } = useFavorites();
  const { unlocked, definitions, isUnlocked, resetAchievements } = useAchievements();
  const backup = useBackupActions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [tab, setTab] = usePageMemory('progress-tab', 'calendar');
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetConfirm, setResetConfirm] = useState<string | null>(null);
  const resetDeepLinkRef = useRef(false);

  // 设置页「管理学习记录」→ /progress?reset=1：打开现有弹窗并抹掉参数，
  // 避免刷新/返回时又弹一次；resetDeepLinkRef 防参数清除前的重复触发。
  useEffect(() => {
    if (resetDeepLinkRef.current) return;
    if (searchParams.get('reset') !== '1') return;
    resetDeepLinkRef.current = true;
    setShowResetDialog(true);
    const next = new URLSearchParams(searchParams);
    next.delete('reset');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Reset handlers
  const handleResetStats = () => {
    const ok = resetAll();
    resetAchievements();
    if (ok) toast.success('学习统计已重置');
    else toast.error('学习统计未能写入本地存储，请检查可用空间后重试');
    setShowResetDialog(false); setResetConfirm(null);
  };
  /** 句子拼写：进度 + 已完成 + 出题记录 + 导入词书 + 断点（按词书分键，必须枚举） */
  const handleResetSpelling = () => {
    for (const k of ['__nativethink_spelling_progress', '__nativethink_spelling_completed', '__nativethink_spelling_served', '__nativethink_spelling_sentences', '__nativethink_spelling_round_size']) {
      safeStorage.removeItem(k);
    }
    // 断点键是 `__nativethink_spelling_resume_<level>`（每本一个）+ `..._resume_last`，
    // 写死列表清不干净；漏了它的表现是"重置后刷新又自动跳回上次那本词书"。
    clearAllResume(resumeStorageWithKeys());
    toast.success('句子拼写进度已重置（刷新页面后生效）');
    setShowResetDialog(false); setResetConfirm(null);
  };

  /** 阅读：每本书进度 + 对照翻译缓存 + 批注 + 最近查词 */
  const handleResetReading = async () => {
    // localStorage 中所有 reader 相关键
    const keys: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.includes('__reader_progress_') || k.includes('__reader_trans_') || k.includes('__nativethink_reader_notes_') || k.endsWith('__reader_lookup_recent')) keys.push(k);
      }
    } catch { /* ignore */ }
    keys.forEach((k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
    // IndexedDB 里的整书翻译缓存
    try {
      // 清整书翻译缓存只需要书的 id 清单 —— 用元数据模块，别为拿 id 去下载 22 本书正文
      const books = (await import('@/data/books-meta')).BOOK_META;
      const { clearBookTranslation } = await import('@/data/book-translation');
      await Promise.all(books.map((b) => clearBookTranslation(b.id).catch(() => {})));
    } catch { /* ignore */ }
    toast.success(`阅读进度、批注与翻译缓存已清除（${keys.length} 项）`);
    setShowResetDialog(false); setResetConfirm(null);
  };

  /** 生成内容缓存：单词 AI 例句/解析、搭配翻译、AI 题目、每日一句历史之外的缓存 */
  const handleResetAiCaches = () => {
    for (const k of ['__nativethink_word_ai_data', '__nativethink_colloc_ai_translations', '__nativethink_colloc_ai_tranlations', '__nativethink_phrase_examples', '__nativethink_sentence_examples', '__nativethink_word_img_v2_', '__nativethink_writing_draft', '__nativethink_quickcard_pos', '__nativethink_browse_memorized']) {
      safeStorage.removeItem(k);
    }
    // 单词插图缓存是前缀匹配
    try {
      const rm: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.includes('__nativethink_word_img_')) rm.push(k);
      }
      rm.forEach((k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
    } catch { /* ignore */ }
    toast.success('AI 生成内容与缓存已清除（下次会重新生成）');
    setShowResetDialog(false); setResetConfirm(null);
  };

  const handleResetWordLearning = () => {
    // Clear all per-level word learning storage
    const LEVELS = ['all', 'zhongkao', 'gaokao', 'cet4', 'cet6', 'cet46freq', 'cet46elite', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'];
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
        persistText('__nativethink_word_learning', JSON.stringify(state));
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
      '__nativethink_colloc_cache', '__nativethink_colloc_ai_translations',
      '__nativethink_colloc_ai_tranlations',
      '__nativethink_example_trans',
    ];
    keys.forEach((k) => safeStorage.removeItem(k));
    toast.success('AI 生成内容已清除（刷新页面后生效）');
    setShowResetDialog(false); setResetConfirm(null);
  };
  const handleResetFavorites = () => {
    // 必须用 clearAll —— 循环调 removeFavorite 会因陈旧闭包只删掉最后一条
    clearAll();
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
    const statsOk = resetAll();
    resetAchievements();
    // 同 handleResetFavorites：清空收藏必须走 clearAll（陈旧闭包只删一条）
    clearAll();
    // Clear all per-level word learning storage
    const LEVELS = ['all', 'zhongkao', 'gaokao', 'cet4', 'cet6', 'cet46freq', 'cet46elite', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'];
    LEVELS.forEach((l) => {
      safeStorage.removeItem(`__nativethink_word_learning_${l}`);
      safeStorage.removeItem(`__nativethink_daily_quota_${l}`);
    });
    // Legacy global keys
    safeStorage.removeItem('__nativethink_word_learning');
    safeStorage.removeItem('__nativethink_daily_quota');
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
      '__nativethink_colloc_cache', '__nativethink_colloc_ai_translations',
      '__nativethink_colloc_ai_tranlations',
      '__nativethink_colloc_state', '__nativethink_colloc_memorized',
      '__nativethink_level_memory', '__nativethink_feedback_list',
      '__nativethink_think_pattern_progress',
      'vocab-page', 'vocab-search', 'chunk-page', 'chunk-search',
      'shadowing-rate', 'shadowing-filter',
      '__nativethink_example_trans',
    ];
    allKeys.forEach((k) => safeStorage.removeItem(k));
    if (statsOk) toast.success('所有学习记录已重置（部分数据刷新后生效）');
    else toast.error('学习统计未能写入本地存储，其余记录已清理；请检查可用空间后重试');
    setShowResetDialog(false); setResetConfirm(null);
  };

  const calendarDays = useMemo(() => {
    return buildCalendarDays(calendar, currentMonth.getFullYear(), currentMonth.getMonth());
  }, [currentMonth, calendar]);

  const viewingCurrentMonth = isCurrentMonth(currentMonth.getFullYear(), currentMonth.getMonth());
  const canNextMonth = canGoToNextMonth(currentMonth.getFullYear(), currentMonth.getMonth());

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    if (!canNextMonth) return;
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const goToCurrentMonth = () => setCurrentMonth(new Date());

  const monthLabel = `${currentMonth.getFullYear()}年 ${currentMonth.getMonth() + 1}月`;

  const getIntensityClass = (minutes: number) => {
    if (minutes === 0) return 'bg-muted/50';
    if (minutes < 20) return 'bg-[var(--brand)]/30';
    if (minutes < 40) return 'bg-[var(--brand)]/60';
    return 'bg-[var(--brand)]';
  };

  const favoriteTypeSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of favorites) counts.set(f.type, (counts.get(f.type) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([type, count]) => ({ type, count, label: TYPE_LABEL_MAP[type] || type }));
  }, [favorites]);

  const recentFavorites = useMemo(
    () => [...favorites].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3),
    [favorites],
  );

  const sortedAchievements = useMemo(
    () => sortAchievements(definitions, unlocked.map((u) => u.id)),
    [definitions, unlocked],
  );

  /** 成就卡的「还差多少」：天数/分钟来自学习统计，次数读各自的真实存储 */
  const achievementStats = useMemo(
    () => buildAchievementStats(stats, readAchievementCounts()),
    [stats],
  );

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
          <div className="flex items-center gap-2 flex-wrap mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowResetDialog(true)}
              className="rounded-2xl text-[10px] font-black uppercase tracking-wider border-border hover:border-[var(--brand)] hover:text-ink-teal"
            >
              <RotateCw className="size-3.5 mr-1.5" />
              管理学习记录
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={backup.exportLearningData}
              disabled={backup.backupBusy}
              className="rounded-2xl text-[10px] font-black uppercase tracking-wider border-border hover:border-[var(--brand)] hover:text-ink-teal"
            >
              <Download className="size-3.5 mr-1.5" />
              导出学习数据
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={backup.openImportPicker}
              disabled={backup.backupBusy}
              className="rounded-2xl text-[10px] font-black uppercase tracking-wider border-border hover:border-[var(--brand)] hover:text-ink-teal"
            >
              <Upload className="size-3.5 mr-1.5" />
              从备份恢复
            </Button>
            <BackupFileInput inputRef={backup.fileInputRef} onFile={backup.handleImportFile} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
            备份含学习数据、导入书正文和阅读译文，不含视频精听媒体及字幕。恢复会覆盖同名数据和同 ID 书籍，保留其他本地书；建议先导出当前数据。
          </p>
          {backup.backupReport && <p role="status" className="mt-2 text-sm leading-relaxed">{backup.backupReport}</p>}
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
                    { key: 'spelling', label: '句子拼写进度', desc: '拼写练习记录、已完成标记、出题队列', icon: SpellCheck, color: 'text-orange-500', action: handleResetSpelling },
                    { key: 'reading', label: '阅读进度与批注', desc: '每本书阅读位置、对照翻译缓存、段落批注', icon: BookMarked, color: 'text-sky-500', action: handleResetReading },
                    { key: 'aicache', label: 'AI 生成内容缓存', desc: '单词例句/解析、搭配翻译、插图缓存', icon: Trash2, color: 'text-violet-500', action: handleResetAiCaches },
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
                        case 'spelling': handleResetSpelling(); break;
                        case 'reading': void handleResetReading(); break;
                        case 'aicache': handleResetAiCaches(); break;
                        case 'zhongkao': case 'gaokao': case 'cet4': case 'cet6': case 'cet46freq': case 'cet46elite': case 'ielts': case 'toefl': case 'postgraduate': case 'professional': case 'advanced': handleResetWordLevel(resetConfirm); break;
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

      {/* 顶部统计：紧凑条（原四张 32px 大卡 + 彩色图标块，占掉近半屏） */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-border bg-border md:grid-cols-4">
        <StatTile className="rounded-none border-0 bg-card"
          label="连续天数"
          value={`${stats.streakDays} 天`}
          hint={`累计 ${stats.totalDays} 天`}
        />
        <StatTile className="rounded-none border-0 bg-card"
          label="今日目标"
          value={`${Math.round(stats.todayMinutes)}/${stats.dailyGoalMinutes}m`}
          hint={`${Math.round((stats.todayMinutes / Math.max(1, stats.dailyGoalMinutes)) * 100)}%`}
        />
        <StatTile className="rounded-none border-0 bg-card"
          label="累计学习"
          value={`${Math.round(calendar.reduce((sum, r) => sum + r.minutes, 0))} 分钟`}
          hint={`打卡 ${calendar.filter((r) => r.checkedIn).length} 天`}
        />
        <StatTile className="rounded-none border-0 bg-card"
          label="地道表达"
          value={`${favorites.length} 条`}
          hint={`本周 +${favorites.filter((f) => Date.now() - f.createdAt < 7 * 86400000).length}`}
        />
      </div>

      <Tabs defaultValue="calendar" value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="bg-muted p-1.5 rounded-3xl h-auto max-w-full overflow-x-auto flex-nowrap justify-start [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsTrigger
            value="calendar"
            className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-ink-teal data-[state=active]:shadow-sm"
          >
            <Calendar className="hidden sm:inline size-4 mr-2" />
            日历打卡
          </TabsTrigger>
          <TabsTrigger
            value="stats"
            className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-ink-teal data-[state=active]:shadow-sm"
          >
            <BarChart3 className="hidden sm:inline size-4 mr-2" />
            学习统计
          </TabsTrigger>
          <TabsTrigger
            value="favorites"
            className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-ink-teal data-[state=active]:shadow-sm"
          >
            <Heart className="hidden sm:inline size-4 mr-2" />
            收藏本
          </TabsTrigger>
          <TabsTrigger
            value="achievements"
            className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-ink-teal data-[state=active]:shadow-sm"
          >
            成就徽章
          </TabsTrigger>
        </TabsList>

        {/* 日历 */}
        <TabsContent value="calendar" className="mt-6">
          <Card className="rounded-[24px] border-border">
            <CardHeader className="pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Calendar className="size-5 text-ink-teal" strokeWidth={1.8} />
                  <div>
                    <CardTitle className="text-[17px] font-extrabold text-foreground">
                      {monthLabel}
                    </CardTitle>
                    <CardDescription className="mt-0.5 text-[11px] font-medium">
                      本月已打卡 {calendarDays.filter((d) => d.checkedIn).length} 天
                    </CardDescription>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {!viewingCurrentMonth && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={goToCurrentMonth}
                      className="rounded-full bg-muted px-3 text-[10px] font-black text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    >
                      <Calendar className="size-3.5" />
                      回到本月
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={prevMonth}
                    aria-label="上个月"
                    className="rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                  >
                    <TrendingUp className="size-4 rotate-180" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={nextMonth}
                    disabled={!canNextMonth}
                    aria-label="下个月"
                    title={canNextMonth ? '下个月' : '已经是本月'}
                    className="rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground disabled:opacity-35"
                  >
                    <TrendingUp className="size-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* 星期标题 */}
              <div className="mx-auto mb-2 grid max-w-[560px] grid-cols-7 gap-1.5">
                {WEEK_DAYS.map((day) => (
                  <div
                    key={day}
                    className="py-1 text-center text-[10px] font-medium text-muted-foreground"
                  >
                    {day}
                  </div>
                ))}
              </div>
              {/* 日期格子 */}
              <div className="mx-auto grid max-w-[560px] grid-cols-7 gap-1.5">
                {calendarDays.map((day, idx) => {
                  const isDayInMonth = day.date.getMonth() === currentMonth.getMonth();
                  const isToday =
                    day.date.toDateString() === new Date().toDateString();
                  return (
                    <div
                      key={idx}
                      className={cn(
                        'h-11 sm:h-12 rounded-[10px] flex flex-col items-center justify-center text-[11px] transition-all',
                        isDayInMonth ? '' : 'opacity-30',
                        isToday && 'ring-1 ring-inset ring-[var(--brand)]',
                      )}
                    >
                      <div
                        className={cn(
                          'h-full w-full rounded-[10px] flex flex-col items-center justify-center',
                          getIntensityClass(day.minutes),
                          day.minutes > 0 && 'text-white',
                          day.minutes === 0 && 'text-muted-foreground',
                        )}
                      >
                        <span className="font-semibold">{day.date.getDate()}</span>
                        {day.minutes > 0 && (
                          <span className="text-[8px] font-medium opacity-80">{Math.round(day.minutes)}m</span>
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
                  <div className="size-4 rounded bg-muted/50" />
                  <div className="size-4 rounded bg-[var(--brand)]/30" />
                  <div className="size-4 rounded bg-[var(--brand)]/60" />
                  <div className="size-4 rounded bg-[var(--brand)]" />
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

        {/* 收藏本：只留总览，完整列表/搜索/回顾在 /favorites */}
        <TabsContent value="favorites" className="mt-6">
          <Card data-favorites-summary className="rounded-[24px] border-border">
            <CardHeader className="pb-4">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-pink-50 text-pink-500 dark:bg-pink-500/15">
                    <Heart className="size-5.5" />
                  </div>
                  <div>
                    <CardTitle className="text-[17px] font-extrabold text-foreground">
                      收藏的地道表达
                    </CardTitle>
                    <CardDescription className="mt-0.5 text-[11px] font-medium">
                      共 {favorites.length} 条收藏 · 搜索、筛选与回顾在收藏页
                    </CardDescription>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  data-favorites-entry="manage"
                  onClick={() => navigate('/favorites')}
                  className="rounded-xl border-border text-[10px] font-black uppercase tracking-wider hover:border-[var(--brand)] hover:text-ink-teal"
                >
                  去收藏页管理
                  <ExternalLink className="size-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {favorites.length === 0 ? (
                <EmptyState
                  icon={Heart}
                  title="还没有收藏"
                  description="在学习过程中点击心形图标收藏你喜欢的表达；收藏页负责搜索、筛选和回顾。"
                  className="py-12"
                  action={(
                    <Button
                      onClick={() => navigate('/vocabulary')}
                      className="rounded-full bg-[var(--brand)] px-6 text-[var(--on-brand)] hover:bg-[var(--brand-strong)]"
                    >
                      去词汇学习
                    </Button>
                  )}
                />
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {favoriteTypeSummary.map(({ type, count, label }) => (
                      <span
                        key={type}
                        className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-black text-muted-foreground"
                      >
                        {label} <span className="text-foreground">{count}</span>
                      </span>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                      最近收藏
                    </p>
                    {recentFavorites.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigate('/favorites')}
                        className="flex w-full items-start gap-3 rounded-2xl border border-border/60 p-3 text-left transition-colors hover:border-rose-200/60 hover:bg-muted/20"
                      >
                        <span className="mt-0.5 shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-ink-teal dark:bg-emerald-500/10">
                          {TYPE_LABEL_MAP[item.type] || item.type}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-black text-foreground">{item.content}</span>
                          <span className="mt-0.5 block truncate text-[10px] font-bold text-muted-foreground">{item.meaning}</span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
                      </button>
                    ))}
                  </div>

                  <p className="text-[10px] font-bold text-muted-foreground/70">
                    搜索、按类型筛选、12 条增量加载与「开始回顾」都在收藏页；这里只留总览。
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 成就徽章 */}
        <TabsContent value="achievements" className="mt-6">
          <Card className="rounded-[24px] border-border">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-2xl bg-amber-50 dark:bg-amber-500/15 text-amber-500 flex items-center justify-center">
                  </div>
                <div>
                  <CardTitle className="text-[17px] font-extrabold text-foreground">
                    成就徽章
                  </CardTitle>
                  <CardDescription className="mt-0.5 text-[11px] font-medium">
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
                {sortedAchievements.map((achievement) => {
                  const unlocked_ = isUnlocked(achievement.id);
                  const found = unlocked.find((u) => u.id === achievement.id);
                  const progress = achievementProgress(achievement, achievementStats);
                  const gap = formatAchievementGap(progress);
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
                      {!unlocked_ && progress && gap && (
                        <div className="mt-3" data-achievement-progress={achievement.id}>
                          <div className="h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[var(--brand)]"
                              style={{ width: `${achievementRatio(progress)}%` }}
                            />
                          </div>
                          <p className="mt-2 text-[10px] font-black text-foreground">
                            {gap}
                            <span className="ml-1 font-bold text-muted-foreground">
                              · {progress.current}/{progress.target} {progress.unit}
                            </span>
                          </p>
                        </div>
                      )}
                      {!unlocked_ && (!progress || !gap) && (
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
