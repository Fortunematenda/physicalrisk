import { describe, expect, it } from 'vitest';

import {
  assessmentJourneyStepCount,
  resolveCalibrationBack,
  resolveCalibrationNext,
  resolveJourneyStep,
  resolveQuestionBackToCalibration,
} from './scl-assessment-flow';

describe('SCL continuous assessment flow', () => {
  const cal = 4;
  const questions = 20;
  const total = assessmentJourneyStepCount(cal, questions);

  it('counts calibration + questions + details + review without resetting', () => {
    expect(total).toBe(26);
    expect(resolveJourneyStep({
      phase: 'calibration',
      calStep: 0,
      qIndex: 0,
      calibrationGroupCount: cal,
      questionCount: questions,
    }).label).toBe('Step 1 of 26');

    expect(resolveJourneyStep({
      phase: 'calibration',
      calStep: 3,
      qIndex: 0,
      calibrationGroupCount: cal,
      questionCount: questions,
    }).label).toBe('Step 4 of 26');

    expect(resolveJourneyStep({
      phase: 'questions',
      calStep: 3,
      qIndex: 0,
      calibrationGroupCount: cal,
      questionCount: questions,
    }).label).toBe('Step 5 of 26');

    expect(resolveJourneyStep({
      phase: 'questions',
      calStep: 3,
      qIndex: 19,
      calibrationGroupCount: cal,
      questionCount: questions,
    }).label).toBe('Step 24 of 26');

    expect(resolveJourneyStep({
      phase: 'details',
      calStep: 3,
      qIndex: 19,
      calibrationGroupCount: cal,
      questionCount: questions,
    }).label).toBe('Step 25 of 26');

    expect(resolveJourneyStep({
      phase: 'review',
      calStep: 3,
      qIndex: 19,
      calibrationGroupCount: cal,
      questionCount: questions,
    }).label).toBe('Step 26 of 26');
  });

  it('moves from last calibration group into questions with Next (no Start gate)', () => {
    const blocked = resolveCalibrationNext({
      calStep: 3,
      calibrationGroupCount: cal,
      currentGroupComplete: false,
    });
    expect(blocked.ok).toBe(false);

    const enter = resolveCalibrationNext({
      calStep: 3,
      calibrationGroupCount: cal,
      currentGroupComplete: true,
    });
    expect(enter).toEqual({ ok: true, action: 'enter-questions' });
  });

  it('supports Back from first question into last calibration group', () => {
    expect(resolveQuestionBackToCalibration(cal)).toBe(3);
    expect(resolveCalibrationBack({ calStep: 0 })).toEqual({ action: 'intro' });
    expect(resolveCalibrationBack({ calStep: 2 })).toEqual({ action: 'prev-group', nextCalStep: 1 });
  });
});
