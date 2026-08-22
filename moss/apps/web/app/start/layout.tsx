import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Executive Governance Triage | Physical Risk',
  description:
    'Complimentary executive self-assessment — preliminary indicators of governance exposure, security cost leakage, and operational fragility.',
};

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
