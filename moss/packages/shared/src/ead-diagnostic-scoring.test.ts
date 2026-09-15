import { describe, expect, it } from 'vitest';
import {
  EAD_DIAGNOSTIC_MODULE_CODES,
  EAD_MODULE_CRITERIA,
  buildConsequenceDiagnosticSnapshot,
  buildEadDiagnosticSnapshot,
  likertToAssuranceScore,
  scoreConsequenceDiagnostic,
  scoreEadDiagnostic,
  scoreEadDiagnosticCriteria,
} from './ead-diagnostic-scoring';

describe('ead-diagnostic-scoring', () => {
  it('maps Never to poorest assurance and Always to strongest', () => {
    expect(likertToAssuranceScore('NEVER')).toBe(0);
    expect(likertToAssuranceScore('RARELY')).toBe(25);
    expect(likertToAssuranceScore('SOMETIMES')).toBe(50);
    expect(likertToAssuranceScore('MOSTLY')).toBe(75);
    expect(likertToAssuranceScore('ALWAYS')).toBe(100);
    expect(likertToAssuranceScore('NA')).toBeNull();
  });

  it('defines criteria for every EAD diagnostic module', () => {
    for (const code of EAD_DIAGNOSTIC_MODULE_CODES) {
      expect(EAD_MODULE_CRITERIA[code].length).toBeGreaterThanOrEqual(3);
    }
  });

  it('all poorest Consequence answers → low score and priority/red band', () => {
    const result = scoreConsequenceDiagnostic({
      CORRECTION: 'NEVER',
      RECOVERY: 'NEVER',
      PENALTIES: 'NEVER',
      ESCALATION: 'NEVER',
    });
    expect(result.assuranceScore).toBe(0);
    expect(result.exposureIndicator).toBe(100);
    expect(result.assuranceBand?.code).toBe('REQUIRES_PRIORITY_INTERVENTION');
    expect(result.exposureBand).toBe('Critical');
    expect(result.visual?.colourName).toBe('RED');
    expect(result.allRequiredAnswered).toBe(true);
  });

  it('all strongest Consequence answers → high score and strong/green band', () => {
    const result = scoreConsequenceDiagnostic({
      CORRECTION: 'ALWAYS',
      RECOVERY: 'ALWAYS',
      PENALTIES: 'ALWAYS',
      ESCALATION: 'ALWAYS',
    });
    expect(result.assuranceScore).toBe(100);
    expect(result.exposureIndicator).toBe(0);
    expect(result.assuranceBand?.code).toBe('STRONG_ASSURANCE');
    expect(result.exposureBand).toBe('Controlled');
    expect(result.visual?.colourName).toBe('GREEN');
  });

  it('mixed Consequence answers → correct average', () => {
    const result = scoreConsequenceDiagnostic({
      CORRECTION: 'NEVER', // 0
      RECOVERY: 'SOMETIMES', // 50
      PENALTIES: 'MOSTLY', // 75
      ESCALATION: 'ALWAYS', // 100
    });
    expect(result.assuranceScore).toBe(56.3); // (0+50+75+100)/4 = 56.25 → 56.3
    expect(result.applicableCount).toBe(4);
  });

  it('excludes N/A from the denominator', () => {
    const result = scoreConsequenceDiagnostic({
      CORRECTION: 'ALWAYS', // 100
      RECOVERY: 'ALWAYS', // 100
      PENALTIES: 'NA',
      ESCALATION: 'ALWAYS', // 100
    });
    expect(result.assuranceScore).toBe(100);
    expect(result.applicableCount).toBe(3);
    expect(result.answeredCount).toBe(4);
    expect(result.allRequiredAnswered).toBe(true);
  });

  it('incomplete when a required criterion is missing', () => {
    const result = scoreConsequenceDiagnostic({
      CORRECTION: 'SOMETIMES',
      RECOVERY: 'SOMETIMES',
      PENALTIES: 'NA',
    });
    expect(result.allRequiredAnswered).toBe(false);
    expect(result.assuranceScore).toBe(50);
  });

  it('builds an auditable Consequence snapshot with per-criterion scores', () => {
    const snap = buildConsequenceDiagnosticSnapshot({
      CORRECTION: 'RARELY',
      RECOVERY: 'SOMETIMES',
      PENALTIES: 'NA',
      ESCALATION: 'MOSTLY',
    });
    expect(snap.version).toBe(1);
    expect(snap.moduleCode).toBe('CONSEQUENCE');
    expect(snap.criterionScores).toHaveLength(4);
    expect(snap.criterionScores.find((c) => c.code === 'PENALTIES')?.assuranceScore).toBeNull();
    expect(snap.calculatedAssuranceScore).toBe(50); // (25+50+75)/3
  });

  it('scores Financial assurance from its own criteria', () => {
    const result = scoreEadDiagnostic('FINANCIAL', {
      TRACEABILITY: 'ALWAYS',
      JUSTIFICATION: 'MOSTLY',
      VALUE_RECEIVED: 'SOMETIMES',
      VARIANCE: 'NA',
    });
    expect(result.assuranceScore).toBe(75); // (100+75+50)/3
    expect(result.allRequiredAnswered).toBe(true);
    expect(result.applicableCount).toBe(3);
  });

  it('scores Contractual assurance and rejects invalid N/A on required criteria', () => {
    const incomplete = scoreEadDiagnostic('CONTRACTUAL', {
      MEASURABLE: 'NA',
      MONITORED: 'ALWAYS',
      ENFORCEABLE: 'ALWAYS',
      APPLIED: 'ALWAYS',
    });
    expect(incomplete.allRequiredAnswered).toBe(false);

    const complete = scoreEadDiagnostic('CONTRACTUAL', {
      MEASURABLE: 'MOSTLY',
      MONITORED: 'ALWAYS',
      ENFORCEABLE: 'ALWAYS',
      APPLIED: 'NA',
    });
    expect(complete.allRequiredAnswered).toBe(true);
    expect(complete.assuranceScore).toBe(91.7); // (75+100+100)/3
  });

  it('builds snapshots for Governance and Reporting', () => {
    const gov = buildEadDiagnosticSnapshot('GOVERNANCE', {
      ASSIGNED: 'ALWAYS',
      EXERCISED: 'ALWAYS',
      INDEPENDENT_TEST: 'ALWAYS',
      REMEDIATION: 'ALWAYS',
    });
    expect(gov.moduleCode).toBe('GOVERNANCE');
    expect(gov.calculatedAssuranceScore).toBe(100);

    const reporting = buildEadDiagnosticSnapshot('REPORTING', {
      COMPLETE: 'NEVER',
      RELIABLE: 'NEVER',
      TIMELY: 'NEVER',
      DECISION_USEFUL: 'NEVER',
    });
    expect(reporting.moduleCode).toBe('REPORTING');
    expect(reporting.calculatedAssuranceScore).toBe(0);
    expect(reporting.calculatedExposureIndicator).toBe(100);
  });

  it('optional unanswered questions do not block completion', () => {
    const result = scoreEadDiagnosticCriteria(
      [
        { code: 'A', title: 'A', question: 'A?', allowNa: false, isRequired: true },
        { code: 'B', title: 'B', question: 'B?', allowNa: false, isRequired: false },
      ],
      { A: 'ALWAYS' },
    );
    expect(result.allRequiredAnswered).toBe(true);
    expect(result.assuranceScore).toBe(100);
  });

  it('required unanswered questions block completion', () => {
    const result = scoreEadDiagnosticCriteria(
      [
        { code: 'A', title: 'A', question: 'A?', allowNa: false, isRequired: true },
        { code: 'B', title: 'B', question: 'B?', allowNa: false, isRequired: true },
      ],
      { A: 'ALWAYS' },
    );
    expect(result.allRequiredAnswered).toBe(false);
  });

  it('N/A answers are excluded from the average but count toward completion when allowed', () => {
    const result = scoreEadDiagnosticCriteria(
      [
        { code: 'A', title: 'A', question: '?', allowNa: true, isRequired: true },
        { code: 'B', title: 'B', question: '?', allowNa: false, isRequired: true },
      ],
      { A: 'NA', B: 'ALWAYS' },
    );
    expect(result.allRequiredAnswered).toBe(true);
    expect(result.assuranceScore).toBe(100);
    expect(result.applicableCount).toBe(1);
  });

  it('snapshot scoring uses provided criteria rather than hard-coded module set', () => {
    const snap = buildEadDiagnosticSnapshot(
      'CONSEQUENCE',
      { CUSTOM_1: 'MOSTLY' },
      new Date('2026-01-01T00:00:00.000Z'),
      [{ code: 'CUSTOM_1', title: 'Custom', question: 'Custom?', allowNa: false, isRequired: true }],
    );
    expect(snap.calculatedAssuranceScore).toBe(75);
    expect(snap.criterionScores).toHaveLength(1);
    expect(snap.criterionScores[0]?.code).toBe('CUSTOM_1');
  });
});
