import {
  assertEmailList,
  emailListIncludes,
  normalizeEmailList,
  parseEmailList,
} from '../email-list';

describe('email-list', () => {
  it('parses comma and semicolon lists', () => {
    expect(parseEmailList('a@x.com; b@y.com, c@z.com')).toEqual([
      'a@x.com',
      'b@y.com',
      'c@z.com',
    ]);
  });

  it('normalizes and validates lists', () => {
    expect(normalizeEmailList('a@x.com; b@y.com')).toBe('a@x.com; b@y.com');
    expect(assertEmailList('a@x.com;b@y.com')).toEqual(['a@x.com', 'b@y.com']);
    let failed = false;
    try {
      assertEmailList('not-an-email', { required: true });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });

  it('matches any address in a multi-email field', () => {
    expect(emailListIncludes('a@x.com; b@y.com', 'B@Y.COM')).toBe(true);
    expect(emailListIncludes('a@x.com; b@y.com', 'c@z.com')).toBe(false);
  });
});
