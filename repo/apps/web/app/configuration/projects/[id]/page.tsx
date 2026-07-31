'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  FolderKanban, LayoutTemplate, Layers3, MoreVertical, Save, Settings2,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { useConfirm } from '@/components/confirm-dialog';
import { RowActionsMenu } from '@/components/row-actions-menu';
import { api, formatDate } from '@/lib/api';
import { getErrorMessage } from '@/lib/api-error';
import { orderSectionsActiveFirst } from '@/lib/section-fields';
import styles from './ProjectDetail.module.css';
import actionStyles from '@/components/row-actions.module.css';

type TabId = 'overview' | 'configuration' | 'modules' | 'template';

type ProjectSection = {
  id: string;
  sectionKey: string;
  name: string;
  code: string;
  relativePath?: string;
  position: number;
  active?: boolean;
  slug?: string;
};

type TemplateSection = {
  id?: string;
  sectionKey: string;
  name: string;
  code: string;
  relativePath?: string;
  position: number;
  active?: boolean;
};

type ProjectDetail = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  status: string;
  repositoryRootPath?: string;
  directoryTemplateId?: string | null;
  directoryTemplate?: { id: string; name: string } | null;
  updatedAt?: string;
  sections: ProjectSection[];
  _count: { documents: number; importJobs: number };
};

type TemplateRow = {
  id: string;
  name: string;
  isDefault?: boolean;
  sections: TemplateSection[];
};

const TABS: Array<{ id: TabId; label: string; icon: typeof Settings2 }> = [
  { id: 'overview', label: 'Overview', icon: FolderKanban },
  { id: 'configuration', label: 'Configuration', icon: Settings2 },
  { id: 'modules', label: 'Modules', icon: Layers3 },
  { id: 'template', label: 'Template', icon: LayoutTemplate },
];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const confirm = useConfirm();
  const [item, setItem] = useState<ProjectDetail | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [tab, setTab] = useState<TabId>('overview');
  const [saving, setSaving] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [busySectionId, setBusySectionId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeMenuAnchor = useRef<HTMLButtonElement | null>(null);

  const load = async () => {
    try {
      const [project, templateList] = await Promise.all([
        api<ProjectDetail>(`/projects/${id}`),
        api<TemplateRow[]>('/directory-templates'),
      ]);
      setItem({
        ...project,
        sections: orderSectionsActiveFirst([...(project.sections ?? [])]),
      });
      setTemplates(templateList);
    } catch (caught) {
      setError(getErrorMessage(caught, 'Unable to load project'));
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  // Keep VPS folders in sync quietly; create/update APIs already ensure structure.
  useEffect(() => {
    if (!id) return;
    void api(`/storage/projects/${id}/sync`, { method: 'POST' }).catch(() => undefined);
  }, [id]);

  useEffect(() => {
    activeMenuAnchor.current = openMenuId ? menuButtonRefs.current[openMenuId] ?? null : null;
  }, [openMenuId]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === item?.directoryTemplateId) ?? null,
    [templates, item?.directoryTemplateId],
  );

  /**
   * Modules for the selected directory template only (active + inactive on this project).
   * Leftover sections from other templates are excluded from the total and list.
   * Toggles still only update this project's ProjectSection rows.
   */
  const modules = useMemo(() => {
    const projectSections = orderSectionsActiveFirst([...(item?.sections ?? [])]);
    if (!selectedTemplate) return projectSections;

    const templateKeys = new Set(
      (selectedTemplate.sections ?? []).map((section) => section.sectionKey),
    );
    const fromTemplate = projectSections.filter((section) => templateKeys.has(section.sectionKey));
    if (fromTemplate.length) return fromTemplate;

    // Template selected but not yet applied — show template definitions for the total/list.
    return [...(selectedTemplate.sections ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((section) => ({
        id: section.id || section.sectionKey,
        sectionKey: section.sectionKey,
        name: section.name,
        code: section.code,
        relativePath: section.relativePath || section.name,
        position: section.position,
        active: section.active !== false,
      }));
  }, [item?.sections, selectedTemplate]);

  const openSection = openMenuId
    ? modules.find((section) => section.id === openMenuId) ?? null
    : null;

  /** Totals reflect active modules for the selected template only. */
  const activeModuleCount = useMemo(
    () => modules.filter((section) => section.active !== false).length,
    [modules],
  );

  const setSectionActive = async (section: ProjectSection, active: boolean) => {
    setOpenMenuId(null);
    if (!section.id || section.id === section.sectionKey) {
      setError('This module is not provisioned on the project yet. Apply a template first.');
      return;
    }
    setBusySectionId(section.id);
    setError('');
    setMessage('');
    try {
      await api(`/project-sections/${encodeURIComponent(section.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      });
      setMessage(`“${section.name}” is now ${active ? 'active' : 'inactive'} for this project only.`);
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught, 'Unable to update module status'));
    } finally {
      setBusySectionId(null);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!item) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(item) });
      setMessage('Project configuration saved.');
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught, 'Unable to save'));
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = async (templateId: string) => {
    if (templateId === item?.directoryTemplateId) {
      setTab('modules');
      return;
    }
    const template = templates.find((row) => row.id === templateId);
    const ok = await confirm({
      title: 'Apply template',
      message: `Apply “${template?.name || 'this template'}”? Existing files, document relationships and version history are retained. Modules not in the template are marked inactive.`,
      confirmLabel: 'Apply template',
      tone: 'default',
    });
    if (!ok) return;
    setError('');
    setMessage('');
    setApplyingTemplate(true);
    try {
      await api(`/projects/${id}/apply-template/${templateId}`, { method: 'POST', body: JSON.stringify({}) });
      await load();
      setMessage(`Template “${template?.name || 'selected'}” applied.`);
      setTab('modules');
    } catch (caught) {
      setError(getErrorMessage(caught, 'Unable to apply template'));
    } finally {
      setApplyingTemplate(false);
    }
  };

  if (!item && !error) return <Loading />;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Project details"
        description="Configure project identity, repository modules, and directory structure."
        backHref="/configuration/projects"
        action={{ label: 'Open explorer', href: `/repository/explorer?projectId=${id}` }}
      />

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      {item ? (
        <>
          <section className={styles.hero}>
            <div className={styles.heroTop}>
              <div>
                <div className={styles.heroMeta}>
                  <span className={styles.codePill}>{item.code}</span>
                  <StatusBadge value={item.status} />
                </div>
                <h1 className={styles.heroTitle}>{item.name}</h1>
                <p className={styles.heroDescription}>
                  {item.description?.trim() || 'No description provided for this project yet.'}
                </p>
              </div>
            </div>

            <div className={styles.kpiRow}>
              <div className={styles.kpi}>
                <span>Modules</span>
                <strong>{activeModuleCount}</strong>
              </div>
              <div className={styles.kpi}>
                <span>Template</span>
                <strong style={{ fontSize: 14 }}>{item.directoryTemplate?.name || 'Custom'}</strong>
              </div>
              <div className={styles.kpi}>
                <span>Documents</span>
                <strong>{item._count?.documents ?? 0}</strong>
              </div>
            </div>
          </section>

          <div className={styles.shell}>
            <div className={styles.tabs} role="tablist" aria-label="Project sections">
              {TABS.map((entry) => {
                const Icon = entry.icon;
                const active = tab === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`${styles.tab} ${active ? styles.tabActive : ''}`}
                    onClick={() => setTab(entry.id)}
                  >
                    <Icon size={15} />
                    {entry.label}
                    {entry.id === 'modules' ? (
                      <span className={styles.tabCount}>{activeModuleCount}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {tab === 'overview' ? (
              <div className={styles.panel} role="tabpanel">
                <div className={styles.panelHead}>
                  <div>
                    <h2>Overview</h2>
                    <p>Project state, storage location and shortcuts for day-to-day administration.</p>
                  </div>
                </div>
                <div className={styles.overviewGrid}>
                  <div className={styles.card}>
                    <h3>Quick actions</h3>
                    <div className={styles.quickList}>
                      <Link className={styles.quickItem} href={`/repository/explorer?projectId=${id}`}>
                        <span>
                          <strong>Repository explorer</strong>
                          <span>Browse and manage files on the VPS volume</span>
                        </span>
                      </Link>
                      <button type="button" className={styles.quickItem} onClick={() => setTab('modules')}>
                        <span>
                          <strong>View modules</strong>
                          <span>
                            {activeModuleCount} active module{activeModuleCount === 1 ? '' : 's'}
                            {item.directoryTemplate?.name ? ` from ${item.directoryTemplate.name}` : ''}
                          </span>
                        </span>
                      </button>
                      <Link className={styles.quickItem} href="/configuration/sections">
                        <span>
                          <strong>Edit in Repository Modules</strong>
                          <span>Add, edit or delete modules across projects</span>
                        </span>
                      </Link>
                      <button type="button" className={styles.quickItem} onClick={() => setTab('template')}>
                        <span>
                          <strong>Directory template</strong>
                          <span>{item.directoryTemplate?.name || 'Custom configuration'}</span>
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className={styles.card}>
                    <h3>Project state</h3>
                    <dl className={styles.detailList}>
                      <dt>Status</dt>
                      <dd><StatusBadge value={item.status} /></dd>
                      <dt>Template</dt>
                      <dd>{item.directoryTemplate?.name || 'Custom'}</dd>
                      <dt>Documents</dt>
                      <dd>{item._count?.documents ?? 0}</dd>
                      <dt>Imports</dt>
                      <dd>{item._count?.importJobs ?? 0}</dd>
                      <dt>Updated</dt>
                      <dd>{item.updatedAt ? formatDate(item.updatedAt) : '—'}</dd>
                      <dt>Storage</dt>
                      <dd>VPS local filesystem</dd>
                    </dl>
                    <div className={styles.pathBox}>
                      storage/repository/{item.repositoryRootPath || item.name || item.code}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {tab === 'configuration' ? (
              <form className={styles.panel} role="tabpanel" onSubmit={save}>
                <div className={styles.panelHead}>
                  <div>
                    <h2>Configuration</h2>
                    <p>Update project identity and the VPS repository root used for storage and routing.</p>
                  </div>
                </div>

                <div className="form-grid three">
                  <div className="field">
                    <label htmlFor="project-code">Code</label>
                    <input
                      id="project-code"
                      value={item.code}
                      onChange={(event) => setItem({ ...item, code: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="project-name">Name</label>
                    <input
                      id="project-name"
                      value={item.name}
                      onChange={(event) => setItem({ ...item, name: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="project-status">Status</label>
                    <select
                      id="project-status"
                      value={item.status}
                      onChange={(event) => setItem({ ...item, status: event.target.value })}
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                      <option value="ARCHIVED">ARCHIVED</option>
                    </select>
                  </div>
                  <div className="field full">
                    <label htmlFor="project-description">Description</label>
                    <textarea
                      id="project-description"
                      value={item.description || ''}
                      onChange={(event) => setItem({ ...item, description: event.target.value })}
                    />
                  </div>
                  <div className="field full">
                    <label htmlFor="project-root">Project repository root folder</label>
                    <input
                      id="project-root"
                      className="mono"
                      value={item.repositoryRootPath || ''}
                      onChange={(event) => setItem({ ...item, repositoryRootPath: event.target.value })}
                    />
                    <small>Effective location: storage/repository/{item.repositoryRootPath || item.name || item.code}</small>
                  </div>
                </div>

                <div className={styles.formActions}>
                  <button type="submit" className="button primary" disabled={saving}>
                    <Save size={14} />
                    {saving ? 'Saving…' : 'Save project'}
                  </button>
                  <Link className="button" href={`/repository/explorer?projectId=${id}`}>
                    Open repository explorer
                  </Link>
                </div>
              </form>
            ) : null}

            {tab === 'modules' ? (
              <div className={styles.panel} role="tabpanel">
                <div className={styles.panelHead}>
                  <div>
                    <h2>Project modules</h2>
                    <p>
                      Activate or deactivate modules for this project only. The directory template is not changed.
                      Add or edit module definitions in Repository Modules.
                    </p>
                  </div>
                  <Link className="button small" href="/configuration/sections">
                    Open Repository Modules
                  </Link>
                </div>

                {modules.length === 0 ? (
                  <div className="notice">
                    No modules for this project yet. Apply a directory template or add a section in Repository Modules.
                  </div>
                ) : (
                  <div className={styles.tableWrap}>
                    <table>
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Key</th>
                          <th>Name</th>
                          <th>Code</th>
                          <th>VPS relative folder</th>
                          <th>Status</th>
                          <th className={actionStyles.actionsCell} aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {modules.map((section) => {
                          const menuOpen = openMenuId === section.id;
                          const busy = busySectionId === section.id;
                          const isActive = section.active !== false;
                          return (
                            <tr key={section.id} style={isActive ? undefined : { opacity: 0.65 }}>
                              <td>{section.position}</td>
                              <td><span className="mono">{section.sectionKey}</span></td>
                              <td>{section.name}</td>
                              <td><span className="mono">{section.code}</span></td>
                              <td>
                                <span className="mono">{section.relativePath || section.name}</span>
                              </td>
                              <td>
                                <StatusBadge value={isActive ? 'ACTIVE' : 'INACTIVE'} />
                              </td>
                              <td className={`${actionStyles.actionsCell} ${menuOpen ? actionStyles.actionsCellOpen : ''}`}>
                                <div className={`${actionStyles.menuWrap} ${menuOpen ? actionStyles.menuWrapOpen : ''}`}>
                                  <button
                                    type="button"
                                    ref={(node) => {
                                      menuButtonRefs.current[section.id] = node;
                                      if (menuOpen) activeMenuAnchor.current = node;
                                    }}
                                    className={`${actionStyles.menuButton} ${menuOpen ? actionStyles.menuButtonActive : ''}`}
                                    aria-label={`Actions for ${section.name}`}
                                    aria-haspopup="menu"
                                    aria-expanded={menuOpen}
                                    disabled={busy}
                                    onClick={() => setOpenMenuId(menuOpen ? null : section.id)}
                                  >
                                    <MoreVertical size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            {tab === 'template' ? (
              <div className={styles.panel} role="tabpanel">
                <div className={styles.panelHead}>
                  <div>
                    <h2>Directory template</h2>
                    <p>
                      Apply a template to provision or refresh this project’s modules. Existing documents and relationships are kept.
                    </p>
                  </div>
                </div>
                <div className={styles.templateGrid}>
                  {templates.map((template) => {
                    const active = item.directoryTemplateId === template.id;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        className={`${styles.templateCard} ${active ? styles.templateCardActive : ''}`}
                        disabled={applyingTemplate}
                        onClick={() => void applyTemplate(template.id)}
                      >
                        <strong>{template.name}</strong>
                        <span>
                          {template.sections?.length ?? 0} configured sections
                          {template.isDefault ? ' · Default' : ''}
                          {active ? ' · Current' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      <RowActionsMenu
        open={Boolean(openSection)}
        anchorRef={activeMenuAnchor}
        onClose={() => setOpenMenuId(null)}
      >
        {openSection?.active !== false ? (
          <button
            type="button"
            role="menuitem"
            disabled={busySectionId === openSection?.id}
            onClick={() => openSection && void setSectionActive(openSection, false)}
          >
            Set inactive
          </button>
        ) : (
          <button
            type="button"
            role="menuitem"
            disabled={busySectionId === openSection?.id}
            onClick={() => openSection && void setSectionActive(openSection, true)}
          >
            Set active
          </button>
        )}
      </RowActionsMenu>
    </div>
  );
}
