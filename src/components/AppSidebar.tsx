import {
  MessagesSquare,
  LayoutDashboard,
  Brain,
  Puzzle,
  MessageSquare,
  Mic,
  FileText,
  BookOpen,
  Heart,
  BarChart3,
  PenLine,
  SpellCheck, Film,
  GraduationCap,
  Settings,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useGlobalDueCount } from '@/lib/use-word-learning';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { preloadCoreOnly } from '@/data/wordbank';

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
  '/video': () => import('@/pages/VideoLabPage/VideoLabPage'),
  '/sentences': () => import('@/pages/SentenceLabPage/SentenceLabPage'),
  '/cet': () => import('@/pages/CetExamPage/CetExamPage'),
  '/settings': () => import('@/pages/SettingsPage/SettingsPage'),
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
  { path: '/sentences', label: '句子学习', icon: MessagesSquare },
  { path: '/spelling', label: '句子拼写', icon: SpellCheck },
  { path: '/video', label: '视频精听', icon: Film },
  { path: '/cet', label: '四六级 App', icon: GraduationCap },
  { path: '/progress', label: '学习记录', icon: BarChart3 },
  { path: '/settings', label: '设置', icon: Settings },
];

export default function AppSidebar() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  // 待复习角标（扫全部等级；学习状态变更会广播刷新）
  const dueCount = useGlobalDueCount();

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-white/[0.07]">
        <div className="flex items-center gap-3 px-3 py-5 group-data-[state=collapsed]:px-0 group-data-[state=collapsed]:justify-center">
          <div className="relative grid size-9 shrink-0 place-items-center rounded-[12px] bg-[var(--brand)] text-[17px] font-black leading-none text-[#06231A]">
            N
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[var(--lime)] ring-2 ring-[#0C1712]" />
          </div>
          <div className="flex-1 min-w-0 group-data-[state=collapsed]:hidden">
            <div className="text-[17px] font-extrabold tracking-tight text-[#F2F6F2]">
              Native<span className="text-[#3EDDB5]">Think</span>
            </div>
            <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-white/35">
              English, natively
            </div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="px-3 py-4">
          <SidebarMenu className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.path === '/'
                  ? pathname === '/'
                  : pathname === item.path || pathname.startsWith(`${item.path}/`);
              return (
                <SidebarMenuItem key={item.path}
                  onMouseEnter={() => { ROUTE_PREFETCH[item.path]?.(); if (item.path === '/vocabulary') preloadCoreOnly(['cet4']); }}
                  onTouchStart={() => { ROUTE_PREFETCH[item.path]?.(); if (item.path === '/vocabulary') preloadCoreOnly(['cet4']); }}
                >
                  <SidebarMenuButton asChild tooltip={item.label} isActive={isActive}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      // 手机抽屉是整屏 modal 层：不主动关，路由已经切了但抽屉还盖着吞点击，
                      // 用户必须再点一次遮罩才能操作新页面（桌面侧栏常驻，这行是空转）
                      onClick={() => setOpenMobile(false)}
                      className={cn(
                        'flex h-9 items-center gap-3 rounded-[11px] px-3 transition-colors',
                        isActive
                          ? 'bg-[#E9F1EA] text-[#0C1712] hover:bg-[#F1F6F2] hover:text-[#0C1712]'
                          : 'text-white/50 hover:bg-white/[0.06] hover:text-white',
                      )}
                    >
                      <Icon
                        className={cn('size-[17px] shrink-0', isActive ? 'text-[#0C7C5C]' : 'text-white/40')}
                        strokeWidth={isActive ? 2.4 : 1.9}
                      />
                      <span className="group-data-[state=collapsed]:hidden text-[13px] font-medium tracking-wide">
                        {item.label}
                      </span>
                      {/* 待复习角标 —— 入口处提示"还有 N 个到期"，是回访的主要动机之一 */}
                      {item.path === '/vocabulary' && dueCount > 0 && (
                        <span
                          className={cn(
                            'group-data-[state=collapsed]:hidden ml-auto min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black grid place-items-center tabular-nums',
                            isActive ? 'bg-[#06231A] text-[#C8F26B]' : 'bg-white/10 text-[#C8F26B]',
                          )}
                          title={`${dueCount} 个单词待复习`}
                        >
                          {dueCount > 99 ? '99+' : dueCount}
                        </span>
                      )}
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
