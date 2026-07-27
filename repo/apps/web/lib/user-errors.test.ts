import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { friendlyErrorMessage } from './user-errors';
import { ApiError } from './api-error';
import { addDocumentType, getAvailableDocumentTypes } from './document-types';

describe('friendlyErrorMessage', () => {
  it('maps expired token to session refresh copy', () => {
    const msg = friendlyErrorMessage(new ApiError('Invalid or expired token', 401));
    assert.match(msg, /session has expired/i);
  });

  it('maps approval rejection to friendly copy', () => {
    const msg = friendlyErrorMessage(
      new ApiError('Only APPROVED documents may enter the official repository', 400),
    );
    assert.match(msg, /has not yet been approved/i);
  });

  it('maps template failures', () => {
    const msg = friendlyErrorMessage(
      new ApiError('boom', 500, 'TEMPLATE_DEFAULT_FAILED'),
    );
    assert.match(msg, /could not|try again|server/i);
  });
});

describe('Architecture Doc type helpers', () => {
  it('includes Architecture Doc in available types', () => {
    const types = getAvailableDocumentTypes([]);
    assert.ok(types.includes('Architecture Doc'));
  });

  it('selects existing Architecture Doc without duplicating', () => {
    const result = addDocumentType('Architecture Doc', [], ['Architecture Doc', 'Product Architecture']);
    assert.equal(result.success, true);
    assert.equal(result.selectedType, 'Architecture Doc');
  });
});
