import { cn } from '@/lib/utils';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-6 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 break-words">
        <h1 className="text-[1.75rem] font-bold leading-tight text-moss-text">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-moss-muted">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-1.5">{actions}</div>
      )}
    </div>
  );
}
