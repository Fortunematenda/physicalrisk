'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { FolderTree, LayoutTemplate, RefreshCw, Search, Star } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { api } from '@/lib/api';
import styles from '../Configuration.module.css';

const DEFAULT_SECTIONS_JSON = `[
  { "name": "01 Governance", "code": "GOV", "sectionKey": "governance", "slug": "01-governance", "position": 1 },
  { "name": "02 Technical", "code": "TEC", "sectionKey": "technical", "slug": "02-technical", "position": 2 }
]`;

type TemplateSection = {
  id?: string;
  name: string;
  code: string;
  sectionKey?: string;
  slug?: string;
  position: number;
};

type TemplateRow = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isDefault?: boolean;
  sections: TemplateSection[];
};

export default function TemplatesPage() {
  const [items, setItems] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
    isDefault: false,
    sections: DEFAULT_SECTIONS_JSON,
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await api<TemplateRow[]>('/directory-templates'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
      const haystack = [
        item.code,
        item.name,
        item.description,
        ...(item.sections ?? []).flatMap((section) => [section.name, section.code, section.sectionKey]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, query]);

  const stats = useMemo(() => {
    const defaults = items.filter((item) => item.isDefault).length;
    const sections = items.reduce((total, item) => total + (item.sections?.length ?? 0), 0);
    return { total: items.length, defaults, sections, shown: filtered.length };
  }, [items, filtered.length]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const sections = JSON.parse(form.sections);
      if (!Array.isArray(sections)) throw new Error('Sections JSON must be an array');
      await api('/directory-templates', {
        method: 'POST',
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          isDefault: form.isDefault,
          sections,
        }),
      });
      setMessage('Directory template created.');
      setForm({
        code: '',
        name: '',
        description: '',
        isDefault: false,
        sections: DEFAULT_SECTIONS_JSON,
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Directory Templates"
        description="Maintain one standard default directory and create controlled exceptions only where a project has a genuine business need."
        action={{ label: 'Project Registry', href: '/configuration/projects' }}
      />

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconBlue}`}><LayoutTemplate size={18} /></div>
          <div>
            <span>Templates</span>
            <strong>{stats.total}</strong>
            <small>Reusable directory blueprints</small>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconGreen}`}><Star size={18} /></div>
          <div>
            <span>Default</span>
            <strong>{stats.defaults}</strong>
            <small>Applied to new projects</small>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconOrange}`}><FolderTree size={18} /></div>
          <div>
            <span>Sections</span>
            <strong>{stats.sections}</strong>
            <small>Across all templates</small>
          </div>
        </div>
      </div>

      <div className={styles.layout}>
        <form className={styles.createCard} onSubmit={submit}>
          <div className={styles.createHead}>
            <h2>Create template</h2>
            <p>Define the ordered repository sections that will be provisioned when a project uses this template.</p>
          </div>
          <div className={styles.createBody}>
            <div className="field">
              <label htmlFor="template-code">Code <em>*</em></label>
              <input
                id="template-code"
                required
                value={form.code}
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                placeholder="STANDARD"
              />
            </div>
            <div className="field">
              <label htmlFor="template-name">Name <em>*</em></label>
              <input
                id="template-name"
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className={`field ${styles.full}`}>
              <label htmlFor="template-description">Description</label>
              <textarea
                id="template-description"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                className={styles.textarea}
              />
            </div>
            <div className={`field ${styles.full}`}>
              <label htmlFor="template-sections">Sections JSON <em>*</em></label>
              <textarea
                id="template-sections"
                required
                className={styles.textareaTall}
                value={form.sections}
                onChange={(event) => setForm((current) => ({ ...current, sections: event.target.value }))}
              />
              <small>Array of objects with name, code, sectionKey, slug and position.</small>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(event) => setForm((current) => ({ ...current, isDefault: event.target.checked }))}
              />
              Set as default template
            </label>
          </div>
          <div className={styles.createActions}>
            <button type="submit" className="button primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create template'}
            </button>
          </div>
        </form>

        <div className={styles.panelCard}>
          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <Search size={15} className={styles.searchIcon} />
              <input
                className={styles.search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search templates or sections"
                aria-label="Search templates"
              />
            </div>
            <button
              type="button"
              className={`button small ${styles.refresh}`}
              onClick={() => void load()}
              disabled={loading}
              aria-label="Refresh templates"
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? styles.spinning : undefined} />
              Refresh
            </button>
            <span className={styles.count}>{stats.shown} shown</span>
          </div>

          {loading ? (
            <div className={styles.stateWrap}><Loading /></div>
          ) : filtered.length === 0 ? (
            <div className={styles.stateWrap}>
              <EmptyState
                title="No templates found"
                text={items.length === 0
                  ? 'Create the first directory template for project provisioning.'
                  : 'No templates match the current search.'}
              />
            </div>
          ) : (
            <div className={styles.templateList}>
              {filtered.map((item) => (
                <article key={item.id} className={styles.templateCard}>
                  <div className={styles.templateTop}>
                    <div>
                      <strong className="primary-text">{item.name}</strong>
                      <div className={`mono ${styles.templateMeta}`}>{item.code}</div>
                    </div>
                    {item.isDefault ? <StatusBadge value="DEFAULT" /> : null}
                  </div>
                  {item.description ? <p className="secondary-text">{item.description}</p> : null}
                  <ol className={styles.sectionTree}>
                    {[...(item.sections ?? [])]
                      .sort((a, b) => a.position - b.position)
                      .map((section) => (
                        <li key={`${item.id}-${section.code}-${section.position}`}>
                          <span className={styles.position}>{section.position}</span>
                          <span className={styles.sectionName}>
                            {section.name}
                            <span className={styles.sectionKey}>{section.sectionKey || section.code}</span>
                          </span>
                          <span className="mono">{section.code}</span>
                        </li>
                      ))}
                  </ol>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
