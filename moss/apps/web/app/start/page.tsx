import { Loader2 } from 'lucide-react';
import { Suspense } from 'react';

import { Card, CardContent } from '@/components/ui/card';

import StartAssessmentClient from './StartClient';

function StartLoadingFallback() {
  return (
    <div className="flex min-h-[320px] items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex items-center justify-center gap-3 py-10 text-sm text-moss-muted">
          <Loader2 className="size-5 animate-spin text-moss-red" aria-hidden="true" />
          Loading intake…
        </CardContent>
      </Card>
    </div>
  );
}

export default function StartPage() {
  return (
    <Suspense fallback={<StartLoadingFallback />}>
      <StartAssessmentClient />
    </Suspense>
  );
}
