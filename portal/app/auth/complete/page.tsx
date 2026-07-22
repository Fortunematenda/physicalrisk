'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

function CompleteSignIn() {
  const params = useSearchParams();
  const rawNext = params.get('next') || '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  useEffect(() => {
    window.location.replace(next);
  }, [next]);

  return <div className="flex min-h-screen items-center justify-center">Completing sign-in…</div>;
}

export default function CompletePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Completing sign-in…</div>}>
      <CompleteSignIn />
    </Suspense>
  );
}
