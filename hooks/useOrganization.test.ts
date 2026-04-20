import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useOrganization } from './useOrganization';
import { useAuth } from '@/context/useAuth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import type { OrgRecord } from '@/types/organization';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  updateDoc: vi.fn(),
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

describe('useOrganization', () => {
  const mockUseAuth = useAuth as Mock;
  const mockDoc = doc as Mock;
  const mockOnSnapshot = onSnapshot as Mock;
  const mockUpdateDoc = updateDoc as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockUpdateDoc.mockResolvedValue(undefined);
  });

  it('returns null org and clears loading when orgId is null', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    const { result } = renderHook(() => useOrganization(null));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.organization).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('subscribes and hydrates when orgId present', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockImplementation(
      (
        _ref: unknown,
        onNext: (snap: { exists: () => boolean; data: () => OrgRecord }) => void
      ) => {
        queueMicrotask(() =>
          onNext({ exists: () => true, data: () => mockOrg })
        );
        return () => undefined;
      }
    );

    const { result } = renderHook(() => useOrganization('orono'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.organization?.id).toBe('orono');
    });
  });

  it('updateOrg patches the org doc (stripping id)', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrganization('orono'));

    await act(async () => {
      await result.current.updateOrg({
        id: 'ignored',
        name: 'Orono Public',
      });
    });

    expect(mockUpdateDoc).toHaveBeenCalledWith('organizations/orono', {
      name: 'Orono Public',
    });
  });

  it('archiveOrg sets status to archived', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrganization('orono'));

    await act(async () => {
      await result.current.archiveOrg();
    });

    expect(mockUpdateDoc).toHaveBeenCalledWith('organizations/orono', {
      status: 'archived',
    });
  });

  it('updateOrg rejects when orgId is null', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useOrganization(null));
    await expect(result.current.updateOrg({ name: 'X' })).rejects.toThrow(
      /No organization/
    );
    await expect(result.current.archiveOrg()).rejects.toThrow(
      /No organization/
    );
  });
});
