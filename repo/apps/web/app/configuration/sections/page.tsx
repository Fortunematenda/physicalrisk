'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, Layers3, MoreVertical, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useConfirm } from '@/components/confirm-dialog';
import {
  ConfigurationListShell,
  configurationListStyles as configStyles,
} from '@/components/configuration-list-shell';
import { RowActionsMenu } from '@/components/row-actions-menu';
import { StatusBadge } from '@/components/status-badge';
import { CreateRepositorySectionModal } from '@/components/import/CreateRepositorySectionModal';
import { api } from '@/lib/api';
import { syncLinkedSectionFields } from '@/lib/section-fields';
import styles from '@/components/row-actions.module.css';

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

type ModuleInstance = SectionRow & {
  projectId: string;
  projectCode: string;
  projectName: string;
  repositoryRootPath: string;
};

type ModuleGroup = {
  sectionKey: string;
  name: string;
  code: string;
  relativePath: string;
  activeCount: number;
  inactiveCount: number;
  instances: ModuleInstance[];
};

function buildModules(projects: ProjectRow[]): ModuleGroup[] {
  const map = new Map<string, ModuleGroup>();
  for (const project of projects) {
    for (const section of project.sections ?? []) {
      const key = section.sectionKey || section.code;
      if (!key) continue;
      const instance: ModuleInstance = {
        ...section,
        code: section.code || '',
        relativePath: section.relativePath || section.name,
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        repositoryRootPath: project.repositoryRootPath,
      };
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          sectionKey: key,
          name: section.name,
          code: section.code || '',
          relativePath: section.relativePath || section.name,
          activeCount: section.active === false ? 0 : 1,
          inactiveCount: section.active === false ? 1 : 0,
          instances: [instance],
        });
      } else {
        existing.instances.push(instance);
        if (section.active === false) existing.inactiveCount += 1;
        else existing.activeCount += 1;
      }
    }
  }
  return [...map.values()]
    .map((module) => ({
      ...module,
      instances: [...module.instances].sort((a, b) => a.projectCode.localeCompare(b.projectCode)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function SectionsPage() {
  const confirm = useConfirm();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [detailsModule, setDetailsModule] = useState<ModuleGroup | null>(null);
  const [editing, setEditing] = useState<ModuleGroup | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    sectionKey: '',
    code: '',
    relativePath: '',
  });
  const [mounted, setMounted] = useState(false);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeMenuAnchor = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<ProjectRow[]>('/projects');
      setProjects(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load repository modules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const modules = useMemo(() => buildModules(projects), [projects]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return modules.filter((module) => {
      if (activeOnly && module.activeCount === 0) return false;
      if (!needle) return true;
      const haystack = [
        module.name,
        module.sectionKey,
        module.code,
        module.relativePath,
        ...module.instances.flatMap((item) => [item.projectCode, item.projectName]),
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [modules, query, activeOnly]);

  const openModule = openMenuKey ? modules.find((item) => item.sectionKey === openMenuKey) ?? null : null;

  useEffect(() => {
    activeMenuAnchor.current = openMenuKey ? menuButtonRefs.current[openMenuKey] ?? null : null;
  }, [openMenuKey]);

  const stats = useMemo(() => {
    const activeProjects = projects.filter((item) => item.status === 'ACTIVE').length;
    const activeModules = modules.filter((item) => item.activeCount > 0).length;
    return {
      projects: projects.length,
      activeProjects,
      modules: modules.length,
      activeModules,
      instances: modules.reduce((total, item) => total + item.instances.length, 0),
    };
  }, [projects, modules]);

  const refreshDetails = (sectionKey: string, nextProjects: ProjectRow[]) => {
    const next = buildModules(nextProjects).find((item) => item.sectionKey === sectionKey) ?? null;
    setDetailsModule(next);
    if (editing?.sectionKey === sectionKey) setEditing(next);
  };

  const openEdit = (module: ModuleGroup) => {
    setOpenMenuKey(null);
    setEditing(module);
    setEditForm({
      name: module.name,
      sectionKey: module.sectionKey,
      code: module.code,
      relativePath: module.relativePath,
    });
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const name = editForm.name.trim();
    const sectionKey = editForm.sectionKey.trim().toUpperCase();
    const code = editForm.code.trim().toUpperCase();
    const relativePath = editForm.relativePath.trim() || name;
    if (!name || !sectionKey || !code) {
      setError('Module name, key, and code are required.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      for (const instance of editing.instances) {
        await api(`/project-sections/${instance.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name,
            sectionKey,
            code,
            relativePath,
            position: instance.position,
            active: instance.active !== false,
          }),
        });
      }
      setMessage(`Updated “${name}” across ${editing.instances.length} project(s).`);
      setEditing(null);
      const data = await api<ProjectRow[]>('/projects');
      setProjects(data);
      refreshDetails(sectionKey, data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update module');
    } finally {
      setSaving(false);
    }
  };

  const setModuleActive = async (module: ModuleGroup, active: boolean) => {
    setOpenMenuKey(null);
    const ok = await confirm({
      title: active ? 'Activate repository module' : 'Deactivate repository module',
      message: active
        ? `Set “${module.name}” active across all ${module.instances.length} project placement(s) and matching directory templates?`
        : `Set “${module.name}” inactive across all ${module.instances.length} project placement(s) and matching directory templates? Inactive modules are hidden from import and project module totals.`,
      confirmLabel: active ? 'Set active' : 'Set inactive',
      tone: active ? 'default' : 'danger',
    });
    if (!ok) return;
    setBusyKey(module.sectionKey);
    setError('');
    setMessage('');
    try {
      const result = await api<{
        projectSectionsUpdated: number;
        templateSectionsUpdated: number;
      }>(`/repository-modules/${encodeURIComponent(module.sectionKey)}/active`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      });
      setMessage(
        `“${module.name}” is now ${active ? 'active' : 'inactive'} `
        + `across ${result.projectSectionsUpdated} project(s)`
        + (result.templateSectionsUpdated
          ? ` and ${result.templateSectionsUpdated} template section(s)`
          : '')
        + '.',
      );
      const data = await api<ProjectRow[]>('/projects');
      setProjects(data);
      refreshDetails(module.sectionKey, data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update module status');
    } finally {
      setBusyKey(null);
    }
  };

  const deleteModule = async (module: ModuleGroup) => {
    setOpenMenuKey(null);
    const ok = await confirm({
      title: 'Delete repository module',
      message: `Delete “${module.name}” from ${module.instances.length} project(s)? Each VPS folder must be empty.`,
      confirmLabel: 'Delete module',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyKey(module.sectionKey);
    setError('');
    setMessage('');
    const failures: string[] = [];
    let deleted = 0;
    try {
      for (const instance of module.instances) {
        try {
          await api(`/project-sections/${instance.id}`, { method: 'DELETE' });
          deleted += 1;
        } catch (caught) {
          failures.push(
            `${instance.projectCode}: ${caught instanceof Error ? caught.message : 'Unable to delete'}`,
          );
        }
      }
      if (deleted) setMessage(`Deleted “${module.name}” from ${deleted} project(s).`);
      if (failures.length) setError(failures.join(' · '));
      if (detailsModule?.sectionKey === module.sectionKey) setDetailsModule(null);
      const data = await api<ProjectRow[]>('/projects');
      setProjects(data);
    } finally {
      setBusyKey(null);
    }
  };

  const deleteInstance = async (instance: ModuleInstance) => {
    const ok = await confirm({
      title: 'Delete section',
      message: `Delete “${instance.name}” from ${instance.projectCode}? The VPS folder must be empty.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyKey(instance.id);
    setError('');
    setMessage('');
    try {
      await api(`/project-sections/${instance.id}`, { method: 'DELETE' });
      setMessage(`Deleted “${instance.name}” from ${instance.projectCode}.`);
      const data = await api<ProjectRow[]>('/projects');
      setProjects(data);
      if (detailsModule) refreshDetails(detailsModule.sectionKey, data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete section');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <ConfigurationListShell
      title="Repository Modules"
      description="Repository folders (modules) used across projects — for example Articles or Research Library. Click a project count to inspect where a module is used."
      error={error}
      message={message}
      stats={[
        {
          label: 'Projects',
          value: stats.projects,
          hint: `${stats.activeProjects} active repositories`,
          icon: <FolderOpen size={18} />,
          tone: 'blue',
        },
        {
          label: 'Modules',
          value: stats.modules,
          hint: `${stats.instances} project placements`,
          icon: <Layers3 size={18} />,
          tone: 'orange',
        },
        {
          label: 'Active modules',
          value: stats.activeModules,
          hint: 'In use on at least one project',
          icon: <ShieldCheck size={18} />,
          tone: 'green',
        },
      ]}
      toolbar={(
        <>
          <button
            type="button"
            className="button primary small"
            onClick={() => setShowCreate(true)}
            disabled={!projects.length}
          >
            <Plus size={14} /> Add section
          </button>
          <div className={configStyles.searchWrap}>
            <Search size={15} className={configStyles.searchIcon} />
            <input
              className={configStyles.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search modules or projects"
              aria-label="Search modules"
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
          <button
            type="button"
            className={`button small ${configStyles.refresh}`}
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh modules"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? configStyles.spinning : undefined} />
            Refresh
          </button>
          <span className={configStyles.count}>{filtered.length} shown</span>
        </>
      )}
      loading={loading}
      empty={filtered.length === 0 ? {
        title: 'No modules found',
        text: 'No repository modules match the current filters.',
      } : null}
      footer={(
        <>
          <RowActionsMenu
            open={Boolean(openModule)}
            anchorRef={activeMenuAnchor}
            onClose={() => setOpenMenuKey(null)}
          >
            <button
              type="button"
              role="menuitem"
              disabled={busyKey === openModule?.sectionKey}
              onClick={() => openModule && openEdit(openModule)}
            >
              Edit
            </button>
            {openModule && openModule.activeCount > 0 ? (
              <button
                type="button"
                role="menuitem"
                disabled={busyKey === openModule.sectionKey}
                onClick={() => void setModuleActive(openModule, false)}
              >
                Set inactive
              </button>
            ) : null}
            {openModule && openModule.inactiveCount > 0 ? (
              <button
                type="button"
                role="menuitem"
                disabled={busyKey === openModule.sectionKey}
                onClick={() => void setModuleActive(openModule, true)}
              >
                Set active
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className={styles.dangerItem}
              disabled={busyKey === openModule?.sectionKey}
              onClick={() => openModule && void deleteModule(openModule)}
            >
              Delete
            </button>
          </RowActionsMenu>

          {mounted && detailsModule
            ? createPortal(
                <div
                  className={styles.editModal}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="module-details-title"
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setDetailsModule(null);
                  }}
                >
                  <div className={`${styles.editModalCard} ${configStyles.moduleDetailsCard}`}>
                    <h3 id="module-details-title">{detailsModule.name}</h3>
                    <p>
                      <span className="mono">{detailsModule.sectionKey}</span>
                      {' · '}
                      <span className="mono">{detailsModule.code || '—'}</span>
                      {' · '}
                      used in {detailsModule.instances.length} project{detailsModule.instances.length === 1 ? '' : 's'}
                    </p>
                    <div className={configStyles.tableWrap}>
                      <table>
                        <thead>
                          <tr>
                            <th>Project</th>
                            <th>Order</th>
                            <th>VPS folder</th>
                            <th>Status</th>
                            <th aria-label="Actions" />
                          </tr>
                        </thead>
                        <tbody>
                          {detailsModule.instances.map((instance) => (
                            <tr key={instance.id}>
                              <td>
                                <Link href={`/configuration/projects/${instance.projectId}`} className="primary-text">
                                  {instance.projectCode}
                                </Link>
                                <div className="secondary-text">{instance.projectName}</div>
                              </td>
                              <td>{instance.position}</td>
                              <td>
                                <span className="mono" title={`repository/${instance.repositoryRootPath}/${instance.relativePath}`}>
                                  repository/{instance.repositoryRootPath}/{instance.relativePath}
                                </span>
                              </td>
                              <td>
                                <StatusBadge value={instance.active !== false ? 'ACTIVE' : 'INACTIVE'} />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="button small"
                                  disabled={busyKey === instance.id}
                                  onClick={() => void deleteInstance(instance)}
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className={styles.editModalActions}>
                      <button type="button" className="button" onClick={() => setDetailsModule(null)}>Close</button>
                      <button type="button" className="button primary" onClick={() => openEdit(detailsModule)}>Edit module</button>
                    </div>
                  </div>
                </div>,
                document.body,
              )
            : null}

          {mounted && editing
            ? createPortal(
                <div
                  className={styles.editModal}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="module-edit-title"
                  onMouseDown={(event) => {
                    if (!saving && event.target === event.currentTarget) setEditing(null);
                  }}
                >
                  <form className={styles.editModalCard} onSubmit={saveEdit}>
                    <h3 id="module-edit-title">Edit repository module</h3>
                    <p>
                      Changes apply to all {editing.instances.length} project placement
                      {editing.instances.length === 1 ? '' : 's'} of this module.
                    </p>
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor="edit-module-name">Name <em>*</em></label>
                        <input
                          id="edit-module-name"
                          required
                          value={editForm.name}
                          disabled={saving}
                          onChange={(event) => setEditForm((current) => syncLinkedSectionFields({
                            ...current,
                            sectionKey: current.sectionKey,
                            code: current.code,
                            relativePath: current.relativePath,
                          }, 'name', event.target.value))}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="edit-module-key">Key <em>*</em></label>
                        <input
                          id="edit-module-key"
                          className="mono"
                          required
                          value={editForm.sectionKey}
                          disabled={saving}
                          onChange={(event) => setEditForm((current) => syncLinkedSectionFields({
                            ...current,
                            name: current.name,
                            code: current.code,
                            relativePath: current.relativePath,
                          }, 'sectionKey', event.target.value))}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="edit-module-code">Code <em>*</em></label>
                        <input
                          id="edit-module-code"
                          required
                          value={editForm.code}
                          disabled={saving}
                          onChange={(event) => setEditForm((current) => syncLinkedSectionFields({
                            ...current,
                            name: current.name,
                            sectionKey: current.sectionKey,
                            relativePath: current.relativePath,
                          }, 'code', event.target.value))}
                        />
                      </div>
                      <div className="field full">
                        <label htmlFor="edit-module-path">VPS relative folder</label>
                        <input
                          id="edit-module-path"
                          className="mono"
                          value={editForm.relativePath}
                          disabled={saving}
                          onChange={(event) => setEditForm((current) => syncLinkedSectionFields({
                            ...current,
                            name: current.name,
                            sectionKey: current.sectionKey,
                            code: current.code,
                          }, 'relativePath', event.target.value))}
                        />
                      </div>
                    </div>
                    <div className={styles.editModalActions}>
                      <button type="button" className="button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
                      <button type="submit" className="button primary" disabled={saving}>
                        {saving ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  </form>
                </div>,
                document.body,
              )
            : null}

          {showCreate ? (
            <CreateRepositorySectionModal
              projects={projects.map((project) => ({
                id: project.id,
                code: project.code,
                name: project.name,
                sections: project.sections,
              }))}
              onCancel={() => setShowCreate(false)}
              onCreated={async (created) => {
                setShowCreate(false);
                setMessage(`Section “${created.name}” added.`);
                await load();
              }}
            />
          ) : null}
        </>
      )}
    >
      <table>
        <thead>
          <tr>
            <th>Module</th>
            <th>Key</th>
            <th>Code</th>
            <th>Projects</th>
            <th>Status</th>
            <th className={styles.actionsCell} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {filtered.map((module) => {
            const menuOpen = openMenuKey === module.sectionKey;
            const busy = busyKey === module.sectionKey;
            return (
              <tr key={module.sectionKey}>
                <td>
                  <div className={configStyles.title}>{module.name}</div>
                  <div className="secondary-text mono">{module.relativePath}</div>
                </td>
                <td><span className="mono">{module.sectionKey}</span></td>
                <td><span className="mono">{module.code || '—'}</span></td>
                <td>
                  <button
                    type="button"
                    className={configStyles.projectCountBtn}
                    onClick={() => setDetailsModule(module)}
                    title={`View ${module.name} details`}
                  >
                    {module.instances.length}
                    <span>project{module.instances.length === 1 ? '' : 's'}</span>
                  </button>
                </td>
                <td>
                  <StatusBadge value={module.activeCount > 0 ? 'ACTIVE' : 'INACTIVE'} />
                </td>
                <td className={`${styles.actionsCell} ${menuOpen ? styles.actionsCellOpen : ''}`}>
                  <div className={`${styles.menuWrap} ${menuOpen ? styles.menuWrapOpen : ''}`}>
                    <button
                      type="button"
                      ref={(node) => {
                        menuButtonRefs.current[module.sectionKey] = node;
                        if (menuOpen) activeMenuAnchor.current = node;
                      }}
                      className={`${styles.menuButton} ${menuOpen ? styles.menuButtonActive : ''}`}
                      aria-label={`Actions for ${module.name}`}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      disabled={busy || saving}
                      onClick={() => setOpenMenuKey(menuOpen ? null : module.sectionKey)}
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
    </ConfigurationListShell>
  );
}
