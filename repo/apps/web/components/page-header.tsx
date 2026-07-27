'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

type PageHeaderProps = {
  title: string;
  description?: string;
  action?: { label: string; href: string };
  /** Optional explicit destination. Defaults to browser history, then Dashboard. */
  backHref?: string;
  showBack?: boolean;
};

export function PageHeader({
  title,
  description,
  action,
  backHref,
  showBack = true,
}: PageHeaderProps) {
  const router = useRouter();

  const goBack = () => {
    if (backHref) {
      router.push(backHref);
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/');
  };

  return (
    <div className="page-header">
      <div>
        {showBack ? (
          <button type="button" className="page-back" onClick={goBack} aria-label="Go back">
            ← Back
          </button>
        ) : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? (
        <Link href={action.href} className="button primary">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
