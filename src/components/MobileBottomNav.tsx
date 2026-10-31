import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Brain,
  Puzzle,
  MessageSquare,
  FileText,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { preloadCoreOnly } from '@/data/wordbank';

// Route chunk prefetch map — triggers dynamic import() on touch to warm the browser cache
const ROUTE_PREFETCH: Record<string, () => Promise<unknown>> = {
  '/': () => import('@/pages/DashboardPage/DashboardPage'),
  '/think': () => import('@/pages/ThinkInEnglishPage/ThinkInEnglishPage'),
  '/chunks': () => import('@/pages/ChunkTrainingPage/ChunkTrainingPage'),
  '/conversation': () => import('@/pages/ConversationPage/ConversationPage'),
  '/shadowing': () => import('@/pages/ShadowingPage/ShadowingPage'),
  '/articles': () => import('@/pages/ArticlePage/ArticlePage'),
  '/vocabulary': () => import('@/pages/DeepVocabularyPage/DeepVocabularyPage'),
};

const MOBILE_NAV = [
  { path: '/', label: '首页', icon: LayoutDashboard },
  { path: '/think', label: '思维', icon: Brain },
  { path: '/chunks', label: '语块', icon: Puzzle },
  { path: '/conversation', label: '对话', icon: MessageSquare },
  { path: '/articles', label: '文章', icon: FileText },
  { path: '/vocabulary', label: '词汇', icon: BookOpen },
];

export default function MobileBottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[var(--ink)]/95 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-between gap-0.5 px-1.5 py-1.5">
        {MOBILE_NAV.map(({ path, label, icon: Icon }) => {
          const isActive =
            path === '/'
              ? pathname === '/'
              : pathname === path || pathname.startsWith(`${path}/`);
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              onTouchStart={() => { ROUTE_PREFETCH[path]?.(); if (path === '/vocabulary') preloadCoreOnly(['cet4']); }}
              className={cn(
                'flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[15px] transition-colors',
                isActive
                  ? 'bg-[var(--nav-bg)] text-[var(--nav-fg)]'
                  : 'text-white/45 hover:text-white',
              )}
            >
              <Icon
                className="size-5"
                strokeWidth={isActive ? 2.5 : 1.9}
              />
              <span className={cn('text-[10px] leading-none', isActive ? 'font-black' : 'font-semibold')}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
