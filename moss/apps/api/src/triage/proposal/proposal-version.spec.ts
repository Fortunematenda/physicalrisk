import { describe, expect, it } from 'vitest';
import {
  formatProposalVersionCover,
  formatProposalVersionFile,
  formatProposalVersionShort,
  readProposalVersionParts,
} from './proposal-version';

describe('proposal version labels', () => {
  it('formats cover as major.minor', () => {
    expect(formatProposalVersionCover(1, 0)).toBe('1.0');
    expect(formatProposalVersionCover(1, 2)).toBe('1.2');
    expect(formatProposalVersionCover(13, 0)).toBe('13.0');
  });

  it('formats short and file labels', () => {
    expect(formatProposalVersionShort(1, 0)).toBe('v1');
    expect(formatProposalVersionShort(1, 1)).toBe('v1.1');
    expect(formatProposalVersionFile(1, 2)).toBe('v1.2');
  });

  it('reads parts safely', () => {
    expect(readProposalVersionParts({ version: 1, versionRevision: 0 })).toEqual({
      major: 1,
      revision: 0,
    });
    expect(readProposalVersionParts({ version: null, versionRevision: null })).toEqual({
      major: 1,
      revision: 0,
    });
  });
});
