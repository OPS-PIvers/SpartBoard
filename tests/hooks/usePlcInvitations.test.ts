import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import * as firestore from 'firebase/firestore';
import { usePlcInvitations } from '@/hooks/usePlcInvitations';
import { useAuth } from '@/context/useAuth';
import type { PlcInvitation } from '@/types';

vi.mock('firebase/firestore');

vi.mock('../../context/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  isAuthBypass: false,
}));

const mockUseAuth = useAuth as unknown as Mock;

const makeInvite = (overrides: Partial<PlcInvitation> = {}): PlcInvitation => ({
  id: 'plc-1_invitee@example.com',
  plcId: 'plc-1',
  plcName: 'Grade 3 Math',
  inviteeEmailLower: 'invitee@example.com',
  invitedByUid: 'lead-uid',
  invitedByName: 'Lead Teacher',
  invitedAt: 1_700_000_000_000,
  status: 'pending',
  ...overrides,
});

describe('usePlcInvitations — acceptInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: {
        uid: 'invitee-uid',
        email: 'Invitee@Example.com',
        displayName: 'Invitee Teacher',
      },
    });

    // onSnapshot subscribes twice (pending + sent). Return a no-op unsubscribe
    // and don't deliver any snapshot so state stays quiet.
    (firestore.onSnapshot as unknown as Mock).mockImplementation(() => vi.fn());
    (firestore.collection as unknown as Mock).mockReturnValue({});
    (firestore.query as unknown as Mock).mockReturnValue({});
    (firestore.where as unknown as Mock).mockReturnValue({});
    (firestore.doc as unknown as Mock).mockImplementation(
      (_db: unknown, col: string, id: string) => ({ __ref: `${col}/${id}` })
    );

    // arrayUnion is opaque — return a sentinel we can assert on.
    (firestore.arrayUnion as unknown as Mock).mockImplementation(
      (...values: unknown[]) => ({ __arrayUnion: values })
    );
  });

  it('issues a blind PLC update with arrayUnion + dotted memberEmails path', async () => {
    const updates: Array<{ ref: unknown; patch: Record<string, unknown> }> = [];
    type TxShape = {
      update: (ref: unknown, patch: Record<string, unknown>) => void;
    };
    const tx: TxShape = {
      update: (ref, patch) => {
        updates.push({ ref, patch });
      },
    };
    (firestore.runTransaction as unknown as Mock).mockImplementation(
      async (_db: unknown, fn: (tx: TxShape) => Promise<void>) => {
        await fn(tx);
      }
    );

    const { result } = renderHook(() => usePlcInvitations());
    await act(async () => {
      await result.current.acceptInvite(makeInvite());
    });

    // No `tx.get` should have been attempted — blind write only.
    expect(updates).toHaveLength(2);

    const plcUpdate = updates.find(
      (u) => (u.ref as { __ref: string }).__ref === 'plcs/plc-1'
    );
    expect(plcUpdate).toBeDefined();
    expect(plcUpdate?.patch).toMatchObject({
      memberUids: { __arrayUnion: ['invitee-uid'] },
      'memberEmails.invitee-uid': 'invitee@example.com',
    });
    expect(plcUpdate?.patch).toHaveProperty('updatedAt');

    const inviteUpdate = updates.find(
      (u) =>
        (u.ref as { __ref: string }).__ref ===
        'plc_invitations/plc-1_invitee@example.com'
    );
    expect(inviteUpdate?.patch).toMatchObject({ status: 'accepted' });
    expect(inviteUpdate?.patch).toHaveProperty('respondedAt');
  });

  it('falls back to closing out the invite on permission-denied (already-a-member edge case)', async () => {
    (firestore.runTransaction as unknown as Mock).mockRejectedValueOnce(
      Object.assign(new Error('denied'), { code: 'permission-denied' })
    );
    (firestore.updateDoc as unknown as Mock).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => usePlcInvitations());
    await act(async () => {
      await result.current.acceptInvite(makeInvite());
    });

    expect(firestore.updateDoc).toHaveBeenCalledTimes(1);
    const [ref, patch] = (firestore.updateDoc as unknown as Mock).mock.calls[0];
    expect((ref as { __ref: string }).__ref).toBe(
      'plc_invitations/plc-1_invitee@example.com'
    );
    expect(patch).toMatchObject({ status: 'accepted' });
    expect(patch).toHaveProperty('respondedAt');
  });

  it('rethrows non-permission errors from the transaction', async () => {
    (firestore.runTransaction as unknown as Mock).mockRejectedValueOnce(
      Object.assign(new Error('boom'), { code: 'unavailable' })
    );

    const { result } = renderHook(() => usePlcInvitations());
    await expect(result.current.acceptInvite(makeInvite())).rejects.toThrow(
      'boom'
    );
    expect(firestore.updateDoc).not.toHaveBeenCalled();
  });

  it('rejects an invite addressed to a different account before touching Firestore', async () => {
    const { result } = renderHook(() => usePlcInvitations());
    await expect(
      result.current.acceptInvite(
        makeInvite({ inviteeEmailLower: 'someone.else@example.com' })
      )
    ).rejects.toThrow('different account');
    expect(firestore.runTransaction).not.toHaveBeenCalled();
  });

  it('rejects a stale non-pending invite with a friendly message', async () => {
    const { result } = renderHook(() => usePlcInvitations());
    await expect(
      result.current.acceptInvite(makeInvite({ status: 'declined' }))
    ).rejects.toThrow('no longer pending');
    expect(firestore.runTransaction).not.toHaveBeenCalled();
  });
});
