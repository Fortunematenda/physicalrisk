import { describe, expect, it } from 'vitest';
import { calculateProposalFees } from './proposal-fee-calculations';
import { resolveClientCompany } from './proposal-template-registry';
import { renderPhysicalRiskProposalPdf } from './physical-risk-proposal-pdf';
import type { PhysicalRiskProposalInput } from './proposal-template-types';

function samplePdfInput(): PhysicalRiskProposalInput {
  const feeTotals = calculateProposalFees({
    lineItems: [
      { id: '1', phase: '1', description: 'Phase 1', hours: 80, rate: 985, fee: 78800, sequence: 1 },
      { id: '2', phase: '2', description: 'Phase 2', hours: 60, rate: 1825, fee: 109500, sequence: 2 },
    ],
    discount: 0,
    vatRate: 0.15,
    expensesEstimate: 0,
  });

  return {
    proposalNumber: 'PRP-2026-000001',
    proposalVersion: 1,
    proposalDate: '31 August 2026',
    validUntil: '30 September 2026',
    productCode: 'EXECUTIVE_ADVISORY_DIAGNOSTIC',
    proposalTitle: 'Executive Advisory Diagnostic',
    proposalSubtitle: null,
    clientCompany: 'Enterprise Test (Pty) Ltd',
    clientContact: 'Wayne Test',
    clientPosition: 'CFO',
    clientEmail: 'wayne@physicalrisk.com',
    clientPhone: '+27 11 000 0000',
    clientIndustry: 'Energy / Utilities',
    clientCountry: 'South Africa',
    triageReference: 'EGT-2026-000001',
    assuranceScore: 32,
    assuranceBandLabel: 'Requires priority intervention',
    understandingOfNeeds:
      'Enterprise Test Ltd requires independent assurance following triage completion.',
    objectives: 'Executive governance and provider assurance review',
    scope: 'Diagnostic across key business units',
    approach: 'Structured diagnostic with executive briefing',
    methodology: 'Physical Risk strategy and Total Security Management methodologies',
    deliverables: 'Executive briefing pack and final diagnostic report',
    exclusions: 'Implementation and operational security services',
    assumptions: 'Client provides timely access to stakeholders and documentation',
    statementOfResponsibility: 'Physical Risk provides independent advisory services only.',
    termsAndConditions: 'Standard Physical Risk terms and conditions apply.',
    acceptanceTerms: 'Acceptance by authorised signatory.',
    paymentTerms: '50% on acceptance, 50% on delivery',
    timelineNarrative: 'Approximately 10 weeks',
    estimatedProjectWeeks: 10,
    preparedByName: 'Advisory Team',
    preparedByEmail: 'sales@physicalrisk.com',
    projectSponsor: null,
    projectChampion: null,
    leadConsultant: 'Advisory Team',
    currency: 'ZAR',
    analystHourlyRate: 985,
    specialistHourlyRate: 1825,
    vatRate: 0.15,
    discount: 0,
    expensesEstimate: 0,
    content: {
      phases: [
        {
          sequence: 1,
          name: 'Information Gathering',
          keyActivities: 'Interviews and document review',
          deliverables: 'Current-state summary',
          startWeek: 1,
          endWeek: 4,
        },
      ],
      feeLineItems: [
        { id: '1', phase: '1', description: 'Phase 1', hours: 80, rate: 985, fee: 78800, sequence: 1 },
        { id: '2', phase: '2', description: 'Phase 2', hours: 60, rate: 1825, fee: 109500, sequence: 2 },
      ],
      timelineRows: [
        { name: 'Information Gathering and Assessment', startWeek: 1, endWeek: 4, sequence: 1 },
        { name: 'Define Target State', startWeek: 5, endWeek: 8, sequence: 2 },
        { name: 'Reporting and Executive Briefing', startWeek: 9, endWeek: 11, sequence: 3 },
      ],
      teamMembers: [{ name: 'Lead Consultant', role: 'Project lead', displayOrder: 1 }],
      experienceItems: [],
      methodologyItems: [{ name: 'Strategy Development', description: 'Align security with business objectives' }],
      deliverableSections: [{ title: 'Final report', description: 'Executive diagnostic report' }],
      projectExclusions: ['Implementation services'],
      feeAssumptions: ['Fees exclude VAT unless stated'],
    },
    feeTotals,
  };
}

describe('physical risk proposal PDF v2', () => {
  it('resolves client company with legal name priority', () => {
    expect(
      resolveClientCompany({
        legalName: 'Legal Co',
        organisationName: 'Trading Co',
        leadOrganisationName: 'Lead Co',
      }),
    ).toBe('Legal Co');
  });

  it('renders a non-empty landscape PDF buffer', async () => {
    const input = samplePdfInput();
    const buffer = await renderPhysicalRiskProposalPdf(input);
    expect(buffer.length).toBeGreaterThan(5000);
    expect(buffer.subarray(0, 4).toString('utf8')).toBe('%PDF');
    const text = buffer.toString('latin1');
    expect(text).not.toContain('undefined');
  });

  it('does not add blank pages when footers are drawn after contents back-fill', async () => {
    const buffer = await renderPhysicalRiskProposalPdf(samplePdfInput());
    const pdf = buffer.toString('latin1');
    const pageTypeCount = (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
    const pagesTreeCount = Number(pdf.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/)?.[1] || 0);
    expect(pageTypeCount).toBe(pagesTreeCount);
    expect(pageTypeCount).toBeLessThanOrEqual(20);
  });
});
