'use client';

import {
  cloneElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

type RowActionsMenuProps = {
  open: boolean;
  onClose: () => void;
  trigger: ReactElement;
  children: ReactNode;
  align?: 'start' | 'end';
  menuClassName?: string;
};

/**
 * Table row action menus that render in a portal with fixed positioning,
 * so they are never clipped by table overflow / pagination footers.
 */
export function RowActionsMenu({
  open,
  onClose,
  trigger,
  children,
  align = 'end',
  menuClassName = 'org2-menu',
}: RowActionsMenuProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }

    const update = () => {
      const triggerEl = wrapRef.current;
      if (!triggerEl) return;
      const rect = triggerEl.getBoundingClientRect();
      const menuEl = menuRef.current;
      const menuWidth = menuEl?.offsetWidth || 180;
      const menuHeight = menuEl?.offsetHeight || 0;
      let top = rect.bottom + 4;
      let left = align === 'end' ? rect.right - menuWidth : rect.left;

      if (menuHeight > 0 && top + menuHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - menuHeight - 4);
      }
      left = Math.min(Math.max(8, left), window.innerWidth - menuWidth - 8);
      setCoords({ top, left });
    };

    update();
    // Second pass after menu paints so flip/width use real dimensions.
    const raf = window.requestAnimationFrame(update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, align, children]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open, onClose]);

  const triggerNode = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<Record<string, unknown>>, {
        'aria-expanded': open,
        'aria-haspopup': 'menu',
      })
    : trigger;

  const menuStyle: CSSProperties = {
    position: 'fixed',
    top: coords?.top ?? -9999,
    left: coords?.left ?? -9999,
    right: 'auto',
    zIndex: 10000,
    visibility: coords ? 'visible' : 'hidden',
  };

  return (
    <div ref={wrapRef} className="org2-menu-wrap">
      {triggerNode}
      {mounted &&
        open &&
        createPortal(
          <div
            ref={menuRef}
            className={menuClassName}
            style={menuStyle}
            role="menu"
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}
