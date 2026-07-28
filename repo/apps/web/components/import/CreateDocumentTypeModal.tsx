'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
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

type ProjectOption = {
  id: string;
  code: string;
  name: string;
  sections?: Array<{
    id: string;
    name: string;
    sectionKey: string;
    active?: boolean;
  }>;
};

type RoutingRuleRecord = {
  id: string;
  priority: number;
};

export type DocumentTypeCreatedMeta = {
  routingRuleCreated: boolean;
  warning?: string;
};

interface DocumentTypeCreateFormProps {
  origin?: 'IMPORT_DOCUMENT' | 'ADMIN';
  defaultProjectId?: string;
  onCreated: (item: DocumentTypeRecord, meta: DocumentTypeCreatedMeta) => void;
  onCancel?: () => void;
  /** modal = dialog; inline = form card for admin config page */
  variant?: 'modal' | 'inline';
}

function nextPriority(rules: RoutingRuleRecord[]): number {
  const used = new Set(rules.map((rule) => Number(rule.priority)).filter((n) => Number.isFinite(n)));
  let priority = 100;
  while (used.has(priority)) priority += 10;
  return priority;
}

function DocumentTypeCreateFields({
  origin = 'ADMIN',
  defaultProjectId = '',
  onCreated,
  onCancel,
  variant = 'modal',
}: DocumentTypeCreateFormProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [createRoutingRule, setCreateRoutingRule] = useState(true);
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [targetSectionKey, setTargetSectionKey] = useState('');
  const [priority, setPriority] = useState(100);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [routingError, setRoutingError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingOptions(true);
      try {
        const [projectList, rules] = await Promise.all([
          api<ProjectOption[]>('/projects'),
          api<RoutingRuleRecord[]>('/routing-rules'),
        ]);
        if (cancelled) return;
        setProjects(Array.isArray(projectList) ? projectList : []);
        setPriority(nextPriority(Array.isArray(rules) ? rules : []));
        if (defaultProjectId) setProjectId(defaultProjectId);
      } catch {
        if (!cancelled) {
          setError('Unable to load projects for routing. You can still create the document type.');
        }
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [defaultProjectId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId),
    [projectId, projects],
  );

  const sectionOptions = useMemo(() => {
    const source = selectedProject
      ? (selectedProject.sections ?? [])
      : projects.flatMap((project) => project.sections ?? []);
    const seen = new Set<string>();
    return source
      .filter((section) => section.active !== false)
      .filter((section) => !['VERSION_REGISTER', 'MASTER_DOCUMENT_INDEX'].includes(section.sectionKey))
      .filter((section) => {
        if (seen.has(section.sectionKey)) return false;
        seen.add(section.sectionKey);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, selectedProject]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFieldError('Enter a document type name.');
      return;
    }
    if (createRoutingRule && !targetSectionKey.trim()) {
      setRoutingError('Select a target repository section for the routing rule.');
      return;
    }
    setFieldError('');
    setRoutingError('');
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
          ...(origin === 'IMPORT_DOCUMENT' ? { origin: 'IMPORT_DOCUMENT' } : {}),
        }),
      });

      let routingRuleCreated = false;
      if (createRoutingRule) {
        try {
          await api('/routing-rules', {
            method: 'POST',
            body: JSON.stringify({
              name: `Route ${created.name}`,
              projectId: projectId || null,
              sourceSystemId: null,
              documentType: created.name,
              fileExtension: null,
              targetSectionKey: targetSectionKey.trim(),
              priority,
              active: true,
            }),
          });
          routingRuleCreated = true;
        } catch (caught) {
          const warning = getErrorMessage(
            caught,
            'Document type was created, but the routing rule could not be saved. Add a routing rule under Configuration → Routing Rules.',
          );
          onCreated(created, { routingRuleCreated: false, warning });
          return;
        }
      }

      onCreated(created, { routingRuleCreated });
      if (variant === 'inline') {
        setName('');
        setCode('');
        setDescription('');
        setActive(true);
        setCreateRoutingRule(true);
        setTargetSectionKey('');
        setProjectId(defaultProjectId);
        try {
          const rules = await api<RoutingRuleRecord[]>('/routing-rules');
          setPriority(nextPriority(Array.isArray(rules) ? rules : []));
        } catch {
          setPriority((current) => current + 10);
        }
      }
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

  const fields = (
    <div className="form-grid">
      <div className="field">
        <label htmlFor="create-document-type-name">Name <em>*</em></label>
        <input
          id="create-document-type-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Security Architecture"
          aria-invalid={fieldError ? 'true' : 'false'}
          disabled={saving}
        />
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
        <label htmlFor="create-document-type-active" className="checkbox">
          <input
            id="create-document-type-active"
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
            disabled={saving}
          />
          Active
        </label>
      </div>

      <div className="field full">
        <label htmlFor="create-document-type-routing" className="checkbox">
          <input
            id="create-document-type-routing"
            type="checkbox"
            checked={createRoutingRule}
            onChange={(event) => {
              setCreateRoutingRule(event.target.checked);
              setRoutingError('');
            }}
            disabled={saving || loadingOptions}
          />
          Also create a routing rule (required for Automatic import destination)
        </label>
        <p className="secondary-text" style={{ marginTop: '0.35rem' }}>
          Without a routing rule, imports using this type need a manual repository section selection.
        </p>
      </div>

      {createRoutingRule ? (
        <>
          <div className="field">
            <label htmlFor="create-document-type-project">Project scope</label>
            <select
              id="create-document-type-project"
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setTargetSectionKey('');
              }}
              disabled={saving || loadingOptions}
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} — {project.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="create-document-type-section">Target section <em>*</em></label>
            <select
              id="create-document-type-section"
              required={createRoutingRule}
              value={targetSectionKey}
              onChange={(event) => {
                setTargetSectionKey(event.target.value);
                setRoutingError('');
              }}
              disabled={saving || loadingOptions}
              aria-invalid={routingError ? 'true' : 'false'}
            >
              <option value="">{loadingOptions ? 'Loading…' : 'Select section…'}</option>
              {sectionOptions.map((section) => (
                <option key={section.sectionKey} value={section.sectionKey}>
                  {section.name}
                </option>
              ))}
            </select>
            {routingError ? <div className="field-error" role="alert">{routingError}</div> : null}
          </div>
          <div className="field">
            <label htmlFor="create-document-type-priority">Rule priority</label>
            <input
              id="create-document-type-priority"
              type="number"
              value={priority}
              onChange={(event) => setPriority(Number(event.target.value))}
              disabled={saving || loadingOptions}
            />
            <p className="secondary-text" style={{ marginTop: '0.35rem' }}>
              Lowest number wins. Must be unique across routing rules.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );

  if (variant === 'inline') {
    return (
      <form className="form-card" onSubmit={submit}>
        <div className="form-section">
          <h2>Add document type</h2>
          <p>Create the type and optionally a routing rule so imports can resolve a repository section automatically.</p>
          {fields}
        </div>
        {error ? <div className="notice error" role="alert">{error}</div> : null}
        <div className="form-actions">
          <button type="submit" className="button primary" disabled={saving}>
            {saving ? 'Creating…' : createRoutingRule ? 'Create type and routing rule' : 'Create document type'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <CreateEntityModal
      title="Add New Document Type"
      submitLabel={createRoutingRule ? 'Create type and routing rule' : 'Create Document Type'}
      saving={saving}
      error={error}
      onSubmit={submit}
      onCancel={onCancel ?? (() => undefined)}
      width="md"
    >
      {fields}
    </CreateEntityModal>
  );
}

export function CreateDocumentTypeModal({
  onCreated,
  onCancel,
  origin = 'IMPORT_DOCUMENT',
  defaultProjectId,
}: {
  onCreated: (item: DocumentTypeRecord, meta?: DocumentTypeCreatedMeta) => void;
  onCancel: () => void;
  origin?: 'IMPORT_DOCUMENT' | 'ADMIN';
  defaultProjectId?: string;
}) {
  return (
    <DocumentTypeCreateFields
      variant="modal"
      origin={origin}
      defaultProjectId={defaultProjectId}
      onCancel={onCancel}
      onCreated={onCreated}
    />
  );
}

export function DocumentTypeCreatePanel({
  onCreated,
}: {
  onCreated: (item: DocumentTypeRecord, meta: DocumentTypeCreatedMeta) => void;
}) {
  return (
    <DocumentTypeCreateFields
      variant="inline"
      origin="ADMIN"
      onCreated={onCreated}
    />
  );
}
