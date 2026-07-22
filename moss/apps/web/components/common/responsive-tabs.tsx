'use client';

import * as React from 'react';

import { TabsList } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type ResponsiveTabsListProps = React.ComponentPropsWithoutRef<typeof TabsList>;

export const ResponsiveTabsList = React.forwardRef<
  React.ElementRef<typeof TabsList>,
  ResponsiveTabsListProps
>(({ className, ...props }, ref) => (
  <div className="overflow-x-auto pb-1">
    <TabsList
      ref={ref}
      className={cn('inline-flex w-max min-w-full sm:min-w-0', className)}
      {...props}
    />
  </div>
));
ResponsiveTabsList.displayName = 'ResponsiveTabsList';
