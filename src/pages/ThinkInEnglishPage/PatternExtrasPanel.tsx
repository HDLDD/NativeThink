/**
 * 「练习」tab：只放「玩法」，不放进度视图。
 *
 * 之前这里还挂着薄弱报告 / 趋势 / 自由训练三项——它们和「模式训练」的模式库重复：
 * 模式库已按 到期 → 进行中 → 未开始 → 已掌握 排好，每张卡直接「开始」，页头也有
 * 到期 / 今日已练 / 已掌握 三个数。同一份进度不再在两处各说一遍（2026-10-31 她定的）。
 *
 * 2026-10-31 再改：块从三列小格子改成整行展开（她要看的是「里面是什么」，不是四个标题）。
 * 每行 = 编号 / 标题 / 一句做什么 / 能核的补充资料 / 开始。
 * 补充资料只用真数：题数来自 THINK_PATTERN_DIAGNOSTIC.length，到期数来自 delayedQueue，
 * 上次成绩来自 diagnostic，延迟档位来自 7/21/60 天 + slice(0,5)。没有真数的那几项就不写，
 * 不拿推测充数。
 */
import { THINK_PATTERN_DIAGNOSTIC } from '@/data/think-patterns';
import type { IThinkPatternDiagnosticRecord } from '@/lib/think-patterns';

export interface PatternExtrasPanelProps {
  delayedQueue: string[];
  diagnostic: IThinkPatternDiagnosticRecord | null;
  onDelayed: () => void;
  onDiagnostic: () => void;
  onRewrite: () => void;
  onRealTask: () => void;
  onSpeaking: () => void;
}

interface IExtraItem {
  no: string;
  title: string;
  lead: string;
  meta?: string;
  tone?: 'warn';
  onClick: () => void;
}

export function PatternExtrasPanel({
  delayedQueue,
  diagnostic,
  onDelayed,
  onDiagnostic,
  onRewrite,
  onRealTask,
  onSpeaking,
}: PatternExtrasPanelProps) {
  const items: IExtraItem[] = [];

  if (delayedQueue.length > 0) {
    items.push({
      no: '!',
      title: `延迟探测 · ${delayedQueue.length} 个到期`,
      lead: '到期该复测的几个，别再往后拖。',
      meta: '7 / 21 / 60 天三档 · 一次最多测 5 个',
      tone: 'warn',
      onClick: onDelayed,
    });
  }

  items.push(
    {
      no: '01',
      title: '思维体检',
      lead: '一套小题测出你现在最松的那个模式。',
      meta: `共 ${THINK_PATTERN_DIAGNOSTIC.length} 题 · 每题对一个模式 · ${
        diagnostic ? `上次 ${diagnostic.correct}/${diagnostic.total}` : '还没测过'
      }`,
      onClick: onDiagnostic,
    },
    {
      no: '02',
      title: '真实任务',
      lead: '拿一份真实材料练一次，不是题库里的题。',
      onClick: onRealTask,
    },
    {
      no: '03',
      title: '口头任务',
      lead: '对着麦说一段，说完自己听回放、自己评。',
      onClick: onSpeaking,
    },
    {
      no: '04',
      title: '改写快练',
      lead: '把写过的句子改一遍，改完对照看差别。',
      onClick: onRewrite,
    },
  );

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
          Extra Practice
        </p>
        <h2 className="text-lg font-black italic tracking-tight text-foreground">练习</h2>
        <p className="text-sm font-medium text-muted-foreground mt-1 break-words">
          今天该练什么在「模式训练」里；这一页是换着花样练同一批模式。
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <button
            key={item.no}
            type="button"
            onClick={item.onClick}
            className={`group w-full rounded-3xl border px-5 py-5 text-left transition-colors sm:px-7 sm:py-6 ${
              item.tone === 'warn'
                ? 'border-amber-300/70 bg-amber-50/70 hover:border-amber-400 dark:border-amber-500/40 dark:bg-amber-500/10'
                : 'border-border bg-card hover:border-[var(--brand)]/60 hover:bg-accent/40'
            }`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
              <div className="flex min-w-0 flex-1 items-start gap-4 sm:gap-6">
                <span
                  className={`mt-1 shrink-0 text-[11px] font-black tabular-nums tracking-[0.2em] ${
                    item.tone === 'warn' ? 'text-amber-600 dark:text-amber-300' : 'text-muted-foreground/60'
                  }`}
                >
                  {item.no}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-base font-black break-words ${
                      item.tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'
                    }`}
                  >
                    {item.title}
                  </p>
                  <p className="mt-1.5 text-sm font-medium text-muted-foreground break-words">{item.lead}</p>
                  {item.meta && (
                    <p className="mt-2.5 text-[11px] font-bold text-muted-foreground/80 break-words">{item.meta}</p>
                  )}
                </div>
              </div>
              <span
                className={`shrink-0 self-start rounded-full border px-4 py-2 text-xs font-black transition-colors sm:self-center ${
                  item.tone === 'warn'
                    ? 'border-amber-400/70 text-amber-700 group-hover:border-amber-500 dark:text-amber-300'
                    : 'border-border text-foreground group-hover:border-[var(--brand)] group-hover:text-[var(--brand)]'
                }`}
              >
                开始 →
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
