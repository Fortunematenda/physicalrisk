'use client';

import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type DataTableColumnHeaderProps<TData, TValue> = {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
};

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn('font-semibold', className)}>{title}</div>;
  }

  const sorted = column.getIsSorted();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('-ml-3 h-8 gap-1 font-semibold', className)}
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      <span>{title}</span>
      {sorted === 'desc' ? (
        <ArrowDown className="size-3.5" aria-hidden="true" />
      ) : sorted === 'asc' ? (
        <ArrowUp className="size-3.5" aria-hidden="true" />
      ) : (
        <ChevronsUpDown className="size-3.5 opacity-40" aria-hidden="true" />
      )}
    </Button>
  );
}
