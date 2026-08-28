import { describe, expect, it } from 'vitest';
import { ClientInterest, CommercialStage, ProposalStatus, TriageProposalStatus } from '@prisma/client';
import {
  canCreateLevel2,
  resolveCommercialStage,
  resolvePrimaryCta,
} from './triage-commercial';

describe('triage commercial stage', () => {
  const base = {
    completedAt: new Date('2026-08-01'),
    reviewedAt: null,
    contactedAt: null,
    closedAt: null,
    convertedAt: null,
    convertedAssessmentId: null,
    proposalStatus: ProposalStatus.NOT_REQUESTED,
    clientInterest: ClientInterest.UNKNOWN,
    scopeClientObjectives: null,
    scopeIndicativeScope: null,
    scopeSitesOrBusinessUnits: null,
  };

  it('starts at TRIAGE_COMPLETED after questionnaire', () => {
    expect(resolveCommercialStage(base)).toBe(CommercialStage.TRIAGE_COMPLETED);
  });

  it('moves to UNDER_REVIEW when reviewed', () => {
    expect(
      resolveCommercialStage({ ...base, reviewedAt: new Date('2026-08-02') }),
    ).toBe(CommercialStage.UNDER_REVIEW);
  });

  it('requires proposal acceptance before Level 2', () => {
    const stage = resolveCommercialStage({
      ...base,
      reviewedAt: new Date(),
      contactedAt: new Date(),
    });
    const gate = canCreateLevel2(
      { ...base, reviewedAt: new Date(), contactedAt: new Date() },
      stage,
    );
    expect(gate.allowed).toBe(false);
  });

  it('allows Level 2 when proposal accepted', () => {
    const lead = {
      ...base,
      reviewedAt: new Date(),
      contactedAt: new Date(),
      proposalStatus: ProposalStatus.ACCEPTED,
    };
    const stage = resolveCommercialStage(lead, {
      latestProposal: { status: TriageProposalStatus.ACCEPTED },
    });
    expect(stage).toBe(CommercialStage.LEVEL_2_READY);
    expect(canCreateLevel2(lead, stage).allowed).toBe(true);
  });

  it('primary CTA shows create only when ready', () => {
    const ready = resolvePrimaryCta(
      { ...base, proposalStatus: ProposalStatus.ACCEPTED },
      CommercialStage.LEVEL_2_READY,
    );
    expect(ready.kind).toBe('create_level2');

    const early = resolvePrimaryCta(base, CommercialStage.TRIAGE_COMPLETED);
    expect(early.kind).toBe('mark_reviewed');
  });
});
