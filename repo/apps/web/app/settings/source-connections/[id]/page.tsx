'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { api, formatBytes, formatDate } from '@/lib/api';
import { ApiError } from '@/lib/api-error';
import styles from '../SourceConnections.module.css';

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  sections?: Array<{ id: string; name: string; code?: string; active?: boolean }>;
};

type FolderMapping = {
  id: string;
  externalFolderId: string;
  externalFolderName: string;
  externalFolderPath?: string | null;
  project?: { id: string; code?: string; name?: string } | null;
  section?: { id: string; name?: string } | null;
  importMode: 'NEW_ONLY' | 'NEW_AND_CHANGED';
  enabled: boolean;
};

type Connection = {
  id: string;
  name: string;
  provider: string;
  status: string;
  syncSchedule?: string;
  externalAccountLabel?: string | null;
  rootExternalFolderId?: string | null;
  rootExternalFolderName?: string | null;
  defaultProject?: { id: string; code?: string; name?: string } | null;
  defaultSection?: { id: string; name?: string } | null;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
  folderMappings?: FolderMapping[];
  createdAt?: string;
};

type ExternalFolder = {
  id: string;
  name: string;
  parentId?: string;
  path?: string;
  hasChildren?: boolean;
};

type ExternalFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedAt?: string;
  revisionId?: string;
  alreadyImported?: boolean;
};

type SyncRun = {
  id: string;
  status: string;
  triggerType: string;
  startedAt: string;
  completedAt?: string | null;
  filesDetected: number;
  filesQueued: number;
  filesSkipped: number;
  filesFailed: number;
  errorMessage?: string | null;
};

type Breadcrumb = { id: string | null; name: string };

type MappingForm = {
  externalFolderId: string;
  externalFolderName: string;
  externalFolderPath: string;
  projectId: string;
  sectionId: string;
  importMode: 'NEW_ONLY' | 'NEW_AND_CHANGED';
  enabled: boolean;
};

const EMPTY_MAPPING: MappingForm = {
  externalFolderId: '',
  externalFolderName: '',
  externalFolderPath: '',
  projectId: '',
  sectionId: '',
  importMode: 'NEW_AND_CHANGED',
  enabled: true,
};

const SCHEDULES = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'EVERY_15_MINUTES', label: 'Every 15 minutes' },
  { value: 'HOURLY', label: 'Hourly' },
  { value: 'DAILY', label: 'Daily' },
] as const;

function providerLabel(provider?: string) {
  return (provider ?? 'UNKNOWN').replaceAll('_', ' ');
}

export default function SourceConnectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [sections, setSections] = useState<ProjectRow['sections']>([]);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [schedule, setSchedule] = useState('MANUAL');
  const [defaultProjectId, setDefaultProjectId] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [folderCrumbs, setFolderCrumbs] = useState<Breadcrumb[]>([{ id: null, name: 'My Drive' }]);
  const [folders, setFolders] = useState<ExternalFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersError, setFoldersError] = useState('');
  const [selectingRoot, setSelectingRoot] = useState(false);
  const [rootNotice, setRootNotice] = useState('');
  const [rootNoticeOk, setRootNoticeOk] = useState(false);

  const [mappingForm, setMappingForm] = useState<MappingForm>(EMPTY_MAPPING);
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [savingMapping, setSavingMapping] = useState(false);
  const [mappingPickerOpen, setMappingPickerOpen] = useState(false);

  const [fileFolderId, setFileFolderId] = useState<string>('');
  const [files, setFiles] = useState<ExternalFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [conn, projectList, runs] = await Promise.all([
        api<Connection>(`/connectors/${id}`),
        api<ProjectRow[]>('/projects'),
        api<SyncRun[]>(`/connectors/${id}/sync-runs`).catch(() => [] as SyncRun[]),
      ]);
      setConnection(conn);
      setSchedule(conn.syncSchedule || 'MANUAL');
      setDefaultProjectId(conn.defaultProject?.id || '');
      setProjects(projectList);
      setSyncRuns(runs);
      if (conn.rootExternalFolderId) setFileFolderId(conn.rootExternalFolderId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load Source Connection.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadSections = useCallback(async (projectId: string) => {
    if (!projectId) {
      setSections([]);
      return;
    }
    try {
      const detail = await api<ProjectRow>(`/projects/${projectId}`);
      setSections((detail.sections || []).filter((section) => section.active !== false));
    } catch {
      setSections([]);
    }
  }, []);

  useEffect(() => {
    void loadSections(mappingForm.projectId);
  }, [mappingForm.projectId, loadSections]);

  const loadFolders = useCallback(async (parentFolderId: string | null) => {
    setFoldersLoading(true);
    setFoldersError('');
    try {
      const query = parentFolderId ? `?parentFolderId=${encodeURIComponent(parentFolderId)}` : '';
      const rows = await api<ExternalFolder[]>(`/connectors/${id}/folders${query}`);
      setFolders(rows);
    } catch (caught) {
      setFolders([]);
      setFoldersError(caught instanceof Error ? caught.message : 'Unable to list folders.');
    } finally {
      setFoldersLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (connection?.status === 'CONNECTED') {
      void loadFolders(folderCrumbs[folderCrumbs.length - 1]?.id ?? null);
    }
  }, [connection?.status, folderCrumbs, loadFolders]);

  const openFolder = (folder: ExternalFolder) => {
    setFolderCrumbs((current) => [...current, { id: folder.id, name: folder.name }]);
  };

  const jumpToCrumb = (index: number) => {
    setFolderCrumbs((current) => current.slice(0, index + 1));
  };

  const saveSchedule = async (event: FormEvent) => {
    event.preventDefault();
    setSavingSchedule(true);
    setError('');
    setMessage('');
    try {
      const updated = await api<Connection>(`/connectors/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          syncSchedule: schedule,
          defaultProjectId: defaultProjectId || null,
        }),
      });
      setConnection(updated);
      setDefaultProjectId(updated.defaultProject?.id || '');
      setMessage('Connection settings saved.');
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        setMessage('Sync schedule UI is ready, but the update endpoint is not available yet (404).');
      } else {
        setError(caught instanceof Error ? caught.message : 'Unable to save connection settings.');
      }
    } finally {
      setSavingSchedule(false);
    }
  };

  const currentBrowseFolder = folderCrumbs[folderCrumbs.length - 1] ?? { id: null, name: 'My Drive' };

  const selectRootFolder = async (folder: { id: string | null; name: string }) => {
    setSelectingRoot(true);
    setError('');
    setMessage('');
    setRootNotice('');
    setRootNoticeOk(false);
    // Google Drive top level is the special id "root" when crumb id is null.
    const folderId = (folder.id && folder.id.trim()) || 'root';
    const folderName = folder.name?.trim() || (folderId === 'root' ? 'My Drive' : 'Selected folder');
    try {
      const updated = await api<Connection>(`/connectors/${id}/select-root-folder`, {
        method: 'POST',
        body: JSON.stringify({ folderId, folderName }),
      });
      setConnection(updated);
      setFileFolderId(folderId);
      const ok = `Root folder set to “${folderName}”. Next: create a Folder Mapping, then Sync Now.`;
      setMessage(ok);
      setRootNotice(ok);
      setRootNoticeOk(true);
      await load();
    } catch (caught) {
      const msg = caught instanceof Error ? caught.message : 'Unable to select root folder.';
      setError(msg);
      setRootNotice(msg);
      setRootNoticeOk(false);
    } finally {
      setSelectingRoot(false);
    }
  };

  const pickFolderForMapping = (folder: ExternalFolder) => {
    const path = [...folderCrumbs.slice(1).map((crumb) => crumb.name), folder.name].join(' / ');
    setMappingForm((current) => ({
      ...current,
      externalFolderId: folder.id,
      externalFolderName: folder.name,
      externalFolderPath: folder.path || path,
    }));
    setMappingPickerOpen(false);
  };

  const startEditMapping = (mapping: FolderMapping) => {
    setEditingMappingId(mapping.id);
    setMappingForm({
      externalFolderId: mapping.externalFolderId,
      externalFolderName: mapping.externalFolderName,
      externalFolderPath: mapping.externalFolderPath || '',
      projectId: mapping.project?.id || '',
      sectionId: mapping.section?.id || '',
      importMode: mapping.importMode || 'NEW_AND_CHANGED',
      enabled: mapping.enabled !== false,
    });
  };

  const resetMappingForm = () => {
    setEditingMappingId(null);
    setMappingForm(EMPTY_MAPPING);
  };

  const saveMapping = async (event: FormEvent) => {
    event.preventDefault();
    if (!mappingForm.externalFolderId || !mappingForm.externalFolderName) {
      setError('Select an external folder for the Folder Mapping.');
      return;
    }
    if (!mappingForm.projectId) {
      setError('Select a Project for the Folder Mapping (required for import).');
      return;
    }
    setSavingMapping(true);
    setError('');
    setMessage('');
    const body = {
      externalFolderId: mappingForm.externalFolderId,
      externalFolderName: mappingForm.externalFolderName,
      externalFolderPath: mappingForm.externalFolderPath || undefined,
      projectId: mappingForm.projectId || undefined,
      sectionId: mappingForm.sectionId || undefined,
      importMode: mappingForm.importMode,
      enabled: mappingForm.enabled,
    };
    try {
      if (editingMappingId) {
        await api(`/connectors/${id}/folder-mappings/${editingMappingId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        setMessage('Folder Mapping updated.');
      } else {
        await api(`/connectors/${id}/folder-mappings`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setMessage('Folder Mapping created.');
      }
      resetMappingForm();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save Folder Mapping.');
    } finally {
      setSavingMapping(false);
    }
  };

  const deleteMapping = async (mappingId: string) => {
    if (!confirm('Delete this Folder Mapping?')) return;
    setError('');
    setMessage('');
    try {
      await api(`/connectors/${id}/folder-mappings/${mappingId}`, { method: 'DELETE' });
      setMessage('Folder Mapping deleted.');
      if (editingMappingId === mappingId) resetMappingForm();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete Folder Mapping.');
    }
  };

  const loadFiles = async () => {
    const folderId = fileFolderId || connection?.rootExternalFolderId;
    if (!folderId) {
      setFilesError('Select a root folder before browsing files.');
      return;
    }
    setFilesLoading(true);
    setFilesError('');
    setSelectedFileIds([]);
    try {
      const page = await api<{ files: ExternalFile[] }>(
        `/connectors/${id}/files?folderId=${encodeURIComponent(folderId)}`,
      );
      setFiles(page.files || []);
    } catch (caught) {
      setFiles([]);
      setFilesError(caught instanceof Error ? caught.message : 'Unable to list files.');
    } finally {
      setFilesLoading(false);
    }
  };

  const importSelected = async () => {
    if (!selectedFileIds.length) return;
    setImporting(true);
    setError('');
    setMessage('');
    try {
      await api(`/connectors/${id}/import-selected`, {
        method: 'POST',
        body: JSON.stringify({
          fileIds: selectedFileIds,
          folderId: fileFolderId || connection?.rootExternalFolderId || undefined,
        }),
      });
      setMessage(`${selectedFileIds.length} file(s) queued. Open Import Queue to continue review/import.`);
      setSelectedFileIds([]);
      await loadFiles();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to import selected files.');
    } finally {
      setImporting(false);
    }
  };

  const mappings = connection?.folderMappings ?? [];
  const sectionOptions = useMemo(() => sections || [], [sections]);

  if (loading) return <Loading />;
  if (!connection) {
    return (
      <>
        <PageHeader title="Source Connection" description="Configure sync and Folder Mappings." />
        {error ? <div className="notice error">{error}</div> : null}
        <EmptyState title="Connection not found" text="This Source Connection may have been removed." />
      </>
    );
  }

  return (
    <div className={styles.stack}>
      <PageHeader
        title={connection.name}
        description={`Configure this Source Connection, Folder Mappings, and Sync History.`}
        action={{ label: 'Back to Source Connections', href: '/settings/source-connections' }}
      />

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <div className="grid two">
        <div className="detail-card">
          <h2>Connection summary</h2>
          <dl className="detail-list">
            <dt>Provider</dt>
            <dd>{providerLabel(connection.provider)}</dd>
            <dt>Status</dt>
            <dd><StatusBadge value={connection.status} /></dd>
            <dt>Account</dt>
            <dd>{connection.externalAccountLabel || '—'}</dd>
            <dt>Root folder</dt>
            <dd>{connection.rootExternalFolderName || 'Not selected'}</dd>
            <dt>Default project</dt>
            <dd>{connection.defaultProject?.code || connection.defaultProject?.name || '—'}</dd>
            <dt>Default module</dt>
            <dd>{connection.defaultSection?.name || '—'}</dd>
            <dt>Last sync</dt>
            <dd>{formatDate(connection.lastSyncAt)}</dd>
            <dt>Last error</dt>
            <dd>{connection.lastSyncError || '—'}</dd>
          </dl>
        </div>

        <form className="detail-card" onSubmit={saveSchedule}>
          <h2>Sync &amp; routing defaults</h2>
          <p className="secondary-text" style={{ marginBottom: 14 }}>
            Imports need a target project. Set a default here and/or create a Folder Mapping with a project.
          </p>
          <div className="field">
            <label htmlFor="sync-schedule">Schedule</label>
            <select
              id="sync-schedule"
              value={schedule}
              onChange={(event) => setSchedule(event.target.value)}
            >
              {SCHEDULES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="default-project">Default project</label>
            <select
              id="default-project"
              value={defaultProjectId}
              onChange={(event) => setDefaultProjectId(event.target.value)}
            >
              <option value="">Select project…</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} — {project.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions" style={{ marginTop: 14 }}>
            <button type="submit" className="button primary" disabled={savingSchedule}>
              {savingSchedule ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Root folder</h2>
          <div className={styles.inlineActions}>
            <span className="secondary-text">
              Current: {connection.rootExternalFolderName || 'Not selected'}
            </span>
            <button
              type="button"
              className="button small primary"
              disabled={selectingRoot || connection.status !== 'CONNECTED'}
              onClick={() => void selectRootFolder(currentBrowseFolder)}
            >
              {selectingRoot ? 'Saving…' : 'Use this folder as root'}
            </button>
          </div>
        </div>
        <div className="panel-body">
          {rootNotice ? (
            <div className={`notice ${rootNoticeOk ? 'success' : 'error'}`} style={{ marginBottom: 12 }}>
              {rootNotice}
            </div>
          ) : null}
          {connection.status !== 'CONNECTED' ? (
            <EmptyState
              title="Connection not ready"
              text="Complete OAuth and ensure the Source Connection is connected before browsing folders."
            />
          ) : (
            <>
              <p className="secondary-text" style={{ marginTop: 0 }}>
                Browse into the Drive folder that contains your files, then click <strong>Use this folder as root</strong>
                (or <strong>Set as root</strong> on a child folder).
              </p>
              <div className={styles.breadcrumbs}>
                {folderCrumbs.map((crumb, index) => (
                  <span key={`${crumb.id ?? 'root'}-${index}`}>
                    {index > 0 ? <span> / </span> : null}
                    <button type="button" onClick={() => jumpToCrumb(index)}>{crumb.name}</button>
                  </span>
                ))}
              </div>
              {foldersError ? <div className="notice error">{foldersError}</div> : null}
              {foldersLoading ? (
                <Loading />
              ) : folders.length === 0 ? (
                <EmptyState
                  title="No subfolders here"
                  text="You can still use this location as root with the button above, then list/import files below."
                />
              ) : (
                <div className={styles.folderList}>
                  {folders.map((folder) => (
                    <div key={folder.id} className={styles.folderRow}>
                      <div>
                        <strong>{folder.name}</strong>
                        <div className={styles.folderMeta}>{folder.path || folder.id}</div>
                      </div>
                      <div className={styles.inlineActions}>
                        <button type="button" className="button small" onClick={() => openFolder(folder)}>
                          Open
                        </button>
                        <button
                          type="button"
                          className="button small primary"
                          disabled={selectingRoot}
                          onClick={() => void selectRootFolder(folder)}
                        >
                          {selectingRoot ? 'Saving…' : 'Set as root'}
                        </button>
                        {mappingPickerOpen ? (
                          <button type="button" className="button small" onClick={() => pickFolderForMapping(folder)}>
                            Use for mapping
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Folder Mappings</h2>
          <span className="secondary-text">Map external folders to projects and Repository Modules</span>
        </div>
        {mappings.length === 0 ? (
          <EmptyState
            title="No Folder Mappings"
            text="Create a mapping so sync can route files into the correct project and Repository Module."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>External folder</th>
                  <th>Project</th>
                  <th>Repository Module</th>
                  <th>Import mode</th>
                  <th>Enabled</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping) => (
                  <tr key={mapping.id}>
                    <td>
                      <div className="primary-text">{mapping.externalFolderName}</div>
                      <div className="secondary-text">{mapping.externalFolderPath || mapping.externalFolderId}</div>
                    </td>
                    <td>{mapping.project?.code || mapping.project?.name || '—'}</td>
                    <td>{mapping.section?.name || '—'}</td>
                    <td>{mapping.importMode?.replaceAll('_', ' ') || '—'}</td>
                    <td>{mapping.enabled ? 'Yes' : 'No'}</td>
                    <td>
                      <div className={styles.inlineActions}>
                        <button type="button" className="button small" onClick={() => startEditMapping(mapping)}>
                          Edit
                        </button>
                        <button type="button" className="button small danger" onClick={() => void deleteMapping(mapping.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form className="panel-body" onSubmit={saveMapping}>
          <section className="form-section">
            <h2>{editingMappingId ? 'Edit Folder Mapping' : 'Create Folder Mapping'}</h2>
            <div className="form-grid">
              <div className="field">
                <label>External folder</label>
                <div className="readonly-box">
                  <strong>{mappingForm.externalFolderName || 'Not selected'}</strong>
                  <span className="secondary-text">{mappingForm.externalFolderPath || mappingForm.externalFolderId || 'Browse folders above and choose “Use for mapping”.'}</span>
                </div>
                <div className={styles.actionRow} style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="button small"
                    onClick={() => setMappingPickerOpen((value) => !value)}
                    disabled={connection.status !== 'CONNECTED'}
                  >
                    {mappingPickerOpen ? 'Cancel folder pick' : 'Pick folder from browser'}
                  </button>
                </div>
              </div>
              <div className="field">
                <label htmlFor="mapping-name">Folder name</label>
                <input
                  id="mapping-name"
                  required
                  value={mappingForm.externalFolderName}
                  onChange={(event) => setMappingForm((current) => ({ ...current, externalFolderName: event.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="mapping-project">Project</label>
                <select
                  id="mapping-project"
                  value={mappingForm.projectId}
                  onChange={(event) => setMappingForm((current) => ({
                    ...current,
                    projectId: event.target.value,
                    sectionId: '',
                  }))}
                >
                  <option value="">Select project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.code} — {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="mapping-section">Repository Module</label>
                <select
                  id="mapping-section"
                  value={mappingForm.sectionId}
                  onChange={(event) => setMappingForm((current) => ({ ...current, sectionId: event.target.value }))}
                  disabled={!mappingForm.projectId}
                >
                  <option value="">Select module</option>
                  {sectionOptions.map((section) => (
                    <option key={section.id} value={section.id}>{section.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="mapping-mode">Import mode</label>
                <select
                  id="mapping-mode"
                  value={mappingForm.importMode}
                  onChange={(event) => setMappingForm((current) => ({
                    ...current,
                    importMode: event.target.value as MappingForm['importMode'],
                  }))}
                >
                  <option value="NEW_AND_CHANGED">New and changed</option>
                  <option value="NEW_ONLY">New only</option>
                </select>
              </div>
              <div className="field checkbox">
                <input
                  id="mapping-enabled"
                  type="checkbox"
                  checked={mappingForm.enabled}
                  onChange={(event) => setMappingForm((current) => ({ ...current, enabled: event.target.checked }))}
                />
                <label htmlFor="mapping-enabled">Enabled</label>
              </div>
            </div>
            <div className="form-actions">
              {editingMappingId ? (
                <button type="button" className="button" onClick={resetMappingForm} disabled={savingMapping}>
                  Cancel edit
                </button>
              ) : null}
              <button type="submit" className="button primary" disabled={savingMapping}>
                {savingMapping ? 'Saving…' : editingMappingId ? 'Update mapping' : 'Create mapping'}
              </button>
            </div>
          </section>
        </form>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Sync History</h2>
          <button type="button" className="button small" onClick={() => void load()}>Refresh</button>
        </div>
        {syncRuns.length === 0 ? (
          <EmptyState title="No sync runs yet" text="Run Sync Now from the Source Connections list to populate history." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Trigger</th>
                  <th>Started</th>
                  <th>Completed</th>
                  <th>Detected</th>
                  <th>Queued</th>
                  <th>Skipped</th>
                  <th>Failed</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {syncRuns.map((run) => (
                  <tr key={run.id}>
                    <td><StatusBadge value={run.status} /></td>
                    <td>{run.triggerType?.replaceAll('_', ' ')}</td>
                    <td>{formatDate(run.startedAt)}</td>
                    <td>{formatDate(run.completedAt)}</td>
                    <td>{run.filesDetected}</td>
                    <td>{run.filesQueued}</td>
                    <td>{run.filesSkipped}</td>
                    <td>{run.filesFailed}</td>
                    <td>{run.errorMessage || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>File browser</h2>
          <div className={styles.inlineActions}>
            <button type="button" className="button small" onClick={() => void loadFiles()} disabled={filesLoading}>
              {filesLoading ? 'Loading…' : 'Load files'}
            </button>
            <button
              type="button"
              className="button small primary"
              disabled={importing || selectedFileIds.length === 0}
              onClick={() => void importSelected()}
            >
              {importing ? 'Importing…' : `Import Selected (${selectedFileIds.length})`}
            </button>
          </div>
        </div>
        <div className="panel-body">
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="file-folder">Folder ID</label>
            <input
              id="file-folder"
              className="mono"
              value={fileFolderId}
              onChange={(event) => setFileFolderId(event.target.value)}
              placeholder={connection.rootExternalFolderId || 'Root folder id'}
            />
            <small>Defaults to the selected root folder. Browse folders above to copy an id if needed.</small>
          </div>
          {filesError ? <div className="notice error">{filesError}</div> : null}
          {filesLoading ? (
            <Loading />
          ) : files.length === 0 ? (
            <EmptyState title="No files loaded" text="Load files from a folder to select Approved Documents for External Import." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>File</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Modified</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => {
                    const checked = selectedFileIds.includes(file.id);
                    return (
                      <tr key={file.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={file.alreadyImported}
                            onChange={(event) => {
                              setSelectedFileIds((current) => (
                                event.target.checked
                                  ? [...current, file.id]
                                  : current.filter((value) => value !== file.id)
                              ));
                            }}
                            aria-label={`Select ${file.name}`}
                          />
                        </td>
                        <td>
                          {file.name}
                          {file.alreadyImported ? <div className="secondary-text">Already imported</div> : null}
                        </td>
                        <td className="mono">{file.mimeType || '—'}</td>
                        <td>{formatBytes(file.size)}</td>
                        <td>{formatDate(file.modifiedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <Link href="/imports/queue" className="button small">Open Import Queue</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
