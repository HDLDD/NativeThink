/**
 * 模式复习概览：今日焦点 / 模式库 / 本轮完成页。
 *
 * 模式库是**默认摊开**的分层卡片墙（像词汇深度的模式选择）：按层分组，
 * 到期 → 进行中 → 未开始 → 已掌握排序；每张卡可直接练或进详情。
 * 首屏仍只留一个主按钮；薄弱报告/趋势/跨模块证据按需展开，不抢焦点。
 *
 * 全部数据来自 props（`stats` / `weak` / `dueQueue` / `progress` / `diagnostic`），
 * 本组件不读存储、不改进度。日期一律 formatDate（本地日）。
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  THINK_PATTERN_DIAGNOSTIC,
  THINK_PATTERN_LAYERS,
  THINK_PATTERNS,
  type IThinkPattern,
  type ThinkPatternLayer,
} from '@/data/think-patterns';
import { useCorrectionNotes } from '@/lib/correction-notes';
import { usePageMemory } from '@/lib/use-page-memory';
import { suggestPatternsFromEvidence, summarizeEvidenceSources } from '@/lib/think-evidence';
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
  type IThinkPatternTrendPoint,
  type PatternWeakItem,
} from '@/lib/think-patterns';
import { cn, formatDate } from '@/lib/utils';

const LAYER_IDS = THINK_PATTERN_LAYERS.map((layer) => layer.id);
type PatternLibraryFilter = 'all' | 'due' | 'active' | 'mastered';

export interface PatternOverviewProps {
  stats: IThinkPatternStats;
  weak: PatternWeakItem[];
  dueQueue: string[];
  delayedQueue: string[];
  progress: Record<string, IThinkPatternProgress>;
  mode: 'overview' | 'review' | 'complete';
  passed: number;
  failed: number;
  diagnostic: IThinkPatternDiagnosticRecord | null;
  diagnosticHistory: IThinkPatternDiagnosticRecord[];
  /** 近 7 天迁移/校准趋势 */
  trend: IThinkPatternTrendPoint[];
  /** 上次没写完的三稿会话；有值时显示「继续上次训练」 */
  resume: PatternResumeSnapshot | null;
  onResume: () => void;
  onDiscardResume: () => void;
  onStart: (firstPatternId?: string) => void;
  onDiagnostic: () => void;
  onDelayed: () => void;
  onPractice: (patternIds: string[]) => void;
  onRewrite: () => void;
  onRealTask: () => void;
  onSpeaking: () => void;
  onLongTask: () => void;
  onDetail: (patternId: string) => void;
  onBack: () => void;
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
  delayedQueue,
  progress,
  mode,
  passed,
  failed,
  diagnostic,
  diagnosticHistory,
  trend,
  resume,
  onResume,
  onDiscardResume,
  onStart,
  onDiagnostic,
  onDelayed,
  onPractice,
  onRewrite,
  onRealTask,
  onSpeaking,
  onLongTask,
  onDetail,
  onBack,
}: PatternOverviewProps) {
  const [showPractice, setShowPractice] = useState(false);
  const [showWeak, setShowWeak] = useState(false);
  const [showTrend, setShowTrend] = useState(false);
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
  const setLayerFilter = (layer: 'all' | ThinkPatternLayer) =>
    setLibraryFilter((prev) => ({ ...prev, layer }));
  const setStatusFilter = (status: PatternLibraryFilter) =>
    setLibraryFilter((prev) => ({ ...prev, status }));
  const resetLibraryFilter = () => setLibraryFilter({ layer: 'all', status: 'all' });
  const { notes: correctionNotes } = useCorrectionNotes();
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
  const evidenceSuggestions = suggestPatternsFromEvidence(correctionNotes);
  const evidenceSources = summarizeEvidenceSources(correctionNotes);
  const recentEvidence = [...correctionNotes]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 3);
  const trendAttempts = trend.reduce((sum, point) => sum + point.attempts, 0);
  const trendPasses = trend.reduce((sum, point) => sum + point.passes, 0);
  const trendCalibrationAttempts = trend.reduce((sum, point) => sum + point.calibrationAttempts, 0);
  const trendCalibrationHits = trend.reduce((sum, point) => sum + point.calibrationHits, 0);
  const trendMax = Math.max(1, ...trend.map((point) => point.attempts));
  const diagnosticTrend = diagnosticHistory.slice(0, 3).reverse();
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
    const aiPasses = Math.min(2, Math.max(0, p?.aiTransferPasses ?? 0));
    const transferRate = p && p.transferAttempts > 0
      ? Math.round((p.transferPasses / p.transferAttempts) * 100)
      : null;
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
            {p && (
              <>
                <span aria-hidden>·</span>
                <span>
                  迁移 {p.transferPasses}/{p.transferAttempts}
                  {transferRate !== null ? ` · ${transferRate}%` : ''}
                </span>
                <span aria-hidden>·</span>
                <span>lapses {p.lapses}</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {p ? (
              <span
                className="flex items-center gap-1.5"
                aria-label={`连续通过 ${reps}/4，AI 通过 ${aiPasses}/2`}
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
                  连续 {reps}/4 · AI {aiPasses}/2
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
      { key: 'all', label: '全部状态', count: libraryCounts.all },
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
              {THINK_PATTERNS.length} 个模式按四层摊开；到期优先，点「练」直接开始。
            </p>
          </div>
          <span className="text-[11px] font-bold text-muted-foreground">
            显示 {filteredPatterns.length}/{THINK_PATTERNS.length}
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="按层筛选">
            <button
              type="button"
              aria-pressed={layerFilter === 'all'}
              className={chipClass(layerFilter === 'all')}
              onClick={() => setLayerFilter('all')}
            >
              全部层级 {THINK_PATTERNS.length}
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
        <h2 className="text-2xl font-black italic tracking-tight text-foreground">模式训练</h2>
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

      {/* 次级入口全部收成文字，避免和主按钮抢视线 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-muted-foreground">
        {delayedQueue.length > 0 && (
          <>
            <button type="button" className="py-0.5 text-amber-700 hover:text-amber-800" onClick={onDelayed}>
              延迟探测（{delayedQueue.length}）
            </button>
            <span aria-hidden>·</span>
          </>
        )}
        <button type="button" className="py-0.5 hover:text-foreground" onClick={() => setShowWeak((prev) => !prev)}>
          {showWeak ? '收起薄弱报告' : `薄弱报告（${weak.length}）`}
        </button>
        <span aria-hidden>·</span>
        <button type="button" className="py-0.5 hover:text-foreground" onClick={() => setShowTrend((prev) => !prev)}>
          {showTrend ? '收起趋势' : '趋势'}
        </button>
        <span aria-hidden>·</span>
        <button type="button" className="py-0.5 hover:text-foreground" onClick={onDiagnostic}>
          思维体检{diagnostic ? ` · 上次 ${diagnostic.correct}/${diagnostic.total}` : ` · ${THINK_PATTERN_DIAGNOSTIC.length} 题`}
        </button>
        <span aria-hidden>·</span>
        <button type="button" className="py-0.5 hover:text-foreground" onClick={onRealTask}>
          真实任务
        </button>
        <span aria-hidden>·</span>
        <button type="button" className="py-0.5 hover:text-foreground" onClick={onSpeaking}>
          口头任务
        </button>
        <span aria-hidden>·</span>
        <button type="button" className="py-0.5 hover:text-foreground" onClick={onLongTask}>
          长文 / 对话
        </button>
        <span aria-hidden>·</span>
        <button type="button" className="py-0.5 hover:text-foreground" onClick={() => setShowPractice((prev) => !prev)}>
          {showPractice ? '收起自由训练' : '自由训练'}
        </button>
        <span aria-hidden>·</span>
        <button type="button" className="py-0.5 hover:text-foreground" onClick={onRewrite}>
          改写快练
        </button>
      </div>

      {showTrend && (
        <div className="space-y-2.5 rounded-2xl border border-border bg-muted/20 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-black text-foreground">近 7 天趋势</p>
            <p className="text-[11px] font-bold text-muted-foreground">
              迁移 {trendPasses}/{trendAttempts}
              {trendCalibrationAttempts > 0 ? ` · 校准 ${trendCalibrationHits}/${trendCalibrationAttempts}` : ''}
            </p>
          </div>
          <div className="flex items-end gap-1">
            {trend.map((point) => (
              <div
                key={point.date}
                className="flex min-w-0 flex-1 flex-col items-center gap-1"
                title={`${point.date} · 迁移 ${point.passes}/${point.attempts}`}
              >
                <div className="flex h-14 w-full items-end rounded-t bg-[var(--brand)]/10">
                  <div
                    className="w-full rounded-t bg-[var(--brand)]"
                    style={{ height: `${point.attempts > 0 ? Math.max(8, (point.attempts / trendMax) * 100) : 0}%` }}
                  />
                </div>
                <span className="text-[9px] font-bold text-muted-foreground">{point.date.slice(5)}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground break-words">
            {diagnosticTrend.length > 0
              ? `体检复测：${diagnosticTrend.map((row) => `${row.correct}/${row.total}`).join(' → ')}`
              : '还没有体检复测记录；做两次体检就能看到变化。'}
          </p>
        </div>
      )}

      {showWeak && (
        <div className="space-y-2 rounded-2xl border border-border bg-muted/20 p-3">
          <div className="min-w-0">
            <p className="text-xs font-black text-foreground">薄弱报告</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              按 lapses → 迁移失败率排序，最多 3 个；点开看完整反例与进度。
            </p>
          </div>
          {weak.length === 0 ? (
            <p className="text-xs text-muted-foreground">还没有薄弱记录；练几轮后这里会出现。</p>
          ) : (
            <div className="space-y-1.5">
              {weak.map((row) => {
                const p = row.progress;
                const rate = p.transferAttempts > 0
                  ? Math.round((p.transferPasses / p.transferAttempts) * 100)
                  : null;
                const feedback = p.lastAttempt?.feedback?.trim() ?? '';
                const short = feedback.length > 80 ? `${feedback.slice(0, 80)}…` : feedback;
                return (
                  <button
                    key={row.pattern.id}
                    type="button"
                    onClick={() => onDetail(row.pattern.id)}
                    className="w-full rounded-xl border border-border bg-card p-2.5 text-left hover:border-[var(--brand)]/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-black text-foreground break-words">{row.pattern.name}</span>
                      <span className="shrink-0 text-[10px] font-bold text-muted-foreground">
                        {rate === null ? '—' : `迁移 ${rate}%`}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] font-bold text-muted-foreground">
                      lapses {p.lapses} · 迁移 {p.transferPasses}/{p.transferAttempts}
                    </p>
                    {short && (
                      <p className="mt-1 text-[11px] text-foreground/70 break-words">最近反馈：{short}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-border bg-card p-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                跨模块证据
              </p>
              <p className="text-[10px] font-bold text-muted-foreground">
                纠偏本 {evidenceSources.total} 条 · 写作 {evidenceSources.writing} / 对话 {evidenceSources.conversation} / 检测 {evidenceSources.think}
              </p>
            </div>
            {recentEvidence.length > 0 ? (
              <div className="space-y-1">
                {recentEvidence.map((note) => (
                  <p key={note.id} className="text-[11px] text-foreground/75 break-words">
                    <span className="font-black text-muted-foreground">
                      {note.source === 'writing' ? '写作' : note.source === 'conversation' ? '对话' : '检测'}：
                    </span>
                    {note.wrong} → {note.right}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                写作/对话里出现纠偏后，这里会自动出现候选。
              </p>
            )}
            {evidenceSuggestions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {evidenceSuggestions.map((row) => {
                  const pattern = THINK_PATTERNS.find((candidate) => candidate.id === row.patternId);
                  if (!pattern) return null;
                  return (
                    <button
                      key={row.patternId}
                      type="button"
                      onClick={() => onDetail(row.patternId)}
                      className="rounded-full border border-border bg-muted/30 px-2 py-1 text-[10px] font-bold text-foreground hover:border-[var(--brand)]/50"
                    >
                      {pattern.name} · {row.hits}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">还没有能归到具体模式的证据。</p>
            )}
          </div>
        </div>
      )}

      {showPractice && (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-black text-foreground">自由训练</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                不受到期限制，想练哪个就练哪个。
              </p>
            </div>
            <Button size="sm" className="rounded-full shrink-0" onClick={() => onPractice(practiceIds)}>
              混合训练（5 个）
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            想指定模式？直接在下面模式库点「练」；这里只负责随机混合。
          </p>
        </div>
      )}

      {renderPatternLibrary()}
    </div>
  );
}
