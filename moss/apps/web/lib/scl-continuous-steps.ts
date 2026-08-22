import type { InputDef, Question } from './scl-assessment-types';
import { SCL_QUESTIONNAIRE_DUPLICATE_INPUT_CODES } from './scl-questionnaire-calibration-bridge';

export type SclFlowStep =
  | { kind: 'input'; def: InputDef; index: number }
  | { kind: 'question'; question: Question; index: number }
  | { kind: 'contact' };

/**
 * Calibration codes captured on the final executive-details step — do not ask earlier.
 * C1 = organisation name, C2 = industry, C3 = total sites / facilities,
 * C5 = annual security contract / expenditure value.
 */
export const SCL_CONTACT_STEP_INPUT_CODES = new Set(['C1', 'C2', 'C3', 'C5']);

/** Public /start journey: questionnaire + contact only (calibration deferred). */
export const SCL_PUBLIC_OMIT_CALIBRATION_STEPS = true;

/** Skip early when already asked at contact or again in the scored questionnaire. */
export function isSkippedCalibrationInput(code: string): boolean {
  return SCL_CONTACT_STEP_INPUT_CODES.has(code) || SCL_QUESTIONNAIRE_DUPLICATE_INPUT_CODES.has(code);
}

/** Methodology defaults for calibration inputs not shown in the public UI. */
export function calibrationDefaultsFromDefinitions(
  inputDefinitions: InputDef[] | undefined | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const def of inputDefinitions || []) {
    if (def.defaultValue !== undefined && def.defaultValue !== null && def.defaultValue !== '') {
      out[def.code] = def.defaultValue;
    }
  }
  return out;
}

/** Flatten calibration inputs + questionnaire into one continuous assessment journey. */
export function buildSclFlowSteps(
  inputDefinitions: InputDef[],
  questions: Question[],
): SclFlowStep[] {
  const inputs = SCL_PUBLIC_OMIT_CALIBRATION_STEPS
    ? []
    : (inputDefinitions || [])
        .filter((def) => !isSkippedCalibrationInput(def.code))
        .map((def, index) => ({
          kind: 'input' as const,
          def,
          index,
        }));
  const qs = (questions || []).map((question, index) => ({
    kind: 'question' as const,
    question,
    index,
  }));
  return [...inputs, ...qs, { kind: 'contact' }];
}

export function sclStepLabel(step: SclFlowStep | undefined): string {
  if (!step) return 'Assessment';
  if (step.kind === 'contact') return 'Your details';
  if (step.kind === 'input') return 'Executive calibration';
  return step.question.category || 'Security Cost Leakage';
}
