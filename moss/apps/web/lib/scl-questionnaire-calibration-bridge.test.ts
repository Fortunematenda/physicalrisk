import { describe, expect, it } from 'vitest';

import { deriveDuplicateCalibrationInputs } from './scl-questionnaire-calibration-bridge';
import type { Question } from './scl-assessment-types';

const questions: Question[] = [
  {
    code: 'Q8',
    category: 'Executive Assurance',
    text: 'manual',
    weight: 1,
    options: [
      { id: 'q8-low', label: 'Low reliance', riskScore: 10 },
      { id: 'q8-high', label: 'High reliance', riskScore: 70 },
    ],
  },
  {
    code: 'Q9',
    category: 'Technology Verification',
    text: 'footprint',
    weight: 1,
    options: [
      { id: 'q9-low', label: '0–20%', riskScore: 90 },
      { id: 'q9-mid', label: '41–60%', riskScore: 50 },
    ],
  },
  {
    code: 'Q10',
    category: 'Technology Verification',
    text: 'sla',
    weight: 1,
    options: [
      { id: 'q10-hi', label: '81–100%', riskScore: 5 },
      { id: 'q10-unk', label: 'Unknown', riskScore: 75 },
    ],
  },
];

describe('deriveDuplicateCalibrationInputs', () => {
  it('maps Q8/Q9/Q10 answers onto C12/C10/C11 fractions', () => {
    const derived = deriveDuplicateCalibrationInputs(questions, {
      Q8: 'q8-high',
      Q9: 'q9-low',
      Q10: 'q10-hi',
    });
    expect(derived).toEqual({ C12: 0.7, C10: 0.1, C11: 0.9 });
  });

  it('does not overwrite existing calibration values', () => {
    const derived = deriveDuplicateCalibrationInputs(
      questions,
      { Q9: 'q9-mid' },
      { C10: 0.42 },
    );
    expect(derived.C10).toBeUndefined();
  });
});
