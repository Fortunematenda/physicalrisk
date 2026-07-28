'use client';

import {
  ChevronDown, ChevronRight, ChevronsLeft, PanelLeftClose, PanelLeftOpen,
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
}: {
  entry: TreeEntry;
  level: number;
  selectedPath?: string;
  expanded: Set<string>;
  onToggle: (entry: TreeEntry) => void;
  onSelect: (entry: TreeEntry) => void;
}) {
  const expandable = entry.type === 'directory' && Boolean(entry.children?.length);
  const opened = expanded.has(entry.path);
  const selected = selectedPath === entry.path;
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
