import { ConfigurationConflictException } from '../common/configuration.exception';

function assertUniquePriority(
  existing: Array<{ id: string; name: string; priority: number }>,
  priority: number,
  excludeId?: string,
) {
  const hit = existing.find((row) => row.priority === priority && row.id !== excludeId);
  if (hit) {
    throw new ConfigurationConflictException(
      'ROUTING_PRIORITY_EXISTS',
      `Priority ${priority} already exists (“${hit.name}”). Please choose another priority.`,
      { existingId: hit.id, existingName: hit.name, priority },
    );
  }
}

function pickRoutingRule(
  rules: Array<{ id: string; priority: number; createdAt: string; documentType?: string | null }>,
  documentType: string,
) {
  const normalized = documentType.trim().toLowerCase();
  const aliases: Record<string, string[]> = {
    'architecture doc': ['architecture doc', 'product architecture'],
    'product architecture': ['product architecture', 'architecture doc'],
  };
  return [...rules]
    .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .find((rule) => {
      if (!rule.documentType) return true;
      const ruleType = rule.documentType.trim().toLowerCase();
      const allowed = aliases[normalized] || [normalized];
      return allowed.includes(ruleType) || ruleType === normalized;
    });
}

describe('routing priority uniqueness', () => {
  it('rejects duplicate priority', () => {
    expect(() => assertUniquePriority([{ id: '1', name: 'A', priority: 100 }], 100)).toThrow(
      ConfigurationConflictException,
    );
  });

  it('allows same priority when updating the same rule', () => {
    expect(() => assertUniquePriority([{ id: '1', name: 'A', priority: 100 }], 100, '1')).not.toThrow();
  });
});

describe('routing execution', () => {
  it('picks Architecture Doc via alias deterministically (oldest at same priority)', () => {
    const selected = pickRoutingRule(
      [
        { id: 'b', priority: 100, createdAt: '2026-01-02', documentType: 'Product Architecture' },
        { id: 'a', priority: 100, createdAt: '2026-01-01', documentType: 'Product Architecture' },
      ],
      'Architecture Doc',
    );
    expect(selected?.id).toBe('a');
  });

  it('prefers lower priority number for Architecture Doc', () => {
    const selected = pickRoutingRule(
      [
        { id: 'high', priority: 200, createdAt: '2026-01-01', documentType: 'Architecture Doc' },
        { id: 'low', priority: 90, createdAt: '2026-01-02', documentType: 'Architecture Doc' },
      ],
      'Architecture Doc',
    );
    expect(selected?.id).toBe('low');
  });
});

describe('template default change contract', () => {
  it('requires clearing other defaults before setting one', async () => {
    const templates = [
      { id: 'a', isDefault: true },
      { id: 'b', isDefault: false },
    ];
    const setDefault = (id: string) => {
      for (const row of templates) row.isDefault = row.id === id;
      return templates.find((row) => row.id === id);
    };
    const next = setDefault('b');
    expect(next?.isDefault).toBe(true);
    expect(templates.filter((row) => row.isDefault)).toHaveLength(1);
  });
});
