import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { addDocumentType, getAvailableDocumentTypes } from './document-types';

describe('document-types.ts', () => {
  describe('addDocumentType', () => {
    it('returns error for empty input', () => {
      const result = addDocumentType('', []);
      assert.equal(result.success, false);
      assert.equal(result.error, 'Enter a document type name.');
      assert.deepEqual(result.customTypes, []);
    });

    it('returns error for whitespace-only input', () => {
      const result = addDocumentType('   ', []);
      assert.equal(result.success, false);
      assert.equal(result.error, 'Enter a document type name.');
    });

    it('adds new type to custom types', () => {
      const result = addDocumentType('Risk Assessment', []);
      assert.equal(result.success, true);
      assert.deepEqual(result.customTypes, ['Risk Assessment']);
      assert.equal(result.selectedType, 'Risk Assessment');
    });

    it('trims whitespace from input', () => {
      const result = addDocumentType('  Risk Assessment  ', []);
      assert.equal(result.success, true);
      assert.deepEqual(result.customTypes, ['Risk Assessment']);
      assert.equal(result.selectedType, 'Risk Assessment');
    });

    it('does not add duplicate type (case-insensitive)', () => {
      const result = addDocumentType('product architecture', []);
      assert.equal(result.success, true);
      assert.deepEqual(result.customTypes, []);
      assert.equal(result.selectedType, 'Product Architecture');
    });

    it('does not add duplicate from custom types (case-insensitive)', () => {
      const result = addDocumentType('RISK ASSESSMENT', ['Risk Assessment']);
      assert.equal(result.success, true);
      assert.deepEqual(result.customTypes, ['Risk Assessment']);
      assert.equal(result.selectedType, 'Risk Assessment');
    });

    it('preserves existing custom types when adding new', () => {
      const result = addDocumentType('New Type', ['Existing Type']);
      assert.equal(result.success, true);
      assert.deepEqual(result.customTypes, ['Existing Type', 'New Type']);
    });

    it('sorts custom types alphabetically', () => {
      const result = addDocumentType('Zebra', ['Alpha', 'Beta']);
      assert.equal(result.success, true);
      assert.deepEqual(result.customTypes, ['Alpha', 'Beta', 'Zebra']);
    });
  });

  describe('getAvailableDocumentTypes', () => {
    it('returns default types when no custom types', () => {
      const result = getAvailableDocumentTypes([]);
      assert.ok(result.includes('Product Architecture'));
      assert.ok(result.includes('Release Notes'));
      assert.equal(result.length, 17);
    });

    it('includes custom types with default types', () => {
      const result = getAvailableDocumentTypes(['Custom Type']);
      assert.ok(result.includes('Product Architecture'));
      assert.ok(result.includes('Custom Type'));
    });

    it('removes duplicates between default and custom', () => {
      const result = getAvailableDocumentTypes(['Product Architecture']);
      const productArchCount = result.filter((t) => t === 'Product Architecture').length;
      assert.equal(productArchCount, 1);
    });

    it('sorts all types alphabetically', () => {
      const result = getAvailableDocumentTypes(['AAA Type', 'ZZZ Type']);
      assert.equal(result[0], 'AAA Type');
      assert.equal(result[result.length - 1], 'ZZZ Type');
    });
  });
});
