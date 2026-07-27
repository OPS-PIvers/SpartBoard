import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
  collection,
  deleteDoc,
  deleteField,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  updateDoc,
} from 'firebase/firestore';

import { useAuth } from '@/context/useAuth';
import { logError } from '@/utils/logError';
import type { ShortLink } from '@/types';

import {
  ADMIN_LIST_LIMIT,
  useCreateShortLink,
  useShortLinks,
} from './useShortLinks';

// firebase/firestore is fully mocked; the pure validation helpers in
// utils/shortLinkValidation are used for real (they have their own suite).
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'collection-ref'),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(() => ({ __deleteField: true })),
  doc: vi.fn((_db: unknown, ...segs: string[]) => ({ __ref: segs.join('/') })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn((n: number) => ({ __limit: n })),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((f: string, d: string) => ({ __orderBy: [f, d] })),
  query: vi.fn((...args: unknown[]) => ({ __query: args })),
  runTransaction: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __brand: 'db' },
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/utils/logError', () => ({
  logError: vi.fn(),
}));

const mockUseAuth = useAuth as Mock;
const mockCollection = collection as Mock;
const mockDeleteDoc = deleteDoc as Mock;
const mockDeleteField = deleteField as Mock;
const mockGetDoc = getDoc as Mock;
const mockGetDocs = getDocs as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockRunTransaction = runTransaction as Mock;
const mockUpdateDoc = updateDoc as Mock;
const mockLogError = logError as Mock;

const adminUser = {
  user: { uid: 'admin-1', email: 'admin@school.org' },
  isAdmin: true,
};

/**
 * Drive `createShortLinkAtomic` (which runs the real transaction body) by
 * controlling whether the doc "exists" for each successive attempt. `taken`
 * counts how many leading attempts should collide before the write succeeds.
 */
const configureTransaction = (takenAttempts: number) => {
  let call = 0;
  mockRunTransaction.mockImplementation(
    async (
      _db: unknown,
      updateFn: (txn: {
        get: (ref: unknown) => Promise<{ exists: () => boolean }>;
        set: Mock;
      }) => Promise<void>
    ) => {
      const exists = call < takenAttempts;
      call += 1;
      const set = vi.fn();
      await updateFn({
        get: () => Promise.resolve({ exists: () => exists }),
        set,
      });
      return undefined;
    }
  );
};

describe('useCreateShortLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when the user is not signed in', async () => {
    mockUseAuth.mockReturnValue({ user: null, isAdmin: false });
    const { result } = renderHook(() => useCreateShortLink());

    const res = await result.current.createShortLink({
      destination: 'https://example.com',
    });

    expect(res).toEqual({ ok: false, reason: 'You must be signed in.' });
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('rejects non-admins before touching Firestore', async () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'u', email: 'u@school.org' },
      isAdmin: false,
    });
    const { result } = renderHook(() => useCreateShortLink());

    const res = await result.current.createShortLink({
      destination: 'https://example.com',
    });

    expect(res).toEqual({
      ok: false,
      reason: 'Only admins can create short links.',
    });
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('surfaces a destination validation failure', async () => {
    mockUseAuth.mockReturnValue(adminUser);
    const { result } = renderHook(() => useCreateShortLink());

    const res = await result.current.createShortLink({ destination: '   ' });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/required/i);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('surfaces a slug validation failure without writing', async () => {
    mockUseAuth.mockReturnValue(adminUser);
    const { result } = renderHook(() => useCreateShortLink());

    // "admin" is a RESERVED_SLUG in shortLinkValidation.
    const res = await result.current.createShortLink({
      destination: 'https://example.com',
      slug: 'admin',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/reserved/i);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('reports a taken custom slug', async () => {
    mockUseAuth.mockReturnValue(adminUser);
    configureTransaction(1); // the single custom-slug attempt collides
    const { result } = renderHook(() => useCreateShortLink());

    const res = await result.current.createShortLink({
      destination: 'https://example.com',
      slug: 'my-lesson',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('"my-lesson" is already taken.');
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
  });

  it('creates a link with a valid custom slug and full metadata', async () => {
    mockUseAuth.mockReturnValue(adminUser);
    configureTransaction(0);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(555);
    const { result } = renderHook(() => useCreateShortLink());

    const res = await result.current.createShortLink({
      destination: 'https://example.com/lesson',
      slug: 'my-lesson',
      label: '  Fractions  ',
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.link).toEqual<ShortLink>({
        code: 'my-lesson',
        destination: 'https://example.com/lesson',
        createdBy: 'admin-1',
        createdByEmail: 'admin@school.org',
        createdAt: 555,
        updatedAt: 555,
        clicks: 0,
        lastClickedAt: null,
        label: 'Fractions',
      });
    }
    nowSpy.mockRestore();
  });

  it('omits an empty label', async () => {
    mockUseAuth.mockReturnValue(adminUser);
    configureTransaction(0);
    const { result } = renderHook(() => useCreateShortLink());

    const res = await result.current.createShortLink({
      destination: 'https://example.com/lesson',
      slug: 'my-lesson',
      label: '   ',
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect('label' in res.link).toBe(false);
  });

  it('retries random-code generation past collisions until one is free', async () => {
    mockUseAuth.mockReturnValue(adminUser);
    configureTransaction(2); // first two random codes collide, third wins
    const { result } = renderHook(() => useCreateShortLink());

    const res = await result.current.createShortLink({
      destination: 'https://example.com',
    });

    expect(res.ok).toBe(true);
    expect(mockRunTransaction).toHaveBeenCalledTimes(3);
    if (res.ok) expect(res.link.code).toHaveLength(8);
  });

  it('gives up after exhausting the retry budget', async () => {
    mockUseAuth.mockReturnValue(adminUser);
    configureTransaction(99); // every attempt collides
    const { result } = renderHook(() => useCreateShortLink());

    const res = await result.current.createShortLink({
      destination: 'https://example.com',
    });

    expect(res).toEqual({
      ok: false,
      reason: 'Could not generate a unique code. Try again.',
    });
    // MAX_CODE_GENERATION_RETRIES === 5
    expect(mockRunTransaction).toHaveBeenCalledTimes(5);
  });

  it('logs and returns a generic error on an unexpected failure', async () => {
    mockUseAuth.mockReturnValue(adminUser);
    mockRunTransaction.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useCreateShortLink());

    const res = await result.current.createShortLink({
      destination: 'https://example.com',
      slug: 'my-lesson',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/Check your connection/i);
    expect(mockLogError).toHaveBeenCalledWith(
      'useShortLinks.create',
      expect.any(Error)
    );
  });
});

describe('useShortLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes the documented listing cap', () => {
    expect(ADMIN_LIST_LIMIT).toBe(100);
  });

  it('does not subscribe for non-admins and reports empty state', () => {
    mockUseAuth.mockReturnValue({ user: null, isAdmin: false });
    const { result } = renderHook(() => useShortLinks());

    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.links).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('hydrates links from the snapshot for admins', async () => {
    mockUseAuth.mockReturnValue(adminUser);
    const link: ShortLink = {
      code: 'abc',
      destination: 'https://example.com',
      createdBy: 'admin-1',
      createdByEmail: 'admin@school.org',
      createdAt: 1,
      updatedAt: 1,
      clicks: 0,
      lastClickedAt: null,
    };
    mockOnSnapshot.mockImplementation(
      (
        _q: unknown,
        onNext: (snap: {
          forEach: (cb: (d: { data: () => ShortLink }) => void) => void;
        }) => void
      ) => {
        queueMicrotask(() =>
          onNext({ forEach: (cb) => cb({ data: () => link }) })
        );
        return () => undefined;
      }
    );

    const { result } = renderHook(() => useShortLinks());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.links).toEqual([link]);
    });
    expect(mockCollection).toHaveBeenCalledWith(
      { __brand: 'db' },
      'short_links'
    );
  });

  it('surfaces a snapshot error', async () => {
    mockUseAuth.mockReturnValue(adminUser);
    mockOnSnapshot.mockImplementation(
      (_q: unknown, _onNext: unknown, onError: (e: Error) => void) => {
        queueMicrotask(() => onError(new Error('boom')));
        return () => undefined;
      }
    );

    const { result } = renderHook(() => useShortLinks());

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load short links.');
      expect(result.current.loading).toBe(false);
    });
    expect(mockLogError).toHaveBeenCalledWith(
      'useShortLinks.snapshot',
      expect.any(Error)
    );
  });

  it('unsubscribes on unmount', () => {
    mockUseAuth.mockReturnValue(adminUser);
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useShortLinks());
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  describe('updateShortLink', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue(adminUser);
      mockOnSnapshot.mockReturnValue(() => undefined);
    });

    it('rejects non-admins', async () => {
      mockUseAuth.mockReturnValue({
        user: { uid: 'u', email: 'u@x.org' },
        isAdmin: false,
      });
      const { result } = renderHook(() => useShortLinks());

      const res = await result.current.updateShortLink('abc', {
        label: 'x',
      });

      expect(res).toEqual({
        ok: false,
        reason: 'Only admins can edit short links.',
      });
    });

    it('rejects when the link no longer exists', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });
      const { result } = renderHook(() => useShortLinks());

      const res = await result.current.updateShortLink('gone', {
        label: 'x',
      });

      expect(res).toEqual({
        ok: false,
        reason: 'Short link no longer exists.',
      });
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    it('validates the destination before writing', async () => {
      const existing: ShortLink = {
        code: 'abc',
        destination: 'https://old.example.com',
        createdBy: 'admin-1',
        createdByEmail: 'admin@school.org',
        createdAt: 1,
        updatedAt: 1,
        clicks: 0,
        lastClickedAt: null,
      };
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => existing,
      });
      const { result } = renderHook(() => useShortLinks());

      const res = await result.current.updateShortLink('abc', {
        destination: 'not-a-url',
      });

      expect(res.ok).toBe(false);
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    it('writes a new destination and returns the resolved link', async () => {
      const existing: ShortLink = {
        code: 'abc',
        destination: 'https://old.example.com',
        createdBy: 'admin-1',
        createdByEmail: 'admin@school.org',
        createdAt: 1,
        updatedAt: 1,
        clicks: 7,
        lastClickedAt: 42,
        label: 'Old',
      };
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => existing,
      });
      mockUpdateDoc.mockResolvedValue(undefined);
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(999);
      const { result } = renderHook(() => useShortLinks());

      const res = await result.current.updateShortLink('abc', {
        destination: 'https://new.example.com',
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.link.destination).toBe('https://new.example.com/');
        expect(res.link.updatedAt).toBe(999);
        expect(res.link.clicks).toBe(7);
      }
      const [, updates] = mockUpdateDoc.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      expect(updates.destination).toBe('https://new.example.com/');
      expect(updates.updatedAt).toBe(999);
      nowSpy.mockRestore();
    });

    it('clears a blank label with deleteField and drops it from the result', async () => {
      const existing: ShortLink = {
        code: 'abc',
        destination: 'https://old.example.com',
        createdBy: 'admin-1',
        createdByEmail: 'admin@school.org',
        createdAt: 1,
        updatedAt: 1,
        clicks: 0,
        lastClickedAt: null,
        label: 'Remove me',
      };
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => existing,
      });
      mockUpdateDoc.mockResolvedValue(undefined);
      const { result } = renderHook(() => useShortLinks());

      const res = await result.current.updateShortLink('abc', { label: '  ' });

      expect(mockDeleteField).toHaveBeenCalledTimes(1);
      const [, updates] = mockUpdateDoc.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      expect(updates.label).toEqual({ __deleteField: true });
      expect(res.ok).toBe(true);
      if (res.ok) expect('label' in res.link).toBe(false);
    });

    it('logs and returns a generic failure when the write throws', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ code: 'abc' }),
      });
      mockUpdateDoc.mockRejectedValue(new Error('quota'));
      const { result } = renderHook(() => useShortLinks());

      const res = await result.current.updateShortLink('abc', {
        label: 'x',
      });

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toMatch(/Check your connection/i);
      expect(mockLogError).toHaveBeenCalledWith(
        'useShortLinks.update',
        expect.any(Error)
      );
    });
  });

  describe('deleteShortLink', () => {
    beforeEach(() => {
      mockOnSnapshot.mockReturnValue(() => undefined);
    });

    it('throws for non-admins', async () => {
      mockUseAuth.mockReturnValue({
        user: { uid: 'u', email: 'u@x.org' },
        isAdmin: false,
      });
      const { result } = renderHook(() => useShortLinks());

      await expect(result.current.deleteShortLink('abc')).rejects.toThrow(
        /Only admins/i
      );
      expect(mockDeleteDoc).not.toHaveBeenCalled();
    });

    it('deletes the doc for admins', async () => {
      mockUseAuth.mockReturnValue(adminUser);
      mockDeleteDoc.mockResolvedValue(undefined);
      const { result } = renderHook(() => useShortLinks());

      await act(async () => {
        await result.current.deleteShortLink('abc');
      });

      expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
      const [ref] = mockDeleteDoc.mock.calls[0] as [{ __ref: string }];
      expect(ref.__ref).toBe('short_links/abc');
    });
  });

  describe('refresh', () => {
    beforeEach(() => {
      mockOnSnapshot.mockReturnValue(() => undefined);
    });

    it('is a no-op for non-admins', async () => {
      mockUseAuth.mockReturnValue({ user: null, isAdmin: false });
      const { result } = renderHook(() => useShortLinks());

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockGetDocs).not.toHaveBeenCalled();
    });

    it('re-fetches the listing for admins', async () => {
      mockUseAuth.mockReturnValue(adminUser);
      const link: ShortLink = {
        code: 'xyz',
        destination: 'https://example.com',
        createdBy: 'admin-1',
        createdByEmail: 'admin@school.org',
        createdAt: 1,
        updatedAt: 1,
        clicks: 0,
        lastClickedAt: null,
      };
      mockGetDocs.mockResolvedValue({
        forEach: (cb: (d: { data: () => ShortLink }) => void) =>
          cb({ data: () => link }),
      });
      const { result } = renderHook(() => useShortLinks());

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockGetDocs).toHaveBeenCalledTimes(1);
      expect(result.current.links).toEqual([link]);
    });

    it('sets an error when the re-fetch fails', async () => {
      mockUseAuth.mockReturnValue(adminUser);
      mockGetDocs.mockRejectedValue(new Error('offline'));
      const { result } = renderHook(() => useShortLinks());

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.error).toBe('Failed to load short links.');
      expect(mockLogError).toHaveBeenCalledWith(
        'useShortLinks.refresh',
        expect.any(Error)
      );
    });
  });
});
