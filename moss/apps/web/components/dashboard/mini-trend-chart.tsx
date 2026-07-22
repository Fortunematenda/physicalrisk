'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';

import { CHART_COLORS } from '@/lib/status';
import { cn } from '@/lib/utils';

type MiniTrendChartProps = {
  data: number[];
  color?: string;
  className?: string;
  height?: number;
};

export function MiniTrendChart({
  data,
  color = CHART_COLORS.primary,
  className,
  height = 36,
}: MiniTrendChartProps) {
  if (data.length < 2) return null;

  const chartData = data.map((value, index) => ({ index, value }));
  const gradientId = `mini-trend-${color.replace('#', '')}`;

  return (
    <div className={cn('min-w-0 w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              borderColor: CHART_COLORS.grid,
              fontSize: '12px',
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={`url(#${gradientId})`}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
