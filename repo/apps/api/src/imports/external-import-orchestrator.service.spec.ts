import { BadRequestException } from '@nestjs/common';
import { ApprovalStatus } from '../database/entities';
import { ExternalImportOrchestratorService } from './external-import-orchestrator.service';

describe('ExternalImportOrchestratorService approval validation', () => {
  const orchestrator = new ExternalImportOrchestratorService({} as any, {} as any, {} as any);

  it('accepts APPROVED approval status', () => {
    expect(() => orchestrator.assertApprovedStatus('APPROVED')).not.toThrow();
    expect(() => orchestrator.assertApprovedStatus(' approved ')).not.toThrow();
  });

  it.each([
    'DRAFT',
    'PENDING',
    'PENDING_REVIEW',
    'IN_REVIEW',
    'REJECTED',
    '',
    'pending review',
  ])('rejects non-approved status %s', (status) => {
    expect(() => orchestrator.assertApprovedStatus(status)).toThrow(BadRequestException);
    try {
      orchestrator.assertApprovedStatus(status);
    } catch (error) {
      expect((error as BadRequestException).message).toContain('Only APPROVED documents');
    }
  });

  it('normalizes hyphenated in-review values before rejecting', () => {
    expect(() => orchestrator.assertApprovedStatus('in-review')).toThrow(BadRequestException);
    expect(() => orchestrator.assertApprovedStatus(ApprovalStatus.PENDING_REVIEW)).toThrow(BadRequestException);
  });
});
