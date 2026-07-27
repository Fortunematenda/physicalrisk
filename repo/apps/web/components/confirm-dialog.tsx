'use client';

import * as AlertDialog from '@radix-ui/react-alert-dialog';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

function normalizeOptions(options: ConfirmOptions | string): ConfirmOptions {
  if (typeof options === 'string') return { message: options };
  return options;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);
  pendingRef.current = pending;

  const settle = useCallback((result: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    setPending(null);
    current.resolve(result);
  }, []);

  const confirm = useCallback((options: ConfirmOptions | string) => {
    return new Promise<boolean>((resolve) => {
      const next = {
        ...normalizeOptions(options),
        resolve,
      };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  const tone = pending?.tone ?? 'danger';
  const title = pending?.title ?? (tone === 'danger' ? 'Confirm action' : 'Please confirm');
  const confirmLabel = pending?.confirmLabel ?? (tone === 'danger' ? 'Delete' : 'Confirm');
  const cancelLabel = pending?.cancelLabel ?? 'Cancel';

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <AlertDialog.Root
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="modal-backdrop confirm-dialog-overlay" />
          <AlertDialog.Content className="modal modal-sm confirm-dialog-content">
            <div className="modal-header">
              <AlertDialog.Title asChild>
                <h3>{title}</h3>
              </AlertDialog.Title>
            </div>
            <div className="modal-body">
              <AlertDialog.Description asChild>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{pending?.message ?? ''}</p>
              </AlertDialog.Description>
            </div>
            <div className="modal-footer">
              <AlertDialog.Cancel asChild>
                <button type="button" className="button" onClick={() => settle(false)}>
                  {cancelLabel}
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  className={`button primary${tone === 'danger' ? ' danger' : ''}`}
                  onClick={() => settle(true)}
                >
                  {confirmLabel}
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return context.confirm;
}
