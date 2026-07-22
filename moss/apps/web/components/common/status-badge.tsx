import { Badge } from '@/components/ui/badge';
import { resolveStatus, type StatusTone } from '@/lib/status';
import { cn } from '@/lib/utils';

const TONE_VARIANT: Record<
  StatusTone,
  'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'outline' | 'purple' | 'teal'
> = {
  neutral: 'secondary',
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  purple: 'purple',
  teal: 'teal',
};

type StatusBadgeProps = {
  status: string;
  className?: string;
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const resolved = resolveStatus(status);

  return (
    <Badge
      variant={TONE_VARIANT[resolved.tone]}
      className={cn('rounded-full px-2.5 py-0.5 font-semibold', className)}
    >
      {resolved.label}
    </Badge>
  );
}
