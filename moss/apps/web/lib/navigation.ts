import type { NavIconComponent } from '../components/NavIcons';
import {
  IconBuilding2,
  IconCable,
  IconCalculator,
  IconClipboardList,
  IconFileText,
  IconHistory,
  IconLayoutDashboard,
  IconListChecks,
  IconMail,
  IconSettings,
  IconSlidersHorizontal,
} from '../components/NavIcons';
import type { MvpNavRole } from './auth-user';

export type NavBadge =
  | { type: 'count'; value: number; tone?: 'danger' | 'warn' | 'info' }
  | { type: 'status'; value: string; tone?: 'ok' | 'warn' | 'danger' };

export type NavItemConfig = {
  id: string;
  label: string;
  href: string;
  icon: NavIconComponent;
  roles: MvpNavRole[];
};

export type NavSectionConfig = {
  id: string;
  label: string;
  items: NavItemConfig[];
};

/** Central sidebar navigation — labels, routes, icons and role visibility. */
export const NAV_SECTIONS: NavSectionConfig[] = [
  {
    id: 'main',
    label: 'MAIN',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/dashboard',
        icon: IconLayoutDashboard,
        roles: ['ADMIN', 'ANALYST', 'CLIENT'],
      },
    ],
  },
  {
    id: 'assessments',
    label: 'ASSESSMENTS',
    items: [
      {
        id: 'organisations',
        label: 'Organisations',
        href: '/organisations',
        icon: IconBuilding2,
        roles: ['ADMIN', 'ANALYST'],
      },
      {
        id: 'assessments',
        label: 'Assessments',
        href: '/assessments',
        icon: IconClipboardList,
        roles: ['ADMIN', 'ANALYST', 'CLIENT'],
      },
      {
        id: 'review-queue',
        label: 'Review Queue',
        href: '/assessments/assigned',
        icon: IconListChecks,
        roles: ['ADMIN', 'ANALYST'],
      },
      {
        id: 'reports',
        label: 'Reports',
        href: '/reports',
        icon: IconFileText,
        roles: ['ADMIN', 'ANALYST', 'CLIENT'],
      },
    ],
  },
  {
    id: 'methodology',
    label: 'METHODOLOGY',
    items: [
      {
        id: 'methodology',
        label: 'Questionnaire & Calibration',
        href: '/admin/methodology',
        icon: IconSlidersHorizontal,
        roles: ['ADMIN'],
      },
      {
        id: 'assumptions',
        label: 'Assumptions',
        href: '/admin/assumptions',
        icon: IconCalculator,
        roles: ['ADMIN', 'ANALYST'],
      },
    ],
  },
  {
    id: 'system',
    label: 'SYSTEM',
    items: [
      {
        id: 'emails',
        label: 'Email Logs',
        href: '/admin/emails',
        icon: IconMail,
        roles: ['ADMIN'],
      },
      {
        id: 'espocrm',
        label: 'EspoCRM Integration',
        href: '/settings/integrations',
        icon: IconCable,
        roles: ['ADMIN'],
      },
      {
        id: 'audit-logs',
        label: 'Audit Logs',
        href: '/admin/audit-logs',
        icon: IconHistory,
        roles: ['ADMIN'],
      },
      {
        id: 'settings',
        label: 'Settings',
        href: '/settings',
        icon: IconSettings,
        roles: ['ADMIN'],
      },
    ],
  },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';

  if (href === '/assessments/assigned') {
    return pathname === '/assessments/assigned' || pathname.startsWith('/assessments/assigned/');
  }

  if (href === '/assessments') {
    return (
      pathname === '/assessments'
      || (pathname.startsWith('/assessments/') && !pathname.startsWith('/assessments/assigned'))
    );
  }

  if (href === '/reports') {
    return pathname === '/reports' || pathname.startsWith('/reports/');
  }

  if (href === '/settings') {
    return pathname === '/settings';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function filterNavSections(sections: NavSectionConfig[], userRole: MvpNavRole): NavSectionConfig[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.includes(userRole)),
    }))
    .filter((section) => section.items.length > 0);
}
