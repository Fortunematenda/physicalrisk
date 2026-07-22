'use client';

import { useSession, signIn } from 'next-auth/react';
import { useEffect, useRef } from 'react';
import { Shield, LogOut, ArrowUpRight, Database } from 'lucide-react';

const MOSS_URL = process.env.NEXT_PUBLIC_MOSS_URL || 'https://moss.physicalrisk.com';
const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL || 'https://repo.physicalrisk.com';

export default function HomePage() {
  const { data: session, status } = useSession();
  const startedSignIn = useRef(false);

  useEffect(() => {
    if (status !== 'unauthenticated' || startedSignIn.current) return;
    startedSignIn.current = true;
    void signIn('keycloak', { callbackUrl: '/auth/complete?next=%2F', redirect: false }).then(
      (result) => {
        if (result?.url) window.location.replace(result.url);
      },
    );
  }, [status]);

  function handleSignOut() {
    window.location.replace('/api/auth/federated-logout');
  }

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#121820]">
        <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[#c41230]/45 blur-3xl pr-glow" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-[#c41230]/20 blur-3xl" />
        <div className="relative text-center pr-rise">
          <img
            src="/physical_risk_logo_main.png"
            alt="Physical Risk"
            className="mx-auto mb-5 max-w-[180px]"
          />
          <p className="mt-2 text-sm text-white/60">Redirecting to secure sign-in…</p>
          <div className="mx-auto mt-6 h-8 w-8 animate-spin rounded-full border-[3px] border-white/20 border-t-[#c41230]" />
        </div>
      </div>
    );
  }

  const realmRoles: string[] = (session as { realmRoles?: string[] }).realmRoles ?? [];
  const canMoss =
    realmRoles.some((role) => role.startsWith('moss_')) || realmRoles.includes('portal_user');
  const canRepo =
    realmRoles.some((role) => role.startsWith('repo_')) || realmRoles.includes('portal_user');

  const apps = [
    canMoss && {
      key: 'moss',
      href: MOSS_URL,
      title: 'MOSS',
      eyebrow: 'Assessments & reporting',
      description:
        'Management Operating Security System — assessments, evidence, risk scoring, and executive reporting.',
      icon: Shield,
      accent: 'from-[#c41230]/25 via-transparent to-transparent',
      iconClass: 'bg-[#c41230] text-white shadow-[#c41230]/40',
      cta: 'Open MOSS',
    },
    canRepo && {
      key: 'repo',
      href: REPO_URL,
      title: 'Enterprise Repository',
      eyebrow: 'Documents & control',
      description:
        'Approved-document gateway — imports, version control, metadata indexing, and project routing.',
      icon: Database,
      accent: 'from-sky-500/20 via-transparent to-transparent',
      iconClass: 'bg-[#1e3a5f] text-white shadow-sky-900/40',
      cta: 'Open Repository',
    },
  ].filter(Boolean) as Array<{
    key: string;
    href: string;
    title: string;
    eyebrow: string;
    description: string;
    icon: typeof Shield;
    accent: string;
    iconClass: string;
    cta: string;
  }>;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#121820] text-[#f7f3ef]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] pr-grid-drift"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 90% 70% at 50% 0%, black, transparent)',
        }}
      />
      <div className="pointer-events-none absolute -left-32 -top-28 h-[28rem] w-[28rem] rounded-full bg-[#c41230]/40 blur-3xl pr-glow" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-[#c41230]/15 blur-3xl" />

      <header className="relative z-10 border-b border-white/10 bg-[#121820]/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 pr-rise">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/physical_risk_logo_main.png"
              alt="Physical Risk"
              className="max-w-[160px]"
            />
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-white">{session?.user?.name}</p>
              <p className="text-xs text-white/50">{session?.user?.email}</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
              title="Sign out of all applications"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-16 pt-12 sm:pt-16">
        <section className="mx-auto mb-10 max-w-2xl text-center pr-rise pr-rise-delay-1">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#f3a3b0]">
            Welcome back
          </p>
          <h1 className="font-display text-[clamp(2.4rem,5vw,3.6rem)] leading-[1.05] tracking-[-0.02em] text-white">
            Physical Risk Platform
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/60">
            Choose an application to continue. Your SSO session is active across the portal, MOSS,
            and the enterprise repository.
          </p>
        </section>

        {apps.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2">
            {apps.map((app, index) => {
              const Icon = app.icon;
              return (
                <a
                  key={app.key}
                  href={app.href}
                  className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-7 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:border-[#c41230]/45 hover:bg-white/[0.07] pr-rise ${
                    index === 0 ? 'pr-rise-delay-2' : 'pr-rise-delay-3'
                  }`}
                >
                  <div
                    className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${app.accent} opacity-80 transition group-hover:opacity-100`}
                  />
                  <div className="relative">
                    <div
                      className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl shadow-lg ${app.iconClass}`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                      {app.eyebrow}
                    </p>
                    <h2 className="mb-3 text-2xl font-semibold tracking-tight text-white">
                      {app.title}
                    </h2>
                    <p className="mb-8 min-h-[3.5rem] text-sm leading-relaxed text-white/55">
                      {app.description}
                    </p>
                    <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-white transition group-hover:gap-2.5">
                      <span className="rounded-full bg-[#c41230] px-3 py-1.5 text-white shadow-md shadow-red-950/30 transition group-hover:bg-[#d41838]">
                        {app.cta}
                      </span>
                      <ArrowUpRight className="h-4 w-4 text-white/70 transition group-hover:text-white" />
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-6 text-sm text-amber-100 pr-rise pr-rise-delay-2">
            Your account is signed in but has no application roles assigned. Ask an administrator to
            grant MOSS or Repository access in Keycloak.
          </div>
        )}

        <footer className="mt-14 flex items-center justify-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white/35 pr-rise pr-rise-delay-3">
          <span>Physical Risk Consultancy</span>
          <span className="h-1 w-1 rounded-full bg-[#c41230]" />
          <span>SSO</span>
        </footer>
      </main>
    </div>
  );
}
