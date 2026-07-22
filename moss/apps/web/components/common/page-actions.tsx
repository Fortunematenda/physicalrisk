import { cn } from '@/lib/utils';

type PageActionsProps = {
  children: React.ReactNode;
  className?: string;
};

export function PageActions({ children, className }: PageActionsProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
    </div>
  );
}
