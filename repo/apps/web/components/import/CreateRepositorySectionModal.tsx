'use client';

import { FormEvent, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { ApiError, getErrorMessage } from '@/lib/api-error';
import { CreateEntityModal } from './CreateEntityModal';

export interface RepositorySectionRecord {
  id: string;
  sectionKey: string;
  name: string;
  code: string;
  slug?: string;
  position: number;
  active: boolean;
  relativePath: string;
}

interface CreateRepositorySectionModalProps {
  projectId: string;
  nextPosition?: number;
  onCreated: (item: RepositorySectionRecord) => void;
  onCancel: () => void;
}

function slugifyPath(value: string) {
  return value.trim().replace(/[\\/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function CreateRepositorySectionModal({
  projectId,
  nextPosition = 1,
  onCreated,
  onCancel,
}: CreateRepositorySectionModalProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [relativePath, setRelativePath] = useState('');
  const [pathTouched, setPathTouched] = useState(false);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');

  const suggestedPath = useMemo(() => slugifyPath(name), [name]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFieldError('Enter a repository section name.');
      return;
    }
    if (!projectId) {
      setError('Select a project before adding a repository section.');
      return;
    }
    setFieldError('');
    setError('');
    setSaving(true);
    try {
      const created = await api<RepositorySectionRecord>(`/projects/${projectId}/sections`, {
        method: 'POST',
        body: JSON.stringify({
          name: trimmedName,
          code: code.trim() || undefined,
          relativePath: (relativePath.trim() || suggestedPath),
          position: nextPosition,
          active,
          description: description.trim() || undefined,
          origin: 'IMPORT_DOCUMENT',
        }),
      });
      onCreated(created);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'REPOSITORY_MODULE_ALREADY_EXISTS') {
        setError(`${caught.message} You can select the existing section instead.`);
      } else {
        setError(getErrorMessage(caught, 'Unable to create repository section.'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <CreateEntityModal
      title="Add New Repository Section"
      submitLabel="Create Repository Section"
      saving={saving}
      error={error}
      onSubmit={submit}
      onCancel={onCancel}
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="create-section-name">Section name <em>*</em></label>
          <input
            id="create-section-name"
            value={name}
            onChange={(event) => {
              const next = event.target.value;
              setName(next);
              if (!pathTouched) setRelativePath(slugifyPath(next));
            }}
            placeholder="e.g. Security Architecture"
            title="Section name"
            disabled={saving}
          />
          {fieldError ? <div className="field-error" role="alert">{fieldError}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="create-section-code">Section code</label>
          <input
            id="create-section-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Optional — generated from name when blank"
            title="Section code"
            disabled={saving}
          />
        </div>
        <div className="field full">
          <label htmlFor="create-section-path">Relative folder path</label>
          <input
            id="create-section-path"
            className="mono"
            value={relativePath}
            onChange={(event) => {
              setPathTouched(true);
              setRelativePath(event.target.value);
            }}
            placeholder="Generated from name when blank"
            title="Relative folder path"
            disabled={saving}
          />
          <small>Created under the selected project’s configured repository directory.</small>
        </div>
        <div className="field full">
          <label htmlFor="create-section-description">Description</label>
          <textarea
            id="create-section-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional description"
            title="Description"
            disabled={saving}
          />
        </div>
        <div className="field">
          <label htmlFor="create-section-order">Display order</label>
          <input
            id="create-section-order"
            value={String(nextPosition)}
            title="Display order"
            placeholder="Display order"
            disabled
            readOnly
          />
        </div>
        <div className="field">
          <label htmlFor="create-section-active">
            <input
              id="create-section-active"
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              title="Active"
              disabled={saving}
            />{' '}
            Active
          </label>
        </div>
      </div>
    </CreateEntityModal>
  );
}
