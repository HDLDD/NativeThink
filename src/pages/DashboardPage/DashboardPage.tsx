import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Flame,
  Target,
  Brain,
  Puzzle,
  MessageSquare,
  Mic,
  BookOpen,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLearningStats } from '@/lib/use-learning-stats';
import { useFavorites } from '@/lib/use-favorites';
import type { IChunk } from '@/data/chunks';
import { cn } from '@/lib/utils';
import { useTTS } from '@/lib/use-tts';
import { toast } from 'sonner';
import { useAI } from '@/hooks/use-ai';
import { safeStorage } from '@/lib/safe-storage';

import { HeroCard } from './HeroCard';
import { KpiCard } from './KpiCard';
import { ProgressCard } from './ProgressCard';
import { DailySentenceCard } from './DailySentenceCard';
import { QuickStartGrid } from './QuickStartGrid';
import { ModuleProgressCard } from './ModuleProgressCard';
import { HistoryCalendar } from './HistoryCalendar';
import { LEARNING_OPTIONS } from './constants';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { stats, loaded } = useLearningStats();
  const { addFavorite, isFavorited, favorites, removeFavorite } = useFavorites();
  const tts = useTTS();
  const { isConfigured, chat: aiChat } = useAI();

  // Placeholder shown while chunk data loads lazily (avoids 146KB in main bundle)
  const PLACEHOLDER_CHUNK: IChunk = {
    id: '__placeholder__', content: 'Loading...', meaning: '加载中…', category: 'daily',
    usage: '', example: 'Loading daily chunk...', difficulty: 'beginner',
  };

  // Lazy-load chunk data (146KB) — avoids bloating the main bundle for a single daily quote
  const [mockChunks, setMockChunks] = useState<IChunk[]>([]);
  useEffect(() => {
    import('@/data/chunks').then((m) => setMockChunks(m.MOCK_CHUNKS));
  }, []);

  const pickRandomChunk = (): IChunk => {
    if (mockChunks.length === 0) return PLACEHOLDER_CHUNK;
    return mockChunks[Math.floor(Math.random() * mockChunks.length)];
  };
  const [dailyChunk, setDailyChunk] = useState<IChunk>(PLACEHOLDER_CHUNK);
  // Set initial daily chunk once chunks are loaded
  useEffect(() => {
    if (mockChunks.length > 0 && dailyChunk.id === '__placeholder__') {
      setDailyChunk(mockChunks[Math.floor(Math.random() * mockChunks.length)]);
    }
  }, [mockChunks, dailyChunk]);
  const [chunkLoading, setChunkLoading] = useState(false);
  const [exampleZh, setExampleZh] = useState('');

  // Save initial chunk to history on mount (only once, after chunks load)
  const didSaveRef = useRef(false);
  useEffect(() => {
    if (didSaveRef.current) return;
    if (dailyChunk.id === '__placeholder__') return; // wait for real chunk
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

  const handleShuffleChunk = useCallback(() => {
    const c = pickRandomChunk();
    setDailyChunk(c);
    setExampleZh('');
    saveToHistory(c);
  }, [mockChunks]);

  const handleAiGenerateChunk = useCallback(async () => {
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
  }, [isConfigured, aiChat]);

  const handleTranslateExample = useCallback(async () => {
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
  }, [exampleZh, isConfigured, aiChat, dailyChunk.example]);

  const favorited = isFavorited(dailyChunk.content, 'chunk');
  const isExampleFavorited = isFavorited(dailyChunk.example, 'expression');
  const [showLearnDialog, setShowLearnDialog] = useState(false);

  const handleToggleFavorite = useCallback(() => {
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
  }, [favorites, dailyChunk, addFavorite, removeFavorite]);

  const handleToggleExampleFavorite = useCallback(() => {
    if (isFavorited(dailyChunk.example, 'expression')) {
      const fav = favorites.find((f) => f.content === dailyChunk.example && f.type === 'expression');
      if (fav) removeFavorite(fav.id);
    } else {
      addFavorite({ type: 'expression', content: dailyChunk.example, meaning: dailyChunk.meaning, category: dailyChunk.category });
    }
  }, [favorites, dailyChunk, addFavorite, removeFavorite, isFavorited]);

  const handlePrevMonth = useCallback(() => {
    if (historyMonth === 0) { setHistoryMonth(11); setHistoryYear(historyYear - 1); } else setHistoryMonth(historyMonth - 1);
  }, [historyMonth, historyYear]);

  const handleNextMonth = useCallback(() => {
    if (historyMonth === 11) { setHistoryMonth(0); setHistoryYear(historyYear + 1); } else setHistoryMonth(historyMonth + 1);
  }, [historyMonth, historyYear]);

  const handleGoToToday = useCallback(() => {
    setHistoryMonth(todayDate.getMonth());
    setHistoryYear(todayDate.getFullYear());
  }, []);

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
        <HeroCard onStartLearning={() => setShowLearnDialog(true)} />

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

          <ProgressCard
            todayMinutes={stats.todayMinutes}
            dailyGoalMinutes={stats.dailyGoalMinutes}
            progressPercent={progressPercent}
          />
        </div>
      </div>

      {/* 每日一句 + 快速开始 */}
      <div className="grid grid-cols-12 gap-8">
        <DailySentenceCard
          dailyChunk={dailyChunk}
          exampleZh={exampleZh}
          chunkLoading={chunkLoading}
          favorited={favorited}
          isExampleFavorited={isExampleFavorited}
          onShowHistory={() => setShowHistory(true)}
          onShuffle={handleShuffleChunk}
          onAiGenerate={handleAiGenerateChunk}
          onTranslateExample={handleTranslateExample}
          onTTS={(text, options) => tts.speak(text, options)}
          onToggleFavorite={handleToggleFavorite}
          onToggleExampleFavorite={handleToggleExampleFavorite}
        />

        <QuickStartGrid onNavigate={navigate} />
      </div>

      {/* 模块进度 */}
      <ModuleProgressCard
        moduleProgress={stats.moduleProgress}
        onViewDetails={() => navigate('/progress')}
      />

      {/* 开始今日学习 - 选项弹窗 */}
      <Dialog open={showLearnDialog} onOpenChange={setShowLearnDialog}>
        <DialogContent className="max-w-lg rounded-[32px] p-0 overflow-hidden">
          <div className="p-6 border-b border-border bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10">
            <DialogHeader>
              <DialogTitle className="text-xl font-black italic text-foreground flex items-center gap-2">
                <Brain className="size-5 text-[#00B894]" />
                选择今日学习内容
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="p-6 grid grid-cols-2 gap-3">
            {LEARNING_OPTIONS.map((opt) => {
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
      <HistoryCalendar
        open={showHistory}
        onOpenChange={setShowHistory}
        history={history}
        historyMonth={historyMonth}
        historyYear={historyYear}
        historyByDate={historyByDate}
        monthDays={monthDays}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onGoToToday={handleGoToToday}
        monthLabel={monthLabel}
      />
    </div>
  );
}
