import { describe, expect, it } from 'vitest';
import { ClientInterest, CommercialStage, ProposalStatus, TriageProposalStatus } from '@prisma/client';
import {
  buildCommercialWorkspace,
  canCreateLevel2,
  commercialWorkflowSteps,
  resolveCommercialStage,
  resolvePrimaryCta,
} from '../common/triage-commercial';
import {
  buildProposalContextSnapshot,
  readProposalContextSnapshot,
} from '../common/triage-proposal-context';

describe('Stage 3 proposal context snapshot', () => {
  const lead = {
    firstName: 'Wayne',
    lastName: 'Test',
    email: 'wayne@physicalrisk.com',
    phone: '+27123456789',
    organisationName: 'Enterprise Test Ltd',
    industry: 'Energy / Utilities',
    completedAt: new Date('2026-08-31'),
  };

  const assessment = {
    id: 'egt-assessment-1',
    reference: 'EGT-2026-000001',
    inputValues: [
      { inputDefinition: { code: 'C3' }, value: 'SITES_100_PLUS' },
      { inputDefinition: { code: 'C5' }, value: 'SECURITY_SPEND_200M_PLUS' },
    ],
    scoreSnapshots: [
      {
        overallRiskScore: 68,
        maturityScore: 32,
        categoryScores: [
          { category: 'Executive Assurance', score: 20 },
          { category: 'Technology Verification', score: 35 },
          { category: 'Loss, Reporting & Value', score: 28 },
        ],
      },
    ],
  };

  it('captures assurance score unchanged from triage (A/E)', () => {
    const snapshot = buildProposalContextSnapshot({
      lead,
      assessment,
      qualification: {
        jobTitle: 'CFO',
        country: 'South Africa',
        primaryConcern: 'Provider assurance gaps',
        operationalSitesLabel: 'More than 100 sites',
        securityExpenditureLabel: 'Above R200 million',
      },
    });
    expect(snapshot.triageReference).toBe('EGT-2026-000001');
    expect(snapshot.assuranceScore).toBe(32);
    expect(snapshot.organisation.operationalSitesLabel).toBe('More than 100 sites');
    expect(snapshot.organisation.securityExpenditureLabel).toBe('Above R200 million');
    expect(snapshot.recommendedProductCode).toBe('EXECUTIVE_ADVISORY_DIAGNOSTIC');
    expect(readProposalContextSnapshot(snapshot)?.assuranceScore).toBe(32);
  });

  it('links prospect and organisation without duplicating entities (B/C)', () => {
    const snapshot = buildProposalContextSnapshot({ lead, assessment });
    expect(snapshot.prospect.email).toBe('wayne@physicalrisk.com');
    expect(snapshot.organisation.name).toBe('Enterprise Test Ltd');
  });
});

describe('Stage 3 commercial workspace', () => {
  const snapshot = buildProposalContextSnapshot({
    lead: {
      firstName: 'Wayne',
      lastName: 'Test',
      email: 'wayne@physicalrisk.com',
      phone: '+27123456789',
      organisationName: 'Enterprise Test Ltd',
      industry: 'Energy / Utilities',
      completedAt: new Date(),
    },
    assessment: {
      id: 'egt-1',
      reference: 'EGT-2026-000001',
      inputValues: [],
      scoreSnapshots: [{ overallRiskScore: 68, maturityScore: 32, categoryScores: [] }],
    },
    qualification: {
      operationalSitesLabel: 'More than 100 sites',
      securityExpenditureLabel: 'Above R200 million',
    },
  });

  it('builds admin workspace from linked proposal draft (D/F)', () => {
    const workspace = buildCommercialWorkspace({
      lead: {
        firstName: 'Wayne',
        lastName: 'Test',
        email: 'wayne@physicalrisk.com',
        phone: '+27123456789',
        organisationName: 'Enterprise Test Ltd',
        industry: 'Energy / Utilities',
        proposalReference: 'PRP-2026-000001',
        proposalRequestedAt: new Date('2026-08-31'),
        proposalStatus: ProposalStatus.REQUESTED,
        scopeClientObjectives: null,
        scopeSitesOrBusinessUnits: null,
        scopeIndicativeScope: null,
        scopeExpectedTimeline: null,
        scopeCommercialNotes: null,
      },
      activeProposal: {
        id: 'prop-1',
        proposalNumber: 'PRP-2026-000001',
        status: TriageProposalStatus.DRAFT,
        contextSnapshot: snapshot,
        objectives: null,
        scopeSummary: null,
        sitesOrBusinessUnits: null,
        timeline: null,
        fee: null,
        currency: 'ZAR',
        terms: null,
        documentStorageKey: null,
        documentFileName: null,
        documentMimeType: null,
        updatedAt: new Date('2026-08-31'),
        sentAt: null,
        acceptedAt: null,
      },
      assessmentReference: 'EGT-2026-000001',
    });

    expect(workspace.proposalRequest?.reference).toBe('PRP-2026-000001');
    expect(workspace.proposalRequest?.sourceTriageReference).toBe('EGT-2026-000001');
    expect(workspace.triageIndication?.assuranceScore).toBe(32);
    expect(workspace.organisation.operationalSitesLabel).toBe('More than 100 sites');
    expect(workspace.prospect.firstName).toBe('Wayne');
  });
});

describe('Stage 3 workflow gating', () => {
  const base = {
    completedAt: new Date('2026-08-01'),
    reviewedAt: new Date('2026-08-02'),
    contactedAt: new Date('2026-08-03'),
    closedAt: null,
    convertedAt: null,
    convertedAssessmentId: null,
    proposalStatus: ProposalStatus.REQUESTED,
    proposalRequestedAt: new Date('2026-08-04'),
    clientInterest: ClientInterest.INTERESTED,
    scopeClientObjectives: null,
    scopeIndicativeScope: null,
    scopeSitesOrBusinessUnits: null,
  };

  it('blocks Level 2 before acceptance (H)', () => {
    const stage = resolveCommercialStage(base, {
      latestProposal: { status: TriageProposalStatus.DRAFT, hasDocument: true },
    });
    expect(canCreateLevel2(base, stage).allowed).toBe(false);
  });

  it('allows Level 2 after acceptance (I)', () => {
    const lead = { ...base, proposalStatus: ProposalStatus.ACCEPTED };
    const stage = resolveCommercialStage(lead, {
      latestProposal: { status: TriageProposalStatus.ACCEPTED, hasDocument: true },
    });
    expect(canCreateLevel2(lead, stage).allowed).toBe(true);
    expect(resolvePrimaryCta(lead, stage).kind).toBe('create_level2');
  });

  it('derives proposal requested workflow step from real state', () => {
    const steps = commercialWorkflowSteps(base, CommercialStage.PROPOSAL_DRAFT, {
      latestProposal: { status: TriageProposalStatus.DRAFT, hasDocument: false },
    });
    const requested = steps.find((s) => s.label === 'Proposal requested');
    expect(requested?.state).toBe('done');
  });

  it('primary CTA prefers Send proposal when document is ready', () => {
    const stage = CommercialStage.PROPOSAL_DRAFT;
    const cta = resolvePrimaryCta(base, stage, {
      status: TriageProposalStatus.DRAFT,
      hasDocument: true,
    });
    expect(cta.kind).toBe('complete_proposal');
    expect(cta).toMatchObject({ label: 'Send proposal' });
  });
});
