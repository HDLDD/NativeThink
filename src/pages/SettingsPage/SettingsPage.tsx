import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import {
  Sun, Moon, ChevronRight, Volume2, Cpu, HelpCircle, ScrollText, ExternalLink, Target, Palette, Info,
} from 'lucide-react';
import { useTheme } from '@/lib/use-theme';
import { UI_THEMES, useUiTheme } from '@/lib/ui-theme';
import { useLearningStats } from '@/lib/use-learning-stats';
import { platformTag } from '@/lib/app-env';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import TTSSettings from '@/components/TTSSettings';
import AISettings from '@/components/AISettings';
import HelpGuide from '@/components/HelpGuide';
import ChangelogDialog from '@/components/ChangelogDialog';

const GOAL_OPTIONS = [10, 20, 30, 45, 60];

function Section({ icon: Icon, title, desc, children }: {
  icon: typeof Sun; title: string; desc?: string; children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-border bg-card p-5 sm:p-6 shadow-sm">
      <div className="flex items-start gap-3 mb-4">
        <span className="mt-0.5 size-9 rounded-2xl bg-muted text-ink-teal flex items-center justify-center shrink-0">
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-black text-foreground">{title}</h2>
          {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** 设置行：本身就是按钮，可直接当各设置面板的 trigger（asChild）。
 *  ⚠️ 必须把 Radix 通过 asChild 注入的 props（onClick / aria-expanded / data-state）透传下去 ——
 *  只接 icon/label/desc 的话，按钮点得动但没有任何面板会打开。 */
function Row({ icon: Icon, label, desc, ...rest }: {
  icon: typeof Sun; label: string; desc: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className="w-full flex items-center gap-3 rounded-2xl border border-border bg-background/60 px-4 py-3 text-left transition-colors hover:bg-muted/60"
    >
      <span className="size-8 rounded-xl bg-muted text-ink-teal flex items-center justify-center shrink-0">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-foreground">{label}</span>
        <span className="block text-[11px] text-muted-foreground mt-0.5">{desc}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </button>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { uiTheme, setUiTheme } = useUiTheme();
  const { stats, setDailyGoal } = useLearningStats();
  const [version, setVersion] = useState('—');

  useEffect(() => {
    setVersion(document.querySelector('meta[name="app-version"]')?.getAttribute('content') || '—');
  }, []);

  return (
    <div className="max-w-3xl mx-auto pb-24">
      <header className="mb-6">
        <h1 className="text-2xl font-black tracking-tight text-foreground">设置</h1>
        <p className="text-sm text-muted-foreground mt-1">外观、学习目标、朗读与 AI、帮助 —— 都收在这里。</p>
      </header>

      <div className="space-y-4">
        <Section icon={Palette} title="外观" desc="主题只改材质与强调色，不动布局；随时可以切回原生青绿。">
          <div className="grid grid-cols-2 gap-2 mb-4">
            {([['light', '亮色', Sun], ['dark', '暗色', Moon]] as const).map(([v, label, Icon]) => (
              <button key={v} type="button" onClick={() => setTheme(v)}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-bold transition-colors',
                  theme === v ? 'border-primary bg-primary/5 text-foreground' : 'border-border bg-background/60 text-muted-foreground hover:bg-muted/60',
                )}>
                <Icon className="size-4" />{label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {UI_THEMES.map((t) => (
              <button key={t.id} type="button" onClick={() => setUiTheme(t.id)}
                className={cn(
                  'rounded-2xl border p-3.5 text-left transition-colors',
                  uiTheme === t.id ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-background/60 hover:bg-muted/50',
                )}>
                <span className="flex gap-1.5">
                  {t.swatch.map((c) => (
                    <span key={c} className="size-4 rounded-full ring-1 ring-black/5" style={{ background: c }} />
                  ))}
                </span>
                <span className="block text-sm font-bold text-foreground mt-2.5">{t.name}</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{t.desc}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section icon={Target} title="学习目标" desc="每天想投入的分钟数，影响首页进度与每日学习的新词量。">
          <div className="grid grid-cols-5 gap-1.5">
            {GOAL_OPTIONS.map((min) => (
              <button key={min} type="button"
                onClick={() => { setDailyGoal(min); toast.success(`每日目标已设为 ${min} 分钟`); }}
                className={cn(
                  'rounded-xl border py-2.5 text-sm font-black tabular-nums transition-colors',
                  stats.dailyGoalMinutes === min ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background/60 text-muted-foreground hover:bg-muted/60',
                )}>
                {min}
              </button>
            ))}
          </div>
        </Section>

        <Section icon={Volume2} title="工具" desc="朗读与 AI 的配置都在这里打开。">
          <div className="space-y-2">
            <TTSSettings trigger={<Row icon={Volume2} label="朗读设置" desc="音色、语速、引擎自检与提示音效" />} />
            <AISettings trigger={<Row icon={Cpu} label="AI 设置" desc="模型与 Key、连接测试" />} />
          </div>
        </Section>

        <Section icon={HelpCircle} title="帮助" desc="不熟悉的功能、版本变化，都在这里。">
          <div className="space-y-2">
            <HelpGuide trigger={<Row icon={HelpCircle} label="使用指南" desc="全部功能与上手路径" />} />
            <ChangelogDialog trigger={<Row icon={ScrollText} label="更新日志" desc="每个版本改了什么" />} />
            <button type="button"
              onClick={() => {
                if (window.confirm('将跳转到开发者B站主页（bilibili），是否继续？')) {
                  window.open('https://b23.tv/nHHPunY', '_blank', 'noopener,noreferrer');
                }
              }}
              className="w-full flex items-center gap-3 rounded-2xl border border-border bg-background/60 px-4 py-3 text-left transition-colors hover:bg-muted/60">
              <span className="size-8 rounded-xl bg-muted text-ink-teal flex items-center justify-center shrink-0">
                <ExternalLink className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-foreground">开发者主页</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">bilibili · 新功能演示</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </button>
          </div>
        </Section>

        <Section icon={Info} title="关于">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">版本</span>
            <span className="font-black tabular-nums text-foreground">{version}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-muted-foreground">运行平台</span>
            <span className="font-bold text-foreground">{platformTag()}</span>
          </div>
        </Section>
      </div>
    </div>
  );
}
