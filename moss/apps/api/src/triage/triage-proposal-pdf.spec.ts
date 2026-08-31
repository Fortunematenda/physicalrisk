import { describe, expect, it } from 'vitest';
import {
  buildProposalPdfDefaults,
  renderExecutiveAdvisoryProposalPdf,
} from './triage-proposal-pdf';

describe('executive advisory proposal PDF', () => {
  const base = {
    proposalNumber: 'PRP-2026-000001',
    organisationName: 'Enterprise Test Ltd',
    prospectName: 'Wayne Test',
    prospectJobTitle: 'CFO',
    prospectEmail: 'wayne@physicalrisk.com',
    industry: 'Energy / Utilities',
    country: 'South Africa',
    sourceTriageReference: 'EGT-2026-000001',
    assuranceScore: 32,
    assuranceBandLabel: 'Requires priority intervention',
    strongestIndicators: ['Executive Assurance', 'Technology Verification'],
    primaryConcern: 'Provider assurance gaps',
    clientObjective: 'Executive governance and provider assurance review',
    sitesOrBusinessUnits: 'More than 100 sites',
    indicativeScope: 'Executive governance and provider assurance review',
    timeline: '2 weeks',
    fee: 150000,
    currency: 'ZAR',
    deliverables: null,
    terms: null,
    introduction: null,
    preparedByName: 'Advisory Team',
    preparedByEmail: 'sales@physicalrisk.com',
    validUntilLabel: null,
    issuedDateLabel: '31 August 2026',
  };

  it('builds professional default letter content', () => {
    const defaults = buildProposalPdfDefaults(base);
    expect(defaults.introduction).toContain('Dear Wayne');
    expect(defaults.introduction).toContain('Enterprise Test Ltd');
    expect(defaults.deliverables).toContain('Executive briefing pack');
    expect(defaults.terms).toContain('Professional fee');
  });

  it('renders a non-empty PDF buffer with letterhead content', async () => {
    const buffer = await renderExecutiveAdvisoryProposalPdf(base);
    expect(buffer.length).toBeGreaterThan(2000);
    expect(buffer.subarray(0, 4).toString('utf8')).toBe('%PDF');
  });
});
