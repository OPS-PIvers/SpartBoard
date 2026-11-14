import { describe, it, expect } from 'vitest';
import { betaEmails, publicView } from './permissionMirrors';

describe('permissionMirrors', () => {
  it('publicView drops every beta email but keeps config', () => {
    const v = publicView({
      featureId: 'x',
      betaUsers: ['a@b.org'],
      config: { k: 1 },
    });
    expect(v).toEqual({ featureId: 'x', betaUsers: [], config: { k: 1 } });
  });

  it('betaEmails lowercases, trims and dedupes, ignoring junk', () => {
    expect(
      betaEmails({ betaUsers: [' A@b.org', 'a@b.org', 3, '', 'c@d.org'] })
    ).toEqual(['a@b.org', 'c@d.org']);
    expect(betaEmails(undefined)).toEqual([]);
    expect(betaEmails({ betaUsers: 'nope' })).toEqual([]);
  });
});
