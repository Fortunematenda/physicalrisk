import { describe, expect, it, vi } from 'vitest';
import { generateProposalReference } from './proposal-reference';

describe('generateProposalReference', () => {
  it('returns PRP-YEAR-###### with sequential padding', async () => {
    const tx = {
      publicLead: {
        findMany: vi.fn().mockResolvedValue([{ proposalReference: 'PRP-2026-000002' }]),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const ref = await generateProposalReference(tx as any, 2026);
    expect(ref).toBe('PRP-2026-000003');
  });

  it('starts at 000001 when none exist', async () => {
    const tx = {
      publicLead: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const ref = await generateProposalReference(tx as any, 2026);
    expect(ref).toBe('PRP-2026-000001');
  });
});
