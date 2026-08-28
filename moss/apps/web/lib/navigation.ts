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
  IconUsers,
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
  /** Product level badge shown in the sidebar (e.g. L1, L2, L3). */
  level?: string;
  /** Short helper shown under the section title when expanded. */
  description?: string;
  /** Sidebar grouping — controls section dividers and accordion behaviour. */
  group?: 'journey' | 'assurance' | 'enterprise' | 'platform' | 'system';
  /** Optional parent heading (e.g. DIAGNOSTICS) shown once above grouped sections. */
  groupLabel?: string;
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
    id: 'triage',
    label: 'Executive Triage',
    level: 'L1',
    description: 'Governance funnel · complimentary indication',
    group: 'journey',
    groupLabel: 'Executive journey',
    collapsible: true,
    items: [
      { id: 'triage-submissions', label: 'Triage submissions', href: '/triage', icon: IconClipboardList, roles: ['ADMIN', 'ANALYST'] },
      { id: 'triage-reports', label: 'Triage reports', href: '/reports#executive-triage-reports', icon: IconFileText, roles: ['ADMIN', 'ANALYST', 'CLIENT'] },
    ],
  },
  {
    id: 'advisory',
    label: 'Executive Advisory',
    level: 'L2',
    description: 'Paid diagnostic · routing · assurance handoff',
    group: 'journey',
    collapsible: true,
    items: [
      { id: 'advisory-engagements', label: 'Diagnostics & assurance', href: '/advisory', icon: IconShieldCheck, roles: ['ADMIN', 'ANALYST', 'CLIENT'] },
      { id: 'advisory-reports', label: 'Advisory reports', href: '/reports#executive-advisory-reports', icon: IconFileText, roles: ['ADMIN', 'ANALYST', 'CLIENT'] },
    ],
  },
  {
    id: 'scl',
    label: 'Security Cost Leakage',
    level: 'L3',
    description: 'Evidence-led cost leakage assessment',
    group: 'assurance',
    groupLabel: 'Assurance programmes',
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
        label: 'Review queue',
        href: '/assessments/assigned',
        icon: IconListChecks,
        roles: ['ADMIN', 'ANALYST'],
      },
      {
        id: 'scl-reports',
        label: 'Cost leakage reports',
        href: '/reports',
        icon: IconFileText,
        roles: ['ADMIN', 'ANALYST', 'CLIENT'],
      },
      {
        id: 'scl-methodology',
        label: 'Questionnaire & calibration',
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
    level: 'Enterprise',
    description: 'Operating security maturity',
    group: 'enterprise',
    groupLabel: 'Enterprise programmes',
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
    level: 'Enterprise',
    description: 'Security operations model diagnostic',
    group: 'enterprise',
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
    id: 'organisations',
    label: '',
    group: 'platform',
    groupLabel: 'Platform',
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
    label: 'System',
    group: 'system',
    items: [
      { id: 'consultants', label: 'Consultants & Analysts', href: '/admin/consultants', icon: IconBuilding2, roles: ['ADMIN', 'ANALYST'] },
      { id: 'users', label: 'User administration', href: '/admin/users', icon: IconUsers, roles: ['ADMIN'] },
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
export function activeDiagnosticProduct(pathname: string): 'TRIAGE' | 'ADVISORY' | 'SCL' | 'MOSS' | 'SOMOD' | 'PLATFORM' {
  if (pathname === '/triage' || pathname.startsWith('/triage/')) return 'TRIAGE';
  if (pathname === '/advisory' || pathname.startsWith('/advisory/')) return 'ADVISORY';
  if (pathname === '/moss' || pathname.startsWith('/moss/')) return 'MOSS';
  if (pathname === '/somod' || pathname.startsWith('/somod/')) return 'SOMOD';
  if (
    pathname === '/dashboard'
    || pathname === '/start'
    || pathname.startsWith('/assessments')
    || pathname.startsWith('/admin/methodology')
    || pathname.startsWith('/admin/assumptions')
    || pathname.startsWith('/actions')
  ) {
    return 'SCL';
  }
  // Report list/detail product context depends on advisory vs SCL view — callers with search/hash should override.
  if (pathname === '/reports' || pathname.startsWith('/reports/')) {
    return 'SCL';
  }
  return 'PLATFORM';
}

export function activeReportsProduct(
  pathname: string,
  hash = '',
  search = '',
): 'ADVISORY' | 'SCL' | null {
  if (pathname !== '/reports' && !pathname.startsWith('/reports/')) return null;
  return isReportsAdvisoryContext(hash, search) ? 'ADVISORY' : 'SCL';
}

export const PRODUCT_CONTEXT_LABELS: Record<ReturnType<typeof activeDiagnosticProduct>, string> = {
  TRIAGE: 'Level 1 · Executive Triage',
  ADVISORY: 'Level 2 · Executive Advisory',
  SCL: 'Level 3 · Security Cost Leakage',
  MOSS: 'MOSS · Enterprise programme',
  SOMOD: 'SOMOD · Enterprise programme',
  PLATFORM: 'Physical Risk portal',
};

export function splitNavHref(href: string): { path: string; hashId?: string } {
  const [path, hashId] = href.split('#');
  return { path, hashId: hashId || undefined };
}

/** Scroll to a sidebar hash target (e.g. executive-advisory-reports). */
export function scrollToNavHash(hashId: string, behavior: ScrollBehavior = 'smooth') {
  const el = document.getElementById(hashId);
  if (el) el.scrollIntoView({ behavior, block: 'start' });
}

/** Update the URL hash and notify listeners (for same-page hash nav in the App Router). */
export function applyNavHash(href: string) {
  const { hashId } = splitNavHref(href);
  if (!hashId || typeof window === 'undefined') return;
  const next = `#${hashId}`;
  if (window.location.hash !== next) {
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${next}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
  scrollToNavHash(hashId);
}

/** True when the user is in the Executive Triage reports surface (list hash or report detail). */
export function isReportsTriageContext(hash = '', search = ''): boolean {
  if (hash.includes('executive-triage')) return true;
  const raw = search.startsWith('?') ? search.slice(1) : search;
  try {
    return new URLSearchParams(raw).get('view') === 'triage';
  } catch {
    return false;
  }
}

/** True when the user is in the Executive & Advisory reports surface (list hash or report detail). */
export function isReportsAdvisoryContext(hash = '', search = ''): boolean {
  if (hash.includes('executive-triage')) return false;
  if (hash.includes('executive-advisory')) return true;
  const raw = search.startsWith('?') ? search.slice(1) : search;
  try {
    return new URLSearchParams(raw).get('view') === 'advisory';
  } catch {
    return false;
  }
}

export function isNavItemActive(pathname: string, href: string, hash = '', search = ''): boolean {
  const [path, itemHash] = href.split('#');

  if (itemHash) {
    if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
    if (itemHash === 'executive-advisory-reports') {
      if (pathname.startsWith('/reports/')) {
        return isReportsAdvisoryContext(hash, search);
      }
      return hash === `#${itemHash}` || hash === itemHash;
    }
    if (itemHash === 'executive-triage-reports') {
      if (pathname.startsWith('/reports/')) {
        return isReportsTriageContext(hash, search);
      }
      return hash === `#${itemHash}` || hash === itemHash;
    }
    return hash === `#${itemHash}` || hash === itemHash;
  }

  if (path === '/dashboard') return pathname === '/dashboard';

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

  if (path === '/reports') {
    if (isReportsAdvisoryContext(hash, search)) return false;
    return pathname === '/reports' || pathname.startsWith('/reports/');
  }

  if (href === '/settings') {
    return pathname === '/settings';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

/** True when any item in the section matches the current path. */
export function sectionHasActiveItem(pathname: string, section: NavSectionConfig, hash = '', search = ''): boolean {
  return section.items.some((item) => isNavItemActive(pathname, item.href, hash, search));
}

export function filterNavSections(sections: NavSectionConfig[], userRole: MvpNavRole): NavSectionConfig[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.includes(userRole)),
    }))
    .filter((section) => section.items.length > 0);
}
