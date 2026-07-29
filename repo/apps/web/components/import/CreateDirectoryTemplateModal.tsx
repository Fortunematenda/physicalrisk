'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/api-error';
import { deriveSectionFields, syncLinkedSectionFields } from '@/lib/section-fields';
import styles from '@/app/configuration/Configuration.module.css';
import { CreateEntityModal } from './CreateEntityModal';

export interface DirectoryTemplateRecord {
  id: string;
  code: string;
  name: string;
  isDefault?: boolean;
  sections?: Array<{ id?: string; name: string; code: string; sectionKey: string; position: number; slug?: string }>;
}

type TemplateSection = {
  name: string;
  code: string;
  sectionKey: string;
  slug?: string;
  position: number;
};

interface CreateDirectoryTemplateModalProps {
  onCreated: (item: DirectoryTemplateRecord) => void;
  onCancel: () => void;
}

const FALLBACK_MODULES: TemplateSection[] = [
  ['PRODUCT_ARCHITECTURE', 'PA', 'Product Architecture'],
  ['ENTERPRISE_ARCHITECTURE', 'EA', 'Enterprise Architecture'],
  ['FUNCTIONAL_SPECIFICATIONS', 'FS', 'Functional Specifications'],
  ['TECHNICAL_SPECIFICATIONS', 'TS', 'Technical Specifications'],
  ['API_SPECIFICATIONS', 'API', 'API Specifications'],
  ['DATA_MODELS', 'DM', 'Data Models'],
  ['BUSINESS_RULES', 'BR', 'Business Rules'],
  ['GOVERNANCE_STANDARDS', 'GS', 'Governance Standards'],
  ['OPERATING_PROCEDURES', 'OP', 'Operating Procedures'],
  ['DEVELOPER_PACKS', 'DP', 'Developer Packs'],
  ['RESEARCH_LIBRARY', 'RL', 'Research Library'],
  ['MARKETING_ASSETS', 'MA', 'Marketing Assets'],
  ['ARTICLES', 'AR', 'Articles'],
  ['TEMPLATES', 'TP', 'Templates'],
  ['DECISIONS', 'DC', 'Decisions'],
  ['MEETING_RECORDS', 'MR', 'Meeting Records'],
  ['RELEASE_NOTES', 'RN', 'Release Notes'],
].map(([sectionKey, code, name], index) => ({
  sectionKey,
  code,
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
  position: index + 1,
}));

function withPositions(sections: TemplateSection[]): TemplateSection[] {
  return sections.map((section, index) => ({ ...section, position: index + 1 }));
}

function catalogFromTemplates(templates: DirectoryTemplateRecord[]): TemplateSection[] {
  const map = new Map<string, TemplateSection>();
  for (const template of templates) {
    for (const section of template.sections ?? []) {
      const key = section.sectionKey || section.code;
      if (!key || map.has(key)) continue;
      map.set(key, {
        name: section.name,
        code: section.code,
        sectionKey: section.sectionKey || key,
        slug: section.slug,
        position: section.position,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function CreateDirectoryTemplateModal({ onCreated, onCancel }: CreateDirectoryTemplateModalProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [sections, setSections] = useState<TemplateSection[]>([]);
  const [catalog, setCatalog] = useState<TemplateSection[]>(FALLBACK_MODULES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [showAddModule, setShowAddModule] = useState(false);
  const [moduleDraft, setModuleDraft] = useState(deriveSectionFields(''));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const templates = await api<DirectoryTemplateRecord[]>('/directory-templates');
        if (cancelled) return;
        const fromTemplates = catalogFromTemplates(templates);
        setCatalog(fromTemplates.length ? fromTemplates : FALLBACK_MODULES);
      } catch {
        if (!cancelled) setCatalog(FALLBACK_MODULES);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => {
    const map = new Map<string, TemplateSection>();
    for (const module of catalog) map.set(module.sectionKey, module);
    for (const module of sections) map.set(module.sectionKey, module);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog, sections]);

  const selectedKeys = useMemo(
    () => new Set(sections.map((section) => section.sectionKey)),
    [sections],
  );

  const toggleModule = (module: TemplateSection) => {
    setSections((current) => {
      const exists = current.some((section) => section.sectionKey === module.sectionKey);
      const next = exists
        ? current.filter((section) => section.sectionKey !== module.sectionKey)
        : [...current, { ...module, position: current.length + 1 }];
      return withPositions(next);
    });
  };

  const removeModule = (sectionKey: string) => {
    setSections((current) => withPositions(current.filter((section) => section.sectionKey !== sectionKey)));
  };

  const addCustomModule = () => {
    const derived = deriveSectionFields(moduleDraft.name || moduleDraft.sectionKey || moduleDraft.code);
    const nextSection: TemplateSection = {
      name: (moduleDraft.name || derived.name).trim(),
      code: (moduleDraft.code || derived.code).trim().toUpperCase(),
      sectionKey: (moduleDraft.sectionKey || derived.sectionKey).trim().toUpperCase(),
      slug: derived.slug,
      position: sections.length + 1,
    };
    if (!nextSection.name || !nextSection.code || !nextSection.sectionKey) {
      setFieldError('Module name, key, and code are required.');
      return;
    }
    setCatalog((current) => (
      current.some((item) => item.sectionKey === nextSection.sectionKey)
        ? current
        : [...current, nextSection]
    ));
    setSections((current) => {
      const without = current.filter((section) => section.sectionKey !== nextSection.sectionKey);
      return withPositions([...without, nextSection]);
    });
    setModuleDraft(deriveSectionFields(''));
    setShowAddModule(false);
    setFieldError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedName || !trimmedCode) {
      setFieldError('Template name and code are required.');
      return;
    }
    if (!sections.length) {
      setFieldError('Select at least one module / section.');
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
          sections: withPositions(sections),
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

        <div className={`field ${styles.full}`}>
          <label>Modules / sections <em>*</em></label>
          <div className={styles.modulePicker}>
            <div className={styles.modulePickerHead}>
              <span className="secondary-text">{sections.length} selected</span>
              <button
                type="button"
                className="button small"
                disabled={saving}
                onClick={() => {
                  setShowAddModule((open) => !open);
                  setFieldError('');
                }}
              >
                <Plus size={14} /> Add new
              </button>
            </div>

            {showAddModule ? (
              <div className="form-grid" style={{ gap: 10 }}>
                <div className="field">
                  <label htmlFor="create-module-name">Module name <em>*</em></label>
                  <input
                    id="create-module-name"
                    value={moduleDraft.name}
                    disabled={saving}
                    onChange={(event) => setModuleDraft((current) => syncLinkedSectionFields(current, 'name', event.target.value))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="create-module-key">Key <em>*</em></label>
                  <input
                    id="create-module-key"
                    className="mono"
                    value={moduleDraft.sectionKey}
                    disabled={saving}
                    onChange={(event) => setModuleDraft((current) => syncLinkedSectionFields(current, 'sectionKey', event.target.value))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="create-module-code">Code <em>*</em></label>
                  <input
                    id="create-module-code"
                    value={moduleDraft.code}
                    disabled={saving}
                    onChange={(event) => setModuleDraft((current) => syncLinkedSectionFields(current, 'code', event.target.value))}
                  />
                </div>
                <div className="field" style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
                  <button type="button" className="button primary small" disabled={saving} onClick={addCustomModule}>
                    Add module
                  </button>
                  <button
                    type="button"
                    className="button small"
                    disabled={saving}
                    onClick={() => {
                      setShowAddModule(false);
                      setModuleDraft(deriveSectionFields(''));
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            <div className={styles.moduleOptions}>
              {options.length === 0 ? (
                <p className="secondary-text">No modules yet. Use Add new to create the first one.</p>
              ) : (
                options.map((module) => {
                  const checked = selectedKeys.has(module.sectionKey);
                  return (
                    <label key={module.sectionKey} className={styles.moduleOption}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={saving}
                        onChange={() => toggleModule(module)}
                      />
                      <span>
                        <strong>{module.name}</strong>
                        <small className="mono">{module.sectionKey} · {module.code}</small>
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            {sections.length > 0 ? (
              <ol className={styles.sectionTree}>
                {withPositions(sections).map((section) => (
                  <li key={section.sectionKey}>
                    <span className={styles.position}>{section.position}</span>
                    <span className={styles.sectionName}>
                      {section.name}
                      <span className={styles.sectionKey}>{section.sectionKey} · {section.code}</span>
                    </span>
                    <button
                      type="button"
                      className="button small"
                      disabled={saving}
                      title="Remove"
                      onClick={() => removeModule(section.sectionKey)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
          <small>Select modules for this template. Order follows selection order.</small>
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

        {fieldError ? <div className="field-error" role="alert" style={{ gridColumn: '1 / -1' }}>{fieldError}</div> : null}
      </div>
    </CreateEntityModal>
  );
}
