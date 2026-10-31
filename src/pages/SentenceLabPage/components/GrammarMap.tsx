import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookMarked, Lightbulb, Search, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { usePageMemory } from '@/lib/use-page-memory';
import { useTTS } from '@/lib/use-tts';
import { cn } from '@/lib/utils';
import { GRAMMAR_TOPICS, GRAMMAR_GROUPS, type IGrammarTopic } from '@/data/grammar-map';
import { SENTENCE_PATTERNS } from '@/data/sentence-patterns';

/**
 * 语法地图 —— 按「中文思维差异」组织的语法索引。
 *
 * 与语法书的区别：每条先给「本质一句话」和「中文为什么在这里容易错」，
 * 规则细节与中式错例放在后面。因为中国学生的语法错处往往不是记不住的规则，
 * 而是中文里根本不存在的机制（时态变形、冠词、从句后置）。
 */
export function GrammarMap({ onJumpToPattern, jumpToTopic }: { onJumpToPattern?: (patternId: string) => void; jumpToTopic?: string | null }) {
  const [filter, setFilter] = usePageMemory<{ group: string; query: string }>(
    'grammar-map-filter',
    { group: '全部', query: '' },
  );
  const groupChoices = ['全部', ...GRAMMAR_GROUPS] as const;
  const group = groupChoices.find((g) => g === filter.group) ?? '全部';
  const query = filter.query.trim().toLowerCase();
  const [activeId, setActiveId] = useState(GRAMMAR_TOPICS[0].id);
  const { speak } = useTTS();

  const list = useMemo(
    () => GRAMMAR_TOPICS.filter((t) => {
      if (group !== '全部' && t.group !== group) return false;
      if (query) {
        const haystack = [
          t.name, t.group, t.essence, t.zhGap,
          ...t.points.map((p) => `${p.title} ${p.body} ${p.example?.en ?? ''} ${p.example?.zh ?? ''}`),
          ...t.pitfalls.map((p) => `${p.wrong} ${p.right} ${p.why}`),
        ].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    }),
    [group, query],
  );
  // 从句子精讲跳进来时，直接打开对应语法条目（先清筛选，避免目标被筛掉）
  useEffect(() => {
    if (jumpToTopic && GRAMMAR_TOPICS.some((t) => t.id === jumpToTopic)) {
      setActiveId(jumpToTopic);
      setFilter({ group: '全部', query: '' });
    }
  }, [jumpToTopic]);
  useEffect(() => {
    if (list.length > 0 && !list.some((t) => t.id === activeId)) setActiveId(list[0].id);
  }, [list, activeId]);

  const active: IGrammarTopic | undefined = list.find((t) => t.id === activeId) ?? list[0];

  const patternName = (pid: string) => SENTENCE_PATTERNS.find((p) => p.id === pid)?.name;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* 分工说明：语法讲「为什么这样组织」，句型讲「照着怎么造」 */}
      <div className="lg:col-span-2 rounded-3xl border border-border/60 bg-card p-4">
        <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
          <span className="font-black text-foreground">语法地图</span>讲「为什么英语这样组织」（按中文思维差异编排，共 {GRAMMAR_TOPICS.length} 条）；
          <span className="font-black text-foreground">句型</span>讲「照着怎么造」（{SENTENCE_PATTERNS.length} 个骨架）。
          两者互补：先在这里弄清机制，再去句型库动手造句。每条的底部有「去句型库练」直达对应句型。
        </p>
      </div>

      {/* 左：分组 + 条目 */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={filter.query}
            onChange={(event) => setFilter((prev) => ({ ...prev, query: event.target.value }))}
            placeholder="搜索语法点、本质或错例…"
            className="rounded-2xl pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="按语法分组筛选">
          {['全部', ...GRAMMAR_GROUPS].map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={group === g}
              onClick={() => setFilter((prev) => ({ ...prev, group: g }))}
              className={cn(
                'px-2.5 py-1 rounded-full text-[10px] font-black border transition-all',
                group === g
                  ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-ink-teal'
                  : 'border-border text-muted-foreground hover:border-muted-foreground/40',
              )}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
          <span>匹配 {list.length}/{GRAMMAR_TOPICS.length}</span>
          {(query || group !== '全部') && (
            <button type="button" onClick={() => setFilter({ group: '全部', query: '' })}
              className="hover:text-foreground">
              清除筛选
            </button>
          )}
        </div>
        {list.length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/20 p-4 text-center">
            <p className="text-xs font-black text-foreground">没有匹配的语法点</p>
            <p className="mt-1 text-[11px] text-muted-foreground">换个关键词，或清除分组筛选。</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
            {list.map((t) => (
              <button
                key={t.id}
                type="button"
                data-grammar-id={t.id}
                onClick={() => setActiveId(t.id)}
                className={cn(
                  'w-full text-left rounded-2xl border p-3 transition-all',
                  active?.id === t.id
                    ? 'border-[var(--brand)] bg-[var(--brand)]/5'
                    : 'border-border/60 bg-card hover:border-muted-foreground/30',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-foreground leading-snug">{t.name}</span>
                  <span className="text-[9px] font-black text-muted-foreground shrink-0">
                    {t.level === 'beginner' ? '基础' : t.level === 'intermediate' ? '进阶' : '高阶'}
                  </span>
                </div>
                <p className="text-[10px] font-bold text-muted-foreground mt-1 line-clamp-2">{t.essence}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 右：详情 */}
      {active && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-black text-foreground">{active.name}</h3>
              <Badge variant="secondary" className="rounded-full text-[10px] font-black">{active.group}</Badge>
            </div>

            {/* 本质 */}
            <div className="rounded-2xl bg-[var(--brand)]/5 border border-[var(--brand)]/20 p-3.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-ink-teal mb-1">本质一句话</p>
              <p className="text-[13px] font-bold text-foreground leading-relaxed">{active.essence}</p>
            </div>

            {/* 中文思维差异 */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 dark:border-amber-500/25 dark:bg-amber-500/5 p-3.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1.5">
                <Lightbulb className="size-3" /> 中文思维为什么在这里容易错
              </p>
              <p className="text-[12px] font-bold text-foreground/85 leading-relaxed">{active.zhGap}</p>
            </div>

            {/* 要点 */}
            <div className="space-y-2.5">
              {active.points.map((p, i) => (
                <div key={i} className="rounded-2xl border border-border/60 p-3">
                  <p className="text-[12px] font-black text-foreground">{i + 1}. {p.title}</p>
                  <p className="text-[11px] font-bold text-muted-foreground mt-1 leading-relaxed">{p.body}</p>
                  {p.example && (
                    <div className="mt-2 flex items-start gap-2 rounded-xl bg-muted/50 p-2.5">
                      <Button size="sm" variant="ghost" className="rounded-lg h-6 px-1.5 shrink-0"
                        onClick={() => speak(p.example!.en)} aria-label="朗读例句">
                        <Volume2 className="size-3" />
                      </Button>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-foreground leading-snug">{p.example.en}</p>
                        <p className="text-[10px] font-bold text-muted-foreground mt-0.5">{p.example.zh}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 高频中式错误 */}
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 text-amber-500" /> 高频中式错误
              </p>
              {active.pitfalls.map((p, i) => (
                <div key={i} className="rounded-2xl border border-border/60 overflow-hidden">
                  <div className="grid sm:grid-cols-2">
                    <div className="p-2.5 bg-rose-50/60 dark:bg-rose-500/5 border-b sm:border-b-0 sm:border-r border-border/60">
                      <p className="text-[9px] font-black text-rose-600 dark:text-rose-400 mb-0.5">✗ 常见说法</p>
                      <p className="text-[11px] font-bold text-foreground/80 line-through decoration-rose-400/60">{p.wrong}</p>
                    </div>
                    <div className="p-2.5 bg-[var(--brand)]/5">
                      <p className="text-[9px] font-black text-ink-teal mb-0.5">✓ 地道说法</p>
                      <p className="text-[11px] font-bold text-foreground">{p.right}</p>
                    </div>
                  </div>
                  <p className="px-2.5 py-2 text-[10px] font-bold text-muted-foreground leading-relaxed border-t border-border/60">
                    {p.why}
                  </p>
                </div>
              ))}
            </div>

            {/* 关联句型 */}
            {active.relatedPatterns && active.relatedPatterns.length > 0 && onJumpToPattern && (
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  去句型库练
                </span>
                {active.relatedPatterns.map((pid) => {
                  const nm = patternName(pid);
                  if (!nm) return null;
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => onJumpToPattern(pid)}
                      className="px-2.5 py-1 rounded-full text-[10px] font-black border border-[var(--brand)]/30 bg-[var(--brand)]/5 text-ink-teal hover:bg-[var(--brand)]/10 transition-colors flex items-center gap-1"
                    >
                      <BookMarked className="size-3" /> {nm}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
