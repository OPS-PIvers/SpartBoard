import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { onSnapshot } from 'firebase/firestore';
import { useBackgrounds } from '@/hooks/useBackgrounds';
import { useAuth } from '@/context/useAuth';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
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

type Handler = (snap: { docs: { data: () => unknown }[] }) => void;
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

describe('useBackgrounds across users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not show the previous user's beta backgrounds to the next user", () => {
    const handlers: Record<string, Handler> = {};
    (onSnapshot as Mock).mockImplementation(
      (q: { __query: { value: unknown }[] }, next: Handler) => {
        const level = q.__query.find(
          (c) => c.value === 'beta' || c.value === 'public'
        )?.value as string;
        handlers[level] = next;
        return vi.fn();
      }
    );
    const auth = (email: string) => ({
      user: { uid: email, email },
      isAdmin: false,
    });
    (useAuth as Mock).mockReturnValue(auth('a@x.org'));
    const { result, rerender } = renderHook(() => useBackgrounds());
    act(() => {
      handlers.beta(snap([bg('secret-beta', 'beta')]));
      handlers.public(snap([bg('pub', 'public')]));
    });
    expect(result.current.presets.map((p) => p.label)).toContain(
      'secret-beta'
    );

    (useAuth as Mock).mockReturnValue(auth('b@x.org'));
    rerender();
    act(() => {
      handlers.public(snap([bg('pub', 'public')]));
    });
    expect(result.current.presets.map((p) => p.label)).toEqual(['pub']);
  });
});
