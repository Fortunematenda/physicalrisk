import { describe, expect, it } from 'vitest';
import {
  formatAssessmentProgress,
  formatMossAssessmentLifecycle,
  formatMossAssessmentStatus,
  formatMossControlStatus,
  formatMossScore,
  hasFinancialMapping,
  isEditableMossStatus,
  listMethodologyItems,
  mossApiErrorMessage,
  scoringGuidanceFor,
} from './moss';

describe('MOSS UI helpers', () => {
  it('formats score labels 0–4', () => {
    expect(formatMossScore(2)).toBe('2 · Basic');
    expect(formatMossScore(null)).toBe('Not Started');
    expect(formatMossScore(4, { '4': 'Optimised' })).toBe('4 · Optimised');
  });

  it('formats control status labels', () => {
    expect(formatMossControlStatus('NOT_STARTED')).toBe('Not Started');
    expect(formatMossControlStatus('SCORED')).toBe('Scored');
  });

  it('distinguishes submitted-for-review from scoring completion', () => {
    expect(formatMossAssessmentStatus('SUBMITTED')).toBe('Submitted for review');
    expect(formatMossAssessmentStatus('IN_PROGRESS')).toBe('In Progress');
    expect(formatMossAssessmentStatus('REPORT_GENERATED')).toBe('Report generated');
    expect(isEditableMossStatus('SUBMITTED')).toBe(false);
    expect(formatMossAssessmentLifecycle({ status: 'SUBMITTED', submittedAt: null })).toBe(
      'Ready to submit',
    );
    expect(
      formatMossAssessmentLifecycle({
        status: 'SUBMITTED',
        submittedAt: '2026-11-01T00:00:00.000Z',
      }),
    ).toBe('Submitted for review');
  });

  it('formats assessment completion progress (not maturity)', () => {
    expect(formatAssessmentProgress(0, 100, 0)).toBe('0 / 100 · 0%');
    expect(formatAssessmentProgress(1, 100, 1)).toBe('1 / 100 · 1%');
  });

  it('reads authoritative scoring guidance without inventing text', () => {
    const rules = {
      '0': 'Control absent',
      '2': 'Basic control evidenced',
    };
    expect(scoringGuidanceFor(rules, 2)).toBe('Basic control evidenced');
    expect(scoringGuidanceFor(rules, 3)).toBeNull();
    expect(scoringGuidanceFor(null, 2)).toBeNull();
  });

  it('detects financial mapping presence', () => {
    expect(hasFinancialMapping({ eventUnit: 'incident' })).toBe(true);
    expect(hasFinancialMapping({ eventUnit: null, costCategory: '' })).toBe(false);
  });

  it('lists methodology items', () => {
    expect(listMethodologyItems(['a', 'b'])).toEqual(['a', 'b']);
    expect(listMethodologyItems(null)).toEqual([]);
  });

  it('maps API errors for product isolation', () => {
    expect(mossApiErrorMessage({ status: 404, message: 'x' })).toBe('Assessment not found.');
    expect(isEditableMossStatus('DRAFT')).toBe(true);
    expect(isEditableMossStatus('APPROVED')).toBe(false);
  });
});
