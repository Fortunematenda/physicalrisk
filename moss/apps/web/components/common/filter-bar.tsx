import { cn } from '@/lib/utils';

type FilterBarProps = {
  children: React.ReactNode;
  clearAction?: React.ReactNode;
  className?: string;
};

export function FilterBar({ children, clearAction, className }: FilterBarProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {children}
      </div>
      {clearAction && (
        <div className="flex justify-end">{clearAction}</div>
      )}
    </div>
  );
}
