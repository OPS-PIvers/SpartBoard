import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyDeactivationClaim,
  deactivationClaimSyncNeeded,
  deactivationClaimTarget,
  holdsRevokedMember,
} from './memberDeactivationClaim';

const noRevoked = () => Promise.resolve(false);

describe('deactivationClaimSyncNeeded', () => {
  it('fires on creates, deletes and revoked flips in the operator org only', () => {
    const active = { status: 'active' };
    const inactive = { status: 'inactive' };
    expect(deactivationClaimSyncNeeded('orono', active, inactive)).toBe(true);
    expect(deactivationClaimSyncNeeded('orono', inactive, active)).toBe(true);
    expect(deactivationClaimSyncNeeded('orono', inactive, null)).toBe(true);
    expect(deactivationClaimSyncNeeded('orono', null, active)).toBe(true);
    expect(deactivationClaimSyncNeeded('orono', active, active)).toBe(false);
    expect(
      deactivationClaimSyncNeeded('orono', active, { status: 'invited' })
    ).toBe(false);
    expect(deactivationClaimSyncNeeded('other-org', active, inactive)).toBe(
      false
    );
  });
});

describe('deactivationClaimTarget', () => {
  it('follows the current doc and leaves the claim for a deleted one', () => {
    expect(deactivationClaimTarget({ status: 'inactive' })).toBe('set');
    expect(deactivationClaimTarget({ status: 'active' })).toBe('clear');
    expect(deactivationClaimTarget({ status: 'invited' })).toBe('clear');
    expect(deactivationClaimTarget(null)).toBeNull();
  });
});

describe('applyDeactivationClaim', () => {
  const auth = {
    getUser: vi.fn(),
    getUserByEmail: vi.fn(),
    setCustomUserClaims: vi.fn(),
    revokeRefreshTokens: vi.fn(),
  };
  const notFound = Object.assign(new Error('nf'), {
    code: 'auth/user-not-found',
  });

  beforeEach(() => {
    for (const fn of Object.values(auth)) fn.mockReset();
    auth.setCustomUserClaims.mockResolvedValue(undefined);
    auth.revokeRefreshTokens.mockResolvedValue(undefined);
  });

  it('claims the linked uid even after its email changed, keeps other claims, and ends its sessions', async () => {
    auth.getUser.mockResolvedValue({
      uid: 'u1',
      email: 'renamed@elsewhere.org',
      customClaims: { other: 1 },
    });
    auth.getUserByEmail.mockRejectedValue(notFound);
    const uids = await applyDeactivationClaim(
      auth,
      't@orono.k12.mn.us',
      'u1',
      'set',
      undefined,
      noRevoked
    );
    expect(uids).toEqual(['u1']);
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', {
      other: 1,
      deactivated: true,
    });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('u1');
  });

  it('leaves a linked account that now signs in as another live member', async () => {
    auth.getUser.mockResolvedValue({
      uid: 'u1',
      email: 'New@orono.k12.mn.us',
      emailVerified: true,
    });
    auth.getUserByEmail.mockRejectedValue(notFound);
    const isLive = vi.fn().mockResolvedValue(true);
    const uids = await applyDeactivationClaim(
      auth,
      'old@orono.k12.mn.us',
      'u1',
      'set',
      isLive,
      noRevoked
    );
    expect(isLive).toHaveBeenCalledWith('new@orono.k12.mn.us');
    expect(uids).toEqual([]);
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('does not clear a linked account still held by a revoked member', async () => {
    auth.getUser.mockResolvedValue({
      uid: 'u1',
      email: 'x@orono.k12.mn.us',
      customClaims: { deactivated: true },
    });
    auth.getUserByEmail.mockRejectedValue(notFound);
    const holds = vi.fn().mockResolvedValue(true);
    const uids = await applyDeactivationClaim(
      auth,
      'x@orono.k12.mn.us',
      'u1',
      'clear',
      undefined,
      holds
    );
    expect(uids).toEqual([]);
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('also claims a different account holding the address', async () => {
    auth.getUser.mockResolvedValue({ uid: 'u1' });
    auth.getUserByEmail.mockResolvedValue({ uid: 'u2' });
    await applyDeactivationClaim(
      auth,
      't@x.org',
      'u1',
      'set',
      undefined,
      noRevoked
    );
    expect(auth.revokeRefreshTokens.mock.calls).toEqual([['u1'], ['u2']]);
  });

  it('clears only the deactivation claim and never revokes on reactivation', async () => {
    auth.getUserByEmail.mockResolvedValue({
      uid: 'u1',
      customClaims: { other: 1, deactivated: true },
    });
    await applyDeactivationClaim(
      auth,
      't@x.org',
      undefined,
      'clear',
      undefined,
      noRevoked
    );
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', { other: 1 });
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('does nothing for an address with no account', async () => {
    auth.getUserByEmail.mockRejectedValue(notFound);
    expect(
      await applyDeactivationClaim(
        auth,
        't@x.org',
        '',
        'set',
        undefined,
        noRevoked
      )
    ).toEqual([]);
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('claims a linked account whose new address is unverified (security #10)', async () => {
    auth.getUser.mockResolvedValue({
      uid: 'u1',
      email: 'live@orono.k12.mn.us',
      emailVerified: false,
    });
    auth.getUserByEmail.mockRejectedValue(notFound);
    const uids = await applyDeactivationClaim(
      auth,
      'old@orono.k12.mn.us',
      'u1',
      'set',
      vi.fn().mockResolvedValue(true),
      noRevoked
    );
    expect(uids).toEqual(['u1']);
  });
});

describe('holdsRevokedMember (security #10)', () => {
  const fakeDb = (docs: Record<string, Record<string, unknown>>) =>
    ({
      doc: (path: string) => ({
        get: () =>
          Promise.resolve({
            exists: path in docs,
            get: (k: string) => docs[path]?.[k],
          }),
      }),
      collection: (path: string) => ({
        where: (_f: string, _op: string, uid: string) => ({
          get: () =>
            Promise.resolve({
              docs: Object.entries(docs)
                .filter(
                  ([p, d]) => p.startsWith(`${path}/`) && d.uid === uid
                )
                .map(([, d]) => ({ get: (k: string) => d[k] })),
            }),
        }),
      }),
    }) as never;
  const user = { uid: 'u1', email: 'a@orono.k12.mn.us' };

  it('holds while the current address is revoked or removed', async () => {
    expect(
      await holdsRevokedMember(
        fakeDb({
          'organizations/orono/members/a@orono.k12.mn.us': { status: 'inactive' },
        }),
        'orono',
        user
      )
    ).toBe(true);
    expect(
      await holdsRevokedMember(
        fakeDb({ 'organizations/orono/removedMembers/a@orono.k12.mn.us': {} }),
        'orono',
        user
      )
    ).toBe(true);
  });

  it('holds while another member doc linked to the uid is revoked', async () => {
    expect(
      await holdsRevokedMember(
        fakeDb({
          'organizations/orono/members/a@orono.k12.mn.us': { status: 'active' },
          'organizations/orono/members/old@orono.k12.mn.us': {
            status: 'inactive',
            uid: 'u1',
          },
        }),
        'orono',
        user
      )
    ).toBe(true);
    expect(
      await holdsRevokedMember(
        fakeDb({
          'organizations/orono/members/a@orono.k12.mn.us': { status: 'active' },
        }),
        'orono',
        user
      )
    ).toBe(false);
  });
});
