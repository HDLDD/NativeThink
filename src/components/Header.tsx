import { Calendar, Clock, Settings as SettingsIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import { useState, useEffect } from 'react';
import UserMenu from './UserMenu';
import GlobalWordSearch from '@/components/GlobalWordSearch';

/**
 * 顶栏只留三件事：日期时间、全局搜索、设置入口（+ 用户菜单）。
 * 使用指南 / 朗读 / AI / 每日目标 / 更新日志 / 外观主题全部收进 /settings ——
 * 顶栏图标从 9 个降到 3 个，窄屏不再需要横向滚动。
 */
export default function Header() {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());

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
              <Clock className="size-4 text-ink-teal" />
              <span className="text-sm font-black italic text-foreground tabular-nums">
                {timeStr}
              </span>
            </div>
            <div className="w-px h-4 bg-border" />
            <span className="text-xs font-bold uppercase tracking-wider text-ink-teal">
              {weekDay}
            </span>
          </div>

          <div className="flex items-center gap-1 min-w-0">
            <GlobalWordSearch />
            <Button
              variant="ghost"
              size="icon"
              aria-label="设置"
              title="设置"
              onClick={() => navigate('/settings')}
              className="bg-muted hover:bg-muted/80 rounded-2xl text-muted-foreground hover:text-ink-teal transition-colors"
            >
              <SettingsIcon className="size-4.5" />
            </Button>
            <UserMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
