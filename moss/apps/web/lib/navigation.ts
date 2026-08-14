import type { NavIconComponent } from '../components/NavIcons';
import {
  IconBuilding2,
  IconCable,
  IconCalculator,
  IconClipboardList,
  IconFileText,
  IconHistory,
  IconLayers,
  IconLayoutDashboard,
  IconListChecks,
  IconMail,
  IconSettings,
  IconShieldCheck,
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
  /** Optional parent heading (e.g. DIAGNOSTICS) shown once above grouped sections. */
  group?: string;
  /** When true, section header toggles expand/collapse of its items. */
  collapsible?: boolean;
  items: NavItemConfig[];
};

/**
 * Sidebar navigation — Cost Leakage and MOSS as separate collapsible product groups.
 * Cost Leakage = SCLI_COST_LEAKAGE (/dashboard, /assessments, …)
 * MOSS = Master Operating Security System (/moss/…)
 */
export const NAV_SECTIONS: NavSectionConfig[] = [
  {
    id: 'scl',
    label: 'Cost Leakage',
    collapsible: true,
    items: [
      {
        id: 'scl-dashboard',
        label: 'Dashboard',
        href: '/dashboard',
        icon: IconLayoutDashboard,
        roles: ['ADMIN', 'ANALYST', 'CLIENT'],
      },
      {
        id: 'scl-assessments',
        label: 'Assessments',
        href: '/assessments',
        icon: IconClipboardList,
        roles: ['ADMIN', 'ANALYST', 'CLIENT'],
      },
      {
        id: 'scl-review-queue',
        label: 'Review Queue',
        href: '/assessments/assigned',
        icon: IconListChecks,
        roles: ['ADMIN', 'ANALYST'],
      },
      {
        id: 'scl-reports',
        label: 'Reports',
        href: '/reports',
        icon: IconFileText,
        roles: ['ADMIN', 'ANALYST', 'CLIENT'],
      },
      {
        id: 'scl-methodology',
        label: 'Questionnaire & Calibration',
        href: '/admin/methodology',
        icon: IconSlidersHorizontal,
        roles: ['ADMIN'],
      },
      {
        id: 'scl-assumptions',
        label: 'Assumptions',
        href: '/admin/assumptions',
        icon: IconCalculator,
        roles: ['ADMIN', 'ANALYST'],
      },
    ],
  },
  {
    id: 'moss',
    label: 'MOSS',
    collapsible: true,
    items: [
      {
        id: 'moss-home',
        label: 'Dashboard',
        href: '/moss',
        icon: IconShieldCheck,
        roles: ['ADMIN', 'ANALYST', 'CLIENT'],
      },
      {
        id: 'moss-assessments',
        label: 'Assessments',
        href: '/moss/assessments',
        icon: IconClipboardList,
        roles: ['ADMIN', 'ANALYST', 'CLIENT'],
      },
      {
        id: 'moss-actions',
        label: 'Action Plans',
        href: '/moss/actions',
        icon: IconListChecks,
        roles: ['ADMIN', 'ANALYST'],
      },
      {
        id: 'moss-catalogue',
        label: 'Catalogue',
        href: '/moss/admin/catalogue',
        icon: IconSlidersHorizontal,
        roles: ['ADMIN'],
      },
      {
        id: 'moss-scoring',
        label: 'Scoring',
        href: '/moss/admin/scoring',
        icon: IconCalculator,
        roles: ['ADMIN'],
      },
    ],
  },
  {
    id: 'somod',
    label: 'SOMOD',
    collapsible: true,
    items: [
      {
        id: 'somod-home',
        label: 'Dashboard',
        href: '/somod',
        icon: IconLayers,
        roles: ['ADMIN', 'ANALYST', 'CLIENT'],
      },
      {
        id: 'somod-assessments',
        label: 'Assessments',
        href: '/somod/assessments',
        icon: IconClipboardList,
        roles: ['ADMIN', 'ANALYST', 'CLIENT'],
      },
    ],
  },
  {
    // Shared across Cost Leakage, MOSS, and SOMOD — standalone, above SYSTEM.
    id: 'organisations',
    label: '',
    items: [
      {
        id: 'organisations',
        label: 'Organisations',
        href: '/organisations',
        icon: IconBuilding2,
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

/** Active product for brand subtitle / context. */
export function activeDiagnosticProduct(pathname: string): 'SCL' | 'MOSS' | 'SOMOD' | 'PLATFORM' {
  if (pathname === '/moss' || pathname.startsWith('/moss/')) return 'MOSS';
  if (pathname === '/somod' || pathname.startsWith('/somod/')) return 'SOMOD';
  if (
    pathname === '/dashboard'
    || pathname === '/start'
    || pathname.startsWith('/assessments')
    || pathname.startsWith('/reports')
    || pathname.startsWith('/admin/methodology')
    || pathname.startsWith('/admin/assumptions')
    || pathname.startsWith('/actions')
  ) {
    return 'SCL';
  }
  return 'PLATFORM';
}

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';

  if (href === '/assessments/new') {
    return pathname === '/assessments/new' || pathname.startsWith('/assessments/new/');
  }

  if (href === '/moss') {
    return pathname === '/moss';
  }

  if (href === '/moss/assessments/new') {
    return pathname === '/moss/assessments/new';
  }

  if (href === '/moss/assessments') {
    return (
      pathname === '/moss/assessments'
      || (pathname.startsWith('/moss/assessments/') && pathname !== '/moss/assessments/new' && !pathname.startsWith('/moss/assessments/new/'))
    );
  }

  if (href === '/moss/actions') {
    return pathname === '/moss/actions' || pathname.startsWith('/moss/actions/');
  }

  if (href === '/moss/admin/catalogue') {
    return pathname === '/moss/admin/catalogue' || pathname.startsWith('/moss/admin/catalogue/');
  }

  if (href === '/moss/admin/scoring') {
    return pathname === '/moss/admin/scoring' || pathname.startsWith('/moss/admin/scoring/');
  }

  if (href === '/somod') {
    return pathname === '/somod';
  }

  if (href === '/somod/assessments/new') {
    return pathname === '/somod/assessments/new';
  }

  if (href === '/somod/assessments') {
    return (
      pathname === '/somod/assessments'
      || (pathname.startsWith('/somod/assessments/')
        && pathname !== '/somod/assessments/new'
        && !pathname.startsWith('/somod/assessments/new/'))
    );
  }

  if (href === '/assessments/assigned') {
    return pathname === '/assessments/assigned' || pathname.startsWith('/assessments/assigned/');
  }

  if (href === '/assessments') {
    return (
      pathname === '/assessments'
      || (pathname.startsWith('/assessments/')
        && !pathname.startsWith('/assessments/assigned')
        && pathname !== '/assessments/new'
        && !pathname.startsWith('/assessments/new/'))
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

/** True when any item in the section matches the current path. */
export function sectionHasActiveItem(pathname: string, section: NavSectionConfig): boolean {
  return section.items.some((item) => isNavItemActive(pathname, item.href));
}

export function filterNavSections(sections: NavSectionConfig[], userRole: MvpNavRole): NavSectionConfig[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.includes(userRole)),
    }))
    .filter((section) => section.items.length > 0);
}
