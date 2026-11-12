import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useOrgRoles } from './useOrgRoles';
import { useAuth } from '@/context/useAuth';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { callOrgAdmin } from '@/utils/orgAdminClient';
import type { RoleRecord } from '@/types/organization';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
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

const systemRole = {
  id: 'teacher',
  name: 'Teacher',
  blurb: 'Default teacher role',
  color: 'sky',
  system: true,
  perms: {},
} as unknown as RoleRecord;

const customRole = {
  id: 'coach',
  name: 'Instructional Coach',
  blurb: 'Supports teachers',
  color: 'teal',
  system: false,
  perms: {},
} as unknown as RoleRecord;

describe('useOrgRoles', () => {
  const mockUseAuth = useAuth as Mock;
  const mockCollection = collection as Mock;
  const mockOnSnapshot = onSnapshot as Mock;
  const mockDoc = doc as Mock;
  const mockCall = callOrgAdmin as Mock;
  const lastSave = () =>
    mockCall.mock.calls[mockCall.mock.calls.length - 1][0] as {
      action: string;
      orgId: string;
      upserts: Array<Record<string, unknown>>;
      systemPerms: Array<{ id: string; perms: unknown }>;
      deletes: string[];
    };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCollection.mockReturnValue('roles-ref');
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCall.mockResolvedValue(undefined);
  });

  // Helper: seed the hook with a given roles snapshot and return the result
  // handle. Pattern lifted from the other org hooks.
  const seedRoles = (rolesSeed: RoleRecord[]) => {
    mockOnSnapshot.mockImplementation(
      (
        _ref: unknown,
        onNext: (snap: {
          docs: { id: string; data: () => RoleRecord }[];
        }) => void
      ) => {
        queueMicrotask(() =>
          onNext({
            docs: rolesSeed.map((r) => ({ id: r.id, data: () => r })),
          })
        );
        return () => undefined;
      }
    );
  };

  it('skips subscription when orgId is null', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    const { result } = renderHook(() => useOrgRoles(null));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.roles).toEqual([]);
  });

  it('hydrates roles from snapshot', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    seedRoles([systemRole]);

    const { result } = renderHook(() => useOrgRoles('orono'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.roles).toHaveLength(1);
      expect(result.current.roles[0].id).toBe('teacher');
    });
  });

  it('saveRoles upserts non-system roles and deletes removed custom roles', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    seedRoles([systemRole, customRole]);

    const { result } = renderHook(() => useOrgRoles('orono'));
    await waitFor(() => {
      expect(result.current.roles).toHaveLength(2);
    });

    // Working set: keep the system role, drop `coach`, add a new custom role.
    const newCustom = {
      id: 'specialist',
      name: 'Specialist',
      blurb: '',
      color: 'emerald',
      system: false,
      perms: {},
    } as unknown as RoleRecord;

    await act(async () => {
      await result.current.saveRoles([systemRole, newCustom]);
    });

    // One call: upsert only the custom role (system:true is skipped), delete the removed one.
    expect(mockCall).toHaveBeenCalledTimes(1);
    const req = lastSave();
    expect(req.action).toBe('saveRoles');
    expect(req.orgId).toBe('orono');
    expect(req.upserts).toEqual([
      {
        id: 'specialist',
        name: 'Specialist',
        blurb: '',
        color: 'emerald',
        perms: {},
      },
    ]);
    expect(req.systemPerms).toEqual([]);
    expect(req.deletes).toEqual(['coach']);
  });

  it('resetRoles deletes every custom role but keeps system roles', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    seedRoles([systemRole, customRole]);

    const { result } = renderHook(() => useOrgRoles('orono'));
    await waitFor(() => {
      expect(result.current.roles).toHaveLength(2);
    });

    await act(async () => {
      await result.current.resetRoles();
    });

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(lastSave()).toMatchObject({
      upserts: [],
      systemPerms: [],
      deletes: ['coach'],
    });
  });

  it('writes reject when orgId is null', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useOrgRoles(null));
    await expect(result.current.saveRoles([])).rejects.toThrow(
      /No organization/
    );
    await expect(result.current.resetRoles()).rejects.toThrow(
      /No organization/
    );
  });

  it('saveRoles patches system role perms via updateDoc when canEditSystemRoles is true', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    seedRoles([systemRole]);

    const { result } = renderHook(() => useOrgRoles('orono'));
    await waitFor(() => {
      expect(result.current.roles).toHaveLength(1);
    });

    const edited = {
      ...systemRole,
      perms: { viewBoards: 'full' },
    } as unknown as RoleRecord;

    await act(async () => {
      await result.current.saveRoles([edited], { canEditSystemRoles: true });
    });

    // System roles only ever send perms, never a full upsert.
    expect(lastSave().systemPerms).toEqual([
      { id: 'teacher', perms: { viewBoards: 'full' } },
    ]);
    expect(lastSave().upserts).toEqual([]);
  });

  it('saveRoles does not touch system roles when canEditSystemRoles is false', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    seedRoles([systemRole]);

    const { result } = renderHook(() => useOrgRoles('orono'));
    await waitFor(() => {
      expect(result.current.roles).toHaveLength(1);
    });

    const edited = {
      ...systemRole,
      perms: { viewBoards: 'full' },
    } as unknown as RoleRecord;

    // Default options (no canEditSystemRoles) — domain admins hit this path.
    await act(async () => {
      await result.current.saveRoles([edited]);
    });

    expect(lastSave().systemPerms).toEqual([]);
  });

  it('saveRoles skips system role update when perms are unchanged (even with canEditSystemRoles)', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    // Seed with two keys in a known insertion order.
    const seeded = {
      ...systemRole,
      perms: { viewBoards: 'full', editBoards: 'building' },
    } as unknown as RoleRecord;
    seedRoles([seeded]);

    const { result } = renderHook(() => useOrgRoles('orono'));
    await waitFor(() => {
      expect(result.current.roles).toHaveLength(1);
    });

    // Same content, opposite insertion order — permsEqual must treat these as
    // equal so we don't issue a no-op Firestore write just because the keys
    // came back in a different order from the snapshot.
    const sameContent = {
      ...systemRole,
      perms: { editBoards: 'building', viewBoards: 'full' },
    } as unknown as RoleRecord;

    await act(async () => {
      await result.current.saveRoles([sameContent], {
        canEditSystemRoles: true,
      });
    });

    expect(lastSave().systemPerms).toEqual([]);
  });
});
