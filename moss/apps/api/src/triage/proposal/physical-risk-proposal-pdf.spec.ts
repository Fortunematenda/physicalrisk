import { describe, expect, it } from 'vitest';
import { calculateProposalFees } from './proposal-fee-calculations';
import { resolveClientCompany } from './proposal-template-registry';
import { renderPhysicalRiskProposalPdf } from './physical-risk-proposal-pdf';
import { resolveCoverProductTitle } from './proposal-pdf-chrome';
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
    proposalIntroduction: null,
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
    sitesOrBusinessUnits: 'Head office and regional operations',
    approach: 'Structured diagnostic with executive briefing',
    methodology: 'Physical Risk strategy and Total Security Management methodologies',
    deliverables: 'Executive briefing pack and final diagnostic report',
    exclusions: 'Implementation and operational security services',
    assumptions: 'Client provides timely access to stakeholders and documentation',
    statementOfResponsibility: 'Physical Risk provides independent advisory services only.',
    termsAndConditions: 'Standard Physical Risk terms and conditions apply.',
    acceptanceTerms: 'Acceptance by authorised signatory.',
    paymentTerms: '50% on acceptance, 50% on delivery',
    timelineSummary: 'Approximately 10 weeks',
    timelineNarrative: null,
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
      teamMembers: [{
        name: 'Wayne Hermanson',
        role: 'Lead Consultant',
        projectPosition: 'Project Manager / Physical Security SME',
        biography:
          'Wayne has 37 years experience in 22 African countries. He was a Lieutenant Colonel specializing in counter-insurgency and peacekeeping.',
        relevantAreasOfKnowledge:
          'Physical Risk Management\nCrisis Risk Management\nFraud Risk Management\nISO-aligned Physical Risk Interventions',
        displayOrder: 1,
      }],
      experienceItems: [
        {
          clientName: 'Mining Client',
          description: 'Operating environment stability for mining operations in Angola (1996).',
          displayOrder: 1,
        },
      ],
      methodologyItems: [{ name: 'Strategy Development', description: 'Align security with business objectives' }],
      deliverableSections: [{ title: 'Final report', description: 'Executive diagnostic report' }],
      projectExclusions: ['Implementation services'],
      feeAssumptions: ['Fees exclude VAT unless stated'],
    },
    feeTotals,
  };
}

describe('physical risk proposal PDF v2', () => {
  it('resolves cover product title to Executive Advisory Diagnostic for EAD', () => {
    expect(
      resolveCoverProductTitle(
        'Bretune Technologies — Executive Advisory Diagnostic',
        'EXECUTIVE_ADVISORY_DIAGNOSTIC',
      ),
    ).toBe('Executive Advisory Diagnostic');
    expect(resolveCoverProductTitle('Executive Governance Diagnostic', 'EXECUTIVE_ADVISORY_DIAGNOSTIC'))
      .toBe('Executive Advisory Diagnostic');
    expect(resolveCoverProductTitle('Executive Advisory Diagnostic', 'EXECUTIVE_ADVISORY_DIAGNOSTIC'))
      .toBe('Executive Advisory Diagnostic');
  });

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

  it('maps Scope / Approach DB fields into the PDF for long HTML content', async () => {
    const input = samplePdfInput();
    input.objectives =
      '<p>Client objectives paragraph one with enough text to prove mapping.</p><p>Second objectives paragraph.</p>';
    input.scope =
      '<p>Indicative scope paragraph describing the engagement boundary in detail for the client.</p>';
    input.sitesOrBusinessUnits = '81–100 sites';
    input.exclusions =
      '<p>Implementation of recommendations and certification are excluded from this engagement.</p>';
    input.approach =
      '<p>Dear Fortune, thank you for completing triage. This approach narrative must appear in the PDF body.</p>';
    const buffer = await renderPhysicalRiskProposalPdf(input);
    expect(buffer.length).toBeGreaterThan(5000);

    // Inflate streams and assert labels + body text were painted.
    const zlib = await import('zlib');
    const raw = buffer.toString('latin1');
    const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let all = '';
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      const chunk = Buffer.from(m[1], 'latin1');
      try {
        all += zlib.inflateSync(chunk).toString('latin1');
      } catch {
        all += chunk.toString('latin1');
      }
    }
    // PDFKit may encode as hex; also check raw buffer for literal fragments.
    const hay = `${all}\n${raw}`;
    expect(hay.includes('Client objectives') || /Client objectives/.test(hay)).toBe(true);
    expect(hay.includes('Indicative scope') || /Indicative scope/.test(hay)).toBe(true);
    expect(hay.includes('Exclusions') || /Exclusions/.test(hay)).toBe(true);
    expect(hay.includes('Approach') || /Approach/.test(hay)).toBe(true);
    expect(hay.includes('81') || hay.includes('100 sites')).toBe(true);
  });

  it('includes custom section titles in the Contents page', async () => {
    const input = samplePdfInput();
    input.content.customSections = [
      {
        id: 'custom-1',
        title: 'Risk governance workshop',
        body: '<p>Custom workshop scope and outcomes for the client leadership team.</p>',
        sequence: 1,
        pageBreak: true,
      },
    ];
    input.content.sectionHeadings = {
      methodology: 'Our methodology',
    };
    const buffer = await renderPhysicalRiskProposalPdf(input);
    const zlib = await import('zlib');
    const raw = buffer.toString('latin1');
    const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let all = '';
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      const chunk = Buffer.from(m[1], 'latin1');
      try {
        all += zlib.inflateSync(chunk).toString('latin1');
      } catch {
        all += chunk.toString('latin1');
      }
    }
    const hay = `${all}\n${raw}`;
    expect(hay.includes('Risk governance workshop')).toBe(true);
    expect(hay.includes('Our methodology')).toBe(true);
  });

  it('renders timeline narrative html without leaking tags', async () => {
    const input = samplePdfInput();
    input.timelineNarrative =
      '<p>Enterprise Test Ltd requires an independent, evidence-led review of executive assurance arrangements following completion of the Executive Governance Triage (EGT-2026-000001). Physical Risk will assess governance effectiveness across the agreed scope. Our proposed timeline is illustrated below:</p>'
      + '<p>Enterprise Test Ltd requires an independent, evidence-led review of executive assurance arrangements following completion of the Executive Governance Triage (EGT-2026-000001). Physical Risk will assess governance effectiveness across the agreed scope. Our proposed timeline is illustrated below:</p>';
    const buffer = await renderPhysicalRiskProposalPdf(input);
    const text = buffer.toString('latin1');
    expect(text).not.toMatch(/<p>/i);
    expect(text).not.toMatch(/<\/p>/i);
  });

  it('renders appendix A terms from template when admin field is blank', async () => {
    const input = samplePdfInput();
    input.termsAndConditions = '';
    const buffer = await renderPhysicalRiskProposalPdf(input);
    const text = buffer.toString('latin1');
    // Fallback paragraph is still drawn (PDFKit may split words across operators).
    expect(text).toMatch(/written agreement/i);
    expect(buffer.length).toBeGreaterThan(5000);
  });

  it('does not add blank pages when footers are drawn after contents back-fill', async () => {
    const buffer = await renderPhysicalRiskProposalPdf(samplePdfInput());
    const pdf = buffer.toString('latin1');
    const pageTypeCount = (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
    const pagesTreeCount = Number(pdf.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/)?.[1] || 0);
    expect(pageTypeCount).toBe(pagesTreeCount);
    expect(pageTypeCount).toBeLessThanOrEqual(20);
  });

  it('flows long Understanding your needs content onto a continuation page', async () => {
    const input = samplePdfInput();
    // Use unique paragraphs so dedupeRepeatedNarrative does not collapse them.
    const paragraphs = Array.from({ length: 12 }, (_, i) => {
      const sentence = `Unique assurance need block ${i + 1} covers stakeholder interviews, control evidence, and executive briefing preparation for the diagnostic engagement.`;
      return `<p>${sentence} ${sentence} ${sentence} ${sentence}</p>`;
    }).join('');
    input.understandingOfNeeds = paragraphs;

    const shortBuffer = await renderPhysicalRiskProposalPdf(samplePdfInput());
    const longBuffer = await renderPhysicalRiskProposalPdf(input);
    const shortPages = (shortBuffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    const longPages = (longBuffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

    // Landscape slides have limited vertical room — long Understanding must add pages.
    expect(longPages).toBeGreaterThan(shortPages);
    expect(longBuffer.length).toBeGreaterThan(shortBuffer.length);
  });
});
