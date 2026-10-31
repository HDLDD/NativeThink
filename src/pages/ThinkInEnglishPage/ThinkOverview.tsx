/**
 * 「首页」—— 这一页是**目录**，不是第八个 tab。
 *
 * 三层结构，一眼就知道先看哪：
 *   ① 最上面一条深色主卡（模式训练）—— 日常就走这一条，这是焦点；
 *   ② 下面六张浅色小卡 —— 各自一个功能一种颜色，淡底 + 实色竖条 + 同色图标；
 *   ③ 最上面那排数字 —— 今天到哪儿了。
 * 颜色在这里是**识别**用的，不是装饰：同一种青 / 赭 / 蓝灰…… 在卡片、返回条、图标上是同一个色。
 */
import { Repeat, Layers, Search, ArrowRight, Languages, RefreshCw, BookOpen } from 'lucide-react';
import { THINK_PATTERNS } from '@/data/think-patterns';
import type { IThinkPatternDiagnosticRecord } from '@/lib/think-patterns';
import { thinkTabLabel, thinkTabTint, thinkTabTone } from './thinkTabTones';

export interface ThinkOverviewProps {
  due: number;
  reviewedToday: number;
  mastered: number;
  extrasCount: number;
  diagnostic: IThinkPatternDiagnosticRecord | null;
  onGo: (tab: string) => void;
}

interface IEntry {
  tab: string;
  desc: string;
  meta?: string;
  icon: typeof Repeat;
}

export function ThinkOverview({
  due,
  reviewedToday,
  mastered,
  extrasCount,
  diagnostic,
  onGo,
}: ThinkOverviewProps) {
  const total = THINK_PATTERNS.length;
  const heroTone = thinkTabTone('patterns');

  const others: IEntry[] = [
    { tab: 'detector', desc: '查一句话有没有中式表达，指出来。', icon: Search },
    { tab: 'translation', desc: '看中文场景，直接用英语描述。', icon: ArrowRight },
    { tab: 'backTranslation', desc: '看英文，还原背后的中文思维。', icon: Languages },
    { tab: 'nativeTranslate', desc: '把翻译腔改回自然说法。', icon: RefreshCw },
    { tab: 'extras', desc: '换着花样练同一批模式。', meta: `${extrasCount} 个玩法`, icon: Layers },
    { tab: 'longTask', desc: '整篇长文或一场对话里练。', icon: BookOpen },
  ];

  const cells = [
    { label: '到期', value: String(due), hint: '该复测的' },
    { label: '今日已练', value: String(reviewedToday), hint: '今天动过的' },
    { label: '已掌握', value: `${mastered}/${total}`, hint: '模式库' },
    {
      label: '上次体检',
      value: diagnostic ? `${diagnostic.correct}/${diagnostic.total}` : '—',
      hint: diagnostic ? '思维体检' : '还没测',
    },
  ];

  return (
    <div className="space-y-4">
      {/* ① 主卡：这一屏最重的一块，也是每天该点的那一个 */}
      <button
        type="button"
        onClick={() => onGo('patterns')}
        style={{
          backgroundImage: `linear-gradient(135deg, ${heroTone} 0%, ${heroTone}D9 100%)`,
          boxShadow: `0 14px 30px -18px ${heroTone}`,
        }}
        className="group relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-3xl px-5 py-4 text-left text-white transition-transform hover:-translate-y-0.5"
      >
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-[0.22em] text-white/55 uppercase">
            今日先练
          </p>
          <p className="mt-1 text-lg leading-tight font-black">模式训练</p>
          <p className="mt-1 text-[12px] leading-snug font-medium text-white/70">
            每天一张，按 SM-2 排下一次。
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <p className="text-2xl leading-none font-black tabular-nums">
              {mastered}/{total}
            </p>
            <p className="mt-1 text-[10px] font-semibold text-white/55">已掌握</p>
          </div>
          <span className="flex size-9 items-center justify-center rounded-full bg-white/15 transition-transform group-hover:translate-x-0.5">
            <ArrowRight className="size-4" aria-hidden />
          </span>
        </div>
      </button>

      {/* ② 六个功能：淡底 + 实色竖条 + 同色图标 */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {others.map((entry) => {
          const Icon = entry.icon;
          const tone = thinkTabTone(entry.tab);
          return (
            <button
              key={entry.tab}
              type="button"
              onClick={() => onGo(entry.tab)}
              style={{
                backgroundColor: thinkTabTint(entry.tab, '0A'),
                borderColor: thinkTabTint(entry.tab, '38'),
              }}
              className="group relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border py-3 pr-3.5 pl-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <span
                aria-hidden
                className="absolute inset-y-3 left-0 w-[3px] rounded-r-full"
                style={{ backgroundColor: tone }}
              />
              <span
                className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: thinkTabTint(entry.tab, '1F'), color: tone }}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] font-black text-foreground">{thinkTabLabel(entry.tab)}</span>
                  {entry.meta && (
                    <span className="text-[10px] font-bold tabular-nums" style={{ color: tone }}>
                      {entry.meta}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {entry.desc}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ③ 数字：今天到哪儿了 */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="rounded-2xl border border-border bg-card px-3.5 py-2.5 shadow-sm"
          >
            <p className="text-[10px] font-black tracking-[0.16em] text-muted-foreground">
              {cell.label}
            </p>
            <p className="mt-0.5 text-xl font-black tabular-nums text-foreground">{cell.value}</p>
            <p className="text-[11px] font-bold text-muted-foreground/80">{cell.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
