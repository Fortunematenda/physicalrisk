'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

const TABS = [
  { href: '', label: 'Controls', match: (p: string, id: string) => p === `/moss/assessments/${id}` },
  { href: '/findings', label: 'Findings', match: (p: string, id: string) => p.includes('/findings') },
  {
    href: '/recommendations',
    label: 'Recommendations',
    match: (p: string, id: string) => p.includes('/recommendations'),
  },
  { href: '/actions', label: 'Actions', match: (p: string, id: string) => p.includes('/actions') },
  { href: '/results', label: 'Results', match: (p: string, id: string) => p.includes('/results') },
];

export function MossAssessmentTabs({ assessmentId }: { assessmentId?: string }) {
  const params = useParams();
  const pathname = usePathname() || '';
  const id = assessmentId || String(params?.id || '');
  if (!id) return null;

  return (
    <nav
      aria-label="Assessment sections"
      style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        marginBottom: 16,
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: 8,
      }}
    >
      {TABS.map((t) => {
        const href = `/moss/assessments/${id}${t.href}`;
        const active = t.match(pathname, id);
        return (
          <Link
            key={t.label}
            href={href}
            prefetch
            scroll={false}
            aria-current={active ? 'page' : undefined}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              textDecoration: 'none',
              fontWeight: active ? 700 : 500,
              color: active ? '#111827' : '#4b5563',
              background: active ? '#f3f4f6' : 'transparent',
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
