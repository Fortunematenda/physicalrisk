'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, ChevronsLeft, MoreVertical, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import styles from '../RepositoryExplorer.module.css';
import { iconFor } from '../helpers';
import type { TreeEntry } from '../types';

function TreeRow({
  entry,
  level,
  selectedPath,
  expanded,
  onToggle,
  onSelect,
  onDeleteFolder,
}: {
  entry: TreeEntry;
  level: number;
  selectedPath?: string;
  expanded: Set<string>;
  onToggle: (entry: TreeEntry) => void;
  onSelect: (entry: TreeEntry) => void;
  onDeleteFolder?: (entry: TreeEntry) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const expandable = entry.type === 'directory' && Boolean(entry.children?.length);
  const opened = expanded.has(entry.path);
  const selected = selectedPath === entry.path;
  const isFolder = entry.type === 'directory' && entry.nodeType !== 'document';
  const canDeleteFolder = Boolean(
    isFolder
    && entry.nodeType !== 'register'
    && onDeleteFolder,
  );

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowRight' && expandable && !opened) {
      event.preventDefault();
      onToggle(entry);
    }
    if (event.key === 'ArrowLeft' && expandable && opened) {
      event.preventDefault();
      onToggle(entry);
    }
    if (event.key === 'Enter') onSelect(entry);
  };
  const label = [
    entry.name,
    selected ? 'selected' : null,
    expandable ? (opened ? 'expanded' : 'collapsed') : null,
  ].filter(Boolean).join(', ');

  return (
    <>
      <div className={`${styles.treeRowWrap} ${selected ? styles.selected : ''}`}>
        <button
          type="button"
          className={`${styles.treeRow} ${selected ? styles.selected : ''}`}
          style={{ paddingLeft: 8 + level * 16 }}
          onClick={() => onSelect(entry)}
          onKeyDown={onKeyDown}
          aria-label={label}
          aria-current={selected ? 'true' : undefined}
        >
          <span
            className={styles.chevron}
            onClick={(event) => {
              event.stopPropagation();
              if (expandable) onToggle(entry);
            }}
          >
            {expandable ? (opened ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
          </span>
          <span className={styles.nodeIcon}>{iconFor(entry)}</span>
          <span className={styles.nodeLabel}>{entry.name}</span>
          {entry.childCount !== undefined && <span className={styles.nodeMeta}>{entry.childCount}</span>}
        </button>
        {canDeleteFolder ? (
          <div className={styles.treeRowMenu} ref={menuRef}>
            <button
              type="button"
              className={`${styles.treeMenuButton} ${menuOpen ? styles.iconButtonActive : ''}`}
              aria-label={`Actions for ${entry.name}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="Folder actions"
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((open) => !open);
              }}
            >
              <MoreVertical size={14} />
            </button>
            {menuOpen ? (
              <div className={`${styles.menu} ${styles.treeMenu}`} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuDanger}
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuOpen(false);
                    onDeleteFolder?.(entry);
                  }}
                >
                  Delete folder
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {expandable && opened
        ? entry.children?.map((child) => (
            <TreeRow
              key={child.path}
              entry={child}
              level={level + 1}
              selectedPath={selectedPath}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              onDeleteFolder={onDeleteFolder}
            />
          ))
        : null}
    </>
  );
}

type Props = {
  projectCode?: string;
  loading: boolean;
  entries: TreeEntry[];
  filteredEntries: TreeEntry[];
  useFiltered: boolean;
  selectedPath?: string;
  expanded: Set<string>;
  onToggle: (entry: TreeEntry) => void;
  onSelect: (entry: TreeEntry) => void;
  onDeleteFolder?: (entry: TreeEntry) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  showCollapseButton?: boolean;
};

export function RepositoryTreePanel({
  projectCode,
  loading,
  entries,
  filteredEntries,
  useFiltered,
  selectedPath,
  expanded,
  onToggle,
  onSelect,
  onDeleteFolder,
  collapsed,
  onToggleCollapsed,
  showCollapseButton = true,
}: Props) {
  return (
    <div className={styles.treePanelInner}>
      <div className={styles.panelHeader}>
        <div>
          <h2>Repository Tree</h2>
          <small>{projectCode ?? 'Project'} VPS repository</small>
        </div>
        {showCollapseButton ? (
          <button
            type="button"
            className={styles.iconButton}
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand repository tree' : 'Collapse repository tree'}
            title={collapsed ? 'Expand tree' : 'Collapse tree'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        ) : null}
      </div>
      <div className={styles.tree} aria-label="Repository tree">
        {loading
          ? Array.from({ length: 9 }).map((_, index) => (
              <div key={index} className={`${styles.skeleton} ${styles.skeletonRow}`} />
            ))
          : (useFiltered ? filteredEntries : entries).map((entry) => (
              <TreeRow
                key={entry.path}
                entry={entry}
                level={0}
                selectedPath={selectedPath}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
                onDeleteFolder={onDeleteFolder}
              />
            ))}
      </div>
      {showCollapseButton && !collapsed ? (
        <div className={styles.treeFooter}>
          <button type="button" className={styles.collapseTreeBtn} onClick={onToggleCollapsed}>
            <ChevronsLeft size={14} />
            Collapse tree
          </button>
        </div>
      ) : null}
    </div>
  );
}
