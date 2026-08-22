import { describe, expect, it } from 'vitest';

import { isJobTitleValueComplete, SCL_JOB_TITLE_OPTIONS } from './scl-assessment-types';

describe('SCL job title options', () => {
  it('includes Other for custom titles', () => {
    expect(SCL_JOB_TITLE_OPTIONS).toContain('Other');
    expect(SCL_JOB_TITLE_OPTIONS).toContain('CFO');
  });

  it('requires a selection or custom text when Other is chosen', () => {
    expect(isJobTitleValueComplete('')).toBe(false);
    expect(isJobTitleValueComplete('Other')).toBe(false);
    expect(isJobTitleValueComplete('CFO')).toBe(true);
    expect(isJobTitleValueComplete('Head of Corporate Security')).toBe(true);
  });
});
