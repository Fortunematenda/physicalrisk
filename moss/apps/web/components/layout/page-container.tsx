import { cn } from '@/lib/utils';

type PageContainerProps = {
  children: React.ReactNode;
  className?: string;
};

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto min-w-0 max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8',
        className,
      )}
    >
      {children}
    </div>
  );
}
