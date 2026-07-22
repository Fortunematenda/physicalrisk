'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, LogIn } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API_BASE } from '@/lib/api';
import { clearLogoutGuard, hasSsoSession, isSsoEnabled, startKeycloakSignIn } from '@/lib/sso';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get('next') || params.get('callbackUrl') || '/dashboard';
  const next = rawNext.startsWith('http')
    ? (() => {
        try {
          return new URL(rawNext).pathname || '/dashboard';
        } catch {
          return '/dashboard';
        }
      })()
    : rawNext.startsWith('/')
      ? rawNext
      : '/dashboard';
  const oauthError = params.get('error');
  const stale = params.get('stale') === '1';
  const legacyLoginEnabled =
    process.env.NEXT_PUBLIC_ENABLE_LEGACY_LOGIN === 'true' ||
    process.env.ENABLE_LEGACY_LOGIN === 'true';
  const [checkingSso, setCheckingSso] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [correlationId, setCorrelationId] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

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
      // Do not auto-retry after a real OAuth failure — that causes redirect loops.
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');

    const nextFieldErrors: { email?: string; password?: string } = {};
    if (!email.trim()) nextFieldErrors.email = 'Email is required.';
    if (!password) nextFieldErrors.password = 'Password is required.';
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json() : null;
      if (!response.ok) throw new Error(data?.message || `Unable to sign in (${response.status}).`);
      if (!data?.accessToken) throw new Error('Unexpected login response from API.');
      localStorage.setItem('moss_token', data.accessToken);
      localStorage.setItem('moss_user', JSON.stringify(data.user));
      router.push(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  if (checkingSso) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#121820]">
        <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[#c41230]/45 blur-3xl" />
        <div className="relative text-center">
          <img
            src="/physical_risk_logo_main.png"
            alt="Physical Risk"
            className="mx-auto mb-5 max-w-[180px]"
          />
          <p className="mt-2 text-sm text-white/60">Signing in to MOSS…</p>
          <div className="mx-auto mt-6 h-8 w-8 animate-spin rounded-full border-[3px] border-white/20 border-t-[#c41230]" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#121820] px-4 py-8">
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[#c41230]/45 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-[#c41230]/20 blur-3xl" />
      <div className="relative w-full max-w-md min-w-0">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/physical_risk_logo_main.png"
            alt="Physical Risk"
            className="mb-3 max-w-[180px]"
          />
          <p className="text-sm text-white/60">MOSS secure access</p>
        </div>

        <Card className="min-w-0 border-white/10 bg-white shadow-2xl">
          <CardHeader className="space-y-1 pb-4">
            <div className="flex items-center gap-2 text-moss-muted">
              <Lock className="size-4 shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-wider">Secure portal</span>
            </div>
            <CardTitle className="text-xl">Sign in to MOSS</CardTitle>
            <CardDescription>
              Client and analyst access to assessments, evidence and reports.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {error}
                    {correlationId ? (
                      <span className="mt-1 block font-mono text-xs opacity-80">
                        Correlation ID: {correlationId}
                      </span>
                    ) : null}
                  </AlertDescription>
                </Alert>
              )}

          {stale && (
                <Button
                  type="button"
                  className="w-full bg-[#c41230] hover:bg-[#a10f28]"
                  onClick={() => startKeycloakSignIn(next)}
                >
                  Retry SSO
                </Button>
              )}

              {legacyLoginEnabled ? (
                <form className="space-y-4" onSubmit={submit} noValidate>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                      }}
                      aria-invalid={Boolean(fieldErrors.email)}
                      aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                      required
                    />
                    {fieldErrors.email && (
                      <p id="login-email-error" className="text-sm text-destructive">
                        {fieldErrors.email}
                      </p>
                    )}
                  </div>

                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) {
                          setFieldErrors((prev) => ({ ...prev, password: undefined }));
                        }
                      }}
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                      required
                    />
                    {fieldErrors.password && (
                      <p id="login-password-error" className="text-sm text-destructive">
                        {fieldErrors.password}
                      </p>
                    )}
                  </div>

                  <Button type="submit" className="w-full bg-[#c41230] hover:bg-[#a10f28]" disabled={loading}>
                    {loading ? (
                      'Signing in…'
                    ) : (
                      <>
                        <LogIn className="size-4" aria-hidden="true" />
                        Sign in
                      </>
                    )}
                  </Button>
                </form>
              ) : null}

              <p className="text-center text-sm text-moss-muted">
                New from the website?{' '}
                <Link href="/start?source=wordpress" className="font-medium text-[#c41230] hover:underline">
                  Start an assessment
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-moss-page text-sm text-moss-muted">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
