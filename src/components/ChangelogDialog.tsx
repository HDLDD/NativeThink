import { useState, useEffect } from 'react';
import { ScrollText, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function ChangelogDialog() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const loadChangelog = async () => {
    if (content) return;
    setLoading(true);
    try {
      const res = await fetch('/CHANGELOG.md');
      if (res.ok) {
        setContent(await res.text());
      } else {
        setContent('# 更新日志\n\n暂无日志数据。');
      }
    } catch {
      setContent('# 更新日志\n\n加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog onOpenChange={(open) => { if (open) loadChangelog(); }}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="更新日志"
          className="bg-muted hover:bg-muted/80 rounded-2xl text-muted-foreground hover:text-[#00B894] transition-colors"
        >
          <ScrollText className="size-4.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] rounded-[32px] p-0 overflow-hidden">
        <div className="p-6 border-b border-border bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10">
          <DialogHeader>
            <DialogTitle className="text-xl font-black italic text-foreground flex items-center gap-2">
              <ScrollText className="size-5 text-[#00B894]" />
              更新日志
            </DialogTitle>
          </DialogHeader>
        </div>
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="size-6 animate-spin mr-2" />
              加载中...
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none
              prose-h2:text-lg prose-h2:font-black prose-h2:mt-6 prose-h2:mb-3
              prose-h3:text-sm prose-h3:font-black prose-h3:text-[#00B894]
              prose-li:text-sm prose-li:my-0.5
              prose-code:text-[10px] prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
