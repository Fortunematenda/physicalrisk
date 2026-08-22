import { describe, expect, it } from 'vitest';

import { buildSclFlowSteps } from './scl-continuous-steps';

describe('buildSclFlowSteps', () => {
  it('starts with questionnaire then contact — no calibration steps in public flow', () => {
    const steps = buildSclFlowSteps(
      [
        { code: 'C1', label: 'Organisation name', valueType: 'TEXT', required: true },
        { code: 'C4', label: 'Guard force', valueType: 'NUMBER', required: true },
        { code: 'C13', label: 'Surveillance coverage %', valueType: 'PERCENT', required: true },
      ],
      [{ code: 'Q1', category: 'Test', text: 'Question?', weight: 1, options: [] }],
    );
    expect(steps.filter((s) => s.kind === 'input')).toEqual([]);
    expect(steps[0]).toMatchObject({ kind: 'question', question: { code: 'Q1' } });
    expect(steps[steps.length - 1]).toEqual({ kind: 'contact' });
  });
});
