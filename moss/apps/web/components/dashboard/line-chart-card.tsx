'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CHART_COLORS } from '@/lib/status';
import { cn } from '@/lib/utils';

export type LineChartSeries = {
  dataKey: string;
  color?: string;
  name?: string;
  strokeWidth?: number;
};

type LineChartCardProps = {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: LineChartSeries[];
  className?: string;
  heightClassName?: string;
};

const CHART_SERIES_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.tertiary,
  CHART_COLORS.quaternary,
  CHART_COLORS.muted,
];

export function LineChartCard({
  data,
  xKey,
  series,
  className,
  heightClassName = 'h-[250px] sm:h-[300px]',
}: LineChartCardProps) {
  return (
    <div className={cn('min-w-0', heightClassName, className)}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: CHART_COLORS.muted, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: CHART_COLORS.grid }}
          />
          <YAxis
            tick={{ fill: CHART_COLORS.muted, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              borderColor: CHART_COLORS.grid,
              fontSize: '12px',
            }}
          />
          {series.map((item, index) => (
            <Line
              key={item.dataKey}
              type="monotone"
              dataKey={item.dataKey}
              name={item.name ?? item.dataKey}
              stroke={item.color ?? CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]}
              strokeWidth={item.strokeWidth ?? 2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
