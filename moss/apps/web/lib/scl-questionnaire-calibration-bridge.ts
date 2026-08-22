import type { Question } from './scl-assessment-types';

/**
 * Calibration inputs that duplicate questionnaire questions (same topic asked twice).
 * Keep asking the questionnaire versions (risk-scored); derive these for leakage.
 *
 * C10 ↔ Q9  technology footprint coverage
 * C11 ↔ Q10 technology used for SLA verification
 * C12 ↔ Q8  manual security records reliance
 */
export const SCL_QUESTIONNAIRE_DUPLICATE_INPUT_CODES = new Set(['C10', 'C11', 'C12']);

const PCT_BAND_TO_FRACTION: Array<{ match: RegExp; fraction: number }> = [
  { match: /^0\s*[–\-]\s*20\s*%?$/i, fraction: 0.1 },
  { match: /^21\s*[–\-]\s*40\s*%?$/i, fraction: 0.3 },
  { match: /^41\s*[–\-]\s*60\s*%?$/i, fraction: 0.5 },
  { match: /^61\s*[–\-]\s*80\s*%?$/i, fraction: 0.7 },
  { match: /^81\s*[–\-]\s*100\s*%?$/i, fraction: 0.9 },
  { match: /^unknown$/i, fraction: 0.5 },
];

const RELIANCE_TO_FRACTION: Array<{ match: RegExp; fraction: number }> = [
  { match: /low\s+reliance/i, fraction: 0.15 },
  { match: /moderate\s+reliance/i, fraction: 0.4 },
  { match: /high\s+reliance/i, fraction: 0.7 },
  { match: /almost\s+entirely\s+manual/i, fraction: 0.9 },
];

function optionLabelFor(
  questions: Question[],
  questionCode: string,
  responseOptionId: string | undefined,
): string | undefined {
  if (!responseOptionId) return undefined;
  const question = questions.find((q) => q.code === questionCode);
  return question?.options.find((o) => o.id === responseOptionId)?.label;
}

function fractionFromPctBandLabel(label: string | undefined): number | undefined {
  if (!label) return undefined;
  const trimmed = label.trim();
  for (const row of PCT_BAND_TO_FRACTION) {
    if (row.match.test(trimmed)) return row.fraction;
  }
  return undefined;
}

function fractionFromRelianceLabel(label: string | undefined): number | undefined {
  if (!label) return undefined;
  for (const row of RELIANCE_TO_FRACTION) {
    if (row.match.test(label)) return row.fraction;
  }
  return undefined;
}

/**
 * Fill C10–C12 from Q9/Q10/Q8 when those calibration steps were skipped in the UI.
 * Does not overwrite an existing explicit calibration value.
 */
export function deriveDuplicateCalibrationInputs(
  questions: Question[],
  responses: Record<string, string>,
  existingInputs: Record<string, unknown> = {},
): Record<string, unknown> {
  const derived: Record<string, unknown> = {};

  const q9 = fractionFromPctBandLabel(optionLabelFor(questions, 'Q9', responses.Q9));
  if (q9 !== undefined && (existingInputs.C10 === undefined || existingInputs.C10 === null || existingInputs.C10 === '')) {
    derived.C10 = q9;
  }

  const q10 = fractionFromPctBandLabel(optionLabelFor(questions, 'Q10', responses.Q10));
  if (q10 !== undefined && (existingInputs.C11 === undefined || existingInputs.C11 === null || existingInputs.C11 === '')) {
    derived.C11 = q10;
  }

  const q8 = fractionFromRelianceLabel(optionLabelFor(questions, 'Q8', responses.Q8));
  if (q8 !== undefined && (existingInputs.C12 === undefined || existingInputs.C12 === null || existingInputs.C12 === '')) {
    derived.C12 = q8;
  }

  return derived;
}
