import { describe, expect, it } from 'vitest';
import {
  advisoryReportHref,
  advisoryWorkspaceHref,
  canGenerateAdvisoryReport,
  formatAdvisoryReportVersion,
  isAdvisoryReportReady,
  isExecutiveAdvisoryDiagnostic,
  pickLatestAdvisoryReport,
} from './advisory-report';

describe('advisory-report (Stage 11)', () => {
  it('treats GENERATED/APPROVED/ISSUED as ready', () => {
    expect(isAdvisoryReportReady({ id: '1', version: 1, status: 'GENERATED' })).toBe(true);
    expect(isAdvisoryReportReady({ id: '1', version: 1, status: 'ISSUED' })).toBe(true);
    expect(isAdvisoryReportReady({ id: '1', version: 1, status: 'DRAFT' })).toBe(false);
    expect(isAdvisoryReportReady({ id: '1', version: 1, status: 'SUPERSEDED' })).toBe(false);
    expect(isAdvisoryReportReady(null)).toBe(false);
  });

  it('builds preview href with advisory view and pdf flag', () => {
    expect(advisoryReportHref('rep_1')).toBe('/reports/rep_1?view=advisory&pdf=1');
  });

  it('detects EAD by product code or EAD- reference', () => {
    expect(
      isExecutiveAdvisoryDiagnostic({ productCode: 'EXECUTIVE_ADVISORY_DIAGNOSTIC' }),
    ).toBe(true);
    expect(isExecutiveAdvisoryDiagnostic({ reference: 'EAD-2026-000001' })).toBe(true);
    expect(isExecutiveAdvisoryDiagnostic({ productCode: 'SCLI_COST_LEAKAGE' })).toBe(false);
  });

  it('routes completed EAD to diagnostic outcome', () => {
    expect(
      advisoryWorkspaceHref({
        assessmentId: 'ead_1',
        productCode: 'EXECUTIVE_ADVISORY_DIAGNOSTIC',
        hasOutcome: true,
      }),
    ).toBe('/advisory/ead_1/outcome');
    expect(
      advisoryWorkspaceHref({
        assessmentId: 'ead_1',
        reference: 'EAD-2026-000002',
      }),
    ).toBe('/advisory/ead_1/outcome');
    expect(
      advisoryWorkspaceHref({
        assessmentId: 'ead_1',
        productCode: 'EXECUTIVE_ADVISORY_DIAGNOSTIC',
        hasOutcome: false,
      }),
    ).toBe('/advisory/ead_1');
    expect(
      advisoryWorkspaceHref({
        assessmentId: 'l3_1',
        productCode: 'VENDOR_PERFORMANCE_ASSURANCE',
        hasOutcome: true,
      }),
    ).toBe('/advisory/l3_1');
  });

  it('allows generate when submitted without a ready report', () => {
    expect(
      canGenerateAdvisoryReport({ status: 'SUBMITTED', reportReady: false }),
    ).toBe(true);
    expect(
      canGenerateAdvisoryReport({ status: 'SUBMITTED', reportReady: true }),
    ).toBe(false);
    expect(
      canGenerateAdvisoryReport({ status: 'IN_PROGRESS', hasOutcome: true }),
    ).toBe(true);
    expect(
      canGenerateAdvisoryReport({ status: 'IN_PROGRESS', hasOutcome: false }),
    ).toBe(false);
  });

  it('picks the latest ready report from a list', () => {
    expect(
      pickLatestAdvisoryReport([
        { id: 'old', version: 1, status: 'SUPERSEDED' },
        { id: 'ready', version: 2, status: 'GENERATED' },
      ])?.id,
    ).toBe('ready');
    expect(pickLatestAdvisoryReport([])).toBeNull();
  });

  it('formats version labels', () => {
    expect(formatAdvisoryReportVersion(1)).toBe('v1');
    expect(formatAdvisoryReportVersion(null)).toBe('—');
  });
});
