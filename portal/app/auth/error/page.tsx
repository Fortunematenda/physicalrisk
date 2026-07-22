'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

function ErrorContent() {
  const params = useSearchParams();
  const error = params.get('error') || 'Unknown error';

  useEffect(() => {
    window.location.replace('/auth/signin?stale=1');
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-red-100 text-red-600 text-xl font-bold">
          !
        </div>
        <h1 className="mb-2 text-xl font-bold text-slate-900">Returning to sign in…</h1>
        <p className="mb-6 text-sm text-slate-500">
          {error === 'OAuthCallback' && 'There was a problem completing the sign-in process.'}
          {error === 'OAuthSignin' && 'Could not initiate sign-in with the identity provider.'}
          {error === 'SessionRequired' && 'You must be signed in to access this page.'}
          {!['OAuthCallback', 'OAuthSignin', 'SessionRequired'].includes(error) && `Error: ${error}`}
        </p>
        <a
          href="/"
          className="inline-flex rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          Return to Portal
        </a>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>}>
      <ErrorContent />
    </Suspense>
  );
}
