import { Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import AppSidebar from '@/components/AppSidebar';
import MobileBottomNav from '@/components/MobileBottomNav';
import Header from '@/components/Header';

export function Layout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-w-0 overflow-x-hidden bg-background">
        <Header />
        <main className="flex-1 w-full overflow-y-auto px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8 pb-20 lg:pb-8">
          <div className="max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </main>
        <MobileBottomNav />
      </SidebarInset>
    </SidebarProvider>
  );
}
