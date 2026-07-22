'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CHART_COLORS } from '@/lib/status';
import { cn } from '@/lib/utils';

export type BarChartSeries = {
  dataKey: string;
  color?: string;
  name?: string;
  radius?: number | [number, number, number, number];
};

type BarChartCardProps = {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: BarChartSeries[];
  className?: string;
  heightClassName?: string;
  layout?: 'horizontal' | 'vertical';
};

const CHART_SERIES_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.tertiary,
  CHART_COLORS.quaternary,
  CHART_COLORS.muted,
];

export function BarChartCard({
  data,
  xKey,
  series,
  className,
  heightClassName = 'h-[250px] sm:h-[300px]',
  layout = 'horizontal',
}: BarChartCardProps) {
  return (
    <div className={cn('min-w-0', heightClassName, className)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={layout} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey={layout === 'horizontal' ? xKey : undefined}
            type={layout === 'horizontal' ? 'category' : 'number'}
            tick={{ fill: CHART_COLORS.muted, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: CHART_COLORS.grid }}
          />
          <YAxis
            dataKey={layout === 'vertical' ? xKey : undefined}
            type={layout === 'vertical' ? 'category' : 'number'}
            tick={{ fill: CHART_COLORS.muted, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={layout === 'vertical' ? 80 : 48}
          />
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              borderColor: CHART_COLORS.grid,
              fontSize: '12px',
            }}
          />
          {series.map((item, index) => (
            <Bar
              key={item.dataKey}
              dataKey={item.dataKey}
              name={item.name ?? item.dataKey}
              fill={item.color ?? CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]}
              radius={item.radius ?? [4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
