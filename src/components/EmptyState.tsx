/**
 * EmptyState — ripple-styled empty state illustration.
 *
 * The "思维涟漪" motif: a soft icon hub with concentric teal rings radiating
 * outward (animated pulse, honors prefers-reduced-motion via CSS).
 */

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Optional call-to-action rendered below the description */
  action?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

const SIZES = {
  sm: { box: 'size-24', icon: 'size-8', ringGap: 10, title: 'text-sm', desc: 'text-xs max-w-xs' },
  md: { box: 'size-28', icon: 'size-9', ringGap: 14, title: 'text-base', desc: 'text-xs max-w-sm' },
} as const;

export function EmptyState({ icon: Icon, title, description, action, size = 'md', className }: EmptyStateProps) {
  const s = SIZES[size];
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-10 px-4', className)}>
      {/* Ripple hub */}
      <div className={cn('relative flex items-center justify-center mb-5', s.box)}>
        {/* Expanding rings — staggered ripple pulses */}
        <span
          className="ripple-ring"
          style={{ inset: -s.ringGap, animationDelay: '0ms' }}
        />
        <span
          className="ripple-ring"
          style={{ inset: -s.ringGap * 2, animationDelay: '700ms' }}
        />
        <span
          className="ripple-ring"
          style={{ inset: -s.ringGap * 3, animationDelay: '1400ms' }}
        />
        {/* Static soft halo */}
        <span className="absolute inset-[-6px] rounded-full bg-[#00B894]/10" />
        {/* Icon core */}
        <span className={cn(
          'relative z-10 flex items-center justify-center rounded-full',
          'bg-gradient-to-br from-[#00B894] to-emerald-500 text-white',
          'shadow-lg shadow-emerald-200/60 dark:shadow-emerald-900/40',
          s.box,
        )}>
          <Icon className={s.icon} />
        </span>
      </div>

      <h3 className={cn('font-black text-foreground', s.title)}>{title}</h3>
      {description && (
        <p className={cn('mt-1.5 text-muted-foreground leading-relaxed', s.desc)}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
