import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useOrgRoles } from './useOrgRoles';
import { useAuth } from '@/context/useAuth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import type { RoleRecord } from '@/types/organization';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
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
  const mockSetDoc = setDoc as Mock;
  const mockDeleteDoc = deleteDoc as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCollection.mockReturnValue('roles-ref');
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockSetDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
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

    // Upsert only hits the custom role (system:true is skipped).
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(mockSetDoc.mock.calls[0][0]).toBe(
      'organizations/orono/roles/specialist'
    );
    expect(mockSetDoc.mock.calls[0][1]).toMatchObject({
      id: 'specialist',
      system: false,
      color: 'emerald',
    });

    // Removed custom role is deleted.
    expect(mockDeleteDoc).toHaveBeenCalledWith(
      'organizations/orono/roles/coach'
    );
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

    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    expect(mockDeleteDoc).toHaveBeenCalledWith(
      'organizations/orono/roles/coach'
    );
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
});
