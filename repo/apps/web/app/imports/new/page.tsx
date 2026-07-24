'use client';

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, CloudUpload, FileText, Info, X,
} from 'lucide-react';
import { CreatableSelect } from '@/components/import/CreatableSelect';
import { CreateDocumentTypeModal, DocumentTypeRecord } from '@/components/import/CreateDocumentTypeModal';
import { CreateProjectModal, ProjectRecord } from '@/components/import/CreateProjectModal';
import { CreateRepositorySectionModal, RepositorySectionRecord } from '@/components/import/CreateRepositorySectionModal';
import { CreateSourceSystemModal, SourceSystemRecord } from '@/components/import/CreateSourceSystemModal';
import { Loading } from '@/components/loading';
import { api, API_URL, getToken } from '@/lib/api';
import { getErrorMessage } from '@/lib/api-error';
import { canCreateConfiguration, getCurrentUser } from '@/lib/permissions';
import { suggestNextVersion, formatBytes } from '@/lib/version';
import styles from './ImportDocument.module.css';

interface StructuredError {
  code: string;
  message: string;
  details?: {
    documentId?: string;
    documentTitle?: string;
    documentCode?: string;
    existingVersionId?: string;
    existingVersion?: string;
    submittedVersion?: string;
    existingFileName?: string;
    existingImportDate?: string;
    repositoryPath?: string;
    repositorySection?: string;
  };
}

type CreateModal = 'project' | 'source' | 'documentType' | 'section' | null;

interface MetadataFieldRecord {
  id: string;
  key: string;
  label: string;
  dataType: string;
  required: boolean;
  active: boolean;
  position: number;
  description?: string | null;
}

interface RoutingRuleRecord {
  id: string;
  name: string;
  projectId?: string | null;
  sourceSystemId?: string | null;
  documentType?: string | null;
  fileExtension?: string | null;
  metadataKey?: string | null;
  metadataValue?: string | null;
  targetSectionKey: string;
  priority: number;
  active: boolean;
}

function titleFromFileName(fileName: string) {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseMetadataJson(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function matchExistingDocument(documents: any[], file: File | null) {
  if (!documents.length) return null;
  if (documents.length === 1) return documents[0];
  if (!file) return null;

  const fileBase = titleFromFileName(file.name).toLowerCase();
  const fileName = file.name.toLowerCase();

  const byOriginalName = documents.find((document) => {
    const versions = document.versions ?? [];
    return versions.some((version: any) => String(version.originalFileName ?? '').toLowerCase() === fileName);
  });
  if (byOriginalName) return byOriginalName;

  const byTitle = documents.find((document) => String(document.title ?? '').trim().toLowerCase() === fileBase);
  if (byTitle) return byTitle;

  const byCode = documents.find((document) => {
    const code = String(document.code ?? '').trim().toLowerCase();
    return code && (fileName.includes(code) || fileBase.includes(code));
  });
  if (byCode) return byCode;

  return null;
}

export default function ImportDocumentPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ImportDocumentPageContent />
    </Suspense>
  );
}

function ImportDocumentPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const continueJobId = searchParams.get('continue')?.trim() || '';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoTitleRef = useRef('');
  const draftLoadedRef = useRef('');
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState('');
  const [sources, setSources] = useState<SourceSystemRecord[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeRecord[]>([]);
  const [fileTypes, setFileTypes] = useState<any[]>([]);
  const [metadataFields, setMetadataFields] = useState<MetadataFieldRecord[]>([]);
  const [routingRules, setRoutingRules] = useState<RoutingRuleRecord[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(continueJobId));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draftFileName, setDraftFileName] = useState('');
  const [draftFileSize, setDraftFileSize] = useState(0);
  const [draftHasFile, setDraftHasFile] = useState(false);
  const [activeContinueJobId, setActiveContinueJobId] = useState(continueJobId);
  const [structuredError, setStructuredError] = useState<StructuredError | null>(null);
  const [createModal, setCreateModal] = useState<CreateModal>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [form, setForm] = useState({
    projectId: '', sourceSystemId: '', title: '', documentCode: '', documentType: '', versionNo: '1.0',
    approvedBy: '', approvalDate: new Date().toISOString().slice(0, 10), approvalStatus: 'APPROVED',
    owner: '', description: '',
    sectionKey: '', metadataJson: '{}', relationshipsJson: '[]', mode: 'NEW' as 'NEW' | 'NEW_VERSION', existingDocumentId: '',
  });
  const [contentMode, setContentMode] = useState<'file' | 'paste'>('file');
  const [pasteContent, setPasteContent] = useState('');
  const [pasteFileName, setPasteFileName] = useState('pasted-content.txt');
  const [relDraft, setRelDraft] = useState({ toDocumentId: '', type: 'RELATED_TO', description: '' });

  useEffect(() => {
    setCanCreate(canCreateConfiguration(getCurrentUser()));
    Promise.all([
      api('/projects'),
      api('/source-systems'),
      api('/file-types'),
      api('/document-types'),
      api('/metadata-fields'),
    ])
      .then(([p, s, f, types, fields]) => {
        setProjects(p);
        setSources(s.filter((item: SourceSystemRecord) => item.active !== false));
        setFileTypes(f.filter((item: any) => item.active));
        setDocumentTypes(types.filter((item: DocumentTypeRecord) => item.active !== false));
        setMetadataFields((fields as MetadataFieldRecord[]).filter((item) => item.active !== false)
          .sort((a, b) => a.position - b.position || a.label.localeCompare(b.label)));
      })
      .catch((caught) => setError(getErrorMessage(caught)))
      .finally(() => setLoadingOptions(false));

    void (async () => {
      let approvedBy = '';
      try {
        const userStr = localStorage.getItem('gateway_user');
        if (userStr) {
          const user = JSON.parse(userStr);
          approvedBy = user.name || user.email || '';
        }
      } catch {
        // ignore
      }
      if (!approvedBy) {
        try {
          const session = await fetch('/api/auth/session', { credentials: 'same-origin' }).then((r) =>
            r.json(),
          );
          approvedBy = session?.user?.name || session?.user?.email || '';
          if (approvedBy && session?.user) {
            localStorage.setItem(
              'gateway_user',
              JSON.stringify({
                name: session.user.name || undefined,
                email: session.user.email || undefined,
              }),
            );
          }
        } catch {
          // ignore
        }
      }
      if (approvedBy) {
        setForm((current) => ({
          ...current,
          approvedBy: current.approvedBy || approvedBy,
        }));
      }
    })();
  }, []);

  useEffect(() => {
    if (!continueJobId || loadingOptions || draftLoadedRef.current === continueJobId) {
      if (!continueJobId) setLoadingDraft(false);
      return;
    }

    setLoadingDraft(true);
    api(`/imports/${encodeURIComponent(continueJobId)}`)
      .then((job) => {
        const metadata = (job.metadata ?? {}) as Record<string, unknown>;
        const custom = metadata.customMetadata && typeof metadata.customMetadata === 'object'
          ? metadata.customMetadata as Record<string, unknown>
          : {};
        const relationships = Array.isArray(metadata.relationships) ? metadata.relationships : [];
        const mode = metadata.mode === 'NEW_VERSION' ? 'NEW_VERSION' : 'NEW';
        const approvalDate = typeof metadata.approvalDate === 'string' && metadata.approvalDate
          ? String(metadata.approvalDate).slice(0, 10)
          : new Date().toISOString().slice(0, 10);

        setActiveContinueJobId(job.id);
        const stagedName = String(job.fileName ?? '').trim();
        const stagedPath = String(job.incomingPath ?? '').trim();
        const hasStagedFile = Boolean(stagedPath) && stagedName !== '' && stagedName !== 'Untitled draft';
        setDraftFileName(hasStagedFile ? stagedName : '');
        setDraftFileSize(Number(job.fileSize) || 0);
        setDraftHasFile(hasStagedFile);
        setForm((current) => ({
          ...current,
          projectId: String(metadata.projectId || job.project?.id || ''),
          sourceSystemId: String(metadata.sourceSystemId || job.sourceSystem?.id || ''),
          title: String(metadata.title || ''),
          documentCode: String(metadata.documentCode || ''),
          documentType: String(metadata.documentType || ''),
          versionNo: String(metadata.versionNo || (mode === 'NEW_VERSION' ? '' : '1.0')),
          approvedBy: String(metadata.approvedBy || current.approvedBy || ''),
          approvalDate,
          approvalStatus: String(metadata.approvalStatus || 'APPROVED').toUpperCase() === 'APPROVED' ? 'APPROVED' : String(metadata.approvalStatus || 'APPROVED').toUpperCase(),
          owner: String(metadata.owner || ''),
          description: String(metadata.description || ''),
          sectionKey: String(metadata.sectionKey || job.resolvedSection?.sectionKey || ''),
          metadataJson: JSON.stringify(custom, null, 2),
          relationshipsJson: JSON.stringify(relationships),
          mode,
          existingDocumentId: String(metadata.existingDocumentId || ''),
        }));
        draftLoadedRef.current = continueJobId;
        setNotice(
          hasStagedFile
            ? `Continuing draft for ${stagedName}. The previously uploaded file is ready — no need to upload again.`
            : 'Continuing draft. Upload an approved file to complete the import.',
        );
        if (job.errorMessage) setError('');
      })
      .catch((caught) => setError(getErrorMessage(caught, 'Unable to load draft import.')))
      .finally(() => setLoadingDraft(false));
  }, [continueJobId, loadingOptions]);

  useEffect(() => {
    if (!form.projectId) {
      setDocuments([]);
      setDocumentsError('');
      setRoutingRules([]);
      return;
    }

    setDocumentsLoading(true);
    setDocumentsError('');
    api(`/documents?projectId=${encodeURIComponent(form.projectId)}`)
      .then((data) => setDocuments(Array.isArray(data) ? data : []))
      .catch((caught) => {
        setDocuments([]);
        setDocumentsError(getErrorMessage(caught, 'Unable to load existing documents for this project.'));
      })
      .finally(() => setDocumentsLoading(false));

    api(`/routing-rules?projectId=${encodeURIComponent(form.projectId)}`)
      .then((rules) => setRoutingRules((rules as RoutingRuleRecord[]).filter((rule) => rule.active !== false)))
      .catch(() => setRoutingRules([]));
  }, [form.projectId]);

  const selectedProject = useMemo(() => projects.find((item) => item.id === form.projectId), [projects, form.projectId]);
  const projectDocuments = useMemo(
    () => documents.filter((document) => {
      const documentProjectId = document.project?.id ?? document.projectId;
      return !form.projectId || documentProjectId === form.projectId;
    }),
    [documents, form.projectId],
  );
  const selectedDocument = useMemo(() => projectDocuments.find((d) => d.id === form.existingDocumentId), [projectDocuments, form.existingDocumentId]);

  const currentVersion = useMemo(() => {
    if (!selectedDocument) return null;
    return selectedDocument.versions?.find((v: any) => v.isCurrent) ?? selectedDocument.versions?.[0] ?? null;
  }, [selectedDocument]);

  const latestVersion = useMemo(() => {
    if (!selectedDocument || !selectedDocument.versions?.length) return null;
    return [...selectedDocument.versions].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }, [selectedDocument]);

  const suggestedVersion = useMemo(() => {
    if (!selectedDocument?.versions?.length) {
      return selectedDocument?.currentVersionNo ? suggestNextVersion([selectedDocument.currentVersionNo]) : '1.0';
    }
    const versions = selectedDocument.versions.map((v: any) => v.versionNo);
    return suggestNextVersion(versions);
  }, [selectedDocument]);

  const sectionOptions = useMemo(
    () => (selectedProject?.sections ?? [])
      .filter((item) => item.active && !['VERSION_REGISTER', 'MASTER_DOCUMENT_INDEX'].includes(item.sectionKey))
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        value: item.sectionKey,
        label: `${item.position}. ${item.name}`,
      })),
    [selectedProject],
  );

  const nextSectionPosition = useMemo(
    () => Math.max(0, ...(selectedProject?.sections ?? []).map((item) => item.position)) + 1,
    [selectedProject],
  );

  const allocateFromExistingDocument = (document: any, versionHint?: string) => {
    const versions = (document.versions ?? []).map((version: any) => version.versionNo);
    if (document.currentVersionNo) versions.push(document.currentVersionNo);
    const nextVersion = versionHint || (versions.length ? suggestNextVersion(versions) : '1.0');
    return {
      existingDocumentId: document.id as string,
      title: String(document.title ?? ''),
      documentCode: String(document.code ?? ''),
      documentType: String(document.documentType ?? ''),
      versionNo: nextVersion,
      sectionKey: String(document.section?.sectionKey ?? ''),
    };
  };

  // Auto-pick existing document for New Version (single match / file match).
  useEffect(() => {
    if (form.mode !== 'NEW_VERSION' || !form.projectId || documentsLoading) return;
    if (!projectDocuments.length) {
      if (form.existingDocumentId) {
        setForm((current) => ({
          ...current,
          existingDocumentId: '',
          title: '',
          documentCode: '',
          documentType: '',
          versionNo: '',
          sectionKey: '',
        }));
      }
      return;
    }

    const matched = matchExistingDocument(projectDocuments, file);
    if (!matched) return;
    if (form.existingDocumentId === matched.id) return;

    setForm((current) => ({
      ...current,
      ...allocateFromExistingDocument(matched),
    }));
  }, [form.mode, form.projectId, form.existingDocumentId, documentsLoading, projectDocuments, file]);

  // Keep identity + version allocated from the selected existing document.
  useEffect(() => {
    if (form.mode !== 'NEW_VERSION' || !selectedDocument) return;
    const allocated = allocateFromExistingDocument(selectedDocument);
    setForm((current) => {
      if (
        current.existingDocumentId === allocated.existingDocumentId
        && current.title === allocated.title
        && current.documentCode === allocated.documentCode
        && current.documentType === allocated.documentType
        && current.versionNo === allocated.versionNo
        && current.sectionKey === allocated.sectionKey
      ) {
        return current;
      }
      return { ...current, ...allocated };
    });
  }, [form.mode, selectedDocument, suggestedVersion]);

  const accepted = fileTypes.map((item) => `.${item.extension}`).join(',');

  const showSuccess = (message: string) => {
    setNotice(message);
    setError('');
    window.setTimeout(() => setNotice(''), 4000);
  };

  const refreshProjects = async (preferId?: string) => {
    try {
      const next = await api<ProjectRecord[]>('/projects');
      setProjects(next);
      if (preferId) setForm((current) => ({ ...current, projectId: preferId, sectionKey: '' }));
      return next;
    } catch {
      setNotice((current) => current || 'Created successfully, but the full project list could not be refreshed.');
      return null;
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setStructuredError(null);
    const pasteFile = contentMode === 'paste' ? buildPasteFile() : null;
    const uploadFile = contentMode === 'file' ? file : pasteFile;
    if (!uploadFile && !draftHasFile) {
      setError(contentMode === 'paste' ? 'Paste approved content before importing.' : 'Select an approved document file.');
      return;
    }
    if (form.approvalStatus !== 'APPROVED') {
      setError('Only APPROVED documents may enter the official repository. Set approval status to Approved, or save as draft.');
      return;
    }
    if (form.mode === 'NEW_VERSION' && !form.existingDocumentId) {
      setError('Select a project so the existing document can be allocated.');
      return;
    }
    if (!requiredComplete) {
      setError(`Import blocked. Complete required fields first: ${missingRequiredLabels.join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      const body = new FormData();
      if (uploadFile) body.append('file', uploadFile);
      Object.entries({
        ...form,
        relationshipsJson: relationshipsPayload(),
        approvalStatus: form.approvalStatus,
        approvalDate: form.approvalDate || new Date().toISOString().slice(0, 10),
        draftJobId: activeContinueJobId || undefined,
      }).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') body.append(key, String(value));
      });
      const response = await fetch(`${API_URL}/imports/upload`, { method: 'POST', headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {}, body });
      const payload = await response.json();
      if (!response.ok) {
        if (payload.code) setStructuredError(payload as StructuredError);
        throw new Error(Array.isArray(payload.message) ? payload.message.join(', ') : payload.message ?? 'Import failed');
      }
      router.push(`/imports/${payload.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed');
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    setError('');
    setStructuredError(null);
    if (!form.projectId) {
      setError('Select a project before saving a draft.');
      return;
    }
    if (!form.sourceSystemId) {
      setError('Select a source system before saving a draft.');
      return;
    }
    const pasteFile = contentMode === 'paste' ? buildPasteFile() : null;
    const uploadFile = contentMode === 'file' ? file : pasteFile;
    setSavingDraft(true);
    try {
      const body = new FormData();
      if (uploadFile) body.append('file', uploadFile);
      Object.entries({
        ...form,
        relationshipsJson: relationshipsPayload(),
        approvalStatus: form.approvalStatus || 'APPROVED',
        approvalDate: form.approvalDate || new Date().toISOString().slice(0, 10),
        draftJobId: activeContinueJobId || undefined,
      }).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') body.append(key, String(value));
      });
      const response = await fetch(`${API_URL}/imports/draft`, {
        method: 'POST',
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
        body,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(Array.isArray(payload.message) ? payload.message.join(', ') : payload.message ?? 'Unable to save draft.');
      }
      router.push('/imports/queue');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  const buildPasteFile = (): File | null => {
    const text = pasteContent.trim();
    if (!text) return null;
    const safeName = (pasteFileName.trim() || 'pasted-content.txt').replace(/[<>:"/\\|?*]/g, '-');
    const withExt = /\.[a-z0-9]+$/i.test(safeName) ? safeName : `${safeName}.txt`;
    return new File([text], withExt, { type: 'text/plain;charset=utf-8' });
  };

  const relationshipRows = useMemo(() => {
    try {
      const parsed = JSON.parse(form.relationshipsJson || '[]');
      return Array.isArray(parsed) ? parsed as Array<{ toDocumentId: string; type?: string; description?: string }> : [];
    } catch {
      return [];
    }
  }, [form.relationshipsJson]);

  const addRelationship = () => {
    if (!relDraft.toDocumentId) {
      setError('Select a related document before adding a relationship.');
      return;
    }
    const next = [
      ...relationshipRows.filter((row) => !(row.toDocumentId === relDraft.toDocumentId && row.type === relDraft.type)),
      {
        toDocumentId: relDraft.toDocumentId,
        type: relDraft.type,
        description: relDraft.description.trim() || undefined,
      },
    ];
    setForm((current) => ({ ...current, relationshipsJson: JSON.stringify(next) }));
    setRelDraft({ toDocumentId: '', type: 'RELATED_TO', description: '' });
    setError('');
  };

  const removeRelationship = (toDocumentId: string, type?: string) => {
    const next = relationshipRows.filter((row) => !(row.toDocumentId === toDocumentId && (row.type || 'RELATED_TO') === (type || 'RELATED_TO')));
    setForm((current) => ({ ...current, relationshipsJson: JSON.stringify(next) }));
  };

  const relationshipsPayload = () => {
    try {
      const parsed = JSON.parse(form.relationshipsJson || '[]');
      if (!Array.isArray(parsed)) return '[]';
      return JSON.stringify(
        parsed.filter((row: { toDocumentId?: string }) => Boolean(String(row?.toDocumentId || '').trim())),
      );
    } catch {
      return '[]';
    }
  };

  const replaceFile = () => {
    setFile(null);
    setDraftHasFile(false);
    setDraftFileName('');
    setDraftFileSize(0);
    setStructuredError(null);
    autoTitleRef.current = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
    fileInputRef.current?.focus();
  };

  const assignFile = (next: File | null) => {
    setFile(next);
    setStructuredError(null);
    if (!next) {
      autoTitleRef.current = '';
      return;
    }
    setDraftHasFile(false);
    // New Version identity comes from the existing document, not the file name.
    if (form.mode === 'NEW_VERSION') return;
    const suggested = titleFromFileName(next.name);
    if (!suggested) return;
    setForm((current) => {
      const shouldReplace = !current.title.trim() || current.title.trim() === autoTitleRef.current;
      autoTitleRef.current = suggested;
      if (!shouldReplace) return current;
      return { ...current, title: suggested };
    });
  };

  const viewExistingVersion = () => {
    const id = structuredError?.details?.documentId;
    if (id) router.push(`/documents/${id}`);
  };

  const formValueForMetadataKey = (key: string): unknown => {
    const extras = parseMetadataJson(form.metadataJson);
    const pasteName =
      contentMode === 'paste' && pasteContent.trim()
        ? (/\.[a-z0-9]+$/i.test(pasteFileName.trim())
            ? pasteFileName.trim()
            : `${(pasteFileName.trim() || 'pasted-content')}.txt`)
        : '';
    const mapped: Record<string, unknown> = {
      title: form.title,
      documentType: form.documentType,
      versionNo: form.versionNo,
      approvalStatus: form.approvalStatus || 'APPROVED',
      approvedBy: form.approvedBy,
      approvalDate: form.approvalDate,
      owner: form.owner,
      description: form.description,
      projectId: form.projectId,
      sourceSystemId: form.sourceSystemId,
      sectionKey: form.sectionKey,
      fileName: file?.name || (draftHasFile ? draftFileName : '') || pasteName,
      existingDocumentId: form.existingDocumentId,
      ...extras,
    };
    return mapped[key];
  };

  const isFilled = (value: unknown) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'boolean') return true;
    if (typeof value === 'number') return !Number.isNaN(value);
    return true;
  };

  const displayValue = (value: unknown) => {
    if (!isFilled(value)) return 'Missing';
    if (typeof value === 'string') return value.trim();
    return String(value);
  };

  const fileExtension = useMemo(() => {
    const pasteName =
      contentMode === 'paste'
        ? (/\.[a-z0-9]+$/i.test(pasteFileName.trim()) ? pasteFileName.trim() : `${(pasteFileName.trim() || 'pasted-content')}.txt`)
        : '';
    const name = file?.name || (draftHasFile ? draftFileName : '') || pasteName;
    if (!name.includes('.')) return '';
    return name.split('.').pop()?.toLowerCase() ?? '';
  }, [file, draftHasFile, draftFileName, contentMode, pasteFileName]);

  const hasApprovedFile = Boolean(file) || draftHasFile || (contentMode === 'paste' && pasteContent.trim().length > 0);
  const displayFileName =
    file?.name ||
    draftFileName ||
    (contentMode === 'paste'
      ? (/\.[a-z0-9]+$/i.test(pasteFileName.trim()) ? pasteFileName.trim() : `${(pasteFileName.trim() || 'pasted-content')}.txt`)
      : '');
  const displayFileSize =
    file?.size ?? draftFileSize ?? (contentMode === 'paste' && pasteContent.trim() ? new Blob([pasteContent]).size : undefined);

  const matchedFileType = useMemo(() => {
    if (!fileExtension) return null;
    return fileTypes.find((item) => item.extension === fileExtension) ?? null;
  }, [fileExtension, fileTypes]);

  const selectedSource = sources.find((item) => item.id === form.sourceSystemId);
  const selectedProjectLabel = selectedProject ? `${selectedProject.code} — ${selectedProject.name}` : '';
  const activeSections = useMemo(
    () => [...(selectedProject?.sections ?? [])].filter((section) => section.active !== false).sort((a, b) => a.position - b.position),
    [selectedProject],
  );

  const requiredChecks = useMemo(() => {
    const core = [
      {
        key: 'projectId',
        label: 'Project',
        done: Boolean(form.projectId),
        value: selectedProjectLabel || 'Select a project',
      },
      {
        key: 'sourceSystemId',
        label: 'Source system',
        done: Boolean(form.sourceSystemId),
        value: selectedSource?.name || 'Select a source system',
      },
      {
        key: 'file',
        label: contentMode === 'paste' ? 'Approved content' : 'Approved file',
        done: hasApprovedFile,
        value: hasApprovedFile
          ? `${displayFileName}${displayFileSize ? ` (${formatBytes(displayFileSize)})` : ''}${!file && draftHasFile ? ' · kept from draft' : ''}${contentMode === 'paste' && !file ? ' · pasted' : ''}`
          : contentMode === 'paste'
            ? 'Paste approved content'
            : 'Upload an approved file',
      },
      ...(form.mode === 'NEW_VERSION'
        ? [{
            key: 'existingDocumentId',
            label: 'Existing document',
            done: Boolean(form.existingDocumentId),
            value: selectedDocument ? `${selectedDocument.code} — ${selectedDocument.title}` : 'Select the existing document',
          }]
        : []),
    ];

    const fromDb = metadataFields
      .filter((field) => field.required && field.active !== false)
      .filter((field) => !['projectId', 'sourceSystemId', 'file', 'existingDocumentId', 'fileName', 'relationships', 'relationshipsJson'].includes(field.key))
      .map((field) => {
        const value = formValueForMetadataKey(field.key);
        return {
          key: field.key,
          label: field.label,
          done: isFilled(value),
          value: displayValue(value),
        };
      });

    const byKey = new Map<string, { key: string; label: string; done: boolean; value: string }>();
    [...core, ...fromDb].forEach((item) => byKey.set(item.key, item));
    return Array.from(byKey.values());
  }, [file, draftHasFile, draftFileName, draftFileSize, form, metadataFields, selectedDocument, selectedProjectLabel, selectedSource, hasApprovedFile, displayFileName, displayFileSize, contentMode, pasteContent]);

  const requiredComplete = useMemo(
    () => requiredChecks.length > 0 && requiredChecks.every((item) => item.done),
    [requiredChecks],
  );
  const missingRequiredLabels = useMemo(
    () => requiredChecks.filter((item) => !item.done).map((item) => item.label),
    [requiredChecks],
  );

  const completeness = useMemo(() => {
    const activeFields = metadataFields.filter((field) => field.active !== false);
    const contextFields = [
      { key: 'projectId', label: 'Project', required: true },
      { key: 'sourceSystemId', label: 'Source system', required: true },
      { key: 'fileName', label: contentMode === 'paste' ? 'Approved content' : 'Approved file', required: true },
      ...(form.mode === 'NEW_VERSION'
        ? [{ key: 'existingDocumentId', label: 'Existing document', required: true }]
        : []),
      ...(form.sectionKey ? [{ key: 'sectionKey', label: 'Repository section override', required: false }] : []),
    ];

    const items = [
      ...activeFields.map((field) => {
        const value = formValueForMetadataKey(field.key);
        return {
          key: field.key,
          label: field.label,
          required: field.required,
          done: isFilled(value),
          value: displayValue(value),
          group: field.required ? 'Required metadata' : 'Optional metadata',
        };
      }),
      ...contextFields.map((field) => {
        const value = formValueForMetadataKey(field.key);
        return {
          key: `context-${field.key}`,
          label: field.label,
          required: field.required,
          done: isFilled(value),
          value: field.key === 'projectId'
            ? (selectedProjectLabel || 'Missing')
            : field.key === 'sourceSystemId'
              ? (selectedSource?.name || 'Missing')
              : field.key === 'sectionKey'
                ? (activeSections.find((section) => section.sectionKey === form.sectionKey)?.name || form.sectionKey)
                : displayValue(value),
          group: 'Import context',
        };
      }),
    ];

    const groups = ['Required metadata', 'Optional metadata', 'Import context']
      .map((label) => {
        const groupItems = items.filter((item) => item.group === label);
        return {
          label,
          done: groupItems.filter((item) => item.done).length,
          total: groupItems.length,
          items: groupItems,
        };
      })
      .filter((group) => group.total > 0);

    const done = items.filter((item) => item.done).length;
    const total = items.length;
    return {
      percent: total ? Math.round((done / total) * 100) : 0,
      done,
      total,
      groups,
      items,
    };
  }, [activeSections, draftFileName, draftHasFile, file, form, metadataFields, selectedProjectLabel, selectedSource, contentMode, pasteContent, pasteFileName]);

  const matchedRoutingRule = useMemo(() => {
    if (!form.projectId) return null;
    const extras = parseMetadataJson(form.metadataJson);
    const candidates = [...routingRules]
      .filter((rule) => rule.active !== false)
      .sort((a, b) => a.priority - b.priority);

    return candidates.find((rule) => {
      if (rule.projectId && rule.projectId !== form.projectId) return false;
      if (rule.sourceSystemId && rule.sourceSystemId !== form.sourceSystemId) return false;
      if (rule.fileExtension) {
        if (!fileExtension || rule.fileExtension.toLowerCase() !== fileExtension) return false;
      }
      if (rule.documentType) {
        if (!form.documentType.trim() || rule.documentType.trim().toLowerCase() !== form.documentType.trim().toLowerCase()) return false;
      }
      if (rule.metadataKey) {
        if (String(extras[rule.metadataKey] ?? '') !== String(rule.metadataValue ?? '')) return false;
      }
      return true;
    }) ?? null;
  }, [fileExtension, form.documentType, form.metadataJson, form.projectId, form.sourceSystemId, routingRules]);

  const routingPreview = useMemo(() => {
    if (!form.projectId) {
      return {
        status: 'waiting',
        summary: 'Select a project',
        sectionName: '—',
        ruleName: '—',
        reason: 'Routing is available after a project is selected.',
      };
    }

    if (form.sectionKey) {
      const explicit = activeSections.find((section) => section.sectionKey === form.sectionKey);
      return {
        status: explicit ? 'resolved' : 'error',
        summary: explicit ? 'Section selected' : 'Section unavailable',
        sectionName: explicit ? `${explicit.position}. ${explicit.name}` : form.sectionKey,
        ruleName: 'Manual selection',
        reason: explicit
          ? `This import will be placed in ${explicit.name}.`
          : 'The selected section is not available for this project.',
      };
    }

    if (matchedRoutingRule) {
      const byKey = activeSections.find((section) => section.sectionKey === matchedRoutingRule.targetSectionKey);
      return {
        status: byKey ? 'resolved' : 'error',
        summary: byKey ? 'Routed automatically' : 'Destination unavailable',
        sectionName: byKey ? `${byKey.position}. ${byKey.name}` : matchedRoutingRule.targetSectionKey,
        ruleName: matchedRoutingRule.name,
        reason: byKey
          ? `Destination resolved to ${byKey.name}.`
          : 'The resolved destination is not available for this project.',
      };
    }

    if (!form.documentType.trim()) {
      return {
        status: 'waiting',
        summary: 'Awaiting document type',
        sectionName: 'Pending',
        ruleName: 'Pending',
        reason: 'Select a document type to resolve the destination section.',
      };
    }

    const typeKey = form.documentType.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    const byTypeKey = activeSections.find((section) => section.sectionKey === typeKey);
    const byTypeName = activeSections.find((section) => section.name.trim().toLowerCase() === form.documentType.trim().toLowerCase());
    const fallback = byTypeKey || byTypeName;
    if (fallback) {
      return {
        status: 'resolved',
        summary: 'Routed automatically',
        sectionName: `${fallback.position}. ${fallback.name}`,
        ruleName: 'Document type match',
        reason: `Destination resolved to ${fallback.name}.`,
      };
    }

    return {
      status: 'waiting',
      summary: 'Destination unresolved',
      sectionName: 'Unresolved',
      ruleName: 'None',
      reason: 'Select a repository section to continue, or review routing configuration.',
    };
  }, [activeSections, form.documentType, form.projectId, form.sectionKey, matchedRoutingRule]);

  if (loadingOptions || loadingDraft) {
    return (
      <div className={styles.page}>
        <button type="button" className={styles.backLink} onClick={() => router.back()}>
          <ArrowLeft size={14} /> Back
        </button>
        <div className={styles.header}>
          <h1>{activeContinueJobId ? 'Continue import' : 'Import Approved Document'}</h1>
          <p>{loadingDraft ? 'Loading draft…' : 'Loading configuration…'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <button type="button" className={styles.backLink} onClick={() => router.back()}>
        <ArrowLeft size={14} /> Back
      </button>
      <div className={styles.header}>
        <h1>{activeContinueJobId ? 'Continue import' : 'Import Approved Document'}</h1>
        <p>
          {activeContinueJobId
            ? (draftHasFile
              ? 'Review the draft details. The previously uploaded file is kept — replace it only if needed.'
              : 'Review the draft details, upload an approved file, and complete the import.')
            : 'Import an approved source file, capture required metadata, and place it in the project repository.'}
        </p>
      </div>

      <div className={styles.layout}>
        <form className={styles.formCard} onSubmit={submit}>
          <div className={styles.banner}>
            <Info className={styles.bannerIcon} size={16} />
            <div><strong>Approved documents only.</strong> This gateway accepts files that have already been approved and records approval against the importing user.</div>
          </div>
          {activeContinueJobId && draftHasFile ? (
            <div className="notice info">
              Continuing draft <strong>{draftFileName}</strong>. The previously uploaded file is ready to import.
            </div>
          ) : null}
          {notice && <div className="notice success">{notice}</div>}
          {structuredError?.code === 'DUPLICATE_DOCUMENT_CONTENT' && (
            <DuplicateModal error={structuredError} onChooseFile={replaceFile} onViewDocument={viewExistingVersion} onCancel={() => setStructuredError(null)} />
          )}

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>1. Import type</h2>
              <p>Choose whether this is a new logical document or a new version of an existing document.</p>
            </div>
            <div className={styles.modeToggle} role="group" aria-label="Import type">
              <button
                type="button"
                className={`${styles.modeOption} ${form.mode === 'NEW' ? styles.modeOptionActive : ''}`}
                onClick={() => {
                  const nextTitle = file ? titleFromFileName(file.name) : '';
                  autoTitleRef.current = nextTitle;
                  setForm({ ...form, mode: 'NEW', existingDocumentId: '', versionNo: '1.0', title: nextTitle, documentCode: '', documentType: '' });
                }}
              >
                New Document
              </button>
              <button
                type="button"
                className={`${styles.modeOption} ${form.mode === 'NEW_VERSION' ? styles.modeOptionActive : ''}`}
                onClick={() => {
                  autoTitleRef.current = '';
                  setForm({ ...form, mode: 'NEW_VERSION', existingDocumentId: '', versionNo: '', title: '', documentCode: '', documentType: '' });
                }}
              >
                New Version
              </button>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>2. Source and destination</h2>
              <p>Select the project and source system for this import.</p>
            </div>
            <div className={styles.grid2}>
              <CreatableSelect
                label="Project"
                name="projectId"
                required
                loading={loadingOptions}
                value={form.projectId}
                options={projects.map((item) => ({ value: item.id, label: `${item.code} — ${item.name}` }))}
                placeholder="Select project…"
                canCreate={canCreate}
                createLabel="Add New Project"
                onChange={(projectId) => setForm((current) => ({ ...current, projectId, sectionKey: '', existingDocumentId: '' }))}
                onCreateClick={() => setCreateModal('project')}
              />
              <CreatableSelect
                label="Source system"
                name="sourceSystemId"
                required
                loading={loadingOptions}
                value={form.sourceSystemId}
                options={sources.map((item) => ({ value: item.id, label: item.name }))}
                placeholder="Select source system…"
                canCreate={canCreate}
                createLabel="Add New Source System"
                onChange={(sourceSystemId) => setForm((current) => ({ ...current, sourceSystemId }))}
                onCreateClick={() => setCreateModal('source')}
              />
              {form.mode === 'NEW_VERSION' && (
                <div className={`field ${styles.spanFull}`}>
                  <label htmlFor="existing-document-select">Existing document <em>*</em></label>
                  {selectedDocument ? (
                    <div className="readonly-box">
                      <div><strong>{selectedDocument.code}</strong> — {selectedDocument.title}</div>
                      <div className="secondary-text">Section: {selectedDocument.section?.name ?? '—'}</div>
                      <div className="secondary-text">
                        Current version: {currentVersion?.versionNo ?? selectedDocument.currentVersionNo ?? '—'}
                        {' · '}
                        Next version: {suggestedVersion}
                      </div>
                      {projectDocuments.length > 1 && (
                        <div className={styles.inlineSelect}>
                          <select
                            id="existing-document-select"
                            required
                            aria-label="Existing document"
                            title="Existing document"
                            value={form.existingDocumentId}
                            onChange={(e) => {
                              const document = projectDocuments.find((item: any) => item.id === e.target.value);
                              if (!document) return;
                              setForm((current) => ({
                                ...current,
                                ...allocateFromExistingDocument(document),
                              }));
                            }}
                          >
                            {projectDocuments.map((item: any) => (
                              <option key={item.id} value={item.id}>{item.code} — {item.title}</option>
                            ))}
                          </select>
                          <small>Allocated automatically. Change only if another document is required.</small>
                        </div>
                      )}
                      {projectDocuments.length <= 1 && (
                        <small>Allocated automatically for this project.</small>
                      )}
                    </div>
                  ) : (
                    <>
                      <select
                        id="existing-document-select"
                        required
                        aria-label="Existing document"
                        title="Existing document"
                        disabled={!form.projectId || documentsLoading}
                        value={form.existingDocumentId}
                        onChange={(e) => {
                          const document = projectDocuments.find((item: any) => item.id === e.target.value);
                          if (!document) {
                            setForm((current) => ({
                              ...current,
                              existingDocumentId: '',
                              title: '',
                              documentCode: '',
                              documentType: '',
                              versionNo: '',
                              sectionKey: '',
                            }));
                            return;
                          }
                          setForm((current) => ({
                            ...current,
                            ...allocateFromExistingDocument(document),
                          }));
                        }}
                      >
                        <option value="">
                          {!form.projectId
                            ? 'Select a project first…'
                            : documentsLoading
                              ? 'Loading documents…'
                              : file
                                ? 'Select document…'
                                : 'Upload a file or select document…'}
                        </option>
                        {projectDocuments.map((item: any) => (
                          <option key={item.id} value={item.id}>{item.code} — {item.title}</option>
                        ))}
                      </select>
                      {!form.projectId && (
                        <small>Choose a project to allocate an existing document.</small>
                      )}
                      {form.projectId && documentsError && (
                        <small className={styles.fieldError}>{documentsError}</small>
                      )}
                      {form.projectId && !documentsLoading && !documentsError && projectDocuments.length === 0 && (
                        <small>No existing documents found for this project.</small>
                      )}
                      {form.projectId && !documentsLoading && projectDocuments.length > 1 && !file && (
                        <small>Upload the approved file to auto-match, or select the document.</small>
                      )}
                    </>
                  )}
                </div>
              )}
              {form.mode === 'NEW_VERSION' && selectedDocument && (
                <div className={`field ${styles.spanFull}`}>
                  <label>Version allocation</label>
                  <div className="readonly-box">
                    <div><strong>{form.versionNo || suggestedVersion}</strong> (auto-allocated)</div>
                    <div className="secondary-text">From current {currentVersion?.versionNo ?? selectedDocument.currentVersionNo ?? '—'}</div>
                    <div className="secondary-text">File: {currentVersion?.originalFileName ?? '—'}</div>
                    <div className="secondary-text">Approval: {currentVersion?.approvedBy ?? '—'} {currentVersion?.approvalDate ? new Date(currentVersion.approvalDate).toLocaleDateString() : ''}</div>
                  </div>
                </div>
              )}
              <div className={styles.spanFull}>
                <CreatableSelect
                  label="Repository section"
                  name="sectionKey"
                  value={form.sectionKey}
                  options={[{ value: '', label: 'Automatic' }, ...sectionOptions]}
                  placeholder="Automatic"
                  canCreate={canCreate}
                  createLabel="Add New Repository Section"
                  createDisabled={!form.projectId}
                  createDisabledReason="Select a project before adding a repository section."
                  hint="Optional. Leave Automatic unless a specific section is required."
                  onChange={(sectionKey) => setForm((current) => ({ ...current, sectionKey }))}
                  onCreateClick={() => setCreateModal('section')}
                />
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>3. Approved content</h2>
              <p>Upload an approved file, or paste text exported from ChatGPT / Word / notes. Source systems are labels — not live AI library connectors.</p>
            </div>
            <div className={styles.grid2} style={{ marginBottom: 12 }}>
              <div className="field">
                <label>Content source</label>
                <select
                  value={contentMode}
                  onChange={(event) => {
                    const next = event.target.value as 'file' | 'paste';
                    setContentMode(next);
                    if (next === 'paste') replaceFile();
                    else setPasteContent('');
                  }}
                  aria-label="Choose file upload or paste"
                >
                  <option value="file">File upload</option>
                  <option value="paste">Paste text content</option>
                </select>
              </div>
              {contentMode === 'paste' ? (
                <div className="field">
                  <label>Saved file name</label>
                  <input
                    value={pasteFileName}
                    onChange={(event) => setPasteFileName(event.target.value)}
                    placeholder="pasted-content.txt"
                  />
                </div>
              ) : null}
            </div>
            {contentMode === 'paste' ? (
              <div className="field">
                <label>Pasted content <em>*</em></label>
                <textarea
                  rows={10}
                  value={pasteContent}
                  onChange={(event) => setPasteContent(event.target.value)}
                  placeholder="Paste the approved document text here…"
                  required={!draftHasFile}
                />
                <small>Stored as a .txt Knowledge Asset representation. Prefer DOCX/PDF upload when the approved source file is available.</small>
              </div>
            ) : (
            <div
              className={`${styles.uploadZone} ${dragActive ? styles.uploadZoneActive : ''}`}
              onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
              onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
              onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                const dropped = event.dataTransfer.files?.[0] ?? null;
                assignFile(dropped);
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
                ref={fileInputRef}
                type="file"
                accept={accepted}
                required={!hasApprovedFile}
                aria-label="Approved document file"
                title="Approved document file"
                className={hasApprovedFile ? styles.fileInputHidden : styles.fileInputOverlay}
                onChange={(e) => assignFile(e.target.files?.[0] ?? null)}
              />
              {!hasApprovedFile ? (
                <>
                  <div className={styles.uploadIcon}><CloudUpload size={20} /></div>
                  <p className={styles.uploadTitle}>Drag and drop your file here or click to browse</p>
                  <p className={styles.uploadHint}>
                    {accepted || 'Configured file types will appear here.'}
                  </p>
                </>
              ) : (
                <div className={styles.fileCard}>
                  <div className={styles.fileIcon}><FileText size={18} /></div>
                  <div className={styles.fileMeta}>
                    <strong>{displayFileName}</strong>
                    <span>
                      {displayFileSize ? formatBytes(displayFileSize) : 'Staged from draft'}
                      {matchedFileType ? ` · ${matchedFileType.label}` : ''}
                      {!file && draftHasFile ? ' · kept from draft' : ''}
                    </span>
                  </div>
                  <CheckCircle2 className={styles.fileOk} size={18} />
                  <button
                    type="button"
                    className={styles.fileRemove}
                    aria-label="Remove file"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      replaceFile();
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>4. Document identity</h2>
              <p>The code may be supplied by the author or generated from the project and destination section.</p>
            </div>
            <div className={styles.grid2}>
              <div className={`field ${styles.spanFull}`}>
                <label>Document title <em>*</em></label>
                <input
                  required
                  value={form.title}
                  disabled={form.mode === 'NEW_VERSION'}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder={form.mode === 'NEW_VERSION' ? 'Allocated from existing document' : 'Enter the approved document title'}
                />
                {form.mode === 'NEW_VERSION' ? (
                  <small>Allocated from the existing document.</small>
                ) : (file || draftHasFile) && form.title === autoTitleRef.current ? (
                  <small>Filled from the uploaded file name. You can edit it if needed.</small>
                ) : null}
              </div>
              <div className="field">
                <label>Document code</label>
                <input
                  placeholder={form.mode === 'NEW_VERSION' ? 'Allocated from existing document' : 'Auto-generated when blank'}
                  value={form.documentCode}
                  disabled={form.mode === 'NEW_VERSION'}
                  onChange={(e) => setForm({ ...form, documentCode: e.target.value })}
                />
              </div>
              <CreatableSelect
                label="Document type"
                name="documentType"
                required
                loading={loadingOptions}
                value={form.documentType}
                options={documentTypes.map((item) => ({ value: item.name, label: item.name }))}
                placeholder="Select type…"
                canCreate={canCreate && form.mode !== 'NEW_VERSION'}
                createLabel="Add New Document Type"
                hint={form.mode === 'NEW_VERSION' ? 'Allocated from the existing document.' : 'Required classification for the approved document.'}
                disabled={form.mode === 'NEW_VERSION'}
                onChange={(documentType) => setForm((current) => ({ ...current, documentType }))}
                onCreateClick={() => setCreateModal('documentType')}
              />
              <div className="field">
                <label>Version <em>*</em></label>
                <input
                  required
                  placeholder="1.0"
                  value={form.versionNo}
                  disabled={form.mode === 'NEW_VERSION'}
                  onChange={(e) => setForm({ ...form, versionNo: e.target.value })}
                />
                {form.mode === 'NEW_VERSION' ? (
                  <small>Next version auto-allocated.</small>
                ) : null}
              </div>
              <div className="field">
                <label>Document owner</label>
                <input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Optional owner" />
              </div>
              <div className="field">
                <label>Approval status <em>*</em></label>
                <select
                  required
                  value={form.approvalStatus}
                  onChange={(e) => setForm({ ...form, approvalStatus: e.target.value })}
                  aria-label="Approval status"
                >
                  <option value="APPROVED">Approved — allowed into repository</option>
                  <option value="PENDING_REVIEW">Pending review — blocked</option>
                  <option value="DRAFT">Draft — blocked</option>
                  <option value="REJECTED">Rejected — blocked</option>
                </select>
                <small>Backend enforces APPROVED only. Non-approved values are rejected on import.</small>
              </div>
              <div className="field">
                <label>Approved by <em>*</em></label>
                <input
                  required
                  readOnly
                  value={form.approvedBy}
                  placeholder="Signed-in user"
                  title="Recorded from your signed-in account"
                />
                <small>Taken from your signed-in account.</small>
              </div>
              <div className="field">
                <label>Approval date <em>*</em></label>
                <input
                  required
                  type="date"
                  value={form.approvalDate}
                  onChange={(e) => setForm({ ...form, approvalDate: e.target.value })}
                />
              </div>
              <div className={`field ${styles.spanFull}`}>
                <label>Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional summary of the document" />
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>5. Relationships</h2>
              <p>Optional. Skip this on the first import — there are no other documents to link yet.</p>
            </div>
            <div className={styles.grid2}>
              <div className="field">
                <label>Related document</label>
                <select
                  value={relDraft.toDocumentId}
                  onChange={(event) => setRelDraft((current) => ({ ...current, toDocumentId: event.target.value }))}
                  disabled={!form.projectId || documentsLoading}
                >
                  <option value="">{documentsLoading ? 'Loading…' : 'Select document…'}</option>
                  {documents.map((doc: any) => (
                    <option key={doc.id} value={doc.id}>{doc.code} — {doc.title}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Relationship type</label>
                <select
                  value={relDraft.type}
                  onChange={(event) => setRelDraft((current) => ({ ...current, type: event.target.value }))}
                >
                  {['RELATED_TO', 'DEPENDS_ON', 'REFERENCES', 'IMPLEMENTS', 'PARENT_OF', 'CHILD_OF', 'SUPERSEDES', 'SUPPORTS'].map((type) => (
                    <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div className={`field ${styles.spanFull}`}>
                <label>Relationship note</label>
                <input
                  value={relDraft.description}
                  onChange={(event) => setRelDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className={styles.actions} style={{ marginTop: 8, justifyContent: 'flex-start' }}>
              <button type="button" className="button small" onClick={addRelationship} disabled={!form.projectId}>
                Add relationship
              </button>
              {!form.projectId ? <span className="secondary-text">Select a project first.</span> : null}
              {form.projectId && documents.length === 0 && !documentsLoading ? (
                <span className="secondary-text">No other documents in this project yet.</span>
              ) : null}
            </div>
            {relationshipRows.length > 0 ? (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Document</th>
                      <th>Note</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {relationshipRows.map((row) => {
                      const target = documents.find((doc: any) => doc.id === row.toDocumentId);
                      return (
                        <tr key={`${row.toDocumentId}-${row.type || 'RELATED_TO'}`}>
                          <td>{(row.type || 'RELATED_TO').replaceAll('_', ' ')}</td>
                          <td>{target ? `${target.code} — ${target.title}` : row.toDocumentId}</td>
                          <td>{row.description || '—'}</td>
                          <td>
                            <button
                              type="button"
                              className="button small"
                              onClick={() => removeRelationship(row.toDocumentId, row.type)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          {error && !structuredError && <div className="notice error">{error}</div>}

          <div className={styles.actions}>
            <button type="button" className="button" onClick={() => router.back()} disabled={saving || savingDraft}>
              Cancel
            </button>
            <button
              type="button"
              className="button"
              disabled={saving || savingDraft || loadingOptions || loadingDraft}
              onClick={() => void saveDraft()}
            >
              {savingDraft ? 'Saving draft…' : 'Save as draft'}
            </button>
            <button className="button primary" disabled={saving || savingDraft || !requiredComplete} title={!requiredComplete ? `Complete required fields: ${missingRequiredLabels.join(', ')}` : undefined}>
              {saving
                ? (activeContinueJobId ? 'Continuing import…' : 'Validating and importing…')
                : (activeContinueJobId ? 'Validate and reimport' : 'Validate and import')}
            </button>
          </div>
        </form>

        <aside className={styles.statusRow}>
          <div className={styles.sideCard}>
            <h3>Required fields</h3>
            <p className={styles.sideMeta}>
              {loadingOptions
                ? 'Loading configuration…'
                : `${requiredChecks.filter((item) => item.done).length}/${requiredChecks.length} complete for this import`}
            </p>
            <ul className={styles.reqList}>
              {requiredChecks.length ? requiredChecks.map((item) => (
                <li key={item.key}>
                  <span className={`${styles.dot} ${item.done ? styles.dotDone : ''}`} />
                  <div className={styles.reqBody}>
                    <span className={styles.reqLabel}>{item.label}</span>
                    <span className={`${styles.reqValue} ${item.done ? styles.reqValueDone : styles.reqValueMissing}`}>
                      {item.value}
                    </span>
                  </div>
                </li>
              )) : <li className={styles.emptyHint}>No required fields for this import yet.</li>}
            </ul>
          </div>

          <div className={styles.sideCard}>
            <h3>Metadata completeness</h3>
            <p className={styles.sideMeta}>
              {completeness.done}/{completeness.total} fields filled for this import
            </p>
            <div className={styles.progressHead}>
              <span>Progress</span>
              <strong>{completeness.percent}%</strong>
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                // CSS custom property drives width without a hard-coded style rule for every percent.
                ref={(node) => {
                  if (node) node.style.setProperty('--progress-width', `${completeness.percent}%`);
                }}
              />
            </div>
            <ul className={styles.checkList}>
              {completeness.groups.map((group) => (
                <li key={group.label}>
                  <span>{group.label}</span>
                  <span>{group.done}/{group.total}</span>
                </li>
              ))}
            </ul>
            <ul className={styles.fieldStatusList}>
              {completeness.items.map((item) => (
                <li key={item.key}>
                  <span className={`${styles.dot} ${item.done ? styles.dotDone : ''}`} />
                  <div className={styles.reqBody}>
                    <span className={styles.reqLabel}>{item.label}</span>
                    <span className={`${styles.reqValue} ${item.done ? styles.reqValueDone : styles.reqValueMissing}`}>
                      {item.value}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.sideCard}>
            <h3>Routing context</h3>
            <p className={styles.sideMeta}>{routingPreview.summary}</p>
            <p className={styles.routingReason}>{routingPreview.reason}</p>
            <ul className={styles.statusList}>
              <li>
                <span className={styles.statusName}>Project</span>
                <span className={selectedProjectLabel ? styles.statusOk : styles.statusMuted}>
                  {selectedProjectLabel || 'Not selected'}
                </span>
              </li>
              <li>
                <span className={styles.statusName}>VPS folder</span>
                <span className={selectedProject?.repositoryRootPath ? styles.statusOk : styles.statusMuted}>
                  {selectedProject?.repositoryRootPath ? `repository/${selectedProject.repositoryRootPath}` : '—'}
                </span>
              </li>
              <li>
                <span className={styles.statusName}>Source system</span>
                <span className={selectedSource ? styles.statusOk : styles.statusMuted}>
                  {selectedSource
                    ? `${selectedSource.name}${selectedSource.type ? ` · ${selectedSource.type}` : ''}`
                    : 'Not selected'}
                </span>
              </li>
              <li>
                <span className={styles.statusName}>Document type</span>
                <span className={form.documentType.trim() ? styles.statusOk : styles.statusMuted}>
                  {form.documentType.trim() || 'Not selected'}
                </span>
              </li>
              <li>
                <span className={styles.statusName}>Resolved section</span>
                <span className={
                  routingPreview.status === 'resolved'
                    ? styles.statusOk
                    : routingPreview.status === 'error'
                      ? styles.statusError
                      : styles.statusMuted
                }>
                  {routingPreview.sectionName}
                </span>
              </li>
              <li>
                <span className={styles.statusName}>Matching rule</span>
                <span className={matchedRoutingRule || form.sectionKey ? styles.statusOk : styles.statusMuted}>
                  {routingPreview.ruleName}
                </span>
              </li>
              <li>
                <span className={styles.statusName}>File type</span>
                <span className={hasApprovedFile ? (matchedFileType ? styles.statusOk : styles.statusError) : styles.statusMuted}>
                  {matchedFileType
                    ? `${matchedFileType.label} (.${matchedFileType.extension})`
                    : hasApprovedFile
                      ? `Uploaded .${fileExtension || 'unknown'} (not configured)`
                      : 'Awaiting upload'}
                </span>
              </li>
            </ul>
          </div>
        </aside>
      </div>

    {createModal === 'documentType' && (
      <CreateDocumentTypeModal
        onCancel={() => setCreateModal(null)}
        onCreated={(created) => {
          setDocumentTypes((current) => {
            if (current.some((item) => item.id === created.id)) return current;
            return [...current, created].sort((a, b) => a.name.localeCompare(b.name));
          });
          setForm((current) => ({ ...current, documentType: created.name }));
          setCreateModal(null);
          showSuccess('Document type created and selected.');
          void api('/document-types').then((items) => setDocumentTypes(items.filter((item: DocumentTypeRecord) => item.active !== false))).catch(() => {
            setNotice('Document type created and selected. The full list could not be refreshed.');
          });
        }}
      />
    )}
    {createModal === 'source' && (
      <CreateSourceSystemModal
        onCancel={() => setCreateModal(null)}
        onCreated={(created) => {
          setSources((current) => {
            if (current.some((item) => item.id === created.id)) return current;
            return [...current, created].sort((a, b) => a.name.localeCompare(b.name));
          });
          setForm((current) => ({ ...current, sourceSystemId: created.id }));
          setCreateModal(null);
          showSuccess('Source system created and selected.');
          void api('/source-systems').then((items) => setSources(items.filter((item: SourceSystemRecord) => item.active !== false))).catch(() => {
            setNotice('Source system created and selected. The full list could not be refreshed.');
          });
        }}
      />
    )}
    {createModal === 'project' && (
      <CreateProjectModal
        onCancel={() => setCreateModal(null)}
        onCreated={async (created) => {
          setProjects((current) => {
            const without = current.filter((item) => item.id !== created.id);
            return [...without, created].sort((a, b) => a.name.localeCompare(b.name));
          });
          setForm((current) => ({ ...current, projectId: created.id, sectionKey: '', existingDocumentId: '' }));
          setCreateModal(null);
          showSuccess('Project created and selected.');
          await refreshProjects(created.id);
        }}
      />
    )}
    {createModal === 'section' && form.projectId && (
      <CreateRepositorySectionModal
        projectId={form.projectId}
        nextPosition={nextSectionPosition}
        onCancel={() => setCreateModal(null)}
        onCreated={async (created: RepositorySectionRecord) => {
          setProjects((current) => current.map((project) => {
            if (project.id !== form.projectId) return project;
            const sections = [...(project.sections ?? []).filter((item) => item.id !== created.id), created]
              .sort((a, b) => a.position - b.position);
            return { ...project, sections };
          }));
          setForm((current) => ({ ...current, sectionKey: created.sectionKey }));
          setCreateModal(null);
          showSuccess('Repository section created and selected.');
          try {
            const refreshed = await api<ProjectRecord>(`/projects/${form.projectId}`);
            setProjects((current) => current.map((project) => project.id === refreshed.id ? refreshed : project));
          } catch {
            setNotice('Repository section created and selected. The full list could not be refreshed.');
          }
        }}
      />
    )}
    </div>
  );
}

function DuplicateModal({ error, onChooseFile, onViewDocument, onCancel }: { error: StructuredError; onChooseFile: () => void; onViewDocument: () => void; onCancel: () => void }) {
  const d = error.details;
  return <div className="modal-backdrop">
    <div className="modal">
      <div className="modal-header"><h3>Duplicate document content detected</h3></div>
      <div className="modal-body">
        <p>This uploaded file is identical to version <strong>{d?.existingVersion}</strong> already stored for “<strong>{d?.documentTitle}</strong>”.</p>
        <p>Changing the version number to <strong>{d?.submittedVersion}</strong> does not create a genuine new version. Upload the updated and approved file for version {d?.submittedVersion}. The existing version will remain safely preserved in the Version Register.</p>
        <div className="info-panel">
          <div><span>Document title</span><span>{d?.documentTitle}</span></div>
          <div><span>Document code</span><span>{d?.documentCode}</span></div>
          <div><span>Existing version</span><span>{d?.existingVersion}</span></div>
          <div><span>Submitted version</span><span>{d?.submittedVersion}</span></div>
          <div><span>Existing import date</span><span>{d?.existingImportDate ? new Date(d.existingImportDate).toLocaleString() : '—'}</span></div>
          <div><span>Existing file name</span><span>{d?.existingFileName}</span></div>
          <div><span>Repository location</span><span>{d?.repositoryPath}</span></div>
        </div>
      </div>
      <div className="modal-footer">
        <button className="button primary" onClick={onChooseFile}>Choose Updated File</button>
        <button className="button" onClick={onViewDocument}>View Existing Version</button>
        <button className="button text" onClick={onCancel}>Cancel Import</button>
      </div>
    </div>
  </div>;
}
