'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ApiError, getErrorMessage } from '@/lib/api-error';
import { CreateEntityModal } from './CreateEntityModal';

export interface ProjectRecord {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  repositoryRootPath?: string;
  directoryTemplateId?: string | null;
  sections?: Array<{
    id: string;
    sectionKey: string;
    name: string;
    code: string;
    position: number;
    active: boolean;
  }>;
}

interface CreateProjectModalProps {
  onCreated: (item: ProjectRecord) => void;
  onCancel: () => void;
}

export function CreateProjectModal({ onCreated, onCancel }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [repositoryRootPath, setRepositoryRootPath] = useState('');
  const [directoryTemplateId, setDirectoryTemplateId] = useState('');
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; isDefault?: boolean }>>([]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');

  useEffect(() => {
    api('/directory-templates')
      .then((items) => {
        setTemplates(items);
        const defaultTemplate = items.find((item: { isDefault?: boolean }) => item.isDefault) ?? items[0];
        if (defaultTemplate) setDirectoryTemplateId(defaultTemplate.id);
      })
      .catch(() => undefined);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedName || !trimmedCode) {
      setFieldError('Project name and code are required.');
      return;
    }
    setFieldError('');
    setError('');
    setSaving(true);
    try {
      const created = await api<ProjectRecord>('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmedName,
          code: trimmedCode,
          description: description.trim() || undefined,
          repositoryRootPath: repositoryRootPath.trim() || trimmedCode,
          directoryTemplateId: directoryTemplateId || undefined,
          status: active ? 'ACTIVE' : 'INACTIVE',
          origin: 'IMPORT_DOCUMENT',
        }),
      });
      onCreated(created);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'PROJECT_ALREADY_EXISTS') {
        setError(`${caught.message} You can select the existing project instead.`);
      } else {
        setError(getErrorMessage(caught, 'Unable to create project.'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <CreateEntityModal
      title="Add New Project"
      submitLabel="Create Project"
      saving={saving}
      error={error}
      onSubmit={submit}
      onCancel={onCancel}
      width="md"
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="create-project-name">Project name <em>*</em></label>
          <input
            id="create-project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={saving}
          />
        </div>
        <div className="field">
          <label htmlFor="create-project-code">Project code <em>*</em></label>
          <input
            id="create-project-code"
            value={code}
            onChange={(event) => {
              const next = event.target.value.toUpperCase();
              setCode(next);
              if (!repositoryRootPath || repositoryRootPath === code) setRepositoryRootPath(next);
            }}
            placeholder="PRJ"
            disabled={saving}
          />
        </div>
        <div className="field full">
          <label htmlFor="create-project-root">Repository folder name</label>
          <input
            id="create-project-root"
            className="mono"
            value={repositoryRootPath}
            onChange={(event) => setRepositoryRootPath(event.target.value)}
            placeholder="Defaults to project code"
            disabled={saving}
          />
          <small>Relative to the server repository volume. The standard directory template is applied automatically.</small>
        </div>
        <div className="field full">
          <label htmlFor="create-project-template">Directory template</label>
          <select
            id="create-project-template"
            value={directoryTemplateId}
            onChange={(event) => setDirectoryTemplateId(event.target.value)}
            disabled={saving || !templates.length}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}{template.isDefault ? ' (Default)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field full">
          <label htmlFor="create-project-description">Description</label>
          <textarea
            id="create-project-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={saving}
          />
        </div>
        <div className="field">
          <label htmlFor="create-project-active">
            <input
              id="create-project-active"
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              disabled={saving}
            />{' '}
            Active
          </label>
        </div>
        {fieldError ? <div className="field-error" role="alert">{fieldError}</div> : null}
      </div>
    </CreateEntityModal>
  );
}
