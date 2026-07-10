import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  ExternalLink,
  Cpu,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  type AIProvider,
  ALL_PROVIDERS,
  PROVIDER_CONFIGS,
  getAPIKey,
  setAPIKey,
  clearAPIKey,
  getActiveProvider,
  setActiveProvider,
} from '@/services/ai-config';
import { chat, buildMessages } from '@/services/ai-service';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ProviderState {
  key: string;
  showKey: boolean;
  testing: boolean;
  tested: boolean;
  working: boolean;
}

type ProviderStates = Record<AIProvider, ProviderState>;

function createInitialState(): ProviderStates {
  const states = {} as ProviderStates;
  for (const p of ALL_PROVIDERS) {
    const saved = getAPIKey(p);
    states[p] = {
      key: saved || '',
      showKey: false,
      testing: false,
      tested: false,
      working: false,
    };
  }
  return states;
}

export default function AISettings() {
  const [open, setOpen] = useState(false);
  const [states, setStates] = useState<ProviderStates>(createInitialState);

  useEffect(() => {
    if (open) setStates(createInitialState());
  }, [open]);

  const updateKey = useCallback((provider: AIProvider, value: string) => {
    setStates((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], key: value },
    }));
  }, []);

  const toggleShowKey = useCallback((provider: AIProvider) => {
    setStates((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], showKey: !prev[provider].showKey },
    }));
  }, []);

  const saveKey = useCallback((provider: AIProvider, key: string) => {
    const trimmed = key.trim();
    if (trimmed) {
      setAPIKey(provider, trimmed);
      setStates((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], configured: true, tested: false, working: false },
      }));
      toast.success(`${PROVIDER_CONFIGS[provider].name} API Key 已保存`);
    } else {
      clearAPIKey(provider);
      setStates((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], tested: false, working: false },
      }));
    }
  }, []);

  const clearKey = useCallback((provider: AIProvider) => {
    clearAPIKey(provider);
    setStates((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], key: '', tested: false, working: false },
    }));
    toast.info(`${PROVIDER_CONFIGS[provider].name} API Key 已清除`);
  }, []);

  const testConnection = useCallback(async (provider: AIProvider) => {
    const st = states[provider];
    const key = st.key.trim();
    if (!key) {
      toast.error('请先输入 API Key');
      return;
    }

    setAPIKey(provider, key);
    setStates((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], testing: true },
    }));

    try {
      const messages = buildMessages(
        'Reply with only the word "OK". No other text.',
        'Ping',
      );
      const result = await chat(messages, {
        provider,
        maxTokens: 10,
        temperature: 0,
      });
      if (result) {
        setStates((prev) => ({
          ...prev,
          [provider]: { ...prev[provider], testing: false, tested: true, working: true },
        }));
        toast.success(`${PROVIDER_CONFIGS[provider].name} 连接成功！✅`);
      } else {
        throw new Error('Empty response');
      }
    } catch (err: any) {
      setStates((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], testing: false, tested: true, working: false },
      }));
      toast.error(`${PROVIDER_CONFIGS[provider].name} 连接失败: ${err.message}`);
    }
  }, [states]);

  const handleSetActive = useCallback((provider: AIProvider) => {
    setActiveProvider(provider);
    toast.success(`已切换到 ${PROVIDER_CONFIGS[provider].name}`);
    setStates(createInitialState());
  }, []);

  const configuredCount = ALL_PROVIDERS.filter((p) => getAPIKey(p)).length;
  const activeP = getActiveProvider();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="AI 设置"
          className="relative bg-muted hover:bg-muted/80 rounded-2xl text-muted-foreground hover:text-[#00B894] transition-colors"
        >
          <Cpu className="size-4.5" />
          {configuredCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl rounded-[32px] p-0 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-border bg-gradient-to-r from-emerald-50 to-indigo-50 dark:from-emerald-500/10 dark:to-indigo-500/10">
          <DialogHeader>
            <DialogTitle className="text-xl font-black italic text-foreground flex items-center gap-2">
              <Sparkles className="size-5 text-[#00B894]" />
              AI 模型设置
            </DialogTitle>
            <p className="text-sm text-muted-foreground font-medium mt-1">
              已配置 {configuredCount}/{ALL_PROVIDERS.length} 个模型 · 当前：
              <Badge className="ml-1.5 rounded-full px-2 py-0 text-[10px] font-black bg-[#00B894]/10 text-[#00B894] border-none">
                {PROVIDER_CONFIGS[activeP].name}
              </Badge>
            </p>
          </DialogHeader>
        </div>

        {/* 2xn Grid of provider cards */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            {ALL_PROVIDERS.map((provider) => {
              const cfg = PROVIDER_CONFIGS[provider];
              const st = states[provider];
              const isActive = activeP === provider;
              const hasKey = !!st.key.trim();
              const isConfigured = !!getAPIKey(provider);

              return (
                <div
                  key={provider}
                  className={cn(
                    'p-5 rounded-[24px] border-2 transition-all',
                    isActive && isConfigured
                      ? 'border-[#00B894] bg-[#00B894]/5'
                      : 'border-border bg-muted/20',
                  )}
                >
                  {/* Title row */}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-black text-foreground">{cfg.name}</h3>
                    <div className="flex items-center gap-1">
                      {isConfigured && (
                        <Badge className="rounded-full px-2 py-0 text-[9px] font-black bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 border-none">
                          已配置
                        </Badge>
                      )}
                      {isActive && isConfigured && (
                        <Badge className="rounded-full px-2 py-0 text-[9px] font-black bg-[#00B894]/15 text-[#00B894] border-none">
                          当前
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-[11px] text-muted-foreground font-medium mb-1.5 leading-snug">
                    {cfg.description}
                  </p>

                  {/* Model + register link */}
                  <div className="flex items-center justify-between mb-3">
                    <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-[#00B894] font-bold">
                      {cfg.freeModel}
                    </code>
                    <a
                      href={cfg.registerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-[#00B894] hover:underline"
                    >
                      获取 Key
                      <ExternalLink className="size-2.5" />
                    </a>
                  </div>

                  {/* API Key input */}
                  <div className="flex gap-1.5 mb-2.5">
                    <div className="relative flex-1">
                      <Key className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type={st.showKey ? 'text' : 'password'}
                        value={st.key}
                        onChange={(e) => updateKey(provider, e.target.value)}
                        placeholder="API Key..."
                        className="pl-7 pr-7 py-1.5 rounded-xl bg-muted border-none text-xs font-medium focus-visible:ring-2 focus-visible:ring-emerald-200"
                        onBlur={() => saveKey(provider, st.key)}
                      />
                      <button
                        type="button"
                        onClick={() => toggleShowKey(provider)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {st.showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                    </div>
                    {hasKey && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => clearKey(provider)}
                        className="rounded-xl bg-muted hover:bg-rose-100 text-muted-foreground hover:text-rose-500 shrink-0 size-8"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection(provider)}
                      disabled={st.testing || !st.key.trim()}
                      className={cn(
                        'flex-1 rounded-xl text-[9px] font-black uppercase tracking-wider h-8',
                        'border-border hover:border-[#00B894] hover:text-[#00B894]',
                      )}
                    >
                      {st.testing ? (
                        <>
                          <Loader2 className="size-3 mr-1 animate-spin" />
                          测试中
                        </>
                      ) : st.tested && st.working ? (
                        <>
                          <CheckCircle2 className="size-3 mr-1 text-emerald-500" />
                          正常
                        </>
                      ) : st.tested && !st.working ? (
                        <>
                          <XCircle className="size-3 mr-1 text-rose-500" />
                          失败
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-3 mr-1" />
                          测试
                        </>
                      )}
                    </Button>
                    {isConfigured && !isActive && (
                      <Button
                        size="sm"
                        onClick={() => handleSetActive(provider)}
                        className="rounded-xl text-[9px] font-black uppercase tracking-wider bg-[#00B894] hover:bg-[#00A080] h-8 text-white shadow-sm shrink-0"
                      >
                        选用
                      </Button>
                    )}
                    {isActive && isConfigured && (
                      <div className="flex items-center justify-center h-8 px-3 rounded-xl bg-[#00B894]/10 text-[#00B894] text-[9px] font-black uppercase tracking-wider shrink-0">
                        <CheckCircle2 className="size-3 mr-1" />
                        使用中
                      </div>
                    )}
                  </div>

                  {/* Test result */}
                  {st.tested && (
                    <div
                      className={cn(
                        'mt-2 p-2 rounded-xl flex items-center gap-1.5 text-[10px] font-bold',
                        st.working
                          ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 border border-rose-200',
                      )}
                    >
                      {st.working ? (
                        <>
                          <CheckCircle2 className="size-3 shrink-0" />
                          连接正常
                        </>
                      ) : (
                        <>
                          <XCircle className="size-3 shrink-0" />
                          Key 无效或无余额
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-muted/20">
          <p className="text-[10px] font-medium text-muted-foreground text-center">
            API Key 仅保存在浏览器本地存储中，不会上传到任何服务器
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
