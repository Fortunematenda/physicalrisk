'use client';

import {
  ReactNode,
  RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './row-actions.module.css';

type Position = { top: number; left: number };

function placeMenu(anchor: HTMLElement, menu: HTMLElement): Position {
  const rect = anchor.getBoundingClientRect();
  const menuWidth = menu.offsetWidth || 168;
  const menuHeight = menu.offsetHeight || 0;
  const gap = 4;
  const viewportPadding = 8;

  let left = rect.right - menuWidth;
  left = Math.max(viewportPadding, Math.min(left, window.innerWidth - menuWidth - viewportPadding));

  let top = rect.bottom + gap;
  if (top + menuHeight > window.innerHeight - viewportPadding && rect.top - gap - menuHeight > viewportPadding) {
    top = rect.top - gap - menuHeight;
  }

  return { top, left };
}

export function RowActionsMenu({
  open,
  anchorRef,
  onClose,
  children,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !menuRef.current) return;
    const update = () => {
      if (!anchorRef.current || !menuRef.current) return;
      setPosition(placeMenu(anchorRef.current, menuRef.current));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef, children]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, anchorRef, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={menuRef}
      className={`${styles.menu} ${styles.menuFixed}`}
      role="menu"
      style={{ top: position.top, left: position.left }}
    >
      {children}
    </div>,
    document.body,
  );
}
