import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Coffee, Heart, Star, Sparkles, Copy, Edit3, QrCode, Smartphone, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ============================================================
// Payment QR codes — replace with your own QR code URLs
// ============================================================
const QR_CODES: Record<string, { label: string; icon: typeof Smartphone; color: string; qrUrl: string }> = {
  wechat: {
    label: '微信支付',
    icon: Smartphone,
    color: '#07C160',
    qrUrl: '', // ← 替换为你的微信收款码图片URL
  },
  alipay: {
    label: '支付宝',
    icon: Smartphone,
    color: '#1677FF',
    qrUrl: '', // ← 替换为你的支付宝收款码图片URL
  },
};

const DONATION_TIERS = [
  { amount: '¥6', label: '一杯咖啡', icon: Coffee, emoji: '☕', color: '#8B4513' },
  { amount: '¥12', label: '一杯奶茶', icon: Heart, emoji: '🧋', color: '#F59E0B' },
  { amount: '¥18', label: '一顿午饭', icon: Star, emoji: '🍱', color: '#EC4899' },
  { amount: '¥30', label: '强力支持', icon: Sparkles, emoji: '✨', color: '#6C5CE7' },
];

type PayMethod = 'wechat' | 'alipay';
const PAY_METHODS: PayMethod[] = ['wechat', 'alipay'];

export default function DonateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PayMethod>('wechat');
  const [showQR, setShowQR] = useState(false);

  const activeAmount = customAmount ? `¥${customAmount}` : selected !== null ? DONATION_TIERS[selected].amount : null;
  const pm = QR_CODES[payMethod];
  const hasQR = pm.qrUrl.length > 0;

  const handleCopy = () => {
    const msg = activeAmount
      ? `感谢支持 ${activeAmount}！请使用${pm.label}扫码支付。`
      : `感谢支持！请使用${pm.label}扫码支付。`;
    navigator.clipboard.writeText(msg);
    toast.success(`已复制，感谢支持 🙏`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-[32px] p-0 overflow-hidden">
        {/* Header */}
        <div className="p-6 text-center bg-gradient-to-b from-amber-50 to-white dark:from-amber-500/10 dark:to-card">
          <div className="text-4xl mb-3">🙏</div>
          <h3 className="text-xl font-black italic text-foreground">支持开发者</h3>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            如果这个应用对你有帮助，请开发者喝杯咖啡吧 ☕
          </p>
          {activeAmount && (
            <p className="text-lg font-black text-amber-500 mt-2">{activeAmount}</p>
          )}
        </div>

        {/* Tiers + Payment method */}
        <div className="px-5 py-4 space-y-3">
          {/* Payment method toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground shrink-0">支付方式</span>
            <div className="flex gap-1 bg-muted rounded-xl p-0.5 flex-1">
              {PAY_METHODS.map((key) => {
                const m = QR_CODES[key];
                const active = payMethod === key;
                return (
                  <button
                    key={key}
                    onClick={() => setPayMethod(key)}
                    className={cn(
                      'flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1',
                      active ? 'text-white shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                    style={active ? { backgroundColor: m.color } : undefined}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount tiers */}
          <div className="grid grid-cols-2 gap-2">
            {DONATION_TIERS.map((tier, i) => (
              <button
                key={tier.amount}
                onClick={() => { setSelected(i); setCustomAmount(''); }}
                className={cn(
                  'p-3 rounded-2xl border-2 text-center transition-all',
                  selected === i
                    ? 'shadow-md'
                    : 'border-border hover:border-amber-200 hover:bg-amber-50/30',
                )}
                style={selected === i ? { borderColor: tier.color, backgroundColor: tier.color + '10' } : {}}
              >
                <span className="text-2xl">{tier.emoji}</span>
                <p className="text-lg font-black text-foreground mt-1">{tier.amount}</p>
                <p className="text-[10px] text-muted-foreground font-medium">{tier.label}</p>
              </button>
            ))}
          </div>

          {/* Custom amount */}
          <button
            onClick={() => { setSelected(null); }}
            className={cn(
              'w-full flex items-center gap-2 p-2.5 rounded-2xl border-2 text-left transition-all',
              selected === null && customAmount
                ? 'border-[#6366F1] bg-[#6366F1]/5 shadow-md'
                : 'border-dashed border-muted-foreground/25 hover:border-[#6366F1]/40 hover:bg-[#6366F1]/3',
            )}
          >
            <div className="size-8 rounded-xl bg-[#6366F1]/10 flex items-center justify-center shrink-0">
              <Edit3 className="size-3.5 text-[#6366F1]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-foreground">自定义金额</p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-sm font-black text-[#6366F1]">¥</span>
                <Input
                  value={customAmount}
                  onChange={(e) => { setCustomAmount(e.target.value.replace(/[^0-9.]/g, '')); setSelected(null); }}
                  placeholder="输入金额..."
                  className="h-5 px-1 py-0 text-xs font-bold bg-transparent border-0 border-b border-dashed border-muted-foreground/20 rounded-none focus-visible:ring-0 focus-visible:border-[#6366F1] w-20"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          </button>

          {/* QR code toggle */}
          <button
            onClick={() => setShowQR(!showQR)}
            className={cn(
              'w-full flex items-center gap-2 p-2.5 rounded-2xl border transition-all',
              showQR ? 'border-amber-300 bg-amber-50/50' : 'border-border hover:border-amber-200',
            )}
          >
            <QrCode className="size-4 text-muted-foreground" />
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex-1 text-left">
              扫码支付 {showQR ? '▼' : '▶'}
            </span>
            <ChevronDown className={cn('size-3.5 text-muted-foreground/50 transition-transform', showQR && 'rotate-180')} />
          </button>

          {/* QR code display */}
          {showQR && (
            <div className="text-center p-3 rounded-2xl bg-white dark:bg-card border border-border">
              {hasQR ? (
                <img src={pm.qrUrl} alt={`${pm.label}收款码`} className="w-40 h-40 mx-auto rounded-xl" />
              ) : (
                <div className="w-40 h-40 mx-auto rounded-xl border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <QrCode className="size-10 opacity-30" />
                  <p className="text-[9px] font-medium px-2 text-center leading-tight">
                    替换 QR_CODES 中对应支付方式的 qrUrl 为收款码URL
                  </p>
                </div>
              )}
              <p className="text-[10px] font-bold text-foreground mt-2">{pm.label}</p>
              <p className="text-[9px] text-muted-foreground">扫上方二维码完成支付</p>
            </div>
          )}
        </div>

        {/* Copy button */}
        <div className="px-5 pb-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="w-full rounded-xl border-dashed border-amber-300 text-amber-600 hover:bg-amber-50 text-[10px] font-black uppercase tracking-wider gap-1.5"
          >
            <Copy className="size-3" />
            复制打赏信息
          </Button>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 text-center">
          <p className="text-[10px] text-muted-foreground/60 font-medium">
            ❤️ 每一份支持都是持续开发的动力
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Compact donate button */
export function DonateButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="rounded-xl text-[10px] font-black uppercase tracking-wider gap-1.5 bg-amber-50 dark:bg-amber-500/15 text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-500/25 border border-amber-200 dark:border-amber-500/20"
    >
      <Coffee className="size-3.5" />
      打赏
    </Button>
  );
}
