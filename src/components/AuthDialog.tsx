import { useState } from 'react';
import { Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth-provider';
import { toast } from 'sonner';

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => { setEmail(''); setPassword(''); setError(''); setShowPw(false); };

  const handleSubmit = async () => {
    setError('');
    if (!email.includes('@')) { setError('请输入有效的邮箱地址'); return; }
    if (password.length < 6) { setError('密码至少 6 位'); return; }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        toast.success('登录成功！数据已同步');
      } else {
        await register(email, password);
        toast.success('注册成功！欢迎使用 NativeThink');
      }
      reset();
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message || '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-sm rounded-[32px] p-0 overflow-hidden">
        <div className="p-6 border-b border-border bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10">
          <DialogHeader>
            <DialogTitle className="text-xl font-black italic text-foreground">
              {mode === 'login' ? '登录' : '注册'}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-4">
          {/* Mode toggle */}
          <div className="flex bg-muted rounded-2xl p-1">
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${mode === 'login' ? 'bg-white dark:bg-card text-emerald-500 shadow-sm' : 'text-muted-foreground'}`}
            >登录</button>
            <button
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${mode === 'register' ? 'bg-white dark:bg-card text-emerald-500 shadow-sm' : 'text-muted-foreground'}`}
            >注册</button>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="邮箱地址"
                className="pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-card border-border text-sm font-medium"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码 (至少 6 位)"
                className="pl-10 pr-10 py-2 rounded-xl bg-white dark:bg-card border-border text-sm font-medium"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs font-bold text-rose-500 bg-rose-50 dark:bg-rose-500/10 rounded-xl px-3 py-2">{error}</p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full rounded-2xl bg-[#00B894] hover:bg-[#00a882] text-white font-black text-sm shadow-lg shadow-emerald-200/50"
          >
            {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
            {mode === 'login' ? '登录' : '创建账号'}
          </Button>

          <p className="text-center text-[10px] text-muted-foreground font-medium">
            {mode === 'login' ? '登录后可在多设备间同步学习数据' : '注册后数据自动云端保存'}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
