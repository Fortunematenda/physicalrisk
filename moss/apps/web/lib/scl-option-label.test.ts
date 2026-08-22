import { describe, expect, it } from 'vitest';

import {
  shouldUseSclOptionsGrid,
  splitOptionPresentation,
  stripUnintendedLeadingDash,
} from './scl-option-label';

describe('stripUnintendedLeadingDash', () => {
  it('removes leading list-marker dashes', () => {
    expect(stripUnintendedLeadingDash('- Yes, fully implemented')).toBe('Yes, fully implemented');
    expect(stripUnintendedLeadingDash('– Yes, fully implemented')).toBe('Yes, fully implemented');
    expect(stripUnintendedLeadingDash('— Yes, fully implemented')).toBe('Yes, fully implemented');
    expect(stripUnintendedLeadingDash('• Yes, fully implemented')).toBe('Yes, fully implemented');
    expect(stripUnintendedLeadingDash('  - Yes')).toBe('Yes');
  });

  it('preserves legitimate hyphens and mid-string en-dashes', () => {
    expect(stripUnintendedLeadingDash('Risk-based approach')).toBe('Risk-based approach');
    expect(stripUnintendedLeadingDash('Yes – comprehensive SLA')).toBe('Yes – comprehensive SLA');
    expect(stripUnintendedLeadingDash('0–20%')).toBe('0–20%');
    expect(stripUnintendedLeadingDash('Yes – evidence-based assurance reporting')).toBe(
      'Yes – evidence-based assurance reporting',
    );
    expect(stripUnintendedLeadingDash('partial/basic SLA')).toBe('partial/basic SLA');
  });
});

describe('splitOptionPresentation', () => {
  it('splits title and description on spaced en-dash', () => {
    expect(splitOptionPresentation('Yes – independently validated')).toEqual({
      title: 'Yes',
      description: 'independently validated',
    });
  });

  it('keeps compact ranges as a single title', () => {
    expect(splitOptionPresentation('0–20%')).toEqual({ title: '0–20%', description: '' });
  });

  it('strips leading list markers before splitting', () => {
    expect(splitOptionPresentation('- Partly – Present, but incomplete')).toEqual({
      title: 'Partly',
      description: 'Present, but incomplete',
    });
  });
});

describe('shouldUseSclOptionsGrid', () => {
  it('uses 2-column grid for percentage-band questionnaire options', () => {
    expect(
      shouldUseSclOptionsGrid(['0–20%', '21–40%', '41–60%', '61–80%', '81–100%', 'Unknown']),
    ).toBe(true);
  });

  it('uses 2-column grid for short SLA-style choices with titles', () => {
    expect(
      shouldUseSclOptionsGrid([
        'Yes – identified and applied',
        'Identified but not applied',
        'No penalties identified',
        'No SLA',
        'Unknown',
      ]),
    ).toBe(true);
  });

  it('keeps long descriptive options in a single column', () => {
    expect(
      shouldUseSclOptionsGrid([
        'Yes – independently validated every month across a representative site set with documented sampling methodology and board reporting',
        'Partly – Present, but incomplete and not consistently applied nationally across the operating footprint and contractor base',
        'No – supplier reports are accepted without independent monthly validation or sampling of site-level evidence packs',
        'Unknown – management cannot currently confirm the monthly validation posture or the completeness of assurance coverage',
        'Not applicable to this organisation’s current operating model or contract structure given the scale of outsourced security services',
      ]),
    ).toBe(false);
  });
});
