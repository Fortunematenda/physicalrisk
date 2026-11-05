import { describe, expect, it } from 'vitest';
import {
  MOSS_EVIDENCE_MAX_BYTES,
  evidenceFileProblem,
  evidenceFileTypeLabel,
  formatEvidenceDate,
  formatFileSize,
} from './moss-evidence';

describe('evidenceFileTypeLabel', () => {
  it('names common evidence types and falls back to the extension', () => {
    expect(evidenceFileTypeLabel('application/pdf', 'policy.pdf')).toBe('PDF');
    expect(
      evidenceFileTypeLabel('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'roster.xlsx'),
    ).toBe('Excel workbook');
    expect(evidenceFileTypeLabel('application/octet-stream', 'scan.heic')).toBe('HEIC file');
    expect(evidenceFileTypeLabel(null, 'noextension')).toBe('File');
  });
});

describe('formatFileSize', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(20_480)).toBe('20 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatFileSize(null)).toBe('');
  });
});

describe('evidenceFileProblem', () => {
  it('accepts supported files within the limit', () => {
    expect(evidenceFileProblem({ name: 'policy.pdf', size: 1000, type: 'application/pdf' })).toBeNull();
    expect(evidenceFileProblem({ name: 'scan.bin', size: 1000, type: 'application/octet-stream' })).toBeNull();
  });

  it('reports oversized, empty and unsupported files before upload', () => {
    expect(
      evidenceFileProblem({ name: 'video.pdf', size: MOSS_EVIDENCE_MAX_BYTES + 1, type: 'application/pdf' }),
    ).toMatch(/larger than the 25 MB limit/);
    expect(evidenceFileProblem({ name: 'empty.txt', size: 0, type: 'text/plain' })).toMatch(/is empty/);
    expect(evidenceFileProblem({ name: 'clip.mp4', size: 1000, type: 'video/mp4' })).toMatch(/not a supported file type/);
  });
});

describe('formatEvidenceDate', () => {
  it('shows upload time in South African time', () => {
    expect(formatEvidenceDate('2026-11-03T22:30:00Z')).toMatch(/04 Nov 2026/);
    expect(formatEvidenceDate('not a date')).toBe('');
  });
});
