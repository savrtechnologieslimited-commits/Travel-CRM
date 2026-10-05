import { describe, expect, it } from 'vitest';
import { resolveCrmContactMatch } from './crm-contact-match';

describe('resolveCrmContactMatch', () => {
  it('matches one exact email candidate', () => {
    expect(resolveCrmContactMatch(['contact-a'], [])).toEqual({
      status: 'matched',
      contactId: 'contact-a',
      matchedBy: 'email',
    });
  });

  it('matches one exact phone candidate', () => {
    expect(resolveCrmContactMatch([], ['contact-a'])).toEqual({
      status: 'matched',
      contactId: 'contact-a',
      matchedBy: 'phone',
    });
  });

  it('recognizes email and phone matching the same contact', () => {
    expect(resolveCrmContactMatch(['contact-a'], ['contact-a'])).toEqual({
      status: 'matched',
      contactId: 'contact-a',
      matchedBy: 'email_and_phone',
    });
  });

  it('keeps distinct email and phone candidates ambiguous', () => {
    expect(resolveCrmContactMatch(['contact-a'], ['contact-b'])).toEqual({
      status: 'ambiguous',
      candidateCount: 2,
    });
  });

  it('deduplicates repeated candidate IDs across lookup keys', () => {
    expect(
      resolveCrmContactMatch(['contact-a', 'contact-a'], ['contact-a'])
    ).toEqual({
      status: 'matched',
      contactId: 'contact-a',
      matchedBy: 'email_and_phone',
    });
  });

  it('returns unmatched when no candidates exist', () => {
    expect(resolveCrmContactMatch([], [])).toEqual({ status: 'unmatched' });
  });
});
