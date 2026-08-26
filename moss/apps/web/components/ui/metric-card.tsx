'use client';

import type { ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Props = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
  /** Translucent style for dark/red hero panels. */
  onDark?: boolean;
  className?: string;
};

/** Compact KPI / score card used on triage & advisory detail views. */
export function MetricCard({
  label,
  value,
  hint,
  accent = false,
  onDark = false,
  className,
}: Props) {
  return (
    <Card
      className={cn(
        'min-w-0 rounded-xl shadow-sm',
        onDark
          ? 'border-white/20 bg-white/10 text-white shadow-none backdrop-blur-[2px]'
          : 'border-slate-200 bg-white',
        accent && !onDark && 'border-t-[3px] border-t-[#c41230]',
        className,
      )}
    >
      <CardContent className="space-y-1 p-4 sm:p-5">
        <p
          className={cn(
            'text-[11px] font-semibold uppercase tracking-wide',
            onDark ? 'text-white/70' : 'text-slate-500',
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            'truncate text-2xl font-bold tracking-tight sm:text-[1.75rem]',
            onDark ? 'text-white' : 'text-slate-900',
          )}
        >
          {value}
        </p>
        {hint ? (
          <p className={cn('text-xs font-medium', onDark ? 'text-white/70' : 'text-slate-400')}>
            {hint}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
