/**
 * SSO helpers for Repository.
 *
 * Never GET /api/auth/signin/keycloak when pages.signIn is set — NextAuth treats
 * the provider id as `error`. Always use startKeycloakSignIn() (POST + CSRF).
 *
 * Concurrent signIn() calls overwrite the OAuth state cookie and cause
 * OAuthCallback "state mismatch". Use a single in-flight promise and a logout guard.
 */

import { signIn, signOut } from 'next-auth/react';

export const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://apps.physicalrisk.com';

const LOGOUT_FLAG = 'repo_sso_logging_out';
let signInInFlight: Promise<void> | null = null;

export function isLoggingOut(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(LOGOUT_FLAG) === '1';
  } catch {
    return false;
  }
}

export function clearLogoutGuard() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(LOGOUT_FLAG);
  } catch {
    // ignore
  }
}

export async function isSsoEnabled(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const res = await fetch('/api/auth/providers');
    if (!res.ok) return false;
    const providers = await res.json();
    return Boolean(providers?.keycloak);
  } catch {
    return false;
  }
}

/**
 * Prefer Keycloak access token from the NextAuth session.
 * When SSO is on, never fall back to localStorage gateway_token.
 */
export async function getSsoToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const ssoOn = await isSsoEnabled();
  try {
    const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
    if (res.ok) {
      const session = await res.json();
      if (session?.error === 'RefreshTokenError') {
        if (ssoOn) window.localStorage.removeItem('gateway_token');
        return null;
      }
      if (session?.accessToken) {
        if (ssoOn) window.localStorage.removeItem('gateway_token');
        return session.accessToken as string;
      }
    }
  } catch {
    // ignore
  }

  if (ssoOn) {
    window.localStorage.removeItem('gateway_token');
    return null;
  }

  return window.localStorage.getItem('gateway_token');
}

export async function hasSsoSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
    if (!res.ok) return false;
    const session = await res.json();
    if (session?.error === 'RefreshTokenError') return false;
    if (session?.accessToken) return true;

    const dbg = await fetch('/api/auth/session-debug', { credentials: 'same-origin' });
    if (!dbg.ok) return false;
    const status = await dbg.json();
    return Boolean(status?.hasAccessToken || status?.hasRefreshToken);
  } catch {
    return false;
  }
}

/** Single-flight Keycloak OAuth start — prevents state-cookie races. */
export async function startKeycloakSignIn(callbackUrl: string) {
  if (typeof window === 'undefined') return;
  clearLogoutGuard();
  if (signInInFlight) return signInInFlight;

  signInInFlight = (async () => {
    window.localStorage.removeItem('gateway_token');
    const next = callbackUrl.startsWith('/') && !callbackUrl.startsWith('//') ? callbackUrl : '/';
    const result = await signIn('keycloak', {
      callbackUrl: `/auth/complete?next=${encodeURIComponent(next)}`,
      redirect: false,
    });
    if (result?.url) window.location.replace(result.url);
  })().finally(() => {
    window.setTimeout(() => {
      signInInFlight = null;
    }, 5000);
  });

  return signInInFlight;
}

export async function redirectToLogin(returnPath?: string, force = false) {
  const next = returnPath || window.location.pathname || '/';
  if (isLoggingOut()) return;
  if (!force && (await hasSsoSession())) return;
  if (await isSsoEnabled()) {
    await startKeycloakSignIn(next);
    return;
  }
  window.location.replace(`/login?next=${encodeURIComponent(next)}`);
}

/**
 * Leave this module and return to the portal.
 * Does NOT call Keycloak logout — that would kill SSO for every app.
 * Full SSO end-of-session is portal "Sign out" only.
 */
export async function ssoLogout() {
  try {
    window.sessionStorage.setItem(LOGOUT_FLAG, '1');
  } catch {
    // ignore
  }
  signInInFlight = null;
  window.localStorage.removeItem('gateway_token');
  window.localStorage.removeItem('gateway_user');

  if (await isSsoEnabled()) {
    await signOut({ redirect: false });
    clearLogoutGuard();
    window.location.replace(PORTAL_URL.replace(/\/$/, '') + '/');
    return;
  }
  window.location.replace('/login');
}
