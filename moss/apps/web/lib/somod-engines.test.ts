import { describe, expect, it } from 'vitest';
import {
  SOMOD_ENGINE_CAPABILITIES,
  engineWorkspaceHref,
  enginePayload,
  workspaceQuery,
} from './somod-engines';

const params = (query: string) => new URLSearchParams(query);

describe('SOMOD engine capabilities', () => {
  it('never labels an engine as editable and lists all five engines', () => {
    expect(SOMOD_ENGINE_CAPABILITIES.map((e) => e.key)).toEqual([
      'RISK_REQUIREMENT',
      'DEPLOYMENT_CAPABILITY',
      'TECHNOLOGY',
      'COST_EFFICIENCY',
      'OPTIMISATION_TRADEOFF',
    ]);
    for (const engine of SOMOD_ENGINE_CAPABILITIES) {
      expect(engine.statusLabel).not.toMatch(/editable/i);
      expect(engine.explanation.length).toBeGreaterThan(20);
    }
  });

  it('marks only the engines that feed a calculation as available', () => {
    const available = SOMOD_ENGINE_CAPABILITIES.filter((e) => e.availability === 'available').map((e) => e.key);
    expect(available).toEqual(['DEPLOYMENT_CAPABILITY', 'COST_EFFICIENCY']);
    expect(SOMOD_ENGINE_CAPABILITIES.find((e) => e.key === 'OPTIMISATION_TRADEOFF')?.statusLabel).toBe(
      'Not yet implemented',
    );
  });
});

describe('enginePayload', () => {
  it('keeps free text as text so risk and deployment notes persist', () => {
    expect(
      enginePayload({
        threatSummary: 'Cable theft at the north gate',
        posts: 'Gate 1, Gate 2',
        notes: 'Night shift only',
      }),
    ).toEqual({ threatSummary: 'Cable theft at the north gate', posts: 'Gate 1, Gate 2', notes: 'Night shift only' });
  });

  it('sends numeric fields as numbers and blanks as null rather than 0', () => {
    expect(
      enginePayload({ headcount: '20', supervisorCount: '', technologyCapex: 'abc', responseDelayMinutes: '7.5' }),
    ).toEqual({ headcount: 20, supervisorCount: null, technologyCapex: null, responseDelayMinutes: 7.5 });
  });
});

describe('workspace navigation', () => {
  it('opens the requested engine panel from the URL', () => {
    expect(workspaceQuery(params('panel=engines&engine=cost_efficiency'))).toEqual({
      panel: 'engines',
      engine: 'COST_EFFICIENCY',
    });
  });

  it('ignores unknown panels and engines', () => {
    expect(workspaceQuery(params('panel=admin&engine=DROP_TABLE'))).toEqual({ panel: null, engine: null });
    expect(workspaceQuery(null)).toEqual({ panel: null, engine: null });
  });

  it('builds a link to an engine on a specific assessment', () => {
    expect(engineWorkspaceHref('abc 123', 'TECHNOLOGY')).toBe(
      '/somod/assessments/abc%20123?panel=engines&engine=TECHNOLOGY',
    );
  });
});
