/**
 * 模式复习概览：今日行动 / 模式地图 / 建议先练（默认 3 个，可展开全部）/ 本轮完成页。
 *
 * 首屏只留一个主按钮；体检降为一行次级入口，薄弱 Top 3 不再单独占卡，
 * 而是并进“体检建议 → 薄弱 → 到期”的 3 张焦点卡。
 *
 * 全部数据来自 props（`stats` / `weak` / `dueQueue` / `progress` / `diagnostic`），
 * 本组件不读存储、不改进度 —— 点模式卡只展开对比卡，不写任何状态到 store。
 * 日期一律 formatDate（本地日），避免东八区凌晨错天（AGENTS.md 学习统计约定）。
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { THINK_PATTERN_LAYERS, THINK_PATTERNS, type IThinkPattern } from '@/data/think-patterns';
import type { IThinkPatternStats } from '@/lib/use-think-patterns';
import {
  summarizeLayers,
  type IThinkPatternDiagnosticRecord,
  type IThinkPatternProgress,
  type PatternWeakItem,
} from '@/lib/think-patterns';
import { cn, formatDate } from '@/lib/utils';

const LAYER_IDS = THINK_PATTERN_LAYERS.map((layer) => layer.id);

export interface PatternOverviewProps {
  stats: IThinkPatternStats;
  weak: PatternWeakItem[];
  dueQueue: string[];
  progress: Record<string, IThinkPatternProgress>;
  mode: 'overview' | 'review' | 'complete';
  passed: number;
  failed: number;
  diagnostic: IThinkPatternDiagnosticRecord | null;
  onStart: (firstPatternId?: string) => void;
  onDiagnostic: () => void;
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
  progress,
  mode,
  passed,
  failed,
  diagnostic,
  onStart,
  onDiagnostic,
  onBack,
}: PatternOverviewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const now = Date.now();
  const today = formatDate(new Date(now));
  const layerSummaries = summarizeLayers(THINK_PATTERNS, progress, LAYER_IDS, now, today);
  const empty = dueQueue.length === 0;
  const mainLabel = empty
    ? stats.mastered === THINK_PATTERNS.length
      ? `${THINK_PATTERNS.length} 个模式都已掌握`
      : '今天已完成，下次到期后再来'
    : `开始今日复习（${dueQueue.length}）`;

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
      ? `开始今日复习（${heroQueueCount}）`
      : '开始这个模式'
    : mainLabel;

  const renderPatternCard = (pattern: IThinkPattern) => {
    const p = progress[pattern.id];
    const status = statusLabel(p);
    const nextDue = !p ? '未开始' : p.status === 'mastered' ? '—' : formatDate(new Date(p.nextReview));
    const expanded = expandedId === pattern.id;
    return (
      <Card key={pattern.id} className="rounded-3xl border-border shadow-sm overflow-hidden min-w-0">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpandedId((prev) => (prev === pattern.id ? null : pattern.id))}
          className="w-full text-left p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-black text-foreground break-words">{pattern.name}</p>
              <p className="text-xs text-muted-foreground mt-1 break-words">{pattern.oneLiner}</p>
            </div>
            <Badge variant="outline" className={cn('shrink-0', statusTone(p))}>{status}</Badge>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              下次到期：{nextDue}
            </span>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                expanded && 'rotate-180',
              )}
              aria-hidden
            />
          </div>
        </button>

        {expanded && (
          <div className="border-t border-border px-4 py-3 space-y-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                中文思路
              </p>
              <p className="text-sm text-muted-foreground break-words">
                {pattern.contrast.chineseThinking}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                母语者说法
              </p>
              <p className="text-sm font-semibold text-ink-teal break-words">{pattern.contrast.native}</p>
            </div>
            <p className="text-xs text-muted-foreground break-words">{pattern.contrast.note}</p>
            <ul className="space-y-1">
              {pattern.cues.map((cue) => (
                <li key={cue} className="flex gap-2 text-xs text-foreground/75">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--brand)]" aria-hidden />
                  <span className="break-words">{cue}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    );
  };

  const renderLayerMap = () => (
    <Card className="rounded-3xl border-border shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
            模式地图
          </CardTitle>
          <span className="text-[11px] font-bold text-muted-foreground">
            四层 · {THINK_PATTERNS.length} 个模式
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {layerSummaries.map((summary) => {
          const meta = THINK_PATTERN_LAYERS.find((layer) => layer.id === summary.layerId);
          const percent = summary.total > 0 ? Math.round((summary.mastered / summary.total) * 100) : 0;
          return (
            <div key={summary.layerId} className="flex items-center gap-2 min-w-0">
              <span className="w-20 shrink-0 text-xs font-bold text-foreground">
                {meta?.name ?? summary.layerId}
              </span>
              <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden" aria-hidden>
                <div
                  className="h-full rounded-full bg-[var(--brand)]"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-[11px] font-bold text-muted-foreground">
                {summary.mastered}/{summary.total}
              </span>
              <span className="w-14 shrink-0 text-right text-[10px] font-bold text-muted-foreground">
                到期 {summary.due}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );

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
          <CardTitle className="text-2xl font-black italic tracking-tight">本轮复习完成</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <StatCell label="本轮模式" value={passed + failed} />
            <StatCell label="通过" value={passed} />
            <StatCell label="未通过" value={failed} />
          </div>
          <p className="text-sm text-muted-foreground break-words">下次到期：{nextDueText}</p>
          <Button className="w-full sm:w-auto rounded-full" onClick={onBack}>返回概览</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 标题 + 状态；主按钮只放在下面的焦点卡里 */}
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
          Pattern Review
        </p>
        <h2 className="text-2xl font-black italic tracking-tight text-foreground">模式复习</h2>
        <p className="text-sm font-medium text-muted-foreground mt-1 break-words">
          对比 → 识别 → 迁移 · 按 SM-2 安排下一次
        </p>
        <p className="mt-2 text-xs font-bold text-muted-foreground">
          到期 {stats.due} · 今日已练 {stats.reviewedToday} · 已掌握 {stats.mastered}/{THINK_PATTERNS.length}
        </p>
      </div>

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
          {queue.length > 0 && (
            <p className="text-[11px] text-muted-foreground break-words">
              之后接着练：{queue.map((pattern) => pattern.name).join('、')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 次级入口全部收成文字，避免和主按钮抢视线 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-muted-foreground">
        <button type="button" className="hover:text-foreground" onClick={onDiagnostic}>
          思维体检{diagnostic ? ` · 上次 ${diagnostic.correct}/${diagnostic.total}` : ' · 12 题'}
        </button>
        <span aria-hidden>·</span>
        <button type="button" className="hover:text-foreground" onClick={() => setShowMap((prev) => !prev)}>
          {showMap ? '收起模式地图' : '模式地图'}
        </button>
        <span aria-hidden>·</span>
        <button type="button" className="hover:text-foreground" onClick={() => setShowAll((prev) => !prev)}>
          {showAll ? '收起模式库' : `全部 ${THINK_PATTERNS.length} 个模式`}
        </button>
      </div>

      {showMap && renderLayerMap()}

      {showAll && (
        <div className="space-y-5">
          <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
            模式库 · 按四层
          </h3>
          {THINK_PATTERN_LAYERS.map((layer) => {
            const items = THINK_PATTERNS.filter((pattern) => pattern.layer === layer.id);
            if (items.length === 0) return null;
            return (
              <section key={layer.id} className="space-y-2">
                <div className="min-w-0">
                  <h4 className="text-sm font-black text-foreground">{layer.name}</h4>
                  <p className="text-xs text-muted-foreground break-words">{layer.description}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {items.map((pattern) => renderPatternCard(pattern))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
