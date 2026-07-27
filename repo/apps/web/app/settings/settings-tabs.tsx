'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/settings', label: 'Overview', match: (path: string) => path === '/settings' },
  { href: '/settings/audit', label: 'Logs', match: (path: string) => path.startsWith('/settings/audit') },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <div className="tabs" style={{ marginBottom: 16, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)' }}>
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link key={tab.href} href={tab.href} className={active ? 'active' : ''}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
