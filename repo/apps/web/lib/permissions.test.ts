import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { canCreateConfiguration, GatewayUser } from './permissions';

describe('permissions.ts', () => {
  it('allows ADMIN and IMPORTER to create configuration', () => {
    assert.equal(canCreateConfiguration({ role: 'ADMIN' }), true);
    assert.equal(canCreateConfiguration({ role: 'IMPORTER' }), true);
  });

  it('denies REVIEWER and VIEWER', () => {
    assert.equal(canCreateConfiguration({ role: 'REVIEWER' }), false);
    assert.equal(canCreateConfiguration({ role: 'VIEWER' }), false);
  });

  it('denies missing users and roles', () => {
    assert.equal(canCreateConfiguration(null), false);
    assert.equal(canCreateConfiguration({} as GatewayUser), false);
  });
});
