'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ErrorStateProps = {
  message?: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({
  message = 'Something went wrong while loading this content.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <Alert variant="destructive" className={cn(className)}>
      <AlertCircle className="size-4" />
      <AlertTitle>Unable to load</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>{message}</span>
        {onRetry && (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="size-4" />
              Try again
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
