import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { compareVersions, parseVersion, suggestNextVersion } from './version.util';

describe('version.util', () => {
  describe('parseVersion', () => {
    it('strips leading v/V', () => {
      assert.deepEqual(parseVersion('v1.2').parts, [1, 2]);
      assert.deepEqual(parseVersion('V2.0').parts, [2, 0]);
    });

    it('splits on periods and hyphens', () => {
      assert.deepEqual(parseVersion('1.2.1').parts, [1, 2, 1]);
      assert.deepEqual(parseVersion('1-2-3').parts, [1, 2, 3]);
    });

    it('treats non-numeric segments as 0', () => {
      assert.deepEqual(parseVersion('1.a.2').parts, [1, 0, 2]);
    });
  });

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

    it('handles common formats', () => {
      assert.equal(compareVersions('1.2', '1.0'), 1);
      assert.equal(compareVersions('2.0', '1.2'), 1);
      assert.equal(compareVersions('1.2.1', '1.2'), 1);
      assert.equal(compareVersions('1.2', '1.2.1'), -1);
    });
  });

  describe('suggestNextVersion', () => {
    it('suggests 1.0 for empty list', () => {
      assert.equal(suggestNextVersion([]), '1.0');
    });

    it('increments the last numeric segment', () => {
      assert.equal(suggestNextVersion(['1.0']), '1.1');
      assert.equal(suggestNextVersion(['1.0', '1.1']), '1.2');
      assert.equal(suggestNextVersion(['1.2', '1.10']), '1.11');
    });

    it('handles v prefix and dotted versions', () => {
      assert.equal(suggestNextVersion(['v1.2.1']), '1.2.2');
    });
  });
});
