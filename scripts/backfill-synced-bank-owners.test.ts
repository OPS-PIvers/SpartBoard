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

  it('never reserves an id that only a PLC header names', () => {
    const claims = collectClaims({
      userBanks: [],
      liveBanks: [],
      plcHeaders: [{ groupId: 'g3', sharedBy: 'member' }],
    });
    expect(agreedOwner(claims.get('g3'))).toBeNull();
  });

  it('lets a PLC header veto an owner-written source', () => {
    const claims = collectClaims({
      userBanks: [{ uid: 'a', groupId: 'g4' }],
      liveBanks: [],
      plcHeaders: [{ groupId: 'g4', sharedBy: 'member' }],
    });
    expect(agreedOwner(claims.get('g4'))).toBeNull();
  });
});
