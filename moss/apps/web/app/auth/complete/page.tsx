'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

function CompleteSignIn() {
  const params = useSearchParams();
  const rawNext = params.get('next') || '/dashboard';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';

  useEffect(() => {
    window.location.replace(next);
  }, [next]);

  return <div className="loading-screen">Completing sign-in…</div>;
}

export default function CompletePage() {
  return (
    <Suspense fallback={<div className="loading-screen">Completing sign-in…</div>}>
      <CompleteSignIn />
    </Suspense>
  );
}
