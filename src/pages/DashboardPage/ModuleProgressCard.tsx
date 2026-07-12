import { memo } from 'react';
import { BarChart3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RingProgress } from './RingProgress';
import { MODULES } from './constants';
import type { ILearningStats } from '@/lib/use-learning-stats';

interface ModuleProgressCardProps {
  moduleProgress: ILearningStats['moduleProgress'];
  onViewDetails: () => void;
}

function ModuleProgressCardInner({ moduleProgress, onViewDetails }: ModuleProgressCardProps) {
  return (
    <Card className="rounded-[48px] border-border shadow-sm">
      <CardContent className="p-10">
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
              Learning Progress
            </p>
            <h3 className="text-2xl font-[900] italic text-foreground">各模块学习进度</h3>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="bg-muted hover:bg-muted/80 rounded-2xl text-muted-foreground hover:text-[#00B894]"
              onClick={onViewDetails}
            >
              <BarChart3 className="size-4 mr-2" />
              查看详情
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-8 py-4">
          {MODULES.map((m) => (
            <RingProgress
              key={m.key}
              value={moduleProgress[m.key as keyof typeof moduleProgress]}
              label={m.label}
              icon={m.icon}
              color={m.color}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export const ModuleProgressCard = memo(ModuleProgressCardInner);
