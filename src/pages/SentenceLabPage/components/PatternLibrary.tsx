import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Heart, Lightbulb, Volume2, Wand2, ArrowRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { usePageMemory } from '@/lib/use-page-memory';
import { useTTS } from '@/lib/use-tts';
import { useFavorites } from '@/lib/use-favorites';
import { cn } from '@/lib/utils';
import { SENTENCE_PATTERNS, PATTERN_CATEGORIES, type ISentencePattern } from '@/data/sentence-patterns';

/** 把骨架 + 用户填的槽位拼成完整句 */
function buildSentence(p: ISentencePattern, values: Record<string, string>): string {
  return p.frame
    .map((part) => {
      const m = part.match(/^\{(.+)\}$/);
      if (!m) return part;
      return values[m[1]] ?? `[${m[1]}]`;
    })
    .join('');
}

/**
 * 句型库 —— 造句的骨架。
 * 左侧选句型，右侧看结构、读思维差异、照着造一句。
 */
export function PatternLibrary({ initialPatternId }: { initialPatternId?: string | null }) {
  const [filter, setFilter] = usePageMemory<{ category: string; query: string }>(
    'pattern-library-filter',
    { category: '全部', query: '' },
  );
  const categoryChoices = ['全部', ...PATTERN_CATEGORIES] as const;
  const cat = categoryChoices.find((c) => c === filter.category) ?? '全部';
  const query = filter.query.trim().toLowerCase();
  const setCat = (category: string) => {
    setFilter((prev) => ({ ...prev, category }));
    setValues({});
  };
  const [activeId, setActiveId] = useState(initialPatternId || SENTENCE_PATTERNS[0].id);
  const [values, setValues] = useState<Record<string, string>>({});
  const { speak } = useTTS();
  const { favorites, addFavorite, removeFavorite, isFavorited } = useFavorites();

  // 从语法页跳进来时，直接打开对应句型（先清掉筛选，避免目标被筛掉）
  useEffect(() => {
    if (initialPatternId && SENTENCE_PATTERNS.some((p) => p.id === initialPatternId)) {
      setActiveId(initialPatternId);
      setFilter({ category: '全部', query: '' });
    }
  }, [initialPatternId]);

  const list = useMemo(
    () => SENTENCE_PATTERNS.filter((p) => {
      if (cat !== '全部' && p.category !== cat) return false;
      if (query) {
        const haystack = `${p.name} ${p.category} ${p.frame.join('')} ${p.zhThinking} ${p.why} ${p.examples.map((e) => `${e.en} ${e.zh}`).join(' ')}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    }),
    [cat, query],
  );
  useEffect(() => {
    if (list.length > 0 && !list.some((p) => p.id === activeId)) {
      setActiveId(list[0].id);
      setValues({});
    }
  }, [list, activeId]);
  const active = list.find((p) => p.id === activeId) ?? list[0];
  const built = active ? buildSentence(active, values) : '';
  const builtReady = active ? active.slots.every((s) => (values[s.key] || '').trim()) : false;
  const faved = active ? isFavorited(`模式:${active.id}`, 'expression') : false;

  const toggleFav = (p: ISentencePattern) => {
    const content = `模式:${p.id}`;
    if (isFavorited(content, 'expression')) {
      const f = favorites.find((x) => x.content === content && x.type === 'expression');
      if (f) removeFavorite(f.id);
      toast.info('已取消收藏');
      return;
    }
    addFavorite({
      type: 'expression',
      content,
      meaning: `${p.name}｜${p.frame.join('')}`,
      category: '句型库',
      example: p.examples[0]?.en,
    });
    toast.success('句型已收藏');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* 左：句型列表 */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={filter.query}
            onChange={(event) => setFilter((prev) => ({ ...prev, query: event.target.value }))}
            placeholder="搜索句型、骨架或例句…"
            className="rounded-2xl pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="按句型分类筛选">
          {['全部', ...PATTERN_CATEGORIES].map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cat === c}
              onClick={() => setCat(c)}
              className={cn(
                'px-2.5 py-1 rounded-full text-[10px] font-black border transition-all',
                cat === c
                  ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-ink-teal'
                  : 'border-border text-muted-foreground hover:border-muted-foreground/40',
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
          <span>匹配 {list.length}/{SENTENCE_PATTERNS.length}</span>
          {(query || cat !== '全部') && (
            <button type="button" onClick={() => setFilter({ category: '全部', query: '' })}
              className="hover:text-foreground">
              清除筛选
            </button>
          )}
        </div>
        {list.length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/20 p-4 text-center">
            <p className="text-xs font-black text-foreground">没有匹配的句型</p>
            <p className="mt-1 text-[11px] text-muted-foreground">换个关键词，或清除分类筛选。</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                data-pattern-id={p.id}
                onClick={() => { setActiveId(p.id); setValues({}); }}
                className={cn(
                  'w-full text-left rounded-2xl border p-3 transition-all',
                  active?.id === p.id
                    ? 'border-[var(--brand)] bg-[var(--brand)]/5'
                    : 'border-border/60 bg-card hover:border-muted-foreground/30',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-foreground truncate">{p.name}</span>
                  <span className="text-[9px] font-black text-muted-foreground shrink-0">
                    {p.level === 'beginner' ? '入门' : p.level === 'intermediate' ? '进阶' : '高阶'}
                  </span>
                </div>
                <p className="text-[10px] font-bold text-muted-foreground mt-1 line-clamp-2">{p.frame.join('')}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 右：详情 */}
      {active && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-foreground">{active.name}</h3>
                <Badge variant="secondary" className="rounded-full text-[10px] font-black">{active.category}</Badge>
              </div>
              <Button size="sm" variant="ghost" className="rounded-xl h-8 px-2" onClick={() => toggleFav(active)} aria-label="收藏句型">
                <Heart className={cn('size-3.5', faved && 'fill-rose-500 text-rose-500')} />
              </Button>
            </div>

            {/* 骨架 */}
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">骨架</p>
              <p className="text-[13px] font-black text-foreground leading-relaxed">
                {active.frame.map((part, i) => {
                  const m = part.match(/^\{(.+)\}$/);
                  if (!m) return <span key={i}>{part}</span>;
                  return (
                    <span key={i} className="inline-block px-2 py-0.5 mx-0.5 rounded-lg bg-[var(--brand)]/10 text-ink-teal border border-[var(--brand)]/30">
                      {m[1]}
                    </span>
                  );
                })}
              </p>
            </div>

            {/* 思维对照 */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/60 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">中文思维</p>
                <p className="text-[11px] font-bold text-foreground/80 leading-relaxed">{active.zhThinking}</p>
              </div>
              <div className="rounded-2xl border border-[var(--brand)]/30 bg-[var(--brand)]/5 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-ink-teal mb-1 flex items-center gap-1">
                  <Lightbulb className="size-3" /> 母语者为什么这样组织
                </p>
                <p className="text-[11px] font-bold text-foreground/80 leading-relaxed">{active.why}</p>
              </div>
            </div>

            {/* 例句 */}
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">例句</p>
              {active.examples.map((ex, i) => (
                <div key={i} className="flex items-start gap-2 rounded-2xl bg-muted/40 p-3">
                  <Button size="sm" variant="ghost" className="rounded-xl h-7 px-1.5 shrink-0" onClick={() => speak(ex.en)} aria-label="朗读例句">
                    <Volume2 className="size-3.5" />
                  </Button>
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-foreground leading-snug">{ex.en}</p>
                    <p className="text-[10px] font-bold text-muted-foreground mt-0.5">{ex.zh}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 照着造 */}
          <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Wand2 className="size-3.5 text-ink-teal" /> 照着造一句
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {active.slots.map((s) => (
                <div key={s.key} className="space-y-1">
                  <label className="text-[10px] font-black text-foreground">{s.key}</label>
                  <Input
                    value={values[s.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
                    placeholder={s.hint}
                    className="rounded-xl h-9 text-xs font-bold"
                  />
                  <button
                    type="button"
                    className="text-[9px] font-bold text-muted-foreground hover:text-ink-teal transition-colors"
                    onClick={() => setValues((v) => ({ ...v, [s.key]: s.sample }))}
                  >
                    用示例：{s.sample}
                  </button>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-muted/40 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">你的句子</p>
              <p className="text-[13px] font-black text-foreground leading-relaxed">{built}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="rounded-xl text-[10px] font-black bg-[var(--brand)] hover:bg-[#00A383]"
                disabled={!builtReady}
                onClick={() => {
                  speak(built);
                  addFavorite({
                    type: 'expression',
                    content: built,
                    meaning: `${active.name} 造的句子`,
                    category: '句子学习',
                    example: active.zhThinking,
                  });
                  toast.success('已朗读并收藏');
                }}>
                <Volume2 className="size-3.5" /> 朗读并收藏
              </Button>
              <Button size="sm" variant="ghost" className="rounded-xl text-[10px] font-black"
                onClick={() => setValues({})}>
                清空
              </Button>
              {!builtReady && (
                <span className="text-[10px] font-bold text-muted-foreground self-center flex items-center gap-1">
                  <ArrowRight className="size-3" /> 填满槽位即可朗读
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
