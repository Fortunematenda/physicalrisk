'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ExternalLink, File, FileJson, FileSpreadsheet, Folder, Grid2X2, List,
  MoreHorizontal, MoreVertical, PanelLeftOpen, Pencil, RefreshCw, Search, TableProperties,
} from 'lucide-react';

import { useConfirm } from '@/components/confirm-dialog';
import { StatusBadge } from '@/components/status-badge';
import { SuccessNotice } from '@/components/success-notice';
import { API_URL, api, formatDate, getToken } from '@/lib/api';
import { deriveSectionFields } from '@/lib/section-fields';
import { DocumentDetailsInspector } from './components/DocumentDetailsInspector';
import { DocumentPreview } from './components/DocumentPreview';
import { DocumentViewerHeader } from './components/DocumentViewerHeader';
import { DocumentViewerToolbar, type ViewerControls } from './components/DocumentViewerToolbar';
import { RepositoryExplorerLayout } from './components/RepositoryExplorerLayout';
import { RepositoryTreePanel } from './components/RepositoryTreePanel';
import {
  downloadText, extensionOf, findTreeEntry, flatten, canUseViewerControls,
  parentTreePath, subtreeDocuments,
} from './helpers';
import styles from './RepositoryExplorer.module.css';
import type {
  DocumentItem, RepositoryResponse, SelectedDocument, Selection, TreeEntry, VersionItem,
} from './types';
import { useVersionPreview } from './useVersionPreview';

const DEFAULT_CONTROLS: ViewerControls = {
  page: 1,
  pageCount: null,
  zoom: 100,
  rotate: 0,
  fullscreen: false,
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export default function RepositoryExplorerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const [projects, setProjects] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [projectId, setProjectId] = useState(searchParams.get('projectId') ?? '');
  /** Restore folder/file selection once after refresh / first project load. */
  const restorePathRef = useRef((searchParams.get('path') ?? '').trim() || null);
  const [repository, setRepository] = useState<RepositoryResponse | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selected, setSelected] = useState<Selection>(null);
  const [selectedDocument, setSelectedDocument] = useState<SelectedDocument | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState((searchParams.get('q') ?? searchParams.get('search') ?? '').trim());
  const [moduleFilter, setModuleFilter] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('updated');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const folderMenuRef = useRef<HTMLDivElement | null>(null);
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [treeWidth, setTreeWidth] = useState(280);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [treeSheetOpen, setTreeSheetOpen] = useState(false);
  const [inspectorSheetOpen, setInspectorSheetOpen] = useState(false);
  const [controls, setControls] = useState<ViewerControls>(DEFAULT_CONTROLS);
  const [renameFolderOpen, setRenameFolderOpen] = useState(false);
  const [renameFolderName, setRenameFolderName] = useState('');
  const viewerRef = useRef<HTMLDivElement | null>(null);

  const isTablet = useMediaQuery('(max-width: 1100px)');
  const isMobile = useMediaQuery('(max-width: 680px)');

  const replaceExplorerUrl = useCallback((nextProjectId: string, nextPath?: string | null) => {
    if (!nextProjectId) return;
    const params = new URLSearchParams();
    params.set('projectId', nextProjectId);
    const path = nextPath?.replace(/\\/g, '/').trim();
    if (path) params.set('path', path);
    const next = params.toString();
    const current = new URLSearchParams();
    const existingProject = searchParams.get('projectId');
    const existingPath = searchParams.get('path');
    if (existingProject) current.set('projectId', existingProject);
    if (existingPath) current.set('path', existingPath);
    if (current.toString() === next) return;
    router.replace(`/repository/explorer?${next}`, { scroll: false });
  }, [router, searchParams]);

  const load = useCallback(async (id: string, options?: { selectPath?: string | null }) => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [tree, records] = await Promise.all([
        api<RepositoryResponse>(`/storage/projects/${id}/tree`),
        api<DocumentItem[]>(`/documents?projectId=${id}`),
      ]);
      setRepository(tree);
      setDocuments(records);

      const stayPath = options?.selectPath?.replace(/\\/g, '/') || null;
      if (stayPath) {
        // Expand ancestors of the selection we should restore (refresh / after delete).
        const ancestors = new Set<string>();
        let prefix = '';
        for (const part of stayPath.split('/')) {
          prefix = prefix ? `${prefix}/${part}` : part;
          if (prefix) ancestors.add(prefix);
        }
        const entry = findTreeEntry(tree.entries, stayPath);
        if (entry) {
          if (entry.type === 'directory') {
            setExpanded(ancestors);
            setSelected({ entry, kind: 'folder' });
            setSelectedDocument(null);
            return;
          }
          if (entry.documentId) {
            ancestors.delete(stayPath);
            setExpanded(ancestors);
            setSelected({ entry, kind: entry.type === 'file' ? 'file' : 'document' });
            try {
              setSelectedDocument(await api(`/documents/${entry.documentId}`));
            } catch {
              setSelectedDocument(null);
            }
            return;
          }
        }
      }

      // Keep the tree collapsed by default — admins expand folders they need.
      setExpanded(new Set());
      setSelected(null);
      setSelectedDocument(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Repository data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api<Array<{ id: string; code: string; name: string }>>('/projects')
      .then((items) => {
        setProjects(items);
        setProjectId((current) => current || items[0]?.id || '');
      })
      .catch((caught) => setError(caught.message));
  }, []);

  useEffect(() => {
    if (!projectId) return;
    const path = restorePathRef.current;
    restorePathRef.current = null;
    void load(projectId, { selectPath: path });
  }, [projectId, load]);

  // Keep ?projectId= in the URL whenever a project is active (e.g. deep-links without path).
  useEffect(() => {
    if (!projectId) return;
    if (searchParams.get('projectId') === projectId) return;
    replaceExplorerUrl(projectId, searchParams.get('path'));
  }, [projectId, replaceExplorerUrl, searchParams]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(`.${styles.menuWrap}`)) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!folderMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (folderMenuRef.current?.contains(event.target as Node)) return;
      setFolderMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFolderMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [folderMenuOpen]);

  useEffect(() => {
    if (isTablet) {
      setInspectorCollapsed(true);
    } else {
      setInspectorCollapsed(false);
      setTreeSheetOpen(false);
      setInspectorSheetOpen(false);
    }
  }, [isTablet]);

  useEffect(() => {
    if (!isMobile) setTreeSheetOpen(false);
  }, [isMobile]);

  useEffect(() => {
    const onFs = () => {
      setControls((current) => ({ ...current, fullscreen: Boolean(document.fullscreenElement) }));
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const allEntries = useMemo(() => (repository ? flatten(repository.entries) : []), [repository]);
  const availableModules = useMemo(
    () => allEntries.filter((entry) => entry.nodeType === 'module' || entry.nodeType === 'register'),
    [allEntries],
  );
  const useFiltered = Boolean(query || moduleFilter || fileFilter || statusFilter);
  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = allEntries.filter((entry) => {
      const source = [entry.name, entry.documentCode, entry.versionNo, entry.path, entry.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const moduleMatch = !moduleFilter || entry.path.includes(moduleFilter);
      const fileMatch = !fileFilter || extensionOf(entry.name) === fileFilter;
      const statusMatch = !statusFilter || entry.status === statusFilter;
      return (!needle || source.includes(needle)) && moduleMatch && fileMatch && statusMatch;
    });
    return [...filtered].sort((a, b) => {
      if (sort === 'title') return a.name.localeCompare(b.name);
      const aTime = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0;
      const bTime = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0;
      return bTime - aTime || a.name.localeCompare(b.name);
    });
  }, [allEntries, query, moduleFilter, fileFilter, statusFilter, sort]);

  const selectedFolderDocuments = useMemo(
    () => (selected?.kind === 'folder' ? subtreeDocuments(selected.entry, documents) : []),
    [selected, documents],
  );
  const files = useMemo(() => allEntries.filter((entry) => entry.type === 'file'), [allEntries]);
  const fileTypes = useMemo(
    () => [...new Set(files.map((entry) => extensionOf(entry.name)).filter(Boolean))].sort(),
    [files],
  );
  const statuses = useMemo(() => {
    const values = new Set<string>(['CURRENT', 'SUPERSEDED']);
    documents.forEach((document) => { if (document.status) values.add(document.status); });
    files.forEach((file) => { if (file.status) values.add(file.status); });
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [documents, files]);

  const selectEntry = async (entry: TreeEntry) => {
    if (entry.type === 'file' && !entry.documentId) return;

    // Folder click: expand and show this folder's files (chevron alone toggles collapse).
    if (entry.type === 'directory') {
      const isLeafDocument =
        entry.nodeType === 'document'
        && !(entry.children?.some((child) => child.type === 'directory'));

      if (!isLeafDocument) {
        setExpanded((current) => {
          const next = new Set(current);
          next.add(entry.path);
          return next;
        });
        setSelected({ entry, kind: 'folder' });
        setSelectedDocument(null);
        setControls(DEFAULT_CONTROLS);
        setFolderMenuOpen(false);
        setTreeSheetOpen(false);
        if (isTablet) setInspectorSheetOpen(false);
        if (projectId) replaceExplorerUrl(projectId, entry.path);
        return;
      }
    }

    const kind = entry.type === 'file' ? 'file' : 'document';
    setSelected({ entry, kind });
    setSelectedDocument(null);
    setControls(DEFAULT_CONTROLS);
    setFolderMenuOpen(false);
    setTreeSheetOpen(false);
    if (isTablet) setInspectorSheetOpen(false);
    if (projectId) replaceExplorerUrl(projectId, entry.path);
    if (entry.documentId) {
      try {
        setSelectedDocument(await api(`/documents/${entry.documentId}`));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Document details could not be loaded.');
      }
    }
  };

  const toggleExpand = (item: TreeEntry) => {
    setExpanded((current) => {
      const next = new Set(current);
      next.has(item.path) ? next.delete(item.path) : next.add(item.path);
      return next;
    });
  };

  const currentStayPath = () => selected?.entry.path ?? searchParams.get('path');

  const expandAll = () => {
    setExpanded(new Set(allEntries.filter((entry) => entry.type === 'directory').map((entry) => entry.path)));
    setMenuOpen(false);
  };
  const collapseAll = () => {
    setExpanded(new Set());
    setMenuOpen(false);
  };

  const download = async (version: VersionItem) => {
    try {
      const response = await fetch(`${API_URL}/versions/${version.id}/download`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Download failed');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = version.originalFileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Download failed.');
    }
  };

  const viewFile = async (version: VersionItem) => {
    try {
      const response = await fetch(`${API_URL}/versions/${version.id}/view`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('File view failed');
      const url = URL.createObjectURL(await response.blob());
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'File view failed.');
    }
  };

  const deleteDocument = async (documentId: string, title: string) => {
    const ok = await confirm({
      title: 'Delete file',
      message: `Delete selected file “${title}” and all of its versions from the repository? This cannot be undone.`,
      confirmLabel: 'Delete file',
      tone: 'danger',
    });
    if (!ok) return;
    // Stay on the current folder after delete (do not bounce back to project root).
    const stayPath = selected?.kind === 'folder'
      ? selected.entry.path
      : parentTreePath(selected?.entry.path);
    try {
      await api(`/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE' });
      setNotice(`Deleted file “${title}”.`);
      setSelectedDocument(null);
      await load(projectId, { selectPath: stayPath });
      replaceExplorerUrl(projectId, stayPath);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete file.');
    }
  };

  const deleteFolder = async (entry?: TreeEntry) => {
    const target = entry ?? (selected?.kind === 'folder' ? selected.entry : null);
    if (!target || !projectId) return;
    setFolderMenuOpen(false);
    if (target.nodeType === 'register') {
      setError('System register folders cannot be deleted from the explorer.');
      return;
    }
    const folderDocs = subtreeDocuments(target, documents);
    const docCount = folderDocs.length;
    const isModule = Boolean(target.sectionId || target.nodeType === 'module');
    const ok = await confirm({
      title: 'Delete folder',
      message: docCount > 0
        ? `Delete folder “${target.name}” and its ${docCount} document(s)? This permanently removes the folder${isModule ? ' (module)' : ''}, all nested files, and Index records. This cannot be undone.`
        : `Delete folder “${target.name}”${isModule ? ' (module)' : ''} from the repository? This cannot be undone.`,
      confirmLabel: 'Delete folder',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const result = await api<{ documentsDeleted?: number }>(
        `/projects/${encodeURIComponent(projectId)}/repository-folders?path=${encodeURIComponent(target.path)}`,
        { method: 'DELETE' },
      );
      const removed = result?.documentsDeleted ?? docCount;
      setNotice(
        removed > 0
          ? `Deleted folder “${target.name}” and ${removed} document(s).`
          : `Deleted folder “${target.name}”.`,
      );
      setSelected(null);
      setSelectedDocument(null);
      replaceExplorerUrl(projectId, null);
      await load(projectId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete folder.');
    }
  };

  const saveFolderRename = async () => {
    if (!selected || selected.kind !== 'folder' || !selected.entry.sectionId) {
      setError('Only configured repository modules can be renamed here.');
      return;
    }
    const nextName = renameFolderName.trim();
    if (!nextName) {
      setError('Enter a folder name.');
      return;
    }
    const derived = deriveSectionFields(nextName);
    try {
      await api(`/project-sections/${encodeURIComponent(selected.entry.sectionId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: derived.name,
          sectionKey: derived.sectionKey,
          code: derived.code,
          relativePath: derived.relativePath,
        }),
      });
      setRenameFolderOpen(false);
      setNotice(`Renamed folder to “${derived.name}”.`);
      await load(projectId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to rename folder.');
    }
  };

  const exportRegister = (kind: 'index' | 'versions', format: 'csv' | 'json') => {
    const rows =
      kind === 'index'
        ? documents.map((item) => ({
            code: item.code,
            title: item.title,
            project: item.project.code,
            module: item.section.name,
            currentVersion: item.currentVersionNo,
            status: item.status,
            updated: item.updatedAt,
          }))
        : documents.flatMap((item) =>
            (item.versions ?? []).map((version) => ({
              code: item.code,
              title: item.title,
              version: version.versionNo,
              fileName: version.originalFileName,
              status: version.approvalStatus,
              imported: version.createdAt,
            })));
    const body =
      format === 'json'
        ? JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)
        : [
            Object.keys(rows[0] ?? {}).join(','),
            ...rows.map((row) =>
              Object.values(row)
                .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
                .join(',')),
          ].join('\n');
    downloadText(
      `${kind === 'index' ? 'master-document-index' : 'version-register'}.${format}`,
      body,
      format === 'json' ? 'application/json' : 'text/csv',
    );
  };

  const currentVersion =
    selectedDocument?.versions?.find((version) => version.isCurrent) ?? selectedDocument?.versions?.[0];
  const showDocumentWorkspace =
    Boolean(selected && (selected.kind === 'file' || selected.kind === 'document') && selectedDocument && currentVersion);
  const previewVersion = showDocumentWorkspace ? currentVersion : null;
  const { previewUrl, loading: previewLoading, error: previewError } = useVersionPreview(previewVersion);

  const displayedFolderDocs = useMemo(() => {
    const filtered = selectedFolderDocuments.filter((document) => {
      if (!statusFilter) return true;
      if (statusFilter === 'CURRENT') return (document.versions ?? []).some((version) => version.isCurrent);
      if (statusFilter === 'SUPERSEDED') return (document.versions ?? []).some((version) => !version.isCurrent);
      return document.status === statusFilter;
    });
    return [...filtered].sort((a, b) =>
      (sort === 'title'
        ? a.title.localeCompare(b.title)
        : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
  }, [selectedFolderDocuments, statusFilter, sort]);

  const toggleFullscreen = async () => {
    const node = viewerRef.current;
    if (!node) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await node.requestFullscreen();
    } catch {
      /* unsupported */
    }
  };

  const stepZoom = (direction: 1 | -1) => {
    setControls((current) => {
      const base = typeof current.zoom === 'number' ? current.zoom : 100;
      const next = Math.min(300, Math.max(50, base + direction * 25));
      return { ...current, zoom: next };
    });
  };

  const treePanel = (
    <RepositoryTreePanel
      projectCode={repository?.project.code}
      loading={loading}
      entries={repository?.entries ?? []}
      filteredEntries={filteredEntries}
      useFiltered={useFiltered}
      selectedPath={selected?.entry.path}
      expanded={expanded}
      onToggle={toggleExpand}
      onSelect={(item) => void selectEntry(item)}
      onDeleteFolder={(entry) => void deleteFolder(entry)}
      collapsed={treeCollapsed && !isMobile}
      onToggleCollapsed={() => {
        if (isMobile) setTreeSheetOpen(false);
        else setTreeCollapsed((value) => !value);
      }}
      showCollapseButton={!isMobile}
    />
  );

  const inspectorPanel =
    showDocumentWorkspace && selectedDocument && currentVersion ? (
      <DocumentDetailsInspector
        selectedDocument={selectedDocument}
        version={currentVersion}
        showClose
        onClose={() => {
          if (isMobile || isTablet) setInspectorSheetOpen(false);
          else setInspectorCollapsed(true);
        }}
      />
    ) : null;

  const documentMain =
    showDocumentWorkspace && selected && selectedDocument && currentVersion ? (
      <div className={styles.documentWorkspace}>
        <DocumentViewerHeader
          entry={selected.entry}
          selectedDocument={selectedDocument}
          version={currentVersion}
          onOpenInNewTab={() => void viewFile(currentVersion)}
          onDownload={() => void download(currentVersion)}
          onDelete={() => void deleteDocument(selectedDocument.id, selectedDocument.title)}
          onFullscreen={() => void toggleFullscreen()}
          showDetailsButton={isTablet || inspectorCollapsed}
          onOpenDetailsPanel={() => {
            if (isMobile || isTablet) setInspectorSheetOpen(true);
            else setInspectorCollapsed(false);
          }}
        />
        <DocumentViewerToolbar
          controls={controls}
          pdfSupported={canUseViewerControls(currentVersion)}
          onPageChange={(page) => setControls((current) => ({ ...current, page: Math.max(1, page) }))}
          onZoomChange={(zoom) => setControls((current) => ({ ...current, zoom }))}
          onZoomIn={() => stepZoom(1)}
          onZoomOut={() => stepZoom(-1)}
          onRotate={() => setControls((current) => ({ ...current, rotate: (current.rotate + 90) % 360 }))}
          onToggleFullscreen={() => void toggleFullscreen()}
        />
        <div className={styles.viewerBody}>
          <DocumentPreview
            version={currentVersion}
            previewUrl={previewUrl}
            loading={previewLoading}
            error={previewError}
            controls={controls}
            onPageCount={(count) => {
              if (!(count > 0)) return;
              setControls((current) => {
                if (current.pageCount === count && current.page <= count) return current;
                return {
                  ...current,
                  pageCount: count,
                  page: Math.min(Math.max(1, current.page), count),
                };
              });
            }}
            onPageChange={(page) => setControls((current) => ({ ...current, page: Math.max(1, page) }))}
            viewerRef={viewerRef}
          />
        </div>
      </div>
    ) : null;

  const browseMain = (
    <div className={styles.content}>
      {selected && (
        <button
          type="button"
          className={`${styles.button} ${styles.mobileBack}`}
          onClick={() => {
            setSelected(null);
            setSelectedDocument(null);
          }}
        >
          ← Back to Repository
        </button>
      )}
      {loading ? (
        Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className={`${styles.skeleton} ${styles.skeletonDetails}`} />
        ))
      ) : !selected ? (
        <>
          <div className={styles.registers}>
            <article className={styles.registerCard}>
              <div className={styles.registerCardAccent} />
              <div className={styles.registerCardBody}>
                <div className={styles.registerCardTop}>
                  <div className={styles.registerIcon}><TableProperties size={18} /></div>
                  <div className={styles.registerCopy}>
                    <h3>Master Document Index</h3>
                    <p className={styles.registerMeta}>Logical approved documents in this project</p>
                  </div>
                  <div className={styles.registerCount}>
                    <strong>{documents.length}</strong>
                    <span>docs</span>
                  </div>
                </div>
                <p className={styles.registerMeta}>
                  Generated {repository?.lastSynchronisedAt ? formatDate(repository.lastSynchronisedAt) : '—'}
                </p>
                <div className={styles.registerActions}>
                  <Link href={`/repository/index?projectId=${projectId}`} className={styles.registerPrimary}>
                    <ExternalLink size={14} />
                    Open Index
                  </Link>
                  <button type="button" className={styles.registerExport} onClick={() => exportRegister('index', 'csv')}>
                    <FileSpreadsheet size={14} />
                    CSV
                  </button>
                  <button type="button" className={styles.registerExport} onClick={() => exportRegister('index', 'json')}>
                    <FileJson size={14} />
                    JSON
                  </button>
                </div>
              </div>
            </article>
            <article className={styles.registerCard}>
              <div className={`${styles.registerCardAccent} ${styles.registerCardAccentAlt}`} />
              <div className={styles.registerCardBody}>
                <div className={styles.registerCardTop}>
                  <div className={`${styles.registerIcon} ${styles.registerIconAlt}`}><List size={18} /></div>
                  <div className={styles.registerCopy}>
                    <h3>Version Register</h3>
                    <p className={styles.registerMeta}>Traceable stored document versions</p>
                  </div>
                  <div className={styles.registerCount}>
                    <strong>{documents.reduce((total, item) => total + item._count.versions, 0)}</strong>
                    <span>versions</span>
                  </div>
                </div>
                <p className={styles.registerMeta}>
                  Generated {repository?.lastSynchronisedAt ? formatDate(repository.lastSynchronisedAt) : '—'}
                </p>
                <div className={styles.registerActions}>
                  <Link href={`/repository/versions?projectId=${projectId}`} className={`${styles.registerPrimary} ${styles.registerPrimaryAlt}`}>
                    <ExternalLink size={14} />
                    Open Register
                  </Link>
                  <button type="button" className={styles.registerExport} onClick={() => exportRegister('versions', 'csv')}>
                    <FileSpreadsheet size={14} />
                    CSV
                  </button>
                  <button type="button" className={styles.registerExport} onClick={() => exportRegister('versions', 'json')}>
                    <FileJson size={14} />
                    JSON
                  </button>
                </div>
              </div>
            </article>
          </div>
          <div className={styles.empty}>
            <Folder size={32} color="#2563eb" />
            <strong>Select a repository item</strong>
            <span>Choose a module, document or file from the repository tree to inspect its approved records and secure actions.</span>
          </div>
        </>
      ) : selected.kind === 'folder' ? (
        <>
          <div className={styles.summary}>
            <div>
              <h2>{selected.entry.name}</h2>
              <div className={styles.breadcrumb}>{selected.entry.path}</div>
            </div>
            <div className={styles.summaryStats}>
              <span><strong>{displayedFolderDocs.length}</strong>Documents</span>
              <span><strong>{displayedFolderDocs.reduce((total, item) => total + item._count.versions, 0)}</strong>Versions</span>
              <span><strong>{formatDate(selected.entry.modifiedAt)}</strong>Updated</span>
            </div>
            <div className={styles.folderActions}>
              {selected.entry.sectionId || selected.entry.nodeType === 'module' ? (
                <button
                  type="button"
                  className={styles.button}
                  disabled={!selected.entry.sectionId}
                  onClick={() => {
                    setRenameFolderName(selected.entry.name);
                    setRenameFolderOpen(true);
                  }}
                >
                  <Pencil size={14} /> Edit folder
                </button>
              ) : null}
              <div className={styles.menuWrap} ref={folderMenuRef}>
                <button
                  type="button"
                  className={`${styles.iconButton} ${folderMenuOpen ? styles.iconButtonActive : ''}`}
                  aria-label="Folder actions"
                  aria-haspopup="menu"
                  aria-expanded={folderMenuOpen}
                  title="Folder actions"
                  onClick={() => setFolderMenuOpen((open) => !open)}
                >
                  <MoreVertical size={16} />
                </button>
                {folderMenuOpen ? (
                  <div className={styles.menu} role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.menuDanger}
                      disabled={selected.entry.nodeType === 'register'}
                      title={
                        selected.entry.nodeType === 'register'
                          ? 'System register folders cannot be deleted'
                          : 'Delete this folder and all documents inside it'
                      }
                      onClick={() => void deleteFolder(selected.entry)}
                    >
                      Delete folder
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {displayedFolderDocs.length === 0 ? (
            <div className={styles.empty}>
              <Folder size={30} color="#64748b" />
              <strong>This repository module does not contain any imported documents yet.</strong>
            </div>
          ) : view === 'grid' ? (
            <div className={styles.grid}>
              {displayedFolderDocs.map((document) => (
                <button
                  type="button"
                  key={document.id}
                  className={styles.gridItem}
                  onClick={() =>
                    void selectEntry({
                      name: document.title,
                      path: document.section.relativePath,
                      type: 'directory',
                      nodeType: 'document',
                      documentId: document.id,
                      documentCode: document.code,
                    })}
                >
                  <strong>{document.title}</strong>
                  <span>{document.code} · v{document.currentVersionNo}</span>
                  <span>{document.documentType} · {formatDate(document.updatedAt)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Document code</th>
                    <th>Current version</th>
                    <th>File type</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedFolderDocs.map((document) => (
                    <tr key={document.id}>
                      <td>
                        <Link href={`/repository/documents/${document.id}`} className={styles.docLink}>
                          {document.title}
                        </Link>
                      </td>
                      <td>{document.code}</td>
                      <td>v{document.currentVersionNo}</td>
                      <td>{document.documentType}</td>
                      <td><StatusBadge value={document.status} /></td>
                      <td>{formatDate(document.updatedAt)}</td>
                      <td>
                        <div className={styles.inlineActions}>
                          <button
                            type="button"
                            className={styles.buttonLink}
                            onClick={() =>
                              void selectEntry({
                                name: document.title,
                                path: document.section.relativePath,
                                type: 'directory',
                                nodeType: 'document',
                                documentId: document.id,
                                documentCode: document.code,
                              })}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            className={styles.buttonLink}
                            onClick={() => void deleteDocument(document.id, document.title)}
                          >
                            Delete file
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : selected.kind === 'document' || selected.kind === 'file' ? (
        <div className={styles.empty}>
          {selectedDocument ? (
            <strong>Loading selected document…</strong>
          ) : (
            <>
              <File size={30} />
              <strong>File record is not mapped to an imported document.</strong>
              <span>Only mapped logical document versions expose secure document actions.</span>
            </>
          )}
        </div>
      ) : (
        <div className={styles.empty}><strong>Loading selected document…</strong></div>
      )}
    </div>
  );

  return (
    <main className={styles.explorer}>
      <section className={styles.header}>
        <div>
          <button type="button" className={styles.backLink} onClick={() => router.push('/')} aria-label="Back to Dashboard">
            ← Back to Dashboard
          </button>
          <h1>VPS Repository Explorer</h1>
          <p>Browse approved project documents stored in the configured Physical Risk VPS repository.</p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Refresh repository"
            title="Refresh repository"
            onClick={() => void load(projectId, { selectPath: currentStayPath() })}
            disabled={loading || !projectId}
          >
            <RefreshCw size={16} className={loading ? styles.spinning : undefined} />
          </button>
          <div className={styles.menuWrap}>
            <button
              type="button"
              className={`${styles.iconButton} ${menuOpen ? styles.iconButtonActive : ''}`}
              aria-label="More repository actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="More actions"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={17} />
            </button>
            {menuOpen ? (
              <div className={styles.menu} role="menu">
                <button type="button" role="menuitem" onClick={expandAll}>Expand all folders</button>
                <button type="button" role="menuitem" onClick={collapseAll}>Collapse all folders</button>
                <button type="button" role="menuitem" onClick={() => { exportRegister('index', 'csv'); setMenuOpen(false); }}>
                  Export Master Index (CSV)
                </button>
                <button type="button" role="menuitem" onClick={() => { exportRegister('versions', 'csv'); setMenuOpen(false); }}>
                  Export Version Register (CSV)
                </button>
                <Link role="menuitem" href={`/repository/index?projectId=${projectId}`} className={styles.menuLink} onClick={() => setMenuOpen(false)}>
                  Open Master Document Index
                </Link>
                <Link role="menuitem" href={`/repository/versions?projectId=${projectId}`} className={styles.menuLink} onClick={() => setMenuOpen(false)}>
                  Open Version Register
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <SuccessNotice
        message={notice}
        onDismiss={() => setNotice('')}
        className={styles.notice}
        style={{ color: '#126b42', background: '#eefaf3', borderColor: '#ccebdc' }}
      />
      {error ? (
        <div className={styles.notice}>
          <strong>Repository unavailable. </strong>
          {error}{' '}
          <button type="button" className={styles.buttonLink} onClick={() => void load(projectId, { selectPath: currentStayPath() })}>Retry</button>{' '}
          <Link href="/configuration/projects" className={styles.buttonLink}>Repository configuration</Link>
        </div>
      ) : null}

      <section className={styles.toolbar} aria-label="Repository search and filters">
        {(treeCollapsed || isMobile) ? (
          <button
            type="button"
            className={`${styles.button} ${styles.treeExpandBtn}`}
            onClick={() => (isMobile ? setTreeSheetOpen(true) : setTreeCollapsed(false))}
            aria-label="Expand repository tree"
            title="Expand repository tree"
          >
            <PanelLeftOpen size={15} />
            Expand tree
          </button>
        ) : null}
        <select
          aria-label="Project"
          className={styles.select}
          value={projectId}
          onChange={(event) => {
            const next = event.target.value;
            restorePathRef.current = null;
            setSelected(null);
            setSelectedDocument(null);
            setProjectId(next);
            replaceExplorerUrl(next, null);
          }}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.code} — {project.name}</option>
          ))}
        </select>
        <Search size={16} color="#64748b" />
        <input
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search title, code, filename, version or folder"
        />
        <select aria-label="Repository module" className={styles.select} value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
          <option value="">All modules</option>
          {availableModules.map((item) => (
            <option key={item.path} value={item.path}>{item.name}</option>
          ))}
        </select>
        <select aria-label="File type" className={styles.select} value={fileFilter} onChange={(event) => setFileFilter(event.target.value)}>
          <option value="">All file types</option>
          {fileTypes.map((type) => (
            <option key={type} value={type}>{type.toUpperCase()}</option>
          ))}
        </select>
        <select aria-label="Status" className={styles.select} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">All statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>
          ))}
        </select>
        <select aria-label="Sort" className={styles.select} value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="updated">Recently updated</option>
          <option value="title">Title A–Z</option>
        </select>
        <span className={styles.toolbarSpacer} />
        <div className={styles.viewToggle}>
          <button type="button" aria-label="List view" className={view === 'list' ? styles.active : ''} onClick={() => setView('list')}>
            <List size={16} />
          </button>
          <button type="button" aria-label="Grid view" className={view === 'grid' ? styles.active : ''} onClick={() => setView('grid')}>
            <Grid2X2 size={16} />
          </button>
        </div>
      </section>

      <RepositoryExplorerLayout
        treeCollapsed={isMobile ? true : treeCollapsed}
        treeWidth={treeWidth}
        onTreeWidthChange={setTreeWidth}
        onExpandTree={() => (isMobile ? setTreeSheetOpen(true) : setTreeCollapsed(false))}
        inspectorCollapsed={isTablet || isMobile ? true : inspectorCollapsed || !showDocumentWorkspace}
        showInspector={showDocumentWorkspace && !(isTablet || isMobile)}
        tree={treePanel}
        main={showDocumentWorkspace ? documentMain : browseMain}
        inspector={inspectorPanel}
        treeSheetOpen={treeSheetOpen}
        inspectorSheetOpen={inspectorSheetOpen}
        onCloseTreeSheet={() => setTreeSheetOpen(false)}
        onCloseInspectorSheet={() => setInspectorSheetOpen(false)}
      />

      {renameFolderOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="rename-folder-title">
          <div className={styles.modalCard}>
            <h3 id="rename-folder-title">Edit folder</h3>
            <p>Key, code and VPS path update automatically from the name.</p>
            <div className="field">
              <label htmlFor="rename-folder-name">Folder name</label>
              <input
                id="rename-folder-name"
                value={renameFolderName}
                onChange={(event) => setRenameFolderName(event.target.value)}
                autoFocus
              />
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.button} onClick={() => setRenameFolderOpen(false)}>Cancel</button>
              <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={() => void saveFolderRename()}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
