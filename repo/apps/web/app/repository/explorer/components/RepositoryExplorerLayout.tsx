'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PanelLeftOpen } from 'lucide-react';
import styles from '../RepositoryExplorer.module.css';

type Props = {
  treeCollapsed: boolean;
  treeWidth: number;
  onTreeWidthChange: (width: number) => void;
  onExpandTree?: () => void;
  inspectorCollapsed: boolean;
  showInspector: boolean;
  tree: ReactNode;
  main: ReactNode;
  inspector: ReactNode;
  treeSheetOpen?: boolean;
  inspectorSheetOpen?: boolean;
  onCloseTreeSheet?: () => void;
  onCloseInspectorSheet?: () => void;
};

const MIN_TREE = 240;
const MAX_TREE = 360;
const RAIL_WIDTH = 44;

export function RepositoryExplorerLayout({
  treeCollapsed,
  treeWidth,
  onTreeWidthChange,
  onExpandTree,
  inspectorCollapsed,
  showInspector,
  tree,
  main,
  inspector,
  treeSheetOpen,
  inspectorSheetOpen,
  onCloseTreeSheet,
  onCloseInspectorSheet,
}: Props) {
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.min(MAX_TREE, Math.max(MIN_TREE, event.clientX - 20));
      onTreeWidthChange(next);
    };
    const onUp = () => {
      dragging.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onTreeWidthChange]);

  const gridColumns = (() => {
    const treeCol = treeCollapsed ? `${RAIL_WIDTH}px` : `${treeWidth}px`;
    const handleCol = treeCollapsed ? '0px' : '8px';
    const mainCol = 'minmax(0, 1fr)';
    if (showInspector && !inspectorCollapsed) {
      return `${treeCol} ${handleCol} ${mainCol} 320px`;
    }
    return `${treeCol} ${handleCol} ${mainCol}`;
  })();

  return (
    <>
      <section
        className={`${styles.workspace3} ${isDragging ? styles.workspaceDragging : ''}`}
        style={{ gridTemplateColumns: gridColumns }}
        aria-label="Repository workspace"
      >
        {treeCollapsed ? (
          <div className={styles.treeRail}>
            <button
              type="button"
              className={styles.treeRailBtn}
              onClick={onExpandTree}
              aria-label="Expand repository tree"
              title="Expand repository tree"
            >
              <PanelLeftOpen size={16} />
              <span>Tree</span>
            </button>
          </div>
        ) : (
          <aside className={styles.treePanel}>
            {tree}
          </aside>
        )}
        {!treeCollapsed ? (
          <div
            className={styles.resizeHandle}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize repository tree"
            tabIndex={0}
            onMouseDown={() => {
              dragging.current = true;
              setIsDragging(true);
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') onTreeWidthChange(Math.max(MIN_TREE, treeWidth - 16));
              if (event.key === 'ArrowRight') onTreeWidthChange(Math.min(MAX_TREE, treeWidth + 16));
            }}
          />
        ) : <div className={styles.resizeHandleHidden} aria-hidden />}
        <section className={styles.viewerPanel}>{main}</section>
        {showInspector && !inspectorCollapsed ? (
          <aside className={styles.inspectorPanel}>{inspector}</aside>
        ) : null}
      </section>

      {treeSheetOpen ? (
        <div className={styles.sheetOverlay} role="presentation" onClick={onCloseTreeSheet}>
          <div
            className={`${styles.sheet} ${styles.sheetLeft}`}
            role="dialog"
            aria-modal="true"
            aria-label="Repository tree"
            onClick={(event) => event.stopPropagation()}
          >
            {tree}
          </div>
        </div>
      ) : null}

      {inspectorSheetOpen ? (
        <div className={styles.sheetOverlay} role="presentation" onClick={onCloseInspectorSheet}>
          <div
            className={`${styles.sheet} ${styles.sheetRight}`}
            role="dialog"
            aria-modal="true"
            aria-label="Document details"
            onClick={(event) => event.stopPropagation()}
          >
            {inspector}
          </div>
        </div>
      ) : null}
    </>
  );
}
