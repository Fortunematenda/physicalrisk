'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ApiError, getErrorMessage } from '@/lib/api-error';
import { nextProjectCode } from '@/lib/project-code';
import { CreateEntityModal } from './CreateEntityModal';
import { CreatableSelect } from './CreatableSelect';
import { CreateDirectoryTemplateModal } from './CreateDirectoryTemplateModal';

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
  const [codeTouched, setCodeTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [directoryTemplateId, setDirectoryTemplateId] = useState('');
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; isDefault?: boolean }>>([]);
  const [existingCodes, setExistingCodes] = useState<string[]>([]);
  const [projectCount, setProjectCount] = useState(0);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);

  useEffect(() => {
    void Promise.all([
      api<Array<{ id: string; name: string; isDefault?: boolean }>>('/directory-templates'),
      api<Array<{ code: string }>>('/projects'),
    ])
      .then(([templateList, projects]) => {
        setTemplates(templateList);
        const defaultTemplate = templateList.find((item) => item.isDefault) ?? templateList[0];
        if (defaultTemplate) setDirectoryTemplateId(defaultTemplate.id);
        setExistingCodes(projects.map((item) => item.code));
        setProjectCount(projects.length);
      })
      .catch(() => undefined);
  }, []);

  const onNameChange = (value: string) => {
    setName(value);
    if (!codeTouched) {
      setCode(nextProjectCode(value, existingCodes, projectCount));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedCode = (code.trim() || nextProjectCode(trimmedName, existingCodes, projectCount)).toUpperCase();
    if (!trimmedName || !trimmedCode) {
      setFieldError('Project name is required.');
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
          repositoryRootPath: trimmedName,
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
    <>
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
              onChange={(event) => onNameChange(event.target.value)}
              disabled={saving}
            />
            <small>VPS repository root folder will match this name.</small>
          </div>
          <div className="field">
            <label htmlFor="create-project-code">Project code <em>*</em></label>
            <input
              id="create-project-code"
              className="mono"
              value={code}
              onChange={(event) => {
                setCodeTouched(true);
                setCode(event.target.value.toUpperCase());
              }}
              placeholder="Auto from name"
              disabled={saving}
            />
            <small>
              Auto-generated from the name
              {projectCount >= 0 ? ` · next sequence ${projectCount + 1}` : ''}
              . 3+ words → initials; otherwise first 3 letters, plus the project number.
            </small>
          </div>
          <div className="field full">
            <CreatableSelect
              label="Directory template"
              name="directoryTemplateId"
              value={directoryTemplateId}
              options={templates.map((template) => ({
                value: template.id,
                label: `${template.name}${template.isDefault ? ' (Default)' : ''}`,
              }))}
              placeholder="Select a template…"
              canCreate
              createLabel="Add New Template"
              disabled={saving}
              onChange={setDirectoryTemplateId}
              onCreateClick={() => setShowCreateTemplate(true)}
            />
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

      {showCreateTemplate ? (
        <CreateDirectoryTemplateModal
          onCancel={() => setShowCreateTemplate(false)}
          onCreated={(created) => {
            setTemplates((current) => [...current, created]);
            setDirectoryTemplateId(created.id);
            setShowCreateTemplate(false);
          }}
        />
      ) : null}
    </>
  );
}
