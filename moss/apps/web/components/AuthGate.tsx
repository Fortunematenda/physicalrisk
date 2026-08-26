'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
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

const AuthReadyContext = createContext(false);

/** Survives AuthGate remounts during client navigations. */
let sessionVerified = false;

export function clearAuthSessionCache() {
  sessionVerified = false;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const parentReady = useContext(AuthReadyContext);
  const [ready, setReady] = useState(() => sessionVerified || parentReady);
  const [message, setMessage] = useState('Loading…');
  const redirectStarted = useRef(false);

  useEffect(() => {
    if (parentReady) {
      setReady(true);
      return;
    }

    let cancelled = false;

    async function check() {
      // Logout sets a one-shot flag; clear it on any fresh app entry or login is blocked forever.
      if (isLoggingOut()) clearLogoutGuard();

      if (path === '/login') {
        if (!cancelled) setReady(true);
        return;
      }

      // Already verified this SPA session — keep children visible (no loading flash).
      if (sessionVerified) {
        if (!cancelled) setReady(true);
        return;
      }

      if (await isSsoEnabled()) {
        if (await hasSsoSession()) {
          await ensureSsoUser();
          sessionVerified = true;
          if (!cancelled) setReady(true);
          return;
        }
      } else if (getToken()) {
        sessionVerified = true;
        if (!cancelled) setReady(true);
        return;
      }

      if (ready || sessionVerified) return;

      if (redirectStarted.current) {
        if (!cancelled) setMessage('Redirecting to sign-in…');
        return;
      }
      redirectStarted.current = true;
      if (!cancelled) setMessage('Redirecting to sign-in…');
      await redirectToLogin(path || '/triage');
    }

    check().catch(() => {
      if (!cancelled && !ready && !sessionVerified) {
        setMessage('Unable to verify session. Retry sign-in from the portal.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [path, ready, parentReady]);

  // Nested AuthGate inside PortalFrame — pass through without loading screen.
  if (parentReady) {
    return <>{children}</>;
  }

  if (!ready) return <div className="loading-screen">{message}</div>;

  return (
    <AuthReadyContext.Provider value={true}>{children}</AuthReadyContext.Provider>
  );
}
