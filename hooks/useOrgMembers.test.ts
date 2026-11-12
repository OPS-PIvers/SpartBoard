import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useOrgMembers } from './useOrgMembers';
import { useAuth } from '@/context/useAuth';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { callOrgAdmin } from '@/utils/orgAdminClient';
import type { MemberRecord } from '@/types/organization';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('@/utils/orgAdminClient', () => ({
  callOrgAdmin: vi.fn(),
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
  const mockCall = callOrgAdmin as Mock;
  const mockHttpsCallable = httpsCallable as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCollection.mockReturnValue('members-ref');
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCall.mockResolvedValue(undefined);
    // Default: any callable resolves with an empty activity payload. Tests that
    // exercise a specific callable (e.g. bulkInviteMembers) override this.
    mockHttpsCallable.mockReturnValue(
      vi.fn().mockResolvedValue({ data: { activity: [] } })
    );
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

    expect(mockCall).toHaveBeenCalledWith({
      action: 'updateMembers',
      orgId: 'orono',
      ids: ['paul@x.com'],
      patch: { roleId: 'teacher', status: 'inactive' },
    });
  });

  it('updateMember no-ops when patch is empty', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrgMembers('orono'));

    await act(async () => {
      await result.current.updateMember('paul@x.com', {});
    });

    expect(mockCall).not.toHaveBeenCalled();
  });

  it('bulkUpdateMembers sends every id in one server call', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrgMembers('orono'));

    await act(async () => {
      await result.current.bulkUpdateMembers(['a@x.com', 'b@x.com'], {
        status: 'inactive',
      });
    });

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall).toHaveBeenCalledWith({
      action: 'updateMembers',
      orgId: 'orono',
      ids: ['a@x.com', 'b@x.com'],
      patch: { status: 'inactive' },
    });
  });

  it('bulkUpdateMembers splits large selections into calls of 1,000', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrgMembers('orono'));

    const ids = Array.from({ length: 1500 }, (_, i) => `u${i}@x.com`);

    await act(async () => {
      await result.current.bulkUpdateMembers(ids, { status: 'inactive' });
    });

    expect(mockCall).toHaveBeenCalledTimes(2);
    const sizes = mockCall.mock.calls.map(
      (c) => (c[0] as { ids: string[] }).ids.length
    );
    expect(sizes).toEqual([1000, 500]);
  });

  it('removeMembers sends the ids to the server, which also writes the tombstones', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrgMembers('orono'));

    await act(async () => {
      await result.current.removeMembers(['a@x.com', 'b@x.com']);
    });

    expect(mockCall).toHaveBeenCalledWith({
      action: 'removeMembers',
      orgId: 'orono',
      ids: ['a@x.com', 'b@x.com'],
    });
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
      skipExisting: true,
    });
  });

  it('bulkInviteMembers short-circuits on empty intent list without calling the CF', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);
    const inviteCallable = vi.fn();
    mockHttpsCallable.mockImplementation((_fns: unknown, name: string) =>
      name === 'createOrganizationInvites'
        ? inviteCallable
        : vi.fn().mockResolvedValue({ data: { activity: [] } })
    );

    const { result } = renderHook(() => useOrgMembers('orono'));
    const response = await result.current.bulkInviteMembers([]);
    expect(inviteCallable).not.toHaveBeenCalled();
    expect(response).toEqual({ invitations: [], errors: [] });
  });

  it('inviteMembers rejects when orgId is null', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useOrgMembers(null));
    await expect(
      result.current.inviteMembers(['a@x.com'], 'teacher', [])
    ).rejects.toThrow(/No organization/);
  });

  it('clears stale members when switching between two foreign orgs', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'super-admin' } });
    const orgAMember: MemberRecord = { ...mockMember, email: 'org-a-only' };
    const orgBMember: MemberRecord = { ...mockMember, email: 'org-b-only' };
    const byOrg: Record<string, MemberRecord> = {
      'org-a': orgAMember,
      'org-b': orgBMember,
    };
    // collection() is called with (db, 'organizations', orgId, 'members');
    // return the orgId so the snapshot mock can serve org-specific data.
    mockCollection.mockImplementation(
      (_db: unknown, _orgs: string, orgId: string) => orgId
    );
    mockOnSnapshot.mockImplementation(
      (
        ref: string,
        onNext: (snap: {
          docs: { id: string; data: () => MemberRecord }[];
        }) => void
      ) => {
        const member = byOrg[ref];
        queueMicrotask(() =>
          onNext({ docs: [{ id: member.email, data: () => member }] })
        );
        return () => undefined;
      }
    );

    const { result, rerender } = renderHook(
      ({ orgId }: { orgId: string }) => useOrgMembers(orgId),
      { initialProps: { orgId: 'org-a' } }
    );
    await waitFor(() => {
      expect(result.current.members).toEqual([orgAMember]);
    });

    // Switch to org-b: org-a's members must be cleared immediately (not
    // flashed under org-b's heading) before org-b's snapshot lands.
    rerender({ orgId: 'org-b' });
    expect(result.current.members).toEqual([]);
    expect(result.current.users).toEqual([]);
    await waitFor(() => {
      expect(result.current.members).toEqual([orgBMember]);
    });
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
