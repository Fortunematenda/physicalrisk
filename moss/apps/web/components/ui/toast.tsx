'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ToastVariant = 'success' | 'info' | 'warning' | 'error';

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Auto-dismiss ms. Errors default longer; pass 0 to keep until dismissed. */
  duration?: number;
  action?: ToastAction;
  /** Deduplicate: replacing an existing toast with the same id. */
  id?: string;
};

type ToastItem = ToastInput & {
  id: string;
  variant: ToastVariant;
  createdAt: number;
};

type ToastContextValue = {
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 3500,
  info: 4000,
  warning: 5500,
  error: 0, // persist until dismissed / action
};

function variantStyles(variant: ToastVariant) {
  switch (variant) {
    case 'success':
      return {
        wrap: 'border-moss-success/30 bg-white text-slate-900 shadow-lg',
        icon: 'text-moss-success',
        Icon: CheckCircle2,
      };
    case 'warning':
      return {
        wrap: 'border-moss-warning/40 bg-white text-slate-900 shadow-lg',
        icon: 'text-amber-600',
        Icon: AlertTriangle,
      };
    case 'error':
      return {
        wrap: 'border-moss-danger/35 bg-white text-slate-900 shadow-lg',
        icon: 'text-moss-danger',
        Icon: AlertCircle,
      };
    default:
      return {
        wrap: 'border-moss-info/30 bg-white text-slate-900 shadow-lg',
        icon: 'text-moss-info',
        Icon: Info,
      };
  }
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const styles = variantStyles(item.variant);
  const Icon = styles.Icon;

  useEffect(() => {
    const duration = item.duration ?? DEFAULT_DURATION[item.variant];
    if (!duration || duration <= 0) return;
    const t = window.setTimeout(() => onDismiss(item.id), duration);
    return () => window.clearTimeout(t);
  }, [item.id, item.duration, item.variant, onDismiss]);

  return (
    <div
      role={item.variant === 'error' || item.variant === 'warning' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex w-full max-w-sm gap-3 rounded-xl border p-3.5 sm:p-4',
        styles.wrap,
      )}
    >
      <Icon className={cn('mt-0.5 size-5 shrink-0', styles.icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="m-0 text-sm font-semibold leading-snug text-slate-900">{item.title}</p>
        {item.description ? (
          <p className="m-0 text-sm leading-relaxed text-slate-600">{item.description}</p>
        ) : null}
        {item.action ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-8 shrink-0 whitespace-nowrap px-3"
            onClick={() => {
              item.action?.onClick();
              onDismiss(item.id);
            }}
          >
            {item.action.label}
          </Button>
        ) : null}
      </div>
      <button
        type="button"
        className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(item.id)}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const id = input.id || `toast-${Date.now()}-${++seq.current}`;
    const variant = input.variant || 'info';
    const next: ToastItem = {
      ...input,
      id,
      variant,
      createdAt: Date.now(),
    };
    setItems((prev) => {
      const withoutDup = input.id ? prev.filter((t) => t.id !== input.id) : prev;
      return [...withoutDup, next].slice(-5);
    });
    return id;
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[20000] flex flex-col items-end gap-2 p-3 sm:p-4"
        aria-live="polite"
        aria-relevant="additions text"
      >
        <div className="flex w-full max-w-sm flex-col gap-2 sm:ml-auto">
          {items.map((item) => (
            <ToastCard key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
