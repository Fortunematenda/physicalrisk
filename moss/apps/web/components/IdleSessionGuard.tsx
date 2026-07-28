'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_IDLE_MINUTES = 30;
const DEFAULT_WARN_SECONDS = 120;

function idleMsFromEnv() {
  const raw = Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES || DEFAULT_IDLE_MINUTES);
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_IDLE_MINUTES;
  return Math.round(minutes * 60 * 1000);
}

type Props = {
  enabled: boolean;
  onTimeout: () => void;
};

export function IdleSessionGuard({ enabled, onTimeout }: Props) {
  const idleMs = idleMsFromEnv();
  const warnMs = Math.min(DEFAULT_WARN_SECONDS * 1000, Math.max(30_000, Math.floor(idleMs * 0.1)));
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActive = useRef(Date.now());
  const warned = useRef(false);
  const fired = useRef(false);

  const bump = useCallback(() => {
    lastActive.current = Date.now();
    warned.current = false;
    fired.current = false;
    setSecondsLeft(null);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setSecondsLeft(null);
      return;
    }

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'wheel',
      'focus',
    ];
    events.forEach((name) => window.addEventListener(name, bump, { passive: true }));

    const tick = window.setInterval(() => {
      const elapsed = Date.now() - lastActive.current;
      const remaining = idleMs - elapsed;
      if (remaining <= 0) {
        if (!fired.current) {
          fired.current = true;
          setSecondsLeft(null);
          onTimeout();
        }
        return;
      }
      if (remaining <= warnMs) {
        warned.current = true;
        setSecondsLeft(Math.ceil(remaining / 1000));
      } else if (warned.current) {
        warned.current = false;
        setSecondsLeft(null);
      }
    }, 1000);

    return () => {
      events.forEach((name) => window.removeEventListener(name, bump));
      window.clearInterval(tick);
    };
  }, [enabled, idleMs, warnMs, bump, onTimeout]);

  if (!enabled || secondsLeft == null) return null;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label="Session timeout warning"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 10000,
        maxWidth: 360,
        padding: '14px 16px',
        borderRadius: 12,
        border: '1px solid #fecaca',
        background: '#fff',
        boxShadow: '0 12px 40px rgba(15, 23, 42, 0.18)',
        color: '#0f172a',
        fontFamily: 'inherit',
      }}
    >
      <strong style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>
        Session expiring
      </strong>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b', lineHeight: 1.45 }}>
        You have been inactive. You will be signed out in{' '}
        <strong style={{ color: '#b91c1c' }}>{secondsLeft}s</strong> unless you continue.
      </p>
      <button
        type="button"
        onClick={bump}
        style={{
          minHeight: 36,
          padding: '0 14px',
          border: 0,
          borderRadius: 8,
          background: '#2563eb',
          color: '#fff',
          font: 'inherit',
          fontSize: 13,
          fontWeight: 650,
          cursor: 'pointer',
        }}
      >
        Stay signed in
      </button>
    </div>
  );
}
