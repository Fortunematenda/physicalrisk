import { describe, expect, it } from 'vitest';
import { isLegacyShield360ProductCode } from '@moss/shared';

describe('Stage 12 comprehensive proposal UI guards', () => {
  it('never treats Shield 360 as an active recommendation option', () => {
    expect(isLegacyShield360ProductCode('SHIELD360')).toBe(true);
    expect(isLegacyShield360ProductCode('SCLI_COST_LEAKAGE')).toBe(false);
  });

  it('builds workspace href under advisory for follow-on proposals', () => {
    const eadId = 'ead_1';
    const leadId = 'lead_1';
    const proposalId = 'prp_1';
    const href = `/advisory/${eadId}/proposal?proposalId=${proposalId}&leadId=${leadId}`;
    expect(href).toContain('proposalId=prp_1');
    expect(href).toContain('/advisory/');
    expect(href).not.toContain('/triage/');
  });
});
