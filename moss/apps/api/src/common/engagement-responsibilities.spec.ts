import { describe, expect, it } from 'vitest';
import {
  ENGAGEMENT_RESPONSIBILITIES,
  eligibleResponsibilityKeys,
  responsibilityForAssignmentRole,
  validateResponsibilitySet,
} from './engagement-responsibilities';
import { APPROVER_ROLES, SOMOD_APPROVER_ROLES, hasRole } from './roles';

describe('Engagement responsibilities', () => {
  it('maps every responsibility onto an existing assignment role', () => {
    expect(responsibilityForAssignmentRole('PRIMARY_ANALYST')?.key).toBe('ENGAGEMENT_LEAD');
    expect(responsibilityForAssignmentRole('CONTRIBUTOR')?.key).toBe('CONSULTANT');
    expect(responsibilityForAssignmentRole('SENIOR_REVIEWER')?.key).toBe('REVIEWER');
    expect(responsibilityForAssignmentRole('APPROVER')?.key).toBe('APPROVER');
    expect(ENGAGEMENT_RESPONSIBILITIES.filter((r) => r.singleHolder).map((r) => r.key)).toEqual(['ENGAGEMENT_LEAD']);
  });

  it('allows several independent responsibilities for one eligible person', () => {
    expect(validateResponsibilitySet('REVIEWER', ['reviewer', 'APPROVER', 'CONSULTANT', 'APPROVER'])).toEqual([
      'REVIEWER',
      'APPROVER',
      'CONSULTANT',
    ]);
  });

  it('keeps analysts out of reviewer and approver responsibilities', () => {
    expect(eligibleResponsibilityKeys('ANALYST')).toEqual(['ENGAGEMENT_LEAD', 'CONSULTANT']);
    expect(() => validateResponsibilitySet('ANALYST', ['APPROVER'])).toThrow(/Approver/);
    expect(() => validateResponsibilitySet('ANALYST', ['REVIEWER'])).toThrow(/Reviewer/);
  });

  it('gives client, sales and auditor users no engagement responsibilities', () => {
    for (const role of ['CLIENT_EXECUTIVE', 'CLIENT_CONTRIBUTOR', 'SALES', 'AUDITOR', 'METHODOLOGY_ADMIN']) {
      expect(eligibleResponsibilityKeys(role)).toEqual([]);
    }
  });

  it('rejects unknown responsibilities', () => {
    expect(() => validateResponsibilitySet('SUPER_ADMIN', ['OWNER'])).toThrow(/Unknown/);
  });

  it('does not change who the platform allows to approve', () => {
    // Responsibilities are labels on an engagement; approval stays platform-role based.
    expect(hasRole({ id: 'a', email: 'a', role: 'ANALYST' }, APPROVER_ROLES)).toBe(true);
    expect(hasRole({ id: 'a', email: 'a', role: 'ANALYST' }, SOMOD_APPROVER_ROLES)).toBe(false);
  });
});
