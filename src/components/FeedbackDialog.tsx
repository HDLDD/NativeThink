import { useState, useCallback, useRef } from 'react';
import {
  MessageSquareHeart,
  Bug,
  Lightbulb,
  MessageCircle,
  Star,
  Send,
  Trash2,
  ChevronDown,
  ChevronUp,
  Clock,
  Shield,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useFeedback,
  checkRateLimit,
  sendToFeishu,
  getBuildWebhookUrl,
  type IFeedbackItem,
} from '@/lib/use-feedback';

const FEEDBACK_TYPES = [
  { value: 'bug' as const, label: 'Bug 报告', icon: Bug },
  { value: 'feature' as const, label: '功能建议', icon: Lightbulb },
  { value: 'general' as const, label: '一般反馈', icon: MessageCircle },
];

const TYPE_STYLES: Record<IFeedbackItem['type'], string> = {
  bug: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
  feature: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
  general: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20',
};

const TYPE_LABELS: Record<IFeedbackItem['type'], string> = {
  bug: 'Bug',
  feature: '建议',
  general: '反馈',
};

export default function FeedbackDialog() {
  const { feedbacks, addFeedback, deleteFeedback } = useFeedback();
  const buildWebhookUrl = getBuildWebhookUrl();

  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Form state
  const [type, setType] = useState<IFeedbackItem['type']>('general');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Honeypot — hidden from real users, visible to bots
  const honeypotRef = useRef<HTMLInputElement>(null);
  const [honeypot, setHoneypot] = useState('');

  const resetForm = useCallback(() => {
    setType('general');
    setTitle('');
    setDescription('');
    setRating(0);
    setHoverRating(0);
    setSubmitting(false);
    setHoneypot('');
  }, []);

  const canSubmit = description.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    // Honeypot check — bots will fill this hidden field
    if (honeypot.trim() !== '') {
      // Silently reject — don't tell the bot it was caught
      toast.success('感谢你的反馈！💚', {
        description: '你的意见会帮助我们改进应用体验。',
      });
      resetForm();
      setOpen(false);
      return;
    }

    if (!canSubmit) return;

    // Rate limit check
    const rateLimitError = checkRateLimit();
    if (rateLimitError) {
      toast.error(rateLimitError);
      return;
    }

    setSubmitting(true);

    const item = addFeedback({
      type,
      title: title.trim(),
      description: description.trim(),
      rating,
    });

    // Send to Feishu webhook if configured at build time
    let sentToFeishu = false;
    if (buildWebhookUrl) {
      sentToFeishu = await sendToFeishu(item, buildWebhookUrl);
    }

    setTimeout(() => {
      if (sentToFeishu) {
        toast.success('反馈已提交！💚', {
          description: '我们会尽快查看并处理。',
        });
      } else {
        toast.success('感谢你的反馈！💚', {
          description: '你的意见会帮助我们改进应用体验。',
        });
      }
      resetForm();
      setOpen(false);
    }, 300);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return '今天 ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    if (diff < 172800000) return '昨天';
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="反馈"
          className="bg-muted hover:bg-muted/80 rounded-2xl text-muted-foreground hover:text-[#00B894] transition-colors"
        >
          <MessageSquareHeart className="size-4.5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Gradient Header */}
        <div className="p-6 border-b border-border bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 shrink-0">
          <DialogHeader>
            <DialogTitle className="text-xl font-black italic text-foreground flex items-center gap-2">
              <MessageSquareHeart className="size-5 text-[#00B894]" />
              用户反馈
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground font-medium pt-1">
              告诉我们你的想法，帮助我们做得更好 ✨
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* HONEYPOT — hidden from humans, visible to bots. Do NOT remove the tabIndex or aria-hidden. */}
          <div className="absolute opacity-0 pointer-events-none" aria-hidden="true" style={{ height: 0, overflow: 'hidden' }}>
            <input
              ref={honeypotRef}
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              placeholder="Leave this empty"
            />
          </div>

          {/* Feedback Type */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              反馈类型
            </label>
            <div className="grid grid-cols-3 gap-2">
              {FEEDBACK_TYPES.map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  variant={type === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setType(value)}
                  className={cn(
                    'rounded-2xl font-bold text-xs gap-1.5 h-10',
                    type === value
                      ? 'bg-[#00B894] text-white shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30'
                      : 'border-border hover:border-[#00B894] hover:text-[#00B894]',
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              标题 <span className="text-muted-foreground/50">(可选)</span>
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="简短概括你的反馈..."
              className="rounded-2xl h-11 text-sm"
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              详细描述 <span className="text-red-400">*</span>
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请描述你的建议或遇到的问题..."
              className="rounded-2xl text-sm min-h-[100px] resize-none"
              maxLength={1000}
            />
            <p className="text-[10px] text-muted-foreground text-right">
              {description.length}/1000
            </p>
          </div>

          {/* Rating */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              评分 <span className="text-muted-foreground/50">(可选)</span>
            </label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star === rating ? 0 : star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-0.5 transition-colors"
                >
                  <Star
                    className={cn(
                      'size-6 transition-all',
                      (hoverRating || rating) >= star
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-muted-foreground/30',
                    )}
                  />
                </button>
              ))}
              {rating > 0 && (
                <span className="ml-2 text-xs font-bold text-muted-foreground">
                  {rating} / 5
                </span>
              )}
            </div>
          </div>

          {/* Security note */}
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
            <Shield className="size-3" />
            提交即表示你同意我们收集此反馈以改进服务
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full h-12 rounded-2xl bg-[#00B894] hover:bg-[#00a882] text-white font-black text-sm shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30 transition-all"
          >
            <Send className="size-4 mr-2" />
            {submitting ? '提交中...' : '提交反馈'}
          </Button>
          <DialogClose asChild>
            <Button variant="ghost" className="w-full rounded-2xl text-xs font-bold text-muted-foreground">
              取消
            </Button>
          </DialogClose>
        </div>

        {/* History Section */}
        {feedbacks.length > 0 && (
          <div className="border-t border-border shrink-0">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between px-6 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <span>历史反馈 ({feedbacks.length})</span>
              {showHistory ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
            {showHistory && (
              <div className="max-h-40 overflow-y-auto px-6 pb-4 space-y-2">
                {feedbacks.map((fb) => {
                  const Icon = FEEDBACK_TYPES.find((t) => t.value === fb.type)?.icon || MessageCircle;
                  return (
                    <div
                      key={fb.id}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-2xl border text-xs',
                        TYPE_STYLES[fb.type],
                      )}
                    >
                      <Icon className="size-3.5 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{TYPE_LABELS[fb.type]}</span>
                          {fb.title && <span className="truncate font-medium">{fb.title}</span>}
                          <span className="ml-auto flex items-center gap-1 text-[10px] opacity-60 shrink-0">
                            <Clock className="size-3" />
                            {formatDate(fb.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 opacity-80 line-clamp-2">{fb.description}</p>
                        {fb.rating > 0 && (
                          <div className="flex items-center gap-0.5 mt-1">
                            {Array.from({ length: fb.rating }).map((_, i) => (
                              <Star key={i} className="size-3 fill-amber-400 text-amber-400" />
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => deleteFeedback(fb.id)}
                        className="shrink-0 p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors mt-0.5"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
