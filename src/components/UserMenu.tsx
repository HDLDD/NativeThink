import { useState } from 'react';
import { User, LogOut, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-provider';
import AuthDialog from './AuthDialog';

export default function UserMenu() {
  const { user, isAuthenticated, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!isAuthenticated) {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAuthOpen(true)}
          className="bg-muted hover:bg-muted/80 rounded-2xl text-muted-foreground hover:text-[#00B894] transition-colors gap-1.5 text-xs font-bold"
        >
          <User className="size-4" />
          <span className="hidden sm:inline">登录</span>
        </Button>
        <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      </>
    );
  }

  return (
    <>
      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMenuOpen(!menuOpen)}
          className="bg-muted hover:bg-muted/80 rounded-2xl text-muted-foreground hover:text-[#00B894] transition-colors gap-1.5 text-xs font-bold"
        >
          <div className="size-5 rounded-full bg-[#00B894]/20 text-[#00B894] flex items-center justify-center text-[10px] font-black">
            {user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
          <span className="hidden sm:inline max-w-[80px] truncate">{user?.email?.split('@')[0]}</span>
          <ChevronDown className="size-3" />
        </Button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-2 z-50 w-48 rounded-2xl bg-card border border-border shadow-xl p-1.5">
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground truncate">{user?.email}</div>
              <button
                onClick={() => { logout(); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
              >
                <LogOut className="size-3.5" />
                退出登录
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
