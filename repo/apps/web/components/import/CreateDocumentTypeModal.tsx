'use client';

import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { ApiError, getErrorMessage } from '@/lib/api-error';
import { CreateEntityModal } from './CreateEntityModal';

export interface DocumentTypeRecord {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  active: boolean;
}

interface CreateDocumentTypeModalProps {
  onCreated: (item: DocumentTypeRecord) => void;
  onCancel: () => void;
}

export function CreateDocumentTypeModal({ onCreated, onCancel }: CreateDocumentTypeModalProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFieldError('Enter a document type name.');
      return;
    }
    setFieldError('');
    setError('');
    setSaving(true);
    try {
      const created = await api<DocumentTypeRecord>('/document-types', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmed,
          code: code.trim() || undefined,
          description: description.trim() || undefined,
          active,
          origin: 'IMPORT_DOCUMENT',
        }),
      });
      onCreated(created);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'DOCUMENT_TYPE_ALREADY_EXISTS' && caught.details?.existingId) {
        setError(`${caught.message} You can select the existing type instead.`);
      } else {
        setError(getErrorMessage(caught, 'Unable to create document type.'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <CreateEntityModal
      title="Add New Document Type"
      submitLabel="Create Document Type"
      saving={saving}
      error={error}
      onSubmit={submit}
      onCancel={onCancel}
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="create-document-type-name">Name <em>*</em></label>
          {fieldError ? (
            <input
              id="create-document-type-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Security Architecture"
              aria-invalid="true"
              disabled={saving}
            />
          ) : (
            <input
              id="create-document-type-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Security Architecture"
              aria-invalid="false"
              disabled={saving}
            />
          )}
          {fieldError ? <div className="field-error" role="alert">{fieldError}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="create-document-type-code">Code</label>
          <input
            id="create-document-type-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Optional — generated from name when blank"
            disabled={saving}
          />
        </div>
        <div className="field full">
          <label htmlFor="create-document-type-description">Description</label>
          <textarea
            id="create-document-type-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={saving}
          />
        </div>
        <div className="field">
          <label htmlFor="create-document-type-active">
            <input
              id="create-document-type-active"
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
