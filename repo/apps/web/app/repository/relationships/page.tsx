'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, GitBranch, Link2, RefreshCw, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { api, formatDate } from '@/lib/api';
import styles from './Relationships.module.css';

const RELATIONSHIP_TYPES = [
  'RELATED_TO',
  'SUPERSEDES',
  'DEPENDS_ON',
  'SUPPORTS',
  'PARENT_OF',
  'CHILD_OF',
  'REFERENCES',
  'IMPLEMENTS',
] as const;

type DocumentRow = {
  id: string;
  code: string;
  title: string;
  project?: { id: string; code: string; name: string };
};

type ProjectRow = { id: string; code: string; name: string };

type RelationshipRow = {
  id: string;
  type: string;
  description?: string | null;
  createdAt: string;
  createdBy?: { name?: string } | null;
  fromDocument: DocumentRow;
  toDocument: DocumentRow;
};

export default function RelationshipsPage() {
  const router = useRouter();
  const [items, setItems] = useState<RelationshipRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [projectId, setProjectId] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({
    fromDocumentId: '',
    toDocumentId: '',
    type: 'RELATED_TO',
    description: '',
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [rels, docs, projectList] = await Promise.all([
        api<RelationshipRow[]>(projectId ? `/relationships?projectId=${projectId}` : '/relationships'),
        api<DocumentRow[]>(projectId ? `/documents?projectId=${projectId}` : '/documents'),
        api<ProjectRow[]>('/projects').catch(() => [] as ProjectRow[]),
      ]);
      setItems(rels);
      setDocuments(docs);
      setProjects(projectList);
      setForm((current) => ({
        ...current,
        fromDocumentId: current.fromDocumentId && docs.some((doc) => doc.id === current.fromDocumentId)
          ? current.fromDocumentId
          : (docs[0]?.id ?? ''),
        toDocumentId: current.toDocumentId && docs.some((doc) => doc.id === current.toDocumentId)
          ? current.toDocumentId
          : (docs.find((doc) => doc.id !== (current.fromDocumentId || docs[0]?.id))?.id ?? docs[1]?.id ?? ''),
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load relationships');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [projectId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== 'ALL' && item.type !== typeFilter) return false;
      if (!needle) return true;
      const haystack = [
        item.fromDocument.code,
        item.fromDocument.title,
        item.toDocument.code,
        item.toDocument.title,
        item.type,
        item.description,
        item.fromDocument.project?.code,
        item.toDocument.project?.code,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, typeFilter, query]);

  const stats = useMemo(() => {
    const linked = new Set<string>();
    for (const item of items) {
      linked.add(item.fromDocument.id);
      linked.add(item.toDocument.id);
    }
    const typesUsed = new Set(items.map((item) => item.type));
    return {
      total: items.length,
      linked: linked.size,
      types: typesUsed.size,
      shown: filtered.length,
    };
  }, [items, filtered.length]);

  const fromOptions = documents;
  const toOptions = documents.filter((doc) => doc.id !== form.fromDocumentId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!form.fromDocumentId || !form.toDocumentId) {
      setError('Select both a from and to document.');
      return;
    }
    if (form.fromDocumentId === form.toDocumentId) {
      setError('A document cannot be related to itself.');
      return;
    }
    setSaving(true);
    try {
      await api('/relationships', {
        method: 'POST',
        body: JSON.stringify({
          fromDocumentId: form.fromDocumentId,
          toDocumentId: form.toDocumentId,
          type: form.type,
          description: form.description.trim() || undefined,
        }),
      });
      setMessage('Relationship saved.');
      setForm((current) => ({ ...current, description: '' }));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save relationship');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: RelationshipRow) => {
    const confirmed = window.confirm(
      `Remove relationship ${item.fromDocument.code} → ${item.toDocument.code} (${item.type})?`,
    );
    if (!confirmed) return;
    setDeletingId(item.id);
    setError('');
    setMessage('');
    try {
      await api(`/relationships/${item.id}`, { method: 'DELETE' });
      setMessage('Relationship removed.');
      setItems((current) => current.filter((row) => row.id !== item.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to remove relationship');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Document Relationships"
        description="Create and maintain controlled links between approved documents. Relationships stay independent of folder paths."
        action={{ label: 'Master Document Index', href: '/repository/index' }}
      />

      {message ? <div className="notice success">{message}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconTotal}`}><Link2 size={18} /></div>
          <div>
            <span>Relationships</span>
            <strong>{stats.total}</strong>
            <small>Controlled document links</small>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconLinked}`}><GitBranch size={18} /></div>
          <div>
            <span>Linked documents</span>
            <strong>{stats.linked}</strong>
            <small>Unique documents in use</small>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconTypes}`}><ArrowRight size={18} /></div>
          <div>
            <span>Relationship types</span>
            <strong>{stats.types}</strong>
            <small>Active link categories</small>
          </div>
        </div>
      </div>

      <div className={styles.layout}>
        <form className={styles.createCard} onSubmit={submit}>
          <div className={styles.createHead}>
            <h2>Create relationship</h2>
            <p>Link two documents with a controlled relationship type. Existing pairs of the same type are updated.</p>
          </div>

          <div className={styles.createBody}>
            <div className="field">
              <label htmlFor="rel-from">From document <em>*</em></label>
              <select
                id="rel-from"
                required
                value={form.fromDocumentId}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  fromDocumentId: event.target.value,
                  toDocumentId: current.toDocumentId === event.target.value ? '' : current.toDocumentId,
                }))}
                disabled={documents.length === 0}
              >
                <option value="">Select document</option>
                {fromOptions.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.code} — {doc.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="rel-type">Relationship type <em>*</em></label>
              <select
                id="rel-type"
                value={form.type}
                onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
              >
                {RELATIONSHIP_TYPES.map((type) => (
                  <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </div>

            <div className={styles.arrowHint} aria-hidden="true">
              <ArrowRight size={16} />
            </div>

            <div className="field">
              <label htmlFor="rel-to">To document <em>*</em></label>
              <select
                id="rel-to"
                required
                value={form.toDocumentId}
                onChange={(event) => setForm((current) => ({ ...current, toDocumentId: event.target.value }))}
                disabled={toOptions.length === 0}
              >
                <option value="">Select document</option>
                {toOptions.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.code} — {doc.title}
                  </option>
                ))}
              </select>
            </div>

            <div className={`field ${styles.full}`}>
              <label htmlFor="rel-description">Description</label>
              <textarea
                id="rel-description"
                rows={4}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                className={styles.description}
                placeholder="Optional note about why these documents are linked"
              />
            </div>
          </div>

          <div className={styles.createActions}>
            <button
              type="submit"
              className="button primary"
              disabled={saving || documents.length < 2}
            >
              {saving ? 'Saving…' : 'Save relationship'}
            </button>
            {documents.length < 2 ? (
              <span className="secondary-text">Import at least two documents to create links.</span>
            ) : null}
          </div>
        </form>

        <div className={`panel ${styles.registerPanel}`}>
          <div className={styles.toolbar}>
            <select
              className={styles.select}
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              aria-label="Filter by project"
              title="Filter by project"
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} — {project.name}
                </option>
              ))}
            </select>

            <select
              className={styles.select}
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              aria-label="Filter by relationship type"
              title="Filter by relationship type"
            >
              <option value="ALL">All types</option>
              {RELATIONSHIP_TYPES.map((type) => (
                <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>
              ))}
            </select>

            <div className={styles.searchWrap}>
              <Search size={15} className={styles.searchIcon} />
              <input
                className={styles.search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search documents, type or description"
                aria-label="Search relationships"
              />
            </div>

            <button
              type="button"
              className={`button small ${styles.refresh}`}
              onClick={() => void load()}
              disabled={loading}
              aria-label="Refresh relationships"
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
                title="No relationships found"
                text={items.length === 0
                  ? 'Create the first controlled link between two approved documents.'
                  : 'No relationships match the current filters.'}
              />
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>From</th>
                    <th>Type</th>
                    <th>To</th>
                    <th>Created</th>
                    <th className={styles.actionsHeading}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link className={`primary-text mono ${styles.docLink}`} href={`/documents/${item.fromDocument.id}`}>
                          {item.fromDocument.code}
                        </Link>
                        <div className={styles.title}>{item.fromDocument.title}</div>
                        {item.fromDocument.project?.code ? (
                          <div className="secondary-text">{item.fromDocument.project.code}</div>
                        ) : null}
                      </td>
                      <td>
                        <div className={styles.typeRow}>
                          <span className={styles.typeBadge}>{item.type.replaceAll('_', ' ')}</span>
                          <ArrowRight size={14} className={styles.typeArrow} />
                        </div>
                        {item.description ? <div className={styles.descriptionText}>{item.description}</div> : null}
                      </td>
                      <td>
                        <Link className={`primary-text mono ${styles.docLink}`} href={`/documents/${item.toDocument.id}`}>
                          {item.toDocument.code}
                        </Link>
                        <div className={styles.title}>{item.toDocument.title}</div>
                        {item.toDocument.project?.code ? (
                          <div className="secondary-text">{item.toDocument.project.code}</div>
                        ) : null}
                      </td>
                      <td>
                        <div>{formatDate(item.createdAt)}</div>
                        {item.createdBy?.name ? (
                          <div className="secondary-text">{item.createdBy.name}</div>
                        ) : null}
                      </td>
                      <td className={styles.actionsCell}>
                        <button
                          type="button"
                          className={`button small ${styles.viewButton}`}
                          onClick={() => router.push(`/documents/${item.fromDocument.id}`)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className={`button small danger ${styles.deleteButton}`}
                          disabled={deletingId === item.id}
                          onClick={() => void remove(item)}
                        >
                          <Trash2 size={13} />
                          {deletingId === item.id ? '…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
