import { useState, useMemo } from 'react';
import {
  Heart,
  Volume2,
  Trash2,
  Filter,
  Sparkles,
  BookOpen,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFavorites } from '@/lib/use-favorites';
import { useTTS } from '@/lib/use-tts';
import { cn, cleanText } from '@/lib/utils';
import { toast } from 'sonner';
import FavoriteReviewMode from '@/pages/ProgressPage/components/FavoriteReviewMode';

// ============================================================
// Type labels & colors
// ============================================================
const TYPE_LABELS: Record<string, string> = {
  chunk: '语块',
  expression: '表达',
  vocabulary: '词汇',
  think: '思维训练',
  shadowing: '影子跟读',
  article: '文章',
  word: '单词',
};

const TYPE_COLORS: Record<string, { bg: string; badge: string; icon: LucideIcon }> = {
  chunk:      { bg: 'bg-amber-50 dark:bg-amber-500/10',   badge: 'bg-amber-100 dark:bg-amber-500/20 text-amber-600' },
  expression: { bg: 'bg-sky-50 dark:bg-sky-500/10',       badge: 'bg-sky-100 dark:bg-sky-500/20 text-sky-600' },
  vocabulary: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', badge: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600' },
  think:      { bg: 'bg-violet-50 dark:bg-violet-500/10',  badge: 'bg-violet-100 dark:bg-violet-500/20 text-violet-600' },
  shadowing:  { bg: 'bg-rose-50 dark:bg-rose-500/10',      badge: 'bg-rose-100 dark:bg-rose-500/20 text-rose-600' },
  article:    { bg: 'bg-teal-50 dark:bg-teal-500/10',      badge: 'bg-teal-100 dark:bg-teal-500/20 text-teal-600' },
  word:       { bg: 'bg-slate-50 dark:bg-slate-500/10',    badge: 'bg-slate-100 dark:bg-slate-500/20 text-slate-600' },
};

const FILTER_TYPES = ['all', 'vocabulary', 'chunk', 'expression', 'think', 'shadowing', 'article'] as const;

// ============================================================
// Component
// ============================================================
export default function FavoritesPage() {
  const { favorites, removeFavorite, loaded } = useFavorites();
  const tts = useTTS();
  const [filterType, setFilterType] = useState<string>('all');
  const [reviewMode, setReviewMode] = useState(false);

  const filteredFavorites = useMemo(() => {
    if (filterType === 'all') return favorites;
    return favorites.filter((f) => f.type === filterType);
  }, [favorites, filterType]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: favorites.length };
    favorites.forEach((f) => {
      counts[f.type] = (counts[f.type] || 0) + 1;
    });
    return counts;
  }, [favorites]);

  const handleDelete = (id: string, content: string) => {
    removeFavorite(id);
    toast.success(`已删除收藏: ${content}`);
  };

  // ── Review mode ──
  if (reviewMode) {
    return (
      <div className="max-w-4xl mx-auto pt-4">
        <FavoriteReviewMode
          favorites={filteredFavorites}
          onExit={() => setReviewMode(false)}
        />
      </div>
    );
  }

  // ── Loading ──
  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="text-sm text-muted-foreground font-medium">加载中…</span>
      </div>
    );
  }

  // ── Empty state ──
  if (favorites.length === 0) {
    return (
      <div className="max-w-2xl mx-auto pt-8">
        <div className="text-center py-20 space-y-6">
          <div className="size-20 rounded-full bg-muted flex items-center justify-center mx-auto">
            <Heart className="size-10 text-muted-foreground/40" />
          </div>
          <div>
            <h2 className="text-2xl font-black italic text-foreground mb-2">收藏本</h2>
            <p className="text-sm text-muted-foreground font-medium max-w-md mx-auto">
              还没有收藏内容。在词汇学习、搭配学习、文章阅读等页面，点击 <Heart className="size-3.5 inline text-rose-500 fill-current mx-0.5" /> 图标即可收藏你喜欢的表达！
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 text-[10px] font-bold text-muted-foreground/60">
            <span>💡 单词可收藏</span>
            <span>📝 例句可收藏</span>
            <span>🔗 搭配可收藏</span>
            <span>🎤 演讲可收藏</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Browse view ──
  return (
    <div className="max-w-6xl mx-auto pt-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-2xl bg-gradient-to-br from-rose-400 to-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-200/50 dark:shadow-rose-900/30">
            <Heart className="size-6 fill-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black italic text-foreground">收藏本</h1>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              共 {favorites.length} 条收藏
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Type filter */}
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[120px] rounded-2xl border-border bg-muted text-xs font-bold uppercase tracking-wider">
                <SelectValue placeholder="分类" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="all" className="text-xs font-bold">
                  全部 ({typeCounts.all})
                </SelectItem>
                <SelectItem value="vocabulary" className="text-xs font-bold">
                  词汇 ({typeCounts.vocabulary || 0})
                </SelectItem>
                <SelectItem value="chunk" className="text-xs font-bold">
                  语块 ({typeCounts.chunk || 0})
                </SelectItem>
                <SelectItem value="expression" className="text-xs font-bold">
                  表达 ({typeCounts.expression || 0})
                </SelectItem>
                <SelectItem value="think" className="text-xs font-bold">
                  思维训练 ({typeCounts.think || 0})
                </SelectItem>
                <SelectItem value="shadowing" className="text-xs font-bold">
                  影子跟读 ({typeCounts.shadowing || 0})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Review toggle */}
          <Button
            onClick={() => setReviewMode(true)}
            disabled={filteredFavorites.length === 0}
            className="rounded-xl text-[10px] font-black uppercase tracking-wider bg-[#00B894] hover:bg-[#00a882] text-white shadow-lg shadow-emerald-200/50 gap-1.5"
          >
            <BookOpen className="size-3.5" />
            开始回顾
          </Button>
        </div>
      </div>

      {/* Empty filtered state */}
      {filteredFavorites.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm font-medium">该分类暂无收藏内容</p>
        </div>
      ) : (
        <>
          {/* Type count chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTER_TYPES.map((type) => {
              const count = typeCounts[type];
              if (!count) return null;
              const isActive = filterType === type;
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all border-2',
                    isActive
                      ? 'border-rose-300 bg-rose-50 dark:bg-rose-500/10 text-rose-500'
                      : 'border-border bg-muted text-muted-foreground hover:border-muted-foreground/30',
                  )}
                >
                  {type === 'all' ? `全部 (${count})` : `${TYPE_LABELS[type] || type} (${count})`}
                </button>
              );
            })}
          </div>

          {/* Card grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFavorites.map((item) => {
              const tc = TYPE_COLORS[item.type] || TYPE_COLORS.vocabulary;
              return (
                <Card
                  key={item.id}
                  className="rounded-[28px] border-border hover:border-rose-200/50 hover:shadow-md transition-all duration-300 group"
                >
                  <CardContent className="p-5">
                    {/* Top row: type badge + delete */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <span className={cn('text-[10px] font-black uppercase tracking-wider rounded-full px-3 py-1', tc.badge)}>
                        {TYPE_LABELS[item.type] || item.type}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(item.id, item.content)}
                        className="rounded-xl size-8 text-muted-foreground hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/15"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    {/* Content + TTS */}
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-lg font-black text-foreground group-hover:text-rose-500 transition-colors">
                        {item.content}
                      </h4>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => tts.speak(item.content)}
                        className="rounded-xl size-7 text-muted-foreground hover:text-[#00B894] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Volume2 className="size-3.5" />
                      </Button>
                    </div>

                    {/* Meaning */}
                    <p className="text-sm text-muted-foreground font-medium mb-3">{item.meaning}</p>

                    {/* Example */}
                    {item.example && (
                      <div className="p-3 rounded-xl bg-muted/50 flex items-start gap-2 group/example mb-3">
                        <p className="text-xs text-foreground/80 italic flex-1">「{cleanText(item.example)}」</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => tts.speak(cleanText(item.example))}
                          className="rounded-lg size-6 text-muted-foreground hover:text-[#00B894] shrink-0 opacity-0 group-hover/example:opacity-100 transition-opacity"
                        >
                          <Volume2 className="size-3" />
                        </Button>
                      </div>
                    )}

                    {/* Article — navigate to article page */}
                    {item.type === 'article' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full rounded-xl text-[10px] font-black uppercase tracking-wider border-teal-200 text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-500/10 gap-1.5 mt-1"
                        onClick={() => {
                          // Navigate to article page — AI tab is where saved articles live
                          window.location.href = '/articles';
                        }}
                      >
                        <ExternalLink className="size-3" />
                        前往文章阅读
                      </Button>
                    )}
                    {/* Shadowing jump button */}
                    {item.type === 'shadowing' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full rounded-xl text-[10px] font-black uppercase tracking-wider border-rose-200 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 gap-1.5 mt-1"
                        onClick={() => {
                          window.location.href = `/shadowing?material=${encodeURIComponent(item.content)}`;
                        }}
                      >
                        <ExternalLink className="size-3" />
                        跳转到影子跟读
                      </Button>
                    )}

                    {/* Bottom row: category + date */}
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {item.category}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
