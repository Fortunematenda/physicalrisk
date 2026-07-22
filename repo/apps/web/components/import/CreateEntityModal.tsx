'use client';

import { FormEvent, ReactNode, useEffect, useId, useRef } from 'react';

interface CreateEntityModalProps {
  title: string;
  submitLabel: string;
  saving?: boolean;
  error?: string;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  children: ReactNode;
  width?: 'sm' | 'md';
}

export function CreateEntityModal({
  title,
  submitLabel,
  saving = false,
  error,
  onSubmit,
  onCancel,
  children,
  width = 'sm',
}: CreateEntityModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const nodes = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((node) => !node.hasAttribute('disabled'));
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [onCancel, saving]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (!saving && event.target === event.currentTarget) onCancel();
    }}>
      <div
        ref={dialogRef}
        className={`modal create-entity-modal ${width === 'md' ? 'modal-md' : 'modal-sm'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <form onSubmit={onSubmit}>
          <div className="modal-header">
            <h3 id={titleId}>{title}</h3>
          </div>
          <div className="modal-body">
            {children}
            {error ? <div className="notice error" role="alert">{error}</div> : null}
          </div>
          <div className="modal-footer">
            <button type="button" className="button" onClick={onCancel} disabled={saving}>Cancel</button>
            <button type="submit" className="button primary" disabled={saving}>
              {saving ? 'Creating…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
