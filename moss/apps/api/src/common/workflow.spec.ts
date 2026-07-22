import { describe, expect, it } from 'vitest';
import { assertTransition, workflowTimeline, MVP_WORKFLOW_ORDER, toMvpStatus } from './workflow';
import { AssessmentStatus } from '@prisma/client';

describe('Lean MVP assessment workflow', () => {
  const admin = { id: '1', email: 'a@b.c', role: 'SUPER_ADMIN' };
  const analyst = { id: '3', email: 'n@b.c', role: 'ANALYST' };
  const client = { id: '4', email: 'c@b.c', role: 'CLIENT_EXECUTIVE' };

  it('allows SUBMITTED → REVIEWED for analyst', () => {
    expect(() => assertTransition(AssessmentStatus.SUBMITTED, AssessmentStatus.REVIEWED, analyst)).not.toThrow();
  });

  it('allows REVIEWED → APPROVED for analyst', () => {
    expect(() => assertTransition(AssessmentStatus.REVIEWED, AssessmentStatus.APPROVED, analyst)).not.toThrow();
  });

  it('blocks client from approving', () => {
    expect(() => assertTransition(AssessmentStatus.REVIEWED, AssessmentStatus.APPROVED, client)).toThrow();
  });

  it('requires comment when returning to client', () => {
    expect(() => assertTransition(AssessmentStatus.SUBMITTED, AssessmentStatus.IN_PROGRESS, analyst)).toThrow();
    expect(() =>
      assertTransition(AssessmentStatus.SUBMITTED, AssessmentStatus.IN_PROGRESS, analyst, {
        reason: 'Incomplete calibration',
      }),
    ).not.toThrow();
  });

  it('admin may force transitions', () => {
    expect(() => assertTransition(AssessmentStatus.REPORT_ISSUED, AssessmentStatus.DRAFT, admin)).not.toThrow();
  });

  it('maps legacy statuses onto MVP timeline', () => {
    expect(toMvpStatus(AssessmentStatus.ANALYST_REVIEW)).toBe(AssessmentStatus.SUBMITTED);
    const timeline = workflowTimeline(AssessmentStatus.ANALYST_REVIEW);
    const current = timeline.find((t) => t.state === 'current');
    expect(current?.status).toBe(AssessmentStatus.SUBMITTED);
    expect(MVP_WORKFLOW_ORDER).toEqual([
      AssessmentStatus.DRAFT,
      AssessmentStatus.IN_PROGRESS,
      AssessmentStatus.SUBMITTED,
      AssessmentStatus.REVIEWED,
      AssessmentStatus.APPROVED,
      AssessmentStatus.REPORT_GENERATED,
      AssessmentStatus.REPORT_ISSUED,
    ]);
  });
});
