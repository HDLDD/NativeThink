import { Suspense, Component, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import AppSidebar from '@/components/AppSidebar';
import MobileBottomNav from '@/components/MobileBottomNav';
import Header from '@/components/Header';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="size-8 animate-spin text-[#00B894]" />
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
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-w-0 overflow-x-hidden bg-background">
        <Header />
        <main className="flex-1 w-full overflow-y-auto px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8 pb-20 lg:pb-8">
          <div className="max-w-[1600px] mx-auto">
            <ErrorBoundary>
              <Suspense fallback={<PageFallback />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
        <MobileBottomNav />
      </SidebarInset>
    </SidebarProvider>
  );
}
