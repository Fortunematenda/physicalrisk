import { ImportStatus } from '../database/entities';

export interface DedupDecisionInput {
  existingReferenceImported: boolean;
  matchingVersionChecksum: boolean;
  matchingVersionDifferentRevision: boolean;
  sameDocumentDifferentChecksum: boolean;
}

export interface DedupDecision {
  importStatus: ImportStatus;
  externalImportStatus: 'READY_FOR_REVIEW' | 'DUPLICATE_REVIEW' | 'VERSION_REVIEW';
  reason: string;
}

export function determineExternalImportStatuses(input: DedupDecisionInput): DedupDecision {
  if (input.existingReferenceImported || input.matchingVersionChecksum) {
    return {
      importStatus: ImportStatus.DUPLICATE_REVIEW,
      externalImportStatus: 'DUPLICATE_REVIEW',
      reason: 'An identical file revision is already known to the repository',
    };
  }
  if (input.sameDocumentDifferentChecksum || input.matchingVersionDifferentRevision) {
    return {
      importStatus: ImportStatus.VERSION_REVIEW,
      externalImportStatus: 'VERSION_REVIEW',
      reason: 'File content differs from a known version and requires review',
    };
  }
  return {
    importStatus: ImportStatus.READY_FOR_REVIEW,
    externalImportStatus: 'READY_FOR_REVIEW',
    reason: 'New external file staged for metadata review',
  };
}
