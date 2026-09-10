/** Cover / PDF meta: always major.minor (1.0, 1.1, 1.2). */
export function formatProposalVersionCover(major: number, revision = 0): string {
  const m = Math.max(1, Math.floor(Number(major) || 1));
  const r = Math.max(0, Math.floor(Number(revision) || 0));
  return `${m}.${r}`;
}

/** UI chip / short label: v1 or v1.1 */
export function formatProposalVersionShort(major: number, revision = 0): string {
  const m = Math.max(1, Math.floor(Number(major) || 1));
  const r = Math.max(0, Math.floor(Number(revision) || 0));
  return r === 0 ? `v${m}` : `v${m}.${r}`;
}

/** Filename segment: v1 or v1.1 */
export function formatProposalVersionFile(major: number, revision = 0): string {
  return formatProposalVersionShort(major, revision);
}

export type ProposalVersionParts = { major: number; revision: number };

export function readProposalVersionParts(proposal: {
  version?: number | null;
  versionRevision?: number | null;
}): ProposalVersionParts {
  return {
    major: Math.max(1, Math.floor(Number(proposal.version) || 1)),
    revision: Math.max(0, Math.floor(Number(proposal.versionRevision) || 0)),
  };
}
