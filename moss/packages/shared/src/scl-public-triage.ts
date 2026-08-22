/**
 * Active SCLI public/executive triage question set (15 of 20).
 * Website `/start` and analyst/admin assessment UIs must stay in sync.
 * Omitted (overlap): Q7, Q14, Q16, Q18, Q19 — kept in DB for history/rules but not shown.
 */
export const SCL_ACTIVE_TRIAGE_QUESTION_CODES = [
  'Q1',
  'Q2',
  'Q3',
  'Q4',
  'Q5',
  'Q6',
  'Q8',
  'Q9',
  'Q10',
  'Q11',
  'Q12',
  'Q13',
  'Q15',
  'Q17',
  'Q20',
] as const;

export type SclActiveTriageQuestionCode = (typeof SCL_ACTIVE_TRIAGE_QUESTION_CODES)[number];

const ACTIVE_SET = new Set<string>(SCL_ACTIVE_TRIAGE_QUESTION_CODES);

/** Codes retired from the active triage (overlap / speed). */
export const SCL_RETIRED_TRIAGE_QUESTION_CODES = [
  'Q7',
  'Q14',
  'Q16',
  'Q18',
  'Q19',
] as const;

export function isSclActiveTriageQuestionCode(code: string | null | undefined): boolean {
  return ACTIVE_SET.has(String(code || '').trim());
}

export function filterSclActiveTriageQuestions<T extends { code: string }>(questions: T[]): T[] {
  return (questions || []).filter((q) => isSclActiveTriageQuestionCode(q.code));
}
