import { describe, expect, it } from 'vitest';

import {
  filterSclActiveTriageQuestions,
  isSclActiveTriageQuestionCode,
  SCL_ACTIVE_TRIAGE_QUESTION_CODES,
  SCL_RETIRED_TRIAGE_QUESTION_CODES,
} from './scl-public-triage';

describe('SCL active triage question set', () => {
  it('keeps website and admin on the same 15 codes', () => {
    expect(SCL_ACTIVE_TRIAGE_QUESTION_CODES).toHaveLength(15);
    expect(SCL_RETIRED_TRIAGE_QUESTION_CODES).toEqual(['Q7', 'Q14', 'Q16', 'Q18', 'Q19']);
  });

  it('filters questions for admin and public UIs', () => {
    const all = [...SCL_ACTIVE_TRIAGE_QUESTION_CODES, ...SCL_RETIRED_TRIAGE_QUESTION_CODES].map(
      (code) => ({ code }),
    );
    expect(filterSclActiveTriageQuestions(all)).toHaveLength(15);
    expect(isSclActiveTriageQuestionCode('Q9')).toBe(true);
    expect(isSclActiveTriageQuestionCode('Q16')).toBe(false);
  });
});
