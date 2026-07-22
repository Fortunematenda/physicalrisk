import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type LoadingSkeletonProps = {
  variant?: 'cards' | 'table-rows';
  count?: number;
  className?: string;
};

export function LoadingSkeleton({
  variant = 'cards',
  count = 4,
  className,
}: LoadingSkeletonProps) {
  if (variant === 'table-rows') {
    return (
      <div className={cn('space-y-2', className)}>
        {Array.from({ length: count }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4',
        className,
      )}
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex min-h-[130px] flex-col gap-3 rounded-xl border bg-white p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-20" />
        </div>
      ))}
    </div>
  );
}
