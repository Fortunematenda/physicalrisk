import { formatZar } from '@/lib/format';
import { cn } from '@/lib/utils';

type CurrencyValueProps = {
  value: number | null | undefined;
  className?: string;
};

export function CurrencyValue({ value, className }: CurrencyValueProps) {
  return (
    <span className={cn('tabular-nums', className)}>
      {formatZar(value)}
    </span>
  );
}
