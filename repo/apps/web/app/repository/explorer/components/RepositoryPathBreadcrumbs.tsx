'use client';

import { useState } from 'react';
import { Check, ChevronRight, Copy } from 'lucide-react';
import styles from '../RepositoryExplorer.module.css';
import { pathSegments } from '../helpers';

type Props = {
  path?: string | null;
};

export function RepositoryPathBreadcrumbs({ path }: Props) {
  const segments = pathSegments(path);
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const copy = async () => {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  if (!path) return <span className={styles.muted}>—</span>;

  return (
    <div className={styles.pathBlock}>
      <div className={styles.breadcrumbRow}>
        <nav className={styles.pathBreadcrumbs} aria-label="Repository location">
          {segments.map((segment, index) => (
            <span key={`${segment}-${index}`} className={styles.pathSegment}>
              {index > 0 ? <ChevronRight size={12} className={styles.pathSep} aria-hidden /> : null}
              <span title={segment}>{segment}</span>
            </span>
          ))}
        </nav>
        <button
          type="button"
          className={styles.iconButtonSm}
          onClick={() => void copy()}
          aria-label={copied ? 'Location copied' : 'Copy repository location'}
          title={copied ? 'Copied' : 'Copy location'}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <button
        type="button"
        className={styles.rawPathToggle}
        onClick={() => setShowRaw((open) => !open)}
        aria-expanded={showRaw}
        title={path}
      >
        {showRaw ? 'Hide full path' : 'Show full path'}
      </button>
      {showRaw ? <code className={styles.rawPath} title={path}>{path}</code> : null}
    </div>
  );
}
