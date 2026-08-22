/**
 * Continuous SCL public assessment journey helpers.
 * Calibration + questionnaire share one step counter (no mid-flow reset).
 */

export type AssessmentPhase =
  | 'intro'
  | 'calibration'
  | 'questions'
  | 'details'
  | 'review'
  | 'thanks';

export function assessmentBodyStepCount(calibrationGroupCount: number, questionCount: number) {
  return Math.max(0, calibrationGroupCount) + Math.max(0, questionCount);
}

/** Total steps shown in the journey progress (body + contact + review). */
export function assessmentJourneyStepCount(calibrationGroupCount: number, questionCount: number) {
  return assessmentBodyStepCount(calibrationGroupCount, questionCount) + 2;
}

export function resolveJourneyStep(params: {
  phase: AssessmentPhase;
  calStep: number;
  qIndex: number;
  calibrationGroupCount: number;
  questionCount: number;
}): { step: number; total: number; label: string } {
  const { phase, calStep, qIndex, calibrationGroupCount, questionCount } = params;
  const total = assessmentJourneyStepCount(calibrationGroupCount, questionCount);
  const body = assessmentBodyStepCount(calibrationGroupCount, questionCount);

  if (phase === 'calibration') {
    const step = Math.min(Math.max(calStep, 0), Math.max(calibrationGroupCount - 1, 0)) + 1;
    return { step, total, label: `Step ${step} of ${total}` };
  }
  if (phase === 'questions') {
    const step = calibrationGroupCount + Math.min(Math.max(qIndex, 0), Math.max(questionCount - 1, 0)) + 1;
    return { step, total, label: `Step ${step} of ${total}` };
  }
  if (phase === 'details') {
    const step = body + 1;
    return { step, total, label: `Step ${step} of ${total}` };
  }
  if (phase === 'review') {
    const step = body + 2;
    return { step, total, label: `Step ${step} of ${total}` };
  }
  return { step: 0, total, label: '' };
}

export function resolveCalibrationNext(params: {
  calStep: number;
  calibrationGroupCount: number;
  currentGroupComplete: boolean;
}):
  | { ok: true; action: 'next-group'; nextCalStep: number }
  | { ok: true; action: 'enter-questions' }
  | { ok: false; error: string } {
  const { calStep, calibrationGroupCount, currentGroupComplete } = params;
  if (!currentGroupComplete) {
    return { ok: false, error: 'Please complete the required fields before continuing.' };
  }
  if (calStep < calibrationGroupCount - 1) {
    return { ok: true, action: 'next-group', nextCalStep: calStep + 1 };
  }
  return { ok: true, action: 'enter-questions' };
}

export function resolveCalibrationBack(params: {
  calStep: number;
}): { action: 'prev-group'; nextCalStep: number } | { action: 'intro' } {
  if (params.calStep <= 0) return { action: 'intro' };
  return { action: 'prev-group', nextCalStep: params.calStep - 1 };
}

export function resolveQuestionBackToCalibration(calibrationGroupCount: number) {
  return Math.max(0, calibrationGroupCount - 1);
}
