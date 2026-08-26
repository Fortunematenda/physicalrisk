'use client';

import { usePathname } from 'next/navigation';

import { AuthGate } from '@/components/AuthGate';
import { AppShellFrame } from '@/components/layout/app-shell';
import { ShellChromeProvider, useShellChrome } from '@/components/shell-chrome';

function isPublicPath(pathname: string): boolean {
  if (pathname === '/login') return true;
  if (pathname === '/start' || pathname.startsWith('/start/')) return true;
  if (pathname === '/request-proposal' || pathname.startsWith('/request-proposal/')) return true;
  if (pathname === '/auth' || pathname.startsWith('/auth/')) return true;
  return false;
}

function PersistentShell({ children }: { children: React.ReactNode }) {
  const ctx = useShellChrome();
  const chrome = ctx?.chrome;

  return (
    <AppShellFrame
      title={chrome?.title || 'Physical Risk'}
      subtitle={chrome?.subtitle}
      actions={chrome?.actions}
      hideSearch={chrome?.hideSearch}
      searchPlaceholder={chrome?.searchPlaceholder}
      onSearch={chrome?.onSearch}
      searchValue={chrome?.searchValue}
      notificationCount={chrome?.notificationCount}
      mailCount={chrome?.mailCount}
    >
      {children}
    </AppShellFrame>
  );
}

/**
 * Keeps AuthGate + AppShell mounted across client navigations so sidebar
 * clicks do not remount the whole chrome (no full-page blink).
 */
export function PortalFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';

  if (isPublicPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <AuthGate>
      <ShellChromeProvider>
        <PersistentShell>{children}</PersistentShell>
      </ShellChromeProvider>
    </AuthGate>
  );
}
