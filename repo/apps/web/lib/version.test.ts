import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { suggestNextVersion, compareVersions, formatBytes } from './version';

describe('version.ts', () => {
  describe('compareVersions', () => {
    it('returns 0 for equal versions', () => {
      assert.equal(compareVersions('1.0', '1.0'), 0);
      assert.equal(compareVersions('v1.0', '1.0'), 0);
      assert.equal(compareVersions('1.0', 'V1.0'), 0);
    });

    it('treats 1.10 as newer than 1.2', () => {
      assert.equal(compareVersions('1.10', '1.2'), 1);
      assert.equal(compareVersions('1.2', '1.10'), -1);
    });

    it('handles dotted and hyphen formats', () => {
      assert.equal(compareVersions('1.2.1', '1.2'), 1);
      assert.equal(compareVersions('2.0', '1.2'), 1);
      assert.equal(compareVersions('1.0', '1.1'), -1);
    });
  });

  describe('suggestNextVersion', () => {
    it('defaults to 1.0 when no versions exist', () => {
      assert.equal(suggestNextVersion([]), '1.0');
    });

    it('increments the last numeric segment', () => {
      assert.equal(suggestNextVersion(['1.0']), '1.1');
      assert.equal(suggestNextVersion(['1.0', '1.1']), '1.2');
      assert.equal(suggestNextVersion(['1.2', '1.10']), '1.11');
    });

    it('normalizes v prefix and preserves dotted versions', () => {
      assert.equal(suggestNextVersion(['v1.2.1']), '1.2.2');
    });
  });

  describe('formatBytes', () => {
    it('formats bytes, KB and MB', () => {
      assert.equal(formatBytes(0), '0 B');
      assert.equal(formatBytes(512), '512 B');
      assert.equal(formatBytes(1024), '1.0 KB');
      assert.equal(formatBytes(1024 * 1024), '1.0 MB');
      assert.equal(formatBytes(undefined), '—');
    });
  });
});
