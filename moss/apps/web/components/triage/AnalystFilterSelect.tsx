'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type AnalystFilterOption = {
  id: string;
  label: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: AnalystFilterOption[];
  canAddNew?: boolean;
  onAddNew?: () => void;
  className?: string;
  'aria-label'?: string;
};

const ALL_VALUE = '__all__';
const UNASSIGNED_VALUE = '__unassigned__';

/**
 * Analyst filter using shared Select primitives, with optional sticky "Add new".
 */
export function AnalystFilterSelect({
  value,
  onChange,
  options,
  canAddNew = false,
  onAddNew,
  className,
  'aria-label': ariaLabel = 'Analyst',
}: Props) {
  const [open, setOpen] = React.useState(false);
  const selectValue = value === '' ? ALL_VALUE : value;

  const label =
    selectValue === ALL_VALUE
      ? 'Analyst'
      : selectValue === UNASSIGNED_VALUE
        ? 'Unassigned'
        : options.find((o) => o.id === selectValue)?.label || 'Analyst';

  return (
    <Select
      open={open}
      onOpenChange={setOpen}
      value={selectValue}
      onValueChange={(next) => onChange(next === ALL_VALUE ? '' : next)}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn('h-10 min-w-[180px] bg-white', className)}
      >
        <SelectValue>
          <span className="truncate">{label}</span>
        </SelectValue>
      </SelectTrigger>

      <SelectContent className="p-0">
        <div className="max-h-64 overflow-y-auto p-1">
          <SelectItem value={ALL_VALUE}>Analyst</SelectItem>
          <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </div>

        {canAddNew && onAddNew ? (
          <div className="sticky bottom-0 border-t border-border bg-muted/40 p-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm font-semibold text-[#c41230] outline-none hover:bg-[#fdecee] focus:bg-[#fdecee]"
              onPointerDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                setOpen(false);
                window.setTimeout(() => onAddNew(), 0);
              }}
            >
              <Plus className="h-4 w-4" />
              Add new
            </button>
          </div>
        ) : null}
      </SelectContent>
    </Select>
  );
}
