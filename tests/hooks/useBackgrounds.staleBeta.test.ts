import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { getDocs, onSnapshot } from 'firebase/firestore';
import { useBackgrounds } from '@/hooks/useBackgrounds';
import { useAuth } from '@/context/useAuth';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    field,
    op,
    value,
  })),
}));
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));

type Query = { __query: { value: unknown }[] };
const snap = (items: Record<string, unknown>[]) => ({
  docs: items.map((d) => ({ data: () => d })),
});
const bg = (id: string, accessLevel: string) => ({
  id,
  url: `https://x/${id}`,
  label: id,
  active: true,
  accessLevel,
  createdAt: 1,
});
const levelOf = (q: Query) =>
  q.__query.find((c) => c.value === 'beta' || c.value === 'public')
    ?.value as string;
const auth = (email: string, isAdmin = false) => ({
  user: { uid: email, email },
  isAdmin,
});

describe('useBackgrounds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads once with getDocs and never opens a listener', async () => {
    (getDocs as Mock).mockImplementation((q: Query) =>
      Promise.resolve(
        levelOf(q) === 'beta'
          ? snap([bg('beta-bg', 'beta')])
          : snap([bg('pub', 'public')])
      )
    );
    (useAuth as Mock).mockReturnValue(auth('a@x.org'));
    const { result } = renderHook(() => useBackgrounds());
    await waitFor(() => expect(result.current.presets).toHaveLength(2));
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(getDocs).toHaveBeenCalledTimes(2);
  });

  it('still shows public backgrounds when the beta query fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (getDocs as Mock).mockImplementation((q: Query) =>
      levelOf(q) === 'beta'
        ? Promise.reject(new Error('denied'))
        : Promise.resolve(snap([bg('pub', 'public')]))
    );
    (useAuth as Mock).mockReturnValue(auth('a@x.org'));
    const { result } = renderHook(() => useBackgrounds());
    await waitFor(() =>
      expect(result.current.presets.map((p) => p.label)).toEqual(['pub'])
    );
  });

  it('admins make a single read and no listener', async () => {
    (getDocs as Mock).mockResolvedValue(snap([bg('one', 'public')]));
    (useAuth as Mock).mockReturnValue(auth('admin@x.org', true));
    const { result } = renderHook(() => useBackgrounds());
    await waitFor(() => expect(result.current.presets).toHaveLength(1));
    expect(getDocs).toHaveBeenCalledTimes(1);
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("does not show the previous user's beta backgrounds to the next user", async () => {
    (getDocs as Mock).mockImplementation((q: Query) =>
      Promise.resolve(
        levelOf(q) === 'beta'
          ? snap([bg('secret-beta', 'beta')])
          : snap([bg('pub', 'public')])
      )
    );
    (useAuth as Mock).mockReturnValue(auth('a@x.org'));
    const { result, rerender } = renderHook(() => useBackgrounds());
    await waitFor(() =>
      expect(result.current.presets.map((p) => p.label)).toContain(
        'secret-beta'
      )
    );

    (getDocs as Mock).mockImplementation(() =>
      Promise.resolve(snap([bg('pub', 'public')]))
    );
    (useAuth as Mock).mockReturnValue(auth('b@x.org'));
    rerender();
    await waitFor(() =>
      expect(result.current.presets.map((p) => p.label)).toEqual(['pub'])
    );
  });
});
