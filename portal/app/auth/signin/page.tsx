'use client';

import { signIn } from 'next-auth/react';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function SignInInner() {
  const params = useSearchParams();
  const oauthError = params.get('error');
  const stale = params.get('stale') === '1';
  const signedOut = params.get('signedOut') === '1';
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (oauthError) {
      window.location.replace('/auth/signin?stale=1');
      return;
    }
    if (stale || signedOut || started) return;
    setStarted(true);
    void signIn('keycloak', {
      callbackUrl: '/auth/complete?next=%2F',
      redirect: false,
    }).then((result) => {
      if (result?.url) window.location.replace(result.url);
    });
  }, [oauthError, signedOut, stale, started]);

  if (oauthError) {
    return null;
  }

  if (stale || signedOut) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#121820] px-4">
        <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[#c41230]/50 blur-3xl" />
        <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#c41230] text-sm font-bold tracking-wide text-white">
            PR
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {signedOut ? 'Signed out' : 'Sign in again'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {signedOut
              ? 'Your Physical Risk SSO session has ended.'
              : 'The previous sign-in link is no longer valid. Start a fresh secure sign-in.'}
          </p>
          <button
            type="button"
            className="mt-6 w-full rounded-xl bg-[#c41230] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-red-900/20 transition hover:brightness-105"
            onClick={() => {
              window.location.replace('/auth/signin');
            }}
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#121820]">
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[#c41230]/45 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-[#c41230]/20 blur-3xl" />
      <div className="relative text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-[#c41230] text-base font-bold tracking-wide text-white shadow-lg shadow-red-900/40">
          PR
        </div>
        <p className="text-lg font-semibold tracking-wide text-white">Physical Risk</p>
        <p className="mt-2 text-sm text-white/60">Redirecting to secure sign-in…</p>
        <div className="mx-auto mt-6 h-8 w-8 animate-spin rounded-full border-[3px] border-white/20 border-t-[#c41230]" />
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#121820] text-sm text-white/60">
          Loading…
        </div>
      }
    >
      <SignInInner />
    </Suspense>
  );
}
