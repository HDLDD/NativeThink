/**
 * 模式复习概览：今日焦点 / 长文主推 / 模式库 / 本轮完成页。
 *
 * 模式库是分层卡片墙（默认收起，筛选时自动摊开）：按层分组，
 * 到期 → 进行中 → 未开始 → 已掌握排序；每张卡可直接练或进详情。
 * 首屏只留两个主入口：今天该练的那一张 +「长文 · 对话」主推；
 * 体检/薄弱报告/趋势/真实任务/口头任务/自由训练/改写快练已搬到「练习」tab
 * （PatternExtrasPanel），这里只在页底留一条切过去的文字链。
 *
 * 全部数据来自 props（`stats` / `weak` / `dueQueue` / `progress` / `diagnostic`），
 * 本组件不读存储、不改进度。日期一律 formatDate（本地日）。
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  THINK_PATTERN_LAYERS,
  THINK_PATTERNS,
  type IThinkPattern,
  type ThinkPatternLayer,
} from '@/data/think-patterns';
import { usePageMemory } from '@/lib/use-page-memory';
import type { PatternResumeSnapshot } from '@/lib/think-session-resume';
import { resumeStepLabel } from '@/lib/think-session-resume';
import type { IThinkPatternStats } from '@/lib/use-think-patterns';
import {
  isDue,
  pickPracticePatternIds,
  sortPatternsForLibrary,
  summarizeLayers,
  type IThinkPatternDiagnosticRecord,
  type IThinkPatternProgress,
  type PatternWeakItem,
} from '@/lib/think-patterns';
import { cn, formatDate } from '@/lib/utils';

const LAYER_IDS = THINK_PATTERN_LAYERS.map((layer) => layer.id);
type PatternLibraryFilter = 'all' | 'due' | 'active' | 'mastered';

export interface PatternOverviewProps {
  stats: IThinkPatternStats;
  weak: PatternWeakItem[];
  dueQueue: string[];
  progress: Record<string, IThinkPatternProgress>;
  mode: 'overview' | 'review' | 'complete';
  passed: number;
  failed: number;
  diagnostic: IThinkPatternDiagnosticRecord | null;
  /** 上次没写完的三稿会话；有值时显示「继续上次训练」 */
  resume: PatternResumeSnapshot | null;
  onResume: () => void;
  onDiscardResume: () => void;
  onStart: (firstPatternId?: string) => void;
  onPractice: (patternIds: string[]) => void;
  onDetail: (patternId: string) => void;
  onBack: () => void;
  /** 页底「其他练习 →」文字链：切到练习 tab */
  onOpenExtras: () => void;
}

function statusLabel(value?: IThinkPatternProgress): string {
  if (!value) return '未开始';
  if (value.status === 'mastered') return '已掌握';
  if (value.status === 'reviewing') return '复习中';
  return '学习中';
}

function statusTone(value?: IThinkPatternProgress): string {
  if (!value) return 'border-border text-muted-foreground';
  if (value.status === 'mastered') return 'border-emerald-500/40 text-emerald-600';
  if (value.status === 'reviewing') return 'border-[var(--brand)]/40 text-ink-teal';
  return 'border-amber-500/40 text-amber-600';
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/25 p-3 min-w-0">
      <p className="text-xl font-black text-foreground leading-none">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-1.5">{label}</p>
    </div>
  );
}

export function PatternOverview({
  stats,
  weak,
  dueQueue,
  progress,
  mode,
  passed,
  failed,
  diagnostic,
  resume,
  onResume,
  onDiscardResume,
  onStart,
  onPractice,
  onDetail,
  onBack,
  onOpenExtras,
}: PatternOverviewProps) {
  // 模式库默认展开（她 2026-10-31 定的：收起来等于白做）。「今日先练」仍是页面最上面那张。
  const [showLibrary, setShowLibrary] = useState(true);
  const [libraryFilter, setLibraryFilter] = usePageMemory<{
    layer: 'all' | ThinkPatternLayer;
    status: PatternLibraryFilter;
  }>('think-library-filter', { layer: 'all', status: 'all' });
  // usePageMemory 的旧值可能来自旧版本；运行时再收一次，坏值回退到“全部”。
  const layerFilter = libraryFilter.layer === 'all' || LAYER_IDS.includes(libraryFilter.layer)
    ? libraryFilter.layer
    : 'all';
  const statusFilter = (['all', 'due', 'active', 'mastered'] as const).includes(libraryFilter.status)
    ? libraryFilter.status
    : 'all';
  // 只要有人在筛，就把库摊开——收起时被筛掉的模式会看不见，那样更糊涂。
  const libraryOpen = showLibrary || layerFilter !== 'all' || statusFilter !== 'all';
  const setLayerFilter = (layer: 'all' | ThinkPatternLayer) =>
    setLibraryFilter((prev) => ({ ...prev, layer }));
  const setStatusFilter = (status: PatternLibraryFilter) =>
    setLibraryFilter((prev) => ({ ...prev, status }));
  const resetLibraryFilter = () => setLibraryFilter({ layer: 'all', status: 'all' });
  const now = Date.now();
  const today = formatDate(new Date(now));
  const layerSummaries = summarizeLayers(THINK_PATTERNS, progress, LAYER_IDS, now, today);
  const practiceIds = pickPracticePatternIds(THINK_PATTERNS, progress, 5);
  const sortedPatterns = sortPatternsForLibrary(THINK_PATTERNS, progress, now, today);
  const activeCount = Object.values(progress).filter((p) => p.status !== 'mastered').length;
  const libraryCounts = {
    all: THINK_PATTERNS.length,
    due: stats.due,
    active: activeCount,
    mastered: stats.mastered,
  };
  const filteredPatterns = sortedPatterns.filter((pattern) => {
    if (layerFilter !== 'all' && pattern.layer !== layerFilter) return false;
    const p = progress[pattern.id];
    if (statusFilter === 'due') return !!p && isDue(p, now, today);
    if (statusFilter === 'active') return !!p && p.status !== 'mastered';
    if (statusFilter === 'mastered') return p?.status === 'mastered';
    return true;
  });
  const filteredGroups = THINK_PATTERN_LAYERS
    .map((layer) => ({ layer, items: filteredPatterns.filter((pattern) => pattern.layer === layer.id) }))
    .filter((group) => group.items.length > 0);
  const empty = dueQueue.length === 0;
  const mainLabel = empty
    ? stats.mastered === THINK_PATTERNS.length
      ? `${THINK_PATTERNS.length} 个模式都已掌握`
      : '今天已完成，下次到期后再来'
    : `开始今日训练（${dueQueue.length}）`;

  /* 首屏只给“最该练的 3 个”：体检建议 → 薄弱 → 到期；全部 12 个折叠在后面。 */
  const recommendedIds = (diagnostic?.recommendedPatternIds ?? [])
    .filter((id) => progress[id]?.status !== 'mastered');
  const focusIds = [...recommendedIds, ...weak.map((row) => row.pattern.id), ...dueQueue];
  const focusPatterns: IThinkPattern[] = [];
  for (const id of focusIds) {
    const pattern = THINK_PATTERNS.find((candidate) => candidate.id === id);
    if (pattern && !focusPatterns.some((candidate) => candidate.id === pattern.id)) {
      focusPatterns.push(pattern);
    }
    if (focusPatterns.length >= 3) break;
  }
  if (focusPatterns.length === 0) focusPatterns.push(...THINK_PATTERNS.slice(0, 3));

  const resumePattern = resume ? THINK_PATTERNS.find((pattern) => pattern.id === resume.patternId) : null;
  const hero = focusPatterns[0];
  const queue = focusPatterns.slice(1);
  const heroLayer = THINK_PATTERN_LAYERS.find((layer) => layer.id === hero.layer);
  const heroProgress = progress[hero.id];
  const calibrationAttempts = heroProgress?.calibrationAttempts ?? 0;
  const calibrationHits = heroProgress?.calibrationHits ?? 0;
  const heroRecommended = recommendedIds.includes(hero.id);
  const heroReason = heroRecommended
    ? '体检建议'
    : weak.some((row) => row.pattern.id === hero.id)
      ? `薄弱 · lapses ${heroProgress?.lapses ?? 0}`
      : heroProgress
        ? '到期'
        : '新引入';
  const heroQueueCount = 1 + dueQueue.filter((id) => id !== hero.id).length;
  const heroStartable = !empty || heroRecommended;
  const heroLabel = heroStartable
    ? heroQueueCount > 1
      ? `开始今日训练（${heroQueueCount}）`
      : '开始这个模式'
    : mainLabel;

  const renderPatternCard = (pattern: IThinkPattern) => {
    const p = progress[pattern.id];
    const due = !!p && isDue(p, now, today);
    const status = due ? '到期' : statusLabel(p);
    const reps = Math.min(4, Math.max(0, p?.repetitions ?? 0));
    const nextText = due
      ? '今天到期'
      : !p
        ? '还没开始'
        : p.status === 'mastered'
          ? '下次 —'
          : `下次 ${formatDate(new Date(p.nextReview))}`;
    const todayDone = p?.lastAttempt?.on === today;
    return (
      <Card
        key={pattern.id}
        data-pattern-id={pattern.id}
        className={cn(
          'min-w-0 rounded-3xl border-border shadow-sm',
          due && 'border-amber-500/40',
        )}
      >
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h5 className="text-sm font-black text-foreground break-words">{pattern.name}</h5>
                {todayDone && (
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
                    今天已练
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground break-words">{pattern.oneLiner}</p>
            </div>
            <Badge
              variant="outline"
              className={cn('shrink-0', due ? 'border-amber-500/40 text-amber-700' : statusTone(p))}
            >
              {status}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] font-bold text-muted-foreground">
            <span>{nextText}</span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {p ? (
              <span
                className="flex items-center gap-1.5"
                aria-label={`连续通过 ${reps}/4`}
              >
                <span className="flex gap-0.5" aria-hidden>
                  {[0, 1, 2, 3].map((index) => (
                    <span
                      key={index}
                      className={cn(
                        'size-1.5 rounded-full',
                        index < reps ? 'bg-[var(--brand)]' : 'bg-muted',
                      )}
                    />
                  ))}
                </span>
                <span className="text-[10px] font-bold text-muted-foreground">
                  连续 {reps}/4
                </span>
              </span>
            ) : (
              <span className="text-[10px] font-bold text-muted-foreground">
                对比 → 识别 → 迁移 · 约 3 分钟
              </span>
            )}
            <span className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full px-2.5"
                onClick={() => onDetail(pattern.id)}
              >
                详情
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-[var(--brand)]/40 px-3 text-ink-teal"
                onClick={() => onPractice([pattern.id])}
              >
                {p ? '练' : '开始'}
              </Button>
            </span>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderPatternLibrary = () => {
    const statusOptions: Array<{ key: PatternLibraryFilter; label: string; count: number }> = [
      { key: 'all', label: '状态', count: libraryCounts.all },
      { key: 'due', label: '到期', count: libraryCounts.due },
      { key: 'active', label: '进行中', count: libraryCounts.active },
      { key: 'mastered', label: '已掌握', count: libraryCounts.mastered },
    ];
    const chipClass = (selected: boolean) => cn(
      'rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors',
      selected
        ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-ink-teal'
        : 'border-border bg-card text-muted-foreground hover:text-foreground',
    );
    return (
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Pattern Library
            </p>
            <h3 className="text-lg font-black italic tracking-tight text-foreground">模式库</h3>
            <p className="mt-0.5 text-xs text-muted-foreground break-words">
              {libraryOpen
                ? '按四层分组；到期优先，点「练」直接开始。'
                : `已掌握 ${stats.mastered}/${THINK_PATTERNS.length} · 到期 ${stats.due}。日常只练今天那一张，这里不必打开。`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {libraryOpen && (
              <span className="text-[11px] font-bold text-muted-foreground">
                显示 {filteredPatterns.length}/{THINK_PATTERNS.length}
              </span>
            )}
            <button
              type="button"
              aria-expanded={libraryOpen}
              className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setShowLibrary((prev) => !prev)}
            >
              {libraryOpen ? '收起' : '展开模式库'}
            </button>
          </div>
        </div>

        {libraryOpen && (
        <>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="按层筛选">
            <button
              type="button"
              aria-pressed={layerFilter === 'all'}
              className={chipClass(layerFilter === 'all')}
              onClick={() => setLayerFilter('all')}
            >
              层级 {THINK_PATTERNS.length}
            </button>
            {THINK_PATTERN_LAYERS.map((layer) => {
              const total = layerSummaries.find((summary) => summary.layerId === layer.id)?.total ?? 0;
              return (
                <button
                  key={layer.id}
                  type="button"
                  aria-pressed={layerFilter === layer.id}
                  className={chipClass(layerFilter === layer.id)}
                  onClick={() => setLayerFilter(layer.id)}
                >
                  {layer.name} {total}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="按状态筛选">
            {statusOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={statusFilter === option.key}
                className={chipClass(statusFilter === option.key)}
                onClick={() => setStatusFilter(option.key)}
              >
                {option.label} {option.count}
              </button>
            ))}
          </div>
        </div>

        {filteredPatterns.length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/20 p-4 text-center">
            <p className="text-sm text-muted-foreground">没有符合当前筛选的模式。</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 rounded-full"
              onClick={resetLibraryFilter}
            >
              清除筛选
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {filteredGroups.map(({ layer, items }) => {
              const summary = layerSummaries.find((row) => row.layerId === layer.id);
              const total = summary?.total ?? items.length;
              const mastered = summary?.mastered ?? 0;
              const due = summary?.due ?? 0;
              const percent = total > 0 ? Math.round((mastered / total) * 100) : 0;
              return (
                <section key={layer.id} className="space-y-2.5">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-sm font-black text-foreground">{layer.name}</h4>
                      <p className="text-xs text-muted-foreground break-words">{layer.description}</p>
                    </div>
                    <span className="shrink-0 text-[11px] font-bold text-muted-foreground">
                      已掌握 {mastered}/{total} · 到期 {due}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div
                      className="h-full rounded-full bg-[var(--brand)]"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {items.map((pattern) => renderPatternCard(pattern))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
        </>
        )}
      </section>
    );
  };

  /* ── 本轮完成页：通过/失败按**不同模式**计数（重试不重复，见顶层 results 的更新口径）── */
  if (mode === 'complete') {
    const upcoming = Object.values(progress)
      .filter((p) => p.status !== 'mastered')
      .sort((a, b) => a.nextReview - b.nextReview)[0];
    const nextDueText = upcoming
      ? formatDate(new Date(upcoming.nextReview))
      : stats.mastered === THINK_PATTERNS.length
        ? '全部模式都已掌握'
        : '暂无到期安排';
    return (
      <Card className="rounded-3xl border-border shadow-sm">
        <CardHeader className="pb-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            Session Complete
          </p>
          <CardTitle className="text-2xl font-black italic tracking-tight">本轮训练完成</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <StatCell label="本轮模式" value={passed + failed} />
            <StatCell label="通过" value={passed} />
            <StatCell label="未通过" value={failed} />
          </div>
          <p className="text-sm text-muted-foreground break-words">下次到期：{nextDueText}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button className="w-full sm:w-auto rounded-full" onClick={() => onPractice(practiceIds)}>
              再练一组（5 个）
            </Button>
            <Button variant="outline" className="w-full sm:w-auto rounded-full" onClick={onBack}>
              返回概览
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 标题 + 状态；主按钮只放在下面的焦点卡里 */}
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
          Pattern Training
        </p>
        <h2 className="text-lg font-black italic tracking-tight text-foreground">模式训练</h2>
        <p className="text-sm font-medium text-muted-foreground mt-1 break-words">
          对比 → 识别 → 迁移 · 按 SM-2 安排下一次
        </p>
        <p className="mt-2 text-xs font-bold text-muted-foreground">
          到期 {stats.due} · 今日已练 {stats.reviewedToday} · 已掌握 {stats.mastered}/{THINK_PATTERNS.length}
        </p>
      </div>

      {resume && resumePattern && (
        <div className="flex items-start justify-between gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
          <button type="button" className="min-w-0 text-left" onClick={onResume}>
            <span className="block text-[10px] font-black uppercase tracking-wider text-amber-700">
              继续上次训练
            </span>
            <span className="mt-0.5 block text-sm font-black text-foreground break-words">
              {resumePattern.name} · {resumeStepLabel(resume)}
            </span>
          </button>
          <button
            type="button"
            className="shrink-0 rounded-full px-2 py-1 text-[11px] font-bold text-muted-foreground hover:text-foreground"
            onClick={onDiscardResume}
          >
            放弃
          </button>
        </div>
      )}

      {/* 唯一焦点：今天先练这一个 */}
      <Card className="rounded-3xl border-border shadow-sm overflow-hidden">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              今日先练
            </span>
            <Badge variant="outline">{heroLayer?.name ?? hero.layer}</Badge>
            <Badge variant="outline" className="border-amber-500/40 text-amber-700">
              {heroReason}
            </Badge>
          </div>
          <div className="min-w-0">
            <h3 className="text-2xl font-black italic tracking-tight text-foreground break-words">
              {hero.name}
            </h3>
            <p className="mt-1 text-sm font-medium text-muted-foreground break-words">
              {hero.oneLiner}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] font-bold text-muted-foreground">
            {heroProgress ? (
              <>
                <span>迁移 {heroProgress.transferPasses}/{heroProgress.transferAttempts}</span>
                {calibrationAttempts > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span>校准 {calibrationHits}/{calibrationAttempts}</span>
                  </>
                )}
                <span aria-hidden>·</span>
                <span>
                  下次 {heroProgress.status === 'mastered' ? '—' : formatDate(new Date(heroProgress.nextReview))}
                </span>
              </>
            ) : (
              <span>还没开始 · 对比 → 识别 → 迁移，一次约 3 分钟</span>
            )}
          </div>
          <Button
            size="lg"
            className="w-full rounded-full"
            disabled={!heroStartable}
            onClick={() => onStart(hero.id)}
          >
            {heroLabel}
          </Button>
          <button
            type="button"
            className="text-xs font-bold text-muted-foreground hover:text-foreground"
            onClick={() => onDetail(hero.id)}
          >
            看看「{hero.name}」的中文默认与反例
          </button>
          {queue.length > 0 && (
            <p className="text-[11px] text-muted-foreground break-words">
              之后接着练：{queue.map((pattern) => pattern.name).join('、')}
            </p>
          )}
        </CardContent>
      </Card>
      {renderPatternLibrary()}

      {/* 次级练习入口都搬去「练习」tab；这里只留一条不抢视线的文字链 */}
      <button
        type="button"
        className="block w-full pt-1 text-center text-xs font-bold text-muted-foreground hover:text-foreground"
        onClick={onOpenExtras}
      >
        其他练习（体检 / 薄弱报告 / 趋势 / 真实任务 / 口头任务 / 自由训练 / 改写快练）→
      </button>
    </div>
  );
}
