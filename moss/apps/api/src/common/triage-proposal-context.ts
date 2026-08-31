import {
  deriveEgtAssurancePresentation,
  operationalSitesLabelFromStored,
  rankEgtWarningIndicators,
  securityExpenditureLabelFromStored,
} from '@moss/shared';

export type ProposalContextSnapshot = {
  capturedAt: string;
  triageReference: string;
  triageAssessmentId: string;
  assuranceScore: number | null;
  assuranceBand: string | null;
  assuranceBandLabel: string | null;
  exposureIndicator: number | null;
  dimensionResults: Array<{ category: string; assuranceScore: number; bandLabel: string }>;
  strongestIndicators: Array<{ category: string; assuranceScore: number; interpretation: string }>;
  recommendedProduct: string;
  recommendedProductCode: string;
  primaryConcern: string | null;
  prospect: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    jobTitle: string | null;
  };
  organisation: {
    name: string;
    country: string | null;
    industry: string | null;
    operationalSitesLabel: string | null;
    securityExpenditureLabel: string | null;
  };
};

type LeadRow = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  organisationName: string;
  industry: string | null;
  completedAt: Date | null;
};

type AssessmentRow = {
  id: string;
  reference: string;
  inputValues: Array<{ value: unknown; inputDefinition: { code: string } }>;
  scoreSnapshots: Array<{
    overallRiskScore: unknown;
    maturityScore: unknown;
    categoryScores: unknown;
  }>;
};

export function buildProposalContextSnapshot(input: {
  lead: LeadRow;
  assessment: AssessmentRow;
  qualification?: {
    jobTitle?: string | null;
    country?: string | null;
    primaryConcern?: string | null;
    operationalSitesLabel?: string | null;
    securityExpenditureLabel?: string | null;
  } | null;
}): ProposalContextSnapshot {
  const inputMap = Object.fromEntries(
    input.assessment.inputValues.map((row) => [row.inputDefinition.code, row.value]),
  );
  const snapshot = input.assessment.scoreSnapshots[0];
  const presentation = snapshot
    ? deriveEgtAssurancePresentation({
        overallRiskScore:
          snapshot.overallRiskScore != null ? Number(snapshot.overallRiskScore) : null,
        maturityScore: snapshot.maturityScore != null ? Number(snapshot.maturityScore) : null,
        categoryScores: (
          (snapshot.categoryScores as Array<{ category?: string; score?: number }>) || []
        ).map((c) => ({
          category: String(c.category || ''),
          score: Number(c.score) || 0,
        })),
      })
    : null;

  const categoryScores = presentation?.categoryScores || [];
  const warnings = rankEgtWarningIndicators(categoryScores, 3);

  const qual = input.qualification || {};
  const operationalSitesLabel =
    qual.operationalSitesLabel ||
    operationalSitesLabelFromStored(inputMap.C3) ||
    null;
  const securityExpenditureLabel =
    qual.securityExpenditureLabel ||
    securityExpenditureLabelFromStored(inputMap.C5) ||
    null;

  return {
    capturedAt: new Date().toISOString(),
    triageReference: input.assessment.reference,
    triageAssessmentId: input.assessment.id,
    assuranceScore: presentation?.assuranceScore ?? null,
    assuranceBand: presentation?.assuranceBand.code ?? null,
    assuranceBandLabel: presentation?.assuranceBand.displayLabel ?? null,
    exposureIndicator: presentation?.exposureIndicator ?? null,
    dimensionResults: categoryScores.map((c) => ({
      category: c.category,
      assuranceScore: c.assuranceScore,
      bandLabel: c.band.displayLabel,
    })),
    strongestIndicators: warnings.map((w) => ({
      category: w.category,
      assuranceScore: w.assuranceScore,
      interpretation: w.band.displayLabel,
    })),
    recommendedProduct: 'Executive Advisory Diagnostic',
    recommendedProductCode: 'EXECUTIVE_ADVISORY_DIAGNOSTIC',
    primaryConcern: qual.primaryConcern || null,
    prospect: {
      firstName: input.lead.firstName,
      lastName: input.lead.lastName,
      email: input.lead.email,
      phone: input.lead.phone,
      jobTitle: qual.jobTitle || null,
    },
    organisation: {
      name: input.lead.organisationName,
      country: qual.country || null,
      industry: input.lead.industry,
      operationalSitesLabel,
      securityExpenditureLabel,
    },
  };
}

export function readProposalContextSnapshot(value: unknown): ProposalContextSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  return value as ProposalContextSnapshot;
}
