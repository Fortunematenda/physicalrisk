'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import TopNavigation from './layout/TopNavigation';
import { hasSsoSession, isLoggingOut, isSsoEnabled, clearLogoutGuard, redirectToLogin, ssoLogout } from '@/lib/sso';

const groups = [
  { label: 'Workspace', items: [
    ['Dashboard', '/', '⌂'],
    ['Master Document Index', '/repository/index', '▤'],
    ['Import Queue', '/imports/queue', '≡'],
    ['Import Logs', '/imports/logs', '☷'],
  ]},
  { label: 'Repository', items: [
    ['VPS Repository Explorer', '/repository/explorer', '▣'],
    ['Version Register', '/repository/versions', '↺'],
    ['Relationships', '/repository/relationships', '⌘'],
  ]},
  { label: 'Configuration', items: [
    ['Project Registry', '/configuration/projects', '▦'],
    ['Directory Templates', '/configuration/templates', '▥'],
    ['Repository Sections', '/configuration/sections', '☰'],
    ['Routing Rules', '/configuration/routing', '⇢'],
    ['Source Systems', '/configuration/sources', '◉'],
    ['Document Types', '/configuration/document-types', '▤'],
    ['File Types', '/configuration/file-types', '▧'],
    ['Metadata Fields', '/configuration/metadata', '⌁'],
  ]},
  { label: 'Administration', items: [
    ['Users & Roles', '/admin/users', '♙'],
    ['System Settings', '/settings', '⚙'],
  ]},
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);
  const [sessionUser, setSessionUser] = useState<{ name?: string; email?: string } | null>(null);
  const redirectStarted = useRef(false);

  const storedUser = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('gateway_user');
      if (raw) return JSON.parse(raw) as { id?: string; name?: string; email?: string; role?: string };
    } catch { /* ignore */ }
    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // Logout sets a one-shot flag; clear it on re-entry or login stays blocked.
      if (isLoggingOut()) clearLogoutGuard();

      if (pathname === '/login') {
        if (!cancelled) setReady(true);
        return;
      }

      // SSO first — never treat a stale gateway_token as authenticated when SSO is on.
      if (await hasSsoSession()) {
        try {
          const session = await fetch('/api/auth/session', { credentials: 'same-origin' }).then((r) =>
            r.json(),
          );
          if (!cancelled && session?.user) {
            const name = session.user.name ?? undefined;
            const email = session.user.email ?? undefined;
            const realmRoles: string[] =
              (session as { realmRoles?: string[] }).realmRoles ?? [];
            const role = realmRoles.includes('repo_admin')
              ? 'ADMIN'
              : realmRoles.includes('repo_importer')
                ? 'IMPORTER'
                : realmRoles.includes('repo_reviewer')
                  ? 'REVIEWER'
                  : 'VIEWER';
            setSessionUser({ name, email });
            // Keep gateway_user in sync for import Approved By + greeting (SSO path).
            window.localStorage.setItem(
              'gateway_user',
              JSON.stringify({ name, email, role }),
            );
          }
          window.localStorage.removeItem('gateway_token');
        } catch {
          // ignore
        }
        if (!cancelled) setReady(true);
        return;
      }

      const localToken = localStorage.getItem('gateway_token');
      if (localToken && !(await isSsoEnabled())) {
        // Legacy-only path (SSO disabled)
        if (!cancelled) setReady(true);
        return;
      }

      if (localToken) {
        window.localStorage.removeItem('gateway_token');
      }

      if (redirectStarted.current) return;
      redirectStarted.current = true;
      await redirectToLogin(pathname || '/');
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (pathname === '/login') return <>{children}</>;
  if (!ready) return null;

  const displayUser = storedUser || sessionUser;

  return <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
    <TopNavigation
      organisationName="Physical Risk Consultancy"
      userName={displayUser?.name || "User"}
      userEmail={displayUser?.email || ""}
      unreadNotifications={0}
      onHelpClick={() => {
        router.push("/settings");
      }}
      onNotificationsClick={() => {
        router.push("/imports/logs");
      }}
      onLogout={() => {
        void ssoLogout();
      }}
    />
    <div className="main-area-with-sidebar">
      <aside className="sidebar">
        <nav>
          {groups.map((group) => <div className="nav-group" key={group.label}>
            <span className="nav-label">{group.label}</span>
            {group.items.map(([label, href, icon]) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return <Link key={href} href={href} className={active ? 'active' : ''}><b>{icon}</b><span>{label}</span></Link>;
            })}
          </div>)}
        </nav>
        <button className="collapse-button" onClick={() => setCollapsed((value) => !value)}>{collapsed ? '›' : '‹'}<span>Collapse</span></button>
      </aside>
      <main>{children}</main>
    </div>
  </div>;
}
