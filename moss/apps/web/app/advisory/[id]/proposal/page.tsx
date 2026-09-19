'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { ProposalWorkspace } from '@/components/triage/proposal/ProposalWorkspace';
import { Shell } from '@/components/Shell';
import { AdvisoryBreadcrumb } from '@/components/advisory/AdvisoryBreadcrumb';
import { apiFetch } from '@/lib/api';
import { Loader2 } from 'lucide-react';

/**
 * EAD comprehensive proposal workspace under Diagnostics & assurance.
 * Reuses the same ProposalWorkspace editor; commercial APIs still key off the linked triage lead.
 */
export default function AdvisoryProposalWorkspacePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const eadAssessmentId = String(params?.id || '');
  const proposalId = searchParams.get('proposalId') || '';
  const leadIdFromQuery = searchParams.get('leadId') || '';

  const [leadId, setLeadId] = useState(leadIdFromQuery);
  const [eadReference, setEadReference] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [resolving, setResolving] = useState(!leadIdFromQuery && Boolean(eadAssessmentId));

  useEffect(() => {
    if (leadIdFromQuery || !eadAssessmentId) return;
    let cancelled = false;
    setResolving(true);
    void apiFetch<{
      engagement?: { reference?: string };
      comprehensiveProposal?: { publicLeadId?: string; id?: string } | null;
    }>(`/advisory/${eadAssessmentId}/outcome`)
      .then((data) => {
        if (cancelled) return;
        setEadReference(data.engagement?.reference || null);
        const lead = data.comprehensiveProposal?.publicLeadId || '';
        if (!lead) {
          setError('No proposal workspace is linked to this diagnostic yet.');
          return;
        }
        setLeadId(lead);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || 'Unable to open proposal workspace.');
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eadAssessmentId, leadIdFromQuery]);

  useEffect(() => {
    if (leadIdFromQuery) setLeadId(leadIdFromQuery);
  }, [leadIdFromQuery]);

  if (!eadAssessmentId) return null;

  if (resolving) {
    return (
      <AuthGate>
        <Shell
          title="Proposal"
          hideSearch
          hideTitle
          headerLeading={<AdvisoryBreadcrumb current="Proposal" />}
        >
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="size-8 animate-spin text-slate-400" />
          </div>
        </Shell>
      </AuthGate>
    );
  }

  if (error || !leadId) {
    return (
      <AuthGate>
        <Shell
          title="Proposal"
          hideSearch
          hideTitle
          headerLeading={<AdvisoryBreadcrumb current="Proposal" />}
        >
          <p className="text-sm text-red-600">{error || 'Proposal workspace unavailable.'}</p>
        </Shell>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <ProposalWorkspace
        submissionId={leadId}
        eadContext={{
          assessmentId: eadAssessmentId,
          reference: eadReference,
          proposalId: proposalId || undefined,
        }}
      />
    </AuthGate>
  );
}
