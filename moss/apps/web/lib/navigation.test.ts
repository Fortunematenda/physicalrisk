import { describe, expect, it } from 'vitest';
import {
  NAV_SECTIONS,
  filterNavSections,
  isNavItemActive,
  activeDiagnosticProduct,
} from './navigation';

describe('Cost Leakage / MOSS navigation separation', () => {
  it('groups Cost Leakage and MOSS as separate collapsible sidebar sections', () => {
    const scl = NAV_SECTIONS.find((s) => s.id === 'scl');
    const moss = NAV_SECTIONS.find((s) => s.id === 'moss');
    expect(scl?.label).toBe('Cost Leakage');
    expect(moss?.label).toBe('MOSS');
    expect(scl?.collapsible).toBe(true);
    expect(moss?.collapsible).toBe(true);
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
    expect(moss?.items.some((i) => i.label === 'SOMAD' || i.label === 'SOMOD')).toBe(false);
    const sclIndex = NAV_SECTIONS.findIndex((s) => s.id === 'scl');
    const mossIndex = NAV_SECTIONS.findIndex((s) => s.id === 'moss');
    expect(sclIndex).toBeLessThan(mossIndex);
  });

  it('marks product context from pathname', () => {
    expect(activeDiagnosticProduct('/assessments')).toBe('SCL');
    expect(activeDiagnosticProduct('/dashboard')).toBe('SCL');
    expect(activeDiagnosticProduct('/start')).toBe('SCL');
    expect(activeDiagnosticProduct('/moss/assessments/abc')).toBe('MOSS');
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

  it('keeps SCL assessment routes separate from MOSS assessment routes', () => {
    expect(isNavItemActive('/assessments', '/assessments')).toBe(true);
    expect(isNavItemActive('/moss/assessments', '/assessments')).toBe(false);
    expect(isNavItemActive('/moss/assessments', '/moss/assessments')).toBe(true);
    expect(isNavItemActive('/assessments/x', '/moss/assessments')).toBe(false);
    expect(isNavItemActive('/moss/assessments/new', '/moss/assessments/new')).toBe(true);
    expect(isNavItemActive('/moss/assessments/new', '/moss/assessments')).toBe(false);
    expect(isNavItemActive('/assessments/new', '/assessments/new')).toBe(true);
    expect(isNavItemActive('/assessments/new', '/assessments')).toBe(false);
  });

  it('filters both product sections for analysts', () => {
    const filtered = filterNavSections(NAV_SECTIONS, 'ANALYST');
    expect(filtered.some((s) => s.id === 'scl')).toBe(true);
    expect(filtered.some((s) => s.id === 'moss')).toBe(true);
  });
});
