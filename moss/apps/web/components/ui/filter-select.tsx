'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type FilterSelectOption = {
  value: string;
  label: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  /** Shown when value is empty / placeholder option. */
  placeholder: string;
  /** Sentinel for “all / none selected”. Defaults to "". */
  emptyValue?: string;
  /** Include an “all / placeholder” item. Default true for filters. */
  includeAll?: boolean;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  'aria-label'?: string;
  disabled?: boolean;
};

/**
 * Uniform Radix Select for filters and form dropdowns.
 * Empty selection uses a sentinel so Radix always has a valid item value.
 */
export function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  emptyValue = '',
  includeAll = true,
  className,
  triggerClassName,
  contentClassName,
  'aria-label': ariaLabel,
  disabled,
}: Props) {
  const ALL = '__filter_all__';
  const selectValue = includeAll && value === emptyValue ? ALL : value;

  return (
    <Select
      value={selectValue}
      disabled={disabled}
      onValueChange={(next) => onChange(includeAll && next === ALL ? emptyValue : next)}
    >
      <SelectTrigger
        aria-label={ariaLabel || placeholder}
        className={cn('h-10 min-w-[160px] bg-white', triggerClassName, className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {includeAll ? <SelectItem value={ALL}>{placeholder}</SelectItem> : null}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
