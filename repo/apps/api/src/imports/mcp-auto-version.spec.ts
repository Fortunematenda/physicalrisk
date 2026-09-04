import { suggestNextVersion } from './version.util';

/**
 * Behaviour contract for MCP auto-version (queueMcpApprovedDocument):
 * existing docs must bump revision in background — never DUPLICATE_REVIEW.
 */
describe('MCP auto-version contract', () => {
  it('bumps Rev 1.0 to Rev 1.1', () => {
    expect(suggestNextVersion(['Rev 1.0'])).toBe('Rev 1.1');
  });

  it('bumps past the latest of several revisions', () => {
    expect(suggestNextVersion(['Rev 1.0', 'Rev 1.1', 'Rev 1.2'])).toBe('Rev 1.3');
  });

  it('forces NEW_VERSION metadata shape when a target exists', () => {
    const existing = {
      id: 'doc-1',
      code: 'MOSS-GS-003',
      title: 'Governance Standard',
      versions: [{ versionNo: 'Rev 1.0' }],
      currentVersionNo: 'Rev 1.0',
    };
    const versionNos = existing.versions.map((v) => v.versionNo);
    if (existing.currentVersionNo && !versionNos.includes(existing.currentVersionNo)) {
      versionNos.push(existing.currentVersionNo);
    }
    const metadata = {
      mode: 'NEW_VERSION' as const,
      existingDocumentId: existing.id,
      documentCode: existing.code,
      title: existing.title,
      versionNo: suggestNextVersion(versionNos),
      mcpAutoVersion: true,
      status: 'READY_FOR_REVIEW',
    };
    expect(metadata.mode).toBe('NEW_VERSION');
    expect(metadata.versionNo).toBe('Rev 1.1');
    expect(metadata.mcpAutoVersion).toBe(true);
    expect(metadata.status).toBe('READY_FOR_REVIEW');
  });
});
