'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { API_URL } from '@/lib/api';
import {
  clearLogoutGuard,
  hasSsoSession,
  isSsoEnabled,
  startKeycloakSignIn,
} from '@/lib/sso';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get('next') || params.get('callbackUrl') || '/';
  const next = rawNext.startsWith('http')
    ? (() => {
        try {
          return new URL(rawNext).pathname || '/';
        } catch {
          return '/';
        }
      })()
    : rawNext.startsWith('/')
      ? rawNext
      : '/';
  const oauthError = params.get('error');
  const stale = params.get('stale') === '1';
  const legacyLoginEnabled =
    process.env.NEXT_PUBLIC_ENABLE_LEGACY_LOGIN === 'true' ||
    process.env.ENABLE_LEGACY_LOGIN === 'true';
  const [checkingSso, setCheckingSso] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [correlationId, setCorrelationId] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      clearLogoutGuard();
      if (await hasSsoSession()) {
        window.location.replace(next);
        return;
      }
      // NextAuth GET /api/auth/signin/keycloak (with pages.signIn set) falsely
      // redirects here with error=keycloak — ignore that and start a real POST sign-in.
      const isFalseProviderError = oauthError === 'keycloak';
      if (oauthError && !isFalseProviderError) {
        window.location.replace(`/login?next=${encodeURIComponent(next)}&stale=1`);
        return;
      }
      if (stale) {
        if (!cancelled) {
          setError('The previous sign-in link has expired. Start a fresh SSO sign-in.');
          setCheckingSso(false);
        }
        return;
      }
      if (await isSsoEnabled()) {
        await startKeycloakSignIn(next);
        return;
      }
      if (!cancelled) setCheckingSso(false);
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [next, oauthError, stale]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Login failed');
      localStorage.setItem('gateway_token', payload.accessToken);
      localStorage.setItem('gateway_user', JSON.stringify(payload.user));
      router.push(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSso) {
    return (
      <div className="login-page">
        <p style={{ margin: 'auto' }}>Signing in…</p>
      </div>
    );
  }

  return (
    <div className="login-page">
      <section className="login-brand">
        <div>
          <img
            src="/physical_risk_logo_main.png"
            alt="Physical Risk"
            className="login-hero-logo"
          />
          <h1>Approved knowledge, routed correctly every time.</h1>
          <p>
            The Repository Import Gateway validates approved documents, applies project-specific
            directory rules, maintains versions and indexes, and stores controlled content in the
            Physical Risk VPS repository.
          </p>
        </div>
      </section>
      <section className="login-form-wrap">
        <div className="login-form">
          <img src="/physical_risk_logo_main.png" alt="Physical Risk" className="login-brand-logo" />
          <h2>Sign in</h2>
          <p>Access the Physical Risk Repository Gateway.</p>
          {error && (
            <div className="notice error">
              {error}
              {correlationId ? (
                <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}>
                  Correlation ID: {correlationId}
                </div>
              ) : null}
            </div>
          )}
          {stale && (
            <button
              type="button"
              className="button primary"
              onClick={() => startKeycloakSignIn(next)}
            >
              Retry SSO
            </button>
          )}
          {legacyLoginEnabled ? (
            <form onSubmit={submit}>
              <div className="field">
                <label>Email address</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button className="button primary" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="login-page">
          <p style={{ margin: 'auto' }}>Loading…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
