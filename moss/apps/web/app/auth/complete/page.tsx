'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

import { sanitizeReturnPath } from '@/lib/sso';

function CompleteSignIn() {
  const params = useSearchParams();
  const next = sanitizeReturnPath(params.get('next') || '/dashboard');

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
