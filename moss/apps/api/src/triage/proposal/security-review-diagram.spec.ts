import { describe, expect, it } from 'vitest';
import { SECURITY_REVIEW_STAGES } from './security-review-diagram';

describe('security review diagram stages', () => {
  it('matches the PPT reference labels and order', () => {
    const titles = SECURITY_REVIEW_STAGES.map((s) => s.title);
    expect(titles).toEqual([
      'Security Risk Assessment',
      'Best practice',
      'Policies & Procedures',
      'Legislation',
      'Intelligent',
      'Contracts',
      'Strategy',
    ]);
  });

  it('places words above and below the steps', () => {
    const places = SECURITY_REVIEW_STAGES.map((s) => s.place);
    expect(places).toEqual([
      'above',
      'below',
      'above',
      'below',
      'above',
      'below',
      'right',
    ]);
  });
});
