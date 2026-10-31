import { useMemo, useState } from 'react';
import { ChevronRight, Heart, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  SPELLING_POOLS,
  SPELLING_POOL_GROUPS,
  describeSpellingPool,
  filterSpellingPools,
  type ISpellingPool,
  type ISpellingPoolProgress,
} from '@/lib/spelling-pools';

interface SpellingPoolPickerProps {
  activeLevel: string;
  progressByKey: Record<string, ISpellingPoolProgress | undefined>;
  favoriteWordCount: number;
  loadingLevel?: string | null;
  disabled?: boolean;
  onPick: (level: string) => void;
  onImportFavorites: () => void;
}

/** 收藏单词不是 level，是一个导入动作；单独当一张卡，但和专属题池排在一起 */
const FAVORITES_POOL_KEY = 'favorites-import';
const FAVORITES_SEARCH_TEXT = '收藏 单词 导入 favorites';

function PoolCard({
  pool,
  progress,
  active,
  loading,
  disabled,
  onPick,
}: {
  pool: ISpellingPool;
  progress?: ISpellingPoolProgress;
  active: boolean;
  loading: boolean;
  disabled?: boolean;
  onPick: (level: string) => void;
}) {
  const status = describeSpellingPool(pool, progress);
  return (
    <button
      type="button"
      data-press="soft"
      data-spelling-pool={pool.key}
      disabled={disabled}
      onClick={() => onPick(pool.key)}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'group relative overflow-hidden rounded-2xl border p-3.5 text-left transition-colors',
        active
          ? 'border-[var(--brand)] bg-[var(--brand)]/5'
          : 'border-border bg-card hover:border-foreground/25',
        disabled && 'cursor-wait opacity-60',
      )}
    >
      <span className="absolute inset-y-3 left-0 w-[3px] rounded-full" style={{ background: pool.color }} aria-hidden />
      <div className="flex items-start gap-2 pl-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-black text-foreground">{pool.label}</span>
            {active && (
              <span className="rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[9px] font-bold leading-none text-[var(--on-brand)]">当前</span>
            )}
            {loading && <Loader2 className="size-3 animate-spin text-ink-teal" />}
          </div>
          <p className="mt-0.5 line-clamp-1 text-[10px] font-bold text-muted-foreground">{pool.desc}</p>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[11px] font-black tabular-nums text-foreground/80">{status.primary}</span>
            <span className="text-[10px] font-bold text-muted-foreground">{status.secondary}</span>
          </div>
        </div>
        {status.resumable && !loading ? (
          <span className="shrink-0 rounded-full bg-[var(--brand)]/10 px-2 py-0.5 text-[9px] font-black text-ink-teal">继续</span>
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-ink-teal" />
        )}
      </div>
    </button>
  );
}

/**
 * 词书与题池选择器。
 *
 * 首屏和练习页共用：纠偏表达 / 视频精听必须和 11 本词书出现在同一张表里，
 * 否则它们永远藏在右上角下拉里，用户不知道有这个池子。
 */
export function SpellingPoolPicker({
  activeLevel,
  progressByKey,
  favoriteWordCount,
  loadingLevel,
  disabled,
  onPick,
  onImportFavorites,
}: SpellingPoolPickerProps) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => filterSpellingPools(SPELLING_POOLS, query), [query]);
  const showFavorites = !q || FAVORITES_SEARCH_TEXT.includes(q);
  const hasResult = filtered.length > 0 || showFavorites;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索词书或题池"
          className="h-9 rounded-xl pl-9 text-xs font-bold"
          aria-label="搜索词书或题池"
        />
      </div>

      {SPELLING_POOL_GROUPS.map((group) => {
        const items = filtered.filter((p) => p.group === group.key);
        const withFavorites = group.key === 'special' && showFavorites;
        if (items.length === 0 && !withFavorites) return null;
        const total = items.length + (withFavorites ? 1 : 0);
        return (
          <section key={group.key} className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{group.label}</p>
              <span className="text-[10px] font-bold tabular-nums text-muted-foreground/60">{total}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((pool) => (
                <PoolCard
                  key={pool.key}
                  pool={pool}
                  progress={progressByKey[pool.key]}
                  active={activeLevel === pool.key}
                  loading={loadingLevel === pool.key}
                  disabled={disabled}
                  onPick={onPick}
                />
              ))}
              {withFavorites && (
                <button
                  type="button"
                  data-press="soft"
                  data-spelling-pool={FAVORITES_POOL_KEY}
                  disabled={disabled}
                  onClick={onImportFavorites}
                  className={cn(
                    'group relative overflow-hidden rounded-2xl border border-dashed border-border bg-card p-3.5 text-left transition-colors hover:border-rose-300 dark:hover:border-rose-500/40',
                    disabled && 'cursor-wait opacity-60',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500 dark:bg-rose-500/10">
                      <Heart className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-black text-foreground">收藏单词</p>
                      <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">把收藏的单词导入拼写队列</p>
                      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-[11px] font-black tabular-nums text-foreground/80">
                          {favoriteWordCount > 0 ? `已收藏 ${favoriteWordCount} 个单词` : '还没有收藏单词'}
                        </span>
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {favoriteWordCount > 0 ? '导入后进入全部词库' : '先去词库/阅读点 ❤ 收藏'}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-black text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
                      {favoriteWordCount > 0 ? '导入' : '去收藏'}
                    </span>
                  </div>
                </button>
              )}
            </div>
          </section>
        );
      })}

      {!hasResult && (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center">
          <p className="text-xs font-black text-foreground">没有匹配的题池</p>
          <p className="mt-1 text-[11px] font-bold text-muted-foreground">换个关键词，或清除搜索看全部。</p>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="mt-3 rounded-full border border-border px-3 py-1 text-[10px] font-black text-muted-foreground transition-colors hover:border-[var(--brand)]/40 hover:text-ink-teal"
          >
            清除搜索
          </button>
        </div>
      )}
    </div>
  );
}