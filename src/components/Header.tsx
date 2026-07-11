import { Sun, Moon, Bell, Calendar, Clock, Target, Settings } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/use-theme';
import { useLearningStats } from '@/lib/use-learning-stats';
import { formatDate } from '@/lib/utils';
import { useState, useEffect } from 'react';
import UserMenu from './UserMenu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
import AISettings from '@/components/AISettings';
import TTSSettings from '@/components/TTSSettings';
import HelpGuide from '@/components/HelpGuide';
import GlobalWordSearch from '@/components/GlobalWordSearch';
import ChangelogDialog from '@/components/ChangelogDialog';

const GOAL_OPTIONS = [10, 20, 30, 45, 60];

export default function Header() {
  const { theme, toggleTheme } = useTheme();
  const { stats, setDailyGoal } = useLearningStats();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [goalOpen, setGoalOpen] = useState(false);

  const handleGoalChange = (minutes: number) => {
    setDailyGoal(minutes);
    setGoalOpen(false);
    toast.success(`每日目标已设为 ${minutes} 分钟 🎯`);
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const dateStr = formatDate(currentTime);
  const timeStr = currentTime.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const weekDay = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][currentTime.getDay()];

  return (
    <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-xl border-b border-border/30">
      <div className="flex h-20 items-center justify-between px-6 lg:px-10">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="md:hidden" />
          <div className="hidden lg:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
              Welcome back
            </div>
            <h1 className="text-xl font-black italic tracking-tight text-foreground">
              NativeThink ✨
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 日期时间卡片 */}
          <div className="hidden md:flex items-center gap-4 bg-card border border-border rounded-3xl px-5 py-2.5 shadow-sm">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-muted-foreground" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {dateStr}
              </span>
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-[#00B894]" />
              <span className="text-sm font-black italic text-foreground tabular-nums">
                {timeStr}
              </span>
            </div>
            <div className="w-px h-4 bg-border" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#00B894]">
              {weekDay}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Daily Goal Setting */}
            <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="每日目标设置"
                  className="bg-muted hover:bg-muted/80 rounded-2xl text-muted-foreground hover:text-[#00B894] transition-colors"
                >
                  <Target className="size-4.5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm rounded-[32px] p-0 overflow-hidden">
                <div className="p-6 border-b border-border bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-black italic text-foreground flex items-center gap-2">
                      <Target className="size-5 text-[#00B894]" />
                      每日学习目标
                    </DialogTitle>
                  </DialogHeader>
                </div>
                <div className="p-6 space-y-3">
                  <p className="text-sm text-muted-foreground font-medium">
                    选择你每天想要学习的时间：
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {GOAL_OPTIONS.map((min) => (
                      <Button
                        key={min}
                        variant={stats.dailyGoalMinutes === min ? 'default' : 'outline'}
                        size="lg"
                        onClick={() => handleGoalChange(min)}
                        className={`rounded-2xl font-black text-sm ${
                          stats.dailyGoalMinutes === min
                            ? 'bg-[#00B894] text-white shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30'
                            : 'border-border hover:border-[#00B894] hover:text-[#00B894]'
                        }`}
                      >
                        {min} 分钟
                      </Button>
                    ))}
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center pt-2">
                    当前目标：{stats.dailyGoalMinutes} 分钟/天
                  </p>
                </div>
              </DialogContent>
            </Dialog>

            <ChangelogDialog />
            <button
              onClick={() => {
                if (window.confirm('将跳转到开发者B站主页（bilibili），是否继续？')) {
                  window.open('https://b23.tv/nHHPunY', '_blank', 'noopener,noreferrer');
                }
              }}
              className="inline-flex items-center justify-center size-9 bg-muted hover:bg-muted/80 rounded-2xl text-muted-foreground hover:text-[#00B894] transition-colors"
              aria-label="开发者B站主页"
              title="开发者B站主页"
            >
              <ExternalLink className="size-4.5" />
            </button>
            <HelpGuide />
            <GlobalWordSearch />
            <AISettings />
            <TTSSettings />
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label="切换主题"
              className="bg-muted hover:bg-muted/80 rounded-2xl text-muted-foreground hover:text-[#00B894] transition-colors"
            >
              {theme === 'light' ? <Moon className="size-4.5" /> : <Sun className="size-4.5" />}
            </Button>
            <UserMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
