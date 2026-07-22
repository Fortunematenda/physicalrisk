'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  Calculator,
  Cable,
  ClipboardList,
  FileText,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  PanelLeft,
  ScrollText,
  Settings,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ensureSsoUser,
  getStoredUser,
  getUserDisplayName,
  resolveMvpNavRole,
  roleDisplayLabel,
  type StoredUser,
} from '@/lib/auth-user';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  filterNavSections,
  isNavItemActive,
  NAV_SECTIONS,
  type NavSectionConfig,
} from '@/lib/navigation';
import { useEffect, useState } from 'react';

export const NAV_ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  organisations: Building2,
  assessments: ClipboardList,
  'review-queue': ListChecks,
  reports: FileText,
  methodology: SlidersHorizontal,
  assumptions: Calculator,
  emails: Mail,
  espocrm: Cable,
  'audit-logs': ScrollText,
  settings: Settings,
};

export type NavBadges = {
  reviewQueue: number;
  failedEmails: number;
};

export function useNavBadges(): NavBadges {
  const [badges, setBadges] = useState<NavBadges>({
    reviewQueue: 0,
    failedEmails: 0,
  });

  useEffect(() => {
    const role = resolveMvpNavRole(getStoredUser()?.role || 'CLIENT_EXECUTIVE');
    if (role === 'CLIENT') return;

    Promise.all([
      role === 'ADMIN' || role === 'ANALYST'
        ? apiFetch<{
            awaitingReview?: unknown[];
            summary?: { totalInQueue?: number };
          }>('/analyst/queue').catch(() => ({
            awaitingReview: [] as unknown[],
            summary: undefined as { totalInQueue?: number } | undefined,
          }))
        : Promise.resolve({
            awaitingReview: [] as unknown[],
            summary: undefined as { totalInQueue?: number } | undefined,
          }),
      role === 'ADMIN'
        ? apiFetch<Array<{ status: string }>>('/admin/emails').catch(() => [])
        : Promise.resolve([]),
    ]).then(([queue, emails]) => {
      const queueCount =
        typeof queue.summary?.totalInQueue === 'number'
          ? queue.summary.totalInQueue
          : Array.isArray(queue.awaitingReview)
            ? queue.awaitingReview.length
            : 0;

      setBadges({
        reviewQueue: queueCount,
        failedEmails: Array.isArray(emails)
          ? emails.filter((e) => e.status === 'FAILED').length
          : 0,
      });
    });
  }, []);

  return badges;
}

export function useSidebarUser(): StoredUser | null {
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = (await ensureSsoUser()) || getStoredUser();
      if (!cancelled) setUser(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return user;
}

export function userInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'U'
  );
}

export function useFilteredNavSections(): NavSectionConfig[] {
  const user = useSidebarUser();
  const mvpRole = resolveMvpNavRole(user?.role || 'CLIENT_EXECUTIVE');
  return filterNavSections(NAV_SECTIONS, mvpRole);
}

function renderNavBadge(itemId: string, badges: NavBadges) {
  if (itemId === 'review-queue' && badges.reviewQueue > 0) {
    return (
      <Badge variant="danger" className="ml-auto shrink-0">
        {badges.reviewQueue}
      </Badge>
    );
  }
  if (itemId === 'emails' && badges.failedEmails > 0) {
    return (
      <Badge variant="warning" className="ml-auto shrink-0">
        {badges.failedEmails}
      </Badge>
    );
  }
  return null;
}

type SidebarNavListProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
  className?: string;
};

export function SidebarNavList({
  collapsed = false,
  onNavigate,
  className,
}: SidebarNavListProps) {
  const pathname = usePathname();
  const sections = useFilteredNavSections();
  const badges = useNavBadges();

  return (
    <TooltipProvider delayDuration={0}>
      <nav className={cn('flex-1 overflow-y-auto', className)} aria-label="Portal sections">
        {sections.map((section) => (
          <div key={section.id} className="mb-4">
            {!collapsed && (
              <p className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-white/40">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isNavItemActive(pathname, item.href);
                const Icon = NAV_ICON_MAP[item.id] ?? LayoutDashboard;
                const link = (
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={onNavigate}
                    className={cn(
                      'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-[#d30f2f] text-white'
                        : 'text-white/70 hover:bg-white/5 hover:text-white',
                      collapsed && 'justify-center px-2',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {!collapsed && (
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    )}
                    {!collapsed && renderNavBadge(item.id, badges)}
                  </Link>
                );

                if (collapsed) {
                  return (
                    <li key={item.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right" className="bg-[#111318] text-white">
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    </li>
                  );
                }

                return <li key={item.id}>{link}</li>;
              })}
            </ul>
          </div>
        ))}
      </nav>
    </TooltipProvider>
  );
}

type SidebarBrandProps = {
  collapsed?: boolean;
};

export function SidebarBrand({ collapsed = false }: SidebarBrandProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col items-start gap-1',
        collapsed && 'items-center',
      )}
      title="MOSS Physical Risk"
    >
      <img
        src="/physical_risk_logo_main.png"
        alt="Physical Risk"
        className={cn('brand-logo', collapsed && 'brand-logo-collapsed')}
      />
      {!collapsed && (
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
          MOSS
        </p>
      )}
    </div>
  );
}

type SidebarUserFooterProps = {
  collapsed?: boolean;
  onLogout: () => void;
};

export function SidebarUserFooter({ collapsed = false, onLogout }: SidebarUserFooterProps) {
  const user = useSidebarUser();
  const displayName = user ? getUserDisplayName(user) : 'Signed in user';
  const roleLabel = user ? roleDisplayLabel(user.role) : 'User';

  const logoutButton = (
    <Button
      type="button"
      variant="ghost"
      onClick={onLogout}
      className={cn(
        'w-full justify-start gap-2 text-white/70 hover:bg-white/5 hover:text-white',
        collapsed && 'justify-center px-2',
      )}
    >
      <LogOut className="size-4 shrink-0" />
      {!collapsed && <span>Sign Out</span>}
    </Button>
  );

  return (
    <TooltipProvider delayDuration={0}>
      <div className="mt-auto border-t border-white/10 pt-3">
        {!collapsed && (
          <div className="mb-2 flex items-center gap-3 rounded-md px-2 py-2">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white"
              aria-hidden="true"
            >
              {userInitials(displayName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{displayName}</p>
              <p className="truncate text-xs text-white/50">{roleLabel}</p>
            </div>
          </div>
        )}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{logoutButton}</TooltipTrigger>
            <TooltipContent side="right" className="bg-[#111318] text-white">
              Sign Out
            </TooltipContent>
          </Tooltip>
        ) : (
          logoutButton
        )}
      </div>
    </TooltipProvider>
  );
}

type AppSidebarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
  onLogout: () => void;
  className?: string;
};

export function AppSidebar({
  collapsed,
  onToggleCollapse,
  onNavigate,
  onLogout,
  className,
}: AppSidebarProps) {
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col bg-[#111318] text-white md:flex',
        collapsed ? 'w-[72px]' : 'w-[248px]',
        className,
      )}
      aria-label="Main navigation"
    >
      <div
        className={cn(
          'flex items-center border-b border-white/10 px-3 py-4',
          collapsed ? 'flex-col gap-3' : 'justify-between gap-2',
        )}
      >
        <SidebarBrand collapsed={collapsed} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="shrink-0 text-white/70 hover:bg-white/5 hover:text-white"
        >
          <PanelLeft className="size-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-2 py-3">
        <SidebarNavList collapsed={collapsed} onNavigate={onNavigate} />
        <SidebarUserFooter collapsed={collapsed} onLogout={onLogout} />
      </div>
    </aside>
  );
}
