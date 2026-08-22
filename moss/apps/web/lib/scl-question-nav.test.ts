import { describe, expect, it } from 'vitest';

import { resolveNextQuestion, resolvePrevQuestion, walkForwardMatrix } from './scl-question-nav';

describe('SCL question navigation', () => {
  const codes = Array.from({ length: 20 }, (_, i) => `Q${i + 1}`);

  it('blocks Next when the current question has no answer', () => {
    const result = resolveNextQuestion({ qIndex: 3, questionCount: 20, hasAnswer: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/select an answer/i);
      expect(result.nextIndex).toBe(3);
    }
  });

  it('advances Next when answered and not on the last question', () => {
    const result = resolveNextQuestion({ qIndex: 3, questionCount: 20, hasAnswer: true });
    expect(result).toEqual({ ok: true, nextIndex: 4 });
  });

  it('stays on the last question when answered', () => {
    const result = resolveNextQuestion({ qIndex: 19, questionCount: 20, hasAnswer: true });
    expect(result).toEqual({ ok: true, nextIndex: 19 });
  });

  it('Back from Q1 leaves to calibration', () => {
    expect(resolvePrevQuestion({ qIndex: 0 })).toEqual({ nextIndex: 0, leaveToCalibration: true });
  });

  it('Back from later questions decrements', () => {
    expect(resolvePrevQuestion({ qIndex: 7 })).toEqual({ nextIndex: 6, leaveToCalibration: false });
  });

  it('walks every SCLI question with Next after each answer', () => {
    const rows = walkForwardMatrix(codes);
    expect(rows).toHaveLength(20);
    for (const row of rows) {
      expect(row.nextWithoutAnswer).toBe('blocked');
      expect(row.backWorks).toBe(true);
      if (row.index < 19) {
        expect(row.nextWithAnswer).toBe('advanced');
      } else {
        expect(row.nextWithAnswer).toBe('stayed-last');
      }
    }
  });
});
