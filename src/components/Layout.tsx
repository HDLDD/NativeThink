import { Suspense, useEffect, Component, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import AppSidebar from '@/components/AppSidebar';
import MobileBottomNav from '@/components/MobileBottomNav';
import Header from '@/components/Header';
import { useFocusMode } from '@/lib/focus-mode';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { safeStorage } from '@/lib/safe-storage';

function PageFallback() {
  return (
    <div className="animate-pulse space-y-6 py-4">
      {/* Title skeleton */}
      <div className="h-7 w-40 rounded-xl bg-muted" />
      {/* Content skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
            <div className="h-4 w-3/4 rounded-lg bg-muted" />
            <div className="h-3 w-1/2 rounded-lg bg-muted/60" />
            <div className="h-3 w-full rounded-lg bg-muted/40" />
          </div>
        ))}
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center py-24">
          <div className="text-center space-y-4 max-w-md">
            <div className="size-16 rounded-2xl bg-amber-50 dark:bg-amber-500/15 flex items-center justify-center mx-auto">
              <AlertTriangle className="size-8 text-amber-500" />
            </div>
            <h3 className="text-lg font-black text-foreground">页面加载异常</h3>
            <p className="text-sm text-muted-foreground">{this.state.error?.message || '未知错误'}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="rounded-2xl gap-1"
            >
              <RefreshCw className="size-3.5" />刷新页面
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function Layout() {
  const location = useLocation();
  const { focused } = useFocusMode();

  // Route change UX: reset scroll to top, retrigger the page-enter animation,
  // and remember the last visited module (for "继续上次学习" on the dashboard)
  useEffect(() => {
    const main = document.querySelector('main.flex-1');
    if (main) main.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    if (location.pathname !== '/') {
      try {
        safeStorage.setItem('__nativethink_last_visit', JSON.stringify({ path: location.pathname, ts: Date.now() }));
      } catch { /* ignore */ }
    }
  }, [location.pathname]);

  return (
    <SidebarProvider>
      {!focused && <AppSidebar />}
      <SidebarInset className="flex flex-col min-w-0 overflow-x-hidden bg-background min-h-screen">
        {!focused && <Header />}
        <main className="flex-1 w-full overflow-y-auto px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8 pb-20 lg:pb-8">
          <div className="max-w-[1600px] mx-auto">
            {/* keyed by pathname → remounts on navigation → page-enter animation */}
            <ErrorBoundary>
              <Suspense fallback={<PageFallback />}>
                <div key={location.pathname} className="page-enter">
                  <Outlet />
                </div>
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
        {!focused && <MobileBottomNav />}
      </SidebarInset>
    </SidebarProvider>
  );
}
