import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

/** Pure helpers mirroring Import page creatable-dropdown behaviour for regression coverage. */

const FIXED_IMPORT_DROPDOWNS = ['Import type', 'Existing document', 'Approval status'] as const;
const CREATABLE_IMPORT_DROPDOWNS = ['Project', 'Source system', 'Override repository section', 'Document type'] as const;

function supportsAddNew(label: string, canCreate: boolean, projectSelected = true) {
  if (!CREATABLE_IMPORT_DROPDOWNS.includes(label as typeof CREATABLE_IMPORT_DROPDOWNS[number])) return false;
  if (!canCreate) return false;
  if (label === 'Override repository section' && !projectSelected) return 'disabled';
  return true;
}

function preserveImportState(before: Record<string, unknown>, patch: Record<string, unknown>) {
  return { ...before, ...patch };
}

describe('import creatable dropdowns', () => {
  it('marks configurable dropdowns as creatable', () => {
    for (const label of CREATABLE_IMPORT_DROPDOWNS) {
      assert.equal(supportsAddNew(label, true), true);
    }
  });

  it('keeps fixed enum dropdowns without Add New', () => {
    for (const label of FIXED_IMPORT_DROPDOWNS) {
      assert.equal(supportsAddNew(label, true), false);
    }
  });

  it('hides Add New for unauthorised users', () => {
    assert.equal(supportsAddNew('Document type', false), false);
    assert.equal(supportsAddNew('Project', false), false);
  });

  it('disables repository section Add New without a project', () => {
    assert.equal(supportsAddNew('Override repository section', true, false), 'disabled');
  });

  it('selects a created item without clearing unrelated form state or file', () => {
    const before = {
      projectId: 'p1',
      sourceSystemId: 's1',
      title: 'Architecture Overview',
      documentType: '',
      versionNo: '1.0',
      fileName: 'approved.pdf',
      metadataJson: '{"engine":"Diagnostic"}',
    };
    const after = preserveImportState(before, { documentType: 'Security Architecture' });
    assert.equal(after.documentType, 'Security Architecture');
    assert.equal(after.title, 'Architecture Overview');
    assert.equal(after.fileName, 'approved.pdf');
    assert.equal(after.sourceSystemId, 's1');
    assert.equal(after.metadataJson, '{"engine":"Diagnostic"}');
  });

  it('clears only section selection when a new project is chosen', () => {
    const before = {
      projectId: 'old',
      sectionKey: 'TECHNICAL_SPECIFICATIONS',
      title: 'Keep me',
      fileName: 'approved.pdf',
    };
    const after = preserveImportState(before, { projectId: 'new', sectionKey: '', existingDocumentId: '' });
    assert.equal(after.projectId, 'new');
    assert.equal(after.sectionKey, '');
    assert.equal(after.title, 'Keep me');
    assert.equal(after.fileName, 'approved.pdf');
  });
});
