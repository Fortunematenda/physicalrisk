'use client';

import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { ApiError, getErrorMessage } from '@/lib/api-error';
import { CreateEntityModal } from './CreateEntityModal';

export interface SourceSystemRecord {
  id: string;
  name: string;
  code: string;
  type?: string;
  description?: string | null;
  active: boolean;
}

interface CreateSourceSystemModalProps {
  onCreated: (item: SourceSystemRecord) => void;
  onCancel: () => void;
}

export function CreateSourceSystemModal({ onCreated, onCancel }: CreateSourceSystemModalProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [sourceCategory, setSourceCategory] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFieldError('Enter a source system name.');
      return;
    }
    setFieldError('');
    setError('');
    setSaving(true);
    try {
      const created = await api<SourceSystemRecord>('/source-systems', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmed,
          code: code.trim() || undefined,
          description: description.trim() || undefined,
          type: sourceCategory.trim() || undefined,
          active,
          origin: 'IMPORT_DOCUMENT',
        }),
      });
      onCreated(created);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'SOURCE_SYSTEM_ALREADY_EXISTS') {
        setError(`${caught.message} You can select the existing source instead.`);
      } else {
        setError(getErrorMessage(caught, 'Unable to create source system.'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <CreateEntityModal
      title="Add New Source System"
      submitLabel="Create Source System"
      saving={saving}
      error={error}
      onSubmit={submit}
      onCancel={onCancel}
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="create-source-name">Name <em>*</em></label>
          {fieldError ? (
            <input
              id="create-source-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. ChatGPT"
              aria-invalid="true"
              disabled={saving}
            />
          ) : (
            <input
              id="create-source-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. ChatGPT"
              aria-invalid="false"
              disabled={saving}
            />
          )}
          {fieldError ? <div className="field-error" role="alert">{fieldError}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="create-source-code">Code</label>
          <input
            id="create-source-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Optional — generated from name when blank"
            disabled={saving}
          />
        </div>
        <div className="field">
          <label htmlFor="create-source-category">Source category</label>
          <input
            id="create-source-category"
            value={sourceCategory}
            onChange={(event) => setSourceCategory(event.target.value)}
            placeholder="e.g. AI_EXPORT"
            disabled={saving}
          />
        </div>
        <div className="field full">
          <label htmlFor="create-source-description">Description</label>
          <textarea
            id="create-source-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={saving}
          />
        </div>
        <div className="field">
          <label htmlFor="create-source-active">
            <input
              id="create-source-active"
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              disabled={saving}
            />{' '}
            Active
          </label>
        </div>
      </div>
    </CreateEntityModal>
  );
}
