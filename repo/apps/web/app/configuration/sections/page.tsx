'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, Layers3, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { api } from '@/lib/api';
import styles from '../Configuration.module.css';

type SectionRow = {
  id: string;
  name: string;
  sectionKey: string;
  relativePath: string;
  position: number;
  active?: boolean;
};

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  repositoryRootPath: string;
  status?: string;
  sections: SectionRow[];
};

export default function SectionsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectId, setProjectId] = useState('');
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [projectQuery, setProjectQuery] = useState('');
  const [sectionQuery, setSectionQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);

  const loadProjects = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<ProjectRow[]>('/projects');
      setProjects(data);
      setProjectId((current) => current || data[0]?.id || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      return;
    }
    setDetailLoading(true);
    api<ProjectRow>(`/projects/${projectId}`)
      .then(setProject)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load project sections'))
      .finally(() => setDetailLoading(false));
  }, [projectId]);

  const filteredProjects = useMemo(() => {
    const needle = projectQuery.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((item) => {
      const haystack = `${item.code} ${item.name} ${item.repositoryRootPath}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [projects, projectQuery]);

  const sections = useMemo(() => {
    const list = [...(project?.sections ?? [])].sort((a, b) => a.position - b.position);
    const needle = sectionQuery.trim().toLowerCase();
    return list.filter((section) => {
      if (activeOnly && section.active === false) return false;
      if (!needle) return true;
      const haystack = `${section.name} ${section.sectionKey} ${section.relativePath}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [project, sectionQuery, activeOnly]);

  const stats = useMemo(() => {
    const allSections = projects.reduce((total, item) => total + (item.sections?.length ?? 0), 0);
    const activeProjects = projects.filter((item) => item.status === 'ACTIVE').length;
    const selectedActive = (project?.sections ?? []).filter((section) => section.active !== false).length;
    return {
      projects: projects.length,
      activeProjects,
      sections: allSections,
      selectedActive,
      selectedTotal: project?.sections?.length ?? 0,
    };
  }, [projects, project]);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Repository Sections"
        description="Review the effective VPS directory for each project. Detailed editing is performed in the Project Registry."
        action={{ label: 'Project Registry', href: '/configuration/projects' }}
      />

      {error ? <div className="notice error">{error}</div> : null}

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
            <span>Selected project</span>
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
                <p>Select a project to inspect its effective VPS directory.</p>
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
              {filteredProjects.length === 0 ? (
                <EmptyState title="No matches" text="No projects match the current search." />
              ) : (
                filteredProjects.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.projectButton} ${item.id === projectId ? styles.projectButtonActive : ''}`}
                    onClick={() => setProjectId(item.id)}
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
                <h2>{project?.name || 'Select project'} directory</h2>
                {project ? (
                  <p className="mono">repository/{project.repositoryRootPath}</p>
                ) : (
                  <p>Choose a project on the left to review its sections.</p>
                )}
              </div>
              {project ? (
                <Link className="button small" href={`/configuration/projects/${project.id}`}>
                  Edit configuration
                </Link>
              ) : null}
            </div>

            {project ? (
              <div className={styles.toolbar}>
                <div className={styles.searchWrap}>
                  <Search size={15} className={styles.searchIcon} />
                  <input
                    className={styles.search}
                    value={sectionQuery}
                    onChange={(event) => setSectionQuery(event.target.value)}
                    placeholder="Search sections"
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
                <span className={styles.count}>{sections.length} shown</span>
              </div>
            ) : null}

            {detailLoading ? (
              <div className={styles.stateWrap}><Loading /></div>
            ) : !project ? (
              <div className={styles.stateWrap}>
                <EmptyState title="No project selected" text="Select a project to view its repository sections." />
              </div>
            ) : sections.length === 0 ? (
              <div className={styles.stateWrap}>
                <EmptyState title="No sections found" text="This project has no matching repository sections." />
              </div>
            ) : (
              <ol className={styles.sectionTree}>
                {sections.map((section) => (
                  <li key={section.id}>
                    <span className={styles.position}>{section.position}</span>
                    <span className={styles.sectionName}>
                      {section.name}
                      <span className={styles.sectionKey}>{section.sectionKey}</span>
                    </span>
                    <span className={`mono ${styles.path}`} title={section.relativePath}>
                      {section.relativePath}
                    </span>
                    <div className={styles.badgeRow}>
                      <StatusBadge value={section.active !== false ? 'ACTIVE' : 'INACTIVE'} />
                      <span className={styles.folderBadge}>VPS folder</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
