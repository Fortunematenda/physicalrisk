'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
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

type ProjectOption = {
  id: string;
  code: string;
  name: string;
  sections?: Array<{ position: number }>;
};

interface CreateRepositorySectionModalProps {
  projectId?: string;
  projects?: ProjectOption[];
  nextPosition?: number;
  onCreated: (item: RepositorySectionRecord) => void;
  onCancel: () => void;
}

function slugifyPath(value: string) {
  return value.trim().replace(/[\\/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function CreateRepositorySectionModal({
  projectId: initialProjectId = '',
  projects = [],
  nextPosition: initialNextPosition = 1,
  onCreated,
  onCancel,
}: CreateRepositorySectionModalProps) {
  const [projectId, setProjectId] = useState(initialProjectId);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');

  useEffect(() => {
    setProjectId(initialProjectId);
  }, [initialProjectId]);

  const suggestedPath = useMemo(() => slugifyPath(name), [name]);

  const nextPosition = useMemo(() => {
    if (initialProjectId && initialProjectId === projectId) return initialNextPosition;
    const selected = projects.find((project) => project.id === projectId);
    const positions = (selected?.sections ?? []).map((section) => section.position || 0);
    if (!positions.length) return 1;
    return Math.max(...positions) + 1;
  }, [projects, projectId, initialProjectId, initialNextPosition]);

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
          relativePath: suggestedPath,
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
        {projects.length > 0 ? (
          <div className="field full">
            <label htmlFor="create-section-project">Project <em>*</em></label>
            <select
              id="create-section-project"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              disabled={saving || Boolean(initialProjectId)}
              required
            >
              <option value="">Select a project…</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} — {project.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="create-section-name">Section name <em>*</em></label>
          <input
            id="create-section-name"
            value={name}
            onChange={(event) => {
              const next = event.target.value;
              setName(next);
              if (!code.trim()) {
                const words = next.trim().split(/\s+/).filter(Boolean);
                const generated = words.length >= 3
                  ? words.map((word) => word[0] ?? '').join('').toUpperCase().slice(0, 6)
                  : next.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
                if (generated) setCode(generated);
              }
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
          <small>Auto-populated as the next available order ({nextPosition}).</small>
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
