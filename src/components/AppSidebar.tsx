import {
  LayoutDashboard,
  Brain,
  Puzzle,
  MessageSquare,
  Mic,
  FileText,
  BookOpen,
  Heart,
  BarChart3,
  Sparkles,
  PenLine,
  SpellCheck,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { preloadLevels } from '@/data/wordbank';

// Route chunk prefetch map — triggers dynamic import() on hover to warm the browser cache
const ROUTE_PREFETCH: Record<string, () => Promise<unknown>> = {
  '/': () => import('@/pages/DashboardPage/DashboardPage'),
  '/think': () => import('@/pages/ThinkInEnglishPage/ThinkInEnglishPage'),
  '/chunks': () => import('@/pages/ChunkTrainingPage/ChunkTrainingPage'),
  '/conversation': () => import('@/pages/ConversationPage/ConversationPage'),
  '/shadowing': () => import('@/pages/ShadowingPage/ShadowingPage'),
  '/articles': () => import('@/pages/ArticlePage/ArticlePage'),
  '/vocabulary': () => import('@/pages/DeepVocabularyPage/DeepVocabularyPage'),
  '/favorites': () => import('@/pages/FavoritesPage/FavoritesPage'),
  '/writing': () => import('@/pages/WritingPage/WritingPage'),
  '/progress': () => import('@/pages/ProgressPage/ProgressPage'),
  '/spelling': () => import('@/pages/SpellingPage/SpellingPage'),
};

const NAV_ITEMS = [
  { path: '/', label: '首页仪表盘', icon: LayoutDashboard },
  { path: '/think', label: '母语思维训练', icon: Brain },
  { path: '/chunks', label: '语块训练', icon: Puzzle },
  { path: '/conversation', label: 'AI 对话练习', icon: MessageSquare },
  { path: '/shadowing', label: '影子跟读', icon: Mic },
  { path: '/articles', label: '文章阅读', icon: FileText },
  { path: '/vocabulary', label: '词汇深度', icon: BookOpen },
  { path: '/favorites', label: '我的收藏', icon: Heart },
  { path: '/writing', label: 'AI 写作练习', icon: PenLine },
  { path: '/spelling', label: '句子拼写', icon: SpellCheck },
  { path: '/progress', label: '学习记录', icon: BarChart3 },
];

export default function AppSidebar() {
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-card">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-4 group-data-[state=collapsed]:px-0 group-data-[state=collapsed]:justify-center">
          <div className="size-10 shrink-0 rounded-2xl bg-gradient-to-br from-[#00B894] to-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1 min-w-0 group-data-[state=collapsed]:hidden">
            <div className="text-lg font-black italic tracking-tight text-foreground">
              Native<span className="text-[#00B894] not-italic">Think</span>
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              母语思维英语训练
            </div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="p-3">
          <SidebarMenu className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.path === '/'
                  ? pathname === '/'
                  : pathname === item.path || pathname.startsWith(`${item.path}/`);
              return (
                <SidebarMenuItem key={item.path}
                  onMouseEnter={() => { ROUTE_PREFETCH[item.path]?.(); if (item.path === '/vocabulary') preloadLevels(['cet4']); }}
                  onTouchStart={() => { ROUTE_PREFETCH[item.path]?.(); if (item.path === '/vocabulary') preloadLevels(['cet4']); }}
                >
                  <SidebarMenuButton asChild tooltip={item.label} isActive={isActive}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      className={cn(
                        'flex items-center gap-3 transition-all duration-200 rounded-2xl',
                        isActive
                          ? 'bg-[#00B894] text-white shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30 hover:bg-[#00B894] hover:text-white'
                          : 'text-foreground/60 hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Icon className="size-5 shrink-0" />
                      <span className="group-data-[state=collapsed]:hidden text-xs font-bold uppercase tracking-wider">
                        {item.label}
                      </span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
