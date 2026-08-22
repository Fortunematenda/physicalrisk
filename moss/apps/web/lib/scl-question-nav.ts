/**
 * Pure helpers for SCL questionnaire step navigation.
 * Keeps Next/Back behaviour testable without mounting React.
 */

export type NavResult =
  | { ok: true; nextIndex: number }
  | { ok: false; error: string; nextIndex: number };

export function resolveNextQuestion(params: {
  qIndex: number;
  questionCount: number;
  hasAnswer: boolean;
}): NavResult {
  const { qIndex, questionCount, hasAnswer } = params;
  if (questionCount <= 0) {
    return { ok: false, error: 'No questions available.', nextIndex: qIndex };
  }
  if (!hasAnswer) {
    return {
      ok: false,
      error: 'Please select an answer before continuing.',
      nextIndex: qIndex,
    };
  }
  if (qIndex >= questionCount - 1) {
    return { ok: true, nextIndex: qIndex };
  }
  return { ok: true, nextIndex: qIndex + 1 };
}

export function resolvePrevQuestion(params: {
  qIndex: number;
}): { nextIndex: number; leaveToCalibration: boolean } {
  if (params.qIndex <= 0) {
    return { nextIndex: 0, leaveToCalibration: true };
  }
  return { nextIndex: params.qIndex - 1, leaveToCalibration: false };
}

/** Simulate a full Q1→Qn walk using Next after each answer. */
export function walkForwardMatrix(questionCodes: string[]) {
  const responses: Record<string, string> = {};
  let qIndex = 0;
  const rows: Array<{
    code: string;
    index: number;
    nextWithoutAnswer: 'blocked';
    nextWithAnswer: 'advanced' | 'stayed-last';
    backWorks: boolean;
  }> = [];

  for (let i = 0; i < questionCodes.length; i += 1) {
    const code = questionCodes[i];
    const blocked = resolveNextQuestion({
      qIndex,
      questionCount: questionCodes.length,
      hasAnswer: false,
    });
    responses[code] = `opt-${code}`;
    const advanced = resolveNextQuestion({
      qIndex,
      questionCount: questionCodes.length,
      hasAnswer: true,
    });
    const back = resolvePrevQuestion({ qIndex });
    rows.push({
      code,
      index: qIndex,
      nextWithoutAnswer: blocked.ok ? ('advanced' as never) : 'blocked',
      nextWithAnswer: advanced.nextIndex > qIndex ? 'advanced' : 'stayed-last',
      backWorks: qIndex === 0 ? back.leaveToCalibration : back.nextIndex === qIndex - 1,
    });
    qIndex = advanced.nextIndex;
  }

  return rows;
}
