import { useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Volume2, Sparkles, CheckCircle2, XCircle, RotateCw, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, cleanText } from '@/lib/utils';
import type { IFavoriteItem } from '@/lib/use-favorites';
import { useTTS } from '@/lib/use-tts';

const TYPE_LABELS: Record<string, string> = {
  chunk: '语块',
  expression: '表达',
  vocabulary: '词汇',
  think: '思维训练',
  shadowing: '影子跟读',
};

const TYPE_COLORS: Record<string, string> = {
  chunk: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400',
  expression: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-400',
  vocabulary: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400',
  think: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-400',
  shadowing: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-400',
};

interface Props {
  favorites: IFavoriteItem[];
  onExit: () => void;
}

export default function FavoriteReviewMode({ favorites, onExit }: Props) {
  const tts = useTTS();
  const [filterType, setFilterType] = useState<string>('all');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setFlipped] = useState(false);
  const [dir, setDir] = useState(0);
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set());
  const [unknownIds, setUnknownIds] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState(false);

  const filtered = useMemo(() => {
    if (filterType === 'all') return favorites;
    return favorites.filter((f) => f.type === filterType);
  }, [favorites, filterType]);

  // Reset state when filter changes
  const handleFilterChange = (type: string) => {
    setFilterType(type);
    setCurrentIdx(0);
    setFlipped(false);
    setDir(0);
    setKnownIds(new Set());
    setUnknownIds(new Set());
    setCompleted(false);
  };

  const queue = filtered;
  const cw = queue[currentIdx];

  const reviewed = knownIds.size + unknownIds.size;
  const total = queue.length;

  const flip = () => { setFlipped((v) => !v); };

  const mark = (known: boolean) => {
    if (!cw) return;
    if (known) {
      setKnownIds((p) => new Set(p).add(cw.id));
    } else {
      setUnknownIds((p) => new Set(p).add(cw.id));
    }
    // Advance to next card
    if (currentIdx + 1 >= total) {
      setCompleted(true);
    } else {
      setDir(1);
      setFlipped(false);
      setTimeout(() => setCurrentIdx((p) => p + 1), 150);
    }
  };

  const restart = () => {
    setCurrentIdx(0);
    setFlipped(false);
    setDir(0);
    setKnownIds(new Set());
    setUnknownIds(new Set());
    setCompleted(false);
  };

  // Type counts for filter tabs
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: favorites.length };
    favorites.forEach((f) => {
      counts[f.type] = (counts[f.type] || 0) + 1;
    });
    return counts;
  }, [favorites]);

  // ── Completion view ──
  if (completed && total > 0) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="size-10 rounded-xl bg-[#00B894]/10 flex items-center justify-center text-[#00B894]">
            <CheckCircle2 className="size-5" />
          </div>
          <div>
            <h2 className="text-sm font-black italic text-foreground">回顾完成！</h2>
            <p className="text-[9px] font-bold text-muted-foreground">收藏回顾 · 共 {total} 条</p>
          </div>
        </div>

        {/* Results */}
        <Card className="rounded-[32px] border-2 border-emerald-200/50 shadow-sm overflow-hidden">
          <CardContent className="p-8 text-center space-y-6">
            <div className="size-20 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-500/20 dark:to-teal-500/20 flex items-center justify-center mx-auto">
              <Sparkles className="size-10 text-[#00B894]" />
            </div>
            <div>
              <h3 className="text-2xl font-black italic text-foreground">太棒了！</h3>
              <p className="text-sm text-muted-foreground font-medium mt-1">你已经完成了所有收藏内容的回顾</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20">
                <p className="text-3xl font-black text-[#00B894]">{knownIds.size}</p>
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                  <CheckCircle2 className="size-3" />认识
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20">
                <p className="text-3xl font-black text-rose-500">{unknownIds.size}</p>
                <p className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center justify-center gap-1">
                  <XCircle className="size-3" />不认识
                </p>
              </div>
            </div>

            {/* Accuracy */}
            <div className="flex items-center justify-center gap-2">
              <div className="flex-1 max-w-[200px] h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-[#00B894] rounded-full transition-all duration-700"
                  style={{ width: `${total > 0 ? Math.round((knownIds.size / total) * 100) : 0}%` }}
                />
              </div>
              <span className="text-sm font-black text-[#00B894] tabular-nums">
                {total > 0 ? Math.round((knownIds.size / total) * 100) : 0}%
              </span>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={restart}
                className="flex-1 rounded-2xl bg-[#00B894] hover:bg-[#00a882] text-white font-black text-sm shadow-lg shadow-emerald-200/50"
              >
                <RotateCw className="size-4 mr-2" />再来一次
              </Button>
              <Button
                variant="outline"
                onClick={onExit}
                className="flex-1 rounded-2xl border-border hover:border-[#00B894] font-black text-sm"
              >
                <ArrowLeft className="size-4 mr-2" />返回浏览
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Empty state ──
  if (total === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-10 rounded-xl bg-[#00B894]/10 flex items-center justify-center text-[#00B894]">
              <Heart className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-black italic text-foreground">收藏回顾</h2>
              <p className="text-[9px] font-bold text-muted-foreground">暂无收藏内容</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onExit} className="rounded-xl text-xs font-bold">
            <ArrowLeft className="size-3.5 mr-1" />返回
          </Button>
        </div>
        <div className="text-center py-16 space-y-4">
          <div className="size-16 rounded-full bg-muted flex items-center justify-center mx-auto">
            <Heart className="size-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm font-medium">
            还没有收藏内容，去学习页面收藏你喜欢的表达吧！
          </p>
        </div>
      </div>
    );
  }

  // ── Review view ──
  return (
    <div className="space-y-5">
      {/* Header + type filter */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="size-10 rounded-xl bg-[#00B894]/10 flex items-center justify-center text-[#00B894]">
            <Heart className="size-5" />
          </div>
          <div>
            <h2 className="text-sm font-black italic text-foreground">收藏回顾</h2>
            <p className="text-[9px] font-bold text-muted-foreground">抽认卡模式 · 翻面查看释义</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onExit} className="rounded-xl text-xs font-bold">
          <ArrowLeft className="size-3.5 mr-1" />返回浏览
        </Button>
      </div>

      {/* Type filter tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {(['all', 'vocabulary', 'expression', 'chunk', 'think', 'shadowing'] as const).map((type) => {
          const count = typeCounts[type];
          if (!count) return null;
          return (
            <button
              key={type}
              onClick={() => handleFilterChange(type)}
              className={cn(
                'px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all border-2',
                filterType === type
                  ? 'border-[#00B894] bg-[#00B894]/10 text-[#00B894]'
                  : 'border-border bg-muted text-muted-foreground hover:border-muted-foreground/30',
              )}
            >
              {type === 'all' ? `全部 (${count})` : `${TYPE_LABELS[type] || type} (${count})`}
            </button>
          );
        })}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        <div className="p-2.5 rounded-xl bg-muted/50 border border-border text-center">
          <p className="text-lg font-black text-foreground">{total}</p>
          <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">总数</p>
        </div>
        <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-100 dark:border-sky-500/20 text-center">
          <p className="text-lg font-black text-sky-500">{reviewed}</p>
          <p className="text-[8px] font-black uppercase tracking-wider text-sky-600 dark:text-sky-400">已回顾</p>
        </div>
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-center">
          <p className="text-lg font-black text-[#00B894]">{knownIds.size}</p>
          <p className="text-[8px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">认识</p>
        </div>
        <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 text-center">
          <p className="text-lg font-black text-rose-500">{unknownIds.size}</p>
          <p className="text-[8px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">不认识</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#00B894] to-emerald-400 rounded-full transition-all duration-300"
            style={{ width: `${total > 0 ? ((reviewed) / total) * 100 : 0}%` }}
          />
        </div>
        <span className="text-xs font-black text-muted-foreground tabular-nums">{currentIdx + 1}/{total}</span>
      </div>

      {/* Flashcard */}
      {cw && (
        <div className="flex justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={cw.id + (isFlipped ? '-back' : '-front')}
              initial={{ opacity: 0, x: dir * 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -dir * 100 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              className="w-full max-w-sm cursor-pointer"
              onClick={() => flip()}
            >
              <Card
                className={cn(
                  'rounded-[32px] border-2 shadow-xl transition-all min-h-[280px] flex flex-col justify-center',
                  isFlipped
                    ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10'
                    : 'border-border bg-card',
                )}
              >
                <CardContent className="p-8 text-center">
                  {!isFlipped ? (
                    <>
                      {/* Type badge */}
                      <Badge
                        className={cn(
                          'rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider border mb-6',
                          TYPE_COLORS[cw.type] || 'bg-muted text-muted-foreground',
                        )}
                      >
                        {currentIdx + 1} / {total}
                        <span className="ml-1.5 opacity-70">
                          · {TYPE_LABELS[cw.type] || cw.type}
                        </span>
                      </Badge>
                      <div className="flex items-center justify-center gap-3 mb-2">
                        <h2 className="text-3xl font-black italic text-foreground tracking-tight leading-tight">
                          {cleanText(cw.content)}
                        </h2>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            tts.speak(cw.content, { rate: 0.85 });
                          }}
                          className="rounded-2xl bg-muted text-muted-foreground hover:text-[#00B894] shrink-0"
                        >
                          <Volume2 className="size-5" />
                        </Button>
                      </div>
                      {cw.category && (
                        <p className="text-xs font-bold text-muted-foreground mt-2">{cw.category}</p>
                      )}
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-4">
                        <Sparkles className="size-3.5 inline mr-1 text-[#00B894]" />
                        点击翻转查看释义
                      </p>
                    </>
                  ) : (
                    <>
                      <Badge className="rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-500/20 text-[#00B894] mb-3">
                        释义 · {TYPE_LABELS[cw.type] || cw.type}
                      </Badge>
                      <p className="text-xl font-black text-foreground mb-2">{cw.meaning}</p>
                      {cw.example && (
                        <div className="p-3 rounded-2xl bg-white/60 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/20 mb-3">
                          <div className="flex items-start gap-2">
                            <p className="text-sm text-foreground/80 italic flex-1">「{cleanText(cw.example)}」</p>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                tts.speak(cleanText(cw.example), { rate: 0.85 });
                              }}
                              className="rounded-lg size-7 text-muted-foreground hover:text-[#00B894] shrink-0"
                            >
                              <Volume2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Rating buttons — only show when flipped */}
      {isFlipped && (
        <div className="flex justify-center gap-3">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              mark(false);
            }}
            variant="outline"
            size="lg"
            className="rounded-2xl border-rose-200 dark:border-rose-500/30 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 font-black text-sm px-6"
          >
            <XCircle className="size-4.5 mr-2" />
            不认识
          </Button>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              mark(true);
            }}
            size="lg"
            className="rounded-2xl bg-[#00B894] hover:bg-[#00a882] text-white font-black text-sm px-6 shadow-lg shadow-emerald-200/50"
          >
            <CheckCircle2 className="size-4.5 mr-2" />
            认识
          </Button>
        </div>
      )}
    </div>
  );
}
