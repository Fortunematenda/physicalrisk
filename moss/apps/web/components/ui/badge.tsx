import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center whitespace-nowrap rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'text-foreground',
        success:
          'border-transparent bg-moss-success/15 text-moss-success hover:bg-moss-success/25',
        warning:
          'border-transparent bg-moss-warning/15 text-moss-warning hover:bg-moss-warning/25',
        danger:
          'border-transparent bg-moss-danger/15 text-moss-danger hover:bg-moss-danger/25',
        info:
          'border-transparent bg-moss-info/15 text-moss-info hover:bg-moss-info/25',
        purple:
          'border-transparent bg-violet-100 text-violet-700 hover:bg-violet-100/80',
        teal:
          'border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100/80',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
