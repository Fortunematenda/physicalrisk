'use client';

import type { LucideIcon } from 'lucide-react';
import { ArrowDown, ArrowUp } from 'lucide-react';

import { ErrorState } from '@/components/common/error-state';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type StatTone = 'red' | 'blue' | 'amber' | 'violet' | 'green' | 'teal' | 'slate';

type TrendDirection = 'up' | 'down' | 'neutral';

type StatCardProps = {
  icon: LucideIcon;
  title: string;
  value: React.ReactNode;
  /** Absolute percent change, e.g. 12 for "12%" */
  trendPercent?: number | null;
  /** Comparison label after the %, e.g. "vs Apr 2025" */
  trendCompareLabel?: string;
  /** Muted subtitle when no percent trend (e.g. "Portfolio volume") */
  description?: string;
  trendDirection?: TrendDirection;
  /** Override arrow/percent colour (e.g. awaiting queue growing = danger) */
  trendTone?: TrendDirection | 'warning';
  tone?: StatTone;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  className?: string;
};

const TONE_STYLES: Record<StatTone, { wrap: string; icon: string }> = {
  red: { wrap: 'bg-[#fdecee]', icon: 'text-[#c41230]' },
  blue: { wrap: 'bg-[#eff6ff]', icon: 'text-[#2563eb]' },
  amber: { wrap: 'bg-[#fff7ed]', icon: 'text-[#d97706]' },
  violet: { wrap: 'bg-[#f5f3ff]', icon: 'text-[#7c3aed]' },
  green: { wrap: 'bg-[#ecfdf5]', icon: 'text-[#059669]' },
  teal: { wrap: 'bg-[#f0fdfa]', icon: 'text-[#0f766e]' },
  slate: { wrap: 'bg-[#f1f5f9]', icon: 'text-[#475569]' },
};

const TREND_COLOR: Record<TrendDirection | 'warning', string> = {
  up: 'text-[#16a34a]',
  down: 'text-[#dc2626]',
  neutral: 'text-moss-muted',
  warning: 'text-[#d97706]',
};

export function StatCard({
  icon: Icon,
  title,
  value,
  trendPercent,
  trendCompareLabel,
  description,
  trendDirection = 'neutral',
  trendTone,
  tone = 'red',
  loading = false,
  error,
  onRetry,
  className,
}: StatCardProps) {
  if (error) {
    return (
      <Card className={cn('h-full min-h-[108px] min-w-0 rounded-xl border-slate-200 shadow-sm', className)}>
        <CardContent className="flex h-full min-h-[108px] items-center p-4">
          <ErrorState message={error} onRetry={onRetry} className="w-full" />
        </CardContent>
      </Card>
    );
  }

  const toneStyle = TONE_STYLES[tone];
  const showTrend = trendPercent != null && !Number.isNaN(trendPercent);
  const arrowDir =
    trendDirection === 'up' || trendDirection === 'down'
      ? trendDirection
      : trendPercent != null && trendPercent > 0
        ? 'up'
        : trendPercent != null && trendPercent < 0
          ? 'down'
          : 'neutral';
  const colorKey = trendTone || arrowDir;
  const compactValue = typeof value === 'string' && value.length > 12;

  return (
    <Card className={cn('h-full min-h-[108px] min-w-0 rounded-xl border-slate-200 bg-white shadow-sm', className)}>
      <CardContent className="flex h-full min-h-[108px] items-center gap-3.5 p-4 sm:p-5">
        <div
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-xl',
            toneStyle.wrap,
            toneStyle.icon,
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-slate-500">{title}</p>

          {loading ? (
            <Skeleton className="mt-1 h-7 w-16" />
          ) : (
            <p
              className={cn(
                'mt-0.5 font-bold tracking-tight text-slate-900',
                compactValue
                  ? 'text-base leading-snug'
                  : 'truncate text-[1.75rem] leading-none',
              )}
            >
              {value}
            </p>
          )}

          {loading ? (
            <Skeleton className="mt-2.5 h-3.5 w-28" />
          ) : showTrend ? (
            <p className="mt-2.5 flex min-w-0 flex-wrap items-center gap-1 text-xs font-semibold">
              <span className={cn('inline-flex items-center gap-0.5', TREND_COLOR[colorKey])}>
                {arrowDir === 'up' && <ArrowUp className="size-3.5 shrink-0" aria-hidden="true" />}
                {arrowDir === 'down' && <ArrowDown className="size-3.5 shrink-0" aria-hidden="true" />}
                <span>{Math.abs(Math.round(trendPercent!))}%</span>
              </span>
              {trendCompareLabel && (
                <span className="font-medium text-slate-400">{trendCompareLabel}</span>
              )}
            </p>
          ) : description ? (
            <p
              className={cn(
                'mt-2.5 truncate text-xs font-medium',
                trendTone === 'down' ? 'text-[#dc2626]' : 'text-slate-400',
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
