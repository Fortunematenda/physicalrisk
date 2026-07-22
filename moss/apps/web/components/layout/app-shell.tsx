'use client';

import { useCallback, useEffect, useState } from 'react';

import { AppHeader } from '@/components/layout/app-header';
import { AppSidebar, useNavBadges } from '@/components/layout/app-sidebar';
import { MobileSidebar } from '@/components/layout/mobile-sidebar';
import { PageContainer } from '@/components/layout/page-container';
import { ssoLogout } from '@/lib/sso';

const SIDEBAR_COLLAPSED_KEY = 'moss_sidebar_collapsed';

type AppShellProps = {
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
  const badges = useNavBadges();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored === 'true') setCollapsed(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed, mounted]);

  const logout = useCallback(() => {
    void ssoLogout();
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((value) => !value);
  }, []);

  const resolvedNotifications =
    notificationCount ?? badges.reviewQueue;
  const resolvedMail = mailCount ?? badges.failedEmails;

  return (
    <div className="flex min-h-screen bg-moss-page">
      <AppSidebar
        collapsed={mounted && collapsed}
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
        />
        <main className="min-w-0 overflow-x-hidden">
          <PageContainer>{children}</PageContainer>
        </main>
      </div>
    </div>
  );
}
