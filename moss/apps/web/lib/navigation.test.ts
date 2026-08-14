import { describe, expect, it } from 'vitest';
import {
  NAV_SECTIONS,
  filterNavSections,
  isNavItemActive,
  activeDiagnosticProduct,
} from './navigation';

describe('Cost Leakage / MOSS / SOMOD navigation separation', () => {
  it('groups Cost Leakage, MOSS, and SOMOD as separate collapsible sidebar sections', () => {
    const scl = NAV_SECTIONS.find((s) => s.id === 'scl');
    const moss = NAV_SECTIONS.find((s) => s.id === 'moss');
    const somod = NAV_SECTIONS.find((s) => s.id === 'somod');
    expect(scl?.label).toBe('Cost Leakage');
    expect(moss?.label).toBe('MOSS');
    expect(somod?.label).toBe('SOMOD');
    expect(scl?.collapsible).toBe(true);
    expect(moss?.collapsible).toBe(true);
    expect(somod?.collapsible).toBe(true);
    expect(scl?.group).toBeUndefined();
    expect(moss?.group).toBeUndefined();
    expect(scl?.items.map((i) => i.href)).toEqual(
      expect.arrayContaining([
        '/dashboard',
        '/assessments',
        '/admin/methodology',
        '/admin/assumptions',
      ]),
    );
    expect(scl?.items.map((i) => i.href)).not.toContain('/assessments/new');
    expect(scl?.items.map((i) => i.href)).not.toContain('/start');
    expect(scl?.items.map((i) => i.href)).not.toContain('/moss');
    expect(NAV_SECTIONS.some((s) => s.id === 'methodology')).toBe(false);
    expect(moss?.items.map((i) => i.href)).toEqual(
      expect.arrayContaining([
        '/moss',
        '/moss/assessments',
        '/moss/actions',
        '/moss/admin/catalogue',
        '/moss/admin/scoring',
      ]),
    );
    expect(moss?.items.map((i) => i.href)).not.toContain('/moss/assessments/new');
    expect(somod?.items.map((i) => i.href)).toEqual(
      expect.arrayContaining(['/somod', '/somod/assessments']),
    );
    expect(somod?.items.map((i) => i.href)).not.toContain('/somod/assessments/new');
    const sclIndex = NAV_SECTIONS.findIndex((s) => s.id === 'scl');
    const mossIndex = NAV_SECTIONS.findIndex((s) => s.id === 'moss');
    const somodIndex = NAV_SECTIONS.findIndex((s) => s.id === 'somod');
    expect(sclIndex).toBeLessThan(mossIndex);
    expect(mossIndex).toBeLessThan(somodIndex);
  });

  it('marks product context from pathname', () => {
    expect(activeDiagnosticProduct('/assessments')).toBe('SCL');
    expect(activeDiagnosticProduct('/dashboard')).toBe('SCL');
    expect(activeDiagnosticProduct('/start')).toBe('SCL');
    expect(activeDiagnosticProduct('/moss/assessments/abc')).toBe('MOSS');
    expect(activeDiagnosticProduct('/somod/assessments')).toBe('SOMOD');
    expect(activeDiagnosticProduct('/settings')).toBe('PLATFORM');
    expect(activeDiagnosticProduct('/organisations')).toBe('PLATFORM');
  });

  it('keeps Organisations as its own section above SYSTEM', () => {
    const scl = NAV_SECTIONS.find((s) => s.id === 'scl');
    const orgs = NAV_SECTIONS.find((s) => s.id === 'organisations');
    const system = NAV_SECTIONS.find((s) => s.id === 'system');
    expect(scl?.items.some((i) => i.href === '/organisations')).toBe(false);
    expect(system?.items.some((i) => i.href === '/organisations')).toBe(false);
    expect(orgs?.items.map((i) => i.href)).toEqual(['/organisations']);
    const orgSectionIndex = NAV_SECTIONS.findIndex((s) => s.id === 'organisations');
    const systemIndex = NAV_SECTIONS.findIndex((s) => s.id === 'system');
    expect(orgSectionIndex).toBeGreaterThanOrEqual(0);
    expect(orgSectionIndex).toBeLessThan(systemIndex);
  });

  it('keeps SCL assessment routes separate from MOSS and SOMOD assessment routes', () => {
    expect(isNavItemActive('/assessments', '/assessments')).toBe(true);
    expect(isNavItemActive('/moss/assessments', '/assessments')).toBe(false);
    expect(isNavItemActive('/moss/assessments', '/moss/assessments')).toBe(true);
    expect(isNavItemActive('/assessments/x', '/moss/assessments')).toBe(false);
    expect(isNavItemActive('/moss/assessments/new', '/moss/assessments/new')).toBe(true);
    expect(isNavItemActive('/moss/assessments/new', '/moss/assessments')).toBe(false);
    expect(isNavItemActive('/assessments/new', '/assessments/new')).toBe(true);
    expect(isNavItemActive('/assessments/new', '/assessments')).toBe(false);
    expect(isNavItemActive('/somod/assessments', '/somod/assessments')).toBe(true);
    expect(isNavItemActive('/somod/assessments/new', '/somod/assessments')).toBe(false);
    expect(isNavItemActive('/somod/assessments/x', '/moss/assessments')).toBe(false);
  });

  it('filters product sections for analysts', () => {
    const filtered = filterNavSections(NAV_SECTIONS, 'ANALYST');
    expect(filtered.some((s) => s.id === 'scl')).toBe(true);
    expect(filtered.some((s) => s.id === 'moss')).toBe(true);
    expect(filtered.some((s) => s.id === 'somod')).toBe(true);
  });
});
