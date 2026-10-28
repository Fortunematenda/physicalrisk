-- Engagement-scoped "Approver" responsibility (Wayne acceptance remediation, 28 Oct 2026).
-- Additive only: existing assignments and permissions are unchanged.
ALTER TYPE "AssignmentRole" ADD VALUE IF NOT EXISTS 'APPROVER';
