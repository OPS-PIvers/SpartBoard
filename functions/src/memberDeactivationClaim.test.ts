import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyDeactivationClaim,
  deactivationClaimChange,
} from './memberDeactivationClaim';

describe('deactivationClaimChange', () => {
  it('sets on deactivation and clears on reactivation or removal, operator org only', () => {
    const active = { status: 'active' };
    const inactive = { status: 'inactive' };
    expect(deactivationClaimChange('orono', active, inactive)).toBe('set');
    expect(deactivationClaimChange('orono', null, inactive)).toBe('set');
    expect(deactivationClaimChange('orono', inactive, active)).toBe('clear');
    expect(deactivationClaimChange('orono', inactive, null)).toBe('clear');
    expect(
      deactivationClaimChange('orono', inactive, { status: 'removed' })
    ).toBeNull();
    expect(
      deactivationClaimChange('orono', active, { status: 'invited' })
    ).toBeNull();
    expect(deactivationClaimChange('other-org', active, inactive)).toBeNull();
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
      'set'
    );
    expect(uids).toEqual(['u1']);
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', {
      other: 1,
      deactivated: true,
    });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('u1');
  });

  it('also claims a different account holding the address', async () => {
    auth.getUser.mockResolvedValue({ uid: 'u1' });
    auth.getUserByEmail.mockResolvedValue({ uid: 'u2' });
    await applyDeactivationClaim(auth, 't@x.org', 'u1', 'set');
    expect(auth.revokeRefreshTokens.mock.calls).toEqual([['u1'], ['u2']]);
  });

  it('clears only the deactivation claim and never revokes on reactivation', async () => {
    auth.getUserByEmail.mockResolvedValue({
      uid: 'u1',
      customClaims: { other: 1, deactivated: true },
    });
    await applyDeactivationClaim(auth, 't@x.org', undefined, 'clear');
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', { other: 1 });
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('does nothing for an address with no account', async () => {
    auth.getUserByEmail.mockRejectedValue(notFound);
    expect(await applyDeactivationClaim(auth, 't@x.org', '', 'set')).toEqual(
      []
    );
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });
});
