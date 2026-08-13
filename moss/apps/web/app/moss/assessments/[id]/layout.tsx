'use client';

import { Shell } from '../../../../components/Shell';
import { MossAssessmentTabs } from '../../../../components/MossAssessmentTabs';

/**
 * Shared chrome for MOSS assessment tabs.
 * PortalFrame keeps AuthGate + AppShell mounted; this only sets header chrome + tabs.
 */
export default function MossAssessmentLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell title="MOSS Assessment" subtitle="Master Catalogue workspace" hideSearch>
      <MossAssessmentTabs />
      {children}
    </Shell>
  );
}
