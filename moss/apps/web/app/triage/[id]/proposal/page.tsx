'use client';

import { useParams } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { Shell } from '@/components/Shell';
import { ProposalWorkspace } from '@/components/triage/proposal/ProposalWorkspace';

export default function TriageProposalWorkspacePage() {
  const params = useParams<{ id: string }>();
  const submissionId = String(params?.id || '');

  return (
    <AuthGate>
      <Shell title="Proposal workspace" hideSearch>
        {submissionId ? <ProposalWorkspace submissionId={submissionId} /> : null}
      </Shell>
    </AuthGate>
  );
}
