'use client';

import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/api-error';
import { CreateEntityModal } from './CreateEntityModal';

export interface DirectoryTemplateRecord {
  id: string;
  code: string;
  name: string;
  isDefault?: boolean;
  sections?: Array<{ id?: string; name: string; code: string; sectionKey: string; position: number }>;
}

interface CreateDirectoryTemplateModalProps {
  onCreated: (item: DirectoryTemplateRecord) => void;
  onCancel: () => void;
}

export function CreateDirectoryTemplateModal({ onCreated, onCancel }: CreateDirectoryTemplateModalProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedName || !trimmedCode) {
      setFieldError('Template name and code are required.');
      return;
    }
    setFieldError('');
    setError('');
    setSaving(true);
    try {
      const created = await api<DirectoryTemplateRecord>('/directory-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmedName,
          code: trimmedCode,
          description: description.trim() || undefined,
          isDefault,
          sections: [
            { name: '01 Governance', code: 'GOV', sectionKey: 'GOVERNANCE', slug: '01-governance', position: 1 },
            { name: '02 Technical', code: 'TEC', sectionKey: 'TECHNICAL', slug: '02-technical', position: 2 },
          ],
        }),
      });
      onCreated(created);
    } catch (caught) {
      setError(getErrorMessage(caught, 'Unable to create directory template.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <CreateEntityModal
      title="Add New Directory Template"
      submitLabel="Create Template"
      saving={saving}
      error={error}
      onSubmit={submit}
      onCancel={onCancel}
      width="md"
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="create-template-name">Template name <em>*</em></label>
          <input
            id="create-template-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={saving}
          />
          {fieldError ? <div className="field-error" role="alert">{fieldError}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="create-template-code">Template code <em>*</em></label>
          <input
            id="create-template-code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="STANDARD"
            disabled={saving}
          />
        </div>
        <div className="field full">
          <label htmlFor="create-template-description">Description</label>
          <textarea
            id="create-template-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={saving}
          />
        </div>
        <div className="field">
          <label htmlFor="create-template-default">
            <input
              id="create-template-default"
              type="checkbox"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
              disabled={saving}
            />{' '}
            Set as default template
          </label>
        </div>
        <p className="secondary-text" style={{ gridColumn: '1 / -1', margin: 0 }}>
          Starts with Governance and Technical modules. You can add more on Directory Templates.
        </p>
      </div>
    </CreateEntityModal>
  );
}
