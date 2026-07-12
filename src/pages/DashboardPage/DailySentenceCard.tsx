import { memo } from 'react';
import {
  Quote,
  Clock,
  RefreshCw,
  Wand2,
  Loader2,
  Volume2,
  Languages,
  Heart,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, cleanText } from '@/lib/utils';
import type { IChunk } from '@/data/chunks';

interface DailySentenceCardProps {
  dailyChunk: IChunk;
  exampleZh: string;
  chunkLoading: boolean;
  favorited: boolean;
  isExampleFavorited: boolean;
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
    <Card className="col-span-12 lg:col-span-5 rounded-[40px] border-border shadow-sm">
      <CardContent className="p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="size-10 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 text-[#00B894] flex items-center justify-center">
            <Quote className="size-5" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Daily Expression
            </p>
            <h3 className="text-lg font-black italic text-foreground">每日一句</h3>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onShowHistory}
              className="rounded-xl size-8 text-muted-foreground hover:text-[#00B894]"
              title="历史记录"
            >
              <Clock className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onShuffle}
              className="rounded-xl size-8 text-muted-foreground hover:text-[#00B894]"
              title="换一句"
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onAiGenerate}
              disabled={chunkLoading}
              className="rounded-xl size-8 text-muted-foreground hover:text-violet-500"
              title="AI 生成"
            >
              {chunkLoading ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            </Button>
          </div>
        </div>

        <div className="bg-muted/30 rounded-[28px] p-6 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <p className="text-2xl font-black text-foreground leading-relaxed">
              {dailyChunk.content}
            </p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onTTS(dailyChunk.content)}
              className="rounded-xl size-8 text-muted-foreground hover:text-[#00B894] shrink-0"
            >
              <Volume2 className="size-4.5" />
            </Button>
          </div>
          <p className="text-sm font-medium text-muted-foreground">{dailyChunk.meaning}</p>
        </div>

        <div className="space-y-2 mb-5">
          <div className="flex items-center gap-2">
            <p className="text-sm text-foreground/80 italic">
              「{cleanText(dailyChunk.example)}」
            </p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onTTS(dailyChunk.example, { rate: 0.9 })}
              aria-label="朗读例句"
              className="rounded-xl size-7 text-muted-foreground hover:text-[#00B894] shrink-0"
            >
              <Volume2 className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onTranslateExample}
              aria-label="翻译例句"
              className="rounded-xl size-7 text-muted-foreground hover:text-violet-500 shrink-0"
            >
              <Languages className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleExampleFavorite}
              aria-label="收藏例句"
              className={cn(
                'rounded-xl size-7 shrink-0',
                isExampleFavorited ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500',
              )}
            >
              <Heart className={cn('size-3.5', isExampleFavorited && 'fill-current')} />
            </Button>
          </div>
          {exampleZh && (
            <p className="text-xs text-muted-foreground font-medium pl-1 border-l-2 border-violet-300">
              {exampleZh}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-[#00B894] text-[10px] font-black uppercase tracking-wider">
              {categoryLabel}
            </span>
            <span className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-muted-foreground text-[10px] font-black uppercase tracking-wider">
              {difficultyLabel}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleFavorite}
            className={cn(
              'rounded-2xl gap-1.5 text-[10px] font-black uppercase tracking-wider',
              favorited ? 'text-rose-500' : 'text-muted-foreground',
            )}
          >
            <Heart className={cn('size-4', favorited && 'fill-current')} />
            {favorited ? '已收藏' : '收藏'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export const DailySentenceCard = memo(DailySentenceCardInner);
