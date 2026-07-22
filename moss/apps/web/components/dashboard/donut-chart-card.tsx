'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { CHART_COLORS } from '@/lib/status';
import { cn } from '@/lib/utils';

export type DonutSegment = {
  name: string;
  value: number;
  color: string;
};

type DonutChartCardProps = {
  data: DonutSegment[];
  innerRadius?: number | string;
  outerRadius?: number | string;
  paddingAngle?: number;
  center?: React.ReactNode;
  className?: string;
  heightClassName?: string;
};

export function DonutChartCard({
  data,
  innerRadius = '62%',
  outerRadius = '88%',
  paddingAngle = 2,
  center,
  className,
  heightClassName = 'h-[250px] sm:h-[300px]',
}: DonutChartCardProps) {
  return (
    <div className={cn('relative min-w-0', heightClassName, className)}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={paddingAngle}
            stroke="none"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              borderColor: CHART_COLORS.grid,
              fontSize: '12px',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {center && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          {center}
        </div>
      )}
    </div>
  );
}
