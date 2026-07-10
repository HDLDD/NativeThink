import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Brain,
  Puzzle,
  MessageSquare,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { preloadLevels } from '@/data/wordbank';

const MOBILE_NAV = [
  { path: '/', label: '首页', icon: LayoutDashboard },
  { path: '/think', label: '思维', icon: Brain },
  { path: '/chunks', label: '语块', icon: Puzzle },
  { path: '/conversation', label: '对话', icon: MessageSquare },
  { path: '/vocabulary', label: '词汇', icon: BookOpen },
];

export default function MobileBottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border/50 safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-1">
        {MOBILE_NAV.map(({ path, label, icon: Icon }) => {
          const isActive =
            path === '/'
              ? pathname === '/'
              : pathname === path || pathname.startsWith(`${path}/`);
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              onTouchStart={() => { if (path === '/vocabulary') preloadLevels(['cet4']); }}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 h-full py-1 transition-colors',
                isActive
                  ? 'text-[#00B894]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon
                className={cn(
                  'size-5 transition-all',
                  isActive && 'drop-shadow-[0_0_6px_rgba(0,184,148,0.4)]',
                )}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span
                className={cn(
                  'text-[10px] font-bold transition-all',
                  isActive && 'font-black',
                )}
              >
                {label}
              </span>
              {isActive && (
                <span className="absolute top-0 w-8 h-0.5 rounded-b-full bg-[#00B894]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
