import { ImportStatus } from '../database/entities';
import { determineExternalImportStatuses } from './external-import-dedup.util';

describe('determineExternalImportStatuses', () => {
  it('flags duplicate review when checksum already exists', () => {
    const decision = determineExternalImportStatuses({
      existingReferenceImported: false,
      matchingVersionChecksum: true,
      matchingVersionDifferentRevision: false,
      sameDocumentDifferentChecksum: false,
    });
    expect(decision.importStatus).toBe(ImportStatus.DUPLICATE_REVIEW);
    expect(decision.externalImportStatus).toBe('DUPLICATE_REVIEW');
  });

  it('flags version review when content differs within a document lineage', () => {
    const decision = determineExternalImportStatuses({
      existingReferenceImported: false,
      matchingVersionChecksum: false,
      matchingVersionDifferentRevision: false,
      sameDocumentDifferentChecksum: true,
    });
    expect(decision.importStatus).toBe(ImportStatus.VERSION_REVIEW);
  });

  it('defaults to ready for review for new files', () => {
    const decision = determineExternalImportStatuses({
      existingReferenceImported: false,
      matchingVersionChecksum: false,
      matchingVersionDifferentRevision: false,
      sameDocumentDifferentChecksum: false,
    });
    expect(decision.importStatus).toBe(ImportStatus.READY_FOR_REVIEW);
    expect(decision.externalImportStatus).toBe('READY_FOR_REVIEW');
  });
});
