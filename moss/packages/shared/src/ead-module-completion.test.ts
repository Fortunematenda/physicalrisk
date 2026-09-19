import { describe, expect, it } from 'vitest';
import {
  isCountableEadEvidenceStatus,
  isEadEvidenceRequirementSatisfied,
  isMeaningfulEvidenceLimitation,
  validateExecutiveAdvisoryModule,
} from './ead-module-completion';
import type { EadDiagnosticCriterion } from './ead-diagnostic-scoring';

const criteria: EadDiagnosticCriterion[] = [
  {
    code: 'C1',
    title: 'One',
    question: 'Q1?',
    allowNa: true,
    isRequired: true,
  },
  {
    code: 'C2',
    title: 'Two',
    question: 'Q2?',
    allowNa: false,
    isRequired: true,
  },
];

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    moduleCode: 'FINANCIAL',
    finding: '<p>Material spend variances are not investigated.</p>',
    requiredDecision: '<p>Commission a focused expenditure review.</p>',
    businessConsequences: ['FINANCIAL_LOSS'],
    evidenceSummary: '',
    attachmentCount: 0,
    diagnosticAnswers: { C1: 'SOMETIMES', C2: 'RARELY' } as const,
    criteria,
    ...overrides,
  };
}

describe('ead-module-completion (Stage 7)', () => {
  it('marks module incomplete without evidence or limitation', () => {
    const result = validateExecutiveAdvisoryModule(baseInput());
    expect(result.isComplete).toBe(false);
    expect(result.missingRequirements).toEqual(['evidence']);
    expect(result.onlyEvidenceMissing).toBe(true);
  });

  it('accepts uploaded evidence when other requirements are met', () => {
    const result = validateExecutiveAdvisoryModule(baseInput({ attachmentCount: 1 }));
    expect(result.isComplete).toBe(true);
    expect(result.missingRequirements).toEqual([]);
  });

  it('accepts meaningful limitation text without a file', () => {
    const result = validateExecutiveAdvisoryModule(
      baseInput({
        evidenceSummary:
          '<p>No independently verified expenditure records were available during this diagnostic.</p>',
      }),
    );
    expect(result.isComplete).toBe(true);
  });

  it('rejects empty rich-text limitation markup', () => {
    expect(isMeaningfulEvidenceLimitation('<p></p>')).toBe(false);
    expect(isMeaningfulEvidenceLimitation('<p><br></p>')).toBe(false);
    expect(isEadEvidenceRequirementSatisfied({ evidenceSummary: '<p><br/></p>', attachmentCount: 0 })).toBe(
      false,
    );
  });

  it('rejects trivial limitation placeholders', () => {
    expect(isMeaningfulEvidenceLimitation('n/a')).toBe(false);
    expect(isMeaningfulEvidenceLimitation('none')).toBe(false);
    expect(isMeaningfulEvidenceLimitation('test')).toBe(false);
    expect(isMeaningfulEvidenceLimitation('-')).toBe(false);
  });

  it('does not treat another module’s attachments as satisfying this module', () => {
    const result = validateExecutiveAdvisoryModule(baseInput({ attachmentCount: 0 }));
    expect(result.missingRequirements).toContain('evidence');
  });

  it('requires finding, consequences, decision, and diagnostics', () => {
    const result = validateExecutiveAdvisoryModule(
      baseInput({
        finding: '',
        requiredDecision: '',
        businessConsequences: [],
        diagnosticAnswers: {},
        attachmentCount: 1,
      }),
    );
    expect(result.isComplete).toBe(false);
    expect(result.missingRequirements).toEqual(
      expect.arrayContaining([
        'finding',
        'businessConsequences',
        'executiveDecision',
        'diagnosticResponses',
      ]),
    );
  });

  it('counts PENDING evidence as usable and rejects REJECTED', () => {
    expect(isCountableEadEvidenceStatus('PENDING')).toBe(true);
    expect(isCountableEadEvidenceStatus('ACCEPTED')).toBe(true);
    expect(isCountableEadEvidenceStatus('REJECTED')).toBe(false);
    expect(isCountableEadEvidenceStatus('MISSING')).toBe(false);
  });
});
