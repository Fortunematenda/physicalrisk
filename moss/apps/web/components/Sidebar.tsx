'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  getStoredUser,
  getUserDisplayName,
  resolveMvpNavRole,
  roleDisplayLabel,
  type StoredUser,
} from '../lib/auth-user';
import { filterNavSections, isNavItemActive, NAV_SECTIONS } from '../lib/navigation';
import { apiFetch } from '../lib/api';
import { IconChevronDown, IconLogOut, IconPanelLeft } from './NavIcons';

type SidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onNavigate: () => void;
  onLogout: () => void;
};

type NavBadges = {
  reviewQueue: number;
  failedEmails: number;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'U';
}

export function Sidebar({
  collapsed,
  mobileOpen,
  onToggleCollapse,
  onNavigate,
  onLogout,
}: SidebarProps) {
  const pathname = usePathname();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [badges, setBadges] = useState<NavBadges>({ reviewQueue: 0, failedEmails: 0 });

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  useEffect(() => {
    const role = resolveMvpNavRole(getStoredUser()?.role || 'CLIENT_EXECUTIVE');
    if (role === 'CLIENT') return;

    Promise.all([
      role === 'ADMIN' || role === 'ANALYST'
        ? apiFetch<{ awaitingReview?: unknown[]; summary?: { totalInQueue?: number } }>('/analyst/queue').catch(() => ({ awaitingReview: [] as unknown[], summary: undefined as { totalInQueue?: number } | undefined }))
        : Promise.resolve({ awaitingReview: [] as unknown[], summary: undefined as { totalInQueue?: number } | undefined }),
      role === 'ADMIN'
        ? apiFetch<Array<{ status: string }>>('/admin/emails').catch(() => [])
        : Promise.resolve([]),
    ]).then(([queue, emails]) => {
      const queueCount = typeof queue.summary?.totalInQueue === 'number'
        ? queue.summary.totalInQueue
        : (Array.isArray(queue.awaitingReview) ? queue.awaitingReview.length : 0);
      setBadges({
        reviewQueue: queueCount,
        failedEmails: Array.isArray(emails) ? emails.filter((e) => e.status === 'FAILED').length : 0,
      });
    });
  }, []);

  const mvpRole = resolveMvpNavRole(user?.role || 'CLIENT_EXECUTIVE');
  const sections = filterNavSections(NAV_SECTIONS, mvpRole);
  const displayName = user ? getUserDisplayName(user) : 'Signed in user';
  const roleLabel = user ? roleDisplayLabel(user.role) : 'User';

  function renderBadge(itemId: string) {
    if (itemId === 'review-queue' && badges.reviewQueue > 0) {
      return <span className="sidebar-badge danger">{badges.reviewQueue}</span>;
    }
    if (itemId === 'emails' && badges.failedEmails > 0) {
      return <span className="sidebar-badge warn">{badges.failedEmails}</span>;
    }
    return null;
  }

  return (
    <aside
      className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'sidebar-mobile-open' : ''}`}
      aria-label="Main navigation"
    >
      <div className="sidebar-top">
        <div className={`brand brand-stacked ${collapsed ? 'brand-collapsed' : ''}`} title="MOSS Physical Risk">
          <img
            src="/physical_risk_logo_main.png"
            alt="Physical Risk"
            className={`brand-logo${collapsed ? ' brand-logo-collapsed' : ''}`}
          />
          {!collapsed && <small className="brand-under">MOSS</small>}
        </div>
        <button
          type="button"
          className={`sidebar-collapse-btn ${collapsed ? 'sidebar-expand-btn' : ''}`}
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <IconPanelLeft />
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="Portal sections">
        {sections.map((section) => (
          <div className="sidebar-section" key={section.id}>
            {!collapsed && <p className="sidebar-section-label">{section.label}</p>}
            <ul className="sidebar-list">
              {section.items.map((item) => {
                const active = isNavItemActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className={`sidebar-link ${active ? 'active' : ''}`}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      onClick={onNavigate}
                    >
                      <span className="sidebar-link-icon" aria-hidden="true">
                        <Icon />
                      </span>
                      {!collapsed && <span className="sidebar-link-label">{item.label}</span>}
                      {!collapsed && renderBadge(item.id)}
                      {collapsed && <span className="sidebar-tooltip">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sidebar-user">
        {!collapsed && (
          <div className="sidebar-user-card">
            <span className="sidebar-avatar" aria-hidden="true">{initials(displayName)}</span>
            <div className="sidebar-user-meta">
              <strong>{displayName}</strong>
              <span>{roleLabel}</span>
            </div>
            <IconChevronDown className="sidebar-user-chevron" />
          </div>
        )}
        <button
          type="button"
          className="sidebar-logout"
          onClick={onLogout}
          title={collapsed ? 'Sign Out' : undefined}
        >
          <IconLogOut />
          {!collapsed && <span>Sign Out</span>}
          {collapsed && <span className="sidebar-tooltip">Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
