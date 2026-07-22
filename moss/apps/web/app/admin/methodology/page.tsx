'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Calculator,
  ClipboardList,
  Scale,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import {
  IconBookOpen,
  IconDownload,
  IconExternalLink,
  IconEye,
  IconFileText,
  IconFilter,
  IconGripVertical,
  IconHistory2,
  IconImport,
  IconPencil,
  IconPlus,
  IconRotateCcw,
  IconSearch,
  IconSlidersHorizontal,
} from '../../../components/NavIcons';
import { StatCard } from '@/components/dashboard/stat-card';
import { apiFetch } from '../../../lib/api';

type Tab = 'sections' | 'calibration' | 'scoring' | 'library';

type OptionForm = { id?: string; label: string; riskScore: string };
type QuestionForm = {
  id?: string;
  code: string;
  category: string;
  text: string;
  guidance: string;
  evidenceHint: string;
  weight: string;
  required: boolean;
  sortOrder: string;
  options: OptionForm[];
};

type InputForm = {
  id?: string;
  code: string;
  label: string;
  guidance: string;
  valueType: string;
  unit: string;
  required: boolean;
  sortOrder: string;
  optionsText: string;
};

type Question = {
  id: string;
  code: string;
  category: string;
  text: string;
  guidance?: string | null;
  evidenceHint?: string | null;
  weight: number | string;
  required: boolean;
  sortOrder: number;
  options: Array<{ id: string; label: string; riskScore: number | string }>;
};

type InputDef = {
  id: string;
  code: string;
  label: string;
  guidance?: string | null;
  valueType: string;
  unit?: string | null;
  required: boolean;
  sortOrder: number;
  options?: string[] | null;
};

const VALUE_TYPES = ['TEXT', 'NUMBER', 'CURRENCY', 'PERCENT', 'BOOLEAN', 'SELECT', 'DATE'];

const SECTION_TONES = ['violet', 'blue', 'amber', 'green', 'red', 'slate', 'cyan'] as const;

const emptyQuestion = (): QuestionForm => ({
  code: '',
  category: '',
  text: '',
  guidance: '',
  evidenceHint: '',
  weight: '1',
  required: true,
  sortOrder: '',
  options: [
    { label: '', riskScore: '0' },
    { label: '', riskScore: '25' },
    { label: '', riskScore: '50' },
    { label: '', riskScore: '75' },
  ],
});

const emptyInput = (): InputForm => ({
  code: '',
  label: '',
  guidance: '',
  valueType: 'NUMBER',
  unit: '',
  required: true,
  sortOrder: '',
  optionsText: '',
});

function suggestNextCode(rows: Array<{ code: string }>, prefix: string) {
  const nums = rows
    .map((r) => {
      const match = String(r.code).match(new RegExp(`^${prefix}(\\d+)$`, 'i'));
      return match ? Number(match[1]) : 0;
    })
    .filter((n) => n > 0);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${next}`;
}

export default function MethodologyPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('sections');
  const [editingQuestion, setEditingQuestion] = useState<QuestionForm | null>(null);
  const [editingInput, setEditingInput] = useState<InputForm | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  const version = data?.versions?.[0];

  const load = useCallback(() => {
    setLoading(true);
    return apiFetch('/questionnaires/SCLI')
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const questions: Question[] = version?.questions || [];
  const inputs: InputDef[] = version?.inputDefinitions || [];
  const assumptions = version?.assumptions || [];

  const sections = useMemo(() => {
    const map = new Map<string, { name: string; questions: Question[]; weight: number; complete: number }>();
    for (const q of questions) {
      const name = q.category || 'Uncategorised';
      const row = map.get(name) || { name, questions: [], weight: 0, complete: 0 };
      row.questions.push(q);
      row.weight += Number(q.weight) || 0;
      if ((q.options || []).length >= 2) row.complete += 1;
      map.set(name, row);
    }
    const totalWeight = [...map.values()].reduce((s, r) => s + r.weight, 0) || 1;
    return [...map.values()]
      .sort((a, b) => b.weight - a.weight)
      .map((row, index) => {
        const weightPct = (row.weight / totalWeight) * 100;
        const progress = row.questions.length
          ? Math.round((row.complete / row.questions.length) * 100)
          : 0;
        return {
          ...row,
          order: index + 1,
          weightPct,
          progress,
          kind: weightPct >= 12 ? 'Core' : 'Supporting',
          tone: SECTION_TONES[index % SECTION_TONES.length],
          enabled: true,
        };
      });
  }, [questions]);

  const totalWeightPct = useMemo(() => {
    const sum = sections.reduce((s, row) => s + row.weightPct, 0);
    return Math.round(sum * 10) / 10;
  }, [sections]);

  const categories = useMemo(() => sections.map((s) => s.name), [sections]);

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections.filter((s) => {
      if (q && !(s.name.toLowerCase().includes(q) || s.questions.some((qq) => qq.text.toLowerCase().includes(q)))) {
        return false;
      }
      if (statusFilter === 'enabled' && !s.enabled) return false;
      if (statusFilter === 'disabled' && s.enabled) return false;
      if (categoryFilter && s.name !== categoryFilter) return false;
      if (typeFilter && s.kind.toLowerCase() !== typeFilter) return false;
      return true;
    });
  }, [sections, query, statusFilter, categoryFilter, typeFilter]);

  const filteredQuestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return questions.filter((row) => {
      if (selectedSection && row.category !== selectedSection) return false;
      if (categoryFilter && row.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        row.code.toLowerCase().includes(q)
        || row.category.toLowerCase().includes(q)
        || row.text.toLowerCase().includes(q)
      );
    });
  }, [questions, query, selectedSection, categoryFilter]);

  const filteredInputs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inputs;
    return inputs.filter(
      (row) =>
        row.code.toLowerCase().includes(q)
        || row.label.toLowerCase().includes(q)
        || String(row.valueType).toLowerCase().includes(q),
    );
  }, [inputs, query]);

  function clearFilters() {
    setQuery('');
    setStatusFilter('');
    setCategoryFilter('');
    setTypeFilter('');
    setSelectedSection(null);
  }

  function openNewQuestion(category?: string) {
    const nextCode = suggestNextCode(questions, 'Q');
    setEditingQuestion({
      ...emptyQuestion(),
      code: nextCode,
      category: category || categories[0] || '',
      sortOrder: String(questions.length + 1),
    });
    setTab('library');
    setError('');
    setNotice('');
  }

  function openEditQuestion(row: Question) {
    setEditingQuestion({
      id: row.id,
      code: row.code,
      category: row.category,
      text: row.text,
      guidance: row.guidance || '',
      evidenceHint: row.evidenceHint || '',
      weight: String(Number(row.weight)),
      required: !!row.required,
      sortOrder: String(row.sortOrder),
      options: (row.options || []).map((o) => ({
        id: o.id,
        label: o.label,
        riskScore: String(Number(o.riskScore)),
      })),
    });
    setTab('library');
    setError('');
    setNotice('');
  }

  function openNewInput() {
    const nextCode = suggestNextCode(inputs, 'C');
    setEditingInput({
      ...emptyInput(),
      code: nextCode,
      sortOrder: String(inputs.length + 1),
    });
    setTab('calibration');
    setError('');
    setNotice('');
  }

  function openEditInput(row: InputDef) {
    const options = Array.isArray(row.options) ? row.options : [];
    setEditingInput({
      id: row.id,
      code: row.code,
      label: row.label,
      guidance: row.guidance || '',
      valueType: row.valueType,
      unit: row.unit || '',
      required: !!row.required,
      sortOrder: String(row.sortOrder),
      optionsText: options.join('\n'),
    });
    setError('');
    setNotice('');
  }

  async function saveQuestion(e: FormEvent) {
    e.preventDefault();
    if (!version || !editingQuestion) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        code: editingQuestion.code.trim(),
        category: editingQuestion.category.trim(),
        text: editingQuestion.text.trim(),
        guidance: editingQuestion.guidance.trim() || undefined,
        evidenceHint: editingQuestion.evidenceHint.trim() || undefined,
        weight: Number(editingQuestion.weight),
        required: editingQuestion.required,
        sortOrder: editingQuestion.sortOrder ? Number(editingQuestion.sortOrder) : undefined,
        options: editingQuestion.options
          .filter((o) => o.label.trim())
          .map((o, index) => ({
            id: o.id,
            label: o.label.trim(),
            riskScore: Number(o.riskScore),
            sortOrder: index + 1,
          })),
      };
      if (editingQuestion.id) {
        await apiFetch(`/questionnaires/questions/${editingQuestion.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setNotice(`Updated question ${payload.code}.`);
      } else {
        await apiFetch(`/questionnaires/versions/${version.id}/questions`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setNotice(`Created question ${payload.code}.`);
      }
      setEditingQuestion(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save question.');
    } finally {
      setSaving(false);
    }
  }

  async function saveInput(e: FormEvent) {
    e.preventDefault();
    if (!version || !editingInput) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const options = editingInput.optionsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const payload = {
        code: editingInput.code.trim(),
        label: editingInput.label.trim(),
        guidance: editingInput.guidance.trim() || undefined,
        valueType: editingInput.valueType,
        unit: editingInput.unit.trim() || undefined,
        required: editingInput.required,
        sortOrder: editingInput.sortOrder ? Number(editingInput.sortOrder) : undefined,
        options: editingInput.valueType === 'SELECT' ? options : undefined,
      };
      if (editingInput.id) {
        await apiFetch(`/questionnaires/inputs/${editingInput.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setNotice(`Updated calibration ${payload.code}.`);
      } else {
        await apiFetch(`/questionnaires/versions/${version.id}/inputs`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setNotice(`Created calibration ${payload.code}.`);
      }
      setEditingInput(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save input.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteQuestion(row: Question) {
    if (!window.confirm(`Delete question ${row.code}? This cannot be undone.`)) return;
    setError('');
    setNotice('');
    try {
      await apiFetch(`/questionnaires/questions/${row.id}`, { method: 'DELETE' });
      setNotice(`Deleted ${row.code}.`);
      if (editingQuestion?.id === row.id) setEditingQuestion(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to delete question.');
    }
  }

  async function deleteInput(row: InputDef) {
    if (!window.confirm(`Delete calibration input ${row.code}? This cannot be undone.`)) return;
    setError('');
    setNotice('');
    try {
      await apiFetch(`/questionnaires/inputs/${row.id}`, { method: 'DELETE' });
      setNotice(`Deleted ${row.code}.`);
      if (editingInput?.id === row.id) setEditingInput(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to delete input.');
    }
  }

  function exportQuestionnaire() {
    const payload = {
      code: data?.code,
      name: data?.name,
      version: version?.version,
      sections: sections.map((s) => ({
        name: s.name,
        kind: s.kind,
        weightPct: s.weightPct,
        questions: s.questions.map((q) => ({
          code: q.code,
          text: q.text,
          weight: Number(q.weight),
          options: q.options,
        })),
      })),
      calibration: inputs,
      assumptions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moss-scli-v${version?.version || 'export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const lastUpdated = version?.publishedAt || version?.updatedAt || version?.createdAt;

  return (
    <AuthGate>
      <Shell
        title="Questionnaire & Calibration"
        eyebrow="Methodology"
        subtitle="Manage the SCLI questionnaire, calibration inputs and scoring model."
        searchPlaceholder="Search methodology…"
        searchValue={query}
        onSearch={setQuery}
      >
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        {loading || !version ? (
          <div className="loading-screen">Loading methodology…</div>
        ) : (
          <>
            <div className="org2-actions-row">
              <button type="button" className="btn secondary org2-export-btn" onClick={() => setTab('library')}>
                <IconEye />
                Preview Questionnaire
              </button>
              <button type="button" className="btn org2-add-btn" onClick={() => openNewQuestion()}>
                <IconPlus />
                Add Section / Question
              </button>
            </div>

            <div className="meth2-tabs">
              <button type="button" className={tab === 'sections' ? 'active' : ''} onClick={() => { setTab('sections'); clearFilters(); }}>
                Questionnaire Sections
              </button>
              <button type="button" className={tab === 'calibration' ? 'active' : ''} onClick={() => { setTab('calibration'); setQuery(''); }}>
                Calibration Inputs ({inputs.length})
              </button>
              <button type="button" className={tab === 'scoring' ? 'active' : ''} onClick={() => setTab('scoring')}>
                Scoring Model
              </button>
              <button type="button" className={tab === 'library' ? 'active' : ''} onClick={() => { setTab('library'); setQuery(''); }}>
                Question Library
              </button>
            </div>

            <div className="meth2-stats-row">
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <StatCard
                  icon={SlidersHorizontal}
                  title="Sections"
                  value={sections.length}
                  description="Enabled"
                  tone="violet"
                />
                <StatCard
                  icon={ClipboardList}
                  title="Questions"
                  value={questions.length}
                  description="Enabled"
                  tone="blue"
                />
                <StatCard
                  icon={Calculator}
                  title="Calibration Inputs"
                  value={inputs.length}
                  description="All Enabled"
                  tone="amber"
                />
                <StatCard
                  icon={Scale}
                  title="Total Weights"
                  value={`${totalWeightPct}%`}
                  description={Math.abs(totalWeightPct - 100) < 0.5 ? 'Balanced' : 'Needs balance'}
                  tone="green"
                />
                <StatCard
                  icon={TrendingUp}
                  title="Methodology Version"
                  value={version.version}
                  description="Current"
                  tone="red"
                />
              </div>
              <button type="button" className="btn secondary meth2-versions-btn" onClick={() => setNotice(`Current published version: ${version.version} (${version.status}).`)}>
                Manage Versions
                <IconExternalLink />
              </button>
            </div>

            <div className="queue2-layout">
              <div className="meth2-main">
                {(tab === 'sections' || tab === 'library' || tab === 'calibration') && (
                  <section className="dash2-card org2-filters-card">
                    <div className="assess2-filters meth2-filters">
                      <label className="org2-filter-search">
                        <IconSearch />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder={
                            tab === 'calibration'
                              ? 'Search calibration inputs…'
                              : tab === 'library'
                                ? 'Search questions…'
                                : 'Search sections by name or description…'
                          }
                          aria-label="Search"
                        />
                      </label>
                      {tab === 'sections' && (
                        <>
                          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
                            <option value="">Status (All Statuses)</option>
                            <option value="enabled">Enabled</option>
                            <option value="disabled">Disabled</option>
                          </select>
                          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Category">
                            <option value="">Category (All Categories)</option>
                            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Section type">
                            <option value="">Section Type (All Types)</option>
                            <option value="core">Core</option>
                            <option value="supporting">Supporting</option>
                          </select>
                        </>
                      )}
                      {tab === 'library' && (
                        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Category">
                          <option value="">Category (All Categories)</option>
                          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      )}
                      <button type="button" className="dash2-filter-btn" title="Filters">
                        <IconFilter />
                        Filters
                      </button>
                      <button type="button" className="dash2-filter-btn" onClick={clearFilters}>
                        <IconRotateCcw />
                        Clear
                      </button>
                    </div>
                  </section>
                )}

                {tab === 'sections' && (
                  <section className="dash2-card org2-table-card">
                    <div className="table-wrap">
                      <table className="meth2-table">
                        <thead>
                          <tr>
                            <th>Order</th>
                            <th>Section</th>
                            <th>Description</th>
                            <th>Questions</th>
                            <th>Weight</th>
                            <th>Progress</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSections.map((s) => (
                            <tr key={s.name}>
                              <td>
                                <div className="meth2-order">
                                  <IconGripVertical />
                                  <strong>{String(s.order).padStart(2, '0')}</strong>
                                </div>
                              </td>
                              <td>
                                <div className="meth2-section-cell">
                                  <span className={`meth2-section-icon tone-${s.tone}`}>
                                    <IconSlidersHorizontal />
                                  </span>
                                  <div>
                                    <strong>{s.name}</strong>
                                    <em className={`meth2-kind kind-${s.kind.toLowerCase()}`}>{s.kind}</em>
                                  </div>
                                </div>
                              </td>
                              <td className="muted">
                                {s.questions[0]?.text?.slice(0, 90) || 'Section questions and response options'}
                                {(s.questions[0]?.text?.length || 0) > 90 ? '…' : ''}
                              </td>
                              <td><strong>{s.questions.length}</strong></td>
                              <td><strong>{s.weightPct.toFixed(1)}%</strong></td>
                              <td>
                                <div className="meth2-progress">
                                  <div className="meth2-progress-bar">
                                    <span
                                      className={s.progress >= 100 ? 'ok' : 'warn'}
                                      style={{ width: `${Math.max(s.progress, 4)}%` }}
                                    />
                                  </div>
                                  <em>{s.progress}%</em>
                                </div>
                              </td>
                              <td>
                                <span className="org2-status-badge active">Enabled</span>
                              </td>
                              <td>
                                <div className="reports2-actions">
                                  <button
                                    type="button"
                                    className="reports2-icon-btn"
                                    title="View questions"
                                    onClick={() => {
                                      setSelectedSection(s.name);
                                      setCategoryFilter(s.name);
                                      setTab('library');
                                    }}
                                  >
                                    <IconEye />
                                  </button>
                                  <button
                                    type="button"
                                    className="reports2-icon-btn"
                                    title="Add question"
                                    onClick={() => openNewQuestion(s.name)}
                                  >
                                    <IconPencil />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {!filteredSections.length && (
                            <tr><td colSpan={8} className="muted">No sections match the current filters.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="org2-pagination">
                      <span>Showing 1 to {filteredSections.length} of {filteredSections.length} sections</span>
                    </div>
                  </section>
                )}

                {tab === 'calibration' && (
                  <div className="meth2-split">
                    <section className="dash2-card org2-table-card">
                      <div className="dash2-card-head" style={{ padding: '14px 16px 0' }}>
                        <div>
                          <h2>Calibration inputs</h2>
                          <p>Fields collected before the executive questionnaire</p>
                        </div>
                        <button type="button" className="btn secondary" onClick={openNewInput}>
                          <IconPlus /> Add
                        </button>
                      </div>
                      <div className="table-wrap">
                        <table className="meth2-table">
                          <thead>
                            <tr>
                              <th>Code</th>
                              <th>Label</th>
                              <th>Type</th>
                              <th>Required</th>
                              <th>Order</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {filteredInputs.map((row) => (
                              <tr key={row.id}>
                                <td><strong>{row.code}</strong></td>
                                <td>{row.label}</td>
                                <td>{row.valueType}</td>
                                <td>{row.required ? 'Yes' : 'No'}</td>
                                <td>{row.sortOrder}</td>
                                <td>
                                  <div className="reports2-actions">
                                    <button type="button" className="reports2-icon-btn" onClick={() => openEditInput(row)} title="Edit">
                                      <IconPencil />
                                    </button>
                                    <button type="button" className="reports2-icon-btn" onClick={() => void deleteInput(row)} title="Delete">
                                      <IconRotateCcw />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {!filteredInputs.length && (
                              <tr><td colSpan={6} className="muted">No calibration inputs match.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <aside className="dash2-card meth2-editor">
                      {editingInput ? (
                        <form onSubmit={saveInput}>
                          <div className="dash2-card-head">
                            <div>
                              <h2>{editingInput.id ? `Edit ${editingInput.code}` : 'New calibration input'}</h2>
                              <p>Configure the input shown in the public / internal flow</p>
                            </div>
                            <button type="button" className="btn secondary" onClick={() => setEditingInput(null)}>Close</button>
                          </div>
                          <div className="form-grid">
                            <div className="field">
                              <label>Code</label>
                              <input required value={editingInput.code} onChange={(e) => setEditingInput({ ...editingInput, code: e.target.value })} />
                            </div>
                            <div className="field">
                              <label>Value type</label>
                              <select value={editingInput.valueType} onChange={(e) => setEditingInput({ ...editingInput, valueType: e.target.value })}>
                                {VALUE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                            <div className="field" style={{ gridColumn: '1 / -1' }}>
                              <label>Label</label>
                              <input required value={editingInput.label} onChange={(e) => setEditingInput({ ...editingInput, label: e.target.value })} />
                            </div>
                            <div className="field" style={{ gridColumn: '1 / -1' }}>
                              <label>Guidance</label>
                              <textarea rows={2} value={editingInput.guidance} onChange={(e) => setEditingInput({ ...editingInput, guidance: e.target.value })} />
                            </div>
                            <div className="field">
                              <label>Unit</label>
                              <input value={editingInput.unit} onChange={(e) => setEditingInput({ ...editingInput, unit: e.target.value })} />
                            </div>
                            <div className="field">
                              <label>Sort order</label>
                              <input type="number" value={editingInput.sortOrder} onChange={(e) => setEditingInput({ ...editingInput, sortOrder: e.target.value })} />
                            </div>
                            {editingInput.valueType === 'SELECT' && (
                              <div className="field" style={{ gridColumn: '1 / -1' }}>
                                <label>Select options (one per line)</label>
                                <textarea rows={5} value={editingInput.optionsText} onChange={(e) => setEditingInput({ ...editingInput, optionsText: e.target.value })} />
                              </div>
                            )}
                            <label className="consent-check" style={{ gridColumn: '1 / -1' }}>
                              <input type="checkbox" checked={editingInput.required} onChange={(e) => setEditingInput({ ...editingInput, required: e.target.checked })} />
                              <span>Required</span>
                            </label>
                          </div>
                          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                            <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save input'}</button>
                            <button type="button" className="btn secondary" onClick={() => setEditingInput(null)}>Cancel</button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <h2>Editor</h2>
                          <p className="muted">Select a calibration field to edit, or create a new one for the intake flow.</p>
                          <button type="button" className="btn" style={{ marginTop: 12 }} onClick={openNewInput}>Create calibration input</button>
                        </>
                      )}
                    </aside>
                  </div>
                )}

                {tab === 'scoring' && (
                  <section className="dash2-card">
                    <div className="dash2-card-head">
                      <div>
                        <h2>Scoring model</h2>
                        <p>Category weight distribution and assumption constants</p>
                      </div>
                      <Link href="/admin/assumptions" className="btn secondary">
                        Open Assumptions
                        <IconExternalLink />
                      </Link>
                    </div>
                    <div className="meth2-scoring-grid">
                      {sections.map((s) => (
                        <article key={s.name} className="meth2-score-card">
                          <div className="meth2-score-top">
                            <strong>{s.name}</strong>
                            <em>{s.weightPct.toFixed(1)}%</em>
                          </div>
                          <div className="meth2-progress-bar tall">
                            <span className="ok" style={{ width: `${Math.min(s.weightPct, 100)}%` }} />
                          </div>
                          <small>{s.questions.length} questions · {s.kind}</small>
                        </article>
                      ))}
                    </div>
                    <div className="table-wrap" style={{ marginTop: 18 }}>
                      <table className="meth2-table">
                        <thead>
                          <tr>
                            <th>Assumption</th>
                            <th>Label</th>
                            <th>Value</th>
                            <th>Format</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assumptions.slice(0, 12).map((a: any) => (
                            <tr key={a.id}>
                              <td><strong>{a.code}</strong></td>
                              <td>{a.label}</td>
                              <td>{Number(a.value)}</td>
                              <td>{a.format}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {tab === 'library' && (
                  <div className="meth2-split">
                    <section className="dash2-card org2-table-card">
                      <div className="dash2-card-head" style={{ padding: '14px 16px 0' }}>
                        <div>
                          <h2>Question library</h2>
                          <p>
                            {selectedSection ? `Showing section: ${selectedSection}` : `${filteredQuestions.length} questions`}
                          </p>
                        </div>
                        <button type="button" className="btn secondary" onClick={() => openNewQuestion(selectedSection || undefined)}>
                          <IconPlus /> Add question
                        </button>
                      </div>
                      <div className="table-wrap">
                        <table className="meth2-table">
                          <thead>
                            <tr>
                              <th>Code</th>
                              <th>Category</th>
                              <th>Question</th>
                              <th>Weight</th>
                              <th>Options</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {filteredQuestions.map((q) => (
                              <tr key={q.id}>
                                <td><strong>{q.code}</strong></td>
                                <td>{q.category}</td>
                                <td>{q.text}</td>
                                <td>{Number(q.weight)}</td>
                                <td>{q.options?.length || 0}</td>
                                <td>
                                  <div className="reports2-actions">
                                    <button type="button" className="reports2-icon-btn" onClick={() => openEditQuestion(q)} title="Edit">
                                      <IconPencil />
                                    </button>
                                    <button type="button" className="reports2-icon-btn" onClick={() => void deleteQuestion(q)} title="Delete">
                                      <IconRotateCcw />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {!filteredQuestions.length && (
                              <tr><td colSpan={6} className="muted">No questions match.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <aside className="dash2-card meth2-editor">
                      {editingQuestion ? (
                        <form onSubmit={saveQuestion}>
                          <div className="dash2-card-head">
                            <div>
                              <h2>{editingQuestion.id ? `Edit ${editingQuestion.code}` : 'New question'}</h2>
                              <p>Update wording, weight and response options</p>
                            </div>
                            <button type="button" className="btn secondary" onClick={() => setEditingQuestion(null)}>Close</button>
                          </div>
                          <div className="form-grid">
                            <div className="field">
                              <label>Code</label>
                              <input required value={editingQuestion.code} onChange={(e) => setEditingQuestion({ ...editingQuestion, code: e.target.value })} />
                            </div>
                            <div className="field">
                              <label>Category / Section</label>
                              <input required list="meth-categories" value={editingQuestion.category} onChange={(e) => setEditingQuestion({ ...editingQuestion, category: e.target.value })} />
                              <datalist id="meth-categories">
                                {categories.map((c) => <option key={c} value={c} />)}
                              </datalist>
                            </div>
                            <div className="field" style={{ gridColumn: '1 / -1' }}>
                              <label>Question text</label>
                              <textarea required rows={3} value={editingQuestion.text} onChange={(e) => setEditingQuestion({ ...editingQuestion, text: e.target.value })} />
                            </div>
                            <div className="field">
                              <label>Weight</label>
                              <input required type="number" step="0.01" value={editingQuestion.weight} onChange={(e) => setEditingQuestion({ ...editingQuestion, weight: e.target.value })} />
                            </div>
                            <div className="field">
                              <label>Sort order</label>
                              <input type="number" value={editingQuestion.sortOrder} onChange={(e) => setEditingQuestion({ ...editingQuestion, sortOrder: e.target.value })} />
                            </div>
                            <div className="field" style={{ gridColumn: '1 / -1' }}>
                              <label>Guidance</label>
                              <textarea rows={2} value={editingQuestion.guidance} onChange={(e) => setEditingQuestion({ ...editingQuestion, guidance: e.target.value })} />
                            </div>
                            <div className="field" style={{ gridColumn: '1 / -1' }}>
                              <label>Evidence hint</label>
                              <textarea rows={2} value={editingQuestion.evidenceHint} onChange={(e) => setEditingQuestion({ ...editingQuestion, evidenceHint: e.target.value })} />
                            </div>
                            <label className="consent-check" style={{ gridColumn: '1 / -1' }}>
                              <input type="checkbox" checked={editingQuestion.required} onChange={(e) => setEditingQuestion({ ...editingQuestion, required: e.target.checked })} />
                              <span>Required</span>
                            </label>
                          </div>
                          <h3 style={{ marginTop: 16, marginBottom: 8, fontSize: 14 }}>Response options</h3>
                          <div className="table-wrap">
                            <table className="meth2-table">
                              <thead>
                                <tr><th>Label</th><th>Risk score</th><th /></tr>
                              </thead>
                              <tbody>
                                {editingQuestion.options.map((opt, index) => (
                                  <tr key={opt.id || index}>
                                    <td>
                                      <input
                                        required
                                        value={opt.label}
                                        onChange={(e) => {
                                          const options = [...editingQuestion.options];
                                          options[index] = { ...opt, label: e.target.value };
                                          setEditingQuestion({ ...editingQuestion, options });
                                        }}
                                      />
                                    </td>
                                    <td>
                                      <input
                                        required
                                        type="number"
                                        step="0.01"
                                        value={opt.riskScore}
                                        onChange={(e) => {
                                          const options = [...editingQuestion.options];
                                          options[index] = { ...opt, riskScore: e.target.value };
                                          setEditingQuestion({ ...editingQuestion, options });
                                        }}
                                      />
                                    </td>
                                    <td>
                                      <button
                                        type="button"
                                        className="btn secondary"
                                        onClick={() => setEditingQuestion({
                                          ...editingQuestion,
                                          options: editingQuestion.options.filter((_, i) => i !== index),
                                        })}
                                      >
                                        Remove
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <button
                            type="button"
                            className="btn secondary"
                            style={{ marginTop: 10 }}
                            onClick={() => setEditingQuestion({
                              ...editingQuestion,
                              options: [...editingQuestion.options, { label: '', riskScore: '0' }],
                            })}
                          >
                            Add option
                          </button>
                          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                            <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save question'}</button>
                            <button type="button" className="btn secondary" onClick={() => setEditingQuestion(null)}>Cancel</button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <h2>Editor</h2>
                          <p className="muted">Select a question to edit, or create a new one. Changes apply to the live methodology version.</p>
                          <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => openNewQuestion(selectedSection || undefined)}>
                            Create question
                          </button>
                        </>
                      )}
                    </aside>
                  </div>
                )}
              </div>

              <aside className="queue2-side">
                <section className="dash2-card">
                  <div className="dash2-card-head">
                    <div>
                      <h2>SCLI v{version.version} Overview</h2>
                      <p>{data?.name || 'Security Cost Leakage Index'}</p>
                    </div>
                  </div>
                  <ul className="meth2-overview">
                    <li><span>Total Sections</span><strong>{sections.length}</strong></li>
                    <li><span>Total Questions</span><strong>{questions.length}</strong></li>
                    <li><span>Calibration Inputs</span><strong>{inputs.length}</strong></li>
                    <li><span>Total Weight</span><strong>{totalWeightPct}%</strong></li>
                    <li><span>Last Updated</span><strong>{lastUpdated ? new Date(lastUpdated).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</strong></li>
                    <li><span>Status</span><strong>{version.status}</strong></li>
                  </ul>
                </section>

                <section className="dash2-card">
                  <div className="dash2-card-head">
                    <div>
                      <h2>Quick Actions</h2>
                      <p>Common methodology tasks</p>
                    </div>
                  </div>
                  <ul className="meth2-actions">
                    <li><button type="button" onClick={() => openNewQuestion()}><IconPlus /> Add New Section / Question</button></li>
                    <li><button type="button" onClick={() => setNotice('Import is not enabled in Lean MVP. Use Add question or calibration instead.')}><IconImport /> Import Questions</button></li>
                    <li><button type="button" onClick={exportQuestionnaire}><IconDownload /> Export Questionnaire</button></li>
                    <li><button type="button" onClick={() => setTab('sections')}><IconGripVertical /> Reorder Sections</button></li>
                    <li><button type="button" onClick={() => setTab('library')}><IconBookOpen /> Question Library</button></li>
                    <li><Link href="/admin/audit-logs"><IconHistory2 /> View Change History</Link></li>
                  </ul>
                </section>

                <section className="dash2-card meth2-help">
                  <div className="dash2-card-head">
                    <div>
                      <h2>Help & Guidance</h2>
                      <p>How to manage the model</p>
                    </div>
                  </div>
                  <p>
                    Sections are derived from question categories. Keep category weights balanced near 100%,
                    ensure every question has response options, and use Assumptions for leakage constants.
                  </p>
                  <Link href="/admin/assumptions" className="btn secondary">
                    <IconFileText />
                    View Documentation
                  </Link>
                </section>
              </aside>
            </div>
          </>
        )}
      </Shell>
    </AuthGate>
  );
}
