import { Settings as SettingsIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import { useState, useEffect } from 'react';
import UserMenu from './UserMenu';
import GlobalWordSearch from '@/components/GlobalWordSearch';

/**
 * 顶栏只留三件事：时间、全局搜索、设置入口（+ 用户菜单）。
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
    <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-xl border-b border-border/60">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3 min-w-0">
          <SidebarTrigger className="md:hidden -ml-1 text-foreground/70" />
          <div className="flex items-baseline gap-2.5 min-w-0">
            <span className="text-[15px] font-bold tabular-nums tracking-tight text-foreground">{timeStr}</span>
            <span className="hidden sm:inline text-[11px] font-medium tracking-wide text-muted-foreground">
              {dateStr} · {weekDay}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <GlobalWordSearch />
          <Button
            variant="ghost"
            size="icon"
            aria-label="设置"
            title="设置"
            onClick={() => navigate('/settings')}
            className="rounded-full bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <SettingsIcon className="size-4.5" />
          </Button>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
