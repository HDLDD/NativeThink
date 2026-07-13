import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Volume2,
  Heart,
  ChevronDown,
  ExternalLink,
  Loader2,
  BookOpen,
  Hash,
  type LucideIcon,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTTS } from '@/lib/use-tts';
import { useFavorites, type IFavoriteItem } from '@/lib/use-favorites';
import { queryWords, preloadLevels, getEssentialLevels, isAllReady, getWordCounts, WORD_COUNTS } from '@/data/wordbank';
import type { IWordEntry } from '@/data/wordbank';

// ============================================================
// Level colors & labels (inline — same palette as CollocationsTab)
// ============================================================
const LEVEL_COLORS: Record<string, { hex: string; bg: string; text: string }> = {
  zhongkao:     { hex: '#EF4444', bg: 'bg-red-50 dark:bg-red-500/15', text: 'text-red-600' },
  gaokao:       { hex: '#F97316', bg: 'bg-orange-50 dark:bg-orange-500/15', text: 'text-orange-600' },
  cet4:         { hex: '#0EA5E9', bg: 'bg-sky-50 dark:bg-sky-500/15', text: 'text-sky-600' },
  cet6:         { hex: '#6C5CE7', bg: 'bg-violet-50 dark:bg-violet-500/15', text: 'text-violet-600' },
  ielts:        { hex: '#F59E0B', bg: 'bg-amber-50 dark:bg-amber-500/15', text: 'text-amber-600' },
  toefl:        { hex: '#EC4899', bg: 'bg-rose-50 dark:bg-rose-500/15', text: 'text-rose-600' },
  postgraduate: { hex: '#8B5CF6', bg: 'bg-purple-50 dark:bg-purple-500/15', text: 'text-purple-600' },
  professional: { hex: '#14B8A6', bg: 'bg-teal-50 dark:bg-teal-500/15', text: 'text-teal-600' },
  advanced:     { hex: '#64748B', bg: 'bg-slate-50 dark:bg-slate-500/15', text: 'text-slate-600' },
};

const LEVEL_LABELS: Record<string, string> = {
  zhongkao: '中考', gaokao: '高考', cet4: '四级', cet6: '六级',
  ielts: '雅思', toefl: '托福', postgraduate: '考研', professional: '专业', advanced: '高阶',
};

const MAX_RESULTS = 100;

// ============================================================
// Component
// ============================================================
export default function GlobalWordSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [dataReady, setDataReady] = useState(() => isAllReady());
  const inputRef = useRef<HTMLInputElement>(null);
  const tts = useTTS();
  const { favorites, addFavorite, removeFavorite, isFavorited } = useFavorites();

  // Expanded word for detail view
  const [expandedWord, setExpandedWord] = useState<string | null>(null);

  // Progressive preload: load essential levels first, then load remaining in background
  useEffect(() => {
    if (open && !dataReady) {
      setLoading(true);
      const essential = getEssentialLevels();
      // Phase 1: Load essential levels for instant search capability
      preloadLevels(essential).then(() => {
        setDataReady(true);
        setLoading(false);
        // Phase 2: Load remaining levels in background (non-blocking)
        const allLevels = ['zhongkao', 'gaokao', 'cet4', 'cet6', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'];
        const remaining = allLevels.filter(l => !essential.includes(l));
        remaining.forEach(level => preloadLevels([level]));
      });
    }
  }, [open, dataReady]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      // Reset state on close
      setQuery('');
      setExpandedWord(null);
    }
  }, [open]);

  // Search query → results
  const results = useMemo(() => {
    if (!query.trim() || !dataReady) return [];
    return queryWords({ search: query.trim(), limit: MAX_RESULTS, sortBy: 'frequency' });
  }, [query, dataReady]);

  const totalWords = useMemo(() => {
    if (!dataReady) return 0;
    const counts = getWordCounts();
    return Object.values(counts).reduce((a, b) => a + b, 0);
  }, [dataReady]);

  // Favorite toggle
  const handleToggleFav = (word: IWordEntry) => {
    const key = word.word;
    if (isFavorited(key, 'vocabulary')) {
      const fav = favorites.find((f) => f.content === key && f.type === 'vocabulary');
      if (fav) removeFavorite(fav.id);
    } else {
      addFavorite({
        type: 'vocabulary',
        content: key,
        meaning: word.meaning,
        category: word.level,
      });
    }
  };

  const expandedEntry = expandedWord ? results.find((w) => w.word.toLowerCase() === expandedWord.toLowerCase()) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="全局单词搜索"
          className="bg-muted hover:bg-muted/80 rounded-2xl text-muted-foreground hover:text-[#00B894] transition-colors"
        >
          <Search className="size-4.5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[85vh] rounded-[32px] p-0 overflow-hidden flex flex-col">
        {/* ── Gradient Header ── */}
        <div className="p-6 border-b border-border bg-gradient-to-r from-sky-50 to-indigo-50 dark:from-sky-500/10 dark:to-indigo-500/10 shrink-0">
          <DialogHeader>
            <DialogTitle className="text-xl font-black italic text-foreground flex items-center gap-2">
              <Search className="size-5 text-sky-500" />
              全局单词搜索
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground font-medium mt-3">
            {dataReady
              ? `搜索 ${totalWords.toLocaleString()} 个单词 — 覆盖中考到高阶 9 个等级`
              : '正在加载词库数据…'}
          </p>

          {/* Search input */}
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setExpandedWord(null); }}
              placeholder="输入单词或中文释义…（如 apple、苹果、abandon）"
              disabled={loading}
              className="pl-10 pr-10 py-2.5 rounded-xl bg-white dark:bg-card border-border text-sm font-bold focus-visible:ring-2 focus-visible:ring-sky-200 placeholder:text-muted-foreground/50"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* ── Body: Results list ── */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="size-8 animate-spin" />
              <p className="text-sm font-medium">正在加载词库…</p>
            </div>
          ) : !query.trim() ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <div className="size-16 rounded-2xl bg-muted flex items-center justify-center">
                <Search className="size-7 opacity-30" />
              </div>
              <p className="text-sm font-medium">输入单词或中文释义开始搜索</p>
              <p className="text-xs text-muted-foreground/60">
                支持英文单词、中文释义、音标模糊匹配
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <div className="size-16 rounded-2xl bg-muted flex items-center justify-center">
                <BookOpen className="size-7 opacity-30" />
              </div>
              <p className="text-sm font-medium">未找到匹配 "{query}" 的单词</p>
              <p className="text-xs text-muted-foreground/60">试试其他关键词或缩短搜索词</p>
            </div>
          ) : (
            <>
              {/* Result count */}
              <div className="flex items-center justify-between mb-3 px-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  找到 {results.length} 个结果{results.length >= MAX_RESULTS ? `（仅显示前 ${MAX_RESULTS} 个）` : ''}
                </p>
              </div>

              {/* Result cards */}
              <div className="space-y-2">
                {results.map((word) => {
                  const lc = LEVEL_COLORS[word.level] || LEVEL_COLORS.advanced;
                  const isFav = isFavorited(word.word, 'vocabulary');
                  const isExpanded = expandedWord?.toLowerCase() === word.word.toLowerCase();

                  return (
                    <div
                      key={word.word}
                      className={cn(
                        'rounded-2xl border-2 transition-all duration-200',
                        isExpanded
                          ? 'border-sky-300 bg-sky-50/30 dark:bg-sky-500/8'
                          : 'border-transparent bg-muted/30 hover:border-border hover:bg-muted',
                      )}
                    >
                      {/* Result row */}
                      <div className="flex items-center gap-3 p-3">
                        {/* Speak button */}
                        <button
                          onClick={() => tts.speak(word.word, { rate: 0.85 })}
                          className="shrink-0 text-muted-foreground/40 hover:text-[#00B894] transition-colors"
                          title={`朗读 "${word.word}"`}
                        >
                          <Volume2 className="size-4" />
                        </button>

                        {/* Word info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => setExpandedWord(isExpanded ? null : word.word)}
                              className="text-left hover:text-sky-500 transition-colors"
                            >
                              <span className="text-sm font-black text-foreground">{word.word}</span>
                            </button>
                            <span className="text-xs text-muted-foreground font-medium">{word.phonetic}</span>
                            <Badge
                              className="text-[9px] font-black rounded-full px-2 py-0.5 border-0 text-white shrink-0"
                              style={{ backgroundColor: lc.hex }}
                            >
                              {LEVEL_LABELS[word.level]}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground font-medium">{word.partOfSpeech}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 font-medium">
                            {word.meaning}
                          </p>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          {/* Favorite */}
                          <button
                            onClick={() => handleToggleFav(word)}
                            title={isFav ? '取消收藏' : '收藏单词'}
                            className={cn(
                              'p-1 rounded-lg transition-colors',
                              isFav ? 'text-rose-500' : 'text-muted-foreground/30 hover:text-rose-500',
                            )}
                          >
                            <Heart className={cn('size-4', isFav && 'fill-current')} />
                          </button>

                          {/* Detail expand */}
                          <button
                            onClick={() => setExpandedWord(isExpanded ? null : word.word)}
                            title={isExpanded ? '收起详情' : '展开详情'}
                            className={cn(
                              'p-1 rounded-lg transition-colors',
                              isExpanded ? 'text-sky-500' : 'text-muted-foreground/30 hover:text-sky-500',
                            )}
                          >
                            <ChevronDown className={cn('size-4 transition-transform', isExpanded && 'rotate-180')} />
                          </button>
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="px-3 pb-4 pt-0 space-y-3 border-t border-border/50 mx-3">
                          {/* Examples */}
                          {word.examples.length > 0 && (
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">
                                例句
                              </p>
                              <div className="space-y-1.5">
                                {word.examples.slice(0, 3).map((ex, i) => (
                                  <div key={i} className="flex items-start justify-between gap-2 p-2 rounded-xl bg-muted/50">
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium text-foreground italic">{ex.en}</p>
                                      <p className="text-[11px] text-muted-foreground mt-0.5">{ex.zh}</p>
                                    </div>
                                    <button
                                      onClick={() => tts.speak(ex.en, { rate: 0.9 })}
                                      className="shrink-0 text-muted-foreground/50 hover:text-[#00B894] transition-colors mt-0.5"
                                    >
                                      <Volume2 className="size-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Collocations */}
                          {word.collocations.length > 0 && (
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">
                                搭配短语
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {word.collocations.map((c) => (
                                  <span
                                    key={c}
                                    className="text-[10px] font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-lg"
                                  >
                                    {c}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Synonyms / Antonyms */}
                          {(word.synonyms.length > 0 || word.antonyms.length > 0) && (
                            <div className="grid grid-cols-2 gap-3">
                              {word.synonyms.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                                    同义词
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {word.synonyms.slice(0, 5).map((s) => (
                                      <span key={s} className="text-[10px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded-md">
                                        {s}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {word.antonyms.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                                    反义词
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {word.antonyms.slice(0, 5).map((a) => (
                                      <span key={a} className="text-[10px] font-medium text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-1.5 py-0.5 rounded-md">
                                        {a}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Deep explanation */}
                          {word.deepExplanation && (
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                                深度解释
                              </p>
                              <p className="text-xs text-muted-foreground leading-relaxed">{word.deepExplanation}</p>
                            </div>
                          )}

                          {/* Navigate to vocabulary page */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full rounded-xl text-[10px] font-black uppercase tracking-wider border-sky-200 text-sky-500 hover:bg-sky-50 gap-1.5"
                            onClick={() => {
                              setOpen(false);
                              navigate(`/vocabulary?word=${encodeURIComponent(word.word)}&level=${encodeURIComponent(word.level)}`);
                            }}
                          >
                            <ExternalLink className="size-3" />
                            在词汇深度中查看
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {dataReady && query.trim() && results.length > 0 && (
          <div className="p-3 border-t border-border bg-muted/20 shrink-0 text-center">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              点击单词展开详情 · 点击 <Volume2 className="size-3 inline-block mx-0.5 text-[#00B894]" /> 朗读 · 点击 <Heart className="size-3 inline-block mx-0.5 text-rose-500 fill-current" /> 收藏
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
