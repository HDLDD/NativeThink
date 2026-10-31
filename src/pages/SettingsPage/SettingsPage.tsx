import { useCallback, useEffect, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import {
  Sun, Moon, ChevronLeft, ChevronRight, Volume2, Cpu, HelpCircle, ScrollText, ExternalLink, Target, Palette, Info,
  Database, Download, Upload, RotateCcw,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '@/lib/use-theme';
import { UI_THEMES, useUiTheme } from '@/lib/ui-theme';
import { useLearningStats } from '@/lib/use-learning-stats';
import { platformTag } from '@/lib/app-env';
import { safeStorage } from '@/lib/safe-storage';
import { useBackupActions } from '@/lib/use-backup-actions';
import { measureLocalStorage, formatBytes, type IStorageUsage } from '@/lib/storage-usage';
import { BackupFileInput } from '@/components/BackupFileInput';
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
    <section className="rounded-[24px] border border-border bg-card p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-foreground">{title}</h2>
          {desc && <p className="mt-0.5 text-[11px] text-muted-foreground">{desc}</p>}
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
      className="w-full flex items-center gap-3 rounded-[14px] border border-border px-4 py-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-foreground">{label}</span>
        <span className="block text-[11px] text-muted-foreground mt-0.5">{desc}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground/60 shrink-0" />
    </button>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { uiTheme, setUiTheme } = useUiTheme();
  const { stats, setDailyGoal } = useLearningStats();
  const [version, setVersion] = useState('—');
  const backup = useBackupActions();
  const [storageUsage, setStorageUsage] = useState<IStorageUsage | null>(null);
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    setVersion(document.querySelector('meta[name="app-version"]')?.getAttribute('content') || '—');
  }, []);

  const refreshStorage = useCallback(() => {
    try {
      setStorageUsage(measureLocalStorage(localStorage, safeStorage.getPrefixedKey('')));
    } catch {
      setStorageUsage(null);
    }
    let alive = true;
    const estimate = typeof navigator !== 'undefined' ? navigator.storage?.estimate?.() : undefined;
    if (estimate) {
      estimate.then((e) => {
        if (!alive) return;
        setStorageEstimate(
          typeof e?.usage === 'number' && typeof e?.quota === 'number'
            ? { usage: e.usage, quota: e.quota }
            : null,
        );
      }).catch(() => { if (alive) setStorageEstimate(null); });
    } else {
      setStorageEstimate(null);
    }
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const cleanup = refreshStorage();
    return cleanup;
  }, [refreshStorage, backup.lastBackupAt, backup.backupBusy]);

  const lastBackupLabel = backup.lastBackupAt
    ? (() => {
        const d = new Date(backup.lastBackupAt);
        return Number.isNaN(d.getTime())
          ? '—'
          : d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      })()
    : '还没有导出过';

  return (
    <div className="max-w-3xl mx-auto pb-24">
      <header className="mb-6">
        {/* 直接打开 /settings（没有来源页）时回首页；从其它页进来则原路返回 */}
        <button
          type="button"
          aria-label="返回"
          title="返回"
          onClick={() => { if (location.key === 'default') navigate('/'); else navigate(-1); }}
          className="-ml-2 mb-2 inline-flex items-center gap-1 rounded-full py-1.5 pl-1.5 pr-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-5" />
          返回
        </button>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Preferences</p>
        <h1 className="mt-1 text-[26px] font-extrabold tracking-tight text-foreground">设置</h1>
        <p className="text-[12px] text-muted-foreground mt-1">外观、学习目标、学习数据、朗读与 AI、帮助 —— 都收在这里。</p>
      </header>

      <div className="space-y-4">
        <Section icon={Palette} title="外观" desc="主题只改材质与强调色，不动布局；随时可以切回原生青绿。">
          <div className="mb-4 flex rounded-full bg-muted p-1">
            {([['light', '亮色', Sun], ['dark', '暗色', Moon]] as const).map(([v, label, Icon]) => (
              <button key={v} type="button" onClick={() => setTheme(v)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-[12px] font-semibold transition-colors',
                  theme === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}>
                <Icon className="size-3.5" />{label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {UI_THEMES.map((t) => (
              <button key={t.id} type="button" onClick={() => setUiTheme(t.id)}
                className={cn(
                  'rounded-[16px] border p-3.5 text-left transition-colors',
                  uiTheme === t.id ? 'border-foreground/70' : 'border-border hover:bg-muted/40',
                )}>
                <span className="flex h-8 overflow-hidden rounded-lg ring-1 ring-black/5">
                  {t.swatch.map((c) => (
                    <span key={c} className="flex-1" style={{ background: c }} />
                  ))}
                </span>
                <span className="mt-2.5 flex items-center gap-1.5">
                  <span className="block text-[13px] font-semibold text-foreground">{t.name}</span>
                  {t.id === 'classic' && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">默认</span>
                  )}
                  {uiTheme === t.id && <span className="ml-auto size-1.5 rounded-full bg-[var(--brand)]" />}
                </span>
                <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">{t.desc}</span>
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
                  'rounded-full border py-2.5 text-[12px] font-bold tabular-nums transition-colors',
                  stats.dailyGoalMinutes === min ? 'border-[var(--ink)] bg-[var(--ink)] text-white' : 'border-border text-muted-foreground hover:bg-muted/50',
                )}>
                {min}
              </button>
            ))}
          </div>
        </Section>

        <Section icon={Database} title="学习数据" desc="导出/恢复备份，查看本地占用；重置学习记录仍在记录页。">
          <div data-settings-data className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-2xl bg-muted/50 p-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">本地数据</p>
              <p className="mt-1 truncate text-[11px] font-black tabular-nums text-foreground">
                {storageUsage ? `${storageUsage.entries} 项 · ${formatBytes(storageUsage.bytes)}` : '统计中…'}
              </p>
            </div>
            <div className="rounded-2xl bg-muted/50 p-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">上次备份</p>
              <p className="mt-1 truncate text-[11px] font-black text-foreground">{lastBackupLabel}</p>
            </div>
            <div className="col-span-2 rounded-2xl bg-muted/50 p-3 sm:col-span-1">
              <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">浏览器存储</p>
              <p className="mt-1 truncate text-[11px] font-black tabular-nums text-foreground">
                {storageEstimate ? `${formatBytes(storageEstimate.usage)} / ${formatBytes(storageEstimate.quota)}` : '—'}
              </p>
            </div>
          </div>
          <p className="mb-3 text-[10px] leading-relaxed text-muted-foreground">
            浏览器存储估算含缓存与 IndexedDB，不等于备份文件大小。
          </p>
          <div className="space-y-2">
            <Row
              icon={Download}
              label="导出备份"
              desc={backup.backupBusy ? '正在导出…' : backup.lastBackupAt ? `上次导出：${lastBackupLabel}` : '导出学习数据、导入书正文与阅读译文'}
              onClick={backup.exportLearningData}
              disabled={backup.backupBusy}
            />
            <Row
              icon={Upload}
              label="从备份恢复"
              desc="选择 JSON 备份文件；覆盖同名数据与同 ID 书籍"
              onClick={backup.openImportPicker}
              disabled={backup.backupBusy}
            />
            <Row
              icon={RotateCcw}
              label="管理学习记录"
              desc="重置统计、拼写、阅读、词汇或全部数据"
              onClick={() => navigate('/progress?reset=1')}
            />
          </div>
          <BackupFileInput inputRef={backup.fileInputRef} onFile={backup.handleImportFile} />
          {backup.backupReport && (
            <p role="status" className="mt-3 text-xs leading-relaxed text-foreground">{backup.backupReport}</p>
          )}
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            备份含学习数据、导入书正文和阅读译文，不含视频精听媒体及字幕；恢复会覆盖同名数据和同 ID 书籍，保留其他本地书。
          </p>
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
              className="w-full flex items-center gap-3 rounded-[14px] border border-border px-4 py-3 text-left transition-colors hover:bg-muted/50">
              <ExternalLink className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-foreground">开发者主页</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">bilibili · 新功能演示</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground/60 shrink-0" />
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
