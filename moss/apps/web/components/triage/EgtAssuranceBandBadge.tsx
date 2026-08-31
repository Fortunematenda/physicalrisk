import type { EgtAssuranceVisual } from '@moss/shared';
import { cn } from '@/lib/utils';

type Props = {
  label: string;
  visual?: EgtAssuranceVisual | null;
  className?: string;
};

/** Score-band badge using approved EGT assurance colours (panel + border accent). */
export function EgtAssuranceBandBadge({ label, visual, className }: Props) {
  if (!label || !visual) return null;
  const tone = visual.colourName.toLowerCase();
  return (
    <span
      className={cn('egt-assurance-band', `egt-assurance-band--${tone}`, className)}
      title={visual.accessibleLabel}
    >
      {label}
    </span>
  );
}
