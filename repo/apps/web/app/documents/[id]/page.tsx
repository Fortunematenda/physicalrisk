'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, CloudUpload, FileText, X } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { api, API_URL, formatBytes, formatDate, getToken } from '@/lib/api';
import styles from './DocumentDetails.module.css';

type DocumentTypeRecord = { id: string; name: string; code: string; active: boolean };
type FileTypeRecord = { id: string; label: string; extension: string; maxSizeMb: number; active: boolean };
type ProjectRecord = {
  id: string;
  code: string;
  name: string;
  sections?: Array<{ id: string; name: string; active?: boolean; position: number }>;
};

type DocumentRecord = {
  id: string;
  code: string;
  title: string;
  documentType: string;
  owner: string | null;
  description: string | null;
  notes: string | null;
  noteEntries?: Array<{
    id: string;
    body: string;
    createdAt: string;
    createdBy?: { id?: string; name?: string; email?: string } | null;
  }>;
  status: string;
  currentVersionNo: string;
  project: { id: string; code: string; name: string };
  section: { id: string; name: string };
  versions: Array<{
    id: string;
    versionNo: string;
    isCurrent: boolean;
    approvedBy: string;
    approvalDate: string;
    originalFileName: string;
    fileSize: number;
    mimeType?: string;
    storagePath: string;
    createdAt: string;
    createdBy?: { name?: string } | null;
  }>;
  importJobs: Array<{
    id: string;
    status: string;
    fileName: string;
    createdAt: string;
    sourceSystem: { name: string };
  }>;
  outgoingRelationships: Array<{
    id: string;
    type: string;
    description?: string | null;
    toDocument: { id: string; code: string; title: string };
  }>;
  incomingRelationships: Array<{
    id: string;
    type: string;
    description?: string | null;
    fromDocument: { id: string; code: string; title: string };
  }>;
};

const RELATIONSHIP_TYPES = [
  'RELATED_TO',
  'SUPERSEDES',
  'DEPENDS_ON',
  'SUPPORTS',
  'PARENT_OF',
  'CHILD_OF',
  'REFERENCES',
  'IMPLEMENTS',
];

type EditForm = {
  code: string;
  title: string;
  documentType: string;
  owner: string;
  description: string;
  status: string;
  projectId: string;
  sectionId: string;
  versionNo: string;
  approvedBy: string;
  approvalDate: string;
};

const emptyForm = (): EditForm => ({
  code: '',
  title: '',
  documentType: '',
  owner: '',
  description: '',
  status: 'CURRENT',
  projectId: '',
  sectionId: '',
  versionNo: '',
  approvedBy: '',
  approvalDate: '',
});

const toDateInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
};

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const startInEdit = searchParams.get('edit') === '1';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [item, setItem] = useState<DocumentRecord | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeRecord[]>([]);
  const [fileTypes, setFileTypes] = useState<FileTypeRecord[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replacingFile, setReplacingFile] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [form, setForm] = useState<EditForm>(emptyForm());
  const [projectDocuments, setProjectDocuments] = useState<Array<{ id: string; code: string; title: string }>>([]);
  const [relationshipForm, setRelationshipForm] = useState({
    toDocumentId: '',
    type: 'RELATED_TO',
    description: '',
  });
  const [savingRelationship, setSavingRelationship] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const noteTrail = useMemo(
    () => [...(item?.noteEntries ?? [])].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    ),
    [item?.noteEntries],
  );

  const currentVersion = useMemo(
    () => item?.versions?.find((version) => version.isCurrent) ?? item?.versions?.[0] ?? null,
    [item],
  );
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === form.projectId) ?? null,
    [projects, form.projectId],
  );
  const activeSections = useMemo(
    () => [...(selectedProject?.sections ?? [])]
      .filter((section) => section.active !== false)
      .sort((a, b) => a.position - b.position),
    [selectedProject],
  );
  const combinedRelationships = useMemo(() => {
    if (!item) return [];
    const outgoing = (item.outgoingRelationships ?? []).map((rel) => ({
      id: rel.id,
      direction: 'Outgoing' as const,
      type: rel.type,
      description: rel.description ?? '',
      other: rel.toDocument,
    }));
    const incoming = (item.incomingRelationships ?? []).map((rel) => ({
      id: rel.id,
      direction: 'Incoming' as const,
      type: rel.type,
      description: rel.description ?? '',
      other: rel.fromDocument,
    }));
    return [...outgoing, ...incoming];
  }, [item]);
  const relationshipTargets = useMemo(
    () => projectDocuments.filter((document) => document.id !== item?.id),
    [projectDocuments, item?.id],
  );
  const acceptedExtensions = useMemo(
    () => fileTypes.map((type) => `.${type.extension}`).join(','),
    [fileTypes],
  );
  const displayFileName = replacementFile?.name
    ?? (!replacingFile ? currentVersion?.originalFileName : undefined)
    ?? '';
  const displayFileSize = replacementFile?.size
    ?? (!replacingFile ? currentVersion?.fileSize : undefined);
  const hasImportedFile = Boolean(displayFileName);
  const matchedFileType = useMemo(() => {
    if (!displayFileName.includes('.')) return null;
    const extension = displayFileName.split('.').pop()?.toLowerCase() ?? '';
    return fileTypes.find((type) => type.extension.toLowerCase() === extension) ?? null;
  }, [displayFileName, fileTypes]);

  const assignReplacementFile = (file: File | null) => {
    setReplacementFile(file);
    setReplacingFile(!file);
    if (!file && fileInputRef.current) fileInputRef.current.value = '';
  };

  const formFromDocument = (document: DocumentRecord): EditForm => ({
    code: document.code ?? '',
    title: document.title ?? '',
    documentType: document.documentType ?? '',
    owner: document.owner ?? '',
    description: document.description ?? '',
    status: document.status ?? 'CURRENT',
    projectId: document.project.id,
    sectionId: document.section.id,
    versionNo: document.currentVersionNo ?? '',
    approvedBy: document.versions?.find((version) => version.isCurrent)?.approvedBy
      ?? document.versions?.[0]?.approvedBy
      ?? '',
    approvalDate: toDateInput(
      document.versions?.find((version) => version.isCurrent)?.approvalDate
      ?? document.versions?.[0]?.approvalDate
      ?? '',
    ),
  });

  const load = async () => {
    const [document, types, projectList, typesFiles] = await Promise.all([
      api<DocumentRecord>(`/documents/${id}`),
      api<DocumentTypeRecord[]>('/document-types').catch(() => [] as DocumentTypeRecord[]),
      api<ProjectRecord[]>('/projects').catch(() => [] as ProjectRecord[]),
      api<FileTypeRecord[]>('/file-types').catch(() => [] as FileTypeRecord[]),
    ]);
    const docs = await api<Array<{ id: string; code: string; title: string; project?: { id: string } }>>(
      `/documents?projectId=${document.project.id}`,
    ).catch(() => [] as Array<{ id: string; code: string; title: string }>);
    setItem(document);
    setDocumentTypes(types.filter((type) => type.active !== false));
    setFileTypes(typesFiles.filter((type) => type.active !== false));
    setProjects(projectList);
    setProjectDocuments(docs.map((doc) => ({ id: doc.id, code: doc.code, title: doc.title })));
    setForm(formFromDocument(document));
    setNotesDraft('');
    setRelationshipForm({
      toDocumentId: docs.find((doc) => doc.id !== document.id)?.id ?? '',
      type: 'RELATED_TO',
      description: '',
    });
    setReplacementFile(null);
    setReplacingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    load()
      .then(() => {
        if (startInEdit) {
          setEditing(true);
          router.replace(`/documents/${id}`, { scroll: false });
        }
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load document'));
  }, [id]);

  useEffect(() => {
    if (!editing || !form.projectId) return;
    if (activeSections.some((section) => section.id === form.sectionId)) return;
    setForm((current) => ({ ...current, sectionId: activeSections[0]?.id ?? '' }));
  }, [editing, form.projectId, form.sectionId, activeSections]);

  const download = (version: DocumentRecord['versions'][number]) => {
    const token = getToken();
    fetch(`${API_URL}/versions/${version.id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => {
        if (!response.ok) throw new Error('Download failed');
        return response.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = version.originalFileName;
        anchor.click();
        URL.revokeObjectURL(url);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Download failed'));
  };

  const beginEdit = () => {
    if (!item) return;
    setForm(formFromDocument(item));
    setReplacementFile(null);
    setReplacingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setEditing(true);
    setError('');
    setNotice('');
  };

  const cancelEdit = () => {
    if (!item) return;
    setEditing(false);
    setForm(formFromDocument(item));
    setReplacementFile(null);
    setReplacingFile(false);
    setDragActive(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const body = new FormData();
      body.append('code', form.code.trim());
      body.append('title', form.title.trim());
      body.append('documentType', form.documentType.trim());
      body.append('owner', form.owner.trim());
      body.append('description', form.description.trim());
      body.append('status', form.status);
      body.append('projectId', form.projectId);
      body.append('sectionId', form.sectionId);
      body.append('versionNo', form.versionNo.trim());
      body.append('approvedBy', form.approvedBy.trim());
      body.append('approvalDate', form.approvalDate);
      if (replacementFile) body.append('file', replacementFile);

      const token = getToken();
      const response = await fetch(`${API_URL}/documents/${id}`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(Array.isArray(payload.message) ? payload.message.join(', ') : payload.message ?? 'Unable to update document');
      }
      const updated = payload as DocumentRecord;
      const replacedFile = Boolean(replacementFile);
      setItem(updated);
      setForm(formFromDocument(updated));
      setReplacementFile(null);
      setReplacingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setEditing(false);
      setNotice(replacedFile ? 'Document details and imported file updated.' : 'Document details updated.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update document');
    } finally {
      setSaving(false);
    }
  };

  const saveRelationship = async (event: FormEvent) => {
    event.preventDefault();
    if (!item) return;
    if (!relationshipForm.toDocumentId) {
      setError('Select a related document.');
      return;
    }
    setError('');
    setNotice('');
    setSavingRelationship(true);
    try {
      await api('/relationships', {
        method: 'POST',
        body: JSON.stringify({
          fromDocumentId: item.id,
          toDocumentId: relationshipForm.toDocumentId,
          type: relationshipForm.type,
          description: relationshipForm.description.trim() || undefined,
        }),
      });
      await load();
      setNotice('Relationship saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save relationship');
    } finally {
      setSavingRelationship(false);
    }
  };

  const removeRelationship = async (relationshipId: string) => {
    const confirmed = window.confirm('Remove this document relationship?');
    if (!confirmed) return;
    setError('');
    setNotice('');
    try {
      await api(`/relationships/${relationshipId}`, { method: 'DELETE' });
      await load();
      setNotice('Relationship removed.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to remove relationship');
    }
  };

  const saveNotes = async (event: FormEvent) => {
    event.preventDefault();
    if (!item) return;
    const body = notesDraft.trim();
    if (!body) {
      setError('Enter a note before adding it to the trail.');
      return;
    }
    setError('');
    setNotice('');
    setSavingNotes(true);
    try {
      const updated = await api<DocumentRecord>(`/documents/${id}/notes`, {
        method: 'PATCH',
        body: JSON.stringify({ notes: body }),
      });
      setItem(updated);
      setNotesDraft('');
      setNotice('Note added to trail.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to add note');
    } finally {
      setSavingNotes(false);
    }
  };

  const deleteDocument = async () => {
    if (!item) return;
    const confirmed = window.confirm(
      `Delete document ${item.code} — ${item.title}?\n\nThis permanently removes the logical document, all versions, relationships, and VPS files.`,
    );
    if (!confirmed) return;
    setError('');
    setNotice('');
    setDeleting(true);
    try {
      const result = await api<{ projectId?: string }>(`/documents/${id}`, { method: 'DELETE' });
      router.push(result.projectId ? `/repository/explorer?projectId=${result.projectId}` : '/repository/explorer');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete document');
      setDeleting(false);
    }
  };

  if (!item && !error) return <Loading />;

  return (
    <>
      {item && (
        <PageHeader
          title={`${item.code} — ${item.title}`}
          description={`${item.project.name} / ${item.section.name} / ${item.documentType}`}
        />
      )}
      {error && <div className="notice error">{error}</div>}
      {notice && <div className="notice success">{notice}</div>}
      {item && (
        <div className="detail-grid">
          <div className="grid">
            <div className="detail-card">
              <div className={`panel-header ${styles.cardHeader}`}>
                <h2>Document details</h2>
                <div className={styles.headerActions}>
                  <StatusBadge value={item.status} />
                  {!editing ? (
                    <>
                      <button type="button" className="button small" onClick={beginEdit}>
                        Edit
                      </button>
                      <button type="button" className="button small danger" onClick={() => void deleteDocument()} disabled={deleting}>
                        {deleting ? 'Deleting…' : 'Delete'}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {currentVersion ? (
                <div className={styles.importedFile}>
                  <div>
                    <strong>Imported document</strong>
                    <p>{replacementFile ? replacementFile.name : currentVersion.originalFileName}</p>
                    <span className="secondary-text">
                      {replacementFile
                        ? `New file selected · ${formatBytes(replacementFile.size)}`
                        : `v${currentVersion.versionNo}${currentVersion.mimeType ? ` · ${currentVersion.mimeType}` : ''} · ${formatBytes(currentVersion.fileSize)} · ${formatDate(currentVersion.createdAt)}`}
                    </span>
                  </div>
                  {!replacementFile ? (
                    <button type="button" className="button small" onClick={() => download(currentVersion)}>
                      Download
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className={styles.importedFileMissing}>
                  <strong>Imported document</strong>
                  <p className="secondary-text">
                    {replacementFile ? `New file selected: ${replacementFile.name}` : 'No imported file version is linked to this document.'}
                  </p>
                </div>
              )}

              {editing ? (
                <form className={styles.editForm} onSubmit={saveEdit}>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="doc-code">Document code <em>*</em></label>
                      <input
                        id="doc-code"
                        value={form.code}
                        onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="doc-version">Version <em>*</em></label>
                      <input
                        id="doc-version"
                        value={form.versionNo}
                        onChange={(event) => setForm((current) => ({ ...current, versionNo: event.target.value }))}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="doc-project">Project <em>*</em></label>
                      <select
                        id="doc-project"
                        value={form.projectId}
                        onChange={(event) => setForm((current) => ({ ...current, projectId: event.target.value, sectionId: '' }))}
                        required
                      >
                        <option value="">Select project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>{project.code} — {project.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="doc-section">Repository section <em>*</em></label>
                      <select
                        id="doc-section"
                        value={form.sectionId}
                        onChange={(event) => setForm((current) => ({ ...current, sectionId: event.target.value }))}
                        required
                      >
                        <option value="">Select section</option>
                        {activeSections.map((section) => (
                          <option key={section.id} value={section.id}>{section.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="doc-title">Document title <em>*</em></label>
                      <input
                        id="doc-title"
                        value={form.title}
                        onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="doc-type">Document type <em>*</em></label>
                      <select
                        id="doc-type"
                        value={form.documentType}
                        onChange={(event) => setForm((current) => ({ ...current, documentType: event.target.value }))}
                        required
                      >
                        <option value="">Select document type</option>
                        {documentTypes.map((type) => (
                          <option key={type.id} value={type.name}>{type.name}</option>
                        ))}
                        {form.documentType && !documentTypes.some((type) => type.name === form.documentType) ? (
                          <option value={form.documentType}>{form.documentType}</option>
                        ) : null}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="doc-owner">Owner</label>
                      <input
                        id="doc-owner"
                        value={form.owner}
                        onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="doc-status">Status</label>
                      <select
                        id="doc-status"
                        value={form.status}
                        onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                      >
                        <option value="CURRENT">CURRENT</option>
                        <option value="SUPERSEDED">SUPERSEDED</option>
                        <option value="ARCHIVED">ARCHIVED</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="doc-approved-by">Approved by <em>*</em></label>
                      <input
                        id="doc-approved-by"
                        value={form.approvedBy}
                        onChange={(event) => setForm((current) => ({ ...current, approvedBy: event.target.value }))}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="doc-approval-date">Approval date <em>*</em></label>
                      <input
                        id="doc-approval-date"
                        type="date"
                        value={form.approvalDate}
                        onChange={(event) => setForm((current) => ({ ...current, approvalDate: event.target.value }))}
                        required
                      />
                    </div>
                    <div className={`field full ${styles.descriptionField}`}>
                      <div className={styles.fileSectionHead}>
                        <label htmlFor="doc-file">Imported document file</label>
                        <p>Permitted extensions and size limits are controlled from File Types.</p>
                      </div>
                      <div
                        className={`${styles.uploadZone} ${dragActive ? styles.uploadZoneActive : ''}`}
                        onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
                        onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
                        onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
                        onDrop={(event) => {
                          event.preventDefault();
                          setDragActive(false);
                          const dropped = event.dataTransfer.files?.[0] ?? null;
                          assignReplacementFile(dropped);
                          if (fileInputRef.current) {
                            if (dropped) {
                              const transfer = new DataTransfer();
                              transfer.items.add(dropped);
                              fileInputRef.current.files = transfer.files;
                            } else {
                              fileInputRef.current.value = '';
                            }
                          }
                        }}
                      >
                        <input
                          id="doc-file"
                          ref={fileInputRef}
                          type="file"
                          accept={acceptedExtensions || undefined}
                          aria-label="Imported document file"
                          title="Imported document file"
                          className={hasImportedFile ? styles.fileInputHidden : styles.fileInputOverlay}
                          onChange={(event) => assignReplacementFile(event.target.files?.[0] ?? null)}
                        />
                        {!hasImportedFile ? (
                          <>
                            <div className={styles.uploadIcon}><CloudUpload size={20} /></div>
                            <p className={styles.uploadTitle}>Drag and drop your file here or click to browse</p>
                            <p className={styles.uploadHint}>
                              {acceptedExtensions || 'Configured file types will appear here.'}
                            </p>
                          </>
                        ) : (
                          <div className={styles.fileCard}>
                            <div className={styles.fileIcon}><FileText size={18} /></div>
                            <div className={styles.fileMeta}>
                              <strong>{displayFileName}</strong>
                              <span>
                                {displayFileSize != null ? formatBytes(displayFileSize) : 'Current imported file'}
                                {matchedFileType ? ` · ${matchedFileType.label}` : ''}
                                {replacementFile ? ' · new file selected' : ' · current file'}
                              </span>
                            </div>
                            <CheckCircle2 className={styles.fileOk} size={18} />
                            <button
                              type="button"
                              className={styles.fileRemove}
                              aria-label="Replace file"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                assignReplacementFile(null);
                                setReplacingFile(true);
                              }}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={`field full ${styles.descriptionField}`}>
                      <label htmlFor="doc-description">Description</label>
                      <textarea
                        id="doc-description"
                        rows={4}
                        value={form.description}
                        onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                        className={styles.fixedTextarea}
                      />
                    </div>
                  </div>
                  <div className={styles.editActions}>
                    <button type="submit" className="button primary" disabled={saving}>
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>
                    <button type="button" className="button" disabled={saving} onClick={cancelEdit}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="detail-list">
                  <dt>Document code</dt>
                  <dd className="mono">{item.code}</dd>
                  <dt>Title</dt>
                  <dd>{item.title}</dd>
                  <dt>Project</dt>
                  <dd>{item.project.code} — {item.project.name}</dd>
                  <dt>Section</dt>
                  <dd>{item.section.name}</dd>
                  <dt>Document type</dt>
                  <dd>{item.documentType}</dd>
                  <dt>Current version</dt>
                  <dd>{item.currentVersionNo}</dd>
                  <dt>Imported file</dt>
                  <dd>{currentVersion?.originalFileName || '—'}</dd>
                  <dt>Owner</dt>
                  <dd>{item.owner || '—'}</dd>
                  <dt>Description</dt>
                  <dd>{item.description || '—'}</dd>
                  <dt>Approved by</dt>
                  <dd>{currentVersion?.approvedBy || '—'}</dd>
                  <dt>Approval date</dt>
                  <dd>{formatDate(currentVersion?.approvalDate)}</dd>
                  <dt>Repository location</dt>
                  <dd className="mono">{currentVersion?.storagePath || '—'}</dd>
                  <dt>Repository mode</dt>
                  <dd>Physical Risk VPS filesystem</dd>
                </dl>
              )}
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Version history</h2>
                <span className="secondary-text">{item.versions.length} versions</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Approval</th>
                      <th>File</th>
                      <th>VPS repository path</th>
                      <th>Imported</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.versions.map((version) => (
                      <tr key={version.id}>
                        <td>
                          <strong>{version.versionNo}</strong>
                          <div><StatusBadge value={version.isCurrent ? 'CURRENT' : 'SUPERSEDED'} /></div>
                        </td>
                        <td>
                          {version.approvedBy}
                          <div className="secondary-text">{formatDate(version.approvalDate)}</div>
                        </td>
                        <td>
                          {version.originalFileName}
                          <div className="secondary-text">{formatBytes(version.fileSize)}</div>
                        </td>
                        <td><span className="mono">{version.storagePath}</span></td>
                        <td>
                          {formatDate(version.createdAt)}
                          <div className="secondary-text">{version.createdBy?.name || 'System'}</div>
                        </td>
                        <td>
                          <button type="button" className="button small" onClick={() => download(version)}>Download</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header"><h2>Import history</h2></div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Status</th>
                      <th>File</th>
                      <th>Date</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.importJobs.map((job) => (
                      <tr key={job.id}>
                        <td>{job.sourceSystem.name}</td>
                        <td><StatusBadge value={job.status} /></td>
                        <td>{job.fileName}</td>
                        <td>{formatDate(job.createdAt)}</td>
                        <td><Link className="button small" href={`/imports/${job.id}`}>View log</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside className={styles.sideColumn}>
            <div className={`detail-card ${styles.sideCard}`}>
              <div className={styles.sideCardHeader}>
                <h2>Relationships</h2>
                <span className="secondary-text">{combinedRelationships.length}</span>
              </div>

              <form className={styles.relationshipForm} onSubmit={saveRelationship}>
                <div className="field">
                  <label htmlFor="rel-to">Related document</label>
                  <select
                    id="rel-to"
                    required
                    value={relationshipForm.toDocumentId}
                    onChange={(event) => setRelationshipForm((current) => ({ ...current, toDocumentId: event.target.value }))}
                  >
                    <option value="">Select document</option>
                    {relationshipTargets.map((document) => (
                      <option key={document.id} value={document.id}>
                        {document.code} — {document.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="rel-type">Relationship type</label>
                  <select
                    id="rel-type"
                    value={relationshipForm.type}
                    onChange={(event) => setRelationshipForm((current) => ({ ...current, type: event.target.value }))}
                  >
                    {RELATIONSHIP_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="rel-description">Description</label>
                  <textarea
                    id="rel-description"
                    rows={3}
                    value={relationshipForm.description}
                    onChange={(event) => setRelationshipForm((current) => ({ ...current, description: event.target.value }))}
                    className={styles.fixedTextareaSmall}
                    placeholder="Optional relationship note"
                  />
                </div>
                <button type="submit" className="button primary" disabled={savingRelationship || relationshipTargets.length === 0}>
                  {savingRelationship ? 'Saving…' : 'Add relationship'}
                </button>
              </form>

              <div className={styles.relationshipList}>
                {combinedRelationships.length === 0 ? (
                  <p className="secondary-text">No relationships linked to this document yet.</p>
                ) : (
                  combinedRelationships.map((rel) => (
                    <div key={rel.id} className={styles.relationshipItem}>
                      <div className={styles.relationshipMeta}>
                        <span className="badge">{rel.direction}</span>
                        <span className="badge">{rel.type}</span>
                      </div>
                      <Link href={`/documents/${rel.other.id}`} className="primary-text mono">
                        {rel.other.code}
                      </Link>
                      <div className="secondary-text">{rel.other.title}</div>
                      {rel.description ? <div className="secondary-text">{rel.description}</div> : null}
                      <button type="button" className="button small danger" onClick={() => void removeRelationship(rel.id)}>
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={`detail-card ${styles.sideCard}`}>
              <div className={styles.sideCardHeader}>
                <h2>Notes</h2>
                <span className="secondary-text">{noteTrail.length}</span>
              </div>

              <div className={styles.noteTrail}>
                {noteTrail.length === 0 ? (
                  <p className="secondary-text">No notes yet. Add the first entry below.</p>
                ) : (
                  noteTrail.map((note) => (
                    <article key={note.id} className={styles.noteEntry}>
                      <header className={styles.noteEntryMeta}>
                        <strong>{note.createdBy?.name || 'System'}</strong>
                        <time dateTime={note.createdAt}>{formatDate(note.createdAt)}</time>
                      </header>
                      <p>{note.body}</p>
                    </article>
                  ))
                )}
              </div>

              <form className={styles.notesForm} onSubmit={saveNotes}>
                <div className="field">
                  <label htmlFor="doc-notes">Add note</label>
                  <textarea
                    id="doc-notes"
                    rows={4}
                    value={notesDraft}
                    onChange={(event) => setNotesDraft(event.target.value)}
                    className={styles.notesCompose}
                    placeholder="Write a new note. Existing notes stay in the trail above."
                  />
                </div>
                <button type="submit" className="button primary" disabled={savingNotes || !notesDraft.trim()}>
                  {savingNotes ? 'Adding…' : 'Add note'}
                </button>
              </form>
            </div>

            <Link className="button" href={`/repository/explorer?projectId=${item.project.id}`}>Open VPS repository</Link>
          </aside>
        </div>
      )}
    </>
  );
}
