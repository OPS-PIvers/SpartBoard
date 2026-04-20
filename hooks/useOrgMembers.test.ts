import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useOrgMembers } from './useOrgMembers';
import { useAuth } from '@/context/useAuth';
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { MemberRecord } from '@/types/organization';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  functions: {},
  isAuthBypass: false,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockMember: MemberRecord = {
  email: 'paul.ivers@orono.k12.mn.us',
  orgId: 'orono',
  roleId: 'super_admin',
  buildingIds: ['middle'],
  status: 'active',
  invitedAt: '2026-01-01',
  lastActive: null,
};

describe('useOrgMembers', () => {
  const mockUseAuth = useAuth as Mock;
  const mockCollection = collection as Mock;
  const mockOnSnapshot = onSnapshot as Mock;
  const mockDoc = doc as Mock;
  const mockUpdateDoc = updateDoc as Mock;
  const mockWriteBatch = writeBatch as Mock;
  const batchUpdate = vi.fn();
  const batchDelete = vi.fn();
  const batchCommit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCollection.mockReturnValue('members-ref');
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockUpdateDoc.mockResolvedValue(undefined);
    batchUpdate.mockReset();
    batchDelete.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      update: batchUpdate,
      delete: batchDelete,
      commit: batchCommit,
    });
  });

  it('skips subscription when orgId is null', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    const { result } = renderHook(() => useOrgMembers(null));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.members).toEqual([]);
    expect(result.current.users).toEqual([]);
  });

  it('hydrates members + derives UserRecord view model', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockImplementation(
      (
        _ref: unknown,
        onNext: (snap: {
          docs: { id: string; data: () => MemberRecord }[];
        }) => void
      ) => {
        queueMicrotask(() =>
          onNext({
            docs: [{ id: mockMember.email, data: () => mockMember }],
          })
        );
        return () => undefined;
      }
    );

    const { result } = renderHook(() => useOrgMembers('orono'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.members).toHaveLength(1);
      expect(result.current.users).toHaveLength(1);
      expect(result.current.users[0].email).toBe(mockMember.email);
      expect(result.current.users[0].name).toMatch(/Paul/); // derived from email local-part
      expect(result.current.users[0].role).toBe('super_admin');
    });
  });

  it('updateMember translates role → roleId and strips identity fields', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrgMembers('orono'));

    await act(async () => {
      await result.current.updateMember('paul@x.com', {
        id: 'ignored',
        email: 'ignored',
        orgId: 'ignored',
        role: 'teacher',
        status: 'inactive',
      });
    });

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'organizations/orono/members/paul@x.com',
      { roleId: 'teacher', status: 'inactive' }
    );
  });

  it('updateMember no-ops when patch is empty', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrgMembers('orono'));

    await act(async () => {
      await result.current.updateMember('paul@x.com', {});
    });

    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('bulkUpdateMembers batches writes via writeBatch', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrgMembers('orono'));

    await act(async () => {
      await result.current.bulkUpdateMembers(['a@x.com', 'b@x.com'], {
        status: 'inactive',
      });
    });

    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(batchUpdate).toHaveBeenCalledTimes(2);
    expect(batchUpdate).toHaveBeenCalledWith(
      'organizations/orono/members/a@x.com',
      { status: 'inactive' }
    );
    expect(batchUpdate).toHaveBeenCalledWith(
      'organizations/orono/members/b@x.com',
      { status: 'inactive' }
    );
    expect(batchCommit).toHaveBeenCalledTimes(1);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('bulkUpdateMembers chunks batches at the 400-op ceiling', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrgMembers('orono'));

    const ids = Array.from({ length: 450 }, (_, i) => `u${i}@x.com`);

    await act(async () => {
      await result.current.bulkUpdateMembers(ids, { status: 'inactive' });
    });

    expect(mockWriteBatch).toHaveBeenCalledTimes(2);
    expect(batchUpdate).toHaveBeenCalledTimes(450);
    expect(batchCommit).toHaveBeenCalledTimes(2);
  });

  it('removeMembers batches deletes via writeBatch', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrgMembers('orono'));

    await act(async () => {
      await result.current.removeMembers(['a@x.com', 'b@x.com']);
    });

    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(batchDelete).toHaveBeenCalledTimes(2);
    expect(batchDelete).toHaveBeenCalledWith(
      'organizations/orono/members/a@x.com'
    );
    expect(batchDelete).toHaveBeenCalledWith(
      'organizations/orono/members/b@x.com'
    );
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('inviteMembers calls the createOrganizationInvites callable with the correct payload', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const mockCallable = vi.fn().mockResolvedValue({
      data: {
        invitations: [
          {
            email: 'a@x.com',
            token: 't',
            claimUrl: 'https://x/invite/t',
            status: 'created',
          },
        ],
        errors: [],
      },
    });
    (httpsCallable as Mock).mockReturnValue(mockCallable);

    const { result } = renderHook(() => useOrgMembers('orono'));

    const response = await result.current.inviteMembers(
      ['a@x.com'],
      'teacher',
      ['high'],
      'welcome'
    );

    expect(httpsCallable).toHaveBeenCalledWith(
      expect.anything(),
      'createOrganizationInvites'
    );
    expect(mockCallable).toHaveBeenCalledWith({
      orgId: 'orono',
      invitations: [
        { email: 'a@x.com', roleId: 'teacher', buildingIds: ['high'] },
      ],
      message: 'welcome',
    });
    expect(response.invitations).toHaveLength(1);
    // The hook rewrites the CF-minted claimUrl with one pinned to the
    // current browser origin so invite links stay on the deploy the admin
    // is using. In jsdom that origin is http://localhost:3000.
    expect(response.invitations[0]?.claimUrl).toBe(
      `${window.location.origin}/invite/t`
    );
  });

  it('bulkInviteMembers passes per-row role + buildings through unchanged', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const mockCallable = vi
      .fn()
      .mockResolvedValue({ data: { invitations: [], errors: [] } });
    (httpsCallable as Mock).mockReturnValue(mockCallable);

    const { result } = renderHook(() => useOrgMembers('orono'));

    await result.current.bulkInviteMembers([
      { email: 'a@x.com', roleId: 'teacher', buildingIds: ['high'] },
      { email: 'b@x.com', roleId: 'domain_admin', buildingIds: [] },
    ]);

    expect(mockCallable).toHaveBeenCalledWith({
      orgId: 'orono',
      invitations: [
        { email: 'a@x.com', roleId: 'teacher', buildingIds: ['high'] },
        { email: 'b@x.com', roleId: 'domain_admin', buildingIds: [] },
      ],
      message: undefined,
    });
  });

  it('bulkInviteMembers short-circuits on empty intent list without calling the CF', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);
    const mockCallable = vi.fn();
    (httpsCallable as Mock).mockReturnValue(mockCallable);

    const { result } = renderHook(() => useOrgMembers('orono'));
    const response = await result.current.bulkInviteMembers([]);
    expect(mockCallable).not.toHaveBeenCalled();
    expect(response).toEqual({ invitations: [], errors: [] });
  });

  it('inviteMembers rejects when orgId is null', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useOrgMembers(null));
    await expect(
      result.current.inviteMembers(['a@x.com'], 'teacher', [])
    ).rejects.toThrow(/No organization/);
  });

  it('writes reject when orgId is null', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useOrgMembers(null));
    await expect(
      result.current.updateMember('x', { status: 'active' })
    ).rejects.toThrow(/No organization/);
    await expect(
      result.current.bulkUpdateMembers(['x'], { status: 'active' })
    ).rejects.toThrow(/No organization/);
    await expect(result.current.removeMembers(['x'])).rejects.toThrow(
      /No organization/
    );
  });
});
