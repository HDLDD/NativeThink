import { memo } from 'react';
import {
  Clock,
  RefreshCw,
  Wand2,
  Loader2,
  Volume2,
  Languages,
  Heart,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, cleanText } from '@/lib/utils';
import { StreamingText } from '@/components/StreamingText';
import type { IChunk } from '@/data/chunks';

interface DailySentenceCardProps {
  dailyChunk: IChunk;
  exampleZh: string;
  chunkLoading: boolean;
  favorited: boolean;
  isExampleFavorited: boolean;
  /** 近几天的每日一句（不含今天这条），填满左栏并给回访一个入口 */
  recent: { date: string; content: string; meaning: string }[];
  onShowHistory: () => void;
  onShuffle: () => void;
  onAiGenerate: () => void;
  onTranslateExample: () => void;
  onTTS: (text: string, options?: { rate?: number }) => void;
  onToggleFavorite: () => void;
  onToggleExampleFavorite: () => void;
}

function DailySentenceCardInner({
  dailyChunk,
  exampleZh,
  chunkLoading,
  favorited,
  isExampleFavorited,
  recent,
  onShowHistory,
  onShuffle,
  onAiGenerate,
  onTranslateExample,
  onTTS,
  onToggleFavorite,
  onToggleExampleFavorite,
}: DailySentenceCardProps) {
  const categoryLabel =
    dailyChunk.category === 'daily'
      ? '日常'
      : dailyChunk.category === 'workplace'
        ? '职场'
        : dailyChunk.category === 'social'
          ? '社交'
          : '情绪';

  const difficultyLabel =
    dailyChunk.difficulty === 'beginner'
      ? '初级'
      : dailyChunk.difficulty === 'intermediate'
        ? '中级'
        : '高级';

  return (
    <Card className="col-span-12 lg:col-span-5 rounded-[26px] border-border">
      <CardContent className="flex h-full flex-col p-6 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Daily expression
            </p>
            <h3 className="mt-1 text-[15px] font-bold text-foreground">每日一句</h3>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={onShowHistory}
              className="size-8 rounded-full text-muted-foreground hover:text-foreground"
              title="历史记录"
            >
              <Clock className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onShuffle}
              className="size-8 rounded-full text-muted-foreground hover:text-foreground"
              title="换一句"
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onAiGenerate}
              disabled={chunkLoading}
              className="size-8 rounded-full text-muted-foreground hover:text-foreground"
              title="AI 生成"
            >
              {chunkLoading ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            </Button>
          </div>
        </div>

        <div className="mt-8 flex items-start gap-4">
          <span className="mt-1.5 h-12 w-[3px] shrink-0 rounded-full bg-[var(--warm)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <p className="text-[26px] font-extrabold leading-[1.25] tracking-tight text-foreground">
                {dailyChunk.content}
              </p>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onTTS(dailyChunk.content)}
                  aria-label="朗读短语"
                  className="size-7 rounded-full text-muted-foreground hover:text-foreground"
                >
                  <Volume2 className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="复制本句"
                  aria-label="复制本句"
                  onClick={() => {
                    const text = `${dailyChunk.content}（${dailyChunk.meaning}）\n${cleanText(dailyChunk.example)}${exampleZh ? `\n${exampleZh}` : ''}`;
                    try {
                      navigator.clipboard?.writeText(text)
                        .then(() => toast.success('已复制到剪贴板'))
                        .catch(() => toast.error('复制失败，请手动选择文本'));
                    } catch {
                      toast.error('复制失败，请手动选择文本');
                    }
                  }}
                  className="size-7 rounded-full text-muted-foreground hover:text-foreground"
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
            <p className="mt-2 text-[13px] font-medium text-muted-foreground">{dailyChunk.meaning}</p>
          </div>
        </div>

        <div className="mt-7 space-y-2 border-t border-border pt-5">
          <div className="flex items-start gap-2">
            <p className="flex-1 text-[13px] leading-relaxed text-foreground/75">
              {cleanText(dailyChunk.example)}
            </p>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onTTS(dailyChunk.example, { rate: 0.9 })}
                aria-label="朗读例句"
                className="size-7 rounded-full text-muted-foreground hover:text-foreground"
              >
                <Volume2 className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onTranslateExample}
                aria-label="翻译例句"
                className="size-7 rounded-full text-muted-foreground hover:text-foreground"
              >
                <Languages className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleExampleFavorite}
                aria-label="收藏例句"
                className={cn(
                  'size-7 rounded-full shrink-0',
                  isExampleFavorited ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500',
                )}
              >
                <Heart className={cn('size-3.5', isExampleFavorited && 'fill-current')} />
              </Button>
            </div>
          </div>
          {exampleZh && (
            <StreamingText
              text={exampleZh}
              className="block border-l-2 border-[var(--warm)]/40 pl-3 text-[12px] font-medium text-muted-foreground"
            />
          )}
        </div>

        {recent.length > 0 && (
          <div className="mt-6 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Recent</p>
              <button
                type="button"
                onClick={onShowHistory}
                className="text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                全部 →
              </button>
            </div>
            <ul className="mt-3 space-y-2.5">
              {recent.map((item, i) => (
                <li key={`${item.date}-${i}`} className="flex items-baseline gap-3">
                  <span className="w-9 shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
                    {item.date.slice(5)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground/75">
                    {item.content}
                  </span>
                  <span className="hidden max-w-[38%] truncate text-[10px] text-muted-foreground sm:block">
                    {item.meaning}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-auto flex items-center justify-between pt-6">
          <div className="flex gap-1.5">
            <span className="rounded-full bg-[var(--warm)]/10 px-2.5 py-1 text-[10px] font-bold tracking-wider text-[var(--warm)]">
              {categoryLabel}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium tracking-wider text-muted-foreground">
              {difficultyLabel}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleFavorite}
            className={cn(
              'gap-1.5 rounded-full px-2.5 text-[11px] font-medium',
              favorited ? 'text-rose-500' : 'text-muted-foreground',
            )}
          >
            <Heart className={cn('size-3.5', favorited && 'fill-current')} />
            {favorited ? '已收藏' : '收藏'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export const DailySentenceCard = memo(DailySentenceCardInner);
