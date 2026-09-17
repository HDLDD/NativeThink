import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Heart, Lightbulb, Volume2, Wand2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
export function PatternLibrary() {
  const [cat, setCat] = useState<string>('全部');
  const [activeId, setActiveId] = useState(SENTENCE_PATTERNS[0].id);
  const [values, setValues] = useState<Record<string, string>>({});
  const { speak } = useTTS();
  const { favorites, addFavorite, removeFavorite, isFavorited } = useFavorites();

  const list = useMemo(
    () => (cat === '全部' ? SENTENCE_PATTERNS : SENTENCE_PATTERNS.filter((p) => p.category === cat)),
    [cat],
  );
  const active = SENTENCE_PATTERNS.find((p) => p.id === activeId) || list[0];
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
        <div className="flex flex-wrap gap-1.5">
          {['全部', ...PATTERN_CATEGORIES].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={cn(
                'px-2.5 py-1 rounded-full text-[10px] font-black border transition-all',
                cat === c
                  ? 'border-[#00B894] bg-[#00B894]/10 text-ink-teal'
                  : 'border-border text-muted-foreground hover:border-muted-foreground/40',
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
          {list.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setActiveId(p.id); setValues({}); }}
              className={cn(
                'w-full text-left rounded-2xl border p-3 transition-all',
                active?.id === p.id
                  ? 'border-[#00B894] bg-[#00B894]/5'
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
                    <span key={i} className="inline-block px-2 py-0.5 mx-0.5 rounded-lg bg-[#00B894]/10 text-ink-teal border border-[#00B894]/30">
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
              <div className="rounded-2xl border border-[#00B894]/30 bg-[#00B894]/5 p-3">
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
              <Button size="sm" className="rounded-xl text-[10px] font-black bg-[#00B894] hover:bg-[#00A383]"
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
