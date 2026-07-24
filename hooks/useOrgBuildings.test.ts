import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import React from 'react';
import { useOrgBuildings } from './useOrgBuildings';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import type { BuildingRecord } from '@/types/organization';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  isAuthBypass: false,
}));

const makeAuthWrapper = (
  user: Partial<User> | null,
  extra: Partial<AuthContextType> = {}
) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      AuthContext.Provider,
      { value: { user, ...extra } as unknown as AuthContextType },
      children
    );
  Wrapper.displayName = 'AuthContextTestWrapper';
  return Wrapper;
};

const mockBuilding: BuildingRecord = {
  id: 'schumann',
  orgId: 'orono',
  name: 'Schumann Elementary',
  type: 'elementary',
  address: '123 Elm',
  grades: 'K-2',
  users: 3,
  adminEmails: [],
};

describe('useOrgBuildings', () => {
  const mockCollection = collection as Mock;
  const mockOnSnapshot = onSnapshot as Mock;
  const mockDoc = doc as Mock;
  const mockSetDoc = setDoc as Mock;
  const mockUpdateDoc = updateDoc as Mock;
  const mockDeleteDoc = deleteDoc as Mock;

  const withUser = makeAuthWrapper({ uid: 'u' });
  const withoutUser = makeAuthWrapper(null);

  beforeEach(() => {
    vi.clearAllMocks();
    mockCollection.mockReturnValue('buildings-ref');
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockSetDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
  });

  it('skips subscription when orgId is null', () => {
    const { result } = renderHook(() => useOrgBuildings(null), {
      wrapper: withUser,
    });
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.buildings).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('hydrates buildings from snapshot', async () => {
    mockOnSnapshot.mockImplementation(
      (
        _ref: unknown,
        onNext: (snap: {
          docs: { id: string; data: () => BuildingRecord }[];
        }) => void
      ) => {
        queueMicrotask(() =>
          onNext({ docs: [{ id: 'schumann', data: () => mockBuilding }] })
        );
        return () => undefined;
      }
    );

    const { result } = renderHook(() => useOrgBuildings('orono'), {
      wrapper: withUser,
    });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.buildings).toHaveLength(1);
      expect(result.current.buildings[0].id).toBe('schumann');
    });
  });

  it('reuses AuthContext.orgBuildings for the active org without a second listener', () => {
    const authBuilding: BuildingRecord = {
      ...mockBuilding,
      id: 'auth-provided',
    };
    const wrapper = makeAuthWrapper(
      { uid: 'u' },
      {
        orgId: 'orono',
        orgBuildings: [authBuilding],
        orgBuildingsLoaded: true,
      }
    );

    const { result } = renderHook(() => useOrgBuildings('orono'), { wrapper });

    // No redundant subscription on the path AuthContext already watches.
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.buildings).toEqual([authBuilding]);
  });

  it('reflects AuthContext loading state while its buildings snapshot is pending', () => {
    const wrapper = makeAuthWrapper(
      { uid: 'u' },
      { orgId: 'orono', orgBuildings: [], orgBuildingsLoaded: false }
    );

    const { result } = renderHook(() => useOrgBuildings('orono'), { wrapper });

    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
    expect(result.current.buildings).toEqual([]);
  });

  it('opens its own subscription when inspecting a different org than the active one', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const wrapper = makeAuthWrapper(
      { uid: 'u' },
      {
        orgId: 'orono',
        orgBuildings: [mockBuilding],
        orgBuildingsLoaded: true,
      }
    );

    // Super admin inspecting a different org must not receive the active org's
    // buildings — it falls through to a dedicated listener.
    renderHook(() => useOrgBuildings('other-district'), { wrapper });

    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
    expect(mockCollection).toHaveBeenCalledWith(
      expect.anything(),
      'organizations',
      'other-district',
      'buildings'
    );
  });

  it('addBuilding writes a new doc with a derived id', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrgBuildings('orono'), {
      wrapper: withUser,
    });

    await act(async () => {
      await result.current.addBuilding({
        name: 'New School',
        type: 'middle',
      });
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = mockSetDoc.mock.calls[0] as [string, unknown];
    expect(ref).toBe('organizations/orono/buildings/new-school');
    expect(payload).toMatchObject({
      id: 'new-school',
      orgId: 'orono',
      name: 'New School',
      type: 'middle',
      address: '',
      grades: '',
      users: 0,
      adminEmails: [],
    });
  });

  it('updateBuilding patches the doc (stripping id/orgId)', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrgBuildings('orono'), {
      wrapper: withUser,
    });

    await act(async () => {
      await result.current.updateBuilding('schumann', {
        id: 'ignored',
        orgId: 'ignored',
        address: '456 Oak',
      });
    });

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'organizations/orono/buildings/schumann',
      { address: '456 Oak' }
    );
  });

  it('removeBuilding deletes the doc', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrgBuildings('orono'), {
      wrapper: withUser,
    });

    await act(async () => {
      await result.current.removeBuilding('schumann');
    });

    expect(mockDeleteDoc).toHaveBeenCalledWith(
      'organizations/orono/buildings/schumann'
    );
  });

  it('writes reject when orgId is null', async () => {
    const { result } = renderHook(() => useOrgBuildings(null), {
      wrapper: withoutUser,
    });
    await expect(result.current.addBuilding({ name: 'x' })).rejects.toThrow(
      /No organization/
    );
    await expect(result.current.updateBuilding('x', {})).rejects.toThrow(
      /No organization/
    );
    await expect(result.current.removeBuilding('x')).rejects.toThrow(
      /No organization/
    );
  });
});
