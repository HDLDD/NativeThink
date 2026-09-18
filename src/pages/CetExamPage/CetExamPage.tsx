import { ExternalLink, GraduationCap, Smartphone, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const APP_URL = 'https://cetthink.pages.dev';
/**
 * 安卓包下载地址。APK 已移出 public/ —— 放在那里会让主 APK、桌面版、网页
 * 三份产物各白背 7MB（主 APK 里还会嵌套一个 APK）。
 * 发布到对象存储或 Release 页后把地址填这里；留空则隐藏该按钮
 * —— 宁可不显示，也不给一个点了 404 的按钮。
 */
const APK_URL = '';

/** 四六级独立应用入口 — 不再 iframe 内嵌 */
export default function CetExamPage() {
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
          <GraduationCap className="size-6 text-ink-teal" />
          四六级备考 · CetThink
        </h1>
        <p className="text-sm text-muted-foreground">
          已拆分为独立手机应用：与 NativeThink 同款清澈视觉，专为四六级刷题优化。
        </p>
      </div>

      <Card className="rounded-3xl border-border/60">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="size-11 shrink-0 rounded-2xl bg-gradient-to-br from-[#00B894] to-emerald-500 text-white grid place-items-center">
              <Smartphone className="size-5" />
            </div>
            <div>
              <div className="font-black">手机优先体验</div>
              <p className="text-sm text-muted-foreground">
                底部 Tab · 安全区适配 · 离线词库 · 系统朗读 · 浅色/深色主题
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button className="rounded-2xl" onClick={() => window.open(APP_URL, '_blank', 'noopener,noreferrer')}>
              <ExternalLink className="size-4" />
              打开网页版
            </Button>
            {APK_URL && (
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => window.open(APK_URL, '_blank', 'noopener,noreferrer')}
              >
                <Download className="size-4" />
                下载 Android 包
              </Button>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            已拆为独立应用：安卓包与四六级词库随该应用单独发布，不再打进 NativeThink 安装包。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
