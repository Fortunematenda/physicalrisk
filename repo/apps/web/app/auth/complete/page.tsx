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

  return <div className="login-page"><p style={{ margin: 'auto' }}>Completing sign-in…</p></div>;
}

export default function CompletePage() {
  return (
    <Suspense fallback={<div className="login-page"><p style={{ margin: 'auto' }}>Completing sign-in…</p></div>}>
      <CompleteSignIn />
    </Suspense>
  );
}
