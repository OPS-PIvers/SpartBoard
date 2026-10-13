import { describe, expect, it } from 'vitest';
import { personName } from './personName';

describe('personName', () => {
  it('turns an email handle into First Last', () => {
    expect(
      personName({ displayName: 'paul.ivers', email: 'paul.ivers@x.org' })
    ).toBe('Paul Ivers');
    expect(personName({ displayName: 'bailey.nett' })).toBe('Bailey Nett');
  });

  it('keeps a real name', () => {
    expect(
      personName({ displayName: 'Paul Ivers', email: 'paul.ivers@x.org' })
    ).toBe('Paul Ivers');
    expect(personName({ displayName: 'Cher', email: 'c@x.org' })).toBe('Cher');
  });

  it('falls back to the email', () => {
    expect(personName({ displayName: '', email: 'jo_ann.lee@x.org' })).toBe(
      'Jo Ann Lee'
    );
    expect(personName({ displayName: 'sam.k@x.org' })).toBe('Sam K');
  });
});
