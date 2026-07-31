'use client';

import { ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import styles from '@/app/configuration/Configuration.module.css';

export type ConfigStat = {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: ReactNode;
  tone?: 'blue' | 'green' | 'orange';
};

const toneClass: Record<NonNullable<ConfigStat['tone']>, string> = {
  blue: styles.statIconBlue,
  green: styles.statIconGreen,
  orange: styles.statIconOrange,
};

export type ConfigurationListShellProps = {
  title: string;
  description?: string;
  headerAction?: { label: string; href: string };
  error?: string;
  message?: string;
  stats: ConfigStat[];
  toolbar: ReactNode;
  loading: boolean;
  empty?: { title: string; text: string } | null;
  children?: ReactNode;
  footer?: ReactNode;
};

export function ConfigurationListShell({
  title,
  headerAction,
  error,
  message,
  stats,
  toolbar,
  loading,
  empty,
  children,
  footer,
}: ConfigurationListShellProps) {
  // `description` kept on the props type for callers; subtitles under titles are not shown.
  return (
    <div className={styles.page}>
      <PageHeader
        title={title}
        action={headerAction}
      />

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      {stats.length ? (
        <div className={styles.stats}>
          {stats.map((stat) => (
            <div className={styles.statCard} key={stat.label}>
              <div className={`${styles.statIcon} ${toneClass[stat.tone ?? 'blue']}`}>
                {stat.icon}
              </div>
              <div>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
                {stat.hint ? <small>{stat.hint}</small> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.panelCard}>
        <div className={styles.toolbar}>{toolbar}</div>

        {loading ? (
          <div className={styles.stateWrap}><Loading /></div>
        ) : empty ? (
          <div className={styles.stateWrap}>
            <EmptyState title={empty.title} text={empty.text} />
          </div>
        ) : (
          <div className={styles.tableWrap}>{children}</div>
        )}
      </div>

      {footer}
    </div>
  );
}

export { styles as configurationListStyles };
