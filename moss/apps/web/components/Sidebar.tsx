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
import {
  filterNavSections,
  isNavItemActive,
  NAV_SECTIONS,
  sectionHasActiveItem,
  type NavSectionConfig,
} from '../lib/navigation';
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
  const pathname = usePathname() || '';
  const [user, setUser] = useState<StoredUser | null>(null);
  const [badges, setBadges] = useState<NavBadges>({ reviewQueue: 0, failedEmails: 0 });
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({});

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

  useEffect(() => {
    const productIds = new Set(['scl', 'moss', 'somod']);
    const activeProductId =
      sections.find(
        (section) => productIds.has(section.id) && sectionHasActiveItem(pathname, section),
      )?.id ?? null;

    if (!activeProductId) return;

    setManualOpen((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of productIds) {
        const shouldOpen = id === activeProductId;
        if (next[id] !== shouldOpen) {
          next[id] = shouldOpen;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pathname, sections]);

  function isSectionOpen(section: NavSectionConfig): boolean {
    if (!section.collapsible || collapsed) return true;
    if (manualOpen[section.id] !== undefined) return manualOpen[section.id];
    return sectionHasActiveItem(pathname, section);
  }

  function toggleSection(section: NavSectionConfig) {
    const willOpen = !isSectionOpen(section);
    setManualOpen((prev) => {
      const next = { ...prev, [section.id]: willOpen };
      const productIds = ['scl', 'moss', 'somod'] as const;
      if (willOpen && productIds.includes(section.id as (typeof productIds)[number])) {
        for (const id of productIds) {
          if (id !== section.id) next[id] = false;
        }
      }
      return next;
    });
  }

  function renderBadge(itemId: string) {
    if ((itemId === 'review-queue' || itemId === 'scl-review-queue' || itemId === 'scli-review-queue') && badges.reviewQueue > 0) {
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
        <div className={`brand brand-stacked ${collapsed ? 'brand-collapsed' : ''}`} title="Physical Risk">
          <img
            src="/physical_risk_logo_main.png"
            alt="Physical Risk"
            className={`brand-logo${collapsed ? ' brand-logo-collapsed' : ''}`}
          />
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
        {sections.map((section, index) => {
          const prevGroup = index > 0 ? sections[index - 1]?.group : undefined;
          const showGroup = Boolean(section.group && section.group !== prevGroup);
          const open = isSectionOpen(section);
          const isProduct =
            section.id === 'scl' || section.id === 'moss' || section.id === 'somod';
          return (
            <div
              className={`sidebar-section${isProduct ? ' sidebar-section-product' : ''}`}
              key={section.id}
            >
              {!collapsed && showGroup && section.group && (
                <p className="sidebar-section-label sidebar-group-label">{section.group}</p>
              )}
              {!collapsed && section.collapsible ? (
                <button
                  type="button"
                  className="sidebar-section-toggle"
                  aria-expanded={open}
                  onClick={() => toggleSection(section)}
                >
                  <span>{section.label}</span>
                  <IconChevronDown className={`sidebar-section-chevron ${open ? 'open' : ''}`} />
                </button>
              ) : (
                !collapsed && !!section.label && <p className="sidebar-section-label">{section.label}</p>
              )}
              {open && (
                <ul className="sidebar-list">
                  {section.items.map((item) => {
                    const active = isNavItemActive(pathname, item.href);
                    const Icon = item.icon;
                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          className={`sidebar-link ${active ? 'active' : ''}`}
                          title={collapsed ? (section.label ? `${section.label}: ${item.label}` : item.label) : undefined}
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
              )}
            </div>
          );
        })}
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
