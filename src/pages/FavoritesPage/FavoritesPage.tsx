import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart,
  Volume2,
  Trash2,
  BookOpen,
  ExternalLink,
  Copy,
  Lightbulb,
  Keyboard,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useFavorites } from '@/lib/use-favorites';
import { useCorrectionNotes, type ICorrectionNote } from '@/lib/correction-notes';
import { useTTS } from '@/lib/use-tts';
import { cn, cleanText } from '@/lib/utils';
import { EmptyState } from '@/components/EmptyState';
import { LazyFramerProvider } from '@/lib/lazy-framer-motion';
import { useSpellingSentences, correctionToSpellingItem, normSentenceKey, SPELLING_SENTENCE_LIMIT } from '@/lib/use-spelling-sentences';
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
  spelling: '句子拼写',
  writing_prompt: '写作提示',
};

const TYPE_COLORS: Record<string, { bg: string; badge: string }> = {
  chunk:      { bg: 'bg-amber-50 dark:bg-amber-500/10',   badge: 'bg-amber-100 dark:bg-amber-500/20 text-amber-600' },
  expression: { bg: 'bg-sky-50 dark:bg-sky-500/10',       badge: 'bg-sky-100 dark:bg-sky-500/20 text-sky-600' },
  vocabulary: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', badge: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600' },
  think:      { bg: 'bg-violet-50 dark:bg-violet-500/10',  badge: 'bg-violet-100 dark:bg-violet-500/20 text-violet-600' },
  shadowing:  { bg: 'bg-rose-50 dark:bg-rose-500/10',      badge: 'bg-rose-100 dark:bg-rose-500/20 text-rose-600' },
  article:    { bg: 'bg-teal-50 dark:bg-teal-500/10',      badge: 'bg-teal-100 dark:bg-teal-500/20 text-teal-600' },
  word:       { bg: 'bg-slate-50 dark:bg-slate-500/10',    badge: 'bg-slate-100 dark:bg-slate-500/20 text-slate-600' },
  spelling:   { bg: 'bg-purple-50 dark:bg-purple-500/10',   badge: 'bg-purple-100 dark:bg-purple-500/20 text-purple-600' },
  writing_prompt: { bg: 'bg-fuchsia-50 dark:bg-fuchsia-500/10', badge: 'bg-fuchsia-100 dark:bg-fuchsia-500/20 text-fuchsia-600' },
};

// 'word' 是「快速闪卡/词库」里收藏的单词，'writing_prompt' 是写作页收藏的提示 ——
// 标签配色齐全，只进过滤列表；此前漏了导致只能从「全部」里翻。
const FILTER_TYPES = ['all', 'vocabulary', 'word', 'chunk', 'expression', 'think', 'shadowing', 'article', 'spelling', 'writing_prompt'] as const;

// ============================================================
// Component
// ============================================================
export default function FavoritesPage() {
  const navigate = useNavigate();
  const { favorites, removeFavorite, addFavorite, loaded } = useFavorites();
  const { notes: corrNotes, remove: removeNote } = useCorrectionNotes();
  const [showAllNotes, setShowAllNotes] = useState(false);
  // 纠偏条目 → 句子拼写（产出侧闭环）：句子库归拼写模块所有，这里只调它的入库口
  const { sentences: spellSentences, addSentence } = useSpellingSentences();
  const sendToSpelling = (n: ICorrectionNote) => {
    if (addSentence(correctionToSpellingItem(n))) {
      toast.success('已送进句子拼写 · 在「句子拼写 → 纠偏表达」里逐词拼');
    } else {
      // addSentence 对"已存在"和"已到上限"都回 false，按原因分别说实话
      const exists = spellSentences.some((s) => normSentenceKey(s.en) === normSentenceKey(n.right));
      toast.message(exists ? '这句已经在句子拼写库里' : `句子库已到 ${SPELLING_SENTENCE_LIMIT} 条上限，先删一些再导入`);
    }
  };
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
    // 保留完整条目用于撤销 —— removeFavorite 之后 item 数据还在闭包里
    const item = favorites.find((f) => f.id === id);
    removeFavorite(id);
    toast.success(`已删除收藏: ${content}`, {
      duration: 5000,
      action: item
        ? { label: '撤销', onClick: () => addFavorite({ type: item.type, content: item.content, meaning: item.meaning, example: item.example, category: item.category }) }
        : undefined,
    });
  };

  // 纠偏本区块必须**两个分支都渲染**：一条收藏都没有的账号进收藏页会走「收藏本是空的」早退
  // 分支，原先只把区块写在浏览视图里 → 纠偏本完全没入口（2026-10-17 无头实测抓到）。
  const correctionBlock = corrNotes.length > 0 && (
      <div className="rounded-[28px] border-2 border-orange-200/70 dark:border-orange-500/20 bg-card p-4 space-y-2.5 mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="size-4 text-orange-500" />
          <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">
            表达纠偏 · {corrNotes.length} 条（检测/批改/分析里自动收集）
          </span>
        </div>
        {(showAllNotes ? corrNotes : corrNotes.slice(0, 6)).map((n) => {
          const inSpelling = spellSentences.some((s) => normSentenceKey(s.en) === normSentenceKey(n.right));
          return (
          <div key={n.id} className="rounded-2xl border border-border/60 p-3 space-y-1">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-[11px] font-bold text-rose-500 line-through decoration-rose-300">{n.wrong}</p>
                <p className="text-[12px] font-black italic text-emerald-600">{n.right}</p>
                {n.chineseHint && <p className="text-[10px] text-muted-foreground">{n.chineseHint}</p>}
                {n.note && <p className="text-[10px] text-muted-foreground/80">{n.note}</p>}
              </div>
              <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-muted text-[8px] font-black text-muted-foreground">
                {{ think: '思维检测', writing: '写作批改', conversation: '对话分析' }[n.source] || n.source}
              </span>
              {/* 认出≠写得出：一键把地道说法送进句子拼写（拼写页「纠偏表达」池） */}
              <button
                onClick={() => sendToSpelling(n)}
                className={cn('shrink-0 p-1', inSpelling ? 'text-sky-500/70' : 'text-muted-foreground/50 hover:text-sky-500')}
                title={inSpelling ? '这句已在句子拼写库里' : '把这句地道说法送进句子拼写（逐词拼出来）'}
              >
                <Keyboard className="size-3.5" />
              </button>
              <button onClick={() => removeNote(n.id)} className="shrink-0 p-1 text-muted-foreground/50 hover:text-rose-400" title="移除这条纠偏">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
          );
        })}
        {corrNotes.length > 6 && (
          <button
            onClick={() => setShowAllNotes((v) => !v)}
            className="w-full py-1.5 rounded-xl border border-dashed border-border text-[10px] font-black text-muted-foreground hover:bg-muted/40"
          >
            {showAllNotes ? '收起' : `展开查看全部 (${corrNotes.length})`}
          </button>
        )}
      </div>
  );

  // ── Review mode ──
  if (reviewMode) {
    return (
      <div className="max-w-4xl mx-auto pt-4">
        {/* FavoriteReviewMode 里的卡面动画走 useFramerMotion，而那个 hook 要求外面有
            LazyFramerProvider —— ProgressPage 包了，这里以前没包，点「开始回顾」直接整页白屏
            （2026-10-17 真机报障）。跨页复用的组件，渲染点必须自己带 provider。 */}
        <LazyFramerProvider>
          <FavoriteReviewMode
            favorites={filteredFavorites}
            onExit={() => setReviewMode(false)}
          />
        </LazyFramerProvider>
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
      <div className="max-w-2xl mx-auto pt-4 space-y-6">
        {/* 与浏览视图一致的页面头 */}
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-2xl bg-gradient-to-br from-rose-400 to-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-200/50 dark:shadow-rose-900/30">
            <Heart className="size-6 fill-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black italic text-foreground">收藏本</h1>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              共 0 条收藏
            </p>
          </div>
        </div>
        <EmptyState
          icon={Heart}
          title="收藏本是空的"
          description={<>在词汇学习、搭配学习、文章阅读等页面，点击 <Heart className="size-3.5 inline text-rose-500 fill-current mx-0.5" /> 图标即可收藏你喜欢的表达</>}
        />
        {correctionBlock}
        <div className="flex items-center justify-center gap-3 pb-12 text-[10px] font-bold text-muted-foreground/60">
          <span>💡 单词可收藏</span>
          <span>📝 例句可收藏</span>
          <span>🔗 搭配可收藏</span>
          <span>🎤 演讲可收藏</span>
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
          {/* 分类筛选用下方的 chips（含全部类型），头部只留「开始回顾」—— 此前头部还有一套
              emoji tab 行，两套筛选类型集合不一致（tab 行缺 word/think），状态互相矛盾 */}
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


      {correctionBlock}
      {/* Empty filtered state */}
      {filteredFavorites.length === 0 ? (
        <EmptyState icon={Heart} size="sm" title="该分类暂无收藏内容" className="py-12" />
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

                    {/* Content + TTS + Copy */}
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-lg font-black text-foreground group-hover:text-rose-500 transition-colors">
                        {item.content}
                      </h4>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => tts.speak(item.content)}
                        className="rounded-xl size-7 text-muted-foreground hover:text-ink-teal shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                      >
                        <Volume2 className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const text = item.example ? `${item.content}\n${item.example}` : item.content;
                          try {
                            navigator.clipboard?.writeText(text)
                              .then(() => toast.success('已复制'))
                              .catch(() => toast.error('复制失败，请手动选择文本'));
                          } catch {
                            toast.error('复制失败，请手动选择文本');
                          }
                        }}
                        title="复制"
                        className="rounded-xl size-7 text-muted-foreground hover:text-ink-teal shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                      >
                        <Copy className="size-3.5" />
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
                          className="rounded-lg size-6 text-muted-foreground hover:text-ink-teal shrink-0 opacity-0 group-hover/example:opacity-100 focus-visible:opacity-100 transition-opacity"
                        >
                          <Volume2 className="size-3" />
                        </Button>
                      </div>
                    )}

                    {/* Article — targeted jump to article reading */}
                    {item.type === 'article' && (
                      <div className="flex items-center gap-1.5 mt-2">
                        {/* Source type tag */}
                        <span className={cn(
                          'text-[8px] font-black uppercase tracking-wider rounded-full px-2 py-0.5 shrink-0',
                          item.category === 'book' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                          item.category === 'speech' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                          item.category === 'ai' ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400' :
                          item.category === 'publication' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' :
                          'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400',
                        )}>
                          {item.category === 'book' ? '📖 书籍' :
                           item.category === 'speech' ? '🎙 演讲' :
                           item.category === 'ai' ? '✨ AI' :
                           item.category === 'publication' ? '📰 刊物' : item.category}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 rounded-xl text-[10px] font-black gap-1 border-teal-200 text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-500/10"
                          onClick={() => {
                            const source = item.category || 'ai';
                            navigate(`/articles?open=${encodeURIComponent(item.content)}&source=${encodeURIComponent(source)}`);
                          }}
                        >
                          <ExternalLink className="size-3" />
                          打开文章
                        </Button>
                      </div>
                    )}
                    {/* Shadowing — targeted jump to shadowing material */}
                    {item.type === 'shadowing' && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[8px] font-black uppercase tracking-wider rounded-full px-2 py-0.5 bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400 shrink-0">
                          🎤 影子
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 rounded-xl text-[10px] font-black gap-1 border-rose-200 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                          onClick={() => {
                            navigate(`/shadowing?material=${encodeURIComponent(item.content)}`);
                          }}
                        >
                          <ExternalLink className="size-3" />
                          开始跟读
                        </Button>
                      </div>
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
