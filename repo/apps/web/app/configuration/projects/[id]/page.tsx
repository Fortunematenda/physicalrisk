'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  FolderKanban, FolderSync, LayoutTemplate, Layers3, Save, Settings2,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { useConfirm } from '@/components/confirm-dialog';
import { CreateRepositorySectionModal } from '@/components/import/CreateRepositorySectionModal';
import { api, formatDate } from '@/lib/api';
import { orderSectionsActiveFirst, syncLinkedSectionFields } from '@/lib/section-fields';
import styles from './ProjectDetail.module.css';

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
  sections: Array<{ id?: string }>;
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
  const [busySectionId, setBusySectionId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showCreateSection, setShowCreateSection] = useState(false);

  const load = async () => {
    try {
      const [project, templateList] = await Promise.all([
        api<ProjectDetail>(`/projects/${id}`),
        api<TemplateRow[]>('/directory-templates'),
      ]);
      setItem({
        ...project,
        sections: orderSectionsActiveFirst([...(project.sections ?? [])] as ProjectSection[]),
      });
      setTemplates(templateList);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load project');
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const sections = useMemo(
    () => [...(item?.sections ?? [])].sort((a, b) => a.position - b.position),
    [item],
  );

  const activeModules = useMemo(
    () => sections.filter((section) => section.active !== false).length,
    [sections],
  );

  const nextSectionPosition = useMemo(() => {
    if (!sections.length) return 1;
    return Math.max(...sections.map((section) => section.position || 0)) + 1;
  }, [sections]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!item) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(item) });
      setMessage('Project configuration saved and VPS folders synchronised.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save');
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = async (templateId: string) => {
    const ok = await confirm({
      title: 'Apply template',
      message: 'Apply this template? Existing files, document relationships and version history are retained.',
      confirmLabel: 'Apply template',
      tone: 'default',
    });
    if (!ok) return;
    setError('');
    setMessage('');
    try {
      await api(`/projects/${id}/apply-template/${templateId}`, { method: 'POST' });
      await load();
      setMessage('Template applied and VPS folders synchronised.');
      setTab('modules');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to apply template');
    }
  };

  const patchSectionLocal = (
    sectionId: string,
    updater: (row: ProjectSection) => ProjectSection,
    reorder = false,
  ) => {
    setItem((current) => {
      if (!current) return current;
      let nextSections = current.sections.map((row) => (
        row.id === sectionId ? updater(row) : row
      ));
      if (reorder) nextSections = orderSectionsActiveFirst(nextSections);
      return { ...current, sections: nextSections };
    });
  };

  const updateSection = async (section: ProjectSection) => {
    setBusySectionId(section.id);
    setError('');
    setMessage('');
    try {
      await api(`/project-sections/${section.id}`, { method: 'PATCH', body: JSON.stringify(section) });
      setMessage(`Saved “${section.name}” and ensured its VPS folder exists.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update section');
    } finally {
      setBusySectionId(null);
    }
  };

  const onLinkedFieldChange = (
    section: ProjectSection,
    field: 'name' | 'sectionKey' | 'code' | 'relativePath',
    value: string,
  ) => {
    patchSectionLocal(section.id, (row) => syncLinkedSectionFields(row, field, value));
  };

  const onActiveChange = async (section: ProjectSection, active: boolean) => {
    if (!item) return;
    const next = orderSectionsActiveFirst(
      item.sections.map((row) => (row.id === section.id ? { ...row, active } : row)),
    );
    const updated = next.find((row) => row.id === section.id)!;
    setItem({ ...item, sections: next });
    await updateSection(updated);
  };

  const syncStorage = async () => {
    setError('');
    setMessage('');
    try {
      const result = await api<{ sectionsCreated: number }>(`/storage/projects/${id}/sync`, { method: 'POST' });
      setMessage(`VPS repository synchronised: ${result.sectionsCreated} active section folders are ready.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to synchronise storage');
    }
  };

  if (!item && !error) return <Loading />;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Project details"
        description="Configure repository identity, modules and directory templates for this VPS project."
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
              <div className={styles.heroActions}>
                <button type="button" className="button small" onClick={() => void syncStorage}>
                  <FolderSync size={14} /> Sync VPS
                </button>
                <button type="button" className="button primary small" onClick={() => setTab('configuration')}>
                  Edit configuration
                </button>
              </div>
            </div>

            <div className={styles.kpiRow}>
              <div className={styles.kpi}>
                <span>Modules</span>
                <strong>{sections.length}</strong>
              </div>
              <div className={styles.kpi}>
                <span>Active</span>
                <strong>{activeModules}</strong>
              </div>
              <div className={styles.kpi}>
                <span>Documents</span>
                <strong>{item._count?.documents ?? 0}</strong>
              </div>
              <div className={styles.kpi}>
                <span>Imports</span>
                <strong>{item._count?.importJobs ?? 0}</strong>
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
                      <span className={styles.tabCount}>{sections.length}</span>
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
                          <strong>Manage modules</strong>
                          <span>{activeModules} active of {sections.length} configured folders</span>
                        </span>
                      </button>
                      <button type="button" className={styles.quickItem} onClick={() => setTab('template')}>
                        <span>
                          <strong>Directory template</strong>
                          <span>{item.directoryTemplate?.name || 'Custom configuration'}</span>
                        </span>
                      </button>
                      <button type="button" className={styles.quickItem} onClick={() => void syncStorage}>
                        <span>
                          <strong>Synchronise VPS folders</strong>
                          <span>Ensure active module folders exist on disk</span>
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
                  <button type="button" className="button" onClick={() => void syncStorage}>
                    <FolderSync size={14} /> Synchronise VPS folders
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
                    <h2>Repository modules</h2>
                    <p>
                      Changing Name, Key, Code, or folder updates the linked fields. Inactive modules move to the bottom.
                    </p>
                  </div>
                  <button type="button" className="button primary small" onClick={() => setShowCreateSection(true)}>
                    Add section
                  </button>
                </div>

                {sections.length === 0 ? (
                  <div className="notice">No modules yet. Add a section or apply a directory template.</div>
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
                          <th>Active</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {sections.map((section) => (
                          <tr key={section.id} style={section.active === false ? { opacity: 0.65 } : undefined}>
                            <td style={{ width: 72 }}>
                              <input
                                type="number"
                                min={1}
                                value={section.position}
                                disabled={section.active === false || busySectionId === section.id}
                                onChange={(event) => {
                                  patchSectionLocal(section.id, (row) => ({
                                    ...row,
                                    position: Number(event.target.value),
                                  }));
                                }}
                              />
                            </td>
                            <td>
                              <input
                                className="mono"
                                value={section.sectionKey}
                                disabled={busySectionId === section.id}
                                onChange={(event) => onLinkedFieldChange(section, 'sectionKey', event.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                value={section.name}
                                disabled={busySectionId === section.id}
                                onChange={(event) => onLinkedFieldChange(section, 'name', event.target.value)}
                              />
                            </td>
                            <td style={{ width: 90 }}>
                              <input
                                value={section.code}
                                disabled={busySectionId === section.id}
                                onChange={(event) => onLinkedFieldChange(section, 'code', event.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                className="mono"
                                value={section.relativePath || section.name}
                                disabled={busySectionId === section.id}
                                onChange={(event) => onLinkedFieldChange(section, 'relativePath', event.target.value)}
                              />
                            </td>
                            <td style={{ width: 70 }}>
                              <input
                                type="checkbox"
                                checked={section.active !== false}
                                disabled={busySectionId === section.id}
                                onChange={(event) => void onActiveChange(section, event.target.checked)}
                                aria-label={`Active ${section.name}`}
                              />
                            </td>
                            <td style={{ width: 80 }}>
                              <button
                                type="button"
                                className="button small"
                                disabled={busySectionId === section.id}
                                onClick={() => {
                                  const current = item.sections.find((row) => row.id === section.id) ?? section;
                                  void updateSection(current);
                                }}
                              >
                                {busySectionId === section.id ? '…' : 'Save'}
                              </button>
                            </td>
                          </tr>
                        ))}
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
                      Apply a template to provision or refresh module folders. Existing documents and relationships are kept.
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
                        onClick={() => void applyTemplate(template.id)}
                      >
                        <strong>{template.name}</strong>
                        <span>
                          {template.sections.length} configured sections
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

      {showCreateSection && item ? (
        <CreateRepositorySectionModal
          projectId={item.id}
          nextPosition={nextSectionPosition}
          onCancel={() => setShowCreateSection(false)}
          onCreated={async () => {
            setShowCreateSection(false);
            setMessage(`Section added at order ${nextSectionPosition}.`);
            await load();
            setTab('modules');
          }}
        />
      ) : null}
    </div>
  );
}
