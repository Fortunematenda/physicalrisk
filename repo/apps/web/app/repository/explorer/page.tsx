'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown, ChevronRight, Download, ExternalLink, File, FileJson, FileSpreadsheet,
  FileText, FileType2, Folder, FolderArchive, Grid2X2, Image, List, MoreHorizontal,
  RefreshCw, Search, SlidersHorizontal, TableProperties,
} from 'lucide-react';

import { StatusBadge } from '@/components/status-badge';
import { API_URL, api, formatBytes, formatDate, getToken } from '@/lib/api';
import styles from './RepositoryExplorer.module.css';

type NodeType = 'root' | 'module' | 'folder' | 'document' | 'version' | 'file' | 'register';
type TreeEntry = {
  name: string; path: string; type: 'directory' | 'file'; nodeType?: NodeType; childCount?: number;
  documentId?: string; versionId?: string; documentCode?: string; versionNo?: string; status?: string;
  mimeType?: string; size?: number; modifiedAt?: string; children?: TreeEntry[];
};
type DocumentItem = {
  id: string; code: string; title: string; documentType: string; currentVersionNo: string; status: string;
  updatedAt: string; project: { id: string; code: string; name: string }; section: { id: string; name: string; relativePath: string };
  versions: VersionItem[]; _count: { versions: number };
};
type VersionItem = {
  id: string; versionNo: string; originalFileName: string; mimeType: string; fileSize: number;
  approvalStatus: string; approvedBy: string; approvalDate: string; isCurrent: boolean; storagePath: string; createdAt: string;
};
type RepositoryResponse = { project: { id: string; code: string; name: string; repositoryRootPath: string }; rootPath: string; lastSynchronisedAt: string | null; entries: TreeEntry[] };
type Selection = { entry: TreeEntry; kind: 'folder' | 'document' | 'file' } | null;

function extensionOf(name: string) { return name.split('.').pop()?.toLowerCase() ?? ''; }
function iconFor(entry: TreeEntry) {
  if (entry.nodeType === 'register') return <TableProperties size={16} />;
  if (entry.type === 'directory') {
    if (entry.nodeType === 'document') return <FolderArchive size={16} />;
    return <Folder size={16} />;
  }
  const extension = extensionOf(entry.name);
  if (extension === 'pdf') return <FileText size={16} />;
  if (['doc', 'docx'].includes(extension)) return <FileType2 size={16} />;
  if (['xls', 'xlsx', 'csv'].includes(extension)) return <FileSpreadsheet size={16} />;
  if (extension === 'json') return <FileJson size={16} />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) return <Image size={16} />;
  return <File size={16} />;
}
function isInlineType(mimeType?: string) { return mimeType === 'application/pdf' || /^image\//.test(mimeType ?? ''); }
function flatten(entries: TreeEntry[]): TreeEntry[] { return entries.flatMap((entry) => [entry, ...(entry.children ? flatten(entry.children) : [])]); }
function subtreeDocuments(entry: TreeEntry, documents: DocumentItem[]) {
  const paths = new Set(flatten([entry]).map((item) => item.path));
  return documents.filter((document) => paths.has(document.section.relativePath) || [...paths].some((path) => document.section.relativePath.includes(path.replace(/^.*?\//, '')) || path.includes(document.section.relativePath)));
}
function downloadText(fileName: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type })); const link = document.createElement('a');
  link.href = url; link.download = fileName; link.click(); URL.revokeObjectURL(url);
}

function TreeRow({ entry, level, selectedPath, expanded, onToggle, onSelect }: {
  entry: TreeEntry; level: number; selectedPath?: string; expanded: Set<string>;
  onToggle: (entry: TreeEntry) => void; onSelect: (entry: TreeEntry) => void;
}) {
  const expandable = entry.type === 'directory' && Boolean(entry.children?.length);
  const opened = expanded.has(entry.path);
  const selected = selectedPath === entry.path;
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowRight' && expandable && !opened) { event.preventDefault(); onToggle(entry); }
    if (event.key === 'ArrowLeft' && expandable && opened) { event.preventDefault(); onToggle(entry); }
    if (event.key === 'Enter') onSelect(entry);
  };
  const label = [
    entry.name,
    selected ? 'selected' : null,
    expandable ? (opened ? 'expanded' : 'collapsed') : null,
  ].filter(Boolean).join(', ');
  return <>
    <button
      type="button"
      className={`${styles.treeRow} ${selected ? styles.selected : ''}`}
      style={{ paddingLeft: 8 + level * 18 }}
      onClick={() => onSelect(entry)}
      onKeyDown={onKeyDown}
      aria-label={label}
      aria-current={selected ? 'true' : undefined}
    >
      <span className={styles.chevron} onClick={(event) => { event.stopPropagation(); if (expandable) onToggle(entry); }}>{expandable ? (opened ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}</span>
      <span className={styles.nodeIcon}>{iconFor(entry)}</span><span className={styles.nodeLabel}>{entry.name}</span>
      {entry.childCount !== undefined && <span className={styles.nodeMeta}>{entry.childCount}</span>}
    </button>
    {expandable && opened && entry.children?.map((child) => (
      <TreeRow key={child.path} entry={child} level={level + 1} selectedPath={selectedPath} expanded={expanded} onToggle={onToggle} onSelect={onSelect} />
    ))}
  </>;
}

export default function RepositoryExplorerPage() {
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [projectId, setProjectId] = useState(searchParams.get('projectId') ?? '');
  const [repository, setRepository] = useState<RepositoryResponse | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selected, setSelected] = useState<Selection>(null);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState((searchParams.get('q') ?? searchParams.get('search') ?? '').trim());
  const [moduleFilter, setModuleFilter] = useState('');
  const [fileFilter, setFileFilter] = useState(''); const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('updated'); const [view, setView] = useState<'list' | 'grid'>('list');
  const [loading, setLoading] = useState(true); const [syncing, setSyncing] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async (id: string) => {
    if (!id) return; setLoading(true); setError('');
    try {
      const [tree, records] = await Promise.all([api<RepositoryResponse>(`/storage/projects/${id}/tree`), api<DocumentItem[]>(`/documents?projectId=${id}`)]);
      setRepository(tree); setDocuments(records); setExpanded(new Set(tree.entries.map((entry) => entry.path))); setSelected(null); setSelectedDocument(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Repository data could not be loaded.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { api<Array<{ id: string; code: string; name: string }>>('/projects').then((items) => { setProjects(items); setProjectId((current) => current || items[0]?.id || ''); }).catch((caught) => setError(caught.message)); }, []);
  useEffect(() => { void load(projectId); }, [projectId, load]);
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

  const allEntries = useMemo(() => repository ? flatten(repository.entries) : [], [repository]);
  const availableModules = useMemo(() => allEntries.filter((entry) => entry.nodeType === 'module' || entry.nodeType === 'register'), [allEntries]);
  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = allEntries.filter((entry) => {
      const source = [entry.name, entry.documentCode, entry.versionNo, entry.path, entry.status].filter(Boolean).join(' ').toLowerCase();
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
  const selectedFolderDocuments = useMemo(() => selected?.kind === 'folder' ? subtreeDocuments(selected.entry, documents) : [], [selected, documents]);
  const files = useMemo(() => allEntries.filter((entry) => entry.type === 'file'), [allEntries]);
  const fileTypes = useMemo(() => [...new Set(files.map((entry) => extensionOf(entry.name)).filter(Boolean))].sort(), [files]);
  const statuses = useMemo(() => {
    const values = new Set<string>(['CURRENT', 'SUPERSEDED']);
    documents.forEach((document) => { if (document.status) values.add(document.status); });
    files.forEach((file) => { if (file.status) values.add(file.status); });
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [documents, files]);

  const selectEntry = async (entry: TreeEntry) => {
    // Unmapped filesystem files are excluded from the tree API; ignore them if present.
    if (entry.type === 'file' && !entry.documentId) return;
    if (entry.type === 'directory' && entry.children?.length) setExpanded((current) => { const next = new Set(current); next.has(entry.path) ? next.delete(entry.path) : next.add(entry.path); return next; });
    const kind = entry.nodeType === 'document' || (entry.documentId && entry.type === 'directory') ? 'document' : entry.type === 'file' ? 'file' : 'folder';
    setSelected({ entry, kind }); setSelectedDocument(null);
    if (entry.documentId) { try { setSelectedDocument(await api(`/documents/${entry.documentId}`)); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Document details could not be loaded.'); } }
  };
  const sync = async () => {
    if (!projectId) return;
    setSyncing(true); setNotice(''); setError(''); setMenuOpen(false);
    try {
      const result = await api<{ lastSynchronisedAt?: string }>(`/storage/projects/${projectId}/sync`, { method: 'POST' });
      await load(projectId);
      if (result?.lastSynchronisedAt) {
        setRepository((current) => current ? { ...current, lastSynchronisedAt: result.lastSynchronisedAt! } : current);
      }
      setNotice('Repository structure and registers synchronised successfully.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Repository synchronisation failed.');
    } finally {
      setSyncing(false);
    }
  };
  const expandAll = () => {
    setExpanded(new Set(allEntries.filter((entry) => entry.type === 'directory').map((entry) => entry.path)));
    setMenuOpen(false);
  };
  const collapseAll = () => { setExpanded(new Set()); setMenuOpen(false); };

  const download = async (version: VersionItem) => { try { const response = await fetch(`${API_URL}/versions/${version.id}/download`, { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} }); if (!response.ok) throw new Error('Download failed'); const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = version.originalFileName; anchor.click(); URL.revokeObjectURL(url); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Download failed.'); } };
  const viewFile = async (version: VersionItem) => { try { const response = await fetch(`${API_URL}/versions/${version.id}/view`, { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} }); if (!response.ok) throw new Error('File view failed'); const url = URL.createObjectURL(await response.blob()); window.open(url, '_blank', 'noopener,noreferrer'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'File view failed.'); } };
  const exportRegister = (kind: 'index' | 'versions', format: 'csv' | 'json') => {
    const rows = kind === 'index' ? documents.map((item) => ({ code: item.code, title: item.title, project: item.project.code, module: item.section.name, currentVersion: item.currentVersionNo, status: item.status, updated: item.updatedAt })) : documents.flatMap((item) => (item.versions ?? []).map((version) => ({ code: item.code, title: item.title, version: version.versionNo, fileName: version.originalFileName, status: version.approvalStatus, imported: version.createdAt })));
    const body = format === 'json' ? JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2) : [Object.keys(rows[0] ?? {}).join(','), ...rows.map((row) => Object.values(row).map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))].join('\n');
    downloadText(`${kind === 'index' ? 'master-document-index' : 'version-register'}.${format}`, body, format === 'json' ? 'application/json' : 'text/csv');
  };

  const currentVersion = selectedDocument?.versions?.find((version: VersionItem) => version.isCurrent) ?? selectedDocument?.versions?.[0];
  const displayedFolderDocs = useMemo(() => {
    const filtered = selectedFolderDocuments.filter((document) => {
      if (!statusFilter) return true;
      if (statusFilter === 'CURRENT') return (document.versions ?? []).some((version) => version.isCurrent);
      if (statusFilter === 'SUPERSEDED') return (document.versions ?? []).some((version) => !version.isCurrent);
      return document.status === statusFilter;
    });
    return [...filtered].sort((a, b) => sort === 'title'
      ? a.title.localeCompare(b.title)
      : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [selectedFolderDocuments, statusFilter, sort]);

  return <main className={styles.explorer}>
    <section className={styles.header}><div><h1>VPS Repository Explorer</h1><p>Browse approved project documents stored in the configured Physical Risk VPS repository.</p></div><div className={styles.headerActions}>
        <span className={styles.syncMeta}>Last synchronised<br />{repository?.lastSynchronisedAt ? formatDate(repository.lastSynchronisedAt) : 'Not available'}</span>
        <button type="button" className={styles.iconButton} aria-label="Refresh repository" title="Refresh repository" onClick={() => void load(projectId)} disabled={loading || !projectId}>
          <RefreshCw size={16} className={loading ? styles.spinning : undefined} />
        </button>
        <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={() => void sync()} disabled={!projectId || syncing}>
          {syncing ? <span className={styles.spinner} /> : <RefreshCw size={15} />}
          {syncing ? 'Synchronising…' : 'Synchronise Repository'}
        </button>
        <div className={styles.menuWrap}>
          <button
            type="button"
            className={`${styles.iconButton} ${menuOpen ? styles.iconButtonActive : ''}`}
            aria-label="More repository actions"
            aria-haspopup="menu"
            {...(menuOpen ? { 'aria-expanded': 'true' as const } : { 'aria-expanded': 'false' as const })}
            title="More actions"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal size={17} />
          </button>
          {menuOpen ? (
            <div className={styles.menu} role="menu">
              <button type="button" role="menuitem" onClick={expandAll}>Expand all folders</button>
              <button type="button" role="menuitem" onClick={collapseAll}>Collapse all folders</button>
              <button type="button" role="menuitem" onClick={() => { exportRegister('index', 'csv'); setMenuOpen(false); }}>Export Master Index (CSV)</button>
              <button type="button" role="menuitem" onClick={() => { exportRegister('versions', 'csv'); setMenuOpen(false); }}>Export Version Register (CSV)</button>
              <Link role="menuitem" href={`/repository/index?projectId=${projectId}`} className={styles.menuLink} onClick={() => setMenuOpen(false)}>Open Master Document Index</Link>
              <Link role="menuitem" href={`/repository/versions?projectId=${projectId}`} className={styles.menuLink} onClick={() => setMenuOpen(false)}>Open Version Register</Link>
            </div>
          ) : null}
        </div>
      </div></section>
    {notice && <div className={styles.notice} style={{ color: '#126b42', background: '#eefaf3', borderColor: '#ccebdc' }}>{notice}</div>}{error && <div className={styles.notice}><strong>Repository unavailable. </strong>{error} <button type="button" className={styles.buttonLink} onClick={() => void load(projectId)}>Retry</button> <Link href="/configuration/projects" className={styles.buttonLink}>Repository configuration</Link></div>}
    <section className={styles.toolbar} aria-label="Repository search and filters"><select aria-label="Project" className={styles.select} value={projectId} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.code} — {project.name}</option>)}</select><Search size={16} color="#64748b" /><input className={styles.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, code, filename, version or folder" /><select aria-label="Repository module" className={styles.select} value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}><option value="">All modules</option>{availableModules.map((item) => <option key={item.path} value={item.path}>{item.name}</option>)}</select><select aria-label="File type" className={styles.select} value={fileFilter} onChange={(event) => setFileFilter(event.target.value)}><option value="">All file types</option>{fileTypes.map((type) => <option key={type} value={type}>{type.toUpperCase()}</option>)}</select><select aria-label="Status" className={styles.select} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select><select aria-label="Sort" className={styles.select} value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated">Recently updated</option><option value="title">Title A–Z</option></select><span className={styles.toolbarSpacer} /><div className={styles.viewToggle}><button type="button" aria-label="List view" className={view === 'list' ? styles.active : ''} onClick={() => setView('list')}><List size={16} /></button><button type="button" aria-label="Grid view" className={view === 'grid' ? styles.active : ''} onClick={() => setView('grid')}><Grid2X2 size={16} /></button></div></section>
    <section className={styles.workspace}>
      <aside className={`${styles.panel} ${selected ? styles.hiddenOnMobile : ''}`}><div className={styles.panelHeader}><div><h2>Repository Tree</h2><small>{repository?.project.code ?? 'Project'} VPS repository</small></div><SlidersHorizontal size={16} color="#64748b" /></div><div className={styles.tree} aria-label="Repository tree">{loading ? Array.from({ length: 9 }).map((_, index) => <div key={index} className={`${styles.skeleton} ${styles.skeletonRow}`} />) : repository ? <><div className={styles.treeRoot}>{repository.project.code} repository</div>{query || moduleFilter || fileFilter || statusFilter ? filteredEntries.map((entry) => <TreeRow key={entry.path} entry={entry} level={0} selectedPath={selected?.entry.path} expanded={expanded} onToggle={(item) => setExpanded((current) => { const next = new Set(current); next.has(item.path) ? next.delete(item.path) : next.add(item.path); return next; })} onSelect={(item) => void selectEntry(item)} />) : repository.entries.map((entry) => <TreeRow key={entry.path} entry={entry} level={0} selectedPath={selected?.entry.path} expanded={expanded} onToggle={(item) => setExpanded((current) => { const next = new Set(current); next.has(item.path) ? next.delete(item.path) : next.add(item.path); return next; })} onSelect={(item) => void selectEntry(item)} />)}</> : null}</div></aside>
      <section className={`${styles.panel} ${styles.detailsPanel}`}><div className={styles.content}>{selected && <button type="button" className={`${styles.button} ${styles.mobileBack}`} onClick={() => { setSelected(null); setSelectedDocument(null); }}>← Back to Repository</button>}{loading ? <>{Array.from({ length: 8 }).map((_, index) => <div key={index} className={`${styles.skeleton} ${styles.skeletonDetails}`} />)}</> : !selected ? <><div className={styles.registers}>
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
              </div><div className={styles.empty}><Folder size={32} color="#2563eb" /><strong>Select a repository item</strong><span>Choose a module, document or file from the repository tree to inspect its approved records and secure actions.</span></div></> : selected.kind === 'folder' ? <><div className={styles.summary}><div><h2>{selected.entry.name}</h2><div className={styles.breadcrumb}>{selected.entry.path}</div></div><div className={styles.summaryStats}><span><strong>{displayedFolderDocs.length}</strong>Documents</span><span><strong>{displayedFolderDocs.reduce((total, item) => total + item._count.versions, 0)}</strong>Versions</span><span><strong>{formatDate(selected.entry.modifiedAt)}</strong>Updated</span></div></div>{displayedFolderDocs.length === 0 ? <div className={styles.empty}><Folder size={30} color="#64748b" /><strong>This repository module does not contain any imported documents yet.</strong></div> : view === 'grid' ? <div className={styles.grid}>{displayedFolderDocs.map((document) => <button type="button" key={document.id} className={styles.gridItem} onClick={() => void selectEntry({ name: document.title, path: document.section.relativePath, type: 'directory', nodeType: 'document', documentId: document.id, documentCode: document.code })}><strong>{document.title}</strong><span>{document.code} · v{document.currentVersionNo}</span><span>{document.documentType} · {formatDate(document.updatedAt)}</span></button>)}</div> : <div className={styles.tableWrap}><table><thead><tr><th>Document</th><th>Document code</th><th>Current version</th><th>File type</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead><tbody>{displayedFolderDocs.map((document) => <tr key={document.id}><td><Link href={`/repository/documents/${document.id}`} className={styles.docLink}>{document.title}</Link></td><td>{document.code}</td><td>v{document.currentVersionNo}</td><td>{document.documentType}</td><td><StatusBadge value={document.status} /></td><td>{formatDate(document.updatedAt)}</td><td><button type="button" className={styles.buttonLink} onClick={() => void selectEntry({ name: document.title, path: document.section.relativePath, type: 'directory', nodeType: 'document', documentId: document.id, documentCode: document.code })}>Open Details</button></td></tr>)}</tbody></table></div>}</> : selected.kind === 'document' && selectedDocument ? <><div className={styles.summary}><div><h2>{selectedDocument.title}</h2><div className={styles.breadcrumb}>{selectedDocument.code} · {selectedDocument.project.name} / {selectedDocument.section.name}</div></div><StatusBadge value={selectedDocument.status} /></div>{currentVersion && <div className={styles.actions}>{isInlineType(currentVersion.mimeType) && <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={() => void viewFile(currentVersion)}><ExternalLink size={15} />View Document</button>}<button type="button" className={styles.button} onClick={() => void download(currentVersion)}><Download size={15} />Download</button><Link href={`/repository/documents/${selectedDocument.id}`} className={styles.button}>Open Document Details</Link><Link href={`/documents/${selectedDocument.id}#versions`} className={styles.button}>View Version History</Link></div>}<dl className={styles.detailGrid}><dt>Document title</dt><dd>{selectedDocument.title}</dd><dt>Document code</dt><dd>{selectedDocument.code}</dd><dt>Current version</dt><dd>{selectedDocument.currentVersionNo}</dd><dt>Status</dt><dd><StatusBadge value={selectedDocument.status} /></dd><dt>Project</dt><dd>{selectedDocument.project.code} — {selectedDocument.project.name}</dd><dt>Repository module</dt><dd>{selectedDocument.section.name}</dd><dt>Source system</dt><dd>{selectedDocument.importJobs?.[0]?.sourceSystem?.name ?? '—'}</dd><dt>Approval status</dt><dd>{currentVersion?.approvalStatus ?? '—'}</dd><dt>Approved by</dt><dd>{currentVersion?.approvedBy ?? '—'}</dd><dt>Approval date</dt><dd>{formatDate(currentVersion?.approvalDate)}</dd><dt>Current filename</dt><dd>{currentVersion?.originalFileName ?? '—'}</dd><dt>File type</dt><dd>{currentVersion?.mimeType ?? '—'}</dd><dt>File size</dt><dd>{formatBytes(currentVersion?.fileSize)}</dd><dt>Imported by</dt><dd>{currentVersion?.createdBy?.name ?? 'System'}</dd><dt>Imported date</dt><dd>{formatDate(currentVersion?.createdAt)}</dd><dt>Repository location</dt><dd>{currentVersion?.storagePath ?? selected.entry.path}</dd></dl></> : selected.kind === 'file' ? <><div className={styles.fileHero}>{iconFor(selected.entry)}<div><b>{selected.entry.name}</b><div className={styles.muted}>{selected.entry.mimeType ?? extensionOf(selected.entry.name).toUpperCase()} · {formatBytes(selected.entry.size)}</div></div></div>{selectedDocument && currentVersion && <><div className={styles.actions} style={{ marginTop: 15 }}>{isInlineType(currentVersion.mimeType) ? <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={() => void viewFile(currentVersion)}><ExternalLink size={15} />View</button> : null}<button type="button" className={styles.button} onClick={() => void download(currentVersion)}><Download size={15} />Download</button><Link href={`/repository/documents/${selectedDocument.id}`} className={styles.button}>Open parent Document Details</Link></div><dl className={styles.detailGrid}><dt>Filename</dt><dd>{currentVersion.originalFileName}</dd><dt>File type</dt><dd>{currentVersion.mimeType}</dd><dt>File size</dt><dd>{formatBytes(currentVersion.fileSize)}</dd><dt>Version</dt><dd>{currentVersion.versionNo}</dd><dt>Modified date</dt><dd>{formatDate(currentVersion.createdAt)}</dd><dt>Parent document</dt><dd>{selectedDocument.code} — {selectedDocument.title}</dd><dt>Repository location</dt><dd>{currentVersion.storagePath}</dd></dl></>} {!selectedDocument && <div className={styles.empty}><File size={30} /><strong>File record is not mapped to an imported document.</strong><span>Only mapped logical document versions expose secure document actions.</span></div>}</> : <div className={styles.empty}><strong>Loading selected document…</strong></div>}</div></section>
    </section>
  </main>;
}
