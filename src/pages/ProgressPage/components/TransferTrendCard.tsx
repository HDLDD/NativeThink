/**
 * 学习记录页 · 思维迁移趋势（近 14 天）。
 *
 * 数据只从 `useThinkPatterns()` 的已清洗 `dailyStats` 来 —— 不再自己读一遍 storage，
 * 也不按 7 天短窗重算：和 /think 页共用同一个 store 与 read-boundary 清洗。
 * 没有迁移记录时给出去 /think 的入口，不画一条全 0 的假折线。
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Route } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useThinkPatterns } from '@/lib/use-think-patterns';
import { buildTransferTrend } from '@/lib/think-patterns';
import { formatDate } from '@/lib/utils';
import { formatTransferTrendLabel, summarizeTransferTrend } from '@/lib/progress-page';

/** 比 /think 页的 7 天窗更长：记录页看的是「这几周有没有在迁移」 */
const TREND_DAYS = 14;

export default function TransferTrendCard() {
  const { loaded, state } = useThinkPatterns();
  const today = formatDate(new Date());
  const { points, summary } = useMemo(() => {
    const rows = buildTransferTrend(state.dailyStats, today, TREND_DAYS);
    return {
      points: rows.map((row) => ({ ...row, label: formatTransferTrendLabel(row.date) })),
      summary: summarizeTransferTrend(rows),
    };
  }, [state.dailyStats, today]);

  return (
    <Card
      className="rounded-[24px] border-border shadow-sm"
      data-transfer-trend
      data-transfer-attempts={summary.attempts}
      data-transfer-passes={summary.passes}
    >
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-12 shrink-0 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 text-ink-teal flex items-center justify-center">
              <Route className="size-5.5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-xl font-[900] italic text-foreground">
                思维迁移趋势
              </CardTitle>
              <CardDescription className="text-sm font-medium mt-1">
                近 {TREND_DAYS} 天：迁移尝试与通过（AI 判定 + 自评）
              </CardDescription>
            </div>
          </div>
          <Link
            to="/think"
            className="shrink-0 self-end text-xs font-black text-ink-teal hover:underline sm:self-start"
            data-transfer-entry="think"
          >
            去模式训练 →
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {!loaded ? (
          <div className="h-[240px] animate-pulse rounded-2xl bg-muted/40" data-transfer-loading />
        ) : summary.attempts === 0 ? (
          <div
            data-chart-empty="transfer"
            className="flex h-[240px] flex-col items-center justify-center gap-2 text-center"
          >
            <Route className="size-9 text-muted-foreground/25" />
            <p className="text-sm font-black text-foreground">还没有模式迁移记录</p>
            <p className="text-xs font-medium text-muted-foreground">
              在思维训练里完成一次迁移判定，这里就会长出趋势。
            </p>
            <Link to="/think" className="mt-1 text-xs font-black text-ink-teal hover:underline">
              去模式训练 →
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2 text-xs font-bold" data-transfer-summary>
              <span className="rounded-full border border-border bg-muted/30 px-3 py-1">
                迁移通过率
                <b className="ml-1 text-ink-teal">{summary.passRate}%</b>
              </span>
              <span className="rounded-full border border-border bg-muted/30 px-3 py-1">
                近 {TREND_DAYS} 天练了 <b className="text-foreground">{summary.activeDays}</b> 天
              </span>
              {summary.calibrationAttempts > 0 && (
                <span className="rounded-full border border-border bg-muted/30 px-3 py-1">
                  校准命中
                  <b className="ml-1 text-foreground">
                    {summary.calibrationHits}/{summary.calibrationAttempts}
                  </b>
                  {summary.calibrationRate !== null && (
                    <span className="ml-1 text-muted-foreground">（{summary.calibrationRate}%）</span>
                  )}
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={14}
                />
                <YAxis
                  tick={{ fontSize: 12, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                  unit="次"
                  allowDecimals={false}
                />
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: 16,
                    border: 'none',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                  formatter={(value: number, name: string) => [`${value} 次`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} iconType="circle" iconSize={8} />
                <Line
                  type="monotone"
                  dataKey="attempts"
                  name="迁移尝试"
                  stroke="#94A3B8"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#94A3B8', stroke: '#fff', strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="passes"
                  name="迁移通过"
                  stroke="var(--brand)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: 'var(--brand)', stroke: '#fff', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}
