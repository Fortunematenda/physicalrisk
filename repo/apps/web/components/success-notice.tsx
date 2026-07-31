'use client';

import { useEffect, useState, type CSSProperties } from 'react';

const DEFAULT_MS = 4000;

type SuccessNoticeProps = {
  message?: string | null;
  /** Clears parent state after dismiss (optional). */
  onDismiss?: () => void;
  durationMs?: number;
  className?: string;
  style?: CSSProperties;
};

/** Success banner that auto-hides after a few seconds. */
export function SuccessNotice({
  message,
  onDismiss,
  durationMs = DEFAULT_MS,
  className = 'notice success',
  style,
}: SuccessNoticeProps) {
  const [shown, setShown] = useState(message ?? '');

  useEffect(() => {
    if (!message) {
      setShown('');
      return;
    }
    setShown(message);
    const timer = window.setTimeout(() => {
      setShown('');
      onDismiss?.();
    }, durationMs);
    return () => window.clearTimeout(timer);
    // Intentionally omit onDismiss — parents often pass inline lambdas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, durationMs]);

  if (!shown) return null;
  return (
    <div className={className} style={style} role="status">
      {shown}
    </div>
  );
}
