import { describe, expect, it } from 'vitest';
import { agreedOwner, collectClaims } from './backfill-synced-bank-owners.mjs';

describe('backfill-synced-bank-owners', () => {
  it('reserves an id every source agrees on', () => {
    const claims = collectClaims({
      userBanks: [{ uid: 'a', groupId: 'g1' }],
      liveBanks: [{ groupId: 'g1', ownerUid: 'a' }],
      plcHeaders: [{ groupId: 'g1', sharedBy: 'a' }],
    });
    expect(agreedOwner(claims.get('g1'))).toBe('a');
  });

  it('leaves an id whose sources disagree for a person', () => {
    const claims = collectClaims({
      userBanks: [{ uid: 'a', groupId: 'g1' }],
      liveBanks: [{ groupId: 'g1', ownerUid: 'attacker' }],
      plcHeaders: [],
    });
    expect(agreedOwner(claims.get('g1'))).toBeNull();
  });

  it('ignores metadata without a group id and empty uids', () => {
    const claims = collectClaims({
      userBanks: [{ uid: 'a', groupId: undefined }],
      liveBanks: [],
      plcHeaders: [{ groupId: 'g2', sharedBy: '' }],
    });
    expect(claims.has('undefined')).toBe(false);
    expect(agreedOwner(claims.get('g2'))).toBeNull();
  });
});
