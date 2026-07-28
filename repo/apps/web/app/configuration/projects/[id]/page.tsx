'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { useConfirm } from '@/components/confirm-dialog';
import { api } from '@/lib/api';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const confirm = useConfirm();
  const [item, setItem] = useState<any>();
  const [templates, setTemplates] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [p, t] = await Promise.all([api(`/projects/${id}`), api('/directory-templates')]);
      setItem(p);
      setTemplates(t);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load project');
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
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
    await api(`/projects/${id}/apply-template/${templateId}`, { method: 'POST' });
    await load();
    setMessage('Template applied and VPS folders synchronised.');
  };

  const updateSection = async (section: any) => {
    try {
      await api(`/project-sections/${section.id}`, { method: 'PATCH', body: JSON.stringify(section) });
      setMessage(`Saved ${section.name} and ensured its VPS folder exists.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update section');
    }
  };

  const syncStorage = async () => {
    try {
      const result = await api(`/storage/projects/${id}/sync`, { method: 'POST' });
      setMessage(`VPS repository synchronised: ${result.sectionsCreated} active section folders are ready.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to synchronise storage');
    }
  };

  if (!item && !error) return <Loading />;

  return (
    <>
      {item && (
        <PageHeader
          title={`${item.code} Project Registry`}
          description="Configure the project repository folders and routing rules without modifying application code."
        />
      )}
      {error && <div className="notice error">{error}</div>}
      {item && (
        <>
          <form className="form-card" onSubmit={save}>
            <section className="form-section">
              <h2>Project identity</h2>
              <div className="form-grid three">
                <div className="field">
                  <label>Code</label>
                  <input value={item.code} onChange={(e) => setItem({ ...item, code: e.target.value })} />
                </div>
                <div className="field">
                  <label>Name</label>
                  <input value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} />
                </div>
                <div className="field">
                  <label>Status</label>
                  <select value={item.status} onChange={(e) => setItem({ ...item, status: e.target.value })}>
                    <option>ACTIVE</option>
                    <option>INACTIVE</option>
                    <option>ARCHIVED</option>
                  </select>
                </div>
                <div className="field full">
                  <label>Description</label>
                  <textarea value={item.description || ''} onChange={(e) => setItem({ ...item, description: e.target.value })} />
                </div>
              </div>
            </section>
            <section className="form-section">
              <h2>VPS repository configuration</h2>
              <p>The root below is relative to the mounted storage volume. The application never hard-codes a server path for an individual project.</p>
              <div className="form-grid">
                <div className="field full">
                  <label>Project repository root folder</label>
                  <input
                    className="mono"
                    value={item.repositoryRootPath || ''}
                    onChange={(e) => setItem({ ...item, repositoryRootPath: e.target.value })}
                  />
                  <small>Effective location: storage/repository/{item.repositoryRootPath || item.code}</small>
                </div>
              </div>
            </section>
            {message && <div className="notice success">{message}</div>}
            <div className="form-actions">
              <button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save project'}</button>
              <button type="button" className="button" onClick={syncStorage}>Synchronise VPS folders</button>
              <Link className="button" href={`/repository/explorer?projectId=${id}`}>Open repository explorer</Link>
            </div>
          </form>
          <div className="grid two" style={{ marginTop: 18 }}>
            <div className="panel">
              <div className="panel-header"><h2>Apply directory template</h2></div>
              <div className="panel-body">
                <div className="card-list">
                  {templates.map((template) => (
                    <button
                      type="button"
                      className={`select-card ${item.directoryTemplateId === template.id ? 'active' : ''}`}
                      key={template.id}
                      onClick={() => applyTemplate(template.id)}
                    >
                      <strong>{template.name}</strong>
                      <span>{template.sections.length} configured sections {template.isDefault ? '· Default' : ''}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="detail-card">
              <h2>Project state</h2>
              <dl className="detail-list">
                <dt>Status</dt><dd><StatusBadge value={item.status} /></dd>
                <dt>Documents</dt><dd>{item._count.documents}</dd>
                <dt>Imports</dt><dd>{item._count.importJobs}</dd>
                <dt>Template</dt><dd>{item.directoryTemplate?.name || 'Custom'}</dd>
                <dt>Storage</dt><dd>VPS local filesystem</dd>
              </dl>
            </div>
          </div>
          <div className="panel" style={{ marginTop: 18 }}>
            <div className="panel-header">
              <h2>Configured repository sections</h2>
              <span className="secondary-text">Rename, reorder, change key/path, or deactivate. Saving an inactive section renumbers remaining active sections automatically.</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order</th><th>Key</th><th>Name</th><th>Code</th><th>VPS relative folder</th><th>Active</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...(item.sections ?? [])]
                    .sort((a: any, b: any) => a.position - b.position)
                    .map((section: any) => (
                    <tr key={section.id} style={section.active === false ? { opacity: 0.65 } : undefined}>
                      <td>
                        <input
                          style={{ width: 65 }}
                          type="number"
                          min={1}
                          value={section.position}
                          onChange={(e) => {
                            const sections = item.sections.map((row: any) => (
                              row.id === section.id ? { ...row, position: Number(e.target.value) } : row
                            ));
                            setItem({ ...item, sections });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className="mono"
                          style={{ width: 140 }}
                          value={section.sectionKey}
                          onChange={(e) => {
                            const sections = item.sections.map((row: any) => (
                              row.id === section.id ? { ...row, sectionKey: e.target.value } : row
                            ));
                            setItem({ ...item, sections });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          value={section.name}
                          onChange={(e) => {
                            const sections = item.sections.map((row: any) => (
                              row.id === section.id ? { ...row, name: e.target.value } : row
                            ));
                            setItem({ ...item, sections });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          style={{ width: 75 }}
                          value={section.code}
                          onChange={(e) => {
                            const sections = item.sections.map((row: any) => (
                              row.id === section.id ? { ...row, code: e.target.value } : row
                            ));
                            setItem({ ...item, sections });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className="mono"
                          value={section.relativePath || section.name}
                          onChange={(e) => {
                            const sections = item.sections.map((row: any) => (
                              row.id === section.id ? { ...row, relativePath: e.target.value } : row
                            ));
                            setItem({ ...item, sections });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={section.active !== false}
                          onChange={(e) => {
                            const sections = item.sections.map((row: any) => (
                              row.id === section.id ? { ...row, active: e.target.checked } : row
                            ));
                            setItem({ ...item, sections });
                          }}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button small"
                          onClick={() => updateSection(
                            item.sections.find((row: any) => row.id === section.id) ?? section,
                          )}
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
