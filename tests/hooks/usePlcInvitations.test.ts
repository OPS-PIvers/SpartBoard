import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import * as firestore from 'firebase/firestore';
import { usePlcInvitations } from '@/hooks/usePlcInvitations';
import { useAuth } from '@/context/useAuth';
import type { PlcInvitation } from '@/types';
import { callPlcMembership } from '@/utils/plcMembershipClient';

vi.mock('firebase/firestore');

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  isAuthBypass: false,
}));

vi.mock('@/utils/plcMembershipClient', () => ({
  callPlcMembership: vi.fn(),
}));

const mockUseAuth = useAuth as unknown as Mock;
const mockCall = callPlcMembership as Mock;

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
  });

  it('asks the server to accept the invite by id', async () => {
    mockCall.mockResolvedValue({ changed: true });
    const { result } = renderHook(() => usePlcInvitations());
    await act(async () => {
      await result.current.acceptInvite(makeInvite());
    });
    expect(mockCall).toHaveBeenCalledWith({
      action: 'acceptInvite',
      inviteId: 'plc-1_invitee@example.com',
    });
    expect(firestore.runTransaction).not.toHaveBeenCalled();
  });

  it('passes a server refusal through', async () => {
    mockCall.mockRejectedValue(new Error('Invitation is no longer pending'));
    const { result } = renderHook(() => usePlcInvitations());
    await expect(result.current.acceptInvite(makeInvite())).rejects.toThrow(
      'no longer pending'
    );
  });

  it('rejects an invite addressed to a different account before touching Firestore', async () => {
    const { result } = renderHook(() => usePlcInvitations());
    await expect(
      result.current.acceptInvite(
        makeInvite({ inviteeEmailLower: 'someone.else@example.com' })
      )
    ).rejects.toThrow('different account');
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('rejects a stale non-pending invite with a friendly message', async () => {
    const { result } = renderHook(() => usePlcInvitations());
    await expect(
      result.current.acceptInvite(makeInvite({ status: 'declined' }))
    ).rejects.toThrow('no longer pending');
    expect(mockCall).not.toHaveBeenCalled();
  });
});
