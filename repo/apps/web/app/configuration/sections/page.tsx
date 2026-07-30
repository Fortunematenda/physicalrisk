'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, Layers3, Plus, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { useConfirm } from '@/components/confirm-dialog';
import { CreateRepositorySectionModal } from '@/components/import/CreateRepositorySectionModal';
import { api } from '@/lib/api';
import { orderSectionsActiveFirst, syncLinkedSectionFields } from '@/lib/section-fields';
import styles from '../Configuration.module.css';

const ALL_PROJECTS = '__all__';

type SectionRow = {
  id: string;
  name: string;
  sectionKey: string;
  code: string;
  relativePath: string;
  position: number;
  active?: boolean;
  slug?: string;
};

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  repositoryRootPath: string;
  status?: string;
  sections: SectionRow[];
};

type EditableSection = SectionRow & {
  projectId: string;
  projectCode: string;
  projectName: string;
  repositoryRootPath: string;
};

function flattenSections(projects: ProjectRow[]): EditableSection[] {
  const rows: EditableSection[] = [];
  for (const project of projects) {
    for (const section of project.sections ?? []) {
      rows.push({
        ...section,
        code: section.code || '',
        relativePath: section.relativePath || section.name,
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        repositoryRootPath: project.repositoryRootPath,
      });
    }
  }
  return rows.sort((a, b) => {
    const byProject = a.projectCode.localeCompare(b.projectCode);
    if (byProject !== 0) return byProject;
    return a.position - b.position;
  });
}

export default function SectionsPage() {
  const confirm = useConfirm();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [selection, setSelection] = useState(ALL_PROJECTS);
  const [rows, setRows] = useState<EditableSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [projectQuery, setProjectQuery] = useState('');
  const [sectionQuery, setSectionQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const isAll = selection === ALL_PROJECTS;
  const selectedProject = useMemo(
    () => (isAll ? null : projects.find((item) => item.id === selection) ?? null),
    [isAll, projects, selection],
  );

  const loadProjects = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<ProjectRow[]>('/projects');
      setProjects(data);
      setSelection((current) => {
        if (current === ALL_PROJECTS) return ALL_PROJECTS;
        if (data.some((item) => item.id === current)) return current;
        return ALL_PROJECTS;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load projects');
    } finally {
      setLoading(false);
    }
  };

  const rebuildRows = (projectList: ProjectRow[], nextSelection: string) => {
    if (nextSelection === ALL_PROJECTS) {
      setRows(flattenSections(projectList));
      return;
    }
    const project = projectList.find((item) => item.id === nextSelection);
    if (!project) {
      setRows([]);
      return;
    }
    setRows(
      orderSectionsActiveFirst(
        (project.sections ?? []).map((section) => ({
          ...section,
          code: section.code || '',
          relativePath: section.relativePath || section.name,
          projectId: project.id,
          projectCode: project.code,
          projectName: project.name,
          repositoryRootPath: project.repositoryRootPath,
        })),
      ),
    );
  };

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api<ProjectRow[]>('/projects');
        setProjects(data);
        setSelection(ALL_PROJECTS);
        setRows(flattenSections(data));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to load projects');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!projects.length) return;
    rebuildRows(projects, selection);
  }, [projects, selection]);

  const filteredProjects = useMemo(() => {
    const needle = projectQuery.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((item) => {
      const haystack = `${item.code} ${item.name} ${item.repositoryRootPath}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [projects, projectQuery]);

  const visibleRows = useMemo(() => {
    const needle = sectionQuery.trim().toLowerCase();
    return rows.filter((section) => {
      if (activeOnly && section.active === false) return false;
      if (!needle) return true;
      const haystack = [
        section.name,
        section.sectionKey,
        section.code,
        section.relativePath,
        section.projectCode,
        section.projectName,
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [rows, sectionQuery, activeOnly]);

  const nextPosition = useMemo(() => {
    if (isAll || !selectedProject) return 1;
    const list = selectedProject.sections ?? [];
    if (!list.length) return 1;
    return Math.max(...list.map((section) => section.position || 0)) + 1;
  }, [isAll, selectedProject]);

  const allSectionCount = useMemo(
    () => projects.reduce((total, item) => total + (item.sections?.length ?? 0), 0),
    [projects],
  );

  const stats = useMemo(() => {
    const activeProjects = projects.filter((item) => item.status === 'ACTIVE').length;
    const selectedActive = rows.filter((section) => section.active !== false).length;
    return {
      projects: projects.length,
      activeProjects,
      sections: allSectionCount,
      selectedActive,
      selectedTotal: rows.length,
    };
  }, [projects, rows, allSectionCount]);

  const patchLocal = (
    sectionId: string,
    updater: (row: EditableSection) => EditableSection,
    reorder = false,
  ) => {
    setRows((current) => {
      let next = current.map((row) => (row.id === sectionId ? updater(row) : row));
      if (reorder && !isAll) next = orderSectionsActiveFirst(next);
      return next;
    });
  };

  const saveSection = async (section: EditableSection) => {
    setBusyId(section.id);
    setError('');
    setMessage('');
    try {
      await api(`/project-sections/${section.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: section.name,
          sectionKey: section.sectionKey,
          code: section.code,
          relativePath: section.relativePath,
          position: section.position,
          active: section.active !== false,
        }),
      });
      setMessage(`Saved “${section.name}” (${section.projectCode}).`);
      const data = await api<ProjectRow[]>('/projects');
      setProjects(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update section');
    } finally {
      setBusyId(null);
    }
  };

  const deleteSection = async (section: EditableSection) => {
    const ok = await confirm({
      title: 'Delete section',
      message: `Delete “${section.name}” from ${section.projectCode}? The VPS folder must be empty.`,
      confirmLabel: 'Delete section',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(section.id);
    setError('');
    setMessage('');
    try {
      await api(`/project-sections/${section.id}`, { method: 'DELETE' });
      setMessage(`Deleted “${section.name}” from ${section.projectCode}.`);
      const data = await api<ProjectRow[]>('/projects');
      setProjects(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete section');
    } finally {
      setBusyId(null);
    }
  };

  const onLinkedFieldChange = (
    section: EditableSection,
    field: 'name' | 'sectionKey' | 'code' | 'relativePath',
    value: string,
  ) => {
    patchLocal(section.id, (row) => syncLinkedSectionFields(row, field, value));
  };

  const onActiveChange = async (section: EditableSection, active: boolean) => {
    const updated = { ...section, active };
    patchLocal(section.id, () => updated, true);
    await saveSection({ ...updated, active });
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Repository Sections"
        description="Repository folders (modules) where approved files are stored on the VPS — for example Articles or Research Library. This is not Document Type (classification such as Article or Technical Specification)."
        action={{ label: 'Project Registry', href: '/configuration/projects' }}
      />

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconBlue}`}><FolderOpen size={18} /></div>
          <div>
            <span>Projects</span>
            <strong>{stats.projects}</strong>
            <small>{stats.activeProjects} active repositories</small>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconOrange}`}><Layers3 size={18} /></div>
          <div>
            <span>All sections</span>
            <strong>{stats.sections}</strong>
            <small>Configured across the registry</small>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconGreen}`}><ShieldCheck size={18} /></div>
          <div>
            <span>{isAll ? 'Showing' : 'Selected project'}</span>
            <strong>{stats.selectedActive}</strong>
            <small>{stats.selectedTotal} total sections</small>
          </div>
        </div>
      </div>

      {loading ? (
        <div className={styles.panelCard}><div className={styles.stateWrap}><Loading /></div></div>
      ) : projects.length === 0 ? (
        <div className={styles.panelCard}>
          <div className={styles.stateWrap}>
            <EmptyState title="No projects yet" text="Create a project in the Project Registry to review its repository sections." />
          </div>
        </div>
      ) : (
        <div className={styles.splitLayout}>
          <div className={styles.panelCard}>
            <div className={styles.panelHead}>
              <div>
                <h2>Projects</h2>
                <p>Select All sections or a project to edit its VPS folders.</p>
              </div>
              <button
                type="button"
                className={`button small ${styles.refresh}`}
                onClick={() => void loadProjects()}
                aria-label="Refresh projects"
                title="Refresh"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <div className={styles.toolbar}>
              <div className={styles.searchWrap}>
                <Search size={15} className={styles.searchIcon} />
                <input
                  className={styles.search}
                  value={projectQuery}
                  onChange={(event) => setProjectQuery(event.target.value)}
                  placeholder="Search projects"
                  aria-label="Search projects"
                />
              </div>
            </div>
            <div className={styles.projectList}>
              <button
                type="button"
                className={`${styles.projectButton} ${isAll ? styles.projectButtonActive : ''}`}
                onClick={() => setSelection(ALL_PROJECTS)}
              >
                <strong>All sections</strong>
                <span>{allSectionCount} repository sections · every project</span>
              </button>
              {filteredProjects.length === 0 ? (
                <EmptyState title="No matches" text="No projects match the current search." />
              ) : (
                filteredProjects.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.projectButton} ${item.id === selection ? styles.projectButtonActive : ''}`}
                    onClick={() => setSelection(item.id)}
                  >
                    <strong>{item.code} — {item.name}</strong>
                    <span>{item.sections.length} repository sections · repository/{item.repositoryRootPath}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className={styles.panelCard}>
            <div className={styles.panelHead}>
              <div>
                <h2>{isAll ? 'All repository sections' : `${selectedProject?.name || 'Select project'} directory`}</h2>
                {isAll ? (
                  <p>Edit or delete sections across every project. Changes apply to that project’s VPS folder.</p>
                ) : selectedProject ? (
                  <p className="mono">repository/{selectedProject.repositoryRootPath}</p>
                ) : (
                  <p>Choose a project on the left to review its sections.</p>
                )}
              </div>
              <div className={styles.templateActions}>
                {!isAll && selectedProject ? (
                  <>
                    <button
                      type="button"
                      className="button primary small"
                      onClick={() => setShowCreate(true)}
                    >
                      <Plus size={14} /> Add section
                    </button>
                    <Link className="button small" href={`/configuration/projects/${selectedProject.id}`}>
                      Edit configuration
                    </Link>
                  </>
                ) : null}
              </div>
            </div>

            <div className={styles.toolbar}>
              <div className={styles.searchWrap}>
                <Search size={15} className={styles.searchIcon} />
                <input
                  className={styles.search}
                  value={sectionQuery}
                  onChange={(event) => setSectionQuery(event.target.value)}
                  placeholder={isAll ? 'Search sections or projects' : 'Search sections'}
                  aria-label="Search sections"
                />
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={activeOnly}
                  onChange={(event) => setActiveOnly(event.target.checked)}
                />
                Active only
              </label>
              <span className={styles.count}>{visibleRows.length} shown</span>
            </div>

            {visibleRows.length === 0 ? (
              <div className={styles.stateWrap}>
                <EmptyState
                  title="No sections found"
                  text={isAll
                    ? 'No repository sections match the current filters.'
                    : 'Add a repository section/module for this project using Add section.'}
                />
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      {isAll ? <th className={styles.colStatus}>Project</th> : null}
                      <th className={styles.colNum}>Order</th>
                      <th>Key</th>
                      <th>Name</th>
                      <th className={styles.colNum}>Code</th>
                      <th>VPS relative folder</th>
                      <th className={styles.colStatus}>Active</th>
                      <th className={styles.colActions}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((section) => (
                      <tr key={section.id} style={section.active === false ? { opacity: 0.65 } : undefined}>
                        {isAll ? (
                          <td>
                            <div className={styles.title}>{section.projectCode}</div>
                            <div className="secondary-text">{section.projectName}</div>
                          </td>
                        ) : null}
                        <td>
                          <input
                            style={{ width: 64 }}
                            type="number"
                            min={1}
                            value={section.position}
                            disabled={section.active === false || busyId === section.id}
                            onChange={(event) => {
                              const position = Number(event.target.value);
                              patchLocal(section.id, (row) => ({ ...row, position }));
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="mono"
                            style={{ width: 140 }}
                            value={section.sectionKey}
                            disabled={busyId === section.id}
                            onChange={(event) => onLinkedFieldChange(section, 'sectionKey', event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            value={section.name}
                            disabled={busyId === section.id}
                            onChange={(event) => onLinkedFieldChange(section, 'name', event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            style={{ width: 72 }}
                            value={section.code}
                            disabled={busyId === section.id}
                            onChange={(event) => onLinkedFieldChange(section, 'code', event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="mono"
                            value={section.relativePath || section.name}
                            disabled={busyId === section.id}
                            onChange={(event) => onLinkedFieldChange(section, 'relativePath', event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={section.active !== false}
                            disabled={busyId === section.id}
                            onChange={(event) => void onActiveChange(section, event.target.checked)}
                            aria-label={`Active ${section.name}`}
                          />
                        </td>
                        <td className={styles.colActions}>
                          <div className={styles.iconActions}>
                            <button
                              type="button"
                              className="button small"
                              disabled={busyId === section.id}
                              onClick={() => void saveSection(section)}
                            >
                              {busyId === section.id ? '…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              className={`${styles.iconActionBtn} ${styles.iconActionBtnDanger}`}
                              disabled={busyId === section.id}
                              title="Delete section"
                              aria-label={`Delete ${section.name}`}
                              onClick={() => void deleteSection(section)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {showCreate && selectedProject ? (
        <CreateRepositorySectionModal
          projectId={selectedProject.id}
          nextPosition={nextPosition}
          onCancel={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            setMessage(`Section added at order ${nextPosition}.`);
            const data = await api<ProjectRow[]>('/projects');
            setProjects(data);
          }}
        />
      ) : null}
    </div>
  );
}
