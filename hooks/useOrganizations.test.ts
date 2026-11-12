import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useOrganizations } from './useOrganizations';
import { useAuth } from '@/context/useAuth';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { callOrgAdmin } from '@/utils/orgAdminClient';
import type { OrgRecord } from '@/types/organization';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('@/utils/orgAdminClient', () => ({
  callOrgAdmin: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  isAuthBypass: false,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockOrg: OrgRecord = {
  id: 'orono',
  name: 'Orono Public Schools',
  shortName: 'Orono',
  shortCode: 'OPS',
  state: 'MN',
  plan: 'full',
  aiEnabled: true,
  primaryAdminEmail: 'admin@orono.k12.mn.us',
  createdAt: '2026-01-01',
  users: 12,
  buildings: 4,
  status: 'active',
  seedColor: 'bg-indigo-600',
};

describe('useOrganizations', () => {
  const mockUseAuth = useAuth as Mock;
  const mockCollection = collection as Mock;
  const mockOnSnapshot = onSnapshot as Mock;
  const mockDoc = doc as Mock;
  const mockCall = callOrgAdmin as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCollection.mockReturnValue('organizations-ref');
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCall.mockResolvedValue(undefined);
  });

  it('does not subscribe when user is not a super admin', () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'teacher@orono.k12.mn.us' },
      userRoles: { superAdmins: ['someone-else@example.com'] },
    });

    const { result } = renderHook(() => useOrganizations());

    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.organizations).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('subscribes and loads orgs for a super admin', async () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'paul.ivers@orono.k12.mn.us' },
      userRoles: { superAdmins: ['paul.ivers@orono.k12.mn.us'] },
    });

    mockOnSnapshot.mockImplementation(
      (
        _ref: unknown,
        onNext: (snap: {
          docs: { id: string; data: () => OrgRecord }[];
        }) => void
      ) => {
        queueMicrotask(() =>
          onNext({
            docs: [{ id: 'orono', data: () => mockOrg }],
          })
        );
        return () => undefined;
      }
    );

    const { result } = renderHook(() => useOrganizations());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.organizations).toHaveLength(1);
      expect(result.current.organizations[0].id).toBe('orono');
    });
  });

  it('createOrg writes a new doc with a derived id + defaults', async () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'super@spartboard.io' },
      userRoles: { superAdmins: ['super@spartboard.io'] },
    });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrganizations());

    await act(async () => {
      await result.current.createOrg({
        name: 'New District',
        shortCode: 'ND',
        plan: 'basic',
        primaryAdminEmail: 'admin@nd.org',
      });
    });

    expect(mockCall).toHaveBeenCalledTimes(1);
    const [{ action, record: payload }] = mockCall.mock.calls[0] as [
      { action: string; record: Record<string, unknown> },
    ];
    expect(action).toBe('createOrg');
    expect(payload).toMatchObject({
      id: 'new-district',
      name: 'New District',
      shortCode: 'ND',
      plan: 'basic',
      primaryAdminEmail: 'admin@nd.org',
      status: 'trial',
      aiEnabled: false,
      users: 0,
      buildings: 0,
    });
    expect(typeof payload.createdAt).toBe('string');
  });

  it('createOrg rejects when name is missing', async () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'super@spartboard.io' },
      userRoles: { superAdmins: ['super@spartboard.io'] },
    });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrganizations());

    await expect(result.current.createOrg({})).rejects.toThrow(
      /name is required/i
    );
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('archiveOrg sets status to archived', async () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'super@spartboard.io' },
      userRoles: { superAdmins: ['super@spartboard.io'] },
    });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrganizations());

    await act(async () => {
      await result.current.archiveOrg('orono');
    });

    expect(mockCall).toHaveBeenCalledWith({
      action: 'updateOrg',
      orgId: 'orono',
      patch: { status: 'archived' },
    });
  });
});
