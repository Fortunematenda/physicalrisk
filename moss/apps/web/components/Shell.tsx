'use client';

import { AppShell } from '@/components/layout/app-shell';

/**
 * Backward-compatible Shell wrapper.
 * Always uses the uniform AppHeader (search, notifications, mail, avatar).
 * Do not pass legacy dash2-header-actions via `actions` — use onSearch instead.
 */
export function Shell({
  title,
  subtitle,
  children,
  actions,
  hideEyebrow: _hideEyebrow,
  eyebrow: _eyebrow,
  searchPlaceholder,
  hideSearch,
  onSearch,
  searchValue,
  notificationCount,
  mailCount,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  hideEyebrow?: boolean;
  eyebrow?: string;
  searchPlaceholder?: string;
  hideSearch?: boolean;
  onSearch?: (value: string) => void;
  searchValue?: string;
  notificationCount?: number;
  mailCount?: number;
}) {
  return (
    <AppShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      hideSearch={hideSearch}
      searchPlaceholder={searchPlaceholder}
      onSearch={onSearch}
      searchValue={searchValue}
      notificationCount={notificationCount}
      mailCount={mailCount}
    >
      {children}
    </AppShell>
  );
}
