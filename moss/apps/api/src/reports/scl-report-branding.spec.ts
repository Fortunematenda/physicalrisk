import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SCL_REPORT_BRANDING,
  buildSclReportDocumentMeta,
  buildSclReportFileName,
  sanitizeReportFileNameSegment,
} from './scl-report-branding';

describe('SCL report branding filenames', () => {
  it('builds the branded filename with company and ISO date', () => {
    expect(
      buildSclReportFileName({
        companyName: 'ABC Mining',
        assessmentDate: new Date('2026-08-20T12:00:00.000Z'),
        reference: 'SCLI-000003',
      }),
    ).toBe('Physical-Risk-Security-Cost-Leakage-ABC-Mining-2026-08-20.pdf');
  });

  it('falls back to Assessment when only an opaque SCL reference exists', () => {
    expect(
      buildSclReportFileName({
        companyName: '',
        assessmentDate: new Date('2026-08-20T12:00:00.000Z'),
        reference: 'SCL-2026-000003',
      }),
    ).toBe('Physical-Risk-Security-Cost-Leakage-Assessment-2026-08-20.pdf');
  });

  it('prefers company name over opaque assessment references', () => {
    expect(
      buildSclReportFileName({
        companyName: 'Mashoko',
        assessmentDate: new Date('2026-08-20T12:00:00.000Z'),
        reference: 'SCL-2026-000003',
      }),
    ).toBe('Physical-Risk-Security-Cost-Leakage-Mashoko-2026-08-20.pdf');
  });

  it('sanitizes unsafe characters, quotes, and excessive spaces', () => {
    expect(sanitizeReportFileNameSegment('ABC / Mining: "South*" Africa?')).toBe(
      'ABC-Mining-South-Africa',
    );
    expect(sanitizeReportFileNameSegment('  Foo   Bar  ')).toBe('Foo-Bar');
    expect(sanitizeReportFileNameSegment('Acme\\Holdings')).toBe('Acme-Holdings');
  });

  it('keeps product segment configurable from one branding object', () => {
    expect(
      buildSclReportFileName({
        companyName: 'ACME',
        assessmentDate: new Date('2026-01-02'),
        brand: { fileNameProductSegment: DEFAULT_SCL_REPORT_BRANDING.fileNameProductSegment },
      }),
    ).toMatch(/^Physical-Risk-Security-Cost-Leakage-ACME-2026-01-02\.pdf$/);
  });

  it('builds document meta used on the cover', () => {
    const meta = buildSclReportDocumentMeta({
      organisationName: 'ABC Mining',
      reference: 'SCLI-42',
      assessmentDate: new Date('2026-08-20T08:00:00.000Z'),
      reportTypeLabel: 'Preliminary Executive Report',
      methodologyVersion: 'SCLI 1.1',
      isPreliminary: true,
    });
    expect(meta.companyName).toBe('ABC Mining');
    expect(meta.reference).toBe('SCLI-42');
    expect(meta.assessmentDateIso).toBe('2026-08-20');
    expect(meta.reportTitle).toBe('Preliminary Executive Report');
  });
});
