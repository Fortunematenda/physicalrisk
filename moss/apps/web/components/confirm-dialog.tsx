'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export type ConfirmOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive actions (delete) use brand danger styling. */
  variant?: 'default' | 'destructive';
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

type Pending = {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

/**
 * App-wide replacement for window.confirm / native browser alerts.
 * Use: const confirm = useConfirm(); const ok = await confirm({ ... })
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const close = useCallback((value: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    setPending(null);
    current.resolve(value);
  }, []);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      // Resolve any previous dialog as cancelled if a new one opens.
      if (pendingRef.current) pendingRef.current.resolve(false);
      const next = { options, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);
  const options = pending?.options;
  const open = Boolean(pending);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          // Only treat dismiss (overlay / Escape) as cancel.
          // Action/Cancel buttons call close() themselves first.
          if (!next) close(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title || 'Please confirm'}</AlertDialogTitle>
            <AlertDialogDescription>{options?.description || ''}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={(event) => {
                event.preventDefault();
                close(false);
              }}
            >
              {options?.cancelLabel || 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={options?.variant || 'default'}
              onClick={(event) => {
                event.preventDefault();
                close(true);
              }}
            >
              {options?.confirmLabel || 'Continue'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return ctx;
}
