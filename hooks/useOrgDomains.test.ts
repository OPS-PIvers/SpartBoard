import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useOrgDomains } from './useOrgDomains';
import { useAuth } from '@/context/useAuth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import type { DomainRecord } from '@/types/organization';

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

const mockDomain: DomainRecord = {
  id: 'orono.k12.mn.us',
  orgId: 'orono',
  domain: '@orono.k12.mn.us',
  authMethod: 'google',
  status: 'verified',
  role: 'primary',
  users: 12,
  addedAt: '2026-01-01',
};

describe('useOrgDomains', () => {
  const mockUseAuth = useAuth as Mock;
  const mockCollection = collection as Mock;
  const mockOnSnapshot = onSnapshot as Mock;
  const mockDoc = doc as Mock;
  const mockSetDoc = setDoc as Mock;
  const mockDeleteDoc = deleteDoc as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCollection.mockReturnValue('domains-ref');
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockSetDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
  });

  it('skips subscription when orgId is null', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    const { result } = renderHook(() => useOrgDomains(null));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.domains).toEqual([]);
  });

  it('hydrates domains from snapshot', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockImplementation(
      (
        _ref: unknown,
        onNext: (snap: {
          docs: { id: string; data: () => DomainRecord }[];
        }) => void
      ) => {
        queueMicrotask(() =>
          onNext({
            docs: [{ id: 'orono.k12.mn.us', data: () => mockDomain }],
          })
        );
        return () => undefined;
      }
    );

    const { result } = renderHook(() => useOrgDomains('orono'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.domains).toHaveLength(1);
    });
  });

  it('addDomain writes a new doc with a derived id', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrgDomains('orono'));

    await act(async () => {
      await result.current.addDomain({
        domain: '@students.orono.k12.mn.us',
        authMethod: 'google',
        role: 'student',
      });
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = mockSetDoc.mock.calls[0] as [string, unknown];
    expect(ref).toBe('organizations/orono/domains/students-orono-k12-mn-us');
    expect(payload).toMatchObject({
      orgId: 'orono',
      domain: '@students.orono.k12.mn.us',
      authMethod: 'google',
      role: 'student',
      status: 'pending',
      users: 0,
    });
  });

  it('addDomain rejects when domain is missing', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrgDomains('orono'));

    await expect(result.current.addDomain({})).rejects.toThrow(
      /Domain is required/
    );
  });

  it('removeDomain deletes the doc', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u' } });
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useOrgDomains('orono'));

    await act(async () => {
      await result.current.removeDomain('orono.k12.mn.us');
    });

    expect(mockDeleteDoc).toHaveBeenCalledWith(
      'organizations/orono/domains/orono.k12.mn.us'
    );
  });

  it('writes reject when orgId is null', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useOrgDomains(null));
    await expect(
      result.current.addDomain({ domain: '@x.com' })
    ).rejects.toThrow(/No organization/);
    await expect(result.current.removeDomain('x')).rejects.toThrow(
      /No organization/
    );
  });
});
