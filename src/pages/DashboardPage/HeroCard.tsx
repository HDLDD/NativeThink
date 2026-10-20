import { memo } from 'react';
import { Play } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface HeroCardProps {
  onStartLearning: () => void;
}

function HeroCardInner({ onStartLearning }: HeroCardProps) {
  return (
    <Card className="col-span-12 lg:col-span-7 rounded-[32px] lg:rounded-[48px] border-border shadow-sm overflow-hidden relative">
      <CardContent className="p-6 sm:p-12 min-h-[280px] lg:min-h-[400px] flex items-center relative overflow-hidden">
        {/* 背景装饰大字 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[80px] sm:text-[120px] lg:text-[180px] font-black text-muted/15 lg:text-muted/30 italic tracking-tighter leading-none opacity-50 pointer-events-none select-none">
          THINK
        </div>

        <div className="relative z-10 w-full sm:w-3/5">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-ink-teal px-3 py-1 lg:px-4 lg:py-1.5 rounded-full text-[9px] lg:text-[10px] font-black uppercase tracking-widest mb-4 lg:mb-8">
            Daily Learning
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-5xl font-black text-foreground mb-2 lg:mb-4 leading-[1.1] tracking-tight">
            用母语思维
            <br />
            <span className="text-ink-teal italic">说地道英语</span>
          </h2>
          <p className="text-muted-foreground text-xs lg:text-sm font-medium mb-6 lg:mb-10 max-w-sm leading-relaxed">
            摆脱中式英语，建立像 native speaker 一样的英语思维。每天 30 分钟，让英语成为你的本能。
          </p>
          <Button
            size="lg"
            onClick={onStartLearning}
            className="bg-[var(--brand)] hover:bg-[var(--brand-strong)] text-white px-6 lg:px-8 py-3 lg:py-4 rounded-2xl text-[10px] lg:text-xs font-black uppercase tracking-wider shadow-sm transition-all gap-2"
          >
            <Play className="size-3.5 lg:size-4" />
            开始今日学习
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export const HeroCard = memo(HeroCardInner);
