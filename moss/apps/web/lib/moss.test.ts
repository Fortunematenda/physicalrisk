import { describe, expect, it } from 'vitest';
import {
  formatAssessmentProgress,
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

  it('maps 100% session status SUBMITTED to Complete', () => {
    expect(formatMossAssessmentStatus('SUBMITTED')).toBe('Complete');
    expect(formatMossAssessmentStatus('IN_PROGRESS')).toBe('In Progress');
    expect(isEditableMossStatus('SUBMITTED')).toBe(true);
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
