'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

import { AppHeader } from '@/components/layout/app-header';
import { AppSidebar, useNavBadges } from '@/components/layout/app-sidebar';
import { MobileSidebar } from '@/components/layout/mobile-sidebar';
import { PageContainer } from '@/components/layout/page-container';
import { useShellChrome } from '@/components/shell-chrome';
import { idleLogout, ssoLogout } from '@/lib/sso';
import { IdleSessionGuard } from '@/components/IdleSessionGuard';

const SIDEBAR_COLLAPSED_KEY = 'moss_sidebar_collapsed';

export type AppShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Optional page controls shown in the header before utilities (not a replacement for the top nav) */
  actions?: React.ReactNode;
  searchPlaceholder?: string;
  hideSearch?: boolean;
  onSearch?: (value: string) => void;
  searchValue?: string;
  notificationCount?: number;
  mailCount?: number;
};

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Persistent shell chrome — used by PortalFrame. */
export function AppShellFrame({
  title,
  subtitle,
  children,
  actions,
  searchPlaceholder = 'Search…',
  hideSearch = false,
  onSearch,
  searchValue,
  notificationCount,
  mailCount,
}: AppShellProps) {
  const badges = useNavBadges();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed, mounted]);

  const logout = useCallback(() => {
    void ssoLogout();
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((value) => !value);
  }, []);

  const resolvedNotifications =
    notificationCount ?? badges.reviewQueue + badges.unreadTriageEmails;
  const resolvedMail = mailCount ?? badges.failedEmails;
  const notificationHref =
    badges.unreadTriageEmails > 0 ? '/triage' : '/assessments/assigned';
  const notificationTitle =
    badges.unreadTriageEmails > 0
      ? `${badges.unreadTriageEmails} unread triage email${badges.unreadTriageEmails === 1 ? '' : 's'}`
      : 'Notifications';

  return (
    <div className="flex min-h-screen bg-moss-page">
      <IdleSessionGuard enabled={mounted} onTimeout={() => { void idleLogout(); }} />
      <AppSidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        onLogout={logout}
      />

      <MobileSidebar
        open={mobileOpen}
        onOpenChange={setMobileOpen}
        onLogout={logout}
      />

      <div className="min-w-0 flex-1">
        <AppHeader
          title={title}
          subtitle={subtitle}
          actions={actions}
          searchPlaceholder={searchPlaceholder}
          hideSearch={hideSearch}
          onSearch={onSearch}
          searchValue={searchValue}
          onMenuClick={() => setMobileOpen(true)}
          onLogout={logout}
          notificationCount={resolvedNotifications}
          mailCount={resolvedMail}
          notificationHref={notificationHref}
          notificationTitle={notificationTitle}
        />
        <main className="min-w-0 overflow-x-hidden">
          <PageContainer>{children}</PageContainer>
        </main>
      </div>
    </div>
  );
}

/**
 * Page-level shell. Inside PortalFrame this only updates header chrome and
 * renders children — AppShellFrame stays mounted (no sidebar blink).
 */
export function AppShell({
  title,
  subtitle,
  children,
  actions,
  searchPlaceholder = 'Search…',
  hideSearch = false,
  onSearch,
  searchValue,
  notificationCount,
  mailCount,
}: AppShellProps) {
  const ctx = useShellChrome();
  const setChrome = ctx?.setChrome;

  useLayoutEffect(() => {
    if (!setChrome) return;
    setChrome({
      title,
      subtitle,
      actions,
      searchPlaceholder,
      hideSearch,
      onSearch,
      searchValue,
      notificationCount,
      mailCount,
    });
  }, [
    setChrome,
    title,
    subtitle,
    actions,
    searchPlaceholder,
    hideSearch,
    onSearch,
    searchValue,
    notificationCount,
    mailCount,
  ]);

  if (ctx) {
    return <>{children}</>;
  }

  return (
    <AppShellFrame
      title={title}
      subtitle={subtitle}
      actions={actions}
      searchPlaceholder={searchPlaceholder}
      hideSearch={hideSearch}
      onSearch={onSearch}
      searchValue={searchValue}
      notificationCount={notificationCount}
      mailCount={mailCount}
    >
      {children}
    </AppShellFrame>
  );
}
