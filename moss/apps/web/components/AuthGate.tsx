'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import { getToken } from '../lib/api';
import { ensureSsoUser } from '../lib/auth-user';
import {
  clearLogoutGuard,
  hasSsoSession,
  isLoggingOut,
  isSsoEnabled,
  redirectToLogin,
} from '../lib/sso';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('Loading MOSS…');
  const redirectStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // Logout sets a one-shot flag; clear it on any fresh app entry or login is blocked forever.
      if (isLoggingOut()) clearLogoutGuard();

      if (path === '/login') {
        if (!cancelled) setReady(true);
        return;
      }

      if (await isSsoEnabled()) {
        if (await hasSsoSession()) {
          await ensureSsoUser();
          if (!cancelled) setReady(true);
          return;
        }
      } else if (getToken()) {
        if (!cancelled) setReady(true);
        return;
      }

      if (redirectStarted.current) {
        if (!cancelled) setMessage('Redirecting to sign-in…');
        return;
      }
      redirectStarted.current = true;
      if (!cancelled) setMessage('Redirecting to sign-in…');
      await redirectToLogin(path || '/dashboard');
    }

    check().catch(() => {
      if (!cancelled) setMessage('Unable to verify session. Retry sign-in from the portal.');
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!ready) return <div className="loading-screen">{message}</div>;
  return <>{children}</>;
}
