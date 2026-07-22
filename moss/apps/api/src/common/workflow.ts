import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AssessmentStatus } from '@prisma/client';
import { hasRole, ADMIN_ROLES, ANALYST_ROLES, WRITE_INTERNAL_ROLES } from './roles';
import type { AuthUser } from './current-user.decorator';

/** Lean Revenue MVP status path. */
export const MVP_WORKFLOW_ORDER: AssessmentStatus[] = [
  AssessmentStatus.DRAFT,
  AssessmentStatus.IN_PROGRESS,
  AssessmentStatus.SUBMITTED,
  AssessmentStatus.REVIEWED,
  AssessmentStatus.APPROVED,
  AssessmentStatus.REPORT_GENERATED,
  AssessmentStatus.REPORT_ISSUED,
];

/** Map legacy pilot statuses onto the Lean MVP path for display and gates. */
export function toMvpStatus(status: AssessmentStatus): AssessmentStatus {
  switch (status) {
    case AssessmentStatus.AWAITING_CONTRIBUTOR:
      return AssessmentStatus.IN_PROGRESS;
    case AssessmentStatus.AUTOMATED_EVALUATION_COMPLETE:
    case AssessmentStatus.EVIDENCE_REVIEW:
    case AssessmentStatus.ANALYST_REVIEW:
    case AssessmentStatus.QUALITY_ASSURANCE:
      return AssessmentStatus.SUBMITTED;
    case AssessmentStatus.REMEDIATION_IN_PROGRESS:
    case AssessmentStatus.REASSESSMENT_DUE:
    case AssessmentStatus.CLOSED:
    case AssessmentStatus.ARCHIVED:
      return AssessmentStatus.REPORT_ISSUED;
    default:
      return status;
  }
}

const FORWARD: Partial<Record<AssessmentStatus, AssessmentStatus[]>> = {
  DRAFT: [AssessmentStatus.IN_PROGRESS],
  IN_PROGRESS: [AssessmentStatus.SUBMITTED],
  SUBMITTED: [AssessmentStatus.REVIEWED, AssessmentStatus.IN_PROGRESS],
  REVIEWED: [AssessmentStatus.APPROVED, AssessmentStatus.IN_PROGRESS],
  APPROVED: [AssessmentStatus.REPORT_GENERATED],
  REPORT_GENERATED: [AssessmentStatus.REPORT_ISSUED],
  REPORT_ISSUED: [],
  // Legacy → allow progression into MVP path
  AWAITING_CONTRIBUTOR: [AssessmentStatus.IN_PROGRESS, AssessmentStatus.SUBMITTED],
  AUTOMATED_EVALUATION_COMPLETE: [AssessmentStatus.REVIEWED, AssessmentStatus.IN_PROGRESS],
  EVIDENCE_REVIEW: [AssessmentStatus.REVIEWED, AssessmentStatus.IN_PROGRESS],
  ANALYST_REVIEW: [AssessmentStatus.REVIEWED, AssessmentStatus.IN_PROGRESS],
  QUALITY_ASSURANCE: [AssessmentStatus.REVIEWED, AssessmentStatus.APPROVED, AssessmentStatus.IN_PROGRESS],
};

export function workflowTimeline(current: AssessmentStatus) {
  const normalised = toMvpStatus(current);
  const idx = MVP_WORKFLOW_ORDER.indexOf(normalised);
  return MVP_WORKFLOW_ORDER.map((status, i) => ({
    status,
    state: idx < 0 ? 'upcoming' : i < idx ? 'completed' : i === idx ? 'current' : 'upcoming',
  }));
}

export function assertTransition(from: AssessmentStatus, to: AssessmentStatus, user: AuthUser, opts?: { reason?: string }) {
  if (from === to) return;

  if (hasRole(user, ADMIN_ROLES)) {
    return;
  }

  const forward = FORWARD[from] || [];
  if (!forward.includes(to)) {
    throw new BadRequestException(`Transition from ${from} to ${to} is not allowed.`);
  }

  if (to === AssessmentStatus.APPROVED && !hasRole(user, ADMIN_ROLES) && !hasRole(user, ANALYST_ROLES)) {
    throw new ForbiddenException('Only authorised analysts or administrators may approve assessments.');
  }

  if (to === AssessmentStatus.REVIEWED && !hasRole(user, ANALYST_ROLES)) {
    throw new ForbiddenException('Analyst permission required to mark as reviewed.');
  }

  if (to === AssessmentStatus.IN_PROGRESS && from !== AssessmentStatus.DRAFT) {
    if (!opts?.reason) throw new BadRequestException('A comment is required when returning an assessment to the client.');
    if (!hasRole(user, ANALYST_ROLES)) throw new ForbiddenException('Analyst permission required to return an assessment.');
  }

  if (!hasRole(user, WRITE_INTERNAL_ROLES) && !([AssessmentStatus.IN_PROGRESS, AssessmentStatus.SUBMITTED] as AssessmentStatus[]).includes(to)) {
    throw new ForbiddenException('Insufficient permissions for this transition.');
  }
}
