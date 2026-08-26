import { describe, expect, it } from 'vitest';
import { ProposalStatus } from '@prisma/client';

/**
 * Lightweight transition table mirroring TriageService.updateProposal rules.
 * Kept as a pure helper test so CI does not require a live DB.
 */
function canTransition(from: ProposalStatus, action: string): boolean {
  switch (action) {
    case 'PREPARE':
      return [ProposalStatus.REQUESTED, ProposalStatus.IN_PREPARATION].includes(from);
    case 'SENT':
      return [ProposalStatus.REQUESTED, ProposalStatus.IN_PREPARATION, ProposalStatus.SENT].includes(from);
    case 'ACCEPTED':
      return [ProposalStatus.SENT, ProposalStatus.ACCEPTED, ProposalStatus.IN_PREPARATION].includes(from);
    case 'DECLINED':
      return [
        ProposalStatus.REQUESTED,
        ProposalStatus.IN_PREPARATION,
        ProposalStatus.SENT,
        ProposalStatus.DECLINED,
      ].includes(from);
    default:
      return false;
  }
}

describe('proposal status transitions', () => {
  it('allows prepare from requested', () => {
    expect(canTransition(ProposalStatus.REQUESTED, 'PREPARE')).toBe(true);
  });

  it('blocks sent from not requested', () => {
    expect(canTransition(ProposalStatus.NOT_REQUESTED, 'SENT')).toBe(false);
  });

  it('allows accept after sent', () => {
    expect(canTransition(ProposalStatus.SENT, 'ACCEPTED')).toBe(true);
  });

  it('blocks accept from not requested', () => {
    expect(canTransition(ProposalStatus.NOT_REQUESTED, 'ACCEPTED')).toBe(false);
  });
});
