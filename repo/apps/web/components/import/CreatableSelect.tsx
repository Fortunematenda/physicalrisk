'use client';

import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';

export interface CreatableSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface CreatableSelectProps {
  label: string;
  name: string;
  value?: string;
  options: CreatableSelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  canCreate?: boolean;
  createLabel?: string;
  createDisabled?: boolean;
  createDisabledReason?: string;
  onChange: (value: string) => void;
  onCreateClick?: () => void;
  searchable?: boolean;
  hint?: string;
}

export function CreatableSelect({
  label,
  name,
  value = '',
  options,
  placeholder = 'Select…',
  required = false,
  disabled = false,
  loading = false,
  error,
  canCreate = false,
  createLabel = 'Add New',
  createDisabled = false,
  createDisabledReason,
  onChange,
  onCreateClick,
  searchable = true,
  hint,
}: CreatableSelectProps) {
  const listId = useId();
  const labelId = useId();
  const errorId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = useMemo(() => options.find((option) => option.value === value), [options, value]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      option.label.toLowerCase().includes(needle) ||
      option.description?.toLowerCase().includes(needle) ||
      option.value.toLowerCase().includes(needle),
    );
  }, [options, query]);

  const showCreate = Boolean(canCreate && onCreateClick);
  const itemCount = filtered.length + (showCreate ? 1 : 0);

  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    trigger.setAttribute('aria-invalid', error ? 'true' : 'false');
  }, [open, error]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      return;
    }
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      const menu = document.getElementById(listId);
      if (menu?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, listId]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const selectValue = (next: string) => {
    onChange(next);
    close();
  };

  const activateCreate = () => {
    if (!showCreate || createDisabled) return;
    setOpen(false);
    onCreateClick?.();
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % Math.max(itemCount, 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + Math.max(itemCount, 1)) % Math.max(itemCount, 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (showCreate && activeIndex === filtered.length) {
        activateCreate();
        return;
      }
      const option = filtered[activeIndex];
      if (option && !option.disabled) selectValue(option.value);
    }
  };

  return (
    <div className={`field creatable-select ${error ? 'has-error' : ''}`}>
      <label id={labelId} htmlFor={`${name}-trigger`}>
        {label}{required ? <em> *</em> : null}
      </label>
      <div className="creatable-select-control">
        <button
          id={`${name}-trigger`}
          ref={triggerRef}
          type="button"
          className="creatable-select-trigger"
          aria-haspopup="true"
          aria-expanded="false"
          aria-controls={listId}
          aria-labelledby={labelId}
          aria-invalid="false"
          aria-describedby={error ? errorId : undefined}
          disabled={disabled || loading}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={onTriggerKeyDown}
        >
          <span className={selected ? '' : 'placeholder'}>
            {loading ? 'Loading…' : selected?.label || placeholder}
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        {open && (
          <div
            id={listId}
            className="creatable-select-menu"
            tabIndex={-1}
            onKeyDown={onMenuKeyDown}
          >
            {searchable && (
              <div className="creatable-select-search">
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  placeholder="Search…"
                  aria-label={`Search ${label}`}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                />
              </div>
            )}
            <div className="creatable-select-options">
              {!filtered.length ? (
                <div className="creatable-select-empty">No matching options</div>
              ) : null}
              {filtered.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  className={`creatable-select-option ${index === activeIndex ? 'active' : ''} ${option.value === value ? 'selected' : ''}`}
                  disabled={option.disabled}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectValue(option.value)}
                >
                  <span>{option.label}</span>
                  {option.description ? <small>{option.description}</small> : null}
                </button>
              ))}
            </div>
            {showCreate && (
              <>
                <div className="creatable-select-divider" aria-hidden="true" />
                <button
                  type="button"
                  className={`creatable-select-create ${activeIndex === filtered.length ? 'active' : ''}`}
                  disabled={createDisabled}
                  title={createDisabled ? createDisabledReason : undefined}
                  onMouseEnter={() => setActiveIndex(filtered.length)}
                  onClick={activateCreate}
                >
                  <Plus size={14} aria-hidden="true" />
                  <span>{createLabel}</span>
                </button>
                {createDisabled && createDisabledReason ? (
                  <div className="creatable-select-hint">{createDisabledReason}</div>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
      {hint ? <small>{hint}</small> : null}
      {error ? <div id={errorId} className="field-error" role="alert">{error}</div> : null}
      <input type="hidden" name={name} value={value} required={required} readOnly />
    </div>
  );
}
